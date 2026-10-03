CREATE TABLE IF NOT EXISTS auth_credentials (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0),
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_email_created_idx
  ON password_reset_tokens (email, created_at);

CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_hash TEXT PRIMARY KEY,
  window_started_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);
