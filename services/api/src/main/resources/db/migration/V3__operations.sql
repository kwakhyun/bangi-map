ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX users_email_normalized ON users(lower(email));
CREATE TABLE login_attempts (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
CREATE INDEX login_attempts_expiry ON login_attempts(window_start);
CREATE INDEX sessions_expiry ON sessions(expires_at);
ALTER TABLE jobs ADD COLUMN lease_token text;
ALTER TABLE jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX jobs_queue ON jobs(kind,available_at,created_at) WHERE status='QUEUED';
CREATE INDEX jobs_scope ON jobs(tenant_id,site_id,created_at DESC);
CREATE INDEX jobs_quota ON jobs(tenant_id,kind,created_at);
CREATE INDEX audit_scope ON audit_events(tenant_id,created_at DESC);
CREATE INDEX work_orders_scope ON work_orders(tenant_id,created_at DESC);
