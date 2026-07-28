import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { evaluateStrategyPreview } from '../lib/strategyPreview';
import type { PreviewBlock } from '../lib/strategyPreview';
import { Localized } from '../lib/i18n';

export interface StrategyPreviewChartProps {
  partitionLabel: string;
  symbols: string[];
  buyBlocks: PreviewBlock[];
  sellBlocks: PreviewBlock[];
  onClose: () => void;
}

type TimeframeId = '1m' | '5m' | '1h' | '1d';

const TIMEFRAMES: Array<{ id: TimeframeId; label: string; seconds: number }> = [
  { id: '1m', label: '1분', seconds: 60 },
  { id: '5m', label: '5분', seconds: 300 },
  { id: '1h', label: '1시간', seconds: 3600 },
  { id: '1d', label: '1일', seconds: 86400 },
];

/* 오버레이 선 색은 카테고리 톤에서 가져와 라이트·다크 모두에서 대비를 지킨다. */
const OVERLAY_COLOR_VARS = ['--tone-indicator', '--tone-data', '--tone-return', '--tone-sharpe'];

const isJsdom = (): boolean => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');

/* 캔버스는 CSS 함수를 해석하지 못하므로 투명도를 직접 계산해 넘긴다. */
const withAlpha = (color: string, alpha: number): string => {
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [red, green, blue] = rgb[1].split(',').map((part) => Number.parseFloat(part));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const readColors = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: value('--surface', '#15191b'),
    text: value('--text-faint', '#869495'),
    grid: value('--line', '#293133'),
    line: value('--line-strong', '#3a4548'),
    buy: value('--buy-block-color', 'rgb(240, 66, 81)'),
    sell: value('--sell-block-color', 'rgb(67, 145, 255)'),
    overlays: OVERLAY_COLOR_VARS.map((name, index) => value(name, ['#a78bfa', '#38bdf8', '#e4b76a', '#b69ae2'][index])),
  };
};

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/*
  파티션 구성 그대로 시세 위에 매수·매도 시점을 그리는 미리보기.

  블록을 추가하거나 값을 바꾸면 부모가 새 blocks 배열을 내려주고, 신호가 다시
  계산되어 마커와 지표가 그 자리에서 갱신된다. 사용자는 저장이나 백테스트를
  거치지 않고도 자기 조건이 언제 걸리는지 눈으로 확인할 수 있다.
*/
export function StrategyPreviewChart({
  partitionLabel,
  symbols,
  buyBlocks,
  sellBlocks,
  onClose,
}: StrategyPreviewChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h');
  const [symbol, setSymbol] = useState(symbols[0] ?? 'AAPL');

  /* 파티션 종목이 바뀌면 선택을 유효한 값으로 되돌린다. */
  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbol, symbols]);

  const seconds = TIMEFRAMES.find((item) => item.id === timeframe)?.seconds ?? 3600;
  const preview = useMemo(
    () => evaluateStrategyPreview({ symbol, timeframeSeconds: seconds, buyBlocks, sellBlocks }),
    [buyBlocks, sellBlocks, seconds, symbol],
  );

  useEffect(() => {
    const container = frameRef.current;
    if (!container || isJsdom()) return undefined;
    /* 차트 라이브러리가 실패해도 편집기는 계속 쓸 수 있어야 하므로, 실패를
       화면과 콘솔에 남기고 편집 흐름은 막지 않는다. */
    try {
    container.dataset.chart = 'mounting';

    const colors = readColors(container);
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: 'Pretendard, Inter, sans-serif',
        fontSize: 11,
        panes: { separatorColor: colors.line, separatorHoverColor: colors.line, enableResize: true },
      },
      grid: {
        vertLines: { color: colors.grid, style: LineStyle.Dotted },
        horzLines: { color: colors.grid, style: LineStyle.Dotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.1, bottom: 0.22 } },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: timeframe !== '1d',
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 7,
        minBarSpacing: 1,
      },
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
      priceLineVisible: false,
    });
    candleSeries.setData(preview.candles.map((candle): CandlestickData<Time> => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    volumeSeries.setData(preview.candles.map((candle): HistogramData<Time> => ({
      time: candle.time as UTCTimestamp,
      value: candle.volume,
      color: withAlpha(candle.close >= candle.open ? colors.buy : colors.sell, 0.26),
    })));

    /* 가격축 오버레이는 캔들과 같은 칸, 0~100 계열은 아래 칸에 그린다. */
    let overlayColorIndex = 0;
    let lowerPaneIndex = 1;
    preview.overlays.forEach((overlay) => {
      const paneIndex = overlay.pane === 'price' ? 0 : lowerPaneIndex;
      if (overlay.pane === 'lower') lowerPaneIndex += 1;
      overlay.lines.forEach((line) => {
        const color = colors.overlays[overlayColorIndex % colors.overlays.length];
        overlayColorIndex += 1;
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: overlay.pane === 'lower',
          crosshairMarkerVisible: false,
          title: line.name,
        }, paneIndex);
        series.setData(line.values.reduce<LineData<Time>[]>((points, value, index) => {
          if (value !== null) points.push({ time: preview.candles[index].time as UTCTimestamp, value });
          return points;
        }, []));
        if (overlay.pane === 'lower' && overlay.guides) {
          overlay.guides.forEach((guide) => series.createPriceLine({
            price: guide,
            color: colors.line,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '',
          }));
        }
      });
      if (overlay.pane === 'lower') {
        chart.panes()[paneIndex]?.setHeight(88);
      }
    });

    const markers: SeriesMarker<Time>[] = preview.markers.map((marker) => ({
      time: preview.candles[marker.index].time as UTCTimestamp,
      position: marker.side === 'buy' ? 'belowBar' : 'aboveBar',
      color: marker.side === 'buy' ? colors.buy : colors.sell,
      shape: marker.side === 'buy' ? 'arrowUp' : 'arrowDown',
      text: marker.side === 'buy' ? '매수' : '매도',
    }));
    createSeriesMarkers(candleSeries, markers);
    chart.timeScale().fitContent();
    container.dataset.chart = 'ready';

    const themeRoot = container.closest('.variant-balanced');
    const themeObserver = themeRoot ? new MutationObserver(() => {
      const next = readColors(container);
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
    themeObserver?.observe(themeRoot!, { attributes: true, attributeFilter: ['class', 'data-palette'] });

    return () => {
      themeObserver?.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    } catch (error) {
      container.dataset.chart = `error: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[strategy preview] 차트를 그리지 못했습니다.', error);
      return undefined;
    }
  }, [preview, timeframe]);

  const { summary } = preview;

  return <Localized><section
    className="strategy-preview-panel"
    role="region"
    aria-label={`${partitionLabel} 전략 미리보기 차트`}
    data-testid="strategy-preview-panel"
    /* 캔버스 팬·확대 제스처가 차트로 넘어오지 않도록 여기서 멈춘다. */
    onPointerDown={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <header className="strategy-preview-head">
      <div>
        <span className="strategy-preview-kicker">전략 미리보기 · 예시 시세</span>
        <h3>{`${partitionLabel} · ${symbol}`}</h3>
      </div>
      <div className="strategy-preview-controls">
        <div className="strategy-preview-symbols" role="group" aria-label="미리보기 종목 선택">
          {symbols.map((item) => <button
            key={item}
            type="button"
            aria-label={`${item} 미리보기`}
            aria-pressed={symbol === item}
            className={symbol === item ? 'active' : ''}
            onClick={() => setSymbol(item)}
          >{item}</button>)}
        </div>
        <div className="strategy-preview-timeframes" role="group" aria-label="미리보기 시간 단위">
          {TIMEFRAMES.map((item) => <button
            key={item.id}
            type="button"
            aria-label={`${item.label} 봉`}
            aria-pressed={timeframe === item.id}
            className={timeframe === item.id ? 'active' : ''}
            onClick={() => setTimeframe(item.id)}
          >{item.label}</button>)}
        </div>
        <button type="button" className="strategy-preview-close" aria-label="미리보기 닫기" onClick={onClose}><X size={15} /></button>
      </div>
    </header>

    <div className="strategy-preview-rules">
      <p className="is-buy"><b>매수</b>{preview.buyRule ? preview.markers.find((marker) => marker.side === 'buy')?.reason ?? '조건 계산됨' : '계산할 수 있는 지표 블록이 없어요'}</p>
      <p className="is-sell"><b>매도</b>{preview.sellRule ? preview.markers.find((marker) => marker.side === 'sell')?.reason ?? '조건 계산됨' : '계산할 수 있는 지표 블록이 없어요'}</p>
    </div>

    <div ref={frameRef} className="strategy-preview-frame" data-testid="strategy-preview-canvas" />

    <dl className="strategy-preview-summary" aria-label="미리보기 신호 요약">
      <div><dt>매수 신호</dt><dd data-testid="preview-buy-count">{`${summary.buyCount}회`}</dd></div>
      <div><dt>매도 신호</dt><dd data-testid="preview-sell-count">{`${summary.sellCount}회`}</dd></div>
      <div><dt>완료 매매</dt><dd>{`${summary.tradeCount}회`}</dd></div>
      <div><dt>승률</dt><dd>{summary.winRate === null ? '—' : `${summary.winRate.toFixed(0)}%`}</dd></div>
      <div>
        <dt>누적 수익률</dt>
        <dd className={summary.totalReturnPct >= 0 ? 'positive' : 'negative'}>
          {summary.tradeCount === 0 ? '—' : formatPercent(summary.totalReturnPct)}
        </dd>
      </div>
    </dl>

    <footer className="strategy-preview-foot">
      {preview.unsupported.length > 0 && <span className="strategy-preview-warning">
        {`${preview.unsupported.join(', ')} 블록은 아직 미리보기에서 계산하지 않아요`}
      </span>}
      <span>블록을 바꾸면 이 화면에서 바로 다시 계산합니다. 실제 시장 데이터가 아닌 예시 시세입니다.</span>
    </footer>
  </section></Localized>;
}
