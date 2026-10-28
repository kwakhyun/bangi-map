# 방이2동 실사 3D 어댑터

> 2026-10-29 NCP 스테이징을 종료했다. 아래 배포/검증 단계는 과거 서버와 비공개 설정에 의존한다. 현재 실행 가능한 서비스 주소는 없으며 [운영 종료 기록](../../docs/운영_종료.md)과 [재구축 안내](../../docs/운영.md)를 먼저 참고한다.

웹 0.6.0에서 React 생활지도와 연결했고 기존 NCP Micro 서버에 배포했다. 공식 VWorld WebGL 3D API 3.0을 별도 문서에서 실행해 앱의 npm Cesium과 분리한다. 현재 디렉터리 이름은 최초 검증 화면의 경로를 유지한 것이다.

## 새 환경의 설정 요건

공개 저장소에는 개발키, TLS 인증서와 개인키, SDK 런타임 파일이 없다. 기존 키의 등록 origin은 `https://localhost:8443`, 발급 당시 만료일은 2027-04-11이었다. 재사용 시 제공처에서 키의 유효성과 허용 origin을 확인해야 한다. 새로운 환경에는 자신의 유효한 키와 등록 origin에 맞는 HTTPS 설정을 준비한다. 운영키 전환과 상업적 이용도 별도 확인 대상이다.

`.runtime/vworld/config.json`을 권한 600으로 작성한다. 아래 값은 예시이며 실제 등록 정보와 유효기간으로 바꿔야 한다. `expiresAt` 값을 수정하는 것만으로 제공처의 키가 갱신되지는 않는다.

```json
{
  "apiKey": "자신의-유효한-개발키",
  "registeredDomain": "https://localhost:8443",
  "allowedOrigin": "https://localhost:8443",
  "expiresAt": "2027-04-11"
}
```

## 과거 배포 절차

아래는 삭제된 서버가 가동 중일 때 사용한 절차다. `prepare-vworld3d.mjs`는 런타임 생성기이며 새 서버, HTTPS 인증서 또는 SSH 연결을 만들어 주지 않는다.

1. `node scripts/prepare-vworld3d.mjs`로 `.runtime/vworld/site/`를 생성한다. 키가 없으면 SDK 요청을 하지 않는다.
2. 웹 이미지는 키 없이 빌드한다. 생성된 런타임 파일만 NCP `/opt/fieldtwin/runtime/vworld-next/`에 비공개로 전송한다. 키 자체를 대화나 명령 인자로 넣지 않는다.
3. `infra/single-vm/compose.vworld.yaml`과 `scripts/upgrade-vworld.sh`를 서버에 전달한다. 현재 승인된 CA 공개 인증서를 `runtime/tls/verification-ca.crt`에 둔다. 실제 TLS leaf/key는 변경하지 않는다.
4. 서버에서 `bash scripts/upgrade-vworld.sh VERSION`을 실행한다. `fieldtwin-web:VERSION` 이미지를 미리 load해야 한다. API와 DB는 재시작하지 않는다. 웹 이미지 참조, dc 실행 파일, 이전 runtime 디렉터리를 보관하고 오류 시 되돌린다.
5. Mac에서 `bash scripts/staging-tunnel.sh start`, `node scripts/verify-vworld-staging.mjs`로 검증한다. 해당 검증 스크립트의 기대 웹 버전은 새 릴리스에 맞춘다.

브라우저용 키는 SDK 요청에서 확인할 수 있다. 서버 전용 비밀키로 숨겨지는 구조가 아니다. 등록 URL 제한과 실행 origin 검사를 사용하며, 런타임은 저장소와 Docker 빌드 컨텍스트에서 제외된다. NCP에서는 UID 101, 디렉터리 700, 파일 600으로 두고 읽기 전용 마운트한다. 파일을 웹으로 보낼 때는 `no-store`를 적용한다.

## 동작

- 공식 HTTPS SDK와 원래 제공되는 외벽/지붕 모형을 직접 스트리밍. 원본 타일의 별도 저장 또는 프록시 없음.
- 별도 iframe과 검증된 `postMessage`로 시설 좌표, 경계, 선택 위치만 전달. origin, 발신 프레임, 메시지 종류와 위치 범위를 확인.
- VWorld의 초기 자동 카메라 이동 뒤 앱의 시점을 설정한다. 확대/축소, 위에서/비스듬히 보기, 방이2동 전체 보기를 제공한다.
- SGIS 경계와 시설을 지형에 붙여 표시. 선택한 Overture 외곽은 노란 선으로 표시. 기본 돌출 건물은 실사 지도에 겹치지 않는다.
- 실사 모형과 Overture 건물 ID는 독립적이다. 클릭한 좌표를 포함하는 외곽이 있을 때만 속성을 연결한다. 촬영 시점과 전 건물의 모형 존재 여부는 미확인이다.
- SDK가 로드되지 않거나 지연되면 재연결 또는 기본 지도 복귀를 제공한다. 엔진 준비 이벤트만으로 모든 타일의 로딩 성공을 주장하지 않는다.

## 코드 검증과 과거 화면 검증

`node --test tests/vworld3d.test.mjs`, `npm run typecheck`, `npm run build`로 코드를 검증할 수 있다. `.tools/gis-venv/`는 작성자의 별도 GIS Python 환경이며 저장소에 포함되지 않는다. `tests/gis-data.py`를 사용하려면 원자료와 해당 Python 의존성을 먼저 준비해야 한다.

실제 Chrome에서 실사 건물, 주차장/따릉이/화장실 필터, 주민센터와 한성백제역 선택, 지도 전환을 확인했다. 390×844 로컬 테스트 프레임에서 모바일 표시와 상세 선택도 확인했다. SDK loader를 로컬에서 일시 제거했을 때 기본 지도 복구가 동작했고 파일은 복원했다.

과거 검증 서버 `scripts/preview-vworld3d.mjs --app`은 비공개 localhost 인증서와 8445 SSH 터널을 통해 NCP API를 사용했다. 서버 철거 후에는 이 도구로 기존 API에 접속할 수 없다. 독립 로컬 실행에는 루트 README의 `npm run dev`와 기본 지도를 사용한다. `--responsive`는 당시 로컬 테스트에서만 같은 출처의 390px 프레임(`/__preview/mobile`)을 허용하던 옵션이며 배포 설정에는 포함하지 않았다.

보존된 Nginx 구성에서 상위 React 문서는 기존 CSP와 `X-Frame-Options: DENY`를 유지한다. 공식 SDK의 inline bootstrap/eval과 브이월드 HTTPS 출처 허용은 `/realistic3d/` 문서에만 적용한다.

근거: [무료 데이터 조사](../../docs/방이2동_실사3D_데이터조사.md), [서버 검증](../../evidence/realistic3d/staging-verification.json).
