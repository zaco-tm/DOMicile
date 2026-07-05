use clap::Parser;

use domi_server::http::args::Args;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = Args::parse();
    domi_server::http::run(args).await
}
