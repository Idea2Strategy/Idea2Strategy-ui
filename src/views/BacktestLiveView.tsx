import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Clock3, RefreshCw } from 'lucide-react';
import type {
  BacktestClient,
  BacktestMonthlyJudgment,
  BacktestOverview,
  BacktestPerformance,
  BacktestRunSummary,
  BacktestStatus,
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
import type { StatusTone } from '../components/common';
import { Localized } from '../lib/i18n';

interface BacktestLiveViewProps {
  client: BacktestClient;
}

interface DetailState {
  overview: BacktestOverview;
  performance: BacktestPerformance | null;
  judgments: BacktestMonthlyJudgment[];
  selectedMonth: string | null;
  trades: BacktestTrade[];
}

const STATUS_LABELS: Record<BacktestStatus, string> = {
  QUEUED: '대기 중',
  RUNNING: '실행 중',
  COMPLETE: '완료',
  FAILED: '실패',
  UNAVAILABLE: '실행 불가',
};

const STATUS_TONES: Record<BacktestStatus, StatusTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETE: 'positive',
  FAILED: 'negative',
  UNAVAILABLE: 'warning',
};

export function BacktestLiveView({ client }: BacktestLiveViewProps) {
  const [runs, setRuns] = useState<BacktestRunSummary[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [listError, setListError] = useState(false);
  const [listRevision, setListRevision] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRuns(null);
    setListError(false);
    client.listRuns(controller.signal).then((nextRuns) => {
      setRuns(nextRuns);
      setSelectedRunId((current) => (
        current && nextRuns.some((run) => run.runId === current)
          ? current
          : nextRuns[0]?.runId ?? null
      ));
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setListError(true);
      }
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
    setDetailLoading(true);
    setDetailError(false);

    const load = async () => {
      const overview = await client.getOverview(selectedRunId, controller.signal);
      if (overview.status !== 'COMPLETE') {
        setDetail({ overview, performance: null, judgments: [], selectedMonth: null, trades: [] });
        return;
      }
      const [performance, judgments] = await Promise.all([
        client.getPerformance(selectedRunId, controller.signal),
        client.listMonthlyJudgments(selectedRunId, controller.signal),
      ]);
      const selectedMonth = judgments.at(-1)?.etMonth ?? null;
      const trades = selectedMonth
        ? await client.listMonthlyTrades(selectedRunId, selectedMonth, controller.signal)
        : [];
      setDetail({ overview, performance, judgments, selectedMonth, trades });
    };

    void load().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setDetailError(true);
      }
    }).finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [client, selectedRunId]);

  const selectMonth = async (month: string) => {
    if (!selectedRunId || !detail || month === detail.selectedMonth) return;
    setDetailLoading(true);
    setDetailError(false);
    try {
      const trades = await client.listMonthlyTrades(selectedRunId, month);
      setDetail({ ...detail, selectedMonth: month, trades });
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  };

  return <Localized><div className="page backtest-page backtest-live-page">
    <PageHeading
      eyebrow="OFFICIAL BACKTEST"
      title="봇 백테스트"
      description="출시된 전략 버전의 자동 백테스트 상태와 검증된 결과를 확인합니다."
      actions={<Button icon={RefreshCw} onClick={() => setListRevision((value) => value + 1)}>새로고침</Button>}
    />
    {listError && <ErrorState
      title="백테스트 결과를 불러오지 못했습니다."
      detail="연결 상태를 확인한 뒤 다시 시도해 주세요. 기존 결과를 정상으로 간주하지 않습니다."
      onRetry={() => setListRevision((value) => value + 1)}
      retryLabel="다시 시도"
    />}
    {!listError && runs === null && <LoadingState label="백테스트 결과를 불러오는 중입니다." />}
    {!listError && runs?.length === 0 && <EmptyState
      icon={BarChart3}
      title="아직 실행된 공식 백테스트가 없습니다."
      detail="전략 버전이 출시되면 공식 백테스트가 자동으로 시작됩니다."
    />}
    {!listError && runs && runs.length > 0 && <div className="backtest-live-workspace">
      <RunList runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
      <section className="backtest-live-detail" aria-label="선택한 백테스트 결과">
        {detailLoading && detail === null && <LoadingState label="선택한 백테스트를 불러오는 중입니다." />}
        {detailError && <ErrorState
          title="선택한 백테스트 상세를 불러오지 못했습니다."
          detail="불완전한 결과는 표시하지 않습니다. 다른 실행을 선택하거나 새로고침해 주세요."
        />}
        {detail && <RunDetail
          detail={detail}
          detailLoading={detailLoading}
          onSelectMonth={(month) => void selectMonth(month)}
        />}
      </section>
    </div>}
  </div></Localized>;
}

