import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertTriangle, BarChart3, Bot, Check, ChevronDown, CircleHelp, Clock3, Plus, X } from 'lucide-react';
import { BacktestApiError } from '../api/backtests';
import type {
  BacktestAttempt,
  BacktestClient,
  BacktestDetailManifest,
  BacktestMonthlySummary,
  BacktestPerformanceSummary,
  BacktestRequestOptions,
  BacktestRun,
  BacktestRunStatus,
  BacktestTrade,
} from '../api/backtests';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
  Panel,
  Status,
} from '../components/common';
import { ErrorPage, SignInRequiredPage } from '../components/StatePages';
import type { StatusTone } from '../components/common';
import { Localized } from '../lib/i18n';
import { browserSessionStore, useSessionState } from '../lib/session';
import type { AnonymousReason, SessionStore } from '../lib/session';

interface BacktestLiveViewProps {
  client: BacktestClient;
  /**
   * Where the screen learns whether anyone is signed in. Defaults to the session this
   * tab holds; injectable so a test can drive both sides of the gate.
   */
  session?: SessionStore;
  /** Active runs refresh until the backend returns a terminal state. */
  activePollIntervalMs?: number;
}

interface RunDetail {
  run: BacktestRun;
  attempts: BacktestAttempt[];
  /** `null` when the engine has not published a summary for this run yet (404). */
  performance: BacktestPerformanceSummary | null;
  monthlySummaries: BacktestMonthlySummary[];
  detailManifests: BacktestDetailManifest[];
}

