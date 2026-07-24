import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Bot, CalendarDays, CheckCircle2, Clock3, Coins, Play, Plus, RefreshCw, Search, Trophy, Users } from 'lucide-react';
import { AreaChart, MiniSpark } from '../components/charts.jsx';
import { Button, DataTable, PageHeading, Panel, StatCard, Status } from '../components/common.jsx';
import { bots, botSeries, leaderboard, positions } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

const botTone = (state) => state === '실행 중' || state === '평가 중' ? 'positive' : 'warning';

export function BotsView() {
  const botColumns = [
    { key: 'name', label: '봇', render: (row) => <span className="entity-cell"><span className="entity-icon"><Bot size={16} /></span><span><strong>{row.name}</strong><small>{row.room}</small></span></span> },
    { key: 'state', label: '상태', render: (row) => <Status tone={botTone(row.state)}>{row.state}</Status> },
    { key: 'capital', label: '총자산' },
    { key: 'change', label: '누적 수익률', render: (row) => <strong className={row.change.startsWith('+') ? 'positive' : 'negative'}>{row.change}</strong> },
    { key: 'strategies', label: '전략' },
  ];
  const positionColumns = [
    { key: 'symbol', label: '종목', render: (row) => <strong>{row.symbol}</strong> },
    { key: 'qty', label: '수량' }, { key: 'avg', label: '평균가' }, { key: 'price', label: '현재가' },
    { key: 'pnl', label: '평가손익', render: (row) => <span className="positive">{row.pnl}</span> }, { key: 'share', label: '비중' },
  ];
  return <Localized><div className="page"><PageHeading eyebrow="LIVE OPERATIONS" title="봇 운영 센터" description="서버에서 실행 중인 봇과 공식 가상 체결 상태를 확인합니다." actions={<><Button icon={RefreshCw}>새로고침</Button><Button kind="primary" icon={Plus}>봇 출시</Button></>} />
    <div className="stats-grid four"><StatCard label="실행 중" value="2 / 10" detail="최대 동시 운영" icon={Play} /><StatCard label="전체 가상자산" value="$54,016.60" detail="3개 봇 합계" trend="+1.11%" icon={Coins} /><StatCard label="오늘 체결" value="07" detail="개별 체결 기준" icon={CheckCircle2} /><StatCard label="확인 기한" value="D−18" detail="Atlas 07 계속 실행" icon={Clock3} /></div>
    <div className="content-grid operations-grid"><Panel className="span-2" title="운영 자산" subtitle="Atlas 07 · 미국 동부 시각 기준" action={<span className="live-pill"><i /> MARKET OPEN</span>}><div className="chart-summary"><strong>$24,892.40</strong><span className="positive">+$450.18 · 1.84%</span></div><AreaChart values={botSeries} label="Atlas 07 자산 변화" /></Panel><Panel title="봇 상태" subtitle="실행·평가·조치 상태"><DataTable columns={botColumns} rows={bots} /></Panel><Panel className="span-2" title="현재 포지션" subtitle="공식 가상 체결 원장 기준"><DataTable columns={positionColumns} rows={positions} /></Panel><Panel title="최근 판단" subtitle="실시간 노드 실행은 표시하지 않습니다"><div className="event-list"><div><span className="event-dot positive" /><strong>SPY 주문 체결</strong><small>10:14:08 ET · 12주</small></div><div><span className="event-dot" /><strong>예산 상한 검사 통과</strong><small>10:14:02 ET · Opening Range</small></div><div><span className="event-dot muted" /><strong>AAPL 조건 미충족</strong><small>10:13:00 ET · 최초 실패 RSI</small></div></div></Panel></div>
  </div></Localized>;
}

const backtestBenchmark = {
  name: 'S&P 500',
  return: '+10.8%',
  values: [0, 0.7, -0.4, 1.2, 2.4, 1.8, 3.7, 4.5, 6.1, 7.4, 8.3, 10.8],
};

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

