//! Embedded server-side shim. Build script reads `scripts/domi-server.js`
//! at compile time and produces `SHIM_BYTES` (the raw bytes) and
//! `SHIM_BYTES_LEN` (length) so `serve_file` can inject without runtime I/O.

include!(concat!(env!("OUT_DIR"), "/shim_token.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shim_contains_marker() {
        // Sanity: the embedded bytes actually contain the marker line.
        let s = std::str::from_utf8(SHIM_BYTES).expect("shim is utf-8");
        assert!(
            s.contains("window.__DOMI_SERVER__"),
            "embedded shim is missing the __DOMI_SERVER__ marker"
        );
    }

    #[test]
    fn shim_uses_same_origin_ws_url() {
        let s = std::str::from_utf8(SHIM_BYTES).unwrap();
        assert!(s.contains("location.host"), "shim must derive WS URL from location.host");
        assert!(s.contains("/ws/events"));
        assert!(!s.contains("127.0.0.1"), "shim must not hardcode a host");
    }

    #[test]
    fn shim_under_2kb_safety_margin() {
        assert!(SHIM_BYTES.len() <= 2048);
    }
}
