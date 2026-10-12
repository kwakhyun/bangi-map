import https from "node:https";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const ca = await readFile(".runtime/ncp/deploy/tls/ca.crt");
const release = JSON.parse(await readFile("package.json", "utf8")).version;
const webVersion = process.env.EXPECTED_WEB_VERSION || release;
const apiVersion = process.env.EXPECTED_API_VERSION || release;
assert.match(webVersion, /^\d+\.\d+\.\d+$/);
assert.match(apiVersion, /^\d+\.\d+\.\d+$/);
const get = (path) =>
  new Promise((resolve, reject) => {
    https
      .get("https://localhost:8443" + path, { ca }, (r) => {
        const chunks = [],
          tls = {
            authorized: r.socket.authorized,
            issuer: r.socket.getPeerCertificate().issuer.CN,
          };
        r.on("data", (chunk) => chunks.push(chunk));
        r.on("end", () =>
          resolve({
            code: r.statusCode,
            headers: r.headers,
            body: Buffer.concat(chunks),
            tls,
          }),
        );
      })
      .on("error", reject);
  });
const [root, status, viewer, loader, scene, places, config, protectedRoute] =
  await Promise.all(
    [
      "/",
      "/realistic3d/status.json",
      "/realistic3d/viewer.js",
      "/realistic3d/sdk-loader.js",
      "/gis/bangi2-scene-v1.json",
      "/api/places",
      "/api/map-config",
      "/api/admin/reports",
    ].map(get),
  );
for (const result of [root, status, viewer, loader, scene, places, config]) {
  assert.equal(result.code, 200);
  assert.ok(result.tls.authorized);
}
assert.equal(protectedRoute.code, 401);
assert.match(
  root.headers["content-security-policy"],
  /script-src 'self' 'unsafe-eval';/,
);
assert.doesNotMatch(
  root.headers["content-security-policy"],
  /script-src[^;]*unsafe-inline/,
);
assert.equal(root.headers["x-frame-options"], "DENY");
assert.equal(viewer.headers["x-frame-options"], "SAMEORIGIN");
assert.match(
  viewer.headers["content-security-policy"],
  /upgrade-insecure-requests/,
);
assert.match(loader.headers["cache-control"], /no-store/);
const metadata = JSON.parse(status.body);
assert.equal(metadata.enabled, true);
assert.deepEqual(
  loader.body,
  await readFile(".runtime/vworld/site/sdk-loader.js"),
);
assert.deepEqual(viewer.body, await readFile("experiments/vworld3d/viewer.js"));
assert.deepEqual(
  scene.body,
  await readFile("apps/web/public/gis/bangi2-scene-v1.json"),
);
for (const name of ['coverage-audit.json', 'building-coverage-audit.csv']) {
  const actual = await get('/gis/' + name);
  assert.equal(actual.code, 200);
  assert.deepEqual(actual.body, await readFile('apps/web/public/gis/' + name));
}
const coverage = JSON.parse((await get('/gis/coverage-audit.json')).body);
assert.equal(coverage.photoreal.missingCount, null);
assert.equal(coverage.photoreal.buildingLevelAuditCompleted, false);
assert.equal(coverage.footprints.count, 1484);
const html = root.body.toString();
for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)) {
  const remote = await get(asset[1]);
  assert.equal(remote.code, 200);
  assert.deepEqual(remote.body, await readFile("apps/web/dist" + asset[1]));
}
assert.equal(JSON.parse(places.body).length, 30);
const runtime = execFileSync(
  "ssh",
  [
    "-F",
    ".runtime/ncp/ssh_config",
    "fieldtwin-staging",
    `docker inspect --format '{{.Name}} {{.Id}} {{.Config.Image}} {{.State.Running}} {{.State.OOMKilled}}' fieldtwin-small-web-1 fieldtwin-small-fieldtwin-api-1 fieldtwin-small-db-1; docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'; free -m; df -h /`,
  ],
  { encoding: "utf8" },
);
assert.ok(runtime.includes(`fieldtwin-web:${webVersion} true false`));
assert.ok(runtime.includes(`fieldtwin-api:${apiVersion} true false`));
const apiConfig = JSON.parse((await get('/api/config')).body);
assert.equal(apiConfig.version, apiVersion);
assert.equal(apiConfig.environment, 'staging');
assert.equal(apiConfig.demo, false);
const report = {
  verifiedAt: new Date().toISOString(),
  webVersion,
  apiVersion,
  tls: root.tls,
  provider: metadata,
  strictParentCsp: true,
  scopedSdkCsp: true,
  runtimeAssetsMatch: true,
  sceneSha256: createHash("sha256").update(scene.body).digest("hex"),
  facilityCount: 30,
  coverageAuditPublished: true,
  coverageMissingCount: coverage.photoreal.missingCount,
  bike: JSON.parse(config.body).bikeSource.status,
  parking: JSON.parse(config.body).parkingSource.status,
  unauthorizedAdminRejected: true,
  runtime,
};
await writeFile(
  "evidence/realistic3d/staging-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
