# AGENTS.md — Conventions for AI Agents Working on DOMiNice

This file is for AI coding agents (Claude, Cursor, etc.) operating in this repository. Humans may also find it useful as a quick orientation.

## TL;DR

- **Use `rtk` for filesystem, git, grep, and test commands** when available — it token-trims noisy output. See "RTK" below.
- The DOMiNice design system library is **read-only by default** during the current rework. Don't edit `tokens/`, `components/`, original `templates/*/`, `scripts/domi.js`, or `examples/` unless the user explicitly asks for library changes. New author work goes in `.domi/output/<name>.html` (committed or untracked depending on context; check with the user).
- Two specs pin the wire protocol at the v2 level: `docs/schemas/event.schema.json` (canonical shape) and `docs/WIRE-PROTOCOL.md` (prose). Cross-language drift between Rust, JS, and either doc is a bug — fix both ends.
- Tests: `npm test` (JS, vitest) and `cargo test --workspace` (Rust). Both must stay green.

## Repo shape

- **Design system library** (read-only by default during rework):
  - `tokens/` — locked palette + ajv-validated JSON schema
  - `components/` — 15 HTML primitives + `domi.css`
  - `templates/` — 5 archetypes (dashboard, webapp-shell, mobile-app-shell, admin-tool, pos-kiosk) plus `working-doc/` (Phase 2 working-doc archetype)
  - `scripts/domi.js` — Phase 1 client runtime (click feedback, form capture)
  - `scripts/domi-audit.js` — audit-loop runtime (Phase 2; reads JSON Schema, writes to localStorage, exposes `DomiAudit.{mount,addComment,export}`)
  - `examples/` — example working doc demonstrating the audit rail
- **Authoring layer** (`SKILL.md`, `docs/AUDIT.md`, `docs/EXTENDING.md`, `docs/LAYOUTS.md`, `docs/PHASE2-SCOPE.md`, `docs/WIRE-PROTOCOL.md`, `docs/RUST.md`):
  - `SKILL.md` — top-level entry; agent loads this first.
  - `docs/AUDIT.md` — audit-loop how-to for working-doc mode.
  - `docs/EXTENDING.md` — library extension rules (new themes, primitives, archetypes).
  - `docs/LAYOUTS.md` — layout recipes (named compositions of primitives).
  - `docs/PHASE2-SCOPE.md` — Phase 2 sub-project decomposition map.
  - `docs/WIRE-PROTOCOL.md` — v2 protocol reference (events.jsonl, HTTP routes, WebSocket frames).
  - `docs/RUST.md` — Rust crate layout + phasing.
  - `docs/superpowers/specs/`, `docs/superpowers/plans/` — design specs and implementation plans.
- **Rust crate** (Phase 2c-α): `crates/domi-server/` — workspace member, sync library only. `cargo build --workspace`, `cargo test -p domi-server`.
- **Init**: `INIT.md` is the original brief from the user. Don't overwrite it; the SKILL.md supersedes the operational layer but `INIT.md` documents intent.

## RTK — use it when available

The repo assumes `rtk` is on PATH (`brew install rtk` if missing). It's a CLI proxy that trims noisy command output before it lands in agent context.

**Always prefer:**
| Need | Native | RTK equivalent |
|---|---|---|
| List directory | `ls -la` | `rtk ls -la` |
| Find files | `find …` | `rtk find …` (or `rtk find -name "*foo*"`) |
| Read file | `cat …` | `rtk read …` (intelligent truncation) |
| Grep content | `grep …` | `rtk grep …` |
| Grep w/ regex | `rg …` | `rtk rg …` |
| Word/line count | `wc -l …` | `rtk wc …` |
| Git status / log / diff | `git …` | `rtk git …` |
| Run tests | `npm test`, `cargo test` | `rtk vitest`, `rtk test` (filters to failures) |
| Tail logs / JSON | `tail -f`, `cat` | `rtk log`, `rtk json` |
| Word-count / summarize a long blob | `wc`, `head` | `rtk smart`, `rtk wc` |

**Avoid:**
- Plain `ls`, `cat`, `find`, `grep` when `rtk` is on PATH.
- `bash -c "…"` wrappers around `rtk` calls — invoke `rtk` directly.
- Long piped chains (e.g., `cat huge.json | grep … | head …`). Use `rtk json --keys-only`, `rtk grep`, or split into separate calls so each output is token-trimmed at the source.
- Reading whole files when you only need a fragment — `rtk read` will truncate intelligently; or use `grep` to land on the right line range first.

**For long bash outputs** (logs, test reports, `cargo` output that exceeds 20 lines): pipe through `rtk log` or read the file with `rtk read` rather than letting the raw output bloat context.

**When rtk isn't available** (CI, fresh container): fall back to native commands with explicit output truncation (`... 2>&1 | tail -50`). Document the absence in the session if it persists.

## Workflow norms

- **Specs before code.** Anything non-trivial goes through `docs/superpowers/specs/<date>-<topic>-design.md` → `docs/superpowers/plans/<date>-<topic>.md` → implementation. The brainstorming skill governs.
- **Library invariant.** Changes to `tokens/`, `components/`, original `templates/*/`, `scripts/domi.js`, or `examples/` require explicit user sign-off in the session. New author work lives in `.domi/output/`.
- **Tests on every change.** JS: `npm test` (vitest, jsdom). Rust: `cargo test -p domi-server`. Both must remain green.
- **Pre-existing dirty state.** `components/domi.css` has been modified on disk but not committed since v0.1.0. Don't touch it unless the user explicitly asks; it's pre-existing.
- **Cargo.lock policy.** Currently untracked (Phase 2c-α is library-only). Phase 2c-γ's binary will re-evaluate. Don't commit `Cargo.lock` unless the user asks.
- **Subagent discipline.** If dispatching subagents, follow `superpowers:subagent-driven-development`. Fresh subagent per task + reviewer per task + whole-branch review at the end.
- **Cross-language drift.** The Rust `Event` struct (in `crates/domi-server/src/events/event.rs`) and the JS test fixtures (`tests/wire-protocol.test.js`) both reference the wire protocol. If one changes, check the other.

## Failure modes to watch for

- **Wraparound: tooling reverting to defaults.** If you start writing `cat foo.md` instead of `rtk read foo.md`, stop and reset. RTK usage is a session-level habit, not a one-off optimization.
- **Cargo.lock creeping in.** Don't `git add Cargo.lock` unless the user asks. Currently untracked.
- **`components/domi.css` "dirty" status.** It's pre-existing. Don't fix it; don't sweep it into your diff.
- **Touching the library by accident.** If your change set includes files under `tokens/` or `components/`, stop and ask the user before committing.
- **Tokens for things already in context.** When the contents of a file are already in your conversation (you read it earlier this session), don't re-read it — reference the prior read instead.

## Pointers

- Top-level entry: `SKILL.md`
- Specs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Wire protocol reference: `docs/WIRE-PROTOCOL.md`
- Wire protocol canonical shape: `docs/schemas/event.schema.json`
- Phase 2 decomposition map: `docs/PHASE2-SCOPE.md`
- Rust layout: `docs/RUST.md`
- Workspace state: `package.json` (JS) + `Cargo.toml` (Rust, workspace)