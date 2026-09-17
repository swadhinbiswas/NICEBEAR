/** jsDelivr-fronted serving (§4.2). Never hotlink raw.githubusercontent.com at volume. */

export function jsdelivrUrl(owner: string, repo: string, path: string, ref?: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const at = ref ?? "HEAD";
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${at}/${cleanPath}`;
}

export function parseGithubRepo(full: string): { owner: string; repo: string } {
  const [owner, repo] = full.split("/");
  if (!owner || !repo) throw new Error(`invalid github_repo, expected owner/repo, got: ${full}`);
  return { owner, repo };
}

/** Versioned (immutable, long-cache) vs live-proxied (short TTL) cache headers (§4.4). */
export function imageCacheHeaders(versioned: boolean): Record<string, string> {
  if (versioned) {
    return { "Cache-Control": "public, max-age=31536000, immutable" };
  }
  return { "Cache-Control": "public, max-age=60, s-maxage=300" };
}
