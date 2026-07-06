//! Shared test helpers for `domi-server` gated integration suites.
//!
//! Phase 2d Tasks 3 (`tools_push_smoke`), 4 (`tools_replay_smoke`), and
//! 5 (`tools_tail_smoke`) all need to:
//!
//! 1. Pick a high random TCP port.
//! 2. Spawn the real `domi-server` binary on that port with isolated
//!    `--root` and `--state` tempdirs.
//! 3. Poll `/healthz` until the axum router is up.
//! 4. Run the `domi` binary against that server.
//!
//! These helpers were originally inlined in `tools_push_smoke.rs`
//! (Task 3). When Task 4 added `tools_replay_smoke.rs` the same
//! helpers would have to be duplicated; the right factoring for
//! three integration test files sharing them is `tests/common/mod.rs`
//! — the canonical Rust convention for integration-test helpers
//! (each file in `tests/` is its own crate, so shared code lives in
//! a submodule that is `mod common;`-imported by each file).
//!
//! Conventions:
//! - Every helper is `async fn`/`fn` — `tokio::test` is the framework.
//! - The `Child` returned from `spawn_server`/`boot_server` has
//!   `kill_on_drop(true)` so a panic in the test still tears down the
//!   server (no leaked processes).
//! - The returned `tempfile::TempDir` keeps the `--root`/`--state`
//!   directories alive for the duration of the test (drop = delete).

#![allow(dead_code)] // not every consumer uses every helper; that's fine

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

/// Pick a high random port in [20000, 30000) by binding then dropping.
///
/// This avoids collisions with the default 4173 and most other services.
/// The kernel may still race us (TOCTOU between drop and the test's
/// `spawn_server`), so callers must tolerate that failure mode (the test
/// framework will report it and the user can rerun). Task 7's
/// `scripts/verify.sh` refines this with a retry loop if needed.
pub fn free_high_port() -> u16 {
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
pub async fn wait_for_bind(port: u16, timeout: Duration) {
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
pub async fn wait_for_healthz(port: u16, timeout: Duration) {
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
pub fn spawn_server(port: u16, root: &PathBuf, state_dir: &PathBuf) -> tokio::process::Child {
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
pub fn run_domi(args: &[&str]) -> (String, String, i32) {
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
pub async fn boot_server() -> (tempfile::TempDir, u16, tokio::process::Child) {
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
///
/// Imported via `use common::assert_exit;` and called as
/// `assert_exit!(...)`. Marked `#[macro_export]` so it
/// reaches the integration-test crate root — the canonical
/// place from which every test file in `tests/` pulls its
/// shared macros. (Rust 2018+ requires `#[macro_export]` for cross-file visibility.)
#[macro_export]
macro_rules! assert_exit {
    ($expected:expr, $code:expr, $stdout:expr, $stderr:expr, $ctx:expr) => {{
        assert_eq!(
            $code, $expected,
            "{}: expected exit {}, got {}\n--- stdout ---\n{}\n--- stderr ---\n{}",
            $ctx, $expected, $code, $stdout, $stderr
        );
    }};
}
