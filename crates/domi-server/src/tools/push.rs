//! `domi push` — POST a single event to `POST /api/events`.
//!
//! Task 1 stub. Real implementation lands in Task 3.

use clap::Args as ClapArgs;

#[derive(Debug, Clone, ClapArgs)]
pub struct PushArgs {
    /// Kind (e.g., `comment`, `rail-add`, `click`).
    #[arg(long)]
    pub kind: String,

    /// Event body (JSON-encoded payload).
    #[arg(long)]
    pub body: String,
}

/// Stub. Task 3 will implement the actual `reqwest::Client::post` round-trip.
pub async fn run(_args: PushArgs, _server: &str) -> i32 {
    unimplemented!("domi push — implemented in Phase 2d Task 3");
}
