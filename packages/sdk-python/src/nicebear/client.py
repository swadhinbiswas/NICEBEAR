"""NiceBear Python SDK — Dynamic Avatar Infrastructure.

Machines-readable API client (stdlib only, no third-party dependencies).
Mirrors ``packages/openapi/spec.yaml``; see ``README.md`` for usage.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional


class NiceBearError(Exception):
    """HTTP error with status code and parsed body."""

    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body
        detail = body.get("error") if isinstance(body, dict) else body
        super().__init__(f"NiceBear API {status}: {detail}")


@dataclass
class NiceBear:
    base_url: str = "https://api.nicebear.dev"
    api_key: Optional[str] = None
    timeout: float = 30.0

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    # ---------------------------------------------------------- URL builders

    def avatar_url(self, avatar_id: str, seed: Optional[str] = None, v: Any = None) -> str:
        return self._image_url(f"/api/avatar/{avatar_id}", seed=seed, v=v)

    def random_url(self, avatar_id: str, seed: Optional[str] = None) -> str:
        return self._image_url(f"/api/avatar/{avatar_id}/random", seed=seed)

    def daily_url(self, avatar_id: str) -> str:
        return f"{self.base_url}/api/avatar/{avatar_id}/daily"

    def weekly_url(self, avatar_id: str) -> str:
        return f"{self.base_url}/api/avatar/{avatar_id}/weekly"

    def monthly_url(self, avatar_id: str) -> str:
        return f"{self.base_url}/api/avatar/{avatar_id}/monthly"

    def refresh_url(self, avatar_id: str) -> str:
        return f"{self.base_url}/api/avatar/{avatar_id}/refresh"

    def custom_url(self, avatar_id: str) -> str:
        return f"{self.base_url}/api/avatar/{avatar_id}/custom"

    def _image_url(self, path: str, seed: Optional[str] = None, v: Any = None) -> str:
        qs = {}
        if seed is not None:
            qs["seed"] = seed
        if v is not None:
            qs["v"] = str(v)
        url = f"{self.base_url}{path}"
        return f"{url}?{urllib.parse.urlencode(qs)}" if qs else url

    # ------------------------------------------------------------------ core

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                **({"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}),
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read().decode() or "{}"
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            try:
                payload: Any = json.loads(e.read().decode() or "{}")
            except (ValueError, OSError):
                payload = {}
            raise NiceBearError(e.code, payload) from None

    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, body: Any = None) -> Any:
        return self._request("POST", path, body)

    def _put(self, path: str, body: Any = None) -> Any:
        return self._request("PUT", path, body)

    def _delete(self, path: str) -> Any:
        return self._request("DELETE", path)

    # ---------------------------------------------------------------- avatars

    def create_avatar(self, payload: dict) -> Any:
        return self._post("/api/avatars", payload)

    def get_avatar(self, avatar_id: str) -> Any:
        return self._get(f"/api/avatars/{avatar_id}")

    def delete_avatar(self, avatar_id: str) -> Any:
        return self._delete(f"/api/avatars/{avatar_id}")

    def rollback_avatar(self, avatar_id: str, version: Any) -> Any:
        return self._post(f"/api/avatars/{avatar_id}/rollback", {"version": version})

    def custom_avatar(self, avatar_id: str, every: Optional[str] = None, cron: Optional[str] = None) -> Any:
        body = {"every": every} if every is not None else {"cron": cron}
        return self._post(f"/api/avatar/{avatar_id}/custom", body)

    # ------------------------------------------------------------ collections

    def create_collection(self, name: str, engine_type: str, org_id: Optional[str] = None) -> Any:
        path = f"/api/collections{self._org_qs(org_id)}"
        return self._post(path, {"name": name, "engine_type": engine_type})

    def list_collections(self, org_id: Optional[str] = None) -> Any:
        return self._get(f"/api/collections{self._org_qs(org_id)}")

    def get_collection(self, collection_id: str) -> Any:
        return self._get(f"/api/collections/{collection_id}")

    def attach_avatar(self, collection_id: str, avatar_id: str) -> Any:
        return self._post(f"/api/collections/{collection_id}/avatars", {"avatar_id": avatar_id})

    # ----------------------------------------------------------------- rules

    def create_rule(self, target_id: str, target_type: str, rule: dict, priority: int = 0) -> Any:
        return self._post(
            "/api/rotation-rules",
            {"target_id": target_id, "target_type": target_type, "rule": rule, "priority": priority},
        )

    def list_rules(self, target_id: str, target_type: str) -> Any:
        return self._get(f"/api/rotation-rules?target_type={target_type}&target_id={target_id}")

    def update_rule(self, rule_id: str, rule: Optional[dict] = None, priority: Optional[int] = None) -> Any:
        body: dict = {}
        if rule is not None:
            body["rule"] = rule
        if priority is not None:
            body["priority"] = priority
        return self._put(f"/api/rotation-rules/{rule_id}", body)

    def create_schedule(self, rotation_rule_id: str, cron_expr: Optional[str] = None, timezone: str = "UTC") -> Any:
        body: dict = {"rotation_rule_id": rotation_rule_id, "timezone": timezone}
        if cron_expr is not None:
            body["cron_expr"] = cron_expr
        return self._post("/api/schedules", body)

    def list_schedules(self, rotation_rule_id: str) -> Any:
        return self._get(f"/api/schedules?rotation_rule_id={rotation_rule_id}")

    # --------------------------------------------------------------- api keys

    def create_key(self, scope: str = "read", rate_limit_per_min: int = 60) -> Any:
        return self._post("/api/api-keys", {"scope": scope, "rate_limit_per_min": rate_limit_per_min})

    def list_keys(self) -> Any:
        return self._get("/api/api-keys")

    def delete_key(self, key_id: str) -> Any:
        return self._delete(f"/api/api-keys/{key_id}")

    def rotate_key(self, key_id: str) -> Any:
        return self._post(f"/api/api-keys/{key_id}/rotate")

    def whoami(self) -> Any:
        return self._get("/api/api-keys/self")

    # ---------------------------------------------------------------- webhooks

    def create_webhook(self, url: str, secret: str, events: list, org_id: Optional[str] = None) -> Any:
        return self._post(
            f"/api/webhooks{self._org_qs(org_id)}", {"url": url, "secret": secret, "events": events}
        )

    def list_webhooks(self, org_id: Optional[str] = None) -> Any:
        return self._get(f"/api/webhooks{self._org_qs(org_id)}")

    def webhook_deliveries(self, webhook_id: str, limit: int = 25) -> Any:
        return self._get(f"/api/webhooks/{webhook_id}/deliveries?limit={limit}")

    def process_webhooks(self, limit: int = 25) -> Any:
        return self._post("/api/webhooks/process", {"limit": limit})

    # --------------------------------------------------------------- analytics

    def analytics(self, metric: str = "summary", days: int = 30) -> Any:
        return self._get(f"/api/analytics?metric={metric}&days={days}")

    def rollup(self) -> Any:
        return self._post("/api/analytics/rollup")

    # ------------------------------------------------------------------- misc

    def report(self, avatar_id: str, reason: str, reporter_contact: Optional[str] = None) -> Any:
        body: dict = {"avatar_id": avatar_id, "reason": reason}
        if reporter_contact is not None:
            body["reporter_contact"] = reporter_contact
        return self._post("/api/report", body)

    def my_orgs(self) -> Any:
        return self._get("/api/orgs/mine")

    def team(self, org_id: Optional[str] = None) -> Any:
        return self._get(f"/api/team{self._org_qs(org_id)}")

    def team_add(self, org_id: str, email: str, role: str) -> Any:
        return self._post("/api/team", {"org_id": org_id, "email": email, "role": role})

    def team_role(self, org_id: str, user_id: str, role: str) -> Any:
        return self._put("/api/team", {"org_id": org_id, "user_id": user_id, "role": role})

    def team_remove(self, org_id: str, user_id: str) -> Any:
        return self._delete(f"/api/team?org_id={org_id}&user_id={user_id}")

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _org_qs(org_id: Optional[str]) -> str:
        return f"?org_id={urllib.parse.quote(org_id)}" if org_id else ""
