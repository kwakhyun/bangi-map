package net.fieldtwin.places;

import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/places")
public class PlaceController {
    private final PlaceRepository places;

    public PlaceController(PlaceRepository places) { this.places = places; }

    @GetMapping
    public List<Map<String, Object>> search(
            @RequestParam(defaultValue="") String q,
            @RequestParam(defaultValue="") String kind,
            @RequestParam(defaultValue="127.113826") double longitude,
            @RequestParam(defaultValue="37.513255") double latitude,
            @RequestParam(defaultValue="5000") int radius,
            @RequestParam(defaultValue="district") String scope) {
        return places.search(new PlaceSearch(q, kind, longitude, latitude, radius, scope));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) { return places.findActive(id); }
}
