import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BacktestView } from './views/OperationsViews.jsx';

const balancedStyles = readFileSync('src/styles/balanced.css', 'utf8');

describe('BacktestView', () => {
  test('compares the selected trading bot with the S&P 500 benchmark', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const atlasButton = screen.getByRole('button', { name: /Atlas 07 백테스트 보기/ });
    const pairLabButton = screen.getByRole('button', { name: /Pair Lab 백테스트 보기/ });

    expect(atlasButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Atlas 07와 S&P 500 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Atlas 07');
    expect(screen.getByTestId('backtest-benchmark-series')).toHaveAttribute('data-benchmark', 'S&P 500');

    await user.click(pairLabButton);

    expect(pairLabButton).toHaveAttribute('aria-pressed', 'true');
    expect(atlasButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('img', { name: 'Pair Lab와 S&P 500 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Pair Lab');
    expect(screen.getByText('S&P 500 대비')).toBeInTheDocument();
    expect(screen.getAllByText('-13.4%').length).toBeGreaterThan(0);
  });

  test('places a vertical bot selector beside the chart and reveals values at the hovered point', () => {
    render(<BacktestView />);

    const comparisonWorkspace = screen.getByTestId('backtest-comparison-workspace');
    expect(within(comparisonWorkspace).getByRole('list', { name: '백테스트 봇 목록' })).toBeInTheDocument();
    expect(within(comparisonWorkspace).getByRole('heading', { name: '봇 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '조건 미충족 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 봇 보기' })).not.toBeInTheDocument();

    const chart = screen.getByTestId('backtest-comparison-chart');
    chart.getBoundingClientRect = () => ({ left: 0, width: 820 });
    fireEvent.mouseMove(chart, { clientX: 410 });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Atlas 07');
    expect(tooltip).toHaveTextContent('S&P 500');
    expect(tooltip).toHaveTextContent('2025 Q1');

    fireEvent.mouseLeave(chart);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('filters a bot’s traded symbols and keeps the candle chart and execution log in sync', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    expect(screen.getByRole('img', { name: 'SPY 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
    expect(screen.getAllByTestId('trade-marker').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trade-marker')[0]).toHaveTextContent(/매수|매도/);

    const dailyCandleCount = screen.getAllByTestId('market-candle').length;
    expect(dailyCandleCount).toBe(60);
    expect(screen.getByRole('button', { name: '1일 차트 보기' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '1시간 차트 보기' }));

    expect(screen.getByRole('button', { name: '1시간 차트 보기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'SPY 캔들 차트와 매수 매도 기록' })).toHaveAttribute('data-timeframe', '1시간');
    expect(screen.getAllByTestId('market-candle')).toHaveLength(48);

    const symbolSearch = screen.getByRole('searchbox', { name: '종목 검색' });
    await user.type(symbolSearch, 'AAPL');

    expect(screen.getByRole('button', { name: 'AAPL 종목 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SPY 종목 선택' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'AAPL 종목 선택' }));

    expect(screen.getByRole('img', { name: 'AAPL 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
    const executionLog = screen.getByRole('region', { name: 'AAPL 체결 로그' });
    expect(within(executionLog).getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(within(executionLog).queryByText('SPY')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pair Lab 백테스트 보기/ }));

    expect(screen.getByRole('button', { name: 'KO 종목 선택' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'KO 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
  });
});

describe('BacktestView chart interactions', () => {
  test('uses a defined theme surface color for the price axis background', () => {
    expect(balancedStyles).toMatch(/\.market-price-axis-surface\s*\{[^}]*fill:\s*color-mix\(in srgb,\s*var\(--surface-2\)/s);
    expect(balancedStyles).not.toMatch(/\.market-price-axis-surface\s*\{[^}]*--surface-raised/s);
  });

  test('pans the time viewport and scales candles from the right price axis', () => {
    render(<BacktestView />);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 });
    expect(canvas).toHaveAttribute('data-total-candles', '200');
    const initialViewStart = Number(canvas.dataset.viewStart);
    const initialPriceScale = Number(canvas.dataset.priceScale);

    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 210, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 210, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 700, clientY: 210, pointerId: 1 });

    expect(Number(canvas.dataset.viewStart)).toBeLessThan(initialViewStart);

    fireEvent.pointerDown(canvas, { clientX: 1000, clientY: 250, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 1000, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 1000, clientY: 100, pointerId: 2 });

    expect(Number(canvas.dataset.priceScale)).toBeLessThan(initialPriceScale);

    fireEvent.doubleClick(canvas);

    expect(canvas).toHaveAttribute('data-price-scale', '1.000');
    expect(Number(canvas.dataset.viewStart)).toBe(initialViewStart);
    expect(screen.getByText(/가격축 상하 드래그/)).toBeInTheDocument();
  });

  test('zooms the candle timeline around the pointer with the mouse wheel', () => {
    const parentWheelHandler = vi.fn();
    render(<div onWheel={parentWheelHandler}><BacktestView /></div>);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 });
    expect(canvas).toHaveAttribute('data-visible-candles', '60');

    fireEvent.wheel(canvas, { clientX: 520, clientY: 210, deltaY: -120 });

    expect(parentWheelHandler).not.toHaveBeenCalled();
    expect(Number(canvas.dataset.visibleCandles)).toBeLessThan(60);
    expect(screen.getAllByTestId('market-candle')).toHaveLength(Number(canvas.dataset.visibleCandles));
    expect(screen.getByText(/휠 확대·축소/)).toBeInTheDocument();
  });
});
