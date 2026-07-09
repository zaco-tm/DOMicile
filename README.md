# DOMiNice

A cross-platform UI design system with an AI-agent authoring layer. **The driving documents in any agent↔human loop are interactive HTML, not markdown.**

> Sponsored by [stoopery](https://stoopery.app)

![stoopery sponsor](branding/sponsor-stoopery.svg)

## What's shipped

- 🎨 **Design tokens** (`tokens.json`) — single source of truth, ajv-validated schema
- 🧱 **15 HTML primitives** — buttons, cards, forms, tables, navs, modals, alerts, badges, tabs, toasts, tooltips, inputs, selects, checkboxes, radios
- 📐 **5 archetype templates** — `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk` (plus `working-doc/` for the audit loop)
- ⚡ **`domi.js` runtime** — click-to-feedback, form capture, status chip, optional server-attached mode
- 🔁 **Audit loop** — `domi-audit.js` + `domi-server.js` shim + `templates/working-doc/`. Per-element click-to-target comments, JSONL persistence, WebSocket push.
- 🦀 **`domi-server` (Rust)** — sync event writer, HTTP file serving, folder watcher, axum HTTP routes, WebSocket upgrade, agent CLI (`domi`).
- 🦀 **`domi-egui` (Rust)** — 15 native widgets + 5 composites, WASM-capable, token parity enforced by SHA-256 test.
- ⚛️ **`@domi/react`** — 15 React components wrapping the HTML primitives.
- 🅰️ **`@domi/astro`** — Astro components with hydration-control wrappers.
- 📚 **Library docs** — `docs/USAGE.md`, `docs/DESIGN.md`, `docs/STANDARDS.md` + `docs/WIRE-PROTOCOL.md`, `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md`, `docs/RUST.md`
- 📚 **Phase handoffs** — `docs/superpowers/handoffs/` (read the most recent one for current status)

## What's next

The skill loop is wired (`tools/skill-smoke*.mjs` + `scripts/verify-skill-loop*.sh`) but not yet validated as *playable* end-to-end. The next gate is proving the agent↔reviewer loop runs cleanly on a real working doc before any `npm publish` or `crates.io` release. After that: distribution, v1.0 tag.

## Quickstart

```bash
git clone https://github.com/your-org/dominice.git
cd dominice
npm install
npm test                 # 240 passed / 0 failed
cargo test --workspace   # 77 passed / 13 ignored
```

### Run the skill loop locally

```bash
# Standalone (localStorage-backed)
npm run smoke            # or: node tools/skill-smoke.mjs

# Event-backed (Rust server)
cargo build --release -p domi-server
./target/release/domi-server --root .domi/output --state .domi/state
# then open http://127.0.0.1:8123/ in a browser
```

For agents: load `SKILL.md` first. For everything else: load `AGENTS.md` for repo conventions and `docs/USAGE.md` for the design-system reference.

## License

MIT
