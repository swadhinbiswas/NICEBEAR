/**
 * SSRF guard for external_url ingestion (§4.3, §13).
 * Blocks RFC1918/loopback/link-local literals, localhost-ish hostnames,
 * cloud metadata IP, non-http(s) schemes. NOTE: literal-IP check only —
 * callers MUST resolve DNS and re-check at fetch time to close DNS-rebinding
 * (documented in docs/self-hosting.md). Keeps this module pure + unit-testable.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedIpv4(host: string): boolean {
  const m = IPV4_RE.exec(host.replace(/^\[|\]$/g, ""));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. metadata
  if (a === 0) return true; // 0/8
  return false;
}

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost") return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true; // v6 local
  if (isBlockedIpv4(h)) return true;
  return false;
}

export function assertSafeExternalUrl(urlStr: string): URL {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("source_url must be a valid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("source_url must be http(s)");
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error("source_url host is not allowed (SSRF guard)");
  }
  if (u.username || u.password) throw new Error("source_url must not embed credentials");
  return u;
}

export const EXTERNAL_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_RE = /^image\/(png|jpeg|gif|webp|svg\+xml)$/;

/**
 * Fetch an external avatar with redirect cap, content-type allowlist, size cap.
 * `fetchImpl` is injectable for tests.
 */
export async function fetchExternalImage(
  urlStr: string,
  fetchImpl: typeof fetch = fetch,
  maxRedirects = 3,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  let current = assertSafeExternalUrl(urlStr).toString();
  let res: Response | null = null;
  for (let i = 0; i <= maxRedirects; i++) {
    res = await fetchImpl(current, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || i === maxRedirects) throw new Error("too many redirects");
      current = assertSafeExternalUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`fetch failed: ${res?.status}`);
  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_RE.test(ct)) throw new Error(`disallowed content-type: ${ct}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > EXTERNAL_FETCH_MAX_BYTES) throw new Error("image exceeds 5MB cap");
  return { bytes: buf, contentType: ct };
}
