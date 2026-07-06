//! Gated end-to-end tests for the `domi replay` subcommand.
//!
//! Run with `cargo test -p domi-server -- --ignored tools_replay_smoke`.
//!
//! These tests address Phase 2d Task 4's "no live integration test for
//! `domi replay`" risk by exercising the real `domi` binary against
//! the real `domi-server` HTTP endpoint (`GET /api/events`).
//!
//! Each test that boots a server spawns it via the helpers in
//! `tests/common/mod.rs` (extracted from `tools_push_smoke.rs` in
//! Task 4 — Tasks 3, 4, and 5 will share these helpers).
//!
//! Wire-protocol note: the server's response shape is
//!   { "events": [...], "nextSince": "<ulid>" | null }
//! (see `handlers::get_events`). `nextSince` is the highest `id`
//! ULID across the returned batch — `null` when the store is empty.
//!
//! Why gated: every test either binds a real TCP port or attempts a
//! connect that the kernel will refuse. Running them by default would
//! either flake under load or collide with other suites.

mod common;

use common::{boot_server, free_high_port, run_domi};
// `assert_exit!` is `#[macro_export]`-ed from `common/mod.rs`, so it
// reaches the integration-test crate root automatically — no `use`
// needed in this file; call it directly as `assert_exit!(...)`.
use serde_json::Value;
use std::time::{Duration, Instant};

// Crockford base-32 alphabet minus the four excluded letters (I, L, O, U).
// Used by the round-trip test to assert the server's stamped ULID is
// well-formed without depending on the time-varying timestamp prefix.
fn is_crockford_base32(c: char) -> bool {
    matches!(c, '0'..='9' | 'A'..='Z') && c != 'I' && c != 'L' && c != 'O' && c != 'U'
}

// ----------------------------------------------------------------------------
// Test 1: empty store — replay exits 0, body parses as JSON with empty
// `events` array and `nextSince: null`.
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn replay_empty_returns_zero_with_empty_array() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    let (stdout, stderr, code) = run_domi(&["--server", &server_url, "replay"]);

    assert_exit!(
        0,
        code,
        stdout,
        stderr,
        "replay_empty_returns_zero_with_empty_array"
    );

    // Body must be valid JSON with the expected shape.
    let body: Value = serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("stdout not valid JSON: {e}\nstdout was: {stdout:?}"));
    assert!(
        body["events"].is_array(),
        "expected `events` to be a JSON array, got body: {body}"
    );
    assert_eq!(
        body["events"].as_array().unwrap().len(),
        0,
        "expected empty events array, got body: {body}"
    );
    // Server returns `nextSince: null` when the store is empty
    // (see handlers::get_events — empty file branch).
    assert!(
        body["nextSince"].is_null(),
        "expected `nextSince` to be null on empty store, got body: {body}"
    );

    let _ = child.kill().await;
}

// ----------------------------------------------------------------------------
// Test 2: round-trip — POST a click via `domi push --json`, then
// `domi replay` prints a JSON body containing that event with a
// non-null ULID `id`.
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn replay_round_trips_one_event() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    // Use --json so we control the wire shape exactly (the server
    // stamps `id` and `ts` if null/missing — see handlers::post_event).
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

    // Push first; assert it succeeded so the replay assertion is meaningful.
    let (push_stdout, push_stderr, push_code) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "ignored", // required by clap; ignored when --json is set
        "--json",
        json_body,
    ]);
    assert_exit!(
        0,
        push_code,
        push_stdout,
        push_stderr,
        "push (round_trips_one_event)"
    );

    // Now replay. Stdout is `{"events":[...], "nextSince":"<ulid>"}`
    // with NO trailing newline (replay uses `print!`, not `println!`).
    let (stdout, stderr, code) = run_domi(&["--server", &server_url, "replay"]);
    assert_exit!(0, code, stdout, stderr, "replay_round_trips_one_event");

    let body: Value = serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("stdout not valid JSON: {e}\nstdout was: {stdout:?}"));
    let events = body["events"]
        .as_array()
        .expect("`events` must be an array");
    assert_eq!(
        events.len(),
        1,
        "expected exactly 1 event, got {} (body: {body})",
        events.len()
    );

    let ev = &events[0];
    // Server must have stamped a non-null ULID id.
    let id = ev["id"]
        .as_str()
        .unwrap_or_else(|| panic!("event `id` must be a non-null string, got event: {ev}"));
    assert_eq!(
        id.len(),
        26,
        "expected ULID id to be 26 chars (Crockford base32), got {id:?}"
    );
    // ULIDs are Crockford base32 — no I/L/O/U, and the first 10 chars
    // encode a millisecond timestamp, so the prefix drifts over time.
    // Asserting on the alphabet (not the prefix) keeps this test stable.
    assert!(
        id.chars().all(is_crockford_base32),
        "expected ULID id to use Crockford base32 alphabet, got {id:?}"
    );
    // And parse it via the `ulid` crate (a transitive dep through
    // `domi-server`'s public API). If the server ever stops generating
    // valid ULIDs we'll know immediately.
    ulid::Ulid::from_string(id)
        .unwrap_or_else(|e| panic!("id {id:?} does not parse as a ULID: {e}"));

    // Other fields round-trip from our POST.
    assert_eq!(ev["kind"], "click");
    assert_eq!(ev["doc"], "synthetic");
    assert_eq!(ev["target"]["id"], "button.ok");
    // nextSince is the highest ULID in the batch (== our id).
    assert_eq!(body["nextSince"].as_str(), Some(id));

    let _ = child.kill().await;
}

