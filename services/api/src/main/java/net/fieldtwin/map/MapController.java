package net.fieldtwin.map;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MapController {
    private final MapRepository maps;
    private final MapConfigService config;

    public MapController(MapRepository maps, MapConfigService config) {
        this.maps = maps;
        this.config = config;
    }

    @GetMapping("/map-config")
    public Map<String, Object> config() { return config.get(); }

    @GetMapping("/district")
    public Map<String, Object> district() { return maps.district(); }

    @GetMapping("/buildings/{id}")
    public Map<String, Object> building(@PathVariable String id) { return maps.building(id); }
}
