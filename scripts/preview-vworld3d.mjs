// Local HTTPS validation at the exact origin registered with VWorld.
import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const tls = path.join(root, ".runtime/ncp/deploy/tls");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".jpg": "image/jpeg",
};
const policies = [
  ...(await readFile(path.join(root, "infra/web/nginx.conf"), "utf8")).matchAll(
    /add_header Content-Security-Policy "([^"]+)"/g,
  ),
].map((m) => m[1]);
const stageAgent = new https.Agent({
  ca: await readFile(path.join(tls, "ca.crt")),
});
const server = https.createServer(
  {
    key: await readFile(path.join(tls, "server.key")),
    cert: await readFile(path.join(tls, "server.crt")),
  },
  async (req, res) => {
    const pathname = new URL(req.url, "https://localhost:8443").pathname;
    if (
      process.argv.includes("--responsive") &&
      pathname === "/__preview/mobile"
    ) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>390px 모바일 검증</title><body style="margin:0;background:#dde3ea"><iframe title="390px 모바일 생활지도" src="/" style="border:0;display:block;width:390px;height:844px;margin:24px auto"></iframe></body></html>',
      );
      return;
    }
    if (process.argv.includes("--app") && pathname.startsWith("/api/")) {
      // Existing staging reached through a second loopback-only SSH tunnel.
      const upstream = https.request(
        {
          hostname: "127.0.0.1",
          port: 8445,
          servername: "localhost",
          path: req.url,
          method: req.method,
          agent: stageAgent,
          headers: { ...req.headers, host: "localhost:8443" },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end("Staging tunnel unavailable");
      });
      req.pipe(upstream);
      return;
    }
    const base =
      process.argv.includes("--app") && !pathname.startsWith("/realistic3d/")
        ? "apps/web/dist"
        : ".runtime/vworld/site";
    let relative =
      pathname.replace(/^\/realistic3d\/?/, "").replace(/^\//, "") ||
      "index.html";
    if (relative.includes("..")) {
      res.writeHead(400);
      res.end();
      return;
    }
    try {
      const data = await readFile(path.join(root, base, relative));
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(relative)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": process.argv.includes("--responsive")
          ? policies[base.startsWith(".runtime") ? 1 : 0].replace(
              "frame-ancestors 'none'",
              "frame-ancestors 'self'",
            )
          : policies[base.startsWith(".runtime") ? 1 : 0],
        "X-Frame-Options":
          base.startsWith(".runtime") || process.argv.includes("--responsive")
            ? "SAMEORIGIN"
            : "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  },
);
server.listen(8443, "127.0.0.1", () =>
  console.log("Local HTTPS preview: https://localhost:8443"),
);
