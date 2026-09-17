# nicebear (Rust SDK)

NiceBear Rust SDK — Dynamic Avatar Infrastructure. Blocking client on reqwest.

```toml
[dependencies]
nicebear = { path = "../sdk-rust" }  # or crates.io once published
```

```rust
let nb = nicebear::Client::new("https://api.nicebear.dev", Some("nb_live_..."));

println!("{}", nb.avatar_url("av_123", Some("john"), None));
println!("{}", nb.daily_url("av_123"));

let col = nb.create_collection("team-avatars", "pixel-art", None)?;
let av = nb.create_avatar(&serde_json::json!({
    "collection_id": col["id"],
    "type": "generated",
    "engine": "pixel-art",
}))?;
println!("{}", av["id"]);
```

Errors are `nicebear::Error::Http { status, body }`. Mirrors
`packages/openapi/spec.yaml`. Version tracks the API, not the app.
