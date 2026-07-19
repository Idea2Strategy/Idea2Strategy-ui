import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  Bot as BotIcon,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  CirclePause,
  CircleX,
  Clock3,
  Coins,
  Database,
  DollarSign,
  Edit3,
  FileCheck2,
  Gauge,
  History,
  ListChecks,
  PackageOpen,
  Pause,
  Play,
  Plus,
  Radio,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingUp,
  UserRound,
  Wifi,
  WifiOff,
  XOctagon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  completedMetrics,
  createBacktestRun,
  deleteBacktestRuns,
  formatBacktestTime,
  loadBacktestRuns,
  saveBacktestRuns,
  type BacktestConfig,
  type BacktestRun,
  type BacktestStatus,
} from '../backtestStorage';
import {
  loadBots,
  loadBotViewState,
  saveBots,
  saveBotViewState,
} from '../botStorage';
import {
  formatOperationMoney,
  getBotActivityRecords,
  getBotOperationSnapshot,
  orderStatusLabel,
  type ActivityActor,
  type ActivityCategory,
  type BotOrder,
} from '../botOperations';
import { stateLabel } from '../data';
import { Modal, PageTitle } from '../components/Overlays';
import {
  createStrategyVersion,
  loadBasicEditorSnapshot,
  loadStrategyVersions,
  loadStrategyWorkspace,
  proEditorStorageKey,
  type StrategyMeta,
  type StrategyVersion,
} from '../strategyStorage';
import type { Bot, BotState, BotTab } from '../types';

type BotFilter = 'all' | Extract<BotState, 'running' | 'paused' | 'stopped' | 'attention' | 'ended'>;

