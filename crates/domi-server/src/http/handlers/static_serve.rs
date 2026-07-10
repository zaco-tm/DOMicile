//! Fallback static-serve: feeds requested paths through `serve::file::serve_file`
//! and maps the typed `ContentType` to a content-type header.
//!
//! Returns 404 for `NotFound`/`NotAFile`/`EscapedRoot`. Internal errors surface
//! as 500 with the underlying `io::Error`. The `<head>` of the body may carry the
//! server-detect shim (`scripts/runtime/domi-server.js`) injected by the
//! `serve::file` pipeline when the request is HTML.

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};

use crate::http::state::AppState;

pub async fn static_serve(
    State(state): State<Arc<AppState>>,
    uri: axum::http::Uri,
) -> Response {
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
