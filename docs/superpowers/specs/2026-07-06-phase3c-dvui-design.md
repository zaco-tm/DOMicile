# Phase 3c — `domi-egui` Design Spec

**Date:** 2026-07-06
**Status:** Draft v1 — pending user review
**Phase:** 3c of Phase 3 (decomposed: 3a `@domi/react`, 3b `@domi/astro`, 3c `domi-egui`)
**Sibling specs:** [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](./2026-07-05-phase3a-react-design.md), [`docs/superpowers/specs/2026-07-06-phase3b-astro-design.md`](./2026-07-06-phase3b-astro-design.md)
**Kickoff handoff:** [`docs/superpowers/handoffs/2026-07-06-phase3c-dvui-kickoff-handoff.md`](../handoffs/2026-07-06-phase3c-dvui-kickoff-handoff.md) (named `dvui`; this spec renames to `egui` per Q1 decision below)

## Upstream contracts

- **HTML primitives** (canonical): `components/primitives/*/` — 15 folders, each with a `<name>.html` snippet + `<name>.css` stylesheet (per-leaf file, assembled into `components/domi.css`).
- **CSS** (canonical): `components/domi.css` — variant/size class suffixes live here (e.g., `.domi-btn--primary`).
- **CSS audit** (shared with 3a/3b): `packages/react/CSS-AUDIT.md` is the canonical ground truth for variant/size suffix names per primitive. 3c reads this doc and never duplicates it.
- **Design tokens** (canonical): `tokens/tokens.json` — locked palette and spacing. 3c generates Rust constants from this JSON at build time; the JSON stays untouched.
- **Existing Rust crate**: `crates/domi-server/` (Phase 2c-α through 2d). 3c lives as a **sibling** workspace member (`crates/domi-egui/`); does not extend `domi-server`.
- **Rust workspace conventions**: root `Cargo.toml` members, `rust-toolchain.toml`, MSRV policy in `docs/RUST.md`. 3c bumps the MSRV floor — see §F.7.

## Decision log (locked during brainstorming)

| Q | Decision | Rationale |
|---|---|---|
| Q1 | **egui** | Largest Rust-GUI user base, immediate-mode matches 1:1 to our 15 leaf primitives, both desktop (`eframe`) and wasm backends mature. The kickoff handoff named `dvui`; this spec renames the crate to `domi-egui` to match the chosen framework. |
| Q2 | **Widget library + a single `examples/domi-egui-smoke.rs` binary** | Mirrors 3a/3b shape — pure library surface, one example binary for human-eye smoke-test. No first-class consumer app. |
| Q3 | **Always-render** | egui collapses the dvui-style "emit then execute" split. Widgets take `&mut egui::Ui` and paint + register interaction in one call. State structs (Tabs, Modal) are caller-owned, passed `&mut`. |
| Q4 | **Leaf + 5 composites** (option b) | The 5 composites (Form, Nav, Tabs, Modal, Table) carry HTML-side structural contracts that consumers can't reconstruct from leaves alone. Card's `__header`/`__footer` slots become typed Rust fields. |
| Q5 | **5 a11y sites** (label/for, aria-selected, `[dialog][open]`+focus trap, data-tooltip, table semantics). Pure-presentation leaves (Button, Alert, Badge, Toast, Tooltip) rely on consumer-supplied `aria-*` via pass-through. |
| Q6 | **Desktop + wasm** (option b). `eframe` for native, `wasm32-unknown-unknown` via `trunk` for browser. WASM CI lane is `cargo check` + `trunk build`; `egui_kittest` doesn't run on wasm. |
| Q7 | **Bump MSRV to 1.83** (option a). egui 0.32.x requires it. `rust-toolchain.toml` floor and `docs/RUST.md` MSRV line both follow. Affects the entire workspace — see §F.7. |

## Problem

Phase 3 ships wrapper layers for popular front-end frameworks (3a React, 3b Astro). Phase 3c extends the design system to **native Rust GUI applications**, where DOM/CSS doesn't apply. Without this layer, Rust consumers (e.g., a desktop inspector for the domi-server event stream) must hand-derive the 15 primitives visually:

