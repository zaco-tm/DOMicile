# DOMiNice Skill Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe `SKILL.md` so the DOMiNice skill teaches an agent to (a) **create** UI libraries/components/layouts/themes and (b) **audit/iterate** on UI/UX with the user through shared HTML docs, with the neo-glass-vintage aesthetic reserved as the *house style* of the skill's own working documents rather than treated as the system's purpose.

**Architecture:** A single author-layer rework that touches one top-level `SKILL.md`, three small new docs (`AUDIT.md`, `EXTENDING.md`, `LAYOUTS.md`), one new small JS runtime (`domi-audit.js`) loaded alongside the existing `domi.js`, one working-doc template, and minor touch-ups to `INIT.md`, `status/STATUS.html`, and `RELEASE-NOTES-v0.1.0.md`. Library files (`tokens/`, `components/`, `templates/**` other than the new working-doc template, the original `scripts/runtime/domi.js`) are untouched.

**Tech Stack:** Static HTML/CSS, vanilla JS in `scripts/runtime/domi-audit.js`, vitest for tests, npm scripts already wired in `package.json`.

## Global Constraints

- `SKILL.md` MUST lead with the one-sentence purpose, NOT with the neo aesthetic. Aesthetic rule appears after the modes.
- The two first questions (create-vs-audit × working-doc-vs-deliverable) MUST be the second section of `SKILL.md`. The three modes MUST be the third section.
- Working docs (both create and audit modes) MUST render in neo skin and include the feedback rail. Deliverables MUST NOT include the feedback rail.
- All artifact HTML goes in `.domi/output/`. All thread state goes in `.domi/state/`.
- Do NOT modify `components/domi.css`, `tokens/tokens.json`, `scripts/runtime/domi.js`, or any existing `templates/*/index.html` other than adding a new directory.
- The audit runtime lives in a NEW file `scripts/runtime/domi-audit.js`. Do not extend `domi.js`.

---

### Task 1: Rewrite `SKILL.md` per the design spec

**Files:**
- Modify: `SKILL.md` (entire file, ~65 lines)

**Interfaces:**
- Produces: the top-level entry the agent loads; must reference `docs/AUDIT.md` and `docs/EXTENDING.md`

- [ ] **Step 1: Read existing SKILL.md and the design spec**

Run from repo root:
```bash
cat SKILL.md
cat docs/superpowers/specs/2026-07-05-dominice-skill-design.md
```

- [ ] **Step 2: Replace SKILL.md with the rewritten version**

Write the file with this exact content:

