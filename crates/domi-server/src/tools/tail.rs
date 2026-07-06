// `domi tail` — subscribe to the WebSocket event stream and print new events.
//!
//! Task 2 froze the clap surface (`--follow`, `--limit`, `--doc`); Task 5
//! implements the actual `tokio-tungstenite` connect + read loop using
//! `futures-util::{SinkExt, StreamExt}` and serializes each frame as JSON.

use clap::Args as ClapArgs;

/// Args for `domi tail` (see `crate::tools::cli::TailArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct TailArgs {
    /// Stream new events as they arrive (default: true).
    #[arg(long, default_value_t = true)]
    pub follow: bool,

    /// Maximum number of events to print (0 = unbounded).
    #[arg(long, default_value_t = 100)]
    pub limit: usize,

    /// Document filter (path under `.domi/output/`).
    #[arg(long)]
    pub doc: Option<String>,
}

/// Stub. Task 5 will implement the `tokio-tungstenite` connect + read loop
/// using `futures-util::{SinkExt, StreamExt}` and serialize each frame as JSON.
pub async fn run(_args: TailArgs, _server: &url::Url) -> i32 {
    unimplemented!("domi tail — implemented in Phase 2d Task 5");
}
