//! Static-file GET handler.
//!
//! `serve_file` reads a file under `root`, classifies it via
//! `content_type_for_path`, and (for HTML files that reference `domi.js`
//! via `src="..."`) prepends the embedded server shim as an inline
//! blocking `<script>` before the first existing `<script>` tag.
//!
//! Path safety: both `root` and the resolved target are canonicalized
//! before the containment check, so `..`-traversal that lands outside
//! `root` returns `ServeError::EscapedRoot`.

use std::io;
use std::path::{Path, PathBuf};

use super::safety::{content_type_for_path, ensure_no_parent_dir_components};
use crate::serve::shim::{SHIM_BYTES, STATUS_SHIM_BYTES};

/// Concatenated shims injected as a single inline-blocking `<script>`
/// before the first opening `<script>` tag. The WS-bridge shim sets
/// `window.__DOMI_SERVER__` and opens the WebSocket; the iter-status
/// shim subscribes to `domi-event` and toggles the modal + chip.
fn inject_shim_inline(body: Vec<u8>) -> Vec<u8> {
    let open = b"<script";
    if !body.windows(open.len()).any(|w| w == open) {
        return body;
    }
    let mut out = Vec::with_capacity(
        body.len() + SHIM_BYTES.len() + STATUS_SHIM_BYTES.len() + open.len() + b"></script>".len(),
    );
    let mut injected = false;
    let mut i = 0usize;
    while i < body.len() {
        if !injected && body[i..].starts_with(&open[..]) {
            out.extend_from_slice(b"<script>");
            out.extend_from_slice(SHIM_BYTES);
            out.extend_from_slice(STATUS_SHIM_BYTES);
            out.extend_from_slice(b"</script>");
            let tag_end = body[i..]
                .iter()
                .position(|&b| b == b'>')
                .map(|p| i + p + 1)
                .unwrap_or(body.len());
            out.extend_from_slice(&body[i..tag_end]);
            let mut j = tag_end;
            while j < body.len()
                && (body[j] == b'\n' || body[j] == b' ' || body[j] == b'\t' || body[j] == b'\r')
            {
                out.push(body[j]);
                j += 1;
            }
            i = j;
            injected = true;
        } else {
            out.push(body[i]);
            i += 1;
        }
    }
    out
}

fn has_script_tag(body: &[u8]) -> bool {
    body.windows(b"<script".len()).any(|w| w == b"<script")
}

pub fn serve_file(root: &Path, requested: &Path) -> Result<super::ServedFile, super::ServeError> {
    let canonical_root = std::fs::canonicalize(root).map_err(super::ServeError::Io)?;
    let target = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        canonical_root.join(requested)
    };
    ensure_no_parent_dir_components(&target)?;
    // After rejecting `..`, target's text is canonical_root or extends it
    // with additional Normal components. Directory symlinks under root
    // pointing outside root are honored transparently: `metadata` /
    // `read` follow them naturally, and the author opted in by placing
    // the symlink under root.
    let meta = std::fs::metadata(&target).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            super::ServeError::NotFound
        } else {
            super::ServeError::Io(e)
        }
    })?;
    if !meta.is_file() {
        return Err(super::ServeError::NotAFile);
    }
    let body = std::fs::read(&target).map_err(super::ServeError::Io)?;
    let content_type = content_type_for_path(&target);
    // Inject the server shim into every HTML file that has at least one
    // existing `<script>` tag. The shim sets `window.__DOMI_SERVER__` and
    // opens a WebSocket to /ws/events; from there `scripts/domi-audit.js`
    // (when loaded) takes the server-mode branch and posts entries to
    // /api/events. The shim is idempotent (guarded by `if (__DOMI_SERVER__)
    // return;`) so always-injecting is safe. The previous gate — which only
    // injected for HTML that referenced `domi.js` — missed pages like the
    // working-doc archetype that load `domi-audit.js` without `domi.js`.
    let body = if content_type == super::ContentType::Html && has_script_tag(&body) {
        inject_shim_inline(body)
    } else {
        body
    };
    Ok(super::ServedFile { body, content_type })
}
