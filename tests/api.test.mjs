import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const base = process.env.TEST_API_URL || "http://127.0.0.1:8080/api";
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
let cookie = "",
  csrf = "";
async function request(path, method = "GET", body, extra = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { r, data };
}
test("Bangi public data, report privacy, idempotency, admin workflow", async (t) => {
  let places;
  await t.test(
    "real coordinates, provenance and spatial filtering",
    async () => {
      const { r, data } = await request("/places?scope=nearby");
      assert.equal(r.status, 200);
      places = data;
      const expected = JSON.parse(
        await readFile(
          new URL("../data/manifest.json", import.meta.url),
          "utf8",
        ),
      );
      assert.equal(
        data.length,
        Object.values(expected.counts).reduce((a, b) => a + b, 0),
      );
      for (const p of data) {
        assert.ok(p.longitude >= 127.101 && p.longitude <= 127.14);
        assert.ok(p.latitude >= 37.505 && p.latitude <= 37.527);
        assert.match(p.sourceUrl, /^https:\/\/data.seoul.go.kr\//);
        assert.ok(p.sourceDate);
        assert.ok(!("receiptHash" in p));
      }
      assert.deepEqual(
        [...data]
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
          .map((p) => p.id),
        data.map((p) => p.id),
      );
      const b = (
        await request("/places?scope=nearby&kind=BIKE&q=" + encodeURIComponent("몽촌토성"))
      ).data;
      assert.ok(
        b.length > 0 &&
          b.every((p) => p.kind === "BIKE" && p.name.includes("몽촌토성")),
      );
      assert.equal((await request("/places?radius=1")).r.status, 400);
      assert.equal((await request("/places?longitude=NaN")).r.status, 400);
      const near = (await request("/places?scope=nearby&radius=500")).data;
      assert.ok(
        near.length < data.length && near.every((p) => p.distanceMeters <= 501),
      );
    },
  );
  await t.test("parking sources and availability semantics", async () => {
    const parking = (await request("/places?scope=nearby&kind=PARKING")).data;
    assert.equal(parking.length, 33);
    assert.equal(new Set(parking.map((p) => p.id)).size, parking.length);
    for (const code of ["1277145", "173646", "1475224"])
      assert.ok(parking.some((p) => p.id === "parking-" + code));
    assert.ok(parking.some((p) => p.name.includes("올림픽공원")));
    for (const p of parking) {
      if (!p.liveSupported) {
        assert.equal(p.freshness, "NOT_PROVIDED");
        assert.equal(p.available, null);
      }
      if (p.freshness === "FRESH") {
        assert.ok(p.providerUpdatedAt);
        assert.ok(p.available >= 0 && p.available <= p.totalCapacity);
        assert.equal(p.available, p.totalCapacity - p.occupied);
      }
    }
    const config = (await request("/map-config")).data;
    assert.ok(config.parkingSource);
    assert.equal(config.nearbyCounts.find((c) => c.kind === "PARKING").count, 33);
  });
  await t.test("Bangi-2 boundary is the default, with true building geometry", async () => {
    const manifest = JSON.parse(await readFile(new URL("../data/bangi2/manifest.json", import.meta.url), "utf8"));
    const { data: districtPlaces } = await request("/places");
    assert.deepEqual(districtPlaces.map(p => p.id).sort(), manifest.placeIds);
    assert.ok(districtPlaces.every(p => p.inDistrict === true));
    assert.equal(districtPlaces.filter(p => p.kind === 'PARKING' && p.liveSupported).length, 0);
    assert.ok(places.some(p => p.inDistrict === false));
    assert.equal((await request("/places?scope=anything")).r.status,400);
    const district = (await request("/district")).data;
    assert.equal(district.id,"bangi2");
    assert.equal(district.geometry.type,"MultiPolygon");
    assert.equal(district.properties.buildings,1484);
    const buildings=JSON.parse(await readFile(new URL("../data/bangi2/buildings.geojson", import.meta.url), "utf8")).features;
    for(const status of ['SOURCE','FLOORS','UNKNOWN']) {
      const sample=buildings.find(b=>b.properties.heightKind===status);
      const res=await request('/buildings/'+sample.id);
      assert.equal(res.r.status,200);
      assert.deepEqual(res.data.properties,sample.properties);
      assert.ok(res.data.geometry.coordinates.length>0);
    }
    assert.equal((await request('/buildings/not-a-building')).r.status,404);
  });
  await t.test("operator APIs require login", async () => {
    assert.equal((await request("/admin/reports")).r.status, 401);
  });
  const payload = {
    placeId: "bike-1268",
    category: "INFO",
    description: "자동 검증용 제보입니다. 실제 시설 문제를 뜻하지 않습니다.",
    photo:
      "data:image/png;base64," +
      (
        await readFile(new URL("./fixtures/report-photo.png", import.meta.url))
      ).toString("base64"),
    requestKey: randomUUID(),
    receiptToken: randomUUID() + randomUUID(),
  };
  let id;
  await t.test(
    "public submission is origin checked and privately retrievable",
    async () => {
      assert.equal(
        (
          await request("/reports", "POST", payload, {
            Origin: "https://untrusted.invalid",
          })
        ).r.status,
        403,
      );
      const first = await request("/reports", "POST", payload);
      assert.equal(first.r.status, 200);
      id = first.data.id;
      assert.equal(id, payload.requestKey);
      assert.equal(
        (await request("/admin/reports/" + id + "/photo")).r.status,
        401,
      );
      assert.equal((await request("/reports/" + id)).r.status, 404);
      assert.equal(
        (
          await request("/reports/" + id, "GET", undefined, {
            "X-Report-Token": "wrong",
          })
        ).r.status,
        404,
      );
      const own = await request("/reports/" + id, "GET", undefined, {
        "X-Report-Token": payload.receiptToken,
      });
      assert.equal(own.data.status, "RECEIVED");
      assert.equal(own.data.hasPhoto, true);
      assert.ok(!("receiptHash" in own.data));
      assert.equal(own.r.headers.get("cache-control"), "no-store");
    },
  );
  await t.test(
    "retries do not duplicate and conflicting requests are rejected",
    async () => {
      const retry = await request("/reports", "POST", payload);
      assert.equal(retry.data.id, id);
      assert.equal(retry.data.duplicate, true);
      assert.equal(
        (
          await request("/reports", "POST", {
            ...payload,
            description: "충돌을 검증하는 다른 내용입니다.",
          })
        ).r.status,
        409,
      );
      assert.equal(
        (
          await request("/reports", "POST", {
            ...payload,
            requestKey: randomUUID(),
            photo: "data:image/png;base64,aW52YWxpZA==",
          })
        ).r.status,
        400,
      );
    },
  );
  await t.test(
    "operator login, CSRF, optimistic locking and visible receipt response",
    async () => {
      const login = await request("/auth/login", "POST", {
        email: process.env.TEST_ADMIN_EMAIL || "admin@bangi.local",
        password: process.env.TEST_ADMIN_PASSWORD || "BangiLocal!2026",
      });
      assert.equal(login.r.status, 200);
      cookie = login.r.headers.get("set-cookie").split(";")[0];
      csrf = login.data.csrfToken;
      const photo = await fetch(base + "/admin/reports/" + id + "/photo", {
        headers: { Cookie: cookie },
      });
      assert.equal(photo.status, 200);
      assert.equal(photo.headers.get("content-type"), "image/jpeg");
      assert.equal(photo.headers.get("cache-control"), "no-store");
      const bytes = new Uint8Array(await photo.arrayBuffer());
      assert.deepEqual(Array.from(bytes.slice(0, 2)), [255, 216]);
      assert.equal(
        (
          await request(
            "/admin/reports/" + id,
            "PATCH",
            {
              status: "REVIEWING",
              response: "내용을 확인하고 있습니다.",
              version: 1,
            },
            { "X-CSRF-Token": "wrong" },
          )
        ).r.status,
        403,
      );
      assert.equal(
        (
          await request("/admin/reports/" + id, "PATCH", {
            status: "REVIEWING",
            response: "내용을 확인하고 있습니다.",
            version: 1,
          })
        ).r.status,
        200,
      );
      assert.equal(
        (
          await request("/admin/reports/" + id, "PATCH", {
            status: "RESOLVED",
            response: "동시 수정 충돌 확인",
            version: 1,
          })
        ).r.status,
        409,
      );
      assert.equal(
        (
          await request("/admin/reports/" + id, "PATCH", {
            status: "RESOLVED",
            response: "테스트 접수로 확인하여 검증을 마쳤습니다.",
            version: 2,
          })
        ).r.status,
        200,
      );
      const own = (
        await request("/reports/" + id, "GET", undefined, {
          "X-Report-Token": payload.receiptToken,
        })
      ).data;
      assert.equal(own.status, "RESOLVED");
      assert.equal(own.version, 3);
      await request("/auth/logout", "POST");
      assert.equal((await request("/admin/reports")).r.status, 401);
    },
  );
});
