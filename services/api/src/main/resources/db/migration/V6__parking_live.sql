-- Provider time and collection time are deliberately separate.
ALTER TABLE bangi_places ADD COLUMN live_supported boolean NOT NULL DEFAULT false;
ALTER TABLE bangi_places ADD COLUMN total_capacity integer CHECK(total_capacity>0);
ALTER TABLE bangi_places ADD COLUMN occupied integer CHECK(occupied>=0);
ALTER TABLE bangi_places ADD COLUMN provider_updated_at timestamptz;
ALTER TABLE bangi_places ADD CONSTRAINT parking_occupancy_valid CHECK(occupied IS NULL OR total_capacity IS NULL OR occupied<=total_capacity);
INSERT INTO bangi_sources(id,status,message) VALUES('seoul-parking','PENDING','주차 현황을 수집하고 있습니다.');
