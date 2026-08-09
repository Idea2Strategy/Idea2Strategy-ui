import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowDown, ArrowLeft, ArrowUp, BarChart3, BellRing, Boxes, CalendarDays, CandlestickChart, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CircleDot, Copy, Gauge, GitBranch, Grid3X3, GripVertical, History, Import, Layers3, LayoutGrid, Link2, LockKeyhole, Minus, Mouse, MousePointer2, Pencil, Play, Plus, Redo2, RefreshCw, Repeat2, Rocket, Save, Scale, Search, Settings2, ShieldCheck, Sparkles, Split, Star, Target, Timer, Trash2, TrendingDown, TrendingUp, TriangleAlert, Undo2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { strategies } from '../data/mockData';
import type { StrategySummary } from '../data/mockData';
import { Button, EmptyState, ErrorState, LoadingState, PageHeading, Panel, Status } from '../components/common';
import { ErrorPage, SignInRequiredPage } from '../components/StatePages';
import { splitPartitionSymbols } from '../lib/strategyPreview';
import type { PreviewCandle, PreviewFlow } from '../lib/strategyPreview';
import { StrategyPreviewChart } from '../components/StrategyPreviewChart';
import { defaultMarketDataClient } from '../api/marketData';
import type { MarketDataClient } from '../api/marketData';
import { Localized } from '../lib/i18n';
import { browserSessionStore } from '../lib/session';
import { setSessionAccessToken } from '../api/sessionAccessToken';
import { PRO_EDITOR_AVAILABLE } from '../lib/proEditorAccess';
import {
  getBasicSectionLayout,
  getDefaultBasicCardPosition,
  getMovedBasicCardPosition,
  getStrategyCanvasWheelZoom,
} from '../lib/strategyCanvasLayout';
import type { CanvasPoint, CanvasSize, CardMoveGesture } from '../lib/strategyCanvasLayout';
import { defaultStrategyAuthoringClient, defaultStrategyCatalogClient, defaultStrategyLibraryClient, STRATEGY_LIBRARY_PAGE_SIZE, StrategyApiError } from '../api/strategies';
import type { BasicCatalogInstrument, BasicStrategyCatalog, StrategyAuthoringClient, StrategyCatalogClient, StrategyLibraryClient, StrategyLibraryItem, StrategyReleaseInputs, StrategyValidationResult } from '../api/strategies';

type EditorMode = 'basic' | 'pro';
type EditorLoadFailure = 'sign-in' | 'missing' | 'conflict' | 'transport' | 'unreadable';

const waitForLeaseRelease = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    window.clearTimeout(timer);
    reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  };
  const timer = window.setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, 150);
  signal.addEventListener('abort', onAbort, { once: true });
});

async function acquireLeaseAfterNavigation(
  client: StrategyAuthoringClient,
  strategyId: string,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await client.acquireLease(strategyId, signal);
    } catch (error) {
      const releaseMayStillBeFinishing = error instanceof StrategyApiError && error.status === 409 && attempt < 3;
      if (!releaseMayStillBeFinishing) throw error;
      await waitForLeaseRelease(signal);
    }
  }
  throw new Error('Strategy edit lease retry exhausted');
}

type Side = 'buy' | 'sell' | 'risk';
type BlockTone =
  | 'data'
  | 'indicator'
  | 'condition'
  | 'logic'
  | 'time'
  | 'order'
  | 'risk'
  | 'neutral'
  | 'universe'
  | 'portfolio'
  | 'buy'
  | 'sell';

interface BasicBlock {
  id: string;
  icon?: LucideIcon;
  label: string;
  op?: string;
  value?: string;
  // 일부 블록(가격 변화율)은 비교 기준(전일 종가·장 시작가·평균 진입가)을 함께 고른다.
  base?: string;
  tone: BlockTone;
}

interface StrategySection {
  id: string;
  symbol: string;
  instrumentIds?: string[];
  allocation: number;
  timeframe: string;
  x: number;
  y: number;
  // Explicit drawn/resized size; getSectionLayout floors these to the minimum
  // that keeps the required-buy prompt visible and to the current card content.
  width?: number;
  height?: number;
  cards: Record<Side, string[]>;
  cardOrder: string[];
  cardPositions: Record<string, CanvasPoint>;
}

interface StrategyTemplate {
  id: string;
  name: string;
  category: string;
  indicator: string;
  buyIndicator?: string;
  sellIndicator?: string;
  buyTitle?: string;
  sellTitle?: string;
  buyTone?: BlockTone;
  sellTone?: BlockTone;
  includeSell?: boolean;
  buyBlocks?: StrategyTemplateBlock[];
  sellBlocks?: StrategyTemplateBlock[];
  // 매수 컨테이너를 '주기마다' 진입(정기·적립식 매수)으로 만드는 패키지. 조건 블록
  // 없이 지정 주기에만 매수한다.
  buyCycle?: BuyCycle;
  description: string;
}

interface StrategyTemplateBlock {
  label: string;
  tone: BlockTone;
}

interface BlockLibraryCategory {
  name: string;
  tone: BlockTone;
  items: string[];
}

interface CardMeta {
  title: string;
  detail: string;
  explanation: string;
}

// 지정 주기마다 조건을 확인하는 단위(정기·적립식 매수의 주기).
type BuyCycle = '매 거래일' | '매주 첫 거래일' | '매월 첫 거래일' | '매월 마지막 거래일' | 'N거래일마다';
// 실행(진입/매도) 후 다시 조건을 확인하기까지의 대기 방식.
type RerunWait = '조건 재충족' | 'N봉 이후' | 'N거래일 이후';

interface BuyContainerSettings {
  maxOrderPercent: number;
  // 진입 방식은 셋 중 하나만 고른다. '스케줄(주기마다)'과 '재진입 대기'는 모두
  // "언제 다시 조건을 확인해 진입할지"를 정하므로 상호 배타 모드로 통합했다.
  //   1회만        - 조건 충족 시 한 번만 진입
  //   주기마다      - 지정 주기에 조건 확인(조건 없으면 정기·적립식 매수)
  //   대기 후 재진입 - 진입 후 대기 기간을 두고 조건을 재확인
  entryMode: '1회만' | '주기마다' | '대기 후 재진입';
  cycle: BuyCycle;          // 주기마다 → 확인 주기
  cycleInterval: number;    // N거래일마다 → 간격(거래일)
  reentryWait: RerunWait;   // 대기 후 재진입 → 대기 방식
  reentryInterval: number;  // N봉/N거래일 이후 → 간격
  maxEntries: number;       // 주기마다·대기 후 재진입 공통 → 한 포지션 최대 진입 횟수
}

const createDefaultBuySettings = (): BuyContainerSettings => ({
  maxOrderPercent: 100,
  entryMode: '1회만',
  cycle: '매 거래일',
  cycleInterval: 2,
  reentryWait: '조건 재충족',
  reentryInterval: 1,
  maxEntries: 2,
});

interface SellContainerSettings {
  sellPercent: number | '';
  // 매도에는 주기 개념이 없어 1회만 / 대기 후 재실행 두 모드만 둔다.
  executeMode: '1회만' | '대기 후 재실행';
  reexecWait: RerunWait;
  reexecInterval: number;
  maxExecutions: number;
}

const createDefaultSellSettings = (): SellContainerSettings => ({
  sellPercent: '',
  executeMode: '1회만',
  reexecWait: '조건 재충족',
  reexecInterval: 1,
  maxExecutions: 2,
});

interface BasicEditorSnapshot {
  sections: StrategySection[];
  cardBlocks: Record<string, BasicBlock[]>;
  cardMeta: Record<string, CardMeta>;
  buySettings: Record<string, BuyContainerSettings>;
  sellSettings: Record<string, SellContainerSettings>;
  symbolLimits: Record<string, Record<string, number>>;
}

const cloneBasicEditorSnapshot = (snapshot: BasicEditorSnapshot): BasicEditorSnapshot => ({
  sections: snapshot.sections.map((section) => ({
    ...section,
    instrumentIds: [...(section.instrumentIds ?? [])],
    cards: {
      buy: [...section.cards.buy],
      sell: [...section.cards.sell],
      risk: [...section.cards.risk],
    },
    cardOrder: [...section.cardOrder],
    cardPositions: Object.fromEntries(
      Object.entries(section.cardPositions).map(([cardId, position]) => [cardId, { ...position }]),
    ),
  })),
  cardBlocks: Object.fromEntries(
    Object.entries(snapshot.cardBlocks).map(([cardId, blocks]) => [
      cardId,
      blocks.map((block) => ({ ...block })),
    ]),
  ),
  cardMeta: Object.fromEntries(
    Object.entries(snapshot.cardMeta).map(([cardId, meta]) => [cardId, { ...meta }]),
  ),
  buySettings: Object.fromEntries(
    Object.entries(snapshot.buySettings).map(([cardId, settings]) => [cardId, { ...settings }]),
  ),
  sellSettings: Object.fromEntries(
    Object.entries(snapshot.sellSettings).map(([cardId, settings]) => [cardId, { ...settings }]),
  ),
  symbolLimits: Object.fromEntries(
    Object.entries(snapshot.symbolLimits).map(([sectionId, limits]) => [sectionId, { ...limits }]),
  ),
});

interface StrategyListItem extends StrategySummary {
  id: string;
  symbols: string[];
  kind: StrategyLibraryItem['kind'];
  editable: boolean;
}

type LibraryDragPayload =
  | { type: 'template'; template: StrategyTemplate }
  | { type: 'block'; label: string; tone: BlockTone };

interface ValidationIssue {
  id: string;
  sectionId: string | null;
  cardId: string | null;
  message: string;
}

interface SaveFeedback {
  tone: 'positive' | 'warning';
  title: string;
  detail: string;
}

interface DraftRect extends CanvasPoint, CanvasSize {}

interface SectionMoveGesture extends CardMoveGesture {
  sectionId: string;
  historyRecorded?: boolean;
}

interface SectionResizeGesture {
  sectionId: string;
  startX: number;
  startY: number;
  originWidth: number;
  originHeight: number;
  historyRecorded?: boolean;
}

// Floor for a partition: 420 is the tightest width that still keeps every header
// button on one row (below it the header wraps and would overlap the content),
// and the height fits the top-left required-buy prompt with an even bottom gap
// (slot top 136 + slot min-height 170 + ~24 section padding).
// 헤더(핸들·정보·설정·버튼)가 한 줄에 들어가는 최소 폭. 이보다 좁히면 헤더가
// 줄바꿈되어 높아지고 required-buy-slot과 겹친다.
const MIN_SECTION_WIDTH = 420;
const MIN_SECTION_HEIGHT = 330;

interface CardMoveState extends CardMoveGesture {
  sectionId: string;
  cardId: string;
  historyRecorded?: boolean;
}

interface BlockRuleInput {
  id?: string;
  label: string;
  op?: string;
  value?: string;
  tone?: BlockTone;
}

const statusTone = (state: string) => state === '출시 가능' ? 'positive' : 'warning';

interface StrategyHomeProps {
  openEditor: (mode: EditorMode, blank?: boolean, strategyId?: string) => void;
  client?: StrategyLibraryClient | null;
  authoringClient?: StrategyAuthoringClient | null;
}

const automaticStrategyLibraryClient = import.meta.env.MODE === 'test'
  ? null
  : defaultStrategyLibraryClient;

const automaticStrategyAuthoringClient = import.meta.env.MODE === 'test'
  ? null
  : defaultStrategyAuthoringClient;

const automaticStrategyCatalogClient = import.meta.env.MODE === 'test'
  ? null
  : defaultStrategyCatalogClient;

const strategyListItem = (item: StrategyLibraryItem): StrategyListItem => ({
  id: item.id,
  name: item.name,
  mode: item.mode === 'BASIC' ? 'Basic' : 'Pro',
  state: item.validationStatus === 'VALID' ? '출시 가능' : '미완성',
  updated: item.updatedAt.slice(0, 10),
  blocks: item.blockCount,
  backtest: item.backtestStatus === 'COMPLETED' || item.backtestStatus === 'AVAILABLE'
    ? '완료'
    : item.backtestStatus ? '진행 중' : '데이터 없음',
  symbols: item.symbols,
  kind: item.kind,
  editable: item.editable,
});

