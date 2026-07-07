use egui::Color32;

include!(concat!(env!("OUT_DIR"), "/generated/tokens.rs"));

#[derive(Clone, Debug)]
pub struct PrimaryTheme {
    pub gradient_stops: Vec<Color32>,
    pub angle: String,
}

#[derive(Clone, Debug)]
pub struct Theme {
    pub primary: PrimaryTheme,
    pub text_default: Color32,
    pub text_muted: Color32,
    pub text_inverse: Color32,
    pub surface_glass: Color32,
    pub surface_glass_strong: Color32,
    pub radius: (f32, f32, f32, f32),
    pub space: (f32, f32, f32, f32, f32),
    pub body_font: egui::FontFamily,
    pub display_font: egui::FontFamily,
}

impl Default for Theme {
    fn default() -> Self {
        let stops = COLOR_PRIMARY_GRADIENT
            .iter()
            .map(|hex| parse_hex(hex).expect("hex from tokens.json"))
            .collect();
        let primary = PrimaryTheme {
            gradient_stops: stops,
            angle: COLOR_PRIMARY_ANGLE.to_string(),
        };

        Self {
            primary,
            text_default: parse_hex(TEXT_DEFAULT).expect("TEXT_DEFAULT hex"),
            text_muted: parse_hex(TEXT_MUTED).expect("TEXT_MUTED hex"),
            text_inverse: parse_hex(TEXT_INVERSE).expect("TEXT_INVERSE hex"),
            surface_glass: parse_hex(SURFACE_GLASS).expect("SURFACE_GLASS hex"),
            surface_glass_strong: parse_hex(SURFACE_GLASS_STRONG)
                .expect("SURFACE_GLASS_STRONG hex"),
            radius: (RADIUS_SM, RADIUS_MD, RADIUS_LG, RADIUS_PILL),
            space: (SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL),
            body_font: egui::FontFamily::Monospace,
            display_font: egui::FontFamily::Proportional,
        }
    }
}

pub fn parse_hex(hex: &str) -> Option<Color32> {
    let body = hex.trim_start_matches('#');
    if body.len() == 6 {
        let r = u8::from_str_radix(&body[0..2], 16).ok()?;
        let g = u8::from_str_radix(&body[2..4], 16).ok()?;
        let b = u8::from_str_radix(&body[4..6], 16).ok()?;
        Some(Color32::from_rgb(r, g, b))
    } else if body.len() == 8 {
        let r = u8::from_str_radix(&body[0..2], 16).ok()?;
        let g = u8::from_str_radix(&body[2..4], 16).ok()?;
        let b = u8::from_str_radix(&body[4..6], 16).ok()?;
        let a = u8::from_str_radix(&body[6..8], 16).ok()?;
        Some(Color32::from_rgba_unmultiplied(r, g, b, a))
    } else {
        None
    }
}
