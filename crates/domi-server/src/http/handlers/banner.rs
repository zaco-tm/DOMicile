//! GET / — protocol banner (name + version + protocol version).

use axum::{response::IntoResponse, Json};
use serde_json::json;

pub async fn banner() -> impl IntoResponse {
    let b = crate::serve::banner::protocol_banner();
    Json(json!({
        "name": b[0].1,
        "version": b[1].1,
        "protocol": b[2].1,
    }))
}