```markdown
---
name: dominice
description: Skill for authoring and iterating on UI work — components, primitives, layouts, themes — and for working through UI/UX changes with the user via shared HTML docs. Triggers on "build a UI library", "design a X", "let's work on Y", "review this UI", or any task where the user will open an HTML file in a browser to read or annotate it.
---

# DOMiNice

Use this skill when the user wants to *create* UI work (a component, primitive, layout, theme, or archetype) using the DOMiNice design system, OR when the user wants to *audit / iterate on* existing UI through a shared HTML document they can open in a tab and annotate.

Do NOT use this skill for: pure markdown reports, server-side code, anything the user won't open in a browser as HTML.

## Answer two questions first

Before writing any HTML, decide:

1. **Create-new or audit-existing?** ("let's build X" vs. "review this thing")
2. **Working doc or deliverable?** ("let's work on it" vs. "ship the final")

The combination yields three output modes:

| Mode | Trigger | What you write |
|---|---|---|
| **Working doc — create** | "let's build," "draft," "I want to start on" | `.domi/output/<name>.html` with feedback rail + `data-feedback` hooks. `.domi/state/<name>.json` seeded empty. Neo skin. |
| **Working doc — audit** | "review," "iterate," "what should change" | Same chrome as create; load existing thread. |
| **Deliverable** | "ship," "give me the final," "hand off" | Clean HTML using agreed DOMiNice primitives, no rail, no status chip. Theme is whatever the user picked (default neo). |

If you're not sure which mode, ask one question with the linguistic signal you saw, then proceed.

## Output locations

- Working artifacts: `.domi/output/<name>.html`
- Audit thread state: `.domi/state/<name>.json` (read or seed; mirror to `localStorage` for portability)
- Library paths: `tokens/tokens.json`, `components/primitives/<name>/`, `components/domi.css`, `scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`, `templates/<archetype>/index.html`

Do NOT edit the library to do a one-off artifact. Edit the library only when the user explicitly says "add a primitive," "make a new theme," etc. — see `docs/EXTENDING.md`.

## Working-doc chrome (audit mode)

The agent includes on every working-doc page:

- A right-side feedback rail (loaded from `scripts/runtime/domi-audit.js`).
- `data-feedback="<meaningful-id>"` on every element the user is likely to want to comment on (section headers, interactive primitives, layout decisions).
- A status chip showing `vN` of the working doc, visible top-right.
- Thread entries are scoped to a target id and rendered next to the element on reload.

See `docs/AUDIT.md` for the JSON schema, domi-audit API, and end-to-end loop.

## Authoring new UI work (not consuming existing)

To *consume* the library, point at the path. To *add to it*, follow the contribution rules:

- New theme → `docs/EXTENDING.md#new-theme`
- New primitive → `docs/EXTENDING.md#new-primitive`
- New archetype → `docs/EXTENDING.md#new-archetype`
- New layout recipe → `docs/LAYOUTS.md`

## Aesthetic — Neo-Glass-Vintage Sunset Pastel

Neo is the **default skin for working docs and audit surfaces**. Deliverables can be in any theme; default to neo only if the user does not specify one.

```
Background:  plum → coral → peach  (#a89cc8 → #f4978e → #ffd6b3) at 135°
Surfaces:    rgba(255,255,255, 0.4–0.8) + backdrop-filter blur(12px)
Display:     Helvetica Neue Black, uppercase, tight tracking
Body/labels: JetBrains Mono / SF Mono
Text:        dark plum #3d2342
Success:     sage #9caf88     Danger: terracotta #c2410c
```

## Reference

- Audit loop how-to: `docs/AUDIT.md`
- Library extension how-to: `docs/EXTENDING.md`
- Layout recipes: `docs/LAYOUTS.md`
- Design tokens: `tokens/tokens.json`
- Library primitives: `components/primitives/<name>/README.md`
- Library archetypes: `templates/<name>/README.md`
- Full library docs: `docs/DESIGN.md`, `docs/USAGE.md`, `docs/STANDARDS.md`
- Status: `status/STATUS.html`
```

- [ ] **Step 3: Verify the new SKILL.md is well-formed**

```bash
head -3 SKILL.md            # Should show the YAML frontmatter starting with ---
sed -n '6,9p' SKILL.md      # Should show the H1 + first descriptive line
wc -l SKILL.md              # Should be 80–120 lines
```

- [ ] **Step 4: Commit**

```bash
git add SKILL.md
git commit -m "docs(skill): reframe SKILL.md — create + audit, neo as house style"
```

---

### Task 2: Create `docs/AUDIT.md`

**Files:**
- Create: `docs/AUDIT.md`

**Interfaces:**
- Referenced by: `SKILL.md` (in the "Working-doc chrome" section)

- [ ] **Step 1: Write `docs/AUDIT.md`**

```markdown
# Audit Loop — How-To

The audit loop is the shape of any working-doc mode. It is how the agent and user iterate on UI/UX without the user having to leave the page.

## Loop

1. Agent writes `.domi/output/<name>.html` (a working doc) and seeds `.domi/state/<name>.json` with an empty thread.
2. User opens the file (Phase 1: `file://`).
3. User clicks an element with `data-feedback="<id>"` → domi-audit adds a comment in the rail and persists to localStorage (and to the file via the JSON mirror if running on the Phase 2 server).
4. Reload renders existing comments next to their target elements.
5. The agent reads the thread (either inline in the session or by re-reading the JSON) and edits the HTML in response.
6. Repeat until the user signals "ship it" → agent produces a Deliverable-mode HTML (clean, no rail, no status chip).

