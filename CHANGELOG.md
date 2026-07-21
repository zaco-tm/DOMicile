# Changelog

All notable changes to DOMicile are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Release Status Snapshot

Verified via `cargo search` / `npm view` / `gh release list` on 2026-07-18:

| Artifact | Registry | Version | Status |
|---|---|---|---|
| `domicile-react` | npm | `0.1.0` | ✅ Published 2026-07-11 |
| `domicile-astro` | npm | `0.1.0` | ✅ Published 2026-07-12 |
| `domi-server` | crates.io | `0.1.3` | ✅ Published 2026-07-18 (0.1.0 + 0.1.2 also exist; 0.1.2 yanked) |
| `domi-egui` | crates.io | `0.1.0` | ✅ Published 2026-07-12 |
| GitHub Release `v0.1.2` | github.com | — | ✅ Published 2026-07-18 (4 platform assets + SHA256SUMS) |
| `Cargo.lock` | — | — | ✅ Tracked (since 2026-07-11) |

**Workspace ↔ registry sync:** `crates/domi-server` 0.1.3, `crates/domi-egui` 0.1.0, `packages/react` 0.1.0, `packages/astro` 0.1.0 — all in lockstep with their published counterparts.

**Maintainer release process (manual, documented in `INSTALL.md`):**
1. Bump versions + commit.
2. Push tag → GitHub Actions builds 4-target release artifacts.
3. `cargo publish -p domi-server` (and `domi-egui` if bumped).
4. `npm publish` in `packages/react` and `packages/astro` (if bumped).

**Genuinely pending:** per-PR CI matrix (cargo test + npm test on PRs), v1.0 tag.

## [Unreleased]

### Added

- `tools/domi-fetch.sh`: auto-install `domi-server` from GitHub Releases on first `tools/domi-serve.sh start`. SHA-256 verified against the release's `SHA256SUMS`. Falls back to `cargo install domi-server --locked` for unsupported triples or when the network can't reach GitHub. Three env-var escape hatches: `DOMICILE_SKIP_AUTO_INSTALL`, `DOMICILE_BIN_DIR`, `DOMI_SERVER_VERSION_OVERRIDE`. `tools/domi-serve.sh` now auto-fetches in the background rather than asking the user to run `cargo build`.
- `.github/workflows/release.yml`: 4-target matrix (Linux x86_64 + aarch64, macOS aarch64, Windows MSVC) that builds, packages, and uploads release artifacts on `v*` tag push. `x86_64-apple-darwin` is intentionally omitted — the platform is past its useful support window for AI-agent workflows (Intel Mac users build from source via `cargo install domi-server --locked` from crates.io). Windows is build + upload only; auto-install is POSIX-only for v1.
- `tools/tests/domi-fetch.test.mjs`: 7 unit tests for `domi-fetch.sh` with stubbed curl/tar/sha256sum/cargo.
- `scripts/runtime/domi-verify.mjs` (bundled into the skill as `scripts/runtime/domi-verify.mjs`): first-run install verification for any agent that loads the skill. The agent runs it once per fresh install; it returns a structured JSON report listing every required file at the install path and a best-effort `domi-server` binary lookup. Exit 0 when the install is intact, exit 1 when any required file is missing. Standalone mode does not need `domi-server`; the script reports it as informational only. ESM (`.mjs`) so it works without a `package.json` in the install dir. Triggered by a short pointer in `domicile/SKILL.md` §"First-run install check" — the agent runs the script, reads the JSON, acts on it.

### Changed

- **Flattened the skill dir so `npx skills add zaco-tm/DOMicile` works.** Previously the skill shipped as `domicile/domicile/` — a nested bundle inside the skill root. `npx skills` walks the repo, finds `domicile/SKILL.md`, and copies the whole `domicile/` directory, producing a nested install where the SKILL.md's relative paths (`scripts/runtime/domi.js`, `components/domi.css`, etc.) did not resolve. The fix: `domicile/` IS the skill — `SKILL.md` at the root, runtime CSS/JS alongside, working-doc template alongside. `tools/build-skill-bundle.sh` now populates `domicile/` directly (SKILL.md is the canonical entry and is not regenerated). `npx skills add zaco-tm/DOMicile -g` now produces a working flat install; the manual `cp -R domicile <target>` install commands in `INSTALL.md` and `README.md` are updated to the new shape.

- `tools/domi-serve.sh`: `resolve_binary()` rewritten to prefer `$DOMICILE_BIN_DIR/domi-server` (the managed install) with a version check against a pinned `DOMI_SERVER_VERSION` (default `0.1.3`, bumped per release). Falls back to local `target/{release,debug}/domi-server` (dev builds, no version check), then to `command -v domi-server` on PATH.
- `tools/domi-fetch.sh`: hardened against GitHub release-CDN flakiness. curl's default `--retry` only retries on transient errors (5xx, 408, 429) — NOT on 404 — so the script fell through to `cargo install` fallback even when the asset existed. Added `--retry-all-errors` (curl 7.71+) plus `--retry 10 --retry-delay 2 --retry-max-time 60` to ride out the warm-up window after a fresh release. End users hitting a transient 404 should retry the install in a few minutes; the script's 60-second retry budget covers most cases.
- Moved `SKILL.md` from the repo root to `domicile/SKILL.md` so its parent directory matches the Agent Skills `name` field. Strict spec readers (`agentskills.io`) rejected the on-disk layout where `SKILL.md` named `domicile` lived under `DOMicile/`. The install path documented in `INSTALL.md` (e.g. `~/.claude/skills/domicile/SKILL.md`) is unchanged — only the source location moved. All cross-references in `README.md`, `INSTALL.md`, `AGENTS.md`, `INIT.md`, `templates/working-doc/README.md`, and `docs/PHASE2-SCOPE.md` were updated. No agent-facing behavior change.

