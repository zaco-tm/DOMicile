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
    let canonical_target = std::fs::canonicalize(&target).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            ServeError::NotFound
        } else {
            ServeError::Io(e)
        }
    })?;
    if !canonical_target.starts_with(&canonical_root) {
        return Err(ServeError::EscapedRoot);
    }
    let meta = std::fs::metadata(&canonical_target).map_err(ServeError::Io)?;
    if !meta.is_file() {
        return Err(ServeError::NotAFile);
    }
    let body = std::fs::read(&canonical_target).map_err(ServeError::Io)?;
    let content_type = content_type_for_path(&canonical_target);
    let body = if content_type == ContentType::Html && references_domi_js(&body) {
        inject_shim_inline(body)
    } else {
        body
    };
    Ok(ServedFile { body, content_type })
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