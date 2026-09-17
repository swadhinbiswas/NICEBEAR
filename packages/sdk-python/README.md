# nicebear (Python SDK)

Dynamic Avatar Infrastructure client. Stdlib only — no dependencies.

```bash
pip install nicebear
```

```python
from nicebear import NiceBear, NiceBearError

nb = NiceBear(api_key="nb_live_...")

# Image URLs (serve straight from the edge)
print(nb.avatar_url("av_123", seed="john"))
print(nb.daily_url("av_123"))

# Mutations return parsed JSON
col = nb.create_collection("team-avatars", "pixel-art")
av = nb.create_avatar({"collection_id": col["id"], "type": "generated", "engine": "pixel-art"})
print(av["id"])

try:
    nb.report("av_123", "test probe")
except NiceBearError as e:
    print(e.status, e.body)
```

Mirrors `packages/openapi/spec.yaml`. Version tracks the API, not the app.
