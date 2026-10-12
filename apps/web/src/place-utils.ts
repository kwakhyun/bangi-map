import type { Place } from "./types";
export function distance(n: number) {
  return n < 1000 ? Math.round(n) + "m" : (n / 1000).toFixed(1) + "km";
}
export function summary(p: Place, configured = false) {
  if (p.kind === "BIKE")
    return p.freshness === "FRESH" && p.available !== null
      ? "대여 가능 " + p.available + "대"
      : p.freshness === "STALE"
        ? "수량 정보가 오래됐어요"
        : configured
          ? "수량 정보 없음"
          : "대여 수량 연동 전";
  if (p.kind === "PARKING")
    return p.freshness === "FRESH" && p.available !== null
      ? "주차 가능 " + p.available + "면"
      : p.freshness === "STALE"
        ? "잔여면 정보가 오래됐어요"
        : p.liveSupported
          ? "현재 잔여면 확인 불가"
          : "잔여면 정보 미제공";
  return String(p.details.hours || "개방시간 정보 없음");
}
export function facts(p: Place): [string, string][] {
  const d = p.details;
  const rows: [string, unknown][] =
    p.kind === "BIKE"
      ? [
          ["대여소 번호", d.stationNumber],
          ["거치대", d.racks ? d.racks + "대" : "정보 없음"],
          [
            "수량 상태",
            p.freshness === "FRESH"
              ? "최근 수집"
              : p.freshness === "STALE"
                ? "10분 이상 지난 정보"
                : "수량 정보 없음",
          ],
        ]
      : p.kind === "PARKING"
        ? [
            ["구분", d.type],
            [
              "기본 요금",
              d.basicMinutes && d.basicFee != null
                ? d.basicMinutes +
                  "분 " +
                  Number(d.basicFee).toLocaleString() +
                  "원 (자료 기준)"
                : "현장 확인",
            ],
            ["평일 운영", d.weekdayHours],
            [
              "주차면",
              p.totalCapacity != null && p.freshness === "FRESH"
                ? p.totalCapacity + "면"
                : d.capacity
                  ? d.capacity + "면 (자료 기준)"
                  : "전체 주차면 정보 없음",
            ],
            [
              "주차 현황",
              p.freshness === "FRESH" && p.occupied !== null
                ? "주차 중 " + p.occupied + "대 / 잔여 " + p.available + "면"
                : summary(p),
            ],
            ["위치 기준", d.coordinateNote],
            [
              "이용 안내",
              d.accessNote || "외부 차량 이용 조건과 할인은 현장 확인",
            ],
            ["문의", d.phone],
          ]
        : [
            ["개방시간", d.hours],
            ["장애인 화장실", d.accessibility || "정보 없음"],
            ["편의시설", d.amenities || "정보 없음"],
            ["시설 유형", d.type],
            ["문의", d.phone],
          ];
  return rows.map(([a, b]) => [a, String(b || "정보 없음")]);
}
