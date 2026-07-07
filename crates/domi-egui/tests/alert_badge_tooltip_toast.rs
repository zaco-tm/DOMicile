use domi_egui::alert::{domi_alert, AlertVariant};
use domi_egui::badge::{domi_badge, BadgeVariant};

#[test]
fn variants_are_distinct() {
    assert_ne!(AlertVariant::Info, AlertVariant::Danger);
    assert_ne!(BadgeVariant::Primary, BadgeVariant::Success);
    let _ = domi_alert;
    let _ = domi_badge;
}
