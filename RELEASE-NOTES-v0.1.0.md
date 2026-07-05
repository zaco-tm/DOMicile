# DOMiNice v0.1.0 — Phase 1 Complete

> Sponsored by [stoopery](https://stoopery.app)

First public release of the DOMiNice HTML-first design system.

## What's included

- 15 HTML primitives (button, card, form, input, select, checkbox, radio, table, nav, modal, alert, badge, tabs, toast, tooltip)
- 5 archetypes (dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk)
- `domi.js` standalone runtime (click-to-feedback, form capture, JSONL export)
- `SKILL.md` for AI agents (Claude/Kilo/etc.)
- Full docs: DESIGN, USAGE, STANDARDS, STATUS, UX-MEMORY
- Locked Neo-Glass-Vintage "Sunset Pastel" aesthetic

## What's NOT included (later phases)

- Phase 2: `domi-server` Rust binary (live feedback loop)
- Phase 3: `@domi/react`, `@domi/astro`, `domi-dvui` (Rust crate)
- Phase 4: distribution polish + examples

## Install

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
```

Open `templates/dashboard/index.html` in a browser.

## License

MIT

---

## SKILL reframe (post-v0.1.0 docs patch, 2026-07-05)

- `SKILL.md` rewritten to lead with the *authoring* + *audit-loop* purpose; neo aesthetic moved to a scoped section.
- New docs: `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md`.
- New runtime: `scripts/domi-audit.js` (additive; `domi.js` unchanged).
- New archetype: `templates/working-doc/`.
- No library changes — tokens, primitives, templates (other than the new archetype), and `domi.js` are untouched.
