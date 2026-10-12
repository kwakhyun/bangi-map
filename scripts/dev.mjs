import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
try {
  process.loadEnvFile(root + ".env.local");
} catch {}
try {
  process.loadEnvFile(root + ".runtime/bangi/seoul.env");
} catch {}
await mkdir(".runtime", { recursive: true });
let token;
try {
  token = (await readFile(".runtime/service-token", "utf8")).trim();
} catch {
  token = randomBytes(32).toString("hex");
  await writeFile(".runtime/service-token", token, { mode: 0o600 });
}
const preview = process.argv.includes("--preview");
const env = {
  ...process.env,
  DATABASE_URL: "jdbc:postgresql://127.0.0.1:55432/fieldtwin_bangi",
  FIELD_TWIN_SERVICE_TOKEN: token,
};
const children = [];
let closing = false;
function run(command, args, cwd, extra = {}) {
  const p = spawn(command, args, {
    cwd,
    env: { ...env, ...extra },
    stdio: "inherit",
    detached: true,
  });
  children.push(p);
  p.on("exit", (code) => {
    if (!closing) {
      console.error("A Bangi service exited:", code);
      stop();
    }
  });
  return p;
}
function stop() {
  if (closing) return;
  closing = true;
  for (const p of children) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(), 700).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function ready(url) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Service startup timeout: " + url);
}
try {
  const apiEnv = { ...env };
  delete apiEnv.OPENAI_API_KEY;
  const apiProcess = spawn(
    preview ? "java" : "bash",
    preview
      ? ["-jar", "services/api/target/fieldtwin-api-0.1.0.jar"]
      : ["scripts/mvn.sh", "spring-boot:run", "-q"],
    { cwd: root, env: apiEnv, stdio: "inherit", detached: true },
  );
  children.push(apiProcess);
  apiProcess.on("exit", (code) => {
    if (!closing) {
      console.error("API exited:", code);
      stop();
    }
  });
  await ready("http://127.0.0.1:8080/actuator/health");
  run(
    "npm",
    ["run", preview ? "preview" : "dev", "--workspace", "@fieldtwin/web"],
    root,
  );
  await ready("http://127.0.0.1:5173/");
  await writeFile(
    ".runtime/dev-pids.json",
    JSON.stringify({
      launcher: process.pid,
      children: children.map((p) => p.pid),
    }),
  );
  console.log("\n방이 생활지도 ready: http://127.0.0.1:5173\n");
} catch (e) {
  console.error(e.message);
  stop();
  process.exitCode = 1;
}
