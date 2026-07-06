//! Gated end-to-end test that spawns the actual `domi-server` binary.
//! Run with `cargo test -p domi-server -- --ignored binary_smoke`.
//!
//! This test addresses HANDOFF.md's "no live integration test against
//! an actual `domi-server` binary" risk by exercising the real binary
//! (not the in-process router) end-to-end.

use std::time::Duration;

use futures::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio_tungstenite::tungstenite::handshake::client::{generate_key, Request as TgRequest};
use tokio_tungstenite::tungstenite::Message as TgMessage;

/// Find a free port by binding then dropping.
async fn free_port() -> u16 {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let p = l.local_addr().unwrap().port();
    drop(l);
    p
}

/// Wait until the server accepts a TCP connection on `port`, with a deadline.
async fn wait_for_bind(port: u16, timeout: Duration) {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("server did not bind within {timeout:?}");
}

#[tokio::test]
#[ignore = "spawns the actual binary; run with --ignored"]
async fn binary_smoke_boot_post_get_ws() {
    // 1. Find a free port and set up tempdirs.
    let port = free_port().await;
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    let state_dir = tmp.path().join("state");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&state_dir).unwrap();

    // 2. Locate the binary. cargo test sets CARGO_BIN_EXE_<name> for [[bin]] targets.
    let bin_path = env!("CARGO_BIN_EXE_domi-server");

    // 3. Spawn.
    let mut child = Command::new(bin_path)
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--root")
        .arg(&root)
        .arg("--state")
        .arg(&state_dir)
        .arg("--log-level")
        .arg("warn")
        .kill_on_drop(true)
        .spawn()
        .expect("spawn domi-server");

    // 4. Wait for bind.
    wait_for_bind(port, Duration::from_secs(5)).await;

    // 5. POST an event.
    let payload = serde_json::json!({
        "v": 2,
        "id": null,
        "ts": "2026-07-05T18:21:00Z",
        "src": "domi.js",
        "doc": "smoke-binary",
        "kind": "click",
        "target": {"id": "btn", "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
        "data": {"value": "hello"}
    });
    let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .unwrap();
    let body = payload.to_string();
    let req = format!(
        "POST /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();
    let resp_s = String::from_utf8_lossy(&resp);
    let status_end = resp_s.find('\r').unwrap_or(resp_s.len()).min(60);
    assert!(
        resp_s.starts_with("HTTP/1.1 204"),
        "expected 204, got: {}",
        &resp_s[..status_end]
    );

    // 6. GET it back.
    let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .unwrap();
    let req = format!(
        "GET /api/events?doc=smoke-binary HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();
    let resp_s = String::from_utf8_lossy(&resp);
    assert!(resp_s.starts_with("HTTP/1.1 200"));
    let body_start = resp_s.find("\r\n\r\n").unwrap() + 4;
    let body_str = &resp_s[body_start..];
    let json: serde_json::Value = serde_json::from_str(body_str).expect("json body");
    let events = json["events"].as_array().expect("events array");
    assert_eq!(events.len(), 1, "expected 1 event, got {}", events.len());
    assert_eq!(events[0]["doc"], "smoke-binary");
    assert_eq!(events[0]["data"]["value"], "hello");
    assert_eq!(events[0]["id"].as_str().unwrap().len(), 26, "id stamped");

    // 7. Open WS.
    let url = format!("ws://127.0.0.1:{port}/ws/events");
    let req = TgRequest::builder()
        .method("GET")
        .uri(&url)
        .header("host", format!("127.0.0.1:{port}"))
        .header("connection", "Upgrade")
        .header("upgrade", "websocket")
        .header("sec-websocket-version", "13")
        .header("sec-websocket-key", generate_key())
        .body(())
        .unwrap();
    let (mut ws, _resp) = tokio_tungstenite::connect_async(req)
        .await
        .expect("ws connect");

    let hello_frame = ws.next().await.expect("hello").expect("not err");
    let hello_str = match hello_frame {
        TgMessage::Text(s) => s,
        other => panic!("got {other:?}"),
    };
    let hello: serde_json::Value = serde_json::from_str(&hello_str).unwrap();
    assert_eq!(hello["type"], "hello");
    assert_eq!(hello["v"], 2);

    // 8. POST another event; receive it on WS.
    let payload2 = serde_json::json!({
        "v": 2, "id": null, "ts": "2026-07-05T18:22:00Z",
        "src": "domi.js", "doc": "smoke-binary",
        "kind": "click", "target": {"id": null, "selector": null, "rect": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}},
        "data": {"value": "second"}
    });
    let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .unwrap();
    let body = payload2.to_string();
    let req = format!(
        "POST /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.unwrap();

    let event_frame = ws.next().await.expect("event frame").expect("not err");
    let event_str = match event_frame {
        TgMessage::Text(s) => s,
        other => panic!("got {other:?}"),
    };
    let frame: serde_json::Value = serde_json::from_str(&event_str).unwrap();
    assert_eq!(frame["type"], "event");
    assert_eq!(frame["event"]["data"]["value"], "second");

    // 9. Tear down.
    let _ = ws.send(TgMessage::Close(None)).await;
    drop(ws);
    let _ = child.kill().await;
}
