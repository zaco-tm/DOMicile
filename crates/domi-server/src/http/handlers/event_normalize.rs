//! Shared protocol-normalization helpers for the events endpoints.
//!
//! Both `events_post::post_event` and `events_get::get_events` rely on the
//! idempotent normalizers below — the v2 wire protocol allows `id`, `ts`,
//! `target`, and `target.rect` to be null on the wire, and the server fills
//! them in so the typed `Event` deserializes cleanly. The rail-add path on
//! `domi-audit.js` sends `rect: null` because the rail has no bounding-rect
//! concept; without this normalization the comment is silently dropped on 400.

use serde_json::{json, Value};

/// Require `raw["v"] == 2`. Returns the version as a u64 if valid.
/// (Not strictly a normalizer; surfaces a strong error if the version is
/// missing or unsupported.)
pub fn require_v2(raw: &Value) -> Result<u64, &'static str> {
    match raw.get("v").and_then(|v| v.as_u64()) {
        Some(2) => Ok(2),
        Some(_) => Err("unsupported protocol version"),
        None => Err("missing v"),
    }
}

/// Stamp `id` if it's missing or null. Idempotent: re-running on an event
/// that already has an id is a no-op.
pub fn stamp_id_if_missing(raw: &mut Value) {
    if raw.get("id").map_or(true, |x| x.is_null()) {
        raw["id"] = json!(ulid::Ulid::new().to_string());
    }
}

/// Stamp `ts` (RFC3339 now) if missing.
pub fn stamp_ts_if_missing(raw: &mut Value) {
    if raw.get("ts").is_none() {
        raw["ts"] = json!(chrono::Utc::now().to_rfc3339());
    }
}

/// Substitute default `target` if null. Required because the 2b rail-resolve
/// path sends `target: null` while the typed `Event::target` is non-nullable.
pub fn default_target_if_null(raw: &mut Value) {
    if raw.get("target").map_or(false, |x| x.is_null()) {
        raw["target"] = json!({
            "id": null,
            "selector": null,
            "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}
        });
    }
}

/// Substitute default `target.rect` if null. Required because the rail-add
/// path sends `rect: null` while the typed `Target::rect` is non-nullable.
pub fn default_rect_if_null(raw: &mut Value) {
    if let Some(t) = raw.get_mut("target") {
        if t.get("rect").map_or(false, |r| r.is_null()) {
            t["rect"] = json!({"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0});
        }
    }
}

/// Run all in-place normalizers in the right order. Idempotent.
pub fn apply_all(raw: &mut Value) {
    stamp_id_if_missing(raw);
    stamp_ts_if_missing(raw);
    default_target_if_null(raw);
    default_rect_if_null(raw);
}
