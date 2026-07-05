use std::sync::Arc;

use axum::{
    extract::{ws::WebSocketUpgrade, State},
    response::IntoResponse,
};

use super::state::AppState;

/// WebSocket upgrade handler — real implementation lands in Task 8.
///
/// This stub accepts the upgrade and immediately closes the socket so the
/// router compiles and integration tests that hit `/ws/events` get a clean
/// response instead of a routing failure.
pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |_socket| async move {
        let _ = state;
    })
}
