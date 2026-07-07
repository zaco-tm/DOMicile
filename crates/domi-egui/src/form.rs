use crate::button::{ButtonProps, ButtonSize, ButtonVariant, domi_button};
use crate::checkbox::{CheckboxProps, domi_checkbox};
use crate::input::{InputKind, InputProps, InputSize, domi_input};
use crate::radio::{RadioProps, domi_radio};
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
    pub submit_label: &'a str,
    pub on_submit: Option<Box<dyn FnMut()>>,
}

pub fn domi_form(ui: &mut egui::Ui, props: FormProps) -> egui::Response {
    let theme = Theme::default();
    let _ = theme;
    let mut submit_cb: Option<Box<dyn FnMut()>> = props.on_submit;
    let response = ui.vertical(|ui| {
        let mut row_idx = 0usize;
        while row_idx < props.rows.len() {
            let cells: Vec<FormField> = match &props.rows[row_idx] {
                FormRow::Row(cs) | FormRow::Col(cs) => cs.clone(),
            };
            ui.horizontal(|ui| {
                for cell in cells {
                    ui.vertical(|ui| match cell {
                        FormField::Label(text) => { let _ = ui.label(text); }
                        FormField::Help(text) => { let _ = ui.small(text); }
                        FormField::Error(text) => {
                            let _ = ui.colored_label(
                                egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
                                text,
                            );
                        }
                        FormField::Field(kind) => { render_field(ui, &kind); }
                    });
                }
            });
            row_idx += 1;
        }
        let _ = domi_button(ui, ButtonProps {
            label: props.submit_label,
            variant: ButtonVariant::Primary,
            size: ButtonSize::Lg,
            on_click: None,
            disabled: false,
        });
        if let Some(mut cb) = submit_cb.take() {
            if ui.button("Hooked submit").clicked() {
                cb();
            }
        }
    });
    response.response
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
            let _ = domi_radio(ui, RadioProps {
                id: name, name, label, selected: false, disabled: false,
            });
        }
    }
}
