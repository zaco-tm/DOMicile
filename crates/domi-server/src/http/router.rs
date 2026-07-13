use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use super::{handlers, state::AppState, ws};

pub fn build_router(state: Arc<AppState>) -> Router {
    let mut app = Router::new()
        .route("/", get(handlers::banner))
        .route("/healthz", get(handlers::healthz))
        .route(
            "/api/events",
            post(handlers::post_event).get(handlers::get_events),
        )
        .route("/ws/events", get(ws::ws_upgrade));

    // Library mounts are conditional on `--library-root`. Absent flag →
    // byte-identical to the pre-feature router (mounted library paths
    // fall through to the fallback, which 404s them as today).
    //
    // We use `nest` rather than `route("/prefix/{*rest}", ...)` because the
    // latter is incompatible with the explicit `.fallback(...)` that the
    // static_serve handler lives behind — axum 0.7 rejects catch-all +
    // fallback chains. `nest` is implemented internally as a sub-router and
    // is exempt from that restriction.
    if state.library_root.is_some() {
        app = app
            .nest("/components",
                Router::new().fallback(handlers::library_serve_components).with_state(state.clone()))
            .nest("/scripts",
                Router::new().fallback(handlers::library_serve_scripts).with_state(state.clone()))
            .nest("/tokens",
                Router::new().fallback(handlers::library_serve_tokens).with_state(state.clone()));
    }

    app.fallback(get(handlers::static_serve)).with_state(state)
}