export function StrategyHome({ openEditor, client = automaticStrategyLibraryClient, authoringClient = automaticStrategyAuthoringClient }: StrategyHomeProps) {
  const prototypeItems = useMemo<StrategyListItem[]>(() => strategies.map((strategy, index) => ({
    ...strategy,
    id: `strategy-${index}`,
    symbols: index === 0 ? ['AAPL', 'MSFT'] : index === 1 ? ['SPY', 'QQQ'] : ['NVDA'],
    kind: 'draft',
    editable: true,
  })), []);
  const [items, setItems] = useState<StrategyListItem[] | null>(() => client ? null : prototypeItems);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'basic' | 'pro'>('all');
  const [state, setState] = useState<'all' | 'launchable' | 'incomplete'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const confirmedItemsRef = useRef<StrategyListItem[] | null>(null);
  const [draftName, setDraftName] = useState('새 Basic 전략');
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copyPendingId, setCopyPendingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StrategyListItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDeleteStrategy = Boolean(authoringClient?.deleteStrategy) || client === null;
  /* The library API pages with an opaque snapshot cursor. Holding the cursor keeps
     every page from the same instant, so appending cannot duplicate or skip a row. */
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [morePending, setMorePending] = useState(false);

  useEffect(() => {
    if (!client) {
      setItems(prototypeItems);
      setLibraryError(null);
      return undefined;
    }
    setItems(confirmedItemsRef.current);
    setLibraryError(null);
    setSignInRequired(false);
    setNextCursor(null);
    const controller = new AbortController();
    void client.list(STRATEGY_LIBRARY_PAGE_SIZE, undefined, controller.signal)
      .then((page) => {
        const confirmedItems = page.items.map(strategyListItem);
        confirmedItemsRef.current = confirmedItems;
        setItems(confirmedItems);
        setNextCursor(page.hasMore ? page.nextCursor : null);
        setLibraryError(null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setItems(confirmedItemsRef.current);
        // A 401 is the server working as designed, not a failure.
        if (error instanceof StrategyApiError && error.status === 401) {
          setSignInRequired(true);
          return;
        }
        setLibraryError('전략 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      });
    return () => controller.abort();
  }, [client, prototypeItems, libraryAttempt]);

  const loadMoreStrategies = async () => {
    if (!client || !nextCursor || morePending) return;
    setMorePending(true);
    try {
      const page = await client.list(STRATEGY_LIBRARY_PAGE_SIZE, nextCursor);
      const appended = [...(confirmedItemsRef.current ?? []), ...page.items.map(strategyListItem)];
      confirmedItemsRef.current = appended;
      setItems(appended);
      setNextCursor(page.hasMore ? page.nextCursor : null);
      setLibraryError(null);
    } catch (error) {
      if (error instanceof StrategyApiError && error.status === 401) {
        setSignInRequired(true);
        return;
      }
      setLibraryError('다음 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setMorePending(false);
    }
  };

  const filteredItems = useMemo(() => (items ?? []).filter((strategy) => {
    const matchesQuery = strategy.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesMode = mode === 'all' || strategy.mode.toLowerCase() === mode;
    const matchesState = state === 'all'
      || (state === 'launchable' ? strategy.state === '출시 가능' : strategy.state === '미완성');
    return matchesQuery && matchesMode && matchesState;
  }), [items, mode, query, state]);

  const launchableCount = (items ?? []).filter((strategy) => strategy.state === '출시 가능').length;
  const incompleteCount = (items ?? []).filter((strategy) => strategy.state === '미완성').length;

  const beginBasicStrategy = async () => {
    if (!authoringClient) {
      setShowCreate(false);
      openEditor('basic', true);
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const created = await authoringClient.createBasic(draftName.trim() || '새 Basic 전략');
      setShowCreate(false);
      openEditor('basic', true, created.id);
    } catch {
      setCreateError('새 전략을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setCreatePending(false);
    }
  };

  const copyOwnedStrategy = async (strategy: StrategyListItem) => {
    if (strategy.kind !== 'draft' || !strategy.editable) return;
    if (!authoringClient) {
      setShowCreate(false);
      setShowImport(false);
      openEditor(strategy.mode.toLowerCase() as EditorMode, false);
      return;
    }
    setCopyPendingId(strategy.id);
    setCopyError(null);
    try {
      const copied = await authoringClient.copyStrategy(strategy.id);
      setShowCreate(false);
      setShowImport(false);
      openEditor(strategy.mode.toLowerCase() as EditorMode, false, copied.id);
    } catch (error) {
      setCopyError(error instanceof StrategyApiError && error.status === 404
        ? '복사할 전략을 찾을 수 없습니다. 최신 목록을 다시 불러와 주세요.'
        : '전략을 복사하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setCopyPendingId(null);
    }
  };

  const deleteOwnedStrategy = async () => {
    if (!deleteTarget || !canDeleteStrategy || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      if (authoringClient?.deleteStrategy) {
        await authoringClient.deleteStrategy(deleteTarget.id);
      }
      const remaining = (confirmedItemsRef.current ?? items ?? [])
        .filter((strategy) => strategy.id !== deleteTarget.id);
      confirmedItemsRef.current = remaining;
      setItems(remaining);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof StrategyApiError && error.status === 404
        ? '이 전략은 이미 삭제되었거나 더 이상 접근할 수 없습니다.'
        : '전략을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletePending(false);
    }
  };

  /*
    Nothing to show at all — signed out, or the first load failed. The whole
    route renders the one shared state page; no page scaffold survives around
    it, so every screen fails the same way.
  */
  if (signInRequired && items === null) {
    return <SignInRequiredPage />;
  }
  if (libraryError && items === null) {
    return <ErrorPage
      title="전략 목록을 불러오지 못했습니다."
      detail="잠시 후 다시 시도해 주세요."
      onRetry={() => setLibraryAttempt((attempt) => attempt + 1)}
    />;
  }

  return <Localized><div className="page balanced-strategy-home">
    <PageHeading
      eyebrow="STRATEGY DESK / PRIVATE"
      title="전략"
      description="작성 중인 전략을 이어가거나 새 전략을 시작하세요."
      actions={<Button kind="primary" icon={Plus} onClick={() => setShowCreate(true)}>새 전략</Button>}
    />

    <div className="balanced-strategy-grid is-list-only">
      <section className="strategy-library panel">
        {libraryError && items !== null && <ErrorState
          title="마지막으로 확인한 전략 목록을 표시합니다."
          detail="최신 목록을 불러오지 못해 이전에 서버에서 확인한 결과를 유지합니다."
        />}
        {items === null && !libraryError && !signInRequired && <LoadingState label="전략 목록을 불러오는 중입니다." />}
        {copyError && <ErrorState title={copyError} onRetry={() => setCopyError(null)} retryLabel="닫기" />}
        {items !== null && <>
        <header className="strategy-library-head">
          <div className="strategy-title-group"><div><h2>내 전략</h2><span>{filteredItems.length}</span></div><div className="strategy-counts" data-testid="strategy-counts"><span>전체 <b>{items.length}{nextCursor ? '+' : ''}</b></span><span>출시 가능 <b>{launchableCount}</b></span><span>미완성 <b>{incompleteCount}</b></span></div></div>
          <label className="strategy-search"><Search size={16} /><input type="search" aria-label="전략 검색" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </header>
        <div className="strategy-filter-row">
          <div className="strategy-filter-group" aria-label="전략 모드 필터">
            <button className={mode === 'all' ? 'active' : ''} aria-label="전체 전략 보기" onClick={() => setMode('all')}>전체</button>
            <button className={mode === 'basic' ? 'active' : ''} aria-label="Basic 전략만 보기" onClick={() => setMode('basic')}>Basic</button>
            <button className={mode === 'pro' ? 'active' : ''} aria-label="Pro 전략만 보기" onClick={() => setMode('pro')}>Pro</button>
          </div>
          <div className="strategy-filter-group is-secondary" aria-label="전략 상태 필터">
            <button className={state === 'all' ? 'active' : ''} onClick={() => setState('all')}>모든 상태</button>
            <button className={state === 'launchable' ? 'active' : ''} onClick={() => setState('launchable')}>출시 가능</button>
            <button className={state === 'incomplete' ? 'active' : ''} onClick={() => setState('incomplete')}>미완성</button>
          </div>
        </div>
        <div className="strategy-rows" data-testid="strategy-list">
          {filteredItems.map((strategy) => <article
            className="strategy-row"
            key={strategy.id}
            data-testid={`strategy-row-${strategy.name}`}
          >
            <span className={`strategy-mode-icon mode-${strategy.mode.toLowerCase()}`} aria-hidden="true">{strategy.mode[0]}</span>
            <div className="strategy-row-main"><strong>{strategy.name}</strong><span>{[strategy.symbols.join(' · '), strategy.updated].filter(Boolean).join(' · ')}</span></div>
            <span className="strategy-mode-label">{strategy.mode}</span>
            <Status tone={statusTone(strategy.state)}>{strategy.state}</Status>
            <div className="strategy-row-actions">
              {strategy.kind === 'draft' && strategy.editable && <button
                aria-label={`${strategy.name} 복사`}
                title="복사"
                disabled={copyPendingId !== null}
                onClick={(event) => { event.stopPropagation(); void copyOwnedStrategy(strategy); }}
              >{copyPendingId === strategy.id ? <RefreshCw className="is-spinning" size={15} /> : <Copy size={15} />}</button>}
              {strategy.kind === 'draft' && strategy.editable && canDeleteStrategy && <button
                className="is-danger"
                aria-label={`${strategy.name} 삭제`}
                title="삭제"
                disabled={deletePending}
                onClick={(event) => { event.stopPropagation(); setDeleteError(null); setDeleteTarget(strategy); }}
              ><Trash2 size={15} /></button>}
              <button
                aria-label={strategy.mode === 'Pro' && !PRO_EDITOR_AVAILABLE ? `${strategy.name} 열기 (Pro 준비 중)` : `${strategy.name} 열기`}
                title={!strategy.editable ? '출시된 전략은 편집할 수 없습니다' : strategy.mode === 'Pro' && !PRO_EDITOR_AVAILABLE ? 'Pro 편집기는 준비 중입니다' : '열기'}
                disabled={!strategy.editable || strategy.mode === 'Pro' && !PRO_EDITOR_AVAILABLE}
                onClick={(event) => { event.stopPropagation(); openEditor(strategy.mode.toLowerCase() as EditorMode, false, strategy.id); }}
              >{strategy.mode === 'Pro' && !PRO_EDITOR_AVAILABLE ? <LockKeyhole size={15} /> : <ChevronRight size={17} />}</button>
            </div>
          </article>)}
          {filteredItems.length === 0 && (items.length === 0 && !query && mode === 'all' && state === 'all'
            ? <EmptyState title="아직 만든 전략이 없습니다." detail="새 전략을 만들면 이 목록에 표시됩니다." />
            : <div className="strategy-empty"><Search size={20} /><strong>조건에 맞는 전략이 없습니다.</strong><button onClick={() => { setQuery(''); setMode('all'); setState('all'); }}>필터 초기화</button></div>)}
          {nextCursor && <button
            type="button"
            className="strategy-load-more"
            data-testid="strategy-load-more"
            disabled={morePending}
            onClick={() => { void loadMoreStrategies(); }}
          >{morePending ? '불러오는 중…' : '더 보기'}</button>}
        </div>
        </>}
      </section>

    </div>

    {showCreate && <div className="strategy-dialog-backdrop" onMouseDown={() => { setShowCreate(false); setShowImport(false); }}>
      <section role="dialog" aria-modal="true" aria-label="새 전략 선택" className="strategy-create-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><h2>{showImport ? '기존 전략 가져오기' : '새 전략'}</h2><p>{showImport ? '가져올 전략을 선택하세요.' : '새로 만들거나 기존 전략에서 시작하세요.'}</p></div><button aria-label="새 전략 선택 닫기" onClick={() => { setShowCreate(false); setShowImport(false); }}><X size={18} /></button></header>
        {!showImport ? <div className="strategy-create-options">
          <label className="field"><span>전략 이름</span><input aria-label="전략 이름" value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>
          {createError && <p role="alert" className="bots-decision-note">{createError}</p>}
          <button aria-label="Basic으로 시작" disabled={createPending} onClick={() => { void beginBasicStrategy(); }}><span className="create-icon is-basic"><Boxes size={20} /></span><span><strong>{createPending ? '만드는 중…' : 'Basic'}</strong><small>편집기에서 블록으로 구성</small></span><ChevronRight size={18} /></button>
          <button aria-label="Pro로 시작 (준비 중)" disabled={!PRO_EDITOR_AVAILABLE}><span className="create-icon is-pro"><GitBranch size={20} /></span><span><strong>Pro</strong><small>현재 사용할 수 없습니다</small></span><LockKeyhole size={18} /></button>
          <button className="create-import-option" aria-label="기존 전략 가져오기" onClick={() => setShowImport(true)}><span className="create-icon is-import"><Import size={20} /></span><span><strong>기존 전략 가져오기</strong><small>원본은 그대로 두고 새 초안 생성</small></span><ChevronRight size={18} /></button>
        </div> : <div className="strategy-import-list">{(items ?? []).map((strategy) => {
          const proLocked = strategy.mode === 'Pro' && !PRO_EDITOR_AVAILABLE;
          const copyable = strategy.kind === 'draft' && strategy.editable && !proLocked;
          return <button key={strategy.id} aria-label={proLocked ? `${strategy.name} 가져오기 (Pro 준비 중)` : `${strategy.name} 가져오기`} disabled={!copyable || copyPendingId !== null} onClick={() => { void copyOwnedStrategy(strategy); }}><span className={`strategy-mode-icon mode-${strategy.mode.toLowerCase()}`}>{strategy.mode[0]}</span><span><strong>{strategy.name}</strong><small>{proLocked ? 'Pro · 현재 사용할 수 없습니다' : !copyable ? '이 항목은 복사할 수 없습니다' : `${strategy.mode} · ${strategy.symbols.join(', ')}`}</small></span>{proLocked ? <LockKeyhole size={16} /> : copyPendingId === strategy.id ? <RefreshCw size={16} /> : <Import size={16} />}</button>;
        })}</div>}
      </section>
    </div>}
    {deleteTarget && <div className="resource-delete-backdrop" onMouseDown={() => { if (!deletePending) setDeleteTarget(null); }}>
      <section role="dialog" aria-modal="true" aria-label="전략 삭제 확인" className="resource-delete-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <span aria-hidden="true"><Trash2 size={19} /></span>
        <div>
          <strong>‘{deleteTarget.name}’ 전략을 삭제할까요?</strong>
          <p>전략 목록에서 제거되며 되돌릴 수 없습니다. 이 전략에서 이미 출시된 봇과 기록은 유지됩니다.</p>
          {deleteError && <p className="resource-delete-error" role="alert">{deleteError}</p>}
        </div>
        <footer>
          <Button disabled={deletePending} onClick={() => setDeleteTarget(null)}>취소</Button>
          <Button className="resource-delete-confirm" disabled={deletePending} icon={Trash2} onClick={() => { void deleteOwnedStrategy(); }}>
            {deletePending ? '삭제 중…' : '전략 삭제'}
          </Button>
        </footer>
      </section>
    </div>}
  </div></Localized>;
}

const NULL_BLOCK_VALUE = '';
const UNSET_SELECT_LABEL = '선택';
const UNSET_NUMBER_PLACEHOLDER = '입력';

const INITIAL_BASIC_BLOCKS: Record<Side, BasicBlock[]> = {
  buy: [
    { id: 'buy-rsi-block', icon: Activity, label: 'RSI 반등', op: NULL_BLOCK_VALUE, value: NULL_BLOCK_VALUE, tone: 'condition' },
  ],
  sell: [
    { id: 'sell-rsi-block', icon: Activity, label: 'RSI 반등', op: NULL_BLOCK_VALUE, value: NULL_BLOCK_VALUE, tone: 'condition' },
  ],
  risk: [],
};

/* The Basic strategy offers four bar periods. Sub-30-minute and weekly bars are
   not strategy resolutions: the one-minute bar is the aggregation source and the
   basis on which fills are evaluated, which is a different layer. */
export const BASIC_TIMEFRAMES = ['30분봉', '1시간봉', '4시간봉', '일봉'] as const;

export const DEFAULT_BASIC_TIMEFRAME = BASIC_TIMEFRAMES[0];

const INITIAL_STRATEGY_SECTIONS: StrategySection[] = [{
  id: 'section-1',
  symbol: 'AAPL · MSFT · SPY',
  instrumentIds: [],
  allocation: 40,
  timeframe: DEFAULT_BASIC_TIMEFRAME,
  x: 290,
  y: 108,
  cards: { buy: ['primary-buy'], sell: ['primary-sell'], risk: [] },
  cardOrder: ['primary-buy', 'primary-sell'],
  cardPositions: {
    'primary-buy': { x: 24, y: 136 },
    'primary-sell': { x: 384, y: 136 },
  },
}];

const getDefaultCardPosition = getDefaultBasicCardPosition;

const INITIAL_CARD_BLOCKS: Record<string, BasicBlock[]> = {
  'primary-buy': INITIAL_BASIC_BLOCKS.buy,
  'primary-sell': INITIAL_BASIC_BLOCKS.sell,
};

// A brand-new strategy opens on a blank canvas: one empty partition with no
// cards, so the required-buy / optional-sell prompts guide the first step.
const createBlankStrategySections = (): StrategySection[] => [{
  id: 'section-1',
  symbol: '',
  instrumentIds: [],
  allocation: 100,
  timeframe: DEFAULT_BASIC_TIMEFRAME,
  x: 290,
  y: 108,
  cards: { buy: [], sell: [], risk: [] },
  cardOrder: [],
  cardPositions: {},
}];

const createDefaultCardBlocks = (_cardId: string, _side: Side): BasicBlock[] => [];

const TEMPLATE_LIBRARY: StrategyTemplate[] = [
  { id: 'streak', name: '연속 상승·하락', category: '추세', indicator: '연속 상승·하락', buyTitle: '연속 상승 매수', sellTitle: '연속 하락 매도', buyTone: 'indicator', sellTone: 'indicator', description: '연속 상승에서 진입하고 연속 하락에서 정리해요' },
  { id: 'average-breakout', name: '최근 평균 가격 돌파', category: '가격', indicator: '가격 비교', buyTitle: '평균 가격 상향 돌파', sellTitle: '평균 가격 하향 이탈', buyTone: 'data', sellTone: 'data', description: '최근 평균 가격을 기준으로 진입과 청산을 구성해요' },
  { id: 'high-breakout', name: '최근 최고 가격 돌파', category: '가격', indicator: '가격 비교', buyTitle: '최근 최고 가격 돌파', sellTitle: '최근 평균 가격 이탈', buyTone: 'data', sellTone: 'data', description: '새로운 고점을 돌파하면 진입하고 평균 가격 이탈에 정리해요' },
  { id: 'open-rise', name: '장 시작가 대비 상승', category: '가격', indicator: '가격 변화율', buyTitle: '장 시작가 대비 상승', buyTone: 'data', includeSell: false, description: '장 시작가 대비 상승하면 진입해요' },
  { id: 'daily-drop', name: '하루 급락 매수', category: '가격', indicator: '가격 변화율', buyTitle: '하루 급락 매수', buyTone: 'data', includeSell: false, description: '전일 대비 급락하면 진입해요' },
  { id: 'scheduled-buy', name: '정기 매수', category: '일정', indicator: '정기 매수', buyTitle: '정기 매수', buyTone: 'time', includeSell: false, buyCycle: '매 거래일', description: '선택한 거래 일정마다 매수 요청을 만들어요' },
  { id: 'donchian', name: 'Donchian 돌파', category: '추세', indicator: '가격 비교', buyTitle: 'Donchian 상향 돌파', sellTitle: 'Donchian 하향 이탈', buyTone: 'indicator', sellTone: 'indicator', buyBlocks: [{ label: '가격 비교', tone: 'data' }, { label: '평균선 교차', tone: 'indicator' }], sellBlocks: [{ label: '가격 비교', tone: 'data' }, { label: '평균선 교차', tone: 'indicator' }], description: '가격 범위 돌파를 추세로 확인하고 하향 이탈에 정리해요' },
  { id: 'rsi', name: 'RSI 반등', category: '반전', indicator: 'RSI 반등', buyTitle: 'RSI 반등 매수', sellTitle: 'RSI 하락 매도', buyBlocks: [{ label: 'RSI 반등', tone: 'condition' }, { label: '거래량', tone: 'data' }], description: 'RSI가 낮은 구간에서 반등하면 사고 높은 구간에서 하락하면 정리해요' },
  { id: 'sma', name: 'SMA 교차', category: '추세', indicator: '평균선 교차', buyBlocks: [{ label: '평균선 교차', tone: 'indicator' }, { label: '연속 상승·하락', tone: 'indicator' }], description: '짧은 평균선과 긴 평균선의 교차를 따라가요' },
  { id: 'macd', name: 'MACD 전환', category: '반전', indicator: 'MACD 전환', buyBlocks: [{ label: 'MACD 전환', tone: 'condition' }, { label: '평균선 교차', tone: 'indicator' }], description: 'MACD가 상승 또는 하락 신호로 전환되는 순간을 찾아요' },
  { id: 'bollinger', name: 'Bollinger 반전', category: '반전', indicator: '가격 띠 반전', buyBlocks: [{ label: '가격 띠 반전', tone: 'condition' }, { label: 'RSI 반등', tone: 'condition' }], sellBlocks: [{ label: '가격 띠 반전', tone: 'condition' }, { label: 'RSI 반등', tone: 'condition' }], description: '가격 띠 복귀를 RSI로 확인하고 띠 상단 이탈에 정리해요' },
];

const getTemplateStructureLabel = (template: StrategyTemplate) => [
  `매수 ${template.buyBlocks?.length ?? 1}`,
  ...(template.includeSell === false ? [] : [`매도 ${template.sellBlocks?.length ?? 1}`]),
].join(' · ');

const BLOCK_LIBRARY: BlockLibraryCategory[] = [
  { name: '가격', tone: 'data', items: ['가격 비교', '가격 변화율', '거래량'] },
  { name: '추세', tone: 'indicator', items: ['평균선 교차', '연속 상승·하락'] },
  { name: '반전', tone: 'condition', items: ['RSI 반등', 'MACD 전환', '가격 띠 반전'] },
  // 정기 실행(일정)은 조건 블록이 아니라 매수 카드의 '스케줄' 설정으로 이동했다.
  { name: '매도', tone: 'risk', items: ['현재 수익률', '보유 기간', '최고 수익률', '고점 대비 하락'] },
];

const BASIC_FAVORITE_BLOCKS_STORAGE_KEY = 'i2s-basic-editor-favorite-blocks-v1';
const LOCAL_PREVIEW_SYMBOLS = ['AAPL', 'MSFT', 'SPY', 'NVDA', 'QQQ'];
const INSTRUMENT_INITIALS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/* The local preview list carries no exchange or asset type, so those stay optional
   and the picker simply omits the second line when the catalog is absent. */
type SelectableInstrument = Pick<BasicCatalogInstrument, 'id' | 'symbol'>
  & Partial<Pick<BasicCatalogInstrument, 'assetType' | 'primaryExchangeMic'>>;
const getLibraryBlockTone = (label: string): BlockTone => (
  BLOCK_LIBRARY.find((category) => category.items.includes(label))?.tone ?? 'neutral'
);

const INITIAL_CARD_META: Record<string, CardMeta> = {
  'primary-buy': {
    title: '매수 전략',
    detail: '가격 갱신 · 종목별 평가',
    explanation: '새로운 30분봉이 완성되고, RSI가 30 아래로 내려오면 전략 예산의 25%로 시장가 매수 후보를 만듭니다.',
  },
  'primary-sell': {
    title: '매도 전략',
    detail: '포지션 상태 · 종목별 평가',
    explanation: '포지션을 보유한 상태에서 RSI가 70 위로 올라가면 보유 수량 100%의 매도 후보를 만듭니다.',
  },
};

const getTemplateBlockDefinitions = (template: StrategyTemplate, side: Exclude<Side, 'risk'>): StrategyTemplateBlock[] => {
  const configured = side === 'buy' ? template.buyBlocks : template.sellBlocks;
  if (configured) return configured;
  const label = side === 'buy' ? (template.buyIndicator ?? template.indicator) : (template.sellIndicator ?? template.indicator);
  return [{ label, tone: side === 'buy' ? (template.buyTone ?? 'indicator') : (template.sellTone ?? 'indicator') }];
};

const getBasicBlockIcon = (label: string, tone: BlockTone): LucideIcon => {
  if (label.includes('거래량')) return BarChart3;
  if (label.includes('RSI')) return Activity;
  if (label.includes('MACD')) return RefreshCw;
  if (label.includes('평균선')) return GitBranch;
  if (label.includes('연속')) return Repeat2;
  if (label.includes('변화율')) return Gauge;
  if (label.includes('비교') || label === '가격') return Scale;
  if (label.includes('보유 기간')) return History;
  if (label.includes('최고 수익')) return Target;
  if (label.includes('수익률')) return TrendingUp;
  if (label.includes('하락')) return TrendingDown;
  if (label.includes('반전')) return ArrowUp;
  if (tone === 'risk') return ShieldCheck;
  if (tone === 'time') return Timer;
  if (tone === 'order') return CircleDollarSign;
  if (tone === 'indicator') return Sparkles;
  return CandlestickChart;
};

/* Local wall-clock time of the last successful save. The server sends an instant;
   showing it in the reader's own timezone is what makes "did my save land?"
   answerable at a glance. */
const savedAtLabel = (isoInstant: string): string => {
  const saved = new Date(isoInstant);
  if (Number.isNaN(saved.getTime())) return '';
  return saved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const serializeBasicEditorSnapshot = (snapshot: BasicEditorSnapshot): Record<string, unknown> => (
  JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
);

const BASIC_EDITOR_ELEMENT_CODES = new Set([
  'BASIC_PRICE_COMPARE',
  'BASIC_PRICE_CHANGE_PERCENT',
  'BASIC_VOLUME_COMPARE',
  'BASIC_STREAK',
  'BASIC_SMA_CROSS',
  'BASIC_RSI_CROSS',
  'BASIC_MACD_CROSS',
  'BASIC_BOLLINGER_REVERSAL',
  'BASIC_POSITION_RETURN',
  'BASIC_HOLDING_PERIOD',
  'BASIC_PEAK_RETURN',
  'BASIC_DRAWDOWN_FROM_PEAK',
  'BASIC_SCHEDULE',
  'BASIC_EQUAL_ALLOCATION_ORDER',
]);

const basicCompareOperator = (operator: string | undefined): string => {
  if (operator === '>' || operator === '↑') return 'GT';
  if (operator === '≥') return 'GTE';
  if (operator === '=') return 'EQ';
  return 'LT';
};

const basicDirection = (operator: string | undefined): string => (
  operator === '↑' || operator === '상승' || operator === '수익' ? 'UP' : 'DOWN'
);

const numericParameter = (value: string | undefined): string => String(value ?? '').replace('%', '').trim();

const firstNumber = (value: string | undefined, fallback = 0): number => {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
};

const allNumbers = (value: string | undefined): number[] => (
  [...String(value ?? '').matchAll(/\d+/g)].map((match) => Number(match[0]))
);

const resolutionCode = (timeframe: string): string => ({
  '30분봉': '30m', '1시간봉': '1h', '4시간봉': '4h', '일봉': '1d',
}[timeframe] ?? '30m');

const priceReferenceCode = (value: string | undefined): string => {
  const exact: Record<string, string> = {
    '전일 종가': 'PREVIOUS_CLOSE',
    '당일 장 시작가': 'SESSION_OPEN',
    '평균 진입가': 'AVERAGE_ENTRY_PRICE',
  };
  if (value && exact[value]) return exact[value];
  const period = firstNumber(value);
  if (value?.includes('평균 가격')) return `SMA_${period}`;
  if (value?.includes('최고 가격')) return `HIGH_${period}`;
  if (value?.includes('최저 가격')) return `LOW_${period}`;
  return '';
};

const volumeReference = (value: string | undefined): { reference: string; period: string; multiplier: string } => {
  if (value === '이전 봉 거래량') return { reference: 'PREVIOUS_VOLUME', period: '1', multiplier: '1' };
  const numbers = allNumbers(value);
  return {
    reference: 'AVERAGE_VOLUME',
    period: String(numbers[0] ?? 0),
    multiplier: String(numbers[1] ?? 1),
  };
};

const scheduleCycleCode = (cycle: BuyCycle): string => ({
  '매 거래일': 'EVERY_TRADING_DAY',
  '매주 첫 거래일': 'WEEK_FIRST_TRADING_DAY',
  '매월 첫 거래일': 'MONTH_FIRST_TRADING_DAY',
  '매월 마지막 거래일': 'MONTH_LAST_TRADING_DAY',
  'N거래일마다': 'EVERY_N_TRADING_DAYS',
}[cycle]);

const fixedScaleUsdAmount = (value: string): string | null => {
  const match = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,8}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(8, '0');
  if (match[1] === '0' && /^0{8}$/.test(fraction)) return null;
  return `${match[1]}.${fraction}`;
};

const blockElement = (block: BasicBlock, resolution: string): { elementCode: string; parameters: Record<string, unknown> } => {
  const common = { resolution };
  switch (block.label) {
    case '가격 비교':
      return { elementCode: 'BASIC_PRICE_COMPARE', parameters: { ...common, operator: basicCompareOperator(block.op), reference: priceReferenceCode(block.value) } };
    case '가격 변화율':
      return { elementCode: 'BASIC_PRICE_CHANGE_PERCENT', parameters: { ...common, base: priceReferenceCode(block.base), direction: basicDirection(block.op), thresholdPercent: numericParameter(block.value) } };
    case '거래량': {
      const reference = volumeReference(block.value);
      return { elementCode: 'BASIC_VOLUME_COMPARE', parameters: { ...common, operator: basicCompareOperator(block.op), ...reference } };
    }
    case '연속 상승·하락':
      return { elementCode: 'BASIC_STREAK', parameters: { ...common, direction: basicDirection(block.op), bars: String(firstNumber(block.value)) } };
    case '평균선 교차': {
      const [shortPeriod = 0, longPeriod = 0] = allNumbers(block.value);
      return { elementCode: 'BASIC_SMA_CROSS', parameters: { ...common, direction: basicDirection(block.op), shortPeriod: String(shortPeriod), longPeriod: String(longPeriod) } };
    }
    case 'RSI 반등':
      return { elementCode: 'BASIC_RSI_CROSS', parameters: { ...common, direction: basicDirection(block.op), period: '14', threshold: numericParameter(block.value) } };
    case 'MACD 전환': {
      const [fastPeriod = 12, slowPeriod = 26, signalPeriod = 9] = allNumbers(block.value);
      return { elementCode: 'BASIC_MACD_CROSS', parameters: { ...common, direction: basicDirection(block.op), fastPeriod: String(fastPeriod), slowPeriod: String(slowPeriod), signalPeriod: String(signalPeriod) } };
    }
    case '가격 띠 반전': {
      const [period = 20, deviations = 2] = allNumbers(block.value);
      return { elementCode: 'BASIC_BOLLINGER_REVERSAL', parameters: { ...common, direction: basicDirection(block.op), period: String(period), deviations: String(deviations) } };
    }
    case '현재 수익률':
      return { elementCode: 'BASIC_POSITION_RETURN', parameters: { direction: block.op === '수익' ? 'PROFIT' : 'LOSS', thresholdPercent: numericParameter(block.value) } };
    case '보유 기간': {
      const value = String(block.value ?? '');
      const unit = value === '당일 장 마감' ? 'SESSION_CLOSE' : value.includes('거래일') ? 'TRADING_DAY' : 'BAR';
      return { elementCode: 'BASIC_HOLDING_PERIOD', parameters: { unit, amount: String(value === '당일 장 마감' ? 0 : firstNumber(value)), resolution } };
    }
    case '최고 수익률':
      return { elementCode: 'BASIC_PEAK_RETURN', parameters: { operator: basicCompareOperator(block.op), thresholdPercent: numericParameter(block.value) } };
    case '고점 대비 하락':
      return { elementCode: 'BASIC_DRAWDOWN_FROM_PEAK', parameters: { operator: basicCompareOperator(block.op), thresholdPercent: numericParameter(block.value) } };
    default:
      return { elementCode: '', parameters: {} };
  }
};

/**
 * Converts the editor's complete published block catalog into the canonical
 * server document. Every visible condition becomes one deterministic runtime
 * step and the container settings are pinned on the terminal order step.
 */
export const buildBasicSemanticDocument = (
  snapshot: BasicEditorSnapshot,
  catalog: BasicStrategyCatalog,
): Record<string, unknown> => ({
  mode: 'BASIC',
  catalogId: catalog.version.id,
  groups: snapshot.sections.flatMap((section) => section.cardOrder.flatMap((cardId) => {
    const side: Side | null = section.cards.buy.includes(cardId)
      ? 'buy'
      : section.cards.sell.includes(cardId)
        ? 'sell'
        : section.cards.risk.includes(cardId)
          ? 'risk'
          : null;
    if (!side || side === 'risk') return [];
    const resolution = resolutionCode(section.timeframe);
    const configuredBlocks = snapshot.cardBlocks[cardId] ?? [];
    const buy = side === 'buy' ? snapshot.buySettings[cardId] : null;
    const sell = side === 'sell' ? snapshot.sellSettings[cardId] : null;
    const schedule = buy?.entryMode === '주기마다'
      ? [{
        id: `${cardId}-schedule`,
        elementCode: 'BASIC_SCHEDULE',
        parameters: { cycle: scheduleCycleCode(buy.cycle), interval: String(buy.cycleInterval), resolution },
      }]
      : [];
    const conditions = configuredBlocks.map((block) => ({ id: block.id, ...blockElement(block, resolution) }));
    const executableConditions = [...schedule, ...conditions];
    const orderId = `${cardId}-order`;
    const orderPercent = side === 'buy' ? buy?.maxOrderPercent ?? 100 : sell?.sellPercent ?? '';
    const blocks = [
      ...executableConditions,
      {
        id: orderId,
        elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER',
        parameters: {
          orderPercent: String(orderPercent),
          executionMode: side === 'buy' ? buy?.entryMode ?? '1회만' : sell?.executeMode ?? '1회만',
          waitMode: side === 'buy' ? buy?.reentryWait ?? '조건 재충족' : sell?.reexecWait ?? '조건 재충족',
          waitInterval: String(side === 'buy' ? buy?.reentryInterval ?? 1 : sell?.reexecInterval ?? 1),
          maxExecutions: String(side === 'buy' ? buy?.maxEntries ?? 1 : sell?.maxExecutions ?? 1),
        },
      },
    ];
    return [{
      id: cardId,
      container: side.toUpperCase(),
      evaluationMode: 'INDEPENDENT',
      allocationMode: 'EQUAL',
      instrumentIds: [...(section.instrumentIds ?? [])],
      blocks,
      connections: blocks.slice(0, -1).map((block, index) => ({
        fromBlockId: block.id,
        outputPort: 'passed',
        toBlockId: blocks[index + 1].id,
        inputPort: 'passed',
      })),
    }];
  })),
});

/**
 * Whether the saved semantic document describes a strategy that would be lost by
 * reconstructing the canvas as empty. Only the presence of groups matters: their shape is
 * the validator's concern, not this guard's.
 */
const semanticDocumentCarriesGroups = (semantic: Record<string, unknown>): boolean => (
  Array.isArray(semantic.groups) && semantic.groups.length > 0
);

const readBasicEditorSnapshot = (presentation: Record<string, unknown>): BasicEditorSnapshot | null => {
  const editor = presentation.basicEditor;
  if (!isRecord(editor) || editor.version !== 1 || !isRecord(editor.snapshot)) return null;
  const snapshot = editor.snapshot;
  if (!Array.isArray(snapshot.sections)
    || !isRecord(snapshot.cardBlocks)
    || !isRecord(snapshot.cardMeta)
    || !isRecord(snapshot.buySettings)
    || !isRecord(snapshot.sellSettings)
    || !isRecord(snapshot.symbolLimits)) return null;
  if (!snapshot.sections.every((section) => isRecord(section)
    && isRecord(section.cards)
    && Array.isArray(section.cards.buy)
    && Array.isArray(section.cards.sell)
    && Array.isArray(section.cards.risk)
    && Array.isArray(section.cardOrder)
    && isRecord(section.cardPositions))) return null;
  if (!Object.values(snapshot.cardBlocks).every((blocks) => Array.isArray(blocks)
    && blocks.every((block) => isRecord(block)
      && typeof block.id === 'string'
      && typeof block.label === 'string'
      && typeof block.tone === 'string'))) return null;
  try {
    const parsed = cloneBasicEditorSnapshot(snapshot as unknown as BasicEditorSnapshot);
    parsed.cardBlocks = Object.fromEntries(Object.entries(parsed.cardBlocks).map(([cardId, blocks]) => [
      cardId,
      blocks.map((block) => ({ ...block, icon: getBasicBlockIcon(block.label, block.tone) })),
    ]));
    return parsed;
  } catch {
    return null;
  }
};

const readBasicEditorViewport = (presentation: Record<string, unknown>): { pan: CanvasPoint; zoom: number } | null => {
  const editor = presentation.basicEditor;
  if (!isRecord(editor) || !isRecord(editor.viewport) || !isRecord(editor.viewport.pan)) return null;
  const { x, y } = editor.viewport.pan;
  const { zoom } = editor.viewport;
  return typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number'
    ? { pan: { x, y }, zoom }
    : null;
};

const createBlocksFromDefinitions = (cardId: string, definitions: StrategyTemplateBlock[]): BasicBlock[] => definitions.map((definition, index) => ({
    id: `${cardId}-condition-${index + 1}`,
    icon: getBasicBlockIcon(definition.label, definition.tone),
    label: definition.label,
    op: definition.label === '보유 기간' ? '≥' : NULL_BLOCK_VALUE,
    value: NULL_BLOCK_VALUE,
    tone: definition.tone,
  }));

const createTemplateBlocks = (template: StrategyTemplate, cardId: string, side: Exclude<Side, 'risk'>): BasicBlock[] => (
  createBlocksFromDefinitions(cardId, getTemplateBlockDefinitions(template, side))
);

const createLibraryBlock = (label: string, tone: BlockTone, id: string): BasicBlock => {
  return {
    id,
    icon: getBasicBlockIcon(label, tone),
    label,
    op: label === '보유 기간' ? '≥' : NULL_BLOCK_VALUE,
    value: NULL_BLOCK_VALUE,
    tone,
  };
};

const blockOperatorCopy: Record<string, string> = {
  '<': '미만',
  '>': '초과',
  '=': '같은지',
  '≥': '이상',
  '↑': '상향 돌파하는지',
  '↓': '하향 돌파하는지',
};

const DIRECTION_BLOCKS = new Set(['연속 상승·하락', '평균선 교차', 'RSI 반등', 'MACD 전환', '가격 띠 반전']);
// 보유 기간은 "N봉/거래일 이상 보유 시" 청산이 자연스러우므로 '이상(≥)' 하나만 쓴다.
const AT_LEAST_BLOCKS = new Set(['보유 기간']);
// 청산 조건은 보유 포지션을 전제로 평가되므로 매수 카드에는 논리적으로 들어갈 수
// 없다(진입 시점엔 포지션이 없음). 매도 전략 카드에서만 사용한다.
const SELL_ONLY_BLOCKS = new Set(['현재 수익률', '보유 기간', '최고 수익률', '고점 대비 하락']);

const getBlockOperatorOptions = (block: BlockRuleInput): string[] => {
  // 가격 변화율·현재 수익률은 명세대로 방향(상승/하락, 수익/손실)으로 고른다.
  // ↑/↓ 대신 명시적 라벨을 써서 '돌파' 계열 서술과 섞이지 않게 한다.
  if (block.label === '가격 변화율') return [NULL_BLOCK_VALUE, '상승', '하락'];
  if (block.label === '현재 수익률') return [NULL_BLOCK_VALUE, '수익', '손실'];
  if (DIRECTION_BLOCKS.has(block.label)) return [NULL_BLOCK_VALUE, '↑', '↓'];
  if (AT_LEAST_BLOCKS.has(block.label)) return ['≥'];
  return [NULL_BLOCK_VALUE, '<', '>'];
};

const getBlockDisplayLabel = (label: string): string => ({
  '가격 비교': '가격',
  '가격 변화율': '변화율',
  '연속 상승·하락': '연속',
  '평균선 교차': '평균선',
  'RSI 반등': 'RSI',
  'MACD 전환': 'MACD',
  '가격 띠 반전': '가격 띠',
  '현재 수익률': '수익률',
  '보유 기간': '보유',
  '최고 수익률': '최고 수익',
  '고점 대비 하락': '고점 하락',
}[label] ?? label);

const getBlockLibraryDescription = (label: string): string => ({
  '가격 비교': '기준 가격과 현재가를 비교합니다',
  '거래량': '현재 거래량을 기준 거래량과 비교합니다',
  '가격 변화율': '전일 종가 대비 상승·하락 변화율을 확인합니다',
  '연속 상승·하락': '같은 방향의 연속 봉을 확인합니다',
  '평균선 교차': '두 평균선이 만나는 시점을 찾습니다',
  'RSI 반등': 'RSI가 방향을 바꾸는지 확인합니다',
  'MACD 전환': 'MACD 신호의 방향 전환을 확인합니다',
  '가격 띠 반전': '가격이 기준 띠로 돌아오는지 확인합니다',
  '현재 수익률': '보유 포지션이 수익·손실 구간인지 확인합니다',
  '보유 기간': '진입 뒤 지난 기간을 확인합니다',
  '최고 수익률': '보유 중 기록한 최고 수익을 확인합니다',
  '고점 대비 하락': '최고 수익에서 줄어든 폭을 확인합니다',
}[label] ?? `${getBlockDisplayLabel(label)} 조건을 설정합니다`);

const BASIC_VALIDATION_EMPHASIS = [
  '매수 전략 카드',
  '매도 전략 카드',
  '매도 비율',
  '입력하지 않은',
  '블록 설정',
  '거래 종목',
  '전략 예산',
  '봉 주기',
];

const renderBasicValidationMessage = (message: string): ReactNode => {
  const pattern = new RegExp(`(${BASIC_VALIDATION_EMPHASIS.join('|')})`, 'g');
  return message.split(pattern).map((part, index) => (
    BASIC_VALIDATION_EMPHASIS.includes(part)
      ? <strong key={`${part}-${index}`}>{part}</strong>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>
  ));
};

const getBlockValueOptions = (block: BlockRuleInput, side?: Side): string[] => {
  // '평균 진입가'는 보유 포지션이 전제라 매수 시점엔 성립하지 않으므로 매도 카드에서만 노출한다.
  // 봉 구간은 20봉 고정 대신 5·20·60봉 프리셋을 제공해 단기·중기·장기 전략을 모두 만들 수 있게 한다.
  if (block.label === '가격 비교') return [
    '전일 종가', '당일 장 시작가', ...(side === 'sell' ? ['평균 진입가'] : []),
    '최근 5봉 평균 가격', '최근 20봉 평균 가격', '최근 60봉 평균 가격',
    '이전 5봉 최고 가격', '이전 20봉 최고 가격', '이전 60봉 최고 가격',
    '이전 5봉 최저 가격', '이전 20봉 최저 가격', '이전 60봉 최저 가격',
  ];
  if (block.label === '거래량') return [
    '최근 5봉 평균 거래량', '최근 5봉 평균 거래량 2배', '최근 5봉 평균 거래량 3배',
    '최근 20봉 평균 거래량', '최근 20봉 평균 거래량 2배', '최근 20봉 평균 거래량 3배',
    '최근 60봉 평균 거래량', '최근 60봉 평균 거래량 2배', '최근 60봉 평균 거래량 3배',
    '이전 봉 거래량',
  ];
  if (block.label === '연속 상승·하락') return ['2봉', '3봉', '5봉', '10봉', '20봉', '30봉'];
  if (block.label === '평균선 교차') return ['5봉 · 20봉', '20봉 · 60봉', '60봉 · 120봉'];
  if (block.label === 'MACD 전환') return ['12 · 26 · 9'];
  if (block.label === '가격 띠 반전') return ['20봉 · 2σ'];
  if (block.label === '보유 기간') return ['당일 장 마감', '1봉', '5봉', '20봉', '1거래일', '5거래일'];
  // 위 라벨들이 값 옵션을 가진 전부다. 그 외(예: 숫자 입력 블록)는 이 함수를 쓰지 않는다.
  return block.value ? [String(block.value)] : [];
};

const getNumericValue = (value: string | number | null | undefined) => {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(%)?$/);
  return match ? { number: Number(match[1]), suffix: match[2] ?? '' } : null;
};

const NUMERIC_BLOCK_LABELS = new Set(['가격 변화율', 'RSI 반등', '현재 수익률', '최고 수익률', '고점 대비 하락']);
const PERCENTAGE_BLOCK_LABELS = new Set(['가격 변화율', '현재 수익률', '최고 수익률', '고점 대비 하락']);
const usesNumericBlockValue = (label: string) => NUMERIC_BLOCK_LABELS.has(label);

const positionValueCopy: Record<string, string> = {
  OPEN: '포지션을 보유 중',
  CLOSED: '포지션을 보유하지 않음',
  ANY: '포지션 상태와 무관',
};

const getBlockRule = (block: BlockRuleInput, side?: string): ReactNode => {
  if (block.id === 'buy-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op as string] ?? block.op}</b>인지 확인하고</>;
  if (block.id === 'buy-budget-block') return <>조건을 만족하면 전략 예산의 <b>{block.value}</b>를 사용해</>;
  if (block.id === 'sell-position-block') return <>먼저 현재 <b>{positionValueCopy[block.value as string] ?? block.value}</b>인지 확인하고</>;
  if (block.id === 'sell-rsi-block') return <><b>RSI(14)</b>가 <b>{block.value} {blockOperatorCopy[block.op as string] ?? block.op}</b>인지 확인한 뒤</>;

  const operatorCopy = blockOperatorCopy[block.op as string] ?? block.op;
  if (block.tone === 'time') return <><b>{block.label}</b> 이벤트가 발생하면</>;
  if (block.tone === 'data') return <><b>{block.label}</b> 데이터를 읽고</>;
  if (block.tone === 'indicator') return <><b>{block.label}</b>{block.value && <>의 기준값 <b>{block.value}</b></>}{operatorCopy && <>으로 <b>{operatorCopy}</b></>} 확인한 뒤</>;
  if (block.tone === 'condition') return <><b>{block.label}</b>{block.value && <>이 <b>{block.value}</b> 상태인지</>} 확인하고</>;
  if (block.tone === 'logic') return <><b>{block.label}</b> 논리로 앞의 조건을 연결하고</>;
  if (block.tone === 'risk') return <>위험 한도를 <b>{block.value ?? '설정값'}</b>으로 제한한 뒤</>;
  if (block.tone === 'order') return <><b>{block.label}</b> 주문 조건을 적용하고</>;
  return <><b>{block.label}</b> 블록의 설정값을 확인하고</>;
};

const getTerminalRule = (side?: string): ReactNode => side === 'buy'
  ? <>다음 봉에서 <b>시장가 매수</b> 후보를 만듭니다.</>
  : <>보유 수량의 <b>100%</b>를 <b>시장가 매도</b> 후보로 만듭니다.</>;

// 받침 유무에 맞는 주격조사(이/가)를 고른다. 한글이 아니면(영문 지표명 등) '가'.
const subjectParticle = (word: string): '이' | '가' => {
  const last = word.charCodeAt(word.length - 1);
  if (Number.isNaN(last) || last < 0xAC00 || last > 0xD7A3) return '가';
  return (last - 0xAC00) % 28 !== 0 ? '이' : '가';
};

const getBlockNarrative = (block: BasicBlock, isLast: boolean): ReactNode => {
  const label = getBlockDisplayLabel(block.label);
  const operator = blockOperatorCopy[String(block.op ?? '')] ?? String(block.op ?? '');
  const value = String(block.value ?? '').trim();
  if (BASE_BLOCKS.has(block.label)) {
    const baseCopy = String(block.base ?? '').trim() || '기준가';
    const moveCopy = [value || '설정값', operator || '방향'].join(' ');
    return <><b>{baseCopy}</b> 대비 <b>{moveCopy}</b>{isLast ? '일 때' : '이고'}</>;
  }
  if (DIRECTION_BLOCKS.has(block.label)) {
    const dirUp = block.op === '↑';
    const dirDown = block.op === '↓';
    // 방향 블록은 종류마다 의미가 달라 '돌파'로 뭉뚱그리지 않는다.
    // 연속 상승·하락 = 연속 봉, 가격 띠 반전 = 평균 회귀, RSI = 반등/꺾임, 교차/전환 = 돌파(크로스).
    if (block.label === '연속 상승·하락') {
      const barsCopy = value || '여러 봉';
      const moveWord = dirUp ? '상승' : dirDown ? '하락' : '상승·하락';
      return <><b>{barsCopy}</b> <b>연속 {moveWord}</b>{isLast ? '할 때' : '하고'}</>;
    }
    if (block.label === '가격 띠 반전') {
      const bandCopy = dirUp ? '하단 띠' : dirDown ? '상단 띠' : '기준 띠';
      return <>가격이 <b>{bandCopy}</b>에서 <b>{isLast ? '되돌릴 때' : '되돌리고'}</b></>;
    }
    if (block.label === 'RSI 반등') {
      const levelCopy = value || '기준선';
      const moveCopy = dirUp
        ? (isLast ? '위로 반등할 때' : '위로 반등하고')
        : dirDown
          ? (isLast ? '아래로 꺾일 때' : '아래로 꺾이고')
          : (isLast ? '방향을 바꿀 때' : '방향을 바꾸고');
      return <><b>RSI</b>가 <b>{levelCopy}</b>에서 <b>{moveCopy}</b></>;
    }
    // 평균선 교차·MACD 전환: 크로스(상향/하향 돌파)
    const valueCopy = value || '기준값';
    const movementCopy = dirUp
      ? (isLast ? '상향 돌파할 때' : '상향 돌파하고')
      : dirDown
        ? (isLast ? '하향 돌파할 때' : '하향 돌파하고')
        : (isLast ? '교차할 때' : '교차하고');
    return <><b>{label}</b>{subjectParticle(label)} <b>{valueCopy}</b>에서 <b>{movementCopy}</b></>;
  }
  if (block.label === '보유 기간') {
    // '당일 장 마감'은 기간 임계값이 아니라 장중 청산 이벤트라 '이상' 서술과 분리한다.
    if (value === '당일 장 마감') return <><b>당일 장 마감</b>까지 보유{isLast ? '했을 때' : '하고'}</>;
    const durationCopy = value || '설정 기간';
    return <><b>보유 기간</b>이 <b>{durationCopy} 이상</b>{isLast ? '일 때' : '이고'}</>;
  }
  if (!operator && !value) return <><b>{label}</b>{subjectParticle(label)} 기준값과 <b>비교 방식</b>에 {isLast ? '맞을 때' : '맞고'}</>;
  if (!operator) return <><b>{label}</b>{subjectParticle(label)} <b>{value}</b>와 선택한 방식으로 {isLast ? '비교될 때' : '비교되고'}</>;
  if (!value) return <><b>{label}</b>{subjectParticle(label)} 기준값 <b>{operator}</b>{isLast ? '일 때' : '이고'}</>;
  if (block.tone === 'time') return <><b>{label}</b> 시점이 <b>{value}</b>{isLast ? '일 때' : '이고'}</>;
  // 값 뒤에 연산자(초과/미만/수익/손실 등)를 붙여 "가격이 최근 20봉 평균 가격 초과일 때"처럼 읽히게 한다.
  const condition = [value, operator].filter(Boolean).join(' ');
  return <><b>{label}</b>{subjectParticle(label)} <b>{condition}</b>{isLast ? '일 때' : '이고'}</>;
};

interface BlockRuleNoteProps {
  side: string;
  step: number;
  tone?: BlockTone;
  testId?: string;
  children?: ReactNode;
}

const BlockRuleNote = ({ side, step, tone = 'neutral', testId, children }: BlockRuleNoteProps) => <aside role="note" aria-label={`${step}단계 규칙 설명`} className={`strategy-rule-note is-${side} tone-${tone}`} data-testid={testId}>
  <span>{String(step).padStart(2, '0')}</span>
  <p>{children}</p>
</aside>;

interface NumericBlockValueProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}

const NumericBlockValue = ({ label, value, onChange }: NumericBlockValueProps) => {
  const parsed = getNumericValue(value);
  const numeric = parsed ?? { number: 0, suffix: PERCENTAGE_BLOCK_LABELS.has(label) ? '%' : '' };
  const isNull = value == null || String(value).trim() === NULL_BLOCK_VALUE;
  // RSI(0~100)와 고점 대비 하락(드로다운은 최대 100%)만 100으로 묶고, 수익률·변화율은
  // 100%를 넘길 수 있으므로(예: +150%) 상한을 넉넉히 둔다.
  const max = label.includes('RSI') || label === '고점 대비 하락'
    ? 100
    : PERCENTAGE_BLOCK_LABELS.has(label)
      ? 1000
      : numeric.suffix === '%'
        ? 100
        : 9999;

  const update = (next: number | string) => {
    if (String(next).trim() === NULL_BLOCK_VALUE) {
      onChange(NULL_BLOCK_VALUE);
      return;
    }
    const bounded = Math.max(0, Math.min(max, Number(next)));
    onChange(`${Number.isFinite(bounded) ? bounded : 0}${numeric.suffix}`);
  };

  // 블록 공간 확보를 위해 −/+ 스테퍼 버튼은 제거하고 숫자 입력 필드만 둔다.
  return <span className={`block-number-stepper is-fixed-width is-recessed-control ${isNull ? 'is-null' : ''}`} aria-label={`${label} 숫자 설정`} onPointerDown={(event) => event.stopPropagation()}>
    <label><span className="sr-only">{label} 값</span><input className="is-centered-number" type="number" min="0" max={max} value={isNull ? '' : numeric.number} placeholder={UNSET_NUMBER_PLACEHOLDER} onChange={(event) => update(event.target.value)} /><b aria-hidden="true">{numeric.suffix}</b></label>
  </span>;
};

interface CustomBlockSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  compact?: boolean;
}

const getSelectOptionIcon = (option: string): LucideIcon => {
  if (option === NULL_BLOCK_VALUE) return Minus;
  if (option === '↑') return ArrowUp;
  if (option === '↓') return ArrowDown;
  if (option === '수익') return TrendingUp;
  if (option === '손실') return TrendingDown;
  if (option === '<') return ChevronLeft;
  if (option === '>') return ChevronRight;
  if (option === '당일 장 시작가') return BellRing;
  if (option.includes('전일') || option.includes('이전')) return History;
  if (option.includes('당일') || option.includes('시작')) return BellRing;
  if (option.includes('평균') || option.includes('진입')) return CircleDollarSign;
  if (option.includes('최고') || option.includes('상승') || option.includes('돌파')) return TrendingUp;
  if (option.includes('최저') || option.includes('하락') || option.includes('이탈')) return TrendingDown;
  if (option.includes('봉')) return CandlestickChart;
  if (option.includes('분') || option.includes('시간') || option.includes('일') || option.includes('주')) return CalendarDays;
  return CircleDot;
};

const getSelectOptionPresentation = (option: string): { label: string; tone: string } => {
  if (option === NULL_BLOCK_VALUE) return { label: UNSET_SELECT_LABEL, tone: 'neutral' };
  if (option === '↑') return { label: '상승', tone: 'up' };
  if (option === '↓') return { label: '하락', tone: 'down' };
  // 비교(초과/미만)는 방향(상승/하강)과 구분되도록 별도 톤을 쓴다.
  if (option === '<') return { label: '미만', tone: 'under' };
  if (option === '>') return { label: '초과', tone: 'over' };
  if (option === '≤') return { label: '이하', tone: 'under' };
  if (option === '≥') return { label: '이상', tone: 'over' };
  if (option === '=') return { label: '같음', tone: 'neutral' };
  if (option === '수익') return { label: '수익', tone: 'up' };
  if (option === '손실') return { label: '손실', tone: 'down' };
  if (option.includes('최고') || option.includes('상승') || option.includes('돌파')) return { label: option, tone: 'up' };
  if (option.includes('최저') || option.includes('하락') || option.includes('이탈')) return { label: option, tone: 'down' };
  if (option.includes('전일') || option.includes('이전')) return { label: option, tone: 'history' };
  if (option.includes('당일') || option.includes('시작')) return { label: option, tone: 'today' };
  if (option.includes('평균') || option.includes('진입')) return { label: option, tone: 'average' };
  if (option.includes('분') || option.includes('시간') || option.includes('일') || option.includes('주') || option.includes('봉')) {
    return { label: option, tone: 'time' };
  }
  return { label: option, tone: 'neutral' };
};

const CustomBlockSelect = ({ label, value, options, onChange, compact = false }: CustomBlockSelectProps) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  // 메뉴는 createPortal로 body(=data-updown 조상 밖)에 렌더되므로 등락색(--gain/--loss)이
  // 항상 :root 기본(한국)으로 잡힌다. 트리거에서 실제 해석된 값을 읽어 메뉴에 주입해
  // 국가 설정(미국 등)이 드롭다운 옵션 색에도 반영되게 한다.
  const [menuTokens, setMenuTokens] = useState<Record<string, string> | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const normalizedOptions = [NULL_BLOCK_VALUE, ...options.filter((option) => option !== NULL_BLOCK_VALUE)];

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeFromViewportChange = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    window.addEventListener('resize', closeFromViewportChange);
    window.addEventListener('scroll', closeFromViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
      window.removeEventListener('resize', closeFromViewportChange);
      window.removeEventListener('scroll', closeFromViewportChange, true);
    };
  }, [open]);

  const showMenu = () => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = compact ? 76 : Math.max(184, bounds.width);
    const estimatedHeight = Math.min(164, normalizedOptions.length * 29 + 8);
    const opensUpward = window.innerHeight - bounds.bottom < estimatedHeight + 8;
    setMenuPosition({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width)),
      top: opensUpward ? Math.max(8, bounds.top - estimatedHeight - 4) : bounds.bottom + 4,
      width,
    });
    if (triggerRef.current) {
      const resolved = getComputedStyle(triggerRef.current);
      setMenuTokens({
        '--gain': resolved.getPropertyValue('--gain'),
        '--loss': resolved.getPropertyValue('--loss'),
        '--gain-soft': resolved.getPropertyValue('--gain-soft'),
        '--loss-soft': resolved.getPropertyValue('--loss-soft'),
      });
    }
    setOpen(true);
  };

  const moveSelection = (direction: number) => {
    const currentIndex = Math.max(0, normalizedOptions.indexOf(value));
    const nextIndex = (currentIndex + direction + normalizedOptions.length) % normalizedOptions.length;
    onChange(normalizedOptions[nextIndex]);
    showMenu();
  };
  const SelectedIcon = getSelectOptionIcon(value);
  const selectedPresentation = getSelectOptionPresentation(value);
  const hasSelectedIcon = value !== NULL_BLOCK_VALUE;

  return <span
    className={`block-custom-select is-recessed-control ${compact ? 'is-compact is-relation-select is-fixed-width' : 'is-value-select'} ${value === NULL_BLOCK_VALUE ? 'is-null' : ''} ${open ? 'is-open' : ''}`}
    ref={rootRef}
    onPointerDown={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <button
      ref={triggerRef}
      type="button"
      className={`block-custom-select-trigger${compact ? ` tone-${selectedPresentation.tone}` : ''}`}
      role="combobox"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-value={value}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        }
      }}
    >{compact
      ? <>{hasSelectedIcon
          ? <SelectedIcon className="block-relation-icon" size={13} aria-hidden="true" />
          : <Plus className="block-relation-icon is-placeholder" size={14} aria-hidden="true" />}<span className="block-relation-label">{selectedPresentation.label}</span></>
      : <span className="select-trigger-value"><span>{selectedPresentation.label}</span></span>}
      {!compact && <ChevronDown size={11} aria-hidden="true" />}</button>
    {open && menuPosition && createPortal(<span
      ref={menuRef}
      className={`block-custom-select-menu ${compact ? 'is-compact' : ''}`}
      role="listbox"
      aria-label={`${label} 옵션`}
      style={{ ...menuPosition, ...menuTokens }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {normalizedOptions.map((option) => {
        const OptionIcon = getSelectOptionIcon(option);
        const presentation = getSelectOptionPresentation(option);
        return <button
          key={option}
          type="button"
          className={`tone-${presentation.tone}`}
          role="option"
          aria-selected={option === value}
          onClick={() => {
            onChange(option);
            setOpen(false);
          }}
        ><span className="select-option-label">{option !== NULL_BLOCK_VALUE && <OptionIcon className="select-option-icon" size={13} aria-hidden="true" />}<span>{presentation.label}</span></span>{option === value && <Check size={11} aria-hidden="true" />}</button>;
      })}
    </span>, document.body)}
  </span>;
};

