import {
  Bookmark,
  ArrowUpRight,
  ChevronDown,
  MessageCircle,
  ChevronRight,
} from "lucide-react";
import { date } from "../../api";
import { kinds, type Place } from "../../types";
import { summary, facts } from "../../place-utils";
import { placeIcons as icons } from "./place-icons";

export function PlaceDetail({
  place: p,
  configured,
  saved,
  onSave,
  onReport,
  onToast,
}: {
  place: Place;
  configured: boolean;
  saved: boolean;
  onSave: () => void;
  onReport: () => void;
  onToast: (s: string) => void;
}) {
  const Icon = icons[p.kind];
  return (
    <div className="detail-scroll">
      <div className="detail-category">
        <Icon size={16} />
        {kinds[p.kind].label}
        {!p.inDistrict && <em>방이2동 주변</em>}
        <button
          className={"icon-button " + (saved ? "is-saved" : "")}
          onClick={onSave}
          aria-label={saved ? "장소 저장 취소" : "장소 저장"}
          aria-pressed={saved}
        >
          <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <h2>{p.name}</h2>
      <p className="detail-subtitle">{p.address}</p>
      <div
        className={
          "gis-live-status " +
          (p.freshness === "FRESH" && p.kind !== "TOILET" ? "fresh" : "")
        }
      >
        <strong>{summary(p, configured)}</strong>
        <span>
          {p.kind === "BIKE"
            ? p.checkedAt
              ? date(p.checkedAt) + " 수집"
              : "수량을 받지 못했어요"
            : p.kind === "PARKING"
              ? p.providerUpdatedAt
                ? date(p.providerUpdatedAt) + " 서울시 제공"
                : "위치와 시설 정보를 제공합니다"
              : "공개 자료의 개방시간입니다"}
        </span>
      </div>
      <div className="gis-detail-actions">
        <a
          className="primary"
          href={
            "https://map.kakao.com/link/to/" +
            encodeURIComponent(p.name) +
            "," +
            p.latitude +
            "," +
            p.longitude
          }
          target="_blank"
          rel="noreferrer"
        >
          길찾기 <ArrowUpRight size={16} />
        </a>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(p.address);
              onToast("주소를 복사했어요");
            } catch {
              onToast("주소를 길게 눌러 복사해 주세요.");
            }
          }}
        >
          주소 복사
        </button>
      </div>
      <dl className="gis-facts">
        {facts(p).map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
      </dl>
      <details className="source-details">
        <summary>
          데이터 출처와 기준 <ChevronDown size={14} />
        </summary>
        <a href={p.sourceUrl} target="_blank" rel="noreferrer">
          {p.sourceName} ↗
        </a>
        <p>
          자료 기준: {p.sourceDate}
          <br />
          수집: {date(p.collectedAt)}
        </p>
        {p.kind === "PARKING" && p.liveSupported && (
          <p>
            총면수에서 현재 차량 수를 뺀 잔여면입니다. 제공 시각이 10분 이상
            지난 수량은 표시하지 않습니다. 현장 입차를 보장하지 않습니다.
          </p>
        )}
        <p>누락된 시설이 있을 수 있으며 운영 정보는 현장에서 확인해 주세요.</p>
      </details>
      <button className="gis-report" onClick={onReport}>
        <MessageCircle size={16} />
        정보 수정 제보
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
