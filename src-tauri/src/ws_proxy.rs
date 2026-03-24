use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tauri::{Emitter, Window};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        http::header::ORIGIN,
        Message,
    },
};

pub struct WsProxy {
    sender: Option<mpsc::UnboundedSender<String>>,
    connected: bool,
}

impl WsProxy {
    pub fn new() -> Self {
        Self {
            sender: None,
            connected: false,
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    pub fn send(&self, message: String) -> Result<(), String> {
        if let Some(sender) = &self.sender {
            sender.send(message).map_err(|e| e.to_string())
        } else {
            Err("Not connected".to_string())
        }
    }
}

pub async fn connect_to_gateway(
    gateway_url: String,
    window: Window,
    proxy: Arc<Mutex<WsProxy>>,
) -> Result<(), String> {
    // Convert http:// to ws://
    let ws_url = gateway_url.replace("http://", "ws://").replace("https://", "wss://");

    // Create a request with Origin header
    let mut request = ws_url.into_client_request().map_err(|e| format!("Invalid URL: {}", e))?;

    // Add Origin header - use localhost:18789 which is in the allowed origins
    request.headers_mut().insert(
        ORIGIN,
        "http://localhost:18789".parse().unwrap(),
    );

    let (ws_stream, response) = connect_async_with_config(request, None, false)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    let _ = response; // Suppress unused warning
    let (mut write, mut read) = ws_stream.split();

    // Channel for sending messages to the WebSocket
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Store sender in proxy
    {
        let mut proxy_lock = proxy.lock().await;
        proxy_lock.sender = Some(tx);
        proxy_lock.connected = true;
    }

    // Notify frontend that we're connected
    let _ = window.emit("ws-connected", ());

    // Spawn task to handle outgoing messages
    let write_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let _ = window.emit("ws-message", text);
            }
            Ok(Message::Close(frame)) => {
                let reason = frame.map(|f| f.reason.to_string()).unwrap_or_default();
                if !reason.is_empty() {
                    let _ = window.emit("ws-error", reason);
                }
                break;
            }
            Err(e) => {
                let _ = window.emit("ws-error", e.to_string());
                break;
            }
            _ => {}
        }
    }

    // Cleanup
    write_handle.abort();
    {
        let mut proxy_lock = proxy.lock().await;
        proxy_lock.sender = None;
        proxy_lock.connected = false;
    }

    let _ = window.emit("ws-disconnected", ());

    Ok(())
}
