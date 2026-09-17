/** Minimal GitHub Contents API client (§4.1) — uploads + versioned reads. */

export interface GithubPutResult {
  sha: string; // commit sha — stored on avatars.commit_sha
  path: string;
}

export class GitHubContentsClient {
  constructor(
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
  }

  /** PUT /repos/{owner}/{repo}/contents/{path} with base64 content. */
  async putFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<GithubPutResult> {
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message, content: base64Content, branch }),
      },
    );
    if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status}`);
    const json = (await res.json()) as { commit: { sha: string }; content: { path: string } };
    return { sha: json.commit.sha, path: json.content.path };
  }

  /** GET file metadata (incl. sha) — used to resolve ?v=latest without extra DB hop. */
  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<unknown> {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}${q}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
    return res.json();
  }
}
