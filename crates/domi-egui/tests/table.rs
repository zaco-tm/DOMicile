use domi_egui::table::TableProps;

#[test]
fn table_props_carries_headers_and_rows() {
    let rows = vec![vec!["A".into(), "B".into()]];
    let p = TableProps { headers: &["H1", "H2"], rows };
    assert_eq!(p.headers.len(), 2);
    assert_eq!(p.rows.len(), 1);
}
