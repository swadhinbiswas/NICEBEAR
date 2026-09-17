import { GitHubContentsClient } from "../github/client";
import { parseGithubRepo } from "../github/jsdelivr";
import type { StorageBackend, StoredVersion, PutInput } from "./types";

/** GitHub Contents API backend (default). Versions are commit shas. */
export class GithubBackend implements StorageBackend {
  readonly id = "github" as const;
  constructor(
    private repo: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async put(input: PutInput): Promise<StoredVersion> {
    const { owner, repo } = parseGithubRepo(this.repo);
    const client = new GitHubContentsClient(this.token, this.fetchImpl);
    const { sha } = await client.putFile(owner, repo, input.key, toBase64(input.bytes), input.message ?? `nicebear: store ${input.key}`);
    return { version: sha };
  }

  publicUrl(_key: string): string {
    throw new Error("github backend serves via jsDelivr commit URLs, not object keys");
  }
}

/** Edge-safe base64 (btoa, chunked for large buffers). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
