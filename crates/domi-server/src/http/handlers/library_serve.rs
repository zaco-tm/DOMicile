//! Library routing: serves the DOMicile design system at stable URL prefixes.
//!
//! Three axum-nested routers (`/components/*`, `/scripts/*`, `/tokens/*`) call
//! into this module via `nest(...)`. The router composes the nested subrouter
//! with its own stateful fallback; we extract the request URI directly rather
//! than relying on `Path<T>` because the fallback-passing semantic in axum 0.7
//! makes single-segment extraction brittle for the multi-segment suffixes we
//! serve (e.g. `scripts/runtime/domi-audit.js`).
//!
//! Path safety, content-type inference, and shim injection all live in the
//! shared `serve::file::serve_file`. This module adds one new responsibility:
//! picking which directory to canonicalize against (the library root).
//!
//! Read-only by virtue of the request shape (GET-only via axum). The library
//! invariant is preserved because nothing in this module can mutate files
//! under the library root.

use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    extract::{OriginalUri, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};

use crate::http::state::AppState;
use crate::serve::file::{serve_file, ContentType, ServeError};

/// GET /components/<rest> — resolves `<rest>` under `<library_root>`.
pub async fn library_serve_components(
    OriginalUri(uri): OriginalUri,
    State(state): State<Arc<AppState>>,
) -> Response {
    library_dispatch(state, uri).await
}

/// GET /scripts/<rest> — resolves `<rest>` under `<library_root>`.
pub async fn library_serve_scripts(
    OriginalUri(uri): OriginalUri,
    State(state): State<Arc<AppState>>,
) -> Response {
    library_dispatch(state, uri).await
}

/// GET /tokens/<rest> — resolves `<rest>` under `<library_root>`.
pub async fn library_serve_tokens(
    OriginalUri(uri): OriginalUri,
    State(state): State<Arc<AppState>>,
) -> Response {
    library_dispatch(state, uri).await
}

async fn library_dispatch(state: Arc<AppState>, uri: Uri) -> Response {
    let Some(library_root) = state.library_root.as_ref() else {
        return (StatusCode::NOT_FOUND, "library routes disabled").into_response();
    };
    let suffix: PathBuf = uri
        .path()
        .trim_start_matches('/')
        .to_owned()
        .into();
    match serve_file(library_root, &suffix) {
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
                "DBG library_serve Io error: {e:?} root={:?} suffix={:?}",
                library_root, suffix
            );
            (StatusCode::INTERNAL_SERVER_ERROR, format!("io: {e}")).into_response()
        }
    }
}