export function BotsPage({ createRequest = 0 }: { createRequest?: number }) {
  const [bots, setBots] = useState(loadBots);
  const [initialView] = useState(() => loadBotViewState(bots));
  const [selectedId, setSelectedId] = useState(initialView.selectedId);
  const [activeTab, setActiveTab] = useState<BotTab>(initialView.activeTab);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<'pause' | 'stop' | 'resume' | 'end' | 'delete' | null>(null);
  const [filter, setFilter] = useState<BotFilter>('all');
  const [showIssueDetail, setShowIssueDetail] = useState(false);
  const [showBotCreator, setShowBotCreator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const filtered = bots.filter((bot) => (
    (filter === 'all' || bot.state === filter)
    && `${bot.name} ${bot.strategy} ${bot.symbols.join(' ')}`.toLowerCase().includes(query.toLowerCase())
  ));
  const selected = filtered.find((bot) => bot.id === selectedId)
    ?? filtered[0]
    ?? (filter === 'all' && !query ? bots[0] : undefined);
  const operationalSummary = useMemo(() => {
    const snapshots = bots.map(getBotOperationSnapshot);
    return {
      decisions: snapshots.reduce((total, snapshot) => total + snapshot.decisions.length, 0),
      openOrders: snapshots.reduce((total, snapshot) => total + snapshot.orders.filter(
        (order) => order.status === 'submitted' || order.status === 'partial',
      ).length, 0),
    };
  }, [bots]);

  useEffect(() => {
    if (createRequest > 0) setShowBotCreator(true);
  }, [createRequest]);

  useEffect(() => {
    saveBots(bots);
  }, [bots]);

  useEffect(() => {
    saveBotViewState(selectedId, activeTab);
  }, [activeTab, selectedId]);

  const updateBot = (patch: Partial<Bot>, activity: string) => {
    if (!selected) return;
    setBots((current) => current.map((bot) => (
      bot.id === selected.id
        ? { ...bot, ...patch, activity: [activity, ...bot.activity] }
        : bot
    )));
    setAction(null);
  };

  const createBot = (bot: Bot) => {
    setBots((current) => [bot, ...current]);
    setSelectedId(bot.id);
    setFilter('all');
    setActiveTab('backtest');
    setShowBotCreator(false);
  };

  const deleteBot = () => {
    if (!selected) return;
    const nextBots = bots.filter((bot) => bot.id !== selected.id);
    setBots(nextBots);
    deleteBacktestRuns(selected.id);
    setSelectedId(nextBots[0]?.id ?? 0);
    setFilter('all');
    setQuery('');
    setActiveTab('overview');
    setAction(null);
  };

  return (
    <div className="page bots-page">
      <div className="bot-page-head">
        <div className="bot-page-title-row">
          <PageTitle
            eyebrow="LIVE PAPER OPERATIONS"
            title="봇 관리"
            description="문제와 주문 상태를 성과보다 먼저 확인합니다."
          />
          <button className="button button--primary" onClick={() => setShowBotCreator(true)}>
            <Plus size={15} /> 새 봇 만들기
          </button>
        </div>
        <div className="bot-summary-metrics">
          <article><BotIcon size={18} /><div><span>전체 봇</span><strong>{bots.length}</strong></div><small>{bots.filter((bot) => bot.state === 'running').length}개 실행</small></article>
          <article><Activity size={18} /><div><span>최근 판단</span><strong>{operationalSummary.decisions}</strong></div><small>조건별 근거 포함</small></article>
          <article><ListChecks size={18} /><div><span>미체결 주문</span><strong>{operationalSummary.openOrders}</strong></div><small>부분 체결 포함</small></article>
          <article className={bots.some((bot) => bot.state === 'attention') ? 'is-danger' : ''}><ShieldCheck size={18} /><div><span>운영 상태</span><strong>확인 {bots.filter((bot) => bot.state === 'attention').length}</strong></div><small>원인 우선 표시</small></article>
        </div>
      </div>

      <section className="bot-safety-strip">
        <button
          type="button"
          onClick={() => {
            const attentionBot = bots.find((bot) => bot.state === 'attention');
            if (attentionBot) setSelectedId(attentionBot.id);
            setFilter('attention');
            setActiveTab('overview');
          }}
        >
          <AlertTriangle size={17} /><div><strong>조치 필요 {bots.filter((bot) => bot.state === 'attention').length}</strong><span>문제 원인 먼저 확인</span></div><ArrowRight size={14} />
        </button>
        <div><Play size={15} /><strong>{bots.filter((bot) => bot.state === 'running').length}</strong><span>실행 중</span></div>
        <div><CirclePause size={15} /><strong>{bots.filter((bot) => bot.state === 'paused').length}</strong><span>일시정지</span></div>
        <div><Square size={15} /><strong>{bots.filter((bot) => bot.state === 'stopped').length}</strong><span>중단</span></div>
        <div className="order-flow-summary"><span>운영 기록 범위</span><strong>주문 · 포지션 · 판단 · 통신 사건</strong></div>
      </section>

      <div className="bot-manager">
        <aside className="bot-list-panel">
          <div className="panel-heading simple"><div><small>MY BOTS</small><h2>운영 중인 봇</h2></div></div>
          <label className="library-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="봇 이름·전략·종목 검색" /></label>
          <div className="bot-filters" aria-label="봇 상태 필터">
            {([
              ['all', '전체'],
              ['running', '실행'],
              ['paused', '일시정지'],
              ['stopped', '중단'],
              ['attention', '확인'],
              ['ended', '종료'],
            ] as [BotFilter, string][]).map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={filter === id ? 'is-active' : ''}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="bot-list">
            {filtered.map((bot) => (
              <button key={bot.id} className={selected?.id === bot.id ? 'is-active' : ''} onClick={() => setSelectedId(bot.id)}>
                <span className={`bot-list__icon state-${bot.state}`}><BotIcon size={17} /></span>
                <span className="bot-list__copy">
                  <strong>{bot.name}</strong>
                  <small>{bot.symbols.join(' · ')} · {bot.version} · {bot.strategy}</small>
                  <em>{bot.state === 'ended' ? '기록 보관 중' : bot.issue ?? `${bot.openOrders}개 열린 주문`}</em>
                </span>
                <span className={`bot-state state-${bot.state}`}><i />{stateLabel[bot.state]}</span>
                <Chevron />
              </button>
            ))}
            {!filtered.length && (
              <div className="bot-list-empty">
                <PackageOpen size={22} />
                <strong>{query ? '검색 결과가 없습니다' : `${filter === 'all' ? '등록된' : stateLabel[filter]} 봇이 없습니다`}</strong>
                <p>검색어를 바꾸거나 전체 상태를 확인하세요.</p>
                <button type="button" onClick={() => { setFilter('all'); setQuery(''); }}>전체 봇 보기</button>
              </div>
            )}
          </div>
          <div className="bot-list-note"><span>공개 신뢰도</span><strong>라이브 모의 기록만 사용</strong></div>
        </aside>

        {selected ? (
          <section className="bot-detail">
          <header className="bot-detail__head">
            <div className="bot-detail__identity">
              <span className={`live-orb state-${selected.state}`}><i /></span>
              <div>
                <div><h2>{selected.name}</h2><span className={`status-chip state-${selected.state}`}>{stateLabel[selected.state]}</span></div>
                <p>BOT-{String(selected.id).padStart(4, '0')} · {selected.strategy} · {selected.version} · {selected.symbols.join(', ')} · 마지막 갱신 22:45 KST / 09:45 ET</p>
              </div>
            </div>
            <div className="bot-detail__actions">
              {selected.state !== 'ended' && <button className="button button--ghost" onClick={() => setShowSettings(true)}><Settings2 size={14} /> 설정</button>}
              {(selected.state === 'running' || selected.state === 'attention') && <button className="button button--ghost" onClick={() => setAction('pause')}><Pause size={14} /> 일시정지</button>}
              {selected.state !== 'ended' && selected.state !== 'stopped' && <button className="button button--warning" onClick={() => setAction('stop')}><Square size={13} /> 중단</button>}
              {(selected.state === 'paused' || selected.state === 'stopped' || selected.state === 'attention') && <button className="button button--primary" onClick={() => setAction('resume')}><Play size={13} /> 재개</button>}
              {selected.state !== 'ended' && <button className="danger-text-button" onClick={() => setAction('end')}>운영 종료</button>}
              {selected.state === 'ended' && <button className="danger-text-button" onClick={() => setAction('delete')}><Trash2 size={13} /> 영구 삭제</button>}
            </div>
          </header>

          {selected.issue && selected.state !== 'ended' && (
            <div className="issue-banner">
              <AlertTriangle size={17} />
              <div><strong>조치가 필요합니다</strong><span>{selected.issue}</span></div>
              <button type="button" onClick={() => setShowIssueDetail(true)}>원인 상세 <ArrowRight size={13} /></button>
            </div>
          )}

          <nav className="detail-tabs">
            {([
              ['overview', '운영', Radio],
              ['orders', '주문·포지션', ReceiptText],
              ['backtest', '백테스트', History],
              ['activity', '활동', Activity],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => setActiveTab(id)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          <div className="bot-detail__content">
            {activeTab === 'overview' && <BotOverview bot={selected} />}
            {activeTab === 'orders' && <BotOperations bot={selected} />}
            {activeTab === 'backtest' && <Backtest bot={selected} />}
            {activeTab === 'activity' && <ActivityLog bot={selected} />}
          </div>
          </section>
        ) : (
          <section className="bot-detail bot-detail--empty">
            <PackageOpen size={30} />
            <h2>표시할 봇이 없습니다</h2>
            <p>필터를 초기화하거나 새 봇을 만들어 운영 상태를 확인하세요.</p>
            <div>
              <button className="button button--ghost" onClick={() => { setFilter('all'); setQuery(''); }}>필터 초기화</button>
              <button className="button button--primary" onClick={() => setShowBotCreator(true)}><Plus size={14} /> 새 봇 만들기</button>
            </div>
          </section>
        )}
      </div>

      {showBotCreator && (
        <BotCreationModal
          bots={bots}
          onClose={() => setShowBotCreator(false)}
          onCreate={createBot}
        />
      )}

      {showIssueDetail && selected?.issue && selected.state !== 'ended' && (
        <Modal title="조치 필요 원인" onClose={() => setShowIssueDetail(false)}>
          <div className="issue-detail">
            <AlertTriangle size={22} />
            <div>
              <span>{selected.name}</span>
              <strong>{selected.issue}</strong>
              <p>새 주문 생성을 보류하고 최근 데이터 수신 시각을 확인하세요. 서비스가 특정 주문이나 수치를 추천하지는 않습니다.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button--ghost" onClick={() => setShowIssueDetail(false)}>닫기</button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setActiveTab('activity');
                setShowIssueDetail(false);
              }}
            >
              활동 기록 확인
            </button>
          </div>
        </Modal>
      )}

      {showSettings && selected && (
        <BotSettingsModal
          bot={selected}
          onClose={() => setShowSettings(false)}
          onSave={(patch) => {
            updateBot(patch, '방금 사용자 봇 설정 변경');
            setShowSettings(false);
          }}
        />
      )}

      {action === 'pause' && selected && (
        <ActionModal
          title="봇을 일시정지할까요?"
          icon={<Pause size={21} />}
          heading="새 판단만 멈추고 열린 주문은 유지합니다"
          items={[
            '신규 신호 평가와 신규 주문 생성을 중단합니다.',
            `기존 열린 주문 ${selected.openOrders}건은 유효하며 이후 체결될 수 있습니다.`,
            `기존 포지션 ${selected.positionCount}건은 그대로 유지합니다.`,
            '나중에 재개할 수 있습니다.',
          ]}
          buttonLabel="열린 주문을 유지하고 일시정지"
          tone="primary"
          onClose={() => setAction(null)}
          onConfirm={() => updateBot({ state: 'paused', nextCheck: '일시정지 중' }, `방금 사용자 일시정지 · 열린 주문 ${selected.openOrders}건 유지`)}
        />
      )}

      {action === 'stop' && selected && (
        <ActionModal
          title="봇을 중단할까요?"
          icon={<Square size={20} />}
          heading="새 판단과 열린 주문을 함께 멈춥니다"
          items={[
            '신규 신호 평가와 신규 주문 생성을 중단합니다.',
            `취소 가능한 열린 주문 ${selected.openOrders}건에 취소 요청을 보냅니다.`,
            '이미 체결된 수량과 기존 포지션은 강제 청산하지 않습니다.',
            '중단 후에도 나중에 재개할 수 있습니다.',
          ]}
          buttonLabel="열린 주문을 취소하고 중단"
          tone="warning"
          onClose={() => setAction(null)}
          onConfirm={() => updateBot({ state: 'stopped', openOrders: 0, nextCheck: '중단됨' }, `방금 사용자 중단 · 열린 주문 ${selected.openOrders}건 취소 요청`)}
        />
      )}

      {action === 'resume' && selected && (
        <ActionModal
          title="봇을 재개할까요?"
          icon={<Play size={21} />}
          heading={selected.state === 'stopped' ? '취소된 주문은 복원하지 않고 새 판단부터 시작합니다' : '현재 상태를 확인하고 새 판단을 다시 시작합니다'}
          items={[
            selected.state === 'stopped'
              ? '중단할 때 취소한 주문은 다시 제출하지 않습니다.'
              : `현재 열린 주문 ${selected.openOrders}건은 기존 상태를 이어갑니다.`,
            `기존 포지션 ${selected.positionCount}건은 그대로 유지합니다.`,
            selected.issue
              ? '데이터 연결을 다시 확인한 것으로 처리하고 조치 필요 표시를 해제합니다.'
              : '다음 일정부터 사용자 전략 조건을 다시 평가합니다.',
            '재개 후 첫 판단과 주문 결과는 활동 기록에 남습니다.',
          ]}
          buttonLabel="영향을 확인하고 재개"
          tone="primary"
          onClose={() => setAction(null)}
          onConfirm={() => updateBot(
            { state: 'running', issue: undefined, nextCheck: '3분 후' },
            '방금 사용자 재개 · 취소 주문은 복원하지 않음',
          )}
        />
      )}

      {action === 'end' && selected && (
        <ActionModal
          title="운영을 종료할까요?"
          icon={<XOctagon size={21} />}
          heading="이 운영 세션은 다시 시작할 수 없습니다"
          items={[
            '신규 판단과 주문을 영구적으로 종료합니다.',
            `열린 주문 ${selected.openOrders}건에 취소 요청을 보냅니다.`,
            `기존 포지션 ${selected.positionCount}건은 자동 청산하지 않습니다.`,
            '주문·성과·활동 기록은 보관합니다.',
          ]}
          buttonLabel="운영 종료"
          tone="danger"
          onClose={() => setAction(null)}
          onConfirm={() => updateBot({ state: 'ended', openOrders: 0, issue: undefined, nextCheck: '운영 종료' }, '방금 운영 종료 · 기록 보관')}
        />
      )}

      {action === 'delete' && selected && (
        <DeleteBotModal
          bot={selected}
          onClose={() => setAction(null)}
          onDelete={deleteBot}
        />
      )}
    </div>
  );
}

function readStrategySymbols(strategy: StrategyMeta) {
  const basicSnapshot = loadBasicEditorSnapshot(strategy.id);
  const basicSymbols = basicSnapshot?.values.asset?.symbols;
  if (typeof basicSymbols === 'string' && basicSymbols.trim()) {
    return basicSymbols.split(',').map((symbol) => symbol.trim()).filter(Boolean);
  }
  try {
    const stored = window.localStorage.getItem(proEditorStorageKey(strategy.id));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as {
      nodes?: Array<{ data?: { blockId?: string; parameters?: Record<string, unknown> } }>;
    };
    const universe = parsed.nodes?.find((node) => node.data?.blockId === 'direct-universe');
    const symbols = universe?.data?.parameters?.symbols;
    return typeof symbols === 'string'
      ? symbols.split(',').map((symbol) => symbol.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function BotCreationModal({
  bots,
  onClose,
  onCreate,
}: {
  bots: Bot[];
  onClose: () => void;
  onCreate: (bot: Bot) => void;
}) {
  const workspace = loadStrategyWorkspace();
  const availableStrategies = workspace.strategies.filter((strategy) => !strategy.archivedAt);
  const initialStrategy = availableStrategies.find(
    (strategy) => strategy.id === workspace.activeStrategyId,
  ) ?? availableStrategies[0];
  const [strategyId, setStrategyId] = useState(initialStrategy.id);
  const selectedStrategy = availableStrategies.find((strategy) => strategy.id === strategyId)
    ?? initialStrategy;
  const versions = useMemo(
    () => loadStrategyVersions(selectedStrategy.id),
    [selectedStrategy.id],
  );
  const [versionId, setVersionId] = useState(versions[0]?.id ?? 'current');
  const [name, setName] = useState(`${selectedStrategy.name} 봇`);
  const [initialCapital, setInitialCapital] = useState('');
  const [schedule, setSchedule] = useState('');
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const symbols = readStrategySymbols(selectedStrategy);
  const errors = [
    !name.trim() ? '봇 이름을 입력하세요.' : '',
    !initialCapital || Number(initialCapital) <= 0 ? '초기 가상자금을 직접 입력하세요.' : '',
    !schedule ? '운영 일정을 선택하세요.' : '',
    !symbols.length ? '선택한 전략에 사용자가 입력한 종목이 없습니다.' : '',
    !policyConfirmed ? '일시정지·중단 시 주문 처리 정책을 확인하세요.' : '',
  ].filter(Boolean);

  useEffect(() => {
    setVersionId(versions[0]?.id ?? 'current');
    setName(`${selectedStrategy.name} 봇`);
    setAttempted(false);
  }, [selectedStrategy.id, selectedStrategy.name, versions]);

  const submit = () => {
    setAttempted(true);
    if (errors.length) return;
    let selectedVersion: StrategyVersion | undefined = versions.find(
      (version) => version.id === versionId,
    );
    if (!selectedVersion) {
      selectedVersion = createStrategyVersion(
        selectedStrategy,
        '봇 생성용 자동 버전',
      );
    }
    onCreate({
      id: Math.max(0, ...bots.map((bot) => bot.id)) + 1,
      name: name.trim(),
      state: 'stopped',
      strategy: selectedStrategy.name,
      strategyId: selectedStrategy.id,
      version: `v${selectedVersion.number}`,
      symbols,
      openOrders: 0,
      positionCount: 0,
      nextCheck: '백테스트 설정 필요',
      initialCapital,
      schedule,
      orderPolicy: '일시정지 시 유지 · 중단 시 취소',
      notifyIssues: true,
      notifyOrders: true,
      notifyDailySummary: false,
      activity: [
        '방금 봇 초안 생성 · 아직 가동하지 않음',
        `전략 ${selectedStrategy.name} · v${selectedVersion.number} 고정`,
      ],
    });
  };

  return (
    <Modal title="봇 생성 최종 확인" onClose={onClose} wide>
      <div className="bot-create-intro">
        <FileCheck2 size={21} />
        <div>
          <strong>가동 전 조건을 한 화면에서 확인합니다</strong>
          <p>여기서 만드는 것은 라이브 모의 봇 초안입니다. 생성 후 백테스트 설정을 확인하고 사용자가 직접 가동해야 합니다.</p>
        </div>
      </div>
      <div className="bot-create-layout">
        <div className="bot-create-form">
          <section>
            <div className="bot-create-section-title"><span>1</span><div><strong>전략과 버전</strong><small>봇이 사용할 구조를 고정합니다.</small></div></div>
            <div className="field-grid">
              <label className="field">
                <span>전략</span>
                <select value={selectedStrategy.id} onChange={(event) => setStrategyId(event.target.value)}>
                  {availableStrategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>{strategy.name} · {strategy.mode === 'basic' ? 'Basic' : 'Pro'}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>전략 버전</span>
                <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                  {!versions.length && <option value="current">현재 저장본 · 생성 시 자동 버전</option>}
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>v{version.number} · {version.summary}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bot-create-selection">
              <span>사용자 입력 종목</span>
              <strong>{symbols.length ? symbols.join(' · ') : '미입력'}</strong>
              <small>서비스가 종목을 추가하거나 바꾸지 않습니다.</small>
            </div>
          </section>

          <section>
            <div className="bot-create-section-title"><span>2</span><div><strong>가상자금과 일정</strong><small>추천값 없이 직접 입력합니다.</small></div></div>
            <div className="field-grid">
              <label className="field"><span>봇 이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} /></label>
              <label className="field"><span>초기 가상자금</span><input type="number" min="1" value={initialCapital} onChange={(event) => setInitialCapital(event.target.value)} placeholder="직접 입력" /></label>
              <label className="field">
                <span>운영 일정</span>
                <select value={schedule} onChange={(event) => setSchedule(event.target.value)}>
                  <option value="">직접 선택</option>
                  <option value="선택한 시장 정규장">선택한 시장 정규장</option>
                  <option value="사용자 지정 요일·시간">사용자 지정 요일·시간</option>
                  <option value="수동 실행만">수동 실행만</option>
                </select>
              </label>
              <div className="bot-create-fixed">
                <span>최초 가동</span>
                <strong>생성 후 사용자가 수동 시작</strong>
              </div>
            </div>
          </section>

          <section>
            <div className="bot-create-section-title"><span>3</span><div><strong>주문 처리 정책</strong><small>이전에 정한 안전 중심 정책을 확인합니다.</small></div></div>
            <div className="bot-order-policy">
              <article><Pause size={15} /><div><strong>일시정지</strong><p>새 판단만 멈추며 이미 보낸 미체결 주문은 유지합니다.</p></div></article>
              <article><Square size={15} /><div><strong>중단</strong><p>새 판단을 멈추고 취소 가능한 미체결 주문에 취소 요청을 보냅니다.</p></div></article>
              <article><ShieldCheck size={15} /><div><strong>포지션</strong><p>이미 체결된 수량은 자동 청산하지 않습니다.</p></div></article>
            </div>
            <label className="bot-policy-confirm">
              <input type="checkbox" checked={policyConfirmed} onChange={(event) => setPolicyConfirmed(event.target.checked)} />
              위 정책과 라이브 모의 환경임을 확인했습니다.
            </label>
          </section>
        </div>
        <aside className="bot-create-summary">
          <span className="eyebrow">FINAL REVIEW</span>
          <h3>생성 후 다음 단계</h3>
          <ol>
            <li><span>1</span><div><strong>봇 초안 생성</strong><small>아직 가동하지 않습니다.</small></div></li>
            <li><span>2</span><div><strong>백테스트 조건 입력</strong><small>기간·비용·데이터 범위를 직접 결정합니다.</small></div></li>
            <li><span>3</span><div><strong>결과와 한계 확인</strong><small>과거 결과는 향후 성과를 보장하지 않습니다.</small></div></li>
          </ol>
          {attempted && errors.length > 0 && (
            <div className="bot-create-errors">
              <strong>완료 전에 확인하세요</strong>
              {errors.map((error) => <span key={error}>{error}</span>)}
            </div>
          )}
          <button className="button button--primary button--full" onClick={submit}>
            봇 초안 만들고 백테스트 설정
          </button>
        </aside>
      </div>
    </Modal>
  );
}

function BotOverview({ bot }: { bot: Bot }) {
  const snapshot = getBotOperationSnapshot(bot);
  const activeOrders = snapshot.orders.filter(
    (order) => order.status === 'submitted' || order.status === 'partial',
  );
  const latestDecision = snapshot.decisions[0];

  return (
    <div className="bot-overview">
      {bot.issue && (
        <section className="operation-priority-card">
          <div className="operation-priority-card__icon"><AlertTriangle size={20} /></div>
          <div className="operation-priority-card__copy">
            <span>가장 먼저 확인</span>
            <h3>{bot.issue}</h3>
            <div>
              <article><strong>문제</strong><p>최근 데이터가 정상 주기보다 늦게 도착했습니다.</p></article>
              <article><strong>영향</strong><p>새 판단과 주문만 보류하며 기존 주문·포지션은 유지합니다.</p></article>
              <article><strong>다음 행동</strong><p>통신 사건을 확인한 뒤 사용자가 재개 여부를 결정합니다.</p></article>
            </div>
          </div>
        </section>
      )}

      <div className="operation-summary-grid">
        <article><ShieldCheck size={17} /><div><span>데이터·주문 상태</span><strong>{bot.issue ? '확인 필요' : '정상'}</strong><small>성과보다 먼저 확인</small></div></article>
        <article><Coins size={17} /><div><span>모의 총자산</span><strong>{formatOperationMoney(snapshot.equity)}</strong><small>실제 계좌가 아님</small></div></article>
        <article><ListChecks size={17} /><div><span>열린 주문</span><strong>{activeOrders.length}건</strong><small>부분 체결 포함</small></div></article>
        <article><Gauge size={17} /><div><span>보유 포지션</span><strong>{snapshot.positions.length}개</strong><small>자동 청산 안 함</small></div></article>
      </div>

      <div className="operation-overview-grid">
        <section className="current-decision-card">
          <div className="section-heading">
            <div><span className="eyebrow">LATEST DECISION</span><h2>최근 판단 근거</h2></div>
            <span>{latestDecision.time}</span>
          </div>
          <div className="decision-result-line">
            <span className={latestDecision.result === '주문 없음' ? 'is-hold' : 'is-pass'}>{latestDecision.result}</span>
            <strong>{latestDecision.symbol}</strong>
          </div>
          <p>{latestDecision.summary}</p>
          <div className="decision-condition-list">
            {latestDecision.conditions.map((condition) => (
              <article key={condition.label}>
                <i className={`is-${condition.result}`} />
                <div><strong>{condition.label}</strong><small>{condition.detail}</small></div>
              </article>
            ))}
          </div>
        </section>

        <aside className="connectivity-timeline-card">
          <div className="section-heading">
            <div><span className="eyebrow">SYSTEM TIMELINE</span><h2>통신·제어 타임라인</h2></div>
            {bot.issue ? <WifiOff size={16} /> : <Wifi size={16} />}
          </div>
          <div className="connectivity-timeline">
            {snapshot.connectivity.map((event) => (
              <article key={event.id} className={`is-${event.state}`}>
                <time>{event.time}</time>
                <i />
                <div>
                  <span>{event.actor === 'user' ? '사용자 행동' : '시스템 사건'}</span>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="next-check-row"><Clock3 size={14} /><span>다음 확인</span><strong>{bot.nextCheck}</strong></div>
        </aside>
      </div>
      <div className="disclosure">라이브 모의 결과이며 실제 투자 성과가 아닙니다. 특정 전략의 적합성이나 향후 결과를 보장하지 않습니다.</div>
    </div>
  );
}

function BotOperations({ bot }: { bot: Bot }) {
  const snapshot = useMemo(() => getBotOperationSnapshot(bot), [bot]);
  const [selectedOrderId, setSelectedOrderId] = useState(snapshot.orders[0]?.id ?? '');
  const selectedOrder = snapshot.orders.find((order) => order.id === selectedOrderId)
    ?? snapshot.orders[0];

  useEffect(() => {
    setSelectedOrderId(snapshot.orders[0]?.id ?? '');
  }, [bot.id]);

  return (
    <div className="bot-operations">
      <div className="operation-account-grid">
        <article><DollarSign size={16} /><div><span>사용 가능 현금</span><strong>{formatOperationMoney(snapshot.cash)}</strong></div></article>
        <article><TrendingUp size={16} /><div><span>평가손익</span><strong className={snapshot.evaluatedProfitLoss >= 0 ? 'is-positive' : 'is-negative'}>{formatOperationMoney(snapshot.evaluatedProfitLoss)}</strong></div></article>
        <article><Gauge size={16} /><div><span>포지션</span><strong>{snapshot.positions.length}개</strong></div></article>
        <article><ReceiptText size={16} /><div><span>주문 기록</span><strong>{snapshot.orders.length}건</strong></div></article>
      </div>

      <div className="operation-data-grid">
        <section className="orders-card">
          <div className="section-heading">
            <div><span className="eyebrow">ORDER LIFECYCLE</span><h2>주문 상태</h2></div>
            <span>제출 → 부분 체결 → 체결·취소</span>
          </div>
          <div className="orders-table" role="table" aria-label="모의 주문 상태">
            <div className="orders-table__head" role="row">
              <span>시간·주문</span><span>방향</span><span>수량</span><span>가격</span><span>상태</span>
            </div>
            {snapshot.orders.map((order) => (
              <button
                type="button"
                role="row"
                key={order.id}
                className={selectedOrder?.id === order.id ? 'is-active' : ''}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <span><strong>{order.updatedAt}</strong><small>{order.id}</small></span>
                <span className={order.side === '매수' ? 'is-buy' : 'is-sell'}>{order.side}</span>
                <span>{order.filledQuantity}/{order.quantity}주</span>
                <span>{operationOrderPrice(order)}</span>
                <span className={`order-status is-${order.status}`}>{orderStatusLabel[order.status]}</span>
              </button>
            ))}
          </div>
          {selectedOrder && (
            <div className="selected-order-detail">
              <div><span>선택 주문</span><strong>{selectedOrder.id}</strong></div>
              <p>{selectedOrder.note}</p>
              <small>제출 {selectedOrder.submittedAt} · 마지막 상태 {selectedOrder.updatedAt} KST</small>
            </div>
          )}
        </section>

        <section className="positions-card">
          <div className="section-heading">
            <div><span className="eyebrow">POSITIONS</span><h2>포지션과 평가손익</h2></div>
            <span>자동 청산 안 함</span>
          </div>
          {snapshot.positions.length ? (
            <div className="positions-table">
              <div><span>종목</span><span>수량</span><span>평균 단가</span><span>현재가</span><span>평가손익</span></div>
              {snapshot.positions.map((position) => {
                const profitLoss = position.quantity * (position.currentPrice - position.averagePrice);
                return (
                  <article key={position.symbol}>
                    <strong>{position.symbol}</strong>
                    <span>{position.quantity}주</span>
                    <span>{formatOperationMoney(position.averagePrice)}</span>
                    <span>{formatOperationMoney(position.currentPrice)}</span>
                    <strong className={profitLoss >= 0 ? 'is-positive' : 'is-negative'}>{formatOperationMoney(profitLoss)}</strong>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="operation-empty-state"><PackageOpen size={22} /><strong>보유 포지션이 없습니다</strong><p>체결된 주문이 생기면 평균 단가와 평가손익을 표시합니다.</p></div>
          )}
        </section>
      </div>

      <section className="price-events-card">
        <div className="section-heading">
          <div><span className="eyebrow">PRICE & EVENTS</span><h2>가격과 주문·체결 시점</h2></div>
          <span>{bot.symbols[0] ?? '사용자 종목'} · 데모 기록</span>
        </div>
        <div className="operation-price-chart">
          <svg viewBox="0 0 760 210" role="img" aria-label="가격과 주문 및 체결 시점">
            <path className="chart-grid-line" d="M20 45H740 M20 100H740 M20 155H740" />
            <path className="operation-price-line" d="M20 160 C80 150 115 165 170 140 S270 130 320 118 S410 135 465 100 S555 88 610 70 S690 72 740 42" />
            <g className="chart-event is-submitted"><circle cx="170" cy="140" r="7" /><text x="170" y="122">주문 제출</text></g>
            <g className="chart-event is-partial"><circle cx="320" cy="118" r="7" /><text x="320" y="99">부분 체결</text></g>
            <g className="chart-event is-filled"><circle cx="610" cy="70" r="7" /><text x="610" y="51">전체 체결</text></g>
            <g className="chart-event is-cancelled"><circle cx="690" cy="72" r="7" /><text x="690" y="96">취소</text></g>
          </svg>
          <div className="chart-axis"><span>21:20</span><span>21:50</span><span>22:20</span><span>22:45 KST</span></div>
        </div>
        <div className="chart-event-legend">
          <span className="is-submitted">주문 제출</span><span className="is-partial">부분 체결</span><span className="is-filled">체결</span><span className="is-cancelled">취소</span>
        </div>
      </section>

      <section className="decision-audit-card">
        <div className="section-heading">
          <div><span className="eyebrow">DECISION EXPLAINER</span><h2>주문하거나 주문하지 않은 이유</h2></div>
          <span>사용자 조건별 근거</span>
        </div>
        <div className="decision-audit-list">
          {snapshot.decisions.map((decision) => (
            <article key={decision.id}>
              <header><div><time>{decision.time}</time><strong>{decision.symbol}</strong></div><span className={decision.result === '주문 없음' ? 'is-hold' : 'is-pass'}>{decision.result}</span></header>
              <p>{decision.summary}</p>
              <div>
                {decision.conditions.map((condition) => (
                  <span key={condition.label} className={`is-${condition.result}`}><i />{condition.label}<small>{condition.detail}</small></span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="disclosure">표시된 가격·주문·체결 기록은 UI 검증용 라이브 모의 데이터이며 특정 종목이나 가격을 추천하지 않습니다.</div>
    </div>
  );
}

function operationOrderPrice(order: BotOrder) {
  if (order.averageFillPrice) return formatOperationMoney(order.averageFillPrice);
  if (order.limitPrice) return formatOperationMoney(order.limitPrice);
  return '시장가';
}

function Backtest({ bot }: { bot: Bot }) {
  const [periodMode, setPeriodMode] = useState<'official' | 'custom'>('official');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [initialCapital, setInitialCapital] = useState(bot.initialCapital ?? '');
  const [fee, setFee] = useState('');
  const [slippage, setSlippage] = useState('');
  const [benchmark, setBenchmark] = useState('');
  const [marketHours, setMarketHours] = useState('');
  const [split, setSplit] = useState(false);
  const [splitDate, setSplitDate] = useState('');
  const [corporateActions, setCorporateActions] = useState('');
  const [dividends, setDividends] = useState('');
  const [shortAvailability, setShortAvailability] = useState('');
  const [missingDataPolicy, setMissingDataPolicy] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [runs, setRuns] = useState<BacktestRun[]>(() => loadBacktestRuns(bot));
  const [selectedRunId, setSelectedRunId] = useState(() => loadBacktestRuns(bot)[0]?.id ?? '');
  const [selectedMetric, setSelectedMetric] = useState<keyof typeof metricHelp>('cumulativeReturn');
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];

  useEffect(() => {
    const nextRuns = loadBacktestRuns(bot);
    setRuns(nextRuns);
    setSelectedRunId(nextRuns[0]?.id ?? '');
    setInitialCapital(bot.initialCapital ?? '');
    setAttempted(false);
  }, [bot.id, bot.initialCapital]);

  const updateRun = (runId: string, patch: Partial<BacktestRun>) => {
    setRuns((current) => {
      const next = current.map((run) => (
        run.id === runId
          ? { ...run, ...patch, updatedAt: new Date().toISOString() }
          : run
      ));
      saveBacktestRuns(bot.id, next);
      return next;
    });
  };

  useEffect(() => {
    if (!selectedRun) return;
    if (selectedRun.status === 'queued') {
      const timer = window.setTimeout(() => {
        updateRun(selectedRun.id, {
          status: 'running',
          progress: 36,
          stage: '과거 데이터와 전략 구조 결합',
        });
      }, 550);
      return () => window.clearTimeout(timer);
    }
    if (selectedRun.status === 'running') {
      const timer = window.setTimeout(() => {
        updateRun(selectedRun.id, {
          status: 'completed',
          progress: 100,
          stage: '결과 계산 완료',
          metrics: completedMetrics,
        });
      }, 1400);
      return () => window.clearTimeout(timer);
    }
  }, [selectedRun?.id, selectedRun?.status]);

  const effectiveStart = periodMode === 'official' ? '2024-01-02' : start;
  const effectiveEnd = periodMode === 'official' ? '2025-12-31' : end;
  const errors = [
    periodMode === 'custom' && (!start || !end) ? '사용자 지정 시작일과 종료일을 입력하세요.' : '',
    periodMode === 'custom' && start && end && start >= end ? '종료일은 시작일보다 뒤여야 합니다.' : '',
    !initialCapital || Number(initialCapital) <= 0 ? '초기 가상자금을 직접 입력하세요.' : '',
    fee === '' || Number(fee) < 0 ? '수수료 가정을 0 이상으로 입력하세요.' : '',
    slippage === '' || Number(slippage) < 0 ? '슬리피지 가정을 0 이상으로 입력하세요.' : '',
    !benchmark.trim() ? '비교 기준 이름을 직접 입력하거나 비교 안 함을 입력하세요.' : '',
    !marketHours ? '적용할 시장 시간을 선택하세요.' : '',
    split && (!splitDate || splitDate <= effectiveStart || splitDate >= effectiveEnd) ? '학습·검증 분할일을 전체 기간 안에서 선택하세요.' : '',
    !corporateActions ? '기업행사 반영 방식을 선택하세요.' : '',
    !dividends ? '배당 반영 방식을 선택하세요.' : '',
    !shortAvailability ? '공매도 가능 데이터 처리 방식을 선택하세요.' : '',
    !missingDataPolicy ? '결측 데이터 처리 방식을 선택하세요.' : '',
  ].filter(Boolean);

  const runBacktest = () => {
    setAttempted(true);
    if (errors.length) return;
    const config: BacktestConfig = {
      strategyVersion: bot.version,
      periodMode,
      start: effectiveStart,
      end: effectiveEnd,
      initialCapital,
      fee,
      slippage,
      benchmark: benchmark.trim(),
      marketHours,
      split,
      splitDate: split ? splitDate : '',
      corporateActions: corporateActions === 'apply',
      dividends: dividends === 'apply',
      shortAvailability: shortAvailability === 'apply',
      missingDataPolicy,
    };
    const run = createBacktestRun(bot, config);
    const next = [run, ...runs];
    setRuns(next);
    saveBacktestRuns(bot.id, next);
    setSelectedRunId(run.id);
    setAttempted(false);
  };

  const copyRunSettings = (run: BacktestRun) => {
    setPeriodMode(run.config.periodMode);
    setStart(run.config.periodMode === 'custom' ? run.config.start : '');
    setEnd(run.config.periodMode === 'custom' ? run.config.end : '');
    setInitialCapital(run.config.initialCapital);
    setFee(run.config.fee);
    setSlippage(run.config.slippage);
    setBenchmark(run.config.benchmark);
    setMarketHours(run.config.marketHours === '정규장' ? '정규장만' : run.config.marketHours);
    setSplit(run.config.split);
    setSplitDate(run.config.splitDate);
    setCorporateActions(run.config.corporateActions ? 'apply' : 'ignore');
    setDividends(run.config.dividends ? 'apply' : 'ignore');
    setShortAvailability(run.config.shortAvailability ? 'apply' : 'ignore');
    setMissingDataPolicy(run.config.missingDataPolicy);
    setAttempted(false);
  };

  return (
    <div className="backtest-studio">
      <section className="backtest-config-panel">
        <div className="section-heading">
          <div><span className="eyebrow">BACKTEST INPUTS</span><h2>실행 조건</h2></div>
          <span className="private-chip">본인 계정 전용</span>
        </div>

        <fieldset className="backtest-fieldset">
          <legend>기간 구분</legend>
          <div className="period-mode-picker">
            <button className={periodMode === 'official' ? 'is-active' : ''} onClick={() => setPeriodMode('official')}>
              <FileCheck2 size={14} /><span><strong>공식 비교 구간</strong><small>동일 기준 비교용 샘플 구간</small></span>
            </button>
            <button className={periodMode === 'custom' ? 'is-active' : ''} onClick={() => setPeriodMode('custom')}>
              <CalendarDays size={14} /><span><strong>사용자 지정 구간</strong><small>분석 목적에 맞게 직접 입력</small></span>
            </button>
          </div>
          {periodMode === 'official' ? (
            <div className="official-period">
              <span>샘플 공식 비교 구간</span>
              <strong>2024-01-02 → 2025-12-31</strong>
              <small>서비스 운영자가 비교 가능성을 위해 고정한 데모 구간이며 투자 기간 추천이 아닙니다.</small>
            </div>
          ) : (
            <div className="field-grid compact">
              <label className="field"><span>시작일</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
              <label className="field"><span>종료일</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            </div>
          )}
        </fieldset>

        <fieldset className="backtest-fieldset">
          <legend>자금·비용·시장 기준</legend>
          <div className="field-grid compact">
            <label className="field"><span>초기 가상자금</span><input type="number" min="1" value={initialCapital} onChange={(event) => setInitialCapital(event.target.value)} placeholder="직접 입력" /></label>
            <label className="field"><span>비교 기준</span><input value={benchmark} onChange={(event) => setBenchmark(event.target.value)} placeholder="직접 입력 또는 비교 안 함" /></label>
            <label className="field"><span>수수료 (bp)</span><input type="number" min="0" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="직접 입력" /></label>
            <label className="field"><span>슬리피지 (bp)</span><input type="number" min="0" value={slippage} onChange={(event) => setSlippage(event.target.value)} placeholder="직접 입력" /></label>
            <label className="field field--wide">
              <span>시장 시간</span>
              <select value={marketHours} onChange={(event) => setMarketHours(event.target.value)}>
                <option value="">직접 선택</option>
                <option value="정규장만">정규장만</option>
                <option value="정규장과 시간외">정규장과 시간외</option>
                <option value="사용자 지정 세션">사용자 지정 세션</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="backtest-fieldset">
          <legend>데이터 적용 범위</legend>
          <div className="field-grid compact">
            <label className="field"><span>기업행사</span><select value={corporateActions} onChange={(event) => setCorporateActions(event.target.value)}><option value="">직접 선택</option><option value="apply">반영</option><option value="ignore">반영하지 않음</option></select></label>
            <label className="field"><span>배당</span><select value={dividends} onChange={(event) => setDividends(event.target.value)}><option value="">직접 선택</option><option value="apply">반영</option><option value="ignore">반영하지 않음</option></select></label>
            <label className="field"><span>공매도 가능 정보</span><select value={shortAvailability} onChange={(event) => setShortAvailability(event.target.value)}><option value="">직접 선택</option><option value="apply">사용</option><option value="ignore">사용하지 않음</option></select></label>
            <label className="field"><span>결측 데이터</span><select value={missingDataPolicy} onChange={(event) => setMissingDataPolicy(event.target.value)}><option value="">직접 선택</option><option value="해당 시점 주문 건너뛰기">해당 시점 주문 건너뛰기</option><option value="실행 중단">실행 중단</option><option value="직전 값 사용">직전 값 사용</option></select></label>
          </div>
        </fieldset>

        <fieldset className="backtest-fieldset">
          <legend>학습·검증 구간</legend>
          <label className="switch-line"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} /> 전체 기간을 학습·검증 두 구간으로 비교</label>
          {split && (
            <label className="field">
              <span>검증 구간 시작일</span>
              <input type="date" value={splitDate} onChange={(event) => setSplitDate(event.target.value)} />
            </label>
          )}
        </fieldset>

        {attempted && errors.length > 0 && (
          <div className="backtest-errors">
            <strong>실행 전에 {errors.length}개 항목을 확인하세요</strong>
            {errors.map((error) => <span key={error}>{error}</span>)}
          </div>
        )}
        <div className="inspector-note"><ShieldCheck size={15} /><p>기간·자금·비용·비교 기준은 추천하지 않습니다. 모든 값과 적용 범위는 사용자가 직접 결정합니다.</p></div>
        <button className="button button--primary button--full" onClick={runBacktest}>
          <Play size={14} /> 입력 조건으로 백테스트 실행
        </button>
      </section>

      <section className="backtest-workspace">
        <div className="section-heading">
          <div><span className="eyebrow">RUN & REVIEW</span><h2>진행 상태와 결과</h2></div>
          {selectedRun && <span className={`backtest-status is-${selectedRun.status}`}>{backtestStatusLabel[selectedRun.status]}</span>}
        </div>

        {selectedRun ? (
          <>
            <BacktestProgress run={selectedRun} onCancel={() => updateRun(selectedRun.id, {
              status: 'cancelled',
              stage: '사용자 취소',
            })} />
            {selectedRun.status === 'completed' && selectedRun.metrics && (
              <div className="backtest-completed">
                <div className="backtest-result-head">
                  <div>
                    <span>{selectedRun.config.periodMode === 'official' ? '공식 비교 구간' : '사용자 지정 구간'}</span>
                    <strong>{selectedRun.config.start} → {selectedRun.config.end}</strong>
                  </div>
                  <div><span>전략 버전</span><strong>{selectedRun.config.strategyVersion}</strong></div>
                  <div><span>비용 가정</span><strong>수수료 {selectedRun.config.fee}bp · 슬리피지 {selectedRun.config.slippage}bp</strong></div>
                </div>
                <div className="result-metric-grid">
                  {(Object.keys(metricHelp) as Array<keyof typeof metricHelp>).map((key) => (
                    <button key={key} className={selectedMetric === key ? 'is-active' : ''} onClick={() => setSelectedMetric(key)}>
                      <span>{metricHelp[key].label}<CircleHelp size={12} /></span>
                      <strong>{selectedRun.metrics![key]}</strong>
                    </button>
                  ))}
                </div>
                <div className="metric-explanation">
                  <CircleHelp size={16} />
                  <div><strong>{metricHelp[selectedMetric].label}은 무엇인가요?</strong><p>{metricHelp[selectedMetric].description}</p></div>
                </div>
                <div className="backtest-analysis-grid">
                  <section className="backtest-chart-card">
                    <div><strong>누적 흐름 비교</strong><span>샘플 결과 · 수익 보장 아님</span></div>
                    <svg viewBox="0 0 640 180" role="img" aria-label="백테스트 누적 흐름 샘플">
                      <path d="M0 45H640 M0 90H640 M0 135H640" />
                      <polyline points="0,142 60,128 110,136 165,104 220,112 280,82 330,96 390,72 450,78 510,48 570,60 640,34" />
                      <polyline className="is-benchmark" points="0,142 60,135 110,129 165,124 220,116 280,111 330,104 390,98 450,92 510,86 570,81 640,76" />
                    </svg>
                    <div className="chart-legend"><span><i />전략 구조</span><span><i />사용자 입력 비교 기준</span></div>
                  </section>
                  <section className="split-comparison">
                    <strong>학습·검증 비교</strong>
                    {selectedRun.config.split ? (
                      <div>
                        <article><span>학습 구간</span><strong>{selectedRun.config.start} → {selectedRun.config.splitDate}</strong><small>구조를 만들며 확인한 구간</small></article>
                        <article><span>검증 구간</span><strong>{selectedRun.config.splitDate} → {selectedRun.config.end}</strong><small>분리해 다시 확인한 구간</small></article>
                      </div>
                    ) : (
                      <p>구간 분할을 사용하지 않았습니다. 이 결과만으로 과적합 여부를 판단할 수 없습니다.</p>
                    )}
                  </section>
                </div>
                <div className="data-scope-summary">
                  <Database size={16} />
                  <div>
                    <strong>이번 결과의 데이터 적용 범위</strong>
                    <span>기업행사 {selectedRun.config.corporateActions ? '반영' : '미반영'} · 배당 {selectedRun.config.dividends ? '반영' : '미반영'} · 공매도 정보 {selectedRun.config.shortAvailability ? '사용' : '미사용'} · 결측값 {selectedRun.config.missingDataPolicy}</span>
                  </div>
                </div>
                <div className="disclosure">과거 데이터에 사용자 입력 조건을 적용한 샘플 결과이며 전략을 추천·인증하거나 향후 성과를 보장하지 않습니다.</div>
              </div>
            )}
            {selectedRun.status === 'failed' && (
              <div className="backtest-state-detail is-failed">
                <CircleX size={23} />
                <div><strong>백테스트를 완료하지 못했습니다</strong><p>{selectedRun.failureReason}</p><span>영향: 결과 지표를 계산하지 않았습니다. 해결: 데이터 범위나 기간을 확인한 뒤 설정을 복사해 다시 실행하세요.</span></div>
                <button className="button button--ghost" onClick={() => copyRunSettings(selectedRun)}><RefreshCw size={13} /> 설정 복사</button>
              </div>
            )}
            {selectedRun.status === 'cancelled' && (
              <div className="backtest-state-detail">
                <Square size={22} />
                <div><strong>사용자가 실행을 취소했습니다</strong><p>부분 계산 결과는 성과 지표로 사용하지 않습니다.</p></div>
                <button className="button button--ghost" onClick={() => copyRunSettings(selectedRun)}><RefreshCw size={13} /> 설정 복사</button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-result"><History size={28} /><h3>선택된 실행 기록이 없습니다</h3><p>왼쪽에서 조건을 입력해 첫 백테스트를 실행하세요.</p></div>
        )}

        <div className="backtest-history">
          <div><strong>과거 실행 기록</strong><span>{runs.length}건 · 새로고침 후에도 유지</span></div>
          <div className="backtest-history-list">
            {runs.map((run) => (
              <button key={run.id} className={selectedRun?.id === run.id ? 'is-active' : ''} onClick={() => setSelectedRunId(run.id)}>
                <span className={`backtest-history-icon is-${run.status}`}>{backtestStatusIcon[run.status]}</span>
                <span><strong>{formatBacktestTime(run.createdAt)}</strong><small>{run.config.periodMode === 'official' ? '공식 비교 구간' : '사용자 지정 구간'} · {run.config.strategyVersion}</small></span>
                <em>{backtestStatusLabel[run.status]}</em>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const backtestStatusLabel: Record<BacktestStatus, string> = {
  queued: '준비·대기',
  running: '실행 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
};

const backtestStatusIcon: Record<BacktestStatus, React.ReactNode> = {
  queued: <Clock3 size={14} />,
  running: <RefreshCw size={14} />,
  completed: <CheckCircle2 size={14} />,
  failed: <CircleX size={14} />,
  cancelled: <Square size={13} />,
};

const metricHelp = {
  cumulativeReturn: {
    label: '누적 수익률',
    description: '시작 가상자금과 비교해 전체 기간의 모의 자산이 얼마나 변했는지 보여줍니다. 중간 손실 크기는 별도로 확인해야 합니다.',
  },
  maxDrawdown: {
    label: '최대 낙폭',
    description: '모의 자산이 이전 최고점에서 가장 크게 하락한 비율입니다. 손실 가능성과 회복 부담을 이해하는 데 사용합니다.',
  },
  volatility: {
    label: '변동성',
    description: '기간 동안 모의 수익률이 얼마나 크게 흔들렸는지 나타냅니다. 수익률이 같아도 변동성이 높으면 체감 위험이 더 클 수 있습니다.',
  },
  sharpe: {
    label: '샤프지수',
    description: '변동성 대비 초과 수익을 단순 비교하는 지표입니다. 입력한 비교 기준과 기간에 따라 크게 달라질 수 있습니다.',
  },
  winRate: {
    label: '승률',
    description: '종료된 모의 거래 중 이익으로 끝난 거래의 비율입니다. 손익 크기를 반영하지 않으므로 단독으로 판단하지 않습니다.',
  },
  tradeCount: {
    label: '거래 횟수',
    description: '선택 기간에 완료된 모의 거래 수입니다. 횟수가 적으면 다른 지표의 안정성을 판단하기 어렵습니다.',
  },
};

function BacktestProgress({
  run,
  onCancel,
}: {
  run: BacktestRun;
  onCancel: () => void;
}) {
  return (
    <div className={`backtest-progress-card is-${run.status}`}>
      <div className="backtest-progress-head">
        <span className="backtest-progress-icon">{backtestStatusIcon[run.status]}</span>
        <div><strong>{run.stage}</strong><small>마지막 갱신 {formatBacktestTime(run.updatedAt)}</small></div>
        {(run.status === 'queued' || run.status === 'running') && (
          <button className="button button--ghost" onClick={onCancel}>실행 취소</button>
        )}
      </div>
      <div className="backtest-run-stepper" aria-label={`백테스트 ${backtestStatusLabel[run.status]}`}>
        {['입력 확인', '데이터 준비', '전략 실행', '결과 계산'].map((step, index) => {
          const threshold = [5, 25, 55, 90][index];
          return (
            <span key={step} className={run.progress >= threshold ? 'is-complete' : ''}>
              <i>{run.progress >= threshold ? <Check size={10} /> : index + 1}</i>{step}
            </span>
          );
        })}
      </div>
      <div className="backtest-progress-track"><i style={{ width: `${run.progress}%` }} /></div>
      <p>
        {run.status === 'queued' && '실행 대기열에 등록했습니다. 화면을 닫아도 현재 단계가 보관됩니다.'}
        {run.status === 'running' && '과거 데이터에 사용자 입력 조건을 적용하고 있습니다. 실제 주문은 생성하지 않습니다.'}
        {run.status === 'completed' && '모든 계산이 끝났습니다. 결과보다 데이터 범위와 한계를 먼저 확인하세요.'}
        {run.status === 'failed' && '결과를 만들지 않았습니다. 실패 원인과 해결 행동을 확인하세요.'}
        {run.status === 'cancelled' && '부분 계산은 폐기했으며 같은 설정을 다시 불러올 수 있습니다.'}
      </p>
    </div>
  );
}

function ActivityLog({ bot }: { bot: Bot }) {
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState<'all' | ActivityActor>('all');
  const [category, setCategory] = useState<'all' | ActivityCategory>('all');
  const records = useMemo(() => getBotActivityRecords(bot), [bot]);
  const filteredRecords = records.filter((record) => (
    (actor === 'all' || record.actor === actor)
    && (category === 'all' || record.category === category)
    && `${record.title} ${record.detail}`.toLowerCase().includes(query.toLowerCase())
  ));

  return (
    <div className="activity-audit">
      <div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>활동 기록</h2></div><span>KST 기본 · 사용자/시스템 구분</span></div>
      <div className="activity-toolbar">
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="행동·주문·연결 기록 검색" /></label>
        <div className="activity-filter-group" aria-label="행동 주체 필터">
          {([
            ['all', '전체 주체', Radio],
            ['user', '사용자', UserRound],
            ['system', '시스템', BotIcon],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} className={actor === id ? 'is-active' : ''} onClick={() => setActor(id)}><Icon size={12} />{label}</button>
          ))}
        </div>
        <div className="activity-filter-group" aria-label="기록 유형 필터">
          {([
            ['all', '전체 유형'],
            ['operation', '제어'],
            ['order', '주문'],
            ['risk', '위험'],
            ['connectivity', '통신'],
          ] as const).map(([id, label]) => (
            <button key={id} className={category === id ? 'is-active' : ''} onClick={() => setCategory(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="activity-result-summary">
        <span>검색 결과 <strong>{filteredRecords.length}</strong>건</span>
        <span><i className="is-user" />사용자 행동 <i className="is-system" />시스템 사건</span>
      </div>

      <div className="activity-log">
        {filteredRecords.map((record) => (
          <article key={record.id} className={`is-${record.actor}`}>
            <time>{record.time}</time>
            <i />
            <div>
              <span>{record.actor === 'user' ? '사용자 행동' : '시스템 사건'} · {activityCategoryLabel[record.category]}</span>
              <strong>{record.title}</strong>
              <p>{record.detail}</p>
            </div>
          </article>
        ))}
        {!filteredRecords.length && (
          <div className="operation-empty-state">
            <PackageOpen size={22} />
            <strong>조건에 맞는 활동 기록이 없습니다</strong>
            <p>검색어 또는 주체·유형 필터를 변경하세요.</p>
            <button type="button" onClick={() => { setQuery(''); setActor('all'); setCategory('all'); }}>필터 초기화</button>
          </div>
        )}
      </div>
    </div>
  );
}

const activityCategoryLabel: Record<ActivityCategory, string> = {
  operation: '제어',
  order: '주문',
  risk: '위험',
  connectivity: '통신',
};

function BotSettingsModal({
  bot,
  onClose,
  onSave,
}: {
  bot: Bot;
  onClose: () => void;
  onSave: (patch: Partial<Bot>) => void;
}) {
  const [name, setName] = useState(bot.name);
  const [schedule, setSchedule] = useState(bot.schedule ?? '');
  const [notifyIssues, setNotifyIssues] = useState(bot.notifyIssues ?? true);
  const [notifyOrders, setNotifyOrders] = useState(bot.notifyOrders ?? true);
  const [notifyDailySummary, setNotifyDailySummary] = useState(bot.notifyDailySummary ?? false);
  const [attempted, setAttempted] = useState(false);
  const errors = [
    !name.trim() ? '봇 이름을 입력하세요.' : '',
    !schedule ? '운영 일정을 선택하세요.' : '',
  ].filter(Boolean);

  const submit = () => {
    setAttempted(true);
    if (errors.length) return;
    onSave({
      name: name.trim(),
      schedule,
      notifyIssues,
      notifyOrders,
      notifyDailySummary,
    });
  };

  return (
    <Modal title="봇 설정" onClose={onClose}>
      <div className="bot-settings-identity">
        <Settings2 size={20} />
        <div><span>봇 식별값</span><strong>BOT-{String(bot.id).padStart(4, '0')}</strong><small>{bot.strategy} · {bot.version}</small></div>
      </div>
      <div className="bot-settings-form">
        <section>
          <div className="bot-create-section-title"><span>1</span><div><strong>이름과 일정</strong><small>전략 버전은 운영 중 변경하지 않습니다.</small></div></div>
          <label className="field"><span>봇 이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} /></label>
          <label className="field">
            <span>운영 일정</span>
            <select value={schedule} onChange={(event) => setSchedule(event.target.value)}>
              <option value="">직접 선택</option>
              <option value="선택한 시장 정규장">선택한 시장 정규장</option>
              <option value="사용자 지정 요일·시간">사용자 지정 요일·시간</option>
              <option value="수동 실행만">수동 실행만</option>
            </select>
          </label>
          <div className="settings-readonly-row"><span>전략 버전</span><strong>{bot.version}</strong><small>다른 버전은 새 봇으로 생성</small></div>
        </section>
        <section>
          <div className="bot-create-section-title"><span>2</span><div><strong>알림</strong><small>중요 사건별로 받을 항목을 선택합니다.</small></div></div>
          <label className="bot-setting-toggle"><input type="checkbox" checked={notifyIssues} onChange={(event) => setNotifyIssues(event.target.checked)} /><AlertTriangle size={15} /><div><strong>문제·통신 지연</strong><small>새 주문 보류나 데이터 지연 발생</small></div></label>
          <label className="bot-setting-toggle"><input type="checkbox" checked={notifyOrders} onChange={(event) => setNotifyOrders(event.target.checked)} /><ReceiptText size={15} /><div><strong>주문·체결 상태</strong><small>부분 체결, 전체 체결, 취소 결과</small></div></label>
          <label className="bot-setting-toggle"><input type="checkbox" checked={notifyDailySummary} onChange={(event) => setNotifyDailySummary(event.target.checked)} /><BellRing size={15} /><div><strong>일일 운영 요약</strong><small>판단·주문·포지션 요약</small></div></label>
        </section>
      </div>
      {attempted && errors.length > 0 && (
        <div className="bot-create-errors">
          <strong>저장 전에 확인하세요</strong>
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>취소</button>
        <button type="button" className="button button--primary" onClick={submit}>설정 저장</button>
      </div>
    </Modal>
  );
}

function DeleteBotModal({
  bot,
  onClose,
  onDelete,
}: {
  bot: Bot;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [attempted, setAttempted] = useState(false);
  const matches = confirmation === bot.name;

  const submit = () => {
    setAttempted(true);
    if (!matches) return;
    onDelete();
  };

  return (
    <Modal title="봇 영구 삭제" onClose={onClose}>
      <div className="delete-bot-warning">
        <Trash2 size={22} />
        <div>
          <strong>운영 종료와 영구 삭제는 다릅니다</strong>
          <p>운영 종료 상태에서는 기록을 다시 볼 수 있지만, 영구 삭제하면 이 브라우저의 봇·백테스트 기록을 복구할 수 없습니다.</p>
        </div>
      </div>
      <div className="delete-bot-summary">
        <span>삭제 대상</span><strong>{bot.name}</strong><small>BOT-{String(bot.id).padStart(4, '0')} · {bot.strategy} · {bot.version}</small>
      </div>
      <label className="field">
        <span>확인을 위해 봇 이름을 정확히 입력하세요</span>
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={bot.name} />
      </label>
      {attempted && !matches && <div className="delete-bot-error">봇 이름이 일치하지 않습니다.</div>}
      <div className="modal-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>기록 보관</button>
        <button type="button" className="button button--danger" onClick={submit}>영구 삭제</button>
      </div>
    </Modal>
  );
}

function ActionModal({
  title,
  icon,
  heading,
  items,
  buttonLabel,
  tone,
  onClose,
  onConfirm,
}: {
  title: string;
  icon: React.ReactNode;
  heading: string;
  items: string[];
  buttonLabel: string;
  tone: 'primary' | 'warning' | 'danger';
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className={`action-explanation action-explanation--${tone}`}>
        <span>{icon}</span><h3>{heading}</h3>
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <button className={`button button--${tone} button--full`} onClick={onConfirm}>{buttonLabel}</button>
    </Modal>
  );
}

function Chevron() {
  return <ArrowRight size={14} />;
}
