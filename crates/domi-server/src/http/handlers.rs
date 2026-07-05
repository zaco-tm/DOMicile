//! HTTP request handlers for the `domi-server` binary.
//!
//! Each handler is an `async fn` returning something `IntoResponse`.
//! Validation lives here, near the HTTP boundary; storage and broadcast
//! orchestration live in `state::AppState`.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::json;

use super::state::AppState;

pub async fn banner() -> impl IntoResponse {
    let b = crate::serve::banner::protocol_banner();
    Json(json!({
        "name": b[0].1,
        "version": b[1].1,
        "protocol": b[2].1,
    }))
}

pub async fn healthz(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "serverId": state.server_id.to_string(),
    }))
}

// --- stubs (replaced by Tasks 5–7) ---
pub async fn static_serve(
    _state: State<Arc<AppState>>,
    _path: axum::extract::Path<String>,
) -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "static_serve stub")
}

pub async fn post_event(
    _state: State<Arc<AppState>>,
    _body: axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "post_event stub")
}

pub async fn get_events(
    _state: State<Arc<AppState>>,
    _q: axum::extract::Query<GetEventsParams>,
) -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, "get_events stub")
}

#[derive(serde::Deserialize)]
pub struct GetEventsParams {
    pub since: Option<String>,
    pub doc: Option<String>,
    pub limit: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventWriter;
    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use std::sync::Arc;
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn test_state() -> Arc<AppState> {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state).unwrap();
        let events = state.join("events.jsonl");
        let writer = Arc::new(EventWriter::new(&events));
        Arc::new(AppState::new(root, state, writer, 16))
    }

    #[tokio::test]
    async fn banner_returns_expected_json_shape() {
        let state = test_state();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["name"], "domi-server");
        assert_eq!(json["protocol"], "2");
        assert!(json["version"].is_string());
        assert!(!json["version"].as_str().unwrap().is_empty());
    }

    #[tokio::test]
    async fn healthz_returns_ok() {
        let state = test_state();
        let app = super::super::router::build_router(state.clone());
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/healthz")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["serverId"], state.server_id.to_string());
    }
}
