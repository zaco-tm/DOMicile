//! POST /api/events — write events to the JSONL store and broadcast.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};

use crate::http::handlers::event_normalize;
use crate::http::state::AppState;

pub async fn post_event(
    State(state): State<Arc<AppState>>,
    axum::Json(mut raw): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    // 0. Body must be a JSON object.
    if !raw.is_object() {
        return (StatusCode::BAD_REQUEST, "expected JSON object".to_string()).into_response();
    }

    // 1. Validate v == 2.
    if let Err(msg) = event_normalize::require_v2(&raw) {
        return (StatusCode::BAD_REQUEST, msg.to_string()).into_response();
    }

    // 2-4. Stamp id/ts/target/rect.
    event_normalize::apply_all(&mut raw);

    // 5. Deserialize to typed Event.
    let event: crate::events::Event = match serde_json::from_value(raw) {
        Ok(e) => e,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("invalid event: {e}")).into_response();
        }
    };

    // 6. Doc non-empty.
    if event.doc.is_empty() {
        return (StatusCode::BAD_REQUEST, "doc must be non-empty".to_string()).into_response();
    }

    // 7. spawn_blocking write.
    let writer = Arc::clone(&state.writer);
    let ev_clone = event.clone();
    let write_result = tokio::task::spawn_blocking(move || writer.write(&ev_clone)).await;
    let write_result = match write_result {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("join: {e}")).into_response();
        }
    };
    if let Err(e) = write_result {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("write: {e}")).into_response();
    }

    // 8. Broadcast (ignore send errors — no subscribers is fine).
    let _ = state.broadcaster.send(event);

    (StatusCode::NO_CONTENT, "").into_response()
}
