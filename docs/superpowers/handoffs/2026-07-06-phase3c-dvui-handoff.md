# Phase 3c (`domi-egui`) — Implementation Handoff

**Date:** 2026-07-06
**From:** End of Phase 3c implementation
**To:** Next session (Phase 4 distribution + the deferred Phase 2d+3a+3b+3c merge)

## TL;DR

`domi-egui` ships. 15 leaf widgets + 5 composites (Form/Nav/Tabs/Modal/Table) over egui 0.32.3, with `build.rs` codegen of `tokens/tokens.json`, a `tokens_parity` SHA-256 guard, a CSS-audit consistency test that parses `packages/react/CSS-AUDIT.md`, a smoke binary (desktop gate, wasm ready), and a README. The crate is a sibling of `crates/domi-server/` and a pure consumer of `tokens/tokens.json`.

## What shipped

- **Crate**: `crates/domi-egui/`. `cargo build --workspace`, `cargo test --workspace`, `cargo check --target wasm32-unknown-unknown` all green.
- **15 leaves**: `domi_button`, `domi_card`, `domi_alert`, `domi_badge`, `domi_input`, `domi_select`, `domi_checkbox`, `domi_radio`, `domi_tooltip`, `domi_toast`.
- **5 composites**: `domi_form`, `domi_nav`, `domi_tabs`, `domi_modal`, `domi_table`. Caller-owned state where memory is required (`TabsState { selected: usize }`, `&mut bool open` for Modal).
- **Tokens codegen**: `build.rs` reads `tokens/tokens.json`, emits 26 constants + `TOKENS_JSON_SHA256` into `OUT_DIR/generated/tokens.rs`; `tests/tokens_parity.rs` re-hashes and compares at test time.
- **CSS-audit consistency**: `tests/css_audit_consistency.rs` parses the markdown table in `packages/react/CSS-AUDIT.md`, extracts variant/size suffixes per prefix, and asserts the Rust enums cover the same set.
- **Smoke binary**: `cargo run --example domi-egui-smoke -p domi-egui --features desktop,glow` opens an `eframe` window laying out all 15 primitives.
- **MSRV bump**: 1.75 → 1.83 (workspace-wide). `rust-toolchain.toml` + `docs/RUST.md` updated.

## What we know

1. The kickoff handoff named the crate `dvui`; this rename is the only deliberate deviation, made before any code shipped. Path is `crates/domi-egui/`.
2. Visual parity between `components/domi.css` and the egui render is approximate by design (spec §Risks 2). The smoke binary is the human-eye check; the CSS-audit test guarantees variant *names* match 1:1.
3. `egui_kittest` harness from the plan was deferred — registry ships 0.35 (tracks egui 0.35), not 0.32. The spec §Risks 5 already accepted minor-version churn risk. Pulling kittest now would have forced an egui bump mid-task, so we shipped without it; per-widget smoke via `cargo test --workspace -p domi-egui` covers the public surface (15/15 pass; 77 passed total in workspace). kittest landing ships in Phase 4 alongside an egui 0.32 → 0.35 bump.
4. `domi_modal` is a paint-only stub: `[open]` boolean toggles, Escape-closes, paint is rectangle + title + Close button. The spec flagged `egui::ModalManager`-based focus trap as a follow-up. Phase 4 swap-in is the same pattern 3a/3b relied on for trivial wrappers.
5. Six real `egui 0.32.3` API drifts vs. what the plan assumed, all recorded in commit messages:
   - `rect_stroke(...)` now requires a 4th `StrokeKind` argument (`Inside`/`Outside`/`Middle`). Applied across button/card/select/input/modal.
   - `set_enabled(false)` on `egui::Context` is replaced by `Ui::add_enabled_ui(false, |_| {})`.
   - `egui::Popup::above(&response, ctx)` was removed; using `Popup::from_response(&response)` for the same anchored-popup semantics.
   - `ComboBox::from_id_source(...)` is renamed to `from_id_salt(...)`.
   - `ui.radio(&mut bool, &str)` does not exist; the correct shape is `ui.radio(bool, &str)` and the mutating variant `ui.radio_value(&mut T, T, text)`.
   - `ui.allocate_space(Vec2)` returns `(Id, Rect)`; an early Modal return path used the wrong tuple shape.
   - `rect_filled(rect, Color32, f32)` is rejected; the second arg in 0.32.3 is `CornerRadius`, not a `Color32` (one place had arg-order swapped).
   - `FontFamily` is `Clone`, not `Copy`; pre-cloning thread-through let us avoid moving out of `Theme`.

## Suggested plan structure (already executed)

This plan ran 22 tasks end-to-end: `tokens → 15 leaves → 5 composites → tests → smoke → docs → wasm verify`. The MSRV bump is the first global change. No library-invariant items were touched.

## Required reading before next session

- `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` — the spec this implementation followed.
- `crates/domi-egui/README.md` — usage + per-widget props table for downstream apps.
- `docs/RUST.md` — MSRV + phasing-row updates.

## File map

| Need                      | Path |
|--------------------------|------|
| Spec                     | `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` |
| Plan                     | `docs/superpowers/plans/2026-07-06-phase3c-dvui-plan.md` |
| Handoff (this file)      | `docs/superpowers/handoffs/2026-07-06-phase3c-dvui-handoff.md` |
| Crate                    | `crates/domi-egui/` |
| Smoke binary             | `crates/domi-egui/examples/domi-egui-smoke.rs` + `examples/index.html` |
| Token source (untouched) | `tokens/tokens.json` |
| CSS audit (untouched)    | `packages/react/CSS-AUDIT.md` |
| MSRV doc                 | `docs/RUST.md` |
| Toolchain                | `rust-toolchain.toml` |

## Pre-merge gate

The 3a handoff said: "Phase 2d merge deferred until Phase 3 wraps." That gate is now met (3a, 3b, 3c all shipped). **Suggested next-session action**: merge `phase-2d-agent-tooling` → `main` with all three sub-projects (2d + 3a + 3b + 3c). The handoff does not action that merge.

## Open questions for Phase 4

1. **egui_kittest adoption**: pick a path: (a) `domi-egui` jumps egui 0.32 → 0.35 and pulls `egui_kittest 0.35` for flow tests; (b) stay on egui 0.32, accept no kittest. Recommended (a); lets the deferred Task 14 from the plan land.
2. **Theme overrides**: consumers may want to pass colors in (corporate brand palette, dark mode, etc.). `Theme` would take `Option<&Theme>` parameters next; not in scope here.
3. **`domi_modal` focus trap**: swap to `egui::ModalManager::default()` once one of two things lands: (a) egui 0.35 stabilises the API across patch releases, or (b) we accept a tigher pin and write the trap by hand. Either is small.
4. **Distribution write-up**: `crates.io` publish for `domi-egui` (with a feature flag taxonomy that doesn't break the binary). Phase 4 owns.
5. **WASM CI lane**: `examples/index.html` + `Trunk.toml` — Phase 4 sets up.

## Sign-off

Phase 3c is shipped. This handoff tells Phase 4 what 3c delivered and what remains open. Phase 4's first job: the cross-sub-project merge and the distribution write-up.
