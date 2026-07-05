//! HTTP layer for the `domi-server` binary (Phase 2c-γ).
//!
//! Top-level orchestration lives here; concrete pieces live in sibling modules.

pub mod args;
pub mod handlers;
pub mod router;
pub mod state;
pub mod ws;

use std::sync::Arc;

use tracing_subscriber::EnvFilter;

use crate::events::EventWriter;
use crate::serve::watcher::{NotifyWatcher, WatchEventKind, Watcher};

use self::args::Args;
use self::state::AppState;

pub async fn run(args: Args) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. tracing init.
    let filter = EnvFilter::try_new(&args.log_level).unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    // 2. Ensure state dir exists; resolve events.jsonl path.
    std::fs::create_dir_all(&args.state)?;
    std::fs::create_dir_all(&args.root)?;
    let events_path = args.state.join("events.jsonl");

    // 3. Construct EventWriter (sync).
    let writer = Arc::new(EventWriter::new(&events_path));

    // 4. Construct AppState.
    let state = Arc::new(AppState::new(
        args.root.clone(),
        args.state.clone(),
        writer,
        256,
    ));

    // 5. Spawn watcher logger.
    spawn_watcher_logger(&args.root);

    // 6. Build router.
    let router = router::build_router(state.clone());

    // 7. Bind.
    let addr = format!("{}:{}", args.host, args.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, server_id = %state.server_id, "domi-server listening");

    // 8. Serve with graceful shutdown.
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn spawn_watcher_logger(root: &std::path::Path) {
    let mut watcher = match NotifyWatcher::new(root, 50) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!(error = %e, "watcher init failed; continuing without");
            return;
        }
    };
    tokio::spawn(async move {
        loop {
            match watcher.next_event(500) {
                Ok(Some(ev)) => {
                    let kind = match ev.kind {
                        WatchEventKind::Created => "created",
                        WatchEventKind::Modified => "modified",
                        WatchEventKind::Removed => "removed",
                        WatchEventKind::Any => "any",
                    };
                    for p in &ev.paths {
                        tracing::debug!(kind, path = %p.display(), "watcher");
                    }
                }
                Ok(None) => continue,
                Err(e) => {
                    tracing::warn!(error = %e, "watcher error; stopping");
                    break;
                }
            }
        }
    });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let sigterm = async {
        let mut s = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        s.recv().await;
    };
    #[cfg(not(unix))]
    let sigterm = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {}
        _ = sigterm => {}
    }
    tracing::info!("shutdown signal received");
}
