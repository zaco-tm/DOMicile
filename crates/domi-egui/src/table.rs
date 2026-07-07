use crate::theme::Theme;

pub struct TableProps<'a> {
    pub headers: &'a [&'a str],
    pub rows: Vec<Vec<String>>,
}

pub fn domi_table(ui: &mut egui::Ui, props: TableProps) -> egui::Response {
    let theme = Theme::default();
    let row_h = 24.0;
    let col_w = 120.0;
    let total_rows = props.rows.len() + 1;
    let total_h = row_h * total_rows as f32;
    let total_w = col_w * props.headers.len() as f32;
    let (rect, response) = ui.allocate_exact_size(egui::vec2(total_w, total_h), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, theme.surface_glass);
        let header_rect = egui::Rect::from_min_size(rect.left_top(), egui::vec2(total_w, row_h));
        painter.rect_filled(header_rect, theme.radius.1, egui::Color32::from_black_alpha(20));
        for (i, h) in props.headers.iter().enumerate() {
            painter.text(
                egui::pos2(rect.left() + col_w * i as f32 + theme.space.0, header_rect.center().y),
                egui::Align2::LEFT_CENTER, *h,
                egui::FontId::new(12.0, theme.display_font.clone()),
                theme.text_default,
            );
        }
        for (r, row) in props.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                let y = header_rect.bottom() + row_h * r as f32;
                painter.text(
                    egui::pos2(rect.left() + col_w * c as f32 + theme.space.0, y + row_h * 0.5),
                    egui::Align2::LEFT_CENTER, cell,
                    egui::FontId::new(12.0, theme.body_font.clone()),
                    theme.text_default,
                );
            }
        }
    }
    response
}
