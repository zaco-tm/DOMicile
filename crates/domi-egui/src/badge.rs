use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeVariant {
    Primary,
    Success,
    Warning,
    Danger,
}

pub fn domi_badge(ui: &mut egui::Ui, variant: BadgeVariant, label: &str) -> egui::Response {
    let theme = Theme::default();
    let fill = match variant {
        BadgeVariant::Primary => theme.primary.gradient_stops.first().copied()
            .unwrap_or(theme.surface_glass),
        BadgeVariant::Success => egui::Color32::from_rgb(0x9c, 0xaf, 0x88),
        BadgeVariant::Warning => egui::Color32::from_rgb(0xff, 0xd6, 0xb3),
        BadgeVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
    };
    let w = (label.len() as f32 * 7.0).max(40.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(w + 12.0, 22.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.3, fill);
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER, label,
            egui::FontId::new(11.0, theme.body_font.clone()),
            theme.text_default,
        );
    }
    response
}
