use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use super::{handlers, state::AppState, ws};

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(handlers::banner))
        .route("/healthz", get(handlers::healthz))
        .route(
            "/api/events",
            post(handlers::post_event).get(handlers::get_events),
        )
        .route("/ws/events", get(ws::ws_upgrade))
        .fallback(get(handlers::static_serve))
        .with_state(state)
}
