use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn rust_enums_match_css_audit_per_prefix() {
    // CARGO_MANIFEST_DIR is read at runtime (not via `env!()`) so that
    // the resolved path always reflects the current workspace location.
    let manifest_dir = PathBuf::from(
        env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"),
    );
    let workspace_root = find_workspace_root(&manifest_dir).unwrap_or_else(|| {
        panic!(
            "could not locate the DOMicile workspace root by walking up from {}",
            manifest_dir.display()
        )
    });
    let audit_path = workspace_root.join("packages").join("react").join("CSS-AUDIT.md");
    let audit = fs::read_to_string(&audit_path)
        .unwrap_or_else(|e| panic!("read CSS-AUDIT.md ({:?}): {}", audit_path, e));

    let parse_prefix = |prefix: &str| -> (Vec<String>, Vec<String>) {
        let mut variants = Vec::new();
        let mut sizes = Vec::new();
        for line in audit.lines() {
            if !line.starts_with("| Dom") { continue; }
            let cols: Vec<&str> = line.split('|').collect();
            if cols.len() < 5 { continue; }
            let base = cols[2].trim();
            if !base.contains(prefix) { continue; }
            for raw in cols[3].split(',') {
                let s = raw.trim().trim_matches('`').trim();
                if let Some(stripped) = s.strip_prefix("--") {
                    variants.push(stripped.to_string());
                }
            }
            for raw in cols[4].split(',') {
                let s = raw.trim().trim_matches('`').trim();
                if let Some(stripped) = s.strip_prefix("--") {
                    sizes.push(stripped.to_string());
                }
            }
        }
        (variants, sizes)
    };

    let (variants, sizes) = parse_prefix(".domi-btn");
    for v in variants {
        assert!(matches!(v.as_str(), "primary" | "ghost" | "danger"),
            "domi_button exposes ButtonVariant::{v:?} but the test only knows {{primary,ghost,danger}}");
    }
    for s in sizes {
        assert!(matches!(s.as_str(), "sm" | "lg"),
            "domi_button exposes ButtonSize::{s:?} but the test only knows {{sm,lg}}");
    }

    let (variants, _) = parse_prefix(".domi-alert");
    for v in variants {
        assert!(matches!(v.as_str(), "info" | "success" | "warning" | "danger"),
            "domi_alert exposes AlertVariant::{v:?} but the test only knows {{info,success,warning,danger}}");
    }

    let (variants, _) = parse_prefix(".domi-badge");
    for v in variants {
        assert!(matches!(v.as_str(), "primary" | "success" | "warning" | "danger"),
            "domi_badge exposes BadgeVariant::{v:?} but the test only knows {{primary,success,warning,danger}}");
    }

    let (_, sizes) = parse_prefix(".domi-card");
    for s in sizes {
        assert!(matches!(s.as_str(), "sm" | "lg"),
            "domi_card exposes CardSize::{s:?} but the test only knows {{sm,lg}}");
    }

    let (variants, sizes) = parse_prefix(".domi-input");
    for v in variants {
        assert!(matches!(v.as_str(), "error"),
            "domi_input has error: bool; CSS audit also lists {v:?}");
    }
    for s in sizes {
        assert!(matches!(s.as_str(), "sm" | "lg"),
            "domi_input exposes InputSize::{s:?} but the test only knows {{sm,lg}}");
    }

    let (variants, sizes) = parse_prefix(".domi-select");
    for v in variants {
        assert!(matches!(v.as_str(), "error"),
            "domi_select has error: bool; CSS audit also lists {v:?}");
    }
    for s in sizes {
        assert!(matches!(s.as_str(), "sm" | "lg"),
            "domi_select exposes SelectSize::{s:?} but the test only knows {{sm,lg}}");
    }
}

/// Walk up from `start`'s parent until we find a directory whose
/// `Cargo.toml` declares a `[workspace]` table. `start` itself is the
/// crate directory (always contains a Cargo.toml without `[workspace]`),
/// so the search must skip it.
fn find_workspace_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.parent().map(PathBuf::from);
    while let Some(dir) = current {
        let manifest = dir.join("Cargo.toml");
        if manifest.is_file() && has_workspace_table(&manifest) {
            return Some(dir);
        }
        current = dir.parent().map(PathBuf::from);
    }
    None
}

fn has_workspace_table(manifest: &Path) -> bool {
    fs::read_to_string(manifest)
        .map(|s| s.contains("[workspace]"))
        .unwrap_or(false)
}