## JSON schema for thread entries

`.domi/state/<name>.json`:

```json
{
  "version": 1,
  "name": "onboarding-v2",
  "entries": [
    {
      "id": "uuid-or-counter",
      "targetId": "data-feedback attribute, or null for the doc itself",
      "author": "user | agent",
      "timestamp": "ISO-8601",
      "body": "plain text, no markdown",
      "resolved": false
    }
  ]
}
```

`domi-audit.js` always seeds the file with this skeleton if it does not exist.

## API exposed by `scripts/runtime/domi-audit.js`

When `<script src="scripts/runtime/domi-audit.js" defer>` is loaded, the global `DomiAudit` is available. Call order:

- `DomiAudit.mount({ statePath, docName })` — wires the rail, hydrates from localStorage and (if available) from `statePath`.
- `DomiAudit.addComment({ targetId, body })` — programmatic add; `domi-audit.js` invokes this on rail clicks.
- `DomiAudit.export()` — returns the current entries as JSON for the agent to read.

The runtime does **not** require any server. The JSON mirror (under Phase 2) is a hot-reload hook only.

## What the agent does

- Maintain `data-feedback` ids that don't drift across edits; rename consistently between versions.
- On read, do not delete resolved entries by default — the user may want history.
- When the user signals "ship it," produce a Deliverable-mode HTML: copy the working doc, strip the rail `<div data-domini-rail>`, the status chip, all `data-feedback` attributes, and the `<script src="domi-audit.js">` reference.

## When NOT to use the rail

- Pure read-only status pages (`status/STATUS.html` is one).
- Final deliverables.
- Anything where the user said "this is done, don't ask for more feedback."
```

- [ ] **Step 2: Verify the file**

```bash
test -f docs/AUDIT.md && echo "created"
wc -l docs/AUDIT.md    # should be ~50–80 lines
```

- [ ] **Step 3: Commit**

```bash
git add docs/AUDIT.md
git commit -m "docs(audit): audit-loop how-to for working-doc mode"
```

---

### Task 3: Create `docs/EXTENDING.md`

**Files:**
- Create: `docs/EXTENDING.md`

**Interfaces:**
- Referenced by: `SKILL.md` ("Authoring new UI work" section)

- [ ] **Step 1: Write `docs/EXTENDING.md`**

```markdown
# Extending the DOMiNice Library

The library (`tokens/`, `components/`, `templates/`) is shared infrastructure. To extend it, follow the patterns here.

## New theme

Path: `tokens/themes/<name>.json`

A theme is a JSON file that overrides any subset of `tokens/tokens.json`. Declared as CSS custom properties inside `domi.css` or as overrides imported after the library's defaults. Document the theme in `tokens/themes/<name>/README.md` with one screenshot or HTML preview.

```json
{ "color.primary": "#..." }
```

Don't rename existing tokens — override them.

## New primitive

Path: `components/primitives/<name>/`

Layout:

```
components/primitives/<name>/
  README.md         # what it is, when to use it, HTML snippet
  <name>.css        # self-contained; uses domi-* tokens only
  <name>.html       # demo with a realistic example
```

Rules:
- Self-contained CSS — no `@import` of the primitive CSS.
- Always use `domi-*` tokens for color, radius, type. Inline styles allowed for layout primitives only.
- `README.md` MUST show the smallest viable HTML snippet at the top.

## New archetype

Path: `templates/<name>/`

Layout:

```
templates/<name>/
  index.html        # full page using primitives from the library
  README.md         # when to copy this template, what it ships with
```

Use only existing primitives. If you need a primitive that doesn't exist, create it first (see above) and link to it from the archetype README.

## New layout recipe

Path: `docs/LAYOUTS.md`