1. **No central visual identity** — every Rust tool that wants to look like DOMiNice rebuilds glass surfaces, gradients, and variant colors by reading `tokens.json` ad hoc.
2. **No BEM-part preservation** — structural contracts like `domi-form__row`/`__col`/`__label` or `domi-modal__dialog`/`__title` become "use the framework's grid and hope"; the 1:1 mapping 3a/3b preserved is lost.
3. **No compile-time guard between tokens and Rust code** — a token edit can silently leave Rust constants stale.
4. **No cross-language parity demo** — there's currently no "this is what DOMiNice looks like as a native window" artefact; `components/domi.css` references it on the web side and nothing on the native side.

`domi-egui` solves this with a Rust crate that exposes the 15 primitives — leaves + 5 composites — as typed widgets, paints them with egui using values read from `tokens.json` at build time, and ships a smoke binary for human-eye parity checks.

## Goals

- **15 leaf widgets** matching the HTML primitives 1:1 (one widget per primitive folder under `components/primitives/`).
- **5 composite widgets** (Form, Nav, Tabs, Modal, Table) that own the BEM-part contracts and a11y semantics that consumers can't reconstruct from leaves alone.
- **Typed variant enums** for every variant/size suffix in `packages/react/CSS-AUDIT.md` — Rust enum variants match CSS suffixes 1:1, never constructed at runtime.
- **Build-time token codegen**: Rust constants generated from `tokens/tokens.json` via `build.rs`. The crate reads tokens, never owns them. Token drift between CSS and Rust is impossible because both derive from the same JSON.
- **Default theme mirrors `components/domi.css`**: glass surfaces, palette from tokens, mono body type, display-italic headings.
- **Caller-supplied theme override** via `Option<&Theme>`.
- **Caller-owned state** for composites that have memory (Tabs, Modal, Form input values) — passed `&mut`, no magic global state.
- **Desktop + wasm targets**: `eframe` for native, `wasm32-unknown-unknown` via `trunk` for browser. Same widget source tree.
- **Library invariant held**: `tokens/`, `components/domi.css`, `components/primitives/*/`, `scripts/runtime/domi*.js`, `examples/`, `crates/domi-server/**`, `templates/`, `tools/` are **untouched** by 3c.

## Non-goals

- **No state machines** — primitives are stateless; ephemeral state (Tabs.selected, Modal.open, Form field values) is caller-owned and passed `&mut`.
- **No a11y middleware** — composites emit the right ARIA semantics; we don't wrap `accesskit` or build an action tracker. Consumers own the action surface.
- **No animation helpers** — egui's own animations handle transitions; no custom tween code.
- **No design-token authoring** — `tokens/tokens.json` is canonical; the crate is a *consumer*.
- **No CSS pipeline** — egui paints via `egui::Style`, not CSS. Visual parity with `components/domi.css` is approximate by design; the smoke binary shows the approximation, not a 1:1 pixel diff.
- **No editor integration / LSP** — out of scope for 3c.
- **No cross-framework wrappers in this phase** — `@domi/react` and `@domi/astro` are siblings, not consumers.
- **No distribution / `crates.io` publishing** — Phase 4.
- **No accessibility runtime for screen readers in 3c** — egui's `accesskit` integration in `eframe` is automatic; widgets don't need to know about it. Composites that emit ARIA attributes (Tabs's `aria-selected`, Form's `for`/`id` pairs) do so via `egui::Ui` accessibility calls when available; fall back to no-op on older egui.

## Design

### A. Crate shape

