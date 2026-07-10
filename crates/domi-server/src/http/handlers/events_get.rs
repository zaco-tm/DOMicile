//! GET /api/events — read events from the JSONL store, with optional
//! `since` (ULID cursor), `doc` (filter to one working doc), and `limit`
//! (clamped to 1..=1000) query parameters.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::http::state::AppState;

#[derive(Deserialize)]
pub struct GetEventsParams {
    pub since: Option<String>,
    pub doc: Option<String>,
    pub limit: Option<usize>,
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
