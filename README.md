# DOMiNice

A cross-platform UI design system with an AI-agent authoring layer. **The driving documents in any agent↔human loop are interactive HTML, not markdown.**

> Sponsored by [stoopery](https://stoopery.app)

![stoopery sponsor](branding/sponsor-stoopery.svg)

## What's in v0.1 (Phase 1)

- 🎨 Design tokens (`tokens.json`) — single source of truth
- 🧱 15 HTML primitives — buttons, cards, forms, tables, navs, modals, alerts, badges, tabs, toasts, tooltips, inputs, selects, checkboxes, radios
- 📐 5 archetype templates — dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk
- ⚡ `domi.js` standalone runtime — click-to-feedback, form capture, version chips
- 📚 Full docs — DESIGN, USAGE, STANDARDS (md) + STATUS, UX-MEMORY (html)

## What's coming

- 🔴 **Phase 2:** Live server (`domi serve`) — Rust binary, folder-watch, real-time feedback loop
- 🟡 **Phase 3:** `@domi/react`, `@domi/astro`, `domi-dvui` (Rust crate) — multi-target wrappers
- 🟢 **Phase 4:** v1.0 — distribution, examples, CI

## Quickstart (Phase 1)

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
npm test
```

Open any `templates/*/index.html` in a browser — no server needed.

## License

MIT
