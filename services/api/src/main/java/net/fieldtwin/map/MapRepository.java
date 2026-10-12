package net.fieldtwin.map;

import net.fieldtwin.Db;
import org.springframework.stereotype.Repository;
import java.util.Map;

@Repository
public class MapRepository {
    private final Db db;

    public MapRepository(Db db) { this.db = db; }

    public Map<String, Object> source(String id) {
        return db.one("SELECT * FROM bangi_sources WHERE id=?", id);
    }

    public Object metadata() {
        return db.one("SELECT metadata FROM bangi_districts WHERE id='bangi2'").get("metadata");
    }

    public Map<String, Object> district() {
        var row = db.one("SELECT metadata,ST_AsGeoJSON(boundary)::json geometry FROM bangi_districts WHERE id='bangi2'");
        return Map.of("type", "Feature", "id", "bangi2", "geometry", row.get("geometry"), "properties", row.get("metadata"));
    }

    public Map<String, Object> building(String id) {
        var row = db.one("SELECT id,properties,ST_AsGeoJSON(footprint)::json geometry FROM bangi_buildings WHERE id=?", id);
        return Map.of("type", "Feature", "id", row.get("id"), "geometry", row.get("geometry"), "properties", row.get("properties"));
    }
}
