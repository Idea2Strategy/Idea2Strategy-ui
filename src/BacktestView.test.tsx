import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BacktestView } from './views/OperationsViews';

const balancedStyles = readFileSync('src/styles/balanced.css', 'utf8');

describe('BacktestView', () => {
  test('compares the selected trading bot with the S&P 500 benchmark', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const atlasButton = screen.getByRole('button', { name: /Atlas 07 백테스트 보기/ });
    const pairLabButton = screen.getByRole('button', { name: /Pair Lab 백테스트 보기/ });

    expect(atlasButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Atlas 07와 시장 지수 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-emphasis')).toHaveAttribute('data-bot', 'Atlas 07');
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Atlas 07');
    expect(screen.getByTestId('backtest-benchmark-series-sp500')).toHaveAttribute('data-benchmark', 'S&P 500');

    await user.click(pairLabButton);

    expect(pairLabButton).toHaveAttribute('aria-pressed', 'true');
    expect(atlasButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('img', { name: 'Pair Lab와 시장 지수 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Pair Lab');
    expect(screen.getByText('S&P 500 대비')).toBeInTheDocument();
    expect(screen.getAllByText('-13.4%').length).toBeGreaterThan(0);
  });

  test('toggles market benchmarks while keeping the trading bot series fixed', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const sp500Button = screen.getByRole('button', { name: 'S&P 500 지표 표시' });
    const nasdaqButton = screen.getByRole('button', { name: 'NASDAQ 지표 표시' });
    const russellButton = screen.getByRole('button', { name: 'Russell 2000 지표 표시' });

    expect(sp500Button).toHaveAttribute('aria-pressed', 'true');
    expect(nasdaqButton).toHaveAttribute('aria-pressed', 'false');
    expect(russellButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('backtest-bot-series')).toBeInTheDocument();
    expect(screen.getByTestId('backtest-benchmark-series-sp500')).toBeInTheDocument();

    await user.click(nasdaqButton);
    expect(nasdaqButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('backtest-benchmark-series-nasdaq')).toHaveAttribute('data-benchmark', 'NASDAQ');

    await user.click(nasdaqButton);
    expect(nasdaqButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('backtest-benchmark-series-nasdaq')).not.toBeInTheDocument();

    await user.click(sp500Button);
    expect(screen.queryByTestId('backtest-benchmark-series-sp500')).not.toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Atlas 07');
  });

  test('places a vertical bot selector beside the chart and reveals values at the hovered point', () => {
    render(<BacktestView />);

    const comparisonWorkspace = screen.getByTestId('backtest-comparison-workspace');
    const [botSelector, performancePanel] = comparisonWorkspace.children;

    expect(botSelector).toHaveClass('backtest-bot-selector');
    expect(performancePanel).toHaveClass('backtest-performance-panel');
    expect(balancedStyles).toMatch(
      /backtest-comparison-workspace[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*\.85fr\)\s+minmax\(0,\s*2\.15fr\)/,
    );
    expect(within(comparisonWorkspace).getByRole('list', { name: '백테스트 봇 목록' })).toBeInTheDocument();
    expect(within(comparisonWorkspace).getByRole('heading', { name: '봇 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '조건 미충족 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 봇 보기' })).not.toBeInTheDocument();

    const chart = screen.getByTestId('backtest-comparison-chart');
    chart.getBoundingClientRect = () => ({ left: 0, width: 820 } as DOMRect);
    fireEvent.mouseMove(chart, { clientX: 410 });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Atlas 07');
    expect(tooltip).toHaveTextContent('S&P 500');
    expect(tooltip).toHaveTextContent('2025 Q1');

    fireEvent.mouseLeave(chart);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('searches and selects a bot from a scrollable list when many bots are available', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const botSelector = screen.getByRole('complementary', { name: '봇 선택' });
    const botList = within(botSelector).getByRole('list', { name: '백테스트 봇 목록' });
    const botSearch = within(botSelector).getByRole('searchbox', { name: '백테스트 봇 검색' });

    expect(within(botList).getAllByRole('listitem')).toHaveLength(8);
    expect(within(botSelector).getByText('8개 봇 · 동일 기간')).toBeInTheDocument();
    expect(within(botSelector).getByText('8 / 8개 표시')).toBeInTheDocument();
    expect(botList).toHaveClass('backtest-bot-options');

    await user.type(botSearch, 'volatility');

    expect(within(botList).getAllByRole('listitem')).toHaveLength(1);
    expect(within(botSelector).getByText('1 / 8개 표시')).toBeInTheDocument();
    expect(within(botList).getByRole('button', { name: 'Volatility Edge 백테스트 보기' })).toBeInTheDocument();

    await user.click(within(botList).getByRole('button', { name: 'Volatility Edge 백테스트 보기' }));

    expect(screen.getByRole('img', { name: 'Volatility Edge와 시장 지수 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Volatility Edge');

    await user.click(within(botSelector).getByRole('button', { name: '봇 검색 초기화' }));

    expect(botSearch).toHaveValue('');
    expect(within(botList).getAllByRole('listitem')).toHaveLength(8);
  });

  test('places the performance metrics inside the same panel surface as the charts', () => {
    render(<BacktestView />);

    const metrics = screen.getByLabelText('Atlas 07 백테스트 지표');
    const metricPanel = metrics.closest('.backtest-metric-panel');

    expect(metricPanel).not.toBeNull();
    expect(metricPanel).toHaveClass('panel');
    expect(metricPanel).toContainElement(screen.getByText('봇 수익률'));
    expect(metricPanel).toContainElement(screen.getByText('개별 체결'));
  });

  test('filters a bot’s traded symbols and keeps the candle chart and execution log in sync', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    expect(screen.getByRole('img', { name: 'SPY 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
    expect(screen.getAllByTestId('trade-marker').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trade-marker')[0]).toHaveTextContent(/매수|매도/);
    expect(screen.getByText('주요 종목')).toBeInTheDocument();
    const quickSymbols = screen.getByRole('list', { name: '빠른 거래 종목 선택' });
    expect(within(quickSymbols).getAllByRole('listitem')).toHaveLength(3);
    expect(within(quickSymbols).getByRole('button', { name: 'SPY 종목 빠른 선택' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(quickSymbols).getByRole('button', { name: 'AAPL 종목 빠른 선택' })).toBeInTheDocument();
    expect(within(quickSymbols).getByRole('button', { name: 'QQQ 종목 빠른 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: '거래 종목 검색' })).not.toBeInTheDocument();

    await user.click(within(quickSymbols).getByRole('button', { name: 'QQQ 종목 빠른 선택' }));

    expect(screen.getByRole('img', { name: 'QQQ 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();

    await user.click(within(quickSymbols).getByRole('button', { name: 'SPY 종목 빠른 선택' }));

    const dailyCandleCount = screen.getAllByTestId('market-candle').length;
    expect(dailyCandleCount).toBe(60);
    expect(screen.getByRole('button', { name: '1일 차트 보기' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '1시간 차트 보기' }));

    expect(screen.getByRole('button', { name: '1시간 차트 보기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'SPY 캔들 차트와 매수 매도 기록' })).toHaveAttribute('data-timeframe', '1시간');
    expect(screen.getAllByTestId('market-candle')).toHaveLength(48);

    await user.click(screen.getByRole('button', { name: '거래 종목 선택 열기' }));

    const symbolDialog = screen.getByRole('dialog', { name: '거래 종목 선택' });
    const symbolSearch = within(symbolDialog).getByRole('searchbox', { name: '거래 종목 검색' });
    expect(symbolDialog).toHaveAttribute('aria-modal', 'true');
    expect(within(symbolDialog).getByText('3 / 3개 종목')).toBeInTheDocument();
    expect(within(symbolDialog).getByRole('button', { name: 'SPY 종목 선택' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(symbolSearch, 'AAPL');

    expect(within(symbolDialog).getByText('1 / 3개 종목')).toBeInTheDocument();
    expect(within(symbolDialog).getByRole('button', { name: 'AAPL 종목 선택' })).toBeInTheDocument();
    expect(within(symbolDialog).queryByRole('button', { name: 'SPY 종목 선택' })).not.toBeInTheDocument();

    await user.click(within(symbolDialog).getByRole('button', { name: 'AAPL 종목 선택' }));

    expect(screen.queryByRole('dialog', { name: '거래 종목 선택' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'AAPL 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
    const executionLog = screen.getByRole('region', { name: 'AAPL 체결 로그' });
    await user.click(within(executionLog).getByRole('button', { name: 'AAPL 매수·매도 로그 펼치기' }));
    expect(within(executionLog).getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(within(executionLog).queryByText('SPY')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pair Lab 백테스트 보기/ }));

    expect(screen.getByRole('img', { name: 'KO 캔들 차트와 매수 매도 기록' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '거래 종목 선택 열기' }));
    expect(within(screen.getByRole('dialog', { name: '거래 종목 선택' })).getByRole('button', { name: 'KO 종목 선택' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '거래 종목 선택' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '거래 종목 선택 열기' }));
    fireEvent.mouseDown(document.querySelector('.backtest-symbol-modal-backdrop')!);

    expect(screen.queryByRole('dialog', { name: '거래 종목 선택' })).not.toBeInTheDocument();
  });

  test('keeps the execution log discoverable while collapsed and toggles its details', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const executionLog = screen.getByRole('region', { name: 'SPY 체결 로그' });
    const toggle = within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 펼치기' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('전체 3건');
    expect(toggle.querySelector('.backtest-execution-log-action')).toHaveTextContent('체결 내역 보기');
    expect(toggle.querySelector('.backtest-execution-log-count')).toHaveTextContent('전체 3건');
    expect(balancedStyles).toMatch(
      /\.backtest-execution-log-toggle\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/s,
    );
    expect(balancedStyles).toMatch(/\.backtest-execution-log-action\s*\{[^}]*justify-self:\s*center/s);
    expect(balancedStyles).toMatch(/\.backtest-execution-log-count\s*\{[^}]*justify-self:\s*end/s);
    expect(within(executionLog).queryByRole('table')).not.toBeInTheDocument();
    expect(within(executionLog).queryByRole('group', { name: '체결 로그 기간 검색' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 접기' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(executionLog).getByRole('table')).toBeInTheDocument();
    expect(within(executionLog).getByRole('group', { name: '체결 로그 기간 검색' })).toBeInTheDocument();

    await user.click(within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 접기' }));

    expect(within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(executionLog).queryByRole('table')).not.toBeInTheDocument();
  });

  test('filters execution logs to the date range currently visible on the chart', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);
    const executionLog = screen.getByRole('region', { name: 'SPY 체결 로그' });
    await user.click(within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 펼치기' }));
    const chartRangeButton = within(executionLog).getByRole('button', { name: '현재 차트 구간 로그 보기' });

    expect(canvas).toHaveAttribute('data-visible-range-start', '2026-05-08');
    expect(canvas).toHaveAttribute('data-visible-range-end', '2026-07-30');
    expect(screen.getAllByTestId('trade-marker')).toHaveLength(1);

    await user.click(chartRangeButton);

    expect(within(executionLog).getByRole('button', { name: '체결 로그 시작일' })).toHaveTextContent('2026. 05. 08.');
    expect(within(executionLog).getByRole('button', { name: '체결 로그 종료일' })).toHaveTextContent('2026. 07. 30.');
    expect(within(executionLog).getByText('1건 검색됨')).toBeInTheDocument();
    expect(within(executionLog).getByText('07.19 10:00')).toBeInTheDocument();
    expect(within(executionLog).queryByText('07.18 14:30')).not.toBeInTheDocument();

    fireEvent.pointerDown(canvas, { clientX: 480, clientY: 210, pointerId: 12 });
    fireEvent.pointerMove(canvas, { clientX: 900, clientY: 210, pointerId: 12 });
    fireEvent.pointerUp(canvas, { clientX: 900, clientY: 210, pointerId: 12 });

    expect(canvas.dataset.visibleRangeEnd! < '2026-07-18').toBe(true);
    expect(screen.getAllByTestId('trade-marker')).toHaveLength(1);

    await user.click(chartRangeButton);

    expect(within(executionLog).getByText('1건 검색됨')).toBeInTheDocument();
    expect(within(executionLog).getByText('07.18 14:30')).toBeInTheDocument();
    expect(within(executionLog).queryByText('07.19 10:00')).not.toBeInTheDocument();
  });

  test('filters execution logs by date and exposes pagination controls for large histories', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const getExecutionLog = () => screen.getByRole('region', { name: 'SPY 체결 로그' });
    const executionLog = getExecutionLog();
    await user.click(within(executionLog).getByRole('button', { name: 'SPY 매수·매도 로그 펼치기' }));
    const startDate = within(executionLog).getByRole('button', { name: '체결 로그 시작일' });
    const endDate = within(executionLog).getByRole('button', { name: '체결 로그 종료일' });
    const pageSize = within(executionLog).getByRole('combobox', { name: '페이지당 로그 수' });

    expect(startDate).toHaveTextContent('시작 날짜');
    expect(endDate).toHaveTextContent('종료 날짜');
    expect(pageSize).toHaveValue('10');
    expect(within(executionLog).getByText('3건 검색됨')).toBeInTheDocument();
    expect(within(executionLog).getByRole('button', { name: '이전 로그 페이지' })).toBeDisabled();
    expect(within(executionLog).getByRole('button', { name: '다음 로그 페이지' })).toBeDisabled();

    await user.click(startDate);

    expect(screen.getByRole('dialog', { name: '체결 로그 날짜 선택' })).toBeInTheDocument();
    expect(screen.getByText('시작일을 선택해 주세요')).toBeInTheDocument();
    expect(startDate).toHaveClass('active');
    expect(endDate).not.toHaveClass('active');

    await user.click(screen.getByRole('button', { name: '2026년 7월 19일' }));

    const selectedStartDate = within(getExecutionLog()).getByRole('button', { name: '체결 로그 시작일' });
    const selectingEndDate = within(getExecutionLog()).getByRole('button', { name: '체결 로그 종료일' });
    expect(selectedStartDate).toHaveTextContent('2026. 07. 19.');
    expect(selectedStartDate).not.toHaveClass('active');
    expect(selectingEndDate).toHaveClass('active');
    expect(screen.getByText('종료일을 선택해 주세요')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2026년 7월 19일' }));

    expect(within(getExecutionLog()).getByText('1건 검색됨')).toBeInTheDocument();
    expect(within(getExecutionLog()).getByText('07.19 10:00')).toBeInTheDocument();
    expect(within(getExecutionLog()).queryByText('07.18 10:30')).not.toBeInTheDocument();
    expect(within(getExecutionLog()).getByRole('button', { name: '체결 로그 종료일' })).toHaveTextContent('2026. 07. 19.');
    expect(screen.getByRole('dialog', { name: '체결 로그 날짜 선택' })).toBeInTheDocument();
    expect(screen.getByText('기간 선택이 완료되었습니다')).toBeInTheDocument();

    await user.click(screen.getByRole('heading', { name: '봇 백테스트' }));

    expect(screen.queryByRole('dialog', { name: '체결 로그 날짜 선택' })).not.toBeInTheDocument();

    await user.click(within(getExecutionLog()).getByRole('button', { name: '전체 기간 보기' }));

    expect(within(getExecutionLog()).getByRole('button', { name: '체결 로그 시작일' })).toHaveTextContent('시작 날짜');
    expect(within(getExecutionLog()).getByRole('button', { name: '체결 로그 종료일' })).toHaveTextContent('종료 날짜');
    expect(within(getExecutionLog()).getByText('3건 검색됨')).toBeInTheDocument();

    await user.click(within(getExecutionLog()).getByRole('button', { name: '체결 로그 종료일' }));
    await user.click(screen.getByRole('button', { name: '2026년 7월 19일' }));
    await user.click(screen.getByRole('button', { name: '2026년 7월 18일' }));

    expect(within(getExecutionLog()).getByRole('button', { name: '체결 로그 시작일' })).toHaveTextContent('2026. 07. 18.');
    expect(within(getExecutionLog()).getByRole('button', { name: '체결 로그 종료일' })).toHaveTextContent('2026. 07. 19.');
  });
});

describe('BacktestView chart interactions', () => {
  test('styles the comparison legend as a compact panel-header control', () => {
    expect(balancedStyles).toMatch(/\.backtest-chart-legend\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend span\s*\{[^}]*font:\s*650 11px\/1 var\(--font-sans\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend \.bot\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend button\.active\s*\{[^}]*color:\s*var\(--accent\)[^}]*background:\s*var\(--accent-soft\)[^}]*box-shadow:\s*inset 0 0 0 1px color-mix\(in srgb,\s*var\(--accent\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend i\s*\{[^}]*width:\s*7px[^}]*height:\s*7px[^}]*border-radius:\s*50%/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend \.benchmark i\s*\{[^}]*background:\s*var\(--benchmark-color\)[^}]*opacity:\s*1/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend \.sp500\s*\{[^}]*--benchmark-color:\s*var\(--tone-indicator\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.benchmark\.sp500\s*\{[^}]*stroke:\s*var\(--tone-indicator\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend \.nasdaq\s*\{[^}]*--benchmark-color:\s*var\(--info\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.benchmark\.nasdaq\s*\{[^}]*stroke:\s*var\(--info\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-legend \.russell\s*\{[^}]*--benchmark-color:\s*var\(--tone-condition\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.benchmark\.russell\s*\{[^}]*stroke:\s*var\(--tone-condition\)/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.bot-emphasis\s*\{[^}]*stroke:\s*var\(--accent\)[^}]*stroke-width:\s*10[^}]*opacity:\s*\.16/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.bot\s*\{[^}]*stroke:\s*var\(--accent\)[^}]*stroke-width:\s*4/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-line\.benchmark\s*\{[^}]*stroke-width:\s*1\.6[^}]*opacity:\s*\.72/s);
    expect(balancedStyles).toMatch(/\.backtest-chart-end\.bot\s*\{[^}]*fill:\s*var\(--accent\)[^}]*stroke:\s*var\(--surface\)/s);
  });

  test('uses a defined theme surface color for the price axis background', () => {
    expect(balancedStyles).toMatch(/\.market-price-axis-surface\s*\{[^}]*fill:\s*color-mix\(in srgb,\s*var\(--surface-2\)/s);
    expect(balancedStyles).not.toMatch(/\.market-price-axis-surface\s*\{[^}]*--surface-raised/s);
  });

  test('pans the time viewport and scales candles from the right price axis', () => {
    render(<BacktestView />);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);
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

  test('clips vertically scaled candles to the price plot after timeline zooming', () => {
    render(<BacktestView />);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);

    fireEvent.wheel(canvas, { clientX: 520, clientY: 210, deltaY: 120 });
    fireEvent.pointerDown(canvas, { clientX: 1000, clientY: 300, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 1000, clientY: 40, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 1000, clientY: 40, pointerId: 3 });

    const priceClip = canvas.querySelector('#market-price-plot-clip rect');
    const candlePriceLayers = canvas.querySelectorAll('.market-candle-price-layer');

    expect(Number(canvas.dataset.visibleCandles)).toBeGreaterThan(60);
    expect(Number(canvas.dataset.priceScale)).toBe(.4);
    expect(priceClip).toHaveAttribute('y', '30');
    expect(priceClip).toHaveAttribute('height', '274');
    expect(candlePriceLayers).toHaveLength(Number(canvas.dataset.visibleCandles));
    candlePriceLayers.forEach((layer) => {
      expect(layer).toHaveAttribute('clip-path', 'url(#market-price-plot-clip)');
    });
  });

  test('zooms the candle timeline around the pointer with the mouse wheel', () => {
    const parentWheelHandler = vi.fn();
    render(<div onWheel={parentWheelHandler}><BacktestView /></div>);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);
    expect(canvas).toHaveAttribute('data-visible-candles', '60');

    fireEvent.wheel(canvas, { clientX: 520, clientY: 210, deltaY: -120 });

    expect(parentWheelHandler).not.toHaveBeenCalled();
    expect(Number(canvas.dataset.visibleCandles)).toBeLessThan(60);
    expect(screen.getAllByTestId('market-candle')).toHaveLength(Number(canvas.dataset.visibleCandles));
    expect(screen.getByText(/휠 확대·축소/)).toBeInTheDocument();
  });

  test('keeps chart interactions available in the expanded chart workspace', () => {
    render(<BacktestView />);

    const chartWorkspace = screen.getByTestId('backtest-market-chart');
    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);

    fireEvent.click(screen.getByRole('button', { name: '차트 전체화면 열기' }));

    expect(chartWorkspace).toHaveClass('is-fullscreen');
    expect(screen.getByRole('button', { name: '차트 전체화면 닫기' })).toBeInTheDocument();

    fireEvent.wheel(canvas, { clientX: 520, clientY: 210, deltaY: -120 });
    fireEvent.pointerDown(canvas, { clientX: 1000, clientY: 250, pointerId: 8 });
    fireEvent.pointerMove(canvas, { clientX: 1000, clientY: 100, pointerId: 8 });
    fireEvent.pointerUp(canvas, { clientX: 1000, clientY: 100, pointerId: 8 });

    expect(Number(canvas.dataset.visibleCandles)).toBeLessThan(60);
    expect(Number(canvas.dataset.priceScale)).toBeLessThan(1);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(chartWorkspace).not.toHaveClass('is-fullscreen');
  });

  test('pans prices freely and supports indicators and trend-line drawings', () => {
    render(<BacktestView />);

    const canvas = screen.getByTestId('backtest-candle-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1040, height: 420 } as DOMRect);
    const initialPriceOffset = Number(canvas.dataset.priceOffset);

    fireEvent.pointerDown(canvas, { clientX: 520, clientY: 210, pointerId: 9 });
    fireEvent.pointerMove(canvas, { clientX: 620, clientY: 280, pointerId: 9 });
    fireEvent.pointerUp(canvas, { clientX: 620, clientY: 280, pointerId: 9 });

    expect(Number(canvas.dataset.priceOffset)).not.toBe(initialPriceOffset);

    fireEvent.click(screen.getByRole('button', { name: 'SMA 20 지표 표시' }));
    fireEvent.click(screen.getByRole('button', { name: 'EMA 20 지표 표시' }));

    expect(screen.getByTestId('market-indicator-sma')).toBeInTheDocument();
    expect(screen.getByTestId('market-indicator-ema')).toBeInTheDocument();

    const trendLineTool = screen.getByRole('button', { name: '추세선 그리기' });
    fireEvent.click(trendLineTool);
    expect(trendLineTool).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerDown(canvas, { clientX: 280, clientY: 160, pointerId: 10 });
    fireEvent.pointerDown(canvas, { clientX: 720, clientY: 240, pointerId: 11 });

    expect(screen.getByTestId('market-drawing')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '차트 선 모두 지우기' }));

    expect(screen.queryByTestId('market-drawing')).not.toBeInTheDocument();
  });
});
