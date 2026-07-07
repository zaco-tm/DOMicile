# Phase 2d — Agent Tooling (CLI + install + verify)

**Date:** 2026-07-05
**Status:** Draft v1 — pending user review
**Phase:** 2d of Phase 2 (last sub-project; after 2a wire protocol, 2b server-attached JS, 2c-α events writer, 2c-β HTML serving + watcher, 2c-γ binary)
**Upstream contracts:**
- `docs/WIRE-PROTOCOL.md` (v2 wire format — pinned by 2a)
- `docs/schemas/event.schema.json` (canonical event shape — pinned by 2a)
- `crates/domi-server/` library + `domi-server` binary (shipped in 2c-γ): `EventWriter`, `serve_file`, `protocol_banner`, all five HTTP routes (`GET /`, `GET /<path>`, `POST /api/events`, `GET /api/events`, `GET /ws/events`, `GET /healthz`)
- `scripts/domi.js` + `scripts/domi-audit.js` server-attached mode (shipped in 2b)
- `RELEASE-NOTES-v0.1.0.md` (release-notes section added in 2c-γ)

## Problem

`domi-server` is a runnable Rust binary with a complete v2 wire-protocol implementation and a passing gated binary smoke test. But there is no way to:

1. **Exercise it from an agent's shell** — an AI agent authoring DOMiNice artifacts can't tail live events, replay history, or push a synthetic event for debugging.
2. **Install it on a fresh machine** — `cargo install --path crates/domi-server` works but requires source + Rust toolchain; users (and CI) want a one-shot install script that produces a single binary.
3. **Verify a built binary actually works** — beyond `cargo build`, an install artifact needs a smoke pass against a live boot: port binds, `/healthz` returns 200, `POST /api/events` + `GET /api/events` round-trips, WS upgrades and receives a `hello` frame, graceful shutdown on SIGTERM.

Without these three, `domi-server` is technically shippable but operationally unreachable. 2d closes that gap.

## Goals

- Ship a small `tools/` CLI (single binary or script — see **Open Q1**) with three subcommands: `tail`, `replay`, `push`. Subcommands speak v2 wire protocol verbatim — same JSON shapes, same ULID monotonic ordering, same `since` cursor semantics as `GET /api/events`.
- Ship `install.sh` at repo root (see **Open Q3**) that, on macOS or Linux, builds and installs `domi-server` to `~/.local/bin/domi-server` (or `$PREFIX/bin` if `PREFIX` set). One command, idempotent, with `--dry-run` and `--prefix` overrides.
- Ship `verify.sh` that runs the install flow against a temp prefix, boots the binary on an ephemeral port, asserts the four end-to-end invariants listed below, and shuts it down cleanly. Exit code 0 on full pass, non-zero on first failed assertion.
- Cargo.lock policy decision documented (see **Open Q2**).
- Tests: `tools/` CLI gets unit + integration coverage against a real booted binary (reuse the 2c-γ `binary_smoke` pattern — `tempfile` + ephemeral port + `tokio::spawn` of `domi_server::http::run`).
- Library invariant held: `tokens/`, `components/`, `scripts/domi.js`, `scripts/domi-audit.js`, original `templates/*/`, `examples/`, `crates/domi-server/` (already shipped) are untouched.

## Non-goals

