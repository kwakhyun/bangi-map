# API

응답은 JSON이며 브라우저/공유 캐시는 금지한다. 실패는 HTTP 상태코드와 `error`를 반환한다.

| 경로 | 기능 |
|---|---|
| GET /api/map-config | 범위, 시설 종류별 개수, 따릉이와 주차 현황 수집 상태 |
| GET /api/places?q=&kind=&longitude=&latitude=&radius=&scope=district | 이름/주소, BIKE/PARKING/TOILET, 100~5,000m 공간 검색; 최대 300건; district 기본, nearby 확장; inDistrict 반환 |
| GET /api/district | 실제 방이2동 경계 GeoJSON, 데이터 기준일과 건물 개수 |
| GET /api/buildings/{id} | Overture 식별자로 조회하는 건물 GeoJSON, 높이 및 출처 |
| GET /api/places/{id} | 시설 상세와 출처 |
| POST /api/reports | placeId, category, description, requestKey, receiptToken, 선택 photo(data URL) |
| GET /api/reports/{id} | X-Report-Token이 일치하는 접수 내역만 조회 |
| POST /api/auth/login | 운영자 email/password, HttpOnly 세션 쿠키 |
| POST /api/auth/logout | 세션 폐기, X-CSRF-Token 필요 |
| POST /api/auth/password | 현재 비밀번호와 새 비밀번호, X-CSRF-Token 필요 |
| GET /api/admin/reports | ADMIN의 최근 200개 제보 조회 |
| PATCH /api/admin/reports/{id} | status, response, version; ADMIN 및 X-CSRF-Token 필요 |
| GET /api/admin/reports/{id}/photo | ADMIN에게 정규화한 사진 제공 |

비공개 조회 토큰을 URL에 넣지 않는다. 제보 ID는 클라이언트 requestKey이며, 조회 토큰의 해시가 일치해야 조회할 수 있다. 접수 전 브라우저에 조회 권한을 저장해 응답 유실 시에도 조회할 수 있게 한다. 동일 requestKey에 다른 내용/토큰이면 409, 처리 버전 충돌도 409다.

`available=0`은 정상 수집한 따릉이 0대 또는 잔여 주차면 0면이다. `null`을 0으로 바꾸지 않는다. `sourceDate`는 위치/요금 자료의 기준일이고 `checkedAt`은 서버 수집 시각이다.

주차장은 `liveSupported`, `totalCapacity`, `occupied`, `providerUpdatedAt`을 추가 제공한다. `available = totalCapacity - occupied`이며, `providerUpdatedAt`은 서울시가 제공한 현황의 기준 시각(UTC 직렬화)이다. 수집 시각으로 덮어쓰지 않는다.

- `NOT_PROVIDED`: 연동 대상이 아닌 주차장. 위치/시설 정보만 제공한다.
- `UNAVAILABLE`: 수량 없음, 현황 미제공, 숫자/시각 검증 실패.
- `STALE`: 서버 수집 또는 주차 현황의 제공 시각이 10분 이상 지남. 이전 값이 응답에 남아도 UI는 현재 수량으로 표시하지 않는다.
- `FRESH`: 최신 유효값. 현장 입차를 보장하지 않는다.

`map-config.parkingSource`는 `configured`, `status`, `linkedCount`, 수집 시각과 메시지를 제공한다. API 키와 원본 인증 URL은 반환하지 않는다.

`map-config.counts`는 방이2동 경계 안의 시설 개수이고 `nearbyCounts`는 기존 생활권 전체의 개수입니다. `parkingSource.linkedCount`는 주변을 포함한 전체 연동 개수이며 방이2동 내 개수를 뜻하지 않습니다.

정적 `/gis/bangi2-scene-v1.json`은 경계, 건물, 도로, 공원/학교 도형을 포함합니다. 건물 상세 API와 같은 원자료에서 생성했습니다. ODbL 및 경계 CC BY 출처는 `/gis/SOURCES.md`에 있습니다. API 캐시 금지와 달리 이 공개 공간 파일에는 1시간 캐시를 적용합니다.
