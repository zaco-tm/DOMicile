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
- Library paths: `tokens/tokens.json`, `components/primitives/<name>/`, `components/domi.css`, `scripts/domi.js`, `scripts/domi-audit.js`, `templates/<archetype>/index.html`

Do NOT edit the library to do a one-off artifact. Edit the library only when the user explicitly says "add a primitive," "make a new theme," etc. — see `docs/EXTENDING.md`.

## Working-doc chrome (audit mode)

The agent includes on every working-doc page:

- A right-side feedback rail (loaded from `scripts/domi-audit.js`).
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
