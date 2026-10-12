import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Reads staging; restores only into a new temporary database, never over the source.
const stamp = Date.now();
const recovery = `fieldtwin_recovery_${stamp}`;
const file = `.runtime/backups/ncp-${stamp}.dump`;
const dc = "/opt/fieldtwin/dc exec -T db";
function remote(command, input) {
  try {
    return execFileSync(
      "ssh",
      ["-F", ".runtime/ncp/ssh_config", "fieldtwin-staging", command],
      {
        input,
        maxBuffer: 100 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error(
      "Staging backup/restore command failed; no database contents logged.",
    );
  }
}
await mkdir(".runtime/backups", { recursive: true, mode: 0o700 });
const dump = remote(
  `${dc} pg_dump -U postgres -Fc --no-owner --no-acl fieldtwin_staging`,
);
await writeFile(file, dump, { flag: "wx", mode: 0o600 });
remote(`${dc} createdb -U postgres ${recovery}`);
try {
  remote(
    `${dc} pg_restore -U postgres -d ${recovery} --no-owner --no-acl --exit-on-error`,
    dump,
  );
  const hasGis =
    remote(
      `${dc} psql -X -U postgres -d fieldtwin_staging -At`,
      "SELECT to_regclass('public.bangi_buildings') IS NOT NULL;",
    )
      .toString()
      .trim() === "t";
  const gisSignature = hasGis
    ? `,
    'buildings',(SELECT count(*) FROM bangi_buildings),
    'buildingData',(SELECT md5(string_agg(id||ST_AsEWKT(footprint)||properties::text,',' ORDER BY id)) FROM bangi_buildings),
    'districtData',(SELECT md5(string_agg(id||ST_AsEWKT(boundary)||metadata::text,',' ORDER BY id)) FROM bangi_districts)`
    : "";
  const query = `SELECT json_build_object(
    'places',(SELECT count(*) FROM bangi_places),
    'reports',(SELECT count(*) FROM bangi_reports),
    'users',(SELECT count(*) FROM users),
    'geometry',(SELECT md5(coalesce(string_agg(id||ST_AsEWKT(location),',' ORDER BY id),'')) FROM bangi_places),
    'facilityMetadata',(SELECT md5(coalesce(string_agg((to_jsonb(p)-'available'-'checked_at'-'live_supported'-'total_capacity'-'occupied'-'provider_updated_at')::text,',' ORDER BY id),'')) FROM bangi_places p),
    'reportPayloads',(SELECT md5(coalesce(string_agg(to_jsonb(r)::text,',' ORDER BY id),'')) FROM bangi_reports r)${gisSignature}
  );`;
  const signature = (database) =>
    remote(
      `${dc} psql -X -v ON_ERROR_STOP=1 -U postgres -d ${database} -At`,
      query,
    )
      .toString()
      .trim();
  const source = signature("fieldtwin_staging");
  assert.equal(signature(recovery), source, "Restored data must match staging");
  const report = {
    testedAt: new Date().toISOString(),
    match: true,
    summary: JSON.parse(source),
    backupSha256: createHash("sha256").update(dump).digest("hex"),
    backupLocation: file,
    scope:
      "One manual backup to this computer; no recurring or cloud backup configured.",
  };
  await writeFile(
    "evidence/bangi-backup-recovery.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  remote(`${dc} dropdb -U postgres ${recovery}`);
}
