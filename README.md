# Idea2Strategy Signal UI

Idea2Strategy의 제품 UI 프로토타입입니다. Signal Studio 디자인 시스템 하나로 홈, 전략, 봇, 백테스트, Competition, 내 계정 화면과 Basic/Pro 전략 편집기를 제공합니다.

## 실행

```powershell
pnpm install
pnpm dev
```

## 검증

```powershell
pnpm test -- --run
pnpm build
```

### 실제 backend API 여정

선택 실행하는 Playwright 여정은 네트워크 fixture 없이 production `backend-api`를 대상으로
합니다. 기본 실행 범위는 다음 두 파일입니다.

- `e2e/real-account-api.e2e.ts`: 가입, 잘못된 비밀번호와 정상 로그인, 계정 환경설정 조회,
  사용자 케이스 제출
- `e2e/competition-room-create-real.e2e.ts`: 대회 방 생성·취소, 비공개 방 초대 제어

Docker, Playwright Chromium, 그리고 Windows가 아니면 `pwsh`가 필요합니다. UI를 root
저장소의 `ui` submodule로 checkout했다면 환경 변수 없이 실행할 수 있습니다.

```powershell
pnpm e2e:install
pnpm e2e:real-api
```

`pnpm e2e:real-api`는 앱과 backend용 빈 포트를 하나씩 할당해 `A23_APP_PORT`,
`A23_BACKEND_PORT`로 넘깁니다. `playwright.real-api.config.ts`를 직접 실행하면 포트가 없어
즉시 실패합니다. Global setup(`e2e/realApiGlobalSetup.ts`)은 다음 순서로 동작합니다.

1. UI checkout의 상위 디렉터리를 root 저장소로, `../backend`를 backend 저장소로 사용합니다.
   다른 위치는 `A23_ROOT_DIR`, `A23_BACKEND_DIR`로 지정합니다. Backend `HEAD`는 root가
   고정한 `backend` gitlink와 같아야 하며 `A23_BACKEND_REVISION`으로 바꿀 수 있습니다. Root
   revision은 `A23_ROOT_REVISION`을 지정했을 때만 검사합니다. 두 저장소 모두 깨끗해야 하고,
   root에서는 `A23_ROOT_ALLOWED_DIRTY_GITLINKS`(쉼표 구분)에 적은 submodule gitlink 변경만
   허용합니다.
2. Root `scripts/test-flyway-ci-bundle.ps1`의 resource-free 검증 부분으로
   `db/flyway-ci-bundle`의 manifest, SHA-256, source revision을 확인합니다.
3. 전용 Docker network에 PostgreSQL 16을 띄우고 Flyway 11로 migrate와 validate를 실행한 뒤
   전략 instrument(AAPL, MSFT, SPY), `config/development/runtime-policy/policy-seed.sql`,
   `config/development/scoring/scoring-template-seed.sql`을 넣습니다.
4. Gradle 8.14.3/JDK 21 컨테이너에서 backend checkout을 mount해
   `:apps:backend-api:bootRun`을 실행하고 `/actuator/health`가 응답할 때까지 기다립니다.
   대기 시간은 기본 600초이며 `A23_BACKEND_READY_TIMEOUT_SECONDS`로 60-1200초 사이에서
   바꿀 수 있습니다.
5. Vite dev server는 `VITE_REAL_API_TARGET`으로 `/api`와 `/actuator` 요청을 이 backend에
   proxy합니다.

DB 비밀번호와 identity 암호화·HMAC·JWT 서명 키는 실행마다 새로 생성하고 파일에 쓰지
않습니다. 실행 중에는 Docker inspect 권한이 있는 로컬 사용자가 컨테이너 환경을 볼 수
있습니다. 모든 resource에는 project/run label이 붙습니다. 같은 backend checkout의 Gradle
output을 공유하므로 lock 컨테이너로 실행을 직렬화하며, 두 번째 실행은 첫 실행을 건드리지
않고 즉시 실패합니다. 1시간 넘게 중지된 resource만 회수하고, 정상 종료·process exit·SIGINT·
SIGTERM에서는 자기 컨테이너와 network만 제거합니다. 정상 teardown의 inspect나 삭제 실패는
테스트 실패로 보고합니다.

Gradle cache는 기본적으로 Docker named volume `a23-real-api-gradle-cache`에 두고 실행 간
재사용합니다. CI처럼 `A23_GRADLE_CACHE_DIR`를 지정하면 그 디렉터리를 bind mount합니다.
Cache에는 비밀번호나 키 같은 실행 secret을 저장하지 않습니다.

`A23_EXTERNAL_BASE_URL`을 지정하면 global setup과 dev server 없이 이미 떠 있는 stack을
대상으로 실행하고, `A23_FULL_STACK_E2E=1`이면 `e2e/basic-strategy-real.e2e.ts`만 실행합니다.
Root `scripts/test-basic-strategy-real-e2e.ps1`이 이 방식을 사용합니다. Operator cookie
session 화면은 mock API를 쓰는 `pnpm e2e:operator-session`에서 검증합니다.

## 현재 제품 구성

- 로고로 진입하는 3D 랜딩 페이지: 스크롤에 따라 블록이 조립되는 서비스 소개
- HOME 메뉴로 진입하는 운용 대시보드
- 확인 필요 작업, 전체 성과 비교, 최근 전략
- 검색·필터·가져오기가 동작하는 전략 목록
- 퍼즐형 Basic 전략 편집기와 노드형 Pro 전략 편집기
- 봇 목록에서 선택한 봇의 자산·포지션·판단 기록을 탭으로 보는 봇 운영
- 봇별 백테스트 비교와 종목별 체결 차트
- 백테스트 실행은 `30m`, `1h`, `4h`, `1d` dataset만 노출하며, queued/running 실행은
  소유자가 취소할 수 있습니다. queued 실행은 즉시, running 실행은 worker 안전 지점에서
  협력 취소되고 화면에 요청·완료 상태가 반영됩니다.
- 지표를 직접 골라 정렬하는 Competition 순위
- 심각도·읽음 상태로 걸러 보는 알림 센터
- 화면별 사용법과 금융 용어집을 검색하는 도움말
- 프로필, 접근 보안, 화면 설정과 알림 설정을 통합한 내 계정
- 한국어·영어 및 라이트·다크 테마, 모션 줄이기

관리자 페이지와 관심 종목 등록은 현재 제품 내비게이션에서 제거되었습니다.
알림과 도움말은 상단 도구에서 열리며 주요 메뉴 다섯 개와 경쟁하지 않습니다.

화면의 가격과 성과는 샘플 데이터이며 실제 시장 정보가 아닙니다. 실제 증권 계좌에
연결되지 않고 실제 주문도 내지 않습니다.

디자인 규칙은 [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)를 따릅니다.
