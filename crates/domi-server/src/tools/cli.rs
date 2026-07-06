//! `domi` top-level CLI surface.
//!
//! Task 1 ships the clap derive skeleton with `Tail` / `Replay` / `Push`
//! subcommands so that `domi --help` renders the expected layout. Per-handler
//! `run` functions are `unimplemented!()` stubs and will be filled in by
//! Tasks 3-5.
//!
//! The crate-level re-export `domi_server::tools::run` is what `tools/main.rs`
//! calls; it returns a process exit code (`0` on success, non-zero on error).

use clap::{Parser, Subcommand};

use crate::tools::push::PushArgs;
use crate::tools::replay::ReplayArgs;
use crate::tools::tail::TailArgs;

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
    #[arg(long, global = true, default_value = crate::tools::types::DEFAULT_SERVER)]
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
/// Returns a process exit code: `0` on success, non-zero on error. Clap argument
/// parsing errors are routed to `clap`'s default error printer and exit `2`.
pub async fn run() -> i32 {
    let cli = Cli::parse();
    match cli.command {
        Command::Tail(args) => crate::tools::tail::run(args, &cli.server).await,
        Command::Replay(args) => crate::tools::replay::run(args, &cli.server).await,
        Command::Push(args) => crate::tools::push::run(args, &cli.server).await,
    }
}
