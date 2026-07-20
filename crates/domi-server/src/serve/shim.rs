//! Embedded server-side shims. Build script reads `scripts/runtime/*.js`
//! at compile time and produces `SHIM_BYTES` (the WS-bridge shim) and
//! `STATUS_SHIM_BYTES` (the iter-status modal shim), so `serve_file` can
//! inject without runtime I/O.

include!(concat!(env!("OUT_DIR"), "/shim_token.rs"));
include!(concat!(env!("OUT_DIR"), "/status_shim_token.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shim_contains_marker() {
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

    #[test]
    fn status_shim_subscribes_to_agent_iterating_events() {
        let s = std::str::from_utf8(STATUS_SHIM_BYTES).expect("status shim is utf-8");
        assert!(s.contains("agent-iterating"), "status shim must filter agent-iterating events");
        assert!(s.contains("domi-event"), "status shim must listen on domi-event");
        assert!(s.contains("Iterating"), "status shim must render the Iterating label");
    }

    #[test]
    fn status_shim_is_nontrivial() {
        assert!(STATUS_SHIM_BYTES.len() > 500, "status shim should include the modal + chip logic");
    }
}
