export type Polygon = { type: "Polygon"; coordinates: number[][][] };
export type MultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};
export type LineString = { type: "LineString"; coordinates: number[][] };
export type MultiLineString = {
  type: "MultiLineString";
  coordinates: number[][][];
};
export type Geometry = Polygon | MultiPolygon | LineString | MultiLineString;
export interface Feature<G = Geometry, P = Record<string, unknown>> {
  type: "Feature";
  id?: string;
  geometry: G;
  properties: P;
}
export interface FeatureCollection<G = Geometry, P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}
export interface BuildingProperties {
  id: string;
  name: string | null;
  height: number | null;
  floors: number | null;
  renderHeight: number | null;
  heightKind: "SOURCE" | "FLOORS" | "UNKNOWN";
  class: string | null;
  subtype: string | null;
  areaM2: number;
  longitude: number;
  latitude: number;
  sources: {
    dataset: string;
    record_id: string | null;
    update_time: string | null;
    license: string | null;
  }[];
}
export type Building = Feature<Polygon | MultiPolygon, BuildingProperties>;
export interface DistrictScene {
  type: "BangiDistrictScene";
  metadata: {
    version: string;
    district: string;
    boundaryVersion: string;
    buildingRelease: string;
    areaM2: number;
    bounds: number[];
    center: { longitude: number; latitude: number };
    buildings: number;
    heightCounts: Record<BuildingProperties["heightKind"], number>;
    roads: number;
    placeCounts: Record<string, number>;
  };
  boundary: Feature<Polygon | MultiPolygon>;
  buildings: FeatureCollection<Polygon | MultiPolygon, BuildingProperties>;
  land?: FeatureCollection<
    Polygon | MultiPolygon,
    { name: string | null; class: string }
  >;
  roads: FeatureCollection<
    LineString | MultiLineString,
    { class: string; name: string | null }
  >;
}
export const classes: Record<string, string> = {
  residential: "주거",
  apartments: "공동주택",
  commercial: "상업",
  office: "업무",
  hotel: "숙박",
  church: "종교",
  public: "공공",
  school: "교육",
  civic: "공공",
  dormitory: "기숙사",
};
export function buildingName(b: Building) {
  return b.properties.name || "이름 미등록 건물";
}
export function heightLabel(b: Building) {
  const p = b.properties;
  return p.heightKind === "UNKNOWN"
    ? "높이 미확인"
    : `${p.renderHeight?.toLocaleString()}m${p.heightKind === "FLOORS" ? " · 층수 추정" : ""}`;
}
export function polygonRings(g: Polygon | MultiPolygon) {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}
export function isPolygon(g: Geometry): g is Polygon | MultiPolygon {
  return g.type === "Polygon" || g.type === "MultiPolygon";
}