- A TUI / GUI client. Tail output is line-delimited JSON to stdout — pipe-friendly.
- Event filtering DSL on `tail` / `replay`. Simple `--doc=<name>` flag only; more complex filtering deferred.
- Authentication, TLS, remote server support. Localhost-only, same as 2c-γ.
- A package manager release (brew tap, deb/rpm). Just shell scripts that produce a working binary on the user's machine.
- A daemon/systemd unit. The server is foreground; users run it from their agent loop or a terminal multiplexer.
- Re-architecting `domi-server` itself. 2d is purely additive — no Rust crate changes inside `crates/domi-server/` (the binary's `--port` / `--root` flags already cover what `tools/` needs to talk to it).

## Open questions (decide before plan)

### Q1. Language for the `tools/` CLI

Three options:

| Option | Pros | Cons |
|---|---|---|
| **(a)** Rust second-binary inside `crates/domi-server` (`[[bin]] name = "domi"`) | Reuses clap + deps from 2c-γ; one `cargo build --release` produces both `domi-server` and `domi`; tight type safety on `Event` / ULID / `since` cursor | Bigger binary footprint; couples tooling to the server crate |
| **(b)** Rust separate crate `crates/domi-tools/` | Clean separation; no coupling; can be built independently | New Cargo.toml + duplicate dep tree; build-time cost |
| **(c)** Node script in `tools/domi.mjs` | Zero new toolchain; ships with the JS half; fast iteration | Needs `ws`, `node:` http — small dep; less type safety without TS |

**Default recommendation: (a)** — cheapest path that reuses 2c-γ's existing dependencies. `clap` derive is already in `Cargo.toml`; `reqwest` (blocking or async) + `tokio-tungstenite` + `ulid` are the only additions, all permissively licensed.

### Q2. `Cargo.lock` policy

Currently gitignored (since 2c-α). 2d's `install.sh` will run `cargo install --locked` against a vendored or fresh checkout. Three sub-options:

- **(a) Keep gitignored.** `install.sh` fetches latest crates.io versions of every dep. Reproducible per-day, not per-commit. Simplest.
- **(b) Commit `Cargo.lock` for the first time.** `install.sh` runs `cargo install --locked` against the committed lockfile. Reproducible per-commit; install is hermetic. Larger diff (`Cargo.lock` is ~thousands of lines).
- **(c) Vendor deps into a release artifact.** Out of scope for 2d — defer to a future "distribution" phase.

**Default recommendation: (b)**, gated on the user signing off on a `Cargo.lock` commit. The repo has only one binary target and the lockfile is small relative to the value of hermetic installs.

### Q3. Location for `install.sh` / `verify.sh`

Options:

- **(a) Repo root** (`./install.sh`, `./verify.sh`). Matches Rust/Go convention; `curl ... | sh` style install docs become trivial.
- **(b) `scripts/`** (`scripts/install.sh`, `scripts/verify.sh`). Matches the existing `scripts/domi.js` / `scripts/domi-audit.js` convention.
- **(c) `tools/install/`** (`tools/install/install.sh`, `tools/install/verify.sh`). Matches the new `tools/` CLI location if Q1 is (a)/(b).

**Default recommendation: (b)** — keeps repo root tidy, matches existing JS scripts convention. `tools/` directory will house the CLI binary.

## Design

### A. `tools/` CLI surface

```
domi tail [--server http://127.0.0.1:4173] [--doc <name>] [--follow] [--limit <n>]
domi replay [--server <url>] [--since <ulid>] [--doc <name>] [--limit <n>]
domi push [--server <url>] --type <event-type> [--doc <name>] [--target <selector>] [--json <raw>]
```

#### `domi tail`

Streams events from `GET /api/events` (one-shot fetch with `since` cursor) plus `/ws/events` (live push). Output is one JSON event per line to stdout — pipe-friendly.

- `--follow` (default true): open WS, append events as they arrive; on first connect, replay since cursor.
- `--limit <n>` (default 100): cap the initial replay; subsequent live events are unbounded.
- `--doc <name>`: client-side filter; only emit events with matching `doc`.
- `--server <url>` (default `http://127.0.0.1:4173`): server origin.
- Exit codes: 0 on graceful shutdown (SIGINT), 1 on connection failure, 2 on protocol error (bad JSON, schema violation).

#### `domi replay`

Non-streaming fetch. Same flags as `tail` minus `--follow`. Prints `{"events":[...], "nextSince":"<ulid>"}` JSON to stdout and exits 0.

#### `domi push`

POSTs a single synthetic event to `/api/events` with `v:2` and `id:null` (server stamps). Useful for debugging and integration tests.

- `--type <event-type>` (required): one of the v2 event types (`click`, `input`, `rail-add`, `rail-resolve`, `nav`).
- `--doc <name>`: defaults to `"synthetic"`.
- `--target <selector>`: CSS selector or element descriptor.
- `--json <raw>`: full event JSON override — takes precedence over the flag-based builder.
- Exit codes: 0 on 204, 1 on network error, 2 on schema rejection (server returns 400).

### B. `install.sh` contract

```bash
./install.sh [--prefix <dir>] [--dry-run] [--no-verify]
```

Behavior:

1. Detect platform (`uname -s`/`uname -m`). Refuse to proceed on non-macOS/Linux/BSD with a clear message.
2. Require `cargo` + `rustc`; print friendly error if missing (link to rustup).
3. `cargo build --release -p domi-server` (and `-p domi` if Q1=(a)).
4. Copy binary to `${PREFIX:-~/.local}/bin/domi-server` (and `domi`).
5. Run `./verify.sh --prefix <same>` unless `--no-verify`.
6. Print post-install message with PATH hint.

Exit codes: 0 on full success, 1 on missing tools, 2 on build failure, 3 on verify failure.

### C. `verify.sh` contract

```bash
./verify.sh [--prefix <dir>] [--timeout <seconds>]
```

Assertions (each must pass; first failure exits non-zero):

1. **`/healthz` returns 200 + `{"status":"ok",...}`** within 5s of binary boot.
2. **`POST /api/events` accepts a v2 `click` event with `id:null` and returns 204.**
3. **`GET /api/events` returns the just-posted event with a server-stamped ULID `id`.**
4. **`/ws/events` upgrades successfully and sends a `{"type":"hello","v":2,...}` frame within 2s.**

Mechanics:

1. Boot binary on ephemeral port (`--port 0`? — see Risks) into background with stdout/stderr captured.
2. Poll `/healthz` with `curl` + exponential backoff up to `--timeout`.
3. `curl -X POST` to `/api/events` with a synthetic event body.
4. `curl` `GET /api/events?doc=<synthetic>` and `jq` for the just-posted event.
5. Use `websocat` if installed OR a small `cargo run`-of-dom `tools/ws-probe` helper to upgrade WS.
6. Send SIGTERM, wait up to 3s, kill -9 if still alive.
7. Print summary table with timings; exit 0.

Exit codes: 0 all-pass, 1 boot timeout, 2 healthz fail, 3 POST fail, 4 GET round-trip fail, 5 WS upgrade fail, 6 shutdown hang.

### D. Wire protocol conformance

The CLI speaks the same wire format as the browser client (`domi.js` / `domi-audit.js` server mode):

- POST body: `{"v":2,"id":null,"ts":null,"type":"...","doc":"...","target":"...","payload":{...}}` — server stamps `id`/`ts`.
- WS subprotocol: plain (no `Sec-WebSocket-Protocol`).
- WS frames: `{type:"hello",v:2,serverId}` on connect, `{type:"event",event:<Event>}` per event, plain JSON text frames.
- Cursor: ULID (per 2a's monotonic ordering); `since=<ulid>` returns events with `id > since`.

Cross-language drift is caught by `tests/wire-protocol.test.js` (already shipping) — `tools/` shares the same JSON shapes, no parallel schema.

### E. Test layout

```
crates/domi-server/
  Cargo.toml                  # +[[bin]] name = "domi" if Q1=(a); +reqwest, +tokio-tungstenite, +ulid
  src/
    http/                     # 2c-γ unchanged
    tools/                    # NEW (if Q1=(a))
      mod.rs                  # pub use subcommands;
      tail.rs                 # tail subcommand + WS loop
      replay.rs               # replay subcommand
      push.rs                 # push subcommand
      cli.rs                  # clap derive for top-level CLI
  tests/
    binary_smoke.rs           # 2c-γ unchanged
    tools_tail_smoke.rs       # NEW: tail against real binary
    tools_push_smoke.rs       # NEW: push against real binary
    tools_replay_smoke.rs     # NEW: replay against real binary

scripts/
  install.sh                  # NEW (or tools/install/install.sh per Q3)
  verify.sh                   # NEW
  ws-probe.mjs                # NEW (small Node helper for verify.sh WS upgrade; or use websocat if installed)
```

Tests reuse the 2c-γ `binary_smoke` pattern: spawn `domi_server::http::run` in a `tokio::spawn`, pick an ephemeral port, run the CLI as a child process or call it as a lib function. Each gated behind `#[ignore]` so default `cargo test` stays hermetic.

## Risks

1. **`--port 0` semantics.** 2c-γ's binary takes `--port <u16>`; ephemeral port discovery needs `--port 0` (kernel assigns). 2c-γ's `args.rs` may or may not support `0` — verify during plan; trivial fix if not.
2. **`verify.sh` WS upgrade without `websocat`.** Either ship `scripts/ws-probe.mjs` (Node, requires `ws` npm pkg — likely already in devDeps for the JS half) or require `websocat` on PATH. Lean on Node to avoid a new system dep.
3. **`Cargo.lock` gitignore flip (Q2=(b)).** First-time commit is large but mechanical. Worst case: `git add Cargo.lock && git commit -m "chore: commit Cargo.lock for hermetic installs"`.
4. **Toolchain availability for `install.sh`.** Users without `cargo`/`rustc` are blocked. Document a "no Rust toolchain" fallback path in the script's `--help` even if it just prints "install rustup: https://rustup.rs".
5. **Cross-platform shell quirks.** macOS `bash` 3.2 vs Linux bash 5. Stick to POSIX-portable shell (`/bin/sh`-ish); avoid `[[ ]]`, `declare -A`, etc. Test on both if possible.
6. **SIGTERM during WS upgrade.** The 2c-γ graceful shutdown path handles SIGINT/SIGTERM but doesn't drain in-flight WS upgrades — verify.sh must allow up to 3s for clean exit, then `kill -9`.

## Cross-references

- 2a spec: `docs/superpowers/specs/2026-07-05-phase2-wire-protocol-design.md`
- 2c-γ spec (binary this hooks into): `docs/superpowers/specs/2026-07-05-phase2c-binary-design.md`
- 2b spec (JS server-attached mode this mirrors): `docs/superpowers/specs/2026-07-05-phase2b-server-attached-js-design.md`
- Wire protocol prose: `docs/WIRE-PROTOCOL.md`
- Wire protocol canonical schema: `docs/schemas/event.schema.json`
- Phase 2 scope map: `docs/PHASE2-SCOPE.md`
- 2c-γ binary smoke test (template for 2d's CLI smoke tests): `crates/domi-server/tests/binary_smoke.rs`
- Repo conventions: `AGENTS.md`
