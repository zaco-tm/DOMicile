---
name: domicile
description: Skill for authoring and iterating on UI work — components, primitives, layouts, themes — and for working through UI/UX changes with the user via shared HTML docs. Triggers on "build a UI library", "design a X", "let's work on Y", "review this UI", or any task where the user will open an HTML file in a browser to read or annotate it.
---

# DOMicile

Use this skill when the user wants to *create* UI work (a component, primitive, layout, theme, or archetype) using the DOMicile design system, OR when the user wants to *audit / iterate on* existing UI through a shared HTML document they can open in a tab and annotate.

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
| **Deliverable** | "ship," "give me the final," "hand off" | Clean HTML using agreed DOMicile primitives, no rail, no status chip. Theme is whatever the user picked (default neo). |

If you're not sure which mode, ask one question with the linguistic signal you saw, then proceed.

## Output locations

- Working artifacts: `.domi/output/<name>.html`
- Audit thread state: `.domi/state/<name>.json` (read or seed; mirror to `localStorage` for portability)
- Library paths: `tokens/tokens.json`, `components/primitives/<name>/`, `components/domi.css`, `scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`, `templates/<archetype>/index.html`
- Reference working doc: `templates/working-doc/index.html` — **clone it as your starting point** for any working-doc-mode artifact (audit rail, status chip, `data-feedback` hooks, neo skin all in place). `tools/skill-smoke.mjs` does the same clone + serves it on `http://127.0.0.1:8123/` for review. The smoke serves until SIGINT — foreground run with Ctrl-C; if you background it (common for non-interactive agents), record the PID and `kill <pid>` when finished.
- Event-backed serving: for the audit thread to persist across reloads/devices, serve from the Rust `domi-server` binary (`cargo build --release -p domi-server`, then `domi-server --root .domi/output --state .domi/state`). The server auto-injects a `window.__DOMI_SERVER__ = true` shim into the working doc; `scripts/runtime/domi-audit.js` then routes comments to `POST /api/events` instead of `localStorage`. Use `tools/skill-smoke-server-test.mjs` to verify the loop end-to-end (boots the binary, drives Playwright, asserts `/api/events?doc=<name>` returns the comment).

Do NOT edit the library to do a one-off artifact. Edit the library only when the user explicitly says "add a primitive," "make a new theme," etc. — see `docs/EXTENDING.md`.

## Working-doc chrome (audit mode)

The agent includes on every working-doc page:

- A right-side feedback rail (loaded from `scripts/runtime/domi-audit.js`).
- `data-feedback="<meaningful-id>"` on every element the user is likely to want to comment on (section headers, interactive primitives, layout decisions).
- A status chip showing `vN` of the working doc, visible top-right.
- Thread entries are scoped to a target id and rendered next to the element on reload.

**Per-element targeting is the whole point.** When the user clicks an element with a `data-feedback` hook, the form's "Targeting" hint updates to that id and the next comment submits with that `targetId` instead of `null`. The user's typical loop is: open the doc, click section X, leave a comment, click section Y, leave another comment, hit the agent with "iterate." Thread entries persist in `localStorage` (standalone) or the Rust server.

**Iteration mode is piece-by-piece, not page-at-a-time.** When the user says "build X," "design Y," or hands you a working-doc prompt, do **not** generate the entire artifact in one turn. Instead:

1. Build **one section first** with real primitives and a `data-feedback="<section-name>"` hook. Hand off with the URL ready.
2. Wait for the user to click that section and leave a comment. They will comment on the smallest pieces — headings, card copy, button hierarchy — not the whole page.
3. Revise that section. Bump the status chip to `vN`. Hand off again.
4. Repeat for the next section.

If the user explicitly asks for "the full thing," you may draft the whole doc in one turn, but the section hooks, status chip, and click-to-target wiring must all be in place so iteration can begin immediately.

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
