import { fireEvent, render as renderBare, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Views navigate to /login for sign-in states, so every render needs a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RoomsView } from './views/OperationsViews';
import { BotsView } from './views/BotsView';
import { AccountView, HelpView, NotificationsView } from './views/SupportViews';
import type { BotOperationsClient } from './api/botOperations';

/* The page opens on 실시간 so the live chart costs no clicks; the standing
   figures moved to their own 개요 tab, which these tests have to open. */
const openOverview = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('tab', { name: /개요/ }));

describe('Bot operations', () => {
  test('permanently stops a running owned bot through the live command API', async () => {
    const running = {
      botId: '30000000-0000-4000-8000-000000000001',
      name: 'Atlas 07',
      state: 'running' as const,
      lifecycleChangedAt: '2026-08-01T12:00:00Z',
      executionBlockedAt: null,
      executionBlockReasonCode: null,
      lastEventSequence: 0,
    };
    const client: BotOperationsClient = {
      listOperations: vi.fn()
        .mockResolvedValueOnce([running])
        .mockResolvedValue([{ ...running, state: 'stopping' as const }]),
      listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
      stopBot: vi.fn().mockResolvedValue(undefined),
      runBot: vi.fn().mockResolvedValue(undefined),
    };
    const user = userEvent.setup();

    render(<BotsView operationsClient={client} pollIntervalMs={60_000} />);

    await user.click(await screen.findByRole('button', { name: 'Atlas 07 영구 중단' }));
    await waitFor(() => expect(client.stopBot).toHaveBeenCalledWith(
      running.botId,
      'USER_REQUESTED',
    ));
    await waitFor(() => expect(screen.getAllByText('중지 중').length).toBeGreaterThan(0));
  });

  test('polls live operation state and appends judgment events once by sequence', async () => {
    const firstEvent = {
      eventId: '40000000-0000-4000-8000-000000000001',
      sequence: 8,
      eventType: 'BOT_EVALUATED',
      occurredAt: '2026-08-01T12:01:00Z',
      summary: {
        side: 'BUY', symbol: 'AAPL', quantity: 2, price: 100, rule: '돌파 조건 충족',
        open: 99, high: 101, low: 98, close: 100, volume: 1200,
      },
    };
    const secondEvent = {
      eventId: '40000000-0000-4000-8000-000000000002',
      sequence: 9,
      eventType: 'BOT_EVALUATED',
      occurredAt: '2026-08-01T12:02:00Z',
      summary: { side: 'SELL', symbol: 'MSFT', quantity: 1, price: 200, rule: '청산 조건 충족' },
    };
    const client: BotOperationsClient = {
      listOperations: vi.fn().mockResolvedValue([{
        botId: '30000000-0000-4000-8000-000000000001',
        name: 'Atlas 07',
        state: 'data-degraded',
        lifecycleChangedAt: '2026-08-01T12:00:00Z',
        executionBlockedAt: '2026-08-01T12:01:00Z',
        executionBlockReasonCode: 'MARKET_DATA_STALE',
        lastEventSequence: 9,
      }]),
      listJudgments: vi.fn()
        .mockResolvedValueOnce({ entries: [firstEvent], nextAfterSequence: 8, hasMore: false })
        .mockResolvedValueOnce({ entries: [firstEvent, secondEvent], nextAfterSequence: 9, hasMore: false })
        .mockResolvedValue({ entries: [], nextAfterSequence: 9, hasMore: false }),
      runBot: vi.fn().mockResolvedValue(undefined),
      stopBot: vi.fn().mockResolvedValue(undefined),
    };
    const user = userEvent.setup();

    render(<BotsView operationsClient={client} pollIntervalMs={20} />);

    await waitFor(() => expect(screen.getAllByText('데이터 저하').length).toBeGreaterThan(0));
    expect(screen.getByText('실행 차단 사유: MARKET_DATA_STALE')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('시세 데이터 대기')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));
    await waitFor(() => expect(screen.getByText('MSFT 1주 · $200')).toBeInTheDocument());
    expect(screen.getAllByText('AAPL 2주 · $100')).toHaveLength(1);
    expect(client.listJudgments).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000001',
      8,
      100,
      expect.any(AbortSignal),
    );
  });

  test('keeps the last successful operation state when a later poll fails', async () => {
    const client: BotOperationsClient = {
      listOperations: vi.fn()
        .mockResolvedValueOnce([{
          botId: '30000000-0000-4000-8000-000000000001',
          name: 'Atlas 07',
          state: 'action-required',
          lifecycleChangedAt: '2026-08-01T12:00:00Z',
          executionBlockedAt: '2026-08-01T12:01:00Z',
          executionBlockReasonCode: 'UNRECOVERABLE_STATE',
          lastEventSequence: 0,
        }])
        .mockRejectedValue(new Error('offline')),
      listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
      runBot: vi.fn().mockResolvedValue(undefined),
      stopBot: vi.fn().mockResolvedValue(undefined),
    };

    render(<BotsView operationsClient={client} pollIntervalMs={20} />);

    await waitFor(() => expect(screen.getAllByText('조치 필요').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/마지막으로 확인한 봇 목록/)).toBeInTheDocument());
    expect(screen.getAllByText('조치 필요').length).toBeGreaterThan(0);
    expect(screen.getByText('실행 차단 사유: UNRECOVERABLE_STATE')).toBeInTheDocument();
  });

  test('carries no page-level launch or refresh action', () => {
    render(<BotsView />);

    /* Launching belongs to the strategy release flow, which owns the locked
       version and the launch configuration; a shortcut here would start a flow
       this page cannot finish. A manual refresh never belonged here either. */
    expect(screen.queryByRole('button', { name: '봇 출시' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
  });

  test('selecting a bot drives the detail panel instead of pinning it to one bot', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    const detail = screen.getByRole('region', { name: 'Atlas 07 운영 상세' });
    expect(within(detail).getByRole('heading', { name: 'Atlas 07' })).toBeInTheDocument();
    await openOverview(user);
    expect(within(detail).getByText('$10,540.00')).toBeInTheDocument();
    expect(within(detail).getByText('+$540.00 · +5.40%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '대회 참가 중' }));
    await user.click(screen.getByRole('button', { name: 'Room Beta 상세 보기' }));

    const next = screen.getByRole('region', { name: 'Room Beta 운영 상세' });
    expect(within(next).getByRole('heading', { name: 'Room Beta' })).toBeInTheDocument();
    // Selecting a bot returns to 실시간, so the figures need the tab again.
    await openOverview(user);
    expect(within(next).getByText('$10,490.00')).toBeInTheDocument();
    expect(within(next).getByText('+$490.00 · +4.90%')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Atlas 07 운영 상세' })).not.toBeInTheDocument();
  });

  test('the operation type filter separates personal bots from competition bots', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    const filter = screen.getByRole('group', { name: '봇 운용 유형 필터' });
    const list = () => within(screen.getByRole('list', { name: '봇 목록 결과' })).getAllByRole('listitem');
    expect(list()).toHaveLength(3);
    expect(within(filter).queryByRole('button', { name: '전체' })).not.toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: '개인 운용' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Atlas 07 상세 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair Lab 상세 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pulse Grid 상세 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Room Beta 상세 보기' })).not.toBeInTheDocument();

    await user.click(within(filter).getByRole('button', { name: '대회 참가 중' }));
    expect(list()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Room Beta 상세 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atlas 07 상세 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair Lab 상세 보기' })).not.toBeInTheDocument();
  });

  test('the overview shows the correct start event without repeating the shared initial capital', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    const atlas = screen.getByRole('region', { name: 'Atlas 07 운영 상세' });
    await openOverview(user);
    expect(within(atlas).queryByText('초기 자산')).not.toBeInTheDocument();
    expect(within(atlas).getByText('운용 시작 시간')).toBeInTheDocument();
    expect(within(atlas).getByText('2025.07.08 09:30 ET')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '대회 참가 중' }));

    const competitionBot = screen.getByRole('region', { name: 'Room Beta 운영 상세' });
    await openOverview(user);
    expect(within(competitionBot).queryByText('초기 자산')).not.toBeInTheDocument();
    expect(within(competitionBot).getByText('대회 참가 시간')).toBeInTheDocument();
    expect(within(competitionBot).getByText('2026.06.08 09:30 ET')).toBeInTheDocument();
  });

  test('a bot younger than 30 days charts only its actual operating period', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Pair Lab 상세 보기' }));

    const detail = screen.getByRole('region', { name: 'Pair Lab 운영 상세' });
    await openOverview(user);
    expect(within(detail).getAllByText('$9,790.00')).toHaveLength(2);
    expect(within(detail).getByRole('heading', { name: '운용 시작 후 18일 손익' })).toBeInTheDocument();
    expect(within(detail).getByText('07.05–07.23 · 18일')).toBeInTheDocument();
    expect(within(detail).queryByRole('heading', { name: '최근 30일 손익' })).not.toBeInTheDocument();
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
    expect(within(log()).getByText('SPY 4주 · $634.06')).toBeInTheDocument();
    expect(within(log()).getByText('SECTION 01 · SPY')).toBeInTheDocument();
    expect(within(log()).getAllByText(/시초 15분 고가.*돌파 → 예산 25% 시장가 매수/).length).toBeGreaterThan(0);
    // Engine records join the same timeline once the person opts in.
    expect(within(log()).queryByText('예산 상한 검사 통과')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전체 기록' }));
    expect(within(log()).getByText('예산 상한 검사 통과')).toBeInTheDocument();
  });

  test('the live chart opens with the page and pairs candles with symbol-specific execution markers', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    // The point of the 실시간 tab: reaching the chart costs no clicks. It used
    // to live inside the decision log, two steps into the page.
    expect(screen.getByRole('tab', { name: /실시간/ })).toHaveAttribute('aria-selected', 'true');

    const chart = screen.getByRole('region', { name: 'Atlas 07 실시간 체결 차트' });
    expect(within(chart).getByText('SPY')).toBeInTheDocument();
    expect(within(chart).getByText('실시간 데모')).toBeInTheDocument();
    expect(within(chart).getByTestId('live-trade-marker')).toHaveAttribute('data-side', '매수');

    await user.click(within(chart).getByRole('button', { name: 'AAPL 차트 보기' }));
    expect(within(chart).getByRole('heading', { name: 'AAPL 실시간 차트' })).toBeInTheDocument();
    expect(within(chart).getByTestId('live-trade-marker')).toHaveAttribute('data-side', '매도');

    // The log keeps the written record of the same fills; it must not draw the
    // chart a second time.
    await user.click(screen.getByRole('tab', { name: /판단 기록/ }));
    expect(screen.queryByRole('region', { name: 'Atlas 07 실시간 체결 차트' })).not.toBeInTheDocument();
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
    expect(within(log()).getByText('MSFT 3주 · $492.30')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: '판단 기록 검색' }));

    // The sample "today" is 07.23 — only that day's fill remains.
    await user.selectOptions(screen.getByRole('combobox', { name: '판단 기록 기간 선택' }), 'today');
    expect(within(log()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(log()).getByText('SPY 4주 · $634.06')).toBeInTheDocument();

    // Filters that match nothing surface a reset, not an empty panel.
    await user.type(screen.getByRole('searchbox', { name: '판단 기록 검색' }), 'TSLA');
    expect(screen.getByText('조건에 맞는 기록이 없습니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(within(log()).getAllByRole('listitem')).toHaveLength(5);
  });

  test('selecting a bot shape opens colored icon variants that apply immediately', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: 'Atlas 07 아이콘 설정' }));

    const iconShapes = screen.getByRole('group', { name: '아이콘 모양' });
    expect(within(iconShapes).getAllByRole('button')).toHaveLength(12);
    expect(screen.queryByText('집중')).not.toBeInTheDocument();
    expect(screen.queryByText('공격적')).not.toBeInTheDocument();

    const analyticalChoice = within(iconShapes).getByRole('button', { name: '분석형 봇 아이콘' });
    expect(analyticalChoice.querySelector('.bot-icon-glyph')).toHaveAttribute('data-color', 'gray');
    await user.click(analyticalChoice);

    const initialVariants = screen.getByRole('group', { name: '분석형 봇 아이콘 색상 선택' });
    expect(analyticalChoice.parentElement).toContainElement(initialVariants);
    expect(within(initialVariants).getAllByRole('button')).toHaveLength(10);

    await user.click(analyticalChoice);
    expect(screen.queryByRole('group', { name: '분석형 봇 아이콘 색상 선택' })).not.toBeInTheDocument();
    await user.click(analyticalChoice);

    const colorVariants = screen.getByRole('group', { name: '분석형 봇 아이콘 색상 선택' });
    const blueVariant = within(colorVariants).getByRole('button', { name: '분석형 봇 아이콘 파란색 적용' });
    expect(blueVariant.querySelector('.bot-icon-glyph')).toHaveAttribute('data-icon', 'analytical');
    expect(blueVariant.querySelector('.bot-icon-glyph')).toHaveAttribute('data-color', 'blue');

    // Clicking the underlying picker dismisses the floating variants without applying.
    await user.click(within(screen.getByRole('group', { name: '봇 아이콘 선택' })).getByText('아이콘'));
    expect(screen.queryByRole('group', { name: '분석형 봇 아이콘 색상 선택' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '아이콘 모양' })).toBeInTheDocument();
    expect(screen.getByTestId('bot-icon-Atlas 07-detail')).toHaveAttribute('data-icon', 'focus');

    // Clicking outside the whole picker closes it without applying, too.
    await user.click(within(screen.getByRole('group', { name: '아이콘 모양' })).getByRole('button', { name: '분석형 봇 아이콘' }));
    await user.click(screen.getByRole('heading', { name: 'Atlas 07' }));
    expect(screen.queryByRole('group', { name: '봇 아이콘 선택' })).not.toBeInTheDocument();
    expect(screen.getByTestId('bot-icon-Atlas 07-detail')).toHaveAttribute('data-icon', 'focus');

    await user.click(screen.getByRole('button', { name: 'Atlas 07 아이콘 설정' }));
    await user.click(within(screen.getByRole('group', { name: '아이콘 모양' })).getByRole('button', { name: '분석형 봇 아이콘' }));
    const reopenedVariants = screen.getByRole('group', { name: '분석형 봇 아이콘 색상 선택' });
    await user.click(within(reopenedVariants).getByRole('button', { name: '분석형 봇 아이콘 파란색 적용' }));

    const detailIcon = screen.getByTestId('bot-icon-Atlas 07-detail');
    const listIcon = screen.getByTestId('bot-icon-Atlas 07-list');
    expect(detailIcon).toHaveAttribute('data-icon', 'analytical');
    expect(detailIcon).toHaveAttribute('data-color', 'blue');
    expect(listIcon).toHaveAttribute('data-icon', 'analytical');
    expect(listIcon).toHaveAttribute('data-color', 'blue');
    expect(screen.queryByRole('group', { name: '봇 아이콘 선택' })).not.toBeInTheDocument();
  });

  test('positions show current state only, with a composition bar including cash', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('tab', { name: /포지션/ }));

    const composition = screen.getByRole('group', { name: 'Atlas 07 자산 구성' });
    expect(within(composition).getByText('SPY')).toBeInTheDocument();
    expect(within(composition).getByText('24.0%')).toBeInTheDocument();
    expect(within(composition).getByText('현금')).toBeInTheDocument();
    expect(within(composition).getByText('49.5%')).toBeInTheDocument();

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

  test('replaces the strategy snapshot tab with a layout button beside the tabs', () => {
    render(<BotsView />);

    expect(screen.queryByRole('tab', { name: '전략 스냅샷' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자연어 설명' })).not.toBeInTheDocument();
    const tabBar = screen.getByRole('group', { name: 'Atlas 07 상세 탐색' });
    expect(within(tabBar).getByRole('button', { name: '전략 구성 보기' })).toBeInTheDocument();
  });

  test('opens the launch snapshot layout in a read-only modal without editor tools', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const dialog = screen.getByRole('dialog', { name: 'Atlas 07 전략 구성' });
    expect(within(dialog).queryByText('보기 전용 · 블록 내용은 수정할 수 없습니다.')).not.toBeInTheDocument();
    expect(within(dialog).getByText('현재 봇 전용 배치')).toBeInTheDocument();
    expect(within(dialog).getByText('이 배치는 현재 봇의 스냅샷 화면에만 적용되며 전략 내용에는 영향을 주지 않습니다.')).toBeInTheDocument();
    expect(within(dialog).getByText('빈 공간 드래그: 화면 이동 · 블록 드래그: 위치 변경')).toBeInTheDocument();
    expect(within(dialog).getByTestId('snapshot-layout-item-section-01')).toHaveAttribute('data-x', '290');
    expect(within(dialog).getAllByText('AAPL · MSFT · SPY').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('1m BAR')).toBeInTheDocument();
    expect(within(dialog).getByText('OPENING RANGE')).toBeInTheDocument();
    expect(within(dialog).getByText('OR HIGH')).toBeInTheDocument();
    expect(within(dialog).getByText('OR LOW')).toBeInTheDocument();
    expect(within(dialog).getByText('15:55 ET')).toBeInTheDocument();
    expect(within(dialog).getByText('BUDGET')).toBeInTheDocument();
    expect(within(dialog).getByText('POSITION')).toBeInTheDocument();
    expect(dialog.querySelectorAll('.strategy-section-frame')).toHaveLength(1);
    expect(dialog.querySelectorAll('.strategy-card')).toHaveLength(2);
    expect(dialog.querySelectorAll('.scratch-block')).toHaveLength(9);
    expect(within(dialog).queryByRole('combobox', { name: 'SECTION 01 종목' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('블록 편집 잠금')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '＋ 매수 블록 추가' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '＋ 매도 블록 추가' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('searchbox', { name: '블록 검색' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('템플릿')).not.toBeInTheDocument();
  });

  test('shows the editor rule-by-rule natural-language explanation in the snapshot modal', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const dialog = screen.getByRole('dialog', { name: 'Atlas 07 전략 구성' });
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument();

    const buyExplanation = within(dialog).getByRole('button', { name: '매수 전략 자연어 설명' });
    await user.click(buyExplanation);
    expect(within(dialog).getAllByRole('note')).toHaveLength(5);
    expect(within(dialog).getByRole('note', { name: '1단계 규칙 설명' })).toHaveTextContent('1m BAR');
    expect(within(dialog).getByRole('note', { name: '2단계 규칙 설명' })).toHaveTextContent('OPENING RANGE');
    expect(within(dialog).getByRole('note', { name: '4단계 규칙 설명' })).toHaveTextContent('25%');
    expect(within(dialog).getByRole('note', { name: '5단계 규칙 설명' })).toHaveTextContent('시장가 매수');
    expect(buyExplanation).toHaveAttribute('aria-expanded', 'true');

    const sellExplanation = within(dialog).getByRole('button', { name: '매도 전략 자연어 설명' });
    await user.click(sellExplanation);
    expect(within(dialog).getAllByRole('note')).toHaveLength(4);
    expect(within(dialog).getByRole('note', { name: '1단계 규칙 설명' })).toHaveTextContent('POSITION');
    expect(within(dialog).getByRole('note', { name: '4단계 규칙 설명' })).toHaveTextContent('시장가 매도');

    await user.click(sellExplanation);
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument();
  });

  test('uses the editor cursor spotlight on the snapshot canvas', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const canvas = screen.getByTestId('snapshot-strategy-canvas');
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 120 });
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('1');
    expect(screen.getByTestId('snapshot-cursor-dot-spotlight')).toBeInTheDocument();
  });

  test('uses the editor wheel zoom around the cursor without scrolling the page', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const canvas = screen.getByTestId('snapshot-strategy-canvas');
    const world = canvas.querySelector('.snapshot-layout-world');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: 200,
      clientY: 150,
    });
    expect(fireEvent(canvas, wheel)).toBe(false);
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: '배율 초기화' })).toHaveTextContent('110%');
    expect(world).toHaveStyle({ transform: 'translate3d(-20px, -15px, 0) scale(1.1)' });
  });

  test('saves a moved Basic section only in the selected bot layout state', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const item = screen.getByTestId('snapshot-layout-item-section-01');
    const canvas = screen.getByTestId('snapshot-strategy-canvas');
    fireEvent.pointerDown(item, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 180, clientY: 140 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(item).toHaveAttribute('data-x', '370');
    expect(item).toHaveAttribute('data-y', '148');

    await user.click(screen.getByRole('button', { name: '배치 저장' }));
    expect(screen.queryByRole('dialog', { name: 'Atlas 07 전략 구성' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));
    expect(screen.getByTestId('snapshot-layout-item-section-01')).toHaveAttribute('data-x', '370');
    expect(screen.getByTestId('snapshot-layout-item-section-01')).toHaveAttribute('data-y', '148');
  });

  test('moves a Basic strategy card independently inside its section', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const section = screen.getByTestId('snapshot-layout-item-section-01');
    const card = screen.getByTestId('snapshot-layout-card-section-01-buy');
    const handle = screen.getByRole('button', { name: '매수 전략 자유 이동' });
    const canvas = screen.getByTestId('snapshot-strategy-canvas');

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    expect(card).toHaveClass('is-free-moving');
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    expect(card).toHaveAttribute('data-x', '74');
    expect(card).toHaveAttribute('data-y', '142');
    expect(card).not.toHaveClass('is-free-moving');
    expect(section).toHaveAttribute('data-x', '290');
    expect(section).toHaveAttribute('data-y', '108');

    await user.click(screen.getByRole('button', { name: '배치 저장' }));
    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));
    expect(screen.getByTestId('snapshot-layout-card-section-01-buy')).toHaveAttribute('data-x', '74');
    expect(screen.getByTestId('snapshot-layout-card-section-01-buy')).toHaveAttribute('data-y', '142');
  });

  test('expands a Basic section to contain a card moved beyond its current bounds', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const section = screen.getByTestId('snapshot-layout-item-section-01');
    const card = screen.getByTestId('snapshot-layout-card-section-01-buy');
    const handle = screen.getByRole('button', { name: '매수 전략 자유 이동' });
    const canvas = screen.getByTestId('snapshot-strategy-canvas');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 1100, clientY: 1100 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(card).toHaveAttribute('data-x', '1024');
    expect(card).toHaveAttribute('data-y', '1112');
    expect(section).toHaveStyle({ width: '1388px', height: '1422px' });

    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: -1000, clientY: -1000 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    expect(card).toHaveAttribute('data-x', '24');
    expect(card).toHaveAttribute('data-y', '136');
  });

  test('renders Pro snapshot nodes at their saved coordinates in the same modal', async () => {
    const user = userEvent.setup();
    render(<BotsView />);

    await user.click(screen.getByRole('button', { name: '대회 참가 중' }));
    await user.click(screen.getByRole('button', { name: 'Room Beta 상세 보기' }));
    await user.click(screen.getByRole('button', { name: '전략 구성 보기' }));

    const dialog = screen.getByRole('dialog', { name: 'Room Beta 전략 구성' });
    expect(within(dialog).getByTestId('snapshot-layout-item-universe')).toHaveAttribute('data-x', '40');
    expect(within(dialog).getByTestId('snapshot-layout-item-order')).toHaveAttribute('data-x', '1290');
    expect(within(dialog).getByText('모멘텀 순위')).toBeInTheDocument();
    expect(dialog.querySelectorAll('.graph-node')).toHaveLength(6);
    expect(dialog.querySelectorAll('.graph-link')).toHaveLength(5);
    expect(within(dialog).queryByText('노드 검색')).not.toBeInTheDocument();
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

  test('shows no fabricated identity, social login or stale data claims', () => {
    setup();

    // The API never returns the account's name or email, no social login
    // exists, strategies do save to the server, and the hardcoded Atlas 07
    // continuation card called nothing. None of that may render as real.
    expect(screen.queryByText('김전략')).not.toBeInTheDocument();
    expect(screen.queryByText(/kyoungcheul/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '접근 보안' })).not.toBeInTheDocument();
    expect(screen.queryByText('이 브라우저에만 저장')).not.toBeInTheDocument();
    expect(screen.queryByText(/데이터 기준 2026\.07\.23/)).not.toBeInTheDocument();
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '화면 설정' })).toBeInTheDocument();
  });
});

