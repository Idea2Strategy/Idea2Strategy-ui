import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RoomsView } from './views/OperationsViews.jsx';
import { BotsView } from './views/BotsView';
import { AccountView, HelpView, NotificationsView } from './views/SupportViews.jsx';

describe('Bot operations', () => {
  test('selecting a bot drives the detail panel instead of pinning it to one bot', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    const detail = screen.getByRole('region', { name: 'Atlas 07 운영 상세' });
    expect(within(detail).getByRole('heading', { name: 'Atlas 07' })).toBeInTheDocument();
    // The capital appears in the overview figures and again as the chart's
    // end value, so assert presence rather than uniqueness.
    expect(within(detail).getAllByText('$24,892.40').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Room Beta 상세 보기' }));

    const next = screen.getByRole('region', { name: 'Room Beta 운영 상세' });
    expect(within(next).getByRole('heading', { name: 'Room Beta' })).toBeInTheDocument();
    expect(within(next).getAllByText('$10,184.12').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Atlas 07 운영 상세' })).not.toBeInTheDocument();
  });

  test('the status filter narrows the list and an empty result offers a way back', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    const list = () => within(screen.getByRole('list', { name: '봇 목록 결과' })).getAllByRole('listitem');
    expect(list()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: '실행' }));
    expect(list()).toHaveLength(2);

    // No bot needs attention: budget-cap deferrals are normal operation, so
    // the attention filter legitimately comes back empty.
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('list', { name: '봇 목록 결과' })).not.toBeInTheDocument();
    expect(screen.getByText('조건에 맞는 봇이 없습니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '전체 보기' }));
    expect(list()).toHaveLength(3);
  });

  test('a budget-cap deferral is recorded as normal flow, not escalated as a problem', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Pair Lab 상세 보기' }));

    // No problem banner, no attention state: the bot retries by itself.
    expect(screen.queryByRole('group', { name: 'Pair Lab 문제 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원인 상세' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Pair Lab 운영 상세' })).getByText('실행 중')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));
    // Engine records are opt-in: the default view is fills only.
    expect(screen.queryByText('KO·PEP 페어 주문 보류')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전체 기록' }));
    expect(screen.getByText('KO·PEP 페어 주문 보류')).toBeInTheDocument();
    expect(screen.getByText(/다음 평가에서 재시도/)).toBeInTheDocument();
    expect(screen.getByText(/예산 상한 보류는 정상 동작이며/)).toBeInTheDocument();
  });

  test('fills live in the decision log with the partition whose strategy created them', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));

    const log = () => screen.getByRole('list', { name: 'Atlas 07 판단 기록 목록' });
    expect(within(log()).getByText('SPY 12주 · $634.06')).toBeInTheDocument();
    expect(within(log()).getByText('SECTION 01 · SPY')).toBeInTheDocument();
    expect(within(log()).getByText(/RSI 30 미만 → 예산 25% 시장가 매수/)).toBeInTheDocument();
    // Engine records join the same timeline once the person opts in.
    expect(within(log()).queryByText('예산 상한 검사 통과')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전체 기록' }));
    expect(within(log()).getByText('예산 상한 검사 통과')).toBeInTheDocument();
  });

  test('the decision log filters by search text and period', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));

    const log = () => screen.getByRole('list', { name: 'Atlas 07 판단 기록 목록' });
    // Three fills by default; searching narrows to matching symbols only.
    expect(within(log()).getAllByRole('listitem')).toHaveLength(3);
    await user.type(screen.getByRole('searchbox', { name: '판단 기록 검색' }), 'MSFT');
    expect(within(log()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(log()).getByText('MSFT 9주 · $492.30')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: '판단 기록 검색' }));

    // The sample "today" is 07.23 — only that day's fill remains.
    await user.selectOptions(screen.getByRole('combobox', { name: '판단 기록 기간 선택' }), 'today');
    expect(within(log()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(log()).getByText('SPY 12주 · $634.06')).toBeInTheDocument();

    // Filters that match nothing surface a reset, not an empty panel.
    await user.type(screen.getByRole('searchbox', { name: '판단 기록 검색' }), 'TSLA');
    expect(screen.getByText('조건에 맞는 기록이 없습니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(within(log()).getAllByRole('listitem')).toHaveLength(5);
  });

  test('a bot persona emoji can be changed and shows up in the list tile', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Atlas 07 이모지 설정' }));
    await user.click(screen.getByRole('button', { name: /공격적/ }));

    expect(screen.getByRole('button', { name: 'Atlas 07 이모지 설정' })).toHaveTextContent('🔥');
    expect(screen.getByRole('button', { name: 'Atlas 07 상세 보기' })).toHaveTextContent('🔥');
    // Picking closes the picker.
    expect(screen.queryByRole('group', { name: '봇 이모지 선택' })).not.toBeInTheDocument();
  });

  test('positions show current state only, with a composition bar including cash', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: /포지션/ }));

    const composition = screen.getByRole('group', { name: 'Atlas 07 자산 구성' });
    expect(within(composition).getByText('SPY')).toBeInTheDocument();
    expect(within(composition).getByText('30.6%')).toBeInTheDocument();
    expect(within(composition).getByText('현금')).toBeInTheDocument();
    expect(within(composition).getByText('35.8%')).toBeInTheDocument();

    // Time-axis records moved to the decision log; positions is current state.
    expect(screen.queryByText('SECTION 01 · SPY')).not.toBeInTheDocument();
  });

  test('positions and decisions stay behind tabs so the page is not four stacked panels', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /포지션/ }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /포지션/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/최초 실패 조건과 함께 남깁니다/)).toBeInTheDocument();
  });

  test('a Basic snapshot keeps the bot > partition > buy/sell > block hierarchy', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: '전략 스냅샷' }));

    expect(screen.getByText('Opening Range Flow · v4')).toBeInTheDocument();
    // Launching severs the link entirely — no source-state tracking exists.
    expect(screen.getByText(/이후 원본 전략을 수정하거나 삭제해도 이 봇에는 영향이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText('원본 수정됨')).not.toBeInTheDocument();

    // Three partitions, each with its own symbol, allocation and buy/sell groups.
    const first = screen.getByRole('region', { name: 'SECTION 01 파티션' });
    expect(screen.getByRole('region', { name: 'SECTION 03 파티션' })).toBeInTheDocument();
    expect(within(first).getByText('SPY')).toBeInTheDocument();
    expect(within(first).getByText('투자비율 40%')).toBeInTheDocument();
    expect(within(first).getByRole('heading', { name: '매수 전략' })).toBeInTheDocument();
    expect(within(first).getByRole('heading', { name: '매도 전략' })).toBeInTheDocument();
    expect(within(first).getByText('RSI 30 미만')).toBeInTheDocument();
  });

  test('the snapshot explains itself in plain language on demand', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: '전략 스냅샷' }));
    expect(screen.queryByText(/30 미만으로 내려가면 전략 예산의 25%를 시장가로 매수합니다/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '자연어 설명' }));

    expect(screen.getAllByText(/30 미만으로 내려가면 전략 예산의 25%를 시장가로 매수합니다/).length).toBeGreaterThan(0);
    expect(screen.getByText(/70을 넘으면 보유 수량 전체를 시장가로 매도합니다/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '자연어 설명' }));
    expect(screen.queryByText(/30 미만으로 내려가면/)).not.toBeInTheDocument();
  });

  test('a Pro snapshot renders as execution order', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Room Beta 상세 보기' }));
    await user.click(screen.getByRole('tab', { name: '전략 스냅샷' }));

    expect(screen.getByText(/실행 순서 기준으로 표시합니다/)).toBeInTheDocument();

    const steps = within(screen.getByRole('list', { name: 'Room Beta 전략 실행 순서' })).getAllByRole('listitem');
    expect(steps).toHaveLength(6);
    expect(steps[0]).toHaveTextContent('직접 선택 바스켓');
    expect(steps[3]).toHaveTextContent('분기 · 참/거짓 2갈래');
  });

  test('a bot holding only cash shows an empty position state, not a blank table', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Pair Lab 상세 보기' }));
    await user.click(screen.getByRole('tab', { name: /포지션/ }));

    expect(screen.getByText('보유 중인 포지션이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Notification centre', () => {
  test('filters by severity and by unread state', async () => {
    const user = userEvent.setup();
    render(<NotificationsView setPage={() => {}} />);

    expect(screen.getByText('Pair Lab 데이터 확인')).toBeInTheDocument();
    expect(screen.getByText('Atlas 07 계속 실행 확인')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '정보', pressed: false }));

    // Engine events (data checks, deferrals) are info; the renewal deadline is
    // the only action-severity item and drops out of the info filter.
    expect(screen.getByText('Pair Lab 데이터 확인')).toBeInTheDocument();
    expect(screen.getByText('Momentum Lab 평가 12일 남음')).toBeInTheDocument();
    expect(screen.queryByText('Atlas 07 계속 실행 확인')).not.toBeInTheDocument();
  });

  test('marking everything read empties the unread count and disables the action', async () => {
    const user = userEvent.setup();
    render(<NotificationsView setPage={() => {}} />);

    const markAll = screen.getByRole('button', { name: '모두 읽음' });
    expect(markAll).toBeEnabled();
    expect(screen.getByText('읽지 않음 2개')).toBeInTheDocument();

    await user.click(markAll);

    expect(screen.getByText('모두 읽었습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
  });

  test('opening a notification navigates to the screen that owns it', async () => {
    const user = userEvent.setup();
    const setPage = vi.fn();
    render(<NotificationsView setPage={setPage} />);

    await user.click(screen.getByRole('button', { name: 'Pair Lab 데이터 확인 관련 화면 열기' }));

    expect(setPage).toHaveBeenCalledWith('bots');
  });

  test('a notification with no destination is not presented as clickable', () => {
    render(<NotificationsView setPage={() => {}} />);

    expect(screen.queryByRole('button', { name: /시장 데이터 지연 복구/ })).not.toBeInTheDocument();
    expect(screen.getByText('시장 데이터 지연 복구')).toBeInTheDocument();
  });

  test('an over-filtered list offers a way back', async () => {
    const user = userEvent.setup();
    render(<NotificationsView setPage={() => {}} />);

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByLabelText('읽지 않은 항목만'));

    expect(screen.getByText('조건에 맞는 알림이 없습니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(screen.getByText('Pair Lab 데이터 확인')).toBeInTheDocument();
  });
});

describe('Help and glossary', () => {
  test('searching the glossary matches the term and its explanation', async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    expect(screen.getByText('누적 수익률')).toBeInTheDocument();
    expect(screen.getByText('샤프 지수')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '용어 검색' }), '변동성 대비');

    expect(screen.getByText('샤프 지수')).toBeInTheDocument();
    expect(screen.queryByText('누적 수익률')).not.toBeInTheDocument();
  });

  test('a search with no match offers to clear itself', async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.type(screen.getByRole('searchbox', { name: '용어 검색' }), 'zzzz');
    expect(screen.getByText('검색과 일치하는 용어가 없습니다.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(screen.getByText('누적 수익률')).toBeInTheDocument();
  });

  test('states the simulation limits explicitly', () => {
    render(<HelpView />);

    expect(screen.getByText(/실제 증권 계좌에 연결되지 않으며/)).toBeInTheDocument();
    expect(screen.getByText(/추천하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/수익성, 안전성, 전략 적합성을 보장하지 않습니다/)).toBeInTheDocument();
  });
});

describe('Account settings', () => {
  const setup = () => {
    const setTheme = vi.fn();
    const setTimezone = vi.fn();
    const setReduceMotion = vi.fn();
    render(<AccountView
      theme="dark"
      setTheme={setTheme}
      timezone="et"
      setTimezone={setTimezone}
      reduceMotion={false}
      setReduceMotion={setReduceMotion}
    />);
    return { setTheme, setTimezone, setReduceMotion };
  };

  test('display controls are wired to the live app state', async () => {
    const user = userEvent.setup();
    const { setTheme, setTimezone, setReduceMotion } = setup();

    await user.selectOptions(screen.getByRole('combobox', { name: '테마 선택' }), 'light');
    expect(setTheme).toHaveBeenCalledWith('light');

    await user.selectOptions(screen.getByRole('combobox', { name: '시간대 표기 선택' }), 'kst');
    expect(setTimezone).toHaveBeenCalledWith('kst');

    await user.click(screen.getByLabelText(/모션 줄이기/));
    expect(setReduceMotion).toHaveBeenCalledWith(true);
  });

  test('keeps the security section and states the storage limits', () => {
    setup();

    expect(screen.getByRole('heading', { name: '접근 보안' })).toBeInTheDocument();
    expect(screen.getByText('이 브라우저에만 저장')).toBeInTheDocument();
    expect(screen.getByText(/데이터 기준 2026\.07\.23/)).toBeInTheDocument();
  });
});

describe('Competition ranking', () => {
  test('the ranking is re-sorted by the metric the person chooses', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));

    const ranking = screen.getByLabelText('Momentum Lab 봇 순위');
    const names = () => [...ranking.querySelectorAll('div > span:nth-child(2)')].map((el) => el.textContent.replace('내 봇', '').trim());

    expect(names()[0]).toBe('Bot 3F9A');

    await user.selectOptions(screen.getByRole('combobox', { name: '정렬 지표 선택' }), 'sharpe');

    // Room Beta has the best Sharpe ratio even though it is second on score.
    expect(names()[0]).toBe('Room Beta');
    expect(screen.getByText(/1위/)).toBeInTheDocument();
  });

  test('lower-is-better metrics sort ascending', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '정렬 지표 선택' }), 'volatility');

    const ranking = screen.getByLabelText('Momentum Lab 봇 순위');
    const first = ranking.querySelectorAll('div > span:nth-child(2)')[0];
    expect(first.textContent).toContain('Room Beta');
  });

  test('states the conditions held equal across entries', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));

    const conditions = screen.getByLabelText('Momentum Lab 공통 조건');
    expect(within(conditions).getAllByRole('listitem')).toHaveLength(4);
    expect(within(conditions).getByText('$10,000')).toBeInTheDocument();
    expect(within(conditions).getByText('미국 상장 주식 · ETF')).toBeInTheDocument();
    expect(within(conditions).getByText('0.20%')).toBeInTheDocument();
    expect(within(conditions).getByText('0.05%')).toBeInTheDocument();
  });
});
