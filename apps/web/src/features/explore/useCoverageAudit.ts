import { useQuery } from "@tanstack/react-query";

interface CoverageAudit {
  schemaVersion: 1;
  footprints: { count: number };
  vworld: { regionalBuildYear: number; metadataUrl: string };
  smap: { latestSelectableYearObserved: number; freeViewerUrl: string };
}

/** Public data is fetched by URL, never bundled through an import from public/. */
export function useCoverageAudit() {
  return useQuery({
    queryKey: ["coverage-audit", 1],
    queryFn: async ({ signal }) => {
      const response = await fetch("/gis/coverage-audit.json", { signal });
      if (!response.ok) throw new Error("점검 자료를 불러오지 못했어요.");
      const data = (await response.json()) as CoverageAudit;
      if (data.schemaVersion !== 1)
        throw new Error("점검 자료의 형식을 확인해 주세요.");
      return data;
    },
    staleTime: Infinity,
  });
}
