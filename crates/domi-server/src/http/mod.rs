//! HTTP layer for the `domi-server` binary (Phase 2c-γ).
//!
//! Top-level orchestration lives here; concrete pieces live in sibling modules.

pub mod args;
pub mod handlers;
pub mod router;
pub mod state;
pub mod ws;

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::broadcast;
use tracing_subscriber::EnvFilter;

use crate::events::EventWriter;
use crate::serve::file_change::{FileChange, FileChangeBroadcaster};
use crate::serve::watcher::NotifyWatcher;

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

    // 3.5. Construct the file-change broadcast channel BEFORE AppState so
    // AppState can hold the sender.
    let (file_changes_tx, _) = broadcast::channel::<FileChange>(64);

    // 4. Construct AppState.
    let state = Arc::new(AppState::new(
        args.root.clone(),
        args.state.clone(),
        writer,
        256,
        args.library_root.clone(),
        file_changes_tx,
        200,
    ));

    // 5. Spawn the file-change broadcaster.
    match NotifyWatcher::new(&args.root, 50) {
        Ok(watcher) => {
            let bc = FileChangeBroadcaster::new(
                Box::new(watcher),
                args.root.clone(),
                state.file_change_state_dir.clone(),
                Duration::from_millis(state.file_change_debounce_ms as u64),
                state.file_changes.clone(),
            );
            tokio::spawn(bc.run());
        }
        Err(e) => {
            tracing::warn!(error = %e, "watcher init failed; continuing without auto-reload");
        }
    }

    // 6. Build router.
    let router = router::build_router(state.clone());

    // 7. Bind.
    let addr = format!("{}:{}", args.host, args.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    let bound = listener.local_addr()?;
    tracing::info!(bound_url = %format!("http://{}/", bound), server_id = %state.server_id, "domi-server listening");

    // 8. Serve with graceful shutdown.
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
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
