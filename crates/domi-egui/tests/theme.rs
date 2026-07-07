use domi_egui::theme::Theme;

#[test]
fn default_theme_matches_css_palette() {
    let t = Theme::default();
    assert_eq!(t.text_default, egui::Color32::from_rgb(0x3d, 0x23, 0x42));
    assert!((t.radius.0 - 4.0).abs() < f32::EPSILON, "radius.sm");
    assert!((t.radius.1 - 8.0).abs() < f32::EPSILON, "radius.md");
    assert!((t.radius.2 - 16.0).abs() < f32::EPSILON, "radius.lg");
    assert!((t.space.0 - 4.0).abs() < f32::EPSILON, "space.xs");
    assert!((t.space.4 - 40.0).abs() < f32::EPSILON, "space.xl");
}

#[test]
fn primary_gradient_has_three_stops() {
    let t = Theme::default();
    assert_eq!(t.primary.gradient_stops.len(), 3);
    assert_eq!(t.primary.gradient_stops[0], egui::Color32::from_rgb(0xa8, 0x9c, 0xc8));
}
