import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { BasicEditor } from './views/StrategyViews';
import { LanguageProvider } from './lib/i18n';
import {
  PREVIEW_WINDOW,
  bollinger,
  evaluateStrategyPreview,
  identifyIndicator,
  parseSignalRule,
  rsi,
  splitPartitionSymbols,
} from './lib/strategyPreview';
import type { PreviewBlock, PreviewFlow } from './lib/strategyPreview';

const BUY_BLOCKS: PreviewBlock[] = [
  { label: '1m BAR', tone: 'time' },
  { label: 'RSI', op: '<', value: '30', tone: 'indicator' },
  { label: 'BUDGET', value: '25%', tone: 'risk' },
];
const SELL_BLOCKS: PreviewBlock[] = [
  { label: 'POSITION', value: 'OPEN', tone: 'condition' },
  { label: 'RSI', op: '>', value: '70', tone: 'indicator' },
];

/* 컨테이너 하나가 플로우 하나인 가장 단순한 파티션. */
const flowsOf = (buy: PreviewBlock[], sell: PreviewBlock[]): PreviewFlow[] => [
  { id: 'buy-1', label: '매수', side: 'buy', blocks: buy },
  { id: 'sell-1', label: '매도', side: 'sell', blocks: sell },
];

describe('strategy preview engine', () => {
  test('splits a partition symbol list into chart-selectable symbols', () => {
    expect(splitPartitionSymbols('AAPL · MSFT · SPY')).toEqual(['AAPL', 'MSFT', 'SPY']);
    // The placeholder option is not a tradable symbol.
    expect(splitPartitionSymbols('종목 선택')).toEqual([]);
  });

  test('computes RSI on the standard Wilder scale', () => {
    const rising = Array.from({ length: 40 }, (_, index) => 100 + index);
    const values = rsi(rising, 14);
    // The first 14 bars cannot have a value, and a pure uptrend pins RSI at 100.
    expect(values.slice(0, 14).every((value) => value === null)).toBe(true);
    expect(values[39]).toBeCloseTo(100, 5);
    expect(values.every((value) => value === null || (value >= 0 && value <= 100))).toBe(true);
  });

  test('keeps Bollinger bands ordered around the moving average', () => {
    const closes = Array.from({ length: 60 }, (_, index) => 100 + Math.sin(index / 3) * 4);
    const bands = bollinger(closes, 20);
    const last = closes.length - 1;
    expect(bands.lower[last]!).toBeLessThan(bands.middle[last]!);
    expect(bands.middle[last]!).toBeLessThan(bands.upper[last]!);
  });

  test('reads the indicator kind and threshold out of editor blocks', () => {
    expect(identifyIndicator('RSI')).toBe('RSI');
    expect(identifyIndicator('Volume SMA')).toBe('VOLUME_SMA');
    expect(identifyIndicator('Supertrend')).toBeNull();

    const { rule } = parseSignalRule(BUY_BLOCKS);
    expect(rule).toMatchObject({ kind: 'RSI', op: '<', threshold: 30, period: 14 });

    const crossing = parseSignalRule([{ label: 'SMA', op: '↑', value: '20 / 60', tone: 'indicator' }]);
    expect(crossing.rule).toMatchObject({ kind: 'SMA', fastPeriod: 20, slowPeriod: 60 });
  });

  test('reports indicators it cannot evaluate instead of inventing signals', () => {
    const { rule, unsupported } = parseSignalRule([{ label: 'Supertrend', op: '=', value: 'UP', tone: 'indicator' }]);
    expect(rule).toBeNull();
    expect(unsupported).toEqual(['Supertrend']);
  });

  test('turns the default RSI partition into alternating buy and sell signals', () => {
    const preview = evaluateStrategyPreview({ symbol: 'AAPL', flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS) });

    // The window is fixed at one month, so callers pass no period at all.
    expect(preview.candles).toHaveLength(PREVIEW_WINDOW.count);
    expect(preview.summary.buyCount).toBeGreaterThan(0);
    expect(preview.summary.sellCount).toBeGreaterThan(0);
    // A position must be opened before it can be closed, so sides alternate.
    expect(preview.markers[0].side).toBe('buy');
    preview.markers.forEach((marker, index) => {
      if (index === 0) return;
      expect(marker.side).not.toBe(preview.markers[index - 1].side);
    });
    expect(preview.summary.tradeCount).toBe(preview.markers.filter((marker) => marker.side === 'sell').length);
    expect(preview.summary.winRate).not.toBeNull();
  });

  test('is deterministic for the same symbol and timeframe', () => {
    const first = evaluateStrategyPreview({ symbol: 'MSFT', timeframeSeconds: 3600, flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS) });
    const second = evaluateStrategyPreview({ symbol: 'MSFT', timeframeSeconds: 3600, flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS) });
    expect(second.markers).toEqual(first.markers);

    const other = evaluateStrategyPreview({ symbol: 'SPY', timeframeSeconds: 3600, flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS) });
    expect(other.candles[0].close).not.toBe(first.candles[0].close);
  });

  test('changing a threshold moves the signals, and an impossible one clears them', () => {
    /*
      완료 매매 수는 기준값이 느슨해질수록 늘어나는 값이 아니다. 포지션을 들고
      있는 동안에는 매수가 막히므로, 일찍 산 만큼 다음 매수 기회를 놓칠 수 있어
      양쪽이 서로 영향을 준다. 그래서 단조성 대신 "바뀌면 결과가 바뀐다"와
      "불가능한 조건이면 0"이라는 실제 성질만 검증한다.
    */
    const band = (buyValue: string, sellValue: string) => evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 86400,
      flows: flowsOf([{ label: 'RSI', op: '<', value: buyValue, tone: 'indicator' }], [{ label: 'RSI', op: '>', value: sellValue, tone: 'indicator' }]),
    });

    const wide = band('30', '70');
    const narrow = band('45', '55');
    expect(wide.summary.tradeCount).toBeGreaterThan(0);
    expect(narrow.summary.tradeCount).toBeGreaterThan(0);
    expect(narrow.markers).not.toEqual(wide.markers);

    const impossible = band('1', '99');
    expect(impossible.summary.buyCount).toBe(0);
    expect(impossible.summary.tradeCount).toBe(0);
  });

  test('every sample symbol produces signals the user can actually look at', () => {
    ['AAPL', 'MSFT', 'SPY', 'NVDA'].forEach((symbol) => {
      [60, 3600, 86400].forEach((timeframeSeconds) => {
        const preview = evaluateStrategyPreview({ symbol, timeframeSeconds, flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS) });
        expect(preview.summary.buyCount).toBeGreaterThan(0);
        expect(preview.summary.sellCount).toBeGreaterThan(0);
      });
    });
  });

  test('draws an overlay for every indicator in the partition, even unused ones', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      flows: flowsOf([...BUY_BLOCKS, { label: 'Bollinger', op: '<', value: 'LOWER', tone: 'indicator' }], SELL_BLOCKS),
    });

    const names = preview.overlays.map((overlay) => overlay.name);
    expect(names.some((name) => name.startsWith('RSI'))).toBe(true);
    expect(names.some((name) => name.startsWith('Bollinger'))).toBe(true);
    // RSI has its own 0–100 pane; bands share the price pane.
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('RSI'))?.pane).toBe('lower');
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('Bollinger'))?.pane).toBe('price');
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('Bollinger'))?.lines).toHaveLength(3);
  });

  test('attributes every signal to the flow that produced it', () => {
    /* 매수 플로우가 둘일 때, 느슨한 쪽이 먼저 걸리면 그 플로우 이름이 신호에
       남아야 한다. 어느 컨테이너가 주문을 만들었는지가 판단의 핵심이다. */
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      flows: [
        { id: 'buy-tight', label: '매수 1', side: 'buy', blocks: [{ label: 'RSI', op: '<', value: '5', tone: 'indicator' }] },
        { id: 'buy-loose', label: '매수 2', side: 'buy', blocks: [{ label: 'RSI', op: '<', value: '35', tone: 'indicator' }] },
        { id: 'sell-1', label: '매도', side: 'sell', blocks: SELL_BLOCKS },
      ],
    });

    const buyMarkers = preview.markers.filter((marker) => marker.side === 'buy');
    expect(buyMarkers.length).toBeGreaterThan(0);
    // The unreachable flow never fires, so every buy belongs to the loose one.
    expect(buyMarkers.every((marker) => marker.flowId === 'buy-loose')).toBe(true);
    expect(buyMarkers[0].flowLabel).toBe('매수 2');

    const counts = Object.fromEntries(preview.flows.map((flow) => [flow.id, flow.count]));
    expect(counts['buy-tight']).toBe(0);
    expect(counts['buy-loose']).toBe(buyMarkers.length);
    expect(counts['sell-1']).toBe(preview.markers.length - buyMarkers.length);
  });

  test('prices fills on the next bar, matching the 다음 봉 체결 order block', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS),
    });
    const marker = preview.markers[0];
    expect(marker.price).toBe(preview.candles[marker.index + 1].open);
  });
});

