import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Clock3, RefreshCw } from 'lucide-react';
import { BacktestApiError } from '../api/backtests';
import type {
  BacktestAttempt,
  BacktestClient,
  BacktestDetailManifest,
  BacktestMonthlySummary,
  BacktestPerformanceSummary,
  BacktestRun,
  BacktestRunStatus,
  BacktestTrade,
} from '../api/backtests';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricRow,
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
}

interface RunDetail {
  run: BacktestRun;
  attempts: BacktestAttempt[];
  /** `null` when the engine has not published a summary for this run yet (404). */
  performance: BacktestPerformanceSummary | null;
  monthlySummaries: BacktestMonthlySummary[];
  detailManifests: BacktestDetailManifest[];
}

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

const STATUS_LABELS: Record<BacktestRunStatus, string> = {
  QUEUED: '대기 중',
  RUNNING: '실행 중',
  COMPLETED: '완료',
  FAILED: '실패',
  UNAVAILABLE: '실행 불가',
};

const STATUS_TONES: Record<BacktestRunStatus, StatusTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'positive',
  FAILED: 'negative',
  UNAVAILABLE: 'warning',
};

export function BacktestLiveView({ client, session = browserSessionStore }: BacktestLiveViewProps) {
  const sessionState = useSessionState(session);
  const signedIn = sessionState.status === 'authenticated';
  const [runs, setRuns] = useState<BacktestRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [listFailure, setListFailure] = useState<FailureKind | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailFailure, setDetailFailure] = useState<FailureKind | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

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
    client.listRuns({}, controller.signal).then((page) => {
      setRuns(page.items);
      setSelectedRunId((current) => (
        current && page.items.some((run) => run.backtestRunId === current)
          ? current
          : page.items[0]?.backtestRunId ?? null
      ));
    }).catch((error: unknown) => {
      if (!aborted(error)) setListFailure(classify(error, abandonSession));
    });
    return () => controller.abort();
  }, [client, listRevision, signedIn, abandonSession]);

  useEffect(() => {
    if (!selectedRunId || !signedIn) {
      setDetail(null);
      return undefined;
    }
    const controller = new AbortController();
    setDetail(null);
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
  }, [client, selectedRunId, signedIn, abandonSession]);

  const retry = () => setListRevision((value) => value + 1);

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
      eyebrow="OFFICIAL BACKTEST"
      title="봇 백테스트"
      description="출시된 봇의 자동 백테스트 상태와 검증된 결과를 확인합니다."
      actions={<Button icon={RefreshCw} onClick={retry}>새로고침</Button>}
    />
    {signedIn && <>
      {listFailure === null && runs === null && <LoadingState label="백테스트 결과를 불러오는 중입니다." />}
      {listFailure === null && runs?.length === 0 && <EmptyState
        icon={BarChart3}
        title="백테스트할 봇이 없습니다."
        detail="출시된 봇이 생기면 공식 백테스트가 자동으로 시작되고 이곳에 결과가 표시됩니다."
      />}
      {listFailure === null && runs && runs.length > 0 && <div className="backtest-live-workspace">
        <RunList runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
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
          />}
        </section>
      </div>}
    </>}
  </div></Localized>;
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
}: {
  runs: BacktestRun[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return <aside className="panel backtest-live-list" aria-labelledby="backtest-live-list-title">
    <header className="backtest-live-list-head">
      <div><span>OFFICIAL RUNS</span><h2 id="backtest-live-list-title">실행 기록</h2></div>
      <small>{runs.length}건</small>
    </header>
    <div role="list" aria-label="공식 백테스트 실행 목록">
      {runs.map((run) => <div role="listitem" key={run.backtestRunId}><button
        type="button"
        className={run.backtestRunId === selectedRunId ? 'active' : ''}
        aria-label={`${shortId(run.botId)} ${STATUS_LABELS[run.status]} 백테스트 보기`}
        onClick={() => onSelect(run.backtestRunId)}
      >
        <span><strong>{shortId(run.botId)}</strong><small>{formatTime(run.queuedAt)}</small></span>
        <Status tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Status>
      </button></div>)}
    </div>
  </aside>;
}

function RunDetailPanels({
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
  const { run } = detail;
  return <>
    <Panel
      className="backtest-live-status-panel"
      title={`봇 ${shortId(run.botId)}`}
      subtitle={`요청 ${formatTime(run.queuedAt)} · 평가 ${run.evaluationStart} ~ ${run.evaluationEnd}`}
      action={<Status tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Status>}
    >
      <RunState run={run} />
      <AttemptTable attempts={detail.attempts} />
    </Panel>
    {run.status === 'COMPLETED' && <>
      <PerformancePanel performance={detail.performance} />
      <MonthlyPanel
        client={client}
        runId={run.backtestRunId}
        summaries={detail.monthlySummaries}
        manifests={detail.detailManifests}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
        onUnauthenticated={onUnauthenticated}
      />
    </>}
  </>;
}

function RunState({ run }: { run: BacktestRun }) {
  if (run.status === 'QUEUED') {
    return <p className="backtest-live-state-copy"><Clock3 size={16} />공식 백테스트 실행을 기다리고 있습니다.</p>;
  }
  if (run.status === 'RUNNING') {
    return <p className="backtest-live-state-copy"><Clock3 size={16} />고정된 입력으로 공식 백테스트를 실행하고 있습니다.</p>;
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
      <th>시도</th><th>상태</th><th>시작 (ET)</th><th>종료 (ET)</th><th>실행 키</th><th>실패 코드</th>
    </tr></thead>
    <tbody>{attempts.map((attempt) => <tr key={attempt.attemptId}>
      <td>{attempt.attemptNumber}</td>
      <td>{attempt.status}</td>
      <td>{formatTime(attempt.startedAt)}</td>
      <td>{attempt.completedAt ? formatTime(attempt.completedAt) : '—'}</td>
      <td><code>{attempt.workerExecutionKey}</code></td>
      <td>{attempt.failureCode ?? '—'}</td>
    </tr>)}</tbody>
  </table></div>;
}

function PerformancePanel({ performance }: { performance: BacktestPerformanceSummary | null }) {
  if (performance === null) {
    return <section className="panel backtest-live-metrics"><EmptyState
      icon={BarChart3}
      title="성과 요약이 아직 발행되지 않았습니다."
      detail="엔진이 이 실행의 성과 요약을 발행하면 여기에 표시됩니다. 임시 값은 표시하지 않습니다."
    /></section>;
  }
  const { metrics } = performance;
  return <section className="panel backtest-live-metrics">
    <MetricRow label="공식 백테스트 성과" items={[
      { label: '총 수익률', figure: percent(metrics.totalReturnPct) },
      { label: '최대 낙폭', figure: percent(metrics.maxDrawdownPct) },
      { label: '샤프 지수', figure: ratio(metrics.sharpe), detail: `연환산 변동성 ${percent(metrics.annualizedVolatilityPct)}` },
      { label: '승률', figure: percent(metrics.winRatePct), detail: `청산 ${count(metrics.closingTradeCount)}건 · 체결 ${count(metrics.fillCount)}건` },
      { label: '종료 자산', figure: money(metrics.endingEquity), detail: `현금 ${money(metrics.endingCash)}` },
      {
        label: '실현 손익',
        figure: money(metrics.realizedPnl),
        tone: signTone(metrics.realizedPnl),
      },
      { label: '수수료', figure: money(metrics.totalFees), detail: `슬리피지 ${money(metrics.totalSlippage)}` },
    ]} />
    <p className="backtest-live-provenance">
      지표 카탈로그 <code>{performance.metricCatalogVersion}</code>
      {' · '}계산 규칙 <code>{performance.calculationRulesVersion}</code>
      {' · '}평가 기준 <code>{metrics.valuationBasis}</code>
      {' · '}결과 해시 <code>{hashLabel(performance.resultHash)}</code>
    </p>
  </section>;
}

function MonthlyPanel({
  client,
  runId,
  summaries,
  manifests,
  selectedMonth,
  onSelectMonth,
  onUnauthenticated,
}: {
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
    title="ET 월별 판단"
    subtitle="미국 동부 시각 기준 월별 판단 집계와, 그 달에 기록된 개별 거래"
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
        {active && <>
          <MonthlyJudgment summary={active} />
          <MonthlyTrades
            key={active.etYearMonth}
            client={client}
            runId={runId}
            summary={active}
            onUnauthenticated={onUnauthenticated}
          />
          <DetailManifestTable
            etYearMonth={active.etYearMonth}
            manifests={manifests.filter((item) => weekCoversMonth(item.weekStartDate, active.etYearMonth))}
          />
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
  return <section
    className="backtest-live-judgments"
    aria-label={`${monthLabel(summary.etYearMonth)} ET 월별 판단`}
  >
    <header>
      <strong>{`${monthLabel(summary.etYearMonth)} (${summary.timezoneId})`}</strong>
      <span>{`거래 기록 ${summary.tradeRecordIds.length}건`}</span>
    </header>
    <ul className="backtest-live-counters">
      <li>{`평가 ${summary.evaluationCount}회`}</li>
      <li>{`활성 분기 ${summary.activeBranchCount}개`}</li>
      <li>{`거래 이벤트 ${summary.tradeEventCount}건`}</li>
      <li>{`데이터 공백 ${summary.dataGapCount}회`}</li>
      <li>{`트리거 ${summary.triggeredCount}회`}</li>
      <li>{`거부 ${summary.rejectedCount}건`}</li>
    </ul>
    {summary.firstFailureCounts.length === 0
      ? <p>집계된 첫 실패 조건이 없습니다.</p>
      : <ul>{summary.firstFailureCounts.map((failure) => <li
        key={`${failure.mode}:${failure.flowOrBranchKey}:${failure.firstFailureConditionKey}`}
      >
        <span>
          <b>{failure.firstFailureConditionKey}</b>
          <small>{`${failure.mode} · ${failure.flowOrBranchKey}`}</small>
        </span>
        <strong>{`${failure.occurrenceCount}회`}</strong>
      </li>)}</ul>}
  </section>;
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
