import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { MapConfig, Place } from "../../types";
import type { DistrictScene } from "../../gis";

// Query ownership stays separate from map selection and panel state.
export function useMapData(
  nearby: boolean,
  center: { longitude: number; latitude: number },
) {
  const scene = useQuery({
    queryKey: ["bangi2-scene-v1"],
    queryFn: async ({ signal }) => {
      const r = await fetch("/gis/bangi2-scene-v1.json", { signal });
      if (!r.ok) throw new Error("공간 데이터를 불러오지 못했어요.");
      return (await r.json()) as DistrictScene;
    },
    staleTime: Infinity,
  });
  const config = useQuery({
    queryKey: ["map-config"],
    queryFn: ({ signal }) => api<MapConfig>("/map-config", { signal }),
    refetchInterval: 120000,
  });
  const places = useQuery({
    queryKey: ["places", nearby, center],
    queryFn: ({ signal }) =>
      api<Place[]>(
        "/places?" +
          new URLSearchParams({
            scope: nearby ? "nearby" : "district",
            longitude: String(center.longitude),
            latitude: String(center.latitude),
          }),
        { signal },
      ),
    refetchInterval: 120000,
  });
  return { scene, config, places };
}
