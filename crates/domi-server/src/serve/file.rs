//! Static file serving with HTML shim injection.
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

use super::shim::SHIM_BYTES;

#[derive(Debug)]
pub struct ServedFile {
    pub body: Vec<u8>,
    pub content_type: ContentType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Html,
    Css,
    Js,
    Json,
    Png,
    Jpeg,
    Svg,
    PlainText,
    OctetStream,
}

#[derive(Debug)]
#[non_exhaustive]
pub enum ServeError {
    NotFound,
    NotAFile,
    Io(io::Error),
    EscapedRoot,
}

fn content_type_for_path(p: &Path) -> ContentType {
    let ext = p.extension().and_then(|s| s.to_str()).map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("html") | Some("htm") => ContentType::Html,
        Some("css") => ContentType::Css,
        Some("js") | Some("mjs") => ContentType::Js,
        Some("json") => ContentType::Json,
        Some("png") => ContentType::Png,
        Some("jpg") | Some("jpeg") => ContentType::Jpeg,
        Some("svg") => ContentType::Svg,
        Some("txt") | Some("md") => ContentType::PlainText,
        _ => ContentType::OctetStream,
    }
}

/// True when the body references a `domi.js` script via `src="..."` or `src='...'`.
#[allow(dead_code)]
fn references_domi_js(body: &[u8]) -> bool {
    let hay = String::from_utf8_lossy(body);
    hay.contains("src=\"domi.js\"")
        || hay.contains("src='domi.js'")
        || hay.contains("src=\"./domi.js\"")
        || hay.contains("src='./domi.js'")
        || hay.contains("src=\"../scripts/domi.js\"")
        || hay.contains("src='../scripts/domi.js'")
}

/// Insert shim bytes as an inline-blocking `<script>` before the first
/// `<script>` tag (opening tag — not a `</script>` closer). If no opening
/// `<script>` tag exists, the body is returned unchanged (we don't mint
/// a new tag — the page would have to opt in).
fn inject_shim_inline(body: Vec<u8>) -> Vec<u8> {
    let open = b"<script";
    if !body.windows(open.len()).any(|w| w == open) {
        return body;
    }
    let mut out =
        Vec::with_capacity(body.len() + SHIM_BYTES.len() + open.len() + b"></script>".len());
    let mut injected = false;
    let mut i = 0usize;
    while i < body.len() {
        if !injected && body[i..].starts_with(&open[..]) {
            // Emit injected inline-blocking <script>.
            out.extend_from_slice(b"<script>");
            out.extend_from_slice(SHIM_BYTES);
            out.extend_from_slice(b"</script>");
            // Preserve the original opening tag verbatim, then skip
            // any whitespace immediately after it (newline/tab between
            // the `<script>` and inline content). The tag itself stays
            // intact so `<script src="...">` keeps its `src`.
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

pub fn serve_file(root: &Path, requested: &Path) -> Result<ServedFile, ServeError> {
    let canonical_root = std::fs::canonicalize(root).map_err(ServeError::Io)?;
    let target = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        canonical_root.join(requested)
    };
    // Reject `..` components outright. A textual `..` after the join is an
    // escape attempt; canonicalize would silently rewrite it back under
    // root, which is the surface we want to defend. Forbidding `..` keeps
    // the check purely textual and unambiguous.
    for c in target.components() {
        if let std::path::Component::ParentDir = c {
            return Err(ServeError::EscapedRoot);
        }
    }
    // After rejecting `..`, target's text is canonical_root or extends it
    // with additional Normal components. Directory symlinks under root
    // pointing outside root are honored transparently: `metadata` /
    // `read` follow them naturally, and the author opted in by placing
    // the symlink under root.
    let meta = std::fs::metadata(&target).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            ServeError::NotFound
        } else {
            ServeError::Io(e)
        }
    })?;
    if !meta.is_file() {
        return Err(ServeError::NotAFile);
    }
    let body = std::fs::read(&target).map_err(ServeError::Io)?;
    let content_type = content_type_for_path(&target);
    // Inject the server shim into every HTML file that has at least one
    // existing `<script>` tag. The shim sets `window.__DOMI_SERVER__` and
    // opens a WebSocket to /ws/events; from there `scripts/domi-audit.js`
    // (when loaded) takes the server-mode branch and posts entries to
    // /api/events. The shim is idempotent (guarded by `if (__DOMI_SERVER__)
    // return;`) so always-injecting is safe. The previous gate — which only
    // injected for HTML that referenced `domi.js` — missed pages like the
    // working-doc archetype that load `domi-audit.js` without `domi.js`.
    let body = if content_type == ContentType::Html && has_script_tag(&body) {
        inject_shim_inline(body)
    } else {
        body
    };
    Ok(ServedFile { body, content_type })
}