A layout is a *named composition* of primitives inside an archetype, such as "two-pane workspace with collapsible sidebar" or "kanban board with three swimlanes." Document as:

- A short prose description
- The primitives involved (links)
- An HTML snippet showing the assembly
- A screenshot or HTML preview link

Each recipe gets its own H2 section in `LAYOUTS.md`. A recipe does not become a "thing" unless it gets reused.
```

- [ ] **Step 2: Verify**

```bash
test -f docs/EXTENDING.md && echo "created"
wc -l docs/EXTENDING.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/EXTENDING.md
git commit -m "docs(extending): library-extension how-to"
```

---

### Task 4: Create `docs/LAYOUTS.md`

**Files:**
- Create: `docs/LAYOUTS.md`

**Interfaces:**
- Referenced by: `SKILL.md` ("Authoring new UI work" section)

- [ ] **Step 1: Write `docs/LAYOUTS.md`**

```markdown
# Layout Recipes

A *layout recipe* is a named composition of DOMiNice primitives inside an archetype. Use these as starting points for both deliverables and working docs.

## Two-pane workspace (sidebar + main)

Primitives: `nav`, `card`, `table`.

```html
<aside class="domi-nav">…</aside>
<main class="domi-grid domi-grid--two">
  <section class="domi-card">…</section>
  <section class="domi-card">…</section>
</main>
```

## Three-tier pricing (split with badges)

Primitives: `card`, `badge`, `button`.

```html
<div class="domi-split">
  <article class="domi-card">…<span class="domi-badge">STARTER</span></article>
  <article class="domi-card">…<span class="domi-badge">POPULAR</span></article>
  <article class="domi-card">…<span class="domi-badge">BEST VALUE</span></article>
</div>
```

## KPI dashboard (grid of cards)

Primitives: `card`, `badge`, `tooltip`.

```html
<div class="domi-grid domi-grid--four">
  <article class="domi-card">…<span class="domi-badge domi-badge--success">+12%</span></article>
  <article class="domi-card">…</article>
  <article class="domi-card">…</article>
  <article class="domi-card">…</article>
</div>
```

## Add a new recipe

To add a recipe:

1. Validate it works inside an existing archetype (`templates/dashboard/`, `templates/webapp-shell/`, etc.).
2. Add an H2 section to this file with the prose description, primitives used, and an HTML snippet.
3. Link the recipe from the archetype's `README.md`.
```

- [ ] **Step 2: Verify**

```bash
test -f docs/LAYOUTS.md && echo "created"
```

- [ ] **Step 3: Commit**

```bash
git add docs/LAYOUTS.md
git commit -m "docs(layouts): layout recipes starter (three archetypes)"
```

---

### Task 5: TDD `scripts/runtime/domi-audit.js`

**Files:**
- Test: `tests/domi-audit.test.js` (create)
- Create: `scripts/runtime/domi-audit.js`

**Interfaces:**
- Consumes: `localStorage` (for thread persistence); `DOM` (for `data-feedback` and rail elements)
- Produces: global `DomiAudit` with `mount`, `addComment`, `export` (signature details in AUDIT.md)

- [ ] **Step 1: Write failing tests**

Write `tests/domi-audit.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/runtime/domi-audit.js', 'utf8');

