-- Existing NCP staging: execute as postgres only after the owner-role migration.
-- Application code cannot modify schema or erase audit records.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fieldtwin_staging_api;
GRANT SELECT ON tenants,sites,spatial_ref_sys,bangi_districts,bangi_buildings TO fieldtwin_staging_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON users,sessions,login_attempts,bangi_places,bangi_sources,bangi_reports TO fieldtwin_staging_api;
GRANT SELECT,INSERT ON audit_events TO fieldtwin_staging_api;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO fieldtwin_staging_api;