```
crates/domi-egui/                              # workspace member; added to root Cargo.toml
  Cargo.toml                                   # name = "domi-egui"; egui, eframe (desktop), epi
  build.rs                                     # reads tokens/tokens.json -> write tokens.rs to OUT_DIR
  src/
    lib.rs                                     # re-exports 15 leaves + 5 composites + theme tokens
    tokens.rs                                  # GENERATED by build.rs; do not edit by hand
    theme.rs                                   # Theme struct; Theme::default() reads from tokens.rs
    button.rs                                  # pub fn domi_button(ui, props) -> egui::Response
    card.rs                                    # leaf + CardProps { header, footer, size }
    alert.rs                                   # 4-variant enum (Info|Success|Warning|Danger)
    badge.rs                                   # 4-variant enum (Primary|Success|Warning|Danger)
    input.rs                                   # leaf + label/for pairing via Label struct
    select.rs                                  # leaf + <option>-shaped children
    checkbox.rs                                # leaf + label pairing
    radio.rs                                   # leaf + label pairing + name-grouping
    tooltip.rs                                 # leaf + content prop; egui::Popup on hover
    toast.rs                                   # leaf (position fixed by caller via Grid)
    form.rs                                    # composite: FormProps { rows: Vec<FormRow>, on_submit }
    table.rs                                   # composite: TableProps { headers, rows }
    nav.rs                                     # composite: NavProps { brand, links, actions }
    tabs.rs                                    # composite: TabsProps { labels, on_select } + TabsState { selected }
    modal.rs                                   # composite: ModalProps { open, title, content } + caller-managed bool
  tests/
    leaves.rs                                  # per-widget egui_kittest assertions (one per variant combo)
    composites.rs                              # per-composite assertions + state transitions
    tokens_parity.rs                           # runtime check: tokens.rs values match tokens/tokens.json byte-for-byte
  examples/
    domi-egui-smoke.rs                        # lays out all 15 primitives in an eframe window
```

Root changes:
- `Cargo.toml` (workspace) — `members = ["crates/domi-server", "crates/domi-egui"]`.
- `rust-toolchain.toml` — floor becomes `1.83`.
- `docs/RUST.md` — MSRV line: `1.75 (will set explicitly when implementing; current toolchain is 1.96)` → `1.83 (egui 0.32.x floor; current toolchain is 1.96)`. The phasing table at the bottom of `docs/RUST.md` gains a 3c row.
- `crates/domi-server/Cargo.toml` — no MSRV edit needed (it already builds on 1.83 via transitive deps); no source change.

### B. Widget API shape

Every leaf widget is a single function. Composites own caller-supplied state structs.

```rust
// crates/domi-egui/src/button.rs
pub fn domi_button(ui: &mut egui::Ui, props: ButtonProps) -> egui::Response;

pub struct ButtonProps<'a> {
    pub label: &'a str,
    pub variant: ButtonVariant,            // Primary (default) | Ghost | Danger — matches CSS suffixes
    pub size: ButtonSize,                  // Sm | Lg (default)
    pub on_click: Option<Box<dyn FnMut()>>,
    pub disabled: bool,
}

pub enum ButtonVariant { Primary, Ghost, Danger }
pub enum ButtonSize { Sm, Lg }

impl Default for ButtonVariant { fn default() -> Self { Self::Primary } }
impl Default for ButtonSize    { fn default() -> Self { Self::Lg } }
```

```rust
// crates/domi-egui/src/tabs.rs
pub fn domi_tabs(ui: &mut egui::Ui, props: TabsProps, state: &mut TabsState) -> egui::Response;

pub struct TabsProps<'a> {
    pub labels: &'a [&'a str],
    pub on_select: Option<Box<dyn FnMut(usize)>>,
}
pub struct TabsState { pub selected: usize }
impl Default for TabsState { fn default() -> Self { Self { selected: 0 } } }
```

Three rules applied uniformly across the 15 leaves + 5 composites:

1. **CSS-suffix names → Rust enum variants.** `domi-btn--primary` ↔ `ButtonVariant::Primary`. Widgets write the class internally; the JS-side suffix string never appears in Rust code outside the generated `tokens.rs` (and even there, only as initial-pascal-cased identifiers, not raw strings).
2. **Defaults match `packages/react/CSS-AUDIT.md` defaults.** Same defaults as 3a/3b per primitive.
3. **Caller owns state via `&mut StateStruct`** (Tabs, Modal, Form input values). No global state, no `lazy_static`, no `OnceCell`.

### C. Per-primitive mapping (initial; implementation TDDs against CSS-AUDIT.md)

This mirrors `packages/react/CSS-AUDIT.md`. Provisional until the TDD pass finalizes.