function RunList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: BacktestRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return <aside className="panel backtest-live-list" aria-labelledby="backtest-live-list-title">
    <header className="backtest-live-list-head">
      <div><span>OFFICIAL RUNS</span><h2 id="backtest-live-list-title">실행 기록</h2></div>
      <small>{runs.length}건</small>
    </header>
    <div role="list" aria-label="공식 백테스트 실행 목록">
      {runs.map((run) => <div role="listitem" key={run.runId}><button
        type="button"
        className={run.runId === selectedRunId ? 'active' : ''}
        aria-label={`${shortId(run.strategyVersionId)} ${STATUS_LABELS[run.status]} 백테스트 보기`}
        onClick={() => onSelect(run.runId)}
      >
        <span><strong>{shortId(run.strategyVersionId)}</strong><small>{formatTime(run.requestedAt)}</small></span>
        <Status tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Status>
      </button></div>)}
    </div>
  </aside>;
}

function RunDetail({
  detail,
  detailLoading,
  onSelectMonth,
}: {
  detail: DetailState;
  detailLoading: boolean;
  onSelectMonth: (month: string) => void;
}) {
  const { overview } = detail;
  return <>
    <Panel
      className="backtest-live-status-panel"
      title={`전략 버전 ${shortId(overview.strategyVersionId)}`}
      subtitle={`요청 ${formatTime(overview.requestedAt)}`}
      action={<Status tone={STATUS_TONES[overview.status]}>{STATUS_LABELS[overview.status]}</Status>}
    >
      <RunState overview={overview} />
    </Panel>
    {overview.status === 'COMPLETE' && detail.performance && <CompleteResult
      detail={detail}
      detailLoading={detailLoading}
      onSelectMonth={onSelectMonth}
    />}
  </>;
}

function RunState({ overview }: { overview: BacktestOverview }) {
  if (overview.status === 'QUEUED') {
    return <p className="backtest-live-state-copy"><Clock3 size={16} />공식 백테스트 실행을 기다리고 있습니다.</p>;
  }
  if (overview.status === 'RUNNING') {
    return <p className="backtest-live-state-copy"><Clock3 size={16} />고정된 입력으로 공식 백테스트를 실행하고 있습니다.</p>;
  }
  if (overview.status === 'FAILED') {
    return <FailureNotice title="백테스트 실행이 실패했습니다." overview={overview} />;
  }
  if (overview.status === 'UNAVAILABLE') {
    return <FailureNotice title="필수 입력이 없어 백테스트를 실행할 수 없습니다." overview={overview} />;
  }
  return <p className="backtest-live-state-copy">검증된 공식 결과가 발행되었습니다.</p>;
}

function FailureNotice({ title, overview }: { title: string; overview: BacktestOverview }) {
  return <div className="backtest-live-failure">
    <strong><AlertTriangle size={16} />{title}</strong>
    {overview.reasonCode && <code>{overview.reasonCode}</code>}
    {overview.missingRequirements.length > 0 && <ul>
      {overview.missingRequirements.map((item) => <li key={item}>{item}</li>)}
    </ul>}
  </div>;
}

