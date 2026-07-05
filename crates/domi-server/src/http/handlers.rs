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

pub async fn static_serve(
    State(state): State<Arc<AppState>>,
    uri: axum::http::Uri,
) -> impl IntoResponse {
    use crate::serve::file::{serve_file, ContentType, ServeError};

    let req_path = uri.path().trim_start_matches('/');
    let requested = std::path::PathBuf::from(req_path);
    match serve_file(&state.root, &requested) {
        Ok(served) => {
            let mime = match served.content_type {
                ContentType::Html => "text/html; charset=utf-8",
                ContentType::Css => "text/css; charset=utf-8",
                ContentType::Js => "application/javascript; charset=utf-8",
                ContentType::Json => "application/json; charset=utf-8",
                ContentType::Png => "image/png",
                ContentType::Jpeg => "image/jpeg",
                ContentType::Svg => "image/svg+xml",
                ContentType::PlainText => "text/plain; charset=utf-8",
                ContentType::OctetStream => "application/octet-stream",
            };
            (
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, mime)],
                served.body,
            )
                .into_response()
        }
        Err(ServeError::NotFound | ServeError::NotAFile | ServeError::EscapedRoot) => {
            (StatusCode::NOT_FOUND, "not found").into_response()
        }
        Err(ServeError::Io(e)) => {
            eprintln!(
                "DBG serve_file Io error: {e:?} root={:?} requested={:?}",
                state.root, requested
            );
            (StatusCode::INTERNAL_SERVER_ERROR, format!("io: {e}")).into_response()
        }
    }
}

pub async fn post_event(
    State(state): State<Arc<AppState>>,
    axum::Json(mut raw): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    // 0. Body must be a JSON object.
    if !raw.is_object() {
        return (StatusCode::BAD_REQUEST, "expected JSON object".to_string()).into_response();
    }

    // 1. Validate v == 2.
    let v = raw.get("v").and_then(|x| x.as_u64());
    match v {
        Some(2) => {}
        Some(other) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("unsupported protocol version: {other}"),
            )
                .into_response();
        }
        None => {
            return (StatusCode::BAD_REQUEST, "missing v".to_string()).into_response();
        }
    }

    // 2. Stamp id if missing or null.
    if raw.get("id").map_or(true, |x| x.is_null()) {
        raw["id"] = json!(ulid::Ulid::new().to_string());
    }

    // 3. Stamp ts if missing.
    if raw.get("ts").is_none() {
        raw["ts"] = json!(chrono::Utc::now().to_rfc3339());
    }

    // 4. Substitute default Target if null (2b rail-resolve sends `target: null`).
    if raw.get("target").map_or(false, |x| x.is_null()) {
        raw["target"] = json!({
            "id": null,
            "selector": null,
            "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}
        });
    }

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

