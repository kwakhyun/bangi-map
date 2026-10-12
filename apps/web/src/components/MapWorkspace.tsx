import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Scan, Layers3 } from "lucide-react";
import type { MapProps } from "../map-types";
const BasicMap = lazy(() => import("./NeighborhoodMap"));
const PhotorealMap = lazy(() => import("./PhotorealMap"));

export default function MapWorkspace(props: MapProps) {
  const [mode, setMode] = useState<"photo" | "basic">("photo");
  const provider = useQuery({
    queryKey: ["realistic3d-config"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/realistic3d/status.json", { signal });
      if (!response.ok) return { enabled: false };
      return (await response.json()) as { enabled: boolean };
    },
    retry: false,
    staleTime: 300000,
  });
  const photo = mode === "photo" && provider.data?.enabled === true;
  return (
    <section
      className={"map-shell map-workspace " + (photo ? "photo-active" : "")}
      aria-label="방이2동 지도"
    >
      <div className="map-provider-switch" role="group" aria-label="지도 종류">
        <button
          aria-pressed={photo}
          disabled={!provider.data?.enabled}
          onClick={() => setMode("photo")}
        >
          <Scan size={15} />
          실사 3D
        </button>
        <button aria-pressed={!photo} onClick={() => setMode("basic")}>
          <Layers3 size={15} />
          기본 지도
        </button>
      </div>
      <Suspense
        fallback={
          <div className="gis-loading">
            <Box size={30} />
            <strong>지도를 준비하고 있어요</strong>
          </div>
        }
      >
        {provider.isPending && mode === "photo" ? (
          <div className="gis-loading">지도 연결 확인 중</div>
        ) : photo ? (
          <PhotorealMap {...props} onFallback={() => setMode("basic")} />
        ) : (
          <BasicMap {...props} />
        )}
      </Suspense>
    </section>
  );
}
