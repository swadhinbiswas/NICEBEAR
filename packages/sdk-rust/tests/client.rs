//! Client tests against a hand-rolled std TCP stub (no network, no extra deps).

use nicebear::Client;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug, Default)]
struct Seen {
    method: String,
    path: String,
    auth: Option<String>,
    content_type: Option<String>,
    body: String,
}

fn stub(status: u16, body: &str) -> (String, Arc<Mutex<Vec<Seen>>>, thread::JoinHandle<()>) {
    let seen: Arc<Mutex<Vec<Seen>>> = Arc::new(Mutex::new(Vec::new()));
    let seen_tx = Arc::clone(&seen);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let body = body.to_string();
    let handle = thread::spawn(move || {
        for stream in listener.incoming().take(32) {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => break,
            };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut head_lines: Vec<String> = Vec::new();
            let mut content_len = 0usize;
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 {
                    break;
                }
                let t = line.trim_end().to_string();
                if t.is_empty() {
                    break;
                }
                if let Some(v) = t
                    .strip_prefix("Content-Length:")
                    .or_else(|| t.strip_prefix("content-length:"))
                {
                    content_len = v.trim().parse().unwrap_or(0);
                }
                head_lines.push(t);
            }
            let mut body_buf = vec![0u8; content_len];
            if content_len > 0 {
                let _ = reader.read_exact(&mut body_buf);
            }
            let mut s = Seen::default();
            let mut parts = head_lines
                .first()
                .map(|l| l.split_whitespace())
                .unwrap_or_else(|| "".split_whitespace());
            s.method = parts.next().unwrap_or("").to_string();
            s.path = parts.next().unwrap_or("").to_string();
            for line in head_lines.iter().skip(1) {
                let lower = line.to_ascii_lowercase();
                if let Some(idx) = lower.find("authorization:") {
                    s.auth = Some(line[idx + "authorization:".len()..].trim().to_string());
                }
                if let Some(idx) = lower.find("content-type:") {
                    s.content_type = Some(line[idx + "content-type:".len()..].trim().to_string());
                }
                if lower.starts_with("content-length:") {
                    continue;
                }
            }
            s.body = String::from_utf8_lossy(&body_buf).to_string();
            seen_tx.lock().unwrap().push(s);
            let resp = format!(
                "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    (url, seen, handle)
}

#[test]
fn url_builders() {
    let nb = Client::new("https://api.nicebear.dev/", None);
    assert_eq!(
        nb.avatar_url("av_1", None, None),
        "https://api.nicebear.dev/api/avatar/av_1"
    );
    let u = nb.avatar_url("av_1", Some("john"), Some("2"));
    assert!(u.contains("seed=john"), "{u}");
    assert!(u.contains("v=2"), "{u}");
    assert!(nb.daily_url("a").ends_with("/daily"));
    assert!(nb.weekly_url("a").ends_with("/weekly"));
    assert!(nb.monthly_url("a").ends_with("/monthly"));
    assert!(nb.refresh_url("a").ends_with("/refresh"));
    assert!(nb.random_url("a", None).ends_with("/random"));
    assert!(nb.custom_url("a").ends_with("/custom"));
}

#[test]
fn auth_header_and_errors() {
    let (url, seen, _h) = stub(200, r#"{"ok":true}"#);
    let nb = Client::new(&url, Some("nb_live_abc"));
    nb.list_keys().unwrap();
    // Header capture needs the raw head; re-derive via a second instrumented call below.
    let first = seen.lock().unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].method, "GET");
    assert_eq!(first[0].path, "/api/api-keys");
    assert_eq!(first[0].auth.as_deref(), Some("Bearer nb_live_abc"));
    drop(first);

    let anon = Client::new(&url, None);
    anon.list_keys().unwrap();
    assert_eq!(seen.lock().unwrap()[1].auth, None);

    let (url2, _, _h2) = stub(400, r#"{"error":"nope"}"#);
    let nb2 = Client::new(&url2, Some("k"));
    match nb2.list_keys() {
        Err(nicebear::Error::Http { status, body }) => {
            assert_eq!(status, 400);
            assert_eq!(body.get("error").and_then(|v| v.as_str()), Some("nope"));
        }
        other => panic!("expected Http error, got {other:?}"),
    }
}

#[test]
fn crud_paths() {
    let (url, seen, _h) = stub(201, r#"{"id":"x"}"#);
    let nb = Client::new(&url, Some("k"));
    nb.create_avatar(&serde_json::json!({"type": "generated"}))
        .unwrap();
    assert_eq!(seen.lock().unwrap()[0].path, "/api/avatars");

    nb.rollback_avatar("av_1", &serde_json::json!(2)).unwrap();
    assert_eq!(seen.lock().unwrap()[1].path, "/api/avatars/av_1/rollback");

    nb.create_collection("team", "pixel-art", Some("org_1"))
        .unwrap();
    assert_eq!(
        seen.lock().unwrap()[2].path,
        "/api/collections?org_id=org_1"
    );

    nb.rotate_key("key_1").unwrap();
    assert_eq!(seen.lock().unwrap()[3].path, "/api/api-keys/key_1/rotate");

    nb.analytics("summary", 7).unwrap();
    assert_eq!(
        seen.lock().unwrap()[4].path,
        "/api/analytics?metric=summary&days=7"
    );

    nb.team_remove("org_1", "u_1").unwrap();
    assert_eq!(
        seen.lock().unwrap()[5].path,
        "/api/team?org_id=org_1&user_id=u_1"
    );
}
