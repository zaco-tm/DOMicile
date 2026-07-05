//! GET / — protocol banner. Returns name + version + protocol as a fixed array
//! of key-value pairs; the binary's HTTP layer (2c-γ) maps this to JSON.

pub fn protocol_banner() -> [(&'static str, &'static str); 3] {
    [
        ("name", "domi-server"),
        ("version", env!("CARGO_PKG_VERSION")),
        ("protocol", "2"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banner_returns_three_pairs() {
        let b = protocol_banner();
        assert_eq!(b.len(), 3);
        let map: std::collections::HashMap<&str, &str> = b.iter().copied().collect();
        assert_eq!(map["name"], "domi-server");
        assert_eq!(map["protocol"], "2");
        assert!(!map["version"].is_empty());
    }

    #[test]
    fn banner_version_matches_cargo_package() {
        let b = protocol_banner();
        let map: std::collections::HashMap<&str, &str> = b.iter().copied().collect();
        assert_eq!(map["version"], env!("CARGO_PKG_VERSION"));
    }
}