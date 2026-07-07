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
    let _ = theme.text_default;
    let response = ui.checkbox(&mut props.checked, props.label);
    if props.disabled {
        ui.add_enabled_ui(false, |_| {});
    }
    response
}
