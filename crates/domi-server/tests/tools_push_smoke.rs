//! Gated end-to-end tests for the `domi push` subcommand.
//!
//! Run with `cargo test -p domi-server -- --ignored tools_push_smoke`.
//!
//! These tests address Phase 2d Task 3's "no live integration test for
//! `domi push`" risk by exercising the real `domi` binary against the
//! real `domi-server` HTTP endpoint (`POST /api/events`).
//!
//! Each test that boots a server spawns it via
//! `env!("CARGO_BIN_EXE_domi-server")` in a `tokio::process::Command`
//! on a high random port, polls `/healthz` until the server is ready,
//! then runs `domi push ...` via `std::process::Command` against
//! `env!("CARGO_BIN_EXE_domi")` and asserts the exit code + (where
//! applicable) stdout/stderr.
//!
//! Why gated: every test either binds a real TCP port or attempts a
//! connect that the kernel will refuse. Running them by default would
//! either flake under load or collide with other suites.

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

/// Pick a high random port in [20000, 30000) by binding then dropping.
/// This avoids collisions with the default 4173 and most other services;
/// the kernel may still race us (TOCTOU), so callers must tolerate that
/// failure mode (the test framework will report it and the user can
/// rerun). Task 7's `verify.sh` will refine this with a retry loop.
fn free_high_port() -> u16 {
    // Seed with process id + an OS-random source for diversity.
    let seed: u32 = std::process::id().wrapping_add(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0),
    );
    // Try a small range so we don't waste cycles if the first choice is taken.
    for offset in 0u32..32 {
        let port = 20000_u16 + ((seed.wrapping_add(offset)) % 10000) as u16;
        if let Ok(l) = TcpListener::bind(("127.0.0.1", port)) {
            let p = l.local_addr().unwrap().port();
            drop(l);
            return p;
        }
    }
    // Last-ditch: ask the kernel for an ephemeral port via bind(0).
    let l = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral");
    let p = l.local_addr().unwrap().port();
    drop(l);
    p
}

/// Wait until the server accepts a TCP connection on `port`, polling
/// every 50ms with a deadline.
async fn wait_for_bind(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("server did not bind within {timeout:?}");
}

/// Poll `/healthz` until a 2xx is returned (proves the axum router is
/// up, not just the TCP listener).
async fn wait_for_healthz(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    let url = format!("http://127.0.0.1:{port}/healthz");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .expect("client");
    let mut last_err = String::new();
    while Instant::now() < deadline {
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => return,
            Ok(resp) => {
                last_err = format!("status {}", resp.status());
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("server did not become healthy within {timeout:?} (last err: {last_err})");
}

/// Spawn the real `domi-server` binary on `port` with isolated `--root`
/// and `--state` directories. `kill_on_drop(true)` ensures cleanup even
/// if the test panics.
fn spawn_server(port: u16, root: &PathBuf, state_dir: &PathBuf) -> tokio::process::Child {
    let bin = env!("CARGO_BIN_EXE_domi-server");
    tokio::process::Command::new(bin)
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--root")
        .arg(root)
        .arg("--state")
        .arg(state_dir)
        .arg("--log-level")
        .arg("warn")
        .kill_on_drop(true)
        .spawn()
        .expect("spawn domi-server")
}

/// Run the `domi` binary synchronously with the given args. Returns
/// `(stdout, stderr, exit_code)`. `RUST_BACKTRACE=0` keeps stderr terse.
fn run_domi(args: &[&str]) -> (String, String, i32) {
    let out = Command::new(env!("CARGO_BIN_EXE_domi"))
        .args(args)
        .env("RUST_BACKTRACE", "0")
        .output()
        .expect("spawn domi");
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    let code = out.status.code().unwrap_or(-1);
    (stdout, stderr, code)
}

/// Boot a fresh server: creates a tempdir, spawns the binary, waits
/// for the port to accept TCP + `/healthz` to return 200. The caller
/// MUST hold the returned `Child` for the duration of the test (its
/// `kill_on_drop(true)` will tear down the server when the test ends).
async fn boot_server() -> (tempfile::TempDir, u16, tokio::process::Child) {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("root");
    let state_dir = tmp.path().join("state");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&state_dir).unwrap();

    let port = free_high_port();
    let child = spawn_server(port, &root, &state_dir);
    wait_for_bind(port, Duration::from_secs(5)).await;
    wait_for_healthz(port, Duration::from_secs(5)).await;
    (tmp, port, child)
}

/// Assert exit code matches `expected` and report the captured output
/// for easier debugging when an assertion fires.
macro_rules! assert_exit {
    ($expected:expr, $code:expr, $stdout:expr, $stderr:expr, $ctx:expr) => {{
        assert_eq!(
            $code, $expected,
            "{}: expected exit {}, got {}\n--- stdout ---\n{}\n--- stderr ---\n{}",
            $ctx, $expected, $code, $stdout, $stderr
        );
    }};
}

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
