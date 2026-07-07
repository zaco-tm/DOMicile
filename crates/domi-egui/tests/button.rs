use domi_egui::button::{ButtonSize, ButtonVariant};

#[test]
fn defaults_are_primary_lg() {
    assert_eq!(ButtonVariant::default(), ButtonVariant::Primary);
    assert_eq!(ButtonSize::default(), ButtonSize::Lg);
}

#[test]
fn variants_are_distinct() {
    assert_ne!(ButtonVariant::Primary, ButtonVariant::Ghost);
    assert_ne!(ButtonVariant::Primary, ButtonVariant::Danger);
    assert_ne!(ButtonVariant::Ghost, ButtonVariant::Danger);
    assert_ne!(ButtonSize::Sm, ButtonSize::Lg);
}
