import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bot, CalendarDays, Coins, Plus, Search, Trophy } from 'lucide-react';
import { Button, DataTable, EmptyState, MetricRow, PageHeading, Panel, Status } from '../components/common.jsx';
import { leaderboard } from '../data/mockData.js';
import { Localized, useLanguage } from '../lib/i18n.jsx';

const backtestBenchmarks = [
  {
    id: 'sp500',
    name: 'S&P 500',
    return: '+10.8%',
    values: [0, 0.7, -0.4, 1.2, 2.4, 1.8, 3.7, 4.5, 6.1, 7.4, 8.3, 10.8],
  },
  {
    id: 'nasdaq',
    name: 'NASDAQ',
    return: '+15.1%',
    values: [0, 1.2, -0.8, 2.1, 3.8, 3, 5.9, 7.2, 8.4, 10.2, 12.3, 15.1],
  },
  {
    id: 'russell',
    name: 'Russell 2000',
    return: '+6.7%',
    values: [0, 0.2, -1.2, 0.5, 1.6, 0.8, 2.1, 2.7, 3.6, 4.4, 5.2, 6.7],
  },
];

const backtestBenchmark = backtestBenchmarks[0];

const backtestPeriods = ['2023 Q3', '2023 Q4', '2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1', '2026 Q2'];

const backtestBots = [
  {
    name: 'Atlas 07',
    strategy: 'Opening Range Flow',
    return: '+18.4%',
    alpha: '+7.6%',
    drawdown: '−4.2%',
    trades: 42,
    values: [0, 1.1, -0.8, 2.2, 4.1, 3.2, 6.4, 5.7, 9.1, 12.4, 14.2, 18.4],
  },
  {
    name: 'Room Beta',
    strategy: 'Momentum Rotation',
    return: '+13.7%',
    alpha: '+2.9%',
    drawdown: '−3.1%',
    trades: 31,
    values: [0, 0.4, -0.2, 1.7, 3.2, 2.8, 4.9, 5.8, 7.6, 9.3, 10.4, 13.7],
  },
  {
    name: 'Pair Lab',
    strategy: 'Pair Spread Monitor',
    return: '−2.6%',
    alpha: '-13.4%',
    drawdown: '−8.7%',
    trades: 18,
    values: [0, -0.5, 0.2, -1.4, -2.8, -1.9, -3.7, -4.6, -5.4, -4.8, -4.1, -2.6],
  },
];

const candleTimes = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '09:30', '10:00', '10:30', '11:00'];

