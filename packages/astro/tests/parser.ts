// Static-analysis helper for Astro components.
// Reads a `.astro` file, splits frontmatter and template body, returns both.
// We use this instead of the Astro Container API because the runtime
// (Astro 5 + vitest 2.1 in this Node version) produces an opaque
// `[object Object]` error during plugin init. Static analysis is reliable
// for thin wrappers whose only logic is class composition.
//
// When Astro's vitest story stabilizes, switch this helper for `experimental_AstroContainer.renderToString`
// in one place — all tests consume `parseAstro()`.

import { readFileSync } from 'node:fs';

export interface ParsedAstro {
  frontmatter: string;
  body: string;
}

export function parseAstro(path: string): ParsedAstro {
  const src = readFileSync(path, 'utf-8');
  // Frontmatter delimited by `---` lines at the very start.
  if (!src.startsWith('---')) {
    throw new Error(`No frontmatter found in ${path}`);
  }
  const rest = src.slice(3);
  const end = rest.indexOf('\n---');
  if (end === -1) {
    throw new Error(`Unclosed frontmatter in ${path}`);
  }
  const frontmatter = rest.slice(0, end + 1);
  // Body starts after the closing `---` and its trailing newline.
  const afterClose = rest.slice(end + 4);
  // Skip the first newline after the closing `---` if present.
  const body = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;
  return { frontmatter, body };
}

/**
 * Extracts the `class={...}` expression from the template body and evaluates it
 * against the supplied props + children, returning the joined class string.
 *
 * Supports the patterns this repo uses:
 *   class={classes}                                       (precomputed var)
 *   class={['domi-foo', className].filter(Boolean).join(' ')}   (inline)
 *   class={classes}  +  conditional sibling element with same classes
 *
 * For the inline pattern, we evaluate the array literal directly with a
 * controlled `scope` that exposes the props as variables.
 *
 * This is intentionally dumb — it covers the patterns the plan mandates.
 * Anything fancier (slot composition, dynamic element choice via `as`) is
 * tested via the source assertion helpers below.
 */
export function evaluateClassExpr(body: string, props: Record<string, unknown> = {}): string | null {
// Find `class={...}` ending at the first `}` followed by `>` (the closing
// of the root element). This avoids the template-literal `}` inside `${...}`
// and the `)` from `.join(...)`.
const m = body.match(/class=\{([\s\S]+?)\}\s*>/);
if (!m) return null;
const expr = m[1].trim();

  // Pattern A: precomputed variable, e.g. `class={classes}`.
  if (/^[a-zA-Z_$][\w$]*$/.test(expr)) {
    // We don't have access to the var without running the frontmatter.
    // Fall back to string-search.
    return null;
  }

  // Pattern B: inline array literal, e.g.
  //   ['domi-btn', variant && `domi-btn--${variant}`, ...].filter(Boolean).join(' ')
  const arrayMatch = expr.match(/^(\[[\s\S]+?\])(?:\.filter\(Boolean\))?\.join\(['"`]\s['"`]\)/);
  if (!arrayMatch) return null;

  // Pull out string literals and template-literal expressions from the array.
  const arraySrc = arrayMatch[1];
  const parts: Array<string | false> = [];
  // Match either a string literal 'foo' or "foo" or a template literal `foo` or a JS expression.
  const itemRe = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;
  let match;
  while ((match = itemRe.exec(arraySrc)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    // Template literals may contain ${expr}; evaluate those.
    if (match[3] !== undefined) {
      const evaluated = raw.replace(/\$\{([^}]+)\}/g, (_full, expr2: string) => {
        const v = evaluateSimpleExpr(expr2.trim(), props);
        return v == null ? '' : String(v);
      });
      if (evaluated) parts.push(evaluated);
    } else {
      parts.push(raw);
    }
  }
  // Filter out false/empty template-literal results.
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

function evaluateSimpleExpr(expr: string, scope: Record<string, unknown>): unknown {
  // Only handles the simple `variant && \`domi-btn--${variant}\`` shape.
  const andMatch = expr.match(/^([a-zA-Z_$][\w$]*)\s*&&\s*`([^`]*)`$/);
  if (andMatch) {
    const [, ident, tmpl] = andMatch;
    const v = scope[ident];
    if (!v) return false;
    return tmpl.replace(/\$\{([a-zA-Z_$][\w$]*)\}/g, (_full, name: string) => String(scope[name] ?? ''));
  }
  // Bare identifier.
  if (/^[a-zA-Z_$][\w$]*$/.test(expr)) {
    return scope[expr];
  }
  return undefined;
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