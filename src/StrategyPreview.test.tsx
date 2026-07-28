import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { BasicEditor } from './views/StrategyViews';
import {
  bollinger,
  evaluateStrategyPreview,
  identifyIndicator,
  parseSignalRule,
  rsi,
  splitPartitionSymbols,
} from './lib/strategyPreview';
import type { PreviewBlock } from './lib/strategyPreview';

const BUY_BLOCKS: PreviewBlock[] = [
  { label: '1m BAR', tone: 'time' },
  { label: 'RSI', op: '<', value: '30', tone: 'indicator' },
  { label: 'BUDGET', value: '25%', tone: 'risk' },
];
const SELL_BLOCKS: PreviewBlock[] = [
  { label: 'POSITION', value: 'OPEN', tone: 'condition' },
  { label: 'RSI', op: '>', value: '70', tone: 'indicator' },
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
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      buyBlocks: BUY_BLOCKS,
      sellBlocks: SELL_BLOCKS,
    });

    expect(preview.candles).toHaveLength(180);
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
    const first = evaluateStrategyPreview({ symbol: 'MSFT', timeframeSeconds: 3600, buyBlocks: BUY_BLOCKS, sellBlocks: SELL_BLOCKS });
    const second = evaluateStrategyPreview({ symbol: 'MSFT', timeframeSeconds: 3600, buyBlocks: BUY_BLOCKS, sellBlocks: SELL_BLOCKS });
    expect(second.markers).toEqual(first.markers);

    const other = evaluateStrategyPreview({ symbol: 'SPY', timeframeSeconds: 3600, buyBlocks: BUY_BLOCKS, sellBlocks: SELL_BLOCKS });
    expect(other.candles[0].close).not.toBe(first.candles[0].close);
  });

  test('a looser threshold never produces fewer signals than a stricter one', () => {
    const counts = ['AAPL', 'MSFT', 'SPY', 'NVDA'].map((symbol) => {
      const strict = evaluateStrategyPreview({
        symbol,
        timeframeSeconds: 86400,
        buyBlocks: [{ label: 'RSI', op: '<', value: '30', tone: 'indicator' }],
        sellBlocks: [{ label: 'RSI', op: '>', value: '70', tone: 'indicator' }],
      });
      const loose = evaluateStrategyPreview({
        symbol,
        timeframeSeconds: 86400,
        buyBlocks: [{ label: 'RSI', op: '<', value: '45', tone: 'indicator' }],
        sellBlocks: [{ label: 'RSI', op: '>', value: '55', tone: 'indicator' }],
      });
      return { strict: strict.summary.tradeCount, loose: loose.summary.tradeCount };
    });

    counts.forEach(({ strict, loose }) => expect(loose).toBeGreaterThanOrEqual(strict));
    // Widening the band has to matter somewhere, or the preview is not reacting.
    expect(counts.some(({ strict, loose }) => loose > strict)).toBe(true);
  });

  test('every sample symbol produces signals the user can actually look at', () => {
    ['AAPL', 'MSFT', 'SPY', 'NVDA'].forEach((symbol) => {
      [60, 3600, 86400].forEach((timeframeSeconds) => {
        const preview = evaluateStrategyPreview({ symbol, timeframeSeconds, buyBlocks: BUY_BLOCKS, sellBlocks: SELL_BLOCKS });
        expect(preview.summary.buyCount).toBeGreaterThan(0);
        expect(preview.summary.sellCount).toBeGreaterThan(0);
      });
    });
  });

  test('draws an overlay for every indicator in the partition, even unused ones', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      buyBlocks: [...BUY_BLOCKS, { label: 'Bollinger', op: '<', value: 'LOWER', tone: 'indicator' }],
      sellBlocks: SELL_BLOCKS,
    });

    const names = preview.overlays.map((overlay) => overlay.name);
    expect(names.some((name) => name.startsWith('RSI'))).toBe(true);
    expect(names.some((name) => name.startsWith('Bollinger'))).toBe(true);
    // RSI has its own 0–100 pane; bands share the price pane.
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('RSI'))?.pane).toBe('lower');
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('Bollinger'))?.pane).toBe('price');
    expect(preview.overlays.find((overlay) => overlay.name.startsWith('Bollinger'))?.lines).toHaveLength(3);
  });

  test('prices fills on the next bar, matching the 다음 봉 체결 order block', () => {
    const preview = evaluateStrategyPreview({
      symbol: 'AAPL',
      timeframeSeconds: 3600,
      buyBlocks: BUY_BLOCKS,
      sellBlocks: SELL_BLOCKS,
    });
    const marker = preview.markers[0];
    expect(marker.price).toBe(preview.candles[marker.index + 1].open);
  });
});

describe('Basic editor partition preview chart', () => {
  test('opens the preview for the partition that was clicked', () => {
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.queryByTestId('strategy-preview-panel')).not.toBeInTheDocument();

    /*
      Plain click, not a full pointer sequence: every element reports a zero
      rect under jsdom, so a synthetic pointerup at (0, 0) lands inside the
      trash-zone bounds and deletes the partition instead. The pointer gesture
      itself is covered by the existing canvas tests.
    */
    fireEvent.click(screen.getByTestId('strategy-section-1'));

    const panel = screen.getByTestId('strategy-preview-panel');
    expect(within(panel).getByRole('heading', { name: /PARTITION 01/ })).toBeInTheDocument();
    // The chart canvas is mounted; the chart library itself is skipped in jsdom.
    expect(within(panel).getByTestId('strategy-preview-canvas')).toBeInTheDocument();
  });

  test('offers only the symbols the partition trades', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 미리보기 차트' }));

    const symbols = screen.getByRole('group', { name: '미리보기 종목 선택' });
    expect(within(symbols).getAllByRole('button').map((button) => button.textContent)).toEqual(['AAPL', 'MSFT', 'SPY']);
    expect(within(symbols).getByRole('button', { name: 'AAPL 미리보기' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(symbols).getByRole('button', { name: 'MSFT 미리보기' }));
    expect(screen.getByRole('heading', { name: 'PARTITION 01 · MSFT' })).toBeInTheDocument();
  });

  test('counts the signals the current blocks produce and recalculates when a block is added', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 미리보기 차트' }));
    const before = screen.getByTestId('preview-buy-count').textContent;
    expect(before).toMatch(/\d+회/);

    // Replacing the buy threshold must feed straight back into the chart.
    const rsiBlock = screen.getByTestId('buy-rsi-block');
    const valueInput = within(rsiBlock).getByLabelText('RSI 값');
    await user.clear(valueInput);
    await user.type(valueInput, '45');

    expect(screen.getByTestId('preview-buy-count').textContent).not.toBe(before);
  });

  test('closes the preview without leaving the editor', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 미리보기 차트' }));
    await user.click(screen.getByRole('button', { name: '미리보기 닫기' }));

    expect(screen.queryByTestId('strategy-preview-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-editor-workspace')).toBeInTheDocument();
  });
});
