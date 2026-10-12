# 방이2동 공간 데이터 출처

추출일 2026-10-11. 가공 파일은 웹의 `/gis/bangi2-scene-v1.json`에서 그대로 받을 수 있습니다.

## 행정동 경계

- 원자료: 통계청 통계지리정보서비스(SGIS), 공공누리 제1유형.
- 가공: vuski/admdongkor, CC BY 4.0, `ver20260701`.
- https://github.com/vuski/admdongkor
- 원본 커밋과 SHA-256: `boundary-source.json`. 원본 데이터의 라이선스: `BOUNDARY-LICENSE.txt`.
- 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.
- 방이2동 행정동 코드: 1171056200. SGIS 코드: 11240580. 법정동 방이동 전체와 다릅니다. 원본 경계를 그대로 추출했으며 측량이나 법적 경계 판단 자료가 아닙니다.

## 건물, 도로와 공원

- Overture Maps Foundation, 2026-09-23.1 release. https://docs.overturemaps.org/guides/buildings/
- 원본 공개 저장소: `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/type=building/` 및 `theme=transportation/type=segment/`.
- 건물 1,484개. 원본 도형을 유지하고 도형 내부 대표점이 방이2동에 들어오는 건물을 추출했습니다. 일부 건물의 모서리는 행정동 경계를 넘을 수 있습니다.
- 방이2동 데이터에 포함된 건물 출처: © OpenStreetMap contributors (974개), East Asian Buildings doi:10.5281/zenodo.8174931 (510개). 개별 출처, 식별자, 원본 갱신 시각은 각 건물의 `sources`에 보존되어 있습니다.
- Overture 건물/도로 배포본과 이를 잘라 만든 가공 데이터는 Open Database License (ODbL) 1.0 조건으로 제공합니다. https://opendatacommons.org/licenses/odbl/1-0/ , https://www.openstreetmap.org/copyright
- 원본 높이 646개는 모두 OSM 속성입니다. 실측 인증값이 아니며 원본 오차가 있을 수 있습니다. 10개는 층수 × 3.3m 추정입니다. 높이/층수가 없는 828개는 평면 외곽으로만 표시합니다.
- 도로는 같은 Overture 배포본의 실제 좌표에서 404개를 추출했습니다. 화면의 선 굵기는 가독성을 위한 표현이며 실제 도로 폭이 아닙니다.
- 지면은 WGS84 타원체 기준면입니다. 실측 지형이나 해발고도를 제공하지 않습니다. 건물 색상은 원본 외벽 색상이 아닌 지도 표현입니다.

## 공간 판정과 재현

시설은 PostGIS ST_Covers(경계, 좌표)로 포함 여부를 판단합니다. 경계 선상에 있는 점도 포함합니다. 건물은 원본 도형 내부 대표점을 같은 경계와 비교합니다. 화면은 원본 도형의 좌표를 그대로 사용합니다.

`scripts/import-bangi2.py`가 검증된 입력에서 브라우저 파일, PostGIS 마이그레이션, manifest를 생성합니다. 원본 SHA-256과 포함 시설 ID는 `manifest.json`에 있습니다. 배포된 마이그레이션은 변경하지 않고 데이터 갱신 시 새 버전으로 추가합니다.

공식 행정기관이 검수한 서비스는 아니며, 원본의 누락과 변경 지연이 있을 수 있습니다. 데이터 제공일과 원본 갱신 시각은 실제 건축/측량 시점과 다릅니다.

공원 6곳과 방이중학교 부지 1곳은 같은 Overture 배포본의 `theme=base/type=land_use` 원본 도형을 방이2동 경계로 잘랐습니다. 출처와 SHA-256은 `land-source.json`에 있으며, `scripts/enrich-bangi2-context.py`로 재현합니다. 공원/학교 색상은 화면 표현입니다.
