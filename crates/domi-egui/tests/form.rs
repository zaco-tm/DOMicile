use domi_egui::form::{FormField, FormFieldKind, FormRow};

#[test]
fn form_shape_compiles_and_carries_rows() {
    let rows = vec![FormRow::Col(vec![
        FormField::Label("Name"),
        FormField::Field(FormFieldKind::Text("name")),
        FormField::Help("Required"),
    ])];
    assert_eq!(rows.len(), 1);
    match &rows[0] {
        FormRow::Col(fs) => assert_eq!(fs.len(), 3),
        FormRow::Row(_) => panic!("should be Col"),
    }
}
