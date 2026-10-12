import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
try {
  const { launcher } = JSON.parse(
    await readFile(
      new URL("../.runtime/dev-pids.json", import.meta.url),
      "utf8",
    ),
  );
  if (!Number.isSafeInteger(launcher) || launcher < 2)
    throw new Error("Invalid PID");
  const command = execFileSync(
    "/bin/ps",
    ["-p", String(launcher), "-o", "command="],
    { encoding: "utf8" },
  );
  if (!command.includes("scripts/dev.mjs"))
    throw new Error("Recorded PID is not the Bangi launcher");
  process.kill(launcher, "SIGTERM");
  console.log(
    "Bangi services stopped. Database and saved data are retained.",
  );
} catch (e) {
  console.error("No matching Bangi launcher to stop.");
  process.exitCode = 1;
}
