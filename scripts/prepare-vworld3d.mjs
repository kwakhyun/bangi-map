import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  chmod,
  stat,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function validateConfig(config) {
  if (
    !config ||
    typeof config.apiKey !== "string" ||
    !/^[A-Za-z0-9-]{16,128}$/.test(config.apiKey)
  ) {
    throw new Error(
      "유효한 프로젝트용 브이월드 키가 필요합니다. 키 값은 로그로 출력하지 않습니다.",
    );
  }
  for (const field of ["registeredDomain", "allowedOrigin"]) {
    let url;
    try {
      url = new URL(config[field]);
    } catch {
      throw new Error(`${field}의 HTTPS 주소를 확인하세요.`);
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (field === "allowedOrigin" && url.href !== `${url.origin}/`)
    ) {
      throw new Error(
        `${field}는 인증 정보나 쿼리가 없는 HTTPS 주소여야 합니다.`,
      );
    }
  }
  // Never let a different registered origin masquerade as localhost during validation.
  if (
    new URL(config.registeredDomain).origin !==
    new URL(config.allowedOrigin).origin
  ) {
    throw new Error("등록 도메인과 실행 origin이 일치해야 합니다.");
  }
  return { ...config, allowedOrigin: new URL(config.allowedOrigin).origin };
}

export function renderPage(config = null) {
  const c = config ? validateConfig(config) : null;
  const sdk = c ? new URL("https://map.vworld.kr/js/webglMapInit.js.do") : null;
  if (sdk) {
    sdk.searchParams.set("version", "3.0");
    sdk.searchParams.set("apiKey", c.apiKey);
    sdk.searchParams.set("domain", c.registeredDomain);
  }
  // Parser-time SDK loading is required by the official sample. The gate is an external
  // script so application CSP need not authorize our own inline JavaScript.
  const loader = c
    ? `if (location.origin === ${JSON.stringify(c.allowedOrigin)}) document.write(${JSON.stringify(`<script src="${escapeHtml(sdk.href)}"></script>`)});`
    : "";
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin"><meta name="allowed-origin" content="${escapeHtml(c?.allowedOrigin ?? "")}">
<title>방이2동 실사 3D 지도</title><link rel="stylesheet" href="viewer.css">
${c ? '<script src="sdk-loader.js"></script>' : ""}</head>
<body data-connection="${c ? "configured" : "unconfigured"}"><div id="vmap" aria-label="브이월드 방이2동 3D 지도"></div>
<div id="connection-status" role="status">${c ? "실사 건물을 불러오고 있어요" : "브이월드 인증키가 연결되지 않았어요"}</div>
<script src="viewer.js"></script></body></html>`;
  return { html, loader };
}

export async function prepare() {
  const input = path.join(root, ".runtime/vworld/config.json");
  let config = null;
  try {
    const info = await stat(input);
    if (info.mode & 0o077)
      throw new Error("config.json 권한을 600으로 제한한 후 실행하세요.");
    config = validateConfig(JSON.parse(await readFile(input, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const out = path.join(root, ".runtime/vworld/site");
  await mkdir(out, { recursive: true, mode: 0o700 });
  await chmod(out, 0o700);
  const { html, loader } = renderPage(config);
  // Overwrite the loader even when no key is present, removing stale credentials.
  await writeFile(path.join(out, "index.html"), html, { mode: 0o600 });
  await writeFile(path.join(out, "sdk-loader.js"), loader, { mode: 0o600 });
  await writeFile(
    path.join(out, "status.json"),
    JSON.stringify({
      enabled: Boolean(config),
      expiresAt: config?.expiresAt ?? null,
    }),
    { mode: 0o600 },
  );
  await chmod(path.join(out, "index.html"), 0o600);
  await chmod(path.join(out, "sdk-loader.js"), 0o600);
  await chmod(path.join(out, "status.json"), 0o600);
  for (const file of ["viewer.js", "viewer.css"])
    await copyFile(
      path.join(root, "experiments/vworld3d", file),
      path.join(out, file),
    );
  console.log(
    config
      ? "브이월드 검증 화면 생성 완료. 등록 HTTPS origin에서 실데이터 검증이 필요합니다."
      : "인증키 대기 화면 생성 완료. 외부 SDK 호출은 비활성화됩니다.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  prepare().catch(() => {
    console.error(
      "생성 실패: 비공개 설정의 형식, HTTPS origin 및 파일 권한을 확인하세요.",
    );
    process.exitCode = 1;
  });
}
