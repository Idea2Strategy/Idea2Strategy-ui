import { render, screen } from '@testing-library/react';
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

describe('Basic editor partition preview state', () => {
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
