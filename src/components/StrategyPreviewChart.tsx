import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, X } from 'lucide-react';
import { PREVIEW_WINDOW, evaluateStrategyPreview } from '../lib/strategyPreview';
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

const CARD_WIDTH = 320;
/* 첫 렌더에서 아직 실측할 수 없을 때 쓰는 근사 높이. 이후에는 실제 높이로 잡는다. */
const CARD_HEIGHT = 264;

/* SVG 좌표계. 카드가 늘어나도 선 굵기는 유지하고 도형만 늘어난다. */
const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 110;
const PAD_X = 9;
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

/*
  신호 화살표.

  주식 차트의 관례를 그대로 따른다. 매수는 체결 지점 아래에서 위를 향하고,
  매도는 위에서 아래를 향한다. 가격 움직임을 가리지 않도록 살짝 띄우되, 곁눈질로
  보이도록 선 굵기보다 확실히 큰 크기를 준다.
*/
const MARKER_HALF_WIDTH = 5;
const MARKER_HEAD_HEIGHT = 4;
const MARKER_HEIGHT = 9;
const MARKER_GAP = 4;

/*
  화면 밖으로 나가 다시 잡을 수 없게 되는 일이 없도록 항상 안쪽으로 당긴다.
  카드 높이는 종목 선택 줄이나 경고 줄에 따라 달라지므로 실측값을 받는다.
*/
const clampToViewport = ({ x, y }: CardPosition, height = CARD_HEIGHT): CardPosition => {
  const maxX = Math.max(8, (window.innerWidth || CARD_WIDTH * 3) - CARD_WIDTH - 8);
  const maxY = Math.max(80, (window.innerHeight || height * 3) - height - 8);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(80, y), maxY) };
};

const money = (value: number): string => `$${value.toFixed(2)}`;
const percent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

