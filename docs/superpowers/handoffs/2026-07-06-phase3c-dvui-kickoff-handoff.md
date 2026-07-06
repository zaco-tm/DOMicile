# Phase 3c (`domi-dvui`) — Kickoff Handoff

**Date:** 2026-07-06
**From:** End of Phase 3b session (3c not started — user-requested kickoff handoff)
**To:** Next session (Phase 3c spec + plan + implementation)
**Branch:** `phase-2d-agent-tooling` (unchanged; Phase 2d merge still deferred)
**Spec:** **none yet** — 3c has no spec, no plan, no code.
**Sibling specs:** [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](./2026-07-05-phase3a-react-design.md), [`docs/superpowers/specs/2026-07-06-phase3b-astro-design.md`](./2026-07-06-phase3b-astro-design.md)

---

## TL;DR

Phase 3c is the **third and final sub-project of Phase 3**: `domi-dvui` — a desktop/embedded Rust variant of the DOMiNice primitives. The plan preamble (Phase 3a plan) listed it as the third sibling; nothing exists yet beyond the name. **This handoff exists so the next session starts from a complete picture of what 3c must do and what choices it must make.**

**Phase 3 decomposition (recap):**
- 3a `@domi/react` — **shipped** (Phase 3a handoff, 2026-07-06).
- 3b `@domi/astro` — **shipped** (Phase 3b handoff, 2026-07-06).
- 3c `domi-dvui` — **not started.** This handoff.

---

## What is `domi-dvui`? (Provisional — to be confirmed in spec)

