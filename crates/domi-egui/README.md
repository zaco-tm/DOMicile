# domi-egui

Native Rust widget library for the 15 DOMicile HTML primitives — leaves plus 5 composites — backed by [egui 0.32](https://github.com/emilk/egui).

## Install

```toml
[dependencies]
domi-egui = { path = "crates/domi-egui" }
egui = "0.32"
```

## Usage

```rust
use domi_egui::button::{domi_button, ButtonProps};
use domi_egui::tabs::{domi_tabs, TabsProps, TabsState};

struct App { tabs_state: TabsState }

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            let _ = domi_button(ui, ButtonProps::new("Click me"));
            let _ = domi_tabs(ui,
                TabsProps { labels: &["a", "b"], on_select: None },
                &mut self.tabs_state);
        });
    }
}
```

## Widgets

| Widget         | Form      | Variant options                                  | Size options      | Notes |
|----------------|-----------|--------------------------------------------------|-------------------|-------|
| `domi_button`  | leaf      | `Primary` \| `Ghost` \| `Danger`                  | `Sm` \| `Lg`      | `on_click: Option<Box<dyn FnMut()>>` |
| `domi_card`    | leaf      | —                                                | `Sm` \| `Lg`      | `header` / `footer` optional slots |
| `domi_alert`   | leaf      | `Info` \| `Success` \| `Warning` \| `Danger`     | —                 | — |
| `domi_badge`   | leaf      | `Primary` \| `Success` \| `Warning` \| `Danger`  | —                 | — |
| `domi_input`   | leaf      | `error: bool`                                    | `Sm` \| `Lg`      | `kind: InputKind` (Text/Email/Password/Number/Search/Tel/Url) |
| `domi_select`  | leaf      | `error: bool`                                    | `Sm` \| `Lg`      | `options: &[&str]` + `selected: &mut String` |
| `domi_checkbox`| leaf      | —                                                | —                 | `checked: &mut bool` |
| `domi_radio`   | leaf      | —                                                | —                 | `name: &str` group, `selected: bool` |
| `domi_tooltip` | leaf      | —                                                | —                 | `label`, `content` strings |
| `domi_toast`   | leaf      | —                                                | —                 | position chosen by caller (Ui placement) |
| `domi_table`   | composite | —                                                | —                 | `headers`, `rows` |
| `domi_nav`     | composite | —                                                | —                 | `brand`, `links`, `actions` |
| `domi_tabs`    | composite | —                                                | —                 | caller-owned `TabsState` |
| `domi_modal`   | composite | —                                                | —                 | caller-owned `&mut bool open` (focus trap stub; phase 4 swap-in for `egui::ModalManager`) |
| `domi_form`    | composite | —                                                | —                 | `FormRow::Row \| Col` of `FormField` (Label/Field/Help/Error) |

## Theme

`domi_egui::theme::Theme::default()` mirrors `components/domi.css`. All widgets
honor the default for v1; consumer-supplied theme overrides land in a future patch.

## Visual parity

egui paints with `egui::Style`, not CSS, so the result is **approximate visual parity** by design. Run the smoke binary for the human-eye check:

```bash
cargo run --example domi-egui-smoke -p domi-egui --features desktop,glow
```

## Build targets

```bash
cargo build --workspace
cargo test  --workspace
cargo check --target wasm32-unknown-unknown -p domi-egui
```

The WASM lane (`trunk build` + the `examples/index.html`) is browser-demo only and ships in Phase 4.

## Library invariant

`domi-egui` does not modify the DOMicile design system library
(`tokens/`, `components/`, `scripts/`, `examples/`, `crates/domi-server/`).
It is a pure-Rust consumer of `tokens/tokens.json` (build-time codegen).
