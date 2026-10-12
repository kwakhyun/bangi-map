CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE tenants (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE sites (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), name text NOT NULL,
  address text NOT NULL, longitude double precision NOT NULL, latitude double precision NOT NULL,
  UNIQUE(tenant_id,id)
);
CREATE TABLE users (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), email text UNIQUE NOT NULL,
  name text NOT NULL, role text NOT NULL CHECK(role IN ('ADMIN','ENGINEER','VIEWER')),
  password_hash text NOT NULL, site_id text NOT NULL,
  FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assets (
  id text PRIMARY KEY, tenant_id text NOT NULL, site_id text NOT NULL,
  code text NOT NULL, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('pump','compressor','hvac')),
  model text NOT NULL, serial text NOT NULL, zone text NOT NULL, floor text NOT NULL DEFAULT '1F',
  status text NOT NULL DEFAULT 'NORMAL' CHECK(status IN ('NORMAL','WARNING','CRITICAL','OFFLINE')),
  location geometry(Point,4326) NOT NULL, model_version integer NOT NULL DEFAULT 1,
  model_file text NOT NULL, commissioned_at date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,site_id,code),
  FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE INDEX assets_location_gix ON assets USING gist(location);
CREATE INDEX assets_tenant_site_idx ON assets(tenant_id,site_id);
CREATE TABLE observations (
  id bigserial PRIMARY KEY, tenant_id text NOT NULL, asset_id text NOT NULL,
  channel text NOT NULL, value double precision NOT NULL, unit text NOT NULL,
  observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  quality text NOT NULL DEFAULT 'GOOD' CHECK(quality IN ('GOOD','MISSING','SUSPECT')),
  event_id text NOT NULL, UNIQUE(tenant_id,event_id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id)
);
CREATE INDEX observations_asset_time_idx ON observations(tenant_id,asset_id,observed_at DESC);
CREATE TABLE alerts (
  id text PRIMARY KEY, tenant_id text NOT NULL, asset_id text NOT NULL,
  title text NOT NULL, severity text NOT NULL, status text NOT NULL DEFAULT 'OPEN',
  value double precision NOT NULL, threshold double precision NOT NULL, unit text NOT NULL,
  rule_version text NOT NULL, observed_at timestamptz NOT NULL, acknowledged_by text,
  FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id)
);
CREATE UNIQUE INDEX alerts_one_open ON alerts(tenant_id,asset_id) WHERE status='OPEN';
CREATE TABLE documents (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), title text NOT NULL,
  model text NOT NULL, revision text NOT NULL, effective_at date NOT NULL,
  status text NOT NULL CHECK(status IN ('CURRENT','RETIRED')), section text NOT NULL,
  content text NOT NULL, embedding vector(1536), UNIQUE(tenant_id,id)
);
CREATE INDEX documents_model_idx ON documents(tenant_id,model,status);
CREATE TABLE work_orders (
  id text PRIMARY KEY, tenant_id text NOT NULL, asset_id text NOT NULL, title text NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','APPROVED','COMPLETED')),
  priority text NOT NULL CHECK(priority IN ('HIGH','MEDIUM','LOW')),
  assignee text NOT NULL, due_date date NOT NULL, checklist jsonb NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]', result text, version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL, approved_by text, completed_by text,
  created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, completed_at timestamptz,
  idempotency_key text NOT NULL, request_hash text NOT NULL, UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id), UNIQUE(tenant_id,id)
);
CREATE TABLE attachments (
  id text PRIMARY KEY, tenant_id text NOT NULL, work_order_id text NOT NULL,
  filename text NOT NULL, content_type text NOT NULL, payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,work_order_id) REFERENCES work_orders(tenant_id,id)
);
CREATE TABLE jobs (
  id text PRIMARY KEY, tenant_id text NOT NULL, site_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('IMPORT','ASSISTANT')), status text NOT NULL DEFAULT 'QUEUED',
  progress integer NOT NULL DEFAULT 0, input jsonb NOT NULL, result jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id)
);
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
  action text NOT NULL, object_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
