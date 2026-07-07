use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputKind {
    Text,
    Email,
    Password,
    Number,
    Search,
    Tel,
    Url,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputSize {
    Sm,
    Lg,
}

impl Default for InputSize {
    fn default() -> Self { Self::Lg }
}

pub struct InputProps<'a> {
    pub id: &'a str,
    pub value: &'a mut String,
    pub kind: InputKind,
    pub size: InputSize,
    pub error: bool,
    pub disabled: bool,
}

pub fn domi_input(ui: &mut egui::Ui, props: InputProps) -> egui::Response {
    let theme = Theme::default();
    let pad = match props.size {
        InputSize::Sm => theme.space.0,
        InputSize::Lg => theme.space.1,
    };
    let _ = props.id;
    let _ = props.error;
    let _ = props.disabled;
    let edit = egui::TextEdit::singleline(props.value).hint_text(match props.kind {
        InputKind::Password => "..........",
        _ => "",
    }).margin(pad);
    let response = ui.add(edit);
    let rect = response.rect.intersect(ui.clip_rect());
    let painter = ui.painter_at(rect);
    let r = if props.error { theme.radius.0 } else { theme.radius.1 };
    painter.rect_stroke(
        rect, r,
        egui::Stroke::new(1.0, theme.text_default),
        egui::StrokeKind::Inside,
    );
    response
}
