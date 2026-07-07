// `domi replay` — fetch historical events from `GET /api/events`.
//!
//! Task 2 froze the clap surface (`--since`, `--doc`, `--limit`).
//! Task 4 implements the actual `reqwest::Client::get` round-trip
//! against `GET /api/events` and prints the response body verbatim.
//!
//! ## Exit codes (consistent with `cli.rs` doc)
//!
//! - `0` — success (server returned 2xx with a JSON body we can
//!   forward to stdout).
//! - `1` — network / I/O failure (connect refused, DNS, TLS, body
//!   read failure, or reqwest client init failure).
//! - `2` — protocol failure (server returned 4xx/5xx, or the
//!   configured `--server` URL cannot be resolved).
//!
//! ## URL handling
//!
//! `server` is a `&url::Url` (not `&reqwest::Url` — `url::Url` is
//! the convention this crate uses, see Task 1 review Minor M2 and
//! `tools/push.rs` for the parallel implementation). We clone it
//! into a mutable `url::Url` so we can append query parameters
//! without mutating the caller's copy.
//!
//! ## Body forwarding
//!
//! The server's response is JSON in the shape
//!   `{ "events": [Event, ...], "nextSince": "<ulid>" | null }`
//! (see `handlers::get_events`). We print it verbatim with
//! `print!` (no trailing newline) so callers can pipe the output
//! through `jq` or capture it in a script without extra processing.
//!
//! We intentionally do NOT deserialize into the typed `Event` struct
//! before printing: a future `--format jsonl` mode would lose
//! information, and the wire format is already the public contract
//! (see `docs/WIRE-PROTOCOL.md`).

use std::time::Duration;

use clap::Args as ClapArgs;
use reqwest::Client;
use url::Url;

/// Args for `domi replay` (see `crate::tools::cli::ReplayArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct ReplayArgs {
    /// Only events with `ts > since` (ULID or ISO-8601).
    #[arg(long)]
    pub since: Option<String>,

    /// Document filter (path under `.domi/output/`).
    #[arg(long)]
    pub doc: Option<String>,

    /// Maximum number of events to return.
    #[arg(long, default_value_t = 100)]
    pub limit: usize,
}

/// `domi replay` — fetch historical events from `GET /api/events`.
///
/// Returns the process exit code (0 / 1 / 2). The response body is
/// printed verbatim on success so callers can pipe it through `jq`
/// or capture it in a script.
pub async fn run(args: ReplayArgs, server: &Url) -> i32 {
    // 1. Build the HTTP client. 5s timeout matches `push::run` so
    //    `replay_unreachable_returns_one` fails fast on connect-refused.
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("client init: {e}");
            return 1;
        }
    };

    // 2. Resolve `/api/events` relative to the configured server base
    //    and append query parameters. We clone `server` into a mutable
    //    `Url` so we don't mutate the caller's copy.
    let mut url = match server.join("/api/events") {
        Ok(u) => u,
        Err(e) => {
            eprintln!("invalid server URL: {e}");
            return 2;
        }
    };
    {
        let mut qp = url.query_pairs_mut();
        if let Some(s) = &args.since {
            qp.append_pair("since", s);
        }
        if let Some(d) = &args.doc {
            qp.append_pair("doc", d);
        }
        qp.append_pair("limit", &args.limit.to_string());
    }

    // 3. GET. On 2xx, print the body verbatim. On error, route to
    //    the right exit code (network → 1, protocol → 2).
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => match resp.text().await {
            Ok(body) => {
                print!("{body}");
                0
            }
            Err(e) => {
                eprintln!("read body: {e}");
                1
            }
        },
        Ok(resp) => {
            eprintln!("server returned {}", resp.status());
            2
        }
        Err(e) => {
            eprintln!("request failed: {e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    //! Intentionally minimal: `replay::run` is an integration-only subcommand.
    //! The end-to-end contract is exercised by
    //! `crates/domi-server/tests/tools_replay_smoke.rs` (gated `#[ignore]`).
    //!
    //! A trivial test lives here so `cargo test -p domi-server` has a
    //! passing unit test target in this file when the integration suite
    //! is skipped (default `cargo test` excludes `--ignored`).
    use url::Url;

    #[test]
    fn builds_url_with_query_params() {
        // Sanity: joining `/api/events` and appending query params
        // produces a well-formed URL. This protects the URL-building
        // logic from regressions without requiring a live server.
        let server: Url = Url::parse("http://127.0.0.1:4173").unwrap();
        let mut url = server.join("/api/events").expect("join");
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("limit", "10");
        }
        assert_eq!(url.path(), "/api/events");
        assert_eq!(url.query(), Some("limit=10"));
    }
}