const RUN_PAGE_SIZE = 25;

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.()
  ?? `backtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Why the screen has no data. Kept apart because each case needs different words and
 * a different next step, and three of them are not things a retry button fixes:
 *
 * * `unauthenticated` (401) — sign in. The stored credential, if any, is now dropped.
 * * `forbidden` (403) — the run belongs to another account. Signing in again is not it.
 * * `missing` (404) — no such run, or it is not yours.
 * * `notReady` (409 `BACKTEST_RESULT_NOT_READY`) — yours, but not published yet.
 * * `transport` — everything else, and the only one worth retrying blind.
 */
type FailureKind = 'unauthenticated' | 'forbidden' | 'missing' | 'notReady' | 'transport';
type BacktestResultTab = 'performance' | 'monthly' | 'trades' | 'execution';

const STATUS_LABELS: Record<BacktestRunStatus, string> = {
  QUEUED: '대기 중',
  RUNNING: '실행 중',
  COMPLETED: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨',
  UNAVAILABLE: '실행 불가',
};

const STATUS_TONES: Record<BacktestRunStatus, StatusTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'positive',
  FAILED: 'negative',
  CANCELLED: 'neutral',
  UNAVAILABLE: 'warning',
};

export function BacktestLiveView({
  client,
  session = browserSessionStore,
  activePollIntervalMs = 5000,
}: BacktestLiveViewProps) {
  const sessionState = useSessionState(session);
  const signedIn = sessionState.status === 'authenticated';
  const [runs, setRuns] = useState<BacktestRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [listFailure, setListFailure] = useState<FailureKind | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailFailure, setDetailFailure] = useState<FailureKind | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [runOffset, setRunOffset] = useState(0);
  const [hasNextRunPage, setHasNextRunPage] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestOptions, setRequestOptions] = useState<BacktestRequestOptions | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestBotId, setRequestBotId] = useState('');
  const [requestDatasetId, setRequestDatasetId] = useState('');
  const [requestPolicyVersion, setRequestPolicyVersion] = useState('');
  const [requestPeriodStart, setRequestPeriodStart] = useState('');
  const [requestPeriodEnd, setRequestPeriodEnd] = useState('');
  const [requestIdempotencyKey, setRequestIdempotencyKey] = useState(newIdempotencyKey);

  /*
    A 401 means the token this tab holds is not one the server accepts, whatever the
    stored record claims. Dropping it here is what turns "every request quietly fails"
    into a signed-out screen that says so; a 403 is left alone, because that credential
    is fine and it is the run that belongs to somebody else.
  */
  const abandonSession = useCallback(() => session.signOut('rejected'), [session]);

  useEffect(() => {
    // No credential, no request. An anonymous build must not fire eight 401s per visit
    // just to discover what it already knows.
    if (!signedIn) {
      setRuns(null);
      setListFailure(null);
      return undefined;
    }
    const controller = new AbortController();
    setRuns(null);
    setListFailure(null);
    client.listRuns({ limit: RUN_PAGE_SIZE, offset: runOffset }, controller.signal).then((page) => {
      setRuns(page.items);
      setHasNextRunPage(page.items.length === RUN_PAGE_SIZE);
      setSelectedRunId((current) => (
        current && page.items.some((run) => run.backtestRunId === current)
          ? current
          : page.items[0]?.backtestRunId ?? null
      ));
    }).catch((error: unknown) => {
      if (!aborted(error)) setListFailure(classify(error, abandonSession));
    });
    return () => controller.abort();
  }, [client, listRevision, runOffset, signedIn, abandonSession]);

  const hasActiveRun = runs?.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING') ?? false;
  useEffect(() => {
    if (!signedIn || !hasActiveRun || activePollIntervalMs <= 0) return undefined;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'hidden') setListRevision((value) => value + 1);
    }, activePollIntervalMs);
    return () => window.clearTimeout(timer);
  }, [activePollIntervalMs, hasActiveRun, signedIn]);

  useEffect(() => {
    if (!requestOpen || !signedIn) return undefined;
    const controller = new AbortController();
    setRequestOptions(null);
    setRequestError(null);
    client.getRequestOptions(controller.signal).then((options) => {
      setRequestOptions(options);
      setRequestBotId((current) => current || options.bots[0]?.botId || '');
      setRequestPolicyVersion((current) => current || options.executionPolicies[0]?.version || '');
      const dataset = options.datasets[0];
      setRequestDatasetId((current) => current || dataset?.id || '');
      setRequestPeriodStart((current) => current || dataset?.periodStart || '');
      setRequestPeriodEnd((current) => current || dataset?.periodEnd || '');
    }).catch((error) => {
      if (!aborted(error)) setRequestError('백테스트에 사용할 봇과 공식 입력을 불러오지 못했습니다.');
    });
    return () => controller.abort();
  }, [client, requestOpen, signedIn]);

  useEffect(() => {
    if (!selectedRunId || !signedIn) {
      setDetail(null);
      return undefined;
    }
    const controller = new AbortController();
    setDetail((current) => current?.run.backtestRunId === selectedRunId ? current : null);
    setDetailFailure(null);

    const load = async (): Promise<RunDetail> => {
      const run = await client.getRun(selectedRunId, controller.signal);
      const attempts = await client.listAttempts(selectedRunId, controller.signal);
      if (run.status !== 'COMPLETED') {
        // Result-only endpoints exist for a completed run. Asking early would turn a
        // perfectly normal queued run into a 409 the screen would have to explain away.
        return { run, attempts, performance: null, monthlySummaries: [], detailManifests: [] };
      }
      const [performance, monthlySummaries, detailManifests] = await Promise.all([
        client.getPerformance(selectedRunId, controller.signal).catch(pendingSummary),
        client.listMonthlySummaries(selectedRunId, controller.signal),
        client.listDetailManifests(selectedRunId, controller.signal),
      ]);
      return { run, attempts, performance, monthlySummaries, detailManifests };
    };

    void load().then((loaded) => {
      setDetail(loaded);
      setSelectedMonth(loaded.monthlySummaries.at(-1)?.etYearMonth ?? null);
    }).catch((error: unknown) => {
      if (!aborted(error)) setDetailFailure(classify(error, abandonSession));
    });
    return () => controller.abort();
  }, [client, selectedRunId, signedIn, abandonSession, listRevision]);

  const retry = () => setListRevision((value) => value + 1);

  const requestCustomBacktest = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestBotId || !requestDatasetId || !requestPolicyVersion || !requestPeriodStart || !requestPeriodEnd) {
      setRequestError('백테스트에 필요한 봇, 공식 데이터 또는 실행 기준이 준비되지 않았습니다.');
      return;
    }
    if (requestPeriodStart > requestPeriodEnd) {
      setRequestError('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    setRequestPending(true);
    setRequestError(null);
    try {
      const receipt = await client.requestBacktest(requestBotId, {
        datasetManifestId: requestDatasetId,
        periodStart: requestPeriodStart,
        periodEnd: requestPeriodEnd,
        executionPolicyVersion: requestPolicyVersion,
        idempotencyKey: requestIdempotencyKey,
      });
      setRequestMessage(receipt.created
        ? `백테스트 요청을 접수했습니다. 실행 ID: ${receipt.runId}`
        : `같은 요청이 이미 접수되어 기존 실행을 사용합니다. 실행 ID: ${receipt.runId}`);
      setRequestOpen(false);
      setRequestIdempotencyKey(newIdempotencyKey());
      setRunOffset(0);
      retry();
    } catch {
      setRequestError('백테스트 요청을 접수하지 못했습니다. 입력 범위와 서버 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setRequestPending(false);
    }
  };
  const selectedRequestDataset = requestOptions?.datasets.find((dataset) => dataset.id === requestDatasetId) ?? null;
  const closeRequest = useCallback(() => setRequestOpen(false), []);

  /*
    Nothing to show at all — signed out, or the list itself failed. The whole
    route renders the one shared state page; no page scaffold survives around
    it, so every screen fails the same way.
  */
  if (sessionState.status === 'anonymous') {
    return <SignedOutState reason={sessionState.reason} />;
  }
  if (listFailure !== null) {
    return <ListFailure kind={listFailure} onRetry={retry} />;
  }

  return <Localized><div className="page backtest-page backtest-live-page">
    <PageHeading
      eyebrow="BOT PERFORMANCE"
      title="봇 백테스트"
      description="출시된 봇의 검증된 성과와 월별 실행 결과를 한 화면에서 비교합니다."
      actions={<div className="backtest-live-heading-actions">
        <Button icon={Plus} kind="primary" onClick={() => setRequestOpen(true)}>새 백테스트</Button>
      </div>}
    />
    {requestMessage && <p className="bots-decision-note" role="status">{requestMessage}</p>}
    {requestOpen && <BacktestRequestModal onClose={closeRequest}>
      {requestOptions === null && !requestError && <LoadingState label="백테스트 입력을 불러오는 중입니다." />}
      {requestError && <ErrorState title={requestError} />}
      {requestOptions && requestOptions.bots.length === 0 && <EmptyState
        icon={BarChart3}
        title="백테스트할 출시 봇이 없습니다."
        detail="전략을 검증하고 봇을 출시한 뒤 사용자 지정 백테스트를 요청할 수 있습니다."
      />}
      {requestOptions && requestOptions.bots.length > 0 && <form className="backtest-request-form" onSubmit={(event) => { void requestCustomBacktest(event); }}>
        <BacktestRequestField label="봇" hint="출시가 완료된 봇만 선택할 수 있습니다." className="is-wide">
          <BacktestRequestSelect
            label="백테스트 봇"
            value={requestBotId}
            options={requestOptions.bots.map((bot) => ({ value: bot.botId, label: bot.name, detail: bot.botId.slice(0, 8) }))}
            onChange={setRequestBotId}
          />
        </BacktestRequestField>
        <BacktestRequestField label="공식 데이터" hint="검증된 데이터 범위 안에서 실행됩니다." className="is-wide">
          <BacktestRequestSelect
            label="백테스트 데이터"
            value={requestDatasetId}
            options={requestOptions.datasets.map((dataset) => ({
              value: dataset.id,
              label: `${dataset.feedCode} · ${dataset.resolution}`,
              detail: `${dataset.periodStart} — ${dataset.periodEnd}`,
            }))}
            onChange={(value) => {
          const dataset = requestOptions.datasets.find((item) => item.id === value);
          setRequestDatasetId(value);
          if (dataset) { setRequestPeriodStart(dataset.periodStart); setRequestPeriodEnd(dataset.periodEnd); }
            }}
          />
        </BacktestRequestField>
        <label className="backtest-request-field"><span><strong>시작일</strong><small>ET 기준</small></span><input aria-label="백테스트 시작일" type="date" min={selectedRequestDataset?.periodStart} max={selectedRequestDataset?.periodEnd} value={requestPeriodStart} onChange={(event) => setRequestPeriodStart(event.target.value)} /></label>
        <label className="backtest-request-field"><span><strong>종료일</strong><small>ET 기준</small></span><input aria-label="백테스트 종료일" type="date" min={selectedRequestDataset?.periodStart} max={selectedRequestDataset?.periodEnd} value={requestPeriodEnd} onChange={(event) => setRequestPeriodEnd(event.target.value)} /></label>
        {!requestPolicyVersion && <p className="backtest-request-unavailable" role="alert">
          현재 백테스트 실행 기준이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.
        </p>}
        <footer className="backtest-request-actions"><Button type="button" onClick={closeRequest}>취소</Button><Button type="submit" kind="primary" disabled={requestPending || !requestDatasetId || !requestPolicyVersion}>{requestPending ? '요청 중…' : '백테스트 요청'}</Button></footer>
      </form>}
    </BacktestRequestModal>}
    {signedIn && <>
      {listFailure === null && runs === null && <LoadingState label="백테스트 결과를 불러오는 중입니다." />}
      {listFailure === null && runs?.length === 0 && <EmptyState
        icon={BarChart3}
        title="백테스트할 봇이 없습니다."
        detail="출시된 봇이 생기면 공식 백테스트가 자동으로 시작되고 이곳에 결과가 표시됩니다."
      />}
      {listFailure === null && runs && runs.length > 0 && <div
        className="backtest-live-workspace backtest-comparison-workspace"
        data-testid="backtest-live-workspace"
      >
        <RunList
          runs={runs}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
          offset={runOffset}
          hasNext={hasNextRunPage}
          onPrevious={() => setRunOffset((value) => Math.max(0, value - RUN_PAGE_SIZE))}
          onNext={() => setRunOffset((value) => value + RUN_PAGE_SIZE)}
        />
        <section className="backtest-live-detail" aria-label="선택한 백테스트 결과">
          {detailFailure === null && detail === null
            && <LoadingState label="선택한 백테스트를 불러오는 중입니다." />}
          {detailFailure !== null && <DetailFailure kind={detailFailure} />}
          {detail && <RunDetailPanels
            client={client}
            detail={detail}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onUnauthenticated={abandonSession}
            onRunUpdated={(run) => {
              setDetail((current) => current ? { ...current, run } : current);
              setRuns((current) => current?.map((item) => (
                item.backtestRunId === run.backtestRunId ? run : item
              )) ?? current);
            }}
          />}
        </section>
      </div>}
    </>}
  </div></Localized>;
}

function BacktestRequestModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return <div
    className="backtest-request-backdrop"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <section
      ref={dialogRef}
      className="backtest-request-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backtest-request-dialog-title"
    >
      <header>
        <span className="backtest-request-dialog-icon"><BarChart3 size={18} aria-hidden="true" /></span>
        <div><small>OFFICIAL BACKTEST</small><h2 id="backtest-request-dialog-title">새 백테스트</h2><p>검증된 봇과 공식 입력을 선택해 새로운 실행을 요청합니다.</p></div>
        <button ref={closeButtonRef} type="button" aria-label="새 백테스트 창 닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="backtest-request-dialog-body">{children}</div>
    </section>
  </div>;
}

function BacktestRequestField({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  hint: string;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`backtest-request-field ${className}`}>
    <span><strong>{label}</strong><small>{hint}</small></span>
    {children}
  </div>;
}

interface BacktestRequestSelectOption {
  value: string;
  label: string;
  detail?: string;
}

function BacktestRequestSelect({
  label,
  value,
  options,
  onChange,
  placement = 'down',
}: {
  label: string;
  value: string;
  options: BacktestRequestSelectOption[];
  onChange: (value: string) => void;
  placement?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, [open]);

  return <div className={`backtest-request-select opens-${placement} ${open ? 'is-open' : ''}`} ref={rootRef}>
    <button
      type="button"
      role="combobox"
      aria-label={label}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      aria-expanded={open}
      data-value={value}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
        }
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <span><strong>{selected?.label ?? '선택해 주세요'}</strong>{selected?.detail && <small>{selected.detail}</small>}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={listboxId} className="backtest-request-select-menu" role="listbox" aria-label={`${label} 옵션`}>
      {options.map((option) => <button
        key={option.value}
        type="button"
        role="option"
        aria-label={option.label}
        aria-selected={option.value === value}
        onClick={() => { onChange(option.value); setOpen(false); }}
      >
        <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
        <span className="backtest-request-select-check">{option.value === value && <Check size={14} aria-hidden="true" />}</span>
      </button>)}
    </div>}
  </div>;
}

/**
 * The signed-out screen.
 *
 * This is the state the card was missing. `defaultBacktestClient` had no token source,
 * so the product answer to "nobody is signed in" was eight 401s and a permission
 * error blaming the account. Now it is one visible, named stop, with the reason the
 * session is unusable, and no request is sent at all.
 */
function SignedOutState({ reason }: { reason: AnonymousReason }) {
  // One sign-in page, same words as every other screen. The reason the session
  // ended still rides on data-reason for tests and diagnostics, and the gate
  // mechanics are unchanged: no request leaves before someone signs in.
  return <div
    className="backtest-live-session-gate"
    data-testid="backtest-session-gate"
    data-reason={reason}
  >
    <SignInRequiredPage />
  </div>;
}

function ListFailure({ kind, onRetry }: { kind: FailureKind; onRetry: () => void }) {
  if (kind === 'forbidden') {
    return <ErrorPage
      title="백테스트 결과를 볼 권한이 없습니다."
      detail="이 계정에는 공식 백테스트 결과를 조회할 권한이 없습니다. 다른 계정의 실행 결과는 표시하지 않습니다."
    />;
  }
  // A 401 has already flipped the screen to the signed-out gate above, so anything
  // left here is a transport problem and a retry is the honest offer.
  return <ErrorPage
    title="백테스트 결과를 불러오지 못했습니다."
    detail="연결 상태를 확인한 뒤 다시 시도해 주세요. 기존 결과를 정상으로 간주하지 않습니다."
    onRetry={onRetry}
  />;
}

function DetailFailure({ kind }: { kind: FailureKind }) {
  if (kind === 'forbidden') {
    return <ErrorState
      title="이 백테스트를 볼 권한이 없습니다."
      detail="이 실행은 다른 계정 소유입니다. 계정을 확인해 주세요."
    />;
  }
  if (kind === 'missing') {
    return <ErrorState
      title="선택한 백테스트를 찾을 수 없습니다."
      detail="목록이 오래되었을 수 있습니다. 새로고침한 뒤 다시 선택해 주세요."
    />;
  }
  if (kind === 'notReady') {
    return <ErrorState
      title="이 실행의 결과가 아직 발행되지 않았습니다."
      detail="실행이 끝나면 결과 증거가 발행됩니다. 잠시 뒤 새로고침해 주세요."
    />;
  }
  return <ErrorState
    title="선택한 백테스트 상세를 불러오지 못했습니다."
    detail="불완전한 결과는 표시하지 않습니다. 다른 실행을 선택하거나 새로고침해 주세요."
  />;
}

function RunList({
  runs,
  selectedRunId,
  onSelect,
  offset,
  hasNext,
  onPrevious,
  onNext,
}: {
  runs: BacktestRun[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  offset: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return <aside className="panel backtest-bot-selector backtest-live-list" aria-labelledby="backtest-live-list-title">
    <header className="backtest-live-list-head">
      <div><span>BACKTEST RUNS</span><h2 id="backtest-live-list-title">백테스트 선택</h2></div>
      <small>{runs.length}건</small>
    </header>
    <div className="backtest-bot-options" role="list" aria-label="공식 백테스트 실행 목록">
      {runs.map((run) => <div role="listitem" key={run.backtestRunId}><button
        type="button"
        className={run.backtestRunId === selectedRunId ? 'active' : ''}
        aria-label={`${shortId(run.botId)} ${STATUS_LABELS[run.status]} 백테스트 보기`}
        onClick={() => onSelect(run.backtestRunId)}
      >
        <span className="backtest-bot-icon"><Bot size={17} aria-hidden="true" /></span>
        <span><strong>{shortId(run.botId)}</strong><small>{formatTime(run.queuedAt)}</small></span>
        <Status tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Status>
      </button></div>)}
    </div>
    <footer className="backtest-bot-selector-footer backtest-live-pagination" aria-label="백테스트 실행 목록 페이지 이동">
      <Button disabled={offset === 0} onClick={onPrevious}>이전</Button>
      <span>{Math.floor(offset / RUN_PAGE_SIZE) + 1}페이지</span>
      <Button disabled={!hasNext} onClick={onNext}>다음</Button>
    </footer>
  </aside>;
}

function RunDetailPanels({
  client,
  detail,
  selectedMonth,
  onSelectMonth,
  onUnauthenticated,
  onRunUpdated,
}: {
  client: BacktestClient;
  detail: RunDetail;
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
  onUnauthenticated: () => void;
  onRunUpdated: (run: BacktestRun) => void;
}) {
  const { run } = detail;
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancellable = run.status === 'QUEUED' || run.status === 'RUNNING';
  const cancel = async () => {
    setCancelPending(true);
    setCancelError(null);
    try {
      onRunUpdated(await client.cancelBacktest(run.backtestRunId));
    } catch (error) {
      if (error instanceof BacktestApiError && error.unauthenticated) onUnauthenticated();
      setCancelError('백테스트 취소 요청을 처리하지 못했습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.');
    } finally {
      setCancelPending(false);
    }
  };
  return <>
    <Panel
      className="backtest-performance-panel backtest-live-status-panel backtest-live-overview-panel"
      title={`${shortId(run.botId)} 성과 개요`}
      subtitle={`요청 ${formatTime(run.queuedAt)} · 평가 ${run.evaluationStart} ~ ${run.evaluationEnd}`}
      action={<div className="backtest-live-heading-actions">
        <Status tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Status>
        {cancellable && <Button
          disabled={cancelPending || run.cancellationRequestedAt !== null}
          onClick={() => { void cancel(); }}
        >{run.cancellationRequestedAt !== null ? '취소 요청됨' : cancelPending ? '취소 요청 중…' : '실행 취소'}</Button>}
      </div>}
    >
      <section className="backtest-live-overview-chart" aria-label="선택한 백테스트 성과 개요">
        {run.status === 'COMPLETED'
          ? <BacktestActivityOverview
            run={run}
            summaries={detail.monthlySummaries}
          />
          : <div className="backtest-live-overview-state"><RunState run={run} /></div>}
        {cancelError && <FailureNotice title={cancelError} code={null} />}
      </section>
    </Panel>
    {run.status === 'COMPLETED'
      ? <BacktestResultTabs
        client={client}
        detail={detail}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
        onUnauthenticated={onUnauthenticated}
      />
      : <ExecutionPanel attempts={detail.attempts} />}
  </>;
}

const RESULT_TABS: ReadonlyArray<{ id: BacktestResultTab; label: string }> = [
  { id: 'performance', label: '성과 요약' },
  { id: 'monthly', label: '월별 분석' },
  { id: 'trades', label: '거래 내역' },
  { id: 'execution', label: '실행 정보' },
];

function BacktestResultTabs({
  client,
  detail,
  selectedMonth,
  onSelectMonth,
  onUnauthenticated,
}: {
  client: BacktestClient;
  detail: RunDetail;
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
  onUnauthenticated: () => void;
}) {
  const [activeTab, setActiveTab] = useState<BacktestResultTab>('performance');
  const tabPrefix = useId();

  useEffect(() => setActiveTab('performance'), [detail.run.backtestRunId]);

  return <section className="backtest-live-result-browser" aria-label="백테스트 상세 결과">
    <div className="backtest-live-result-tabs" role="tablist" aria-label="백테스트 결과 분류">
      {RESULT_TABS.map((tab) => <button
        type="button"
        role="tab"
        id={`${tabPrefix}-${tab.id}-tab`}
        aria-controls={`${tabPrefix}-${tab.id}-panel`}
        aria-selected={activeTab === tab.id}
        className={activeTab === tab.id ? 'active' : ''}
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
      >{tab.label}</button>)}
    </div>
    <div
      className="backtest-live-result-content"
      role="tabpanel"
      id={`${tabPrefix}-${activeTab}-panel`}
      aria-labelledby={`${tabPrefix}-${activeTab}-tab`}
    >
      {activeTab === 'performance' && <PerformancePanel performance={detail.performance} />}
      {activeTab === 'monthly' && <MonthlyPanel
        mode="judgment"
        client={client}
        runId={detail.run.backtestRunId}
        summaries={detail.monthlySummaries}
        manifests={detail.detailManifests}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
        onUnauthenticated={onUnauthenticated}
      />}
      {activeTab === 'trades' && <MonthlyPanel
        mode="trades"
        client={client}
        runId={detail.run.backtestRunId}
        summaries={detail.monthlySummaries}
        manifests={detail.detailManifests}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
        onUnauthenticated={onUnauthenticated}
      />}
      {activeTab === 'execution' && <ExecutionPanel attempts={detail.attempts} />}
    </div>
  </section>;
}

function ExecutionPanel({ attempts }: { attempts: BacktestAttempt[] }) {
  return <Panel
    className="backtest-live-attempt-panel"
    title="자동 실행 기록"
    subtitle={`공식 백테스트 워커가 처리한 실행 시도 · 총 ${attempts.length}회`}
  >
    <AttemptTable attempts={attempts} />
  </Panel>;
}

function RunState({ run }: { run: BacktestRun }) {
  if (run.status === 'QUEUED') {
    return <div className="backtest-live-wait" role="status" aria-live="polite">
      <span className="backtest-live-wait-signal" aria-hidden="true"><i /><i /><i /></span>
      <span>공식 백테스트 실행을 기다리고 있습니다.</span>
    </div>;
  }
  if (run.status === 'RUNNING') {
    return <p className="backtest-live-state-copy"><Clock3 size={16} />{run.cancellationRequestedAt
      ? '취소 요청을 전달했습니다. 워커가 다음 안전 지점에서 실행을 종료합니다.'
      : '고정된 입력으로 공식 백테스트를 실행하고 있습니다.'}</p>;
  }
  if (run.status === 'CANCELLED') {
    return <FailureNotice title="사용자가 백테스트 실행을 취소했습니다." code={run.cancellationReasonCode} />;
  }
  if (run.status === 'FAILED') {
    return <FailureNotice title="백테스트 실행이 실패했습니다." code={run.failureCode} />;
  }
  if (run.status === 'UNAVAILABLE') {
    // `runs.failure_code` is where the engine stores the UNAVAILABLE reason code.
    return <FailureNotice title="필수 입력이 없어 백테스트를 실행할 수 없습니다." code={run.failureCode} />;
  }
  return <p className="backtest-live-state-copy">검증된 공식 결과가 발행되었습니다.</p>;
}

function FailureNotice({ title, code }: { title: string; code: string | null }) {
  return <div className="backtest-live-failure">
    <strong><AlertTriangle size={16} />{title}</strong>
    {code && <code>{code}</code>}
  </div>;
}

function AttemptTable({ attempts }: { attempts: BacktestAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="backtest-live-state-copy">아직 기록된 실행 시도가 없습니다.</p>;
  }
  return <div className="table-wrap backtest-live-attempts"><table aria-label="자동 실행 시도 기록">
    <thead><tr>
      <th>시도</th><th>상태</th><th>실패 사유</th><th>시작 (ET)</th><th>종료 (ET)</th>
    </tr></thead>
    <tbody>{attempts.map((attempt) => <tr key={attempt.attemptId}>
      <td>{attempt.attemptNumber}</td>
      <td>{attempt.status}</td>
      <td>{attempt.failureCode ?? '—'}</td>
      <td>{formatTime(attempt.startedAt)}</td>
      <td>{attempt.completedAt ? formatTime(attempt.completedAt) : '—'}</td>
    </tr>)}</tbody>
  </table></div>;
}

function PerformancePanel({ performance }: { performance: BacktestPerformanceSummary | null }) {
  if (performance === null) {
    return <section className="panel backtest-live-metrics backtest-metric-panel" data-testid="backtest-live-metrics"><EmptyState
      icon={BarChart3}
      title="성과 요약이 아직 발행되지 않았습니다."
      detail="엔진이 이 실행의 성과 요약을 발행하면 여기에 표시됩니다. 임시 값은 표시하지 않습니다."
    /></section>;
  }
  const { metrics } = performance;
  return <section className="panel backtest-live-metrics backtest-metric-panel" data-testid="backtest-live-metrics">
    <PerformanceMetricGrid items={[
      {
        label: '총 수익률',
        figure: percent(metrics.totalReturnPct),
        help: '시작 자산과 비교해 종료 자산이 얼마나 늘거나 줄었는지 보여줍니다.',
      },
      {
        label: '최대 낙폭',
        figure: percent(metrics.maxDrawdownPct),
        help: '평가 기간 중 자산이 고점에서 저점까지 가장 크게 하락한 비율입니다.',
      },
      {
        label: '샤프 지수',
        figure: ratio(metrics.sharpe),
        detail: `연환산 변동성 ${percent(metrics.annualizedVolatilityPct)}`,
        help: '감수한 변동성에 비해 수익을 얼마나 효율적으로 냈는지 나타냅니다.',
      },
      {
        label: '승률',
        figure: percent(metrics.winRatePct),
        detail: `청산 ${count(metrics.closingTradeCount)}건 · 체결 ${count(metrics.fillCount)}건`,
        help: '청산까지 끝난 거래 중 수익으로 마감한 거래의 비율입니다.',
      },
      {
        label: '종료 자산',
        figure: money(metrics.endingEquity),
        detail: `현금 ${money(metrics.endingCash)}`,
        help: '평가 종료 시점의 현금과 보유 자산 평가액을 합한 금액입니다.',
      },
      {
        label: '실현 손익',
        figure: money(metrics.realizedPnl),
        tone: signTone(metrics.realizedPnl),
        help: '매도나 청산이 끝나 실제로 확정된 이익과 손실의 합계입니다.',
      },
      {
        label: '수수료',
        figure: money(metrics.totalFees),
        detail: `슬리피지 ${money(metrics.totalSlippage)}`,
        help: '백테스트 거래에 적용된 수수료의 합계이며, 예상 체결가 차이는 슬리피지로 구분합니다.',
      },
    ]} />
  </section>;
}

interface PerformanceMetricItem {
  label: string;
  figure: ReactNode;
  detail?: ReactNode;
  tone?: string;
  help: string;
}

function PerformanceMetricGrid({ items }: { items: PerformanceMetricItem[] }) {
  return <div className="metric-row" aria-label="공식 백테스트 성과">
    {items.map((item) => <div key={item.label}>
      <span className="backtest-live-metric-label">
        {item.label}
        <MetricHelp label={item.label} description={item.help} />
      </span>
      <strong className={item.tone ? item.tone : ''}>{item.figure}</strong>
      {item.detail && <small>{item.detail}</small>}
    </div>)}
  </div>;
}

function MetricHelp({ label, description }: { label: string; description: string }) {
  const tooltipId = useId();
  return <button
    type="button"
    className="backtest-live-metric-help"
    aria-label={`${label} 설명`}
    aria-describedby={tooltipId}
  >
    <CircleHelp size={14} aria-hidden="true" />
    <span id={tooltipId} className="backtest-live-metric-tooltip" role="tooltip">{description}</span>
  </button>;
}

function BacktestActivityOverview({
  run,
  summaries,
}: {
  run: BacktestRun;
  summaries: BacktestMonthlySummary[];
}) {
  const evaluationCount = summaries.reduce((total, summary) => total + summary.evaluationCount, 0);
  return <>
    <div className="backtest-live-overview-summary">
      <div className="is-primary">
        <span>평가 결과</span>
        <strong>공식 완료</strong>
        <small>검증된 공식 결과가 발행되었습니다.</small>
      </div>
      <div>
        <span>월별 집계</span>
        <strong>{summaries.length}개월</strong>
        <small>{`평가 ${evaluationCount.toLocaleString('ko-KR')}회`}</small>
      </div>
      <div className="backtest-live-activity-legend" aria-label="월별 활동 범례">
        <strong>월별 활동</strong>
        <span className="evaluation"><i />평가</span>
        <span className="trigger"><i />트리거</span>
        <span className="trade"><i />거래</span>
      </div>
    </div>
    {summaries.length > 0
      ? <BacktestActivityChart summaries={summaries} />
      : <EmptyState title="월별 활동 집계가 아직 발행되지 않았습니다." />}
  </>;
}

function BacktestActivityChart({ summaries }: { summaries: BacktestMonthlySummary[] }) {
  const width = 720;
  const height = 210;
  const left = 38;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...summaries.flatMap((summary) => [
    summary.evaluationCount,
    summary.triggeredCount,
    summary.tradeEventCount,
  ]));
  const x = (index: number) => summaries.length === 1
    ? left + plotWidth / 2
    : left + (plotWidth * index) / (summaries.length - 1);
  const y = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;
  const points = (read: (summary: BacktestMonthlySummary) => number) => summaries
    .map((summary, index) => `${x(index)},${y(read(summary))}`)
    .join(' ');

  return <svg
    className="backtest-live-activity-chart"
    role="img"
    aria-label="월별 백테스트 활동"
    viewBox={`0 0 ${width} ${height}`}
    preserveAspectRatio="none"
  >
    {[0, .25, .5, .75, 1].map((step) => {
      const lineY = top + plotHeight * step;
      return <line key={step} className="backtest-live-chart-gridline" x1={left} x2={width - right} y1={lineY} y2={lineY} />;
    })}
    <polyline className="backtest-live-chart-line evaluation" points={points((summary) => summary.evaluationCount)} />
    <polyline className="backtest-live-chart-line trigger" points={points((summary) => summary.triggeredCount)} />
    {summaries.map((summary, index) => <g key={summary.etYearMonth}>
      <rect
        className="backtest-live-chart-bar"
        x={x(index) - 7}
        y={y(summary.tradeEventCount)}
        width="14"
        height={Math.max(2, top + plotHeight - y(summary.tradeEventCount))}
        rx="2"
      />
      <circle className="backtest-live-chart-point evaluation" cx={x(index)} cy={y(summary.evaluationCount)} r="3.5" />
      <circle className="backtest-live-chart-point trigger" cx={x(index)} cy={y(summary.triggeredCount)} r="3" />
      <text className="backtest-live-chart-label" x={x(index)} y={height - 8} textAnchor="middle">
        {summary.etYearMonth.replace('-', '.')}
      </text>
    </g>)}
  </svg>;
}

function MonthlyPanel({
  mode,
  client,
  runId,
  summaries,
  manifests,
  selectedMonth,
  onSelectMonth,
  onUnauthenticated,
}: {
  mode: 'judgment' | 'trades';
  client: BacktestClient;
  runId: string;
  summaries: BacktestMonthlySummary[];
  manifests: BacktestDetailManifest[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
  onUnauthenticated: () => void;
}) {
  const active = summaries.find((item) => item.etYearMonth === selectedMonth);
  return <Panel
    className="backtest-live-monthly"
    title={mode === 'judgment' ? 'ET 월별 판단' : 'ET 월별 거래'}
    subtitle={mode === 'judgment'
      ? '미국 동부 시각 기준으로 월별 판단 흐름을 살펴봅니다.'
      : '선택한 달에 기록된 개별 주문과 체결을 확인합니다.'}
  >
    {summaries.length === 0
      ? <EmptyState
        title="월별 판단 기록이 없습니다."
        detail="월별 집계가 발행되면 여기에 표시됩니다."
      />
      : <>
        <div className="backtest-live-month-tabs" role="tablist" aria-label="ET 월 선택">
          {summaries.map((summary) => <button
            type="button"
            role="tab"
            key={summary.etYearMonth}
            className={summary.etYearMonth === selectedMonth ? 'active' : ''}
            aria-selected={summary.etYearMonth === selectedMonth}
            aria-label={`${monthLabel(summary.etYearMonth)} ET 결과 보기`}
            onClick={() => onSelectMonth(summary.etYearMonth)}
          >{monthLabel(summary.etYearMonth)}</button>)}
        </div>
        {active && mode === 'judgment' && <MonthlyJudgment summary={active} />}
        {active && mode === 'trades' && <>
          <MonthlyTrades
            key={active.etYearMonth}
            client={client}
            runId={runId}
            summary={active}
            onUnauthenticated={onUnauthenticated}
          />
          <details className="backtest-live-evidence-disclosure">
            <summary>데이터 증거 보기</summary>
            <DetailManifestTable
              etYearMonth={active.etYearMonth}
              manifests={manifests.filter((item) => weekCoversMonth(item.weekStartDate, active.etYearMonth))}
            />
          </details>
        </>}
      </>}
  </Panel>;
}

/** Why a month's individual trades could not be shown. */
type TradesFailure = FailureKind | 'mismatch';

/*
  The month's individual trades, from `GET /monthly-trades?et_month=YYYY-MM`.

  This is the endpoint the screen was missing. It used to show the month's
  `detail-manifests` here — Parquet parts on an ET Monday week boundary — and call
  them 거래 상세. A manifest row says "five records were written to part 1 of the week
  of 2026-07-27"; it never says what was bought, at what price, or why an order was
  turned down. Those rows only exist inside the objects, and `monthly-trades` is the
  only route that reads them.

  Fetched per month rather than with the rest of the detail, because the month is the
  query parameter: `et_month` is required and the server never defaults it.
*/
function MonthlyTrades({
  client,
  runId,
  summary,
  onUnauthenticated,
}: {
  client: BacktestClient;
  runId: string;
  summary: BacktestMonthlySummary;
  onUnauthenticated: () => void;
}) {
  const [trades, setTrades] = useState<BacktestTrade[] | null>(null);
  const [failure, setFailure] = useState<TradesFailure | null>(null);
  const [revision, setRevision] = useState(0);
  const etYearMonth = summary.etYearMonth;
  const { tradeRecordIds } = summary;

  useEffect(() => {
    const controller = new AbortController();
    setTrades(null);
    setFailure(null);
    client.listMonthlyTrades(runId, etYearMonth, controller.signal).then((page) => {
      /*
        The month's judgment summary names the record ids that month contains, and the
        read model already refuses to serve rows that disagree with it
        (`result_query._read_month`). Checking the same thing on arrival costs one set
        comparison and means a proxy-cached or truncated response is reported as
        untrustworthy rather than rendered as a shorter, quieter month.
      */
      if (!sameRecords(page.items, tradeRecordIds)) {
        setFailure('mismatch');
        return;
      }
      setTrades(page.items);
    }).catch((error: unknown) => {
      if (!aborted(error)) setFailure(classify(error, onUnauthenticated));
    });
    return () => controller.abort();
  }, [client, runId, etYearMonth, tradeRecordIds, revision, onUnauthenticated]);

  if (failure !== null) {
    return <TradesFailureState
      kind={failure}
      etYearMonth={etYearMonth}
      onRetry={() => setRevision((value) => value + 1)}
    />;
  }
  if (trades === null) {
    return <LoadingState label={`${monthLabel(etYearMonth)} 개별 거래를 불러오는 중입니다.`} />;
  }
  if (trades.length === 0) {
    // The true answer for a completed month that produced no records, and the reason
    // the server distinguishes it from 409: "finished and traded nothing" is a result.
    return <EmptyState
      title={`${monthLabel(etYearMonth)}에 기록된 개별 거래가 없습니다.`}
      detail="이 달의 판단 집계에도 거래 기록이 없습니다. 빈 달을 0건의 체결로 채우지 않습니다."
    />;
  }
  return <TradeTable etYearMonth={etYearMonth} trades={trades} />;
}

function TradesFailureState({
  kind,
  etYearMonth,
  onRetry,
}: {
  kind: TradesFailure;
  etYearMonth: string;
  onRetry: () => void;
}) {
  if (kind === 'mismatch') {
    return <ErrorState
      title={`${monthLabel(etYearMonth)} 거래 기록이 월별 집계와 일치하지 않습니다.`}
      detail="받은 거래 목록이 이 달의 판단 집계가 명시한 기록과 다릅니다. 일부만 표시하지 않습니다."
      onRetry={onRetry}
      retryLabel="다시 시도"
    />;
  }
  if (kind === 'forbidden' || kind === 'missing') {
    return <ErrorState
      title="이 실행의 거래 상세를 볼 수 없습니다."
      detail="이 실행의 증거는 소유 계정에만 공개됩니다. 목록을 새로고침한 뒤 다시 선택해 주세요."
    />;
  }
  if (kind === 'notReady') {
    return <ErrorState
      title={`${monthLabel(etYearMonth)} 거래 상세가 아직 발행되지 않았습니다.`}
      detail="실행이 완료되면 그 달의 거래 기록이 발행됩니다. 잠시 뒤 다시 시도해 주세요."
      onRetry={onRetry}
      retryLabel="다시 시도"
    />;
  }
  return <ErrorState
    title={`${monthLabel(etYearMonth)} 개별 거래를 불러오지 못했습니다.`}
    detail="연결 상태를 확인한 뒤 다시 시도해 주세요. 불완전한 거래 목록은 표시하지 않습니다."
    onRetry={onRetry}
    retryLabel="다시 시도"
  />;
}

const TRADE_KIND_LABELS: Record<BacktestTrade['kind'], string> = {
  ORDER: '주문',
  FILL: '체결',
  CANCELLATION: '취소',
  REJECTION: '거부',
};

/*
  One row per trade record.

  Every amount arrives as a `numeric(24,8)` string and is formatted, never re-parsed
  into a JavaScript number and back. A null stays an em dash: an ORDER or a REJECTION
  has no quantity, no price and no fee, and printing 0.00 there would invent a
  zero-cost trade that the engine never recorded.
*/
function TradeTable({ etYearMonth, trades }: { etYearMonth: string; trades: BacktestTrade[] }) {
  return <div className="table-wrap backtest-live-trade-rows">
    <table aria-label={`${monthLabel(etYearMonth)} 개별 거래`}>
      <thead><tr>
        <th>시각 (ET)</th>
        <th>종류</th>
        <th>종목</th>
        <th>주문 상태</th>
        <th>수량</th>
        <th>체결가</th>
        <th>수수료</th>
        <th>실현 손익</th>
        <th>체결 후 현금</th>
        <th>사유</th>
      </tr></thead>
      <tbody>{trades.map((trade) => <tr key={trade.recordId} data-record-id={trade.recordId}>
        <td>{formatTime(trade.occurredAt)}</td>
        <td><span className={`backtest-live-trade-kind kind-${trade.kind.toLowerCase()}`}>
          {TRADE_KIND_LABELS[trade.kind]}
        </span></td>
        <td><code>{shortId(trade.instrumentId)}</code></td>
        <td>{trade.orderStatus}</td>
        <td>{amount(trade.quantity)}</td>
        <td>{money(trade.price)}</td>
        <td>{money(trade.fee)}</td>
        <td className={signTone(trade.realizedPnl) ?? ''}>{money(trade.realizedPnl)}</td>
        <td>{money(trade.cashAfter)}</td>
        <td>{trade.reasonCode ?? '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

/** Does the answer carry exactly the records the month's summary names? */
function sameRecords(trades: BacktestTrade[], expected: string[]): boolean {
  if (trades.length !== expected.length) return false;
  const seen = new Set(trades.map((trade) => trade.recordId));
  return seen.size === trades.length && expected.every((id) => seen.has(id));
}

function MonthlyJudgment({ summary }: { summary: BacktestMonthlySummary }) {
  const counters = [
    {
      label: '평가',
      value: `${summary.evaluationCount}회`,
      tone: 'evaluation',
      description: '해당 월에 전략 조건을 확인한 총 평가 횟수입니다.',
    },
    {
      label: '활성 분기',
      value: `${summary.activeBranchCount}개`,
      tone: 'branch',
      description: '해당 월의 평가에 실제로 참여한 서로 다른 전략 흐름의 수입니다.',
    },
    {
      label: '트리거',
      value: `${summary.triggeredCount}회`,
      tone: 'trigger',
      description: '전략 조건이 충족되어 거래 판단이 시작된 횟수입니다.',
    },
    {
      label: '거래 이벤트',
      value: `${summary.tradeEventCount}건`,
      tone: 'trade',
      description: '전략 실행 과정에서 생성된 거래 관련 이벤트의 수입니다.',
    },
    {
      label: '데이터 공백',
      value: `${summary.dataGapCount}회`,
      tone: 'gap',
      description: '평가에 필요한 시장 데이터가 없거나 충분하지 않았던 횟수입니다.',
    },
    {
      label: '거부',
      value: `${summary.rejectedCount}건`,
      tone: 'rejected',
      description: '거래 판단이나 주문이 검증 또는 실행 단계에서 거부로 집계된 건수입니다.',
    },
  ];
  return <section
    className="backtest-live-judgments"
    aria-label={`${monthLabel(summary.etYearMonth)} ET 월별 판단`}
  >
    <header className="backtest-live-monthly-summary-head">
      <div>
        <small>MONTHLY DECISION</small>
        <strong>{monthLabel(summary.etYearMonth)}</strong>
      </div>
      <div className="backtest-live-monthly-context">
        <span>{`거래 기록 ${summary.tradeRecordIds.length}건`}</span>
      </div>
    </header>
    <div className="backtest-live-monthly-kpis">
      {counters.map((counter) => <article
        className={counter.tone}
      key={counter.label}
      aria-label={`${counter.label} ${counter.value}`}
    >
      <div className="backtest-live-monthly-kpi-label">
        <span>{counter.label}</span>
        <MetricHelp label={counter.label} description={counter.description} />
      </div>
      <strong>{counter.value}</strong>
    </article>)}
    </div>
    <section className="backtest-live-failure-summary" aria-label="첫 실패 조건">
      <header>
        <div>
          <small>판단 흐름</small>
          <span className="backtest-live-failure-title">
            <strong>첫 실패 조건</strong>
            <MetricHelp
              label="첫 실패 조건"
              description="월별 전략 평가가 다음 단계로 진행되지 못했을 때, 가장 먼저 충족되지 않은 조건과 그 횟수를 보여줍니다. 시스템 오류를 뜻하지 않습니다."
            />
          </span>
        </div>
        <span>{`${summary.firstFailureCounts.length}개 조건`}</span>
      </header>
      {summary.firstFailureCounts.length === 0
        ? <p>집계된 첫 실패 조건이 없습니다.</p>
        : <ul>{summary.firstFailureCounts.map((failure) => <li
          key={`${failure.mode}:${failure.flowOrBranchKey}:${failure.firstFailureConditionKey}`}
        >
          <span>{conditionLabel(failure.firstFailureConditionKey)}</span>
          <strong>{`${failure.occurrenceCount}회`}</strong>
        </li>)}</ul>}
    </section>
  </section>;
}

function conditionLabel(value: string): string {
  const publicPart = value.replace(/^.*\|step-\d+:/i, '');
  return publicPart.replace(/[_-]+/g, ' ').trim().toUpperCase();
}

/*
  The evidence *objects* behind the rows above, kept because provenance is part of the
  answer: these are the Parquet parts the trade records were read out of.

  Detail evidence is published on an ET Monday week boundary, so a month is a join and
  not a partition: the week that starts 2026-07-27 carries both July and August rows
  and therefore appears under both months.
*/
function DetailManifestTable({
  etYearMonth,
  manifests,
}: {
  etYearMonth: string;
  manifests: BacktestDetailManifest[];
}) {
  if (manifests.length === 0) {
    return <EmptyState title="이 달에 걸친 거래 상세 증거가 없습니다." />;
  }
  return <div className="table-wrap backtest-live-trades">
    <table aria-label={`${monthLabel(etYearMonth)} 거래 상세 증거`}>
      <thead><tr>
        <th>레코드 종류</th><th>ET 주 시작</th><th>파트</th><th>행 수</th><th>스키마</th><th>내용 해시</th>
      </tr></thead>
      <tbody>{manifests.map((manifest) => <tr key={manifest.manifestId}>
        <td>{manifest.recordType}</td>
        <td>{manifest.weekStartDate}</td>
        <td>{manifest.partNumber}</td>
        <td>{manifest.rowCount}</td>
        <td>{manifest.schemaVersion}</td>
        <td><code>{hashLabel(manifest.detailHash)}</code></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

/** Mirrors `result_query._week_overlaps_month`: an ET Monday week touches two months. */
function weekCoversMonth(weekStartDate: string, etYearMonth: string): boolean {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return monthKey(start) === etYearMonth || monthKey(end) === etYearMonth;
}

function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Turn a rejection into the one thing the screen should say about it.
 *
 * `onUnauthenticated` is the side effect a 401 has to have: the stored credential is
 * dropped, which flips the whole screen to the signed-out gate. Without it a dead
 * token would keep being sent on every retry and every month tab.
 */
function classify(error: unknown, onUnauthenticated: () => void): FailureKind {
  if (error instanceof BacktestApiError) {
    if (error.unauthenticated) {
      onUnauthenticated();
      return 'unauthenticated';
    }
    if (error.forbidden) return 'forbidden';
    if (error.resultNotReady) return 'notReady';
    if (error.notFound) return 'missing';
  }
  return 'transport';
}

/** A run can complete before its summary lands; that is a 404, not a broken screen. */
function pendingSummary(error: unknown): null {
  if (error instanceof BacktestApiError && error.notFound) return null;
  throw error;
}

function aborted(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { name?: unknown }).name === 'AbortError';
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function hashLabel(value: string): string {
  return value.replace(/^sha256:/, '').slice(0, 12);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function money(value: string | null): string {
  if (value === null) return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : value;
}

/** A quantity, not a price: no currency symbol, and trailing zeroes trimmed. */
function amount(value: string | null): string {
  if (value === null) return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { maximumFractionDigits: 8 })
    : value;
}

function percent(value: number | null): string {
  return value === null
    ? '—'
    : `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function ratio(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function count(value: number | null): string {
  return value === null ? '—' : String(value);
}

function signTone(value: string | null): string | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? 'positive' : 'negative';
}
