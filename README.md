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

## 현재 제품 구성

- 로고와 HOME 메뉴로 진입하는 운용 대시보드
- 확인 필요 작업, 전체 성과 비교, 최근 전략 및 활동
- 검색·필터·가져오기가 동작하는 전략 목록
- 퍼즐형 Basic 전략 편집기와 노드형 Pro 전략 편집기
- 봇 운영, 백테스트, Competition 목업 흐름
- 프로필과 접근 보안을 통합한 내 계정
- 한국어·영어 및 라이트·다크 테마

관리자 페이지와 관심 종목 등록은 현재 제품 내비게이션에서 제거되었습니다.

디자인 규칙은 [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)를 따릅니다.
