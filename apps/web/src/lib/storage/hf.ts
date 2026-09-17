import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { StorageBackend, StoredVersion, PutInput } from "./types";

/** Minimal S3 surface we use — real S3Client satisfies this structurally. */
export interface S3Sender {
  send(command: { readonly input?: unknown }): Promise<unknown>;
}

export interface HfBackendOptions {
  namespace: string;
  bucket: string;
  /** Preconfigured S3 client (gateway endpoint + creds). Inject a fake in tests. */
  s3: S3Sender;
  /** Public read base; defaults to the Hub resolve URL (302s to the CDN). */
  publicBaseUrl?: string;
}

/**
 * Hugging Face Storage Buckets backend via the S3-compatible gateway
 * (https://s3.hf.co). Writes use versioned keys; reads 302 to the public
 * Hub resolve URL, which itself redirects to the nearest CDN edge.
 */
export class HfBackend implements StorageBackend {
  readonly id = "hf" as const;
  private namespace: string;
  private bucket: string;
  private s3: S3Sender;
  private publicBaseUrl: string;

  constructor(opts: HfBackendOptions) {
    this.namespace = opts.namespace;
    this.bucket = opts.bucket;
    this.s3 = opts.s3;
    this.publicBaseUrl =
      opts.publicBaseUrl ?? `https://huggingface.co/buckets/${opts.namespace}/${opts.bucket}/resolve/main`;
  }

  async put(input: PutInput): Promise<StoredVersion> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    );
    // Buckets are non-versioned: the key IS the version pointer.
    return { version: input.key };
  }

  publicUrl(key: string): string {
    const clean = key.replace(/^\/+/, "");
    return `${this.publicBaseUrl}/${clean
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/")}`;
  }
}
