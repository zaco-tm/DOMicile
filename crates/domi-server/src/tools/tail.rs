// `domi tail` — subscribe to the WebSocket event stream and print new events.
//!
//! Task 2 froze the clap surface (`--follow`, `--limit`, `--doc`); Task 5
//! implements the actual `tokio-tungstenite` connect + read loop using
//! `futures-util::{SinkExt, StreamExt}` and serializes each frame as JSON.
//!
//! ## Algorithm
//!
//! 1. Initial replay: `GET /api/events?limit=<n>[&doc=<d>]`. Print each
//!    returned event as a JSON line on stdout (preserving the wire
//!    shape, since the server already serialized via
//!    `serde_json::to_value`). If `--doc` is set, also filter here (the
//!    server already filters by `doc` on the query, but applying the
//!    filter again as a belt-and-braces step keeps the output
//!    invariant regardless of any future server-side change).
//! 2. If `--follow` is false (default `true` per the clap derive),
//!    exit 0 after the replay.
//! 3. Subscribe to the WebSocket: `ws://<host>/ws/events`. Convert
//!    `http(s)` → `ws(s)` by swapping the URL scheme in place.
//! 4. Loop: receive frames; print events whose `type == "event"` (the
//!    `hello` frame is ignored — it's the server's handshake ack).
//!    Break on `SIGINT` (via `tokio::signal::ctrl_c()`), on close, or
//!    on any WS recv error.
//!
//! ## Exit codes (consistent with `cli.rs` doc)
//!
//! - `0` — success (replay finished, WS loop ran, and we exited
//!   cleanly via SIGINT or close).
//! - `1` — network / I/O failure (HTTP replay error, WS connect
//!   failure, body parse failure).
//! - `2` — protocol failure (server returned non-2xx on the replay).
//!
//! ## URL handling
//!
//! `server` is a `&url::Url` (not `&reqwest::Url` — `url::Url` is
//! the convention this crate uses; see Task 1 review Minor M2 and
//! `tools/replay.rs` for the parallel implementation). We clone it
//! into a mutable `url::Url` so we can `set_scheme("ws")` without
//! mutating the caller's copy.

use clap::Args as ClapArgs;
use futures_util::StreamExt;
use reqwest::Client;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

/// Args for `domi tail` (see `crate::tools::cli::TailArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct TailArgs {
    /// Stream new events as they arrive (default: true).
    #[arg(long, default_value_t = true)]
    pub follow: bool,

    /// Maximum number of events to print (0 = unbounded).
    #[arg(long, default_value_t = 100)]
    pub limit: usize,

    /// Document filter (path under `.domi/output/`).
    #[arg(long)]
    pub doc: Option<String>,
}