**`dvui` is a Rust-native immediate-mode GUI framework by David Timmerman.** ([crates.io/crates/dvui](https://crates.io/crates/dvui), [github.com/dvui/dvui](https://github.com/dvui/dvui).) It's a single-file / single-crate rendering layer that draws to a `dvui::RenderTarget` and is renderer-agnostic (can target wgpu, sdl, minifb, etc.). It has its own widget set.

`domi-dvui` would therefore be a Rust crate in `crates/domi-dvui/` that exposes the 15 DOMiNice primitives as `dvui::Widget` implementations — buttons, cards, alerts, etc. — producing the same class-suffix naming as the HTML/CSS design system, but rendered as dvui commands rather than DOM nodes.

**That's the working assumption.** The first question for the spec is: is "domi-dvui" a dvui-widget crate, or something else? See open questions §1.

---

## What we know

1. **15 primitives** from `components/primitives/*/` are the source of truth for "what a component is."
2. **CSS in `components/domi.css`** is the source of truth for variant/size suffix naming. dvui widgets don't render CSS — but the variant *names* (`primary`, `ghost`, `danger`; `sm`, `lg`) are an external contract; the dvui crate should accept the same strings.
3. **Tokens in `tokens/tokens.json`** are the canonical color/spacing values. dvui needs an equivalent (probably a `Color`/`Spacing` newtype or const-conversion).
4. **Existing Rust crate**: `crates/domi-server` (Phase 2c-α). 3c could either extend this crate (add a `dvui` module) or live as a sibling crate `crates/domi-dvui`. See open questions §2.
5. **Cargo workspace**: root `Cargo.toml` has workspace members. Adding `crates/domi-dvui` requires a `[workspace] members` update.

---

## What we don't know (must decide in spec)

1. **What "domi-dvui" actually is.** Three live candidates (more may emerge in brainstorming):
   - **(a) dvui widgets** — implement the 15 primitives as `dvui::Widget` types that render via dvui's command system. Renderer-agnostic. Most faithful to "domi" branding.
   - **(b) `iced` or `egui` widgets** — alternative native Rust GUI frameworks. Possible if the user prefers one over dvui. (iced is more popular in 2026; egui is the most widely used Rust GUI.)
   - **(c) Ratatui widgets** — terminal UI. Doesn't match the design system's intent (which is graphical). Probably out.
   - **(d) Native windowing via `winit` + `wgpu`** — render the primitives directly without a GUI framework. Maximum control, maximum work. Probably out of scope for "Phase 3 wrapper layer."
2. **Crate topology** — extend `crates/domi-server` or new sibling `crates/domi-dvui`?
3. **Variant API shape** — strings (`"primary"`) like the JS side, or enums (`DomButtonVariant::Primary`)? JS uses strings for IDE autocomplete via string-literal unions; Rust enums are exhaustive. The spec will lock this.
4. **Layout / theming** — does the dvui crate ship a default theme that mirrors `tokens.json`, or does the consumer pass colors in?
5. **Test runner** — DOMiNice Rust tests use `#[test]` with `domi-server`'s test harness. 3c tests would be `cargo test --workspace` again. Snapshot tests for rendered commands? Integration tests with a fake `RenderTarget`?
6. **Headless / image-diff testing** — is there a render-target recorder that lets us assert exact pixel output? dvui has `dvui::RenderTarget::record()`-style APIs; verify exact capability.

---

## Suggested plan structure

The 3a plan preamble called out 3c as "a desktop/embedded variant. No spec exists. Defer until 3b ships." Now that 3b ships, here's what 3c likely looks like:

```
### Task 1: Cargo crate scaffold + dvui dependency
### Task 2: tokens.json → Rust consts (or theme struct)
### Task 3: shared variant/size types (button variant, alert variant, etc.)
### Task 4-9: per-primitive widget implementations (Button, Card, Alert, Badge, Form/Input/Select, Checkbox/Radio, Table/Nav/Tabs, Modal/Toast/Tooltip)
### Task 10: integration tests with a recording RenderTarget
### Task 11: docs (README, RUST.md update if applicable, possibly a new "Phase 3" overview doc)
```

This mirrors 3a's plan shape (Tasks 1-12 with TDD discipline and library invariant preserved). The actual plan should be written *after* the spec locks the framework choice.

---

## Required reading before starting

- **`AGENTS.md`** — library invariant list (extends to Rust files in `crates/` and `tools/`).
- **`docs/PHASE2-SCOPE.md`** — the Phase 2 scope doc explains the Phase 2 split; useful context for how Rust fits into the design system.
- **`docs/RUST.md`** — Rust crate layout + phasing.
- **`crates/domi-server/`** — the existing Rust crate. Read `Cargo.toml`, `src/lib.rs`, `src/events/` to understand the workspace conventions. 3c should follow the same module structure.
- **`packages/react/CSS-AUDIT.md`** — the CSS audit doc is the source of truth for variant/size names. The Rust enum names should match.
- **`tokens/tokens.json`** — color/spacing values that the dvui widgets need to apply.
- **`docs/superpowers/specs/2026-07-06-phase3b-astro-design.md`** and `…-plan.md` — the most recent spec/plan; mirror its decision shape (Q-locked decisions table, escape hatches section, etc.).

---

## Required decisions to lock in the spec

1. **Framework**: dvui (default) vs iced vs egui vs custom. **The working assumption is dvui**, but the spec should confirm.
2. **Crate topology**: extend `domi-server` (add `crates/domi-server/src/dvui/`) vs new sibling (`crates/domi-dvui/`). **Recommendation: new sibling crate** — keeps the server and UI concerns separate, matches the JS-side monorepo split (each wrapper gets its own package).
3. **API shape**: string variants vs enum variants. **Recommendation: enums**, with `FromStr` impls for consumers who want strings.
4. **Theme**: built-in default vs consumer-supplied. **Recommendation: built-in default** that reads `tokens.json` at compile time (use a `build.rs` or `include_str!`).
5. **Tests**: use a recording `RenderTarget` to capture commands and assert on them. Snapshot tests with `insta` crate.
6. **Library invariant for 3c**: same as 2d-3b — no edits to `tokens/`, `components/`, `components/primitives/*/`, `scripts/domi*.js`, `examples/`, `crates/domi-server/**` (the existing Rust server), `templates/`, `tools/`. The dvui crate lives in `crates/domi-dvui/` and is a pure consumer.

---

## Open questions for the next session

1. **Framework choice.** The 3a/3b plans call this `domi-dvui`. Is "dvui" the locked target, or is it shorthand for "Rust-native UI"? If the latter, iced or egui are stronger 2026 choices. **This must be answered before any spec.**
2. **What consumes `domi-dvui`?** Is there a target app (a desktop tool for DOMiNice authors, a reference implementation of the design system in native Rust, an embedded display for a kiosk)? Knowing the consumer helps shape the API. If it's a reference demo, render fidelity to the HTML/CSS spec matters. If it's a downstream app, ergonomic API matters more.
3. **Does the dvui crate need to render at all, or is it widget definitions + command emission that a downstream app renders?** dvui separates "compute commands" from "execute commands against a target." 3c might be only the former.
4. **Layout primitives** — DOMiNice's HTML primitives include `Form`, `Table`, `Tabs`. Does the Rust crate need full layout containers, or just the styled leaf widgets (Button, Card, Alert, etc.)? Layout is significantly more work than widgets.
5. **Accessibility** — the dvui widgets don't have the same DOM a11y semantics. Some primitives are a11y-driven (`aria-selected`, `<dialog>` modal focus trap). Document which apply.
6. **Build target** — desktop only, or also web (via WebGPU/wasm)? dvui has wasm support but it's a different code path.
7. **MSRV** — DOMiNice Rust MSRV is documented in `docs/RUST.md`. Verify the chosen framework supports that floor.

---

## Recommended next-session flow

1. **Brainstorm** the framework choice and crate topology (this doc's open questions §1, §2). Get user approval.
2. **Spec** — write `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` (or fresh date) covering: Q1 framework, Q2 crate topology, Q3 API shape, Q4 theme strategy, Q5 test strategy, Q6 invariant extension. Include decision rationale for each.
3. **Spec self-review** — placeholder scan, internal consistency, scope check, ambiguity check.
4. **User review of spec** — wait for explicit go-ahead.
5. **Plan** — invoke `writing-plans` to create `docs/superpowers/plans/2026-07-06-phase3c-dvui-plan.md` (mirroring 3a/3b plan structure).
6. **Implement** — execute the plan. Use `executing-plans` (inline) given subagent dispatch keeps failing in this session, or `subagent-driven-development` if subagent support is restored.
7. **Whole-branch review** for 3c.
8. **Handoff** + **merge to main** (the deferred 2d+3a+3b+3c combined merge per the prior handoffs' recommendation).

---

## File map for fast pickup

| Need | Path |
|------|------|
| Phase 3a design (sibling template) | `docs/superpowers/specs/2026-07-05-phase3a-react-design.md` |
| Phase 3a plan (sibling template) | `docs/superpowers/plans/2026-07-05-phase3a-react-plan.md` |
| Phase 3b design (most recent) | `docs/superpowers/specs/2026-07-06-phase3b-astro-design.md` |
| Phase 3b plan | `docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md` |
| Phase 3b handoff | `docs/superpowers/handoffs/2026-07-06-phase3b-astro-handoff.md` |
| Phase 3a handoff (predecessor) | `docs/superpowers/handoffs/2026-07-06-phase3a-react-handoff.md` |
| AGENTS.md library invariant | `AGENTS.md` |
| Existing Rust crate | `crates/domi-server/` |
| Rust crate layout guide | `docs/RUST.md` |
| Phase 2 scope context | `docs/PHASE2-SCOPE.md` |
| CSS audit (shared ground truth) | `packages/react/CSS-AUDIT.md` |
| Tokens (canonical colors) | `tokens/tokens.json` |
| 15 HTML primitives (what widgets render) | `components/primitives/*/` |
| Wire protocol (orthogonal Phase 2) | `docs/WIRE-PROTOCOL.md` |
| Current branch HEAD | `phase-2d-agent-tooling` (commit `5fda8f4`) |

---

## Pre-3c merge gate (informational)

The 3a handoff decided: "Phase 2d merge deferred until Phase 3 wraps." Phase 3 has now shipped 3a and 3b. **Once 3c ships, the deferred Phase 2d + 3a + 3b + 3c combined merge to `main` is the natural next step.** This handoff does not action that merge; it's the next session's call after 3c.

---

## Sign-off

Phase 3c is **not started**. This handoff exists to give the next session a complete picture of what to decide before writing any spec. Recommend the next session:

1. Confirm framework choice (dvui vs alternatives) with the user.
2. Write the 3c design spec, locking the questions above.
3. Build the implementation plan.
4. Implement, test, review, merge.

End of handoff.