CREATE TABLE model_versions (
  tenant_id text NOT NULL, asset_id text NOT NULL, version integer NOT NULL,
  payload bytea NOT NULL, sha256 text NOT NULL, byte_size integer NOT NULL,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,asset_id,version),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id)
);
CREATE INDEX assets_geography_gix ON assets USING gist((location::geography));