/*
  전략 미리보기 PiP 창.

  편집기 화면 위에 떠서 캔버스를 옮기거나 확대해도 자리를 지키고, 그립을 잡아
  원하는 위치로 옮긴다. 블록을 고치는 동안 곁눈질로 확인하는 용도라 정보는
  최소로 둔다.

  차트는 인라인 SVG 하나다. 종가 선과 매수·매도 화살표만 그리므로 차트
  라이브러리가 필요하지 않고, 색은 테마 토큰을 그대로 쓰며 테스트에서도 선과
  신호를 그대로 확인할 수 있다. 기간은 최근 1개월 고정이며 선택 UI를 두지
  않는다. 지표 그래프와 상세 분석은 백테스트 화면이 담당한다.
*/
export function StrategyPreviewChart({
  partitionLabel,
  symbols,
  flows,
  onClose,
}: StrategyPreviewChartProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState(symbols[0] ?? 'AAPL');
  const [focusedFlowId, setFocusedFlowId] = useState<string | null>(null);
  const [position, setPosition] = useState<CardPosition>(() => clampToViewport({
    x: (typeof window === 'undefined' ? 1200 : window.innerWidth) - CARD_WIDTH - 28,
    y: (typeof window === 'undefined' ? 720 : window.innerHeight) - CARD_HEIGHT - 28,
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
  const keepInside = (next: CardPosition): CardPosition =>
    clampToViewport(next, cardRef.current?.offsetHeight || CARD_HEIGHT);
  useEffect(() => {
    const onResize = () => setPosition((current) => keepInside(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    setPosition((current) => clampToViewport(current, cardRef.current?.offsetHeight || CARD_HEIGHT));
  }, [flows.length, symbols.length]);

  const preview = useMemo(() => evaluateStrategyPreview({ symbol, flows }), [flows, symbol]);

  const geometry = useMemo(() => {
    const closes = preview.candles.map((candle) => candle.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const xFor = (index: number) => PAD_X + (index / Math.max(1, closes.length - 1)) * (VIEW_WIDTH - PAD_X * 2);
    const yFor = (value: number) => PAD_TOP + (1 - (value - min) / range) * (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM);
    const points = closes.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`).join(' ');
    return {
      xFor,
      yFor,
      line: points,
      area: `${PAD_X},${VIEW_HEIGHT} ${points} ${VIEW_WIDTH - PAD_X},${VIEW_HEIGHT}`,
      last: { x: xFor(closes.length - 1), y: yFor(closes[closes.length - 1]), value: closes[closes.length - 1] },
    };
  }, [preview.candles]);

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
    setPosition(keepInside({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }));
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
    setPosition((current) => keepInside({ x: current.x + delta.x, y: current.y + delta.y }));
  };

  const { summary } = preview;
  const focusedFlow = preview.flows.find((flow) => flow.id === focusedFlowId) ?? null;
  /* 완료된 매매가 없으면 수익률은 아직 판단할 수 없으므로 색도 중립으로 둔다. */
  const returnTone = summary.tradeCount === 0
    ? 'neutral'
    : (summary.totalReturnPct >= 0 ? 'positive' : 'negative');
  const returnLabel = summary.tradeCount === 0 ? '—' : percent(summary.totalReturnPct);

  return <aside
    ref={cardRef}
    className="strategy-preview-card"
    aria-label={t(`${partitionLabel} 전략 미리보기`)}
    data-testid="strategy-preview-panel"
    style={{ left: position.x, top: position.y, width: CARD_WIDTH }}
    /* 캔버스 팬·확대 제스처가 카드로 번지지 않게 막는다. */
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <header className="strategy-preview-head">
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
      ><GripVertical size={13} /></button>
      <div className="strategy-preview-identity">
        <strong>{symbol}</strong>
        <small>{partitionLabel}</small>
      </div>
      <span className={`strategy-preview-return ${returnTone}`} data-testid="preview-return">{returnLabel}</span>
      <button type="button" className="strategy-preview-close" aria-label={t('미리보기 닫기')} onClick={onClose}><X size={13} /></button>
    </header>

    {symbols.length > 1 && <div className="strategy-preview-symbols" role="group" aria-label={t('미리보기 종목 선택')}>
      {symbols.map((item) => <button
        key={item}
        type="button"
        aria-label={t(`${item} 미리보기`)}
        aria-pressed={symbol === item}
        className={symbol === item ? 'active' : ''}
        onClick={() => setSymbol(item)}
      >{item}</button>)}
    </div>}

    <div className="strategy-preview-frame" data-testid="strategy-preview-canvas">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={t(`${symbol} 최근 1개월 종가와 신호`)}>
        <defs>
          <linearGradient id="strategy-preview-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--text-soft)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--text-soft)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon className="strategy-preview-area" points={geometry.area} fill="url(#strategy-preview-fill)" />
        <polyline className="strategy-preview-line" points={geometry.line} vectorEffect="non-scaling-stroke" />
        {preview.markers.map((marker) => {
          const dimmed = focusedFlowId !== null && marker.flowId !== focusedFlowId;
          /* 신호는 다음 봉 시가에 체결되므로, 화살표도 조건이 걸린 봉이 아니라
             실제로 사고팔린 지점에 찍는다. 값도 그 체결가다. */
          const fillIndex = Math.min(marker.index + 1, preview.candles.length - 1);
          const x = geometry.xFor(fillIndex);
          /* 기준선은 체결가와 주변 종가 중 화살표가 놓이는 쪽 끝이다. 체결가만
             보고 띄우면 그 구간에서 선이 화살표를 넘어와 매수가 선 위에 찍히는
             일이 생긴다. 매수는 늘 아래, 매도는 늘 위여야 한다. */
          const nearby = [
            marker.price,
            ...preview.candles.slice(Math.max(0, fillIndex - 1), fillIndex + 2).map((candle) => candle.close),
          ].map(geometry.yFor);
          const y = marker.side === 'buy' ? Math.max(...nearby) : Math.min(...nearby);
          const tip = marker.side === 'buy' ? y + MARKER_GAP : y - MARKER_GAP;
          const shoulder = marker.side === 'buy' ? tip + MARKER_HEAD_HEIGHT : tip - MARKER_HEAD_HEIGHT;
          const base = marker.side === 'buy' ? tip + MARKER_HEIGHT : tip - MARKER_HEIGHT;
          return <polygon
            key={`${marker.side}-${marker.index}`}
            className={`strategy-preview-marker is-${marker.side} ${dimmed ? 'is-dimmed' : ''}`}
            data-testid={`preview-marker-${marker.side}`}
            data-flow={marker.flowId}
            vectorEffect="non-scaling-stroke"
            points={`${x},${tip} ${x - MARKER_HALF_WIDTH},${shoulder} ${x - MARKER_HALF_WIDTH},${base} ${x + MARKER_HALF_WIDTH},${base} ${x + MARKER_HALF_WIDTH},${shoulder}`}
          ><title>{t(`${marker.flowLabel} · ${marker.reason} · ${money(marker.price)}`)}</title></polygon>;
        })}
        <circle className="strategy-preview-end" cx={geometry.last.x} cy={geometry.last.y} r="2.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="strategy-preview-last">{money(geometry.last.value)}</span>
    </div>

    {/* 어느 플로우가 몇 번 주문을 만들었는지. 누르면 그 플로우만 진하게 남는다. */}
    <div className="strategy-preview-flows" role="group" aria-label={t('신호를 만든 플로우')}>
      {preview.flows.map((flow) => <button
        key={flow.id}
        type="button"
        className={`is-${flow.side} ${focusedFlowId === flow.id ? 'active' : ''}`}
        aria-label={t(`${flow.label} 신호만 강조`)}
        aria-pressed={focusedFlowId === flow.id}
        data-testid={`preview-flow-${flow.id}`}
        onClick={() => setFocusedFlowId((current) => current === flow.id ? null : flow.id)}
      >
        <i aria-hidden="true" />
        {flow.label}
        <b>{flow.rule ? flow.count : '—'}</b>
      </button>)}
    </div>

    <p className="strategy-preview-note" data-testid="preview-note">
      {/* 숫자는 라벨과 떼어 둔다. 번역이 개수에 걸리지 않고, 곁눈질로도 숫자만
          바로 읽힌다. */}
      {focusedFlow
        /* 조건 문장·신호 이유는 엔진이 만든 문자열이라 Localized가 지나가지
           않는다. 화면에 내보내는 지점에서 직접 번역한다. */
        ? t(focusedFlow.description ?? '계산할 수 있는 지표 블록이 없어요')
        : <>
          <span data-testid="preview-buy-count">{t('매수')} <b>{summary.buyCount}</b></span>
          <span data-testid="preview-sell-count">{t('매도')} <b>{summary.sellCount}</b></span>
          <span>{t('완료')} <b>{summary.tradeCount}</b></span>
          <em>{t(PREVIEW_WINDOW.label)}</em>
        </>}
    </p>

    {preview.unsupported.length > 0 && <p className="strategy-preview-warning">
      {t(`${preview.unsupported.join(', ')} 블록은 계산에서 제외했어요`)}
    </p>}
  </aside>;
}
