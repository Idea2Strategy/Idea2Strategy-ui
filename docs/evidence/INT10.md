# INT10 UI 계약 연결 검증 증적

- 검증일: 2026-08-08 (Asia/Seoul)
- 담당: `hjcud`
- UI 기준 커밋: `42ddb97f6955d302b5f170401505b6e75f338e21` (`origin/develop`)
- 루트 기준 커밋: `f99ecd0d23e3a313b7badef5489ffd9eeedcfb76`
- UI 기준선: `ui.baseline.signal-studio` / `e819d618302f3986f148cacaa80bc4f85e2704b9` / `sha256:3dbeaf27c5a4cd0d4918fcabd723dfa29e4115635c6bdf3826837fb515c12679`
- canonical fingerprint: `sha256:11a2eebed19f5b5159e14df0c6f6ac391886ed19108ca5cdf0751a99da88b52d`

## 판정

**PASS.** 제품 라우트와 상태를 UI 명세·정책에 대조했고, PHASE5 성과 카피 전수 스위프에서 발견한 리더보드 고지 누락을 수정했다. 공개 리더보드와 내 봇 비교의 모든 성과 값은 같은 영역 안에서 `모의 성과 · 실제 투자 결과를 보장하지 않습니다.` 고지를 보며, 영문 화면에도 동일 의미가 표시된다.

## 기준과 범위

다음 canonical UI 및 정책을 기준으로 삼았다.

- `ui.backtest.results`, `ui.bot.operations`, `ui.room.lifecycle`, `ui.strategy.authoring`, `ui.operator.work`
- `policy.comparison.bots-only`, `policy.legal.block-uncertain`, `policy.privacy.strategy-private`, `policy.ui.reference-only`, `policy.user.no-direct-orders`
- `contract.backtest.execution.v1`, `contract.trading.virtual-execution.v1`
- `docs/PHASE5_COMPETITION_ROOMS.md` §5: 모든 성과 값의 모의 성과·실제 결과 비보장 고지
- INT08 후속 F-3: 성과 표시 카피 화면 단위 전수 확인

`stackcord contract impact`로 두 계약의 소비자 범위를 확인했고, 후보 작업의 `stackcord work conflict` 결과 활성 작업과의 충돌은 없었다. canonical 명세·계약·정책은 변경하지 않았다.

## 화면 전수 스위프

| 화면군 | 제품 라우트 | 확인한 계약·상태 | 결과 |
| --- | --- | --- | --- |
| 진입·계정·지원 | `/landing`, `/login`, `/signup`, `/password-reset`, `/account`, `/notifications`, `/help` | 로그인 가드, 로딩·오류·빈 상태, 실제 주문 금지, 샘플 가격·성과 고지 | 통과 |
| 전략 작성 | `/strategies`, `/strategies/new/basic`, `/strategies/:id/basic`, Pro 비활성 경로 | Basic 작성·검증·저장 상태, 소유자 범위, 구조 검사는 수익성·실제 체결을 보장하지 않는다는 카피, v1.0 Pro 거절 | 통과 |
| 봇 운용·홈 | `/`, `/bots` | 대기·실행·중지·실패 상태, 개인 운용과 대회 성과 분리, 서버 Projection이 없을 때 임시 성과를 만들지 않는 정직한 상태 | 통과 |
| 백테스트 | `/backtests` | 인증 가드, 목록·실행·시도·월별 거래·공식 성과·오류·빈 상태, 과거 결과 비보장 카피 | 통과 |
| 모의투자 대회 | `/competition` (`/competition-v2`는 redirect) | 공개·소유 방, 익명 봇만 비교, 로딩·오류·빈·종료 상태, 성과 카피 | 누락 1건 수정 후 통과 |
| 운영자 | `/operations/login`, `/operations/callback`, `/operations/cases`, `/operations/rbac`, `/operations/competition` | 전용 인증, 권한 거절, 검토·확인·처리·성공·실패 상태, 고위험 명령 영수증 | 통과 |

`DesignConceptLab.tsx`와 `data/mockData.ts`는 제품 라우터가 사용하는 실 API 경로가 아니므로 런타임 성과 카피 판정에서 제외했다. 제품 경로는 `App.tsx`의 실제 라우트와 주입된 실 API 클라이언트를 기준으로 판정했다.

## 성과 카피 체크리스트

| 성과 표면 | 표시 정직성 | 확인 결과 |
| --- | --- | --- |
| 랜딩·도움말 | 실제 계좌 미연결, 모든 매매가 모의이며 샘플 가격·성과임을 명시 | 통과 |
| 전략 구조 검사 | 구조 통과가 수익성·안전성·실제 체결을 보장하지 않음을 명시 | 통과 |
| 홈·봇 | 검증된 서버 Projection만 표시하고 누락 시 임시 값을 표시하지 않음; 개인·대회 성과를 합산하지 않음 | 통과 |
| 백테스트 | 공식 백테스트 성과로 식별하고 과거 구간 결과가 향후 성과를 보장하지 않음을 명시 | 통과 |
| 공개 대회 리더보드 | 점수·수익률·MDD·샤프 수치와 같은 카드에 모의 성과·실제 결과 비보장 고지 | **수정 후 통과** |
| 내 봇 비교 | 점수·수익률·MDD·샤프 수치와 같은 카드에 동일 고지 | **수정 후 통과** |

## 변경 및 회귀 방지

- `CompetitionApiWorkspace.tsx`: 두 리더보드에 성과 고지를 추가했다.
- `i18n.tsx`: 동일 의미의 영문 고지를 추가했다.
- `CompetitionApiWorkspace.test.tsx`: 수정 전 실패하는 한국어 회귀 테스트를 먼저 추가했고, 수정 후 한·영문 양쪽에서 두 리더보드 고지가 존재함을 확인한다.
- `competition-performance-disclosure.e2e.ts`: 실제 Chromium, 실제 라우터·HTTP 클라이언트에서 한국어 데스크톱(1440×900)과 영문 모바일(390×844)을 확인한다. API 서버만 계약 fixture로 대체한다.

## 실행 결과

| 명령 | 결과 |
| --- | --- |
| `pnpm exec vitest run src/CompetitionApiWorkspace.test.tsx` | 8/8 통과 |
| `pnpm exec vitest run` | 47 files, 551 tests 통과 |
| `pnpm run typecheck` | 통과 |
| `pnpm run build` | 통과 |
| `pnpm run e2e` | Chromium 9/9 통과 |
| `pnpm exec playwright test e2e/competition-performance-disclosure.e2e.ts` | Chromium 2/2 통과; 한국어 데스크톱·영문 모바일 모두 고지 2개가 보이고 문서 가로 overflow 없음 |

인앱 브라우저 컨트롤러는 로컬 커널 자산 경로 초기화 오류로 사용할 수 없었다. 대신 저장소가 고정한 Playwright Chromium 경로에서 동일한 실제 브라우저 검증을 수행했으며, 이 제한은 제품 코드나 테스트 결과의 실패가 아니다.
