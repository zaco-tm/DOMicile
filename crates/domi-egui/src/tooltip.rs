use crate::theme::Theme;

pub fn domi_tooltip(ui: &mut egui::Ui, label: &str, content: &str) -> egui::Response {
    let theme = Theme::default();
    let response = ui.label(label);
    if response.hovered() {
        let mut popup = egui::Popup::from_response(&response);
        popup.show(|ui| {
            ui.label(content);
            let _ = theme.text_default;
        });
    }
    response
}
