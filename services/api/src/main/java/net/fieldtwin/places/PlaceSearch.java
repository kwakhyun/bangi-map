package net.fieldtwin.places;

import net.fieldtwin.ApiError;
import java.util.Set;

/** Validated search parameters shared by the HTTP boundary and spatial repository. */
public record PlaceSearch(String q, String kind, double longitude, double latitude, int radius, String scope) {
    public PlaceSearch {
        if (q == null || kind == null || scope == null
                || !Set.of("district", "nearby").contains(scope) || q.length() > 100
                || !Set.of("", "BIKE", "PARKING", "TOILET").contains(kind)
                || !Double.isFinite(longitude) || !Double.isFinite(latitude)
                || longitude < 126 || longitude > 128 || latitude < 37 || latitude > 38
                || radius < 100 || radius > 5000) {
            throw new ApiError(400, "검색 조건과 좌표를 확인해 주세요.");
        }
    }

    String namePattern() {
        return "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
