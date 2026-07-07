use crate::theme::Theme;

pub fn domi_toast(ui: &mut egui::Ui, body: &str) -> egui::Response {
    let theme = Theme::default();
    let (rect, response) = ui.allocate_exact_size(egui::vec2(180.0, 28.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, theme.surface_glass_strong);
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER, body,
            egui::FontId::new(12.0, theme.body_font.clone()),
            theme.text_default,
        );
    }
    response
}
