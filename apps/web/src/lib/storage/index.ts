import { S3Client } from "@aws-sdk/client-s3";
import { HttpError } from "../auth/authenticate";
import type { AppEnv } from "../runtime/env";
import { GithubBackend } from "./github";
import { HfBackend, type S3Sender } from "./hf";
import type { StorageBackend } from "./types";

export * from "./types";
export { GithubBackend } from "./github";
export { HfBackend, type S3Sender } from "./hf";

export interface StorageOptions {
  /** Target repo for github (`owner/name`, usually `?repo=`). */
  repo?: string;
  /** Injected S3 sender (tests); otherwise built from env credentials. */
  s3Override?: S3Sender;
  fetchImpl?: typeof fetch;
}

/**
 * Select the asset store. `ASSET_STORE=hf` needs HF_NAMESPACE + HF_BUCKET
 * (+ S3 creds outside tests); anything else uses the GitHub Contents API,
 * which needs `?repo=` + GITHUB_TOKEN at write time.
 */
export function getStorageBackend(env: AppEnv, opts: StorageOptions = {}): StorageBackend {
  if (env.ASSET_STORE === "hf") {
    const namespace = env.HF_NAMESPACE;
    const bucket = env.HF_BUCKET;
    if (!namespace || !bucket) {
      throw new HttpError(503, "HF storage not configured (HF_NAMESPACE, HF_BUCKET)", "unconfigured");
    }
    const s3 =
      opts.s3Override ??
      new S3Client({
        endpoint: `https://s3.hf.co/${namespace}`,
        region: "us-east-1",
        forcePathStyle: true,
        credentials:
          env.HF_S3_ACCESS_KEY_ID && env.HF_S3_SECRET_ACCESS_KEY
            ? { accessKeyId: env.HF_S3_ACCESS_KEY_ID, secretAccessKey: env.HF_S3_SECRET_ACCESS_KEY }
            : undefined,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    return new HfBackend({
      namespace,
      bucket,
      s3,
      publicBaseUrl: env.HF_PUBLIC_BASE_URL,
    });
  }
  if (!opts.repo || !/^[^/]+\/[^/]+$/.test(opts.repo)) {
    throw new HttpError(400, "?repo=owner/name is required for the github asset store");
  }
  if (!env.GITHUB_TOKEN) {
    throw new HttpError(503, "asset store not configured (GITHUB_TOKEN)", "unconfigured");
  }
  return new GithubBackend(opts.repo, env.GITHUB_TOKEN, opts.fetchImpl);
}

/** Pure public-URL builder for hf rows (no credentials needed to serve). */
export function hfPublicUrl(env: AppEnv, key: string): string {
  const namespace = env.HF_NAMESPACE ?? "";
  const bucket = env.HF_BUCKET ?? "";
  const base =
    env.HF_PUBLIC_BASE_URL ?? `https://huggingface.co/buckets/${namespace}/${bucket}/resolve/main`;
  const clean = key.replace(/^\/+/, "");
  return `${base}/${clean
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}
