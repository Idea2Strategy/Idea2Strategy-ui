import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BasicEditor } from './views/StrategyViews';
import { StrategyPreviewChart } from './components/StrategyPreviewChart';
import { LanguageProvider } from './lib/i18n';
import {
  PREVIEW_MAX_CANDLES,
  PREVIEW_WINDOW,
  bollinger,
  evaluateStrategyPreview,
  generatePreviewCandles,
  identifyIndicator,
  parseSignalRule,
  parseSignalRules,
  rsi,
  splitPartitionSymbols,
} from './lib/strategyPreview';
import type { PreviewBlock, PreviewFlow } from './lib/strategyPreview';

const BUY_BLOCKS: PreviewBlock[] = [
  { label: '30m BAR', tone: 'time' },
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

const candlesFrom = (closes: number[], volumes?: number[]) => closes.map((close, index) => ({
  time: Date.UTC(2026, 6, 1 + index, 20, 0, 0) / 1000,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: volumes?.[index] ?? 10_000,
}));

describe('strategy preview engine', () => {
  test('splits a partition symbol list into chart-selectable symbols', () => {
    expect(splitPartitionSymbols('AAPL · MSFT · SPY')).toEqual(['AAPL', 'MSFT', 'SPY']);
    // The placeholder option is not a tradable symbol.
    expect(splitPartitionSymbols('종목 선택')).toEqual([]);
  });

  test('computes the official bounded-window RSI used by backtests', () => {
    const rising = Array.from({ length: 40 }, (_, index) => 100 + index);
    const values = rsi(rising, 14);
    // The first 14 bars cannot have a value, and a pure uptrend pins RSI at 100.
    expect(values.slice(0, 14).every((value) => value === null)).toBe(true);
    expect(values[39]).toBeCloseTo(100, 5);
    expect(values.every((value) => value === null || (value >= 0 && value <= 100))).toBe(true);

    const officialFixture = [100, 101, 100, 99, 98, 97, 96, 95, 94, 94, 94, 94, 94, 94, 94];
    expect(rsi(officialFixture, 14).at(-1)).toBeCloseTo(12.5, 8);
    expect(rsi(Array.from({ length: 15 }, () => 100), 14).at(-1)).toBe(50);
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

  test('uses the editor 상승 direction as an upward crossing', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      flows: [{
        id: 'buy-up', label: '상승 매수', side: 'buy',
        blocks: [{ label: 'RSI 반등', op: '상승', value: '30', tone: 'condition' }],
      }],
    });

    expect(preview.flows[0].description).toBe('RSI(14) 30 상향 돌파');
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

  test('bounds the fast local preview to the latest 1000 server bars', () => {
    const supplied = candlesFrom(Array.from({ length: 1050 }, (_, index) => 100 + index));

    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: supplied,
      flows: flowsOf(BUY_BLOCKS, SELL_BLOCKS),
    });

    expect(PREVIEW_MAX_CANDLES).toBe(1000);
    expect(preview.candles).toHaveLength(1000);
    expect(preview.candles[0]).toBe(supplied[50]);
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

describe('Basic editor partition preview state', () => {
  test('reports symbol changes to the editor so it can fetch that instrument', async () => {
    const onSymbolChange = vi.fn();
    const user = userEvent.setup();
    render(<StrategyPreviewChart
      partitionLabel="PARTITION 01"
      symbols={['AAPL', 'MSFT']}
      selectedSymbol="AAPL"
      onSymbolChange={onSymbolChange}
      flows={flowsOf(BUY_BLOCKS, SELL_BLOCKS)}
      candles={generatePreviewCandles('AAPL', 1800, 400)}
      onClose={() => {}}
    />);

    await user.click(screen.getByRole('button', { name: 'MSFT 미리보기' }));

    expect(onSymbolChange).toHaveBeenCalledWith('MSFT');
  });

  test('renders fast supported buy and sell markers with an estimate disclaimer', () => {
    render(<StrategyPreviewChart
      partitionLabel="PARTITION 01"
      symbols={['AAPL']}
      flows={flowsOf(BUY_BLOCKS, SELL_BLOCKS)}
      candles={generatePreviewCandles('AAPL', 1800, 400)}
      onClose={() => {}}
    />);

    expect(screen.getAllByTestId('preview-marker-buy').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('preview-marker-sell').length).toBeGreaterThan(0);
    expect(screen.getByText('빠르게 계산할 수 있는 조건만 반영한 예상 결과이며 실제 실행 결과와 다를 수 있습니다.'))
      .toBeInTheDocument();
  });

  test('labels the signal summary with the selected server-backed preview window', () => {
    const { rerender } = render(<StrategyPreviewChart
      partitionLabel="PARTITION 01"
      symbols={['AAPL']}
      flows={flowsOf(BUY_BLOCKS, SELL_BLOCKS)}
      candles={generatePreviewCandles('AAPL', 1800, 400)}
      previewWindow="1m"
      onClose={() => {}}
    />);

    expect(screen.getByTestId('preview-note')).toHaveTextContent('최근 1개월');

    rerender(<StrategyPreviewChart
      partitionLabel="PARTITION 01"
      symbols={['AAPL']}
      flows={flowsOf(BUY_BLOCKS, SELL_BLOCKS)}
      candles={generatePreviewCandles('AAPL', 1800, 400)}
      previewWindow="3m"
      onClose={() => {}}
    />);

    expect(screen.getByTestId('preview-note')).toHaveTextContent('최근 3개월');
  });

  test('always explains the buy and sell conditions and warns when bars are insufficient', () => {
    render(<StrategyPreviewChart
      partitionLabel="PARTITION 01"
      symbols={['AAPL']}
      flows={flowsOf(BUY_BLOCKS, SELL_BLOCKS)}
      candles={generatePreviewCandles('AAPL', 1800, 10)}
      onClose={() => {}}
    />);

    const conditions = screen.getByRole('list', { name: '매수·매도 조건' });
    const [buy, sell] = within(conditions).getAllByRole('listitem');
    expect(buy).toHaveTextContent('매수');
    expect(buy).toHaveTextContent('RSI(14) 30 하향 돌파');
    expect(sell).toHaveTextContent('매도');
    expect(sell).toHaveTextContent('RSI(14) 70 상향 돌파');
    expect(screen.getByRole('status')).toHaveTextContent('신호를 계산하기에 최근 데이터가 부족합니다.');
  });

  test('recognizes every published Basic condition instead of silently dropping blocks', () => {
    const blocks: PreviewBlock[] = [
      { label: '가격 비교', op: '>', value: '전일 종가', tone: 'data' },
      { label: '가격 변화율', op: '상승', base: '전일 종가', value: '1', tone: 'data' },
      { label: '거래량', op: '>', value: '최근 20봉 평균 거래량 2배', tone: 'data' },
      { label: '연속 상승·하락', op: '↑', value: '3봉', tone: 'indicator' },
      { label: '평균선 교차', op: '↑', value: '5봉 · 20봉', tone: 'indicator' },
      { label: 'RSI 반등', op: '↑', value: '30', tone: 'condition' },
      { label: 'MACD 전환', op: '↑', value: '12 · 26 · 9', tone: 'condition' },
      { label: '가격 띠 반전', op: '↑', value: '20봉 · 2σ', tone: 'condition' },
      { label: '현재 수익률', op: '수익', value: '1', tone: 'risk' },
      { label: '보유 기간', op: '≥', value: '5봉', tone: 'risk' },
      { label: '최고 수익률', op: '≥', value: '2', tone: 'risk' },
      { label: '고점 대비 하락', op: '≥', value: '1', tone: 'risk' },
      { label: '정기 매수', value: '매월 첫 거래일', tone: 'time' },
    ];
    const parsed = parseSignalRules(blocks);
    expect(parsed.unsupported).toEqual([]);
    expect(parsed.rules.map((rule) => rule.kind)).toEqual([
      'PRICE', 'PRICE_CHANGE', 'VOLUME_COMPARE', 'STREAK', 'SMA', 'RSI', 'MACD',
      'BOLLINGER', 'POSITION_RETURN', 'HOLDING_PERIOD', 'PEAK_RETURN',
      'DRAWDOWN_FROM_PEAK', 'SCHEDULE',
    ]);
  });

  test('requires every condition in a container instead of using only the first one', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      flows: [{
        id: 'buy-and', label: 'AND 매수', side: 'buy',
        blocks: [
          { label: 'RSI 반등', op: '↑', value: '30', tone: 'condition' },
          { label: '가격 변화율', op: '상승', base: '전일 종가', value: '1000', tone: 'data' },
        ],
      }],
    });
    expect(preview.markers).toEqual([]);
    expect(preview.flows[0].description).toContain(' · ');
  });

  test('fails a whole flow closed when any condition is unsupported', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      flows: [{
        id: 'buy-unsafe', label: '미지원 포함', side: 'buy',
        blocks: [
          { label: 'RSI 반등', op: '↑', value: '30', tone: 'condition' },
          { label: 'Supertrend', op: '↑', value: '10', tone: 'indicator' },
        ],
      }],
    });
    expect(preview.unsupported).toEqual(['Supertrend']);
    expect(preview.flows[0].evaluable).toBe(false);
    expect(preview.markers).toEqual([]);
  });

  test('evaluates price, volume, streak, return, holding, peak and drawdown conditions together', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: candlesFrom([100, 101, 102, 110, 120, 112, 111], [100, 200, 300, 400, 500, 600, 700]),
      flows: [
        {
          id: 'buy-state', label: '상태 매수', side: 'buy', maxExecutions: 1,
          blocks: [
            { label: '가격 변화율', op: '상승', base: '전일 종가', value: '0.5', tone: 'data' },
            { label: '거래량', op: '>', value: '이전 봉 거래량', tone: 'data' },
            { label: '연속 상승·하락', op: '↑', value: '2봉', tone: 'indicator' },
          ],
        },
        {
          id: 'sell-state', label: '상태 매도', side: 'sell', maxExecutions: 1,
          blocks: [
            { label: '현재 수익률', op: '수익', value: '1', tone: 'risk' },
            { label: '보유 기간', op: '≥', value: '2봉', tone: 'risk' },
            { label: '최고 수익률', op: '≥', value: '5', tone: 'risk' },
            { label: '고점 대비 하락', op: '≥', value: '3', tone: 'risk' },
          ],
        },
      ],
    });

    expect(preview.markers.map((marker) => marker.side)).toEqual(['buy', 'sell']);
    expect(preview.markers[0].price).toBe(110);
    expect(preview.markers[1].price).toBe(111);
    expect(preview.flows.every((flow) => flow.evaluable)).toBe(true);
  });

  test('applies a CLI-authored previous-volume multiplier instead of collapsing it to one', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: candlesFrom([100, 101, 102, 103], [100, 150, 400, 500]),
      flows: [{
        id: 'volume-multiplier', label: '거래량 배수 매수', side: 'buy', maxExecutions: 1,
        blocks: [{ label: '거래량', op: '>', value: '이전 봉 거래량 2배', tone: 'data' }],
      }],
    });

    expect(preview.markers).toHaveLength(1);
    expect(preview.markers[0].price).toBe(103);
  });

  test('evaluates not-equal price and volume comparisons with runtime semantics', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: candlesFrom([100, 100, 101, 102], [100, 100, 200, 300]),
      flows: [{
        id: 'neq-entry', label: '변화 감지 매수', side: 'buy', maxExecutions: 1,
        blocks: [
          { label: '가격 비교', op: '≠', value: '전일 종가', tone: 'data' },
          { label: '거래량', op: '≠', value: '이전 봉 거래량', tone: 'data' },
        ],
      }],
    });

    expect(preview.markers).toHaveLength(1);
    expect(preview.markers[0].price).toBe(102);
  });

  test('evaluates a not-equal peak-return exit with runtime semantics', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: candlesFrom([100, 100, 101, 102, 103, 104]),
      flows: [
        {
          id: 'neq-buy', label: '변화 감지 매수', side: 'buy', maxExecutions: 1,
          blocks: [{ label: '가격 비교', op: '≠', value: '전일 종가', tone: 'data' }],
        },
        {
          id: 'neq-sell', label: '고점 수익 변화 매도', side: 'sell', maxExecutions: 1,
          blocks: [{ label: '최고 수익률', op: '≠', value: '0%', tone: 'risk' }],
        },
      ],
    });

    expect(preview.markers.map((marker) => marker.side)).toEqual(['buy', 'sell']);
    expect(preview.markers[1].price).toBe(104);
  });

  test('does not invent a current-close fill when a signal occurs on the last bar', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      candles: candlesFrom([100, 101]),
      flows: [{
        id: 'last-bar', label: '마지막 봉', side: 'buy',
        blocks: [{ label: '가격 변화율', op: '상승', base: '전일 종가', value: '0.5', tone: 'data' }],
      }],
    });
    expect(preview.markers).toEqual([]);
  });

  test('does not invent a graph, signals, or fallback symbols', async () => {
    const user = userEvent.setup();
    render(<BasicEditor blank goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));

    const panel = screen.getByTestId('strategy-preview-unavailable');
    expect(panel).toHaveTextContent('종목 미선택');
    expect(panel).toHaveTextContent('실제 시장 데이터 기반 미리보기만 표시합니다.');
    expect(screen.queryByTestId('strategy-preview-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-marker-buy')).not.toBeInTheDocument();
  });

  test('translates the honest preview state into English', async () => {
    window.localStorage.setItem('i2s-language', 'en');
    const user = userEvent.setup();
    render(<LanguageProvider><BasicEditor blank goBack={() => {}} /></LanguageProvider>);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 Strategy preview' }));
    expect(screen.getByTestId('strategy-preview-unavailable')).toHaveTextContent('Only previews backed by real market data are shown.');
    window.localStorage.clear();
  });

  test('closes the preview without leaving the editor', async () => {
    const user = userEvent.setup();
    render(<BasicEditor blank goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    await user.click(screen.getByRole('button', { name: '미리보기 닫기' }));

    expect(screen.queryByTestId('strategy-preview-unavailable')).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-editor-workspace')).toBeInTheDocument();
  });
});
