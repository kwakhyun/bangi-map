import { lazy, Suspense, useState, useEffect, useDeferredValue } from "react";
import {
  Search,
  Bookmark,
  ArrowUpRight,
  ChevronRight,
  MessageCircle,
  X,
  Check,
  Building2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  ChevronDown,
  Box,
  CircleHelp,
  RotateCcw,
  LocateFixed,
} from "lucide-react";
import { readLocal, writeLocal } from "./api";
import { kinds, type Kind, type Place } from "./types";
import { buildingName, heightLabel, classes } from "./gis";
import { distance, summary } from "./place-utils";
import { ReportDialog } from "./components/ReportDialog";
import { Admin, MyReports } from "./components/ReportInbox";
import type { MapFocus } from "./map-types";
import { BuildingDetail } from "./features/explore/BuildingDetail";
import { PlaceDetail } from "./features/explore/PlaceDetail";
import { MapInfoDialog } from "./features/explore/MapInfoDialog";
import { useMapData } from "./features/explore/useMapData";
import { useExploreResults } from "./features/explore/useExploreResults";
import { placeIcons as icons } from "./features/explore/place-icons";
const MapWorkspace = lazy(() => import("./components/MapWorkspace"));
export function App() {
  const [admin, setAdmin] = useState(false),
    [modal, setModal] = useState<"info" | "reports" | null>(null),
    [report, setReport] = useState<Place | null>(null);
  const [search, setSearch] = useState(""),
    [tab, setTab] = useState<"places" | "buildings">("places"),
    [kind, setKind] = useState<Kind | "">("");
  const [nearby, setNearby] = useState(false),
    [liveOnly, setLiveOnly] = useState(false),
    [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>(() =>
      readLocal("bangi-saved", []),
    ),
    [selected, setSelected] = useState<string | null>(null),
    [buildingId, setBuildingId] = useState<string | null>(null);
  const [limit, setLimit] = useState(20),
    [toast, setToast] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [sheetExpanded, setSheetExpanded] = useState(false),
    [buildingsVisible, setBuildingsVisible] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null),
    [center, setCenter] = useState({
      longitude: 127.113826,
      latitude: 37.513255,
    }),
    [origin, setOrigin] = useState("방이2동 중심");
  const deferred = useDeferredValue(search);
  const { scene, config, places } = useMapData(nearby, center);
  const { allBuildings, buildingIndex, matchingBuildings, visible } =
    useExploreResults(scene.data, places.data, {
      deferred,
      kind,
      savedOnly,
      saved,
      liveOnly,
    });
  const chosen = (places.data ?? []).find((p) => p.id === selected),
    building = buildingId ? (buildingIndex.get(buildingId) ?? null) : null;
  const counts = nearby ? config.data?.nearbyCounts : config.data?.counts;
  const facilityTotal = counts?.reduce((n, c) => n + c.count, 0) ?? 0;
  const liveParkingCount = (places.data ?? []).filter(
    (p) => p.kind === "PARKING" && p.liveSupported,
  ).length;
  useEffect(() => {
    setLimit(20);
  }, [deferred, tab, kind, nearby, savedOnly, liveOnly]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setBuildingId(null);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function clearSelection() {
    setSelected(null);
    setBuildingId(null);
  }
  function selectPlace(id: string) {
    setSelected(id);
    setBuildingId(null);
    setSheetExpanded(false);
    const p = places.data?.find((p) => p.id === id);
    if (p)
      setFocus({
        lon: p.longitude,
        lat: p.latitude,
        key: Date.now(),
        close: true,
      });
  }
  function selectBuilding(id: string) {
    const b = buildingIndex.get(id);
    if (!b) return;
    setBuildingId(id);
    setSelected(null);
    setBuildingsVisible(true);
    setSheetExpanded(false);
    setFocus({
      lon: b.properties.longitude,
      lat: b.properties.latitude,
      key: Date.now(),
      close: true,
    });
  }
  function save(id: string) {
    const next = saved.includes(id)
      ? saved.filter((x) => x !== id)
      : [...saved, id];
    try {
      writeLocal("bangi-saved", next);
      setSaved(next);
      setToast(
        next.includes(id)
          ? "저장한 장소에 담았어요"
          : "저장한 장소에서 지웠어요",
      );
    } catch {
      setToast("브라우저 저장 공간을 사용할 수 없어요.");
    }
  }
  function changeCenter(lon: number, lat: number) {
    if (lon < 127.09 || lon > 127.16 || lat < 37.49 || lat > 37.54) {
      setToast("방이2동 주변에서 위치를 선택해 주세요.");
      return;
    }
    setCenter({ longitude: lon, latitude: lat });
    setOrigin("내 위치");
  }
  function locate() {
    if (!navigator.geolocation) {
      setToast("현재 위치를 지원하지 않는 브라우저입니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => changeCenter(p.coords.longitude, p.coords.latitude),
      () =>
        setToast(
          "위치 권한을 확인해 주세요. 방이2동 중심으로 계속 탐색할 수 있습니다.",
        ),
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  if (admin) return <Admin onBack={() => setAdmin(false)} />;
  return (
    <div className="gis-app">
      <header className="gis-header">
        <a href="/" className="gis-brand" aria-label="방이2동 3D 생활지도 홈">
          <img
            className="gis-brand-mark"
            src="/brand/bangi-icon-96.png"
            srcSet="/brand/bangi-icon-192.png 2x"
            width={40}
            height={40}
            alt=""
          />
          <span>
            방이<span className="brand-number">2</span>동
            <small>3D 생활지도</small>
          </span>
        </a>
        <nav aria-label="주 메뉴">
          <button
            className={!savedOnly ? "selected" : ""}
            onClick={() => {
              setSavedOnly(false);
              clearSelection();
            }}
          >
            지도 탐색
          </button>
          <button
            className={savedOnly ? "selected" : ""}
            onClick={() => {
              setSavedOnly(true);
              setTab("places");
              setCollapsed(false);
              setSheetExpanded(true);
              clearSelection();
            }}
          >
            <Bookmark size={15} />
            저장한 장소{saved.length > 0 && <em>{saved.length}</em>}
          </button>
          <button onClick={() => setModal("reports")}>
            <MessageCircle size={15} />내 제보
          </button>
        </nav>
        <div className="gis-header-end">
          <span className="header-district">
            <i />
            서울특별시 송파구
          </span>
          <button
            className="icon-button"
            aria-label="서비스 및 데이터 안내"
            onClick={() => setModal("info")}
          >
            <CircleHelp size={19} />
          </button>
          <button className="operator-button" onClick={() => setAdmin(true)}>
            운영자
          </button>
        </div>
      </header>
      <main
        className={
          "gis-workspace " +
          (collapsed ? "panel-collapsed " : "") +
          (chosen || building ? "has-selection " : "") +
          (sheetExpanded ? "sheet-expanded" : "")
        }
      >
        <Suspense
          fallback={
            <div className="gis-loading">
              <Box size={30} />
              <strong>방이2동을 준비하고 있어요</strong>
              <span>실제 건물과 도로를 불러옵니다</span>
            </div>
          }
        >
          {scene.data ? (
            <MapWorkspace
              scene={scene.data}
              places={tab === "buildings" ? [] : visible}
              selected={selected}
              selectedBuilding={building}
              onSelect={selectPlace}
              onBuilding={selectBuilding}
              onCenter={changeCenter}
              focus={focus}
              buildingVisible={buildingsVisible}
              onBuildingVisible={setBuildingsVisible}
            />
          ) : (
            <div className="gis-loading">
              <Box size={30} />
              <strong>
                {scene.isError
                  ? "공간 데이터를 불러오지 못했어요"
                  : "방이2동을 준비하고 있어요"}
              </strong>
              {scene.isError ? (
                <button className="primary" onClick={() => scene.refetch()}>
                  다시 시도
                </button>
              ) : (
                <span>실제 경계와 건물 데이터를 불러옵니다</span>
              )}
            </div>
          )}
        </Suspense>
        <button
          className="panel-open icon-button"
          hidden={!collapsed}
          aria-label="탐색 패널 열기"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen size={20} />
        </button>
        <aside
          className="gis-explorer"
          inert={collapsed}
          aria-label="시설과 건물 탐색"
        >
          <button
            className="sheet-handle"
            aria-label={sheetExpanded ? "목록 접기" : "목록 펼치기"}
            aria-expanded={sheetExpanded}
            onClick={() => setSheetExpanded(!sheetExpanded)}
          >
            <span />
          </button>
          <div className="explorer-heading">
            <div>
              <span className="section-overline">BANGI NEIGHBORHOOD</span>
              <h2>{savedOnly ? "저장한 장소" : "어디를 둘러볼까요?"}</h2>
            </div>
            <button
              className="icon-button collapse-button"
              aria-label="탐색 패널 접기"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          <div className="gis-search">
            <Search size={18} />
            <input
              aria-label="시설 또는 건물 검색"
              placeholder="장소, 건물 이름으로 검색"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                clearSelection();
                setSheetExpanded(true);
              }}
            />
            {search && (
              <button aria-label="검색어 지우기" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </div>
          <div className="explore-tabs" aria-label="탐색 대상">
            <button
              aria-pressed={tab === "places"}
              onClick={() => {
                setTab("places");
                clearSelection();
              }}
            >
              <MapPin size={15} />
              생활시설<span>{facilityTotal}</span>
            </button>
            <button
              aria-pressed={tab === "buildings"}
              onClick={() => {
                setTab("buildings");
                setSavedOnly(false);
                clearSelection();
              }}
            >
              <Building2 size={15} />
              건물<span>{allBuildings.length.toLocaleString()}</span>
            </button>
          </div>
          {tab === "places" ? (
            <>
              <div className="gis-categories" aria-label="시설 종류">
                <button
                  aria-pressed={!kind}
                  onClick={() => {
                    setKind("");
                    setLiveOnly(false);
                    clearSelection();
                  }}
                >
                  전체
                </button>
                {(Object.keys(kinds) as Kind[]).map((k) => {
                  const Icon = icons[k];
                  return (
                    <button
                      key={k}
                      aria-pressed={kind === k}
                      onClick={() => {
                        setKind(k);
                        setLiveOnly(false);
                        clearSelection();
                      }}
                    >
                      <Icon size={15} />
                      {kinds[k].label}
                    </button>
                  );
                })}
              </div>
              <div className="scope-row">
                <span>
                  {nearby ? "방이2동과 주변 지역" : "방이2동 경계 안"}
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={nearby}
                    onChange={(e) => {
                      setNearby(e.target.checked);
                      clearSelection();
                    }}
                  />
                  주변 포함
                </label>
              </div>
              {kind === "PARKING" && (
                <div className="compact-notice">
                  {liveParkingCount ? (
                    <>
                      잔여면 연동 {liveParkingCount}곳
                      <label>
                        <input
                          type="checkbox"
                          checked={liveOnly}
                          onChange={(e) => {
                            setLiveOnly(e.target.checked);
                            clearSelection();
                          }}
                        />
                        연동 시설만
                      </label>
                    </>
                  ) : (
                    <>
                      이 범위의 주차장은 잔여면 정보가 없습니다.
                      <button
                        onClick={() => {
                          setNearby(true);
                          setLiveOnly(true);
                          clearSelection();
                        }}
                      >
                        주변 연동 주차장 보기 <ArrowUpRight size={12} />
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="result-heading">
                <span>
                  <strong>{visible.length}</strong>개의 장소{" "}
                  <small>직선거리순</small>
                </span>
                <button aria-label="내 위치 기준으로 정렬" onClick={locate}>
                  <LocateFixed size={13} />
                  {origin}
                </button>
              </div>
            </>
          ) : (
            <div className="building-list-note">
              <span>
                <strong>{matchingBuildings.length.toLocaleString()}</strong>개
                건물
              </span>
              <span>원본 높이·추정·미확인 구분</span>
            </div>
          )}
          <div className="gis-results" aria-live="polite">
            {tab === "places" ? (
              places.isPending ? (
                <div className="gis-empty">시설 정보를 불러오는 중이에요</div>
              ) : places.isError ? (
                <div className="gis-empty">
                  <strong>시설 정보를 불러오지 못했어요</strong>
                  <button onClick={() => places.refetch()}>다시 시도</button>
                </div>
              ) : visible.length === 0 ? (
                <div className="gis-empty">
                  <Search size={26} />
                  <strong>
                    {savedOnly
                      ? "조건에 맞는 저장한 장소가 없어요"
                      : "조건에 맞는 장소가 없어요"}
                  </strong>
                  <p>검색어나 시설 종류를 바꿔보세요.</p>
                  {deferred && matchingBuildings.length > 0 && (
                    <button onClick={() => setTab("buildings")}>
                      건물 검색 결과 {matchingBuildings.length}개 보기
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSearch("");
                      setKind("");
                      setSavedOnly(false);
                      setLiveOnly(false);
                    }}
                  >
                    시설 전체 보기
                  </button>
                </div>
              ) : (
                visible.slice(0, limit).map((p) => {
                  const Icon = icons[p.kind];
                  return (
                    <article
                      key={p.id}
                      className={
                        "gis-place " + (p.id === selected ? "chosen" : "")
                      }
                    >
                      <button
                        className="gis-place-main"
                        onClick={() => selectPlace(p.id)}
                      >
                        <span
                          className={"facility-icon " + p.kind.toLowerCase()}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="place-lines">
                          <span className="place-caption">
                            {kinds[p.kind].label}{" "}
                            <span>{distance(p.distanceMeters)}</span>
                            {!p.inDistrict && <em>주변</em>}
                          </span>
                          <strong>{p.name}</strong>
                          <span
                            className={
                              "facility-status " +
                              (p.freshness === "FRESH" && p.kind !== "TOILET"
                                ? "is-fresh"
                                : "")
                            }
                          >
                            {summary(p, config.data?.bikeSource.configured)}
                          </span>
                        </span>
                      </button>
                      <button
                        className={
                          "save-place " +
                          (saved.includes(p.id) ? "is-saved" : "")
                        }
                        aria-label={
                          p.name +
                          (saved.includes(p.id) ? " 저장 취소" : " 저장")
                        }
                        aria-pressed={saved.includes(p.id)}
                        onClick={() => save(p.id)}
                      >
                        <Bookmark
                          size={16}
                          fill={saved.includes(p.id) ? "currentColor" : "none"}
                        />
                      </button>
                    </article>
                  );
                })
              )
            ) : (
              matchingBuildings.slice(0, limit).map((b) => (
                <button
                  className={
                    "gis-building-row " +
                    (b.properties.id === buildingId ? "chosen" : "")
                  }
                  key={b.properties.id}
                  onClick={() => selectBuilding(b.properties.id)}
                >
                  <span
                    className={
                      "building-icon " + b.properties.heightKind.toLowerCase()
                    }
                  >
                    <Building2 size={19} />
                  </span>
                  <span>
                    <strong>{buildingName(b)}</strong>
                    <small>
                      {classes[b.properties.class ?? ""] ?? "용도 미확인"}
                      <span>{heightLabel(b)}</span>
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            )}
            {tab === "buildings" && matchingBuildings.length === 0 && (
              <div className="gis-empty">
                <Building2 size={25} />
                <strong>검색된 건물이 없어요</strong>
                <p>등록된 건물 이름이나 식별자로 검색해 주세요.</p>
              </div>
            )}
            {(tab === "places" ? visible.length : matchingBuildings.length) >
              limit && (
              <button className="gis-more" onClick={() => setLimit(limit + 30)}>
                더 보기 <ChevronDown size={14} />
              </button>
            )}
          </div>
          <footer className="gis-explorer-footer">
            <span>
              <i />
              공개 데이터 기반
            </span>
            <button onClick={() => setModal("info")}>
              출처와 정확도 <ArrowUpRight size={12} />
            </button>
          </footer>
        </aside>
        {(chosen || building) && (
          <aside
            className="gis-detail"
            aria-label={chosen ? "시설 상세" : "건물 상세"}
          >
            <div className="detail-bar">
              <span>{chosen ? "생활시설" : "건물 정보"}</span>
              <button
                className="icon-button"
                aria-label="상세 닫기"
                onClick={clearSelection}
              >
                <X size={19} />
              </button>
            </div>
            {chosen ? (
              <PlaceDetail
                place={chosen}
                configured={config.data?.bikeSource.configured ?? false}
                saved={saved.includes(chosen.id)}
                onSave={() => save(chosen.id)}
                onReport={() => setReport(chosen)}
                onToast={setToast}
              />
            ) : (
              building && (
                <BuildingDetail
                  building={building}
                  onNearby={() => {
                    setTab("places");
                    setSearch("");
                    setKind("");
                    setSavedOnly(false);
                    setLiveOnly(false);
                    setCenter({
                      longitude: building.properties.longitude,
                      latitude: building.properties.latitude,
                    });
                    setOrigin("선택한 건물");
                    setCollapsed(false);
                    clearSelection();
                    setSheetExpanded(true);
                  }}
                />
              )
            )}
          </aside>
        )}
        <button
          className="mobile-explore"
          aria-expanded={sheetExpanded}
          onClick={() => {
            setSheetExpanded(!sheetExpanded);
            setCollapsed(false);
          }}
        >
          {sheetExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}{" "}
          {sheetExpanded ? "지도 넓게 보기" : "목록 펼치기"}
        </button>
      </main>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {report && (
        <ReportDialog place={report} onClose={() => setReport(null)} />
      )}
      {modal === "reports" && <MyReports onClose={() => setModal(null)} />}
      {modal === "info" && <MapInfoDialog onClose={() => setModal(null)} />}
    </div>
  );
}