function BacktestComparisonChart({ bot }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 820;
  const height = 280;
  const combined = [...bot.values, ...backtestBenchmark.values];
  const min = Math.min(...combined, 0) - 2;
  const max = Math.max(...combined, 0) + 2;
  const botPoints = comparisonPoints(bot.values, width, height, min, max);
  const benchmarkPoints = comparisonPoints(backtestBenchmark.values, width, height, min, max);
  const toPolyline = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');
  const zeroY = height - 18 - ((0 - min) / (max - min)) * (height - 36);
  const activeBotPoint = hoveredIndex === null ? null : botPoints[hoveredIndex];
  const activeBenchmarkPoint = hoveredIndex === null ? null : benchmarkPoints[hoveredIndex];
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
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${bot.name}와 S&P 500 누적 수익률 비교`}>
      {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} className="backtest-chart-gridline" x1="18" x2={width - 18} y1={height * ratio} y2={height * ratio} />)}
      <line className="backtest-chart-zero" x1="18" x2={width - 18} y1={zeroY} y2={zeroY} />
      <polyline
        className="backtest-chart-line benchmark"
        points={toPolyline(benchmarkPoints)}
        data-testid="backtest-benchmark-series"
        data-benchmark={backtestBenchmark.name}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="backtest-chart-line bot"
        points={toPolyline(botPoints)}
        data-testid="backtest-bot-series"
        data-bot={bot.name}
        vectorEffect="non-scaling-stroke"
      />
      <circle className="backtest-chart-end benchmark" cx={benchmarkPoints.at(-1)[0]} cy={benchmarkPoints.at(-1)[1]} r="4" vectorEffect="non-scaling-stroke" />
      <circle className="backtest-chart-end bot" cx={botPoints.at(-1)[0]} cy={botPoints.at(-1)[1]} r="5" vectorEffect="non-scaling-stroke" />
      {hoveredIndex !== null && <>
        <line className="backtest-chart-hover-line" x1={activeBotPoint[0]} x2={activeBotPoint[0]} y1="18" y2={height - 18} vectorEffect="non-scaling-stroke" />
        <circle className="backtest-chart-hover-point benchmark" cx={activeBenchmarkPoint[0]} cy={activeBenchmarkPoint[1]} r="5" vectorEffect="non-scaling-stroke" />
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
      <span className="benchmark"><i />S&amp;P 500<b>{backtestBenchmark.values[hoveredIndex] > 0 ? '+' : ''}{backtestBenchmark.values[hoveredIndex].toFixed(1)}%</b></span>
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
  const selectedBot = backtestBots.find((bot) => bot.name === selectedBotName) ?? backtestBots[0];
  const selectedBotInstruments = botInstruments[selectedBot.name];
  const selectedInstrument = selectedBotInstruments.find((instrument) => instrument.symbol === selectedSymbol) ?? selectedBotInstruments[0];
  const filteredInstruments = selectedBotInstruments.filter((instrument) => `${instrument.symbol} ${instrument.name}`.toLowerCase().includes(symbolQuery.trim().toLowerCase()));
  const selectBot = (bot) => {
    setSelectedBotName(bot.name);
    setSelectedSymbol(botInstruments[bot.name][0].symbol);
    setSymbolQuery('');
  };
  const columns = [{ key: 'time', label: '시각 (ET)' }, { key: 'symbol', label: '종목' }, { key: 'side', label: '행동', render: (row) => <span className={row.side === '매수' ? 'buy-text' : 'sell-text'}>{row.side}</span> }, { key: 'quantity', label: '수량' }, { key: 'price', label: '체결가' }, { key: 'value', label: '체결 금액' }, { key: 'fee', label: '수수료' }, { key: 'result', label: '결과' }];
  return <Localized><div className="page backtest-page"><PageHeading eyebrow="BOT PERFORMANCE" title="봇 백테스트" description="트레이딩 봇별 누적 수익률을 같은 기간의 S&P 500과 직접 비교합니다." meta={<Status tone="positive">완료 · 2026 Q3</Status>} actions={<Button icon={CalendarDays}>2023 Q3–2026 Q2</Button>} />
    <div className="backtest-comparison-workspace" data-testid="backtest-comparison-workspace">
      <Panel className="backtest-performance-panel" title={`${selectedBot.name} vs S&P 500`} subtitle="2023 Q3–2026 Q2 · 누적 수익률 (%)">
        <div className="backtest-comparison-summary">
          <div className="is-bot"><span>{selectedBot.name}</span><strong>{selectedBot.return}</strong><small>{selectedBot.strategy}</small></div>
          <div className="is-benchmark"><span>S&P 500</span><strong>{backtestBenchmark.return}</strong><small>시장 기준선</small></div>
          <div className="backtest-chart-legend"><span className="bot"><i />선택한 봇</span><span className="benchmark"><i />S&P 500</span></div>
        </div>
        <BacktestComparisonChart bot={selectedBot} />
      </Panel>
      <aside className="backtest-bot-selector" aria-labelledby="backtest-bot-selector-title">
        <header>
          <div><span>TRADING BOTS</span><h2 id="backtest-bot-selector-title">봇 선택</h2></div>
          <small>{backtestBots.length}개 봇 · 동일 기간</small>
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
    <div className="stats-grid four"><StatCard label="봇 수익률" value={selectedBot.return} detail={selectedBot.strategy} icon={ArrowUpRight} /><StatCard label="S&P 500 대비" value={selectedBot.alpha} detail={`S&P 500 ${backtestBenchmark.return}`} icon={Activity} /><StatCard label="최대 낙폭" value={selectedBot.drawdown} detail="기간 내 고점 대비" icon={CheckCircle2} /><StatCard label="개별 체결" value={String(selectedBot.trades)} detail="부분 체결 각각 집계" icon={Coins} /></div>
    <div className="content-grid backtest-grid">
      <Panel className="span-3 backtest-trade-chart-panel" title="종목별 체결 차트" subtitle={`${selectedBot.name} · 조정 가격 · 미국 동부 시각`}>
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
      </Panel>
      <section className="span-3" role="region" aria-label={`${selectedInstrument.symbol} 체결 로그`}>
        <Panel title={`${selectedInstrument.symbol} 매수·매도 로그`} subtitle={`${selectedInstrument.name} · 차트에 표시된 개별 체결`}>
          <DataTable columns={columns} rows={selectedInstrument.executions} rowKey="id" />
        </Panel>
      </section>
    </div>
  </div></Localized>;
}

const officialCompetitions = [
  { name: 'I2S Summer League', bots: 184, ranking: '표준점수제', score: '복합 점수', submissions: '6,512건', averageReturn: '+12.64%', bestReturn: '+38.21%', tone: 'standard', official: true },
  { name: 'Risk Control Cup', bots: 96, ranking: '위험조정 점수제', score: '최대 낙폭', submissions: '3,742건', averageReturn: '+8.91%', bestReturn: '+26.73%', tone: 'risk', official: true },
  { name: 'ETF Sprint', bots: 128, ranking: '수익률 점수제', score: '수익률', submissions: '5,183건', averageReturn: '+6.47%', bestReturn: '+22.18%', tone: 'return', official: true },
  { name: 'Volatility Shield', bots: 72, ranking: '샤프 점수제', score: '샤프 지수', submissions: '3,305건', averageReturn: '-1.29%', bestReturn: '+11.02%', tone: 'sharpe', official: true },
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

const competitionRooms = [
  { name: 'Momentum Lab', score: '복합 점수', ranking: '표준점수제', people: 10, joined: 8, averageSubmissions: '4.5회', submissions: '36회' },
  { name: 'ETF Discipline', score: '최대 낙폭', ranking: '위험조정 점수제', people: 20, joined: 5, averageSubmissions: '3.8회', submissions: '19회' },
  { name: 'Quant Study 04', score: '수익률', ranking: '수익률 점수제', people: 8, joined: 3, averageSubmissions: '6.0회', submissions: '18회' },
  { name: 'Low Volatility Club', score: '샤프 지수', ranking: '샤프 점수제', people: 30, joined: 24, averageSubmissions: '2.5회', submissions: '60회' },
];

const rankingToneByLabel = {
  표준점수제: 'standard',
  '위험조정 점수제': 'risk',
  '수익률 점수제': 'return',
  '샤프 점수제': 'sharpe',
};

function CompetitionRankingMethod({ ranking }) {
  return <span className="competition-ranking-method">
    <small>순위 산정 방식</small>
    <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[ranking] ?? 'standard'}>{ranking}</strong>
  </span>;
}

function OfficialPerformanceChart() {
  return <section className="official-performance-panel" aria-label="2026 Q3 시즌 성과 차트">
    <header>
      <h2>시즌 성과</h2>
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
  </section>;
}

function OfficialLeaderboard() {
  return <section className="official-leaderboard-panel" aria-label="2026 Q3 전체 순위">
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
  </section>;
}

function OfficialCompetitionGrid({ onSelect }) {
  return <div className="official-competition-list competition-card-grid" role="list">{officialCompetitions.map((competition, index) =>
    <div role="listitem" key={competition.name}>
      <article className="competition-discovery-card official-competition-card-tile" data-card-tone={competition.tone} role="button" tabIndex="0" aria-label={`${competition.name} 열기`} onClick={() => onSelect(competition)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(competition);
        }
      }}>
        <header><h3>{competition.name}</h3><span className="official-competition-index">{String(index + 1).padStart(2, '0')}</span></header>
        <CompetitionRankingMethod ranking={competition.ranking} />
        <div className="competition-card-counts">
          <span><small>참여 봇</small><strong>{competition.bots}개</strong></span>
          <span><small>총 제출</small><strong>{competition.submissions}</strong></span>
          <span><small>평균 수익률</small><strong className={competition.averageReturn.startsWith('+') ? 'positive' : 'negative'}>{competition.averageReturn}</strong></span>
          <span><small>최고 수익률</small><strong className="positive">{competition.bestReturn}</strong></span>
        </div>
      </article>
    </div>
  )}</div>;
}

export function RoomsView() {
  const [query, setQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [officialSeasonOpen, setOfficialSeasonOpen] = useState(false);
  const [focusedRoom, setFocusedRoom] = useState(competitionRooms[0]);
  const visibleRooms = useMemo(() => competitionRooms.filter((room) => {
    const matchesQuery = room.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesScore = scoreFilter === 'all' || room.score === scoreFilter;
    const matchesSize = sizeFilter === 'all' || (sizeFilter === 'small' ? room.people <= 10 : room.people > 10);
    return matchesQuery && matchesScore && matchesSize;
  }), [query, scoreFilter, sizeFilter]);
  const displayedRoom = visibleRooms.find((room) => room.name === focusedRoom?.name) ?? visibleRooms[0] ?? null;

  if (selectedRoom) return <Localized><div className="page competition-page competition-detail-page">
    <section aria-label={`${selectedRoom.name} 상세 페이지`}>
      <button className="competition-back-button" onClick={() => setSelectedRoom(null)}><ArrowLeft size={15} /> Competition 목록으로</button>
      <header className="competition-detail-heading">
        <div><p>COMPETITION DETAIL</p><h1>{selectedRoom.name}</h1></div>
      </header>
      <div className="competition-detail-summary">
        {!selectedRoom.official && <span><small>참여 인원</small><strong>{selectedRoom.people}명</strong></span>}
        <span><small>참여 봇</small><strong>{selectedRoom.official ? selectedRoom.bots : selectedRoom.joined}개</strong></span>
        <span><small>순위 산정 방식</small><strong>{selectedRoom.ranking}</strong></span>
      </div>
      <div className="competition-detail-guide">
        <div><Bot size={17} /><span><strong>봇끼리 공정하게 비교합니다.</strong><small>사용자 대신 익명 봇만 순위에 표시됩니다.</small></span></div>
      </div>
      <div className="competition-ranking" aria-label={`${selectedRoom.name} 봇 순위`}>
        <header><span>순위</span><span>봇</span><span>점수</span><span>수익률</span></header>
        {leaderboard.map((entry) => <div className={entry.mine ? 'is-mine' : ''} key={entry.rank}><strong>#{entry.rank}</strong><span>{entry.bot}{entry.mine && <small>내 봇</small>}</span><b>{entry.score}</b><span className="positive">{entry.return}</span></div>)}
      </div>
    </section>
  </div></Localized>;

  if (officialSeasonOpen) return <Localized><div className="page competition-page official-season-page">
    <section aria-label="2026 Q3 공식 대회 페이지">
      <button className="competition-back-button" onClick={() => setOfficialSeasonOpen(false)}><ArrowLeft size={15} /> Competition으로</button>
      <header className="official-season-page-heading">
        <div><p>OFFICIAL SEASON</p><h1>2026 Q3 공식 대회</h1></div>
        <span>2026.07.01 – 2026.09.30 <strong>D-73</strong></span>
      </header>
      <section className="official-season-rooms" aria-labelledby="official-season-rooms-title">
        <header><h2 id="official-season-rooms-title">공식 대회</h2><span>{officialCompetitions.length}개</span></header>
        <OfficialCompetitionGrid onSelect={setSelectedRoom} />
      </section>
      <div className="official-season-insights">
        <OfficialPerformanceChart />
        <OfficialLeaderboard />
      </div>
    </section>
  </div></Localized>;

  return <Localized><div className="page competition-page competition-lobby-page">
    <PageHeading eyebrow="BOT COMPETITION" title="Competition" description="같은 규칙에서 봇을 비교하고, 참여할 대회를 빠르게 선택하세요." actions={<Button kind="primary" icon={Plus}>Competition 만들기</Button>} />

    <button className="competition-season-command" aria-label="2026 Q3 공식 대회 보러가기" onClick={() => setOfficialSeasonOpen(true)}>
      <span className="season-command-icon"><Trophy size={18} /></span>
      <span className="season-command-title"><small>OFFICIAL SEASON · LIVE</small><strong>2026 Q3 공식 시즌</strong><em><CalendarDays size={12} /> 07.01–09.30</em></span>
      <span className="season-command-progress"><small>시즌 진행률 <b>21%</b></small><i role="progressbar" aria-label="2026 Q3 시즌 진행률" aria-valuemin="0" aria-valuenow="21" aria-valuemax="100"><b style={{ width: '21%' }} /></i></span>
      <span className="season-command-stat"><small>참여 봇</small><strong>{officialBotsTotal}</strong></span>
      <span className="season-command-stat"><small>종료까지</small><strong>D-73</strong></span>
      <span className="season-command-link">공식 시즌 보기 <ArrowUpRight size={15} /></span>
    </button>

    <div className="competition-lobby-grid">
      <section className="competition-screener" aria-labelledby="competition-screener-title">
        <header><div><small>DISCOVER</small><h2 id="competition-screener-title">Competition 찾기</h2></div><span>{visibleRooms.length}개 결과</span></header>
        <div className="competition-screener-tools">
          <label><Search size={15} /><input type="search" aria-label="Competition 검색" placeholder="Competition 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="점수 방식 필터" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}>
            <option value="all">모든 점수 방식</option><option value="복합 점수">복합 점수</option><option value="최대 낙폭">최대 낙폭</option><option value="수익률">수익률</option><option value="샤프 지수">샤프 지수</option>
          </select>
          <select aria-label="참여 인원 필터" value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
            <option value="all">모든 참여 인원</option><option value="small">10명 이하</option><option value="large">11명 이상</option>
          </select>
        </div>
        <div className="competition-screener-head" aria-hidden="true"><span>Competition</span><span>산정 방식</span><span>참여</span><span>제출</span></div>
        <div className="competition-screener-list" role="list" aria-label="Competition 탐색 결과">
          {visibleRooms.map((room) => <button role="listitem" className={displayedRoom?.name === room.name ? 'active' : ''} aria-label={`${room.name} 선택`} key={room.name} onClick={() => setFocusedRoom(room)}>
            <span className="screener-room-name"><i /><strong>{room.name}</strong><small>{room.score}</small></span>
            <span><small>산정 방식</small><strong>{room.ranking}</strong></span>
            <span className="screener-capacity"><small>참여</small><strong>{room.joined} / {room.people}</strong><i><b style={{ width: `${Math.round((room.joined / room.people) * 100)}%` }} /></i></span>
            <span><small>총 제출</small><strong>{room.submissions}</strong></span>
            <ArrowUpRight size={14} />
          </button>)}
          {visibleRooms.length === 0 && <div className="competition-empty"><Search size={20} /><strong>조건에 맞는 Competition이 없습니다.</strong><button onClick={() => { setQuery(''); setScoreFilter('all'); setSizeFilter('all'); }}>필터 초기화</button></div>}
        </div>
      </section>

      <aside className="competition-room-inspector" aria-label={displayedRoom ? `${displayedRoom.name} 선택 정보` : '선택된 Competition 없음'}>
        {displayedRoom ? <>
          <header><small>SELECTED</small><h2>{displayedRoom.name}</h2><p>{displayedRoom.score} 기준으로 익명 봇의 결과를 비교합니다.</p></header>
          <CompetitionRankingMethod ranking={displayedRoom.ranking} />
          <dl>
            <div><dt>참여 봇</dt><dd>{displayedRoom.joined}개</dd></div>
            <div><dt>정원</dt><dd>{displayedRoom.people}명</dd></div>
            <div><dt>평균 제출</dt><dd>{displayedRoom.averageSubmissions}</dd></div>
            <div><dt>총 제출</dt><dd>{displayedRoom.submissions}</dd></div>
          </dl>
          <div className="competition-inspector-note"><Bot size={16} /><span><strong>봇만 순위에 표시됩니다.</strong><small>사용자 이름과 개인 전략은 공개되지 않습니다.</small></span></div>
          <button className="competition-inspector-action" aria-label={`${displayedRoom.name} 열기`} onClick={() => setSelectedRoom(displayedRoom)}>상세 정보 보기 <ArrowUpRight size={15} /></button>
        </> : <div className="competition-inspector-empty"><Search size={20} /><strong>표시할 Competition이 없습니다.</strong></div>}
      </aside>
    </div>
  </div></Localized>;
}
