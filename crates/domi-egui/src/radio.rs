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
    let _ = theme.text_default;
    let response = ui.radio(props.selected, props.label);
    let _ = props.id;
    let _ = props.name;
    if props.disabled {
        ui.add_enabled_ui(false, |_| {});
    }
    response
}
