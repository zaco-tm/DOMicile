use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertVariant {
    Info,
    Success,
    Warning,
    Danger,
}

pub fn domi_alert(ui: &mut egui::Ui, variant: AlertVariant, body: &str) -> egui::Response {
    let theme = Theme::default();
    let fill = match variant {
        AlertVariant::Info => theme.primary.gradient_stops.last().copied()
            .unwrap_or(theme.surface_glass),
        AlertVariant::Success => egui::Color32::from_rgb(0x9c, 0xaf, 0x88),
        AlertVariant::Warning => egui::Color32::from_rgb(0xff, 0xd6, 0xb3),
        AlertVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
    };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(220.0, 36.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, fill);
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER, body,
            egui::FontId::new(12.0, theme.body_font.clone()),
            theme.text_default,
        );
    }
    response
}
