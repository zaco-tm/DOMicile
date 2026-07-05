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
    Cargo.toml                # crate manifest
    src/
      lib.rs                  # re-exports the events module
      events/                 # Phase 2c-α: append-only writer
        mod.rs
        event.rs              # Event, EventData, Kind, Source, Target
        writer.rs             # EventWriter, rotation, lock, file_shape
        tests.rs              # 6 tests (tempfile, real fs)
```

## Build and test

```bash
cargo build --workspace
cargo test -p domi-server
```

`cargo test` runs against real temp files (`tempfile` crate); no mocking layer.

## Boundary with the JS half

- The Rust crate produces JSON the same way `serde_json::to_writer` writes it. The JSON Schema (`docs/schemas/event.schema.json`) cross-checks the typed Rust struct against the typed JS test fixtures at `tests/wire-protocol.test.js`. If either drifts, the cross-language check fails.
- The Rust crate's `Event` type is the canonical source of truth for the protocol. The JSON Schema is documentation plus a cross-language regression test.
- The DOMiNice JS runtimes (`scripts/domi.js`, `scripts/domi-audit.js`) currently use `localStorage`. Phase 2b will switch them to write to the server's `/api/events` endpoint using the same JSON shape. The Rust writer knows nothing about the JS runtimes beyond the wire format.

## Versions and pinning

- `rust-toolchain.toml`: `stable`. (No `nightly` features used in 2c-α.)
- Crate MSRV: 1.75 (will set explicitly when implementing; current toolchain is 1.96).
- Dependencies: see `crates/domi-server/Cargo.toml` once added. All permissively licensed.

## Phasing within Rust

| Round | Crate/Subcrate | Surface |
|---|---|---|
| 2c-α | `domi-server` library | `events` module — done in this spec |
| 2c-β | `domi-server` library | `serve` module — HTML serving + file watcher |
| 2c-γ | `domi-server` binary | `main.rs` — axum + tokio + integration of 2c-α + 2c-β |

`β` and `γ` will each get their own brainstorm + plan + execute cycle, against this crate's library API.
