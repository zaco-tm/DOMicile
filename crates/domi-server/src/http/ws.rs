use std::sync::Arc;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;

use super::state::AppState;

pub async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, state))
}

async fn handle(mut socket: WebSocket, state: Arc<AppState>) {
    // 1. Send hello.
    let hello = json!({
        "type": "hello",
        "v": 2,
        "serverId": state.server_id.to_string(),
    });
    if socket.send(Message::Text(hello.to_string())).await.is_err() {
        return;
    }

    // 2. Subscribe.
    let mut rx = state.broadcaster.subscribe();

    // 3. Forward loop.
    loop {
        tokio::select! {
            ev = rx.recv() => {
                match ev {
                    Ok(event) => {
                        let frame = json!({"type": "event", "event": event});
                        if socket.send(Message::Text(frame.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(RecvError::Lagged(_)) => continue,
                    Err(RecvError::Closed) => break,
                }
            }
            msg = socket.next() => {
                match msg {
                    Some(Ok(_)) => continue, // accept and ignore
                    Some(Err(_)) | None => break,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{Event, EventData, EventWriter, Kind, Rect, Source, Target};
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
        let state = Arc::new(AppState::new(root, state_dir, writer, 16, None));
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
}