| Primitive | Form | Variant options | Size options | State? | A11y |
|---|---|---|---|---|---|
| `domi_button` | leaf | `Primary` \| `Ghost` \| `Danger` | `Sm` \| `Lg` | no | none (presentation) |
| `domi_card`   | leaf | — | `Sm` \| `Lg` | no; `header`/`footer` optional slots | none |
| `domi_alert`  | leaf | `Info` \| `Success` \| `Warning` \| `Danger` | — | no | none |
| `domi_badge`  | leaf | `Primary` \| `Success` \| `Warning` \| `Danger` | — | no | none |
| `domi_input`  | leaf | `error: bool` | `Sm` \| `Lg` | no | label/for pairing via `Label` struct |
| `domi_select` | leaf | `error: bool` | `Sm` \| `Lg` | no | label/for pairing |
| `domi_checkbox` | leaf | — | — | `checked: bool` | label pairing |
| `domi_radio`  | leaf | — | — | `selected: bool` + group `name` | label pairing + group |
| `domi_table`  | composite | — | — | caller `rows: Vec<Vec<String>>` | `<thead>`/`<tbody>` semantics if egui exposes |
| `domi_nav`    | composite | — | — | caller-owned slots | none |
| `domi_tabs`   | composite | — | — | `TabsState` | `aria-selected="true"` on active tab |
| `domi_modal`  | composite | — | — | caller `open: bool` | focus trap (egui modal helper); `[open]` toggle |
| `domi_toast`  | leaf | — | — | caller-managed `display` | none |
| `domi_tooltip`| leaf | — | — | no | tooltip content shown on hover; matches `data-tooltip` |
| `domi_form`   | composite | — | — | `FormState` with id-keyed values | label/for on every label |

(`Input`/`Select` use `error: bool`, not a string union. Same convention as 3a/3b.)

### D. Composites — slot/children APIs

```rust
// Form
pub fn domi_form(ui: &mut egui::Ui, props: FormProps, state: &mut FormState) -> egui::Response;
pub struct FormProps<'a> {
    pub rows: Vec<FormRow>,                   // typed row/col slots matching __row/__col BEM
    pub on_submit: Option<Box<dyn FnMut()>>,
}
pub enum FormRow {
    Row(Vec<FormCol>),                       // horizontal layout (domi-form__row)
    Col(Vec<FormField>),                     // vertical layout (domi-form__col)
}
pub enum FormCol {                            // children of a FormCol
    Label(&'static str),                     // domi-form__label
    Field(FormField),                        // input/select/checkbox/radio
    Help(&'static str),                      // domi-form__help
    Error(&'static str),                     // domi-form__error
}
pub enum FormField {
    Text(&'static str),                      // id for label/for pairing
    Email(&'static str),
    Checkbox(&'static str),
    Radio { name: &'static str, label: &'static str },
}
```

```rust
// Table
pub fn domi_table(ui: &mut egui::Ui, props: TableProps) -> egui::Response;
pub struct TableProps<'a> { pub headers: &'a [&'a str], pub rows: Vec<Vec<String>> }
```

```rust
// Nav
pub fn domi_nav(ui: &mut egui::Ui, props: NavProps) -> egui::Response;
pub struct NavProps<'a> {
    pub brand: &'a str,                       // domi-nav__brand
    pub links: &'a [(&'a str, &'a str)],      // domi-nav__links — (label, target)
    pub actions: Vec<NavAction>,              // domi-nav__actions — buttons or links
}
pub enum NavAction { Button(ButtonProps<'static>), Link(&'static str, &'static str) }
```

```rust
// Modal
pub fn domi_modal(ui: &mut egui::Ui, open: &mut bool, props: ModalProps) -> egui::Response;
pub struct ModalProps<'a> { pub title: &'a str, pub content: &'a str }
```

(Names mirror the JS-side BEM parts. Public API surface is moderate — five slot enums plus props — but each maps 1:1 to HTML structure documented in `components/primitives/*/README.md`.)

### E. Tokens — build-time codegen

`build.rs` reads `tokens/tokens.json` and emits `src/tokens.rs` into `OUT_DIR`. The crate imports it via `include!`:

```rust
// crates/domi-egui/src/lib.rs
include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

pub mod tokens {
    pub use super::*;
}
```

Generated content (build.rs):

