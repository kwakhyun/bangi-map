export type Kind = "BIKE" | "PARKING" | "TOILET";
export interface Place {
  id: string;
  kind: Kind;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  sourceUrl: string;
  sourceName: string;
  sourceDate: string;
  collectedAt: string;
  details: Record<string, string | number | null>;
  available: number | null;
  checkedAt: string | null;
  liveSupported: boolean;
  totalCapacity: number | null;
  occupied: number | null;
  providerUpdatedAt: string | null;
  freshness: "FRESH" | "STALE" | "UNAVAILABLE" | "NOT_PROVIDED";
  distanceMeters: number;
  inDistrict: boolean;
}
export interface MapConfig {
  name: string;
  scope: string;
  reportNotice: string;
  counts: { kind: Kind; count: number }[];
  nearbyCounts: { kind: Kind; count: number }[];
  parkingSource: {
    configured: boolean;
    status: string;
    message: string;
    linkedCount: number;
    lastSuccessAt: string | null;
  };
  bikeSource: {
    configured: boolean;
    status: string;
    message: string;
    lastSuccessAt: string | null;
  };
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  csrfToken: string;
}
export interface Report {
  id: string;
  placeId: string;
  placeName: string;
  category: string;
  description: string;
  status: string;
  response: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  hasPhoto: boolean;
}
export interface Receipt {
  id: string;
  token: string;
  name: string;
}
export const kinds = {
  BIKE: { label: "따릉이", color: "#15835f", letter: "B" },
  PARKING: { label: "주차장", color: "#3975ed", letter: "P" },
  TOILET: { label: "화장실", color: "#8b63ca", letter: "W" },
};
export const statuses: Record<string, string> = {
  RECEIVED: "접수됨",
  REVIEWING: "확인 중",
  RESOLVED: "처리 완료",
  REJECTED: "종결",
};
export const categories: Record<string, string> = {
  INFO: "정보가 달라요",
  BROKEN: "시설이 고장 났어요",
  ACCESS: "이용이 어려워요",
  OTHER: "기타 의견",
};