function CompleteResult({
  detail,
  detailLoading,
  onSelectMonth,
}: {
  detail: DetailState;
  detailLoading: boolean;
  onSelectMonth: (month: string) => void;
}) {
  const performance = detail.performance!;
  const activeJudgment = detail.judgments.find((item) => item.etMonth === detail.selectedMonth);
  return <>
    <section className="panel backtest-live-metrics">
      <MetricRow label="공식 백테스트 성과" items={[
        { label: '종료 현금', figure: money(performance.endingCash) },
        { label: '실현 손익', figure: money(performance.realizedPnl), tone: Number(performance.realizedPnl) >= 0 ? 'positive' : 'negative' },
        { label: '체결', figure: `${performance.fillCount}건`, detail: `주문 ${performance.orderCount}건` },
        { label: '수수료', figure: money(performance.totalFees), detail: `슬리피지 ${money(performance.totalSlippage)}` },
      ]} />
    </section>
    <Panel className="backtest-live-monthly" title="ET 월별 판단" subtitle="미국 동부 시각 기준 월별 첫 실패 조건과 거래 기록">
      {detail.judgments.length === 0
        ? <EmptyState title="월별 판단 기록이 없습니다." detail="거래와 첫 실패 조건이 기록되면 여기에 표시됩니다." />
        : <>
          <div className="backtest-live-month-tabs" role="tablist" aria-label="ET 월 선택">
            {detail.judgments.map((judgment) => <button
              type="button"
              role="tab"
              key={judgment.etMonth}
              className={judgment.etMonth === detail.selectedMonth ? 'active' : ''}
              aria-selected={judgment.etMonth === detail.selectedMonth}
              aria-label={`${monthLabel(judgment.etMonth)} ET 결과 보기`}
              onClick={() => onSelectMonth(judgment.etMonth)}
            >{monthLabel(judgment.etMonth)}</button>)}
          </div>
          {activeJudgment && <MonthlyJudgmentSummary judgment={activeJudgment} />}
          {detailLoading
            ? <LoadingState label="월별 거래 상세를 불러오는 중입니다." />
            : <TradeTable trades={detail.trades} />}
        </>}
    </Panel>
  </>;
}

function MonthlyJudgmentSummary({ judgment }: { judgment: BacktestMonthlyJudgment }) {
  return <section className="backtest-live-judgments" aria-label={`${monthLabel(judgment.etMonth)} 첫 실패 조건`}>
    <header><strong>{monthLabel(judgment.etMonth)} (ET)</strong><span>거래 기록 {judgment.tradeRecordIds.length}건</span></header>
    {judgment.failureCounts.length === 0
      ? <p>집계된 첫 실패 조건이 없습니다.</p>
      : <ul>{judgment.failureCounts.map((failure) => <li key={`${failure.mode}:${failure.scopeId}:${failure.conditionId}`}>
        <span><b>{failure.conditionId}</b><small>{failure.mode} · {failure.scopeId}</small></span>
        <strong>{failure.count}회</strong>
      </li>)}</ul>}
  </section>;
}

function TradeTable({ trades }: { trades: BacktestTrade[] }) {
  if (trades.length === 0) {
    return <EmptyState title="이 달의 거래 상세가 없습니다." />;
  }
  return <div className="table-wrap backtest-live-trades"><table>
    <thead><tr><th>시각 (ET)</th><th>상태</th><th>종목 ID</th><th>수량</th><th>가격</th><th>수수료</th><th>실현 손익</th></tr></thead>
    <tbody>{trades.map((trade) => <tr key={trade.recordId}>
      <td>{formatTime(trade.occurredAt)}</td>
      <td>{trade.orderStatus}</td>
      <td><code>{shortId(trade.instrumentId)}</code></td>
      <td>{trade.quantity ?? '—'}</td>
      <td>{trade.price ? money(trade.price) : '—'}</td>
      <td>{trade.fee ? money(trade.fee) : '—'}</td>
      <td>{trade.realizedPnl ? money(trade.realizedPnl) : '—'}</td>
    </tr>)}</tbody>
  </table></div>;
}

function shortId(value: string): string {
  return value.slice(0, 8);
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

function money(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : value;
}
