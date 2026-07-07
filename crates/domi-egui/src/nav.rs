use crate::button::ButtonProps;
use crate::theme::Theme;

pub enum NavAction {
    Button(ButtonProps<'static>),
    Link(&'static str, &'static str),
}

pub struct NavProps<'a> {
    pub brand: &'a str,
    pub links: &'a [(&'a str, &'a str)],
    pub actions: Vec<NavAction>,
}

pub fn domi_nav(ui: &mut egui::Ui, props: NavProps) -> egui::Response {
    let theme = Theme::default();
    let total_w = (props.links.len() as f32 * 80.0).max(220.0)
        + (props.actions.len() as f32 * 80.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(total_w, 44.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.2, theme.surface_glass);
        painter.text(
            rect.left_top() + egui::vec2(theme.space.1, theme.space.0),
            egui::Align2::LEFT_TOP, props.brand,
            egui::FontId::new(14.0, theme.display_font.clone()),
            theme.text_default,
        );
        let mut x = rect.left() + 120.0;
        for (label, _) in props.links.iter() {
            painter.text(
                egui::pos2(x, rect.center().y),
                egui::Align2::LEFT_CENTER, *label,
                egui::FontId::new(12.0, theme.body_font.clone()),
                theme.text_default,
            );
            x += 80.0;
        }
    }
    response
}
