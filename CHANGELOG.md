# Changelog

All notable changes to DOMicile are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending decisions (see `README.md` and handoffs for current status)

- npm publish of `@domi/react` and `@domi/astro` to the public registry.
- crates.io release of `domi-server` and `domi-egui` (currently `publish = false`).
- GitHub Actions CI matrix (node + rust).
- `Cargo.lock` tracked vs. gitignored policy flip.
- v1.0 tag.

## [0.1.0] — 2026-07-06

Initial public release. Bundles everything shipped through Phase 4 on `main`.

### Added

#### Design system library (Phase 1)

- `tokens/tokens.json` — single source of truth, ajv-validated schema. 5 color scales, type ramp, spacing scale, radii, motion timings.
- `components/domi.css` — primitive stylesheet reading from the token block.
- 15 HTML primitives under `components/primitives/`: `button`, `card`, `form`, `input`, `select`, `checkbox`, `radio`, `table`, `nav`, `modal`, `alert`, `badge`, `tabs`, `toast`, `tooltip`. Each ships with a `domi-*` class and a README.
- 5 archetype templates: `dashboard`, `webapp-shell`, `mobile-app-shell`, `admin-tool`, `pos-kiosk`.
- `templates/working-doc/` — the audit-rail archetype (feedback rail, status chip, `data-feedback` hooks, neo skin).
- `scripts/runtime/domi.js` — click feedback, form capture, status chip, optional server-attached mode.

#### Audit loop (Phase 1.x)

- `scripts/runtime/domi-audit.js` — mounts the feedback rail; localStorage-backed, with optional disk mirror under `.domi/state/<docName>.json`.
- `DomiAudit.{mount, addComment, resolveEntry, export}` API.
- Per-element targeting via `data-feedback="<id>"`; comments anchor to the element they reference.

#### Wire protocol (Phase 2a)

- `docs/schemas/event.schema.json` — canonical v2 event shape.
- `docs/WIRE-PROTOCOL.md` — human-readable mirror.
- `scripts/runtime/domi-wire.js` — shared wire helpers used by `domi.js` and `domi-audit.js`.

#### Server-attached mode (Phase 2b–2d)

- `scripts/runtime/domi-server.js` — shim injected by the server that opens a WebSocket before `domi-audit.js` runs.
- `crates/domi-server/` — Rust crate with three binaries:
  - `domi-server` — axum HTTP binary with file serving, folder watcher, WebSocket upgrade, `/api/events` route.
  - `domi` — agent CLI (`tools/main.rs`).
  - `crates/domi-server/src/events/` — sync event writer (JSONL persistence).
  - `crates/domi-server/src/serve/` — file serving + folder watcher.
  - `crates/domi-server/src/http/` — axum routes + WebSocket.
- `scripts/shell/install.sh` — installer.
- `scripts/shell/verify.sh` — sanity checker.

#### React wrappers (Phase 3a, `@domi/react`)

- 15 React components under `packages/react/src/primitives/` mirroring the HTML primitives.
- `cn()` utility + TypeScript types + tests + `CSS-AUDIT.md` ground-truth mapping.
- Build via `tsup`; outputs ESM + CJS + `.d.ts` + `.d.cts`.

#### Astro wrappers (Phase 3b, `@domi/astro`)

- 15 `.astro` components under `packages/astro/src/components/`.
- Parser-first static-analysis tests (Astro's `experimental_AstroContainer` is unstable in the current toolchain).
- Zero-JS-by-default hydration control.

#### Rust native widgets (Phase 3c, `domi-egui`)

- 15 leaf widgets + 5 composites under `crates/domi-egui/src/`.
- `build.rs` tokens codegen from `tokens/tokens.json`; SHA-256 parity test.
- WASM-capable (`cargo check --target wasm32-unknown-unknown` passes).
- Example binary: `cargo run --example domi-egui-smoke --features desktop,glow`.

#### Skill loop wiring (Phase 4)

- `tools/skill-smoke.mjs` — clones `templates/working-doc/` and serves it on `http://127.0.0.1:8123/` for local review.
- `tools/skill-smoke-test.mjs` — Playwright e2e for the standalone loop.
- `tools/skill-smoke-server-test.mjs` — boots `domi-server` binary and drives Playwright against the event-backed loop.
- `scripts/shell/verify-skill-loop.sh` and `scripts/shell/verify-skill-loop-server.sh` — bash wrappers that orchestrate the Node tools.

#### Authoring layer

- `SKILL.md` — top-level entry for agents; defines the three output modes (working-doc create, working-doc audit, deliverable) and the piece-by-piece iteration loop.
- `docs/USAGE.md`, `docs/DESIGN.md`, `docs/STANDARDS.md` — full library docs.
- `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md` — workflow + extension guides.
- `docs/WIRE-PROTOCOL.md`, `docs/RUST.md` — technical specs.
- `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/handoffs/` — phase-by-phase design, plans, and handoffs.

### Aesthetic

Neo theme (default for working docs and audit surfaces, available for deliverables):

- Background: plum → coral → peach (`#a89cc8 → #f4978e → #ffd6b3`) at 135°.
- Surfaces: `rgba(255,255,255, 0.4–0.8)` + `backdrop-filter: blur(12px)`.
- Display: Helvetica Neue Black, uppercase, tight tracking.
- Body / labels: JetBrains Mono / SF Mono.
- Success: sage `#9caf88`. Danger: terracotta `#c2410c`.

### Test counts at release

- JS: 250 passed, 2 skipped.
- Rust: 84 passed, 13 ignored.

---

[Unreleased]: https://github.com/zaco-tm/DOMicile/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zaco-tm/DOMicile/releases/tag/v0.1.0
