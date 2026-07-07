use domi_egui::alert::{AlertVariant, domi_alert};
use domi_egui::badge::{BadgeVariant, domi_badge};
use domi_egui::button::{ButtonProps, ButtonSize, ButtonVariant, domi_button};
use domi_egui::card::{CardProps, CardSize, domi_card};
use domi_egui::checkbox::{CheckboxProps, domi_checkbox};
use domi_egui::form::{FormField, FormFieldKind, FormRow};
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
    eframe::run_native(
        "domi-egui smoke",
        eframe::NativeOptions::default(),
        Box::new(|cc| Ok(Box::new(SmokeApp::new(cc.egui_ctx.clone())))),
    )
}

#[cfg(target_arch = "wasm32")]
fn main() {
}

#[cfg(not(target_arch = "wasm32"))]
struct SmokeApp {
    tabs_state: TabsState,
    modal_open: bool,
    name: String,
    remember: bool,
    _ctx: egui::Context,
}

#[cfg(not(target_arch = "wasm32"))]
impl SmokeApp {
    fn new(ctx: egui::Context) -> Self {
        Self {
            tabs_state: TabsState::default(),
            modal_open: true,
            name: String::new(),
            remember: true,
            _ctx: ctx,
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl eframe::App for SmokeApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.label("domi-egui smoke runner");
            ui.horizontal(|ui| {
                for v in [ButtonVariant::Primary, ButtonVariant::Ghost, ButtonVariant::Danger] {
                    let _ = domi_button(ui, ButtonProps {
                        label: match v {
                            ButtonVariant::Primary => "Primary",
                            ButtonVariant::Ghost => "Ghost",
                            ButtonVariant::Danger => "Danger",
                        },
                        variant: v,
                        size: ButtonSize::Lg,
                        on_click: None,
                        disabled: false,
                    });
                }
            });
            ui.horizontal(|ui| {
                for v in [AlertVariant::Info, AlertVariant::Success, AlertVariant::Warning, AlertVariant::Danger] {
                    let _ = domi_alert(ui, v, "msg");
                }
            });
            ui.horizontal(|ui| {
                for v in [BadgeVariant::Primary, BadgeVariant::Success, BadgeVariant::Warning, BadgeVariant::Danger] {
                    let _ = domi_badge(ui, v, "B");
                }
            });
            let _ = domi_card(ui, CardProps {
                header: Some("Header"),
                footer: Some("Footer"),
                body: "Body",
                size: CardSize::Lg,
            });
            let _ = domi_tooltip(ui, "hover me", "tip");
            let _ = domi_toast(ui, "saved.");
            ui.horizontal(|ui| {
                let _ = domi_input(ui, InputProps {
                    id: "name",
                    value: &mut self.name,
                    kind: InputKind::Text,
                    size: InputSize::Lg,
                    error: false,
                    disabled: false,
                });
                let opts = ["A", "B", "C"];
                let mut sel = String::from("A");
                let _ = domi_select(ui, SelectProps {
                    id: "sel",
                    selected: &mut sel,
                    options: &opts,
                    size: SelectSize::Lg,
                    error: false,
                    disabled: false,
                });
            });
            ui.horizontal(|ui| {
                let _ = domi_checkbox(ui, CheckboxProps {
                    id: "rmb",
                    label: "Remember",
                    checked: &mut self.remember,
                    disabled: false,
                });
                let _ = domi_radio(ui, RadioProps {
                    id: "r",
                    name: "g",
                    label: "Pick",
                    selected: true,
                    disabled: false,
                });
            });
            let nav = NavProps {
                brand: "ACME",
                links: &[("home", "#")],
                actions: vec![NavAction::Link("out", "#")],
            };
            let _ = domi_nav(ui, nav);
            let _ = domi_table(ui, TableProps {
                headers: &["Name", "Status"],
                rows: vec![vec!["Alice".into(), "Active".into()]],
            });
            let _ = domi_tabs(
                ui,
                TabsProps {
                    labels: &["Overview", "Details"],
                    on_select: None,
                },
                &mut self.tabs_state,
            );
            let rows = vec![FormRow::Col(vec![FormField::Field(FormFieldKind::Text("name"))])];
            let _ = ui.vertical(|ui| {
                ui.label("Form composite");
                for row in rows {
                    let _ = ui.horizontal(|ui| {
                        for cell in match row {
                            FormRow::Row(cs) | FormRow::Col(cs) => cs,
                        } {
                            match cell {
                                FormField::Field(FormFieldKind::Text(id)) => { let _ = ui.label(id); }
                                _ => { let _ = ui.label(""); }
                            }
                        }
                    });
                }
            });
            let _ = domi_modal(
                ui,
                &mut self.modal_open,
                ModalProps { title: "Confirm", content: "Sure?" },
            );
        });
    }
}