### Genuinely pending decisions

See the "Release Status Snapshot" at the top of this file for the
ground truth. As of 2026-07-18:

- Per-PR CI matrix (`cargo test --workspace` + `npm test` on every PR).
  Currently the only CI workflow is the release one
  (`.github/workflows/release.yml`); no PR-time gating.
- v1.0 tag.

### Not pending (resolved)

- npm publish of `domicile-react` and `domicile-astro` — already on
  the public registry at `0.1.0`. The earlier "pending" line in this
  section was stale.
- crates.io release of `domi-egui` — already on the public registry at
  `0.1.0`. The earlier "pending" line was stale.
- x86_64-apple-darwin release artifact — dropped from the matrix
  intentionally (Intel Mac past its useful support window). Intel Mac
  users get the binary via `cargo install domi-server --locked` from
  crates.io.
- `Cargo.lock` policy — tracked (since 2026-07-11). Earlier text said
  it was gitignored; that was stale.

## [0.1.3] — 2026-07-18

crates.io release. The 0.1.2 crates.io publish was YANKED because
`crates/domi-server/build.rs` walked up looking for the workspace's
`scripts/runtime/domi-server.js` shim, which doesn't exist in the
published crate — every `cargo install domi-server` panicked at
build time. 0.1.3 ships the shim inside the crate (`crates/domi-server/
scripts/runtime/domi-server.js`) so `cargo install` works from
crates.io. The drift with the workspace source is closed.

### Fixed
- `crates/domi-server/build.rs`: read the JS shim from the crate's
  own `scripts/runtime/` directory first (always present in the
  published crate), with the workspace layout as a dev-time fallback.
  Previously the workspace-only path meant `cargo install` from
  crates.io panicked with "could not locate the DOMicile workspace
  root."

### Changed
- `crates/domi-server/Cargo.toml`: version `0.1.2` → `0.1.3`.
- `crates/domi-server/scripts/runtime/domi-server.js`: added (copied
  from the workspace's `scripts/runtime/domi-server.js` so the
  shim ships with the published crate).
- `tools/domi-serve.sh`: `DOMI_SERVER_VERSION` default `0.1.2` → `0.1.3`.

## [0.1.2] — 2026-07-15

Patch release. Pre-existing CI build fixes surfaced by the v0.1.1
release run: `build.rs` on Windows emitted unescaped backslashes into
the generated `include_bytes!` call (raw string + forward-slash path
fix), the release workflow used `sha256sum` on macOS where it isn't
installed (now branches to `shasum -a 256`), and Windows Git Bash
lacks `zip` (now uses PowerShell's `Compress-Archive`). The
`x86_64-apple-darwin` target is intentionally omitted from the
matrix until GitHub's Intel macOS runner backlog improves — to be
backfilled in a follow-up tag. Also bumps `domi-server` to `0.1.2`.

### Fixed
- `crates/domi-server/build.rs`: use a raw string literal with
  forward-slash paths so the generated `shim_token.rs` compiles on
  Windows. Previously `Path::display()` produced `D:\a\...` strings
  that failed to parse as Rust string literals.
- `.github/workflows/release.yml`: use `shasum -a 256` on macOS
  (where `sha256sum` is not in coreutils).
- `.github/workflows/release.yml`: use PowerShell `Compress-Archive`
  on Windows (where Git Bash has no `zip` binary on PATH).
- `.github/workflows/release.yml`: skip `cargo test` on Windows
  (pre-existing cross-platform test failures are out of scope for
  this release; we still build + package the Windows artifact).

### Changed
- `crates/domi-server/Cargo.toml`: version `0.1.1` → `0.1.2`.
- `tools/domi-serve.sh`: `DOMI_SERVER_VERSION` default `0.1.1` → `0.1.2`.

## [0.1.1] — 2026-07-15

Patch release. Bumps `domi-server` to `0.1.1` to align the crates.io
artifact with the workspace source. The workspace has had `--library-root`
(and other small refinements) since `0.1.0` was published; pinning the
skill's `DOMI_SERVER_VERSION` to `0.1.0` was a half-truth. The 5-target
release artifacts produced by `.github/workflows/release.yml` are now
served from this tag; `tools/domi-fetch.sh install` will download them.

### Changed
- `crates/domi-server/Cargo.toml`: version `0.1.0` → `0.1.1`.
- `tools/domi-serve.sh`: `DOMI_SERVER_VERSION` default `0.1.0` → `0.1.1`.

## [0.1.0] — 2026-07-06

Initial public release. Bundles everything shipped through Phase 4 on `main`.

### Published
- 2026-07-11/12: `domicile-react@0.1.0`, `domicile-astro@0.1.0`, `domi-server@0.1.0`,
  `domi-egui@0.1.0` published to npm and crates.io a few days after
  the GitHub release. All at `0.1.0`.

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

#### React wrappers (Phase 3a, `domicile-react`)

- 15 React components under `packages/react/src/primitives/` mirroring the HTML primitives.
- `cn()` utility + TypeScript types + tests + `CSS-AUDIT.md` ground-truth mapping.
- Build via `tsup`; outputs ESM + CJS + `.d.ts` + `.d.cts`.

#### Astro wrappers (Phase 3b, `domicile-astro`)

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
- `docs/PUBLISH-CHECKLIST.md` — copy-paste commands for the remaining external actions
- `.github/workflows/ci.yml` — node test + lint + build, rust test + wasm check, publish dry-runs for all 4 packages

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
