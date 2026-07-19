# 메인·방 화면 가독성 개선 근거

## 개선 목표

- 모든 정보가 같은 시각적 무게를 갖는 카드 나열을 줄인다.
- 사용자가 지금 해야 할 행동을 페이지 상단에서 바로 찾게 한다.
- 방 목록은 빠르게 훑고 비교할 수 있게 만들고, 상세 규칙은 필요한 시점에 펼쳐 보게 한다.
- 상태 색상은 조치가 필요하거나 구분 가치가 있는 정보에만 사용한다.

## 참고한 웹 레퍼런스

### Carbon Design System · Dashboards

[Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/)

- 중요한 데이터를 우선순위대로 배치하고 명확한 시각적 계층을 만들 것을 권장한다.
- 가장 중요한 정보를 상단에 놓고 나머지는 사용자의 읽기 흐름에 맞춰 배치한다.
- 메인 화면에서 긴급 문제를 가장 위에 두고, 다음 행동과 운영 요약을 아래에 배치하는 근거로 사용했다.

### U.S. Web Design System · Card

[Card](https://designsystem.digital.gov/components/card/)

- 카드는 하나의 주제와 관련 행동을 요약할 때 사용한다.
- 단순 장식이나 표 형태의 정보를 카드로 대체하지 말고, 카드마다 상세 정보로 이어지는 행동을 제공할 것을 권장한다.
- 메인 화면의 카드 수를 줄이고 `이어서 할 일`과 `운영 요약`처럼 독립적인 두 주제만 카드로 유지했다.

### Carbon Design System · Structured list / Data table

[Structured list](https://v10.carbondesignsystem.com/components/structured-list/usage/)  
[Data table](https://carbondesignsystem.com/components/data-table/usage/)

- 비슷한 정보를 논리적이고 훑기 쉬운 목록으로 정리할 것을 권장한다.
- 검색과 필터는 목록 도구 모음에 모으고, 상세 정보는 행 선택 이후 점진적으로 보여줄 수 있다.
- 방 카드 모음을 세로 구조 목록으로 바꾸고 검색·필터·결과 수를 목록 상단에 모았다.

### Carbon Design System · Filtering

[Filtering](https://carbondesignsystem.com/patterns/filtering/)

- 필터는 많은 항목 중 원하는 대상을 찾거나 비교 범위를 줄일 때 사용한다.
- 간단한 필터는 선택 즉시 결과에 반영해 현재 범위를 명확하게 보여준다.
- 전체·모집 중·공식 필터를 즉시 반영하고 결과 개수를 함께 표시했다.

### Carbon Design System · Disclosures

[Disclosures](https://carbondesignsystem.com/patterns/disclosures-pattern/)

- 추가 정보나 세부 설정은 사용자가 요청했을 때 펼쳐 보여주는 방식을 권장한다.
- 완료에 반드시 필요한 중요 정보는 숨기지 않아야 한다.
- 라이브 모의 전용과 개인 정보 보호 원칙은 참여 전 확인 영역에서 한 번 설명하고, 고정 정책을 설정값처럼 반복 노출하지 않는다.

### GOV.UK Design System · Summary list

[Summary list](https://design-system.service.gov.uk/components/summary-list/)

- 기간과 인원처럼 방마다 달라지는 핵심 사실을 요약 목록으로 보여줄 때 사용한다.
- 방 상세 상단에는 기간과 참가자처럼 사용자가 비교할 수 있는 정보만 남겼다.

### Carbon Design System · Status indicators

[Status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)

- 상태 표시는 빠른 탐색에 유용하지만, 조치가 필요하지 않은 정보까지 강조하면 인지 부담이 늘어난다.
- 메인에서는 `조치 필요`만 위험 색으로 강조하고, 방 목록에서는 작은 점·텍스트 조합으로 상태를 구분했다.

## 메인 화면 적용 결과

1. 제목을 `오늘 할 일`로 바꾸고 설명을 한 문장으로 줄였다.
2. 데이터 지연 문제를 최상단 단일 경고 영역으로 배치했다.
3. 마지막 전략과 참여 중인 방을 `이어서 할 일` 목록으로 묶었다.
4. 전략 진행률은 짧은 진행 막대로 바꾸고 퍼즐 미리보기 장식을 제거했다.
5. 봇 상태와 주문 처리를 하나의 `운영 요약` 패널로 통합했다.
6. 중단 0건처럼 행동 가치가 낮은 정보는 메인 요약에서 제외했다.

## 방 화면 적용 결과

1. 생성 기능을 탭에서 제거하고 우측 상단의 명확한 기본 버튼으로 분리했다.
2. 목록 검색·필터·결과 수를 한 영역에 배치했다.
3. 방 목록을 카드 모음 대신 간결한 구조 목록으로 변경했다.
4. 선택 상태는 배경과 좌측 표시선으로 구분한다.
5. 큰 장식용 커버를 제거하고 방 이름과 상태를 상세 상단에 배치했다.
6. 기간과 참가자처럼 방마다 달라지는 핵심 사실만 먼저 보여준다.
7. 반드시 확인할 안전 원칙 두 개는 항상 보이게 유지한다.
8. 나머지 운영 규칙은 네이티브 `details` 요소로 접어 정보량을 줄였다.
9. 검색 결과가 없을 때 다음 행동을 알려주는 빈 상태를 추가했다.
10. 방 생성 폼을 `기본 정보`와 `일정과 제출` 두 그룹으로 나눴다.
11. 내부 탭이나 생성 화면으로 전환할 때 페이지 상단으로 이동한다.

## 유지한 원칙

- 특정 종목, 전략 수치, 기간, 주문 가격을 추천하지 않는다.
- 실제 자금이나 실제 주문이 아닌 라이브 모의 환경임을 명확히 표시한다.
- 개인 전략, 종목, 포지션과 주문 기록은 다른 참가자와 공유하지 않는다.
- 필수 입력은 편집 중 즉시 차단하지 않고 완료 단계에서 한 번에 검사한다.
