# 방이2동 실사 3D 어댑터

웹 0.6.0에서 React 생활지도와 연결했고 기존 NCP Micro 서버에 배포했다. 공식 VWorld WebGL 3D API 3.0을 별도 문서에서 실행해 앱의 npm Cesium과 분리한다. 현재 디렉터리 이름은 최초 검증 화면의 경로를 유지한 것이다.

## 설정과 배포

프로젝트 개발키는 `.runtime/vworld/config.json`(권한 600)에 저장한다. 현재 등록/실행 origin은 `https://localhost:8443`, 개발키 만료일은 2027-04-11이다. 운영키 전환과 상업적 이용은 별도 확인 대상이다.

```json
{
  "apiKey": "프로젝트에서-발급한-키",
  "registeredDomain": "https://localhost:8443",
  "allowedOrigin": "https://localhost:8443",
  "expiresAt": "2027-04-11"
}
```

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

## 검증

`node --test tests/vworld3d.test.mjs`, `npm run typecheck`, `npm run build`를 실행한다. 기본 GIS 데이터는 `.tools/gis-venv/bin/python tests/gis-data.py`로 검증한다.

실제 Chrome에서 실사 건물, 주차장/따릉이/화장실 필터, 주민센터와 한성백제역 선택, 지도 전환을 확인했다. 390×844 로컬 테스트 프레임에서 모바일 표시와 상세 선택도 확인했다. SDK loader를 로컬에서 일시 제거했을 때 기본 지도 복구가 동작했고 파일은 복원했다.

로컬 검증 서버 `scripts/preview-vworld3d.mjs --app`은 기존 승인된 localhost 인증서를 사용한다. 8443이 NCP 터널과 겹치므로 터널을 종료한 뒤 사용한다. API는 임시 8445 SSH 터널을 통해 기존 서버로 전달한다. `--responsive`는 로컬 테스트에 한해 같은 출처의 390px 프레임을 허용하고 `/__preview/mobile`을 제공한다. 이 옵션은 배포 설정에 포함되지 않는다. 검증 종료 후 서버를 멈추고 8445 터널을 닫은 뒤 정식 8443 터널을 복원한다.

현재 배포에서 상위 React 문서는 기존 CSP와 `X-Frame-Options: DENY`를 유지한다. 공식 SDK의 inline bootstrap/eval과 브이월드 HTTPS 출처 허용은 `/realistic3d/` 문서에만 적용한다.

근거: [무료 데이터 조사](../../docs/방이2동_실사3D_데이터조사.md), [서버 검증](../../evidence/realistic3d/staging-verification.json).
