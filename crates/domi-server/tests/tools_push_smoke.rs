//! Gated end-to-end tests for the `domi push` subcommand.
//!
//! Run with `cargo test -p domi-server -- --ignored tools_push_smoke`.
//!
//! These tests address Phase 2d Task 3's "no live integration test for
//! `domi push`" risk by exercising the real `domi` binary against the
//! real `domi-server` HTTP endpoint (`POST /api/events`).
//!
//! Each test that boots a server spawns it via the helpers in
//! `tests/common/mod.rs` on a high random port, polls `/healthz` until
//! the server is ready, then runs `domi push ...` and asserts the
//! exit code + (where applicable) stdout/stderr.
//!
//! Why gated: every test either binds a real TCP port or attempts a
//! connect that the kernel will refuse. Running them by default would
//! either flake under load or collide with other suites.

mod common;

use common::{boot_server, free_high_port, run_domi};
// `assert_exit!` is `#[macro_export]`-ed from `common/mod.rs`, so it
// reaches the integration-test crate root automatically — no `use`
// needed in this file; call it directly as `assert_exit!(...)`.
use std::time::{Duration, Instant};

// ----------------------------------------------------------------------------
// Test 1: happy path — server returns 204 → exit 0, stdout empty
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn push_204_returns_zero() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    let (stdout, stderr, code) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "click",
        "--doc",
        "synthetic",
    ]);

    assert_exit!(0, code, stdout, stderr, "push_204_returns_zero");
    assert!(
        stdout.trim().is_empty(),
        "expected empty stdout on 204, got: {stdout:?}"
    );

    let _ = child.kill().await;
}

// ----------------------------------------------------------------------------
// Test 2: bad type — server returns 400 schema error → exit 2
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn push_bad_type_returns_two() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    let (stdout, stderr, code) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "bogus",
        "--doc",
        "synthetic",
    ]);

    assert_exit!(2, code, stdout, stderr, "push_bad_type_returns_two");
    // Server should have returned 400 (kind "bogus" not in enum).
    assert!(
        stderr.contains("400") || stderr.to_lowercase().contains("bad request"),
        "expected stderr to mention 400/bad request, got: {stderr:?}"
    );

    let _ = child.kill().await;
}

// ----------------------------------------------------------------------------
// Test 3: unreachable — connect to a port nothing's listening on → exit 1
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn push_unreachable_returns_one() {
    // Pick a port that almost certainly isn't bound. free_high_port()
    // hands us a free one, but we never spawn a server on it.
    let port = free_high_port();
    let server_url = format!("http://127.0.0.1:{port}");

    // Brief settle so the kernel can recycle the port we just released
    // before another concurrent gated test (e.g. replay_unreachable)
    // races us. Without this, two tests in the same binary can briefly
    // see the same ephemeral port and one will spuriously succeed
    // against a sibling-test's server.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let start = Instant::now();
    let (stdout, stderr, code) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "click",
        "--doc",
        "synthetic",
    ]);
    let elapsed = start.elapsed();

    assert_exit!(1, code, stdout, stderr, "push_unreachable_returns_one");
    assert!(
        elapsed < Duration::from_secs(5),
        "expected to fail fast (<5s) on unreachable, took {elapsed:?}"
    );
    // reqwest's connect error should appear somewhere in stderr.
    assert!(
        !stderr.trim().is_empty(),
        "expected stderr to explain the failure, got empty"
    );
}

// ----------------------------------------------------------------------------
// Test 4: --json override — verbatim pass-through with a valid body → exit 0
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn push_json_override() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    // Wire-protocol-conformant body. The brief sketches
    //   {"type":"click","payload":{},...}
    // but the actual Rust `Event` struct (the source of truth, see
    // AGENTS.md "Cross-language drift") expects `kind` + `data`
    // (kind-specific) + `target` as an object + `src`. We send a body
    // matching `event.schema.json` exactly so the server returns 204.
    //
    // Note: Task 2 froze `--type` as a required flag (clap derives a
    // bare `String` field). When `--json` is provided the value is
    // ignored client-side — `--type` is just there to satisfy clap.
    let json_body = r#"{
        "v": 2,
        "id": null,
        "src": "domi.js",
        "kind": "click",
        "doc": "synthetic",
        "target": {
            "id": "button.ok",
            "selector": null,
            "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
        },
        "data": {"value": "ok"}
    }"#;

    let (stdout, stderr, code) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "ignored", // required by clap; ignored when --json is set
        "--json",
        json_body,
    ]);

    assert_exit!(0, code, stdout, stderr, "push_json_override");
    assert!(
        stdout.trim().is_empty(),
        "expected empty stdout on 204, got: {stdout:?}"
    );

    // Verify it landed on the server via GET /api/events.
    let url = format!("http://127.0.0.1:{port}/api/events?doc=synthetic");
    let resp = reqwest::get(&url).await.expect("get events");
    assert!(resp.status().is_success(), "GET /api/events failed");
    let body: serde_json::Value = resp.json().await.expect("json body");
    let events = body["events"].as_array().expect("events array");
    assert_eq!(events.len(), 1, "expected 1 event, got {}", events.len());
    assert_eq!(events[0]["doc"], "synthetic");
    assert_eq!(events[0]["kind"], "click");
    assert_eq!(events[0]["target"]["id"], "button.ok");

    let _ = child.kill().await;
}
