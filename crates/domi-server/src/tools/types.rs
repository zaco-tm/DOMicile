//! Shared types and constants for the `domi` CLI subcommands.
//!
//! Task 1 ships this as a minimal placeholder so the `cli.rs` clap derive can
//! reference the same shared `default-server` constant. Tasks 2-5 will extend
//! it with URL parsing helpers, response types, and shared error reporting.

use url::Url;

/// Default server URL when `--server` is not provided.
///
/// Matches the 2c-γ server's default bind of `127.0.0.1:4173`.
pub const DEFAULT_SERVER: &str = "http://127.0.0.1:4173";

/// Parse a user-supplied server URL, falling back to [`DEFAULT_SERVER`] on
/// empty input.
///
/// Returns `Err(String)` with a human-readable message on parse failure —
/// `cli.rs` converts that into a clap-style error and exit code `2`.
pub fn parse_server(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Url::parse(DEFAULT_SERVER).map_err(|e| e.to_string());
    }
    Url::parse(trimmed).map_err(|e| format!("invalid --server URL {trimmed:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_server_is_local_4173() {
        let u = Url::parse(DEFAULT_SERVER).unwrap();
        assert_eq!(u.scheme(), "http");
        assert_eq!(u.host_str(), Some("127.0.0.1"));
        assert_eq!(u.port(), Some(4173));
    }

    #[test]
    fn empty_input_falls_back_to_default() {
        let u = parse_server("").unwrap();
        // `Url` normalizes by appending a trailing `/` when serializing.
        assert_eq!(u.as_str(), format!("{DEFAULT_SERVER}/"));
    }

    #[test]
    fn valid_url_round_trips() {
        let u = parse_server("https://example.com:9000/").unwrap();
        assert_eq!(u.scheme(), "https");
        assert_eq!(u.host_str(), Some("example.com"));
        assert_eq!(u.port(), Some(9000));
    }

    #[test]
    fn invalid_url_returns_err() {
        assert!(parse_server("not a url").is_err());
    }
}
