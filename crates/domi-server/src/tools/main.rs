//! `domi` binary entry point.
//!
//! Parses CLI args via `domi_server::tools::cli::run`, which dispatches to the
//! requested subcommand and returns a process exit code.

#![warn(missing_debug_implementations)]

use domi_server::tools;

#[tokio::main]
async fn main() {
    let code = tools::run().await;
    std::process::exit(code);
}
