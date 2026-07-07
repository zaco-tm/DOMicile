use domi_egui::modal::{domi_modal, ModalProps};

#[test]
fn modal_props_carries_title_and_content() {
    let p = ModalProps { title: "Confirm", content: "Are you sure?" };
    assert_eq!(p.title, "Confirm");
    assert_eq!(p.content, "Are you sure?");
}
