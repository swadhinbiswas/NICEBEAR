"""Unit tests for the NiceBear Python SDK (no network — urlopen is stubbed)."""

import io
import json
import urllib.error
import urllib.request

import pytest

from nicebear import NiceBear, NiceBearError

BASE = "https://api.nicebear.dev"


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    def read(self):
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@pytest.fixture()
def calls(monkeypatch):
    seen = []

    def fake_urlopen(req, timeout=None):
        seen.append(req)
        body = json.loads(req.data.decode()) if req.data else None
        if req.full_url.endswith("/api/boom"):
            raise urllib.error.HTTPError(req.full_url, 400, "Bad", {}, io.BytesIO(b'{"error":"nope"}'))
        return FakeResponse({"ok": True, "method": req.method, "path": req.full_url, "body": body})

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    return seen


def test_url_builders():
    nb = NiceBear()
    assert nb.avatar_url("av_1") == f"{BASE}/api/avatar/av_1"
    assert nb.avatar_url("av_1", seed="john", v=2) == f"{BASE}/api/avatar/av_1?seed=john&v=2"
    assert nb.random_url("av_1", seed="x").endswith("/random?seed=x")
    assert nb.daily_url("av_1").endswith("/daily")
    assert nb.weekly_url("av_1").endswith("/weekly")
    assert nb.monthly_url("av_1").endswith("/monthly")
    assert nb.refresh_url("av_1").endswith("/refresh")
    assert nb.custom_url("av_1").endswith("/custom")
    assert NiceBear(base_url="https://x.test/").avatar_url("a") == "https://x.test/api/avatar/a"


def test_auth_header_and_errors(calls):
    nb = NiceBear(api_key="nb_live_abc")
    out = nb.list_keys()
    assert out["ok"] is True
    assert calls[0].headers["Authorization"] == "Bearer nb_live_abc"

    anon = NiceBear()
    anon.list_keys()
    assert "Authorization" not in calls[1].headers

    with pytest.raises(NiceBearError) as exc:
        nb._get("/api/boom")
    assert exc.value.status == 400
    assert "nope" in str(exc.value)


def test_crud_paths(calls):
    nb = NiceBear(api_key="k")
    nb.create_avatar({"type": "generated", "engine": "minimal"})
    assert calls[-1].full_url == f"{BASE}/api/avatars"
    assert calls[-1].headers["Content-type"] == "application/json"

    nb.rollback_avatar("av_1", 2)
    assert calls[-1].full_url.endswith("/api/avatars/av_1/rollback")

    nb.create_collection("team", "pixel-art", org_id="org_1")
    assert calls[-1].full_url.endswith("/api/collections?org_id=org_1")

    nb.attach_avatar("col_1", "av_1")
    assert calls[-1].full_url.endswith("/api/collections/col_1/avatars")

    nb.create_rule("av_1", "avatar", {"type": "composite", "priority": "first_match", "rules": []})
    assert calls[-1].full_url.endswith("/api/rotation-rules")

    nb.rotate_key("key_1")
    assert calls[-1].full_url.endswith("/api/api-keys/key_1/rotate")

    nb.webhook_deliveries("wh_1", limit=5)
    assert calls[-1].full_url.endswith("/api/webhooks/wh_1/deliveries?limit=5")

    nb.analytics("summary", days=7)
    assert "metric=summary" in calls[-1].full_url and "days=7" in calls[-1].full_url

    nb.report("av_1", "probe")
    assert calls[-1].full_url.endswith("/api/report")

    nb.team_remove("org_1", "u_1")
    assert calls[-1].full_url.endswith("/api/team?org_id=org_1&user_id=u_1")