describe('domi-audit.js runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    delete globalThis.DomiAudit;
    // Eval the runtime fresh in this test world. vitest's vm context would be cleaner;
    // for a small runtime, dynamic import from the file works.
    globalThis.eval(SRC);
  });

  it('exposes DomiAudit with mount, addComment, export', () => {
    expect(typeof globalThis.DomiAudit.mount).toBe('function');
    expect(typeof globalThis.DomiAudit.addComment).toBe('function');
    expect(typeof globalThis.DomiAudit.export).toBe('function');
  });

  it('mount renders a feedback rail element', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const rail = document.querySelector('[data-domini-rail]');
    expect(rail.querySelector('[data-domini-rail-form]')).toBeTruthy();
  });

  it('addComment appends an entry to the in-memory thread and localStorage', () => {
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    globalThis.DomiAudit.addComment({ targetId: 'btn-save', body: 'too prominent' });
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].targetId).toBe('btn-save');
    expect(exported.entries[0].body).toBe('too prominent');
    expect(exported.entries[0].resolved).toBe(false);
  });

  it('hydrates entries from localStorage on mount', () => {
    const seed = {
      version: 1, name: 'x',
      entries: [{ id: 'a', targetId: 't', author: 'user', timestamp: '2026-07-05T00:00:00Z', body: 'pre', resolved: false }]
    };
    localStorage.setItem('dominice:x', JSON.stringify(seed));
    document.body.innerHTML = `<div data-domini-rail></div>`;
    globalThis.DomiAudit.mount({ statePath: '.domi/state/x.json', docName: 'x' });
    const exported = JSON.parse(globalThis.DomiAudit.export());
    expect(exported.entries.length).toBe(1);
    expect(exported.entries[0].body).toBe('pre');
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npm test -- tests/domi-audit.test.js
```

Expected: `FAIL` — `scripts/runtime/domi-audit.js` does not exist yet, and `globalThis.DomiAudit` is undefined.

- [ ] **Step 3: Implement the runtime**

Write `scripts/runtime/domi-audit.js`:

```javascript
/* DOMiNice audit runtime — see docs/AUDIT.md */
(function () {
  const STORAGE_PREFIX = 'dominice:';

  function loadEntries(docName) {
    const raw = localStorage.getItem(STORAGE_PREFIX + docName);
    if (!raw) return { version: 1, name: docName, entries: [] };
    try { return JSON.parse(raw); } catch { return { version: 1, name: docName, entries: [] }; }
  }

  function saveEntries(docName, state) {
    localStorage.setItem(STORAGE_PREFIX + docName, JSON.stringify(state));
  }

  function mount({ statePath, docName }) {
    const rail = document.querySelector('[data-domini-rail]');
    if (rail && !rail.querySelector('[data-domini-rail-form]')) {
      const form = document.createElement('form');
      form.setAttribute('data-domini-rail-form', '');
      form.innerHTML = `
        <textarea name="body" rows="2" placeholder="Comment on this doc…"></textarea>
        <button type="submit">Add</button>
      `;
      rail.appendChild(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = form.elements['body'].value.trim();
        if (!body) return;
        addComment({ targetId: null, body });
        form.elements['body'].value = '';
      });
      const list = document.createElement('ul');
      list.setAttribute('data-domini-rail-list', '');
      rail.appendChild(list);
    }
    _state = loadEntries(docName);
    _docName = docName;
    _statePath = statePath;
    _render();
  }

  let _state = { version: 1, name: '', entries: [] };
  let _docName = '';
  let _statePath = '';

  function _render() {
    const list = document.querySelector('[data-domini-rail-list]');
    if (!list) return;
    list.innerHTML = '';
    _state.entries.forEach((e) => {
      const li = document.createElement('li');
      li.dataset.entryId = e.id;
      li.textContent = `[${e.targetId || 'doc'}] ${e.body}`;
      list.appendChild(li);
    });
  }

  function addComment({ targetId, body }) {
    if (!_docName) return;
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      targetId: targetId || null,
      author: 'user',
      timestamp: new Date().toISOString(),
      body,
      resolved: false,
    };
    _state.entries.push(entry);
    saveEntries(_docName, _state);
    _render();
  }

  function exportJSON() {
    return JSON.stringify(_state);
  }

  globalThis.DomiAudit = { mount, addComment, export: exportJSON };
})();
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- tests/domi-audit.test.js
```

Expected: 4 PASS, 0 FAIL.

- [ ] **Step 5: Confirm existing tests still pass**

```bash
npm test
```

Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add scripts/runtime/domi-audit.js tests/domi-audit.test.js
git commit -m "feat(domi-audit): standalone audit runtime with feedback rail + thread persistence"
```

