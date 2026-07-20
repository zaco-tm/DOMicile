use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReloadTarget {
    MatchingPath(PathBuf),
    AllTabs(PathBuf),
}

/// Classify a single changed file into a `ReloadTarget`, dropping entries that
/// must not produce a reload.
///
/// Returns `None` when:
///   - `path.canonicalize()` fails (typically: the file was deleted between
///     the FS event and the classifier call — common with editor atomic-save
///     patterns like Vim's `*.swp` swap dance).
///   - canonicalized path lives inside `state_dir` (server's own writes;
///     `events.jsonl` and rotated `events-<ts>.jsonl` files).
///   - canonicalized path lives outside `root` (e.g. `/etc/passwd`).
///   - the relative path's first component is `domi-server.js` (defensive:
///     a hypothetical future embedded mode that puts the runtime shim inside
///     a served tree must not reload every tab on its own update).
///
/// Otherwise returns `Some(target)` with the path RELATIVE to `root`.
pub fn classify(path: &Path, root: &Path, state_dir: &Path) -> Option<ReloadTarget> {
    let canon = path.canonicalize().ok()?;
    let state_canon = state_dir.canonicalize().ok()?;
    let root_canon = root.canonicalize().ok()?;
    if canon.starts_with(&state_canon) {
        return None;
    }
    let relative = canon.strip_prefix(&root_canon).ok()?;
    // Defensive ignore-list for self-rewriting runtime.
    if relative.components().next().map(|c| c.as_os_str())
        == Some(std::ffi::OsStr::new("domi-server.js"))
    {
        return None;
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    let rel_path = relative.to_path_buf();
    let target = match ext.as_deref() {
        Some("html") | Some("htm") => ReloadTarget::MatchingPath(rel_path),
        Some("css") | Some("js") | Some("mjs") | Some("png") | Some("jpg") | Some("jpeg")
        | Some("gif") | Some("svg") | Some("webp") | Some("ico") | Some("avif") | Some("bmp") => {
            ReloadTarget::AllTabs(rel_path)
        }
        _ => ReloadTarget::AllTabs(rel_path),
    };
    Some(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn root() -> PathBuf {
        PathBuf::from("/srv/root")
    }
    fn state() -> PathBuf {
        PathBuf::from("/srv/state")
    }

    fn touch(p: &Path) {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, b"x").unwrap();
    }

    #[test]
    fn html_classifies_as_matching_path() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("index.html");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::MatchingPath(PathBuf::from("index.html")))
        );
    }

    #[test]
    fn htm_classifies_as_matching_path() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("page.htm");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::MatchingPath(PathBuf::from("page.htm")))
        );
    }

    #[test]
    fn css_js_mjs_classify_as_all_tabs() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        for (name, expected) in [
            ("style.css", "style.css"),
            ("app.js", "app.js"),
            ("mod.mjs", "mod.mjs"),
        ] {
            let p = r.join(name);
            touch(&p);
            assert_eq!(
                classify(&p, r, &s),
                Some(ReloadTarget::AllTabs(PathBuf::from(expected))),
                "classify({name})"
            );
        }
    }

    #[test]
    fn image_extensions_classify_as_all_tabs() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        for name in [
            "logo.png",
            "hero.jpg",
            "icon.jpeg",
            "anim.gif",
            "bg.svg",
            "fav.webp",
            "fav.ico",
            "tile.avif",
            "old.bmp",
        ] {
            let p = r.join(name);
            touch(&p);
            assert_eq!(
                classify(&p, r, &s),
                Some(ReloadTarget::AllTabs(PathBuf::from(name))),
                "classify({name})"
            );
        }
    }

    #[test]
    fn unknown_extension_falls_back_to_all_tabs() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("notes.txt");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::AllTabs(PathBuf::from("notes.txt")))
        );
    }

    #[test]
    fn uppercase_html_classifies_as_matching_path() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("INDEX.HTML");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::MatchingPath(PathBuf::from("INDEX.HTML")))
        );
    }

    #[test]
    fn uppercase_htm_classifies_as_matching_path() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("PAGE.HTM");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::MatchingPath(PathBuf::from("PAGE.HTM")))
        );
    }

    #[test]
    fn path_inside_state_dir_is_dropped() {
        let dir = tempdir().unwrap();
        let r = dir.path().join("root");
        let s = dir.path().join("state");
        std::fs::create_dir_all(&r).unwrap();
        std::fs::create_dir_all(&s).unwrap();
        let p = s.join("events.jsonl");
        touch(&p);
        assert_eq!(classify(&p, &r, &s), None, "events.jsonl must not reload");
    }

    #[test]
    fn path_outside_root_is_dropped() {
        let dir = tempdir().unwrap();
        let r = dir.path().join("root");
        let s = dir.path().join("state");
        std::fs::create_dir_all(&r).unwrap();
        std::fs::create_dir_all(&s).unwrap();
        let p = dir.path().join("elsewhere").join("doc.html");
        touch(&p);
        assert_eq!(
            classify(&p, &r, &s),
            None,
            "/elsewhere/doc.html is outside root"
        );
    }

    #[test]
    fn domi_server_js_first_component_is_dropped() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("domi-server.js");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            None,
            "self-rewrite of shim must not reload"
        );
    }

    #[test]
    fn nested_html_keeps_relative_path() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        let p = r.join("a").join("b").join("c.html");
        touch(&p);
        assert_eq!(
            classify(&p, r, &s),
            Some(ReloadTarget::MatchingPath(PathBuf::from("a/b/c.html")))
        );
    }

    #[test]
    fn missing_file_yields_none() {
        let dir = tempdir().unwrap();
        let r = dir.path();
        let s = dir.path().join("state");
        std::fs::create_dir_all(&s).unwrap();
        // Do NOT touch the file. canonicalize will fail; classifier returns None.
        let p = r.join("ghost.html");
        assert_eq!(
            classify(&p, r, &s),
            None,
            "missing file → None (Vim atomic save race)"
        );
    }

    // silence unused warnings for the helper
    #[allow(dead_code)]
    fn _unused() {
        let _ = root();
        let _ = state();
    }
}
