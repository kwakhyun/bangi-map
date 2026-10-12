package net.fieldtwin.map;

import net.fieldtwin.BikeSync;
import net.fieldtwin.ParkingSync;
import net.fieldtwin.places.PlaceRepository;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class MapConfigService {
    private final MapRepository maps;
    private final PlaceRepository places;
    private final BikeSync bikes;
    private final ParkingSync parking;

    public MapConfigService(MapRepository maps, PlaceRepository places, BikeSync bikes, ParkingSync parking) {
        this.maps = maps;
        this.places = places;
        this.bikes = bikes;
        this.parking = parking;
    }

    public Map<String, Object> get() {
        var bikeSource = new LinkedHashMap<>(maps.source("seoul-bike"));
        bikeSource.put("configured", bikes.configured());
        if (!bikes.configured()) {
            bikeSource.put("status", "NOT_CONFIGURED");
            bikeSource.put("message", "서울시 인증키 등록 전으로 대여 수량을 제공하지 않습니다.");
        }
        var parkingSource = new LinkedHashMap<>(maps.source("seoul-parking"));
        parkingSource.put("configured", parking.configured());
        parkingSource.put("linkedCount", places.linkedParkingCount());
        if (!parking.configured()) {
            parkingSource.put("status", "NOT_CONFIGURED");
            parkingSource.put("message", "서울시 인증키 등록 전입니다.");
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("name", "방이2동 3D 생활지도");
        result.put("bikeSource", bikeSource);
        result.put("parkingSource", parkingSource);
        result.put("counts", places.counts(true));
        result.put("nearbyCounts", places.counts(false));
        result.put("district", maps.metadata());
        result.put("scope", "SGIS 원자료를 가공한 2026-07-01 기준 방이2동 행정동 경계입니다. 경계 안에 좌표가 있는 생활시설을 보여줍니다.");
        result.put("reportNotice", "서비스 운영자에게 전달되는 정보 제보입니다. 송파구청 민원이나 긴급 신고로 접수되지 않습니다.");
        return result;
    }
}
