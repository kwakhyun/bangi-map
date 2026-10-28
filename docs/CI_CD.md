# GitHub Actions에서 NCP로 자동 배포 (운영 기록)

> 2026-10-29 운영을 종료하며 GitHub 워크플로와 서버 배포 타이머를 비활성화했다. 워크플로에서 자동 실행 트리거와 `package`, `deploy` 작업을 제거했다. 아래 내용은 종료 전 구성 기록이며, 현재 사용 중인 배포 환경을 뜻하지 않는다.

`main`에 푸시하거나 `main`에서 워크플로를 수동 실행하면 아래 순서로 배포한다. PR에서는 검증만 실행한다.

1. **verify:** 타입 검사, 웹 빌드, Java와 배포 복구 테스트, PostgreSQL 동시성/롤백, API, 브라우저 테스트와 의존성 검사를 실행한다.
2. **package:** 검증에 성공한 커밋으로 amd64 웹/API 이미지를 만든다. 이미지 태그와 OCI 라벨에 전체 커밋 SHA를 넣고, 체크섬을 담은 manifest와 함께 GitHub prerelease에 올린다.
3. **deploy:** NCP 배포를 요청하고 서버의 성공/실패 응답을 기다린다. 서버에서 HTTPS와 실제 API 검증이 끝나야 Actions가 성공한다.

기존 Micro 서버의 메모리와 SSH IP 제한을 유지하기 위해 NCP가 GitHub에 HTTPS로 접속한다. 2분 주기로 새 요청을 확인하며 별도 공개 포트, SSH 방화벽 변경, 추가 서버가 필요 없다. 빌드와 테스트는 GitHub 호스팅 러너에서 실행한다. 이 Mac을 켜둘 필요는 없고 서비스 화면 접속 시에만 기존 SSH 터널이 필요하다.

## 신뢰와 비공개 설정

- 공개 저장소에 self-hosted Actions 러너를 설치하지 않는다. NCP의 poller는 임의 작업이나 다운로드한 셸 스크립트를 실행하지 않으며, 서버에 설치된 교체 절차만 사용한다.
- 요청 생성자가 GitHub Actions인지, 지정된 워크플로인지, 최신 `main` SHA인지, `verify`와 `package`가 성공했는지 서버에서도 확인한다. 취소된 실행과 오래된 커밋은 교체 전에 거부한다.
- 다운로드는 해당 저장소의 release 경로로 제한한다. manifest 해시, 아카이브 크기/해시, 이미지 아키텍처와 커밋 라벨을 확인한다.
- 개인 SSH 키, NCP 계정, 서울시/브이월드 키, DB 비밀번호를 GitHub Secrets에 올리지 않는다. 기존 서버 runtime 파일과 볼륨을 유지한다.
- 배포 작업의 `GITHUB_TOKEN`만 NCP 공개키로 RSA-OAEP/SHA-256 암호화해 전달한다. 개인키는 서버 `runtime/cicd/callback.key`에만 있다. 토큰은 서버 메모리에서 복호화하고 상태 응답에 사용하며 파일과 로그에 평문을 쓰지 않는다. 권한은 해당 저장소의 contents/actions 읽기와 deployments 쓰기이며 작업 종료 후 만료된다.
- 공개키 `infra/cicd/ncp-callback-public.pem`는 비밀값이 아니다. 교체하려면 서버 개인키와 함께 갱신하고 poller를 재설치한다.

