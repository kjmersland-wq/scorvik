CREATE TABLE IF NOT EXISTS render_jobs (
  render_id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'complete', 'failed')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  project_json JSONB NOT NULL,
  output_key TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'complete' OR output_key IS NOT NULL),
  CHECK (status <> 'failed' OR error_message IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS render_jobs_queue_idx
  ON render_jobs (created_at)
  WHERE status IN ('queued', 'processing');