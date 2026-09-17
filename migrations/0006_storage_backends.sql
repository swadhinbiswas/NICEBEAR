-- Storage backends (§4): commit_sha is an opaque version pointer —
-- a git commit sha for `github` rows, the versioned S3 object key for `hf`
-- rows (buckets are non-versioned, so versions live in the key).
ALTER TABLE avatars ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'github';
--> statement-breakpoint
ALTER TABLE avatars ADD COLUMN storage_key TEXT;