GitHub 공식 근거: [Deployments API](https://docs.github.com/en/rest/deployments/deployments), [배포 상태](https://docs.github.com/en/rest/deployments/statuses), [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token), [공개 저장소의 self-hosted runner 주의사항](https://docs.github.com/en/actions/reference/security/secure-use).

## 교체와 자동 복구

교체 전 기존 서비스가 정상인지 확인하고 Docker 이미지 로딩에 필요한 디스크 여유를 검사한다. DB 마이그레이션과 서버 측 설정/배포 코드의 해시가 설치된 기준과 달라지면 앱을 중지하기 전에 실패 처리한다. DB 변경은 별도 백업과 마이그레이션, 복구 검토 후 수동 반영해야 한다.

정상적인 앱 변경은 아래 순서로 적용한다.

1. `runtime/cicd/rollbacks/<deployment-id>-<sha>/compose.env`에 이전 이미지와 설정을 비공개 보관한다.
2. 디스크에 `pending` 상태를 먼저 기록한다.
3. 웹/API를 중지하고 새 이미지만 교체한다. DB를 재생성하거나 마이그레이션하지 않는다.
4. 승인된 CA로 HTTPS를 검증한다. 웹과 API의 커밋 SHA, 시설/행정동 조회, 보호된 운영자 API의 401, 실사 런타임과 GIS 파일, Nginx 설정, 컨테이너 이미지와 OOM/재시작 상태를 확인한다.
5. 성공하면 `committed`로 기록하고 GitHub에 성공을 반환한다. 실패하면 이전 설정으로 웹/API를 다시 시작하고 HTTPS 및 이전 이미지, 기존 DB 컨테이너를 재확인한다.

프로세스 강제 종료나 서버 재기동으로 `pending`이 남으면 systemd의 `ExecStopPost` 또는 다음 실행 시 이전 버전을 복구한다. 복구 자체가 실패하면 `pending`을 유지하고 다음 주기에 재시도한다. 워크플로가 시간 초과되면 성공으로 간주하지 않는다. GitHub와 통신이 끊겨 결과가 불명확할 때는 서버 상태를 먼저 확인한다.

현재 버전과 직전 복구 버전의 CI 이미지는 유지한다. 더 오래된 `sha-*` 앱 이미지만 성공 후 제거하며 수동 버전 이미지, DB, 볼륨에는 적용하지 않는다. GitHub release 파일은 자동 삭제하지 않는다. 작은 단일 서버이므로 교체 중 짧은 중단이 있고 무중단/고가용성 배포가 아니다.

## 운영 명령

아래 명령은 기존 SSH로 서버에 접속한 뒤 실행한다.

```sh
systemctl status bangi-deploy.timer
journalctl -u bangi-deploy.service -n 60 --no-pager
cat /opt/fieldtwin/runtime/cicd/outcome.json
```

현재 GitHub 커밋과 서버를 비교하려면 승인된 CA로 `/api/config`와 `/release.json`의 `revision`을 확인한다. GitHub의 Actions와 Deployments에도 결과가 남는다.

기존 로컬 검증 스크립트에는 배포한 전체 SHA를 전달한다: `EXPECTED_REVISION=<40자리-커밋-SHA> node scripts/verify-vworld-staging.mjs`. 해당 커밋의 로컬 빌드 파일과 비교한다.

수동으로 직전 버전으로 복구하려면 다음 순서로 실행한다. poller를 먼저 멈춰 자동 재배포와 충돌하지 않게 한다.

```sh
systemctl stop bangi-deploy.timer
systemctl stop bangi-deploy.service
python3 /opt/fieldtwin/ci/deploy.py rollback
```

복구 명령은 `runtime/cicd/PAUSED` 파일도 만든다. 원인을 수정하고 새로운 `main` 커밋을 준비한 다음 아래와 같이 자동 배포를 재개한다.

```sh
rm /opt/fieldtwin/runtime/cicd/PAUSED
systemctl start bangi-deploy.timer
```

일시 중지 중에 만들어진 요청은 20분 후 만료된다. 재개 시 요청이 만료됐다면 최신 `main`에서 Actions를 수동 실행한다. 기존에 완료 처리한 요청은 다시 적용하지 않는다.

서버 측 배포 코드와 systemd 설정을 변경할 때는 변경 내용을 검토한 뒤 로컬에서 `bash scripts/cicd/install-agent.sh`를 실행한다. 이 설치는 서버 코드를 갱신하고 호환성 기준을 등록한다. DB 마이그레이션 해시가 기존 기준과 다르면 설치를 중단한다. `infra/single-vm` 또는 실사 SDK 문서/스크립트를 변경할 경우 해당 서버 파일을 먼저 수동 반영하고 기동을 확인한 후 기준을 갱신한다.

## 검증 범위

`python3 -m unittest discover -s tests -p 'test_cicd.py' -v`로 변조 아카이브 차단, PR/실패한 검증/오래된 커밋 거부, 설정 보존, 실패 시 실제 env 파일 복구, 중단된 트랜잭션 복구를 검사한다. Docker 명령은 이 단위 테스트에서 모의 실행한다. 실제 NCP 배포 결과는 GitHub Actions 실행 기록과 서버의 `outcome.json`으로 별도 확인한다.
