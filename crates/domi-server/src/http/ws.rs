use std::sync::{Arc, RwLock};

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
};
use futures::StreamExt;
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;

use super::state::AppState;
use crate::serve::file_change::{FileChange, ReloadTarget};

pub async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, state))
}

/// Per-connection state. `open_path` is the URL the tab is viewing; the
/// client sets it via `{type:"subscribe", path: "/foo.html"}` on connect.
#[derive(Default)]
struct ConnState {
    open_path: RwLock<Option<String>>,
}

async fn handle(mut socket: WebSocket, state: Arc<AppState>) {
    // 1. Hello (v2 + server id + debounce hint for future "reloading in…" UI).
    let hello = json!({
        "type": "hello",
        "v": 2,
        "serverId": state.server_id.to_string(),
        "debounceMs": state.file_change_debounce_ms,
    });
    if socket.send(Message::Text(hello.to_string())).await.is_err() {
        return;
    }

    // 2. Subscribe to both broadcasters.
    let mut rx_events = state.broadcaster.subscribe();
    let mut rx_files = state.file_changes.subscribe();
    let conn = Arc::new(ConnState::default());

    // 3. Forward loop.
    loop {
        tokio::select! {
            ev = rx_events.recv() => match ev {
                Ok(ev) => {
                    let frame = json!({"type":"event","event":ev});
                    if socket.send(Message::Text(frame.to_string())).await.is_err() {
                        break;
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            fc = rx_files.recv() => match fc {
                Ok(fc) => {
                    if let Some(target) = filter_for_conn(&fc, &conn) {
                        let target_str = match target {
                            ReloadTarget::AllTabs(_) => "all",
                            ReloadTarget::MatchingPath(_) => "path",
                        };
                        let path_str = match target {
                            ReloadTarget::AllTabs(p) | ReloadTarget::MatchingPath(p) => {
                                p.to_string_lossy().into_owned()
                            }
                        };
                        let frame = json!({
                            "type": "reload",
                            "path": path_str,
                            "target": target_str,
                        });
                        if socket.send(Message::Text(frame.to_string())).await.is_err() {
                            break;
                        }
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            msg = socket.next() => match msg {
                Some(Ok(Message::Text(s))) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        if v.get("type").and_then(|x| x.as_str()) == Some("subscribe") {
                            if let Some(p) = v.get("path").and_then(|x| x.as_str()) {
                                *conn.open_path.write().unwrap() = Some(p.to_string());
                            }
                        }
                    }
                }
                Some(Ok(_)) => continue,
                Some(Err(_)) | None => break,
            },
        }
    }
}

/// Decide whether a `FileChange` should be forwarded to this connection.
/// `AllTabs` always; `MatchingPath` only when the connection's open_path
/// matches the changed file's relative path. Non-UTF-8 paths log and skip.
fn filter_for_conn(fc: &FileChange, conn: &Arc<ConnState>) -> Option<ReloadTarget> {
    match &fc.target {
        ReloadTarget::AllTabs(_) => Some(fc.target.clone()),
        ReloadTarget::MatchingPath(p) => {
            let open = conn.open_path.read().unwrap().clone();
            match (open.as_deref(), p.to_str()) {
                (Some(o), Some(rel)) => {
                    let o = o.strip_prefix('/').unwrap_or(o);
                    if o == rel {
                        Some(fc.target.clone())
                    } else {
                        None
                    }
                }
                _ => {
                    tracing::debug!(
                        open_path = ?open,
                        change_path = %p.display(),
                        "skipping MatchingPath reload: non-utf8 path or unset open_path",
                    );
                    None
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{Event, EventData, EventWriter, Kind, Rect, Source, Target};
    use futures::SinkExt;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::net::TcpListener;
    use tokio_tungstenite::tungstenite::handshake::client::{generate_key, Request as TgRequest};
    use tokio_tungstenite::tungstenite::Message as TgMessage;
    use ulid::Ulid;

    #[tokio::test]
    async fn ws_upgrade_receives_hello_then_event() {
        // Bind a real port; the WS test needs a real URL.
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        // Build router in-process; serve it in a background task on the listener.
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state_dir = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state_dir).unwrap();
        let writer = Arc::new(EventWriter::new(&state_dir.join("events.jsonl")));
        let (file_tx, _) =
            tokio::sync::broadcast::channel::<crate::serve::file_change::FileChange>(16);
        let state = Arc::new(AppState::new(
            root, state_dir, writer, 16, None, file_tx, 200,
        ));
        let state_for_serve = state.clone();
        let serve = tokio::spawn(async move {
            axum::serve(
                listener,
                super::super::router::build_router(state_for_serve),
            )
            .await
            .unwrap();
        });

        // Connect a tungstenite WS client.
        let url = format!("ws://{addr}/ws/events");
        let req = TgRequest::builder()
            .method("GET")
            .uri(&url)
            .header("host", addr.to_string())
            .header("connection", "Upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", generate_key())
            .body(())
            .unwrap();
        let (mut ws, _resp) = tokio_tungstenite::connect_async(req)
            .await
            .expect("ws connect");

        // 1. Receive hello.
        let hello_frame = ws.next().await.expect("hello frame").expect("not error");
        let hello_str = match hello_frame {
            TgMessage::Text(s) => s,
            other => panic!("expected text frame, got {other:?}"),
        };
        let hello: serde_json::Value = serde_json::from_str(&hello_str).unwrap();
        assert_eq!(hello["type"], "hello");
        assert_eq!(hello["v"], 2);
        assert_eq!(hello["serverId"], state.server_id.to_string());

        // 2. Trigger an event by writing through the broadcaster directly.
        // (We could POST through HTTP, but that requires a request body and
        // a second helper; for this test, broadcasting is what we're verifying.)
        let ev = Event {
            v: 2,
            id: Ulid::new(),
            ts: chrono::Utc::now(),
            src: Source::DomiJs,
            doc: "ws-smoke".into(),
            kind: Kind::Click,
            target: Target {
                id: None,
                selector: None,
                rect: Rect {
                    x: 0.0,
                    y: 0.0,
                    w: 1.0,
                    h: 1.0,
                },
            },
            data: EventData::Click {
                value: Some("hi".into()),
            },
        };
        let _ = state.broadcaster.send(ev.clone());

        // 3. Receive event frame.
        let event_frame = ws.next().await.expect("event frame").expect("not error");
        let event_str = match event_frame {
            TgMessage::Text(s) => s,
            other => panic!("expected text frame, got {other:?}"),
        };
        let frame: serde_json::Value = serde_json::from_str(&event_str).unwrap();
        assert_eq!(frame["type"], "event");
        assert_eq!(frame["event"]["doc"], "ws-smoke");

        // Close.
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        serve.abort();
    }

    async fn open_conn() -> (
        std::net::SocketAddr,
        Arc<AppState>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        let state_dir = dir.path().join("state");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&state_dir).unwrap();
        let writer = Arc::new(EventWriter::new(&state_dir.join("events.jsonl")));
        let (file_tx, _) =
            tokio::sync::broadcast::channel::<crate::serve::file_change::FileChange>(16);
        let state = Arc::new(AppState::new(
            root, state_dir, writer, 16, None, file_tx, 200,
        ));
        let state_for_serve = state.clone();
        let serve = tokio::spawn(async move {
            axum::serve(
                listener,
                super::super::router::build_router(state_for_serve),
            )
            .await
            .unwrap();
        });
        (addr, state, serve)
    }

    async fn connect_tungstenite(
        addr: std::net::SocketAddr,
    ) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>
    {
        let url = format!("ws://{addr}/ws/events");
        let req = TgRequest::builder()
            .method("GET")
            .uri(&url)
            .header("host", addr.to_string())
            .header("connection", "Upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", generate_key())
            .body(())
            .unwrap();
        let (ws, _resp) = tokio_tungstenite::connect_async(req)
            .await
            .expect("ws connect");
        ws
    }

    async fn next_text(
        ws: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    ) -> serde_json::Value {
        use tokio_tungstenite::tungstenite::Message as TgMessage;
        let frame = ws.next().await.expect("frame").expect("err");
        let s = match frame {
            TgMessage::Text(s) => s,
            other => panic!("expected text, got {other:?}"),
        };
        serde_json::from_str(&s).unwrap()
    }

    #[tokio::test]
    async fn ws_receives_reload_envelope_for_matching_path() {
        let (addr, state, serve) = open_conn().await;
        let mut ws = connect_tungstenite(addr).await;
        let _ = next_text(&mut ws).await;
        use tokio_tungstenite::tungstenite::Message as TgMessage;
        ws.send(TgMessage::Text(
            r#"{"type":"subscribe","path":"/foo.html"}"#.into(),
        ))
        .await
        .unwrap();
        // Race-avoidance: give the WS handler a chance to process subscribe
        // before we broadcast the file change. Without this, on a single-
        // threaded runtime the handler may not yet have read open_path.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let _ = state.file_changes.send(FileChange {
            path: PathBuf::from("foo.html"),
            target: ReloadTarget::MatchingPath(PathBuf::from("foo.html")),
        });
        let frame = tokio::time::timeout(std::time::Duration::from_secs(2), next_text(&mut ws))
            .await
            .expect("timed out waiting for reload envelope");
        assert_eq!(frame["type"], "reload");
        assert_eq!(frame["path"], "foo.html");
        assert_eq!(frame["target"], "path");
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        serve.abort();
    }

    #[tokio::test]
    async fn ws_does_not_forward_matching_path_to_other_tab() {
        let (addr, state, serve) = open_conn().await;
        let mut ws = connect_tungstenite(addr).await;
        let _ = next_text(&mut ws).await;
        use tokio_tungstenite::tungstenite::Message as TgMessage;
        ws.send(TgMessage::Text(
            r#"{"type":"subscribe","path":"/foo.html"}"#.into(),
        ))
        .await
        .unwrap();
        let _ = state.file_changes.send(FileChange {
            path: PathBuf::from("bar.html"),
            target: ReloadTarget::MatchingPath(PathBuf::from("bar.html")),
        });
        let timeout_result =
            tokio::time::timeout(std::time::Duration::from_millis(200), ws.next()).await;
        assert!(
            timeout_result.is_err(),
            "no envelope should arrive for a non-matching path"
        );
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        serve.abort();
    }

    #[tokio::test]
    async fn ws_forward_all_tabs_to_every_subscriber() {
        let (addr, state, serve) = open_conn().await;
        let mut ws = connect_tungstenite(addr).await;
        let _ = next_text(&mut ws).await;
        use tokio_tungstenite::tungstenite::Message as TgMessage;
        ws.send(TgMessage::Text(
            r#"{"type":"subscribe","path":"/anything.html"}"#.into(),
        ))
        .await
        .unwrap();
        let _ = state.file_changes.send(FileChange {
            path: PathBuf::from("style.css"),
            target: ReloadTarget::AllTabs(PathBuf::from("style.css")),
        });
        let frame = next_text(&mut ws).await;
        assert_eq!(frame["type"], "reload");
        assert_eq!(frame["path"], "style.css");
        assert_eq!(frame["target"], "all");
        let _ = ws.send(TgMessage::Close(None)).await;
        drop(ws);
        serve.abort();
    }
}
