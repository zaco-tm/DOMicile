# Rust in DOMicile

DOMicile ships a Rust crate alongside its JS library. The crate lives at `crates/domi-server/` and is a Cargo workspace member.

## Why

DOMicile ships a live server (`domi-server`) that runs on `localhost`. It's a Rust binary built on `axum` + `tokio` + `notify`. The events writer is a sync library — no async runtime, no networking — so it stays small, fast, and easy to TDD.

## Layout

```
Cargo.toml                    # workspace, at repo root
rust-toolchain.toml           # pins stable channel
crates/
  domi-server/
    Cargo.toml                # crate manifest + [[bin]] name="domi-server"
    build.rs                              # reads scripts/runtime/domi-server.js → SHIM_BYTES
    src/
      lib.rs                  # re-exports events, serve, http
      main.rs                 # tokio::main → http::run
      events/                           # sync event writer
        mod.rs
        event.rs
        writer.rs
      serve/                            # HTML serving + folder watcher
        mod.rs
        banner.rs                          # GET /
        file.rs                            # serve_file + shim injection
        shim.rs                            # SHIM_BYTES (compile-time embedded)
        watcher.rs                         # Watcher trait + NotifyWatcher + MockWatcher
      http/                             # axum HTTP + WS
        mod.rs                            # run() — top-level orchestration + watcher spawn
        args.rs                           # clap derive CLI
        state.rs                          # AppState (Arc<EventWriter> + broadcast::Sender)
        router.rs                         # build_router
        handlers.rs                       # banner, healthz, static_serve, post_event, get_events
        ws.rs                             # /ws/events upgrade + broadcast loop
      tools/                            # domi CLI (tail / replay / push)
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

- `domi-server` — the live feedback server.
- `domi` — agent-side CLI for tailing, replaying, and pushing events.

## Boundary with the JS half

- The Rust crate produces JSON the same way `serde_json::to_writer` writes it. The JSON Schema (`docs/schemas/event.schema.json`) cross-checks the typed Rust struct against the typed JS test fixtures at `tests/wire-protocol.test.js`. If either drifts, the cross-language check fails.
- The Rust crate's `Event` type is the canonical source of truth for the protocol. The JSON Schema is documentation plus a cross-language regression test.
- The DOMicile JS runtimes (`scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`) currently use `localStorage`. The server-attached runtime mode writes to the server's `/api/events` endpoint using the same JSON shape (see `docs/AUDIT.md`). The Rust writer knows nothing about the JS runtimes beyond the wire format.

## Versions and pinning

- `rust-toolchain.toml`: `stable`. (No `nightly` features used.)
- Crate MSRV: **1.83** (egui 0.32.x floor; current toolchain is 1.96).
- Dependencies: see `crates/domi-server/Cargo.toml`. All permissively licensed.