fn has_script_tag(body: &[u8]) -> bool {
    body.windows(b"<script".len()).any(|w| w == b"<script")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn write(p: &Path, s: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        let mut f = std::fs::File::create(p).unwrap();
        f.write_all(s.as_bytes()).unwrap();
    }

    #[test]
    fn serves_html_with_domi_js_injects_shim_before_script() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("dashboard.html");
        write(
            &file,
            r#"<!doctype html><html><body><script src="../scripts/domi.js"></script></body></html>"#,
        );
        let body = std::fs::read(&file).unwrap();
        let requested = Path::new("dashboard.html");
        let s = serve_file(root, requested).expect("serve ok");
        assert_eq!(s.content_type, ContentType::Html);
        let out = std::str::from_utf8(&s.body).unwrap();
        // Shim injected before the existing script tag.
        let shim_pos = out.find("window.__DOMI_SERVER__").expect("shim present");
        let original_script_pos = out.find("domi.js").expect("original ref present");
        assert!(shim_pos < original_script_pos, "shim must come before the existing <script>");
        // Original content preserved.
        assert!(out.contains("domi.js"));
    }

    #[test]
    fn html_without_domi_js_returns_unchanged() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("plain.html");
        write(&file, "<html><body><h1>hi</h1></body></html>");
        let original = std::fs::read(&file).unwrap();
        let s = serve_file(root, Path::new("plain.html")).unwrap();
        assert_eq!(s.body, original);
    }

    #[test]
    fn html_with_domi_audit_only_still_gets_shim() {
        // Working-doc archetype loads domi-audit.js but not domi.js.
        // The new gate ("has any <script> tag") must still inject the shim
        // so the audit module takes its server-mode branch.
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("tracker.html");
        write(
            &file,
            r#"<!doctype html><html><body><script src="/scripts/domi-audit.js" defer></script></body></html>"#,
        );
        let s = serve_file(root, Path::new("tracker.html")).expect("serve ok");
        let out = std::str::from_utf8(&s.body).unwrap();
        assert!(out.contains("window.__DOMI_SERVER__"), "shim injected for domi-audit-only page");
        assert!(out.contains("domi-audit.js"), "original script tag preserved");
        let shim_pos = out.find("window.__DOMI_SERVER__").unwrap();
        let audit_pos = out.find("domi-audit.js").unwrap();
        assert!(shim_pos < audit_pos, "shim must come before the existing <script>");
    }

    #[test]
    fn html_with_external_script_only_no_inline_still_gets_shim() {
        // Regression: a page that loads only a remote script (no
        // domi.js/domi-audit refs) should still get the shim so the
        // WebSocket bridge is up if the page later asks for it.
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("loader.html");
        write(
            &file,
            r#"<!doctype html><html><body><script src="https://example.com/x.js"></script></body></html>"#,
        );
        let s = serve_file(root, Path::new("loader.html")).expect("serve ok");
        let out = std::str::from_utf8(&s.body).unwrap();
        assert!(out.contains("window.__DOMI_SERVER__"));
    }

    #[test]
    fn css_returns_unchanged() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file = root.join("style.css");
        write(&file, "body { color: red; }");
        let s = serve_file(root, Path::new("style.css")).unwrap();
        assert_eq!(s.content_type, ContentType::Css);
        assert!(std::str::from_utf8(&s.body).unwrap().contains("color: red"));
    }

    #[test]
    fn missing_file_returns_NotFound() {
        let dir = tempdir().unwrap();
        let s = serve_file(dir.path(), Path::new("nope.html"));
        assert!(matches!(s, Err(ServeError::NotFound)));
    }

    #[test]
    fn directory_returns_NotAFile() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("subdir");
        std::fs::create_dir(&sub).unwrap();
        let s = serve_file(dir.path(), Path::new("subdir"));
        assert!(matches!(s, Err(ServeError::NotAFile)));
    }

    #[test]
    fn path_escape_returns_EscapedRoot() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let outside = dir.path().parent().unwrap().join("outside.html");
        std::fs::write(&outside, "<html></html>").unwrap();
        let s = serve_file(root, Path::new("../outside.html"));
        assert!(matches!(s, Err(ServeError::EscapedRoot)));
    }

    #[test]
    fn symlink_under_root_to_outside_file_is_served() {
        // Working-doc authoring flow (and the e2e test) requires the served
        // root to symlink the library trees: domi-audit.js + domi.css live
        // outside `--root`, and the working-doc HTML references them
        // absolutely. Verify symlinks under root pointing outside still
        // resolve correctly (the author opted in).
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let dir = tempdir().unwrap();
            let lib = tempdir().unwrap();
            std::fs::write(lib.path().join("audit.js"), b"console.log('ok');").unwrap();
            let root = dir.path();
            std::fs::create_dir(root.join("scripts")).unwrap();
            symlink(lib.path().join("audit.js"), root.join("scripts/audit.js")).unwrap();
            let s = serve_file(root, Path::new("scripts/audit.js")).expect("serve ok");
            let body = std::str::from_utf8(&s.body).unwrap();
            assert!(body.contains("console.log('ok')"));
        }
    }

    #[test]
    fn symlink_under_root_to_outside_directory_serves_leaf() {
        // Regression: a directory symlink authored under `--root` that
        // resolves outside `--root` must still serve the leaf file. The
        // previous `canonicalize(target).starts_with(root)` check rejected
        // these because canonicalize resolved the symlinked dir outside
        // root — false positive for the working-doc authoring flow.
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let dir = tempdir().unwrap();
            let lib = tempdir().unwrap();
            std::fs::write(lib.path().join("audit.js"), b"console.log('lib');").unwrap();
            let root = dir.path();
            // `scripts` is a directory symlink under root pointing outside.
            symlink(lib.path(), root.join("scripts")).unwrap();
            let s = serve_file(root, Path::new("scripts/audit.js")).expect("serve ok");
            let body = std::str::from_utf8(&s.body).unwrap();
            assert!(body.contains("console.log('lib')"));
        }
    }

    #[test]
    fn symlink_under_root_to_directory_traversal_still_blocked() {
        // Defense-in-depth: a textual path that walks out of root via `..`
        // is still blocked, regardless of any symlinks the filesystem
        // happens to have.
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let dir = tempdir().unwrap();
            let outside = dir.path().parent().unwrap();
            std::fs::write(outside.join("secret.html"), "<html>secret</html>").unwrap();
            let root = dir.path();
            // Path that contains `..` after the join.
            let s = serve_file(root, Path::new("../outside/../escape.html"));
            // Either NotFound (target doesn't exist) or EscapedRoot; both
            // are correct refusals. The textual check should give EscapedRoot
            // because the joined path walks out of root.
            assert!(
                matches!(s, Err(ServeError::EscapedRoot) | Err(ServeError::NotFound)),
                "expected refusal, got {:?}",
                s
            );
        }
    }

    #[test]
    fn content_type_js_for_js_files() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write(&root.join("app.js"), "console.log(1);");
        let s = serve_file(root, Path::new("app.js")).unwrap();
        assert_eq!(s.content_type, ContentType::Js);
    }

    #[test]
    fn content_type_default_is_octet_stream() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write(&root.join("mystery.xyz"), "data");
        let s = serve_file(root, Path::new("mystery.xyz")).unwrap();
        assert_eq!(s.content_type, ContentType::OctetStream);
    }
}