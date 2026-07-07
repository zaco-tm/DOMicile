use domi_egui::form::{FormField, FormFieldKind, FormRow};
use domi_egui::nav::{NavAction, NavProps};
use domi_egui::tabs::{TabsProps, TabsState};

#[test]
fn composites_smoke_shape() {
    let rows = vec![FormRow::Col(vec![FormField::Field(FormFieldKind::Text("name"))])];
    let nav = NavProps {
        brand: "X",
        links: &[("home", "#")],
        actions: vec![NavAction::Link("out", "#")],
    };
    let tabs = TabsProps { labels: &["a"], on_select: None };
    let _ = (rows, nav, tabs, TabsState::default());
}
