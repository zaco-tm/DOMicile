use domi_egui::card::{CardProps, CardSize};

#[test]
fn card_size_default_is_lg() {
    assert_eq!(CardSize::default(), CardSize::Lg);
}

#[test]
fn card_props_sm_carries_size() {
    let p = CardProps { header: None, footer: None, body: "x", size: CardSize::Sm };
    assert_eq!(p.size, CardSize::Sm);
}
