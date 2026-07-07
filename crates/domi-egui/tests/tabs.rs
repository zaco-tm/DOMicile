use domi_egui::tabs::{TabsProps, TabsState};

#[test]
fn tabs_state_default_is_zero() {
    assert_eq!(TabsState::default().selected, 0);
}

#[test]
fn tabs_props_labels_present() {
    let p = TabsProps { labels: &["Overview", "Details"], on_select: None };
    assert_eq!(p.labels.len(), 2);
}
