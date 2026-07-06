//! DOMiNice live-server library.
//! See `events` for the v2 protocol event writer.
//! See `serve` for HTTP primitives (banner, file serving, watcher).
//! See `http` for the binary's axum + tokio layer (Phase 2c-γ).

pub mod events;
pub mod http;
pub mod serve;
pub mod tools;
