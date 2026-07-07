use domi_egui::button::{ButtonProps, ButtonSize, ButtonVariant};
use domi_egui::nav::{NavAction, NavProps};

#[test]
fn nav_carries_brand_links_and_actions() {
    let action = NavAction::Button(ButtonProps {
        label: "Sign out",
        variant: ButtonVariant::Ghost,
        size: ButtonSize::Lg,
        on_click: None,
        disabled: false,
    });
    let props = NavProps { brand: "Acme", links: &[("Home", "#")], actions: vec![action] };
    assert_eq!(props.brand, "Acme");
    assert_eq!(props.links.len(), 1);
    assert_eq!(props.actions.len(), 1);
}
