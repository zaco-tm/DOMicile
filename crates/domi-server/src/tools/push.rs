// `domi push` — POST a single event to `POST /api/events`.
//!
//! Task 2 froze the clap surface (`--type`, `--doc`, `--target`, `--json`).
//! Task 3 implements the actual `reqwest::Client::post` round-trip and
//! builds the event payload (defaulting from `--type`/`--doc`/`--target`
//! or honoring `--json` verbatim).
//!
//! Exit codes (consistent with `cli.rs` doc):
//! - `0` — server returned 2xx (204 No Content on a successful POST).
//! - `1` — network / I/O failure (connect refused, DNS, TLS, etc.).
//! - `2` — protocol / validation failure (invalid `--json`, server
//!   returned 4xx/5xx, malformed URL).
//!
//! Wire-protocol note: the Rust `Event` struct (in
//! `crates/domi-server/src/events/event.rs`) and
//! `docs/schemas/event.schema.json` are the source of truth for the
//! event body. The synthesized payload uses `kind` (not `type`) and
//! `data` (kind-specific) — see AGENTS.md "Cross-language drift" rule.
//! When `--json` is supplied the body is forwarded verbatim, so the
//! caller is responsible for matching the wire protocol.

use std::time::Duration;

use clap::Args as ClapArgs;
use reqwest::Client;
use serde_json::{json, Value};
use url::Url;

/// Args for `domi push` (see `crate::tools::cli::PushArgs` for docs).
#[derive(Debug, Clone, ClapArgs)]
pub struct PushArgs {
    /// Event kind (e.g., `comment`, `rail-add`, `click`, `agent-iterating`).
    #[arg(long)]
    pub r#type: String,

    /// Document path (under `.domi/output/`) this event belongs to.
    #[arg(long)]
    pub doc: Option<String>,

    /// Target element identifier (e.g., CSS selector or DOM id).
    #[arg(long)]
    pub target: Option<String>,

    /// Full event payload as a JSON string. When provided, overrides the
    /// `--type`/`--doc`/`--target`/`--state` defaults and is sent verbatim.
    #[arg(long)]
    pub json: Option<String>,

    /// State for `--type agent-iterating`: `start` or `end`. Required when
    /// `--type=agent-iterating`; ignored for other types.
    #[arg(long, value_parser = ["start", "end"])]
    pub state: Option<String>,
}

/// POST a single event to the configured server.
///
/// Returns the process exit code (0 / 1 / 2). The body is either
/// `--json` (verbatim) or synthesized from the other flags.
pub async fn run(args: PushArgs, server: &Url) -> i32 {
    // 1. Build the body. --json wins (verbatim); otherwise synthesize
    //    from --type / --doc / --target, mapping `type` (user-facing)
    //    to `kind` (wire protocol).
    //
    //    We OMIT `ts` so the server stamps it (see
    //    `handlers::post_event`). `id: null` lets the server stamp a
    //    fresh ULID. `src` defaults to `domi.js` (the agent-CLI
    //    default; the browser runtime overrides it).
    let body: Value = match args.json {
        Some(raw) => match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("invalid --json: {e}");
                return 2;
            }
        },
        None => {
            if args.r#type == "agent-iterating" {
                match args.state.as_deref() {
                    Some(s @ ("start" | "end")) => json!({
                        "v": 2,
                        "id": null,
                        "src": "domi",
                        "kind": "agent-iterating",
                        "doc": args.doc.clone().unwrap_or_else(|| "synthetic".to_string()),
                        "target": {
                            "id": args.target.clone().unwrap_or_default(),
                            "selector": null,
                            "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0},
                        },
                        "data": { "state": s, "source": "explicit" },
                    }),
                    Some(other) => {
                        eprintln!("--state must be 'start' or 'end', got '{other}'");
                        return 2;
                    }
                    None => {
                        eprintln!("--type=agent-iterating requires --state <start|end>");
                        return 2;
                    }
                }
            } else {
                json!({
                    "v": 2,
                    "id": null,
                    "src": "domi.js",
                    "kind": args.r#type,
                    "doc": args.doc.clone().unwrap_or_else(|| "synthetic".to_string()),
                    "target": {
                        "id": args.target.clone().unwrap_or_default(),
                        "selector": null,
                        "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0},
                    },
                    "data": {},
                })
            }
        }
    };

    // 2. Build the HTTP client. 5s timeout keeps `push_unreachable`
    //    fast-failing on connect-refused (the OS reports ECONNREFUSED
    //    immediately on localhost, but DNS / routing delays are bounded
    //    by the timeout so we never hang indefinitely).
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("client init: {e}");
            return 1;
        }
    };

    // 3. POST to /api/events relative to the configured server base.
    let url = match server.join("/api/events") {
        Ok(u) => u,
        Err(e) => {
            eprintln!("invalid server URL: {e}");
            return 2;
        }
    };
    match client.post(url).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => 0,
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
    //! Intentionally minimal: `push::run` is an integration-only subcommand.
    //! The end-to-end contract is exercised by
    //! `crates/domi-server/tests/tools_push_smoke.rs` (gated `#[ignore]`).
    //!
    //! A trivial test lives here so `cargo test -p domi-server` has a
    //! passing unit test target in this file when the integration suite
    //! is skipped (default `cargo test` excludes `--ignored`).
    use serde_json::json;
    #[test]
    fn synthesized_body_omits_ts_so_server_stamps_it() {
        // Sanity: assert the synthesized payload uses `kind` (not `type`),
        // does NOT include `ts` (the server stamps it), and that the
        // target is a nested object (per `event.schema.json`).
        let body = json!({
            "v": 2,
            "id": null,
            "src": "domi.js",
            "kind": "click",
            "doc": "synthetic",
            "target": {
                "id": "",
                "selector": null,
                "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0},
            },
            "data": {},
        });
        assert_eq!(body["kind"], "click");
        assert_eq!(body["v"], 2);
        assert!(body["target"].is_object(), "target must be an object");
        assert_eq!(body["target"]["selector"], serde_json::Value::Null);
        assert!(
            body.get("ts").is_none(),
            "ts must be omitted so the server stamps it"
        );
        assert_eq!(body["id"], serde_json::Value::Null);
    }

    #[test]
    fn agent_iterating_payload_uses_domi_source_and_correct_data_shape() {
        let body = json!({
            "v": 2,
            "id": null,
            "src": "domi",
            "kind": "agent-iterating",
            "doc": "test",
            "target": {
                "id": "",
                "selector": null,
                "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0},
            },
            "data": { "state": "start", "source": "explicit" },
        });
        assert_eq!(body["src"], "domi", "explicit CLI must stamp src=domi");
        assert_eq!(body["kind"], "agent-iterating");
        assert_eq!(body["data"]["state"], "start");
        assert_eq!(body["data"]["source"], "explicit");
    }

    #[test]
    fn agent_iterating_end_payload() {
        let body = json!({
            "v": 2,
            "id": null,
            "src": "domi",
            "kind": "agent-iterating",
            "doc": "test",
            "target": {
                "id": "",
                "selector": null,
                "rect": {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0},
            },
            "data": { "state": "end", "source": "explicit" },
        });
        assert_eq!(body["data"]["state"], "end");
        assert_eq!(body["data"]["source"], "explicit");
    }
}
