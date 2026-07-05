use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().and_then(|p| p.parent()).expect("workspace root");
    let shim_path = repo_root.join("scripts").join("domi-server.js");
    println!("cargo:rerun-if-changed={}", shim_path.display());

    let bytes = std::fs::read(&shim_path).unwrap_or_else(|e| {
        panic!(
            "domi-server.js shim not found at {}: {e}. \
             The Rust crate embeds the JS shim at compile time; \
             the file must live at <repo>/scripts/domi-server.js.",
            shim_path.display()
        )
    });

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let declared_len = bytes.len();
    std::fs::write(
        out_dir.join("shim_length.rs"),
        format!("pub const SHIM_BYTES_LEN: usize = {declared_len};\n"),
    )
    .expect("write shim_length.rs");

    std::fs::write(
        out_dir.join("shim_token.rs"),
        format!("pub const SHIM_BYTES: &[u8] = include_bytes!(\"{}\");\n", shim_path.display()),
    )
    .expect("write shim_token.rs");
}