describe('Basic editor partition preview chart', () => {
  test('opens only from the partition preview button, not from selecting the partition', () => {
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.queryByTestId('strategy-preview-panel')).not.toBeInTheDocument();

    /*
      Selecting a partition must stay a plain selection: the preview is an
      explicit choice, the same way the natural-language explanation is.
      (fireEvent, not a pointer sequence: jsdom reports zero rects, so a
      synthetic pointerup at 0,0 lands in the trash zone and deletes the
      partition.)
    */
    fireEvent.click(screen.getByTestId('strategy-section-1'));
    expect(screen.queryByTestId('strategy-preview-panel')).not.toBeInTheDocument();

    const blockLibrary = screen.getByTestId('basic-block-library');
    blockLibrary.getBoundingClientRect = () => ({
      x: 900,
      y: 100,
      left: 900,
      top: 100,
      right: 1180,
      bottom: 800,
      width: 280,
      height: 700,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    const panel = screen.getByTestId('strategy-preview-panel');
    /* A floating window, so it must live outside the zoom/pan canvas: a
       transformed ancestor would become the containing block for the fixed
       card and drag it around with the canvas. */
    expect(screen.getByTestId('strategy-section-1')).not.toContainElement(panel);
    expect(screen.getByTestId('section-world')).not.toContainElement(panel);
    expect(Number.parseInt(panel.style.top, 10)).toBeGreaterThan(window.innerHeight / 2);
    expect(Number.parseInt(panel.style.left, 10)).toBe(568);
    // The chart canvas is mounted; the chart library itself is skipped in jsdom.
    expect(within(panel).getByTestId('strategy-preview-canvas')).toBeInTheDocument();
  });

  test('can be dragged anywhere on screen and moved with the keyboard', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    const panel = screen.getByTestId('strategy-preview-panel');
    const grip = screen.getByTestId('strategy-preview-grip');
    const startLeft = panel.style.left;
    const startTop = panel.style.top;

    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 900, clientY: 200 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 640, clientY: 420 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 640, clientY: 420 });

    expect(panel.style.left).not.toBe(startLeft);
    expect(panel.style.top).not.toBe(startTop);

    const draggedLeft = panel.style.left;
    grip.focus();
    await user.keyboard('{ArrowLeft}');
    expect(panel.style.left).not.toBe(draggedLeft);
  });

  test('draws one inline price line with buy and sell arrows, no chart library', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    /* 인라인 SVG 한 장이라 캔버스 없이도 선과 신호를 그대로 확인할 수 있다.
       매수·매도를 함께 보여주는 것이 이 창의 존재 이유다. */
    const frame = screen.getByTestId('strategy-preview-canvas');
    const line = frame.querySelector('.strategy-preview-line');
    expect(frame.querySelector('canvas')).toBeNull();
    expect(line?.getAttribute('points')?.split(' ')).toHaveLength(PREVIEW_WINDOW.count);
    expect(screen.getAllByTestId('preview-marker-buy').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('preview-marker-sell').length).toBeGreaterThan(0);
    // No indicator panes: overlays belong to the backtest screen.
    expect(frame.querySelectorAll('polyline')).toHaveLength(1);
  });

  test('draws pentagonal buy and sell banners toward their fill points', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    /*
      주식 차트의 관례: 매수는 체결 지점 아래에서 위를 향하고, 매도는 위에서
      아래를 향한다. SVG는 y가 아래로 커지므로 "위를 향한다"는 꼭짓점 y가 밑변
      y보다 작다는 뜻이다.
    */
    const corners = (marker: Element) => marker.getAttribute('points')!
      .split(' ')
      .map((point) => point.split(',').map(Number))
      .map(([x, y]) => ({ x, y }));

    /* 같은 x에 있는 종가 선의 y. 화살표는 이 선을 넘어오면 안 된다. */
    const lineAt = (x: number) => {
      const points = screen.getByTestId('strategy-preview-canvas')
        .querySelector('.strategy-preview-line')!
        .getAttribute('points')!
        .split(' ')
        .map((point) => point.split(',').map(Number));
      return points.reduce((best, point) => Math.abs(point[0] - x) < Math.abs(best[0] - x) ? point : best, points[0])[1];
    };

    screen.getAllByTestId('preview-marker-buy').forEach((marker) => {
      const [apex, leftShoulder, leftBase, rightBase, rightShoulder] = corners(marker);
      expect(corners(marker)).toHaveLength(5);
      expect(apex.y).toBeLessThan(leftShoulder.y);
      expect(leftBase.y).toBe(rightBase.y);
      expect(leftShoulder.y).toBe(rightShoulder.y);
      expect(apex.y).toBeGreaterThan(lineAt(apex.x));
      expect(rightBase.x - leftBase.x).toBeGreaterThanOrEqual(8);
      expect(leftBase.y - apex.y).toBeGreaterThanOrEqual(8);
    });
    screen.getAllByTestId('preview-marker-sell').forEach((marker) => {
      const [apex, leftShoulder, leftBase, rightBase, rightShoulder] = corners(marker);
      expect(corners(marker)).toHaveLength(5);
      expect(apex.y).toBeGreaterThan(leftShoulder.y);
      expect(leftBase.y).toBe(rightBase.y);
      expect(leftShoulder.y).toBe(rightShoulder.y);
      expect(apex.y).toBeLessThan(lineAt(apex.x));
    });

    // 화살표가 커져도 차트 영역을 벗어나 잘리지 않는다.
    const viewHeight = Number(screen.getByTestId('strategy-preview-canvas').querySelector('svg')!.getAttribute('viewBox')!.split(' ')[3]);
    [...screen.getAllByTestId('preview-marker-buy'), ...screen.getAllByTestId('preview-marker-sell')].forEach((marker) => {
      corners(marker).forEach(({ y }) => {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(viewHeight);
      });
    });
  });

  test('offers only the symbols the partition trades', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    const symbols = screen.getByRole('group', { name: '미리보기 종목 선택' });
    expect(within(symbols).getAllByRole('button').map((button) => button.textContent)).toEqual(['AAPL', 'MSFT', 'SPY']);
    expect(within(symbols).getByRole('button', { name: 'AAPL 미리보기' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(symbols).getByRole('button', { name: 'MSFT 미리보기' }));
    expect(within(symbols).getByRole('button', { name: 'MSFT 미리보기' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(symbols).getByRole('button', { name: 'AAPL 미리보기' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('states the fixed one-month window and offers no period control', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    // 기간은 최근 1개월 고정이다. 고를 것이 없으므로 컨트롤도 두지 않는다.
    expect(screen.getByText(PREVIEW_WINDOW.label)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '미리보기 기간 선택' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '미리보기 시간 단위' })).not.toBeInTheDocument();
  });

  test('names the flow behind each signal and emphasises one on demand', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    await user.type(within(buyRsi).getByLabelText('RSI 반등 값'), '30');
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '상승' }));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    // One buy and one sell container: the legend lists both with their counts.
    const flows = screen.getByRole('group', { name: '신호를 만든 플로우' });
    expect(within(flows).getAllByRole('button')).toHaveLength(2);
    const buyFlow = screen.getByTestId('preview-flow-primary-buy');
    expect(buyFlow).toHaveAttribute('aria-pressed', 'false');

    // Emphasising a flow explains that flow's rule without hiding the round trip.
    await user.click(buyFlow);
    expect(buyFlow).toHaveAttribute('aria-pressed', 'true');
    // 같은 문장이 신호 툴팁에도 붙으므로 요약 줄로 범위를 좁혀 확인한다.
    expect(screen.getByTestId('preview-note')).toHaveTextContent(/RSI\(14\) 30 상향 돌파/);
    expect(screen.getByTestId('preview-flow-primary-sell')).toBeInTheDocument();

    await user.click(buyFlow);
    expect(buyFlow).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('preview-buy-count')).toBeInTheDocument();
  });

  test('adds a flow chip when the partition gains another container', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    expect(within(screen.getByRole('group', { name: '신호를 만든 플로우' })).getAllByRole('button')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 매수 컨테이너 추가' }));

    const flows = within(screen.getByRole('group', { name: '신호를 만든 플로우' })).getAllByRole('button');
    expect(flows).toHaveLength(3);
    // Two buy containers, so each one is numbered instead of just "매수".
    expect(flows.map((flow) => flow.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('매수 1'),
      expect.stringContaining('매수 2'),
    ]));
  });

  test('counts the signals the current blocks produce and recalculates when a value changes', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    expect(screen.getByTestId('preview-buy-count')).not.toHaveTextContent('매수 0');

    /* A threshold this tight can never be crossed, so the count has to fall to
       zero — the chart is reading the live block value, not a snapshot. */
    const rsiBlock = screen.getByTestId('buy-rsi-block');
    const valueInput = within(rsiBlock).getByLabelText('RSI 반등 값');
    await user.clear(valueInput);
    await user.type(valueInput, '2');

    expect(screen.getByTestId('preview-buy-count')).toHaveTextContent('매수 0');
    expect(screen.getByTestId('preview-sell-count')).toHaveTextContent('매도 0');
    // 완료된 매매가 없으면 수익률은 판단할 수 없으므로 숫자를 꾸며내지 않는다.
    expect(screen.getByTestId('preview-return')).toHaveTextContent('—');
  });

  test('translates the whole card into the English locale', async () => {
    window.localStorage.setItem('i2s-language', 'en');
    const user = userEvent.setup();
    render(<LanguageProvider><BasicEditor goBack={() => {}} /></LanguageProvider>);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    await user.type(within(buyRsi).getByLabelText('RSI 반등 값'), '30');
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '상승' }));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 Strategy preview' }));
    expect(screen.getByRole('group', { name: 'Flows behind the signals' })).toBeInTheDocument();
    expect(screen.getByTestId('preview-buy-count')).toHaveTextContent('Buy');

    /* 조건 문장은 엔진이 만든 문자열이라 prop 번역이 닿지 않는다. 여기서 한글이
       남으면 카드 안에서 직접 번역하는 경로가 끊긴 것이다. */
    await user.click(screen.getByTestId('preview-flow-primary-buy'));
    expect(screen.getByTestId('preview-note')).toHaveTextContent('RSI(14) 30 crosses up');
    window.localStorage.clear();
  });

  test('closes the preview without leaving the editor', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    await user.click(screen.getByRole('button', { name: '미리보기 닫기' }));

    expect(screen.queryByTestId('strategy-preview-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-editor-workspace')).toBeInTheDocument();
  });
});
