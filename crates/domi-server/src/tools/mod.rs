//! `domi` binary — agent-facing CLI for the DOMicile live feedback server.
//!
//! Subcommands (Phase 2d, Tasks 1-5):
//! - `tail`   — subscribe to the WebSocket event stream and print new events.
//! - `replay` — `GET /api/events` and print historical events.
//! - `push`   — `POST /api/events` to record a single event.
//!
//! Task 1 only ships the `clap` derive skeleton with stub handlers; Tasks 2-5
//! flesh out the per-subcommand implementations (TDD-first).

pub mod cli;
pub mod push;
pub mod replay;
pub mod tail;
pub mod types;

pub use cli::run;
