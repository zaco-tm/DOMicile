// `domi` top-level CLI surface.
//!
//! Phase 2d Task 2 freezes the clap derive shape so that `domi --help`,
//! `domi tail --help`, `domi replay --help`, and `domi push --help` render
//! the flags the brief mandates. Per-handler `run` functions are still
//! `unimplemented!()` stubs — Tasks 3 (push), 4 (replay), 5 (tail) fill
//! them in. Stub `run` signatures take `&url::Url` so the URL parsing in
//! `cli::run` is the single entry point that activates `parse_server`
//! (Task 1 review Minor M1).
//!
//! The per-subcommand arg structs (`TailArgs`, `ReplayArgs`, `PushArgs`)
//! live in their own files (`tail.rs`, `replay.rs`, `push.rs`) because
//! Tasks 3-5 own the implementations and want a single source of truth
//! per subcommand. This file only owns the top-level `Cli` and `Command`
//! derive types plus the `run()` dispatch.

use clap::{Parser, Subcommand};
use url::Url;

use crate::tools::push::PushArgs;
use crate::tools::replay::ReplayArgs;
use crate::tools::tail::TailArgs;
use crate::tools::types;

/// `domi` — agent CLI for the DOMiNice live feedback server.
#[derive(Debug, Parser)]
#[command(
    name = "domi",
    version,
    about = "DOMiNice agent CLI — tail, replay, and push audit events",
    long_about = None,
)]
pub struct Cli {
    /// Base URL of the running `domi-server` instance.
    ///
    /// Defaults to `http://127.0.0.1:4173` (the 2c-γ server's default bind).
    /// This flag is `global` so it appears in every subcommand's `--help`.
    #[arg(long, global = true, default_value = types::DEFAULT_SERVER)]
    pub server: String,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Subscribe to the WebSocket event stream and print new events.
    Tail(TailArgs),
    /// Fetch historical events from `GET /api/events` and print them.
    Replay(ReplayArgs),
    /// `POST` a single event to `POST /api/events`.
    Push(PushArgs),
}

/// Parse `Cli` from `std::env::args()` and dispatch to the requested subcommand.
///
/// **Exit codes:**
/// - `0` — success.
/// - `1` — connection / I/O / network failure (no server, DNS, TLS, etc.).
/// - `2` — protocol / parse failure (invalid `--server`, server returned
///   an error status, malformed `--json`, or any `clap` argument error).
///
/// Clap argument parsing errors are routed to clap's default error
/// printer (which itself exits `2`), so user-facing misuse is consistent
/// with the broader CLI convention.
pub async fn run() -> i32 {
    let cli = Cli::parse();

    // Parse --server through the shared `parse_server` helper (Task 1
    // review Minor M1 — activate the dormant boundary). Empty input
    // falls back to `DEFAULT_SERVER` inside `parse_server`.
    let server: Url = match types::parse_server(&cli.server) {
        Ok(u) => u,
        Err(e) => {
            eprintln!("invalid --server: {e}");
            return 2;
        }
    };

    match cli.command {
        Command::Tail(args) => crate::tools::tail::run(args, &server).await,
        Command::Replay(args) => crate::tools::replay::run(args, &server).await,
        Command::Push(args) => crate::tools::push::run(args, &server).await,
    }
}