```rust
// tokens.rs (generated — do not edit)
pub const COLOR_PRIMARY_GRADIENT: &[&str; 3] = &["#a89cc8", "#f4978e", "#ffd6b3"];
pub const TEXT_DEFAULT: &str = "#3d2342";
pub const SPACE_XS: f32 = 4.0;
pub const SPACE_SM: f32 = 8.0;
pub const SPACE_MD: f32 = 16.0;
pub const SPACE_LG: f32 = 24.0;
pub const SPACE_XL: f32 = 40.0;
pub const RADIUS_SM: f32 = 4.0;
pub const RADIUS_MD: f32 = 8.0;
pub const RADIUS_LG: f32 = 16.0;
// ... etc, mirroring tools/tokens-to-css.mjs semantics
```

The build script:
- Validates `tokens/tokens.json` parses (uses `serde_json`).
- Walks the JSON and emits `pub const`s with deterministic names (e.g., `COLOR_PRIMARY_GRADIENT`, `SPACE_XS`).
- Emits a `pub const TOKENS_JSON_SHA256: &str = "<hash>"` so tests can detect drift.

`build.rs` **never modifies** `tokens/tokens.json`. If the JSON changes, `cargo build` regenerates constants; rustdoc stays in sync; `tokens/tokens.json` is the single source of truth across CSS, JS, and Rust.

### F. Theme & render

```rust
// crates/domi-egui/src/theme.rs
pub struct Theme {
    pub primary: PrimaryTheme,                // gradient stops + angle
    pub text_default: egui::Color32,
    pub text_muted: egui::Color32,
    pub text_inverse: egui::Color32,
    pub surface_glass: egui::Color32,
    pub surface_glass_strong: egui::Color32,
    pub radius: (f32, f32, f32, f32),         // sm, md, lg, pill
    pub space: (f32, f32, f32, f32, f32),     // xs, sm, md, lg, xl
    pub body_font: egui::FontFamily,
    pub display_font: egui::FontFamily,
}

impl Default for Theme { /* reads from tokens.rs generated values */ }
```

- **Default theme** mirrors `components/domi.css` (glass surface, plum/terracotta/amber/sage palette, mono body, `'Helvetica Neue'` display).
- **Consumer override**: widgets that want to accept a theme take `theme: Option<&Theme>` as the last parameter. If `None`, default theme loads. Composites that already have many params (Form, Nav) take `theme` last by convention.
- **Render**: egui owns paint via `egui::Ui`. No custom shader. CSS rules translate to `egui::Style` + per-widget `color`/`rect` calls. The smoke binary displays the approximation; visual parity is approximate by design (no CSS canvas in egui).

### G. Composite a11y mapping (5 sites)

1. **`<label for=…>` paired with `<input id=…>`** — `domi_input`/`domi_select`/`domi_checkbox`/`domi_radio` all expose an `id` parameter; composite `domi_form` constructs the matching label id pair automatically (label `id` is derived from the `id` field of the `FormField` enum).
2. **`aria-selected="true"|"false"` on tabs** — `domi_tabs` owns `TabsState.selected` and toggles the accessibility state on the focused tab. egui's accessibility binding is consumed via `egui::Ui`'s accessibility calls; falls back to no-op on older egui.
3. **`<dialog>` + `[open]` toggle + focus trap** — `domi_modal(ui, open: &mut bool, props)` uses egui's modal-window primitive (`egui::ModalManager::default()` or its equivalent in the pinned egui minor) which supplies the focus trap. We do not reimplement focus logic.
4. **`data-tooltip="…"`** — `domi_tooltip` writes the data-attribute on the wrapped element via `egui::Ui`'s accessibility layer; the painted label is the wrapped text. CSS-side `::after` decoration lives in `components/domi.css` for the HTML side, but the egui widget paints its own balloon via `egui::Popup`.
5. **`<table>` structural semantics** — `domi_table` exposes `headers: &[&str]` + `rows: Vec<Vec<String>>`; egui's table widget emits `columnheaders` / `rowheaders` accessibility nodes when binding is enabled; otherwise the widget just paints the table.

