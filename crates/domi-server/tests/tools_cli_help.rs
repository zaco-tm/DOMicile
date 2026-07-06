//! Integration tests for the `domi` binary's clap help surface.
//!
//! These tests pin the public CLI contract documented in
//! `docs/superpowers/plans/2026-07-05-phase2d-agent-tooling-plan.md` Task 2.
//! They spawn the real `domi` binary (`CARGO_BIN_EXE_domi`) and assert that
//! the rendered help screens list the expected subcommands and flags.
//!
//! Why integration, not unit: clap derive generates the help text from the
//! real `Cli`/`TailArgs`/`ReplayArgs`/`PushArgs` structs, and the rendered
//! output is the actual contract users see. Asserting on the binary output
//! catches regressions across the whole derive stack, not just one struct.

use std::process::Command;

/// Path to the `domi` binary. `cargo test` populates `CARGO_BIN_EXE_<name>`
/// for every `[[bin]]` target declared in `Cargo.toml`.
fn domi_bin() -> &'static str {
    env!("CARGO_BIN_EXE_domi")
}

/// Run `domi` with the given args, returning `(stdout, stderr, exit_code)`.
fn run_domi(args: &[&str]) -> (String, String, i32) {
    let out = Command::new(domi_bin())
        .args(args)
        .env("RUST_BACKTRACE", "0")
        .output()
        .expect("spawn domi");
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    let code = out.status.code().unwrap_or(-1);
    (stdout, stderr, code)
}

/// Convenience: assert that `haystack` contains every `needle` (literal match).
fn assert_contains_all(haystack: &str, needles: &[&str], context: &str) {
    let mut missing: Vec<&str> = Vec::new();
    for n in needles {
        if !haystack.contains(n) {
            missing.push(n);
        }
    }
    assert!(
        missing.is_empty(),
        "{context}: expected help to contain {missing:?}\n--- actual output ---\n{haystack}"
    );
}

#[test]
fn cli_help_lists_subcommands() {
    // `domi --help` must list every Phase 2d subcommand by name.
    let (stdout, _stderr, code) = run_domi(&["--help"]);
    assert_eq!(code, 0, "`domi --help` should exit 0 (got {code})");
    assert_contains_all(&stdout, &["tail", "replay", "push"], "domi --help");
}

#[test]
fn cli_tail_help_lists_follow() {
    // `domi tail --help` must expose the flags the brief mandates for `tail`:
    //   --follow  (bool flag — subscribe + follow the stream)
    //   --limit   (usize — cap event count)
    //   --doc     (optional — filter by document)
    //   --server  (global — base URL; the doc test catches renames too)
    let (stdout, _stderr, code) = run_domi(&["tail", "--help"]);
    assert_eq!(code, 0, "`domi tail --help` should exit 0 (got {code})");
    assert_contains_all(
        &stdout,
        &["--follow", "--limit", "--doc", "--server"],
        "domi tail --help",
    );
}

#[test]
fn cli_push_help_requires_type() {
    // `domi push --help` must advertise `--type <TYPE>` as a REQUIRED argument
    // (clap renders bare `String` fields as `<TYPE>` and shows them without a
    //  default — the rendered text `Usage: ... --type <TYPE>` is the proof).
    let (stdout, _stderr, code) = run_domi(&["push", "--help"]);
    assert_eq!(code, 0, "`domi push --help` should exit 0 (got {code})");
    assert_contains_all(
        &stdout,
        &["--type <TYPE>"],
        "domi push --help (required --type placeholder)",
    );
    // Also verify the flag is *required*: omitting it on the command line
    // should make `domi push` exit non-zero (clap convention: exit 2).
    let (_stdout, _stderr, push_code) = run_domi(&["push"]);
    assert_ne!(
        push_code, 0,
        "`domi push` without --type must fail (got exit 0)"
    );
}

#[test]
fn cli_replay_help_lists_since() {
    // `domi replay --help` must expose the flags the brief mandates for
    // `replay`: --since, --doc, --limit, --server.
    let (stdout, _stderr, code) = run_domi(&["replay", "--help"]);
    assert_eq!(code, 0, "`domi replay --help` should exit 0 (got {code})");
    assert_contains_all(
        &stdout,
        &["--since", "--doc", "--limit", "--server"],
        "domi replay --help",
    );
}