function makeInstrument(symbol, name, basePrice, changes, executionSpecs) {
  let previousClose = basePrice;
  const candles = changes.map((change, index) => {
    const open = previousClose;
    const close = open + change;
    const swing = Math.max(Math.abs(change) * .58, basePrice * .0028) + (index % 3) * basePrice * .0007;
    const candle = {
      time: `${index < 14 ? '07.18' : '07.19'} ${candleTimes[index]}`,
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + swing).toFixed(2)),
      low: Number((Math.min(open, close) - swing * .82).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 420000 + ((index * 173000 + symbol.charCodeAt(0) * 11000) % 1280000),
    };
    previousClose = close;
    return candle;
  });
  const executions = executionSpecs.map((execution, order) => {
    const candle = candles[execution.index];
    const price = candle.close;
    return {
      id: `${symbol}-${execution.index}-${execution.side}`,
      index: execution.index,
      time: candle.time,
      symbol,
      side: execution.side,
      quantity: `${execution.quantity}주`,
      price: `$${price.toFixed(2)}`,
      value: `$${(price * execution.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      fee: `$${(price * execution.quantity * .002).toFixed(2)}`,
      result: order === executionSpecs.length - 1 && execution.partial ? '부분 체결' : '체결',
    };
  });
  return { symbol, name, candles, executions };
}

const botInstruments = {
  'Atlas 07': [
    makeInstrument('SPY', 'SPDR S&P 500 ETF', 549.2, [1.6, -2.2, 3.1, 1.4, -1.1, 2.8, 1.2, -2.4, 3.8, 2.1, -1.5, 2.7, 1.8, .9, -2.1, 3.4, 1.2, 2.5], [{ index: 2, side: '매수', quantity: 12 }, { index: 10, side: '매도', quantity: 5 }, { index: 15, side: '매수', quantity: 8 }]),
    makeInstrument('AAPL', 'Apple Inc.', 224.8, [-.8, 1.4, 2.1, -1.2, .9, 1.8, -.7, 2.4, -1.6, .8, 1.3, -2.1, 2.8, 1.1, -.9, 1.7, .6, 1.2], [{ index: 1, side: '매수', quantity: 10 }, { index: 8, side: '매도', quantity: 6 }, { index: 13, side: '매수', quantity: 4 }]),
    makeInstrument('QQQ', 'Invesco QQQ Trust', 486.4, [1.1, 2.2, -1.7, .8, 2.6, -2.1, 1.4, 1.9, -.6, 2.8, -1.4, .7, 2.1, 1.6, -2.2, 1.9, .8, 2.3], [{ index: 3, side: '매수', quantity: 7 }, { index: 11, side: '매도', quantity: 7 }]),
  ],
  'Room Beta': [
    makeInstrument('MSFT', 'Microsoft Corp.', 441.6, [1.2, -.7, 2.4, 1.1, -1.8, 2.2, .7, 1.8, -1.1, 2.7, .8, -1.6, 2.1, 1.4, -.6, 1.9, 1.2, .9], [{ index: 2, side: '매수', quantity: 9 }, { index: 12, side: '매도', quantity: 4 }]),
    makeInstrument('NVDA', 'NVIDIA Corp.', 118.4, [2.1, 1.8, -2.7, 3.2, 1.4, -1.9, 2.8, -3.1, 1.7, 2.6, -1.3, 3.4, -2.2, 1.8, 2.1, -1.6, 2.9, 1.1], [{ index: 3, side: '매수', quantity: 18 }, { index: 7, side: '매도', quantity: 8 }, { index: 14, side: '매수', quantity: 10 }]),
    makeInstrument('TSLA', 'Tesla Inc.', 248.9, [-2.8, 3.6, 1.4, -4.1, 2.7, 3.1, -2.2, 1.8, -3.4, 4.2, 2.1, -1.7, 3.8, -2.9, 1.6, 2.4, -1.2, 3.1], [{ index: 1, side: '매수', quantity: 6 }, { index: 9, side: '매도', quantity: 6 }]),
  ],
  'Pair Lab': [
    makeInstrument('KO', 'Coca-Cola Co.', 63.4, [.3, -.2, .4, .2, -.5, .3, .1, -.4, .5, -.2, .3, -.1, .4, .2, -.3, .5, -.2, .3], [{ index: 2, side: '매수', quantity: 24 }, { index: 12, side: '매도', quantity: 12 }]),
    makeInstrument('PEP', 'PepsiCo Inc.', 169.8, [-.4, .7, .3, -.6, .8, -.2, .5, .4, -.7, .6, .2, -.4, .9, -.3, .4, .5, -.2, .6], [{ index: 3, side: '매도', quantity: 9 }, { index: 9, side: '매수', quantity: 9 }]),
    makeInstrument('XOM', 'Exxon Mobil Corp.', 115.2, [.6, -.3, .8, -.5, .4, .7, -.6, .9, -.2, .5, -.4, .8, .3, -.7, .6, .4, -.2, .7], [{ index: 1, side: '매수', quantity: 14 }, { index: 7, side: '매도', quantity: 7 }, { index: 15, side: '매수', quantity: 7, partial: true }]),
  ],
};

const chartTimeframes = ['1시간', '4시간', '1일', '주봉', '달봉', '년봉'];
const timeframeCandleCounts = { '1시간': 48, '4시간': 38, '1일': 200, '주봉': 24, '달봉': 18, '년봉': 12 };
const timeframeVisibleCandleCounts = { '1시간': 60, '4시간': 60, '1일': 60, '주봉': 60, '달봉': 60, '년봉': 60 };

function tradingDayLabel(index) {
  const date = new Date(Date.UTC(2025, 9, 24));
  let remainingDays = index;
  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remainingDays -= 1;
  }
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
}

function timeframeLabel(timeframe, index) {
  if (timeframe === '1시간') return `07.${String(15 + Math.floor(index / 7)).padStart(2, '0')} ${String(9 + (index % 7)).padStart(2, '0')}:30`;
  if (timeframe === '4시간') return `07.${String(2 + index).padStart(2, '0')} ${index % 2 ? '13:00' : '09:00'}`;
  if (timeframe === '1일') return tradingDayLabel(index);
  if (timeframe === '주봉') return `2026 ${String(index + 1).padStart(2, '0')}주`;
  if (timeframe === '달봉') return `${2025 + Math.floor(index / 12)}.${String((index % 12) + 1).padStart(2, '0')}`;
  return String(2015 + index);
}

function candlesForTimeframe(candles, timeframe) {
  const count = timeframeCandleCounts[timeframe];
  const sourceLastIndex = candles.length - 1;
  const sourceRange = Math.max(...candles.map((candle) => candle.high)) - Math.min(...candles.map((candle) => candle.low));
  let previousClose = candles[0].open;
  return Array.from({ length: count }, (_, index) => {
    const sourcePosition = (index / (count - 1)) * sourceLastIndex;
    const sourceIndex = Math.floor(sourcePosition);
    const nextIndex = Math.min(sourceIndex + 1, sourceLastIndex);
    const progress = sourcePosition - sourceIndex;
    const source = candles[sourceIndex];
    const next = candles[nextIndex];
    const interpolatedClose = source.close + (next.close - source.close) * progress;
    const texture = Math.sin((index + 1) * 1.73) * sourceRange * .018;
    const close = interpolatedClose + texture;
    const open = previousClose;
    const swing = Math.max(Math.abs(close - open) * .62, sourceRange * .018) + (index % 3) * sourceRange * .004;
    const candle = {
      time: timeframeLabel(timeframe, index),
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + swing).toFixed(2)),
      low: Number((Math.min(open, close) - swing * .82).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round((source.volume + (next.volume - source.volume) * progress) * (.86 + (index % 5) * .055)),
    };
    previousClose = close;
    return candle;
  });
}

function comparisonPoints(values, width, height, min, max, padX = 18, padY = 18) {
  const range = max - min || 1;
  return values.map((value, index) => [
    padX + (index / (values.length - 1)) * (width - padX * 2),
    height - padY - ((value - min) / range) * (height - padY * 2),
  ]);
}

function BacktestComparisonChart({ bot, benchmarks }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 820;
  const height = 280;
  const combined = [...bot.values, ...benchmarks.flatMap((benchmark) => benchmark.values)];
  const min = Math.min(...combined, 0) - 2;
  const max = Math.max(...combined, 0) + 2;
  const botPoints = comparisonPoints(bot.values, width, height, min, max);
  const benchmarkSeries = benchmarks.map((benchmark) => ({
    ...benchmark,
    points: comparisonPoints(benchmark.values, width, height, min, max),
  }));
  const toPolyline = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');
  const zeroY = height - 18 - ((0 - min) / (max - min)) * (height - 36);
  const activeBotPoint = hoveredIndex === null ? null : botPoints[hoveredIndex];
  const setIndexFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = Math.min(Math.max((event.clientX - bounds.left) / (bounds.width || 1), 18 / width), 1 - (18 / width));
    const ratio = (normalizedX - (18 / width)) / (1 - (36 / width));
    setHoveredIndex(Math.round(ratio * (bot.values.length - 1)));
  };
  const moveIndexWithKeyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    setHoveredIndex((current) => Math.min(Math.max((current ?? 0) + direction, 0), bot.values.length - 1));
  };

  return <div
    className="backtest-comparison-chart"
    data-testid="backtest-comparison-chart"
    tabIndex="0"
    onMouseMove={setIndexFromPointer}
    onMouseLeave={() => setHoveredIndex(null)}
    onFocus={() => setHoveredIndex((current) => current ?? bot.values.length - 1)}
    onBlur={() => setHoveredIndex(null)}
    onKeyDown={moveIndexWithKeyboard}
  >
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${bot.name}와 시장 지수 누적 수익률 비교`}>
      {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} className="backtest-chart-gridline" x1="18" x2={width - 18} y1={height * ratio} y2={height * ratio} />)}
      <line className="backtest-chart-zero" x1="18" x2={width - 18} y1={zeroY} y2={zeroY} />
      {benchmarkSeries.map((benchmark) => <polyline
        key={benchmark.id}
        className={`backtest-chart-line benchmark ${benchmark.id}`}
        points={toPolyline(benchmark.points)}
        data-testid={`backtest-benchmark-series-${benchmark.id}`}
        data-benchmark={benchmark.name}
        vectorEffect="non-scaling-stroke"
      />)}
      <polyline
        className="backtest-chart-line bot"
        points={toPolyline(botPoints)}
        data-testid="backtest-bot-series"
        data-bot={bot.name}
        vectorEffect="non-scaling-stroke"
      />
      {benchmarkSeries.map((benchmark) => <circle
        key={benchmark.id}
        className={`backtest-chart-end benchmark ${benchmark.id}`}
        cx={benchmark.points.at(-1)[0]}
        cy={benchmark.points.at(-1)[1]}
        r="4"
        vectorEffect="non-scaling-stroke"
      />)}
      <circle className="backtest-chart-end bot" cx={botPoints.at(-1)[0]} cy={botPoints.at(-1)[1]} r="5" vectorEffect="non-scaling-stroke" />
      {hoveredIndex !== null && <>
        <line className="backtest-chart-hover-line" x1={activeBotPoint[0]} x2={activeBotPoint[0]} y1="18" y2={height - 18} vectorEffect="non-scaling-stroke" />
        {benchmarkSeries.map((benchmark) => <circle
          key={benchmark.id}
          className={`backtest-chart-hover-point benchmark ${benchmark.id}`}
          cx={benchmark.points[hoveredIndex][0]}
          cy={benchmark.points[hoveredIndex][1]}
          r="5"
          vectorEffect="non-scaling-stroke"
        />)}
        <circle className="backtest-chart-hover-point bot" cx={activeBotPoint[0]} cy={activeBotPoint[1]} r="6" vectorEffect="non-scaling-stroke" />
      </>}
    </svg>
    {hoveredIndex !== null && <div
      className={`backtest-chart-tooltip ${hoveredIndex < 2 ? 'edge-left' : hoveredIndex > bot.values.length - 3 ? 'edge-right' : ''}`}
      role="tooltip"
      style={{ left: `${(activeBotPoint[0] / width) * 100}%` }}
    >
      <strong>{backtestPeriods[hoveredIndex]}</strong>
      <span className="bot"><i />{bot.name}<b>{bot.values[hoveredIndex] > 0 ? '+' : ''}{bot.values[hoveredIndex].toFixed(1)}%</b></span>
      {benchmarks.map((benchmark) => <span className={`benchmark ${benchmark.id}`} key={benchmark.id}><i />{benchmark.name}<b>{benchmark.values[hoveredIndex] > 0 ? '+' : ''}{benchmark.values[hoveredIndex].toFixed(1)}%</b></span>)}
    </div>}
    <div className="backtest-chart-axis"><span>2023 Q3</span><span>2024 Q2</span><span>2025 Q2</span><span>2026 Q2</span></div>
  </div>;
}

