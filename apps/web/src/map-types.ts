import type { Place } from "./types";
import type { Building, DistrictScene } from "./gis";

export interface MapFocus {
  lon: number;
  lat: number;
  key: number;
  close?: boolean;
}
export interface MapProps {
  scene: DistrictScene;
  places: Place[];
  selected: string | null;
  selectedBuilding: Building | null;
  onSelect: (id: string) => void;
  onBuilding: (id: string) => void;
  onCenter: (lon: number, lat: number) => void;
  focus: MapFocus | null;
  buildingVisible: boolean;
  onBuildingVisible: (value: boolean) => void;
}
