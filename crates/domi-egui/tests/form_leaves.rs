use domi_egui::input::InputKind;
use domi_egui::select::SelectSize;

#[test]
fn input_kinds_are_distinct() {
    assert_ne!(InputKind::Text, InputKind::Password);
    assert_ne!(SelectSize::Sm, SelectSize::Lg);
}
