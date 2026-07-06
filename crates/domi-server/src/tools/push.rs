// `domi push` — POST a single event to `POST /api/events`.
//!
//! Task 2 froze the clap surface (`--type`, `--doc`, `--target`, `--json`);
//! Task 3 implements the actual `reqwest::Client::post` round-trip and
//! builds the event payload (defaulting from `--type`/`--doc`/`--target`
//! or honoring `--json` verbatim).

use clap::Args as ClapArgs;

/// Args for `domi push` (see `crate::tools::cli::PushArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct PushArgs {
    /// Event kind (e.g., `comment`, `rail-add`, `click`).
    #[arg(long)]
    pub r#type: String,

    /// Document path (under `.domi/output/`) this event belongs to.
    #[arg(long)]
    pub doc: Option<String>,

    /// Target element identifier (e.g., CSS selector or DOM id).
    #[arg(long)]
    pub target: Option<String>,

    /// Full event payload as a JSON string. When provided, overrides the
    /// `--type`/`--doc`/`--target` defaults and is sent verbatim.
    #[arg(long)]
    pub json: Option<String>,
}

/// Stub. Task 3 will implement the actual `reqwest::Client::post` round-trip.
pub async fn run(_args: PushArgs, _server: &url::Url) -> i32 {
    unimplemented!("domi push — implemented in Phase 2d Task 3");
}
