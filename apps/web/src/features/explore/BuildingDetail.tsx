import { Building2, Info, MapPin, ChevronDown } from "lucide-react";
import { buildingName, classes, type Building } from "../../gis";

export function BuildingDetail({
  building: b,
  onNearby,
}: {
  building: Building;
  onNearby: () => void;
}) {
  const p = b.properties;
  return (
    <div className="detail-scroll">
      <div className="detail-category">
        <Building2 size={15} />
        {classes[p.class ?? ""] ?? "용도 미확인"}
      </div>
      <h2>{buildingName(b)}</h2>
      <p className="detail-subtitle">방이2동 건물 데이터</p>
      <div className="building-metrics">
        <div>
          <span>건물 높이</span>
          <strong>
            {p.renderHeight === null ? "—" : p.renderHeight.toLocaleString()}
            <small>{p.renderHeight !== null ? "m" : ""}</small>
          </strong>
          <em>
            {p.heightKind === "SOURCE"
              ? "원본 높이"
              : p.heightKind === "FLOORS"
                ? "층수 기반 추정"
                : "높이 미확인"}
          </em>
        </div>
        <div>
          <span>지상 층수</span>
          <strong>
            {p.floors ?? "—"}
            <small>{p.floors ? "층" : ""}</small>
          </strong>
          <em>{p.floors ? "원본 속성" : "정보 미제공"}</em>
        </div>
      </div>
      <div className="accuracy-note">
        <Info size={15} />
        <p>
          {p.heightKind === "SOURCE"
            ? "원본 지도에 등록된 높이입니다. 현장 실측 정확도는 검증되지 않았습니다."
            : p.heightKind === "FLOORS"
              ? "층수에 3.3m를 곱한 시각화용 추정 높이입니다. 실제 높이와 다를 수 있습니다."
              : "높이와 층수가 없어 실제 외곽만 평면으로 표시합니다."}
        </p>
      </div>
      <button className="primary wide" onClick={onNearby}>
        <MapPin size={16} />이 건물에서 가까운 시설
      </button>
      <dl className="gis-facts">
        <div>
          <dt>건물 외곽 면적</dt>
          <dd>{p.areaM2.toLocaleString()}㎡</dd>
        </div>
        <div>
          <dt>모델 기준</dt>
          <dd>단순 건물 외곽과 높이</dd>
        </div>
        <div>
          <dt>배포 기준</dt>
          <dd>2026.09.23</dd>
        </div>
      </dl>
      <details className="source-details">
        <summary>
          원본과 식별자 확인 <ChevronDown size={14} />
        </summary>
        <p className="feature-id">{p.id}</p>
        {p.sources.map((s, i) => {
          const match = s.record_id?.match(/^([wnr])(\d+)@/);
          return (
            <div key={i}>
              <strong>
                {s.dataset === "OpenStreetMap"
                  ? "OpenStreetMap"
                  : s.dataset.includes("zenodo")
                    ? "East Asian Buildings"
                    : s.dataset}
              </strong>
              {s.update_time && <p>원본 갱신: {s.update_time.slice(0, 10)}</p>}
              {match && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/${match[1] === "w" ? "way" : match[1] === "r" ? "relation" : "node"}/${match[2]}`}
                >
                  원본 건물 보기 ↗
                </a>
              )}
            </div>
          );
        })}
      </details>
    </div>
  );
}
