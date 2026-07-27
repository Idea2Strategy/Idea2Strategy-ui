import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';

export interface LiveExecution {
  time: string;
  side: '매수' | '매도';
  symbol: string;
  quantity: string;
  price: string;
}

interface LiveExecutionChartProps {
  botName: string;
  executions: LiveExecution[];
  symbols: string[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

type TimeframeId = '1m' | '5m' | '1h' | '1d';

interface Timeframe {
  id: TimeframeId;
  label: string;
  seconds: number;
}

interface GeneratedMarket {
  candles: CandlestickData<Time>[];
  volumes: HistogramData<Time>[];
}

const TIMEFRAMES: Timeframe[] = [
  { id: '1m', label: '1분', seconds: 60 },
  { id: '5m', label: '5분', seconds: 300 },
  { id: '1h', label: '1시간', seconds: 3600 },
  { id: '1d', label: '1일', seconds: 86400 },
];

const CANDLE_COUNT = 120;

function numberFromPrice(value: string): number {
  return Number(value.replace(/[$,]/g, '')) || 100;
}

function hashSeed(value: string): number {
  return Array.from(value).reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function generateMarket(symbol: string, seconds: number, referencePrice: number): GeneratedMarket {
  const random = seededRandom(hashSeed(`${symbol}-${seconds}`));
  const end = Math.floor(Date.now() / seconds) * seconds;
  let close = referencePrice * (0.978 + random() * 0.018);
  const candles: CandlestickData<Time>[] = [];
  const volumes: HistogramData<Time>[] = [];

  for (let index = 0; index < CANDLE_COUNT; index += 1) {
    const time = (end - ((CANDLE_COUNT - 1 - index) * seconds)) as UTCTimestamp;
    const open = close;
    const drift = (random() - 0.47) * referencePrice * 0.0028;
    close = Math.max(referencePrice * 0.75, open + drift);
    const spread = referencePrice * (0.0007 + random() * 0.002);
    const high = Math.max(open, close) + spread * random();
    const low = Math.min(open, close) - spread * random();
    const isUp = close >= open;

    candles.push({ time, open, high, low, close });
    volumes.push({
      time,
      value: Math.round(18000 + random() * 92000),
      color: isUp ? 'rgba(240, 66, 81, .28)' : 'rgba(67, 145, 255, .28)',
    });
  }

  return { candles, volumes };
}

function getThemeColors(element: HTMLElement) {
  const style = getComputedStyle(element);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: value('--surface', '#15191b'),
    text: value('--text-faint', '#869495'),
    grid: value('--line', '#293133'),
    buy: value('--buy-block-color', 'rgb(240, 66, 81)'),
    sell: value('--sell-block-color', 'rgb(67, 145, 255)'),
  };
}

export function LiveExecutionChart({
  botName,
  executions,
  symbols,
  symbol,
  onSymbolChange,
}: LiveExecutionChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeId>('1m');
  const [livePrice, setLivePrice] = useState(0);
  const [liveChange, setLiveChange] = useState(0);

  const symbolExecutions = useMemo(
    () => executions.filter((execution) => execution.symbol === symbol),
    [executions, symbol],
  );
  const referencePrice = numberFromPrice(symbolExecutions[0]?.price ?? '$100');
  const selectedTimeframe = TIMEFRAMES.find((item) => item.id === timeframe) ?? TIMEFRAMES[0];
  const generated = useMemo(
    () => generateMarket(symbol, selectedTimeframe.seconds, referencePrice),
    [referencePrice, selectedTimeframe.seconds, symbol],
  );

  useEffect(() => {
    const container = frameRef.current;
    if (!container || navigator.userAgent.toLowerCase().includes('jsdom')) return undefined;

    const colors = getThemeColors(container);
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.grid, style: 1 },
        horzLines: { color: colors.grid, style: 1 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: timeframe !== '1d',
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      localization: { priceFormatter: (price: number) => `$${price.toFixed(2)}` },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.buy,
      downColor: colors.sell,
      borderUpColor: colors.buy,
      borderDownColor: colors.sell,
      wickUpColor: colors.buy,
      wickDownColor: colors.sell,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    candleSeries.setData(generated.candles);
    volumeSeries.setData(generated.volumes);

    const markerIndexes = symbolExecutions.map((_, index) => Math.max(12, CANDLE_COUNT - 22 - (index * 18)));
    const markers: SeriesMarker<Time>[] = symbolExecutions.map((execution, index) => ({
      time: generated.candles[markerIndexes[index]].time,
      position: execution.side === '매수' ? 'belowBar' : 'aboveBar',
      color: execution.side === '매수' ? colors.buy : colors.sell,
      shape: execution.side === '매수' ? 'arrowUp' : 'arrowDown',
      text: `${execution.side} ${execution.quantity}`,
    }));
    createSeriesMarkers(candleSeries, markers, { autoScale: true });
    chart.timeScale().fitContent();

    let tick = 0;
    let lastCandle = { ...generated.candles[generated.candles.length - 1] } as CandlestickData<UTCTimestamp>;
    let lastVolume = { ...generated.volumes[generated.volumes.length - 1] } as HistogramData<UTCTimestamp>;
    const initialClose = lastCandle.close;
    setLivePrice(initialClose);
    setLiveChange(((initialClose / referencePrice) - 1) * 100);
    const random = seededRandom(hashSeed(`${botName}-${symbol}-${timeframe}-live`));

    const timer = window.setInterval(() => {
      tick += 1;
      const startNewBar = tick % 6 === 0;
      const time = (startNewBar
        ? Number(lastCandle.time) + selectedTimeframe.seconds
        : Number(lastCandle.time)) as UTCTimestamp;
      const open = startNewBar ? lastCandle.close : lastCandle.open;
      const close = Math.max(referencePrice * 0.7, lastCandle.close + ((random() - 0.48) * referencePrice * 0.0009));
      const high = Math.max(startNewBar ? open : lastCandle.high, close);
      const low = Math.min(startNewBar ? open : lastCandle.low, close);
      lastCandle = { time, open, high, low, close };
      lastVolume = {
        time,
        value: startNewBar ? Math.round(14000 + random() * 52000) : Number(lastVolume.value) + Math.round(random() * 4500),
        color: close >= open ? 'rgba(240, 66, 81, .28)' : 'rgba(67, 145, 255, .28)',
      };
      candleSeries.update(lastCandle);
      volumeSeries.update(lastVolume);
      setLivePrice(close);
      setLiveChange(((close / referencePrice) - 1) * 100);
    }, 900);

    const themeRoot = container.closest('.variant-balanced');
    const themeObserver = themeRoot ? new MutationObserver(() => {
      const next = getThemeColors(container);
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: next.background }, textColor: next.text },
        grid: { vertLines: { color: next.grid }, horzLines: { color: next.grid } },
        rightPriceScale: { borderColor: next.grid },
        timeScale: { borderColor: next.grid },
      });
      candleSeries.applyOptions({
        upColor: next.buy,
        downColor: next.sell,
        borderUpColor: next.buy,
        borderDownColor: next.sell,
        wickUpColor: next.buy,
        wickDownColor: next.sell,
      });
    }) : null;
    themeObserver?.observe(themeRoot!, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.clearInterval(timer);
      themeObserver?.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [botName, generated, referencePrice, selectedTimeframe.seconds, symbol, symbolExecutions, timeframe]);

