//! `domi replay` — fetch historical events from `GET /api/events`.
//!
//! Task 1 stub. Real implementation lands in Task 4.

use clap::Args as ClapArgs;

#[derive(Debug, Clone, ClapArgs)]
pub struct ReplayArgs {
    /// Only events with `ts > since` (ISO-8601 or empty for none).
    #[arg(long)]
    pub since: Option<String>,

    /// Document filter (path under `.domi/output/`).
    #[arg(long)]
    pub doc: Option<String>,

    /// Maximum number of events to return.
    #[arg(long, default_value_t = 1000)]
    pub limit: u32,
}

/// Stub. Task 4 will implement the actual `reqwest::Client::get` round-trip
/// and deserialize into `crate::events::event::Event`.
pub async fn run(_args: ReplayArgs, _server: &str) -> i32 {
    unimplemented!("domi replay — implemented in Phase 2d Task 4");
}
