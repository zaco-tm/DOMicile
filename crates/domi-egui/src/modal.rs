use crate::theme::Theme;

pub struct ModalProps<'a> {
    pub title: &'a str,
    pub content: &'a str,
}

pub fn domi_modal(ui: &mut egui::Ui, open: &mut bool, props: ModalProps) -> egui::Response {
    let theme = Theme::default();
    if !*open {
        let (_, _) = ui.allocate_space(egui::vec2(0.0, 0.0));
        let (_r, response) = ui.allocate_exact_size(egui::vec2(0.0, 0.0), egui::Sense::hover());
        return response;
    }
    let (rect, response) = ui.allocate_exact_size(egui::vec2(360.0, 180.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(ui.clip_rect(), 0.0, egui::Color32::from_black_alpha(180));
        painter.rect_filled(rect, theme.radius.2, theme.surface_glass_strong);
        painter.text(
            rect.left_top() + egui::vec2(theme.space.1, theme.space.1),
            egui::Align2::LEFT_TOP,
            props.title,
            egui::FontId::new(16.0, theme.display_font.clone()),
            theme.text_default,
        );
        painter.text(
            rect.left_top() + egui::vec2(theme.space.1, theme.space.1 + 28.0),
            egui::Align2::LEFT_TOP,
            props.content,
            egui::FontId::new(12.0, theme.body_font.clone()),
            theme.text_default,
        );
        if ui.button("Close").clicked() || ui.input(|i| i.key_pressed(egui::Key::Escape)) {
            *open = false;
        }
    }
    response
}