function BacktestCandlestickChart({ instrument, timeframe }) {
  const displayCandles = candlesForTimeframe(instrument.candles, timeframe);
  const defaultVisibleCount = Math.min(timeframeVisibleCandleCounts[timeframe], displayCandles.length);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [viewStart, setViewStart] = useState(() => Math.max(0, timeframeCandleCounts[timeframe] - timeframeVisibleCandleCounts[timeframe]));
  const [visibleCount, setVisibleCount] = useState(defaultVisibleCount);
  const [priceScale, setPriceScale] = useState(1);
  const [dragMode, setDragMode] = useState(null);
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const maxViewStart = Math.max(0, displayCandles.length - visibleCount);
  const safeViewStart = Math.min(viewStart, maxViewStart);
  const visibleCandles = displayCandles.slice(safeViewStart, safeViewStart + visibleCount);
  const width = 1040;
  const height = 420;
  const left = 18;
  const right = 76;
  const chartTop = 30;
  const chartBottom = 304;
  const volumeTop = 332;
  const volumeBottom = 390;
  const plotWidth = width - left - right;
  const candleStep = plotWidth / visibleCandles.length;
  const candleWidth = Math.min(22, Math.max(7, candleStep * .58));
  const priceMin = Math.min(...visibleCandles.map((candle) => candle.low));
  const priceMax = Math.max(...visibleCandles.map((candle) => candle.high));
  const pricePadding = (priceMax - priceMin) * .12 || 1;
  const baseDomainMin = priceMin - pricePadding;
  const baseDomainMax = priceMax + pricePadding;
  const domainMiddle = (baseDomainMin + baseDomainMax) / 2;
  const domainHalfRange = ((baseDomainMax - baseDomainMin) / 2) * priceScale;
  const domainMin = domainMiddle - domainHalfRange;
  const domainMax = domainMiddle + domainHalfRange;
  const maxVolume = Math.max(...visibleCandles.map((candle) => candle.volume));
  const priceToY = (price) => chartBottom - ((price - domainMin) / (domainMax - domainMin)) * (chartBottom - chartTop);
  const xForIndex = (index) => left + candleStep * index + candleStep / 2;
  const activeIndex = Math.min(hoveredIndex ?? visibleCandles.length - 1, visibleCandles.length - 1);
  const activeCandle = visibleCandles[activeIndex];
  const activeUp = activeCandle.close >= activeCandle.open;
  const setIndexFromPointer = (event) => {
    if (interactionRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / (bounds.width || 1)) * width;
    if (x >= width - right) {
      setHoveredIndex(null);
      return;
    }
    setHoveredIndex(Math.min(Math.max(Math.floor((x - left) / candleStep), 0), visibleCandles.length - 1));
  };
  const getChartPoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / (bounds.width || 1)) * width,
      y: ((event.clientY - bounds.top) / (bounds.height || 1)) * height,
    };
  };
  const startInteraction = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const point = getChartPoint(event);
    const mode = point.x >= width - right ? 'scaling' : 'panning';
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startView: safeViewStart,
      startScale: priceScale,
    };
    setDragMode(mode);
    setHoveredIndex(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueInteraction = (event) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      setIndexFromPointer(event);
      return;
    }
    const point = getChartPoint(event);
    if (interaction.mode === 'panning') {
      const candleDelta = Math.round((point.x - interaction.startX) / candleStep);
      setViewStart(Math.min(maxViewStart, Math.max(0, interaction.startView - candleDelta)));
    } else {
      const nextScale = interaction.startScale * Math.exp((point.y - interaction.startY) / 150);
      setPriceScale(Math.min(3, Math.max(.4, nextScale)));
    }
  };
  const stopInteraction = (event) => {
    if (!interactionRef.current) return;
    event.currentTarget.releasePointerCapture?.(interactionRef.current.pointerId);
    interactionRef.current = null;
    setDragMode(null);
  };
  const zoomTimeline = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getChartPoint(event);
    const pointerRatio = Math.min(1, Math.max(0, (point.x - left) / plotWidth));
    const zoomStep = Math.max(4, Math.round(visibleCount * .15));
    const maxVisibleCount = Math.min(120, displayCandles.length);
    const nextVisibleCount = Math.min(maxVisibleCount, Math.max(12, visibleCount + (event.deltaY > 0 ? zoomStep : -zoomStep)));
    if (nextVisibleCount === visibleCount) return;
    const anchorIndex = safeViewStart + pointerRatio * (visibleCount - 1);
    const nextMaxViewStart = Math.max(0, displayCandles.length - nextVisibleCount);
    const nextViewStart = Math.round(anchorIndex - pointerRatio * (nextVisibleCount - 1));
    setVisibleCount(nextVisibleCount);
    setViewStart(Math.min(nextMaxViewStart, Math.max(0, nextViewStart)));
    setHoveredIndex(null);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', zoomTimeline, { passive: false });
    return () => canvas.removeEventListener('wheel', zoomTimeline);
  }, [zoomTimeline]);
  const resetChartView = () => {
    setVisibleCount(defaultVisibleCount);
    setViewStart(Math.max(0, displayCandles.length - defaultVisibleCount));
    setPriceScale(1);
  };

  return <div className="backtest-market-chart">
    <div className="backtest-market-ohlc">
      <strong>{instrument.symbol}</strong>
      <span>{activeCandle.time} ET</span>
      <span>O <b>{activeCandle.open.toFixed(2)}</b></span>
      <span>H <b>{activeCandle.high.toFixed(2)}</b></span>
      <span>L <b>{activeCandle.low.toFixed(2)}</b></span>
      <span>C <b className={activeUp ? 'positive' : 'negative'}>{activeCandle.close.toFixed(2)}</b></span>
      <span>VOL <b>{(activeCandle.volume / 1000000).toFixed(2)}M</b></span>
      <span className="market-chart-gesture-hint">휠 확대·축소 · 좌우 드래그 · 가격축 상하 드래그 · 더블클릭 초기화</span>
    </div>
    <div
      ref={canvasRef}
      className={`backtest-candle-canvas ${dragMode ? `is-${dragMode}` : ''}`}
      data-testid="backtest-candle-canvas"
      data-total-candles={displayCandles.length}
      data-visible-candles={visibleCandles.length}
      data-view-start={safeViewStart}
      data-price-scale={priceScale.toFixed(3)}
      onPointerDown={startInteraction}
      onPointerMove={continueInteraction}
      onPointerUp={stopInteraction}
      onPointerCancel={stopInteraction}
      onDoubleClick={resetChartView}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${instrument.symbol} 캔들 차트와 매수 매도 기록`} data-timeframe={timeframe}>
        <rect className="market-price-axis-surface" x={width - right} y="0" width={right} height={height} />
        <line className="market-price-axis-separator" x1={width - right} x2={width - right} y1="0" y2={height} />
        {[0, .25, .5, .75, 1].map((ratio) => {
          const y = chartTop + (chartBottom - chartTop) * ratio;
          const price = domainMax - (domainMax - domainMin) * ratio;
          return <g key={`price-${ratio}`}><line className="market-chart-gridline" x1={left} x2={width - right} y1={y} y2={y} /><text className="market-chart-price" x={width - right + 10} y={y + 3}>{price.toFixed(2)}</text></g>;
        })}
        {[0, .25, .5, .75, 1].map((ratio) => {
          const index = Math.round((visibleCandles.length - 1) * ratio);
          return <line key={`time-${ratio}`} className="market-chart-gridline vertical" x1={xForIndex(index)} x2={xForIndex(index)} y1={chartTop} y2={volumeBottom} />;
        })}
        <line className="market-chart-volume-divider" x1={left} x2={width - right} y1={volumeTop - 12} y2={volumeTop - 12} />
        {visibleCandles.map((candle, index) => {
          const x = xForIndex(index);
          const up = candle.close >= candle.open;
          const bodyTop = priceToY(Math.max(candle.open, candle.close));
          const bodyBottom = priceToY(Math.min(candle.open, candle.close));
          const volumeHeight = (candle.volume / maxVolume) * (volumeBottom - volumeTop);
          return <g key={`${candle.time}-${index}`} className={`market-candle ${up ? 'up' : 'down'}`} data-testid="market-candle">
            <line className="market-candle-wick" x1={x} x2={x} y1={priceToY(candle.high)} y2={priceToY(candle.low)} vectorEffect="non-scaling-stroke" />
            <rect className="market-candle-body" x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(bodyBottom - bodyTop, 2)} />
            <rect className="market-volume-bar" x={x - candleWidth / 2} y={volumeBottom - volumeHeight} width={candleWidth} height={volumeHeight} />
          </g>;
        })}
        {instrument.executions.map((execution) => {
          const displayIndex = Math.round((execution.index / (instrument.candles.length - 1)) * (displayCandles.length - 1));
          if (displayIndex < safeViewStart || displayIndex >= safeViewStart + visibleCandles.length) return null;
          const visibleIndex = displayIndex - safeViewStart;
          const candle = visibleCandles[visibleIndex];
          const x = xForIndex(visibleIndex);
          const isBuy = execution.side === '매수';
          const candleY = isBuy ? priceToY(candle.low) : priceToY(candle.high);
          const y = isBuy ? Math.min(candleY + 28, chartBottom - 13) : Math.max(candleY - 28, chartTop + 13);
          return <g key={execution.id} className={`market-trade-marker ${isBuy ? 'buy' : 'sell'}`} data-testid="trade-marker" data-side={isBuy ? 'buy' : 'sell'}>
            <line x1={x} x2={x} y1={isBuy ? y - 13 : y + 13} y2={candleY} vectorEffect="non-scaling-stroke" />
            <rect x={x - 21} y={y - 11} width="42" height="22" rx="11" />
            <path d={isBuy ? `M ${x - 4} ${y - 10} L ${x} ${y - 15} L ${x + 4} ${y - 10} Z` : `M ${x - 4} ${y + 10} L ${x} ${y + 15} L ${x + 4} ${y + 10} Z`} />
            <text x={x} y={y + 3}>{execution.side}</text>
          </g>;
        })}
        {hoveredIndex !== null && <>
          <line className="market-chart-crosshair" x1={xForIndex(hoveredIndex)} x2={xForIndex(hoveredIndex)} y1={chartTop} y2={volumeBottom} vectorEffect="non-scaling-stroke" />
          <line className="market-chart-crosshair" x1={left} x2={width - right} y1={priceToY(activeCandle.close)} y2={priceToY(activeCandle.close)} vectorEffect="non-scaling-stroke" />
        </>}
        {[0, .25, .5, .75, 1].map((ratio) => {
          const index = Math.round((visibleCandles.length - 1) * ratio);
          return <text key={`label-${ratio}`} className="market-chart-time" x={xForIndex(index)} y={height - 8} textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>{visibleCandles[index].time.replace('07.', '')}</text>;
        })}
      </svg>
    </div>
  </div>;
}

export function BacktestView() {
  const [selectedBotName, setSelectedBotName] = useState(backtestBots[0].name);
  const [selectedSymbol, setSelectedSymbol] = useState(botInstruments[backtestBots[0].name][0].symbol);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [timeframe, setTimeframe] = useState('1일');
  const [activeBenchmarkIds, setActiveBenchmarkIds] = useState([backtestBenchmark.id]);
  const selectedBot = backtestBots.find((bot) => bot.name === selectedBotName) ?? backtestBots[0];
  const activeBenchmarks = backtestBenchmarks.filter((benchmark) => activeBenchmarkIds.includes(benchmark.id));
  const selectedBotInstruments = botInstruments[selectedBot.name];
  const selectedInstrument = selectedBotInstruments.find((instrument) => instrument.symbol === selectedSymbol) ?? selectedBotInstruments[0];
  const filteredInstruments = selectedBotInstruments.filter((instrument) => `${instrument.symbol} ${instrument.name}`.toLowerCase().includes(symbolQuery.trim().toLowerCase()));
  const selectBot = (bot) => {
    setSelectedBotName(bot.name);
    setSelectedSymbol(botInstruments[bot.name][0].symbol);
    setSymbolQuery('');
  };
  const toggleBenchmark = (benchmarkId) => {
    setActiveBenchmarkIds((current) => current.includes(benchmarkId)
      ? current.filter((id) => id !== benchmarkId)
      : [...current, benchmarkId]);
  };
  const columns = [{ key: 'time', label: '시각 (ET)' }, { key: 'symbol', label: '종목' }, { key: 'side', label: '행동', render: (row) => <span className={row.side === '매수' ? 'buy-text' : 'sell-text'}>{row.side}</span> }, { key: 'quantity', label: '수량' }, { key: 'price', label: '체결가' }, { key: 'value', label: '체결 금액' }, { key: 'fee', label: '수수료' }, { key: 'result', label: '결과' }];
  return <Localized><div className="page backtest-page">
    <PageHeading
      eyebrow="BOT PERFORMANCE"
      title="봇 백테스트"
      description="트레이딩 봇별 누적 수익률을 같은 기간의 주요 시장 지수와 직접 비교합니다."
      meta={<Status tone="positive">완료 · 2026 Q3</Status>}
      actions={<Button icon={CalendarDays}>2023 Q3–2026 Q2</Button>}
    />
    <div className="backtest-comparison-workspace" data-testid="backtest-comparison-workspace">
      <Panel className="backtest-performance-panel" title={`${selectedBot.name} vs 시장 지수`} subtitle="2023 Q3–2026 Q2 · 누적 수익률 (%)" action={<div className="backtest-chart-legend" role="group" aria-label="비교 지표 선택">
        <span className="bot"><i />선택한 봇</span>
        {backtestBenchmarks.map((benchmark) => {
          const isActive = activeBenchmarkIds.includes(benchmark.id);
          return <button
            key={benchmark.id}
            type="button"
            className={`benchmark ${benchmark.id}${isActive ? ' active' : ''}`}
            aria-label={`${benchmark.name} 지표 표시`}
            aria-pressed={isActive}
            onClick={() => toggleBenchmark(benchmark.id)}
          ><i />{benchmark.name}</button>;
        })}
      </div>}>
        <BacktestComparisonChart bot={selectedBot} benchmarks={activeBenchmarks} />
      </Panel>
      <aside className="backtest-bot-selector" aria-labelledby="backtest-bot-selector-title">
        <header>
          <div><span>TRADING BOTS</span><h2 id="backtest-bot-selector-title">봇 선택</h2></div>
          <small>{`${backtestBots.length}개 봇 · 동일 기간`}</small>
        </header>
        <div className="backtest-bot-options" role="list" aria-label="백테스트 봇 목록">
          {backtestBots.map((bot) => <div role="listitem" key={bot.name}><button
            className={bot.name === selectedBot.name ? 'active' : ''}
            type="button"
            aria-label={`${bot.name} 백테스트 보기`}
            aria-pressed={bot.name === selectedBot.name}
            onClick={() => selectBot(bot)}
          >
            <span className="backtest-bot-icon"><Bot size={17} /></span>
            <span><strong>{bot.name}</strong><small>{bot.strategy}</small></span>
            <b className={bot.return.startsWith('+') ? 'positive' : 'negative'}>{bot.return}</b>
          </button></div>)}
        </div>
      </aside>
    </div>

    {/* A compact row instead of four 130px cards. The bot and benchmark returns
        used to appear both here and again above the chart. */}
    <MetricRow
      label={`${selectedBot.name} 백테스트 지표`}
      items={[
        { label: '봇 수익률', figure: selectedBot.return, detail: selectedBot.strategy, tone: selectedBot.return.startsWith('+') ? 'positive' : 'negative' },
        { label: 'S&P 500 대비', figure: selectedBot.alpha, detail: `S&P 500 ${backtestBenchmark.return}`, tone: selectedBot.alpha.startsWith('+') ? 'positive' : 'negative' },
        { label: '최대 낙폭', figure: selectedBot.drawdown, detail: '기간 내 고점 대비' },
        { label: '개별 체결', figure: `${selectedBot.trades}건`, detail: '부분 체결 각각 집계' },
      ]}
    />
    <Panel className="backtest-trade-chart-panel" title="종목별 체결 차트" subtitle={`${selectedBot.name} · 조정 가격 · 미국 동부 시각`}>
      <div className="backtest-symbol-toolbar">
        <label className="backtest-symbol-search"><Search size={15} /><input type="search" aria-label="종목 검색" placeholder="티커 또는 종목명 검색" value={symbolQuery} onChange={(event) => setSymbolQuery(event.target.value)} /></label>
        <div className="backtest-symbol-options" role="list" aria-label={`${selectedBot.name} 거래 종목`}>
          {filteredInstruments.map((instrument) => <button
            key={instrument.symbol}
            type="button"
            aria-label={`${instrument.symbol} 종목 선택`}
            aria-pressed={instrument.symbol === selectedInstrument.symbol}
            className={instrument.symbol === selectedInstrument.symbol ? 'active' : ''}
            onClick={() => setSelectedSymbol(instrument.symbol)}
          ><strong>{instrument.symbol}</strong><span>{instrument.name}</span></button>)}
          {filteredInstruments.length === 0 && <small>검색 결과가 없습니다.</small>}
        </div>
      </div>
      <div className="backtest-chart-controls">
        <div className="backtest-timeframe" role="group" aria-label="차트 기간">
          {chartTimeframes.map((option) => <button
            key={option}
            type="button"
            aria-label={`${option} 차트 보기`}
            aria-pressed={timeframe === option}
            className={timeframe === option ? 'active' : ''}
            onClick={() => setTimeframe(option)}
          >{option}</button>)}
        </div>
        <span>조정주가 · USD</span>
      </div>
      <BacktestCandlestickChart key={`${selectedInstrument.symbol}-${timeframe}`} instrument={selectedInstrument} timeframe={timeframe} />

      {/* The log lives in the same panel as the chart it annotates, so the two
          no longer carry separate 72px headers saying the same thing. */}
      <section className="backtest-execution-log" role="region" aria-label={`${selectedInstrument.symbol} 체결 로그`}>
        <header>
          <div><strong>{selectedInstrument.symbol} 매수·매도 로그</strong><small>{selectedInstrument.name} · 차트에 표시된 개별 체결</small></div>
          <span>{selectedInstrument.executions.length}건</span>
        </header>
        {selectedInstrument.executions.length > 0
          ? <DataTable columns={columns} rows={selectedInstrument.executions} rowKey="id" />
          : <EmptyState icon={Coins} title="이 종목에는 체결 기록이 없습니다." detail="다른 종목을 선택하면 해당 종목의 체결 내역을 확인할 수 있습니다." />}
      </section>
    </Panel>
  </div></Localized>;
}

/*
  Official competitions run on their own calendars — a couple of weeks up to a
  full year, and up to eight can be live at once — so there is no shared
  "season" frame: every card carries its own period and D-day.
*/
const officialCompetitions = [
  { name: 'I2S Summer League', bots: 184, ranking: '표준점수제', score: '복합 점수', duration: '3개월', dday: 'D-65', tone: 'standard', official: true, host: 'I2S 운영팀', start: '07.01', end: '09.30' },
  { name: 'Risk Control Cup', bots: 96, ranking: '위험조정 점수제', score: '최대 낙폭', duration: '4주', dday: 'D-15', tone: 'risk', official: true, host: 'I2S 운영팀', start: '07.14', end: '08.11' },
  { name: 'ETF Sprint', bots: 128, ranking: '수익률 점수제', score: '수익률', duration: '2주', dday: 'D-5', tone: 'return', official: true, host: 'I2S 운영팀', start: '07.21', end: '08.01' },
  { name: 'Volatility Shield', bots: 72, ranking: '샤프 점수제', score: '샤프 지수', duration: '1년', dday: 'D-156', tone: 'sharpe', official: true, host: 'I2S 운영팀', start: '01.02', end: '12.30' },
  { name: 'Dividend Marathon', bots: 58, ranking: '위험조정 점수제', score: '최대 낙폭', duration: '6개월', dday: 'D-152', tone: 'risk', official: true, host: 'I2S 운영팀', start: '07.01', end: '12.26' },
  { name: 'Alpha Dash', bots: 41, ranking: '수익률 점수제', score: '수익률', duration: '2주', dday: 'D-12', tone: 'return', official: true, host: 'I2S 운영팀', start: '07.27', end: '08.08' },
];

const officialBotsTotal = officialCompetitions.reduce((total, competition) => total + competition.bots, 0);
const officialLeaderboard = [
  { rank: 1, bot: 'AlphaCore_7X', score: '9,842.15', return: '+28.47%' },
  { rank: 2, bot: 'QuantumFlow', score: '9,215.63', return: '+22.31%' },
  { rank: 3, bot: 'Nimbus_Algo', score: '8,743.28', return: '+19.84%' },
  { rank: 4, bot: 'VectorEdge', score: '8,201.47', return: '+15.73%' },
  { rank: 5, bot: 'AtlasQuant', score: '7,890.54', return: '+13.29%' },
];
const officialChartSeries = [
  { name: 'I2S Summer League', tone: 'standard', points: '16,221 75,216 135,204 194,187 254,163 313,139 373,118 432,98 492,71 551,52 611,37 670,31 724,28', value: '+24.61%' },
  { name: 'Risk Control Cup', tone: 'risk', points: '16,221 75,219 135,210 194,199 254,181 313,166 373,151 432,136 492,117 551,105 611,91 670,83 724,78', value: '+16.38%' },
  { name: 'ETF Sprint', tone: 'return', points: '16,221 75,220 135,216 194,213 254,204 313,198 373,188 432,178 492,167 551,156 611,147 670,140 724,134', value: '+9.21%' },
  { name: 'Volatility Shield', tone: 'sharpe', points: '16,221 75,223 135,222 194,225 254,228 313,226 373,230 432,226 492,229 551,225 611,231 670,227 724,232', value: '-1.84%' },
];

/*
  Deterministic top-5 standings for a room. Rooms have no participant cap —
  `joined` is just how many bots are in right now. `myRank` marks the room the
  person's bot (Room Beta) competes in.
*/
const makeStandings = (roomIndex, kind, myRank = null) => {
  const codes = ['3F9A', '8C21', '11D0', '5E77', '902B', '44AC', '19EE', 'C204', '6B31', '77D8'];
  return Array.from({ length: 5 }, (_, i) => {
    const rank = i + 1;
    const mine = myRank === rank;
    const value = kind === '수익률' ? `+${(14.2 - roomIndex * 0.7 - i * 1.9).toFixed(2)}%`
      : kind === '최대 낙폭' ? `-${(0.62 + roomIndex * 0.08 + i * 0.34).toFixed(2)}%`
      : kind === '샤프 지수' ? (2.41 - roomIndex * 0.05 - i * 0.22).toFixed(2)
      : (88.4 - roomIndex - i * 2.3).toFixed(2);
    return { rank, bot: mine ? 'Room Beta' : `Bot ${codes[(roomIndex + i) % codes.length]}`, value, mine };
  });
};

/*
  User-hosted rooms. There is no participant cap (2026-07-26 product rule), so
  there is no capacity bar and no "정원" anywhere — only how many bots joined.
*/
const competitionRooms = [
  /* Momentum Lab's standings come from the same leaderboard the detail page
     ranks, so the two screens agree on Room Beta's #2. */
  { name: 'Momentum Lab', score: '복합 점수', ranking: '표준점수제', joined: 8, host: '이서준', start: '07.07', end: '08.04', myBot: 'Room Beta', standings: leaderboard.map((entry) => ({ rank: entry.rank, bot: entry.bot, value: entry.score.toFixed(2), mine: entry.mine })) },
  { name: 'ETF Discipline', score: '최대 낙폭', ranking: '위험조정 점수제', joined: 18, host: 'ETF연구회', start: '07.14', end: '08.25', myBot: null, standings: makeStandings(1, '최대 낙폭') },
  { name: 'Quant Study 04', score: '수익률', ranking: '수익률 점수제', joined: 3, host: '박하나', start: '07.21', end: '08.18', myBot: null, standings: makeStandings(2, '수익률') },
  { name: 'Low Volatility Club', score: '샤프 지수', ranking: '샤프 점수제', joined: 24, host: '차분한투자', start: '07.01', end: '09.26', myBot: null, standings: makeStandings(3, '샤프 지수') },
  { name: 'Gap Hunters', score: '수익률', ranking: '수익률 점수제', joined: 15, host: '한지민', start: '07.10', end: '08.07', myBot: null, standings: makeStandings(4, '수익률') },
  { name: 'Macro Pulse', score: '복합 점수', ranking: '표준점수제', joined: 12, host: '거시경제방', start: '07.03', end: '09.11', myBot: null, standings: makeStandings(5, '복합 점수') },
  { name: 'Dividend Guard', score: '샤프 지수', ranking: '샤프 점수제', joined: 7, host: '배당사냥꾼', start: '07.17', end: '08.28', myBot: null, standings: makeStandings(6, '샤프 지수') },
  { name: 'Swing Lab 12', score: '복합 점수', ranking: '표준점수제', joined: 6, host: '윤도현', start: '07.20', end: '08.17', myBot: null, standings: makeStandings(7, '복합 점수') },
  { name: 'Earnings Play', score: '수익률', ranking: '수익률 점수제', joined: 9, host: '실적시즌', start: '07.22', end: '08.12', myBot: null, standings: makeStandings(8, '수익률') },
  { name: 'Slow Turtle', score: '최대 낙폭', ranking: '위험조정 점수제', joined: 5, host: '거북이클럽', start: '07.05', end: '09.20', myBot: null, standings: makeStandings(9, '최대 낙폭') },
  { name: 'Golden Cross Club', score: '복합 점수', ranking: '표준점수제', joined: 4, host: '김골든', start: '07.24', end: '08.21', myBot: null, standings: makeStandings(10, '복합 점수') },
];

const ROOMS_PER_PAGE = 5;

/* 'MM.DD' → comparable number. */
const monthDay = (value) => {
  const [month, day] = value.split('.').map(Number);
  return month * 100 + day;
};

/*
  Column-header sorting, the convention for list views. Each sortable column
  has a natural first direction: names A→Z, periods closing-soonest first,
  participants biggest room first.
*/
const sortableColumns = {
  name: { label: '대회', firstDir: 'asc' },
  end: { label: '기간', firstDir: 'asc' },
  joined: { label: '참여', firstDir: 'desc' },
};

const sortRooms = (list, key, dir) => {
  const sorted = [...list].sort((a, b) => key === 'name'
    ? a.name.localeCompare(b.name)
    : key === 'end' ? monthDay(a.end) - monthDay(b.end) : a.joined - b.joined);
  return dir === 'desc' ? sorted.reverse() : sorted;
};

const rankingToneByLabel = {
  표준점수제: 'standard',
  '위험조정 점수제': 'risk',
  '수익률 점수제': 'return',
  '샤프 점수제': 'sharpe',
};

function CompetitionRankingMethod({ ranking }) {
  // Nested components render after the Localized walk, so translate directly.
  const { t } = useLanguage();
  return <span className="competition-ranking-method">
    <small>{t('채점 방식')}</small>
    <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[ranking] ?? 'standard'}>{t(ranking)}</strong>
  </span>;
}

function OfficialPerformanceChart() {
  // Nested components render after the parent's Localized walk, so each
  // official panel carries its own.
  return <Localized><section className="official-performance-panel" aria-label="공식 대회 성과 차트">
    <header>
      <h2>누적 성과</h2>
      <span>누적 수익률(%)</span>
    </header>
    <div className="official-performance-legend">
      {officialChartSeries.map((series) => <span key={series.name} data-chart-tone={series.tone}><i />{series.name}</span>)}
    </div>
    <div className="official-performance-chart">
      <svg viewBox="0 0 800 260" role="img" aria-label="공식 대회별 누적 수익률 추이" preserveAspectRatio="none">
        {[32, 92, 152, 212].map((y) => <line className="official-chart-gridline" key={y} x1="16" x2="784" y1={y} y2={y} />)}
        {officialChartSeries.map((series) => <g key={series.name} data-chart-tone={series.tone}>
          <polyline className="official-chart-line" points={series.points} />
          <text className="official-chart-value" x="735" y={Number(series.points.split(' ').at(-1).split(',')[1]) + 4}>{series.value}</text>
        </g>)}
      </svg>
      <div className="official-chart-axis"><span>07.01</span><span>07.29</span><span>08.26</span><span>09.23</span><span>09.30</span></div>
    </div>
  </section></Localized>;
}

function OfficialLeaderboard() {
  return <Localized><section className="official-leaderboard-panel" aria-label="공식 대회 전체 순위">
    <header><h2>전체 순위</h2><span>TOP 5</span></header>
    <div className="official-leaderboard-head"><span>순위</span><span>봇 이름</span><span>총점</span><span>수익률</span></div>
    <div className="official-leaderboard-body">
      {officialLeaderboard.map((entry) => <div key={entry.rank}>
        <strong data-rank={entry.rank}>{entry.rank}</strong>
        <span><Bot size={14} />{entry.bot}</span>
        <b>{entry.score}</b>
        <em>{entry.return}</em>
      </div>)}
    </div>
  </section></Localized>;
}

/*
  Compact official card: the scoring method IS the discovery signal, so it
  leads as the tone-coloured badge and the same tone edges the card. Stats
  live on the detail page — a stat block on every card read as clutter.
*/
function OfficialCompetitionGrid({ onSelect, carousel = false }) {
  const { t } = useLanguage();
  return <Localized><div className={`official-competition-list competition-card-grid${carousel ? ' is-carousel' : ''}`} role="list">{officialCompetitions.map((competition) =>
    <div role="listitem" key={competition.name}>
      <article className="competition-discovery-card official-competition-card-tile" data-card-tone={competition.tone} role="button" tabIndex="0" aria-label={`${competition.name} 열기`} onClick={() => onSelect(competition)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(competition);
        }
      }}>
        <strong className="competition-ranking-badge" data-ranking-tone={competition.tone}>{t(competition.ranking)}</strong>
        <h3>{competition.name}</h3>
        <small className="official-card-basis">{`${competition.score} · ${competition.duration}`}</small>
        <footer className="official-card-meta">
          <span>{`${competition.start}–${competition.end}`}</span>
          <b>{competition.dday}</b>
          <em>{`${t('참여')} ${competition.bots}`}</em>
        </footer>
      </article>
    </div>
  )}</div></Localized>;
}

/*
  Every metric a competition ranking can be sorted by. Offering the choice is the
  point: a single composite ranking would read as the product recommending one
  bot over another.
*/
const rankingMetrics = [
  { id: 'score', label: '점수', suffix: '', better: 'high' },
  { id: 'return', label: '수익률', suffix: '%', better: 'high' },
  { id: 'drawdown', label: '최대 낙폭', suffix: '%', better: 'high' },
  { id: 'sharpe', label: '샤프 지수', suffix: '', better: 'high' },
  { id: 'volatility', label: '변동성', suffix: '%', better: 'low' },
  { id: 'winRate', label: '승률', suffix: '%', better: 'high' },
  { id: 'trades', label: '거래 횟수', suffix: '회', better: 'high' },
];

const formatMetric = (entry, metric) => {
  const value = entry[metric.id];
  if (metric.id === 'return' || metric.id === 'winRate') return `${value > 0 ? '+' : ''}${value.toFixed(metric.id === 'return' ? 2 : 1)}${metric.suffix}`;
  if (metric.id === 'drawdown') return `${value.toFixed(2)}${metric.suffix}`;
  if (metric.id === 'volatility') return `${value.toFixed(1)}${metric.suffix}`;
  if (metric.id === 'trades') return `${value}${metric.suffix}`;
  return value.toFixed(2);
};

const competitionConditions = [
  { label: '시작 자본', value: '$10,000', detail: '모든 참가 봇 동일' },
  { label: '종목 범위', value: '미국 상장 주식 · ETF', detail: '레버리지 상품 제외' },
  { label: '비교 기준', value: 'S&P 500', detail: '같은 기간 지수' },
  { label: '체결·비용', value: '수수료 0.2% · 슬리피지 0.05%', detail: '전 참가자 동일 적용' },
];

export function RoomsView() {
  const [query, setQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [roomSort, setRoomSort] = useState({ key: 'joined', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [officialSeasonOpen, setOfficialSeasonOpen] = useState(false);
  const [focusedRoom, setFocusedRoom] = useState(competitionRooms[0]);
  const [sortMetric, setSortMetric] = useState('score');
  const visibleRooms = useMemo(() => sortRooms(competitionRooms.filter((room) => {
    const matchesQuery = room.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesScore = scoreFilter === 'all' || room.score === scoreFilter;
    const matchesSize = sizeFilter === 'all' || (sizeFilter === 'small' ? room.joined <= 10 : room.joined > 10);
    return matchesQuery && matchesScore && matchesSize;
  }), roomSort.key, roomSort.dir), [query, scoreFilter, sizeFilter, roomSort]);
  const toggleRoomSort = (key) => setRoomSort((current) => ({
    key,
    dir: current.key === key ? (current.dir === 'asc' ? 'desc' : 'asc') : sortableColumns[key].firstDir,
  }));
  /* Pagination clamps instead of resetting so a filter change never jumps the
     scroll; an out-of-range page simply lands on the last one. */
  const pageCount = Math.max(1, Math.ceil(visibleRooms.length / ROOMS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageRooms = visibleRooms.slice((safePage - 1) * ROOMS_PER_PAGE, safePage * ROOMS_PER_PAGE);
  const displayedRoom = visibleRooms.find((room) => room.name === focusedRoom?.name) ?? visibleRooms[0] ?? null;
  const myStanding = displayedRoom?.standings?.find((entry) => entry.mine) ?? null;
  const activeMetric = rankingMetrics.find((metric) => metric.id === sortMetric) ?? rankingMetrics[0];
  const rankedEntries = useMemo(() => [...leaderboard].sort((a, b) => activeMetric.better === 'low'
    ? a[activeMetric.id] - b[activeMetric.id]
    : b[activeMetric.id] - a[activeMetric.id]), [activeMetric]);
  const myEntry = rankedEntries.find((entry) => entry.mine);
  const myPosition = myEntry ? rankedEntries.indexOf(myEntry) + 1 : null;

  if (selectedRoom) return <Localized><div className="page competition-page competition-detail-page">
    <section aria-label={`${selectedRoom.name} 상세 페이지`}>
      <button className="competition-back-button" onClick={() => setSelectedRoom(null)}><ArrowLeft size={15} /> 대회 목록으로</button>
      <header className="competition-detail-heading">
        <div><p>COMPETITION DETAIL</p><h1>{selectedRoom.name}</h1></div>
      </header>
      <div className="competition-detail-summary">
        <span><small>운영자</small><strong>{selectedRoom.host}</strong></span>
        <span><small>기간</small><strong>{`${selectedRoom.start} – ${selectedRoom.end}`}</strong></span>
        <span><small>참여 봇</small><strong>{selectedRoom.official ? selectedRoom.bots : selectedRoom.joined}개</strong></span>
        <span><small>채점 방식</small><strong>{selectedRoom.ranking}</strong></span>
      </div>
      <div className="competition-detail-guide">
        <div><Bot size={17} /><span><strong>봇끼리 공정하게 비교합니다.</strong><small>사용자 대신 익명 봇만 순위에 표시됩니다.</small></span></div>
      </div>

      {/* The conditions every entry shares. Without these the ranking is a bare
          list of numbers and there is no way to tell what was held equal. */}
      <div className="competition-conditions" aria-label={`${selectedRoom.name} 공통 조건`}>
        {competitionConditions.map((condition) => <div key={condition.label}>
          <small>{condition.label}</small>
          <strong>{condition.value}</strong>
          <em>{condition.detail}</em>
        </div>)}
      </div>

      <div className="competition-ranking-tools">
        <label>
          <span>정렬 지표</span>
          <select aria-label="정렬 지표 선택" value={sortMetric} onChange={(event) => setSortMetric(event.target.value)}>
            {rankingMetrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
          </select>
        </label>
        {myEntry && <p className="competition-my-position">
          내 봇은 {activeMetric.label} 기준 <strong>{myPosition}위</strong>입니다. 아래 목록에서 강조 표시됩니다.
        </p>}
      </div>

      <div className="competition-ranking is-metric-ranking" aria-label={`${selectedRoom.name} 봇 순위`}>
        <header><span>순위</span><span>봇</span><span>{activeMetric.label}</span><span>수익률</span></header>
        {rankedEntries.map((entry, index) => <div className={entry.mine ? 'is-mine' : ''} key={entry.bot}>
          <strong>#{index + 1}</strong>
          <span>{entry.bot}{entry.mine && <small>내 봇</small>}</span>
          <b>{formatMetric(entry, activeMetric)}</b>
          <span className={entry.return >= 0 ? 'positive' : 'negative'}>{entry.return > 0 ? '+' : ''}{entry.return.toFixed(2)}%</span>
        </div>)}
      </div>
      <p className="competition-ranking-note">순위는 선택한 지표만으로 다시 계산합니다. 어떤 지표가 더 좋은 전략을 뜻하는지는 제품이 판단하지 않습니다.</p>
    </section>
  </div></Localized>;

  if (officialSeasonOpen) return <Localized><div className="page competition-page official-season-page">
    <section aria-label="공식 대회 페이지">
      <button className="competition-back-button" onClick={() => setOfficialSeasonOpen(false)}><ArrowLeft size={15} /> 대회 홈으로</button>
      {/* Official competitions run on their own calendars, so the page-level
          date range and D-day are gone — each card carries its own. */}
      <header className="official-season-page-heading">
        <div><p>OFFICIAL</p><h1>공식 대회</h1></div>
        <span>{`진행 중 ${officialCompetitions.length}개`}</span>
      </header>
      <section className="official-season-rooms" aria-labelledby="official-season-rooms-title">
        <header><h2 id="official-season-rooms-title">진행 중인 대회</h2><span>{officialCompetitions.length}개</span></header>
        <OfficialCompetitionGrid onSelect={setSelectedRoom} />
      </section>
      <div className="official-season-insights">
        <OfficialPerformanceChart />
        <OfficialLeaderboard />
      </div>
    </section>
  </div></Localized>;

  return <Localized><div className="page competition-page competition-lobby-page">
    <PageHeading eyebrow="BOT COMPETITION" title="모의투자" description="같은 규칙에서 봇을 비교하고, 참여할 대회를 빠르게 선택하세요." actions={<Button kind="primary" icon={Plus}>대회 만들기</Button>} />

    {/* Official competitions are the product's real events, so they get a
        branded showcase with compact cards inline — up to eight can run at
        once, each on its own calendar (weeks to a year), so there is no
        shared season frame or season progress. The dedicated page stays
        behind the link for the chart and the full leaderboard. */}
    <section className="official-showcase" aria-labelledby="official-showcase-title">
      <header>
        <div>
          <small><Trophy size={12} aria-hidden="true" /> OFFICIAL · LIVE</small>
          <h2 id="official-showcase-title">공식 대회</h2>
          <p>{`I2S 운영팀이 직접 운영합니다 · 진행 중 ${officialCompetitions.length}개 · 참여 봇 ${officialBotsTotal}개`}</p>
        </div>
        <button type="button" className="official-showcase-link" onClick={() => setOfficialSeasonOpen(true)}>공식 대회 전체 보기 <ArrowUpRight size={14} /></button>
      </header>
      <OfficialCompetitionGrid onSelect={setSelectedRoom} carousel />
    </section>

    <div className="competition-lobby-grid">
      <section className="competition-screener" aria-labelledby="competition-screener-title">
        <header><div><small>DISCOVER</small><h2 id="competition-screener-title">대회 찾기</h2></div><span>{`${visibleRooms.length}개 결과`}</span></header>
        <div className="competition-screener-tools">
          <label><Search size={15} /><input type="search" aria-label="대회 검색" placeholder="대회 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="점수 방식 필터" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}>
            <option value="all">모든 점수 방식</option><option value="복합 점수">복합 점수</option><option value="최대 낙폭">최대 낙폭</option><option value="수익률">수익률</option><option value="샤프 지수">샤프 지수</option>
          </select>
          <select aria-label="참여 규모 필터" value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
            <option value="all">모든 참여 규모</option><option value="small">10봇 이하</option><option value="large">11봇 이상</option>
          </select>
        </div>
        {/* Sorting lives where list views put it: on the column headers.
            Clicking a sortable header sorts by it; clicking again flips. */}
        <div className="competition-screener-head">
          <button type="button" className={roomSort.key === 'name' ? 'is-sorted' : ''} aria-label="대회 이름 정렬" onClick={() => toggleRoomSort('name')}>대회{roomSort.key === 'name' && <i aria-hidden="true">{roomSort.dir === 'asc' ? '▲' : '▼'}</i>}</button>
          <span>채점 방식</span>
          <span>운영자</span>
          <button type="button" className={roomSort.key === 'end' ? 'is-sorted' : ''} aria-label="기간 정렬" onClick={() => toggleRoomSort('end')}>기간{roomSort.key === 'end' && <i aria-hidden="true">{roomSort.dir === 'asc' ? '▲' : '▼'}</i>}</button>
          <button type="button" className={roomSort.key === 'joined' ? 'is-sorted' : ''} aria-label="참여 정렬" onClick={() => toggleRoomSort('joined')}>참여{roomSort.key === 'joined' && <i aria-hidden="true">{roomSort.dir === 'asc' ? '▲' : '▼'}</i>}</button>
        </div>
        <div className="competition-screener-list" role="list" aria-label="대회 탐색 결과">
          {/* Rows carry values only — the header already names the columns. */}
          {pageRooms.map((room) => <button role="listitem" className={displayedRoom?.name === room.name ? 'active' : ''} aria-label={`${room.name} 선택`} key={room.name} onClick={() => setFocusedRoom(room)}>
            <span className="screener-room-name"><i /><strong>{room.name}</strong><small>{room.score}</small></span>
            {/* The scoring method is THE discovery signal, so it wears its
                tone-coloured badge here, not plain text. */}
            <span className="screener-method"><strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[room.ranking] ?? 'standard'}>{room.ranking}</strong></span>
            <span><strong>{room.host}</strong></span>
            <span><strong>{`${room.start}–${room.end}`}</strong></span>
            <span><strong>{room.joined}</strong></span>
            <ArrowUpRight size={14} />
          </button>)}
          {visibleRooms.length === 0 && <div className="competition-empty"><Search size={20} /><strong>조건에 맞는 대회가 없습니다.</strong><button onClick={() => { setQuery(''); setScoreFilter('all'); setSizeFilter('all'); }}>필터 초기화</button></div>}
        </div>
        {pageCount > 1 && <nav className="competition-pagination" aria-label="대회 목록 페이지">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>이전 페이지</button>
          <span aria-hidden="true">{`${safePage} / ${pageCount}`}</span>
          <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>다음 페이지</button>
        </nav>}
      </section>

      {/* The right panel carries what the list cannot: the room's ranking.
          Repeating the row's own facts there was dead weight. What it shows
          depends on whether the person's bot competes in that room. */}
      <aside className="competition-room-inspector" aria-label={displayedRoom ? `${displayedRoom.name} 순위` : '선택된 대회 없음'}>
        {displayedRoom ? <>
          <header>
            <small>RANKING</small>
            <h2>{displayedRoom.name}</h2>
            <p>{`${displayedRoom.score} 기준 상위 봇입니다. 전체 순위는 상세 페이지에서 확인하세요.`}</p>
          </header>
          {displayedRoom.myBot && myStanding
            ? <div className="competition-my-standing">
              <span><small>내 봇</small><strong>{displayedRoom.myBot}</strong></span>
              <b>{`#${myStanding.rank}`}</b>
            </div>
            : <p className="competition-standing-hint">아직 참가하지 않은 대회입니다. 참가하면 내 봇의 순위가 여기에 표시됩니다.</p>}
          <div className="competition-standing-list" role="list" aria-label={`${displayedRoom.name} 상위 순위`}>
            {displayedRoom.standings.map((entry) => <div role="listitem" key={entry.rank} className={entry.mine ? 'is-mine' : ''}>
              <strong>{`#${entry.rank}`}</strong>
              <span>{entry.bot}{entry.mine && <small>내 봇</small>}</span>
              <b>{entry.value}</b>
            </div>)}
          </div>
          <button className="competition-inspector-action" aria-label={`${displayedRoom.name} 열기`} onClick={() => setSelectedRoom(displayedRoom)}>상세 정보 보기 <ArrowUpRight size={15} /></button>
        </> : <div className="competition-inspector-empty"><Search size={20} /><strong>표시할 대회가 없습니다.</strong></div>}
      </aside>
    </div>
  </div></Localized>;
}
