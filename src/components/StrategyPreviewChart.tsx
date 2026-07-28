import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { evaluateStrategyPreview, timeframeFromBlocks } from '../lib/strategyPreview';
import type { PreviewFlow } from '../lib/strategyPreview';
import { useLanguage } from '../lib/i18n';

export interface StrategyPreviewChartProps {
  partitionLabel: string;
  symbols: string[];
  flows: PreviewFlow[];
  onClose: () => void;
}

/* 오버레이 선 색은 카테고리 톤에서 가져와 라이트·다크 모두에서 대비를 지킨다. */
const OVERLAY_COLOR_VARS = ['--tone-indicator', '--tone-data', '--tone-return', '--tone-sharpe'];

const isJsdom = (): boolean => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');

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
    muted: value('--text-faint', '#869495'),
    overlays: OVERLAY_COLOR_VARS.map((name, index) => value(name, ['#a78bfa', '#38bdf8', '#e4b76a', '#b69ae2'][index])),
  };
};

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

/*
  파티션 옆에 붙는 작은 참고용 미리보기.

  블록을 고치는 동안 곁눈질로 확인하는 것이 목적이라 최소 정보만 둔다. 시간
  단위는 전략이 선언한 데이터 블록에서 그대로 가져오고, 종목만 고를 수 있게 한다.

  매수와 매도를 한 화면에 함께 두는 것이 핵심이다. 플로우를 하나씩 따로 보면
  "싸게 사서 비싸게 파는" 한 바퀴가 보이지 않기 때문에, 파티션 전체를 그린 뒤
  각 신호에 어느 플로우가 만든 것인지 이름을 붙인다. 플로우 칩을 누르면 그
  플로우의 신호만 진하게 남고 나머지는 흐려지므로, 한 바퀴를 유지한 채로 특정
  플로우만 골라 볼 수 있다.
*/
export function StrategyPreviewChart({
  partitionLabel,
  symbols,
  flows,
  onClose,
}: StrategyPreviewChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState(symbols[0] ?? 'AAPL');
  const [focusedFlowId, setFocusedFlowId] = useState<string | null>(null);

  /* 파티션 종목이 바뀌면 선택을 유효한 값으로 되돌린다. */
  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbol, symbols]);
  /* 플로우를 지우면 강조도 함께 해제한다. */
  useEffect(() => {
    if (focusedFlowId && !flows.some((flow) => flow.id === focusedFlowId)) setFocusedFlowId(null);
  }, [flows, focusedFlowId]);

  const timeframe = useMemo(
    () => timeframeFromBlocks(flows.flatMap((flow) => flow.blocks)),
    [flows],
  );
  const preview = useMemo(
    () => evaluateStrategyPreview({ symbol, timeframeSeconds: timeframe.seconds, flows, candleCount: 120 }),
    [flows, symbol, timeframe.seconds],
  );
  /* 플로우가 한쪽에 하나뿐이면 이름을 붙여도 새 정보가 없다. */
  const showFlowNames = preview.flows.filter((flow) => flow.side === 'buy').length > 1
    || preview.flows.filter((flow) => flow.side === 'sell').length > 1;

  useEffect(() => {
    const container = frameRef.current;
    if (!container || isJsdom()) return undefined;
    /* 차트 라이브러리가 실패해도 편집은 계속돼야 하므로 실패를 기록만 한다. */
    try {
      container.dataset.chart = 'mounting';
      const colors = readColors(container);
      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.text,
          fontFamily: 'Pretendard, Inter, sans-serif',
          fontSize: 9,
          panes: { separatorColor: colors.grid, separatorHoverColor: colors.line, enableResize: false },
        },
        grid: { vertLines: { visible: false }, horzLines: { color: colors.grid, style: LineStyle.Dotted } },
        crosshair: { mode: CrosshairMode.Magnet },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.14 } },
        timeScale: {
          borderVisible: false,
          timeVisible: timeframe.seconds < 86400,
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: 3,
          minBarSpacing: 1,
        },
        handleScale: { axisPressedMouseMove: false },
        localization: { priceFormatter: (price: number) => `${price.toFixed(0)}` },
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
        lastValueVisible: false,
      });
      candleSeries.setData(preview.candles.map((candle): CandlestickData<Time> => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })));

      /* 오실레이터는 아래 얇은 판 하나에만 모아 그린다. 작은 카드에 판을 여러
         개 쌓으면 캔들이 사라져 미리보기의 의미가 없어진다. */
      let overlayColorIndex = 0;
      let lowerPaneUsed = false;
      preview.overlays.forEach((overlay) => {
        if (overlay.pane === 'lower' && lowerPaneUsed) return;
        const paneIndex = overlay.pane === 'price' ? 0 : 1;
        if (overlay.pane === 'lower') lowerPaneUsed = true;
        overlay.lines.forEach((line) => {
          const color = colors.overlays[overlayColorIndex % colors.overlays.length];
          overlayColorIndex += 1;
          const series = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          }, paneIndex);
          series.setData(line.values.reduce<LineData<Time>[]>((points, value, index) => {
            if (value !== null) points.push({ time: preview.candles[index].time as UTCTimestamp, value });
            return points;
          }, []));
          if (overlay.pane === 'lower' && overlay.guides) {
            overlay.guides.forEach((guide) => series.createPriceLine({
              price: guide,
              color: colors.grid,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: false,
              title: '',
            }));
          }
        });
        if (overlay.pane === 'lower') chart.panes()[1]?.setHeight(46);
      });

      /* 강조된 플로우가 있으면 나머지 신호는 흐리게 남긴다. 지우지 않는 이유는
         한 바퀴(매수 → 매도)의 흐름이 계속 보여야 하기 때문이다. */
      const markers: SeriesMarker<Time>[] = preview.markers.map((marker) => {
        const dimmed = focusedFlowId !== null && marker.flowId !== focusedFlowId;
        return {
          time: preview.candles[marker.index].time as UTCTimestamp,
          position: marker.side === 'buy' ? 'belowBar' : 'aboveBar',
          color: dimmed ? colors.muted : (marker.side === 'buy' ? colors.buy : colors.sell),
          shape: marker.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: showFlowNames && !dimmed ? marker.flowLabel : '',
          size: dimmed ? 0.6 : 1,
        };
      });
      createSeriesMarkers(candleSeries, markers);
      chart.timeScale().fitContent();
      container.dataset.chart = 'ready';

      const themeRoot = container.closest('.variant-balanced');
      const themeObserver = themeRoot ? new MutationObserver(() => {
        const next = readColors(container);
        chart.applyOptions({
          layout: { background: { type: ColorType.Solid, color: next.background }, textColor: next.text },
          grid: { horzLines: { color: next.grid } },
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
  }, [focusedFlowId, preview, showFlowNames, timeframe.seconds]);

  const { summary } = preview;
  const focusedFlow = preview.flows.find((flow) => flow.id === focusedFlowId) ?? null;

  return <aside
    className="strategy-preview-card"
    aria-label={t(`${partitionLabel} 전략 미리보기`)}
    data-testid="strategy-preview-panel"
    /* 캔버스 팬·확대와 파티션 선택 제스처가 카드로 번지지 않게 막는다. */
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <header className="strategy-preview-card-head">
      <div className="strategy-preview-symbols" role="group" aria-label={t('미리보기 종목 선택')}>
        {symbols.map((item) => <button
          key={item}
          type="button"
          aria-label={t(`${item} 미리보기`)}
          aria-pressed={symbol === item}
          className={symbol === item ? 'active' : ''}
          onClick={() => setSymbol(item)}
        >{item}</button>)}
      </div>
      <span className="strategy-preview-bar">{timeframe.label}</span>
      <button type="button" className="strategy-preview-close" aria-label={t('미리보기 닫기')} onClick={onClose}><X size={12} /></button>
    </header>

    <div ref={frameRef} className="strategy-preview-frame" data-testid="strategy-preview-canvas" />

    {/* 어느 플로우가 몇 번 주문을 만들었는지. 누르면 그 플로우만 진하게 남는다. */}
    <div className="strategy-preview-flows" role="group" aria-label={t('신호를 만든 플로우')}>
      {preview.flows.map((flow) => <button
        key={flow.id}
        type="button"
        className={`is-${flow.side} ${focusedFlowId === flow.id ? 'active' : ''}`}
        aria-label={t(`${flow.label} 신호만 강조`)}
        aria-pressed={focusedFlowId === flow.id}
        data-testid={`preview-flow-${flow.id}`}
        title={flow.description ?? t('계산할 수 있는 지표 블록이 없어요')}
        onClick={() => setFocusedFlowId((current) => current === flow.id ? null : flow.id)}
      >
        <i aria-hidden="true">{flow.side === 'buy' ? '▲' : '▼'}</i>
        {flow.label}
        <b>{flow.rule ? flow.count : '—'}</b>
      </button>)}
    </div>

    <footer className="strategy-preview-card-foot">
      {focusedFlow
        ? <span className="strategy-preview-focus">{focusedFlow.description ?? t('계산할 수 있는 지표 블록이 없어요')}</span>
        : <>
          <span className="strategy-preview-counts">
            <b className="is-buy" data-testid="preview-buy-count">{`▲ ${summary.buyCount}`}</b>
            <b className="is-sell" data-testid="preview-sell-count">{`▼ ${summary.sellCount}`}</b>
          </span>
          <span className={summary.totalReturnPct >= 0 ? 'positive' : 'negative'}>
            {summary.tradeCount === 0 ? t('완료된 매매 없음') : formatPercent(summary.totalReturnPct)}
          </span>
        </>}
      {preview.unsupported.length > 0 && <small className="strategy-preview-warning">
        {t(`${preview.unsupported.join(', ')} 계산 제외`)}
      </small>}
    </footer>
  </aside>;
}
