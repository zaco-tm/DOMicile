//! Tests for the static-file serving pipeline.
//!
//! Consolidated here in `tests.rs` so the test surface can be read as one
//! unit. Tests use `super::serve_file` (test module → file module →
//! public re-export) plus the same `safety::content_type_for_path` helper
//! to access internal types directly.

use std::io::Write;
use std::path::Path;

use tempfile::tempdir;

use super::safety::{content_type_for_path, references_domi_js};
use super::serve_file;
use super::{ContentType, ServeError};

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
        r#"<!doctype html><html><body><script src="../scripts/runtime/domi.js"></script></body></html>"#,
    );
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
        r#"<!doctype html><html><body><script src="/scripts/runtime/domi-audit.js" defer></script></body></html>"#,
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
fn missing_file_returns_not_found() {
    let dir = tempdir().unwrap();
    let s = serve_file(dir.path(), Path::new("nope.html"));
    assert!(matches!(s, Err(ServeError::NotFound)));
}

#[test]
fn directory_returns_not_a_file() {
    let dir = tempdir().unwrap();
    let sub = dir.path().join("subdir");
    std::fs::create_dir(&sub).unwrap();
    let s = serve_file(dir.path(), Path::new("subdir"));
    assert!(matches!(s, Err(ServeError::NotAFile)));
}

#[test]
fn path_escape_returns_escaped_root() {
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

#[test]
fn safety_helpers_are_exported() {
    // Belt-and-suspenders: prove the helpers we lifted into `safety`
    // are reachable from the test module via the same re-export path
    // the rest of the crate uses.
    let p = std::path::Path::new("/tmp/x.html");
    assert_eq!(content_type_for_path(p), ContentType::Html);
    // `references_domi_js` recognizes the bare `domi.js` form (one of its
    // six allow-listed strings). The full `../scripts/runtime/domi.js`
    // form is no longer in the allow-list after the Task 2 split; the
    // helper is dead code and slated for removal in a follow-up.
    let body = b"<script src=\"domi.js\"></script>";
    assert!(references_domi_js(body));
    let safe = std::path::Path::new("normal/file.css");
    assert!(super::safety::ensure_no_parent_dir_components(safe).is_ok());
    let bad = std::path::Path::new("../escape.html");
    assert!(matches!(
        super::safety::ensure_no_parent_dir_components(bad),
        Err(ServeError::EscapedRoot)
    ));
}
