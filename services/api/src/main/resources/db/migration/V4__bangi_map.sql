-- Additive migration keeps the previous staging accounts and rollback data intact.
CREATE TABLE bangi_places (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('BIKE','PARKING','TOILET')),
 name text NOT NULL, address text NOT NULL, location geometry(Point,4326) NOT NULL,
 source_id text NOT NULL, source_url text NOT NULL, source_name text NOT NULL,
 source_date text NOT NULL, collected_at timestamptz NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', available integer CHECK(available>=0),
 checked_at timestamptz, active boolean NOT NULL DEFAULT true
);
CREATE INDEX bangi_places_location ON bangi_places USING gist((location::geography));
CREATE INDEX bangi_places_kind ON bangi_places(kind);
CREATE TABLE bangi_sources (
 id text PRIMARY KEY, status text NOT NULL, last_attempt_at timestamptz,
 last_success_at timestamptz, message text NOT NULL DEFAULT ''
);
INSERT INTO bangi_sources(id,status,message) VALUES('seoul-bike','NOT_CONFIGURED','서울 열린데이터광장 인증키 등록 전입니다.');
CREATE TABLE bangi_reports (
 id text PRIMARY KEY, place_id text NOT NULL REFERENCES bangi_places(id),
 category text NOT NULL CHECK(category IN ('INFO','BROKEN','ACCESS','OTHER')),
 description text NOT NULL CHECK(length(description) BETWEEN 5 AND 1000),
 status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','REVIEWING','RESOLVED','REJECTED')),
 response text NOT NULL DEFAULT '', receipt_hash text NOT NULL,
 request_key text UNIQUE NOT NULL, request_hash text NOT NULL,
 photo bytea, photo_type text, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bangi_reports_status ON bangi_reports(status,created_at DESC);
