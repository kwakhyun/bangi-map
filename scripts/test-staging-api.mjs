import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Existing staging credentials stay in private files and the child environment.
// Creates one clearly labelled synthetic report, then resolves it through the admin API.
const login = JSON.parse(readFileSync(".runtime/ncp/deploy/login.json", "utf8"));
const run = spawnSync(process.execPath, ["--test", "tests/api.test.mjs"], {
  env: {
    ...process.env,
    TEST_API_URL: "https://localhost:8443/api",
    TEST_ORIGIN: "https://localhost:8443",
    NODE_EXTRA_CA_CERTS: ".runtime/ncp/deploy/tls/ca.crt",
    TEST_ADMIN_EMAIL: login.email,
    TEST_ADMIN_PASSWORD: login.password,
  },
  encoding: "utf8",
  timeout: 180000,
});
writeFileSync("evidence/refactor-api-tests-staging.tap", (run.stdout || "") + (run.stderr || ""));
console.log(run.stdout || "");
if (run.error) console.error("Staging API verification did not complete; private credentials were not logged.");
process.exit(run.status ?? 1);
