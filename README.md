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

### 실제 계정 API 여정

선택 실행하는 Playwright 여정은 네트워크 fixture를 사용하지 않습니다. 임시 PostgreSQL에
backend의 canonical Flyway migration을 적용하고 production `backend-api`를 기동한 뒤,
Chromium에서 가입·인증·로그인·환경설정·사용자 케이스를 실행합니다. Docker와 Chromium이
필요합니다. Backend는 정확히 `65e6426b`, root Flyway bundle은 정확히 `e259a83`인
깨끗한 worktree만 허용합니다. 환경 변수를 생략하면 UI worktree와 나란히 있는
`a23-real-backend-develop`, `a23-real-root-develop`을 검사합니다.

```powershell
$env:A23_BACKEND_DIR='C:\path\to\Idea2Strategy-backend'
$env:A23_ROOT_DIR='C:\path\to\Idea2Strategy-root'
pnpm e2e:real-api
```

Pinned root bundle은 root 검증 스크립트의 resource-free manifest/SHA-256/source-revision
정책을 그대로 실행한 뒤, harness가 label을 붙인 PostgreSQL/Flyway에서 migrate와 validate를
수행합니다.
DB 비밀번호와 네 가지 용도별 HMAC/암호화 키는 실행마다 별도로 생성하고 파일에 쓰지
않습니다. 실행 중에는 Docker inspect 권한이 있는 로컬 사용자가 컨테이너 환경을 볼 수
있으므로 harness는 project/run label을 붙입니다. 다른 active run은 건드리지 않고 1시간 넘게
중지된 resource만 회수합니다. 같은 backend checkout의 Gradle output을 공유하므로 project별
active-run lock으로 실행을 직렬화하며, 두 번째 실행은 첫 실행을 삭제하지 않고 즉시 실패합니다. 정상 종료·process
exit·SIGINT·SIGTERM에서는 자기 컨테이너와 network만 제거합니다. 정상 teardown의 inspect나
삭제 실패는 테스트 실패로 보고합니다.
신뢰된 servlet principal과 MFA를 수립하는 gateway가 준비되기 전까지 operator 경로는
의도적으로 제외합니다.

## 현재 제품 구성

- 로고로 진입하는 3D 랜딩 페이지: 스크롤에 따라 블록이 조립되는 서비스 소개
- HOME 메뉴로 진입하는 운용 대시보드
- 확인 필요 작업, 전체 성과 비교, 최근 전략
- 검색·필터·가져오기가 동작하는 전략 목록
- 퍼즐형 Basic 전략 편집기와 노드형 Pro 전략 편집기
- 봇 목록에서 선택한 봇의 자산·포지션·판단 기록을 탭으로 보는 봇 운영
- 봇별 백테스트 비교와 종목별 체결 차트
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
