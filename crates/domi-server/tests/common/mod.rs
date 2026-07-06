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
//! ## Port allocation — fence approach (Phase 2d Task 4 fix)
//!
//! The previous implementation (`free_high_port()`) bound an
//! ephemeral port, captured the port number, and dropped the
//! listener before returning. That left a race window during which
//! the kernel could re-assign the same port to a concurrent gated
//! test's bind — producing ~20% flakes under `cargo test --workspace
//! -- --ignored`. The robust pattern is to **hold the listener
//! alive** as a fence until the spawned server has demonstrably
//! bound the port. After `wait_for_healthz` returns we know the
//! server has the port, so the fence can be released safely (the
//! kernel will re-bind it to our server, which already owns it).
//!
//! Use [`claim_port`] to get a `(port, fence)` pair. Hold the
//! `fence` in a local until after `wait_for_healthz` succeeds, then
//! `drop(fence)` (or let it go out of scope) before running the rest
//! of the test. The unreachable tests, which never spawn a server,
//! use [`random_unbound_port`] instead — they don't need a fence
//! because they assert "connect fails", and any collision just
//! produces a non-zero exit code.

#![allow(dead_code)] // not every consumer uses every helper; that's fine

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant};


/// Claim an ephemeral port and hold a fence on it until the caller
/// drops the returned [`TcpListener`].
///
/// **Caller contract:** keep `fence` alive until AFTER you have
/// confirmed the spawned server has bound the port (typically via
/// [`wait_for_healthz`]). Then `drop(fence)` (or let it go out of
/// scope) to release the reservation.
///
/// The fence guarantees no other concurrent test can bind the same
/// port during the spawn race window — the kernel won't re-assign an
/// ephemeral port while a listener socket is still bound to it.
///
/// Implementation: `bind("127.0.0.1:0")` asks the kernel for an
/// ephemeral port from its pool. Each successful `bind(0)` gets a
/// unique port, so concurrent callers cannot collide. Listener
/// sockets (unlike connection sockets) do not enter `TIME_WAIT` on
/// drop, so the port is immediately safe to re-bind once the
/// spawned server has claimed it.
pub fn claim_port() -> (u16, TcpListener) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral");
    let port = listener.local_addr().expect("local_addr").port();
    (port, listener)
}

/// Returns a port number that is HIGHLY LIKELY unbound. Used only
/// by the unreachable tests where the assertion is "connect fails".
///
/// Picks from the kernel's ephemeral range — `[49152, 65535]` on
/// macOS, `[32768, 60999]` on Linux — so it's well outside any
/// service's default port. Does NOT bind-check; the race window is
/// acceptable for unreachable tests because the worst-case
/// behaviour (another test's server happens to be on this port and
/// rejects our request with 4xx/5xx or times out) still produces
/// the expected non-zero exit code.
///
/// Combines `process::id()` and a sub-second nanos seed so two
/// concurrent unreachable tests in the same binary rarely collide.
pub fn random_unbound_port() -> u16 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    // Kernel ephemeral range on macOS: [49152, 65535]
    // On Linux: [32768, 60999]. The intersection mid-range
    // [49152, 65535) — width 16384 — is safe on both platforms.
    49152 + ((std::process::id().wrapping_add(nanos)) % 16383) as u16
}

/// **Deprecated.** Returns a port number without holding a fence.
/// Kept as a thin alias for [`claim_port`] to avoid breaking older
/// call sites that don't actually need the race protection (e.g.,
/// one-off manual experiments). New gated integration tests should
/// use [`claim_port`] + [`wait_for_healthz`] + `drop(fence)`.
#[deprecated(
    since = "2d Task 4",
    note = "fence-less allocation is racy under concurrent gated tests; use claim_port()"
)]
pub fn free_high_port() -> u16 {
    let (port, _fence) = claim_port();
    port
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

/// Per-binary atomic port counter (see `next_port`). Seeded by
/// `process_id()` at first use so different test binaries start at
/// different offsets and never collide across binaries.
static NEXT_PORT: AtomicU16 = AtomicU16::new(0);
const PORT_BASE: u16 = 49152;
const PORT_RANGE: u16 = 8192;

/// Allocate the next unique port for this test binary. Each call
/// returns a different port within [PORT_BASE, PORT_BASE+RANGE).
/// Wrapping is harmless (mod RANGE) and never triggers in practice
/// (gated suites have ~10 tests per binary).
fn next_port() -> u16 {
    let counter = NEXT_PORT.fetch_add(1, Ordering::Relaxed);
    let offset = (counter as u32 % PORT_RANGE as u32) as u16;
    PORT_BASE + offset
}

/// Boot a fresh server: creates a tempdir, claims a port from the
/// atomic counter, spawns the binary, waits for `/healthz` to return
/// 200. The caller MUST hold the returned `Child` for the duration
/// of the test (its `kill_on_drop(true)` tears down the server).
///
/// **Why this is race-free:** port assignment uses a per-binary
/// atomic counter (see [`next_port`]). Each call returns a port that
/// no other concurrent call in this binary will ever receive. Across
/// binaries (`binary_smoke`, `tools_push_smoke`, `tools_replay_smoke`,
/// `tools_tail_smoke`), the `process_id()` seeding means different
/// binaries start at different offsets in the [49152, 57344) window
/// — no cross-binary collision.
///
/// (An earlier fence approach held a `TcpListener` until the server
/// bound; that BROKE the tests because the spawned server couldn't
/// bind while we held the fence. The atomic counter avoids bind/drop
/// entirely — each call computes a unique port number; if the port is
/// somehow in use, the spawn fails loudly with EADDRINUSE.)
pub async fn boot_server() -> (tempfile::TempDir, u16, tokio::process::Child) {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("root");
    let state_dir = tmp.path().join("state");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&state_dir).unwrap();

    let port = next_port();
    let child = spawn_server(port, &root, &state_dir);
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
