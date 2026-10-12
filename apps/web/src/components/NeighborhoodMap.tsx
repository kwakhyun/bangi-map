import { useEffect, useRef, useState } from "react";
import {
  Viewer,
  SceneMode,
  Cartesian3,
  Cartesian2,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CameraEventType,
  Math as CM,
  PolygonHierarchy,
  PolygonGeometry,
  GeometryInstance,
  Primitive,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  BoundingSphere,
  HeadingPitchRange,
  Matrix4,
  CustomDataSource,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  JulianDate,
  ShadowMode,
  Entity,
  EllipsoidGeodesic,
  Cartographic,
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
} from "cesium";
import {
  Plus,
  Minus,
  LocateFixed,
  Compass,
  Layers3,
  Ruler,
  RotateCcw,
  Sun,
  X,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import type { Place } from "../types";
import { kinds } from "../types";
import { buildingName, polygonRings, type Building } from "../gis";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { MapProps } from "../map-types";
const hierarchy = (rings: number[][][]) =>
  new PolygonHierarchy(
    Cartesian3.fromDegreesArray(rings[0].flatMap((p) => p.slice(0, 2))),
    rings
      .slice(1)
      .map(
        (r) =>
          new PolygonHierarchy(
            Cartesian3.fromDegreesArray(r.flatMap((p) => p.slice(0, 2))),
          ),
      ),
  );
export default function NeighborhoodMap(props: MapProps) {
  const host = useRef<HTMLDivElement>(null),
    vref = useRef<Viewer | null>(null),
    callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"3D" | "2D">("3D");
  const [layers, setLayers] = useState(false),
    [colorBy, setColorBy] = useState<"natural" | "height">("natural"),
    [basemap, setBasemap] = useState(false);
  const [shadows, setShadows] = useState(true),
    [hour, setHour] = useState(14),
    [measuring, setMeasuring] = useState(false),
    [pointCount, setPointCount] = useState(0),
    [distance, setDistance] = useState<number | null>(null);
  const [hover, setHover] = useState<{
      name: string;
      x: number;
      y: number;
    } | null>(null),
    [cameraHeight, setCameraHeight] = useState(1500);
  const buildings = useRef<Primitive | null>(null),
    markers = useRef<CustomDataSource | null>(null),
    highlights = useRef<CustomDataSource | null>(null);
  const markerMap = useRef(new Map<string, Place>()),
    measureActive = useRef(false),
    measurePoints = useRef<Cartesian3[]>([]),
    measureEntities = useRef<Entity[]>([]);

  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function home() {
    const v = vref.current;
    if (!v) return;
    const c = props.scene.metadata.center;
    v.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(c.longitude, c.latitude), 720),
      {
        offset: new HeadingPitchRange(
          CM.toRadians(15),
          CM.toRadians(mode === "3D" ? -52 : -90),
          Math.max(2100, (1800 * v.canvas.clientHeight) / v.canvas.clientWidth),
        ),
        duration: reduced() ? 0 : 0.8,
      },
    );
  }
  useEffect(() => {
    let v: Viewer | undefined;
    let dispose: () => void = () => {};
    try {
      v = new Viewer(host.current!, {
        animation: false,
        timeline: false,
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        selectionIndicator: false,
        infoBox: false,
        sceneMode: SceneMode.SCENE3D,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        shadows: true,
      });
      vref.current = v;
      v.useBrowserRecommendedResolution = false;
      v.resolutionScale =
        Math.min(window.devicePixelRatio, 1.5) / window.devicePixelRatio;
      v.scene.backgroundColor = Color.fromCssColorString("#e9eef2");
      v.scene.globe.baseColor = Color.fromCssColorString("#e8ecef");
      v.scene.globe.showGroundAtmosphere = false;
      if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = false;
      if (v.scene.skyBox) v.scene.skyBox.show = false;
      if (v.scene.sun) v.scene.sun.show = false;
      if (v.scene.moon) v.scene.moon.show = false;
      v.scene.fog.enabled = false;
      v.scene.highDynamicRange = false;
      v.terrainShadows = ShadowMode.RECEIVE_ONLY;
      v.scene.light.intensity = 1.1;
      v.shadowMap.darkness = 0.55;
      v.shadowMap.softShadows = true;
      v.scene.globe.depthTestAgainstTerrain = true;
      v.scene.postProcessStages.fxaa.enabled = true;
      v.clock.shouldAnimate = false;
      v.clock.currentTime = JulianDate.fromIso8601("2026-10-11T05:00:00Z");
      v.scene.screenSpaceCameraController.tiltEventTypes = [
        CameraEventType.RIGHT_DRAG,
        CameraEventType.PINCH,
      ];
      v.scene.screenSpaceCameraController.zoomEventTypes = [
        CameraEventType.WHEEL,
        CameraEventType.PINCH,
      ];
      v.scene.screenSpaceCameraController.minimumZoomDistance = 80;
      v.scene.screenSpaceCameraController.maximumZoomDistance = 6500;
      const district = props.scene.boundary;
      for (const rings of polygonRings(district.geometry)) {
        v.entities.add({
          polygon: {
            hierarchy: hierarchy(rings),
            height: 0.05,
            material: Color.fromCssColorString("#b8c3c7"),
            shadows: ShadowMode.RECEIVE_ONLY,
          },
        });
        v.entities.add({
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights(
              rings[0].flatMap((p) => [p[0], p[1], 1]),
            ),
            width: 3,
            material: Color.fromCssColorString("#82a9da"),
          },
        });
      }
      for (const land of props.scene.land?.features ?? []) {
        for (const rings of polygonRings(land.geometry))
          v.entities.add({
            name: land.properties.name ?? undefined,
            polygon: {
              hierarchy: hierarchy(rings),
              height: 0.16,
              material: Color.fromCssColorString(
                land.properties.class === "park" ? "#90b68b" : "#c9be9f",
              ),
              shadows: ShadowMode.RECEIVE_ONLY,
            },
          });
      }
      for (const road of props.scene.roads.features) {
        const lines =
          road.geometry.type === "LineString"
            ? [road.geometry.coordinates]
            : road.geometry.coordinates;
        const major = ["primary", "secondary", "tertiary", "trunk"].includes(
          road.properties.class,
        );
        for (const line of lines)
          v.entities.add({
            polyline: {
              positions: Cartesian3.fromDegreesArrayHeights(
                line.flatMap((p) => [p[0], p[1], 0.12]),
              ),
              width: major ? 8 : 3,
              material: Color.fromCssColorString(major ? "#ffffff" : "#fffefa"),
            },
          });
      }
      const instances: GeometryInstance[] = [];
      for (const b of props.scene.buildings.features) {
        const h = b.properties.renderHeight;
        for (const [i, rings] of polygonRings(b.geometry).entries())
          instances.push(
            new GeometryInstance({
              id: `building:${b.properties.id}:${i}`,
              geometry: new PolygonGeometry({
                polygonHierarchy: hierarchy(rings),
                height: 0.3,
                extrudedHeight: h === null ? 0.3 : h,
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(
                  buildingColor(b, "natural"),
                ),
              },
            }),
          );
      }
      buildings.current = v.scene.primitives.add(
        new Primitive({
          geometryInstances: instances,
          appearance: new PerInstanceColorAppearance({
            closed: true,
            translucent: false,
          }),
          asynchronous: true,
          shadows: ShadowMode.CAST_ONLY,
        }),
      );
      markers.current = new CustomDataSource("생활시설");
      highlights.current = new CustomDataSource("선택");
      void v.dataSources.add(markers.current);
      void v.dataSources.add(highlights.current);
      markers.current.clustering.enabled = true;
      markers.current.clustering.pixelRange = 34;
      markers.current.clustering.minimumClusterSize = 3;
      const offCluster =
        markers.current.clustering.clusterEvent.addEventListener(
          (
            entities: Entity[],
            cluster: {
              point: { show: boolean };
              label: { show: boolean };
              billboard: import("cesium").Billboard;
            },
          ) => {
            cluster.point.show = false;
            cluster.label.show = false;
            cluster.billboard.show = true;
            cluster.billboard.image =
              "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><circle cx="21" cy="21" r="18" fill="#486785" stroke="white" stroke-width="3"/><text x="21" y="26" fill="white" font-family="Arial,sans-serif" font-weight="700" font-size="14" text-anchor="middle">${entities.length}</text></svg>`,
              );
            cluster.billboard.width = 36;
            cluster.billboard.height = 36;
            cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
            cluster.billboard.disableDepthTestDistance = Infinity;
            cluster.billboard.id = entities;
          },
        );
      const buildingLookup = new Map(
        props.scene.buildings.features.map((b) => [b.properties.id, b]),
      );
      const handlers = new ScreenSpaceEventHandler(v.canvas);
      const pickGround = (p: Cartesian2) =>
        v!.camera.pickEllipsoid(p, v!.scene.globe.ellipsoid);
      handlers.setInputAction((e: { position: Cartesian2 }) => {
        if (measureActive.current) {
          const point = pickGround(e.position);
          if (!point) return;
          if (measurePoints.current.length === 2) {
            measureEntities.current.forEach((x) => v!.entities.remove(x));
            measureEntities.current = [];
            measurePoints.current = [];
            setDistance(null);
          }
          measurePoints.current.push(point);
          setPointCount(measurePoints.current.length);
          measureEntities.current.push(
            v!.entities.add({
              position: point,
              point: {
                color: Color.fromCssColorString("#1d74ee"),
                pixelSize: 10,
                outlineColor: Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Infinity,
              },
            }),
          );
          if (measurePoints.current.length === 2) {
            const [a, b] = measurePoints.current.map((p) =>
              Cartographic.fromCartesian(p),
            );
            setDistance(new EllipsoidGeodesic(a, b).surfaceDistance);
            measureEntities.current.push(
              v!.entities.add({
                polyline: {
                  positions: [...measurePoints.current],
                  width: 4,
                  material: Color.fromCssColorString("#1d74ee"),
                  depthFailMaterial: Color.fromCssColorString("#1d74ee"),
                },
              }),
            );
          }
          v!.scene.requestRender();
          return;
        }
        const hit = v!.scene.pick(e.position);
        if (!hit) return;
        if (Array.isArray(hit.id)) {
          const positions = hit.id
            .map((x: Entity) => x.position?.getValue(v!.clock.currentTime))
            .filter(Boolean);
          v!.camera.flyToBoundingSphere(BoundingSphere.fromPoints(positions), {
            offset: new HeadingPitchRange(
              v!.camera.heading,
              CM.toRadians(-60),
              450,
            ),
            duration: reduced() ? 0 : 0.5,
          });
          return;
        }
        if (typeof hit.id === "string" && hit.id.startsWith("building:"))
          callbacks.current.onBuilding(hit.id.split(":")[1]);
        else if (hit.id?.id?.startsWith("place:"))
          callbacks.current.onSelect(hit.id.id.slice(6));
      }, ScreenSpaceEventType.LEFT_CLICK);
      let lastHover = 0;
      handlers.setInputAction((e: { endPosition: Cartesian2 }) => {
        if (measureActive.current || performance.now() - lastHover < 70) return;
        lastHover = performance.now();
        const hit = v!.scene.pick(e.endPosition);
        let name = "";
        if (typeof hit?.id === "string" && hit.id.startsWith("building:")) {
          const b = buildingLookup.get(hit.id.split(":")[1]);
          if (b) name = buildingName(b);
        } else if (hit?.id?.id?.startsWith("place:"))
          name = markerMap.current.get(hit.id.id.slice(6))?.name || "";
        v!.canvas.style.cursor = name ? "pointer" : "grab";
        setHover(
          name ? { name, x: e.endPosition.x, y: e.endPosition.y } : null,
        );
      }, ScreenSpaceEventType.MOUSE_MOVE);
      const cameraChanged = () =>
        setCameraHeight(Math.round(v!.camera.positionCartographic.height));
      v.camera.moveEnd.addEventListener(cameraChanged);
      const c = props.scene.metadata.center;
      v.camera.lookAt(
        Cartesian3.fromDegrees(c.longitude, c.latitude),
        new HeadingPitchRange(
          CM.toRadians(15),
          CM.toRadians(-52),
          Math.max(2100, (1800 * v.canvas.clientHeight) / v.canvas.clientWidth),
        ),
      );
      v.camera.lookAtTransform(Matrix4.IDENTITY);
      v.scene.renderError.addEventListener(() =>
        setError(
          "3D 지도를 표시하지 못했어요. 시설 목록은 계속 이용할 수 있습니다.",
        ),
      );
      setReady(true);
      v.scene.requestRender();
      dispose = () => {
        handlers.destroy();
        offCluster();
        v?.camera.moveEnd.removeEventListener(cameraChanged);
        v?.destroy();
        vref.current = null;
      };
    } catch {
      v?.destroy();
      vref.current = null;
      setError(
        "이 환경에서는 3D 지도를 열 수 없어요. 시설 목록에서 탐색해 주세요.",
      );
    }
    return dispose;
  }, [props.scene]);
  useEffect(() => {
    const source = markers.current,
      v = vref.current;
    if (!source || !v || !ready) return;
    source.entities.removeAll();
    markerMap.current = new Map(props.places.map((p) => [p.id, p]));
    for (const p of props.places) {
      const chosen = p.id === props.selected;
      source.entities.add({
        id: "place:" + p.id,
        position: Cartesian3.fromDegrees(p.longitude, p.latitude, 6),
        billboard: {
          image: markerSvg(p, chosen),
          width: chosen ? 42 : 34,
          height: chosen ? 48 : 40,
          verticalOrigin: VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Infinity,
          scaleByDistance: new NearFarScalar(200, 1.1, 3500, 0.75),
        },
        label: chosen
          ? {
              text: p.name,
              font: "600 13px sans-serif",
              fillColor: Color.fromCssColorString("#24364b"),
              showBackground: true,
              backgroundColor: Color.WHITE,
              backgroundPadding: new Cartesian2(12, 8),
              pixelOffset: new Cartesian2(0, -61),
              disableDepthTestDistance: Infinity,
            }
          : undefined,
      });
    }
    v.scene.requestRender();
  }, [props.places, props.selected, ready]);
  useEffect(() => {
    const ds = highlights.current,
      v = vref.current;
    if (!ds || !v || !ready) return;
    ds.entities.removeAll();
    const b = props.selectedBuilding;
    if (b)
      for (const rings of polygonRings(b.geometry))
        ds.entities.add({
          polygon: {
            hierarchy: hierarchy(rings),
            height: 0.5,
            extrudedHeight: (b.properties.renderHeight ?? 0) + 0.6,
            material: Color.fromCssColorString("#368afa").withAlpha(0.88),
            outline: false,
          },
        });
    v.scene.requestRender();
  }, [props.selectedBuilding, ready]);
  useEffect(() => {
    const v = vref.current;
    if (!v || !ready || !props.focus) return;
    v.camera.flyToBoundingSphere(
      new BoundingSphere(
        Cartesian3.fromDegrees(props.focus.lon, props.focus.lat),
        80,
      ),
      {
        offset: new HeadingPitchRange(
          v.camera.heading,
          CM.toRadians(mode === "3D" ? -50 : -90),
          props.focus.close ? 450 : 650,
        ),
        duration: reduced() ? 0 : 0.7,
      },
    );
  }, [props.focus, ready]);
  useEffect(() => {
    if (buildings.current) buildings.current.show = props.buildingVisible;
    if (highlights.current) highlights.current.show = props.buildingVisible;
    vref.current?.scene.requestRender();
  }, [props.buildingVisible, ready]);
  useEffect(() => {
    const v = vref.current;
    if (!v || !ready) return;
    let done = false;
    const update = () => {
      const primitive = buildings.current;
      if (!primitive?.ready) return;
      for (const b of props.scene.buildings.features)
        for (let i = 0; i < polygonRings(b.geometry).length; i++) {
          const a = primitive.getGeometryInstanceAttributes(
            `building:${b.properties.id}:${i}`,
          );
          if (a)
            a.color = ColorGeometryInstanceAttribute.toValue(
              buildingColor(b, colorBy),
            );
        }
      done = true;
      v.scene.requestRender();
    };
    update();
    const off = v.scene.postRender.addEventListener(() => {
      if (!done) update();
    });
    return off;
  }, [colorBy, ready, props.scene]);
  useEffect(() => {
    const v = vref.current;
    if (!v || !ready) return;
    v.shadows = shadows;
    v.clock.currentTime = JulianDate.fromIso8601(
      `2026-10-11T${String(hour - 9).padStart(2, "0")}:00:00Z`,
    );
    v.scene.requestRender();
  }, [hour, shadows, ready]);
  useEffect(() => {
    const v = vref.current;
    if (!v || !ready) return;
    v.imageryLayers.removeAll();
    if (basemap) {
      const provider = new UrlTemplateImageryProvider({
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        tilingScheme: new WebMercatorTilingScheme(),
        maximumLevel: 19,
        credit: "© OpenStreetMap contributors",
      });
      v.imageryLayers.addImageryProvider(provider);
    }
    // The district ground is translucent only in the optional street-map view.
    for (const e of v.entities.values) if (e.polygon) e.show = !basemap;
    v.scene.requestRender();
  }, [basemap, ready]);
  function toggleMeasure() {
    const next = !measuring;
    setMeasuring(next);
    measureActive.current = next;
    setHover(null);
    if (!next) {
      measureEntities.current.forEach((e) => vref.current?.entities.remove(e));
      measureEntities.current = [];
      measurePoints.current = [];
      setPointCount(0);
      setDistance(null);
    }
    vref.current?.scene.requestRender();
  }
  function changeMode(next: "3D" | "2D") {
    setMode(next);
    const v = vref.current;
    if (!v) return;
    v.scene.screenSpaceCameraController.enableTilt = next === "3D";
    const p = v.camera.pickEllipsoid(
      new Cartesian2(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2),
    );
    const c = p ? Cartographic.fromCartesian(p) : null;
    const center = c
      ? Cartesian3.fromRadians(c.longitude, c.latitude)
      : Cartesian3.fromDegrees(
          props.scene.metadata.center.longitude,
          props.scene.metadata.center.latitude,
        );
    v.camera.flyToBoundingSphere(new BoundingSphere(center, 200), {
      offset: new HeadingPitchRange(
        next === "2D" ? 0 : v.camera.heading,
        CM.toRadians(next === "3D" ? -52 : -90),
        Math.max(750, Math.min(2000, v.camera.positionCartographic.height)),
      ),
      duration: reduced() ? 0 : 0.6,
    });
  }
  return (
    <section
      className={"map-shell " + (measuring ? "is-measuring" : "")}
      aria-label="방이2동 3D GIS 지도"
    >
      <div className="cesium-host" ref={host} />
      {error && (
        <div className="map-error" role="alert">
          <h3>지도를 확인해 주세요</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>다시 열기</button>
        </div>
      )}
      <div className="map-heading">
        <span className="map-kicker">SEOUL · SONGPA</span>
        <h1>
          방이2동<span>우리 동네를 입체적으로</span>
        </h1>
        <p>
          <i />
          실제 경계와 건물 데이터
        </p>
      </div>
      <div className="map-top-tools">
        <div className="segmented mode-switch" aria-label="지도 시점">
          {(["2D", "3D"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => changeMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          className={"map-tool " + (layers ? "active" : "")}
          onClick={() => setLayers(!layers)}
          aria-expanded={layers}
        >
          <Layers3 size={17} />
          지도 설정
        </button>
      </div>
      {layers && (
        <div className="layer-popover">
          <div className="popover-title">
            <strong>지도 표현</strong>
            <button
              aria-label="지도 설정 닫기"
              onClick={() => setLayers(false)}
            >
              <X size={17} />
            </button>
          </div>
          <label className="toggle-row">
            <span>건물 표시</span>
            <input
              type="checkbox"
              checked={props.buildingVisible}
              onChange={(e) => props.onBuildingVisible(e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>도로 배경지도</span>
            <input
              type="checkbox"
              checked={basemap}
              onChange={(e) => setBasemap(e.target.checked)}
            />
          </label>
          <div className="layer-choice">
            <span>건물 색상</span>
            <div className="segmented">
              <button
                aria-pressed={colorBy === "natural"}
                onClick={() => setColorBy("natural")}
              >
                기본
              </button>
              <button
                aria-pressed={colorBy === "height"}
                onClick={() => setColorBy("height")}
              >
                높이별
              </button>
            </div>
          </div>
          <label className="toggle-row">
            <span>
              <Sun size={16} />
              그림자 참고 보기
            </span>
            <input
              type="checkbox"
              checked={shadows}
              onChange={(e) => setShadows(e.target.checked)}
            />
          </label>
          {shadows && (
            <div className="sun-control">
              <label htmlFor="sun-hour">10월 11일 · {hour}:00 KST</label>
              <input
                id="sun-hour"
                type="range"
                min={9}
                max={18}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              />
              <p>단순 건물과 평탄한 지면으로 계산한 참고 표현입니다.</p>
            </div>
          )}
        </div>
      )}
      <div className="camera-tools">
        <button
          title="북쪽 정렬"
          aria-label="북쪽 정렬"
          onClick={() => {
            const v = vref.current;
            if (v)
              v.camera.flyTo({
                destination: v.camera.positionWC,
                orientation: { heading: 0, pitch: v.camera.pitch, roll: 0 },
                duration: reduced() ? 0 : 0.5,
              });
          }}
        >
          <Compass size={19} />
          <small>N</small>
        </button>
        <div className="camera-group">
          <button
            aria-label="지도 확대"
            onClick={() => {
              const v = vref.current;
              v?.camera.zoomIn(
                Math.max(50, v.camera.positionCartographic.height * 0.25),
              );
              v?.scene.requestRender();
            }}
          >
            <Plus size={20} />
          </button>
          <button
            aria-label="지도 축소"
            onClick={() => {
              const v = vref.current;
              v?.camera.zoomOut(
                Math.max(50, v.camera.positionCartographic.height * 0.3),
              );
              v?.scene.requestRender();
            }}
          >
            <Minus size={20} />
          </button>
        </div>
        <button
          aria-label="방이2동 전체 보기"
          title="방이2동 전체 보기"
          onClick={home}
        >
          <LocateFixed size={20} />
        </button>
        <button
          aria-label="직선거리 측정"
          title="직선거리 측정"
          aria-pressed={measuring}
          onClick={toggleMeasure}
        >
          <Ruler size={20} />
        </button>
      </div>
      {measuring && (
        <div className="measure-help">
          <Ruler size={16} />
          <span>
            {distance === null
              ? pointCount === 1
                ? "끝 지점을 선택해 주세요"
                : "지도에서 두 지점을 선택해 주세요"
              : `직선거리 ${Math.round(distance).toLocaleString()}m`}
          </span>
          <button aria-label="측정 끝내기" onClick={toggleMeasure}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="legend-line" />
          방이2동 경계
        </span>
        <span>
          <i className="legend-block" />
          높이 정보 있음
        </span>
        <span>
          <i className="legend-flat" />
          높이 미확인
        </span>
        {colorBy === "height" && (
          <span className="height-ramp">
            낮음 <i /> 높음
          </span>
        )}
      </div>
      <div className="scene-note">
        <span>건물 {props.scene.metadata.buildings.toLocaleString()}개</span>
        <span>지도 높이 {cameraHeight.toLocaleString()}m</span>
        <span>드래그로 이동 · 오른쪽 드래그로 회전</span>
      </div>
      {hover && (
        <div
          className="map-hover"
          style={{
            left: Math.min(
              hover.x + (host.current?.offsetLeft ?? 0) + 14,
              (host.current?.clientWidth ?? 1000) +
                (host.current?.offsetLeft ?? 0) -
                230,
            ),
            top: Math.max(8, hover.y - 42),
          }}
        >
          {hover.name}
          <ArrowUpRight size={12} />
        </div>
      )}
      <div className="map-footer">
        <span>경계: SGIS / vuski · 건물·도로: Overture / OpenStreetMap</span>
        <a href="/gis/bangi2-scene-v1.json" target="_blank" rel="noreferrer">
          공간 데이터 원본 ↗
        </a>
      </div>
    </section>
  );
}
function buildingColor(b: Building, mode: "natural" | "height") {
  const p = b.properties;
  if (p.heightKind === "UNKNOWN") return Color.fromCssColorString("#a4b4bb");
  if (mode === "height")
    return Color.fromHsl(
      0.54 - (Math.min(p.renderHeight ?? 0, 95) / 95) * 0.08,
      0.38,
      0.82 - (Math.min(p.renderHeight ?? 0, 95) / 95) * 0.46,
    );
  return Color.fromCssColorString(
    p.heightKind === "FLOORS"
      ? "#b7c1ba"
      : (p.renderHeight ?? 0) > 40
        ? "#93adc3"
        : "#a7b8c6",
  );
}
function markerSvg(p: Place, selected: boolean) {
  const color = kinds[p.kind].color;
  const letter = p.kind === "BIKE" ? "B" : p.kind === "PARKING" ? "P" : "WC";
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 49l-7-10h14z" fill="${color}"/><rect x="3" y="3" width="38" height="37" rx="13" fill="${selected ? color : "#ffffff"}" stroke="${selected ? "#ffffff" : color}" stroke-width="3"/><text x="22" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="${letter === "WC" ? 13 : 19}" font-weight="700" fill="${selected ? "#ffffff" : color}">${letter}</text></svg>`,
    )
  );
}
