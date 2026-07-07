# Rust in DOMiNice

DOMiNice ships a Rust crate alongside its JS library. The crate lives at `crates/domi-server/` and is a Cargo workspace member.

## Why

Phase 2 of DOMiNice adds a live server (`domi-server`) that runs on `localhost`. It's a Rust binary built on `axum` + `tokio` + `notify`. The events writer (Phase 2c-α) is a sync library — no async runtime, no networking — so it stays small, fast, and easy to TDD.

## Layout

```
Cargo.toml                    # workspace, at repo root
rust-toolchain.toml           # pins stable channel
crates/
  domi-server/
    Cargo.toml                # crate manifest + [[bin]] name="domi-server"
    build.rs                              # reads scripts/domi-server.js → SHIM_BYTES
    src/
      lib.rs                  # re-exports events, serve, http
      main.rs                 # tokio::main → http::run
      events/                           # 2c-α
        mod.rs
        event.rs
        writer.rs
      serve/                            # 2c-β
        mod.rs
        banner.rs                          # GET /
        file.rs                            # serve_file + shim injection
        shim.rs                            # SHIM_BYTES (compile-time embedded)
        watcher.rs                         # Watcher trait + NotifyWatcher + MockWatcher
      http/                             # 2c-γ
        mod.rs                            # run() — top-level orchestration + watcher spawn
        args.rs                           # clap derive CLI
        state.rs                          # AppState (Arc<EventWriter> + broadcast::Sender)
        router.rs                         # build_router
        handlers.rs                       # banner, healthz, static_serve, post_event, get_events
        ws.rs                             # /ws/events upgrade + broadcast loop
      tools/                            # 2d (domi binary — tail / replay / push)
        mod.rs                            # shared helpers + subcommand dispatch
        cli.rs                            # clap derive CLI (tail / replay / push subcommands)
        tail.rs                           # domi tail (line-delimited JSON stream)
        replay.rs                         # domi replay (GET /api/events)
        push.rs                           # domi push (POST /api/events)
        types.rs                          # shared types
        main.rs                           # tokio::main → tools::run
```

## Build and test

```bash
cargo build --workspace
cargo test -p domi-server
```

`cargo test` runs against real temp files (`tempfile` crate); no mocking layer.

## Binaries

`crates/domi-server` ships two binaries:

- `domi-server` — the live feedback server (2c-γ).
- `domi` — agent-side CLI for tailing, replaying, and pushing events (2d).

## Boundary with the JS half

- The Rust crate produces JSON the same way `serde_json::to_writer` writes it. The JSON Schema (`docs/schemas/event.schema.json`) cross-checks the typed Rust struct against the typed JS test fixtures at `tests/wire-protocol.test.js`. If either drifts, the cross-language check fails.
- The Rust crate's `Event` type is the canonical source of truth for the protocol. The JSON Schema is documentation plus a cross-language regression test.
- The DOMiNice JS runtimes (`scripts/domi.js`, `scripts/domi-audit.js`) currently use `localStorage`. Phase 2b will switch them to write to the server's `/api/events` endpoint using the same JSON shape. The Rust writer knows nothing about the JS runtimes beyond the wire format.

## Versions and pinning

- `rust-toolchain.toml`: `stable`. (No `nightly` features used in 2c-α.)
- Crate MSRV: **1.83** (bumped for Phase 3c; egui 0.32.x floor; current toolchain is 1.96).
- Dependencies: see `crates/domi-server/Cargo.toml` once added. All permissively licensed.

## Phasing within Rust

| Round | Crate/Subcrate | Surface |
|---|---|---|
| 2c-α | `domi-server` library | `events` module — **done** |
| 2c-β | `domi-server` library | `serve` module — **done** |
| 2c-γ | `domi-server` binary | `main.rs` + `http/` — **done** |
|   2d | `domi-server` binary (`tools/`) | agent CLI (`domi tail` / `replay` / `push`) + `scripts/install.sh` + `scripts/verify.sh` — **done** |
| 3c | `domi-egui` library + smoke | `crates/domi-egui` — 15 egui leaves + 5 composites; tokens.rs build-time codegen — **done** |

`β` and `γ` will each get their own brainstorm + plan + execute cycle, against this crate's library API.