// ----------------------------------------------------------------------------
// Test 3: --doc filter — POST two events with different doc names,
// `domi replay --doc foo` prints only the `foo` event.
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn replay_with_doc_filter_excludes_other_docs() {
    let (_tmp, port, mut child) = boot_server().await;
    let server_url = format!("http://127.0.0.1:{port}");

    // POST a "foo" event.
    let json_foo = r#"{
        "v": 2,
        "id": null,
        "src": "domi.js",
        "kind": "click",
        "doc": "foo",
        "target": {
            "id": "t-foo",
            "selector": null,
            "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
        },
        "data": {"value": "foo-event"}
    }"#;
    let (s1, e1, c1) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "ignored",
        "--json",
        json_foo,
    ]);
    assert_exit!(0, c1, s1, e1, "push foo (doc_filter)");

    // POST a "bar" event with a distinct kind so we can tell them apart.
    let json_bar = r#"{
        "v": 2,
        "id": null,
        "src": "domi.js",
        "kind": "input",
        "doc": "bar",
        "target": {
            "id": "t-bar",
            "selector": null,
            "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
        },
        "data": {"name": "k", "value": "bar-event"}
    }"#;
    let (s2, e2, c2) = run_domi(&[
        "--server",
        &server_url,
        "push",
        "--type",
        "ignored",
        "--json",
        json_bar,
    ]);
    assert_exit!(0, c2, s2, e2, "push bar (doc_filter)");

    // Replay with --doc foo — should show ONLY the foo event.
    let (stdout, stderr, code) = run_domi(&["--server", &server_url, "replay", "--doc", "foo"]);
    assert_exit!(
        0,
        code,
        stdout,
        stderr,
        "replay_with_doc_filter_excludes_other_docs"
    );

    let body: Value = serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("stdout not valid JSON: {e}\nstdout was: {stdout:?}"));
    let events = body["events"]
        .as_array()
        .expect("`events` must be an array");
    assert_eq!(
        events.len(),
        1,
        "expected exactly 1 event after --doc foo, got {} (body: {body})",
        events.len()
    );
    let ev = &events[0];
    assert_eq!(
        ev["doc"], "foo",
        "filtered event must have doc=foo, got {ev}"
    );
    assert_eq!(
        ev["kind"], "click",
        "filtered event must be the foo click, got {ev}"
    );
    assert_eq!(ev["target"]["id"], "t-foo");
    // nextSince is the only event's ULID.
    assert_eq!(body["nextSince"].as_str(), Some(ev["id"].as_str().unwrap()));

    let _ = child.kill().await;
}

// ----------------------------------------------------------------------------
// Test 4: unreachable — connect to a port nothing's listening on →
// exit 1 within 5s (the client timeout).
// ----------------------------------------------------------------------------

#[tokio::test]
#[ignore = "boots a real port; run with --ignored"]
async fn replay_unreachable_returns_one() {
    // Pick a port that almost certainly isn't bound. free_high_port()
    // hands us a free one, but we never spawn a server on it.
    let port = free_high_port();
    let server_url = format!("http://127.0.0.1:{port}");

    // Brief settle so the kernel can recycle the port we just released
    // before another concurrent gated test (e.g. push_unreachable)
    // races us. Without this, two tests in the same binary can briefly
    // see the same ephemeral port and one will spuriously succeed
    // against a sibling-test's server.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let start = Instant::now();
    let (stdout, stderr, code) = run_domi(&["--server", &server_url, "replay"]);
    let elapsed = start.elapsed();

    assert_exit!(1, code, stdout, stderr, "replay_unreachable_returns_one");
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
