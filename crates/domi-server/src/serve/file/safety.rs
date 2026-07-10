//! Path safety helpers for the static-file serving pipeline.
//!
//! - `content_type_for_path` — extension-based content-type classifier
//! - `references_domi_js` — legacy helper kept for forward compatibility
//!   (the previous shim-injection gate used this; the current gate is
//!   "has any `<script>` tag", so this is no longer called from
//!   `static_get::serve_file`. Marked `#[allow(dead_code)]` until we
//!   decide to remove it.)
//! - `ensure_no_parent_dir_components` — textual `..` rejection;
//!   extracted from the inline loop that used to live in `serve_file`

use std::path::{Component, Path};

use super::ServeError;

pub fn content_type_for_path(p: &Path) -> super::ContentType {
    let ext = p.extension().and_then(|s| s.to_str()).map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("html") | Some("htm") => super::ContentType::Html,
        Some("css") => super::ContentType::Css,
        Some("js") | Some("mjs") => super::ContentType::Js,
        Some("json") => super::ContentType::Json,
        Some("png") => super::ContentType::Png,
        Some("jpg") | Some("jpeg") => super::ContentType::Jpeg,
        Some("svg") => super::ContentType::Svg,
        Some("txt") | Some("md") => super::ContentType::PlainText,
        _ => super::ContentType::OctetStream,
    }
}

/// True when the body references a `domi.js` script via `src="..."` or `src='...'`.
/// Kept for backward compatibility; not called from `serve_file` anymore.
#[allow(dead_code)]
pub fn references_domi_js(body: &[u8]) -> bool {
    let hay = String::from_utf8_lossy(body);
    hay.contains("src=\"domi.js\"")
        || hay.contains("src='domi.js'")
        || hay.contains("src=\"./domi.js\"")
        || hay.contains("src='./domi.js'")
        || hay.contains("src=\"../scripts/domi.js\"")
        || hay.contains("src='../scripts/domi.js'")
}

/// Reject `..` components outright. A textual `..` after the canonical
/// join is an escape attempt; canonicalize would silently rewrite it
/// back under root, which is the surface we want to defend. Forbidding
/// `..` keeps the check purely textual and unambiguous.
pub fn ensure_no_parent_dir_components(target: &Path) -> Result<(), ServeError> {
    for c in target.components() {
        if let Component::ParentDir = c {
            return Err(ServeError::EscapedRoot);
        }
    }
    Ok(())
}