  return <section className="bots-live-chart" role="region" aria-label={`${botName} 실시간 체결 차트`}>
    <header className="bots-live-chart-head">
      <div>
        <span className="bots-live-kicker"><i aria-hidden="true" />실시간 데모</span>
        <h3>{symbol} 실시간 차트</h3>
        <small>체결 판단과 시세 흐름을 한 화면에서 확인합니다.</small>
      </div>
      <div className="bots-live-quote" aria-live="polite">
        <strong>{livePrice > 0 ? `$${livePrice.toFixed(2)}` : symbolExecutions[0]?.price}</strong>
        <span className={liveChange >= 0 ? 'positive' : 'negative'}>
          {livePrice > 0 ? `${liveChange >= 0 ? '+' : ''}${liveChange.toFixed(2)}%` : '연결 중'}
        </span>
      </div>
    </header>

    <div className="bots-live-toolbar">
      <div className="bots-live-symbols" role="group" aria-label="체결 종목 선택">
        {symbols.map((item) => <button
          key={item}
          type="button"
          aria-label={`${item} 차트 보기`}
          aria-pressed={symbol === item}
          className={symbol === item ? 'active' : ''}
          onClick={() => onSymbolChange(item)}
        >{item}</button>)}
      </div>
      <div className="bots-live-timeframes" role="group" aria-label="차트 시간 단위">
        {TIMEFRAMES.map((item) => <button
          key={item.id}
          type="button"
          aria-pressed={timeframe === item.id}
          className={timeframe === item.id ? 'active' : ''}
          onClick={() => setTimeframe(item.id)}
        >{item.label}</button>)}
        <button type="button" className="bots-live-realtime" onClick={() => chartRef.current?.timeScale().scrollToRealTime()}>
          실시간으로 이동
        </button>
      </div>
    </div>

    <div ref={frameRef} className="bots-live-chart-frame" data-testid="live-candlestick-canvas" />

    <footer className="bots-live-chart-foot">
      <div className="bots-live-markers" aria-label={`${symbol} 차트 체결 표시`}>
        {symbolExecutions.map((execution) => <span
          key={`${execution.time}-${execution.side}`}
          className={execution.side === '매수' ? 'is-buy' : 'is-sell'}
          data-testid="live-trade-marker"
          data-side={execution.side}
        >
          <i aria-hidden="true" />
          {`${execution.time} · ${execution.side} ${execution.quantity} ${execution.price}`}
        </span>)}
      </div>
      <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
        Powered by TradingView Lightweight Charts
      </a>
    </footer>
  </section>;
}
