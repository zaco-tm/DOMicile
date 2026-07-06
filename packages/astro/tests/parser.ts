// Static-analysis helper for Astro components.
// Reads a `.astro` file, splits frontmatter and template body, returns both.
// We use this instead of the Astro Container API because the runtime
// (Astro 5 + vitest 2.1 in this Node version) produces an opaque
// `[object Object]` error during plugin init. Static analysis is reliable
// for thin wrappers whose only logic is class composition.
//
// When Astro's vitest story stabilizes, switch this helper for
// `experimental_AstroContainer.renderToString` in one place — all tests
// consume `parseAstro()` + `evaluateClassExpr()`.

import { readFileSync } from 'node:fs';

export interface ParsedAstro {
  frontmatter: string;
  body: string;
}

export function parseAstro(path: string): ParsedAstro {
  const src = readFileSync(path, 'utf-8');
  if (!src.startsWith('---')) {
    throw new Error(`No frontmatter found in ${path}`);
  }
  const rest = src.slice(3);
  const end = rest.indexOf('\n---');
  if (end === -1) {
    throw new Error(`Unclosed frontmatter in ${path}`);
  }
  const frontmatter = rest.slice(0, end + 1);
  const afterClose = rest.slice(end + 4);
  const body = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;
  return { frontmatter, body };
}

/**
 * Locates the `class={expr}` attribute in the body and returns the raw
 * expression source — e.g. `'classes'` for the precomputed-var pattern,
 * or `['domi-btn', variant && \`domi-btn--${variant}\`].filter(Boolean).join(' ')`
 * for the inline pattern.
 *
 * Algorithm: find `class={`, then walk forward balancing `{}` (template
 * literal interpolations like `${variant}` open their own `{`). The first
 * brace that closes to depth 0 is the end of the class expression.
 *
 * We can't use a simple regex because the attribute may be followed by
 * other attributes (e.g. `class={expr} open={open} {...rest}`) that
 * confuse lookahead-based regexes.
 */
export function extractClassExpr(body: string): string | null {
  const start = body.search(/class=\{/);
  if (start === -1) return null;
  let i = start + 'class={'.length;
  let depth = 1;
  // Track whether we're inside a template literal `${...}` (its `{` opened depth).
  // We approximate: every `{` increases depth; every `}` decreases. Template
  // literal `}` only appears inside `${...}` so its `{` already incremented depth.
  while (i < body.length && depth > 0) {
    const ch = body[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
    if (depth === 0) {
      return body.slice(start + 'class={'.length, i - 1).trim();
    }
  }
  return null;
}

/**
 * Evaluates the component's class expression against the supplied props and
 * returns the resulting joined class string.
 *
 * Strategy: dynamically compile the component's frontmatter (which only
 * declares `const` bindings and destructures `Astro.props`) into a function,
 * inject the props, then evaluate the class expression in the resulting
 * scope. This faithfully covers both patterns the repo uses:
 *   class={classes}                                            (precomputed var)
 *   class={['domi-x', variant && `domi-x--${variant}`].filter(Boolean).join(' ')}  (inline)
 *
 * Safety: we strip imports and type-only declarations from the frontmatter
 * before evaluating (they're not executable). The dynamic function has
 * access to `Astro` and `props` via closure.
 */
export function evaluateClassExpr(
  frontmatter: string,
  body: string,
  props: Record<string, unknown> = {},
): string | null {
  const expr = extractClassExpr(body);
  if (!expr) return null;
  // Strip imports and type aliases; what remains is executable.
  const executable = stripTypeOnly(frontmatter);
  // Inject props as `Astro.props = props` so destructuring works.
  const fnSrc = `const Astro = { props: ${stringifyProps(props)} };\n${executable}\nreturn (${expr});`;
  try {
    const fn = new Function(fnSrc);
    const result = fn();
    if (typeof result === 'string') return result;
    return null;
  } catch (err) {
    // If the expression uses props we don't provide (e.g. `error`, `open`),
    // the destructuring throws. Treat as "can't evaluate" rather than failing.
    return null;
  }
}

function stripTypeOnly(src: string): string {
  // Strip `import type ...` lines, runtime `import {...} from 'astro/types'`,
  // and TypeScript `interface { ... }` blocks (multi-line, balanced braces).
  let out = '';
  let i = 0;
  while (i < src.length) {
    // Check for `import type` or `import { ... } from 'astro/types'`.
    const importMatch = /^(\s*import\s+type\b[^\n]*\n)|(\s*import\s*\{[^}]*\}\s*from\s+['"]astro\/types['"][^\n]*\n)/.exec(src.slice(i));
    if (importMatch) {
      i += importMatch[0].length;
      continue;
    }
    // Check for `interface Name { ... }` (possibly multi-line).
    const ifaceMatch = /^(\s*interface\s+\w+(\s+extends\s+[^{]+)?\s*\{)/.exec(src.slice(i));
    if (ifaceMatch) {
      // Skip until matching `}` accounting for nested braces.
      let depth = 1;
      let j = i + ifaceMatch[0].length;
      while (j < src.length && depth > 0) {
        const ch = src[j];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        j++;
      }
      i = j;
      // Consume trailing newline if present.
      if (src[i] === '\n') i++;
      continue;
    }
    // Default: copy one char.
    out += src[i];
    i++;
  }
  return out;
}

function stringifyProps(props: Record<string, unknown>): string {
  return JSON.stringify(props);
}

/**
 * Asserts that the template body contains a given tag (e.g. `<button`, `<a`).
 * Matches the opening tag only — does not validate attributes or children.
 */
export function assertHasTag(body: string, tag: string): void {
  const re = new RegExp(`<${tag}\\b`);
  if (!re.test(body)) {
    throw new Error(`Expected body to contain <${tag}> tag; got:\n${body}`);
  }
}