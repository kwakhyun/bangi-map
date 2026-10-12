# 데이터 출처와 재현

수집일: 2026-10-11. 정규화 결과 `bangi-places.json`, 원본 SHA-256과 추출 범위 `manifest.json`.

| 시설 | 원본 | 기준 | 이용허락 |
|---|---|---|---|
| 따릉이 | [서울시 공공자전거 대여소 정보](https://data.seoul.go.kr/dataList/OA-13252/F/1/datasetView.do) | 공공자전거 대여소 정보(26.6월 기준).xlsx, seq=24, infSeq=2 | 서울특별시, 공공누리 제1유형 |
| 대여 수량 | [서울시 공공자전거 실시간 대여정보](https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do) | 서버 수집 시각 | 서울특별시, 공공누리 제1유형 |
| 화장실 | [서울시 공중화장실 위치정보](https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do) | 개별 원본 기준일 미제공 | 서울특별시, 공공누리 제1유형 |
| 주차장 | [서울시 공영주차장 안내 정보](https://data.seoul.go.kr/dataList/OA-13122/S/1/datasetView.do) | LAST_DATA_SYNC_TM | 서울특별시, 공공누리 제1유형 |
| 추가 주차장 좌표 | [서울시 실시간 도시데이터](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do) | 올림픽공원, 잠실 관광특구의 PRK_STTS, 2026-10-11 조회 | 서울특별시, 공공누리 제1유형 |
| 주차 현황 | [서울시 시영주차장 실시간 주차대수 정보](https://data.seoul.go.kr/dataList/OA-21709/A/1/datasetView.do) | NOW_PRK_VHCL_UPDT_TM | 서울특별시, 공공누리 제1유형 |
| 배경 지도 | [OpenStreetMap](https://www.openstreetmap.org/copyright) | 외부 타일 | © OpenStreetMap contributors, ODbL |

좌표 없는 시설은 추정 좌표를 붙이지 않고 제외한다. 주차장 데이터에 있는 방이고분, 위례성길, 방이동 공영주차장은 원본 LAT/LOT이 비어 있어 포함하지 않았다. 같은 코드가 반복되는 노상 주차장은 실제 주차구획 중 한 좌표를 대표로 사용하며 총 면수는 제공하지 않는다. 모든 화장실을 장애인 이용 가능으로 일괄 분류하지 않는다.

다운로드 원본은 `.runtime/bangi-sources/`에 저장했다. 공개 다운로드는 아래와 같이 재현할 수 있다.

```sh
curl -fsSL 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false' --data 'infId=OA-13252&seq=24&infSeq=2' -o .runtime/bangi-sources/bikes.xlsx
curl -fsSL 'https://datafile.seoul.go.kr/bigfile/iot/sheet/json/download.do' --data 'infId=OA-22586&srvType=S&serviceKind=1&pageNo=1&ssUserId=SAMPLE_VIEW' -o .runtime/bangi-sources/toilets-download.json
curl -fsSL 'https://datafile.seoul.go.kr/bigfile/iot/sheet/json/download.do' --data 'infId=OA-13122&srvType=S&serviceKind=1&pageNo=1&ssUserId=SAMPLE_VIEW' -o .runtime/bangi-sources/parking-download.json
python3 scripts/import-bangi-data.py
```

V5는 최초 배포된 스냅샷이므로 배포 이후에는 수정하지 않는다. 새 원본은 정규화 결과를 검토한 뒤 V6 이상의 별도 마이그레이션으로 반영해야 한다. 서울시 API의 `list_total_count`는 해당 응답 건수로 확인되어 전체 건수로 사용하지 않는다. 1,000행씩 읽어 마지막 페이지까지 수집한다.

인증키는 2026-10-11 사용자 승인으로 신규 발급했다. 공식 API가 안내하는 HTTP(8088) 사용의 키 노출 위험을 설명한 뒤 사용자가 명시적으로 승인했다. 서버의 목적지는 해당 공식 호스트로 제한하고 리다이렉트와 URL 로그를 금지한다. 서비스 자체는 HTTPS를 유지한다.


## 주차장 확장 (0.4.0)

주차장 33곳(기존 1곳에서 32곳 추가), 전체 165곳이다. 공식 도시데이터의 `citydata/1/5/올림픽공원`, `citydata/1/5/잠실 관광특구`에서 주차장만 추출한다. 응답은 `.runtime/parking-expansion/city-olympic.json`, `city-jamsil.json`에 비공개 원본으로 보관했다. 공개 정규화 결과에는 API 키와 인증 URL을 포함하지 않는다. 정규화 명령은 `python3 scripts/import-parking-data.py`다. 전체 기본 자료 재생성 시에도 이 원본이 있으면 자동으로 확장을 재적용한다. 원본 해시는 manifest.json에 기록한다.

시설 코드가 같은 도시데이터의 반복 행은 합친다. 같은 코드의 공영주차장 안내 자료가 있으면 그 상세 자료를 우선한다. 방이동과 인접한 잠실역, 신천유수지를 포함하도록 주차장 서쪽 경계를 127.101로 확장했다. 좌표 없는 방이고분, 방이동 공영 등의 자료는 여전히 제외했다. 올림픽공원 전체와 개별 출입구 주차장은 공급기관의 별도 코드이므로 함께 표시하지만 주차면 합계를 산출하지 않는다. 부설/민영 시설의 외부 차량 이용이나 현재 개방을 보장하지 않는다.

실시간 수량은 별도 `GetParkingInfo/1/1000/송파구`를 5분마다 조회한다. `TPKCT - NOW_PRK_VHCL_CNT`로 계산한다. 원본은 정수도 JSON의 `192.0` 형식으로 내려준다. 정수로 정확히 변환되는 숫자만 허용하며 결측·음수·소수 대수·총면수 초과·미래 시각을 현재 잔여면으로 표시하지 않는다. `PRK_STTS_YN=1`과 기관 제공 시각을 확인한다. 공급기관 안내상 반영 지연이 있을 수 있다. 연결 코드: 1277145(잠실역), 1475224(잠실나루역), 173646(신천유수지).

도시데이터의 `CUR_PRK_CNT`는 API 설명상 잔여면처럼 보이지만 동일 주차장의 `NOW_PRK_VHCL_CNT`와 일치하는 사례를 확인했다. 따라서 도시데이터는 위치/요금에만 사용한다. 자료 조회일을 원본 시설 정보의 갱신일로 대신하지 않는다. V5·V6·V7 마이그레이션은 배포 후 변경하지 않고 이후 갱신은 새 마이그레이션을 작성한다.
