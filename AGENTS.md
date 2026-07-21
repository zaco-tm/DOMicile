# AGENTS.md — Conventions for AI Agents Working on DOMicile

This file is for AI coding agents (Claude, Cursor, etc.) operating in this repository. Humans may also find it useful as a quick orientation.

## TL;DR

- **Use `rtk` for filesystem, git, grep, and test commands** when available — it token-trims noisy output. See "RTK" below.
- The DOMicile design system library is **read-only by default**. Don't edit `tokens/`, `components/`, original `templates/*/`, `scripts/runtime/domi*.js`, or `examples/` unless the user explicitly asks for library changes. New author work goes in `.domi/output/<name>.html` (committed or untracked depending on context; check with the user).
- The wire protocol is pinned at v2 by two specs: `docs/schemas/event.schema.json` (canonical shape) and `docs/WIRE-PROTOCOL.md` (prose). Cross-language drift between Rust, JS, and either doc is a bug — fix both ends.
- Tests: `npm test` (JS, vitest, jsdom) and `cargo test --workspace` (Rust). Both must stay green. Last verified state: **269 JS passed / 2 skipped (2026-07-18), 90 Rust passed / 13 ignored (2026-07-18)**.

## Repo layout

Where things live today. Anything not listed here is either build-output (under `target/`, `node_modules/`, `dist/`, `.astro/`, `build/`) or the closest-scope module file (`*/AGENTS.md`) — read those when working in a specific area.

- **Design system library** (read-only by default):
  - `tokens/` — locked palette + ajv-validated JSON schema
  - `components/` — 15 HTML primitives + `domi.css`
  - `templates/` — 5 archetypes (`dashboard/`, `webapp-shell/`, `mobile-app-shell/`, `admin-tool/`, `pos-kiosk/`) plus `working-doc/` (clone this for any working-doc-mode artifact)
  - `scripts/runtime/domi.js` — client runtime (click feedback, form capture, status chip)
  - `scripts/runtime/domi-audit.js` — audit-loop runtime (reads JSON Schema, writes to localStorage or POSTs to `domi-server`, exposes `DomiAudit.{mount,addComment,export}`)
  - `scripts/runtime/domi-server.js` — server-detect shim (sets `window.__DOMI_SERVER__`, opens WS)
  - `scripts/runtime/domi-wire.js` — shared wire helpers (used by `domi.js` and `domi-audit.js`)
  - `examples/` — example working doc demonstrating the audit rail
- **Authoring entry** (`domicile/SKILL.md` + `docs/`):
  - `domicile/SKILL.md` — top-level entry; agents load this first. Defines the three output modes (working-doc create, working-doc audit, deliverable) and the iteration mode (piece-by-piece, not page-at-a-time). Lives under `domicile/` to match the Agent Skills spec's `name`-must-match-parent-dir rule.
  - `docs/AUDIT.md` — audit-loop how-to for working-doc mode.
  - `docs/EXTENDING.md` — library extension rules (new themes, primitives, archetypes).
  - `docs/LAYOUTS.md` — layout recipes (named compositions of primitives).
  - `docs/WIRE-PROTOCOL.md` — v2 protocol reference (events.jsonl, HTTP routes, WS frames).
  - `docs/RUST.md` — Rust crate layout for `domi-server` and `domi-egui`.
  - `docs/USAGE.md`, `docs/DESIGN.md`, `docs/STANDARDS.md` — full library docs (referenced by `domicile/SKILL.md` as "Full library docs").
- **Rust workspace** (`Cargo.toml`, resolver "2"):
  - `crates/domi-server/` — HTTP binary (`domi-server`) + agent CLI (`domi`). Sources split into `events/` (writer), `serve/` (file/watcher), `http/` (axum routes), `tools/` (CLI subcommands).
  - `crates/domi-egui/` — Rust crate: 15 per-widget leaves + 5 composites. WASM-capable. Token parity is enforced by a SHA-256 test against the baked-in `tokens.json`.
- **npm workspaces** (`package.json` `workspaces: ["packages/*"]`):
  - `packages/react/` — `domicile-react`: 15 components, `cn()` util, types, tests, CSS-AUDIT. Build via `tsup`.
  - `packages/astro/` — `domicile-astro`: Astro components with hydration-control wrappers.