---

### Task 6: Add `templates/working-doc/` reference template

**Files:**
- Create: `templates/working-doc/index.html`
- Create: `templates/working-doc/README.md`

- [ ] **Step 1: Write the template index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Working Doc — example</title>
  <link rel="stylesheet" href="../../components/domi.css">
  <style>
    body { display: grid; grid-template-columns: 1fr 320px; gap: 16px; padding: 24px; }
    aside[data-domini-rail] { position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow: auto; }
    .domini-rail-form textarea { width: 100%; }
    .domini-rail-form button { margin-top: 4px; }
    .domini-rail-list { padding-left: 16px; }
    [data-domini-status-chip] { position: fixed; top: 12px; right: 12px; }
  </style>
</head>
<body>
  <main>
    <h1 data-feedback="doc-title">Example working doc</h1>
    <p>This is a reference working doc. Clone it; replace content with the thing you're actually working on.</p>
    <section data-feedback="section-kpis">
      <h2>KPIs</h2>
      <article class="domi-card" data-feedback="kpi-revenue">
        <h3>Revenue</h3>
        <p>$0</p>
      </article>
    </section>
  </main>
  <aside data-domini-rail></aside>
  <span data-domini-status-chip>v0.1.0-working</span>
  <script src="../../scripts/runtime/domi-audit.js" defer></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      DomiAudit.mount({ statePath: '.domi/state/example-audit.json', docName: 'example-audit' });
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Write `templates/working-doc/README.md`**

```markdown
# Working Doc Archetype

A working doc is a working-doc-mode artifact: feedback rail, status chip, and `data-feedback` hooks on the elements the user is likely to comment on.

Use this archetype when the user says "let's work on X," "review this," or anywhere a working doc is appropriate (see `../../SKILL.md` for the mode-choosing rules).

## What it ships with

- `index.html` — the template; clone it.
- It loads `../../scripts/runtime/domi-audit.js` to mount the rail.
- It expects `.domi/state/<docName>.json` to be writable; in Phase 1, `domi-audit.js` mirrors to `localStorage`.
- It wears the neo skin via `../../components/domi.css`.

## What it does NOT ship with

- A real-time server (Phase 2).
- A pre-populated feedback thread. The JSON file is seeded empty; the first comment creates the first entry.
```

- [ ] **Step 3: Verify the template opens**

```bash
test -f templates/working-doc/index.html && echo "ok"
test -f templates/working-doc/README.md && echo "ok"
```

(Optional smoke check, do not commit automatic screenshot): open the file in a browser and confirm the rail appears and accepts a comment.

- [ ] **Step 4: Commit**

```bash
git add templates/working-doc/
git commit -m "feat(templates): working-doc archetype for audit-mode artifacts"
```

---

### Task 7: Wire an example working doc in `.domi/output/`

**Files:**
- Create: `.domi/output/example-audit.html` (cloned from `templates/working-doc/index.html`)

- [ ] **Step 1: Clone the template**

```bash
mkdir -p .domi/output .domi/state
cp templates/working-doc/index.html .domi/output/example-audit.html
```

- [ ] **Step 2: Verify the file exists**

```bash
test -f .domi/output/example-audit.html && echo "ok"
ls -la .domi/output/example-audit.html
```

(Smoke-check in browser if useful; not required for the commit.)

- [ ] **Step 3: Commit**

```bash
git add .domi/output/example-audit.html
git commit -m "docs(example): example working doc for feedback rail"
```

If `.domi/output/` is in `.gitignore` (v0.1.0 has it ignored), remove it from `.gitignore` first:

```bash
grep -n '\.domi' .gitignore || echo "not ignored"
```

If it's ignored, edit `.gitignore` to remove the `.domi/output/` line as part of this task (the example is meant to be visible). If it's not ignored, skip.

---

### Task 8: Touch up `INIT.md`

