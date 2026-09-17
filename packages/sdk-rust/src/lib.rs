//! NiceBear Rust SDK — Dynamic Avatar Infrastructure.
//! Mirrors `packages/openapi/spec.yaml`. Version tracks the API, not the app.
//!
//! ```no_run
//! let nb = nicebear::Client::new("https://api.nicebear.dev", Some("nb_live_..."));
//! println!("{}", nb.avatar_url("av_123", Some("john"), None));
//! ```

use std::fmt;
use std::time::Duration;

/// Typed API error: HTTP status plus parsed body.
#[derive(Debug)]
pub enum Error {
    Http {
        status: u16,
        body: serde_json::Value,
    },
    Transport(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Http { status, body } => {
                let detail = body
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("request failed");
                write!(f, "NiceBear API {status}: {detail}")
            }
            Error::Transport(e) => write!(f, "NiceBear transport error: {e}"),
        }
    }
}

impl std::error::Error for Error {}

/// API client. `api_key = None` means anonymous (public reads only).
#[derive(Clone, Debug)]
pub struct Client {
    base_url: String,
    api_key: Option<String>,
    http: reqwest::blocking::Client,
}

fn empty_json() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

impl Client {
    pub fn new(base_url: &str, api_key: Option<&str>) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.map(|k| k.to_string()),
            http: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("reqwest client builds"),
        }
    }

    // ------------------------------------------------------------ URL builders

    fn image_url(&self, path: &str, seed: Option<&str>, v: Option<&str>) -> String {
        let mut q = Vec::new();
        if let Some(s) = seed {
            q.push(("seed", s.to_string()));
        }
        if let Some(v) = v {
            q.push(("v", v.to_string()));
        }
        if q.is_empty() {
            return format!("{}{}", self.base_url, path);
        }
        let qs: Vec<String> = q
            .iter()
            .map(|(k, val)| format!("{}={}", k, url_encode(val)))
            .collect();
        format!("{}{}?{}", self.base_url, path, qs.join("&"))
    }

    /// Current active avatar image URL.
    pub fn avatar_url(&self, id: &str, seed: Option<&str>, v: Option<&str>) -> String {
        self.image_url(&format!("/api/avatar/{id}"), seed, v)
    }

    /// Random-variant URL.
    pub fn random_url(&self, id: &str, seed: Option<&str>) -> String {
        self.image_url(&format!("/api/avatar/{id}/random"), seed, None)
    }

    /// Daily-variant URL.
    pub fn daily_url(&self, id: &str) -> String {
        format!("{}/api/avatar/{id}/daily", self.base_url)
    }

    /// Weekly-variant URL.
    pub fn weekly_url(&self, id: &str) -> String {
        format!("{}/api/avatar/{id}/weekly", self.base_url)
    }

    /// Monthly-variant URL.
    pub fn monthly_url(&self, id: &str) -> String {
        format!("{}/api/avatar/{id}/monthly", self.base_url)
    }

    /// No-cache variant URL.
    pub fn refresh_url(&self, id: &str) -> String {
        format!("{}/api/avatar/{id}/refresh", self.base_url)
    }

    /// Custom-schedule endpoint URL (POST).
    pub fn custom_url(&self, id: &str) -> String {
        format!("{}/api/avatar/{id}/custom", self.base_url)
    }

    // ------------------------------------------------------------------ core

    fn do_request(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value, Error> {
        let mut req = self
            .http
            .request(method, format!("{}{}", self.base_url, path));
        if let Some(key) = &self.api_key {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        if let Some(b) = body {
            req = req.json(b);
        }
        let res = req.send().map_err(|e| Error::Transport(e.to_string()))?;
        let status = res.status().as_u16();
        let out: serde_json::Value = res.json().unwrap_or_else(|_| empty_json());
        if (200..300).contains(&status) {
            Ok(out)
        } else {
            Err(Error::Http { status, body: out })
        }
    }

    fn get(&self, path: &str) -> Result<serde_json::Value, Error> {
        self.do_request(reqwest::Method::GET, path, None)
    }

    fn post(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value, Error> {
        let owned;
        let b = match body {
            Some(v) => v,
            None => {
                owned = empty_json();
                &owned
            }
        };
        self.do_request(reqwest::Method::POST, path, Some(b))
    }

    fn put(&self, path: &str, body: &serde_json::Value) -> Result<serde_json::Value, Error> {
        self.do_request(reqwest::Method::PUT, path, Some(body))
    }

    fn delete(&self, path: &str) -> Result<serde_json::Value, Error> {
        self.do_request(reqwest::Method::DELETE, path, None)
    }

    // ---------------------------------------------------------------- avatars

    /// Create a generated, uploaded, or external_url avatar.
    pub fn create_avatar(&self, payload: &serde_json::Value) -> Result<serde_json::Value, Error> {
        self.post("/api/avatars", Some(payload))
    }

    /// Avatar metadata.
    pub fn get_avatar(&self, id: &str) -> Result<serde_json::Value, Error> {
        self.get(&format!("/api/avatars/{id}"))
    }

    /// Soft-delete an avatar.
    pub fn delete_avatar(&self, id: &str) -> Result<serde_json::Value, Error> {
        self.delete(&format!("/api/avatars/{id}"))
    }

    /// Roll back to a prior version (number or "latest").
    pub fn rollback_avatar(
        &self,
        id: &str,
        version: &serde_json::Value,
    ) -> Result<serde_json::Value, Error> {
        self.post(
            &format!("/api/avatars/{id}/rollback"),
            Some(&serde_json::json!({ "version": version })),
        )
    }

    // ------------------------------------------------------------ collections

    /// Create a collection (`org_id` optional for org keys).
    pub fn create_collection(
        &self,
        name: &str,
        engine_type: &str,
        org_id: Option<&str>,
    ) -> Result<serde_json::Value, Error> {
        let path = match org_id {
            Some(o) => format!("/api/collections?org_id={}", url_encode(o)),
            None => "/api/collections".to_string(),
        };
        self.post(
            &path,
            Some(&serde_json::json!({ "name": name, "engine_type": engine_type })),
        )
    }

    /// List collections with member counts.
    pub fn list_collections(&self, org_id: Option<&str>) -> Result<serde_json::Value, Error> {
        let path = match org_id {
            Some(o) => format!("/api/collections?org_id={}", url_encode(o)),
            None => "/api/collections".to_string(),
        };
        self.get(&path)
    }

    /// Collection with member avatar ids.
    pub fn get_collection(&self, id: &str) -> Result<serde_json::Value, Error> {
        self.get(&format!("/api/collections/{id}"))
    }

    /// Attach an avatar to a collection.
    pub fn attach_avatar(
        &self,
        collection_id: &str,
        avatar_id: &str,
    ) -> Result<serde_json::Value, Error> {
        self.post(
            &format!("/api/collections/{collection_id}/avatars"),
            Some(&serde_json::json!({ "avatar_id": avatar_id })),
        )
    }

    // ----------------------------------------------------------------- rules

    /// Create a rotation rule.
    pub fn create_rule(
        &self,
        target_id: &str,
        target_type: &str,
        rule: &serde_json::Value,
        priority: i64,
    ) -> Result<serde_json::Value, Error> {
        self.post(
            "/api/rotation-rules",
            Some(&serde_json::json!({
                "target_id": target_id, "target_type": target_type, "rule": rule, "priority": priority
            })),
        )
    }

    /// List rules for a target.
    pub fn list_rules(
        &self,
        target_id: &str,
        target_type: &str,
    ) -> Result<serde_json::Value, Error> {
        self.get(&format!(
            "/api/rotation-rules?target_type={}&target_id={}",
            url_encode(target_type),
            url_encode(target_id)
        ))
    }

    /// Update a rule's DSL and/or priority.
    pub fn update_rule(
        &self,
        id: &str,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, Error> {
        self.put(&format!("/api/rotation-rules/{id}"), body)
    }

    /// Attach a cron schedule to a rule.
    pub fn create_schedule(
        &self,
        rotation_rule_id: &str,
        cron_expr: Option<&str>,
        timezone: &str,
    ) -> Result<serde_json::Value, Error> {
        let mut body =
            serde_json::json!({ "rotation_rule_id": rotation_rule_id, "timezone": timezone });
        if let Some(cron) = cron_expr {
            body["cron_expr"] = serde_json::Value::String(cron.to_string());
        }
        self.post("/api/schedules", Some(&body))
    }

    /// List schedules for a rule.
    pub fn list_schedules(&self, rotation_rule_id: &str) -> Result<serde_json::Value, Error> {
        self.get(&format!(
            "/api/schedules?rotation_rule_id={}",
            url_encode(rotation_rule_id)
        ))
    }

    // --------------------------------------------------------------- api keys

    /// Mint a sub-key (plaintext returned once).
    pub fn create_key(
        &self,
        scope: &str,
        rate_limit_per_min: i64,
    ) -> Result<serde_json::Value, Error> {
        self.post(
            "/api/api-keys",
            Some(&serde_json::json!({ "scope": scope, "rate_limit_per_min": rate_limit_per_min })),
        )
    }

    /// List own key metadata (hashes never returned).
    pub fn list_keys(&self) -> Result<serde_json::Value, Error> {
        self.get("/api/api-keys")
    }

    /// Revoke a key.
    pub fn delete_key(&self, id: &str) -> Result<serde_json::Value, Error> {
        self.delete(&format!("/api/api-keys/{id}"))
    }

    /// Rotate a key (fresh plaintext, old hash replaced).
    pub fn rotate_key(&self, id: &str) -> Result<serde_json::Value, Error> {
        self.post(&format!("/api/api-keys/{id}/rotate"), None)
    }

    /// Calling key identity.
    pub fn whoami(&self) -> Result<serde_json::Value, Error> {
        self.get("/api/api-keys/self")
    }

    // --------------------------------------------------------------- webhooks

    /// Create a webhook.
    pub fn create_webhook(
        &self,
        url: &str,
        secret: &str,
        events: &[&str],
        org_id: Option<&str>,
    ) -> Result<serde_json::Value, Error> {
        let path = match org_id {
            Some(o) => format!("/api/webhooks?org_id={}", url_encode(o)),
            None => "/api/webhooks".to_string(),
        };
        self.post(
            &path,
            Some(&serde_json::json!({ "url": url, "secret": secret, "events": events })),
        )
    }

    /// List webhooks (secrets never returned).
    pub fn list_webhooks(&self, org_id: Option<&str>) -> Result<serde_json::Value, Error> {
        let path = match org_id {
            Some(o) => format!("/api/webhooks?org_id={}", url_encode(o)),
            None => "/api/webhooks".to_string(),
        };
        self.get(&path)
    }

    /// A webhook's delivery log.
    pub fn deliveries(&self, webhook_id: &str, limit: u32) -> Result<serde_json::Value, Error> {
        self.get(&format!(
            "/api/webhooks/{webhook_id}/deliveries?limit={limit}"
        ))
    }

    /// Drain pending deliveries.
    pub fn process_webhooks(&self, limit: u32) -> Result<serde_json::Value, Error> {
        self.post(
            "/api/webhooks/process",
            Some(&serde_json::json!({ "limit": limit })),
        )
    }

    // -------------------------------------------------------------- analytics

    /// Aggregated metrics.
    pub fn analytics(&self, metric: &str, days: u32) -> Result<serde_json::Value, Error> {
        self.get(&format!(
            "/api/analytics?metric={}&days={days}",
            url_encode(metric)
        ))
    }

    /// Aggregate complete hour/day buckets.
    pub fn rollup(&self) -> Result<serde_json::Value, Error> {
        self.post("/api/analytics/rollup", None)
    }

    // ------------------------------------------------------------------- misc

    /// Open a content/rights report (public).
    pub fn report(
        &self,
        avatar_id: &str,
        reason: &str,
        reporter_contact: Option<&str>,
    ) -> Result<serde_json::Value, Error> {
        let mut body = serde_json::json!({ "avatar_id": avatar_id, "reason": reason });
        if let Some(contact) = reporter_contact {
            body["reporter_contact"] = serde_json::Value::String(contact.to_string());
        }
        self.post("/api/report", Some(&body))
    }

    /// Orgs the caller belongs to.
    pub fn my_orgs(&self) -> Result<serde_json::Value, Error> {
        self.get("/api/orgs/mine")
    }

    /// Members of an org.
    pub fn team(&self, org_id: Option<&str>) -> Result<serde_json::Value, Error> {
        let path = match org_id {
            Some(o) => format!("/api/team?org_id={}", url_encode(o)),
            None => "/api/team".to_string(),
        };
        self.get(&path)
    }

    /// Add an existing user by email.
    pub fn team_add(
        &self,
        org_id: &str,
        email: &str,
        role: &str,
    ) -> Result<serde_json::Value, Error> {
        self.post(
            "/api/team",
            Some(&serde_json::json!({ "org_id": org_id, "email": email, "role": role })),
        )
    }

    /// Change a member's role.
    pub fn team_role(
        &self,
        org_id: &str,
        user_id: &str,
        role: &str,
    ) -> Result<serde_json::Value, Error> {
        self.put(
            "/api/team",
            &serde_json::json!({ "org_id": org_id, "user_id": user_id, "role": role }),
        )
    }

    /// Remove a member.
    pub fn team_remove(&self, org_id: &str, user_id: &str) -> Result<serde_json::Value, Error> {
        self.delete(&format!(
            "/api/team?org_id={}&user_id={}",
            url_encode(org_id),
            url_encode(user_id)
        ))
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
