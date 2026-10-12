package net.fieldtwin.places;

import net.fieldtwin.Db;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Map;

@Repository
public class PlaceRepository {
    private final Db db;

    public PlaceRepository(Db db) { this.db = db; }

    private static final String COLUMNS = """
            id,kind,name,address,ST_X(location) longitude,ST_Y(location) latitude,
            source_id,source_url,source_name,source_date,collected_at,details,
            available,checked_at,live_supported,total_capacity,occupied,provider_updated_at,
            CASE WHEN kind='PARKING' AND NOT live_supported THEN 'NOT_PROVIDED'
                 WHEN available IS NULL OR checked_at IS NULL
                      OR (kind='PARKING' AND provider_updated_at IS NULL) THEN 'UNAVAILABLE'
                 WHEN checked_at<now()-interval '10 minutes'
                      OR (kind='PARKING' AND provider_updated_at<now()-interval '10 minutes') THEN 'STALE'
                 ELSE 'FRESH' END freshness
            """;
    private static final String IN_DISTRICT =
            "ST_Covers((SELECT boundary FROM bangi_districts WHERE id='bangi2'),location)";

    public List<Map<String, Object>> search(PlaceSearch search) {
        return db.list("SELECT " + COLUMNS + """
                ,round(ST_Distance(location::geography,
                    ST_SetSRID(ST_MakePoint(?,?),4326)::geography)::numeric) distance_meters,
                """ + IN_DISTRICT + " in_district FROM bangi_places WHERE active"
                + " AND (?='nearby' OR " + IN_DISTRICT + ")" + """
                 AND (?='' OR kind=?) AND (name ILIKE ? OR address ILIKE ?)
                 AND ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,?)
                 ORDER BY distance_meters,id LIMIT 300
                """, search.longitude(), search.latitude(), search.scope(), search.kind(), search.kind(),
                search.namePattern(), search.namePattern(), search.longitude(), search.latitude(), search.radius());
    }

    public Map<String, Object> findActive(String id) {
        return db.one("SELECT " + COLUMNS + " FROM bangi_places WHERE id=? AND active", id);
    }

    public List<Map<String, Object>> counts(boolean districtOnly) {
        return db.list("SELECT kind,count(*) count FROM bangi_places WHERE active"
                + (districtOnly ? " AND " + IN_DISTRICT : "") + " GROUP BY kind ORDER BY kind");
    }

    public Object linkedParkingCount() {
        return db.one("SELECT count(*) count FROM bangi_places WHERE kind='PARKING' AND active AND live_supported").get("count");
    }
}