**Files:**
- Modify: `INIT.md`

- [ ] **Step 1: Read existing INIT.md**

```bash
cat INIT.md
```

- [ ] **Step 2: Ensure INIT.md points at the new SKILL.md and the two first questions**

Make sure the first paragraph of `INIT.md` ends with a sentence like:

> "When you start, answer two questions first — see `SKILL.md`: is this a working doc (audit surface) or a deliverable, and are we creating new UI or iterating on existing?"

If that sentence is missing, append it. Keep the rest of INIT.md as-is.

- [ ] **Step 3: Commit**

```bash
git add INIT.md
git commit -m "docs(init): point at new SKILL.md mode-choosing rules"
```

---

### Task 9: Touch up `status/STATUS.html`

**Files:**
- Modify: `status/STATUS.html` (minor)

- [ ] **Step 1: Read existing status page**

```bash
cat status/STATUS.html
```

- [ ] **Step 2: Update claims that no longer match**

The previous status page claims authority over the library. If it says anything like "DOMiNice delivers neo-themed HTML artifacts for human-agent communication," replace that sentence with: "DOMiNice is a skill for authoring and iterating on UI work and for working through UI/UX changes via shared HTML docs; the neo-glass-vintage aesthetic is the house style of the skill's own working documents."

Preserve the rest of the structure (KPI chips, version markers, etc.). Touch only the offending sentence.

- [ ] **Step 3: Commit**

```bash
git add status/STATUS.html
git commit -m "docs(status): align wording with new SKILL framing"
```

---

### Task 10: Append a note to `RELEASE-NOTES-v0.1.0.md`

**Files:**
- Modify: `RELEASE-NOTES-v0.1.0.md`

- [ ] **Step 1: Append a new section at the bottom**

Append:

```markdown

---

## SKILL reframe (post-v0.1.0 docs patch)

- `SKILL.md` rewritten to lead with the *authoring* + *audit-loop* purpose; neo aesthetic moved to a scoped section.
- New docs: `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md`.
- New runtime: `scripts/runtime/domi-audit.js` (additive; `domi.js` unchanged).
- New archetype: `templates/working-doc/`.
- No library changes — tokens, primitives, templates (other than the new archetype), and `domi.js` are untouched.
```

- [ ] **Step 2: Commit**

```bash
git add RELEASE-NOTES-v0.1.0.md
git commit -m "docs(release): note SKILL reframe on v0.1.0 notes"
```

---

### Task 11: Final verification

**Files:** none

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 2: Lint any changed scripts**

```bash
npx eslint scripts/runtime/domi-audit.js || echo "ESLint not configured — skip"
```

If ESLint is configured, fix any reported issues.

- [ ] **Step 3: Sanity-check the SKILL.md links**

```bash
grep -E 'docs/(AUDIT|EXTENDING|LAYOUTS)\.md' SKILL.md   # should print 3 lines
```

- [ ] **Step 4: Review the diff against the spec**

Run `git log --oneline v0.1.0..HEAD` to see all commits. Cross-check each spec acceptance criterion:

- [ ] `SKILL.md` rewritten — Task 1.
- [ ] `docs/AUDIT.md` and `docs/EXTENDING.md` exist — Tasks 2, 3.
- [ ] `INIT.md` references new SKILL.md — Task 8.
- [ ] Working feedback rail demo on at least one artifact — Tasks 5, 6, 7.
- [ ] Subsystem ownership is documented — `SKILL.md` "Output locations" + `EXTENDING.md`.
- [ ] `npm test` passes — Task 11 step 1.

- [ ] **Step 5: Tag the patch**

```bash
git tag -a v0.1.1-skill-reframe -m "SKILL.md reframe + audit-loop docs and runtime"
```

No tag if project conventions push tags to releases.

---

## Done when

All 11 task checklists above are checked, `npm test` is green, and `git log v0.1.0..HEAD` shows the expected set of commits. No primitive, token, archetype, or `domi.js` line was modified.
