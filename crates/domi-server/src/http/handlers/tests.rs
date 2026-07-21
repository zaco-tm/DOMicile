//! Tests for the HTTP route handlers.
//!
//! Each route family's tests live next to its own source file in the original
//! layout; consolidated here in `tests.rs` so the test surface can be read
//! as one unit. Tests use `super::super::router::build_router` (handler-module
//! → http-module → router) since they sit at `handlers::tests`.

use std::io::Write;
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use tempfile::tempdir;
use tower::ServiceExt;
use ulid::Ulid;

use crate::events::{Event, EventData, EventWriter, Kind, Rect, Source, Target};
use crate::http::state::AppState;
use crate::serve::file::{serve_file, ContentType, ServeError};

fn test_state() -> (Arc<AppState>, tempfile::TempDir) {
    test_state_with_library(None)
}

fn test_state_with_library(
    library_root: Option<std::path::PathBuf>,
) -> (Arc<AppState>, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let root = dir.path().join("root");
    let state = dir.path().join("state");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&state).unwrap();
    let events = state.join("events.jsonl");
    let writer = Arc::new(EventWriter::new(&events));
    let (file_tx, _) = tokio::sync::broadcast::channel::<crate::serve::file_change::FileChange>(16);
    let app_state = Arc::new(AppState::new(
        root,
        state,
        writer,
        16,
        library_root,
        file_tx,
        200,
    ));
    (app_state, dir)
}

fn post_url() -> &'static str {
    "/api/events"
}

fn sample_payload(doc: &str) -> serde_json::Value {
    serde_json::json!({
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

fn write_three_events_with_ids(state: &Arc<AppState>, ids: &[Ulid; 3]) -> Vec<Ulid> {
    let w = state.writer.clone();
    let mut written = Vec::with_capacity(3);
    for (i, &id) in ids.iter().enumerate() {
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
        written.push(id);
    }
    written
}

/// Writes three events with lexicographically-ordered, fixed ULIDs so any
/// test that depends on the IDs being in a known order (e.g. the
/// `?since=<first id>` cursor filter) is deterministic. ULIDs are
/// 26-char Crockford base32; the trailing `0/1/2` makes the order explicit.
fn write_three_events(state: &Arc<AppState>) -> Vec<Ulid> {
    write_three_events_with_ids(
        state,
        &[
            Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ0").unwrap(),
            Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ1").unwrap(),
            Ulid::from_string("01H8XZQ5K2J9Z9Q4X5Y6Z7XYZ2").unwrap(),
        ],
    )
}

fn app_router(state: Arc<AppState>) -> axum::Router {
    crate::http::router::build_router(state)
}

#[tokio::test]
async fn banner_returns_expected_json_shape() {
    let (state, _dir) = test_state();
    let app = app_router(state);
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
    let app = app_router(state.clone());
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

#[tokio::test]
async fn serve_html_200_with_shim_injected() {
    let (state, _dir) = test_state();
    std::fs::write(
        state.root.join("dashboard.html"),
        r#"<!doctype html><html><body><script src="../scripts/runtime/domi.js"></script></body></html>"#,
    )
    .unwrap();
    let app = app_router(state);
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
    assert!(
        s.contains("runtime/domi.js"),
        "original script tag preserved"
    );
    // shim must come BEFORE the original `<script>` so it sets the flag first.
    let shim_pos = s.find("window.__DOMI_SERVER__").unwrap();
    let original_pos = s.find("runtime/domi.js").unwrap();
    assert!(shim_pos < original_pos, "shim before original");
}

#[tokio::test]
async fn serve_css_200_unchanged() {
    let (state, _dir) = test_state();
    let mut f = std::fs::File::create(state.root.join("style.css")).unwrap();
    f.write_all(b"body { color: red; }").unwrap();
    let app = app_router(state);
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
    let app = app_router(state);
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

#[tokio::test]
async fn post_event_204_and_appends_to_file() {
    let (state, _dir) = test_state();
    let app = app_router(state.clone());
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
    let events_path = state.state_dir.join("events.jsonl");
    let body = std::fs::read_to_string(&events_path).unwrap();
    assert_eq!(body.lines().count(), 1);
}

#[tokio::test]
async fn post_event_stamps_id_when_null() {
    let (state, _dir) = test_state();
    let app = app_router(state.clone());
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
    let app = app_router(state.clone());
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
    let app = app_router(state);
    let mut payload = sample_payload("smoke-v1");
    payload["v"] = serde_json::json!(1);
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
    let app = app_router(state);
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
    let app = app_router(state);
    let mut payload = sample_payload("smoke-bad-kind");
    payload["kind"] = serde_json::json!("bogus");
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
async fn post_event_accepts_null_rect_for_rail_audit() {
    let (state, _dir) = test_state();
    let app = app_router(state.clone());
    let payload = serde_json::json!({
        "v": 2,
        "id": null,
        "ts": "2026-07-05T18:21:00Z",
        "src": "domi-audit.js",
        "doc": "smoke-rail",
        "kind": "rail-add",
        "target": {
            "id": null,
            "selector": null,
            "rect": null
        },
        "data": { "body": "hi", "targetId": null }
    });
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
}

#[tokio::test]
async fn get_events_returns_filtered_after_since() {
    let (state, _dir) = test_state();
    let ids = write_three_events(&state);
    let app = app_router(state);
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
    let app = app_router(state);
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
    let app = app_router(state);
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
    for _i in 0..1500 {
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
    let app = app_router(state);
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

fn repo_root() -> std::path::PathBuf {
    // CARGO_MANIFEST_DIR = crates/domi-server. Two parents → repo root.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("CARGO_MANIFEST_DIR is crates/domi-server; two parents should reach the repo root")
        .to_path_buf()
}

#[test]
fn library_prefix_resolves_components_css() {
    let components = repo_root().join("components");
    let served = serve_file(&components, std::path::Path::new("domi.css"))
        .expect("domi.css should serve from components/");
    assert_eq!(served.content_type, ContentType::Css);
    assert!(!served.body.is_empty());
}

#[test]
fn library_prefix_rejects_parent_traversal() {
    let components = repo_root().join("components");
    let r = serve_file(&components, std::path::Path::new("../Cargo.toml"));
    assert!(
        matches!(r, Err(ServeError::EscapedRoot)),
        ".. must be rejected even under library_root; got {r:?}"
    );
}

#[tokio::test]
async fn router_without_library_root_returns_404_for_components_url() {
    use crate::http::router::build_router;
    let (app_state, _dir) = test_state_with_library(None);
    let app = build_router(app_state);
    let resp = app
        .oneshot(
            Request::builder()
                .uri("/components/domi.css")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "without --library_root, /components/* must fall through to the empty-root fallback"
    );
}