Pure-presentation leaves (Button, Card, Alert, Badge, Nav, Toast) do not add a11y semantics beyond what the consumer passes via `aria-*` (forwarded through `egui::Ui`'s accessibility calls when supported; ignored otherwise).

### H. Testing strategy

| Layer | Tool | Coverage |
|---|---|---|
| Unit (no egui) | `cargo test` | variant-enum → class-suffix mapping; state struct transitions; theme defaults |
| Widget assertions | `egui_kittest` flow tests | one assertion per (widget, variant) tuple; ~30 leaf cases |
| Composite assertions | `egui_kittest` flow tests | one per composite with stub state; 5 composite cases |
| Token parity | `tests/tokens_parity.rs` | runtime: re-read `tokens/tokens.json`, compute SHA-256, compare to `TOKENS_JSON_SHA256` baked at build time |
| Smoke binary | `cargo run --example domi-egui-smoke` | human-eye regression; not gated in CI; manual run |
| WASM smoke | `trunk build --release` | optional CI lane: `cargo check --target wasm32-unknown-unknown` + `trunk build` — confirms the crate compiles for browser |

`egui_kittest` snapshots are **not** used (egui_kittest does not produce stable pixel hashes across driver versions in mid-2026). Instead, each test pumps a frame, asserts on the resulting `egui::Ui` paint-list / accessibility-tree, and tears down. **What `egui_kittest` calls "flow tests"** — semantically-driven, not pixel-driven — match the spec self-review and acceptance criteria 1:1.

### I. Dependencies

**Runtime** (`crates/domi-egui/Cargo.toml`):

| Dep | Version | Purpose |
|---|---|---|
| `egui` | `0.32` | Widget framework |
| `eframe` | `0.32` | Desktop app runtime (only compiled `cfg!(not(target_arch = "wasm32"))`) |
| `serde_json` | `1` | `build.rs` parses `tokens/tokens.json` |
| `sha2` | `0.10` | Token SHA-256 for `tests/tokens_parity.rs` |

**Dev**:

| Dep | Purpose |
|---|---|
| `egui_kittest` | Flow-test driver |
| `tempfile` | Sandbox for any temp-file behaviour |
| `pretty_assertions` | Better test diffs |

WASM target gating: `wasm-bindgen`, `web-sys` are pulled transitively by egui; `examples/domi-egui-smoke.rs` uses `eframe::WebRunner` only behind `#[cfg(target_arch = "wasm32")]`.

All permissively licensed (egui MIT/Apache-2.0, eframe MIT, serde_json MIT/Apache-2.0, sha2 MIT/Apache-2.0, egui_kittest MIT).

### J. Build & run

```bash
cargo build --workspace
cargo test  --workspace                    # all crates including domi-egui
cargo test  -p domi-egui --all-features    # crate-only
cargo build --target wasm32-unknown-unknown -p domi-egui
cd crates/domi-egui && trunk build --release   # wasm smoke; only when working on the wasm lane
cargo run --example domi-egui-smoke -p domi-egui   # desktop smoke (the recommended human-eye check)
```

### K. Cargo workspace + MSRV

- **Workspace**: root `Cargo.toml` `[workspace] members` adds `"crates/domi-egui"`. The existing `domi-server` member stays; `[[bin]]` definitions inside each member stay member-local.
- **MSRV bump (Q7)**: `rust-toolchain.toml` floor field becomes `1.83` (was unset before; effective floor matches active toolchain). `docs/RUST.md` "Crate MSRV" line changes to `1.83 (egui 0.32.x floor)`.
- **`Cargo.lock` policy** (AGENTS.md): still untracked. Phase 4 will re-evaluate; 3c does not commit `Cargo.lock`.

### L. Library invariant

The 3c diff is constrained as follows. **Out of bounds** (touches require explicit user sign-off, per AGENTS.md):

- `tokens/`
- `components/`
- `components/primitives/*/`
- `scripts/runtime/domi.js`, `scripts/runtime/domi-audit.js`
- `examples/` (the **root repo** `examples/` directory — DOMiNice example working-doc artifacts — *not* the crate's `examples/` Cargo convention. The crate has its own `crates/domi-egui/examples/domi-egui-smoke.rs`, which is the standard Cargo `examples/` directory and is auto-discovered by Cargo without an `[[example]]` block. The two meanings don't collide in practice because they live in different trees).
- `crates/domi-server/` (existing Phase 2 code)
- `templates/`
- `tools/`

**In bounds**:

- `crates/domi-egui/**` — new directory.
- `Cargo.toml` (root workspace, members list).
- `rust-toolchain.toml` (floor field, MSRV bump).
- `docs/RUST.md` (MSRV line + phasing table 3c row).
- `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` (this file).
- `docs/superpowers/plans/2026-07-06-phase3c-dvui-plan.md` (the plan).
- `docs/superpowers/handoffs/2026-07-06-phase3c-dvui-handoff.md` (the closing handoff).

### M. Acceptance criteria

1. All 15 leaf widgets exported from `domi_egui::*` with typed `*Props` structs.
2. All 5 composite widgets exported with typed `*Props` + caller-owned state structs.
3. CSS-suffix enum variants exist in `crates/domi-egui/` for every variant/size in `packages/react/CSS-AUDIT.md`. Verified by a `tests/css_audit_consistency.rs` test.
4. `cargo build --workspace` and `cargo build --target wasm32-unknown-unknown -p domi-egui` both pass.
5. `cargo test --workspace` green — unit + egui_kittest flows + tokens_parity.
6. `cargo run --example domi-egui-smoke -p domi-egui` shows all 15 primitives in a window.
7. **Library invariant held**: tokens/, components/, components/primitives/, scripts/, examples/ (root), crates/domi-server/, templates/, tools/ are **zero-edit** in the 3c diff. Verified by `git status --short` showing only `crates/domi-egui/**`, `Cargo.toml`, `rust-toolchain.toml`, `docs/RUST.md`, and the spec/plan/handoff files.
8. `Cargo.lock` stays gitignored.
9. `components/domi.css` pre-existing dirty state preserved.
10. Permissively licensed deps only.
11. README in `crates/domi-egui/` with usage examples and per-widget props table — mirrors the structure of `packages/react/README.md`.
12. `docs/RUST.md` updated: MSRV line + phasing table 3c row.

## Open questions (decided in spec self-review)

1. **Framework**: dvui vs iced vs egui vs custom. **egui** — Q1.
2. **Consumer shape**: standalone app vs widget library vs widget-lib + smoke. **widget-lib + smoke** — Q2.
3. **Render vs emit-only**: emit-then-execute vs always-paint. **always-paint** — Q3 (egui collapses the split).
4. **Layout scope**: leaves-only vs leaves + 5 composites vs leaves + 5 composites + DSL. **leaves + 5 composites** — Q4.
5. **A11y story**: per-primitive vs framework-defaults. **5 named a11y sites; rest is consumer-supplied pass-through** — Q5.
6. **Build target**: desktop only vs +wasm vs +wasm-no-tests. **desktop + wasm, no on-wasm tests** — Q6.
7. **MSRV**: bump to 1.83 vs pin egui 0.31. **bump to 1.83** — Q7.
8. **Crate name**: `domi-dvui` vs `domi-egui` vs `domi-iced` vs generic. **Renamed to `domi-egui` per Q1.** This is a deliberate change from the kickoff handoff title; the crate was never implemented, so the rename is free.
9. **State ownership pattern**: `&mut State` vs `Arc<Mutex<State>>` vs hidden in widget. **`&mut State` per-call**, owned by caller. egui's idiomatic mode.
10. **Accessibility binding for the 4 pure-presentation leaves**: A11y calls vs pass-through only. **Pass-through**: the consumer may attach `aria-*` via egui's accessibility layer; we don't synthesize attributes.
11. **Smoke binary's position in CI**: required vs manual vs cross-repo. **Manual** for now; promote to CI in Phase 4 when trunk/eframe CI patterns mature.
12. **DOMiNice rust MSRV bump scope**: 3c-only vs workspace-wide. **Workspace-wide**. Both crates build successfully under toolchain 1.83; aligning the toolchain causes no regressions in `domi-server` (its deps already use 1.83+ features transitively).

## Risks

1. **`egui_kittest` maturity**: as of mid-2026, `egui_kittest` flow tests are usable but rough around state transitions (especially Modal focus-trap and Tabs accessibility state). If they're flaky, fall back to: pump a frame with the live `egui::Context`, then walk the resulting `egui::Ui`'s paint-list and assertion-trees by hand. Plan Task 1 picks one based on what works in CI.
2. **Visual parity is approximate, not pixel-identical**: egui paints with `egui::Style`, not CSS. Glass + gradient + border combination maps to `egui::Widgets::noninteractive().bg_fill(stroke_glass, radius_md)` semantics, not literal CSS. Visual regressions will not catch "the gradient angle is 1.5° off" the way a CSS diff would. **Mitigation**: smoke binary is the human-eye check; the README explicitly states "visual parity is approximate by design."
3. **MSRV bump visibility**: `docs/RUST.md` MSRV line shifts 1.75 → 1.83; `rust-toolchain.toml` floor changes. Consumers who pinned to 1.75 will need to upgrade. Phase 4's distribution write-up should call this out.
4. **Pre-existing dirty `components/domi.css`**: must remain dirty after 3c. None of the 3c code touches CSS; we just read it. Verification: `git status --short` shows `components/domi.css` still dirty.
5. **`egui` minor-version churn**: egui is pre-1.0 and has shipped breaking changes between 0.29 and 0.32. The spec pins to `egui = "0.32"` as the floor and accepts that minor bumps may move APIs. Plan Task 8 to "lock to 0.32.x and document in `docs/RUST.md`."
6. **`wasm32-unknown-unknown` and egui_kittest**: egui_kittest does not support wasm in mid-2026; desktop tests cover correctness, wasm CI lane is just compile + smoke-build. Plan Task 11 (wasm CI) names this explicitly.
7. **`Frame` callback ergonomic for `on_click: Box<dyn FnMut()>`**: `Box<dyn FnMut>` requires `'static` lifetime and a heap allocation per render. For widgets that re-render 60fps, this is allocation pressure. **Mitigation**: in plan Task 9, profile; if it's a problem, switch to `egui::Response.clicked()`-based click handlers (caller checks `response.clicked()` outside the widget call), which avoids `Box<dyn FnMut>` entirely.
8. **Composites introduce API surface the kickoff handoff didn't enumerate**: 5 composite widgets are more than the 15 primitive leaves the handoff called out. **Mitigation**: spec locks the 5 names (Form, Nav, Tabs, Modal, Table); each is one widget per HTML composite, no scope creep beyond what's HTML-shaped.

## Cross-references

- HTML primitives: `components/primitives/*/<name>.html` (15 files)
- Canonical CSS: `components/domi.css`
- CSS audit (shared with 3a/3b): `packages/react/CSS-AUDIT.md`
- Tokens: `tokens/tokens.json`
- Token → CSS generator: `tools/tokens-to-css.mjs` (mirror logic in `crates/domi-egui/build.rs`)
- Wire protocol (orthogonal — Phase 2): `docs/WIRE-PROTOCOL.md`
- Rust crate layout + phasing: `docs/RUST.md` (will be updated for MSRV + 3c row)
- Existing Rust crate: `crates/domi-server/` (workspace member; 3c is a sibling)
- AGENTS.md library invariant: `AGENTS.md`
- Phase 3a spec: [`docs/superpowers/specs/2026-07-05-phase3a-react-design.md`](./2026-07-05-phase3a-react-design.md)
- Phase 3a plan: [`docs/superpowers/plans/2026-07-05-phase3a-react-plan.md`](../plans/2026-07-05-phase3a-react-plan.md)
- Phase 3b spec: [`docs/superpowers/specs/2026-07-06-phase3b-astro-design.md`](./2026-07-06-phase3b-astro-design.md)
- Phase 3b plan: [`docs/superpowers/plans/2026-07-06-phase3b-astro-plan.md`](../plans/2026-07-06-phase3b-astro-plan.md)
- Phase 3c kickoff handoff: [`docs/superpowers/handoffs/2026-07-06-phase3c-dvui-kickoff-handoff.md`](../handoffs/2026-07-06-phase3c-dvui-kickoff-handoff.md)