pub async fn get_events(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<GetEventsParams>,
) -> impl IntoResponse {
    use crate::events::Event;

    let limit = params.limit.unwrap_or(100).clamp(1, 1000);
    let events_path = state.state_dir.join("events.jsonl");

    let body = match std::fs::read_to_string(&events_path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return (
                StatusCode::OK,
                Json(json!({"events": [], "nextSince": null})),
            )
                .into_response();
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("read: {e}")).into_response();
        }
    };

    let mut kept: Vec<Event> = Vec::with_capacity(limit);
    for line in body.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let ev: Event = match serde_json::from_str(line) {
            Ok(e) => e,
            Err(_) => continue, // skip malformed
        };
        if let Some(ref since) = params.since {
            if ev.id.to_string().as_str() <= since.as_str() {
                continue;
            }
        }
        if let Some(ref doc) = params.doc {
            if ev.doc != *doc {
                continue;
            }
        }
        kept.push(ev);
        if kept.len() >= limit {
            break;
        }
    }

    let next_since = kept.last().map(|e| e.id.to_string());
    let events_json: Vec<serde_json::Value> = kept
        .iter()
        .map(|e| serde_json::to_value(e).unwrap_or(serde_json::Value::Null))
        .collect();

    (
        StatusCode::OK,
        Json(json!({"events": events_json, "nextSince": next_since})),
    )
        .into_response()
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

    fn test_state() -> (Arc<AppState>, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state).unwrap();
        let events = state.join("events.jsonl");
        let writer = Arc::new(EventWriter::new(&events));
        let app_state = Arc::new(AppState::new(root, state, writer, 16));
        (app_state, dir)
    }

    #[tokio::test]
    async fn banner_returns_expected_json_shape() {
        let (state, _dir) = test_state();
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
        let (state, _dir) = test_state();
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

    use std::io::Write;

    #[tokio::test]
    async fn serve_html_200_with_shim_injected() {
        let (state, _dir) = test_state();
        std::fs::write(
            state.root.join("dashboard.html"),
            r#"<!doctype html><html><body><script src="../scripts/domi.js"></script></body></html>"#,
        ).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/dashboard.html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let s = std::str::from_utf8(&body).unwrap();
        assert!(s.contains("window.__DOMI_SERVER__"), "shim injected");
        assert!(s.contains("domi.js"), "original script tag preserved");
        // shim must come BEFORE the original `<script>` so it sets the flag first.
        let shim_pos = s.find("window.__DOMI_SERVER__").unwrap();
        let original_pos = s.find("domi.js").unwrap();
        assert!(shim_pos < original_pos, "shim before original");
    }

    #[tokio::test]
    async fn serve_css_200_unchanged() {
        let (state, _dir) = test_state();
        let mut f = std::fs::File::create(state.root.join("style.css")).unwrap();
        f.write_all(b"body { color: red; }").unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/style.css")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let s = std::str::from_utf8(&body).unwrap();
        assert!(s.contains("color: red"));
    }

    #[tokio::test]
    async fn serve_404_on_missing() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/nope.html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
    fn post_url() -> &'static str {
        "/api/events"
    }

    fn sample_payload(doc: &str) -> serde_json::Value {
        json!({
            "v": 2,
            "id": null,
            "ts": "2026-07-05T18:21:00Z",
            "src": "domi.js",
            "doc": doc,
            "kind": "click",
            "target": {"id": "btn-save", "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
            "data": {"value": "Save"}
        })
    }

    #[tokio::test]
    async fn post_event_204_and_appends_to_file() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state.clone());
        let payload = sample_payload("smoke-1");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        // File should now have one line.
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        assert_eq!(body.lines().count(), 1);
    }

    #[tokio::test]
    async fn post_event_stamps_id_when_null() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state.clone());
        let payload = sample_payload("smoke-id-null");
        let _ = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        let ev: serde_json::Value = serde_json::from_str(body.lines().next().unwrap()).unwrap();
        assert!(ev["id"].is_string());
        let s = ev["id"].as_str().unwrap();
        assert_eq!(s.len(), 26, "stamped id is a ULID (26 chars)");
        assert!(!s.contains("null"));
    }

    #[tokio::test]
    async fn post_event_stamps_id_when_missing() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state.clone());
        let mut payload = sample_payload("smoke-id-missing");
        payload.as_object_mut().unwrap().remove("id");
        let _ = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let events_path = state.state_dir.join("events.jsonl");
        let body = std::fs::read_to_string(&events_path).unwrap();
        let ev: serde_json::Value = serde_json::from_str(body.lines().next().unwrap()).unwrap();
        assert_eq!(ev["id"].as_str().unwrap().len(), 26);
    }

    #[tokio::test]
    async fn post_event_400_on_v_not_2() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state);
        let mut payload = sample_payload("smoke-v1");
        payload["v"] = json!(1);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn post_event_400_on_empty_doc() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state);
        let payload = sample_payload("");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn post_event_400_on_bad_kind() {
        let (state, _dir) = test_state();
        let app = super::super::router::build_router(state);
        let mut payload = sample_payload("smoke-bad-kind");
        payload["kind"] = json!("bogus");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(post_url())
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    use crate::events::{Event, EventData, Kind, Rect, Source, Target};
    use ulid::Ulid;

    fn write_three_events(state: &Arc<AppState>) -> Vec<Ulid> {
        let w = state.writer.clone();
        let mut ids = Vec::new();
        for i in 0..3 {
            let id = Ulid::new();
            let ev = Event {
                v: 2,
                id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: format!("doc-{i}"),
                kind: Kind::Click,
                target: Target {
                    id: None,
                    selector: None,
                    rect: Rect {
                        x: 0.0,
                        y: 0.0,
                        w: 1.0,
                        h: 1.0,
                    },
                },
                data: EventData::Click {
                    value: Some(format!("v{i}").into()),
                },
            };
            w.write(&ev).unwrap();
            ids.push(id);
        }
        ids
    }

    #[tokio::test]
    async fn get_events_returns_filtered_after_since() {
        let (state, _dir) = test_state();
        let ids = write_three_events(&state);
        let app = super::super::router::build_router(state);
        let url = format!("/api/events?since={}", ids[0]);
        let response = app
            .oneshot(Request::builder().uri(&url).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let events = json["events"].as_array().unwrap();
        assert_eq!(events.len(), 2, "expected events 2 and 3, got {:?}", events);
        assert_eq!(json["nextSince"].as_str().unwrap(), ids[2].to_string());
    }

    #[tokio::test]
    async fn get_events_filters_by_doc() {
        let (state, _dir) = test_state();
        write_three_events(&state);
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/events?doc=doc-1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let events = json["events"].as_array().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["doc"], "doc-1");
    }

    #[tokio::test]
    async fn get_events_default_limit_100() {
        let (state, _dir) = test_state();
        // Write 150 events directly to the file (faster than going through HTTP).
        let mut lines = String::new();
        for _i in 0..150 {
            let id = Ulid::new();
            let ev = Event {
                v: 2,
                id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: "x".into(),
                kind: Kind::Click,
                target: Target {
                    id: None,
                    selector: None,
                    rect: Rect {
                        x: 0.0,
                        y: 0.0,
                        w: 1.0,
                        h: 1.0,
                    },
                },
                data: EventData::Click { value: None },
            };
            lines.push_str(&serde_json::to_string(&ev).unwrap());
            lines.push('\n');
        }
        std::fs::write(state.state_dir.join("events.jsonl"), lines).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["events"].as_array().unwrap().len(), 100);
    }

    #[tokio::test]
    async fn get_events_limit_clamped_to_1000() {
        let (state, _dir) = test_state();
        let mut lines = String::new();
        for _ in 0..1500 {
            let id = Ulid::new();
            let ev = Event {
                v: 2,
                id,
                ts: chrono::Utc::now(),
                src: Source::DomiJs,
                doc: "x".into(),
                kind: Kind::Click,
                target: Target {
                    id: None,
                    selector: None,
                    rect: Rect {
                        x: 0.0,
                        y: 0.0,
                        w: 1.0,
                        h: 1.0,
                    },
                },
                data: EventData::Click { value: None },
            };
            lines.push_str(&serde_json::to_string(&ev).unwrap());
            lines.push('\n');
        }
        std::fs::write(state.state_dir.join("events.jsonl"), lines).unwrap();
        let app = super::super::router::build_router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/events?limit=9999")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["events"].as_array().unwrap().len(), 1000);
    }
}
