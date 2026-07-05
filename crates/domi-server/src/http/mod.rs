//! HTTP layer for the `domi-server` binary (Phase 2c-γ).
//!
//! Top-level orchestration lives here; concrete pieces live in sibling modules
//! (`args`, `state`, `router`, `handlers`, `ws`). All async; the library
//! primitives (`events::EventWriter`, `serve::*`) are sync and are wrapped via
//! `spawn_blocking` where needed.

pub mod args;
pub mod handlers;
pub mod router;
pub mod state;
pub mod ws;

/// Stub. Real implementation lands in Task 9.
pub async fn run(_args: args::Args) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    Ok(())
}
