import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(root + "apps/web/public/cesium", { recursive: true });
for (const folder of ["Workers", "Assets", "Widgets", "ThirdParty"]) {
  await cp(
    root + "node_modules/cesium/Build/Cesium/" + folder,
    root + "apps/web/public/cesium/" + folder,
    { recursive: true },
  );
}
