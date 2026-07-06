//! `domi tail` — subscribe to the WebSocket event stream and print new events.
//!
//! Task 1 stub. Real implementation lands in Task 5.

use clap::Args as ClapArgs;

#[derive(Debug, Clone, ClapArgs)]
pub struct TailArgs {
    /// Stop after receiving `n` events (0 = unbounded).
    #[arg(long, default_value_t = 0)]
    pub max: u32,
}

/// Stub. Task 5 will implement the `tokio-tungstenite` connect + read loop
/// using `futures-util::{SinkExt, StreamExt}` and serialize each frame as JSON.
pub async fn run(_args: TailArgs, _server: &str) -> i32 {
    unimplemented!("domi tail — implemented in Phase 2d Task 5");
}
