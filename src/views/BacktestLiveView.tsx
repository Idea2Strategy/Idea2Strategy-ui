import { useEffect, useState } from 'react';
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
import type { StatusTone } from '../components/common';
import { Localized } from '../lib/i18n';

interface BacktestLiveViewProps {
  client: BacktestClient;
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
 * Why the screen has no data. Kept apart because the three cases need different
 * words and different next steps: a 401/403 is not something a retry button fixes.
 */
type FailureKind = 'permission' | 'missing' | 'transport';

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

export function BacktestLiveView({ client }: BacktestLiveViewProps) {
  const [runs, setRuns] = useState<BacktestRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [listFailure, setListFailure] = useState<FailureKind | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailFailure, setDetailFailure] = useState<FailureKind | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
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
      if (!aborted(error)) setListFailure(classify(error));
    });
    return () => controller.abort();
  }, [client, listRevision]);

  useEffect(() => {
    if (!selectedRunId) {
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
        // perfectly normal queued run into a 404 the screen would have to explain away.
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
      if (!aborted(error)) setDetailFailure(classify(error));
    });
    return () => controller.abort();
  }, [client, selectedRunId]);

  const retry = () => setListRevision((value) => value + 1);

  return <Localized><div className="page backtest-page backtest-live-page">
    <PageHeading
      eyebrow="OFFICIAL BACKTEST"
      title="봇 백테스트"
      description="출시된 봇의 자동 백테스트 상태와 검증된 결과를 확인합니다."
      actions={<Button icon={RefreshCw} onClick={retry}>새로고침</Button>}
    />
    {listFailure === 'permission' && <PermissionState
      title="백테스트 결과를 볼 권한이 없습니다."
      detail="로그인 상태와 계정 권한을 확인해 주세요. 다른 계정의 실행 결과는 표시하지 않습니다."
    />}
    {listFailure !== null && listFailure !== 'permission' && <ErrorState
      title="백테스트 결과를 불러오지 못했습니다."
      detail="연결 상태를 확인한 뒤 다시 시도해 주세요. 기존 결과를 정상으로 간주하지 않습니다."
      onRetry={retry}
      retryLabel="다시 시도"
    />}
    {listFailure === null && runs === null && <LoadingState label="백테스트 결과를 불러오는 중입니다." />}
    {listFailure === null && runs?.length === 0 && <EmptyState
      icon={BarChart3}
      title="아직 실행된 공식 백테스트가 없습니다."
      detail="봇이 출시되면 공식 백테스트가 자동으로 시작됩니다."
    />}
    {listFailure === null && runs && runs.length > 0 && <div className="backtest-live-workspace">
      <RunList runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
      <section className="backtest-live-detail" aria-label="선택한 백테스트 결과">
        {detailFailure === null && detail === null
          && <LoadingState label="선택한 백테스트를 불러오는 중입니다." />}
        {detailFailure !== null && <DetailFailure kind={detailFailure} />}
        {detail && <RunDetailPanels
          detail={detail}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
        />}
      </section>
    </div>}
  </div></Localized>;
}

function PermissionState({ title, detail }: { title: string; detail: string }) {
  return <ErrorState title={title} detail={detail} />;
}

function DetailFailure({ kind }: { kind: FailureKind }) {
  if (kind === 'permission') {
    return <PermissionState
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
  detail,
  selectedMonth,
  onSelectMonth,
}: {
  detail: RunDetail;
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
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
        summaries={detail.monthlySummaries}
        manifests={detail.detailManifests}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
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
  summaries,
  manifests,
  selectedMonth,
  onSelectMonth,
}: {
  summaries: BacktestMonthlySummary[];
  manifests: BacktestDetailManifest[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  const active = summaries.find((item) => item.etYearMonth === selectedMonth);
  return <Panel
    className="backtest-live-monthly"
    title="ET 월별 판단"
    subtitle="미국 동부 시각 기준 월별 판단 집계와, 그 달에 걸친 거래 상세 증거 파티션"
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
          <DetailManifestTable
            etYearMonth={active.etYearMonth}
            manifests={manifests.filter((item) => weekCoversMonth(item.weekStartDate, active.etYearMonth))}
          />
        </>}
      </>}
  </Panel>;
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
  Detail evidence is published as Parquet parts on an ET Monday week boundary, so a
  month is a join and not a partition: the week that starts 2026-07-27 carries both
  July and August rows and therefore appears under both months.
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

function classify(error: unknown): FailureKind {
  if (error instanceof BacktestApiError) {
    if (error.unauthorized) return 'permission';
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
