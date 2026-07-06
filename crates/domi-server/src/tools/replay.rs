// `domi replay` — fetch historical events from `GET /api/events`.
//!
//! Task 2 froze the clap surface (`--since`, `--doc`, `--limit`); Task 4
//! implements the actual `reqwest::Client::get` round-trip and deserializes
//! into `crate::events::event::Event`.

use clap::Args as ClapArgs;

/// Args for `domi replay` (see `crate::tools::cli::ReplayArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct ReplayArgs {
    /// Only events with `ts > since` (ULID or ISO-8601).
    #[arg(long)]
    pub since: Option<String>,

    /// Document filter (path under `.domi/output/`).
    #[arg(long)]
    pub doc: Option<String>,

    /// Maximum number of events to return.
    #[arg(long, default_value_t = 100)]
    pub limit: usize,
}

/// Stub. Task 4 will implement the actual `reqwest::Client::get` round-trip
/// and deserialize into `crate::events::event::Event`.
pub async fn run(_args: ReplayArgs, _server: &url::Url) -> i32 {
    unimplemented!("domi replay — implemented in Phase 2d Task 4");
}
