# @nicebear/sdk-js

NiceBear JavaScript/TypeScript SDK — Dynamic Avatar Infrastructure. Isomorphic
(fetch-injectable, works in browsers, Node 18+, and edge runtimes).

```bash
pnpm add @nicebear/sdk-js
```

```ts
import { NiceBear, NiceBearError } from "@nicebear/sdk-js";

const nb = new NiceBear({ apiKey: process.env.NICEBEAR_API_KEY });

// Image URLs (serve straight from the edge)
const url = nb.avatarUrl("av_123", { seed: "john" });
const daily = nb.dailyUrl("av_123");

// Mutations return parsed JSON
const col = await nb.createCollection("team-avatars", "pixel-art");
const av = await nb.createAvatar({
  collection_id: col.id,
  type: "generated",
  engine: "pixel-art",
});
console.log(av.id);

try {
  await nb.report("av_123", "test probe");
} catch (e) {
  if (e instanceof NiceBearError) console.error(e.status, e.body);
}

// Test doubles: pass fetchImpl
const test = new NiceBear({ baseUrl: "http://127.0.0.1:4411", fetchImpl: stubFetch });
```

Mirrors `packages/openapi/spec.yaml`. Version tracks the API, not the app.
