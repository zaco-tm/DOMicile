use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "domi-server", version, about = "DOMiNice live feedback server")]
pub struct Args {
    #[arg(long, default_value = "4173")]
    pub port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,
    #[arg(long, default_value = ".domi/output")]
    pub root: std::path::PathBuf,
    #[arg(long, default_value = ".domi/state")]
    pub state: std::path::PathBuf,
    #[arg(long, default_value = "info")]
    pub log_level: String,
}
