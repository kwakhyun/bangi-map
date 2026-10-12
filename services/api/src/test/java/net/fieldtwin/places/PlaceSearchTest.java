package net.fieldtwin.places;

import net.fieldtwin.ApiError;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PlaceSearchTest {
    @Test void treatsSearchWildcardsAsLiteralText() {
        var search = new PlaceSearch("  50%_\\  ", "", 127.11, 37.51, 500, "district");
        assertEquals("%50\\%\\_\\\\%", search.namePattern());
    }

    @Test void rejectsUnsupportedScopeAndNonFiniteCoordinates() {
        assertEquals(400, assertThrows(ApiError.class,
                () -> new PlaceSearch("", "", 127.11, 37.51, 500, "all")).status);
        assertThrows(ApiError.class, () -> new PlaceSearch("", "", Double.NaN, 37.51, 500, "district"));
        assertThrows(ApiError.class, () -> new PlaceSearch("", "", 127.11, Double.POSITIVE_INFINITY, 500, "nearby"));
        assertThrows(ApiError.class, () -> new PlaceSearch("", "", 127.11, 37.51, 5001, "nearby"));
    }
}