interface BlockProps {
  icon?: LucideIcon;
  label: string;
  value?: string;
  op?: string;
  base?: string;
  tone?: BlockTone;
  locked?: boolean;
  // 어느 카드(매수/매도)에 놓였는지. '평균 진입가'처럼 포지션이 있어야 성립하는
  // 기준을 매도 카드에서만 노출하는 데 쓴다.
  side?: Side;
  onChange?: (patch: { op?: string; value?: string; base?: string }) => void;
}

const BASE_BLOCKS = new Set(['가격 변화율']);
// '평균 진입가'는 보유 포지션이 전제라 매수 시점엔 성립하지 않는다. 매도 카드에서만 노출한다.
const getBlockBaseOptions = (label: string, side?: Side): string[] => (
  label === '가격 변화율'
    ? ['전일 종가', '당일 장 시작가', ...(side === 'sell' ? ['평균 진입가'] : [])]
    : []
);

const Block = ({ icon: Icon, label, value, op, base, tone = 'neutral', locked = false, side, onChange }: BlockProps) => {
  const block = { label, value, op, tone };
  const operatorOptions = getBlockOperatorOptions(block);
  const operatorLabel = operatorOptions.filter(Boolean).every((option) => ['↑', '↓', '상승', '하락', '수익', '손실'].includes(option)) ? `${label} 방향` : `${label} 비교`;
  return <div className={`scratch-block block-${tone}`}>
    {Icon && <Icon className="block-type-icon" size={15} />}
    <span title={label}>{getBlockDisplayLabel(label)}</span>
    {BASE_BLOCKS.has(label) && (locked
      ? base && <span className="block-value is-locked">{base}</span>
      : <CustomBlockSelect label={`${label} 기준 선택`} value={base ?? NULL_BLOCK_VALUE} options={getBlockBaseOptions(label, side)} onChange={(nextBase) => onChange!({ base: nextBase })} />)}
    {locked
      ? op && <b className="block-op">{op}</b>
      : operatorOptions.length === 1
        ? null
        : <CustomBlockSelect compact label={operatorLabel} value={op ?? NULL_BLOCK_VALUE} options={operatorOptions} onChange={(nextOp) => onChange!({ op: nextOp })} />}
    {locked
      ? value && <span className="block-value is-locked">{value}</span>
      : usesNumericBlockValue(label)
        ? <NumericBlockValue label={label} value={value ?? NULL_BLOCK_VALUE} onChange={(nextValue) => onChange!({ value: nextValue })} />
        : <CustomBlockSelect label={`${label} 값 선택`} value={value ?? NULL_BLOCK_VALUE} options={getBlockValueOptions(block, side)} onChange={(nextValue) => onChange!({ value: nextValue })} />}
  </div>;
};

interface StrategyBlockProps extends BlockProps {
  id: string;
  fixed?: boolean;
  dragging?: boolean;
  dragProps?: HTMLAttributes<HTMLDivElement> & {
    'data-drop-target'?: string;
    'data-drop-position'?: 'before' | 'after';
  };
  showRule?: boolean;
  rule?: ReactNode;
  ruleSide?: 'left' | 'right';
  ruleStep?: number;
  ruleTestId?: string;
  invalid?: boolean;
}

const StrategyBlock = ({ id, fixed = false, dragging = false, invalid = false, dragProps = {}, showRule = false, rule, ruleSide = 'right', ruleStep = 1, ruleTestId, ...blockProps }: StrategyBlockProps) => <div
  className={`block-with-copy ${fixed ? 'fixed-terminal-block' : 'draggable-strategy-block'} ${dragging ? 'is-dragging' : ''} ${invalid ? 'is-field-invalid' : ''}`}
  data-testid={id}
  aria-disabled={fixed ? 'true' : undefined}
  aria-label={fixed ? undefined : `${blockProps.label} 블록. 드래그하거나 Alt와 방향키로 이동`}
  draggable={fixed ? undefined : true}
  tabIndex={fixed ? undefined : 0}
  {...dragProps}
>{!fixed && <GripVertical className="block-drag-handle" size={14} aria-hidden="true" />}<Block {...blockProps} locked={fixed} />{showRule && <BlockRuleNote side={ruleSide} step={ruleStep} tone={blockProps.tone} testId={ruleTestId}>{rule}</BlockRuleNote>}</div>;

/* Shared by read-only strategy surfaces so launched snapshots keep the exact
   block silhouette, tone system, spacing, and terminal shape of the editor. */
export interface ReadOnlyStrategyBlockProps extends BlockProps {
  id: string;
  fixed?: boolean;
  showRule?: boolean;
  rule?: ReactNode;
  ruleSide?: 'left' | 'right';
  ruleStep?: number;
}

export const ReadOnlyStrategyBlock = ({
  id,
  fixed = false,
  showRule = false,
  rule,
  ruleSide = 'right',
  ruleStep = 1,
  ...blockProps
}: ReadOnlyStrategyBlockProps) => {
  const resolvedRule = rule ?? (fixed
    ? getTerminalRule(blockProps.tone)
    : getBlockRule(blockProps, blockProps.tone));
  return <div
    className={`block-with-copy ${fixed ? 'fixed-terminal-block' : 'draggable-strategy-block'} is-read-only`}
    data-testid={id}
    aria-label={`${blockProps.label} 읽기 전용 블록`}
  >
    {!fixed && <GripVertical className="block-drag-handle" size={14} aria-hidden="true" />}
    <Block {...blockProps} locked />
    {showRule && <BlockRuleNote side={ruleSide} step={ruleStep} tone={blockProps.tone}>{resolvedRule}</BlockRuleNote>}
  </div>;
};

interface BasicEditorProps {
  goBack: () => void;
  openEditor?: (mode: EditorMode, blank?: boolean, strategyId?: string) => void;
  onLaunchBot?: (bot: { name: string; description: string; botId?: string }) => void;
  blank?: boolean;
  strategyId?: string;
  authoringClient?: StrategyAuthoringClient | null;
  catalogClient?: StrategyCatalogClient | null;
  marketDataClient?: MarketDataClient | null;
}

const automaticStrategyMarketDataClient = import.meta.env.MODE === 'test' ? null : defaultMarketDataClient;