- **Tooling**:
  - `tools/` — Node scripts: `skill-smoke.mjs` (clones `templates/working-doc/` and serves it on `http://127.0.0.1:8123/` until SIGINT), `skill-smoke-test.mjs` (Playwright e2e for the standalone loop), `skill-smoke-server-test.mjs` (boots `domi-server` binary and drives Playwright against the event-backed loop), `smoke.mjs`, `tokens-to-css.mjs`, `check-file-size.mjs`, `tests/check-file-size.test.mjs`.
  - `scripts/shell/verify-skill-loop.sh`, `scripts/shell/verify-skill-loop-server.sh` — bash wrappers that orchestrate the Node tools.
  - `scripts/shell/install.sh`, `scripts/shell/verify.sh` — installer + sanity-checker scripts.
- **Authoring state** (gitignored, runtime only):
  - `.domi/output/<name>.html` — agent-authored working docs.
  - `.domi/state/<name>.json` — server-side audit thread state.
  - `.superpowers/` — gitignored scaffolding from prior SDD sessions (do not treat as canonical; ignore unless explicitly told otherwise).
  - `target/`, `node_modules/`, `dist/`, `.astro/`, `build/` — gitignored build artifacts. (`Cargo.lock` is tracked — see "Cargo.lock policy" below.)
- **Legacy / one-offs**: `branding/sponsor-stoopery.svg` (sponsor badge, kept); `status/STATUS.html`, `status/UX-MEMORY.html` (historical docs referenced from the old README). Don't add new content under `branding/` or `status/`.

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

**Per-file read budgets** are configured in `tools/agent-rules.md` (`max_lines: 3000`, `max_file_bytes: 512000`, `truncate_long_files: false`). Most Rust files and phase plans exceed 100 lines; the limits are intentionally generous so files are read in full rather than truncated. Do not silently re-read a file already in your session context — reference the prior read instead.

## Workflow norms

- **Specs before code.** Anything non-trivial goes through a design spec → implementation plan → implementation, ending with a handoff. The brainstorming skill governs the spec step. Phase specs and handoffs are kept operator-local and aren't part of the public release.
- **Library invariant.** Changes to `tokens/`, `components/`, original `templates/*/`, `scripts/runtime/domi*.js`, or `examples/` require explicit user sign-off in the session. New author work lives in `.domi/output/`.
- **Tests on every change.** JS: `npm test` (vitest, jsdom) and `npm run test:e2e` / `npm run test:e2e:server` for the skill loop. Rust: `cargo test --workspace`. Both must remain green.
- **Pre-existing dirty state.** As of 2026-07-18, no files are pre-dirty on `main`. (`components/domi.css` was previously flagged here as dirty since v0.1.0; that resolved when the file was committed via the 2026-07-06 rename commit. Re-check with `git status` if a future flag reappears.)
- **Cargo.lock policy.** Tracked. The workspace contains both a binary (`domi-server`) and a library (`domi-egui`), and the binary is what gets shipped as a release artifact — committing `Cargo.lock` is required for reproducible CI builds. The `.gitignore` comment marks the policy flip on 2026-07-11. Bumping a dependency is a deliberate change visible in PR review.
- **Subagent discipline.** If dispatching subagents, follow `superpowers:subagent-driven-development`. Fresh subagent per task + reviewer per task + whole-branch review at the end.
- **Cross-language drift.** The Rust `Event` struct (`crates/domi-server/src/events/event.rs`) and the JS test fixtures (`tests/wire-protocol.test.js`) both reference the wire protocol. If one changes, check the other.
- **Don't auto-commit.** The user has explicit instructions in AGENTS.md to never commit without request. Confirm before any `git commit`, `git push`, or PR creation.
- **Worktree lifecycle.** A worktree is scratch space, not a permanent workspace. After a worktree's branch is fully merged into `main` (working tree clean, `git log origin/main..HEAD` empty, branch tip == `origin/main`), delete both the worktree and the remote branch as the default close-out:
  ```bash
  # from anywhere outside the worktree:
  git worktree remove /path/to/worktree
  git push origin --delete <branch-name>
  ```
  Do not leave merged worktrees on disk or merged branches on `origin` — they accumulate. The user can always re-create a worktree from `main` when the next piece of work starts. If there's a reason to keep one (active follow-up, in-flight review, the user says so), leave it.

## Failure modes to watch for

