/* VWorld WebGL 3.0 adapter. The vendor's Cesium stays inside this document.
 * Official SDK and textures stream directly from VWorld; no raw tiles are stored.
 */
(() => {
  const status = document.getElementById("connection-status");
  const origin = document.querySelector('meta[name="allowed-origin"]').content;
  const send = (type, payload = {}) => {
    if (parent !== window)
      parent.postMessage(
        { channel: "bangi-vworld-v1", type, ...payload },
        location.origin,
      );
  };
  const fail = () => {
    document.body.dataset.connection = "error";
    status.textContent =
      "실사 지도를 불러오지 못했어요. 기본 지도로 전환하거나 다시 시도해 주세요.";
    send("error");
  };
  if (
    document.body.dataset.connection !== "configured" ||
    location.origin !== origin ||
    !window.vw?.Map
  ) {
    fail();
    return;
  }
  let map,
    viewer,
    C,
    state,
    boundary = [],
    markers = [],
    selection = [],
    handler;
  let mode = "3D",
    initialized = false,
    focusKey = null,
    settle;
  const home = { lon: 127.113826, lat: 37.513255 };
  const timeout = setTimeout(() => {
    if (!initialized) fail();
  }, 45000);
  const validPosition = (p) =>
    p &&
    Number.isFinite(p.lon) &&
    Number.isFinite(p.lat) &&
    p.lon > 127.09 &&
    p.lon < 127.16 &&
    p.lat > 37.49 &&
    p.lat < 37.54;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rings = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  const clear = (list) => {
    list.forEach((e) => viewer.entities.remove(e));
    list.length = 0;
  };
  function lookAt(point, range = 850, immediate = false) {
    if (!viewer || !validPosition(point)) return;
    viewer.camera.cancelFlight();
    viewer.camera.flyToBoundingSphere(
      new C.BoundingSphere(
        C.Cartesian3.fromDegrees(point.lon, point.lat, 30),
        0,
      ),
      {
        offset: new C.HeadingPitchRange(
          0,
          C.Math.toRadians(mode === "2D" ? -90 : -50),
          range,
        ),
        duration: immediate || reduced() ? 0 : 0.7,
      },
    );
  }
  function outline(geometry, color, width, list) {
    if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type))
      return;
    for (const polygon of rings(geometry))
      for (const ring of polygon) {
        list.push(
          viewer.entities.add({
            polyline: {
              positions: C.Cartesian3.fromDegreesArray(
                ring.flatMap((p) => p.slice(0, 2)),
              ),
              width,
              clampToGround: true,
              material: C.Color.fromCssColorString(color),
            },
          }),
        );
      }
  }
  const markerImage = (kind, selected) => {
    const color =
      { BIKE: "#15835f", PARKING: "#3975ed", TOILET: "#8b63ca" }[kind] ||
      "#3975ed";
    const letter = { BIKE: "B", PARKING: "P", TOILET: "W" }[kind] || "•";
    return (
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 49 L16 39 H28Z" fill="${selected ? "#172c43" : color}"/><rect x="3" y="3" width="38" height="38" rx="13" fill="${selected ? "#172c43" : color}" stroke="white" stroke-width="3"/><text x="22" y="29" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="white">${letter}</text></svg>`,
      )
    );
  };
  function applyState(next) {
    if (!next || !Array.isArray(next.places) || next.places.length > 1000)
      return;
    state = next;
    if (!initialized) return;
    clear(markers);
    for (const p of state.places) {
      if (!validPosition(p) || typeof p.id !== "string") continue;
      markers.push(
        viewer.entities.add({
          id: "place:" + p.id,
          position: C.Cartesian3.fromDegrees(p.lon, p.lat, 1),
          billboard: {
            image: markerImage(p.kind, p.id === state.selected),
            width: 34,
            height: 40,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: p.id === state.selected ? String(p.name).slice(0, 90) : "",
            font: "14px sans-serif",
            fillColor: C.Color.WHITE,
            showBackground: true,
            backgroundColor: C.Color.fromCssColorString("#172c43"),
            pixelOffset: new C.Cartesian2(0, -57),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
    if (!boundary.length && next.boundary)
      outline(next.boundary, "#79baff", 3, boundary);
    clear(selection);
    if (next.selectedBuilding)
      outline(next.selectedBuilding, "#ffd35c", 4, selection);
    if (
      next.focus &&
      validPosition(next.focus) &&
      next.focus.key !== focusKey
    ) {
      focusKey = next.focus.key;
      lookAt(next.focus, next.focus.close ? 380 : 850);
    }
    viewer.scene.requestRender();
  }
  const onMessage = (event) => {
    if (
      event.source !== parent ||
      event.origin !== origin ||
      event.data?.channel !== "bangi-vworld-v1"
    )
      return;
    const data = event.data;
    if (data.type === "state") {
      applyState(data.payload);
      return;
    }
    if (!initialized) return;
    if (data.type === "home") {
      mode = "3D";
      lookAt(home);
    }
    if (data.type === "mode" && ["2D", "3D"].includes(data.mode)) {
      mode = data.mode;
      lookAt(
        state?.focus && validPosition(state.focus) ? state.focus : home,
        state?.focus?.close ? 380 : 850,
      );
    }
    if (data.type === "zoom" && [1, -1].includes(data.direction)) {
      const amount = Math.max(
        30,
        viewer.camera.positionCartographic.height * 0.25,
      );
      data.direction === 1
        ? viewer.camera.zoomIn(amount)
        : viewer.camera.zoomOut(amount);
    }
    if (data.type === "labels" && typeof data.visible === "boolean") {
      const layer = map.getLayerElement("명칭");
      if (layer) data.visible ? layer.show() : layer.hide();
    }
    viewer.scene.requestRender();
  };
  window.addEventListener("message", onMessage);
  window.addEventListener(
    "pagehide",
    () => {
      clearTimeout(timeout);
      clearTimeout(settle);
      window.removeEventListener("message", onMessage);
      handler?.destroy();
    },
    { once: true },
  );
  try {
    vw.ws3dInitCallBack = () => {
      try {
        C = window.Cesium || window.ws3d.common;
        viewer = window.ws3d.viewer;
        map.setNavigationZoomVisible(false);
        map.getLayerElement("명칭")?.hide();
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 65;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 8000;
        handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
          const picked = viewer.scene.pick(click.position);
          if (
            typeof picked?.id?.id === "string" &&
            picked.id.id.startsWith("place:")
          ) {
            send("place", { id: picked.id.id.slice(6) });
            return;
          }
          const point = viewer.scene.pickPositionSupported
            ? viewer.scene.pickPosition(click.position)
            : null;
          if (point) {
            const c = C.Cartographic.fromCartesian(point);
            send("position", {
              lon: C.Math.toDegrees(c.longitude),
              lat: C.Math.toDegrees(c.latitude),
            });
          }
        }, C.ScreenSpaceEventType.LEFT_CLICK);
        // The SDK starts its own home flight after its callback; cancel once it settles.
        settle = setTimeout(() => {
          try {
            initialized = true;
            clearTimeout(timeout);
            lookAt(home, 850, true);
            if (state) applyState(state);
            document.body.dataset.connection = "engine-ready";
            status.textContent = "브이월드 실사 지도 연결됨";
            send("ready");
          } catch {
            fail();
          }
        }, 1200);
      } catch {
        fail();
      }
    };
    map = new vw.Map();
    map.setMapId("vmap");
    map.setInitPosition(
      new vw.CameraPosition(
        new vw.CoordZ(home.lon, home.lat, 800),
        new vw.Direction(0, -50, 0),
      ),
    );
    map.setLogoVisible(true);
    map.start();
  } catch {
    clearTimeout(timeout);
    fail();
  }
})();