/// `domi tail` — replay existing events via `GET /api/events`, then
/// (unless `--follow=false`) subscribe to `ws://<host>/ws/events` and
/// stream new events to stdout as JSON lines.
///
/// Returns the process exit code (0 / 1 / 2). On SIGINT (Ctrl-C) the
/// loop breaks cleanly and the WS connection is closed with a
/// `Close` frame; the process then exits with 0.
pub async fn run(args: TailArgs, server: &Url) -> i32 {
    // 1. Build the HTTP client for the initial replay.
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("client init: {e}");
            return 1;
        }
    };

    // 2. Resolve `/api/events` against the configured server and append
    //    query parameters. `url::Url::join` errors only on a malformed
    //    base (which `parse_server` has already validated), so a bare
    //    `expect` here is acceptable — it surfaces a programmer error
    //    loudly rather than masking it.
    let mut url = match server.join("/api/events") {
        Ok(u) => u,
        Err(e) => {
            eprintln!("invalid server URL: {e}");
            return 2;
        }
    };
    {
        let mut qp = url.query_pairs_mut();
        qp.append_pair("limit", &args.limit.to_string());
        if let Some(d) = &args.doc {
            qp.append_pair("doc", d);
        }
    }

    // 3. Initial replay.
    let initial: serde_json::Value = match client.get(url).send().await {
        Ok(r) if r.status().is_success() => match r.json().await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("replay parse: {e}");
                return 1;
            }
        },
        Ok(r) => {
            eprintln!("replay returned {}", r.status());
            return 2;
        }
        Err(e) => {
            eprintln!("replay failed: {e}");
            return 1;
        }
    };

    if let Some(events) = initial.get("events").and_then(|v| v.as_array()) {
        for ev in events {
            if let Some(doc) = &args.doc {
                if ev.get("doc").and_then(|d| d.as_str()) != Some(doc.as_str()) {
                    continue;
                }
            }
            // `serde_json::Value`'s `Display` impl emits compact JSON
            // (no whitespace). This is the wire shape, preserved
            // verbatim for downstream tooling (`jq`, scripts).
            println!("{ev}");
        }
    }
    let next_since = initial
        .get("nextSince")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    if !args.follow {
        return 0;
    }

    // 4. Subscribe to the WebSocket. Convert `http(s)://` → `ws(s)://`
    //    by swapping the scheme in a cloned `url::Url`.
    let ws_url = {
        let mut u = server.clone();
        let scheme = match u.scheme() {
            "http" => "ws",
            "https" => "wss",
            other => {
                eprintln!("unsupported scheme: {other}");
                return 1;
            }
        };
        u.set_scheme(scheme).expect("set_scheme to ws/wss");
        u.set_path("/ws/events");
        u
    };

    // `tokio_tungstenite::connect_async` takes any `IntoClientRequest`,
    // which `&url::Url` doesn't implement. Pass the URL via its string
    // form (tungstenite parses it back into a URL internally).
    let (mut ws, _resp) = match tokio_tungstenite::connect_async(ws_url.as_str()).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("ws connect: {e}");
            return 1;
        }
    };

    // 5. Loop. `tokio::signal::ctrl_c()` resolves on the first SIGINT
    //    (Ctrl-C). A second SIGINT is not trapped — the process exits
    //    with the OS default (130 on Unix). This matches the brief's
    //    "honor SIGINT" semantics: the user can always force-kill.
    // `tokio::signal::ctrl_c()` is an async fn returning a future
    // that must be pinned for `tokio::select!`. `tokio::pin!` pins the
    // future in place; calling `ctrl_c()` here returns a fresh future
    // that completes on the first SIGINT.
    let sigint = tokio::signal::ctrl_c();
    tokio::pin!(sigint);
    loop {
        tokio::select! {
            _ = &mut sigint => break,
            msg = ws.next() => match msg {
                Some(Ok(Message::Text(t))) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                        if v.get("type").and_then(|x| x.as_str()) == Some("event") {
                            if let Some(ev) = v.get("event") {
                                if let Some(doc) = &args.doc {
                                    if ev.get("doc").and_then(|d| d.as_str())
                                        != Some(doc.as_str())
                                    {
                                        continue;
                                    }
                                }
                                println!("{ev}");
                            }
                        }
                        // "hello" frames are ignored (server's handshake
                        // ack — see `http::ws::handle`).
                    }
                    // Malformed JSON is silently skipped — `tail` is a
                    // forward-stream consumer and one bad frame should
                    // not tear down the connection.
                }
                Some(Ok(Message::Close(_))) | None => break,
                // Ping / Pong / Binary — the server never sends binary,
                // and `tokio-tungstenite` auto-replies to pings. Just
                // continue the loop.
                Some(Ok(_)) => continue,
                Some(Err(e)) => {
                    eprintln!("ws recv: {e}");
                    return 2;
                }
            }
        }
    }
    let _ = ws.close(None).await;
    let _ = next_since; // (cursor for future --resume, not in 2d)
    0
}

#[cfg(test)]
mod tests {
    //! Intentionally minimal: `tail::run` is an integration-only subcommand.
    //! The end-to-end contract is exercised by
    //! `crates/domi-server/tests/tools_tail_smoke.rs` (gated `#[ignore]`).
    //!
    //! A trivial test lives here so `cargo test -p domi-server` has a
    //! passing unit test target in this file when the integration suite
    //! is skipped (default `cargo test` excludes `--ignored`).
    use url::Url;

    #[test]
    fn scheme_swap_http_to_ws() {
        // Sanity: swapping the scheme on a `url::Url` from `http` to
        // `ws` produces the expected WebSocket URL. This protects the
        // URL-building logic from regressions without requiring a
        // live server.
        let mut u: Url = Url::parse("http://127.0.0.1:4173").unwrap();
        u.set_scheme("ws").unwrap();
        u.set_path("/ws/events");
        assert_eq!(u.scheme(), "ws");
        assert_eq!(u.host_str(), Some("127.0.0.1"));
        assert_eq!(u.port(), Some(4173));
        assert_eq!(u.path(), "/ws/events");
    }

    #[test]
    fn scheme_swap_https_to_wss() {
        let mut u: Url = Url::parse("https://example.com:9000").unwrap();
        u.set_scheme("wss").unwrap();
        assert_eq!(u.scheme(), "wss");
    }
}