- **Wraparound: tooling reverting to defaults.** If you start writing `cat foo.md` instead of `rtk read foo.md`, stop and reset. RTK usage is a session-level habit, not a one-off optimization.
- **Cargo.lock policy is loaded, but verify before any `git status` flagged it as untracked.** `Cargo.lock` has been tracked since 2026-07-11 (per the `.gitignore` comment + commit history). If `git status` ever shows `Cargo.lock` as untracked, that means someone re-ignored it — don't `git add` until you confirm.
- **`components/domi.css` "dirty" status.** No longer pre-dirty as of 2026-07-06 (renamed + committed via the DOMicile rename). If `git status` ever flags it as dirty again, check the AGENTS.md TL;DR for the current state before assuming it's pre-existing.
- **Touching the library by accident.** If your change set includes files under `tokens/` or `components/`, stop and ask the user before committing.
- **Editing a file past its size threshold.** `node tools/check-file-size.mjs` reports any file ≥500 lines. Adding to one of those files is a hard stop; extract a coherent responsibility first.
- **Tokens for things already in context.** When the contents of a file are already in your conversation (you read it earlier this session), don't re-read it — reference the prior read instead.
- **Treating `.superpowers/sdd/` as canonical.** It's gitignored scaffolding from prior SDD sessions. Ignore unless the user points to a specific file in it.
- **Treating older handoffs as current.** For project state questions, read `CHANGELOG.md` for released history and `git log --oneline` for what's actually on `main`. Older in-flight phase handoffs are operator-local and not part of the public release.

## File size discipline (added in agent-friendly refactor)

A per-file size policy enforced by `node tools/check-file-size.mjs`
(added by this refactor; wired into `npm test` via the `pretest`
hook with `--no-fail`):

- **0–300 lines** — healthy default; normal edits allowed.
- **300–500 lines** — watchful; new logic only if it fits the file's
  existing single responsibility.
- **500–700 lines** — split-now; extract a coherent responsibility
  BEFORE adding more behavior.
- **700+ lines** — refactor target; subagent **must not** add to it
  without a split plan.

Function size: ≤40 lines default; >80 requires extraction or
inline-comment justification.

Per-file ownership: one primary owner per file = one class / one
widget / one route family / one installer script / one test bundle.
If you're tempted to add a function whose only home is a file that
doesn't currently own its kind, split first.

CI runs `node tools/check-file-size.mjs` with no flags (strict
gate; exit 1 fails the build). `npm test` uses `--no-fail` so dev
loops stay green even if a pre-existing big file hasn't been split
yet.

## Per-module AGENTS.md (closest-scope lookup)

The root AGENTS.md covers global rules (library invariant, RTK,
tests, subagent discipline). For module-specific safe zones vs
ask-first zones, read the closest-scope file:

- `scripts/runtime/AGENTS.md` — client runtimes (read-only)
- `scripts/shell/AGENTS.md` — bash installers + skill-loop runners
- `crates/domi-server/AGENTS.md` — HTTP binary + agent CLI
- `crates/domi-egui/AGENTS.md` — Rust widgets
- `packages/react/AGENTS.md` — `@domi/react` wrappers
- `packages/astro/AGENTS.md` — `@domi/astro` wrappers
- `tools/AGENTS.md` — Node tooling
- `templates/working-doc/AGENTS.md` — audit-rail archetype
- `docs/AGENTS.md` — library docs

The closest-scope file wins when in doubt. Each module file is
≤80 lines and never rewrites the global rules here.

## Long-task session bridge (`.domi/scratch/`)

Long agent tasks die mid-loop. To prevent losing work, write
per-session state to `.domi/scratch/<feature>/`:

- `session-N.md` — raw session output, written before any `/clear`,
  `/compact`, or session-end signal.
- `handoff.md` — ≤1000-token distilled state: current goal,
  decisions made + why, decisions deferred, files in play
  (status: done / in-progress / untouched), next concrete
  action, don't-forget flags.

Trigger: at ~80–85% context usage OR before any context-boundary
signal (clear, compact, session-end, topic-switch). The next
session starts with `cat .domi/scratch/<feature>/handoff.md`.

`.domi/scratch/` is gitignored (already covered by `.domi/` in
`.gitignore`); see `.domi/scratch/README.md` for the full
convention.

## Knowledge graph (`tools/where-is.mjs`)

When unsure where a concept lives, run
`node tools/where-is.mjs "<topic>"`. The script reads
`graphify-out/graph.json` (regenerated via `npm run graph`) and
prints matches grouped by community, plus EXTRACTED
blast-radius edges, plus a suggested next query.

If the script returns "No graph at…", run `npm run graph` once.

## Pointers

- Top-level entry: `domicile/SKILL.md`
- Wire protocol reference: `docs/WIRE-PROTOCOL.md`
- Wire protocol canonical shape: `docs/schemas/event.schema.json`
- Rust layout (server + egui): `docs/RUST.md`
- Library docs: `docs/USAGE.md`, `docs/DESIGN.md`, `docs/STANDARDS.md`
- Audit loop how-to: `docs/AUDIT.md`
- Workspace state: `package.json` (JS, npm workspaces) + `Cargo.toml` (Rust, workspace resolver "2", members `domi-server` and `domi-egui`)
