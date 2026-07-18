use std::env;
use std::path::PathBuf;

fn main() {
    // CARGO_MANIFEST_DIR is read at runtime (not via `env!()`) so that the
    // resolved path always reflects the current build location. Reading it
    // at compile time would bake the path into the build-script binary,
    // which cargo then reuses after a workspace rename or move.
    println!("cargo:rerun-if-env-changed=CARGO_MANIFEST_DIR");

    let manifest_dir = PathBuf::from(
        env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo for build scripts"),
    );

    // The shim ships with the crate (crates/domi-server/scripts/runtime/domi-server.js)
    // so it works both in a workspace clone AND when installed from crates.io
    // (where the workspace root doesn't exist).
    let shim_path = manifest_dir
        .join("scripts")
        .join("runtime")
        .join("domi-server.js");

    if !shim_path.is_file() {
        // Dev-time fallback: workspace layout. Only used when the in-crate
        // copy is missing (e.g., if a maintainer deleted it locally).
        let workspace_root = find_workspace_root(&manifest_dir).unwrap_or_else(|| {
            panic!(
                "domi-server.js shim not found at {} and no DOMicile workspace \
                 root is reachable. The crate ships its own copy at \
                 crates/domi-server/scripts/runtime/domi-server.js; if you deleted \
                 it, restore it from the repo or reinstall the crate.",
                shim_path.display()
            )
        });
        let fallback = workspace_root
            .join("scripts")
            .join("runtime")
            .join("domi-server.js");
        if fallback.is_file() {
            println!(
                "cargo:warning=domi-server.js missing from crate ({}); using \
                 dev fallback {}. The published crate ships a copy of the shim \
                 so this warning is harmless outside the workspace.",
                shim_path.display(),
                fallback.display()
            );
        } else {
            panic!(
                "domi-server.js shim not found at {} or {}",
                shim_path.display(),
                fallback.display()
            );
        }
    }
    println!("cargo:rerun-if-changed={}", shim_path.display());

    let bytes = std::fs::read(&shim_path).unwrap_or_else(|e| {
        panic!(
            "domi-server.js shim not readable at {}: {e}",
            shim_path.display()
        )
    });

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    let declared_len = bytes.len();
    std::fs::write(
        out_dir.join("shim_length.rs"),
        format!("pub const SHIM_BYTES_LEN: usize = {declared_len};\n"),
    )
    .expect("write shim_length.rs");

    std::fs::write(
        out_dir.join("shim_token.rs"),
        format!(
            "pub const SHIM_BYTES: &[u8] = include_bytes!(r\"{}\");\n",
            // Force forward slashes so the path is valid in a Rust string
            // literal on every platform. On Windows, Path::display() yields
            // backslashes (`D:\a\...`) that would need escaping; using a
            // raw string + forward slashes is simpler and portable.
            shim_path.to_string_lossy().replace('\\', "/")
        ),
    )
    .expect("write shim_token.rs");
}

/// Walk up from `start`'s parent until we find a directory that contains a
/// `Cargo.toml` declaring a `[workspace]` table. `start` itself is the crate
/// directory (always contains a Cargo.toml, but without `[workspace]`),
/// so the search must skip it.
fn find_workspace_root(start: &std::path::Path) -> Option<PathBuf> {
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

fn has_workspace_table(manifest: &std::path::Path) -> bool {
    std::fs::read_to_string(manifest)
        .map(|s| s.contains("[workspace]"))
        .unwrap_or(false)
}