export function BasicEditor({ goBack, openEditor, onLaunchBot, blank = false, strategyId, authoringClient = automaticStrategyAuthoringClient, catalogClient = automaticStrategyCatalogClient, marketDataClient = automaticStrategyMarketDataClient }: BasicEditorProps) {
  /*
    When a real strategy is behind the editor, the canvas starts empty and the
    saved document fills it. Seeding the demo strategy here would show — and on
    the next save, persist — partitions the user never made whenever the saved
    document carries no presentation snapshot yet. The demo seed remains only
    for the standalone prototype flow with no strategy and no API behind it.
  */
  const startBlank = blank || Boolean(strategyId && authoringClient);
  const [activeSectionId, setActiveSectionId] = useState('section-1');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(startBlank ? null : 'primary-buy');
  const [sections, setSections] = useState<StrategySection[]>(startBlank ? createBlankStrategySections : INITIAL_STRATEGY_SECTIONS);
  const [cardBlocks, setCardBlocks] = useState<Record<string, BasicBlock[]>>(startBlank ? {} : INITIAL_CARD_BLOCKS);
  const [cardMeta, setCardMeta] = useState<Record<string, CardMeta>>(startBlank ? {} : INITIAL_CARD_META);
  const [editingCardTitleId, setEditingCardTitleId] = useState<string | null>(null);
  const [cardTitleDraft, setCardTitleDraft] = useState('');
  const [expandedSettingsCardId, setExpandedSettingsCardId] = useState<string | null>(null);
  const [buySettings, setBuySettings] = useState<Record<string, BuyContainerSettings>>(
    startBlank ? {} : { 'primary-buy': createDefaultBuySettings() },
  );
  const [sellSettings, setSellSettings] = useState<Record<string, SellContainerSettings>>(
    startBlank ? {} : { 'primary-sell': createDefaultSellSettings() },
  );
  const [symbolLimits, setSymbolLimits] = useState<Record<string, Record<string, number>>>(
    startBlank ? { 'section-1': {} } : { 'section-1': { AAPL: 40, MSFT: 40, SPY: 40 } },
  );
  const [symbolManagerSectionId, setSymbolManagerSectionId] = useState<string | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<{ cardId: string; blockId: string } | null>(null);
  const [libraryDrag, setLibraryDrag] = useState<LibraryDragPayload | null>(null);
  const [dragTarget, setDragTarget] = useState<{ cardId: string; index: number } | null>(null);
  const [customBlockCount, setCustomBlockCount] = useState(0);
  const [cardCount, setCardCount] = useState(2);
  const [drawMode, setDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState<CanvasPoint | null>(null);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panGesture, setPanGesture] = useState<CardMoveGesture | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const spacePanningRef = useRef(false);
  const pointerPositionRef = useRef<CanvasPoint | null>(null);
  const [sectionMove, setSectionMove] = useState<SectionMoveGesture | null>(null);
  const [sectionResize, setSectionResize] = useState<SectionResizeGesture | null>(null);
  const [cardMove, setCardMove] = useState<CardMoveState | null>(null);
  const cardSelectionAtPointerDownRef = useRef<{ cardId: string; wasSelected: boolean } | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const [trashReady, setTrashReady] = useState(false);
  const cardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const [cardSizes, setCardSizes] = useState<Record<string, CanvasSize>>({});
  const [announcement, setAnnouncement] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [documentPending, setDocumentPending] = useState(Boolean(strategyId && authoringClient));
  const [documentRevision, setDocumentRevision] = useState(0);
  const [editorLoadFailure, setEditorLoadFailure] = useState<EditorLoadFailure | null>(null);
  const [savePending, setSavePending] = useState(false);
  const leaseTokenRef = useRef<string | null>(null);
  const editSequenceRef = useRef(0);
  const semanticDocumentRef = useRef<Record<string, unknown>>({ mode: 'BASIC', groups: [] });
  const presentationDocumentRef = useRef<Record<string, unknown>>({});
  const [basicCatalog, setBasicCatalog] = useState<BasicStrategyCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [serverValidation, setServerValidation] = useState<StrategyValidationResult | null>(null);
  const [savedValidation, setSavedValidation] = useState<StrategyValidationResult | null>(null);
  const [savedReadySignature, setSavedReadySignature] = useState<string | null>(null);
  /* savedReadySignature is cleared whenever a save was not release-ready, so it
     cannot tell "saved but incomplete" apart from "never saved" or "dirty".
     savedSignature records every successful save regardless of validity, which is
     what an unsaved-changes indicator has to be derived from. */
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [validationPending, setValidationPending] = useState(false);
  const validationPreviewRevisionRef = useRef(0);
  const [pendingInstrumentKey, setPendingInstrumentKey] = useState('');
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [instrumentInitial, setInstrumentInitial] = useState<string | null>(null);
  // Two-phase dismissal so the toast can slide back down (mirroring its entry)
  // instead of vanishing instantly.
  const [saveFeedbackClosing, setSaveFeedbackClosing] = useState(false);
  const dismissSaveFeedback = () => setSaveFeedbackClosing(true);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [botName, setBotName] = useState('');
  const [botDescription, setBotDescription] = useState('');
  const [releaseInputs, setReleaseInputs] = useState<StrategyReleaseInputs | null>(null);
  const [releaseInputsPending, setReleaseInputsPending] = useState(false);
  const [releasePending, setReleasePending] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [selectedExecutionPolicy, setSelectedExecutionPolicy] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');
  const [initialCashAmount, setInitialCashAmount] = useState('100000');
  const [budgetPercent, setBudgetPercent] = useState('100');
  const [templateQuery, setTemplateQuery] = useState('');
  const [blockQuery, setBlockQuery] = useState('');
  const [libraryView, setLibraryView] = useState<'packages' | 'blocks'>('blocks');
  const [favoriteBlockLabels, setFavoriteBlockLabels] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(BASIC_FAVORITE_BLOCKS_STORAGE_KEY);
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });
  const [templatesCollapsed, setTemplatesCollapsed] = useState(false);
  /*
    The reopen handle tracks the collapse button's position, so a collapsed
    library reads as a docked edge tab at the panel's own height (matching Pro)
    instead of a stray floating button, and it never lands on top of the canvas
    toolbar when the layout reflows on narrow screens.
  */
  const [libraryReopenTop, setLibraryReopenTop] = useState(77);
  const basicLayoutRef = useRef<HTMLDivElement | null>(null);
  const libraryCollapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const collapseLibrary = () => {
    const layoutBounds = basicLayoutRef.current?.getBoundingClientRect();
    const buttonBounds = libraryCollapseButtonRef.current?.getBoundingClientRect();
    if (layoutBounds && buttonBounds && buttonBounds.height > 0) {
      setLibraryReopenTop(buttonBounds.top - layoutBounds.top);
    }
    setTemplatesCollapsed(true);
  };
  const [gridSnap, setGridSnap] = useState(false);
  const [highlightValidation, setHighlightValidation] = useState(false);
  /*
    Which validation issue the person is currently inspecting. Picking an issue
    in the drawer pins its card and — for unfilled-field issues — the exact
    blocks that still need input, so the highlight lands on the field rather
    than just the card (mirroring the Pro editor). `field` distinguishes an
    empty card, a missing sell ratio, and unfilled block controls.
  */
  const [validationFocus, setValidationFocus] = useState<{ cardId: string | null; field: 'blocks' | 'sellPercent' | 'empty' | 'section' } | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(['primary-buy']);
  const [undoStack, setUndoStack] = useState<BasicEditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<BasicEditorSnapshot[]>([]);
  /* 미리보기 차트를 열어 둔 파티션. 파티션을 누르면 그 파티션 기준으로 열린다. */
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const [previewCandles, setPreviewCandles] = useState<PreviewCandle[] | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const catalogSupportsEditor = basicCatalog?.elements.length
    ? [...BASIC_EDITOR_ELEMENT_CODES].every((code) => basicCatalog.elements.some((element) => element.elementCode === code))
    : !catalogClient;
  const supportedTemplates = catalogClient ? (catalogSupportsEditor ? TEMPLATE_LIBRARY : []) : TEMPLATE_LIBRARY;
  const supportedBlockLibrary = catalogClient
    ? (catalogSupportsEditor ? BLOCK_LIBRARY : [])
    : BLOCK_LIBRARY;
  const filteredTemplates = useMemo(() => supportedTemplates.filter((template) => (
    `${template.name} ${template.category} ${template.indicator}`.toLowerCase().includes(templateQuery.trim().toLowerCase())
  )), [supportedTemplates, templateQuery]);
  const filteredBlockLibrary = useMemo(() => supportedBlockLibrary.map((category) => ({
    ...category,
    items: category.items.filter((item) => item.toLowerCase().includes(blockQuery.trim().toLowerCase())),
  })).filter((category) => category.items.length > 0), [blockQuery, supportedBlockLibrary]);
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (sections.length === 0) {
      return [{
        id: 'strategy-no-section',
        sectionId: null,
        cardId: null,
        message: '매수 전략 카드가 포함된 파티션을 하나 이상 만들어 주세요.',
      }];
    }

    return sections.flatMap((section, sectionIndex): ValidationIssue[] => {
      const sectionLabel = `PARTITION ${String(sectionIndex + 1).padStart(2, '0')}`;
      if (catalogClient && (section.instrumentIds?.length ?? 0) === 0) {
        return [{
          id: `${section.id}-no-instruments`,
          sectionId: section.id,
          cardId: null,
          message: `${sectionLabel}에 거래 종목을 하나 이상 추가해 주세요.`,
        }];
      }
      if (section.cards.buy.length === 0) {
        return [{
          id: `${section.id}-no-buy`,
          sectionId: section.id,
          cardId: null,
          message: `${sectionLabel}에 매수 전략 카드가 필요합니다.`,
        }];
      }
      if (catalogClient && section.cards.risk.length > 0) {
        return [{
          id: `${section.id}-unsupported-risk`,
          sectionId: section.id,
          cardId: section.cards.risk[0],
          message: `${sectionLabel}의 위기관리 카드는 현재 공개된 실행 카탈로그에서 지원하지 않습니다.`,
        }];
      }
      return (['buy', 'sell', 'risk'] as Side[]).flatMap((side) => {
        const sideLabel = side === 'buy' ? '매수' : side === 'sell' ? '매도' : '위기관리';
        return section.cards[side].flatMap((cardId): ValidationIssue[] => {
          const blocks = cardBlocks[cardId] ?? [];
          // 매수 카드는 '주기마다' 진입(정기 매수)이면 조건 블록 없이도 트리거가 있는 것으로 본다.
          const periodicEntry = side === 'buy' && (buySettings[cardId]?.entryMode ?? '1회만') === '주기마다';
          if (blocks.length === 0 && !periodicEntry) {
            return [{
              id: `${cardId}-empty`,
              sectionId: section.id,
              cardId,
              message: `${sectionLabel}의 ${sideLabel} 전략 카드에 조건 블록을 하나 이상 추가해 주세요.`,
            }];
          }
          const hasNullField = blocks.some((block) => {
            const operatorRequired = getBlockOperatorOptions(block).length > 1;
            const baseRequired = BASE_BLOCKS.has(block.label);
            return !String(block.value ?? '').trim()
              || (operatorRequired && !String(block.op ?? '').trim())
              || (baseRequired && !String(block.base ?? '').trim());
          });
          if (side === 'sell' && !sellSettings[cardId]?.sellPercent) {
            return [{
              id: `${cardId}-sell-percent`,
              sectionId: section.id,
              cardId,
              message: `${sectionLabel}의 매도 전략 카드에서 매도 비율을 설정해 주세요.`,
            }];
          }
          return hasNullField ? [{
            id: `${cardId}-null-fields`,
            sectionId: section.id,
            cardId,
            message: `${sectionLabel}의 ${sideLabel} 전략 카드에서 입력하지 않은 블록 설정을 완료해 주세요.`,
          }] : [];
        });
      });
    });
  }, [cardBlocks, sections, sellSettings, buySettings, catalogClient]);
  const validationSignature = validationIssues.map((issue) => issue.id).join('|');
  const editorSignature = useMemo(() => JSON.stringify({
    sections,
    cardBlocks: Object.fromEntries(Object.entries(cardBlocks).map(([cardId, blocks]) => [
      cardId,
      blocks.map(({ id, label, op, value, base, tone }) => ({ id, label, op, value, base, tone })),
    ])),
    cardMeta,
    buySettings,
    sellSettings,
    symbolLimits,
  }), [sections, cardBlocks, cardMeta, buySettings, sellSettings, symbolLimits]);
  const editorSignatureRef = useRef(editorSignature);
  editorSignatureRef.current = editorSignature;

  /* A freshly loaded canvas equals its saved document, so the signature at that
     moment is the saved one. It cannot be captured inside the load effect, because
     the signature is derived from state that has not re-rendered yet. */
  useEffect(() => {
    if (documentPending) {
      setSavedSignature(null);
      return;
    }
    setSavedSignature((current) => current ?? editorSignatureRef.current);
  }, [documentPending]);

  const hasUnsavedChanges = savedSignature !== null && savedSignature !== editorSignature;
  const isLocallyComplete = validationIssues.length === 0 && (!catalogClient || catalogSupportsEditor);
  const requiresServerValidation = Boolean(strategyId && authoringClient);
  const isCurrentlyValid = isLocallyComplete && (!requiresServerValidation || serverValidation?.status === 'VALID');
  const isLaunchable = isCurrentlyValid
    && savedReadySignature === editorSignature
    && (!requiresServerValidation || savedValidation?.status === 'VALID');
  const serverErrorFindings = serverValidation?.findings.filter((finding) => (
    finding.severity === 'BLOCKING_ERROR' || finding.severity === 'ERROR'
  )) ?? [];
  const serverWarningFindings = serverValidation?.findings.filter((finding) => finding.severity === 'WARNING') ?? [];
  const validationTriggerLabel = validationPending
    ? '검증 중…'
    : isCurrentlyValid
      ? isLaunchable
        ? serverWarningFindings.length > 0 ? `출시 가능 · 경고 ${serverWarningFindings.length}` : '출시 가능'
        : '유효 · 저장 필요'
    : validationIssues.length > 0
      ? `미완성 · 오류 ${validationIssues.length}`
      : serverValidation?.status === 'INVALID'
        ? `검증 오류 ${serverErrorFindings.length}`
        : '서버 검증 필요';
  const groupedValidationIssues = useMemo(() => {
    const groups = new Map<string, { label: string; issues: ValidationIssue[] }>();
    validationIssues.forEach((issue) => {
      const sectionIndex = issue.sectionId
        ? sections.findIndex((section) => section.id === issue.sectionId)
        : -1;
      const key = issue.sectionId ?? 'strategy';
      const label = sectionIndex >= 0
        ? `PARTITION ${String(sectionIndex + 1).padStart(2, '0')}`
        : '전체 전략';
      const group = groups.get(key) ?? { label, issues: [] };
      group.issues.push(issue);
      groups.set(key, group);
    });
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [sections, validationIssues]);
  const invalidSectionIds = new Set(validationIssues.map((issue) => issue.sectionId).filter(Boolean));
  const invalidCardIds = new Set(validationIssues.map((issue) => issue.cardId).filter(Boolean));

  // Blocks in the focused card that still have an unset operator or value. Kept
  // live off cardBlocks so the highlight clears the moment a field is filled.
  const focusedInvalidBlockIds = useMemo(() => {
    if (!validationFocus?.cardId || validationFocus.field !== 'blocks') return new Set<string>();
    return new Set((cardBlocks[validationFocus.cardId] ?? []).filter((block) => {
      const operatorRequired = getBlockOperatorOptions(block).length > 1;
      return !String(block.value ?? '').trim() || (operatorRequired && !String(block.op ?? '').trim());
    }).map((block) => block.id));
  }, [validationFocus, cardBlocks]);

  const focusValidationIssue = (issue: ValidationIssue) => {
    if (issue.sectionId) setActiveSectionId(issue.sectionId);
    // Jumping to a warning highlights the exact field (validationFocus) but must
    // not select the card — the natural-language overlay would obscure the fix.
    setSelectedCardId(null);
    setSelectedCardIds([]);
    const field: 'blocks' | 'sellPercent' | 'empty' | 'section' = issue.cardId === null
      ? 'section'
      : issue.id.endsWith('-empty')
        ? 'empty'
        : issue.id.endsWith('-sell-percent')
          ? 'sellPercent'
          : 'blocks';
    // Surface the exact control that needs input: open the sell-ratio popover
    // so a missing ratio is shown inline rather than hidden behind a toggle.
    setExpandedSettingsCardId(field === 'sellPercent' ? issue.cardId : null);
    setValidationFocus({ cardId: issue.cardId, field });
  };

  useEffect(() => {
    window.localStorage.setItem(BASIC_FAVORITE_BLOCKS_STORAGE_KEY, JSON.stringify(favoriteBlockLabels));
  }, [favoriteBlockLabels]);

  useEffect(() => {
    if (!catalogClient) return undefined;
    const controller = new AbortController();
    void catalogClient.getBasic(controller.signal)
      .then((catalog) => {
        setBasicCatalog(catalog);
        setCatalogError(null);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCatalogError('공식 종목을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      });
    return () => controller.abort();
  }, [catalogClient]);
  // The settings popover is a lightweight overlay — dismiss it when the user
  // clicks anywhere outside it (excluding the toggle/close controls themselves).
  useEffect(() => {
    if (!expandedSettingsCardId) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.container-settings-card') || target?.closest('[aria-label*="실행 설정"]')) return;
      setExpandedSettingsCardId(null);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [expandedSettingsCardId]);
  const captureEditorSnapshot = (): BasicEditorSnapshot => cloneBasicEditorSnapshot({
    sections: sections.map((section) => ({
      ...section,
      instrumentIds: basicCatalog
        ? splitPartitionSymbols(section.symbol)
          .map((symbol) => basicCatalog.instruments.find((instrument) => instrument.symbol === symbol)?.id)
          .filter((id): id is string => Boolean(id))
        : (section.instrumentIds ?? []),
    })),
    cardBlocks,
    cardMeta,
    buySettings,
    sellSettings,
    symbolLimits,
  });

  const restoreEditorSnapshot = (snapshot: BasicEditorSnapshot) => {
    const next = cloneBasicEditorSnapshot(snapshot);
    setSections(next.sections);
    setCardBlocks(next.cardBlocks);
    setCardMeta(next.cardMeta);
    setBuySettings(next.buySettings);
    setSellSettings(next.sellSettings);
    setSymbolLimits(next.symbolLimits);
    const availableCardIds = new Set(next.sections.flatMap((section) => section.cardOrder));
    setSelectedCardId((current) => current && availableCardIds.has(current) ? current : (next.sections[0]?.cardOrder[0] ?? null));
    setSelectedCardIds((current) => {
      const remaining = current.filter((cardId) => availableCardIds.has(cardId));
      return remaining.length > 0 ? remaining : (next.sections[0]?.cardOrder.slice(0, 1) ?? []);
    });
  };

  useEffect(() => {
    if (!strategyId || !authoringClient) return undefined;
    const controller = new AbortController();
    let disposed = false;
    let heartbeatTimer: number | undefined;
    let grantedLeaseToken: string | null = null;
    const releaseGrantedLease = () => {
      const token = leaseTokenRef.current ?? grantedLeaseToken;
      leaseTokenRef.current = null;
      grantedLeaseToken = null;
      if (token) void authoringClient.releaseLease(strategyId, token).catch(() => undefined);
    };
    const reacquireLeaseAfterPageRestore = (event: PageTransitionEvent) => {
      if (event.persisted) setDocumentRevision((current) => current + 1);
    };
    window.addEventListener('pagehide', releaseGrantedLease);
    window.addEventListener('pageshow', reacquireLeaseAfterPageRestore);

    setDocumentPending(true);
    setEditorLoadFailure(null);
    /* Read before taking the exclusive lease. In React StrictMode the first
       development-only mount is immediately discarded; acquiring first let
       that discarded mount race its asynchronous release against the real
       mount and produce a false 409. The abortable read makes the probe mount
       harmless, then the surviving mount takes the lease. */
    void authoringClient.getDocument(strategyId, controller.signal).then(async (document) => {
      if (disposed) return;
      const lease = await acquireLeaseAfterNavigation(authoringClient, strategyId, controller.signal);
      grantedLeaseToken = lease.leaseToken;
      if (disposed) {
        await authoringClient.releaseLease(strategyId, lease.leaseToken).catch(() => undefined);
        grantedLeaseToken = null;
        return;
      }
      const snapshot = readBasicEditorSnapshot(document.presentationDocument);
      /* The canvas is reconstructed from the presentation snapshot alone. When that
         snapshot cannot be read but the semantic document does carry groups, opening
         a blank canvas would let the next save overwrite a real strategy with an
         empty one, so refuse to open instead of silently discarding it. */
      if (!snapshot && semanticDocumentCarriesGroups(document.semanticDocument)) {
        await authoringClient.releaseLease(strategyId, lease.leaseToken).catch(() => undefined);
        grantedLeaseToken = null;
        setDocumentPending(false);
        setEditorLoadFailure('unreadable');
        return;
      }
      leaseTokenRef.current = lease.leaseToken;
      editSequenceRef.current = document.editSequence;
      semanticDocumentRef.current = document.semanticDocument;
      presentationDocumentRef.current = document.presentationDocument;
      if (snapshot) restoreEditorSnapshot(snapshot);
      const viewport = readBasicEditorViewport(document.presentationDocument);
      if (viewport) {
        setPan(viewport.pan);
        setZoom(viewport.zoom);
      }
      setLastSavedAt(document.updatedAt);
      setDocumentPending(false);
      heartbeatTimer = window.setInterval(() => {
        const token = leaseTokenRef.current;
        if (!token) return;
        void authoringClient.heartbeatLease(strategyId, token).catch(() => {
          leaseTokenRef.current = null;
          setSaveFeedback({ tone: 'warning', title: '편집 연결이 만료되었습니다.', detail: '목록으로 돌아가 전략을 다시 열어 주세요.' });
        });
      }, 60_000);
    }).catch((error) => {
      if (grantedLeaseToken) {
        void authoringClient.releaseLease(strategyId, grantedLeaseToken).catch(() => undefined);
        grantedLeaseToken = null;
      }
      if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
      setDocumentPending(false);
      if (error instanceof StrategyApiError && error.status === 401) {
        setSessionAccessToken(null);
        browserSessionStore.signOut('rejected');
        setEditorLoadFailure('sign-in');
      } else if (error instanceof StrategyApiError && error.status === 404) {
        setEditorLoadFailure('missing');
      } else if (error instanceof StrategyApiError && error.status === 409) {
        setEditorLoadFailure('conflict');
      } else {
        setEditorLoadFailure('transport');
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', releaseGrantedLease);
      window.removeEventListener('pageshow', reacquireLeaseAfterPageRestore);
      releaseGrantedLease();
    };
  }, [authoringClient, documentRevision, strategyId]);

  useEffect(() => {
    if (!strategyId || !authoringClient?.previewValidation || !basicCatalog || documentPending) return undefined;
    const controller = new AbortController();
    const clientRevision = ++validationPreviewRevisionRef.current;
    setValidationPending(true);
    const timer = window.setTimeout(() => {
      const semanticDocument = buildBasicSemanticDocument(captureEditorSnapshot(), basicCatalog);
      void authoringClient.previewValidation!(strategyId, {
        catalogId: basicCatalog.version.id,
        clientRevision,
        semanticDocument,
      }, controller.signal).then((validation) => {
        if (validationPreviewRevisionRef.current !== clientRevision
          || validation.requestedEditSequence !== clientRevision) return;
        setServerValidation(validation);
        setValidationPending(false);
      }).catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (validationPreviewRevisionRef.current === clientRevision) {
          setServerValidation(null);
          setValidationPending(false);
        }
      });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [strategyId, authoringClient, basicCatalog, documentPending, editorSignature]);

  const rememberEditorChange = () => {
    const snapshot = captureEditorSnapshot();
    setUndoStack((current) => [...current.slice(-39), snapshot]);
    setRedoStack([]);
  };

  const undoEditorChange = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((current) => [...current.slice(-39), captureEditorSnapshot()]);
    setUndoStack((current) => current.slice(0, -1));
    restoreEditorSnapshot(previous);
    setAnnouncement('마지막 편집을 되돌렸습니다.');
  };

  const redoEditorChange = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((current) => [...current.slice(-39), captureEditorSnapshot()]);
    setRedoStack((current) => current.slice(0, -1));
    restoreEditorSnapshot(next);
    setAnnouncement('되돌린 편집을 다시 적용했습니다.');
  };

  const duplicateSelectedCards = () => {
    const selected = selectedCardIds.filter((cardId) => sections.some((section) => section.cardOrder.includes(cardId)));
    if (selected.length === 0) return;
    rememberEditorChange();
    const copies = selected.map((cardId, index) => {
      const section = sections.find((item) => item.cardOrder.includes(cardId))!;
      const side: Side = section.cards.buy.includes(cardId)
        ? 'buy'
        : section.cards.sell.includes(cardId)
          ? 'sell'
          : 'risk';
      const copyId = `${section.id}-${side}-copy-${cardCount + index + 1}`;
      const origin = section.cardPositions[cardId] ?? getDefaultCardPosition(section.cardOrder.indexOf(cardId));
      return { cardId, copyId, sectionId: section.id, side, position: { x: origin.x + 32, y: origin.y + 32 } };
    });
    setCardCount((current) => current + copies.length);
    setCardBlocks((current) => ({
      ...current,
      ...Object.fromEntries(copies.map(({ cardId, copyId }) => [
        copyId,
        (current[cardId] ?? []).map((block, index) => ({ ...block, id: `${copyId}-block-${index + 1}` })),
      ])),
    }));
    setCardMeta((current) => ({
      ...current,
      ...Object.fromEntries(copies.map(({ cardId, copyId }) => [
        copyId,
        { ...(current[cardId] ?? { title: '전략 복사본', detail: '', explanation: '' }), title: `${current[cardId]?.title ?? '전략'} 복사본` },
      ])),
    }));
    setBuySettings((current) => ({
      ...current,
      ...Object.fromEntries(copies.filter(({ side }) => side === 'buy').map(({ cardId, copyId }) => [
        copyId,
        { ...(current[cardId] ?? createDefaultBuySettings()) },
      ])),
    }));
    setSellSettings((current) => ({
      ...current,
      ...Object.fromEntries(copies.filter(({ side }) => side === 'sell').map(({ cardId, copyId }) => [
        copyId,
        { ...(current[cardId] ?? createDefaultSellSettings()) },
      ])),
    }));
    setSections((current) => current.map((section) => {
      const sectionCopies = copies.filter((copy) => copy.sectionId === section.id);
      if (sectionCopies.length === 0) return section;
      return {
        ...section,
        cards: {
          buy: [...section.cards.buy, ...sectionCopies.filter(({ side }) => side === 'buy').map(({ copyId }) => copyId)],
          sell: [...section.cards.sell, ...sectionCopies.filter(({ side }) => side === 'sell').map(({ copyId }) => copyId)],
          risk: [...section.cards.risk, ...sectionCopies.filter(({ side }) => side === 'risk').map(({ copyId }) => copyId)],
        },
        cardOrder: [...section.cardOrder, ...sectionCopies.map(({ copyId }) => copyId)],
        cardPositions: {
          ...section.cardPositions,
          ...Object.fromEntries(sectionCopies.map(({ copyId, position }) => [copyId, position])),
        },
      };
    }));
    const copiedIds = copies.map(({ copyId }) => copyId);
    setSelectedCardIds(copiedIds);
    setSelectedCardId(copiedIds[0] ?? null);
    setAnnouncement(`${copiedIds.length}개 전략 카드를 복사했습니다.`);
  };

  useEffect(() => {
    setSaveFeedback(null);
  }, [validationSignature]);

  useEffect(() => {
    setServerValidation(null);
  }, [sections, cardBlocks, buySettings, sellSettings, basicCatalog?.version.id]);

  useEffect(() => {
    if (!saveFeedback) return undefined;
    setSaveFeedbackClosing(false);

    const dismissTimer = window.setTimeout(() => {
      setSaveFeedbackClosing(true);
    }, 2_000);

    return () => window.clearTimeout(dismissTimer);
  }, [saveFeedback]);

  // Once the exit animation has had time to play, actually unmount the toast.
  useEffect(() => {
    if (!saveFeedbackClosing) return undefined;
    const removeTimer = window.setTimeout(() => {
      setSaveFeedback(null);
      setSaveFeedbackClosing(false);
    }, 260);
    return () => window.clearTimeout(removeTimer);
  }, [saveFeedbackClosing]);

  const saveStrategy = async () => {
    const signatureAtSave = editorSignature;
    const nextFeedback: SaveFeedback = isLocallyComplete
      ? { tone: 'positive', title: '전략 구성을 저장했습니다.', detail: '서버 검증 결과를 확인하고 있습니다.' }
      : { tone: 'warning', title: '미완성 상태로 저장했습니다.', detail: '모든 전략 카드의 조건을 완성하면 검증할 수 있습니다.' };
    if (!strategyId || !authoringClient) {
      setSavedValidation(null);
      setSavedReadySignature(isLocallyComplete ? signatureAtSave : null);
      setSavedSignature(signatureAtSave);
      setSaveFeedback(nextFeedback);
      setAnnouncement(`${nextFeedback.title} ${nextFeedback.detail}`);
      return;
    }
    const leaseToken = leaseTokenRef.current;
    if (!leaseToken) {
      const unavailable = { tone: 'warning' as const, title: '지금은 저장할 수 없습니다.', detail: '편집 연결을 다시 열어 주세요.' };
      setSaveFeedback(unavailable);
      setAnnouncement(`${unavailable.title} ${unavailable.detail}`);
      return;
    }
    setSavePending(true);
    setSavedReadySignature(null);
    setSavedValidation(null);
    /* Saving and validating are two server calls in one click. Once the document
       is persisted, a later validation failure must not be reported as a lost
       save — the work is on the server either way. */
    let persisted = false;
    try {
      if (!basicCatalog) {
        throw new Error('Published Basic catalog is unavailable');
      }
      const editorSnapshot = captureEditorSnapshot();
      const semanticDocument = buildBasicSemanticDocument(editorSnapshot, basicCatalog);
      const presentationDocument = {
        ...presentationDocumentRef.current,
        basicEditor: {
          version: 1,
          snapshot: serializeBasicEditorSnapshot(editorSnapshot),
          viewport: { pan, zoom },
        },
      };
      const saved = await authoringClient.saveDocument(strategyId, {
        expectedEditSequence: editSequenceRef.current,
        leaseToken,
        semanticDocument,
        presentationDocument,
      });
      persisted = true;
      editSequenceRef.current = saved.editSequence;
      semanticDocumentRef.current = saved.semanticDocument;
      presentationDocumentRef.current = saved.presentationDocument;
      /* The document is persisted at this point. Validity is decided below and must
         not change whether the work is saved. */
      setSavedSignature(signatureAtSave);
      setLastSavedAt(saved.updatedAt);
      if (!authoringClient.validateStrategy) {
        const unavailable = { tone: 'warning' as const, title: '전략은 저장했지만 검증하지 못했습니다.', detail: '서버 검증 기능을 사용할 수 없습니다.' };
        setSaveFeedback(unavailable);
        setAnnouncement(`${unavailable.title} ${unavailable.detail}`);
      } else {
        const validation = await authoringClient.validateStrategy(strategyId, basicCatalog.version.id);
        const fresh = validation.requestedEditSequence === saved.editSequence
          && validation.semanticHash === saved.semanticHash
          && validation.elementCatalogVersionId === basicCatalog.version.id;
        const ready = fresh && validation.status === 'VALID';
        setSavedValidation(validation);
        setSavedReadySignature(ready ? signatureAtSave : null);
        if (editorSignatureRef.current === signatureAtSave) setServerValidation(validation);
        const blocking = validation.findings.filter((finding) => (
          finding.severity === 'BLOCKING_ERROR' || finding.severity === 'ERROR'
        ));
        const feedback: SaveFeedback = ready
          ? { tone: 'positive', title: '검증된 출시 가능 상태로 저장했습니다.', detail: validation.findings.length > 0 ? `경고 ${validation.findings.length}개를 확인해 주세요.` : '서버 검증을 모두 통과했습니다.' }
          : { tone: 'warning', title: '미완성 상태로 저장했습니다.', detail: fresh ? blocking[0]?.message ?? '검증 결과를 확인해 주세요.' : '저장된 리비전과 검증 결과가 일치하지 않아 출시를 막았습니다.' };
        setSaveFeedback(feedback);
        setAnnouncement(`${feedback.title} ${feedback.detail}`);
      }
    } catch (error) {
      const conflict = error instanceof StrategyApiError && error.status === 409;
      const failed = {
        tone: 'warning' as const,
        title: conflict
          ? '다른 변경사항과 충돌했습니다.'
          : persisted ? '전략은 저장했지만 검증하지 못했습니다.' : '전략을 저장하지 못했습니다.',
        detail: conflict
          ? '목록으로 돌아가 최신 전략을 다시 열어 주세요.'
          : persisted ? '저장된 내용은 그대로입니다. 잠시 후 다시 저장해 검증해 주세요.' : '잠시 후 다시 시도해 주세요.',
      };
      setSaveFeedback(failed);
      setAnnouncement(`${failed.title} ${failed.detail}`);
    } finally {
      setSavePending(false);
    }
  };

  const closeLaunchDialog = () => {
    if (releasePending) return;
    setLaunchDialogOpen(false);
    setBotName('');
    setBotDescription('');
    setReleaseError(null);
  };

  const preparePersonalBotLaunch = async () => {
    if (!isLaunchable) {
      const firstIssue = validationIssues[0]?.message
        ?? (serverValidation?.status === 'INVALID'
          ? serverValidation.findings.find((finding) => (
            finding.severity === 'BLOCKING_ERROR' || finding.severity === 'ERROR'
          ))?.message
          : '저장 버튼을 눌러 현재 전략을 서버에서 검증해 주세요.')
        ?? '현재 전략을 서버에서 다시 검증해 주세요.';
      const nextFeedback: SaveFeedback = {
        tone: 'warning',
        title: validationIssues.length > 0 ? `출시하려면 ${validationIssues.length}개 항목을 완성해 주세요.` : '출시 전 서버 검증이 필요합니다.',
        detail: firstIssue,
      };
      setSaveFeedback(nextFeedback);
      setAnnouncement(`${nextFeedback.title} ${nextFeedback.detail}`);
      return;
    }

    setSaveFeedback(null);
    setLaunchDialogOpen(true);
    setReleaseError(null);
    if (!strategyId || !authoringClient) {
      setAnnouncement('개인 운용 봇 정보를 입력해 주세요.');
      return;
    }
    setReleaseInputsPending(true);
    try {
      const inputs = await authoringClient.getReleaseInputs();
      setReleaseInputs(inputs);
      setSelectedExecutionPolicy(inputs.executionPolicies[0]?.version ?? '');
      setSelectedDataset(inputs.datasets[0]?.id ?? '');
      if (inputs.executionPolicies.length === 0 || inputs.datasets.length === 0) {
        setReleaseError('현재 사용할 수 있는 실행 정책 또는 공식 백테스트 데이터셋이 없습니다.');
      }
      setAnnouncement('서버에서 확인한 출시 설정을 불러왔습니다.');
    } catch {
      setReleaseError('출시 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setReleaseInputsPending(false);
    }
  };

  const launchPersonalBot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (strategyId && authoringClient) {
      const policy = releaseInputs?.executionPolicies.find((item) => item.version === selectedExecutionPolicy);
      const dataset = releaseInputs?.datasets.find((item) => item.id === selectedDataset);
      if (!savedValidation || savedValidation.status !== 'VALID' || !policy || !dataset) return;
      const cash = fixedScaleUsdAmount(initialCashAmount);
      const budget = Number(budgetPercent);
      if (!cash || !Number.isFinite(budget) || budget <= 0 || budget > 100) {
        setReleaseError('초기 자금과 운용 예산 비율을 올바르게 입력해 주세요.');
        return;
      }
      setReleasePending(true);
      setReleaseError(null);
      try {
        const released = await authoringClient.releaseStrategy(strategyId, {
          validationRunId: savedValidation.validationRunId,
          initialCashAmount: cash,
          budgetCapBps: Math.round(budget * 100),
          brokerRulesVersion: policy.brokerRulesVersion,
          accountingRulesVersion: policy.accountingRulesVersion,
          precisionRulesVersion: policy.precisionRulesVersion,
          feePolicyId: policy.feePolicyId,
          buyingPowerBufferPolicyId: policy.buyingPowerBufferPolicyId,
          datasetManifestId: dataset.id,
          executionPolicyVersion: policy.version,
          candidateConflictPolicy: { policy: 'FIRST_WINS' },
        });
        setLaunchDialogOpen(false);
        setAnnouncement('검증된 전략으로 개인 운용 봇을 출시했습니다.');
        onLaunchBot?.({ name: '', description: '', botId: released.botId });
      } catch (error) {
        setReleaseError(error instanceof StrategyApiError && error.status === 409
          ? '전략 검증이 오래되었거나 같은 release가 다른 내용에 사용되었습니다. 다시 저장·검증해 주세요.'
          : '봇을 출시하지 못했습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.');
      } finally {
        setReleasePending(false);
      }
      return;
    }
    const name = botName.trim();
    const description = botDescription.trim();
    if (!name || !description) return;

    closeLaunchDialog();
    onLaunchBot?.({ name, description });
  };

  useEffect(() => {
    if (!launchDialogOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLaunchDialog();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [launchDialogOpen]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      setCardSizes((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const cardId = (entry.target as HTMLElement).dataset.strategyCard;
          if (!cardId) return;
          const width = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
          const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
          if (next[cardId]?.width === width && next[cardId]?.height === height) return;
          next[cardId] = { width, height };
          changed = true;
        });
        return changed ? next : current;
      });
    });
    cardElementsRef.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [cardBlocks, sections]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, button, [role="combobox"], [contenteditable="true"]');
    const stopSpacePanning = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEditorChange();
        else undoEditorChange();
        return;
      }
      if (commandKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const allCardIds = sections.flatMap((section) => section.cardOrder);
        setSelectedCardIds(allCardIds);
        setSelectedCardId(allCardIds[0] ?? null);
        setAnnouncement(`${allCardIds.length}개 전략 카드를 선택했습니다.`);
        return;
      }
      if (commandKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelectedCards();
        return;
      }
      if (event.key === 'Escape') {
        setSelectedCardIds([]);
        setSelectedCardId(null);
        setExpandedSettingsCardId(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCardIds.length > 0) {
        event.preventDefault();
        rememberEditorChange();
        selectedCardIds.forEach((cardId) => {
          const section = sections.find((item) => item.cardOrder.includes(cardId));
          if (section) deleteStrategyCard(section.id, cardId, false);
        });
        setSelectedCardIds([]);
        return;
      }
      if (event.code !== 'Space') return;
      event.preventDefault();
      if (spacePanningRef.current) return;
      spacePanningRef.current = true;
      setSpacePanning(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') stopSpacePanning();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopSpacePanning);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopSpacePanning);
    };
  });

  const moveBlock = (sourceCardId: string, blockId: string, targetCardId: string, targetIndex: number) => {
    const movingLabel = cardBlocks[sourceCardId].find((block) => block.id === blockId)?.label ?? '선택한';
    /* The same container rule that gates adding a block has to gate moving one.
       The published catalog declares these elements for the SELL container only, so a
       buy card would emit CONTAINER_MISMATCH at the server while looking valid here. */
    if (sourceCardId !== targetCardId && SELL_ONLY_BLOCKS.has(movingLabel)) {
      const owner = sections.find((item) => item.cardOrder.includes(targetCardId));
      if (!owner?.cards.sell.includes(targetCardId)) {
        setAnnouncement(`${movingLabel}은(는) 매도 전략 카드에서만 사용할 수 있어요. 포지션을 보유한 뒤 평가되는 청산 조건입니다.`);
        return;
      }
    }
    rememberEditorChange();
    setCardBlocks((current) => {
      const sourceBlocks = [...current[sourceCardId]];
      const sourceIndex = sourceBlocks.findIndex((block) => block.id === blockId);
      if (sourceIndex < 0) return current;

      const [movingBlock] = sourceBlocks.splice(sourceIndex, 1);
      const targetBlocks = sourceCardId === targetCardId ? sourceBlocks : [...current[targetCardId]];
      const adjustedIndex = sourceCardId === targetCardId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertionIndex = Math.max(0, Math.min(adjustedIndex, targetBlocks.length));
      targetBlocks.splice(insertionIndex, 0, movingBlock);

      return sourceCardId === targetCardId
        ? { ...current, [sourceCardId]: targetBlocks }
        : { ...current, [sourceCardId]: sourceBlocks, [targetCardId]: targetBlocks };
    });
    setAnnouncement(`${movingLabel} 조건 블록을 이동했습니다.`);
  };

  const startDragging = (event: DragEvent<HTMLDivElement>, cardId: string, blockId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blockId);
    setDraggedBlock({ cardId, blockId });
    // Picking up a block clears card selection so the natural-language overlay
    // turns off, making it easy to drop the block onto a different card.
    setSelectedCardId(null);
    setSelectedCardIds([]);
  };

  const dropBlock = (event: DragEvent<HTMLElement>, targetCardId: string, targetIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) moveBlock(draggedBlock.cardId, draggedBlock.blockId, targetCardId, targetIndex);
    setDraggedBlock(null);
    setDragTarget(null);
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>, cardId: string, blockId: string, index: number) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveBlock(cardId, blockId, cardId, Math.max(0, index - 1));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveBlock(cardId, blockId, cardId, Math.min(cardBlocks[cardId].length, index + 2));
    } else if (cardId === 'primary-buy' && event.key === 'ArrowRight') {
      event.preventDefault();
      moveBlock(cardId, blockId, 'primary-sell', cardBlocks['primary-sell'].length);
    } else if (cardId === 'primary-sell' && event.key === 'ArrowLeft') {
      event.preventDefault();
      moveBlock(cardId, blockId, 'primary-buy', cardBlocks['primary-buy'].length);
    }
  };

  const applyTemplate = (template: StrategyTemplate, targetSectionId: string = activeSectionId, dropOrigin?: CanvasPoint) => {
    const targetSection = sections.find((section) => section.id === targetSectionId) ?? sections[0];
    if (!targetSection) return;
    rememberEditorChange();
    const includeSell = template.includeSell !== false;
    const firstCardNumber = cardCount + 1;
    const buyCardId = `${targetSection.id}-${template.id}-buy-${firstCardNumber}`;
    const sellCardId = `${targetSection.id}-${template.id}-sell-${firstCardNumber + 1}`;
    const addedCardIds = [buyCardId, ...(includeSell ? [sellCardId] : [])];
    setCardCount(cardCount + addedCardIds.length);
    setCardBlocks((current) => ({
      ...current,
      // 정기 매수 패키지는 조건 블록 없이 '주기마다' 진입 설정만으로 동작한다.
      [buyCardId]: template.buyCycle ? [] : createTemplateBlocks(template, buyCardId, 'buy'),
      ...(includeSell ? { [sellCardId]: createTemplateBlocks(template, sellCardId, 'sell') } : {}),
    }));
    setCardMeta((current) => ({
      ...current,
      [buyCardId]: {
        title: template.buyTitle ?? `${template.name} 매수`,
        detail: `${template.category} 패키지 · 쉬운 시작`,
        explanation: `${template.description} 매수 조건을 만족하면 주문 후보를 만듭니다.`,
      },
      ...(includeSell ? { [sellCardId]: {
        title: template.sellTitle ?? `${template.name} 매도`,
        detail: `${template.category} 패키지 · 자동 청산`,
        explanation: `${template.description} 반대 신호가 나오면 보유 포지션을 정리합니다.`,
      } } : {}),
    }));
    setSections((current) => current.map((section) => section.id === targetSection.id
      ? {
        ...section,
        cards: {
          buy: [...section.cards.buy, buyCardId],
          sell: includeSell ? [...section.cards.sell, sellCardId] : section.cards.sell,
          risk: section.cards.risk,
        },
        cardOrder: [...section.cardOrder, ...addedCardIds],
        cardPositions: {
          ...section.cardPositions,
          ...Object.fromEntries(addedCardIds.map((cardId, index) => {
            const position = dropOrigin
              ? {
                x: Math.max(24, dropOrigin.x + index * 360),
                y: Math.max(136, dropOrigin.y),
              }
              : getDefaultCardPosition(section.cardOrder.length + index);
            return [cardId, position];
          })),
        },
      }
      : section));
    setBuySettings((current) => ({
      ...current,
      [buyCardId]: { ...createDefaultBuySettings(), ...(template.buyCycle ? { entryMode: '주기마다' as const, cycle: template.buyCycle, maxEntries: 60 } : {}) },
    }));
    if (includeSell) {
      setSellSettings((current) => ({ ...current, [sellCardId]: createDefaultSellSettings() }));
    }
    setSelectedCardId(buyCardId);
    setSelectedCardIds([buyCardId]);
    setActiveSectionId(targetSection.id);
    const addedKinds = ['매수', ...(includeSell ? ['매도'] : [])].join('·');
    setAnnouncement(`${template.name} 패키지의 ${addedKinds} 전략 카드를 ${targetSection.id.replace('section-', 'PARTITION ')}에 추가했습니다.`);
  };

  const addLibraryBlock = (label: string, tone: BlockTone, targetCardId: string | null = selectedCardId, targetIndex?: number, selectCard = true) => {
    if (!targetCardId || !cardBlocks[targetCardId]) {
      setAnnouncement('먼저 블록을 넣을 전략 카드를 선택해 주세요.');
      return;
    }
    if (SELL_ONLY_BLOCKS.has(label)) {
      const owner = sections.find((item) => item.cardOrder.includes(targetCardId));
      if (!owner?.cards.sell.includes(targetCardId)) {
        setAnnouncement(`${label}은(는) 매도 전략 카드에서만 사용할 수 있어요. 포지션을 보유한 뒤 평가되는 청산 조건입니다.`);
        return;
      }
    }
    rememberEditorChange();
    const nextCount = customBlockCount + 1;
    setCustomBlockCount(nextCount);
    setCardBlocks((current) => {
      const nextBlocks = [...current[targetCardId]];
      const insertionIndex = targetIndex == null
        ? nextBlocks.length
        : Math.max(0, Math.min(targetIndex, nextBlocks.length));
      nextBlocks.splice(insertionIndex, 0, createLibraryBlock(label, tone, `${targetCardId}-library-${nextCount}`));
      return { ...current, [targetCardId]: nextBlocks };
    });
    // Dropping a block must not select the card (keeps the natural-language
    // overlay out of the way while moving blocks); clicking-to-add still selects.
    if (selectCard) {
      setSelectedCardId(targetCardId);
      setSelectedCardIds([targetCardId]);
    } else {
      setSelectedCardId(null);
      setSelectedCardIds([]);
    }
    setAnnouncement(`${label} 블록을 대상 전략 카드에 추가했습니다.`);
  };

  const startLibraryDrag = (event: DragEvent<HTMLElement>, payload: LibraryDragPayload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', payload.type === 'template' ? payload.template.name : payload.label);
    setLibraryDrag(payload);
  };

  const finishLibraryDrag = () => {
    setLibraryDrag(null);
    setDragTarget(null);
  };

  const deleteBlock = (cardId: string, blockId: string) => {
    rememberEditorChange();
    const blockLabel = cardBlocks[cardId]?.find((block) => block.id === blockId)?.label ?? '선택한';
    setCardBlocks((current) => ({
      ...current,
      [cardId]: (current[cardId] ?? []).filter((block) => block.id !== blockId),
    }));
    setDraggedBlock(null);
    setDragTarget(null);
    setTrashReady(false);
    setAnnouncement(`${blockLabel} 블록을 삭제했습니다.`);
  };

  const deleteStrategyCard = (sectionId: string, cardId: string, remember = true) => {
    if (remember) rememberEditorChange();
    setSections((current) => current.map((section) => {
      if (section.id !== sectionId) return section;
      const cardPositions = { ...section.cardPositions };
      delete cardPositions[cardId];
      return {
        ...section,
        cards: {
          buy: section.cards.buy.filter((id) => id !== cardId),
          sell: section.cards.sell.filter((id) => id !== cardId),
          risk: section.cards.risk.filter((id) => id !== cardId),
        },
        cardOrder: section.cardOrder.filter((id) => id !== cardId),
        cardPositions,
      };
    }));
    setCardBlocks((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setCardMeta((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setSelectedCardId((current) => current === cardId ? null : current);
    setBuySettings((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setSellSettings((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setSelectedCardIds((current) => current.filter((id) => id !== cardId));
    setCardMove(null);
    setTrashReady(false);
    setAnnouncement('전략 카드를 삭제했습니다.');
  };

  const deleteSection = (sectionId: string, remember = true) => {
    if (remember) rememberEditorChange();
    const targetSection = sections.find((section) => section.id === sectionId);
    const deletedCardIds = new Set<string | null>(targetSection?.cardOrder ?? []);
    const remainingSections = sections.filter((section) => section.id !== sectionId);
    setSections(remainingSections);
    setCardBlocks((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setCardMeta((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setBuySettings((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setSellSettings((current) => Object.fromEntries(
      Object.entries(current).filter(([cardId]) => !deletedCardIds.has(cardId))
    ));
    setSymbolLimits((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
    setActiveSectionId((current) => current === sectionId ? (remainingSections[0]?.id ?? '') : current);
    setSelectedCardId((current) => deletedCardIds.has(current) ? null : current);
    setSectionMove(null);
    setTrashReady(false);
    setPreviewSectionId((current) => current === sectionId ? null : current);
    setAnnouncement('파티션을 삭제했습니다.');
  };

  const isPointerOverTrash = (event: { clientX: number; clientY: number }) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;
  };

  const dropOnTrash = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedBlock) {
      deleteBlock(draggedBlock.cardId, draggedBlock.blockId);
    }
  };

  const dropLibraryBlock = (event: DragEvent<HTMLElement>, targetCardId: string, targetIndex?: number) => {
    if (libraryDrag?.type !== 'block') return false;
    event.preventDefault();
    event.stopPropagation();
    addLibraryBlock(libraryDrag.label, libraryDrag.tone, targetCardId, targetIndex, false);
    finishLibraryDrag();
    return true;
  };

  const updateStrategyBlock = (cardId: string, blockId: string, patch: Partial<BasicBlock>) => {
    rememberEditorChange();
    setCardBlocks((current) => ({
      ...current,
      [cardId]: current[cardId].map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
    setAnnouncement('블록 설정을 변경했습니다.');
  };

  const toggleFavoriteBlock = (label: string) => {
    setFavoriteBlockLabels((current) => current.includes(label)
      ? current.filter((item) => item !== label)
      : [...current, label]);
  };

  const renderLibraryBlock = (item: string, tone: BlockTone, pinned = false) => {
    const isFavorite = favoriteBlockLabels.includes(item);
    const LibraryBlockIcon = getBasicBlockIcon(item, tone);
    return <div
      className={`basic-library-node-card pro-library-node-card tone-${tone} ${pinned ? 'is-pinned' : ''}`}
      key={`${pinned ? 'favorite' : 'library'}-${item}`}
    >
      <div
        role="button"
        tabIndex={0}
        className={`library-block-button pro-library-node-main has-tone-band ${libraryDrag?.type === 'block' && libraryDrag.label === item && libraryDrag.tone === tone ? 'is-library-dragging' : ''}`}
        aria-label={`${item} 블록 추가`}
        draggable
        onDragStart={(event) => startLibraryDrag(event, { type: 'block', label: item, tone })}
        onDragEnd={finishLibraryDrag}
        onClick={() => addLibraryBlock(item, tone)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          addLibraryBlock(item, tone);
        }}
      >
        <span className="pro-library-icon basic-library-block-icon"><LibraryBlockIcon size={15} /></span>
        <span className="basic-library-block-copy">
          <span className="basic-library-title-row">
            <strong>{item}</strong>
            <button
              type="button"
              className={`pro-library-favorite basic-library-favorite ${isFavorite ? 'is-active' : ''}`}
              aria-label={`${item} ${isFavorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}`}
              aria-pressed={isFavorite}
              onClick={(event) => {
                event.stopPropagation();
                toggleFavoriteBlock(item);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            ><Star size={10} fill={isFavorite ? 'currentColor' : 'none'} /></button>
          </span>
          <small>{getBlockLibraryDescription(item)}</small>
        </span>
        <Plus className="pro-library-add-icon" size={14} />
      </div>
    </div>;
  };

  const resolveBlockDropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.height <= 0) return index;
    return event.clientY >= bounds.top + bounds.height / 2 ? index + 1 : index;
  };

  const renderEditableBlocks = (cardId: string, side: Side, ruleSide: 'left' | 'right' = 'right') => cardBlocks[cardId].map((block, index) => <Fragment key={block.id}>
    {index > 0 && <span className="condition-chain-link is-cutout is-outline-only is-foreground tone-neutral-metal" aria-hidden="true">
      <Link2 className="condition-chain-outline" size={14} strokeWidth={4} />
      <Link2 className="condition-chain-mark" size={14} strokeWidth={1.8} />
    </span>}
    <StrategyBlock
      {...block}
      side={side}
      invalid={focusedInvalidBlockIds.has(block.id)}
      showRule={selectedCardId === cardId}
      rule={getBlockNarrative(block, index === cardBlocks[cardId].length - 1)}
      ruleSide={ruleSide}
      ruleStep={index + 1}
      ruleTestId="basic-narrative-block"
      onChange={(patch) => updateStrategyBlock(cardId, block.id, patch)}
      dragging={draggedBlock?.blockId === block.id}
      dragProps={{
        onDragStart: (event) => startDragging(event, cardId, block.id),
        onDragEnd: () => { setDraggedBlock(null); setDragTarget(null); setTrashReady(false); },
        onDragOver: (event) => {
          const insertionIndex = resolveBlockDropIndex(event, index);
          if (libraryDrag?.type === 'block') {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragTarget({ cardId, index: insertionIndex });
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDragTarget({ cardId, index: insertionIndex });
        },
        onDragLeave: () => setDragTarget(null),
        onDrop: (event) => {
          const insertionIndex = resolveBlockDropIndex(event, index);
          if (!dropLibraryBlock(event, cardId, insertionIndex)) dropBlock(event, cardId, insertionIndex);
        },
        onKeyDown: (event) => moveWithKeyboard(event, cardId, block.id, index),
        'data-drop-target': dragTarget?.cardId === cardId && (dragTarget.index === index || dragTarget.index === index + 1) ? 'true' : undefined,
        'data-drop-position': dragTarget?.cardId === cardId
          ? dragTarget.index === index
            ? 'before'
            : dragTarget.index === index + 1
              ? 'after'
              : undefined
          : undefined,
      }}
    />
  </Fragment>);

  const updateSection = (sectionId: string, patch: Partial<StrategySection>) => setSections((current) => current.map((section) => (
    section.id === sectionId ? { ...section, ...patch } : section
  )));

  const updateCardPosition = (sectionId: string, cardId: string, position: CanvasPoint) => {
    setSections((current) => current.map((section) => section.id === sectionId
      ? {
        ...section,
        cardPositions: {
          ...section.cardPositions,
          [cardId]: position,
        },
      }
      : section));
  };

  const snapCanvasPoint = (point: CanvasPoint): CanvasPoint => gridSnap
    ? {
      x: Math.round(point.x / 16) * 16,
      y: Math.round(point.y / 16) * 16,
    }
    : point;

  const organizeActiveSection = () => {
    const section = sections.find((item) => item.id === activeSectionId);
    if (!section || section.cardOrder.length < 2) return;
    rememberEditorChange();
    const orderedCards = [
      ...section.cards.buy,
      ...section.cards.sell,
      ...section.cards.risk,
    ];
    setSections((current) => current.map((item) => item.id === section.id
      ? {
        ...item,
        cardOrder: orderedCards,
        cardPositions: {
          ...item.cardPositions,
          ...Object.fromEntries(orderedCards.map((cardId, index) => [
            cardId,
            {
              x: 24 + (index % 3) * 360,
              y: 136 + Math.floor(index / 3) * 320,
            },
          ])),
        },
      }
      : item));
    setAnnouncement('선택한 파티션의 전략 카드를 종류별로 정리했습니다.');
  };

  const getSectionLayout = (section: StrategySection) => {
    const layout = getBasicSectionLayout(
      section.cardOrder,
      (cardId, index) => section.cardPositions?.[cardId] ?? getDefaultCardPosition(index),
      cardSizes,
    );
    // The partition is at least the minimum that shows the required-buy prompt,
    // at least big enough for its current cards, and at least the size the user
    // drew or resized it to — whichever is largest wins on each axis.
    return {
      width: Math.max(MIN_SECTION_WIDTH, layout.width, section.width ?? 0),
      height: Math.max(MIN_SECTION_HEIGHT, layout.height, section.height ?? 0),
    };
  };

  /* The editor has no market-data preview contract. Keep only the partition's
     real configured symbols for the honest unavailable state below. */
  const previewSection = sections.find((section) => section.id === previewSectionId) ?? null;
  const previewSectionNumber = previewSection
    ? String(sections.findIndex((section) => section.id === previewSection.id) + 1).padStart(2, '0')
    : '';
  const previewSymbols = useMemo(
    () => previewSection ? splitPartitionSymbols(previewSection.symbol) : [],
    [previewSection],
  );
  const previewFlows = useMemo<PreviewFlow[]>(() => previewSection
    ? previewSection.cardOrder.flatMap((cardId): PreviewFlow[] => {
      const side = previewSection.cards.buy.includes(cardId) ? 'buy' : previewSection.cards.sell.includes(cardId) ? 'sell' : null;
      if (!side) return [];
      return [{
        id: cardId,
        label: cardMeta[cardId]?.title ?? (side === 'buy' ? '매수 전략' : '매도 전략'),
        side,
        blocks: (cardBlocks[cardId] ?? []).map(({ label, op, value, tone }) => ({ label, op, value, tone })),
      }];
    })
    : [], [cardBlocks, cardMeta, previewSection]);

  useEffect(() => {
    if (!previewSection || !marketDataClient) {
      setPreviewCandles(null);
      setPreviewPending(false);
      setPreviewError(null);
      return undefined;
    }
    const instrumentId = previewSection.instrumentIds?.[0]
      ?? basicCatalog?.instruments.find((instrument) => instrument.symbol === previewSymbols[0])?.id;
    if (!instrumentId) {
      setPreviewCandles([]);
      setPreviewError('미리보기를 조회할 공식 종목 식별자가 없습니다.');
      return undefined;
    }
    const controller = new AbortController();
    setPreviewPending(true);
    setPreviewError(null);
    void marketDataClient.getRecentBars(instrumentId, '30m', 300, controller.signal)
      .then((snapshot) => {
        setPreviewCandles(snapshot.bars.map((bar) => ({
          time: Math.floor(new Date(bar.occurredAt).getTime() / 1000),
          open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
        })));
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setPreviewCandles(null);
          setPreviewError('실제 시장 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      })
      .finally(() => setPreviewPending(false));
    return () => controller.abort();
  }, [basicCatalog, marketDataClient, previewSection, previewSymbols]);

  const addStrategyCard = (sectionId: string, side: Side) => {
    const section = sections.find((item) => item.id === sectionId)!;
    rememberEditorChange();
    const nextCardCount = cardCount + 1;
    const cardId = `${sectionId}-${side}-${section.cards[side].length + 1}-${nextCardCount}`;
    setCardCount(nextCardCount);
    setCardBlocks((current) => ({ ...current, [cardId]: createDefaultCardBlocks(cardId, side) }));
    setCardMeta((current) => ({
      ...current,
      [cardId]: {
        title: `${side === 'buy' ? '매수' : side === 'sell' ? '매도' : '위기관리'} 전략`,
        detail: '조건을 모두 만족하면 실행',
        explanation: '',
      },
    }));
    if (side === 'buy') {
      setBuySettings((current) => ({ ...current, [cardId]: createDefaultBuySettings() }));
    } else if (side === 'sell') {
      setSellSettings((current) => ({ ...current, [cardId]: createDefaultSellSettings() }));
    }
    setSections((current) => current.map((item) => item.id === sectionId
      ? {
        ...item,
        cards: { ...item.cards, [side]: [...item.cards[side], cardId] },
        cardOrder: [...item.cardOrder, cardId],
        cardPositions: {
          ...item.cardPositions,
          [cardId]: getDefaultCardPosition(item.cardOrder.length),
        },
      }
      : item));
    setActiveSectionId(sectionId);
    setSelectedCardId(cardId);
    setSelectedCardIds([cardId]);
    setAnnouncement(`${sectionId.replace('section-', 'PARTITION ')}에 ${side === 'buy' ? '매수' : side === 'sell' ? '매도' : '위기관리'} 전략 카드를 추가했습니다.`);
  };

  const dropOnSection = (event: DragEvent<HTMLElement>, targetSectionId: string) => {
    if (libraryDrag?.type === 'template') {
      event.preventDefault();
      event.stopPropagation();
      const sectionBounds = event.currentTarget.getBoundingClientRect();
      const localX = (event.clientX - sectionBounds.left) / zoom;
      const localY = (event.clientY - sectionBounds.top) / zoom;
      const dropOrigin = {
        x: Number.isFinite(localX) ? Math.max(24, localX) : 24,
        y: Number.isFinite(localY) ? Math.max(136, localY) : 136,
      };
      applyTemplate(libraryDrag.template, targetSectionId, dropOrigin);
      finishLibraryDrag();
    }
  };

  const pointInSurface = (event: ReactPointerEvent<HTMLDivElement>): CanvasPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - pan.x) / zoom,
      y: (event.clientY - bounds.top - pan.y) / zoom,
    };
  };

  const beginCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target as Element).closest?.('.strategy-card')) {
      setSelectedCardId(null);
      setSelectedCardIds([]);
      setValidationFocus(null);
    }
    if (event.target !== event.currentTarget) return;
    if (drawMode) {
      const point = pointInSurface(event);
      setDrawStart(point);
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
    } else {
      setPanGesture({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const zoomCanvasWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (drawMode || sectionMove || sectionResize || cardMove) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const next = getStrategyCanvasWheelZoom(zoom, pan, event.deltaY, cursorX, cursorY);
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const updateCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest<HTMLElement>('.basic-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas.style.setProperty('--spotlight-opacity', '1');
  };

  const hideCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.closest<HTMLElement>('.basic-canvas')?.style.setProperty('--spotlight-opacity', '0');
    pointerPositionRef.current = null;
  };

  const updateCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorSpotlight(event);
    const previousPointer = pointerPositionRef.current;
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (cardMove) {
      if (!cardMove.historyRecorded) {
        rememberEditorChange();
        setCardMove((current) => current ? { ...current, historyRecorded: true } : current);
      }
      setTrashReady(isPointerOverTrash(event));
      updateCardPosition(
        cardMove.sectionId,
        cardMove.cardId,
        snapCanvasPoint(getMovedBasicCardPosition(cardMove, event.clientX, event.clientY, zoom)),
      );
      return;
    }
    if (sectionMove) {
      if (!sectionMove.historyRecorded) {
        rememberEditorChange();
        setSectionMove((current) => current ? { ...current, historyRecorded: true } : current);
      }
      setTrashReady(isPointerOverTrash(event));
      const nextPosition = snapCanvasPoint({
        x: sectionMove.originX + (event.clientX - sectionMove.startX) / zoom,
        y: sectionMove.originY + (event.clientY - sectionMove.startY) / zoom,
      });
      updateSection(sectionMove.sectionId, nextPosition);
      return;
    }
    if (sectionResize) {
      if (!sectionResize.historyRecorded) {
        rememberEditorChange();
        setSectionResize((current) => current ? { ...current, historyRecorded: true } : current);
      }
      updateSection(sectionResize.sectionId, {
        width: Math.max(MIN_SECTION_WIDTH, Math.round(sectionResize.originWidth + (event.clientX - sectionResize.startX) / zoom)),
        height: Math.max(MIN_SECTION_HEIGHT, Math.round(sectionResize.originHeight + (event.clientY - sectionResize.startY) / zoom)),
      });
      return;
    }
    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
      return;
    }
    if (spacePanningRef.current) {
      if (previousPointer) {
        setPan((current) => ({
          x: current.x + event.clientX - previousPointer.x,
          y: current.y + event.clientY - previousPointer.y,
        }));
      }
      return;
    }
    if (drawStart) {
      const point = pointInSurface(event);
      setDraftRect({
        x: Math.min(drawStart.x, point.x),
        y: Math.min(drawStart.y, point.y),
        width: Math.abs(point.x - drawStart.x),
        height: Math.abs(point.y - drawStart.y),
      });
    }
  };

  const finishCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldDelete = event?.type !== 'pointercancel' && isPointerOverTrash(event);
    if (shouldDelete && cardMove) {
      deleteStrategyCard(cardMove.sectionId, cardMove.cardId, !cardMove.historyRecorded);
      setDrawStart(null);
      setDraftRect(null);
      setPanGesture(null);
      return;
    }
    if (shouldDelete && sectionMove) {
      deleteSection(sectionMove.sectionId, !sectionMove.historyRecorded);
      setDrawStart(null);
      setDraftRect(null);
      setPanGesture(null);
      return;
    }
    if (drawStart && draftRect && draftRect.width >= 120 && draftRect.height >= 100) {
      rememberEditorChange();
      const sectionNumber = sections.length + 1;
      const sectionId = `section-${sectionNumber}`;
      setSymbolLimits((current) => ({ ...current, [sectionId]: {} }));
      // A new partition starts empty — the required-buy prompt guides the first card.
      setSections((current) => [...current, {
        id: sectionId,
        symbol: '종목 선택',
        allocation: 10,
        timeframe: DEFAULT_BASIC_TIMEFRAME,
        x: draftRect.x,
        y: draftRect.y,
        // Keep the drawn size; getSectionLayout clamps it up to the minimum.
        width: Math.round(draftRect.width),
        height: Math.round(draftRect.height),
        cards: { buy: [], sell: [], risk: [] },
        cardOrder: [],
        cardPositions: {},
      }]);
      setActiveSectionId(sectionId);
      setSelectedCardId(null);
      setSelectedCardIds([]);
      setAnnouncement(`PARTITION ${String(sectionNumber).padStart(2, '0')}을 만들었습니다. 매수 전략 카드를 추가해 시작하세요.`);
    }
    if (drawStart) setDrawMode(false);
    setDrawStart(null);
    setDraftRect(null);
    setPanGesture(null);
    setSectionMove(null);
    setSectionResize(null);
    setCardMove(null);
    setTrashReady(false);
  };

  const beginSectionMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveSectionId(section.id);
    setSectionMove({ sectionId: section.id, startX: event.clientX, startY: event.clientY, originX: section.x, originY: section.y });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const beginSectionAreaMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest?.('button, input, select, label, .strategy-card')) return;
    setSelectedCardId(null);
    setSelectedCardIds([]);
    beginSectionMove(event, section);
  };

  const beginSectionResize = (event: ReactPointerEvent<HTMLElement>, section: StrategySection) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveSectionId(section.id);
    const current = getSectionLayout(section);
    setSectionResize({
      sectionId: section.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: current.width,
      originHeight: current.height,
    });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const beginCardMove = (event: ReactPointerEvent<HTMLElement>, section: StrategySection, cardId: string, wasSelected: boolean) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest?.('button, input, select, label, [role="combobox"]')) return;
    event.preventDefault();
    event.stopPropagation();
    cardSelectionAtPointerDownRef.current = { cardId, wasSelected };
    const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(section.cardOrder.indexOf(cardId));
    setActiveSectionId(section.id);
    setSelectedCardId(cardId);
    setSelectedCardIds([cardId]);
    setCardMove({
      sectionId: section.id,
      cardId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
    event.currentTarget.closest('.section-workspace')?.setPointerCapture?.(event.pointerId);
  };

  const startCardTitleEdit = (cardId: string) => {
    rememberEditorChange();
    setEditingCardTitleId(cardId);
    setCardTitleDraft(cardMeta[cardId]?.title ?? '');
  };

  const finishCardTitleEdit = (cardId: string) => {
    const nextTitle = cardTitleDraft.trim();
    if (nextTitle) {
      setCardMeta((current) => ({
        ...current,
        [cardId]: { ...current[cardId], title: nextTitle },
      }));
      setAnnouncement(`전략 카드 이름을 ${nextTitle}(으)로 변경했습니다.`);
    }
    setEditingCardTitleId(null);
    setCardTitleDraft('');
  };

  const renderStrategyCard = (section: StrategySection, side: Side, cardId: string, cardIndex: number) => {
    const isPrimary = cardId === `primary-${side}`;
    const testId = isPrimary ? `basic-${side}-group` : `strategy-card-${cardId}`;
    const stackTestId = isPrimary ? `basic-${side}-stack` : `strategy-stack-${cardId}`;
    const isSelected = selectedCardIds.includes(cardId) || selectedCardId === cardId;
    const sideLabel = side === 'buy' ? '매수' : side === 'sell' ? '매도' : '위기관리';
    const terminalLabel = side === 'buy' ? '매수 요청' : side === 'sell' ? '매도 요청' : '전량 청산';
    const sectionNumber = String(sections.findIndex((item) => item.id === section.id) + 1).padStart(2, '0');
    const meta = cardMeta[cardId] ?? {
      title: `${sideLabel} 전략`,
      detail: '조건을 모두 만족하면 실행',
      explanation: '',
    };
    // 기본값을 먼저 깔고 저장된 값을 덮어써, 이전 스키마로 저장돼 entryMode 등이
    // 빠진 데이터에서도 항상 유효한 모드(기본 '1회만')가 선택되도록 한다.
    const settings = { ...createDefaultBuySettings(), ...buySettings[cardId] };
    const sellExecution = { ...createDefaultSellSettings(), ...sellSettings[cardId] };
    const position = section.cardPositions?.[cardId] ?? getDefaultCardPosition(cardIndex);
    const ruleSide: 'left' | 'right' = position.x > Math.max(520, (section.width ?? 752) * .56) ? 'left' : 'right';
    const budgetRule = side === 'buy'
      ? <>전략 예산의 <b>{Math.round(section.allocation / Math.max(1, section.cards.buy.length))}%</b>를 사용하고 한 번에 최대 <b>{settings.maxOrderPercent}%</b>까지 주문합니다.</>
      : side === 'sell'
        ? <>매도 비율 <b>{sellExecution.sellPercent || '미설정'}%</b>만큼 주문합니다.</>
        : <>해당 포지션을 전량 정산합니다.</>;
    return <div
      key={cardId}
      className={`strategy-container content-sized-strategy ${side}-container strategy-card ${isSelected ? 'is-selected is-explained' : ''} ${invalidCardIds.has(cardId) ? 'has-validation-error' : ''} ${validationFocus?.cardId === cardId ? `is-issue-focused is-issue-${validationFocus.field}` : ''} ${cardMove?.cardId === cardId ? 'is-free-moving' : ''} ${libraryDrag?.type === 'block' ? 'is-library-drop-ready' : ''}`}
      data-testid={testId}
      data-strategy-card={cardId}
      data-selected={isSelected ? 'true' : undefined}
      role={side === 'risk' ? 'region' : undefined}
      aria-label={side === 'risk' ? `PARTITION ${sectionNumber} 위기관리 전략` : undefined}
      ref={(element) => {
        if (element) cardElementsRef.current.set(cardId, element);
        else cardElementsRef.current.delete(cardId);
      }}
      style={{ left: position.x, top: position.y }}
      onDragOver={(event) => {
        if (libraryDrag?.type === 'block') {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          return;
        }
      }}
      onDrop={(event) => {
        dropLibraryBlock(event, cardId, cardBlocks[cardId].length);
      }}
    >
      <header
        className="strategy-container-header"
        role="group"
        aria-label={`${sideLabel} 전략 카드 이동 영역`}
        tabIndex={0}
        onPointerDown={(event) => beginCardMove(event, section, cardId, isSelected)}
        onClick={() => {
          setActiveSectionId(section.id);
          const selectionBeforePointer = cardSelectionAtPointerDownRef.current?.cardId === cardId
            ? cardSelectionAtPointerDownRef.current.wasSelected
            : isSelected;
          cardSelectionAtPointerDownRef.current = null;
          setSelectedCardId(selectionBeforePointer ? null : cardId);
          setSelectedCardIds(selectionBeforePointer ? [] : [cardId]);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setActiveSectionId(section.id);
          setSelectedCardId(isSelected ? null : cardId);
          setSelectedCardIds(isSelected ? [] : [cardId]);
        }}
      >
        <div className="strategy-container-identity">
          <span className="container-title-row">
            {editingCardTitleId === cardId
              ? <input
                autoFocus
                aria-label={`${sideLabel} 전략 이름`}
                value={cardTitleDraft}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setCardTitleDraft(event.target.value)}
                onBlur={() => finishCardTitleEdit(cardId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') finishCardTitleEdit(cardId);
                  if (event.key === 'Escape') {
                    setEditingCardTitleId(null);
                    setCardTitleDraft('');
                  }
                }}
              />
              : <strong>{meta.title}</strong>}
          <button
            className="container-title-edit"
            type="button"
            aria-label={`${sideLabel} 전략 이름 편집${isPrimary ? '' : ` ${cardIndex + 1}`}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedCardId(cardId);
              setSelectedCardIds([cardId]);
              startCardTitleEdit(cardId);
            }}
          ><Pencil size={12} /></button>
          </span>
          {(side === 'buy' || side === 'sell' || invalidCardIds.has(cardId)) && <span className="container-title-tags">
            {side === 'buy' && <>
              <span>예산 {Math.round(section.allocation / Math.max(1, section.cards.buy.length))}%</span>
              <span>주문 최대 {settings.maxOrderPercent}%</span>
              {settings.entryMode !== '1회만' && <span>{settings.entryMode}</span>}
            </>}
            {side === 'sell' && <>
              <span>{sellExecution.sellPercent ? `매도 ${sellExecution.sellPercent}%` : '비율 미설정'}</span>
              {sellExecution.executeMode !== '1회만' && <span>{sellExecution.executeMode}</span>}
            </>}
            {invalidCardIds.has(cardId) && <em className="strategy-validation-badge">{cardBlocks[cardId]?.length ? '입력 필요' : '조건 필요'}</em>}
          </span>}
        </div>
        {(side === 'buy' || side === 'sell') && <button
            className="container-settings-toggle"
            type="button"
            aria-label={`${sideLabel} 전략 실행 설정${isPrimary ? '' : ` ${cardIndex + 1}`}`}
            aria-expanded={expandedSettingsCardId === cardId}
            onClick={(event) => {
              event.stopPropagation();
              // Opening settings must not select the card / show the narrative overlay.
              setSelectedCardId(null);
              setSelectedCardIds([]);
              setExpandedSettingsCardId((current) => current === cardId ? null : cardId);
            }}
          ><Settings2 size={12} /></button>}
      </header>
      {side === 'buy' && expandedSettingsCardId === cardId && <section className="container-settings-card is-popover" role="group" aria-label="매수 실행 설정">
        <header className="container-settings-head">
          <span><Settings2 size={13} aria-hidden="true" /><strong>매수 설정</strong></span>
          <button type="button" aria-label="매수 실행 설정 닫기" onClick={() => setExpandedSettingsCardId(null)}><X size={13} /></button>
        </header>
        {/* 사용 예산·주문 비율은 헤더 태그·요청 블록에서 다루므로, 여기엔 '진입 방식'만 둔다.
            스케줄(주기마다)과 재진입 대기는 모두 "언제 다시 조건을 확인해 진입할지"를 정하므로
            하나의 상호 배타 모드로 통합했다. '주기마다'는 조건 블록 없이도 정기 매수가 된다. */}
        <div className="setting-field-group">
          <span className="setting-field-title"><strong>진입 방식</strong><small>조건을 언제 다시 확인해 진입할지 정합니다</small></span>
          <div className="setting-mode-tabs" role="radiogroup" aria-label="진입 방식">
            {(['1회만', '주기마다', '대기 후 재진입'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings.entryMode === mode}
                className={settings.entryMode === mode ? 'is-active' : ''}
                onClick={() => {
                  rememberEditorChange();
                  setBuySettings((current) => ({ ...current, [cardId]: { ...settings, entryMode: mode } }));
                }}
              >{mode}</button>
            ))}
          </div>
        </div>
        {settings.entryMode === '1회만' && <p className="setting-mode-hint">조건을 충족하면 한 번만 진입합니다.</p>}
        {settings.entryMode === '주기마다' && <div className="additional-buy-settings">
          <label><span>주기</span><select aria-label="진입 주기" value={settings.cycle} onChange={(event) => {
            rememberEditorChange();
            setBuySettings((current) => ({ ...current, [cardId]: { ...settings, cycle: event.target.value as BuyCycle } }));
          }}><option>매 거래일</option><option>매주 첫 거래일</option><option>매월 첫 거래일</option><option>매월 마지막 거래일</option><option>N거래일마다</option></select></label>
          {settings.cycle === 'N거래일마다' && <label><span>간격</span><input type="number" min="2" max="365" aria-label="진입 주기 간격(거래일)" value={settings.cycleInterval} onChange={(event) => setBuySettings((current) => ({ ...current, [cardId]: { ...settings, cycleInterval: Number(event.target.value) } }))} /></label>}
          <label><span>최대 진입</span><input type="number" min="2" max="1000" aria-label="한 포지션 최대 진입 횟수" value={settings.maxEntries} onChange={(event) => setBuySettings((current) => ({ ...current, [cardId]: { ...settings, maxEntries: Number(event.target.value) } }))} /></label>
          <p className="setting-mode-hint">조건 블록이 없으면 지정 주기마다 정기 매수합니다.</p>
        </div>}
        {settings.entryMode === '대기 후 재진입' && <div className="additional-buy-settings">
          <label><span>대기</span><select aria-label="재진입 대기 방식" value={settings.reentryWait} onChange={(event) => setBuySettings((current) => ({ ...current, [cardId]: { ...settings, reentryWait: event.target.value as RerunWait } }))}><option>조건 재충족</option><option>N봉 이후</option><option>N거래일 이후</option></select></label>
          {settings.reentryWait !== '조건 재충족' && <label><span>간격</span><input type="number" min="1" max="365" aria-label="재진입 간격" value={settings.reentryInterval} onChange={(event) => setBuySettings((current) => ({ ...current, [cardId]: { ...settings, reentryInterval: Number(event.target.value) } }))} /></label>}
          <label><span>최대 진입</span><input type="number" min="2" max="1000" aria-label="한 포지션 최대 진입 횟수" value={settings.maxEntries} onChange={(event) => setBuySettings((current) => ({ ...current, [cardId]: { ...settings, maxEntries: Number(event.target.value) } }))} /></label>
        </div>}
      </section>}
      {side === 'sell' && expandedSettingsCardId === cardId && <section className="container-settings-card is-popover" role="group" aria-label="매도 실행 설정">
        <header className="container-settings-head">
          <span><Settings2 size={13} aria-hidden="true" /><strong>매도 설정</strong></span>
          <button type="button" aria-label="매도 실행 설정 닫기" onClick={() => setExpandedSettingsCardId(null)}><X size={13} /></button>
        </header>
        {/* 매도 비율은 카드 하단 요청 블록에서 편집하므로, 설정창에는 '실행 방식'만 둔다.
            매도엔 주기 개념이 없어 1회만 / 대기 후 재실행 두 모드만 제공한다. */}
        <div className="setting-field-group">
          <span className="setting-field-title"><strong>실행 방식</strong><small>조건을 언제 다시 확인해 매도할지 정합니다</small></span>
          <div className="setting-mode-tabs" role="radiogroup" aria-label="실행 방식">
            {(['1회만', '대기 후 재실행'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={sellExecution.executeMode === mode}
                className={sellExecution.executeMode === mode ? 'is-active' : ''}
                onClick={() => {
                  rememberEditorChange();
                  setSellSettings((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? createDefaultSellSettings()), executeMode: mode } }));
                }}
              >{mode}</button>
            ))}
          </div>
        </div>
        {sellExecution.executeMode === '1회만' && <p className="setting-mode-hint">조건을 충족하면 한 번만 매도합니다.</p>}
        {sellExecution.executeMode === '대기 후 재실행' && <div className="additional-buy-settings">
          <label><span>대기</span><select aria-label="재매도 대기 방식" value={sellExecution.reexecWait} onChange={(event) => setSellSettings((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? createDefaultSellSettings()), reexecWait: event.target.value as RerunWait } }))}><option>조건 재충족</option><option>N봉 이후</option><option>N거래일 이후</option></select></label>
          {sellExecution.reexecWait !== '조건 재충족' && <label><span>간격</span><input type="number" min="1" max="365" aria-label="재매도 간격" value={sellExecution.reexecInterval} onChange={(event) => setSellSettings((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? createDefaultSellSettings()), reexecInterval: Number(event.target.value) } }))} /></label>}
          <label><span>최대 실행</span><input type="number" min="2" max="1000" aria-label="한 포지션 최대 매도 횟수" value={sellExecution.maxExecutions} onChange={(event) => setSellSettings((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? createDefaultSellSettings()), maxExecutions: Number(event.target.value) } }))} /></label>
        </div>}
      </section>}
      <div
        className={`block-stack ${cardBlocks[cardId].length > 0 ? `has-condition-blocks has-center-marker ${cardBlocks[cardId].length === 1 ? 'is-single-condition' : 'is-multi-condition is-chain-linked-group'}` : ''}`}
        data-testid={stackTestId}
        aria-label={`${sideLabel} 전략 조건 목록`}
        onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = libraryDrag?.type === 'block' ? 'copy' : 'move';
      }} onDrop={(event) => {
        if (!dropLibraryBlock(event, cardId, cardBlocks[cardId].length)) dropBlock(event, cardId, cardBlocks[cardId].length);
      }}>
        {cardBlocks[cardId].length > 0
          ? <>{renderEditableBlocks(cardId, side, ruleSide)}</>
          : <div className="empty-container-drop"><Plus size={14} /><strong>조건 놓기</strong><small>블록 탭에서 드래그</small></div>}
      </div>
      {/*
        The order terminal is a fixed, full-width action block — deliberately
        set apart from the draggable condition blocks (solid card colour, no
        drag handle) — carrying the request line and its effectively-required
        ratio inline. It lives in the footer, outside the condition stack, so
        the stack's left centre-marker never counts it.
      */}
      <footer className="strategy-container-footer" aria-label={`고정 ${sideLabel} 실행`} onPointerDown={(event) => beginCardMove(event, section, cardId, isSelected)}>
        <div className="block-with-copy fixed-terminal-block">
          <div
            className={`terminal-request-block ${side === 'sell' && !sellExecution.sellPercent ? 'is-unset' : ''}`}
            data-testid={isPrimary ? `${side}-order-block` : `${cardId}-order-block`}
          >
            <span className="terminal-request-icon" aria-hidden="true">{side === 'buy' ? <TrendingUp size={16} strokeWidth={2.4} /> : side === 'sell' ? <TrendingDown size={16} strokeWidth={2.4} /> : <ShieldCheck size={16} strokeWidth={2.4} />}</span>
            <span className="terminal-request-label">{side === 'risk' ? terminalLabel : `이 비율로 ${terminalLabel}`}</span>
            {(side === 'buy' || side === 'sell') && <span
              className="terminal-request-ratio setting-with-unit"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                type="number"
                min="1"
                max="100"
                placeholder="—"
                aria-label={side === 'buy' ? '매수 비율' : '매도 비율'}
                value={side === 'buy' ? settings.maxOrderPercent : sellExecution.sellPercent}
                onFocus={rememberEditorChange}
                onChange={(event) => {
                  setSelectedCardId(cardId);
                  // 비율은 1~100%로 제한한다(직접 타이핑 시 100 초과·0 방지).
                  const clampPercent = (raw: number) => Math.max(1, Math.min(100, raw));
                  if (side === 'buy') {
                    setBuySettings((current) => ({ ...current, [cardId]: { ...settings, maxOrderPercent: clampPercent(Number(event.target.value) || 1) } }));
                  } else {
                    setSellSettings((current) => ({ ...current, [cardId]: { ...(current[cardId] ?? createDefaultSellSettings()), sellPercent: event.target.value === '' ? '' : clampPercent(Number(event.target.value)) } }));
                  }
                }}
              />
              <b>%</b>
            </span>}
          </div>
          {isSelected && <BlockRuleNote side={ruleSide} step={cardBlocks[cardId].length + 1} tone={side} testId="basic-narrative-budget">{budgetRule}</BlockRuleNote>}
        </div>
      </footer>
    </div>;
  };

  const symbolManagerSection = sections.find((section) => section.id === symbolManagerSectionId) ?? null;
  const managedSymbols = symbolManagerSection ? splitPartitionSymbols(symbolManagerSection.symbol) : [];
  const selectableInstruments: SelectableInstrument[] = basicCatalog
    ? basicCatalog.instruments
    : catalogClient
      ? []
      : LOCAL_PREVIEW_SYMBOLS.map((symbol) => ({ id: '', symbol }));
  const normalizedInstrumentQuery = instrumentQuery.trim().toLocaleUpperCase('en-US');
  const unselectedInstruments = selectableInstruments.filter((instrument) => !managedSymbols.includes(instrument.symbol));
  const availableInstrumentInitials = new Set(unselectedInstruments.map((instrument) => (
    instrument.symbol.toLocaleUpperCase('en-US').charAt(0)
  )));
  const availableInstruments = unselectedInstruments.filter((instrument) => {
    const normalizedSymbol = instrument.symbol.toLocaleUpperCase('en-US');
    return (!instrumentInitial || normalizedSymbol.startsWith(instrumentInitial))
      && (!normalizedInstrumentQuery || normalizedSymbol.includes(normalizedInstrumentQuery));
  });
  /* The viewport stays compact and scrollable, while every match remains available
     within the selected alphabet group or search result. */
  const visibleInstruments = availableInstruments;
  const selectedInstrument = availableInstruments.find((instrument) => (instrument.id || instrument.symbol) === pendingInstrumentKey)
    ?? visibleInstruments[0];
  const instrumentKey = (instrument: SelectableInstrument) => instrument.id || instrument.symbol;
  const selectedInstrumentKey = selectedInstrument ? instrumentKey(selectedInstrument) : '';
  const selectInstrumentInitial = (initial: string | null) => {
    setInstrumentInitial(initial);
    setInstrumentQuery('');
    setPendingInstrumentKey('');
  };
  const moveInstrumentSelection = (delta: number) => {
    if (visibleInstruments.length === 0) return;
    const current = visibleInstruments.findIndex((instrument) => instrumentKey(instrument) === selectedInstrumentKey);
    const next = Math.min(Math.max((current < 0 ? 0 : current) + delta, 0), visibleInstruments.length - 1);
    setPendingInstrumentKey(instrumentKey(visibleInstruments[next]));
  };
  const removeManagedSymbol = (symbol: string) => {
    if (!symbolManagerSection) return;
    const nextSymbols = managedSymbols.filter((item) => item !== symbol);
    const removedInstrumentId = basicCatalog?.instruments.find((instrument) => instrument.symbol === symbol)?.id;
    updateSection(symbolManagerSection.id, {
      symbol: nextSymbols.length > 0 ? nextSymbols.join(' · ') : '종목 선택',
      instrumentIds: (symbolManagerSection.instrumentIds ?? []).filter((id) => id !== removedInstrumentId),
    });
    setSymbolLimits((current) => {
      const nextSection = { ...(current[symbolManagerSection.id] ?? {}) };
      delete nextSection[symbol];
      return { ...current, [symbolManagerSection.id]: nextSection };
    });
  };
  const addManagedSymbol = () => {
    if (!symbolManagerSection || !selectedInstrument) return;
    const { id, symbol } = selectedInstrument;
    updateSection(symbolManagerSection.id, {
      symbol: [...managedSymbols, symbol].join(' · '),
      instrumentIds: id
        ? [...new Set([...(symbolManagerSection.instrumentIds ?? []), id])]
        : (symbolManagerSection.instrumentIds ?? []),
    });
    setSymbolLimits((current) => ({
      ...current,
      [symbolManagerSection.id]: { ...(current[symbolManagerSection.id] ?? {}), [symbol]: 25 },
    }));
    setPendingInstrumentKey('');
    setInstrumentQuery('');
  };

  const trashItemLabel = draggedBlock
    ? '블록'
    : cardMove
      ? '전략 카드'
      : sectionMove
        ? '파티션'
        : null;

  if (editorLoadFailure === 'sign-in') return <SignInRequiredPage />;
  if (editorLoadFailure === 'missing') return <ErrorPage
    title="전략을 찾을 수 없습니다."
    detail="삭제되었거나 이 계정에 속하지 않는 전략입니다. 전략 목록에서 다시 선택해 주세요."
  />;
  if (editorLoadFailure === 'conflict') return <ErrorPage
    title="다른 곳에서 편집 중입니다."
    detail="다른 편집을 마친 뒤 다시 시도해 주세요."
    onRetry={() => setDocumentRevision((current) => current + 1)}
  />;
  if (editorLoadFailure === 'transport') return <ErrorPage
    title="전략을 불러오지 못했습니다."
    detail="연결 상태를 확인한 뒤 다시 시도해 주세요. 확인되지 않은 편집 내용은 표시하지 않습니다."
    onRetry={() => setDocumentRevision((current) => current + 1)}
  />;
  if (editorLoadFailure === 'unreadable') return <ErrorPage
    title="이 전략은 현재 편집기에서 열 수 없습니다."
    detail="저장된 배치 정보를 이 버전의 편집기가 해석할 수 없습니다. 빈 화면으로 열면 저장 시 전략이 지워지므로 열지 않았습니다. 전략 내용은 그대로 남아 있습니다."
  />;

  return <Localized><div className="page editor-page basic-editor-page editor-shell-page">
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="basic-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Basic 편집 작업">
      <div className="basic-editor-context"><Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button><div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환"><Button className="floating-editor-button active" onClick={() => openEditor?.('basic', false, strategyId)}>Basic 편집기</Button><Button className="floating-editor-button" icon={PRO_EDITOR_AVAILABLE ? undefined : LockKeyhole} disabled={!PRO_EDITOR_AVAILABLE} title="Pro 편집기는 준비 중입니다" onClick={() => openEditor?.('pro', false, strategyId)}>Pro 편집기</Button></div><div className="basic-history-controls" role="group" aria-label="편집 기록">
        <button type="button" className="floating-editor-button" aria-label="되돌리기" disabled={undoStack.length === 0} onClick={undoEditorChange}><Undo2 size={15} /></button>
        <button type="button" className="floating-editor-button" aria-label="다시 실행" disabled={redoStack.length === 0} onClick={redoEditorChange}><Redo2 size={15} /></button>
      </div></div>
      <div className="basic-editor-actions">
        {/* Not a live region: the editor already has one, and save outcomes are
            narrated through it. A second one would double every announcement. */}
        <span className="basic-save-state" data-testid="save-state" data-dirty={hasUnsavedChanges}>
          {savePending
            ? '저장 중…'
            : hasUnsavedChanges
              ? '저장되지 않은 변경'
              : lastSavedAt
                ? `${savedAtLabel(lastSavedAt)} 저장됨`
                : '변경 없음'}
        </span>
        <Button
          className={`floating-editor-button basic-validation-trigger ${highlightValidation ? 'is-active' : ''} ${isCurrentlyValid ? 'is-launchable' : 'is-incomplete'}`}
          icon={isCurrentlyValid ? Check : TriangleAlert}
          aria-label={isCurrentlyValid ? '검증 완료 상태 보기' : '미완성 오류 강조'}
          aria-pressed={highlightValidation}
          onClick={() => setHighlightValidation((current) => !current)}
        >
          {validationTriggerLabel}
        </Button>
        <Button className="floating-editor-button" icon={Save} disabled={documentPending || savePending} onClick={() => { void saveStrategy(); }}>{savePending ? '저장 중…' : '저장'}</Button>
        <div className="editor-launch-action">
          <Button
            className={`floating-editor-button ${isLaunchable ? '' : 'is-unavailable'}`}
            kind="primary"
            icon={Rocket}
            disabled={!isLaunchable || documentPending || savePending}
            aria-disabled={!isLaunchable}
            aria-describedby="personal-bot-launch-tooltip"
            onClick={() => { void preparePersonalBotLaunch(); }}
          >개인 봇 출시</Button>
          <span className="editor-action-tooltip" id="personal-bot-launch-tooltip" role="tooltip">
            <strong>개인 운용 봇</strong>
            <small>전략을 검증하고 바로 출시해요.</small>
          </span>
        </div>
      </div>
    </div>
    <div ref={basicLayoutRef} className={`editor-layout basic-layout full-editor-workspace ${templatesCollapsed ? 'is-library-collapsed' : ''} ${highlightValidation ? 'is-validation-highlighting' : ''}`} data-testid="basic-editor-workspace">
      <div className="basic-editor-left-rail" data-testid="basic-editor-left-rail">
        <aside className={`editor-palette basic-library-panel panel floating-editor-panel ${templatesCollapsed ? 'is-docked-hidden' : ''}`} data-collapse-direction="left" data-testid="basic-library-panel" aria-hidden={templatesCollapsed} onClick={templatesCollapsed ? () => setTemplatesCollapsed(false) : undefined}>
          <div className="palette-title"><span>LIBRARY</span><Boxes size={15} /><button ref={libraryCollapseButtonRef} type="button" className="sidebar-toggle" aria-label={`라이브러리 ${templatesCollapsed ? '펼치기' : '접기'}`} aria-expanded={!templatesCollapsed} onClick={() => templatesCollapsed ? setTemplatesCollapsed(false) : collapseLibrary()}>{templatesCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button></div>
          <p className="library-intro">{libraryView === 'packages'
            ? '원하는 방식을 고르면 매수·매도 전략 카드를 함께 구성합니다.'
            : '전략 카드를 선택한 뒤 블록을 클릭하거나 원하는 위치로 드래그하세요.'}</p>
          <div className="basic-library-tabs pro-library-primary-tabs" role="tablist" aria-label="전략 라이브러리">
            <button type="button" role="tab" aria-selected={libraryView === 'blocks'} className={libraryView === 'blocks' ? 'active' : ''} onClick={() => setLibraryView('blocks')}>블록 <b>{BLOCK_LIBRARY.reduce((count, category) => count + category.items.length, 0)}</b></button>
            <button type="button" role="tab" aria-selected={libraryView === 'packages'} className={libraryView === 'packages' ? 'active' : ''} onClick={() => setLibraryView('packages')}>패키지 <b>{TEMPLATE_LIBRARY.length}</b></button>
          </div>
          {libraryView === 'packages' ? <div className="basic-library-view" data-testid="basic-templates-panel">
            <label className="palette-search"><Search size={14} /><input aria-label="패키지 검색" placeholder="RSI, 추세, 돌파" value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} /></label>
            <div className="template-list pro-library-scroll">
              <div className="basic-package-section-heading"><span>핵심 전략 패키지</span></div>
              {filteredTemplates.map((template) => <Fragment key={template.id}>
                {template.id === 'donchian' && <div className="template-advanced-break basic-package-section-heading" role="separator" aria-label="확장 패키지"><span>확장 전략 패키지</span></div>}
                <div className="basic-package-card-stack">
                  <span className="basic-package-layer" aria-hidden="true" />
                  <span className="basic-package-layer" aria-hidden="true" />
                  <button
                  className={`template-card pro-package-card basic-package-card ${libraryDrag?.type === 'template' && libraryDrag.template.id === template.id ? 'is-library-dragging' : ''}`}
                  aria-label={`${template.name} 패키지 적용`}
                  data-package-group={template.category}
                  draggable
                  onDragStart={(event) => startLibraryDrag(event, { type: 'template', template })}
                  onDragEnd={finishLibraryDrag}
                  onClick={() => applyTemplate(template)}
                >
                  <span className={`template-icon basic-package-bundle-icon tone-${template.category}`}><Layers3 size={15} /></span>
                  <span className="template-card-copy"><span className="basic-package-kind">PACKAGE</span><strong>{template.name}</strong><small>{template.description}</small><em>{getTemplateStructureLabel(template)}</em></span>
                  <Plus size={14} />
                  </button>
                </div>
              </Fragment>)}
            </div>
          </div> : <div className="basic-library-view" data-testid="basic-block-library">
            <label className="palette-search"><Search size={14} /><input aria-label="블록 검색" placeholder="가격, RSI, 평균선" value={blockQuery} onChange={(event) => setBlockQuery(event.target.value)} /></label>
            <div className="block-category-list pro-library-scroll">
              {favoriteBlockLabels.length > 0 && <section className="block-category pro-library-category is-input-group basic-library-favorites tone-condition" role="region" aria-label="즐겨찾는 블록">
                <header className="block-category-divider is-sticky"><span><Star size={11} fill="currentColor" /> 즐겨찾기</span><b>{favoriteBlockLabels.length}</b></header>
                <div className="block-chip-list">
                  {favoriteBlockLabels.map((item) => renderLibraryBlock(item, getLibraryBlockTone(item), true))}
                </div>
              </section>}
              {filteredBlockLibrary.map((category) => <section className={`block-category pro-library-category is-input-group tone-${category.tone}`} key={category.name}>
                <header className="block-category-divider is-sticky" aria-label={`${category.name} 블록`}><span>{category.name}</span><b>{category.items.length}</b></header>
                <div className="block-chip-list">
                  {category.items.map((item) => renderLibraryBlock(item, category.tone))}
                </div>
              </section>)}
            </div>
          </div>}
        </aside>
      </div>
      {templatesCollapsed && <button type="button" className="pro-panel-edge-handle basic-panel-edge-handle is-panel-title-height is-left" aria-label="라이브러리 펼치기" onClick={() => setTemplatesCollapsed(false)}>
        <ChevronRight size={15} aria-hidden="true" />
      </button>}
      <section
        className="editor-canvas basic-canvas"
        aria-label="Basic 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
      >
        <div className="cursor-dot-spotlight" data-testid="cursor-dot-spotlight" aria-hidden="true" />
        <div className="section-draw-controls" role="group" aria-label="파티션 도구">
          <button className={`floating-editor-button ${drawMode ? 'active' : ''}`} aria-label="파티션 그리기" aria-pressed={drawMode} onClick={() => setDrawMode((current) => !current)}><Plus size={14} /> 파티션 그리기</button>
          <button className={`floating-editor-button ${gridSnap ? 'active' : ''}`} aria-label="그리드 스냅" aria-pressed={gridSnap} onClick={() => setGridSnap((current) => !current)}><Grid3X3 size={14} /> 그리드 스냅</button>
          <button className="floating-editor-button" aria-label="전략 카드 정리" disabled={(sections.find((section) => section.id === activeSectionId)?.cardOrder.length ?? 0) < 2} onClick={organizeActiveSection}><LayoutGrid size={14} /> 전략 정리</button>
          <span className="canvas-gesture-guide" data-testid="canvas-gesture-guide">{drawMode
            ? <><MousePointer2 size={12} aria-hidden="true" /> 빈 공간을 드래그해 파티션 만들기</>
            : <><i><Mouse size={12} aria-hidden="true" /> 휠 확대/축소</i><i><MousePointer2 size={12} aria-hidden="true" /> 드래그로 이동</i></>}</span>
        </div>
        <div className="floating-zoom-controls" role="group" aria-label="캔버스 확대/축소">
          <button className="floating-editor-button" aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom((current) => Math.max(.5, Number((current - .1).toFixed(1))))}>−</button>
          <button className="floating-editor-button zoom-level" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button className="floating-editor-button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, Number((current + .1).toFixed(1))))}>+</button>
        </div>
        <div className="mobile-editor-notice"><Boxes size={24} /><strong>전략 편집은 데스크톱에서 사용할 수 있습니다</strong><span>현재 화면에서는 구성만 조회할 수 있습니다.</span></div>
        <div
          className={`section-workspace ${drawMode ? 'is-drawing-mode' : ''} ${panGesture || spacePanning ? 'is-panning' : ''} ${spacePanning ? 'is-space-panning' : ''} ${cardMove ? 'is-moving-card' : ''}`}
          data-testid="section-drawing-surface"
          onPointerDown={beginCanvasGesture}
          onPointerMove={updateCanvasGesture}
          onPointerUp={finishCanvasGesture}
          onPointerCancel={finishCanvasGesture}
          onPointerLeave={hideCursorSpotlight}
          onWheel={zoomCanvasWithWheel}
        >
          <div className="section-world" data-testid="section-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
          {draftRect && <div className="section-draft-rectangle" aria-hidden="true" style={{ left: draftRect.x, top: draftRect.y, width: draftRect.width, height: draftRect.height }} />}
          {sections.map((section, sectionIndex) => {
            const sectionNumber = String(sectionIndex + 1).padStart(2, '0');
            const sectionLayout = getSectionLayout(section);
            return <article
              key={section.id}
              className={`strategy-section-frame ${activeSectionId === section.id ? 'is-selected' : ''} ${invalidSectionIds.has(section.id) ? 'has-validation-error' : ''} ${sectionMove?.sectionId === section.id ? 'is-section-moving' : ''} ${sectionResize?.sectionId === section.id ? 'is-section-resizing' : ''} ${libraryDrag?.type === 'template' ? 'is-template-drop-ready' : ''}`}
              data-testid={`strategy-${section.id}`}
              aria-label={`PARTITION ${sectionNumber}`}
              style={{ left: section.x, top: section.y, width: sectionLayout.width, height: sectionLayout.height }}
              onClick={() => setActiveSectionId(section.id)}
              onPointerDown={(event) => beginSectionAreaMove(event, section)}
              onDragOver={(event) => {
                if (libraryDrag?.type === 'template') {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                  return;
                }
              }}
              onDrop={(event) => dropOnSection(event, section.id)}
            >
              <header className="strategy-section-header">
                <button className="section-move-handle" data-testid={`${section.id}-move-handle`} aria-label={`PARTITION ${sectionNumber} 이동`} onPointerDown={(event) => beginSectionMove(event, section)}><GripVertical size={16} /></button>
                <div className="section-identity"><span>PARTITION {sectionNumber}</span><strong>{section.symbol}</strong><small>매수 {section.cards.buy.length} · 매도 {section.cards.sell.length}</small></div>
                <div className="section-settings">
                  <label><span className="section-setting-caption" data-testid="partition-setting-caption" title="거래 종목">종목</span><button type="button" className="section-symbol-manager" aria-label={`PARTITION ${sectionNumber} 종목 관리`} onClick={() => { setPendingInstrumentKey(''); setInstrumentQuery(''); setInstrumentInitial(null); setSymbolManagerSectionId(section.id); }}><strong>{splitPartitionSymbols(section.symbol).length || 0}개 종목</strong><small>한도 설정</small></button></label>
                  <label><span className="section-setting-caption" data-testid="partition-setting-caption" title="전체 전략 대비 예산">예산</span><span className="section-allocation"><input type="number" min=".1" max="100" step=".1" aria-label={`PARTITION ${sectionNumber} 전체 전략 대비 예산`} value={section.allocation} onWheel={(event) => event.stopPropagation()} onChange={(event) => updateSection(section.id, { allocation: Number(event.target.value) })} /><b>%</b></span></label>
                  <label><span className="section-setting-caption" data-testid="partition-setting-caption" title="기본 봉 주기">봉 주기</span><select aria-label={`PARTITION ${sectionNumber} 기본 봉 주기`} value={section.timeframe} onChange={(event) => updateSection(section.id, { timeframe: event.target.value })}>{BASIC_TIMEFRAMES.map((timeframe) => <option key={timeframe}>{timeframe}</option>)}</select></label>
                </div>
                <div className="section-card-actions">
                  <button className="tone-buy" aria-label={`PARTITION ${sectionNumber} 매수 전략 추가`} onClick={() => addStrategyCard(section.id, 'buy')}><Plus size={13} /> 매수</button>
                  <button className="tone-sell" aria-label={`PARTITION ${sectionNumber} 매도 전략 추가`} onClick={() => addStrategyCard(section.id, 'sell')}><Plus size={13} /> 매도</button>
                  <button
                    className={`section-preview-button ${previewSectionId === section.id ? 'active' : ''}`}
                    aria-label={`PARTITION ${sectionNumber} 전략 미리보기`}
                    aria-pressed={previewSectionId === section.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveSectionId(section.id);
                      setPreviewSectionId((current) => current === section.id ? null : section.id);
                    }}
                  ><CandlestickChart size={13} /> 전략 미리보기</button>
                </div>
              </header>
              <div className="section-strategy-grid">
                {section.cardOrder.map((cardId, cardIndex) => renderStrategyCard(
                  section,
                  section.cards.buy.includes(cardId) ? 'buy' : section.cards.sell.includes(cardId) ? 'sell' : 'risk',
                  cardId,
                  cardIndex,
                ))}
                {section.cards.buy.length === 0 && <button
                  className="required-buy-slot"
                  aria-label={`PARTITION ${sectionNumber} 필수 매수 전략 추가`}
                  onClick={() => addStrategyCard(section.id, 'buy')}
                ><TriangleAlert size={18} /><strong>매수 전략이 필요해요</strong><span>필수 항목 · 추가해야 출시할 수 있어요</span></button>}
              </div>
              <button
                type="button"
                className="partition-resize-handle"
                data-testid={`${section.id}-resize-handle`}
                aria-label={`PARTITION ${sectionNumber} 크기 조절`}
                onPointerDown={(event) => beginSectionResize(event, section)}
                onClick={(event) => event.stopPropagation()}
              />
            </article>;
          })}
          </div>
        </div>
      </section>
      {highlightValidation && <aside className={`basic-validation-drawer panel floating-editor-panel ${isCurrentlyValid ? 'is-launchable' : 'is-incomplete'}`} role="complementary" aria-label="전략 오류 안내" aria-live="polite">
        <header className="basic-validation-drawer-title">
          <span>{isCurrentlyValid ? <Check size={16} /> : <TriangleAlert size={16} />}</span>
          <div><small>VALIDATION</small><strong>{isCurrentlyValid ? isLaunchable ? '출시 가능한 전략' : '유효한 전략 · 저장 필요' : '수정할 항목'}</strong></div>
          <button type="button" aria-label="전략 오류 안내 닫기" onClick={() => setHighlightValidation(false)}><X size={14} /></button>
        </header>
        <div className="basic-validation-drawer-summary">
          <strong>{isCurrentlyValid
            ? serverWarningFindings.length > 0 ? `출시 가능 · 경고 ${serverWarningFindings.length}개` : '모든 필수 설정을 완료했어요'
            : validationIssues.length > 0
              ? `${validationIssues.length}개 항목을 확인해 주세요`
              : serverValidation?.status === 'INVALID'
                ? `서버 검증 오류 ${serverErrorFindings.length}개`
                : '저장 후 서버 검증이 필요합니다'}</strong>
          <small>{isCurrentlyValid ? isLaunchable ? '현재 저장된 구성으로 개인 봇을 출시할 수 있습니다.' : '현재 구성은 유효합니다. 저장해야 개인 봇 출시가 활성화됩니다.' : validationIssues.length > 0 ? '항목을 선택하면 수정할 전략 카드로 이동합니다.' : '현재 구성을 서버 기준으로 검증하고 있습니다.'}</small>
        </div>
        {!isCurrentlyValid && <div className="basic-validation-groups">
          {groupedValidationIssues.map((group) => <section key={group.key} className="basic-validation-group" role="region" aria-label={`${group.label} 오류`}>
            <header><strong>{group.label}</strong><span>{group.issues.length}</span></header>
            <ul>{group.issues.map((issue, index) => <li key={issue.id}><button type="button" onClick={() => focusValidationIssue(issue)}><span>{String(index + 1).padStart(2, '0')}</span><span>{renderBasicValidationMessage(issue.message.replace(`${group.label}의 `, ''))}</span><ChevronRight size={13} /></button></li>)}</ul>
          </section>)}
        </div>}
        {serverValidation && serverValidation.findings.length > 0 && <section className="basic-validation-group" role="region" aria-label="서버 검증 결과">
          <header><strong>서버 검증 결과</strong><span>{serverValidation.findings.length}</span></header>
          <ul>{serverValidation.findings.map((finding, index) => <li key={`${finding.code}-${finding.location}-${index}`}>
            <div className="basic-validation-server-finding">
              <span>{finding.severity === 'ERROR' ? '오류' : '경고'}</span>
              <span><strong>{finding.message}</strong><small>{finding.location}</small></span>
            </div>
          </li>)}</ul>
        </section>}
      </aside>}
    </div>
    {/*
      미리보기는 PiP 창이다. 확대·이동하는 캔버스 안에 두면 좌표가 따라 움직이고
      transform이 fixed 기준을 바꿔 버리므로, 캔버스 밖 화면 단위에 띄운다.
    */}
    {previewSection && marketDataClient && previewCandles && previewCandles.length > 0
      ? <StrategyPreviewChart
        partitionLabel={`PARTITION ${previewSectionNumber}`}
        symbols={previewSymbols.slice(0, 1)}
        flows={previewFlows}
        candles={previewCandles}
        onClose={() => setPreviewSectionId(null)}
      />
      : previewSection && <aside className="strategy-preview-card strategy-preview-unavailable" data-testid="strategy-preview-unavailable" aria-label={`PARTITION ${previewSectionNumber} 전략 미리보기`}>
      <header className="strategy-preview-head">
        <div className="strategy-preview-identity"><strong>{previewSymbols.length > 0 ? previewSymbols.join(' · ') : '종목 미선택'}</strong><small>{`PARTITION ${previewSectionNumber}`}</small></div>
        <button type="button" className="strategy-preview-close" aria-label="미리보기 닫기" onClick={() => setPreviewSectionId(null)}><X size={13} /></button>
      </header>
      {previewPending
        ? <LoadingState label="실제 시장 데이터를 불러오는 중입니다." />
        : previewError
          ? <ErrorState title={previewError} />
          : <EmptyState
            icon={CandlestickChart}
            title="표시할 실제 시장 데이터가 없습니다."
            detail="실제 시장 데이터 기반 미리보기만 표시합니다."
          />}
    </aside>}
    {trashItemLabel && <div
      ref={(element) => { trashZoneRef.current = element; }}
      className={`editor-trash-zone ${cardMove || sectionMove ? 'is-pointer-trash' : ''} ${trashReady ? 'is-ready' : ''}`}
      role="region"
      aria-label={`${trashItemLabel} 삭제 영역`}
      data-testid="editor-trash-zone"
      onDragEnter={(event) => {
        event.preventDefault();
        setTrashReady(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setTrashReady(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTrashReady(false);
      }}
      onDrop={dropOnTrash}
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy"><strong>{trashItemLabel} 버리기</strong><small>여기에 놓으면 삭제됩니다</small></span>
    </div>}
    {saveFeedback && <div className={`editor-save-toast is-bottom-center tone-${saveFeedback.tone} ${saveFeedbackClosing ? 'is-closing' : ''}`} role="alert" aria-atomic="true">
      <span aria-hidden="true">{saveFeedback.tone === 'positive' ? <Check size={16} /> : <TriangleAlert size={16} />}</span>
      <div><strong>{saveFeedback.title}</strong><small>{saveFeedback.detail}</small></div>
      <button type="button" aria-label="저장 알림 닫기" onClick={dismissSaveFeedback}><X size={14} /></button>
    </div>}
    {symbolManagerSection && createPortal(<div className="symbol-manager-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSymbolManagerSectionId(null); }}>
      <section className="symbol-manager-dialog" role="dialog" aria-modal="true" aria-label={`${symbolManagerSection.id.replace('section-', 'PARTITION ')} 종목 관리`}>
        <header><div><small>SYMBOL LIMITS</small><h2>거래 종목 관리</h2><p>종목별 최대 보유 비율은 예약 자금이 아니라 보유 한도입니다.</p></div><button type="button" aria-label="종목 관리 닫기" onClick={() => setSymbolManagerSectionId(null)}><X size={16} /></button></header>
        {catalogClient && !basicCatalog && !catalogError && <p className="bots-decision-note" role="status">공식 종목 확인 중…</p>}
        {catalogError && <p className="bots-decision-note" role="status">{catalogError}</p>}
        <div className="symbol-manager-list">
          {managedSymbols.map((symbol) => <div key={symbol}><span><strong>{symbol}</strong><small>미국 주식</small></span><label><span>최대 보유 비율</span><span className="setting-with-unit"><input type="number" min=".1" max="100" step=".1" aria-label={`${symbol} 종목별 최대 보유 비율`} value={symbolLimits[symbolManagerSection.id]?.[symbol] ?? 25} onChange={(event) => setSymbolLimits((current) => ({ ...current, [symbolManagerSection.id]: { ...(current[symbolManagerSection.id] ?? {}), [symbol]: Number(event.target.value) } }))} /><b>%</b></span></label><button type="button" aria-label={`${symbol} 삭제`} onClick={() => removeManagedSymbol(symbol)}><Trash2 size={14} /></button></div>)}
        </div>
        <footer>
          <div className="symbol-manager-picker">
            <label className="symbol-manager-add">
              <span>종목 검색</span>
              <input
                type="search"
                aria-label="종목 검색"
                placeholder="티커 입력 (예: AAPL)"
                role="combobox"
                aria-expanded={visibleInstruments.length > 0}
                aria-controls="symbol-manager-results"
                aria-activedescendant={selectedInstrument ? `symbol-option-${selectedInstrumentKey}` : undefined}
                value={instrumentQuery}
                onChange={(event) => { setInstrumentQuery(event.target.value); setInstrumentInitial(null); setPendingInstrumentKey(''); }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); moveInstrumentSelection(1); }
                  else if (event.key === 'ArrowUp') { event.preventDefault(); moveInstrumentSelection(-1); }
                  else if (event.key === 'Enter' && selectedInstrument) { event.preventDefault(); addManagedSymbol(); }
                }}
              />
            </label>
            <div className="symbol-manager-alphabet" role="group" aria-label="종목 알파벳 필터">
              <button
                type="button"
                className={!instrumentInitial ? 'is-active' : ''}
                aria-pressed={!instrumentInitial}
                onClick={() => selectInstrumentInitial(null)}
              >ALL</button>
              {INSTRUMENT_INITIALS.map((initial) => <button
                key={initial}
                type="button"
                className={instrumentInitial === initial ? 'is-active' : ''}
                aria-pressed={instrumentInitial === initial}
                disabled={!availableInstrumentInitials.has(initial)}
                onClick={() => selectInstrumentInitial(initial)}
              >{initial}</button>)}
            </div>
            <div className="symbol-manager-results-head">
              <span>추가할 종목</span>
              <small>{availableInstruments.length}개 선택 가능</small>
            </div>
            {visibleInstruments.length > 0 && <ul className="symbol-manager-results" id="symbol-manager-results" role="listbox" aria-label="추가할 종목">
              {visibleInstruments.map((instrument) => {
                const key = instrumentKey(instrument);
                const selected = key === selectedInstrumentKey;
                return <li key={key}>
                  <button
                    type="button"
                    id={`symbol-option-${key}`}
                    role="option"
                    aria-selected={selected}
                    className={selected ? 'is-selected' : ''}
                    ref={selected ? (node) => node?.scrollIntoView?.({ block: 'nearest' }) : undefined}
                    onClick={() => setPendingInstrumentKey(key)}
                    onDoubleClick={() => { setPendingInstrumentKey(key); addManagedSymbol(); }}
                  >
                    <strong>{instrument.symbol}</strong>
                    {(instrument.assetType || instrument.primaryExchangeMic) && <small>
                      {[instrument.assetType, instrument.primaryExchangeMic].filter(Boolean).join(' · ')}
                    </small>}
                  </button>
                </li>;
              })}
            </ul>}
            {!catalogError && basicCatalog && normalizedInstrumentQuery && availableInstruments.length === 0 && <small className="symbol-manager-results-empty" role="status">일치하는 공식 지원 종목이 없습니다.</small>}
            {!catalogError && basicCatalog && !normalizedInstrumentQuery && availableInstruments.length === 0 && <small className="symbol-manager-results-empty" role="status">추가할 수 있는 종목을 모두 담았습니다.</small>}
          </div>
          <div className="symbol-manager-picker-actions">
            <Button type="button" icon={Plus} disabled={!selectedInstrument} onClick={addManagedSymbol}>종목 추가</Button><Button type="button" kind="primary" onClick={() => setSymbolManagerSectionId(null)}>완료</Button>
          </div>
        </footer>
      </section>
    </div>, document.body)}
    {launchDialogOpen && createPortal(<div
      className="personal-bot-launch-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLaunchDialog();
      }}
    >
      <section
        className="personal-bot-launch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-bot-launch-title"
      >
        <header>
          <span className="personal-bot-launch-icon" aria-hidden="true"><Rocket size={18} /></span>
          <div>
            <small>PERSONAL BOT</small>
            <h2 id="personal-bot-launch-title">개인 운용 봇 출시</h2>
            <p>{strategyId && authoringClient ? '검증된 전략에 적용할 공식 실행 설정을 확인해 주세요.' : '전략을 실행할 봇의 이름과 설명을 정해 주세요.'}</p>
          </div>
          <button type="button" aria-label="출시 창 닫기" onClick={closeLaunchDialog}><X size={17} /></button>
        </header>
        <form onSubmit={(event) => { void launchPersonalBot(event); }}>
          {strategyId && authoringClient ? <>
            {releaseInputsPending && <LoadingState label="출시 설정을 불러오는 중입니다." />}
            {releaseError && <ErrorState title={releaseError} />}
            {!releaseInputsPending && releaseInputs && <>
              <label className="personal-bot-launch-field">
                <span><strong>초기 운용 자금</strong><small>USD</small></span>
                <input autoFocus type="number" min="1" step="0.01" aria-label="초기 운용 자금" value={initialCashAmount} onChange={(event) => setInitialCashAmount(event.target.value)} />
              </label>
              <label className="personal-bot-launch-field">
                <span><strong>전략 운용 예산</strong><small>%</small></span>
                <input type="number" min="0.01" max="100" step="0.01" aria-label="전략 운용 예산 비율" value={budgetPercent} onChange={(event) => setBudgetPercent(event.target.value)} />
              </label>
              <label className="personal-bot-launch-field">
                <span><strong>실행 정책</strong><small>서버 고정</small></span>
                <select aria-label="실행 정책" value={selectedExecutionPolicy} onChange={(event) => setSelectedExecutionPolicy(event.target.value)}>
                  {releaseInputs.executionPolicies.map((policy) => <option key={policy.version} value={policy.version}>{policy.version} · 수수료 {policy.feeRateBps}bps · 버퍼 {policy.buyingPowerBufferBps}bps</option>)}
                </select>
              </label>
              <label className="personal-bot-launch-field">
                <span><strong>공식 백테스트 데이터</strong><small>{releaseInputs.datasets.length}개</small></span>
                <select aria-label="공식 백테스트 데이터" value={selectedDataset} onChange={(event) => setSelectedDataset(event.target.value)}>
                  {releaseInputs.datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.feedCode} · {dataset.resolution} · {dataset.periodStart}~{dataset.periodEnd}</option>)}
                </select>
              </label>
            </>}
          </> : <>
          <label className="personal-bot-launch-field">
            <span><strong>봇 이름</strong><small>{botName.length}/40</small></span>
            <input
              autoFocus
              aria-label="봇 이름"
              maxLength={40}
              placeholder="예: Momentum Scout"
              value={botName}
              onChange={(event) => setBotName(event.target.value)}
            />
            <small>봇 목록에서 쉽게 찾을 수 있는 이름을 입력해 주세요.</small>
          </label>
          <label className="personal-bot-launch-field">
            <span><strong>봇 설명</strong><small>{botDescription.length}/160</small></span>
            <textarea
              aria-label="봇 설명"
              maxLength={160}
              rows={4}
              placeholder="이 봇이 어떤 전략으로 운용되는지 간단히 설명해 주세요."
              value={botDescription}
              onChange={(event) => setBotDescription(event.target.value)}
            />
          </label>
          </>}
          <div className="personal-bot-launch-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span><strong>개인 운용으로 시작합니다</strong><small>출시 후 봇 운영 화면에서 상태를 확인할 수 있어요.</small></span>
          </div>
          <footer>
            <Button type="button" onClick={closeLaunchDialog}>취소</Button>
            <Button
              type="submit"
              kind="primary"
              icon={Rocket}
              disabled={strategyId && authoringClient
                ? releaseInputsPending || releasePending || !selectedExecutionPolicy || !selectedDataset
                : !botName.trim() || !botDescription.trim()}
            >{releasePending ? '출시 중…' : '봇 출시하기'}</Button>
          </footer>
        </form>
      </section>
    </div>, document.body)}
  </div></Localized>;
}

const PRO_NODE_WIDTH = 196;
const PRO_PORT_START = 88;
const PRO_PORT_GAP = 26;

type ProPortType = 'universe' | 'series' | 'scalar' | 'signal' | 'order';

interface ProPort {
  id: string;
  type: ProPortType;
  label: string;
  testId?: string;
}

interface ProNodeBlueprint {
  id: string;
  kicker: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  group?: string;
  inputs: ProPort[];
  outputs: ProPort[];
}

interface ProNodeLibraryCategory {
  category: string;
  tone: BlockTone;
  items: ProNodeBlueprint[];
}

interface ProNode {
  id: string;
  blueprintId: string;
  kicker: string;
  title: string;
  detail: string;
  tone: BlockTone;
  icon: LucideIcon;
  inputs: ProPort[];
  outputs: ProPort[];
  params: { threshold: string; timeframe: string };
  x: number;
  y: number;
}

interface ProLinkEnd {
  nodeId: string;
  portId: string;
}

interface ProLink {
  id: string;
  from: ProLinkEnd;
  to: ProLinkEnd;
}

interface NodeMoveGesture extends CardMoveGesture {
  nodeId: string;
}

interface LinkDraft {
  source: ProLinkEnd;
  type: ProPortType;
  origin: CanvasPoint;
  point: CanvasPoint;
}

interface ProPicker {
  x: number;
  y: number;
  type: ProPortType;
  source: ProLinkEnd;
}

type ProNotice =
  | { kind: 'error'; problem: string; impact: string; fix: string; count?: number }
  | { kind: 'info'; message: string }
  | { kind: 'undo'; message: string; restore: { node: ProNode; links: ProLink[] } };

interface ProValidationIssue {
  nodeId: string | null;
  problem: string;
  impact: string;
  fix: string;
}

const PRO_PORT_TYPES: Record<ProPortType, { name: string; shape: string }> = {
  universe: { name: '종목 집합', shape: '이중 원' },
  series: { name: '시세 계열', shape: '정사각형' },
  scalar: { name: '지표 값', shape: '마름모' },
  signal: { name: '판단 신호', shape: '삼각형' },
  order: { name: '주문 후보', shape: '육각형' },
};

const describePortType = (type: ProPortType) => PRO_PORT_TYPES[type] ?? { name: type, shape: '기본 모양' };

const PRO_NODE_LIBRARY: ProNodeLibraryCategory[] = [
  {
    category: '유니버스',
    tone: 'universe',
    items: [{
      id: 'basket',
      kicker: 'UNIVERSE',
      title: '직접 선택 바스켓',
      detail: '사용자가 직접 고른 종목 집합',
      icon: Boxes,
      inputs: [],
      outputs: [{ id: 'out', type: 'universe', label: '종목 집합' }],
    }],
  },
  {
    category: '시장 데이터',
    tone: 'data',
    items: [{
      id: 'quotes',
      kicker: 'DATA',
      title: '가격·거래량',
      detail: '시간축을 직접 선택합니다',
      icon: Layers3,
      inputs: [{ id: 'in', type: 'universe', label: '종목 집합' }],
      outputs: [{ id: 'out', type: 'series', label: '시세 계열' }],
    }],
  },
  {
    category: '특징 · 지표',
    tone: 'indicator',
    items: [{
      id: 'feature',
      kicker: 'FEATURE',
      title: '지표 계산',
      detail: '기간을 직접 입력합니다',
      icon: Sparkles,
      inputs: [{ id: 'in', type: 'series', label: '시세 계열' }],
      outputs: [{ id: 'out', type: 'scalar', label: '지표 값' }],
    }],
  },
  {
    category: '조건 · 신호',
    tone: 'condition',
    items: [{
      id: 'compare',
      kicker: 'CONDITION',
      title: '값 비교',
      detail: '같은 타입의 두 값 비교',
      icon: GitBranch,
      group: '조건 · 비교',
      inputs: [{ id: 'in', type: 'scalar', label: '지표 값' }],
      outputs: [{ id: 'true', type: 'signal', label: '참 신호' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
    }, {
      id: 'position',
      kicker: 'CONDITION',
      title: '포지션 확인',
      detail: '보유 수량과 상태 비교',
      icon: ShieldCheck,
      group: '조건 · 비교',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'true', type: 'signal', label: '참 신호' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
    }],
  },
  {
    category: '일정 · 제어',
    tone: 'logic',
    items: [{
      id: 'branch',
      kicker: 'CONTROL',
      title: '분기',
      detail: '같은 신호를 여러 갈래로 보냅니다',
      icon: Split,
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'a', type: 'signal', label: '갈래 1' }, { id: 'b', type: 'signal', label: '갈래 2' }],
    }, {
      id: 'merge',
      kicker: 'CONTROL',
      title: '합류',
      detail: '여러 갈래를 하나로 모읍니다',
      icon: Import,
      inputs: [{ id: 'a', type: 'signal', label: '갈래 1' }, { id: 'b', type: 'signal', label: '갈래 2' }],
      outputs: [{ id: 'out', type: 'signal', label: '판단 신호' }],
    }],
  },
  {
    category: '주문 실행',
    tone: 'order',
    items: [{
      id: 'buy-candidate',
      kicker: 'CANDIDATE',
      title: '매수 후보',
      detail: '시장 주문 후보를 만듭니다',
      icon: CircleDollarSign,
      group: '주문 후보',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'out', type: 'order', label: '주문 후보' }],
    }, {
      id: 'sell-candidate',
      kicker: 'CANDIDATE',
      title: '매도 후보',
      detail: '보유 포지션 청산 후보를 만듭니다',
      icon: CircleDollarSign,
      group: '주문 후보',
      inputs: [{ id: 'in', type: 'signal', label: '판단 신호' }],
      outputs: [{ id: 'out', type: 'order', label: '주문 후보' }],
    }],
  },
  {
    category: '위험관리',
    tone: 'risk',
    items: [{
      id: 'processor',
      kicker: 'FINALIZE',
      title: '주문 처리기',
      detail: '중복 제거 · 예산 · 위험 검사',
      icon: ShieldCheck,
      inputs: [{ id: 'in', type: 'order', label: '주문 후보' }],
      outputs: [{ id: 'out', type: 'order', label: '모의 주문' }],
    }],
  },
];

const PRO_BLUEPRINTS = Object.fromEntries(PRO_NODE_LIBRARY.flatMap((category) => category.items.map((item): [string, ProNodeBlueprint & { category: string; tone: BlockTone }] => [
  item.id,
  { ...item, category: category.category, tone: category.tone },
])));

const proNodeHeight = (node: ProNode) => PRO_PORT_START + Math.max(node.inputs.length, node.outputs.length, 1) * PRO_PORT_GAP + 12;

const proPortPoint = (node: ProNode, direction: 'in' | 'out', index: number): CanvasPoint => ({
  x: node.x + (direction === 'out' ? PRO_NODE_WIDTH : 0),
  y: node.y + PRO_PORT_START + index * PRO_PORT_GAP,
});

const proLinkPath = (from: CanvasPoint, to: CanvasPoint) => {
  const curve = Math.max(46, Math.min(150, Math.abs(to.x - from.x) * .55));
  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
};

const createProNode = (blueprintId: string, id: string, x: number, y: number, overrides: Partial<ProNode> = {}): ProNode => {
  const blueprint = PRO_BLUEPRINTS[blueprintId];
  return {
    id,
    blueprintId,
    kicker: blueprint.kicker,
    title: blueprint.title,
    detail: blueprint.detail,
    tone: blueprint.tone,
    icon: blueprint.icon,
    inputs: blueprint.inputs.map((port) => ({ ...port })),
    outputs: blueprint.outputs.map((port) => ({ ...port })),
    params: { threshold: '', timeframe: '' },
    x,
    y,
    ...overrides,
  };
};

const INITIAL_PRO_NODES: ProNode[] = [
  createProNode('basket', 'node-basket', 24, 176),
  createProNode('quotes', 'node-quotes', 256, 176),
  createProNode('feature', 'node-feature-a', 488, 40, { title: '지표 계산 A' }),
  createProNode('feature', 'node-feature-b', 488, 312, { title: '지표 계산 B' }),
  createProNode('compare', 'node-compare-a', 720, 40, {
    title: '값 비교 A',
    outputs: [{ id: 'true', type: 'signal', label: '참 신호', testId: 'true-output' }, { id: 'false', type: 'signal', label: '거짓 신호' }],
  }),
  createProNode('compare', 'node-compare-b', 720, 312, { title: '값 비교 B' }),
  createProNode('merge', 'node-merge', 952, 172),
  createProNode('buy-candidate', 'node-buy', 1184, 176),
  createProNode('processor', 'node-processor', 1416, 176),
];

const INITIAL_PRO_LINKS: ProLink[] = [
  { id: 'link-1', from: { nodeId: 'node-basket', portId: 'out' }, to: { nodeId: 'node-quotes', portId: 'in' } },
  { id: 'link-2', from: { nodeId: 'node-quotes', portId: 'out' }, to: { nodeId: 'node-feature-a', portId: 'in' } },
  { id: 'link-3', from: { nodeId: 'node-quotes', portId: 'out' }, to: { nodeId: 'node-feature-b', portId: 'in' } },
  { id: 'link-4', from: { nodeId: 'node-feature-a', portId: 'out' }, to: { nodeId: 'node-compare-a', portId: 'in' } },
  { id: 'link-5', from: { nodeId: 'node-feature-b', portId: 'out' }, to: { nodeId: 'node-compare-b', portId: 'in' } },
  { id: 'link-6', from: { nodeId: 'node-compare-a', portId: 'true' }, to: { nodeId: 'node-merge', portId: 'a' } },
  { id: 'link-7', from: { nodeId: 'node-compare-b', portId: 'true' }, to: { nodeId: 'node-merge', portId: 'b' } },
  { id: 'link-8', from: { nodeId: 'node-merge', portId: 'out' }, to: { nodeId: 'node-buy', portId: 'in' } },
  { id: 'link-9', from: { nodeId: 'node-buy', portId: 'out' }, to: { nodeId: 'node-processor', portId: 'in' } },
];

const PRO_TIMEFRAMES = ['1분', '5분', '15분', '1시간', '1일'];

interface ProEditorProps {
  goBack: () => void;
  openEditor?: (mode: EditorMode, blank?: boolean) => void;
}

function LegacyProEditor({ goBack, openEditor }: ProEditorProps) {
  const [nodes, setNodes] = useState<ProNode[]>(INITIAL_PRO_NODES);
  const [links, setLinks] = useState<ProLink[]>(INITIAL_PRO_LINKS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-compare-a');
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panGesture, setPanGesture] = useState<CardMoveGesture | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);
  const [nodeMove, setNodeMove] = useState<NodeMoveGesture | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [picker, setPicker] = useState<ProPicker | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [libraryDrag, setLibraryDrag] = useState<ProNodeBlueprint | null>(null);
  const [nodeQuery, setNodeQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [notice, setNotice] = useState<ProNotice | null>(null);
  const [trashReady, setTrashReady] = useState(false);
  const spacePanningRef = useRef(false);
  const pointerPositionRef = useRef<CanvasPoint | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const trashZoneRef = useRef<HTMLDivElement | null>(null);
  const sequenceRef = useRef(INITIAL_PRO_LINKS.length);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((node): [string, ProNode] => [node.id, node])), [nodes]);
  const filteredLibrary = useMemo(() => PRO_NODE_LIBRARY.map((category) => ({
    ...category,
    items: category.items.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(nodeQuery.trim().toLowerCase())),
  })).filter((category) => category.items.length > 0), [nodeQuery]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const isInputLinked = (nodeId: string, portId: string) => links.some((link) => link.to.nodeId === nodeId && link.to.portId === portId);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const stopSpacePanning = () => {
      spacePanningRef.current = false;
      setSpacePanning(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (spacePanningRef.current) return;
        spacePanningRef.current = true;
        setSpacePanning(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') stopSpacePanning();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopSpacePanning);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopSpacePanning);
    };
  }, []);

  const nextId = (prefix: string) => {
    sequenceRef.current += 1;
    return `${prefix}-${sequenceRef.current}`;
  };

  const worldPoint = (clientX: number, clientY: number): CanvasPoint => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - pan.x) / zoom,
      y: (clientY - bounds.top - pan.y) / zoom,
    };
  };

  const reachesNode = (startNodeId: string, targetNodeId: string) => {
    const visited = new Set<string>();
    const walk = (nodeId: string): boolean => {
      if (nodeId === targetNodeId) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      return links.filter((link) => link.from.nodeId === nodeId).some((link) => walk(link.to.nodeId));
    };
    return walk(startNodeId);
  };

  const rejectConnection = (problem: string, impact: string, fix: string) => {
    setNotice({ kind: 'error', problem, impact, fix });
    setAnnouncement(`연결하지 못했습니다. ${problem} ${impact} ${fix}`);
  };

  const connectPorts = (source: ProLinkEnd, target: ProLinkEnd) => {
    const fromNode = nodeById[source.nodeId];
    const toNode = nodeById[target.nodeId];
    const fromPort = fromNode?.outputs.find((port) => port.id === source.portId);
    const toPort = toNode?.inputs.find((port) => port.id === target.portId);
    if (!fromNode || !toNode || !fromPort || !toPort) return;

    if (fromNode.id === toNode.id) {
      rejectConnection('같은 노드의 출력과 입력을 연결했습니다.', '실행 순서를 정할 수 없어 연결을 저장하지 않았습니다.', '다른 노드의 입력 연결부에 놓아 주세요.');
      return;
    }
    if (fromPort.type !== toPort.type) {
      const from = describePortType(fromPort.type);
      const to = describePortType(toPort.type);
      rejectConnection(`${from.name} 출력을 ${to.name} 입력에 연결했습니다.`, '타입이 달라 값을 전달할 수 없어 연결을 저장하지 않았습니다.', `같은 모양(${from.shape})의 연결부끼리 이어 주세요.`);
      return;
    }
    if (isInputLinked(target.nodeId, target.portId)) {
      rejectConnection('이 입력 연결부에는 이미 연결이 있습니다.', '입력 하나는 값 하나만 받을 수 있어 연결을 저장하지 않았습니다.', '기존 연결을 지우거나 합류 노드로 여러 갈래를 모아 주세요.');
      return;
    }
    if (reachesNode(target.nodeId, source.nodeId)) {
      rejectConnection('연결이 실행 순서를 되돌리는 순환을 만듭니다.', '순환이 있으면 실행 순서를 정할 수 없어 연결을 저장하지 않았습니다.', '앞 단계로 돌아가지 않는 방향으로 연결해 주세요.');
      return;
    }

    setLinks((current) => [...current, { id: nextId('link'), from: source, to: target }]);
    setNotice(null);
    setAnnouncement(`${fromNode.title}의 ${fromPort.label} 출력을 ${toNode.title}의 ${toPort.label} 입력에 연결했습니다.`);
  };

  const deleteNode = (nodeId: string) => {
    const node = nodeById[nodeId];
    if (!node) return;
    const removedLinks = links.filter((link) => link.from.nodeId === nodeId || link.to.nodeId === nodeId);
    setNodes((current) => current.filter((item) => item.id !== nodeId));
    setLinks((current) => current.filter((link) => link.from.nodeId !== nodeId && link.to.nodeId !== nodeId));
    setSelectedNodeId((current) => current === nodeId ? null : current);
    setNodeMove(null);
    setTrashReady(false);
    setNotice({ kind: 'undo', message: `${node.title} 노드와 연결 ${removedLinks.length}개를 삭제했습니다.`, restore: { node, links: removedLinks } });
    setAnnouncement(`${node.title} 노드를 삭제했습니다. 실행 취소로 되돌릴 수 있습니다.`);
  };

  const undoDelete = () => {
    if (notice?.kind !== 'undo') return;
    const { node, links: removedLinks } = notice.restore;
    setNodes((current) => [...current, node]);
    setLinks((current) => [...current, ...removedLinks]);
    setSelectedNodeId(node.id);
    setNotice(null);
    setAnnouncement(`${node.title} 노드와 연결을 복원했습니다.`);
  };

  const deleteLink = (linkId: string) => {
    setLinks((current) => current.filter((link) => link.id !== linkId));
    setAnnouncement('연결을 삭제했습니다.');
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!selectedNodeId || isTypingTarget(event.target)) return;
      event.preventDefault();
      deleteNode(selectedNodeId);
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  });

  const addNode = (blueprintId: string, position: CanvasPoint) => {
    const node = createProNode(blueprintId, nextId(`node-${blueprintId}`), Math.round(position.x), Math.round(position.y));
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setNotice(null);
    setAnnouncement(`${node.title} 노드를 캔버스에 추가했습니다.`);
    return node;
  };

  const addNodeAtViewportCenter = (blueprintId: string) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const center = bounds && bounds.width
      ? worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : { x: 260, y: 220 };
    addNode(blueprintId, { x: center.x - PRO_NODE_WIDTH / 2, y: center.y - PRO_PORT_START / 2 });
  };

  const addNodeFromPicker = (item: ProNodeBlueprint) => {
    if (!picker) return;
    const point = worldPoint(picker.x, picker.y);
    const node = createProNode(item.id, nextId(`node-${item.id}`), Math.round(point.x), Math.round(point.y - PRO_PORT_START));
    const targetPort = node.inputs.find((port) => port.type === picker.type);
    setNodes((current) => [...current, node]);
    if (picker.source && targetPort) {
      setLinks((current) => [...current, { id: nextId('link'), from: picker.source, to: { nodeId: node.id, portId: targetPort.id } }]);
    }
    setSelectedNodeId(node.id);
    setPicker(null);
    setPickerQuery('');
    setNotice(null);
    setAnnouncement(`${node.title} 노드를 추가하고 연결했습니다.`);
  };

  const pickerGroups = useMemo(() => {
    if (!picker) return [];
    const query = pickerQuery.trim().toLowerCase();
    const groups = new Map<string, Array<ProNodeBlueprint & { tone: BlockTone }>>();
    PRO_NODE_LIBRARY.forEach((category) => category.items.forEach((item) => {
      if (!item.inputs.some((port) => port.type === picker.type)) return;
      if (query && !`${item.title} ${item.detail}`.toLowerCase().includes(query)) return;
      const name = item.group ?? category.category;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push({ ...item, tone: category.tone });
    }));
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  }, [picker, pickerQuery]);

  const isPointerOverTrash = (event: { clientX: number; clientY: number }) => {
    const bounds = trashZoneRef.current?.getBoundingClientRect();
    if (!bounds) return false;
    return event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  };

  const beginNodeMove = (event: ReactPointerEvent<HTMLElement>, node: ProNode, fromHandle = false) => {
    if (event.button !== 0) return;
    if (!fromHandle && (event.target as Element).closest?.('button, input, select, .graph-port')) return;
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setNodeMove({ nodeId: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
    workspaceRef.current?.setPointerCapture?.(event.pointerId);
  };

  const beginLink = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string, type: ProPortType) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const index = node.outputs.findIndex((port) => port.id === portId);
    const origin = proPortPoint(node, 'out', index);
    setSelectedNodeId(node.id);
    setLinkDraft({ source: { nodeId: node.id, portId }, type, origin, point: origin });
  };

  const releaseOnOutput = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string, type: ProPortType) => {
    event.stopPropagation();
    if (linkDraft && linkDraft.source.nodeId !== node.id) {
      setLinkDraft(null);
      rejectConnection('출력 연결부끼리 연결했습니다.', '출력은 다른 노드의 입력으로만 이어질 수 있어 연결을 저장하지 않았습니다.', '왼쪽 방향의 입력 연결부에 놓아 주세요.');
      return;
    }
    setLinkDraft(null);
    setPicker({ x: event.clientX, y: event.clientY, type, source: { nodeId: node.id, portId } });
    setPickerQuery('');
  };

  const releaseOnInput = (event: ReactPointerEvent<HTMLButtonElement>, node: ProNode, portId: string) => {
    if (!linkDraft) return;
    event.stopPropagation();
    connectPorts(linkDraft.source, { nodeId: node.id, portId });
    setLinkDraft(null);
  };

  const beginCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setPicker(null);
    setPanGesture({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget.closest<HTMLElement>('.pro-canvas');
    if (!canvas) return;
    canvas.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
    canvas.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    canvas.style.setProperty('--spotlight-opacity', '1');
  };

  const hideCursorSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.closest<HTMLElement>('.pro-canvas')?.style.setProperty('--spotlight-opacity', '0');
    pointerPositionRef.current = null;
  };

  const updateCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorSpotlight(event);
    const previousPointer = pointerPositionRef.current;
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    if (nodeMove) {
      setTrashReady(isPointerOverTrash(event));
      setNodes((current) => current.map((node) => node.id === nodeMove.nodeId
        ? {
          ...node,
          x: Math.round(nodeMove.originX + (event.clientX - nodeMove.startX) / zoom),
          y: Math.round(nodeMove.originY + (event.clientY - nodeMove.startY) / zoom),
        }
        : node));
      return;
    }
    if (linkDraft) {
      const point = worldPoint(event.clientX, event.clientY);
      setLinkDraft((current) => current ? { ...current, point } : current);
      return;
    }
    if (panGesture) {
      setPan({
        x: panGesture.originX + event.clientX - panGesture.startX,
        y: panGesture.originY + event.clientY - panGesture.startY,
      });
      return;
    }
    if (spacePanningRef.current && previousPointer) {
      setPan((current) => ({
        x: current.x + event.clientX - previousPointer.x,
        y: current.y + event.clientY - previousPointer.y,
      }));
    }
  };

  const finishCanvasGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cancelled = event?.type === 'pointercancel';
    if (nodeMove && !cancelled && isPointerOverTrash(event)) {
      deleteNode(nodeMove.nodeId);
    } else if (linkDraft && !cancelled) {
      setPicker({ x: event.clientX, y: event.clientY, type: linkDraft.type, source: linkDraft.source });
      setPickerQuery('');
    }
    setLinkDraft(null);
    setNodeMove(null);
    setPanGesture(null);
    setTrashReady(false);
  };

  const zoomCanvasWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (nodeMove || linkDraft) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const next = getStrategyCanvasWheelZoom(zoom, pan, event.deltaY, cursorX, cursorY);
    if (!next) return;
    setZoom(next.zoom);
    setPan(next.pan);
  };

  const fitGraphToView = () => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || nodes.length === 0) return;
    const graph = nodes.reduce((current, node) => ({
      left: Math.min(current.left, node.x),
      top: Math.min(current.top, node.y),
      right: Math.max(current.right, node.x + PRO_NODE_WIDTH),
      bottom: Math.max(current.bottom, node.y + proNodeHeight(node)),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const margin = 64;
    const nextZoom = Math.max(.5, Math.min(1, Number(Math.min(
      (bounds.width - margin * 2) / (graph.right - graph.left),
      (bounds.height - margin * 2) / (graph.bottom - graph.top),
    ).toFixed(2))));
    setZoom(nextZoom);
    setPan({
      x: Number((bounds.width / 2 - (graph.left + graph.right) / 2 * nextZoom).toFixed(2)),
      y: Number((bounds.height / 2 - (graph.top + graph.bottom) / 2 * nextZoom).toFixed(2)),
    });
    setAnnouncement('그래프 전체가 보이도록 배율을 맞췄습니다.');
  };

  const startLibraryDrag = (event: DragEvent<HTMLButtonElement>, item: ProNodeBlueprint) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item.id);
    setLibraryDrag(item);
  };

  const dropLibraryNode = (event: DragEvent<HTMLDivElement>) => {
    if (!libraryDrag) return;
    event.preventDefault();
    const point = worldPoint(event.clientX, event.clientY);
    addNode(libraryDrag.id, { x: point.x - PRO_NODE_WIDTH / 2, y: point.y - PRO_PORT_START / 2 });
    setLibraryDrag(null);
  };

  const updateSelectedParam = (key: 'threshold' | 'timeframe', value: string) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId
      ? { ...node, params: { ...node.params, [key]: value } }
      : node));
  };

  const renameSelectedNode = (title: string) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, title } : node));
  };

  const runValidation = () => {
    const issues: ProValidationIssue[] = [];
    if (nodes.length === 0) {
      issues.push({
        nodeId: null,
        problem: '전략 그래프가 비어 있습니다.',
        impact: '실행할 노드가 없어 봇 생성 단계로 넘어갈 수 없습니다.',
        fix: '왼쪽 NODES에서 노드를 캔버스로 끌어와 시작해 주세요.',
      });
    }
    nodes.forEach((node) => {
      const missing = node.inputs.filter((port) => !isInputLinked(node.id, port.id));
      if (missing.length > 0) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 ${missing.map((port) => port.label).join(', ')} 입력이 연결되지 않았습니다.`,
          impact: '입력값이 없으면 이 노드를 실행할 수 없습니다.',
          fix: '앞 단계 노드의 같은 모양 출력과 연결해 주세요.',
        });
      }
      if (node.blueprintId === 'compare' && !node.params.threshold.trim()) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 기준값이 비어 있습니다.`,
          impact: '비교 기준이 없으면 참·거짓을 판단할 수 없습니다.',
          fix: '오른쪽 설정에서 기준값을 직접 입력해 주세요.',
        });
      }
      if (node.blueprintId === 'quotes' && !node.params.timeframe) {
        issues.push({
          nodeId: node.id,
          problem: `${node.title} 노드의 시간축이 선택되지 않았습니다.`,
          impact: '시간축이 없으면 어떤 주기의 데이터를 읽을지 정할 수 없습니다.',
          fix: '오른쪽 설정에서 시간축을 직접 선택해 주세요.',
        });
      }
    });

    if (issues.length === 0) {
      setNotice({ kind: 'info', message: '구조 검사에서 문제를 찾지 못했습니다. 구조 검사 통과는 수익성이나 안전성을 보장하지 않습니다.' });
      setAnnouncement('구조 검사에서 문제를 찾지 못했습니다.');
      return;
    }
    const [first] = issues;
    if (first.nodeId) setSelectedNodeId(first.nodeId);
    setNotice({ kind: 'error', problem: first.problem, impact: first.impact, fix: first.fix, count: issues.length });
    setAnnouncement(`구조 검사에서 ${issues.length}개 문제를 찾았습니다. ${first.problem}`);
  };

  const saveDraft = () => {
    setNotice({ kind: 'info', message: '샘플 편집기에서는 서버에 저장하지 않습니다. 지금 구성한 그래프는 이 화면에서만 유지됩니다.' });
    setAnnouncement('샘플 편집기에서는 서버에 저장하지 않습니다.');
  };

  const renderPort = (node: ProNode, port: ProPort, index: number, direction: 'in' | 'out') => {
    const meta = describePortType(port.type);
    const linked = direction === 'in'
      ? isInputLinked(node.id, port.id)
      : links.some((link) => link.from.nodeId === node.id && link.from.portId === port.id);
    const compatible = linkDraft !== null
      && direction === 'in'
      && linkDraft.type === port.type
      && linkDraft.source.nodeId !== node.id
      && !linked;
    return <button
      key={port.id}
      type="button"
      data-testid={port.testId}
      className={`graph-port graph-port--${direction} ${linked ? 'is-linked' : ''} ${compatible ? 'is-compatible' : ''}`}
      style={{ top: PRO_PORT_START + index * PRO_PORT_GAP - 11 }}
      aria-label={`${node.title} ${port.label} ${direction === 'in' ? '입력 연결부' : '출력 연결부'} · ${meta.name} ${meta.shape}`}
      onPointerDown={direction === 'out' ? (event) => beginLink(event, node, port.id, port.type) : undefined}
      onPointerUp={direction === 'out'
        ? (event) => releaseOnOutput(event, node, port.id, port.type)
        : (event) => releaseOnInput(event, node, port.id)}
    >
      <i className={`port-shape port-shape--${port.type}`} aria-hidden="true" />
      <span>{port.label}</span>
    </button>;
  };

  const linkTargetReady = (node: ProNode) => linkDraft !== null
    && linkDraft.source.nodeId !== node.id
    && node.inputs.some((port) => port.type === linkDraft.type && !isInputLinked(node.id, port.id));

  const trashItemLabel = nodeMove ? '노드' : null;

  return <Localized><div className="page editor-page pro-editor-page editor-shell-page">
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="pro-editor-commandbar floating-editor-controls" role="toolbar" aria-label="Pro 편집 작업">
      <div className="pro-editor-context">
        <Button className="floating-editor-button" kind="ghost" icon={ArrowLeft} onClick={goBack}>목록</Button>
        {/* Same clean bar as Basic: navigation and actions only. The strategy
            name/version belongs to the list and save flow, and the sample-data
            disclosure lives on the help page (2026-07-26 decision). */}
        <div className="floating-editor-mode-controls" role="group" aria-label="편집기 전환">
          <Button className="floating-editor-button" onClick={() => openEditor?.('basic')}>Basic 편집기</Button>
          <Button className="floating-editor-button active" onClick={() => openEditor?.('pro')}>Pro 편집기</Button>
        </div>
      </div>
      <div className="pro-editor-actions">
        <Button className="floating-editor-button" icon={Save} onClick={saveDraft}>저장</Button>
        <Button className="floating-editor-button" kind="primary" icon={ShieldCheck} onClick={runValidation}>검증</Button>
      </div>
    </div>
    <div className="editor-layout pro-layout full-editor-workspace" data-testid="pro-editor-workspace">
      <aside className="editor-palette node-library-panel panel floating-editor-panel" data-testid="pro-node-library">
        <div className="palette-title"><span>NODES</span><Boxes size={15} /></div>
        <p className="library-intro">노드를 캔버스로 끌어다 놓고 같은 모양의 연결부끼리 이으세요. 하나의 출력은 여러 노드로 갈라질 수 있습니다.</p>
        <label className="palette-search"><Search size={14} /><input aria-label="노드 검색" placeholder="지표, 조건, 주문" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} /></label>
        <div className="block-category-list">
          {filteredLibrary.map((category) => <details className={`block-category tone-${category.tone}`} open key={category.category}>
            <summary><ChevronDown size={14} /><span>{category.category}</span><b>{category.items.length}</b></summary>
            <div className="node-chip-list">
              {category.items.map((item) => <button
                key={item.id}
                type="button"
                className={libraryDrag?.id === item.id ? 'is-library-dragging' : ''}
                aria-label={`${item.title} 노드 추가`}
                draggable
                onDragStart={(event) => startLibraryDrag(event, item)}
                onDragEnd={() => setLibraryDrag(null)}
                onClick={() => addNodeAtViewportCenter(item.id)}
              >
                <item.icon size={14} aria-hidden="true" />
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <Plus size={12} />
              </button>)}
            </div>
          </details>)}
        </div>
      </aside>
      <section
        className="editor-canvas pro-canvas"
        aria-label="Pro 전략 캔버스"
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          '--canvas-pan-x': `${pan.x}px`,
          '--canvas-pan-y': `${pan.y}px`,
        } as CSSProperties}
      >
        <div className="cursor-dot-spotlight" data-testid="cursor-dot-spotlight" aria-hidden="true" />
        <div className="pro-graph-controls" role="group" aria-label="그래프 도구">
          <button type="button" className="floating-editor-button" aria-label="전체 보기" onClick={fitGraphToView}><Split size={14} /> 전체 보기</button>
          <span>{`노드 ${nodes.length} · 연결 ${links.length} · 휠: 확대/축소 · 빈 공간 드래그: 이동`}</span>
        </div>
        <div className="floating-zoom-controls" role="group" aria-label="캔버스 확대/축소">
          <button type="button" className="floating-editor-button" aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom((current) => Math.max(.5, Number((current - .1).toFixed(1))))}>−</button>
          <button type="button" className="floating-editor-button zoom-level" aria-label="배율 초기화" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="floating-editor-button" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((current) => Math.min(2, Number((current + .1).toFixed(1))))}>+</button>
        </div>
        <div className="mobile-editor-notice"><Split size={24} /><strong>Pro 그래프 편집은 데스크톱에서 사용할 수 있습니다</strong><span>현재 화면에서는 구성만 조회할 수 있습니다.</span></div>
        <div
          ref={(element) => { workspaceRef.current = element; }}
          className={`graph-workspace ${panGesture || spacePanning ? 'is-panning' : ''} ${spacePanning ? 'is-space-panning' : ''} ${nodeMove ? 'is-moving-node' : ''} ${linkDraft ? 'is-linking' : ''}`}
          data-testid="pro-graph-surface"
          onPointerDown={beginCanvasGesture}
          onPointerMove={updateCanvasGesture}
          onPointerUp={finishCanvasGesture}
          onPointerCancel={finishCanvasGesture}
          onPointerLeave={hideCursorSpotlight}
          onWheel={zoomCanvasWithWheel}
          onDragOver={(event) => { if (libraryDrag) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={dropLibraryNode}
        >
          <div className="graph-world" data-testid="pro-graph-world" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
            <svg className="graph-links" aria-label="전략 연결선">
              {links.map((link) => {
                const fromNode = nodeById[link.from.nodeId];
                const toNode = nodeById[link.to.nodeId];
                if (!fromNode || !toNode) return null;
                const fromIndex = fromNode.outputs.findIndex((port) => port.id === link.from.portId);
                const toIndex = toNode.inputs.findIndex((port) => port.id === link.to.portId);
                if (fromIndex < 0 || toIndex < 0) return null;
                const path = proLinkPath(proPortPoint(fromNode, 'out', fromIndex), proPortPoint(toNode, 'in', toIndex));
                const label = `${fromNode.title} ${fromNode.outputs[fromIndex].label} 출력과 ${toNode.title} ${toNode.inputs[toIndex].label} 입력 연결 삭제`;
                return <g key={link.id}>
                  <path className="graph-link" d={path} />
                  <path
                    className="graph-link-hit"
                    d={path}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={() => deleteLink(link.id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); deleteLink(link.id); } }}
                  />
                </g>;
              })}
              {linkDraft && <path className="graph-link is-draft" d={proLinkPath(linkDraft.origin, linkDraft.point)} />}
            </svg>
            {nodes.map((node) => {
              const Icon = node.icon;
              return <article
                key={node.id}
                className={`graph-node tone-${node.tone} ${selectedNodeId === node.id ? 'is-selected' : ''} ${nodeMove?.nodeId === node.id ? 'is-node-moving' : ''} ${linkDraft ? (linkDraft.source.nodeId === node.id ? 'is-link-source' : linkTargetReady(node) ? 'is-link-ready' : 'is-link-blocked') : ''}`}
                data-testid={`pro-node-${node.id}`}
                style={{ left: node.x, top: node.y, width: PRO_NODE_WIDTH, height: proNodeHeight(node) }}
                onPointerDown={(event) => beginNodeMove(event, node)}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <header>
                  {Icon && <Icon size={14} aria-hidden="true" />}
                  <span>{node.kicker}</span>
                  <button
                    type="button"
                    className="graph-node-handle"
                    aria-label={`${node.title} 노드 자유 이동`}
                    onPointerDown={(event) => beginNodeMove(event, node, true)}
                  ><GripVertical size={13} /></button>
                </header>
                <strong>{node.title}</strong>
                <small>{node.detail}</small>
                {node.inputs.map((port, index) => renderPort(node, port, index, 'in'))}
                {node.outputs.map((port, index) => renderPort(node, port, index, 'out'))}
              </article>;
            })}
          </div>
        </div>
        {picker && <div
          role="dialog"
          aria-label="호환 노드 선택"
          className="node-picker"
          style={{ left: `${picker.x}px`, top: `${picker.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header>
            <div><span>{describePortType(picker.type).name} 출력</span><strong>호환 노드 선택</strong></div>
            <button type="button" aria-label="호환 노드 선택 닫기" onClick={() => setPicker(null)}><X size={15} /></button>
          </header>
          <label><Search size={14} /><input autoFocus aria-label="호환 노드 검색" placeholder="노드 검색" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} /></label>
          {pickerGroups.length === 0 && <p className="node-picker-empty">검색어와 맞는 호환 노드가 없습니다.</p>}
          {pickerGroups.map((group) => <div key={group.name}>
            <p>{group.name}</p>
            {group.items.map((item) => <button
              key={item.id}
              type="button"
              aria-label={item.title}
              onClick={() => addNodeFromPicker(item)}
            >
              <item.icon size={16} aria-hidden="true" />
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </button>)}
          </div>)}
        </div>}
      </section>
      <aside className="editor-inspector node-inspector panel floating-editor-panel" data-testid="pro-node-inspector">
        <div className="inspector-title"><span>NODE SETTINGS</span>{selectedNode && <button type="button" aria-label="노드 설정 닫기" onClick={() => setSelectedNodeId(null)}><X size={15} /></button>}</div>
        {selectedNode ? <>
          <div className="node-id">{selectedNode.kicker} · {selectedNode.id}</div>
          <div className="inspector-section">
            <label htmlFor="pro-node-title">노드 이름</label>
            <input id="pro-node-title" value={selectedNode.title} onChange={(event) => renameSelectedNode(event.target.value)} />
          </div>
          <div className="inspector-section">
            <label htmlFor="pro-node-threshold">기준값 직접 입력</label>
            <div className="empty-input">
              <input id="pro-node-threshold" placeholder="값을 입력하세요" value={selectedNode.params.threshold} onChange={(event) => updateSelectedParam('threshold', event.target.value)} />
              {!selectedNode.params.threshold && <b>required</b>}
            </div>
          </div>
          <div className="inspector-section">
            <label htmlFor="pro-node-timeframe">시간축</label>
            <select id="pro-node-timeframe" value={selectedNode.params.timeframe} onChange={(event) => updateSelectedParam('timeframe', event.target.value)}>
              <option value="">시간축 선택</option>
              {PRO_TIMEFRAMES.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
            </select>
          </div>
          <div className="inspector-ports">
            <p>연결부 타입</p>
            {[...selectedNode.inputs.map((port) => ({ port, direction: '입력 연결부' })), ...selectedNode.outputs.map((port) => ({ port, direction: '출력 연결부' }))].map(({ port, direction }) => {
              const meta = describePortType(port.type);
              return <span key={`${direction}-${port.id}`}>
                <i className={`port-shape port-shape--${port.type}`} aria-hidden="true" />
                <b>{port.label}</b>
                <small>{direction} · {meta.name} · {meta.shape}</small>
              </span>;
            })}
          </div>
          <div className="inspector-actions">
            <Button kind="ghost" icon={Trash2} onClick={() => deleteNode(selectedNode.id)}>노드 삭제</Button>
          </div>
        </> : <p className="inspector-empty">노드를 선택하면 설정과 연결부를 확인할 수 있습니다.</p>}
      </aside>
    </div>
    {notice && <div className="pro-editor-notice" role="alert" data-tone={notice.kind}>
      {notice.kind === 'error'
        ? <div>
          <strong>문제 · {notice.problem}</strong>
          <span>영향 · {notice.impact}</span>
          <span>해결 · {notice.fix}</span>
          {(notice.count ?? 0) > 1 && <small>남은 문제 {(notice.count ?? 0) - 1}개</small>}
        </div>
        : <div><strong>{notice.message}</strong></div>}
      <div className="pro-editor-notice-actions">
        {notice.kind === 'undo' && <Button kind="ghost" onClick={undoDelete}>실행 취소</Button>}
        <button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={15} /></button>
      </div>
    </div>}
    {trashItemLabel && <div
      ref={(element) => { trashZoneRef.current = element; }}
      className={`editor-trash-zone is-pointer-trash ${trashReady ? 'is-ready' : ''}`}
      role="region"
      aria-label={`${trashItemLabel} 삭제 영역`}
      data-testid="pro-trash-zone"
    >
      <span className="editor-trash-icon"><Trash2 size={18} aria-hidden="true" /></span>
      <span className="editor-trash-copy"><strong>{trashItemLabel} 버리기</strong><small>여기에 놓으면 삭제됩니다</small></span>
    </div>}
  </div></Localized>;
}

// The previous implementation remains in this file temporarily as a rollback
// reference while the specification-complete editor is exercised.
export { ProEditor } from './ProEditorView';
