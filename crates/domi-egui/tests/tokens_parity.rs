use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

#[test]
fn tokens_parity_with_source_json() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let path = Path::new(manifest_dir).join("../../tokens/tokens.json");
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
