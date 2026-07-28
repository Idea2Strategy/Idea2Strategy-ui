import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, X } from 'lucide-react';
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
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

interface CardPosition {
  x: number;
  y: number;
}

const CARD_WIDTH = 288;
const CARD_HEIGHT = 236;
const CANDLE_COUNT = 120;

const isJsdom = (): boolean => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');

/* 화면 밖으로 나가 다시 잡을 수 없게 되는 일이 없도록 항상 안쪽으로 당긴다. */
const clampToViewport = ({ x, y }: CardPosition): CardPosition => {
  const maxX = Math.max(8, (window.innerWidth || CARD_WIDTH * 3) - CARD_WIDTH - 8);
  const maxY = Math.max(80, (window.innerHeight || CARD_HEIGHT * 3) - CARD_HEIGHT - 8);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(80, y), maxY) };
};

const readColors = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: value('--surface', '#15191b'),
    text: value('--text-faint', '#869495'),
    grid: value('--line', '#293133'),
    price: value('--text-soft', '#9dabac'),
    buy: value('--buy-block-color', 'rgb(240, 66, 81)'),
    sell: value('--sell-block-color', 'rgb(67, 145, 255)'),
    muted: value('--text-faint', '#869495'),
  };
};

const formatPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

/*
  전략 미리보기 (PiP).

  편집기 화면 위에 떠 있는 작은 창으로, 캔버스를 옮기거나 확대해도 제자리에
  남고 사용자가 원하는 자리로 끌어다 둘 수 있다. 블록을 고치는 동안 곁눈질로
  확인하는 것이 목적이라 정보는 최소로 유지한다.

  - 종가 라인 하나만 그린다. 캔들·거래량·지표 그래프는 이 창에서 판단에
    필요하지 않고, 작은 창에서는 오히려 신호 위치를 가린다.
  - 매수·매도 화살표를 함께 두어 "싸게 사서 비싸게 파는" 한 바퀴가 보이게 하고,
    각 신호에 어느 플로우가 만든 것인지 이름을 붙인다.
  - 어떤 조건으로 계산했는지는 플로우 칩을 누르면 한 줄로 확인한다.
  자세한 지표 분석은 백테스트 화면이 담당한다.
*/
export function StrategyPreviewChart({
  partitionLabel,
  symbols,
  flows,
  onClose,
}: StrategyPreviewChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState(symbols[0] ?? 'AAPL');
  const [focusedFlowId, setFocusedFlowId] = useState<string | null>(null);
  const [position, setPosition] = useState<CardPosition>(() => clampToViewport({
    x: (typeof window === 'undefined' ? 1200 : window.innerWidth) - CARD_WIDTH - 28,
    y: 132,
  }));

  /* 파티션 종목이 바뀌면 선택을 유효한 값으로 되돌린다. */
  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbol, symbols]);
  /* 플로우를 지우면 강조도 함께 해제한다. */
  useEffect(() => {
    if (focusedFlowId && !flows.some((flow) => flow.id === focusedFlowId)) setFocusedFlowId(null);
  }, [flows, focusedFlowId]);
  /* 창 크기가 줄어도 카드는 화면 안에 남는다. */
  useEffect(() => {
    const keepInside = () => setPosition((current) => clampToViewport(current));
    window.addEventListener('resize', keepInside);
    return () => window.removeEventListener('resize', keepInside);
  }, []);

  const timeframe = useMemo(
    () => timeframeFromBlocks(flows.flatMap((flow) => flow.blocks)),
    [flows],
  );
  const preview = useMemo(
    () => evaluateStrategyPreview({ symbol, timeframeSeconds: timeframe.seconds, flows, candleCount: CANDLE_COUNT }),
    [flows, symbol, timeframe.seconds],
  );
  /* 플로우가 한쪽에 하나뿐이면 이름을 붙여도 새 정보가 없다. */
  const showFlowNames = preview.flows.filter((flow) => flow.side === 'buy').length > 1
    || preview.flows.filter((flow) => flow.side === 'sell').length > 1;

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampToViewport({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }));
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  /* 포인터를 쓰지 않는 사람도 자리를 옮길 수 있어야 한다. */
  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 12;
    const deltas: Record<string, CardPosition> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    setPosition((current) => clampToViewport({ x: current.x + delta.x, y: current.y + delta.y }));
  };

  const drawChart = useCallback(() => {
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
        },
        grid: { vertLines: { visible: false }, horzLines: { color: colors.grid, style: LineStyle.Dotted } },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: { labelVisible: false },
          horzLine: { labelVisible: true },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.16 } },
        /* 정확한 시각은 참고용 미리보기에서 판단에 쓰이지 않는다. 축을 지우면
           같은 높이에서 라인이 더 크게 보인다. */
        timeScale: { visible: false },
        handleScale: { axisPressedMouseMove: false },
        handleScroll: { vertTouchDrag: false },
        localization: { priceFormatter: (price: number) => `${price.toFixed(0)}` },
      });
      chartRef.current = chart;

      const lineSeries = chart.addSeries(LineSeries, {
        color: colors.price,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerBorderWidth: 1,
        crosshairMarkerRadius: 3,
      });
      lineSeries.setData(preview.candles.map((candle): LineData<Time> => ({
        time: candle.time as UTCTimestamp,
        value: candle.close,
      })));

      /* 강조된 플로우가 있으면 나머지 신호는 흐리게 남긴다. 지우지 않는 이유는
         매수 → 매도 한 바퀴가 계속 보여야 하기 때문이다. */
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
      createSeriesMarkers(lineSeries, markers);
      chart.timeScale().fitContent();
      container.dataset.chart = 'ready';

      const themeRoot = container.closest('.variant-balanced');
      const themeObserver = themeRoot ? new MutationObserver(() => {
        const next = readColors(container);
        chart.applyOptions({
          layout: { background: { type: ColorType.Solid, color: next.background }, textColor: next.text },
          grid: { horzLines: { color: next.grid } },
        });
        lineSeries.applyOptions({ color: next.price });
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
  }, [focusedFlowId, preview, showFlowNames]);

  useEffect(() => drawChart(), [drawChart]);

  const { summary } = preview;
  const focusedFlow = preview.flows.find((flow) => flow.id === focusedFlowId) ?? null;

  return <aside
    className="strategy-preview-card"
    aria-label={t(`${partitionLabel} 전략 미리보기`)}
    data-testid="strategy-preview-panel"
    style={{ left: position.x, top: position.y, width: CARD_WIDTH }}
    /* 캔버스 팬·확대 제스처가 카드로 번지지 않게 막는다. */
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <header className="strategy-preview-card-head">
      <button
        type="button"
        className="strategy-preview-grip"
        aria-label={t('미리보기 위치 이동')}
        data-testid="strategy-preview-grip"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={moveWithKeyboard}
      ><GripVertical size={12} /></button>
      <span className="strategy-preview-title">{partitionLabel}</span>
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
          <small>{timeframe.label}</small>
        </>}
      {preview.unsupported.length > 0 && <small className="strategy-preview-warning">
        {t(`${preview.unsupported.join(', ')} 계산 제외`)}
      </small>}
    </footer>
  </aside>;
}
