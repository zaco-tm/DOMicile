use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

#[test]
fn tokens_parity_with_source_json() {
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
    let path = workspace_root.join("tokens").join("tokens.json");
    let bytes = fs::read(&path)
        .unwrap_or_else(|e| panic!("read tokens/tokens.json ({:?}): {}", path, e));
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());
    assert_eq!(
        hash,
        TOKENS_JSON_SHA256,
        "tokens.json drifted from the value hash-baked at build time; \
         this means a token edit hit the source tree but \
         `cargo build` did NOT re-run build.rs (check `cargo:rerun-if-changed`)"
    );
}

/// Walk up from `start`'s parent until we find a directory whose
/// `Cargo.toml` declares a `[workspace]` table.
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
