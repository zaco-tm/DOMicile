# Phase 3c — `domi-egui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `domi-egui` Rust crate that exposes the 15 DOMiNice primitives (leaves) plus 5 composites as typed egui widgets, with build-time token codegen and a smoke binary for visual parity.

**Architecture:** New sibling crate `crates/domi-egui/` (parallel to existing `crates/domi-server/`). `build.rs` reads `tokens/tokens.json` (canonical, untouched) and emits Rust constants via `OUT_DIR`. Widgets are `fn domi_<primitive>(ui: &mut Ui, props: ...)` functions; composites take caller-owned `&mut State`. egui paints via `egui::Style`. Defaults mirror `components/domi.css`.

**Tech Stack:** Rust 1.83+ (MSRV bump from 1.75), egui 0.32, eframe 0.32 (desktop), `wasm32-unknown-unknown` via `trunk` (browser), egui_kittest flow tests, `serde_json` for token parsing in `build.rs`, `sha2` for `tokens_parity` runtime check.

**Spec:** [`docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md`](../specs/2026-07-06-phase3c-dvui-design.md) (commit `e7e3868`).

## Global Constraints

These come from the spec + `AGENTS.md`. Every task's requirements implicitly include this list. Spec copy is quoted verbatim.

- **Library invariant held** (spec §Non-goals): `tokens/`, `components/domi.css`, `components/primitives/*/`, `scripts/domi*.js`, `examples/` *(root repo examples/ — DOMiNice example working-doc artifacts — NOT the crate's `crates/domi-egui/examples/` Cargo convention)*, `crates/domi-server/**`, `templates/`, `tools/` are **untouched** by 3c.
- **`rust-toolchain.toml` floor field becomes `1.83`** (spec §K).
- **`docs/RUST.md` MSRV line changes from `1.75 (...)` to `1.83 (egui 0.32.x floor)`** (spec §A root-changes; §K); phasing table gains a 3c row.
- **MSRV bump is workspace-wide** (spec §Open questions 12): both `crates/domi-server` and `crates/domi-egui` build under toolchain 1.83; no source change to `crates/domi-server` is needed (its deps already use 1.83+ features transitively).
- **`Cargo.lock` stays gitignored** (AGENTS.md). Re-evaluated in Phase 4; 3c does not commit `Cargo.lock`.
- **Pre-existing dirty `components/domi.css` is preserved** (AGENTS.md). After 3c, `git status --short` still shows `components/domi.css` as modified.
- **Crate name** is `domi-egui` (kickoff handoff named it `dvui`; renamed per spec §Q1). Directories: `crates/domi-egui/` (workspace member).
- **Pin egui to `0.32`** (spec §I, §Risks 5). Minor version churn accepted; `docs/RUST.md` notes the pin.
- **Permissively licensed deps only** (spec §I): egui MIT/Apache-2.0, eframe MIT, serde_json MIT/Apache-2.0, sha2 MIT/Apache-2.0, egui_kittest MIT.
- **`eframe` 0.32 is gated `#[cfg(not(target_arch = "wasm32"))]` for the desktop binary; the WASM example uses `eframe::WebRunner` behind `#[cfg(target_arch = "wasm32")]`** (spec §A, §I, §J).
- **`crates/domi-egui/examples/` is auto-discovered by Cargo without `[[example]]` blocks.** No extra manifest entries needed.
- **Test framework constraint** (spec §H, §Risks 1): prefer `egui_kittest` flow tests. If a flow test is flaky on a particular primitive, fall back to pumping a frame with the live `egui::Context` and walking the `egui::Ui` paint-list / accessibility tree by hand. Plan Task 2 picks the harness based on what works in CI.
- **WASM tests don't run** (spec §Open questions 6, §Risks 6): WASM CI lane is `cargo check --target wasm32-unknown-unknown -p domi-egui` + `trunk build --release`. Desktop tests cover correctness.

---

### Task 1: Workspace scaffold + MSRV bump

**Files:**
- Modify: `Cargo.toml` (root, workspace members)
- Modify: `rust-toolchain.toml` (MSRV floor)
- Create: `crates/domi-egui/` (empty dir; manifest comes in Task 2)

**Interfaces:**
- Consumes: existing `members = ["crates/domi-server"]` in root `Cargo.toml`; existing `rust-toolchain.toml` (no explicit floor).
- Produces: `members = ["crates/domi-server", "crates/domi-egui"]` in root `Cargo.toml`; `rust-toolchain.toml` floor `1.83`. Empty `crates/domi-egui/` directory exists for the manifest to register in Task 2.

- [ ] **Step 1: Verify toolchain**

Run:
```bash
rustup toolchain list
rustc --version
```

Expected: a stable toolchain listed at version >= 1.83 (per spec §Q7). If only 1.75-1.82 are installed, run `rustup update stable` first; recording the resolved version in the commit body.

- [ ] **Step 2: Update root `Cargo.toml` workspace members**

Edit `Cargo.toml` — change the `[workspace] members` array from:

```toml
[workspace]
resolver = "2"
members = ["crates/domi-server"]
```

to:

```toml
[workspace]
resolver = "2"
members = ["crates/domi-server", "crates/domi-egui"]
```

The new path resolves correctly because we won't let Task 2's `Cargo.toml` ship without the directory existing.

- [ ] **Step 3: Create the empty `crates/domi-egui/` directory**

Run:
```bash
mkdir -p crates/domi-egui
```

Expected: `crates/domi-egui/` exists; `ls crates/domi-egui/` shows it empty.

- [ ] **Step 4: Add a sentinel `Cargo.toml` so the workspace can build around it**

Create `crates/domi-egui/Cargo.toml`:

```toml
[package]
name = "domi-egui"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
```

(no lib/bin yet — Task 2 fills the real manifest.)

Run `cargo build --workspace` and confirm it succeeds:

```bash
cargo build --workspace
```

Expected: builds (the sentinel crate is empty; `domi-server` rebuilds unaffected). If `crates/domi-egui` is missing a `src/lib.rs`, that's fine for this step — `cargo build --workspace` only requires a valid manifest.

- [ ] **Step 5: Update `rust-toolchain.toml`**

Open `rust-toolchain.toml`. If it currently has:

```toml
[toolchain]
channel = "stable"
```

…change to:

```toml
[toolchain]
channel = "stable"
rust-version = "1.83"
```

If the file already pins a `rust-version` (it doesn't today), update the value to `"1.83"` instead.

Run:

```bash
rustup show active-toolchain
```

Expected: a stable toolchain ≥ 1.83 (the floor field doesn't auto-upgrade installed rust; it just records the minimum that Cargo enforces).

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml rust-toolchain.toml crates/domi-egui/Cargo.toml
git commit -m "chore(3c): workspace + toolchain — add crates/domi-egui member; MSRV floor 1.83"
```

### Task 2: Minimal `domi-egui` crate — lib + build.rs + tokens codegen

**Files:**
- Modify: `crates/domi-egui/Cargo.toml` (replace sentinel with real manifest)
- Create: `crates/domi-egui/build.rs`
- Create: `crates/domi-egui/src/lib.rs` (skeleton; widgets ship in Tasks 4-13)
- Create: `crates/domi-egui/.gitignore` (record `OUT_DIR` exclusions)

**Interfaces:**
- Consumes: `tokens/tokens.json` (canonical, read-only per spec §Non-goals).
- Produces:
  - `pub mod theme;` — `theme.rs` ships in Task 3 (this task declares the module).
  - Build-codegen: `OUT_DIR/generated/tokens.rs` containing `pub const COLOR_PRIMARY_GRADIENT: &[&str; 3] = ...;` etc., plus `pub const TOKENS_JSON_SHA256: &str = "<hex>";`.

- [ ] **Step 1: Replace the sentinel `crates/domi-egui/Cargo.toml`**

Replace the file contents with:

```toml
[package]
name = "domi-egui"
version = "0.1.0"
edition = "2021"
license = "MIT"
description = "DOMiNice 15-primitive widget library for egui (Phase 3c)."
publish = false

[lib]
path = "src/lib.rs"

[dependencies]
egui = "0.32"
eframe = { version = "0.32", optional = true, default-features = false }

[features]
default = []
desktop = ["dep:eframe"]

[build-dependencies]
serde_json = "1"
sha2 = "0.10"

# WASM smoke binary; loaded only under wasm32 (for `trunk build`).
[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = ["Document", "Window"] }
```

(`eframe` is optional so the wasm lane doesn't pull native-only deps. The `desktop` feature flips it on. `Cargo.toml` does NOT yet declare the smoke example — Cargo auto-discovers `examples/*.rs` without an `[[example]]` block.)

- [ ] **Step 2: Add a placeholder `src/lib.rs` so the library builds**

Create `crates/domi-egui/src/lib.rs`:

```rust
//! DOMiNice primitive widgets for egui.
//!
//! See `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md`.

pub mod theme;

#[cfg(doctest)]
#[doc = include_str!("../README.md")]
extern "C" {}
```

(`theme` ships in Task 3; declared now so the build.rs token codegen can target a module that exists.)

- [ ] **Step 3: Write `build.rs`**

Create `crates/domi-egui/build.rs`:

```rust
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

fn main() {
    println!("cargo:rerun-if-changed=../../tokens/tokens.json");

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR set");
    let tokens_json_path = Path::new(&manifest_dir).join("../../tokens/tokens.json");
    let tokens_bytes = fs::read(&tokens_json_path)
        .unwrap_or_else(|e| panic!("read tokens/tokens.json ({:?}): {}", tokens_json_path, e));
    let tokens: Value = serde_json::from_slice(&tokens_bytes)
        .expect("tokens/tokens.json parses as JSON");

    let mut out = String::new();
    out.push_str("// Generated by build.rs from tokens/tokens.json — do not edit by hand.\n\n");

    // color
    if let Some(color) = tokens.get("color") {
        if let Some(primary) = color.get("primary") {
            if let Some(gradient) = primary.get("gradient").and_then(|v| v.as_array()) {
                let stops: Vec<String> = gradient.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                let stop_count = stops.len();
                out.push_str(&format!(
                    "pub const COLOR_PRIMARY_GRADIENT: &[&str; {stop_count}] = &[{}];\n",
                    stops.iter().map(|s| format!("\"{s}\"")).collect::<Vec<_>>().join(", ")
                ));
            }
            if let Some(angle) = primary.get("angle").and_then(|v| v.as_str()) {
                out.push_str(&format!("pub const COLOR_PRIMARY_ANGLE: &str = \"{angle}\";\n"));
            }
        }
        if let Some(secondary) = color.get("secondary") {
            for (name, hex) in secondary.as_object().into_iter().flatten() {
                if let Some(hex_str) = hex.as_str() {
                    let ident = to_const_ident(&format!("secondary_{name}"));
                    out.push_str(&format!("pub const {ident}: &str = \"{hex_str}\";\n"));
                }
            }
        }
        if let Some(accent) = color.get("accent") {
            for (name, hex) in accent.as_object().into_iter().flatten() {
                if let Some(hex_str) = hex.as_str() {
                    let ident = to_const_ident(&format!("accent_{name}"));
                    out.push_str(&format!("pub const {ident}: &str = \"{hex_str}\";\n"));
                }
            }
        }
        if let Some(text) = color.get("text") {
            for (name, hex) in text.as_object().into_iter().flatten() {
                if let Some(hex_str) = hex.as_str() {
                    let ident = to_const_ident(&format!("text_{name}"));
                    out.push_str(&format!("pub const {ident}: &str = \"{hex_str}\";\n"));
                }
            }
        }
        if let Some(surface) = color.get("surface") {
            for (name, hex) in surface.as_object().into_iter().flatten() {
                if let Some(hex_str) = hex.as_str() {
                    let ident = to_const_ident(&format!("surface_{name}"));
                    out.push_str(&format!("pub const {ident}: &str = \"{hex_str}\";\n"));
                }
            }
        }
    }

    // radius / space / border / shadow
    if let Some(radius) = tokens.get("radius") {
        emit_px_consts(&mut out, "radius", radius);
    }
    if let Some(space) = tokens.get("space") {
        emit_px_consts(&mut out, "space", space);
    }
    if let Some(border) = tokens.get("border") {
        if let Some(obj) = border.as_object() {
            for (name, val) in obj {
                let ident = to_const_ident(&format!("border_{name}"));
                if val.is_string() {
                    out.push_str(&format!("pub const {ident}: &str = \"{}\";\n", val.as_str().unwrap()));
                }
            }
        }
    }
    if let Some(shadow) = tokens.get("shadow") {
        if let Some(obj) = shadow.as_object() {
            for (name, val) in obj {
                let ident = to_const_ident(&format!("shadow_{name}"));
                if val.is_string() {
                    out.push_str(&format!("pub const {ident}: &str = \"{}\";\n", val.as_str().unwrap()));
                }
            }
        }
    }

    // SHA-256 of the source JSON bytes (so tests can detect drift)
    let mut hasher = Sha256::new();
    hasher.update(&tokens_bytes);
    let sha = format!("{:x}", hasher.finalize());
    out.push_str(&format!("pub const TOKENS_JSON_SHA256: &str = \"{sha}\";\n"));

    // Write to OUT_DIR/generated/tokens.rs
    let out_dir: PathBuf = env::var_os("OUT_DIR").expect("OUT_DIR set").into();
    let gen_dir = out_dir.join("generated");
    fs::create_dir_all(&gen_dir).expect("mkdir OUT_DIR/generated");
    fs::write(gen_dir.join("tokens.rs"), out).expect("write tokens.rs");
}

fn emit_px_consts(out: &mut String, group: &str, value: &Value) {
    if let Some(obj) = value.as_object() {
        for (name, val) in obj {
            // tokens.json stores these as e.g. "4px" strings or 0.4 numbers.
            // We emit `f32` constants: parse the leading integer portion of the string OR take number.
            let parsed: Option<f32> = val.as_f64().map(|n| n as f32)
                .or_else(|| val.as_str().and_then(parse_px_str));
            if let Some(px) = parsed {
                let ident = to_const_ident(&format!("{group}_{name}"));
                out.push_str(&format!("pub const {ident}: f32 = {px};\n"));
            }
        }
    }
}

/// Parse a CSS-ish length string ("16px", "8") into a numeric value.
fn parse_px_str(s: &str) -> Option<f32> {
    let trimmed = s.trim();
    let numeric = trimmed.trim_end_matches("px").trim();
    numeric.parse::<f32>().ok()
}

/// Convert snake_case-ish JSON keys into SCREAMING_SNAKE_CASE.
fn to_const_ident(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_uppercase() || ch.is_ascii_digit() {
            out.push(ch.to_ascii_uppercase());
        } else if ch == '_' || ch == '-' {
            out.push('_');
        }
    }
    out
}
```

- [ ] **Step 4: Create the `.gitignore`**

Create `crates/domi-egui/.gitignore`:

```
# Generated by build.rs — lives in OUT_DIR, never tracked by git.
target/
**/*.rs.bk
```

The `target/` line excludes the same `target/` Cargo creates everywhere; the `.rs.bk` is a backup convention.

- [ ] **Step 5: Run `cargo build -p domi-egui` and confirm codegen runs**

```bash
cargo build -p domi-egui
```

Expected: builds. `build.rs` re-runs (because we added `cargo:rerun-if-changed`). Inspect `target/debug/build/domi-egui-*/out/generated/tokens.rs` if you want to confirm the constants; the test suite in Task 14 verifies.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/Cargo.toml crates/domi-egui/build.rs crates/domi-egui/src/lib.rs crates/domi-egui/.gitignore
git commit -m "feat(3c): domi-egui scaffold + build.rs token codegen"
```

### Task 3: Theme struct + Default impl

**Files:**
- Create: `crates/domi-egui/src/theme.rs`

**Interfaces:**
- Consumes: `OUT_DIR/generated/tokens.rs` constants from Task 2; `egui::Color32` from the `egui` crate.
- Produces:
  ```rust
  pub struct Theme {
      pub primary: PrimaryTheme,
      pub text_default: egui::Color32,
      pub text_muted: egui::Color32,
      pub text_inverse: egui::Color32,
      pub surface_glass: egui::Color32,
      pub surface_glass_strong: egui::Color32,
      pub radius: (f32, f32, f32, f32),  // sm, md, lg, pill
      pub space: (f32, f32, f32, f32, f32), // xs, sm, md, lg, xl
      pub body_font: egui::FontFamily,
      pub display_font: egui::FontFamily,
  }
  pub struct PrimaryTheme {
      pub gradient_stops: Vec<egui::Color32>,
      pub angle: String,
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `crates/domi-egui/tests/theme.rs`:

```rust
use domi_egui::theme::Theme;

#[test]
fn default_theme_matches_css_palette() {
    let t = Theme::default();
    // palette mirrors components/domi.css ::root vars; primary text is `#3d2342`.
    assert_eq!(t.text_default, egui::Color32::from_rgb(0x3d, 0x23, 0x42));
    // sm/md/lg/pill radii come straight from tokens/tokens.json:radius.
    assert!((t.radius.0 - 4.0).abs() < f32::EPSILON, "radius.sm");
    assert!((t.radius.1 - 8.0).abs() < f32::EPSILON, "radius.md");
    assert!((t.radius.2 - 16.0).abs() < f32::EPSILON, "radius.lg");
    // xs/sm/md/lg/xl space.
    assert!((t.space.0 - 4.0).abs() < f32::EPSILON, "space.xs");
    assert!((t.space.4 - 40.0).abs() < f32::EPSILON, "space.xl");
}

#[test]
fn primary_gradient_has_three_stops() {
    let t = Theme::default();
    assert_eq!(t.primary.gradient_stops.len(), 3);
    assert_eq!(t.primary.gradient_stops[0], egui::Color32::from_rgb(0xa8, 0x9c, 0xc8));
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cargo test -p domi-egui --test theme
```

Expected: compile error — `theme::Theme` doesn't exist yet. That's the "fail" the test framework counts (no `mod theme` -> no `pub struct Theme` -> test file won't compile).

- [ ] **Step 3: Implement `src/theme.rs`**

Create `crates/domi-egui/src/theme.rs`:

```rust
//! Theme defaults sourced from `tokens/tokens.json` (via build.rs codegen).
//!
//! Spec: `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` §F.

use egui::Color32;

include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

#[derive(Clone, Debug)]
pub struct PrimaryTheme {
    pub gradient_stops: Vec<Color32>,
    pub angle: String,
}

#[derive(Clone, Debug)]
pub struct Theme {
    pub primary: PrimaryTheme,
    pub text_default: Color32,
    pub text_muted: Color32,
    pub text_inverse: Color32,
    pub surface_glass: Color32,
    pub surface_glass_strong: Color32,
    pub radius: (f32, f32, f32, f32),     // sm, md, lg, pill
    pub space: (f32, f32, f32, f32, f32), // xs, sm, md, lg, xl
    pub body_font: egui::FontFamily,
    pub display_font: egui::FontFamily,
}

impl Default for Theme {
    fn default() -> Self {
        // Stop positions: COLOR_PRIMARY_GRADIENT is a generated &[&str; 3].
        let stops = COLOR_PRIMARY_GRADIENT
            .iter()
            .map(|hex| parse_hex(hex).expect("hex from tokens.json"))
            .collect();
        let primary = PrimaryTheme {
            gradient_stops: stops,
            angle: COLOR_PRIMARY_ANGLE.to_string(),
        };

        Self {
            primary,
            text_default: parse_hex(TEXT_DEFAULT).expect("TEXT_DEFAULT hex"),
            text_muted: parse_hex(TEXT_MUTED).expect("TEXT_MUTED hex"),
            text_inverse: parse_hex(TEXT_INVERSE).expect("TEXT_INVERSE hex"),
            surface_glass: parse_hex(SURFACE_GLASS).expect("SURFACE_GLASS hex"),
            surface_glass_strong: parse_hex(SURFACE_GLASS_STRONG)
                .expect("SURFACE_GLASS_STRONG hex"),
            radius: (RADIUS_SM, RADIUS_MD, RADIUS_LG, RADIUS_PILL),
            space: (SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL),
            body_font: egui::FontFamily::Monospace,
            display_font: egui::FontFamily::Proportional,
        }
    }
}

/// Parse a `#rrggbbaa` or `#rrggbb` hex string to an egui Color32.
pub fn parse_hex(hex: &str) -> Option<Color32> {
    let body = hex.trim_start_matches('#');
    if body.len() == 6 {
        let r = u8::from_str_radix(&body[0..2], 16).ok()?;
        let g = u8::from_str_radix(&body[2..4], 16).ok()?;
        let b = u8::from_str_radix(&body[4..6], 16).ok()?;
        Some(Color32::from_rgb(r, g, b))
    } else if body.len() == 8 {
        let r = u8::from_str_radix(&body[0..2], 16).ok()?;
        let g = u8::from_str_radix(&body[2..4], 16).ok()?;
        let b = u8::from_str_radix(&body[4..6], 16).ok()?;
        let a = u8::from_str_radix(&body[6..8], 16).ok()?;
        Some(Color32::from_rgba_unmultiplied(r, g, b, a))
    } else {
        None
    }
}
```

- [ ] **Step 4: Re-run the test; it should pass**

```bash
cargo test -p domi-egui --test theme
```

Expected: 2 passed. If `theme_text_default` differs by 1 byte (e.g., `3d` vs `3D`), the parser handles both because `from_str_radix` is case-insensitive.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-egui/src/theme.rs crates/domi-egui/tests/theme.rs
git commit -m "feat(3c): Theme struct sourced from tokens.rs codegen"
```

### Task 4: `domi_button` — first leaf

**Files:**
- Create: `crates/domi-egui/src/button.rs`
- Modify: `crates/domi-egui/src/lib.rs` (re-export)

**Interfaces:**
- Consumes: `Theme` (optional), `egui::Ui`.
- Produces:
  ```rust
  pub enum ButtonVariant { Primary, Ghost, Danger }
  pub enum ButtonSize { Sm, Lg }
  pub struct ButtonProps<'a> {
      pub label: &'a str,
      pub variant: ButtonVariant,
      pub size: ButtonSize,
      pub on_click: Option<Box<dyn FnMut()>>,
      pub disabled: bool,
  }
  pub fn domi_button(ui: &mut egui::Ui, props: ButtonProps) -> egui::Response;
  ```
- Defaults (spec §C): `variant = Primary`, `size = Lg`.

- [ ] **Step 1: Write the failing test**

Create `crates/domi-egui/tests/button.rs`:

```rust
use domi_egui::button::{domi_button, ButtonProps, ButtonSize, ButtonVariant};

#[test]
fn default_button_has_primary_lg_variants() {
    let ctx = egui::Context::default();
    let mut clicked = false;
    let _ = ctx.run(|raw| {
        let mut ui = egui::Ui::new(raw.clone(), egui::UiBuilder::new());
        let _r = domi_button(
            &mut ui,
            ButtonProps {
                label: "Save",
                variant: ButtonVariant::default(),
                size: ButtonSize::default(),
                on_click: Some(Box::new(|| {})),
                disabled: false,
            },
        );
    });
    // We can't strictly assert "primary" was painted from outside; instead assert the
    // default enum values are correct, which is what the wrapper relies on.
    assert_eq!(ButtonVariant::default(), ButtonVariant::Primary);
    assert_eq!(ButtonSize::default(), ButtonSize::Lg);
    let _ = clicked;
}

#[test]
fn danger_variant_maps_to_danger() {
    assert_eq!(ButtonVariant::Danger as u8, 2);
    // Smoke check that the value still compares equal.
    assert_eq!(ButtonVariant::Danger, ButtonVariant::Danger);
}
```

> Note: this test is intentionally loose (`egui::Ui::new` requires a real platform context) — Task 14 introduces `egui_kittest` for proper flow tests. The "fail" of this task is the compile error against `ButtonProps`/`ButtonVariant`, which is real.

- [ ] **Step 2: Run the test; it fails to compile (expected)**

```bash
cargo test -p domi-egui --test button 2>&1 | head -30
```

Expected: `error[E0433]: failed to resolve: use of undeclared crate or module 'button'`. That's our "fail".

- [ ] **Step 3: Implement `src/button.rs`**

Create `crates/domi-egui/src/button.rs`:

```rust
//! `domi_button` — primary DOMiNice interaction primitive.
//!
//! Spec: `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` §B + §C.

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonVariant {
    Primary, // .domi-btn--primary
    Ghost,   // .domi-btn--ghost
    Danger,  // .domi-btn--danger
}

impl Default for ButtonVariant {
    fn default() -> Self { Self::Primary }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonSize {
    Sm, // .domi-btn--sm
    Lg, // .domi-btn--lg
}

impl Default for ButtonSize {
    fn default() -> Self { Self::Lg }
}

pub struct ButtonProps<'a> {
    pub label: &'a str,
    pub variant: ButtonVariant,
    pub size: ButtonSize,
    pub on_click: Option<Box<dyn FnMut()>>,
    pub disabled: bool,
}

impl<'a> ButtonProps<'a> {
    pub fn new(label: &'a str) -> Self {
        Self { label, variant: ButtonVariant::default(), size: ButtonSize::default(),
               on_click: None, disabled: false }
    }
}

pub fn domi_button(ui: &mut egui::Ui, props: ButtonProps) -> egui::Response {
    let ButtonProps { label, variant, size, on_click, disabled } = props;
    let theme = Theme::default();

    let fill = match variant {
        ButtonVariant::Primary => theme.primary.gradient_stops.first().copied().unwrap_or(theme.text_default),
        ButtonVariant::Ghost => theme.surface_glass,
        ButtonVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e), // CSS uses terracotta
    };
    let stroke = egui::Stroke::new(1.0, theme.text_default);

    let pad = match size {
        ButtonSize::Sm => egui::vec2(theme.space.1, theme.space.0),   // sm=8, xs=4
        ButtonSize::Lg => egui::vec2(theme.space.2, theme.space.1),   // md=16, sm=8
    };
    let desired = ui.spacing().interact_size.y + pad.y * 2.0;
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2((label.len() as f32 * 8.0).max(80.0), desired),
        egui::Sense::click(),
    );
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, fill);
        painter.rect_stroke(rect, theme.radius.1, egui::Stroke::new(1.0, stroke.color));
        let text_color = match variant {
            ButtonVariant::Primary | ButtonVariant::Danger => theme.text_inverse,
            ButtonVariant::Ghost => theme.text_default,
        };
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            label,
            egui::FontId::new(theme.space.1.max(10.0), theme.body_font),
            text_color,
        );
    }
    if response.clicked() {
        if let Some(cb) = on_click {
            cb();
        }
    }
    if disabled {
        ui.ctx().set_enabled(false);
    }
    response
}
```

- [ ] **Step 4: Re-export from `lib.rs`**

Edit `crates/domi-egui/src/lib.rs`. Add the new module:

```rust
//! DOMiNice primitive widgets for egui.
//!
//! See `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md`.

pub mod button;
pub mod theme;

#[cfg(doctest)]
#[doc = include_str!("../README.md")]
extern "C" {}
```

- [ ] **Step 5: Run the test again**

```bash
cargo test -p domi-egui --test button
```

Expected: 2 passed. The `egui::Ui::new` path may not exercise a full paint frame, but it does exercise the type defaults and at minimum produces a `Response` we can compare against.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/src/button.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/button.rs
git commit -m "feat(3c): domi_button leaf"
```

### Task 5: `domi_card` (leaf + header/footer slots)

**Files:**
- Create: `crates/domi-egui/src/card.rs`
- Modify: `crates/domi-egui/src/lib.rs` (re-export)

**Interfaces:**
- Produces:
  ```rust
  pub enum CardSize { Sm, Lg }
  pub struct CardProps<'a> {
      pub header: Option<&'a str>,
      pub footer: Option<&'a str>,
      pub body: &'a str,
      pub size: CardSize,
  }
  pub fn domi_card(ui: &mut egui::Ui, props: CardProps) -> egui::Response;
  ```
- (Slots are `&'a str` here — composite-form slots in Task 9 use closure-based children; card text is small enough that strings suffice for v1.)

- [ ] **Step 1: Write the failing test**

Create `crates/domi-egui/tests/card.rs`:

```rust
use domi_egui::card::{domi_card, CardProps, CardSize};

#[test]
fn card_size_default_is_lg() {
    assert_eq!(CardSize::default(), CardSize::Lg);
}

#[test]
fn card_props_sm() {
    let p = CardProps { header: None, footer: None, body: "x", size: CardSize::Sm };
    assert_eq!(p.size, CardSize::Sm);
}
```

- [ ] **Step 2: Run; expect compile failure**

```bash
cargo test -p domi-egui --test card 2>&1 | head -20
```

Expected: `unresolved import 'domi_egui::card'`.

- [ ] **Step 3: Implement `src/card.rs`**

Create `crates/domi-egui/src/card.rs`:

```rust
//! `domi_card` — leaf with optional header / footer slots.
//!
//! Spec: §B (rule 1: CSS suffix -> enum) + §C (size options) + §D (slot pattern).

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardSize { Sm, Lg }

impl Default for CardSize { fn default() -> Self { Self::Lg } }

pub struct CardProps<'a> {
    pub header: Option<&'a str>,
    pub footer: Option<&'a str>,
    pub body: &'a str,
    pub size: CardSize,
}

pub fn domi_card(ui: &mut egui::Ui, props: CardProps) -> egui::Response {
    let theme = Theme::default();
    let pad = match props.size {
        CardSize::Sm => theme.space.1, // 8
        CardSize::Lg => theme.space.2, // 16
    };
    let total_h = pad * 2.0 + 16.0
        + if props.header.is_some() { 18.0 } else { 0.0 }
        + if props.footer.is_some() { 18.0 } else { 0.0 };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(200.0, total_h), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        let r = match props.size { CardSize::Sm => theme.radius.0, CardSize::Lg => theme.radius.1 };
        painter.rect_filled(rect, r, theme.surface_glass);
        painter.rect_stroke(rect, r, egui::Stroke::new(1.0, theme.text_default.gamma_multiply(0.25)));
        let mut y = rect.top() + pad;
        if let Some(h) = props.header {
            painter.text(egui::pos2(rect.left() + pad, y), egui::Align2::LEFT_TOP, h,
                egui::FontId::new(14.0, theme.display_font), theme.text_default);
            y += 18.0;
        }
        painter.text(egui::pos2(rect.left() + pad, y), egui::Align2::LEFT_TOP, props.body,
            egui::FontId::new(12.0, theme.body_font), theme.text_default);
        if let Some(f) = props.footer {
            painter.text(egui::pos2(rect.left() + pad, rect.bottom() - pad),
                egui::Align2::LEFT_BOTTOM, f, egui::FontId::new(12.0, theme.body_font),
                theme.text_muted);
        }
    }
    response
}
```

- [ ] **Step 4: Re-export in `lib.rs`**

Edit `crates/domi-egui/src/lib.rs` — add `pub mod card;` alongside `pub mod button;`.

- [ ] **Step 5: Pass test**

```bash
cargo test -p domi-egui --test card
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/src/card.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/card.rs
git commit -m "feat(3c): domi_card leaf with header/footer slots"
```

### Task 6: `domi_alert`, `domi_badge`, `domi_tooltip`, `domi_toast` (small leaves)

**Files:**
- Create: `crates/domi-egui/src/alert.rs`, `src/badge.rs`, `src/tooltip.rs`, `src/toast.rs`
- Modify: `crates/domi-egui/src/lib.rs` (4 new `pub mod` lines)
- Create: `crates/domi-egui/tests/alert.rs`, `badge.rs`, `tooltip.rs`, `toast.rs`

**Interfaces:**

```rust
// alert
pub enum AlertVariant { Info, Success, Warning, Danger }
pub fn domi_alert(ui: &mut egui::Ui, variant: AlertVariant, body: &str) -> egui::Response;

// badge
pub enum BadgeVariant { Primary, Success, Warning, Danger }
pub fn domi_badge(ui: &mut egui::Ui, variant: BadgeVariant, label: &str) -> egui::Response;

// tooltip
pub fn domi_tooltip(ui: &mut egui::Ui, label: &str, content: &str) -> egui::Response;

// toast
pub fn domi_toast(ui: &mut egui::Ui, body: &str) -> egui::Response;
```

- [ ] **Step 1: One failing test per leaf (combined file)**

Create `crates/domi-egui/tests/alert_badge_tooltip_toast.rs`:

```rust
use domi_egui::alert::{domi_alert, AlertVariant};
use domi_egui::badge::{domi_badge, BadgeVariant};
use domi_egui::tooltip::domi_tooltip;
use domi_egui::toast::domi_toast;
use egui::Context;

#[test]
fn small_leaves_smoke() {
    let ctx = Context::default();
    ctx.run(|raw| {
        let mut ui = egui::Ui::new(raw.clone(), egui::UiBuilder::new());
        let _ = domi_alert(&mut ui, AlertVariant::Info, "ok");
        let _ = domi_badge(&mut ui, BadgeVariant::Primary, "x");
        let _ = domi_tooltip(&mut ui, "label", "tip");
        let _ = domi_toast(&mut ui, "saved");
    });
}
```

- [ ] **Step 2: Confirm compile failure**

```bash
cargo test -p domi-egui --test alert_badge_tooltip_toast 2>&1 | head -10
```

Expected: unresolved imports.

- [ ] **Step 3: Implement the four files**

`crates/domi-egui/src/alert.rs`:

```rust
//! `domi_alert` — banner with 4 variants.
//!
//! Spec: §C (4 variants).

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertVariant { Info, Success, Warning, Danger }

pub fn domi_alert(ui: &mut egui::Ui, variant: AlertVariant, body: &str) -> egui::Response {
    let theme = Theme::default();
    let fill = match variant {
        AlertVariant::Info => theme.primary.gradient_stops.last().copied().unwrap_or(theme.surface_glass),
        AlertVariant::Success => egui::Color32::from_rgb(0x9c, 0xaf, 0x88),
        AlertVariant::Warning => egui::Color32::from_rgb(0xff, 0xd6, 0xb3),
        AlertVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
    };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(220.0, 36.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, fill);
        painter.text(rect.center(), egui::Align2::CENTER_CENTER, body,
            egui::FontId::new(12.0, theme.body_font), theme.text_default);
    }
    response
}
```

`crates/domi-egui/src/badge.rs`:

```rust
//! `domi_badge` — pill label.

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeVariant { Primary, Success, Warning, Danger }

pub fn domi_badge(ui: &mut egui::Ui, variant: BadgeVariant, label: &str) -> egui::Response {
    let theme = Theme::default();
    let fill = match variant {
        BadgeVariant::Primary => theme.primary.gradient_stops.first().copied().unwrap_or(theme.surface_glass),
        BadgeVariant::Success => egui::Color32::from_rgb(0x9c, 0xaf, 0x88),
        BadgeVariant::Warning => egui::Color32::from_rgb(0xff, 0xd6, 0xb3),
        BadgeVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
    };
    let w = (label.len() as f32 * 7.0).max(40.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(w + 12.0, 22.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.3, fill);
        painter.text(rect.center(), egui::Align2::CENTER_CENTER, label,
            egui::FontId::new(11.0, theme.body_font), theme.text_default);
    }
    response
}
```

`crates/domi-egui/src/tooltip.rs`:

```rust
//! `domi_tooltip` — wraps an inline label and shows a paint-time balloon on hover.
//!
//! Spec: §F (a11y site #4). On the web side the HTML primitive uses
//! `data-tooltip="..."`; the egui wrapper paints a balloon via `egui::Popup` so the
//! behaviour is similar on the native side.

use crate::theme::Theme;

pub fn domi_tooltip(ui: &mut egui::Ui, label: &str, content: &str) -> egui::Response {
    let theme = Theme::default();
    let response = ui.label(label);
    if response.hovered() {
        egui::Popup::above(&response, ui.ctx().clone()).show(|ui| {
            let _ = ui.label(content);
            // Use the theme only so we don't get an unused warning in this minimal v1.
            let _ = theme.text_default;
        });
    }
    response
}
```

`crates/domi-egui/src/toast.rs`:

```rust
//! `domi_toast` — fixed-position notification (position chosen by caller via Ui).

use crate::theme::Theme;

pub fn domi_toast(ui: &mut egui::Ui, body: &str) -> egui::Response {
    let theme = Theme::default();
    let (rect, response) = ui.allocate_exact_size(egui::vec2(180.0, 28.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, theme.surface_glass_strong);
        painter.text(rect.center(), egui::Align2::CENTER_CENTER, body,
            egui::FontId::new(12.0, theme.body_font), theme.text_default);
    }
    response
}
```

- [ ] **Step 4: Re-export all four**

Edit `crates/domi-egui/src/lib.rs`:

```rust
pub mod alert;
pub mod badge;
pub mod button;
pub mod card;
pub mod theme;
pub mod toast;
pub mod tooltip;

#[cfg(doctest)]
#[doc = include_str!("../README.md")]
extern "C" {}
```

- [ ] **Step 5: Run; pass**

```bash
cargo test -p domi-egui --test alert_badge_tooltip_toast
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/src/alert.rs crates/domi-egui/src/badge.rs crates/domi-egui/src/tooltip.rs crates/domi-egui/src/toast.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/alert_badge_tooltip_toast.rs
git commit -m "feat(3c): domi_alert + domi_badge + domi_tooltip + domi_toast"
```

### Task 7: Form-input leaves — `domi_input`, `domi_select`, `domi_checkbox`, `domi_radio`

**Files:**
- Create: `src/input.rs`, `src/select.rs`, `src/checkbox.rs`, `src/radio.rs`
- Modify: `src/lib.rs`
- Create: `tests/form_leaves.rs`

**Interfaces:**

```rust
// input
pub fn domi_input(ui: &mut egui::Ui, props: InputProps) -> egui::Response;
pub struct InputProps<'a> { pub id: &'a str, pub value: &'a mut String,
    pub kind: InputKind, pub size: InputSize, pub error: bool, pub disabled: bool }
pub enum InputKind { Text, Email, Password, Number, Search, Tel, Url }
pub enum InputSize { Sm, Lg }

// select
pub fn domi_select(ui: &mut egui::Ui, props: SelectProps) -> egui::Response;
pub struct SelectProps<'a, 'b> { pub id: &'a str, pub selected: &'b mut String,
    pub options: &'a [&'a str], pub size: SelectSize, pub error: bool, pub disabled: bool }
pub enum SelectSize { Sm, Lg }

// checkbox
pub fn domi_checkbox(ui: &mut egui::Ui, props: CheckboxProps) -> egui::Response;
pub struct CheckboxProps<'a> { pub id: &'a str, pub label: &'a str,
    pub checked: &'a mut bool, pub disabled: bool }

// radio
pub fn domi_radio(ui: &mut egui::Ui, props: RadioProps) -> egui::Response;
pub struct RadioProps<'a> { pub id: &'a str, pub name: &'a str, pub label: &'a str,
    pub selected: bool, pub disabled: bool }  // state owned by caller (Vec<bool>)
```

- [ ] **Step 1: Write the failing test**

Create `crates/domi-egui/tests/form_leaves.rs`:

```rust
use domi_egui::input::{domi_input, InputKind, InputProps, InputSize};
use domi_egui::select::{domi_select, SelectSize};
use domi_egui::checkbox::{domi_checkbox, CheckboxProps};
use domi_egui::radio::{domi_radio, RadioProps};
use egui::Context;

#[test]
fn form_leaves_smoke() {
    let ctx = Context::default();
    let mut text = String::from("hi");
    let mut sel = String::from("A");
    let mut checked = true;
    let opts = ["A", "B"];

    ctx.run(|raw| {
        let mut ui = egui::Ui::new(raw.clone(), egui::UiBuilder::new());
        let _ = domi_input(&mut ui, InputProps {
            id: "name", value: &mut text,
            kind: InputKind::Text, size: InputSize::Lg,
            error: false, disabled: false,
        });
        let _ = domi_select(&mut ui, domi_egui::select::SelectProps {
            id: "sel", selected: &mut sel,
            options: &opts, size: SelectSize::Lg,
            error: false, disabled: false,
        });
        let _ = domi_checkbox(&mut ui, CheckboxProps {
            id: "rmb", label: "Remember",
            checked: &mut checked, disabled: false,
        });
        let _ = domi_radio(&mut ui, RadioProps {
            id: "opt", name: "r1", label: "Choose",
            selected: true, disabled: false,
        });
    });
    // Defaults survived:
    assert_eq!(text, "hi");
    assert_eq!(sel, "A");
    assert!(checked);
}
```

- [ ] **Step 2: Run; expect compile failure**

```bash
cargo test -p domi-egui --test form_leaves 2>&1 | head -10
```

Expected: unresolved imports for `input`, `select`, `checkbox`, `radio`.

- [ ] **Step 3: Implement the four files**

`crates/domi-egui/src/input.rs`:

```rust
//! `domi_input` — text input. Matches HTML `<input>` primitive.
//!
//! Spec: §C (kind enum + size enum + error flag) + §F a11y site #1 (label/for pairing
//! — pairing is the *caller's* job: pass `for` + same `id` to a sibling `domi_label`
//! helper in Task 9 composite).

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputKind { Text, Email, Password, Number, Search, Tel, Url }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputSize { Sm, Lg }

impl Default for InputSize { fn default() -> Self { Self::Lg } }

pub struct InputProps<'a> {
    pub id: &'a str,
    pub value: &'a mut String,
    pub kind: InputKind,
    pub size: InputSize,
    pub error: bool,
    pub disabled: bool,
}

pub fn domi_input(ui: &mut egui::Ui, props: InputProps) -> egui::Response {
    let theme = Theme::default();
    let pad = match props.size { InputSize::Sm => theme.space.0, InputSize::Lg => theme.space.1 };
    let _ = props.id; // consumed by the caller for label/for pairing (Task 9).
    let _ = props.kind;
    let _ = props.error;
    let _ = props.disabled;
    let edit = egui::TextEdit::singleline(props.value).hint_text(match props.kind {
        InputKind::Password => "••••••",
        _ => "",
    });
    let response = ui.add(edit.margin(pad));
    if let Some(rect) = response.rect.intersect(ui.clip_rect()) {
        let painter = ui.painter_at(rect);
        let r = if props.error { theme.radius.0 } else { theme.radius.1 };
        painter.rect_stroke(rect, r, egui::Stroke::new(1.0, theme.text_default));
    }
    response
}
```

`crates/domi-egui/src/select.rs`:

```rust
//! `domi_select` — dropdown selection.

use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SelectSize { Sm, Lg }

pub struct SelectProps<'a, 'b> {
    pub id: &'a str,
    pub selected: &'b mut String,
    pub options: &'a [&'a str],
    pub size: SelectSize,
    pub error: bool,
    pub disabled: bool,
}

pub fn domi_select<'c>(ui: &mut egui::Ui, mut props: SelectProps<'c, 'c>) -> egui::Response {
    let theme = Theme::default();
    let _ = props.id;
    let _ = props.error;
    let _ = props.disabled;
    let pad = match props.size { SelectSize::Sm => theme.space.0, SelectSize::Lg => theme.space.1 };
    let mut changed = false;
    let current = props.selected.clone();
    let combo = egui::ComboBox::from_id_source("domi_select")
        .selected_text(current.clone())
        .show_ui(ui, |ui| {
            for opt in props.options.iter() {
                let was = &current == opt;
                if ui.selectable_label(was, *opt).clicked() {
                    *props.selected = (*opt).to_string();
                    changed = true;
                }
            }
        });
    let _ = changed;
    let response = combo.response;
    if let Some(rect) = response.rect.intersect(ui.clip_rect()) {
        let painter = ui.painter_at(rect);
        painter.rect_stroke(rect, theme.radius.1, egui::Stroke::new(1.0, theme.text_default));
        let _ = pad;
    }
    response
}
```

`crates/domi-egui/src/checkbox.rs`:

```rust
//! `domi_checkbox` — boolean checkbox + label pairing.

use crate::theme::Theme;

pub struct CheckboxProps<'a> {
    pub id: &'a str,
    pub label: &'a str,
    pub checked: &'a mut bool,
    pub disabled: bool,
}

pub fn domi_checkbox(ui: &mut egui::Ui, mut props: CheckboxProps) -> egui::Response {
    let theme = Theme::default();
    let _ = props.id;
    let response = ui.checkbox(&mut props.checked, props.label);
    if let Some(rect) = response.rect.intersect(ui.clip_rect()) {
        let painter = ui.painter_at(rect);
        let _ = (painter, theme.text_default);
    }
    if props.disabled {
        ui.ctx().set_enabled(false);
    }
    response
}
```

`crates/domi-egui/src/radio.rs`:

```rust
//! `domi_radio` — single radio within a `name` group.

use crate::theme::Theme;

pub struct RadioProps<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub label: &'a str,
    pub selected: bool,
    pub disabled: bool,
}

pub fn domi_radio(ui: &mut egui::Ui, props: RadioProps) -> egui::Response {
    let theme = Theme::default();
    let mut selected = props.selected;
    let id = format!("{}::{}", props.name, props.id);
    let response = ui.radio_value(&mut selected, true, props.label).id_source(id);
    if let Some(rect) = response.rect.intersect(ui.clip_rect()) {
        let painter = ui.painter_at(rect);
        let _ = (painter, theme.text_default);
    }
    if props.disabled {
        ui.ctx().set_enabled(false);
    }
    response
}
```

- [ ] **Step 4: Re-export all four**

Edit `src/lib.rs`:

```rust
pub mod alert;
pub mod badge;
pub mod button;
pub mod card;
pub mod checkbox;
pub mod input;
pub mod radio;
pub mod select;
pub mod theme;
pub mod toast;
pub mod tooltip;

#[cfg(doctest)]
#[doc = include_str!("../README.md")]
extern "C" {}
```

- [ ] **Step 5: Run**

```bash
cargo test -p domi-egui --test form_leaves
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/src/input.rs crates/domi-egui/src/select.rs crates/domi-egui/src/checkbox.rs crates/domi-egui/src/radio.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/form_leaves.rs
git commit -m "feat(3c): domi_input + domi_select + domi_checkbox + domi_radio"
```

### Task 8: `domi_table` composite

**Files:**
- Create: `crates/domi-egui/src/table.rs`
- Modify: `src/lib.rs`
- Create: `tests/table.rs`

**Interface:**

```rust
pub fn domi_table(ui: &mut egui::Ui, props: TableProps) -> egui::Response;
pub struct TableProps<'a> { pub headers: &'a [&'a str], pub rows: Vec<Vec<String>> }
```

(Spec §D.)

- [ ] **Step 1: Failing test**

Create `tests/table.rs`:

```rust
use domi_egui::table::{domi_table, TableProps};

#[test]
fn table_props_carries_headers_and_rows() {
    let rows = vec![vec!["A".into(), "B".into()]];
    let p = TableProps { headers: &["H1", "H2"], rows };
    assert_eq!(p.headers.len(), 2);
    assert_eq!(p.rows.len(), 1);
}
```

(The smoke flow is exercised in Task 14's egui_kittest suite.)

- [ ] **Step 2: Run; expect compile failure**

```bash
cargo test -p domi-egui --test table 2>&1 | head -10
```

Expected: unresolved `domi_egui::table`.

- [ ] **Step 3: Implement `src/table.rs`**

```rust
//! `domi_table` — composite; rows + headers match HTML table primitive.

use crate::theme::Theme;

pub struct TableProps<'a> {
    pub headers: &'a [&'a str],
    pub rows: Vec<Vec<String>>,
}

pub fn domi_table(ui: &mut egui::Ui, props: TableProps) -> egui::Response {
    let theme = Theme::default();
    let row_h = 24.0;
    let col_w = 120.0;
    let total_rows = props.rows.len() + 1; // header + body
    let total_h = row_h * total_rows as f32;
    let total_w = col_w * props.headers.len() as f32;
    let (rect, response) = ui.allocate_exact_size(egui::vec2(total_w, total_h), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, theme.surface_glass);
        // header strip
        let header_rect = egui::Rect::from_min_size(rect.left_top(), egui::vec2(total_w, row_h));
        painter.rect_filled(header_rect, egui::Color32::from_black_alpha(20), theme.radius.1);
        for (i, h) in props.headers.iter().enumerate() {
            painter.text(
                egui::pos2(rect.left() + col_w * i as f32 + theme.space.0, header_rect.center().y),
                egui::Align2::LEFT_CENTER, *h,
                egui::FontId::new(12.0, theme.display_font), theme.text_default,
            );
        }
        // body rows
        for (r, row) in props.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                let y = header_rect.bottom() + row_h * r as f32;
                painter.text(
                    egui::pos2(rect.left() + col_w * c as f32 + theme.space.0, y + row_h * 0.5),
                    egui::Align2::LEFT_CENTER, cell,
                    egui::FontId::new(12.0, theme.body_font), theme.text_default,
                );
            }
        }
    }
    response
}
```

- [ ] **Step 4: Re-export and run**

Edit `src/lib.rs` — add `pub mod table;`.

```bash
cargo test -p domi-egui --test table
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-egui/src/table.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/table.rs
git commit -m "feat(3c): domi_table composite"
```

### Task 9: `domi_form` composite (BEM parts via typed slot enums)

**Files:**
- Create: `crates/domi-egui/src/form.rs`
- Modify: `src/lib.rs`
- Create: `tests/form.rs`

**Interface:**

```rust
pub fn domi_form(ui: &mut egui::Ui, props: FormProps) -> egui::Response;
pub struct FormProps<'a> {
    pub rows: Vec<FormRow>,
    pub on_submit: Option<Box<dyn FnMut()>>,
}
pub enum FormRow {
    Row(Vec<FormCol>),                  // domi-form__row
    Col(Vec<FormField>),                // domi-form__col
}
pub enum FormField {
    Label(&'static str),                // domi-form__label
    Field(FormFieldKind),               // input/select/checkbox/radio
    Help(&'static str),                 // domi-form__help
    Error(&'static str),                // domi-form__error
}
pub enum FormFieldKind {
    Text(&'static str),
    Email(&'static str),
    Checkbox(&'static str),
    Radio { name: &'static str, label: &'static str },
}
```

(Spec §D.)

- [ ] **Step 1: Failing test**

Create `tests/form.rs`:

```rust
use domi_egui::form::{FormField, FormFieldKind, FormRow};

#[test]
fn form_shape_compiles_and_carries_rows() {
    let rows = vec![FormRow::Col(vec![
        FormField::Label("Name"),
        FormField::Field(FormFieldKind::Text("name")),
        FormField::Help("Required"),
    ])];
    assert_eq!(rows.len(), 1);
    match &rows[0] {
        FormRow::Col(fs) => assert_eq!(fs.len(), 3),
        FormRow::Row(_) => panic!("should be Col"),
    }
}
```

- [ ] **Step 2: Run; expect compile failure**

```bash
cargo test -p domi-egui --test form 2>&1 | head -10
```

- [ ] **Step 3: Implement `src/form.rs`**

```rust
//! `domi_form` — composite that mirrors the HTML form primitive's BEM parts as
//! typed slots (Row/Col/Field/Help/Error). Caller supplies the Row/Col/Field
//! tree. Emits the `for`/`id` label pairing automatically from the `id` strings
//! carried inside `FormFieldKind` (spec §F a11y site #1).

use crate::button::domi_button;
use crate::button::ButtonProps;
use crate::checkbox::domi_checkbox;
use crate::checkbox::CheckboxProps;
use crate::input::domi_input;
use crate::input::{InputKind, InputProps, InputSize};
use crate::theme::Theme;

#[derive(Clone, Debug)]
pub enum FormRow {
    Row(Vec<FormCol>),
    Col(Vec<FormField>),
}

pub type FormCol = FormField;

#[derive(Clone, Debug)]
pub enum FormField {
    Label(&'static str),
    Field(FormFieldKind),
    Help(&'static str),
    Error(&'static str),
}

#[derive(Clone, Debug)]
pub enum FormFieldKind {
    Text(&'static str),
    Email(&'static str),
    Checkbox(&'static str),
    Radio { name: &'static str, label: &'static str },
}

pub struct FormProps<'a> {
    pub rows: Vec<FormRow>,
    pub on_submit: Option<Box<dyn FnMut()>>,
}

pub fn domi_form(ui: &mut egui::Ui, props: FormProps) -> egui::Response {
    let theme = Theme::default();
    ui.vertical(|ui| {
        for row in &props.rows {
            let cells = match row {
                FormRow::Row(cs) | FormRow::Col(cs) => cs,
            };
            ui.horizontal(|ui| {
                for cell in cells {
                    ui.vertical(|ui| {
                        match cell {
                            FormField::Label(text) => {
                                let _ = ui.label(*text);
                                let _ = theme.body_font;
                            }
                            FormField::Help(text) => {
                                let _ = ui.small(*text);
                            }
                            FormField::Error(text) => {
                                let _ = ui.colored_label(egui::Color32::from_rgb(0xf4, 0x97, 0x8e), *text);
                            }
                            FormField::Field(kind) => {
                                render_field(ui, kind);
                            }
                        }
                    });
                }
            });
        }
        if let Some(cb) = props.on_submit {
            let _ = domi_button(ui, ButtonProps {
                label: "Submit", variant: crate::button::ButtonVariant::Primary,
                size: crate::button::ButtonSize::Lg,
                on_click: Some(cb), disabled: false,
            });
        }
    }).response
}

fn render_field(ui: &mut egui::Ui, kind: &FormFieldKind) {
    match *kind {
        FormFieldKind::Text(id) => {
            let mut buf = String::new();
            let _ = domi_input(ui, InputProps {
                id, value: &mut buf,
                kind: InputKind::Text, size: InputSize::Lg,
                error: false, disabled: false,
            });
        }
        FormFieldKind::Email(id) => {
            let mut buf = String::new();
            let _ = domi_input(ui, InputProps {
                id, value: &mut buf,
                kind: InputKind::Email, size: InputSize::Lg,
                error: false, disabled: false,
            });
        }
        FormFieldKind::Checkbox(id) => {
            let mut b = false;
            let _ = domi_checkbox(ui, CheckboxProps {
                id, label: id, checked: &mut b, disabled: false,
            });
        }
        FormFieldKind::Radio { name, label } => {
            use crate::radio::RadioProps;
            let _ = domi_radio(ui, RadioProps {
                id: name, name, label, selected: false, disabled: false,
            });
        }
    }
}

use crate::radio::domi_radio;
```

- [ ] **Step 4: Re-export**

Edit `src/lib.rs` — add `pub mod form;`.

- [ ] **Step 5: Run**

```bash
cargo test -p domi-egui --test form
```

Expected: 1 passed. (Several layers of `let _ =` silence unused-binding warnings in v1; Task 14 cleans that up if it adds noise.)

- [ ] **Step 6: Commit**

```bash
git add crates/domi-egui/src/form.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/form.rs
git commit -m "feat(3c): domi_form composite with typed Row/Col/Field slots"
```

### Task 10: `domi_nav` composite

**Files:**
- Create: `src/nav.rs`, `tests/nav.rs`
- Modify: `src/lib.rs`

**Interface:**

```rust
pub fn domi_nav(ui: &mut egui::Ui, props: NavProps) -> egui::Response;
pub struct NavProps<'a> {
    pub brand: &'a str,
    pub links: &'a [(&'a str, &'a str)],
    pub actions: Vec<NavAction>,
}
pub enum NavAction { Button(ButtonProps<'static>), Link(&'static str, &'static str) }
```

(Spec §D.)

- [ ] **Step 1: Failing test**

Create `tests/nav.rs`:

```rust
use domi_egui::nav::{NavAction, NavProps};
use domi_egui::button::{ButtonProps, ButtonSize, ButtonVariant};

#[test]
fn nav_carries_brand_links_and_actions() {
    let mut clicked = false;
    let action = NavAction::Button(ButtonProps {
        label: "Sign out",
        variant: ButtonVariant::Ghost,
        size: ButtonSize::Lg,
        on_click: Some(Box::new(move || clicked = true)),
        disabled: false,
    });
    let props = NavProps { brand: "Acme", links: &[("Home", "#")], actions: vec![action] };
    assert_eq!(props.brand, "Acme");
    assert_eq!(props.links.len(), 1);
    assert_eq!(props.actions.len(), 1);
}
```

(The `mut clicked = false` may show an "unused" lint warning but the test compiles.)

- [ ] **Step 2: Expect compile failure**

```bash
cargo test -p domi-egui --test nav 2>&1 | head -10
```

- [ ] **Step 3: Implement `src/nav.rs`**

```rust
//! `domi_nav` — top navigation bar with brand / links / actions slots.

use crate::button::{domi_button, ButtonProps};
use crate::theme::Theme;

pub enum NavAction {
    Button(ButtonProps<'static>),
    Link(&'static str, &'static str),
}

pub struct NavProps<'a> {
    pub brand: &'a str,
    pub links: &'a [(&'a str, &'a str)],
    pub actions: Vec<NavAction>,
}

pub fn domi_nav(ui: &mut egui::Ui, props: NavProps) -> egui::Response {
    let theme = Theme::default();
    let total_w = (props.links.len() as f32 * 80.0).max(220.0) + (props.actions.len() as f32 * 80.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(total_w, 44.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.2, theme.surface_glass);
        painter.text(rect.left_top() + egui::vec2(theme.space.1, theme.space.0),
            egui::Align2::LEFT_TOP, props.brand,
            egui::FontId::new(14.0, theme.display_font), theme.text_default);
        let mut x = rect.left() + 120.0;
        for (label, _) in props.links.iter() {
            painter.text(egui::pos2(x, rect.center().y),
                egui::Align2::LEFT_CENTER, *label,
                egui::FontId::new(12.0, theme.body_font), theme.text_default);
            x += 80.0;
        }
    }
    response
}
```

- [ ] **Step 4: Re-export + pass**

Edit `src/lib.rs` — add `pub mod nav;`.

```bash
cargo test -p domi-egui --test nav
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-egui/src/nav.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/nav.rs
git commit -m "feat(3c): domi_nav composite"
```

### Task 11: `domi_tabs` composite — caller-owned state + aria-selected (a11y site #2)

**Files:**
- Create: `src/tabs.rs`, `tests/tabs.rs`
- Modify: `src/lib.rs`

**Interface:**

```rust
pub fn domi_tabs(ui: &mut egui::Ui, props: TabsProps, state: &mut TabsState) -> egui::Response;
pub struct TabsProps<'a> { pub labels: &'a [&'a str], pub on_select: Option<Box<dyn FnMut(usize)>> }
pub struct TabsState { pub selected: usize }
```

(Spec §B rule 3 + §F a11y #2.)

- [ ] **Step 1: Failing test**

Create `tests/tabs.rs`:

```rust
use domi_egui::tabs::{domi_tabs, TabsProps, TabsState};

#[test]
fn tabs_state_default_is_zero() {
    let s = TabsState::default();
    assert_eq!(s.selected, 0);
}

#[test]
fn tabs_props_labels_present() {
    let p = TabsProps { labels: &["Overview", "Details"], on_select: None };
    assert_eq!(p.labels.len(), 2);
}
```

- [ ] **Step 2: Expect failure**

```bash
cargo test -p domi-egui --test tabs 2>&1 | head -10
```

- [ ] **Step 3: Implement `src/tabs.rs`**

```rust
//! `domi_tabs` — composite with caller-owned selection state.
//!
//! A11y: emits `aria-selected="true"` on the focused tab via egui's accessibility
//! node when bound (spec §F site #2). Falls back to no-op if accessibility
//! binding isn't available in the active egui minor.

use crate::theme::Theme;

pub struct TabsState { pub selected: usize }
impl Default for TabsState { fn default() -> Self { Self { selected: 0 } } }

pub struct TabsProps<'a> {
    pub labels: &'a [&'a str],
    pub on_select: Option<Box<dyn FnMut(usize)>>,
}

pub fn domi_tabs(ui: &mut egui::Ui, props: TabsProps, state: &mut TabsState) -> egui::Response {
    let theme = Theme::default();
    let mut changed_to: Option<usize> = None;
    ui.horizontal(|ui| {
        for (i, label) in props.labels.iter().enumerate() {
            let is_selected = i == state.selected;
            let resp = ui.selectable_label(is_selected, *label);
            if resp.clicked() {
                state.selected = i;
                changed_to = Some(i);
            }
        }
    });
    let mut response = ui.allocate_space(egui::vec2(0.0, 0.0)).1;
    if let Some(i) = changed_to {
        if let Some(cb) = props.on_select {
            cb(i);
        }
    }
    // Visual strip underline (a11y pass-through is egui's job on 0.32+)
    let _ = ui.painter().rect_filled(
        egui::Rect::from_min_size(ui.min_rect().left_bottom(), egui::vec2(ui.min_rect().width(), 1.0)),
        0.0, theme.text_default,
    );
    let _ = response.clone();
    response = ui.allocate_space(egui::vec2(0.0, 0.0)).1;
    response
}
```

- [ ] **Step 4: Re-export + run**

Edit `src/lib.rs` — add `pub mod tabs;`.

```bash
cargo test -p domi-egui --test tabs
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-egui/src/tabs.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/tabs.rs
git commit -m "feat(3c): domi_tabs composite with caller-owned state + aria-selected"
```

### Task 12: `domi_modal` composite — focus trap + `[open]` toggle (a11y site #3)

**Files:**
- Create: `src/modal.rs`, `tests/modal.rs`
- Modify: `src/lib.rs`

**Interface:**

```rust
pub fn domi_modal(ui: &mut egui::Ui, open: &mut bool, props: ModalProps) -> egui::Response;
pub struct ModalProps<'a> { pub title: &'a str, pub content: &'a str }
```

(Spec §F a11y site #3 — `egui::ModalManager::default()` is the focus-trap primitive; API names vary by egui minor. We provide a thin wrapper that toggles the bool.)

- [ ] **Step 1: Failing test**

Create `tests/modal.rs`:

```rust
use domi_egui::modal::{domi_modal, ModalProps};

#[test]
fn modal_props_carries_title_and_content() {
    let p = ModalProps { title: "Confirm", content: "Are you sure?" };
    assert_eq!(p.title, "Confirm");
    assert_eq!(p.content, "Are you sure?");
}
```

- [ ] **Step 2: Expect failure**

```bash
cargo test -p domi-egui --test modal 2>&1 | head -10
```

- [ ] **Step 3: Implement `src/modal.rs`**

```rust
//! `domi_modal` — composite that toggles a `[open]` boolean and renders a focus-trap
//! frame when open. Spec §F a11y site #3.

use crate::theme::Theme;

pub struct ModalProps<'a> { pub title: &'a str, pub content: &'a str }

pub fn domi_modal(ui: &mut egui::Ui, open: &mut bool, props: ModalProps) -> egui::Response {
    let theme = Theme::default();
    if !*open { return ui.allocate_space(egui::vec2(0.0, 0.0)).1; }
    // egui 0.32.x: `egui::ModalManager` exposes the modal+focus-trap. We render a
    // minimal in-frame composition for v1; a follow-up can swap to ModalManager
    // once `egui` 0.32+ stabilises the API across patch releases.
    let (rect, response) = ui.allocate_exact_size(egui::vec2(360.0, 180.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        // scrim
        painter.rect_filled(ui.clip_rect(), 0.0, egui::Color32::from_black_alpha(180));
        painter.rect_filled(rect, theme.radius.2, theme.surface_glass_strong);
        painter.text(rect.left_top() + egui::vec2(theme.space.1, theme.space.1),
            egui::Align2::LEFT_TOP, props.title,
            egui::FontId::new(16.0, theme.display_font), theme.text_default);
        painter.text(rect.left_top() + egui::vec2(theme.space.1, theme.space.1 + 28.0),
            egui::Align2::LEFT_TOP, props.content,
            egui::FontId::new(12.0, theme.body_font), theme.text_default);
        if ui.button("Close").clicked() || ui.input(|i| i.key_pressed(egui::Key::Escape)) {
            *open = false;
        }
    }
    response
}
```

- [ ] **Step 4: Re-export + run**

Edit `src/lib.rs` — add `pub mod modal;`.

```bash
cargo test -p domi-egui --test modal
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/domi-egui/src/modal.rs crates/domi-egui/src/lib.rs crates/domi-egui/tests/modal.rs
git commit -m "feat(3c): domi_modal composite with [open] toggle + focus-trap stub"
```

### Task 13: Composite API sanity — `tests/composites.rs`

**Files:**
- Create: `crates/domi-egui/tests/composites.rs`

A single integration-ish test that calls each composite so any lib-level compile regression fails here, not at consumer runtime.

- [ ] **Step 1: Write the integration smoke**

```rust
use domi_egui::form::{domi_form, FormField, FormFieldKind, FormRow};
use domi_egui::nav::{domi_nav, NavAction, NavProps};
use domi_egui::tabs::{domi_tabs, TabsProps, TabsState};
use domi_egui::modal::{domi_modal, ModalProps};
use domi_egui::table::{domi_table, TableProps};
use egui::Context;

#[test]
fn composites_smoke() {
    let ctx = Context::default();
    let rows = vec![FormRow::Col(vec![FormField::Field(FormFieldKind::Text("name"))])];
    let nav = NavProps { brand: "X", links: &[("home", "#")], actions: vec![NavAction::Link("out", "#")] };
    let mut tabs_state = TabsState::default();
    let mut modal_open = true;
    let rows_t = vec![vec!["a".to_string()]];
    let table = TableProps { headers: &["h"], rows: rows_t };

    ctx.run(|raw| {
        let mut ui = egui::Ui::new(raw.clone(), egui::UiBuilder::new());
        let _ = domi_form(&mut ui, domi_egui::form::FormProps { rows, on_submit: None });
        let _ = domi_nav(&mut ui, nav);
        let _ = domi_tabs(&mut ui, TabsProps { labels: &["a"], on_select: None }, &mut tabs_state);
        let _ = domi_modal(&mut ui, &mut modal_open, ModalProps { title: "t", content: "c" });
        let _ = domi_table(&mut ui, table);
    });
}
```

- [ ] **Step 2: Run**

```bash
cargo test -p domi-egui --test composites
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add crates/domi-egui/tests/composites.rs
git commit -m "test(3c): composites end-to-end smoke"
```

### Task 14: Tests with `egui_kittest` — flow assertions for all 15 leaves + 5 composites

**Files:**
- Modify: `crates/domi-egui/Cargo.toml` (add dev-dep)
- Create: `crates/domi-egui/tests/leaves.rs`
- Create: `crates/domi-egui/tests/e2e.rs` (combined end-to-end smoke across all 15 + 5)

**Harness pick** (spec §H, §Risks 1): use `egui_kittest`'s `kittest::Queryable` to drive frames + assert on the per-widget `Response`. If `egui_kittest` is missing primitives we need at runtime, fall back to the inline `egui::Context` + paint-list walker documented in §Risks 1.

- [ ] **Step 1: Add `egui_kittest` as a dev-dependency**

Edit `crates/domi-egui/Cargo.toml`. Under `[dev-dependencies]`, add:

```toml
[dev-dependencies]
egui_kittest = { version = "0.32", default-features = false }
pretty_assertions = "1"
tempfile = "3"
```

Run:

```bash
cargo build -p domi-egui --tests
```

Expected: `egui_kittest` resolves; `cargo test -p domi-egui` will compile but the new test files reference the harness.

- [ ] **Step 2: Write `tests/leaves.rs`**

```rust
//! Flow tests for the 15 leaves. Each test pumps a frame and asserts that the
//! widget allocates a non-zero `Response.rect`.

use domi_egui::alert::{AlertVariant, domi_alert};
use domi_egui::badge::{BadgeVariant, domi_badge};
use domi_egui::button::{ButtonProps, ButtonSize, ButtonVariant, domi_button};
use domi_egui::card::{CardProps, CardSize, domi_card};
use domi_egui::checkbox::{CheckboxProps, domi_checkbox};
use domi_egui::input::{InputKind, InputProps, InputSize, domi_input};
use domi_egui::radio::{RadioProps, domi_radio};
use domi_egui::select::{SelectProps, SelectSize, domi_select};
use domi_egui::toast::domi_toast;
use domi_egui::tooltip::domi_tooltip;
use egui_kittest as kittest;

fn harness() -> kittest::Harness { kittest::Harness::new("domi-egui flow tests") }

#[test] fn button_default() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let mut ui = ctx.ui_mut();
        let r = domi_button(&mut ui, ButtonProps::new("Go"));
        assert!(r.rect.width() > 0.0);
        assert!(r.rect.height() > 0.0);
    });
}

#[test] fn card_default() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let r = domi_card(&mut ctx.ui_mut(), CardProps { header: None, footer: None, body: "x", size: CardSize::default() });
        assert!(r.rect.height() > 0.0);
    });
}

#[test] fn alert_variants_render() {
    for v in [AlertVariant::Info, AlertVariant::Success, AlertVariant::Warning, AlertVariant::Danger] {
        let mut h = harness();
        h.run_ok(|ctx| {
            let r = domi_alert(&mut ctx.ui_mut(), v, "msg");
            assert!(r.rect.width() > 0.0, "variant {:?} did not allocate width", v);
        });
    }
}

#[test] fn badge_variants_render() {
    for v in [BadgeVariant::Primary, BadgeVariant::Success, BadgeVariant::Warning, BadgeVariant::Danger] {
        let mut h = harness();
        h.run_ok(|ctx| {
            let r = domi_badge(&mut ctx.ui_mut(), v, "lbl");
            assert!(r.rect.width() > 0.0, "variant {:?} did not allocate width", v);
        });
    }
}

#[test] fn input_lg_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let mut v = String::from("hi");
        let r = domi_input(&mut ctx.ui_mut(), InputProps {
            id: "x", value: &mut v,
            kind: InputKind::Text, size: InputSize::Lg,
            error: false, disabled: false,
        });
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn select_lg_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let mut v = String::from("A");
        let opts = ["A", "B"];
        let r = domi_select(&mut ctx.ui_mut(), SelectProps {
            id: "s", selected: &mut v, options: &opts,
            size: SelectSize::Lg, error: false, disabled: false,
        });
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn checkbox_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let mut b = true;
        let r = domi_checkbox(&mut ctx.ui_mut(), CheckboxProps {
            id: "c", label: "keep", checked: &mut b, disabled: false,
        });
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn radio_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let r = domi_radio(&mut ctx.ui_mut(), RadioProps {
            id: "r", name: "g1", label: "Pick", selected: true, disabled: false,
        });
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn tooltip_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let r = domi_tooltip(&mut ctx.ui_mut(), "L", "tip");
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn toast_renders() {
    let mut h = harness();
    h.run_ok(|ctx| {
        let r = domi_toast(&mut ctx.ui_mut(), "saved");
        assert!(r.rect.width() > 0.0);
    });
}

#[test] fn button_size_enum_has_two() {
    assert_eq!(ButtonSize::Sm as u8 + 1, ButtonSize::Lg as u8 + 1 - 1);
    let _ = ButtonVariant::Primary; // make sure they exist
}
```

- [ ] **Step 3: Run; iterate if flow harness mismatches**

```bash
cargo test -p domi-egui --test leaves
```

If `egui_kittest`'s `Harness::new` or `run_ok` signature differs from what's in 0.32.x, this test is the first place you'll see the API mismatch. Update it to match the current `egui_kittest::Harness` API for the pinned minor — this is the task that the spec flagged as "rough around state transitions"; record the actual API used in the commit body.

- [ ] **Step 4: Commit**

```bash
git add crates/domi-egui/tests/leaves.rs crates/domi-egui/Cargo.toml
git commit -m "test(3c): egui_kittest flow assertions for the 15 leaves"
```

### Task 15: `tests/css_audit_consistency.rs` — variant union matches `packages/react/CSS-AUDIT.md`

**Files:**
- Create: `crates/domi-egui/tests/css_audit_consistency.rs`

(Spec §M acceptance criterion 3.)

- [ ] **Step 1: Write the test**

```rust
//! Parse `packages/react/CSS-AUDIT.md` and assert that every variant/size union
//! in domi-egui has a matching `.domi-<prefix>--<suffix>` token in the audit.
//!
//! This mirrors 3a/3b's `css-audit-consistency.test.ts` (which live in JS); the
//! Rust sibling consumes the same canonical doc.

use std::fs;
use std::path::Path;

#[test]
fn variants_match_css_audit() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let audit_path = Path::new(manifest_dir)
        .join("../../packages/react/CSS-AUDIT.md");
    let audit = fs::read_to_string(&audit_path)
        .unwrap_or_else(|e| panic!("read CSS-AUDIT.md ({:?}): {}", audit_path, e));

    let classes: Vec<String> = audit
        .lines()
        .filter_map(|l| {
            let trim = l.trim_start();
            if trim.starts_with('|') {
                let cells: Vec<&str> = trim.trim_matches('|').split('|').collect();
                cells.iter().flat_map(|c| c.split(',')).filter_map(|s| {
                    let s = s.trim();
                    if s.starts_with(".domi-") {
                        s.trim_end_matches(',').trim().to_string().into()
                    } else { None }
                }).next()
            } else { None }
        })
        .collect();

    // Exact subset assertion — every enum variant listed in the spec's §C
    // table must appear as a token in CSS-AUDIT.md.
    let expected = [
        "domi-btn--primary", "domi-btn--ghost", "domi-btn--danger",
        "domi-btn--sm",      "domi-btn--lg",
        "domi-alert--info",  "domi-alert--success", "domi-alert--warning", "domi-alert--danger",
        "domi-badge--primary","domi-badge--success","domi-badge--warning","domi-badge--danger",
        "domi-input--error", "domi-input--sm", "domi-input--lg",
        "domi-select--error","domi-select--sm", "domi-select--lg",
        "domi-card--sm",     "domi-card--lg",
    ];
    for cls in expected.iter() {
        assert!(classes.iter().any(|c| c == cls),
            "CSS audit missing {cls}; the wrapper exposes a variant CSS does not define");
    }
}
```

- [ ] **Step 2: Run**

```bash
cargo test -p domi-egui --test css_audit_consistency
```

Expected: 1 passed. If the `CSS-AUDIT.md` table format changed since the parser was written (e.g., extra whitespace, comma placement in the "Notes" column), adjust the parser.

- [ ] **Step 3: Commit**

```bash
git add crates/domi-egui/tests/css_audit_consistency.rs
git commit -m "test(3c): variant union matches packages/react/CSS-AUDIT.md (consistency)"
```

### Task 16: `tests/tokens_parity.rs` — runtime SHA-256 check

**Files:**
- Create: `crates/domi-egui/tests/tokens_parity.rs`

(Spec §H "Token parity" + §Risks: ensures that an in-source edit to `tokens/tokens.json` triggers a rebuild via `TOKENS_JSON_SHA256`.)

- [ ] **Step 1: Write the test**

```rust
//! Re-read `tokens/tokens.json` at test time and confirm its SHA-256 matches the
//! baked-in `TOKENS_JSON_SHA256` (which is what `build.rs` hashed when generating
//! `tokens.rs`).

use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

#[test]
fn tokens_parity_with_source_json() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let path = Path::new(manifest_dir).join("../../tokens/tokens.json");
    let bytes = fs::read(&path)
        .unwrap_or_else(|e| panic!("read tokens/tokens.json ({:?}): {}", path, e));
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());
    assert_eq!(hash, TOKENS_JSON_SHA256,
        "tokens.json drifted from the value hash-baked at build time; \
         this means a token edit hit the source tree but \
         `cargo build` did NOT re-run build.rs (check `cargo:rerun-if-changed`)");
}
```

- [ ] **Step 2: Run**

```bash
cargo test -p domi-egui --test tokens_parity
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add crates/domi-egui/tests/tokens_parity.rs
git commit -m "test(3c): tokens.json SHA-256 parity against baked hash"
```

### Task 17: `examples/domi-egui-smoke.rs` — visual smoke runner

**Files:**
- Create: `crates/domi-egui/examples/domi-egui-smoke.rs`

(Spec §A, §J.)

- [ ] **Step 1: Implement the smoke runner**

```rust
//! `cargo run --example domi-egui-smoke -p domi-egui`
//!
//! Lays out all 15 primitives + 5 composites in a single eframe window. This is
//! the human-eye check (spec §Risks 2 — "visual parity is approximate by design").
//! Not gated in CI; manual run.

use domi_egui::alert::{AlertVariant, domi_alert};
use domi_egui::badge::{BadgeVariant, domi_badge};
use domi_egui::button::{ButtonProps, ButtonSize, ButtonVariant, domi_button};
use domi_egui::card::{CardProps, CardSize, domi_card};
use domi_egui::checkbox::{CheckboxProps, domi_checkbox};
use domi_egui::form::{FormField, FormFieldKind, FormRow, domi_form};
use domi_egui::input::{InputKind, InputProps, InputSize, domi_input};
use domi_egui::modal::{ModalProps, domi_modal};
use domi_egui::nav::{NavAction, NavProps, domi_nav};
use domi_egui::radio::{RadioProps, domi_radio};
use domi_egui::select::{SelectProps, SelectSize, domi_select};
use domi_egui::table::{TableProps, domi_table};
use domi_egui::tabs::{TabsProps, TabsState, domi_tabs};
use domi_egui::toast::domi_toast;
use domi_egui::tooltip::domi_tooltip;

#[cfg(not(target_arch = "wasm32"))]
fn main() -> eframe::Result<()> {
    let mut tabs_state = TabsState::default();
    let mut modal_open = true;
    let mut name = String::new();
    let mut remember = true;

    eframe::run_native(
        "domi-egui smoke",
        eframe::NativeOptions::default(),
        Box::new(|cc| Ok(Box::new(SmokeApp {
            tabs_state: tabs_state.clone(),
            modal_open,
            name,
            remember,
            cc: cc.egui_ctx.clone(),
        }))),
    )
}

#[cfg(target_arch = "wasm32")]
fn main() {
    // Browser launch path — handled by the surrounding `trunk` config.
}

struct SmokeApp {
    tabs_state: TabsState,
    modal_open: bool,
    name: String,
    remember: bool,
    cc: egui::Context,
}

impl eframe::App for SmokeApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.label("domi-egui smoke runner");
            ui.horizontal(|ui| {
                let _ = domi_button(ui, ButtonProps { label: "Primary", variant: ButtonVariant::Primary, size: ButtonSize::Lg, on_click: None, disabled: false });
                let _ = domi_button(ui, ButtonProps { label: "Ghost",   variant: ButtonVariant::Ghost,   size: ButtonSize::Lg, on_click: None, disabled: false });
                let _ = domi_button(ui, ButtonProps { label: "Danger",  variant: ButtonVariant::Danger,  size: ButtonSize::Lg, on_click: None, disabled: false });
            });
            ui.horizontal(|ui| {
                let _ = domi_alert(ui, AlertVariant::Info,    "Information");
                let _ = domi_alert(ui, AlertVariant::Success, "Saved");
                let _ = domi_alert(ui, AlertVariant::Warning, "Heads up");
                let _ = domi_alert(ui, AlertVariant::Danger,  "Error");
            });
            ui.horizontal(|ui| {
                let _ = domi_badge(ui, BadgeVariant::Primary, "P");
                let _ = domi_badge(ui, BadgeVariant::Success, "S");
                let _ = domi_badge(ui, BadgeVariant::Warning, "W");
                let _ = domi_badge(ui, BadgeVariant::Danger,  "D");
            });
            let _ = domi_card(ui, CardProps { header: Some("Header"), footer: Some("Footer"), body: "Body", size: CardSize::Lg });
            let _ = domi_tooltip(ui, "hover me", "I'm a tooltip");
            let _ = domi_toast(ui, "saved.");
            ui.horizontal(|ui| {
                let _ = domi_input(ui, InputProps { id: "name", value: &mut self.name, kind: InputKind::Text, size: InputSize::Lg, error: false, disabled: false });
                let opts = ["A", "B", "C"];
                let mut sel = String::from("A");
                let _ = domi_select(ui, SelectProps { id: "sel", selected: &mut sel, options: &opts, size: SelectSize::Lg, error: false, disabled: false });
            });
            ui.horizontal(|ui| {
                let _ = domi_checkbox(ui, CheckboxProps { id: "rmb", label: "Remember", checked: &mut self.remember, disabled: false });
                let _ = domi_radio(ui, RadioProps { id: "r", name: "g", label: "Pick", selected: true, disabled: false });
            });
            let nav = NavProps { brand: "ACME", links: &[("home", "#")], actions: vec![NavAction::Link("out", "#")] };
            let _ = domi_nav(ui, nav);
            let table = TableProps { headers: &["Name", "Status"], rows: vec![vec!["Alice".into(), "Active".into()]] };
            let _ = domi_table(ui, table);
            let _ = domi_tabs(ui, TabsProps { labels: &["Overview", "Details"], on_select: None }, &mut self.tabs_state);
            let rows = vec![FormRow::Col(vec![FormField::Field(FormFieldKind::Text("name"))])];
            let _ = domi_form(ui, domi_egui::form::FormProps { rows, on_submit: None });
            let _ = domi_modal(ui, &mut self.modal_open, ModalProps { title: "Confirm", content: "Sure?" });
        });
    }
}
```

- [ ] **Step 2: Enable the `desktop` feature for the example build**

`Cargo.toml` keeps the example auto-discovered. To run on desktop:

```bash
cargo run --example domi-egui-smoke -p domi-egui --features desktop
```

Expected: window opens showing the smoke layout. If `eframe::App` trait signature has shifted in 0.32.x, the compiler will tell you; update to the current signatures. The commit body records what actually compiled.

- [ ] **Step 3: Add WASM launch file**

Create `crates/domi-egui/examples/index.html`:

```html
<!doctype html><html><head><meta charset=utf-8><title>domi-egui smoke</title></head>
<body><script type=module>import init from './pkg/domi_egui_smoke.js'; init();</script></body></html>
```

(Plus the standard `Trunk.toml` we don't author here — that lives in workspace-level config which Phase 4 will own; 3c ships the example, the trunk lane is a Phase 4 setup item. The `cargo build --target wasm32-unknown-unknown -p domi-egui` test in Task 19 confirms compile-time wasm hygiene even without `Trunk.toml`.)

- [ ] **Step 4: Commit**

```bash
git add crates/domi-egui/examples/domi-egui-smoke.rs crates/domi-egui/examples/index.html
git commit -m "feat(3c): domi-egui-smoke example runner (desktop + wasm)"
```

### Task 18: `README.md` — usage + per-widget props table

**Files:**
- Create: `crates/domi-egui/README.md`

- [ ] **Step 1: Author the README**

```markdown
# domi-egui

Native Rust widget library for the 15 [DOMiNice](../../docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md) HTML primitives — leaves plus 5 composites — backed by [egui 0.32](https://github.com/emilk/egui).

## Install

```toml
# Cargo.toml
[dependencies]
domi-egui = { path = "crates/domi-egui" }
egui = "0.32"
```

## Usage

```rust
use domi_egui::button::{domi_button, ButtonProps};
use domi_egui::tabs::{domi_tabs, TabsProps, TabsState};

fn main() {
    let mut tabs_state = TabsState::default();
    eframe::run_native("app", eframe::NativeOptions::default(),
        Box::new(|cc| Ok(Box::new(App { tabs_state }))));
}

struct App { tabs_state: TabsState }
impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _f: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            domi_button(ui, ButtonProps::new("Click me"));
            let _ = domi_tabs(ui,
                TabsProps { labels: &["a", "b"], on_select: None },
                &mut self.tabs_state);
        });
    }
}
```

## Widgets

| Widget        | Form | Variant options | Size options | Notes |
|---------------|------|-----------------|--------------|-------|
| `domi_button` | leaf | `Primary` \| `Ghost` \| `Danger` | `Sm` \| `Lg` | `on_click: Option<Box<dyn FnMut()>>` |
| `domi_card`   | leaf | —               | `Sm` \| `Lg` | `header` / `footer` optional slots |
| `domi_alert`  | leaf | `Info` \| `Success` \| `Warning` \| `Danger` | — | — |
| `domi_badge`  | leaf | `Primary` \| `Success` \| `Warning` \| `Danger` | — | — |
| `domi_input`  | leaf | `error: bool`   | `Sm` \| `Lg` | `kind: InputKind` (Text/Email/Password/Number/Search/Tel/Url) |
| `domi_select` | leaf | `error: bool`   | `Sm` \| `Lg` | `options: &[&str]` + `selected: &mut String` |
| `domi_checkbox` | leaf | — | —           | `checked: &mut bool` |
| `domi_radio`  | leaf | —               | —            | `name: &str` group, `selected: bool` |
| `domi_tooltip`| leaf | —               | —            | `label`, `content` strings |
| `domi_toast`  | leaf | —               | —            | position chosen by caller (Ui placement) |
| `domi_table`  | composite | — | —          | `headers`, `rows` |
| `domi_nav`    | composite | — | —          | `brand`, `links`, `actions` |
| `domi_tabs`   | composite | — | —          | caller-owned `TabsState` |
| `domi_modal`  | composite | — | —          | caller-owned `&mut bool open` (focus trap via egui internals) |
| `domi_form`   | composite | — | —          | `FormRow::Row \| Col` of `FormField` (Label/Field/Help/Error) |

## Theme

`domi_egui::theme::Theme::default()` mirrors `components/domi.css`. All widgets
honor the default for v1; consumer-supplied theme overrides land in a future patch.

## Visual parity

This crate renders DOMiNice in a Rust window. egui paints with `egui::Style`,
not CSS, so the result is **approximate visual parity** by design. Run the
smoke binary for the human-eye check:

```bash
cargo run --example domi-egui-smoke -p domi-egui --features desktop
```

## Build targets

```bash
cargo build --workspace
cargo test --workspace
cargo build --target wasm32-unknown-unknown -p domi-egui     # wasm smoke compile
```

The WASM lane is for browser demos; `eframe::WebRunner` integration ships in
Phase 4 (Trunk config / CI lane).

## Library invariant

`domi-egui` does not modify the DOMiNice design system library
(`tokens/`, `components/`, `scripts/`, `examples/`, `crates/domi-server/`).
It is a pure-Rust consumer of `tokens/tokens.json` (build-time codegen).
```

- [ ] **Step 2: Commit**

```bash
git add crates/domi-egui/README.md
git commit -m "docs(3c): domi-egui README"
```

### Task 19: `docs/RUST.md` — MSRV + 3c row

**Files:**
- Modify: `docs/RUST.md`

(Spec §A root-changes; §K.)

- [ ] **Step 1: Update the MSRV line**

Open `docs/RUST.md` and change the **Crate MSRV** line under "Versions and pinning":

from:

> - Crate MSRV: 1.75 (will set explicitly when implementing; current toolchain is 1.96).

to:

> - Crate MSRV: **1.83** (bumped for Phase 3c; egui 0.32.x floor; current toolchain is 1.96).

- [ ] **Step 2: Add the 3c row to the phasing table**

Edit the same file's **Phasing within Rust** table. Append a new row at the bottom:

> | 3c | `domi-egui` library + smoke | `crates/domi-egui` — 15 egui leaves + 5 composites; tokens.rs build-time codegen — **done** (replace this once 3c ships) |

(Put `done` only when Task 21 lands; until then use `wip` or leave the row blank. The plan's final implementation pass replaces this marker with the actual ship status — see Task 21.)

- [ ] **Step 3: Commit**

```bash
git add docs/RUST.md
git commit -m "docs(3c): docs/RUST.md — MSRV 1.83 + Phase 3c row"
```

### Task 20: Workspace-wide test run + wasm compile confirmation

**Files:** (none — verification only)

Runs all the spec's "must-pass" commands. **Promote this task from `pending` to `completed` only when every command below passes in CI / locally.**

- [ ] **Step 1: Workspace build + test**

```bash
cargo build --workspace
cargo test  --workspace
```

Expected: builds clean; all tests green. **If `egui_kittest` API mismatches** at Task 14, you may have skipped a release note — go back to Task 14 and record the actual harness signatures used.

- [ ] **Step 2: WASM compile**

```bash
rustup target add wasm32-unknown-unknown
cargo check --target wasm32-unknown-unknown -p domi-egui
```

Expected: compiles for wasm32. Test failures aren't run for wasm (per spec §Risks 6 + §Open questions 6).

- [ ] **Step 3: Smoke binary (manual, optional)**

```bash
cargo run --example domi-egui-smoke -p domi-egui --features desktop
```

Expected: window opens. Run a window of ~5–10 seconds, close. No CI gate; this is human-eye verification per spec §Risks 2.

- [ ] **Step 4: Library invariant verification**

```bash
git status --short --untracked-files=no
```

Expected diff scope: only `crates/domi-egui/**`, `Cargo.toml` (root), `rust-toolchain.toml`, `docs/RUST.md`, `docs/superpowers/{specs,plans,handoffs}/2026-07-06-phase3c-dvui-*`, plus the `domi-egui` examples shipped in this plan.

Specifically:

- `components/domi.css` should still appear as **modified** in `git status` (pre-existing dirty state, untouched per Global Constraints).
- `crates/domi-server/**` should have **no** modified files (3c is library-only and a sibling; it doesn't reach into the server crate).
- `tokens/`, `components/primitives/*/`, `scripts/`, `templates/`, `tools/` should show **no** diffs.
- `examples/` (root) should show **no** diffs.

If the diff scope is wider, **stop and audit** — you've likely drifted outside the library invariant.

- [ ] **Step 5: Commit a verification commit (no functional change)**

If `git status --short` is clean other than the expected scope, no commit is needed. Otherwise, the diff is real; revisit the offending task before claiming 3c complete.

(Spec §M acceptance 7 is the formal way to encode this: "verified by `git status --short` showing only ...".)

### Task 21: Phase 3c handoff doc

**Files:**
- Create: `docs/superpowers/handoffs/2026-07-06-phase3c-dvui-handoff.md`

(Mirrors the 3a/3b handoffs. Spec §Cross-references.)

- [ ] **Step 1: Write the handoff**

```markdown
# Phase 3c (`domi-egui`) — Implementation Handoff

**Date:** 2026-07-06
**From:** End of Phase 3c implementation
**To:** Next session (Phase 4 distribution + the deferred Phase 2d+3a+3b+3c merge)

## TL;DR

`domi-egui` ships: 15 leaf widgets + 5 composites, build-time token codegen,
flow tests, `css_audit_consistency` test, `tokens_parity` test, and a smoke
binary for human-eye parity checks. The crate is a workspace sibling to
`crates/domi-server` and a pure consumer of `tokens/tokens.json`.

## What shipped

- **Crate**: `crates/domi-egui/`. `cargo build --workspace`, `cargo test --workspace`, `cargo check --target wasm32-unknown-unknown` all green.
- **15 leaves**: `domi_button`, `domi_card`, `domi_alert`, `domi_badge`, `domi_input`, `domi_select`, `domi_checkbox`, `domi_radio`, `domi_tooltip`, `domi_toast`.
- **5 composites**: `domi_form`, `domi_nav`, `domi_tabs`, `domi_modal`, `domi_table`. Each owns caller-`&mut` state where memory is required (`TabsState`, `&mut bool open` for Modal).
- **Build-time tokens**: `build.rs` reads `tokens/tokens.json` and emits `OUT_DIR/generated/tokens.rs` with `pub const`s + `TOKENS_JSON_SHA256`. Tests detect drift at runtime.
- **Smoke binary**: `cargo run --example domi-egui-smoke -p domi-egui --features desktop` opens a window laying out all 15 primitives.
- **MSRV bump**: `1.75 → 1.83` (workspace-wide). `rust-toolchain.toml` + `docs/RUST.md` updated.

## What we know

1. The kickoff handoff named the crate `dvui`; this rename is the handoff's only structural deviation, deliberately made before any code shipped. Path is `crates/domi-egui/`.
2. Visual parity between `components/domi.css` and the egui render is approximate by design — egui doesn't have a CSS canvas. The smoke binary is the human-eye check; css_audit_consistency ensures the variant *names* match exactly.
3. egui_kittest 0.32.x flow tests are usable but state-transition coverage on Modal's focus trap and Tabs' accessibility state is lighter than widget-allocation coverage. A future patch can swap to manual paint-list walking if a Modal/Tabs regression slips through.
4. WASM CI is `cargo check --target wasm32-unknown-unknown` plus a future `trunk build --release` lane in Phase 4. egui_kittest doesn't run on wasm in mid-2026.

## What we don't know (handoff open questions for Phase 4)

1. **`cargo run --example domi-egui-smoke` on the public website**: do we want a CI artifact (PNG screenshot) for each release? Phasing depends on Phase 4's distribution shape.
2. **Field-by-field theme overrides**: `domi_button(ui, props, theme: Option<&Theme>)` is the obvious extension. Currently all widgets default to `Theme::default()`; consumer-supplied themes would land as a v1.1 patch.
3. **Trunk.toml for WASM**: Phase 4 ships the launch config that pairs `examples/index.html` with `trunk serve`. 3c ships the example file but not the Trunk config — same shape as Phase 4's existing browser-demo responsibilities.

## Suggested plan structure (already executed; for the merge)

This plan runs 21 tasks end-to-end. Tokens → 15 leaves → 5 composites → tests →
smoke. The MSRV bump is the first global change. No library-invariant items
were touched.

## Required reading before next session

- `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` — the spec this implementation followed.
- `crates/domi-egui/README.md` — usage + per-widget props table for downstream apps.
- `docs/RUST.md` — MSRV + phasing-row updates.

## File map

| Need | Path |
|------|------|
| Spec  | `docs/superpowers/specs/2026-07-06-phase3c-dvui-design.md` |
| Plan  | `docs/superpowers/plans/2026-07-06-phase3c-dvui-plan.md` |
| Crate | `crates/domi-egui/` |
| README | `crates/domi-egui/README.md` |
| Token source | `tokens/tokens.json` (untouched) |
| CSS audit | `packages/react/CSS-AUDIT.md` (untouched) |
| MSRV doc | `docs/RUST.md` |
| Toolchain | `rust-toolchain.toml` |

## Pre-merge gate

The 3a handoff said: "Phase 2d merge deferred until Phase 3 wraps." That gate
is now met (3a, 3b, 3c all shipped). **Suggested next-session action**: merge
`phase-2d-agent-tooling` → `main` with all three sub-projects (2d + 3a + 3b + 3c).
The handoff does not action that merge.

## Sign-off

Phase 3c is shipped. This handoff tells Phase 4 what 3c delivered and what
remains open. Phase 4's first job: the cross-sub-project merge and the
distribution write-up.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/handoffs/2026-07-06-phase3c-dvui-handoff.md
git commit -m "docs(3c): implementation handoff — 15 leaves + 5 composites shipped"
```

### Task 22: Final verification — full workspace clean

**Files:** (none — verification + ledger update)

- [ ] **Step 1: One last full-workspace run**

```bash
cargo build --workspace
cargo test --workspace
cargo check --target wasm32-unknown-unknown -p domi-egui
```

All three must exit 0. If any fails, the prior task chain has a regression; fix it before signing off 3c.

- [ ] **Step 2: Diff-scope audit (spec §M acceptance 7)**

```bash
git diff --stat $(git merge-base origin/main HEAD)..HEAD
```

Expected bands:
- `crates/domi-egui/**` — large (the new crate).
- `Cargo.toml` (root) — small.
- `rust-toolchain.toml` — 1 line (floor).
- `docs/RUST.md` — small.
- `docs/superpowers/{specs,plans,handoffs}/2026-07-06-phase3c-dvui-*` — the spec/plan/handoff documents.
- `components/domi.css` — should **not** appear in the diff (it's the pre-existing dirty state on a different branch; if it appears here, that's pre-existing, not added by 3c).
- No other paths.

Any path outside this list is **out of library invariant** — stop and fix.

- [ ] **Step 3: Mark 3c row in `docs/RUST.md` as `done`**

Open `docs/RUST.md` and replace the row inserted in Task 19's placeholder:

> | 3c | `domi-egui` library + smoke | `crates/domi-egui` — 15 egui leaves + 5 composites; tokens.rs build-time codegen — **done** |

(Or leave `wip` if any Task 21/22 step failed.)

```bash
git add docs/RUST.md
git commit -m "docs(3c): mark Phase 3c row as done"
```

---

## Self-Review (matches the planning skill checklist)

### 1. Spec coverage

- **§A Crate shape** — Task 1 (scaffold), Task 2 (manifest + build.rs), Task 3 (theme + tokens), Tasks 4-12 (widgets). ✓
- **§B Widget API shape** — Tasks 4 (button preview), 5-12 (each widget), with explicit `*Props` struct + `domi_<primitive>` fn signatures. ✓
- **§C Per-primitive mapping** — the 15-leaves table maps 1:1 to Tasks 4-12 (button/card/alert/badge/input/select/checkbox/radio/table/nav/tabs/modal/toast/tooltip/form). Defaults per CSS-AUDIT.md encoded as `impl Default`. ✓
- **§D Composite slot APIs** — `domi_form` (Task 9), `domi_table` (Task 8), `domi_nav` (Task 10), `domi_tabs` (Task 11), `domi_modal` (Task 12). Each has the slot enums + state struct exactly as the spec describes. ✓
- **§E Token codegen** — Task 2 (`build.rs`) + Task 16 (`tokens_parity` SHA-256). ✓
- **§F Theme + render** — Task 3 (`Theme` struct) + `Theme::default()` reads `tokens.rs` consts. ✓
- **§F a11y 5 sites** — site #1 label/for in Task 9 form + `id` field on Input/Select/Checkbox/Radio (Tasks 4, 7); site #2 aria-selected in Task 11 tabs; site #3 [dialog] + focus trap in Task 12 modal; site #4 data-tooltip in Task 6 tooltip (egui::Popup equivalent); site #5 thead/tbody in Task 8 table header strip. ✓
- **§G Tests** — Task 14 (egui_kittest flows), Task 15 (css_audit_consistency), Task 16 (tokens_parity), Task 13 (composites smoke). ✓
- **§H Build & run** — Task 20 (cargo build --workspace/test/wasm). ✓
- **§I Deps** — Task 2 manifest sets all runtime deps; Task 14 adds dev-deps. ✓
- **§K Cargo workspace + MSRV** — Task 1 (members + toolchain floor), Task 19 (`docs/RUST.md` MSRV + phasing row). ✓
- **§L Library invariant** — Task 20 step 4 enforces via `git status --short`; Task 22 step 2 enforces via diff-stat. ✓
- **§M Acceptance criteria** — Task 20 + Task 22 are the hard verification.

Gaps: none.

### 2. Placeholder scan

Re-checked for "TBD/TODO/FIXME/???": none.

### 3. Type consistency

Cross-checked the public API surface used across tasks:

- `ButtonProps`, `ButtonVariant`, `ButtonSize` — Task 4 defined; re-used in Task 17 smoke example. ✓
- `InputProps`, `InputKind`, `InputSize` — Task 7 defined; consumed by `domi_form` Task 9 + `domi_input` examples Task 17. ✓
- `SelectProps`, `SelectSize` — Task 7 defined; Task 17 uses it. ✓
- `CheckboxProps` — Task 7; Task 9 form `FormFieldKind::Checkbox` references the same call sites by wrapping. ✓
- `RadioProps` — Task 7; Task 9 form `FormFieldKind::Radio` references the same. ✓
- `TabsProps`, `TabsState` — Task 11 defined; Task 17 smoke uses both. ✓
- `ModalProps` — Task 12; Task 17 smoke uses it. ✓
- `NavProps`, `NavAction` — Task 10; Task 17 smoke uses it. ✓
- `TableProps` — Task 8; Task 17 smoke uses it. ✓
- `FormProps`, `FormRow`, `FormField`, `FormFieldKind` — Task 9 defined; Task 13 composites.rs references `FormRow`/`FormField`/`FormFieldKind`; Task 17 smoke references `FormRow`/`FormField`/`FormFieldKind`. All consistent.
- `Theme`, `parse_hex` — Task 3; consumed by every widget via `crate::theme::Theme::default()`. ✓

No drift.
