use std::path::PathBuf;

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(name = "domi-server", version, about = "DOMicile live feedback server")]
pub struct Args {
    #[arg(long, default_value = "4173", value_parser = clap::value_parser!(u16).range(0..=65535))]
    pub port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = ".domi/output")]
    pub root: PathBuf,
    #[arg(long, default_value = ".domi/state")]
    pub state: PathBuf,
    #[arg(long, default_value = "info")]
    pub log_level: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_when_no_flags() {
        let a = Args::try_parse_from(["domi-server"]).unwrap();
        assert_eq!(a.port, 4173);
        assert_eq!(a.host, "127.0.0.1");
        assert_eq!(a.root, PathBuf::from(".domi/output"));
        assert_eq!(a.state, PathBuf::from(".domi/state"));
        assert_eq!(a.log_level, "info");
    }

    #[test]
    fn overrides_parse() {
        let a = Args::try_parse_from([
            "domi-server",
            "--port",
            "9000",
            "--host",
            "0.0.0.0",
            "--root",
            "/tmp/root",
            "--state",
            "/tmp/state",
            "--log-level",
            "debug",
        ])
        .unwrap();
        assert_eq!(a.port, 9000);
        assert_eq!(a.host, "0.0.0.0");
        assert_eq!(a.root, PathBuf::from("/tmp/root"));
        assert_eq!(a.state, PathBuf::from("/tmp/state"));
        assert_eq!(a.log_level, "debug");
    }

    #[test]
    fn invalid_port_rejected() {
        let r = Args::try_parse_from(["domi-server", "--port", "not-a-number"]);
        assert!(r.is_err(), "expected parse error for non-numeric port");
    }
    /// Phase 2d Task 1: `--port 0` must be accepted so the verify script can
    /// let the kernel pick an ephemeral port. Lifted lower bound from `1..`
    /// to `0..=65535` (full `u16` range).
    #[test]
    fn port_zero_accepted() {
        let a = Args::try_parse_from(["domi-server", "--port", "0"]).expect("--port 0 must parse");
        assert_eq!(a.port, 0);
    }
}