describe('Competition ranking', () => {
  const openMomentumLab = async (user: ReturnType<typeof userEvent.setup>) => {
    const rail = screen.getByRole('complementary', { name: '일반 대회 필터' });
    await user.click(within(rail).getByRole('radio', { name: '진행 중' }));
    await user.click(screen.getByRole('listitem', { name: 'Momentum Lab 열기' }));
  };

  test('the ranking is re-sorted by the metric the person chooses', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await openMomentumLab(user);

    const ranking = screen.getByLabelText('Momentum Lab 봇 순위');
    const names = () => [...ranking.querySelectorAll('div > span:nth-child(2)')].map((el) => el.textContent.trim());

    expect(names()[0]).toBe('Bot 3F9A');

    /* #54: 지표는 하나씩 갈아끼우는 셀렉트가 아니라 열 편집기로 고르고,
       정렬은 열 머리를 눌러 바꾼다. */
    await user.click(screen.getByRole('button', { name: /^지표 \d+\/\d+$/ }));
    await user.click(screen.getByRole('checkbox', { name: '샤프 지수' }));
    await user.click(screen.getByRole('button', { name: '샤프 지수 기준 정렬' }));

    // Room Beta has the best Sharpe ratio even though it is second on score.
    expect(names()[0]).toBe('Room Beta');
    const firstRow = ranking.querySelector('div:not(.competition-ranking-gap)');
    expect(firstRow).toHaveClass('is-mine');
    expect(firstRow!.querySelector('.competition-ranking-position')).toHaveTextContent('#1');
  });

  test('lower-is-better metrics sort ascending', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await openMomentumLab(user);
    await user.click(screen.getByRole('button', { name: /^지표 \d+\/\d+$/ }));
    await user.click(screen.getByRole('checkbox', { name: '변동성' }));
    await user.click(screen.getByRole('button', { name: '변동성 기준 정렬' }));

    const ranking = screen.getByLabelText('Momentum Lab 봇 순위');
    const first = ranking.querySelectorAll('div > span:nth-child(2)')[0];
    expect(first.textContent).toContain('Room Beta');
  });

  test('places my bots beside the leaderboard and competition facts after it', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await openMomentumLab(user);

    expect(screen.getByText(/참가 봇을 동일한 시장 데이터와 체결 조건에서 비교/)).toBeInTheDocument();
    expect(screen.queryByText('공식 대회')).not.toBeInTheDocument();
    expect(screen.getByText('개설자 이서준')).toBeInTheDocument();
    expect(screen.getByText('· 대회 진행 중 D-8')).toBeInTheDocument();
    expect(screen.getByText('· 대회 진행 중 D-8')).not.toHaveClass('is-urgent');
    expect(screen.getByRole('button', { name: '진행중인 대회입니다.' })).toBeDisabled();
    // 진행 중에는 순위표가 주인공 — 모집 안내 패널은 없다.
    expect(screen.queryByRole('region', { name: 'Momentum Lab 대회 안내' })).not.toBeInTheDocument();

    /* 진행 중엔 내 참가 봇 패널도 없다 — 압축 순위표가 내 행(강조)을 항상
       보여주므로 같은 숫자를 옆에 한 번 더 쓰는 패널이었다. 등록 봇 카운트만
       리더보드 머리에 남는다. */
    expect(screen.queryByLabelText('내 참가 봇 순위')).not.toBeInTheDocument();
    const leaderboardHeading = screen.getByRole('heading', { name: '대회 리더보드' });
    const leaderboard = leaderboardHeading.closest('section');
    expect(leaderboard).not.toBeNull();
    expect(leaderboard).toHaveClass('is-single');
    expect(within(leaderboard!).getByText('등록 봇')).toBeInTheDocument();
    expect(within(leaderboard!).getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Momentum Lab 봇 순위').querySelectorAll('.is-mine')).toHaveLength(1);

    /* #54 확정: 조건은 모달이 아니라 접었다 펴는 인라인 표. 진행 중엔 기본
       접힘이고, 열면 공통 조건이 그 자리에서 보인다. */
    expect(screen.queryByRole('button', { name: '대회 상세보기' })).not.toBeInTheDocument();
    const factsToggle = screen.getByRole('button', { name: /대회 조건/ });
    expect(factsToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(factsToggle);
    expect(screen.getByText('$10,000')).toBeInTheDocument();
    /* 종목 범위는 대회마다 다르다 — 이 방은 지정 3종목만 허용한다. */
    expect(screen.getByText('지정 3종목')).toBeInTheDocument();
    expect(screen.getByText('지정 종목만')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('0.20%')).toBeInTheDocument();
    expect(screen.getByText('0.05%')).toBeInTheDocument();
    await user.click(factsToggle);
    expect(screen.queryByText('$10,000')).not.toBeInTheDocument();

    /* 채점 배지는 툴팁이 아니라 수식 안내 모달을 연다 — 이 대회 방식을
       강조하고 나머지 방식의 계산법도 함께 보여준다. */
    /* 채점 방식은 참가 판단의 핵심이라 헤더 제목 옆에 있다(리더보드에서 반복 X). */
    expect(within(leaderboard!).queryByRole('button', { name: /채점 방식 안내/ })).not.toBeInTheDocument();
    const scoringHelp = screen.getByRole('button', { name: '표준점수제 채점 방식 안내' });
    await user.click(scoringHelp);
    const scoringDialog = screen.getByRole('dialog', { name: '채점 방식 안내' });
    expect(within(scoringDialog).getByText('이 대회의 채점 방식')).toBeInTheDocument();
    expect(within(scoringDialog).getByText('점수 = z(수익률) + z(샤프 지수) − z(최대 낙폭)')).toBeInTheDocument();
    expect(within(scoringDialog).getByText('점수 = (수익률 − 기준금리) ÷ 변동성')).toBeInTheDocument();
    expect(within(scoringDialog).getByText(/수익률과 위험 지표를 표준화/)).toBeInTheDocument();
    await user.click(within(scoringDialog).getByRole('button', { name: '채점 방식 안내 닫기' }));
    expect(screen.queryByRole('dialog', { name: '채점 방식 안내' })).not.toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: '리더보드 표시 개수' })).not.toBeInTheDocument();
  });

  test('marks official competitions and enables entry while recruiting', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('listitem', { name: '공식 대회 ETF Sprint 열기' }));

    /* #54 확정: 모집 중 상세는 참가 화면이다. 봇이 아직 뛰지 않으므로 순위표가
       없고, 등록한 봇은 시작 대기로 보이며 진행률도 없다. */
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('· 모집 중 D-5')).toHaveClass('is-urgent');
    expect(screen.queryByRole('progressbar', { name: 'ETF Sprint 진행률' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대회 참가' })).toBeEnabled();

    const myRanks = screen.getByLabelText('내 참가 봇 순위');
    expect(within(myRanks).getAllByRole('listitem')).toHaveLength(1);
    expect(within(myRanks).getByText('ETF Runner')).toBeInTheDocument();
    expect(within(myRanks).getByText('등록 봇')).toBeInTheDocument();
    expect(within(myRanks).getByText('1 / 3')).toBeInTheDocument();
    // 상태 문구는 캡션 한 줄 — 봇마다 반복하지 않는다.
    expect(within(myRanks).getByText('등록한 봇은 대회 시작과 함께 실행돼요.')).toBeInTheDocument();
    expect(within(myRanks).queryByText(/^#\d/)).not.toBeInTheDocument();

    expect(screen.queryByLabelText('ETF Sprint 봇 순위')).not.toBeInTheDocument();
    const notice = screen.getByRole('region', { name: 'ETF Sprint 대회 안내' });
    expect(notice).toHaveTextContent('대회 시작 전이에요');
    expect(notice).toHaveTextContent('일제히 실행돼요');
    /* 조건 토글은 헤더 안에 붙어 있고 기본은 접힘. 펼치면 대회별 종목 범위가
       제외 목록 칩까지 보인다. */
    const factsToggle = screen.getByRole('button', { name: /대회 조건/ });
    expect(factsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(factsToggle.closest('.competition-detail-heading')).not.toBeNull();
    await user.click(factsToggle);
    expect(screen.getByText('$10,000')).toBeInTheDocument();
    expect(screen.getByText('미국 상장 ETF · 2종목 제외')).toBeInTheDocument();
    expect(screen.getByText('제외 종목')).toBeInTheDocument();
    expect(screen.getByText('TQQQ')).toBeInTheDocument();
  });

  test('creates competition bots through the launchable-strategy entry flow', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('listitem', { name: '공식 대회 ETF Sprint 열기' }));
    await user.click(screen.getByRole('button', { name: '대회 참가' }));

    const strategyDialog = screen.getByRole('dialog', { name: 'ETF Sprint 참가 전략 선택' });
    expect(within(strategyDialog).getByText('출시 가능')).toBeInTheDocument();
    expect(within(strategyDialog).getByText(/전략만 표시됩니다/)).toBeInTheDocument();
    expect(within(strategyDialog).queryByText('내 전략')).not.toBeInTheDocument();
    const strategySearch = within(strategyDialog).getByRole('searchbox', { name: '참가 전략 검색' });
    expect(strategySearch).toBeInTheDocument();
    expect(within(strategyDialog).getByText('Opening Range Flow')).toBeInTheDocument();
    expect(within(strategyDialog).queryByText('Pair Spread Monitor')).not.toBeInTheDocument();
    expect(within(strategyDialog).queryByText('Volume Regime Draft')).not.toBeInTheDocument();
    expect(within(strategyDialog).getByText('선택 0 / 2')).toBeInTheDocument();
    expect(within(strategyDialog).queryByText('0개 선택')).not.toBeInTheDocument();
    expect(within(strategyDialog).getByRole('button', { name: '확인' })).toBeDisabled();

    await user.type(strategySearch, 'Opening');
    expect(within(strategyDialog).getByRole('status')).toHaveTextContent('전략을 검색하는 중입니다.');
    await waitFor(() => expect(within(strategyDialog).queryByRole('status')).not.toBeInTheDocument());
    expect(within(strategyDialog).getByText('Opening Range Flow')).toBeInTheDocument();
    await user.click(within(strategyDialog).getByRole('button', { name: '참가 전략 검색 초기화' }));

    await user.click(within(strategyDialog).getByRole('checkbox', { name: 'Opening Range Flow 선택' }));
    expect(within(strategyDialog).getByText('선택 1 / 2')).toBeInTheDocument();
    await user.click(within(strategyDialog).getByRole('button', { name: '확인' }));

    const confirmationDialog = screen.getByRole('dialog', { name: 'ETF Sprint 참가 확인' });
    expect(within(confirmationDialog).getByText('Opening Range Flow')).toBeInTheDocument();
    expect(within(confirmationDialog).queryByText(/선택한 전략으로 대회 전용 봇이 생성/)).not.toBeInTheDocument();
    await user.click(within(confirmationDialog).getByRole('button', { name: '참가 확정' }));

    expect(screen.queryByRole('dialog', { name: 'ETF Sprint 참가 확인' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ETF Sprint 상세 페이지' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Opening Range Flow Bot이 생성되어 대회에 참가했습니다.');
    const myRanks = screen.getByLabelText('내 참가 봇 순위');
    expect(within(myRanks).getByText('2 / 3')).toBeInTheDocument();
    expect(within(myRanks).getByText('Opening Range Flow Bot')).toBeInTheDocument();
    // 모집 중이므로 새 봇도 순위 없이 시작 대기 목록에 앉는다(캡션은 한 줄).
    expect(within(myRanks).getByText('등록한 봇은 대회 시작과 함께 실행돼요.')).toBeInTheDocument();
    expect(within(myRanks).getByText('ETF Runner')).toBeInTheDocument();
    expect(screen.queryByLabelText('ETF Sprint 봇 순위')).not.toBeInTheDocument();
  });

  test('shows the backtest recruiting notice instead of a fake interim ranking', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('listitem', { name: '공식 대회 Backtesting Challenge 열기' }));

    const myRanks = screen.getByLabelText('내 참가 봇 순위');
    expect(myRanks).toHaveTextContent('참가 중인 봇이 없습니다.');
    expect(within(myRanks).getByText('0 / 3')).toBeInTheDocument();
    /* 백테스트는 마감 후 일괄 채점이라 진행 중 순위 자체가 없다 — 가짜
       순위표 대신 채점 시점을 설명한다. */
    expect(screen.queryByLabelText('Backtesting Challenge 봇 순위')).not.toBeInTheDocument();
    const notice = screen.getByRole('region', { name: 'Backtesting Challenge 대회 안내' });
    expect(notice).toHaveTextContent('같은 과거 구간을 일괄 실행');
    expect(notice).toHaveTextContent('결과 계산이 끝난 뒤 공개');
  });

  test('keeps all three of my official entries highlighted and blocks entry after the official competition starts', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    /* 공식 핀은 보기와 무관하게 항상 게시판 최상단에 있다. */
    await user.click(screen.getByRole('listitem', { name: '공식 대회 I2S Summer League 열기' }));

    expect(screen.getByText('· 대회 진행 중 D-65')).not.toHaveClass('is-urgent');
    // 내 봇 3개는 순위표 강조 행으로 보이고, 카운트는 리더보드 머리에 있다.
    expect(screen.queryByLabelText('내 참가 봇 순위')).not.toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    const leaderboard = screen.getByLabelText('I2S Summer League 봇 순위');
    expect(screen.getByRole('button', { name: '진행중인 대회입니다.' })).toBeDisabled();
    expect(leaderboard.querySelectorAll('.is-mine')).toHaveLength(3);

    /*
      접기 규칙(#54, 2026-07-30): 18봇 중 상위 5 + 내 봇(1·5·9위) 각 ±1 +
      최하위 1을 남기고 사이를 접는다. 여기서는 1~10위와 18위가 남고 11~17위
      7개가 접힘 줄 하나로 접혀 행 11개 + 접힘 1개가 된다. 200봇이어도 화면
      크기는 같다.
    */
    const rowsOf = () => leaderboard.querySelectorAll(':scope > div:not(.competition-ranking-gap)').length;
    expect(rowsOf()).toBe(11);
    expect(within(leaderboard).getByText('#10')).toBeInTheDocument();
    expect(within(leaderboard).getByText('#18')).toBeInTheDocument();
    expect(within(leaderboard).queryByText('#11')).not.toBeInTheDocument();
    // 최하위를 남기는 이유: 전체가 몇 위까지 있는지가 내 위치의 의미를 정한다.
    const gapButton = within(leaderboard).getByRole('button', { name: '11위부터 17위까지 7개 펼치기' });
    expect(gapButton).toHaveTextContent('7개 더 보기');
    expect(screen.getByText('전체 18개 중 11개 표시 · 7개 접힘')).toBeInTheDocument();

    const user2 = userEvent.setup();
    // 접힘 줄은 그 구간만 펼친다 — 전체를 열지 않는다.
    await user2.click(gapButton);
    expect(rowsOf()).toBe(18);
    expect(screen.getByText('전체 18개 모두 표시')).toBeInTheDocument();
    await user2.click(screen.getByRole('button', { name: '접어서 보기' }));
    expect(rowsOf()).toBe(11);

    /* 봇 모음: 내 봇만 모아 본다 — 흩어져 있어도 한 화면에서 비교된다. */
    await user2.click(screen.getByRole('button', { name: '내 봇만' }));
    expect(rowsOf()).toBe(3);
    expect(leaderboard.querySelectorAll('.is-mine')).toHaveLength(3);
    expect(screen.getByText('내 봇 3개 · 전체 18개 중')).toBeInTheDocument();

    /* 내 봇들끼리의 격차 — 대회 중 형제 봇이 수백 등 벌어지는 걸 보여준다. */
    const spread = document.querySelector('.competition-mine-spread');
    expect(spread).not.toBeNull();
    expect(spread).toHaveTextContent('내 봇 격차');
    expect(spread).toHaveTextContent('↓4');
    expect(spread).toHaveTextContent('최고 #1 · 최저 #9 · 8계단');
  });

  test('opens my bot in bot operations from the leaderboard', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    render(<RoomsView openBot={(name) => opened.push(name)} />);

    await openMomentumLab(user);
    // 운영 화면에 실제로 있는 내 봇만 링크가 된다.
    await user.click(screen.getByRole('button', { name: 'Room Beta 봇 운영 화면 열기' }));
    expect(opened).toEqual(['Room Beta']);
  });
});
