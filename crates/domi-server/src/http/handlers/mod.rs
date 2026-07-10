//! HTTP route handlers, split by route family.
//!
//! - [`banner`]         — GET /
//! - [`healthz`]        — GET /healthz
//! - [`static_serve`]   — fallback GET for static file serving
//! - [`events_post`]    — POST /api/events
//! - [`events_get`]     — GET /api/events
//! - [`event_normalize`] — shared protocol helpers used by post + get
//!
//! Public re-exports preserve the upstream `use crate::http::handlers::*`
//! import path used by `router::build_router` and the test crate.

pub mod banner;
pub mod event_normalize;
pub mod events_get;
pub mod events_post;
pub mod healthz;
pub mod static_serve;
#[cfg(test)]
mod tests;

pub use banner::banner;
pub use events_get::{get_events, GetEventsParams};
pub use events_post::post_event;
pub use healthz::healthz;
pub use static_serve::static_serve;
