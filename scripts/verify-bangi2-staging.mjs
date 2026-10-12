import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import https from "node:https";
import assert from "node:assert/strict";
const base = "https://localhost:8443";
const request = await new Promise((resolve, reject) =>
  https
    .get(
      base + "/api/map-config",
      { ca: readFileSync(".runtime/ncp/deploy/tls/ca.crt") },
      (r) => {
        let data = "";
        r.on("data", (x) => (data += x));
        const cert = r.socket.getPeerCertificate();
        const tls = {
          authorized: r.socket.authorized,
          issuer: cert.issuer.CN,
          subject: cert.subject.CN,
          validTo: cert.valid_to,
        };
        r.on("end", () =>
          resolve({ status: r.statusCode, config: JSON.parse(data), tls }),
        );
      },
    )
    .on("error", reject),
);
assert.equal(request.status, 200);
assert.equal(request.tls.authorized, true);
const res = await fetch(base + "/gis/bangi2-scene-v1.json");
assert.equal(res.status, 200);
const scene = Buffer.from(await res.arrayBuffer());
assert.deepEqual(
  scene,
  readFileSync("apps/web/public/gis/bangi2-scene-v1.json"),
);
assert.equal((await fetch(base + "/gis/missing-test-file.json")).status, 404);
const query = `SELECT json_build_object('buildings',count(*),'valid',bool_and(ST_IsValid(footprint)),'readAllowed',has_table_privilege('fieldtwin_staging_api','bangi_buildings','SELECT'),'insertAllowed',has_table_privilege('fieldtwin_staging_api','bangi_buildings','INSERT'),'boundaryReadAllowed',has_table_privilege('fieldtwin_staging_api','bangi_districts','SELECT')) FROM bangi_buildings;`;
const sql = execFileSync(
  "ssh",
  [
    "-F",
    ".runtime/ncp/ssh_config",
    "fieldtwin-staging",
    "/opt/fieldtwin/dc exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d fieldtwin_staging -At",
  ],
  { input: query, encoding: "utf8" },
);
const db = JSON.parse(sql.trim());
assert.equal(db.buildings, 1484);
assert.ok(
  db.valid && db.readAllowed && db.boundaryReadAllowed && !db.insertAllowed,
);
const containers = JSON.parse(
  execFileSync(
    "ssh",
    [
      "-F",
      ".runtime/ncp/ssh_config",
      "fieldtwin-staging",
      `docker inspect --format '{{json .State}}' fieldtwin-small-fieldtwin-api-1`,
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(containers.OOMKilled, false);
assert.equal(containers.Running, true);
const resources = execFileSync(
  "ssh",
  [
    "-F",
    ".runtime/ncp/ssh_config",
    "fieldtwin-staging",
    `docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'; free -m; df -h /`,
  ],
  { encoding: "utf8" },
);
const report = {
  verifiedAt: new Date().toISOString(),
  version: "0.5.0",
  tls: request.tls,
  counts: request.config.counts,
  bikeStatus: request.config.bikeSource.status,
  parkingStatus: request.config.parkingSource.status,
  sceneSha256: createHash("sha256").update(scene).digest("hex"),
  staticMatchesLocal: true,
  db,
  resources,
};
writeFileSync(
  "evidence/bangi2-staging-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
