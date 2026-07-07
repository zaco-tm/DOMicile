use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardSize { Sm, Lg }

impl Default for CardSize {
    fn default() -> Self { Self::Lg }
}

pub struct CardProps<'a> {
    pub header: Option<&'a str>,
    pub footer: Option<&'a str>,
    pub body: &'a str,
    pub size: CardSize,
}

pub fn domi_card(ui: &mut egui::Ui, props: CardProps) -> egui::Response {
    let theme = Theme::default();
    let body_font = egui::FontId::new(12.0, theme.body_font.clone());
    let header_font = egui::FontId::new(14.0, theme.display_font.clone());
    let pad = match props.size {
        CardSize::Sm => theme.space.1,
        CardSize::Lg => theme.space.2,
    };
    let total_h = pad * 2.0 + 16.0
        + if props.header.is_some() { 18.0 } else { 0.0 }
        + if props.footer.is_some() { 18.0 } else { 0.0 };
    let (rect, response) = ui.allocate_exact_size(egui::vec2(200.0, total_h), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        let r = match props.size { CardSize::Sm => theme.radius.0, CardSize::Lg => theme.radius.1 };
        painter.rect_filled(rect, r, theme.surface_glass);
        painter.rect_stroke(
            rect, r,
            egui::Stroke::new(1.0, theme.text_default.gamma_multiply(0.25)),
            egui::StrokeKind::Inside,
        );
        let mut y = rect.top() + pad;
        if let Some(h) = props.header {
            painter.text(
                egui::pos2(rect.left() + pad, y),
                egui::Align2::LEFT_TOP, h,
                header_font.clone(), theme.text_default,
            );
            y += 18.0;
        }
        painter.text(
            egui::pos2(rect.left() + pad, y),
            egui::Align2::LEFT_TOP, props.body,
            body_font.clone(), theme.text_default,
        );
        if let Some(f) = props.footer {
            painter.text(
                egui::pos2(rect.left() + pad, rect.bottom() - pad),
                egui::Align2::LEFT_BOTTOM, f,
                body_font.clone(), theme.text_muted,
            );
        }
    }
    response
}
