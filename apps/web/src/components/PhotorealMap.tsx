import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, RotateCcw, Info } from "lucide-react";
import { polygonRings } from "../gis";
import type { MapProps } from "../map-types";
import PhotoDataNotice from "./PhotoDataNotice";

// Match the clicked ground position to a published footprint, never to the nearest
// building. VWorld's model IDs and Overture's IDs are independent datasets.
function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [px, py] = ring[j];
    if (y > lat !== py > lat && lon < ((px - x) * (lat - y)) / (py - y) + x)
      inside = !inside;
  }
  return inside;
}
export default function PhotorealMap(
  props: MapProps & { onFallback: () => void },
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(props);
  current.current = props;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"2D" | "3D">("3D");
  const [notice, setNotice] = useState(false);
  function send(type: string, data: Record<string, unknown> = {}) {
    frame.current?.contentWindow?.postMessage(
      { channel: "bangi-vworld-v1", type, ...data },
      window.location.origin,
    );
  }
  function sync() {
    const p = current.current;
    send("state", {
      payload: {
        boundary: p.scene.boundary.geometry,
        places: p.places.map((place) => ({
          id: place.id,
          name: place.name,
          kind: place.kind,
          lon: place.longitude,
          lat: place.latitude,
        })),
        selected: p.selected,
        selectedBuilding: p.selectedBuilding?.geometry,
        focus: p.focus,
      },
    });
  }
  useEffect(() => {
    const timeout = window.setTimeout(() => setStatus("error"), 50000);
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "bangi-vworld-v1"
      )
        return;
      const data = event.data,
        p = current.current;
      if (data.type === "ready") {
        clearTimeout(timeout);
        setStatus("ready");
        sync();
      }
      if (data.type === "error") {
        clearTimeout(timeout);
        setStatus("error");
      }
      if (
        data.type === "place" &&
        p.places.some((place) => place.id === data.id)
      )
        p.onSelect(data.id);
      if (
        data.type === "position" &&
        Number.isFinite(data.lon) &&
        Number.isFinite(data.lat)
      ) {
        const building = p.scene.buildings.features.find((b) =>
          polygonRings(b.geometry).some(
            (rings) =>
              inRing(data.lon, data.lat, rings[0]) &&
              !rings.slice(1).some((ring) => inRing(data.lon, data.lat, ring)),
          ),
        );
        if (building) p.onBuilding(building.properties.id);
      }
    };
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [attempt]);
  useEffect(() => {
    if (status === "ready") sync();
  }, [
    props.scene,
    props.places,
    props.selected,
    props.selectedBuilding,
    props.focus,
    status,
  ]);

  return (
    <section className="map-shell photo-map" aria-label="방이2동 실사 3D 지도">
      <iframe
        key={attempt}
        ref={frame}
        src="/realistic3d/index.html"
        title="브이월드 실사 3D 지도"
        className="photo-map-frame"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="geolocation 'none'; camera 'none'; microphone 'none'"
      />
      <div className="map-heading photo-heading">
        <span className="map-kicker">BANGI 2 · REAL WORLD</span>
        <h1>
          방이2동<span>익숙한 동네, 새로운 시선</span>
        </h1>
        <p>
          <i />
          외벽 사진과 지붕 모형
        </p>
      </div>
      <div className="map-top-tools">
        <div
          className="segmented mode-switch"
          role="group"
          aria-label="실사 지도 시점"
        >
          {(["2D", "3D"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              disabled={status !== "ready"}
              onClick={() => {
                setMode(value);
                send("mode", { mode: value });
              }}
            >
              {value === "2D" ? "위에서" : "비스듬히"}
            </button>
          ))}
        </div>
        <button
          className="map-tool"
          aria-expanded={notice}
          onClick={() => setNotice(!notice)}
        >
          <Info size={16} />
          지도 안내
        </button>
      </div>
      {notice && (
        <div className="layer-popover photo-info">
          <strong>실사 데이터와 촬영 시점</strong>
          <PhotoDataNotice />
          <p>
            파란 선은 방이2동의 행정 경계입니다. 선택한 건물의 속성은 Overture
            외곽과 위치를 대조한 정보로, 실사 모형과 차이가 있을 수 있습니다.
          </p>
          <p>높이별 색상과 거리 측정은 기본 지도에서 이용할 수 있어요.</p>
          <a
            href="https://www.vworld.kr/dev/v4dv_opnws3dmap3guide_s001.do"
            target="_blank"
            rel="noreferrer"
          >
            브이월드 3D 지도 안내 ↗
          </a>
        </div>
      )}
      <div className="camera-tools">
        <button
          aria-label="방이2동 전체 보기"
          title="방이2동 전체 보기"
          disabled={status !== "ready"}
          onClick={() => {
            setMode("3D");
            send("home");
          }}
        >
          <LocateFixed size={20} />
          <small>전체</small>
        </button>
        <div className="camera-group">
          <button
            aria-label="지도 확대"
            disabled={status !== "ready"}
            onClick={() => send("zoom", { direction: 1 })}
          >
            <Plus size={20} />
          </button>
          <button
            aria-label="지도 축소"
            disabled={status !== "ready"}
            onClick={() => send("zoom", { direction: -1 })}
          >
            <Minus size={20} />
          </button>
        </div>
      </div>
      <div className="photo-caption">
        <span>
          <i />
          방이2동 경계
        </span>
        <span>국토교통부 브이월드 · 촬영일 미확인</span>
      </div>
      {status === "error" && (
        <div className="photo-recovery" role="alert">
          <strong>실사 지도 연결이 지연되고 있어요</strong>
          <p>기본 지도에서도 시설 검색과 건물 정보를 이용할 수 있습니다.</p>
          <div>
            <button className="primary" onClick={props.onFallback}>
              기본 지도 보기
            </button>
            <button
              onClick={() => {
                setStatus("loading");
                setAttempt((n) => n + 1);
              }}
            >
              <RotateCcw size={15} />
              다시 연결
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
