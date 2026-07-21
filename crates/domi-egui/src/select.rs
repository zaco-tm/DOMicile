use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SelectSize {
    Sm,
    Lg,
}

pub struct SelectProps<'a, 'b> {
    pub id: &'a str,
    pub selected: &'b mut String,
    pub options: &'a [&'a str],
    pub size: SelectSize,
    pub error: bool,
    pub disabled: bool,
}

pub fn domi_select(ui: &mut egui::Ui, props: SelectProps) -> egui::Response {
    let theme = Theme::default();
    let _ = props.id;
    let _ = props.error;
    let _ = props.disabled;
    let _ = props.size;
    let current = props.selected.clone();
    let combo = egui::ComboBox::from_id_salt("domi_select")
        .selected_text(current.clone())
        .show_ui(ui, |ui| {
            for opt in props.options.iter() {
                let was = current == *opt;
                if ui.selectable_label(was, *opt).clicked() {
                    *props.selected = (*opt).to_string();
                }
            }
        });
    let response = combo.response;
    let rect = response.rect.intersect(ui.clip_rect());
    let painter = ui.painter_at(rect);
    painter.rect_stroke(
        rect, theme.radius.1,
        egui::Stroke::new(1.0_f32, theme.text_default),
        egui::StrokeKind::Inside,
    );
    response
}
