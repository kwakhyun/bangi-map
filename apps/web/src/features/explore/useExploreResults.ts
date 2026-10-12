import { useMemo } from "react";
import { classes, type DistrictScene } from "../../gis";
import type { Kind, Place } from "../../types";

export function useExploreResults(
  scene: DistrictScene | undefined,
  places: Place[] | undefined,
  {
    deferred,
    kind,
    savedOnly,
    saved,
    liveOnly,
  }: {
    deferred: string;
    kind: Kind | "";
    savedOnly: boolean;
    saved: string[];
    liveOnly: boolean;
  },
) {
  const allBuildings = useMemo(
    () =>
      [...(scene?.buildings.features ?? [])].sort(
        (a, b) =>
          Number(Boolean(b.properties.name)) -
            Number(Boolean(a.properties.name)) ||
          (b.properties.renderHeight ?? 0) - (a.properties.renderHeight ?? 0) ||
          a.properties.id.localeCompare(b.properties.id),
      ),
    [scene],
  );
  const buildingIndex = useMemo(
    () => new Map(allBuildings.map((b) => [b.properties.id, b])),
    [allBuildings],
  );
  const matchingBuildings = useMemo(
    () =>
      allBuildings.filter(
        (b) =>
          !deferred ||
          (
            (b.properties.name ?? "") +
            " " +
            b.properties.id +
            " " +
            (classes[b.properties.class ?? ""] ?? "")
          )
            .toLowerCase()
            .includes(deferred.toLowerCase()),
      ),
    [allBuildings, deferred],
  );
  const visible = useMemo(
    () =>
      (places ?? []).filter(
        (p) =>
          (!kind || p.kind === kind) &&
          (!savedOnly || saved.includes(p.id)) &&
          (!liveOnly || p.liveSupported) &&
          (!deferred ||
            (p.name + " " + p.address)
              .toLowerCase()
              .includes(deferred.toLowerCase())),
      ),
    [places, kind, savedOnly, saved, liveOnly, deferred],
  );
  return { allBuildings, buildingIndex, matchingBuildings, visible };
}
