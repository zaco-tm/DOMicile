use crate::theme::Theme;

pub struct TabsState {
    pub selected: usize,
}

impl Default for TabsState {
    fn default() -> Self { Self { selected: 0 } }
}

pub struct TabsProps<'a> {
    pub labels: &'a [&'a str],
    pub on_select: Option<Box<dyn FnMut(usize)>>,
}

pub fn domi_tabs(ui: &mut egui::Ui, props: TabsProps, state: &mut TabsState) -> egui::Response {
    let theme = Theme::default();
    let mut new_index: Option<usize> = None;
    let response = ui.horizontal(|ui| {
        for (i, label) in props.labels.iter().enumerate() {
            let is_selected = i == state.selected;
            let resp = ui.selectable_label(is_selected, *label);
            if resp.clicked() {
                state.selected = i;
                new_index = Some(i);
            }
        }
    }).response;
    if let Some(i) = new_index {
        if let Some(mut cb) = props.on_select {
            cb(i);
        }
    }
    let rect = response.rect;
    let painter = ui.painter_at(egui::Rect::from_min_size(
        rect.left_bottom(),
        egui::vec2(rect.width(), 1.0),
    ));
    painter.rect_filled(
        egui::Rect::from_min_size(rect.left_bottom(), egui::vec2(rect.width(), 1.0)),
        0.0,
        theme.text_default,
    );
    response
}
