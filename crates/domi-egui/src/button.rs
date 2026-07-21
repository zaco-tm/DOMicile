use crate::theme::Theme;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonVariant {
    Primary,
    Ghost,
    Danger,
}

impl Default for ButtonVariant {
    fn default() -> Self { Self::Primary }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ButtonSize {
    Sm,
    Lg,
}

impl Default for ButtonSize {
    fn default() -> Self { Self::Lg }
}

pub struct ButtonProps<'a> {
    pub label: &'a str,
    pub variant: ButtonVariant,
    pub size: ButtonSize,
    pub on_click: Option<Box<dyn FnMut()>>,
    pub disabled: bool,
}

impl<'a> ButtonProps<'a> {
    pub fn new(label: &'a str) -> Self {
        Self {
            label,
            variant: ButtonVariant::default(),
            size: ButtonSize::default(),
            on_click: None,
            disabled: false,
        }
    }
}

pub fn domi_button(ui: &mut egui::Ui, props: ButtonProps) -> egui::Response {
    let ButtonProps { label, variant, size, on_click, disabled } = props;
    let theme = Theme::default();

    let fill = match variant {
        ButtonVariant::Primary => {
            theme.primary.gradient_stops.first().copied()
                .unwrap_or(theme.text_default)
        }
        ButtonVariant::Ghost => theme.surface_glass,
        ButtonVariant::Danger => egui::Color32::from_rgb(0xf4, 0x97, 0x8e),
    };

    let pad_y = match size {
        ButtonSize::Sm => theme.space.0,
        ButtonSize::Lg => theme.space.1,
    };
    let desired_h = ui.spacing().interact_size.y + pad_y * 2.0;
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2((label.len() as f32 * 8.0).max(80.0), desired_h),
        egui::Sense::click(),
    );
    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, theme.radius.1, fill);
        painter.rect_stroke(
            rect,
            theme.radius.1,
            egui::Stroke::new(1.0_f32, theme.text_default),
            egui::StrokeKind::Inside,
        );
        let text_color = match variant {
            ButtonVariant::Primary | ButtonVariant::Danger => theme.text_inverse,
            ButtonVariant::Ghost => theme.text_default,
        };
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            label,
            egui::FontId::new(theme.space.1.max(10.0), theme.body_font),
            text_color,
        );
    }
    if response.clicked() {
        if let Some(mut cb) = on_click {
            cb();
        }
    }
    if disabled {
        ui.add_enabled_ui(false, |_| {});
    }
    response
}
