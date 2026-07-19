import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Bookmark,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  EyeOff,
  History,
  Lock,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BacktestRun } from '../backtestStorage';
import { loadBacktestRuns } from '../backtestStorage';
import { loadBots } from '../botStorage';
import {
  competitionMetricKeys,
  createRoomOperation,
  formatRoomDateTime,
  loadCompetitionRooms,
  loadRoomOperations,
  loadRoomSubmissions,
  metricLabels,
  parseMetricValue,
  saveCompetitionRooms,
  saveRoomOperations,
  saveRoomSubmissions,
} from '../competitionStorage';
import { CheckItem, Modal, PageTitle } from '../components/Overlays';
import { initialRooms } from '../data';
import type {
  Bot as BotType,
  CompetitionMetricKey,
  CompetitionMetrics,
  Room,
  RoomOperation,
  RoomSubmission,
  RoomTab,
} from '../types';

type RoomFilter = 'all' | 'recruiting' | 'official';
type DetailTab = 'overview' | 'ranking' | 'participants' | 'operations';
type SortDirection = 'descending' | 'ascending';
type ParticipantFilter = 'all' | 'submitted' | 'waiting';
type ManagementConfirm = 'stop' | 'end' | null;

type BotSubmissionOption = {
  bot: BotType;
  eligible: boolean;
  reason: string;
  versions: string[];
  completedRuns: BacktestRun[];
};

const statusTone: Record<Room['status'], string> = {
  '모집 중': 'recruiting',
  '진행 중': 'running',
  예정: 'scheduled',
  '모집 중단': 'paused',
  종료: 'ended',
};

const metricDescriptions: Record<CompetitionMetricKey, string> = {
  cumulativeReturn: '대회 시작 자본 대비 누적 변화입니다.',
  maxDrawdown: '대회 중 고점 대비 가장 큰 하락 폭입니다.',
  volatility: '성과 변화의 흔들림 정도입니다.',
  sharpe: '변동성 대비 초과 성과를 나타내는 참고 지표입니다.',
  winRate: '전체 종료 거래 중 이익 거래의 비율입니다.',
  tradeCount: '대회 기간 동안 체결이 완료된 거래 수입니다.',
};

const submissionStatusTone: Record<RoomSubmission['status'], string> = {
  '제출 완료': 'submitted',
  '변경 잠금': 'locked',
  '제출 대기': 'waiting',
  철회: 'withdrawn',
};

function formatPeriod(start: string, end: string) {
  const compact = (value: string) => value.slice(5).replace('-', '.');
  return `${compact(start)} - ${compact(end)}`;
}

function getBotOptions(room: Room, bots: BotType[]): BotSubmissionOption[] {
  return bots.map((bot) => {
    const completedRuns = loadBacktestRuns(bot)
      .filter((run) => run.status === 'completed' && run.metrics)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const versions = Array.from(new Set(completedRuns.map((run) => run.config.strategyVersion)));
    const reasons: string[] = [];

    if (room.status !== '모집 중') reasons.push('현재 모집 중인 방이 아닙니다.');
    if (bot.state === 'attention') reasons.push('봇의 데이터·운영 문제를 먼저 해결해야 합니다.');
    if (bot.state === 'ended') reasons.push('운영을 종료한 봇은 제출할 수 없습니다.');
    if (!completedRuns.length) reasons.push('완료된 백테스트가 없습니다.');

    return {
      bot,
      eligible: reasons.length === 0,
      reason: reasons.join(' '),
      versions,
      completedRuns,
    };
  });
}

function toCompetitionMetrics(run: BacktestRun | undefined): CompetitionMetrics | undefined {
  if (!run?.metrics) return undefined;
  return { ...run.metrics };
}

export function RoomsPage() {
  const bots = useMemo(() => loadBots(), []);
  const [rooms, setRooms] = useState(() => loadCompetitionRooms(initialRooms));
  const [submissions, setSubmissions] = useState(() => loadRoomSubmissions());
  const [operations, setOperations] = useState(() => loadRoomOperations());
  const [activeTab, setActiveTab] = useState<RoomTab>('browse');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedId, setSelectedId] = useState(1);
  const [name, setName] = useState('');
  const [recruitmentStart, setRecruitmentStart] = useState('');
  const [recruitmentEnd, setRecruitmentEnd] = useState('');
  const [competitionStart, setCompetitionStart] = useState('');
  const [competitionEnd, setCompetitionEnd] = useState('');
  const [submissionLimit, setSubmissionLimit] = useState('1');
  const [initialCapital, setInitialCapital] = useState('');
  const [universeRule, setUniverseRule] = useState('');
  const [benchmark, setBenchmark] = useState('');
  const [executionRule, setExecutionRule] = useState('');
  const [costRule, setCostRule] = useState('');
  const [creationError, setCreationError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [savedRoomIds, setSavedRoomIds] = useState<number[]>([]);
  const [submissionRoomId, setSubmissionRoomId] = useState<number | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [metricKey, setMetricKey] = useState<CompetitionMetricKey>('cumulativeReturn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>('all');
  const [manageRoomId, setManageRoomId] = useState<number | null>(null);
  const [managementConfirm, setManagementConfirm] = useState<ManagementConfirm>(null);
  const [managementError, setManagementError] = useState('');
  const [managementStart, setManagementStart] = useState('');
  const [managementEnd, setManagementEnd] = useState('');
  const [participantActionId, setParticipantActionId] = useState<string | null>(null);

  useEffect(() => saveCompetitionRooms(rooms), [rooms]);
  useEffect(() => saveRoomSubmissions(submissions), [submissions]);
  useEffect(() => saveRoomOperations(operations), [operations]);
  useEffect(() => setDetailTab('overview'), [selectedId]);

  const selected = rooms.find((room) => room.id === selectedId) ?? rooms[0];
  const tabRooms = activeTab === 'joined'
    ? rooms.filter((room) => room.joined)
    : activeTab === 'mine'
      ? rooms.filter((room) => room.mine)
      : rooms;
  const visible = tabRooms.filter((room) => (
    `${room.name} ${room.owner}`.toLowerCase().includes(query.toLowerCase())
    && (filter === 'all'
      || (filter === 'recruiting' && room.status === '모집 중')
      || (filter === 'official' && room.official))
  ));
  const detailRoom = visible.find((room) => room.id === selectedId) ?? visible[0] ?? null;
  const submissionRoom = rooms.find((room) => room.id === submissionRoomId) ?? null;
  const manageRoom = rooms.find((room) => room.id === manageRoomId) ?? null;
  const participantAction = submissions.find((submission) => submission.id === participantActionId) ?? null;

  const roomSubmissions = detailRoom
    ? submissions.filter((submission) => submission.roomId === detailRoom.id)
    : [];
  const activeMySubmission = roomSubmissions.find((submission) => (
    submission.isMine && submission.status !== '철회'
  ));
  const rankedSubmissions = useMemo(() => {
    if (!detailRoom) return [];
    return submissions
      .filter((submission) => (
        submission.roomId === detailRoom.id
        && Boolean(submission.metrics)
        && submission.status !== '철회'
        && submission.status !== '제출 대기'
      ))
      .sort((left, right) => {
        const leftValue = parseMetricValue(left.metrics?.[metricKey]);
        const rightValue = parseMetricValue(right.metrics?.[metricKey]);
        return sortDirection === 'descending'
          ? rightValue - leftValue
          : leftValue - rightValue;
      });
  }, [detailRoom, metricKey, sortDirection, submissions]);
  const visibleParticipants = roomSubmissions.filter((submission) => (
    participantFilter === 'all'
    || (participantFilter === 'submitted' && ['제출 완료', '변경 잠금'].includes(submission.status))
    || (participantFilter === 'waiting' && ['제출 대기', '철회'].includes(submission.status))
  ));
  const submissionOptions = useMemo(
    () => submissionRoom ? getBotOptions(submissionRoom, bots) : [],
    [bots, submissionRoom],
  );
  const selectedOption = submissionOptions.find((option) => option.bot.id === selectedBotId);
  const selectedRun = selectedOption?.completedRuns.find(
    (run) => run.config.strategyVersion === selectedVersion,
  );
  const submittedCount = roomSubmissions.filter((submission) => (
    submission.status === '제출 완료' || submission.status === '변경 잠금'
  )).length;
  const waitingCount = roomSubmissions.filter((submission) => submission.status === '제출 대기').length;
  const roomOperations = detailRoom
    ? operations
      .filter((operation) => operation.roomId === detailRoom.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];

  const showTab = (tab: RoomTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, left: 0 });
  };

  const addOperation = (roomId: number, title: string, detail: string) => {
    setOperations((current) => [
      createRoomOperation(roomId, title, detail),
      ...current,
    ]);
  };

  const createRoom = () => {
    const requiredValues = [
      name.trim(),
      recruitmentStart,
      recruitmentEnd,
      competitionStart,
      competitionEnd,
      submissionLimit,
      initialCapital.trim(),
      universeRule.trim(),
      benchmark.trim(),
      executionRule.trim(),
      costRule.trim(),
    ];
    if (requiredValues.some((value) => !value)) {
      setCreationError('완료하려면 방 이름, 일정, 제출 수와 모든 공통 비교 기준을 입력하세요.');
      return;
    }
    if (recruitmentStart > recruitmentEnd || competitionStart > competitionEnd || recruitmentEnd > competitionStart) {
      setCreationError('날짜 순서를 확인하세요. 모집 종료 뒤에 대회가 시작되어야 합니다.');
      return;
    }
    if (Number(submissionLimit) < 1) {
      setCreationError('사용자당 제출 봇 수는 1개 이상이어야 합니다.');
      return;
    }

    const room: Room = {
      id: Math.max(0, ...rooms.map((item) => item.id)) + 1,
      name: name.trim(),
      owner: 'RM',
      status: '예정',
      period: formatPeriod(competitionStart, competitionEnd),
      members: 0,
      mine: true,
      official: false,
      recruitmentStart,
      recruitmentEnd,
      competitionStart,
      competitionEnd,
      submissionLimit: Number(submissionLimit),
      initialCapital: initialCapital.trim(),
      universeRule: universeRule.trim(),
      benchmark: benchmark.trim(),
      executionRule: executionRule.trim(),
      costRule: costRule.trim(),
    };

    setRooms((current) => [...current, room]);
    addOperation(
      room.id,
      '방 생성',
      '모집·대회 일정과 시작 자본, 종목 범위, 벤치마크, 체결·비용 기준을 등록했습니다.',
    );
    addOperation(
      room.id,
      '전략 비공개 원칙 적용',
      '참가자의 전략 구조, 종목, 포지션과 주문 기록은 다른 참가자와 운영자에게 공개되지 않습니다.',
    );
    setSelectedId(room.id);
    showTab('mine');
    setName('');
    setRecruitmentStart('');
    setRecruitmentEnd('');
    setCompetitionStart('');
    setCompetitionEnd('');
    setSubmissionLimit('1');
    setInitialCapital('');
    setUniverseRule('');
    setBenchmark('');
    setExecutionRule('');
    setCostRule('');
    setCreationError('');
  };

  const toggleSaved = (roomId: number) => {
    setSavedRoomIds((current) => (
      current.includes(roomId)
        ? current.filter((id) => id !== roomId)
        : [...current, roomId]
    ));
  };

  const openSubmission = (room: Room) => {
    const options = getBotOptions(room, bots);
    const preferred = activeMySubmission
      ? options.find((option) => option.bot.id === activeMySubmission.botId && option.eligible)
      : options.find((option) => option.eligible);
    setSubmissionRoomId(room.id);
    setSelectedBotId(preferred?.bot.id ?? null);
    setSelectedVersion(
      activeMySubmission?.strategyVersion
      ?? preferred?.versions[0]
      ?? '',
    );
    setSubmissionError('');
  };

  const selectBot = (option: BotSubmissionOption) => {
    if (!option.eligible) return;
    setSelectedBotId(option.bot.id);
    setSelectedVersion(option.versions[0] ?? '');
    setSubmissionError('');
  };

  const submitBot = () => {
    if (!submissionRoom || submissionRoom.status !== '모집 중') {
      setSubmissionError('모집 중인 방에서만 봇을 제출하거나 교체할 수 있습니다.');
      return;
    }
    if (!selectedOption?.eligible || !selectedVersion || !selectedRun) {
      setSubmissionError('제출 가능한 봇과 완료된 백테스트가 있는 전략 버전을 선택하세요.');
      return;
    }

    const existing = submissions.find((submission) => (
      submission.roomId === submissionRoom.id
      && submission.isMine
      && submission.status !== '철회'
    ));
    const nextSubmission: RoomSubmission = {
      id: existing?.id ?? `room-submission-${Date.now()}`,
      roomId: submissionRoom.id,
      participantName: '나',
      botId: selectedOption.bot.id,
      botName: selectedOption.bot.name,
      strategyVersion: selectedVersion,
      status: '제출 완료',
      submittedAt: new Date().toISOString(),
      isMine: true,
      metrics: toCompetitionMetrics(selectedRun),
    };

    setSubmissions((current) => existing
      ? current.map((submission) => submission.id === existing.id ? nextSubmission : submission)
      : [...current, nextSubmission]);
    setRooms((current) => current.map((room) => (
      room.id === submissionRoom.id
        ? { ...room, joined: true, members: existing ? room.members : room.members + 1 }
        : room
    )));
    setSubmissionRoomId(null);
    setDetailTab('overview');
  };

  const withdrawMySubmission = (room: Room) => {
    if (room.status !== '모집 중' || !activeMySubmission) return;
    setSubmissions((current) => current.map((submission) => (
      submission.id === activeMySubmission.id
        ? {
            ...submission,
            status: '철회',
            metrics: undefined,
          }
        : submission
    )));
    setRooms((current) => current.map((item) => (
      item.id === room.id
        ? { ...item, joined: false, members: Math.max(0, item.members - 1) }
        : item
    )));
  };

  const openManagement = (room: Room) => {
    setManageRoomId(room.id);
    setManagementStart(room.competitionStart ?? '');
    setManagementEnd(room.competitionEnd ?? '');
    setManagementError('');
    setManagementConfirm(null);
  };

  const changeRecruitment = () => {
    if (!manageRoom) return;
    if (manageRoom.status === '모집 중' && managementConfirm !== 'stop') {
      setManagementConfirm('stop');
      return;
    }
    const nextStatus = manageRoom.status === '모집 중'
      ? '모집 중단'
      : '모집 중';
    setRooms((current) => current.map((room) => (
      room.id === manageRoom.id ? { ...room, status: nextStatus } : room
    )));
    addOperation(
      manageRoom.id,
      nextStatus === '모집 중단' ? '모집 중단' : '모집 시작',
      nextStatus === '모집 중단'
        ? `새 제출과 봇 교체를 중단했습니다. 기존 제출 ${submittedCount}건은 유지됩니다.`
        : '새 제출과 모집 기간 내 봇 교체를 다시 허용했습니다.',
    );
    setManagementConfirm(null);
  };

  const saveCompetitionSchedule = () => {
    if (!manageRoom || !managementStart || !managementEnd) {
      setManagementError('변경할 대회 시작일과 종료일을 모두 입력하세요.');
      return;
    }
    if (managementStart > managementEnd) {
      setManagementError('대회 종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    const previousPeriod = manageRoom.period;
    const nextPeriod = formatPeriod(managementStart, managementEnd);
    setRooms((current) => current.map((room) => (
      room.id === manageRoom.id
        ? {
            ...room,
            competitionStart: managementStart,
            competitionEnd: managementEnd,
            period: nextPeriod,
          }
        : room
    )));
    addOperation(
      manageRoom.id,
      '대회 일정 변경',
      `${previousPeriod}에서 ${nextPeriod}(으)로 변경했습니다. 제출 ${submittedCount}건의 참가자 화면에 변경 내역이 표시됩니다.`,
    );
    setManagementError('');
  };

  const endCompetition = () => {
    if (!manageRoom) return;
    if (managementConfirm !== 'end') {
      setManagementConfirm('end');
      return;
    }
    setRooms((current) => current.map((room) => (
      room.id === manageRoom.id ? { ...room, status: '종료' } : room
    )));
    setSubmissions((current) => current.map((submission) => (
      submission.roomId === manageRoom.id && submission.status === '제출 완료'
        ? { ...submission, status: '변경 잠금' }
        : submission
    )));
    addOperation(
      manageRoom.id,
      '대회 종료',
      `성과 집계를 종료하고 제출 ${submittedCount}건을 잠갔습니다. 전략과 주문 기록은 계속 비공개로 유지됩니다.`,
    );
    setManagementConfirm(null);
    setManageRoomId(null);
  };

  const withdrawParticipant = () => {
    if (!participantAction || !detailRoom?.mine) return;
    setSubmissions((current) => current.map((submission) => (
      submission.id === participantAction.id
        ? { ...submission, status: '철회', metrics: undefined }
        : submission
    )));
    setRooms((current) => current.map((room) => (
      room.id === participantAction.roomId
        ? { ...room, members: Math.max(0, room.members - 1) }
        : room
    )));
    addOperation(
      participantAction.roomId,
      '참가 제출 철회 처리',
      `${participantAction.participantName}의 제출을 철회 상태로 변경했습니다. 성과 비교에서 즉시 제외됩니다.`,
    );
    setParticipantActionId(null);
  };

  const renderOverview = (room: Room) => (
    <div className="room-detail-view">
      <div className="room-facts room-facts--phase5">
        <div><CalendarDays size={15} /><span>대회 기간<strong>{room.period}</strong></span></div>
        <div><Users size={15} /><span>참가자<strong>{room.members}명</strong></span></div>
        <div><Bot size={15} /><span>제출 한도<strong>1인 {room.submissionLimit ?? 1}개</strong></span></div>
        <div><ShieldCheck size={15} /><span>운영 유형<strong>{room.official ? '공식 방' : '개인 방'}</strong></span></div>
      </div>

      {activeMySubmission && (
        <section className={`my-room-submission is-${activeMySubmission.status === '변경 잠금' ? 'locked' : 'submitted'}`}>
          <span>{activeMySubmission.status === '변경 잠금' ? <Lock size={16} /> : <CheckCircle2 size={16} />}</span>
          <div>
            <small>내 참여 봇</small>
            <strong>{activeMySubmission.botName} · {activeMySubmission.strategyVersion}</strong>
            <p>
              {activeMySubmission.status === '변경 잠금'
                ? '대회가 시작되어 봇과 전략 버전을 변경할 수 없습니다.'
                : '모집 기간에는 제출을 철회하거나 다른 봇으로 교체할 수 있습니다.'}
            </p>
          </div>
        </section>
      )}

      <section className="room-detail__section">
        <div className="room-section-title">
          <div><span className="eyebrow">COMMON RULES</span><h3>모든 봇에 같은 비교 기준</h3></div>
          <SlidersHorizontal size={17} />
        </div>
        <dl className="competition-rule-grid">
          <div><dt>시작 자본</dt><dd>{room.initialCapital}</dd></div>
          <div><dt>종목 범위</dt><dd>{room.universeRule}</dd></div>
          <div><dt>벤치마크</dt><dd>{room.benchmark}</dd></div>
          <div><dt>체결 기준</dt><dd>{room.executionRule}</dd></div>
          <div><dt>비용 기준</dt><dd>{room.costRule}</dd></div>
        </dl>
      </section>

      <section className="room-privacy-fixed">
        <EyeOff size={18} />
        <div>
          <strong>전략 비공개는 선택 항목이 아닌 고정 원칙입니다</strong>
          <p>성과 비교에는 지표와 봇 별칭만 사용합니다. 전략 구조, 선택 종목, 포지션과 주문 기록은 공유하지 않습니다.</p>
        </div>
      </section>

      <footer className="room-detail__actions room-detail__actions--phase5">
        {!room.mine && !activeMySubmission && room.status === '모집 중' && (
          <button type="button" className="button button--primary" onClick={() => openSubmission(room)}>
            <Bot size={14} /> 참여할 봇 선택
          </button>
        )}
        {!room.mine && !activeMySubmission && room.status !== '모집 중' && (
          <button type="button" className="button button--ghost" disabled title="모집 중인 방에서만 제출할 수 있습니다.">
            <Lock size={14} /> 현재 참여할 수 없음
          </button>
        )}
        {!room.mine && activeMySubmission && room.status === '모집 중' && (
          <>
            <button type="button" className="button button--primary" onClick={() => openSubmission(room)}>
              <RefreshCw size={14} /> 참여 봇 교체
            </button>
            <button type="button" className="button button--ghost" onClick={() => withdrawMySubmission(room)}>
              참여 철회
            </button>
          </>
        )}
        {!room.mine && activeMySubmission && room.status !== '모집 중' && (
          <button type="button" className="button button--primary" onClick={() => setDetailTab('ranking')}>
            <BarChart3 size={14} /> 성과 비교 보기
          </button>
        )}
        {room.mine && (
          <button type="button" className="button button--primary" onClick={() => openManagement(room)}>
            <SlidersHorizontal size={14} /> 방 운영 관리
          </button>
        )}
      </footer>
    </div>
  );

  const renderRanking = (room: Room) => (
    <div className="room-detail-view">
      <header className="comparison-toolbar">
        <div>
          <span className="eyebrow">PERFORMANCE VIEW</span>
          <h3>내가 선택한 지표로 정렬</h3>
          <p>정렬 기준은 사용자가 직접 선택하며, 특정 전략이나 참가자를 추천하지 않습니다.</p>
        </div>
        <div className="comparison-controls">
          <label>
            <span>정렬 지표</span>
            <select value={metricKey} onChange={(event) => setMetricKey(event.target.value as CompetitionMetricKey)}>
              {competitionMetricKeys.map((key) => <option key={key} value={key}>{metricLabels[key]}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setSortDirection((current) => current === 'descending' ? 'ascending' : 'descending')}
          >
            {sortDirection === 'descending' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            {sortDirection === 'descending' ? '큰 값부터' : '작은 값부터'}
          </button>
        </div>
      </header>

      <section className="metric-context">
        <BarChart3 size={17} />
        <div><strong>{metricLabels[metricKey]}</strong><p>{metricDescriptions[metricKey]}</p></div>
        <span>모의 성과</span>
      </section>

      {rankedSubmissions.length ? (
        <div className="competition-table-wrap">
          <table className="competition-table">
            <thead>
              <tr>
                <th>정렬 위치</th>
                <th>봇 별칭</th>
                {competitionMetricKeys.map((key) => (
                  <th key={key} className={metricKey === key ? 'is-selected' : ''}>{metricLabels[key]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankedSubmissions.map((submission, index) => (
                <tr key={submission.id} className={submission.isMine ? 'is-mine' : ''}>
                  <td><b>{index + 1}</b>{submission.isMine && <span>내 봇</span>}</td>
                  <td><strong>{submission.botName}</strong><small>{submission.strategyVersion} · 전략 비공개</small></td>
                  {competitionMetricKeys.map((key) => (
                    <td key={key} className={metricKey === key ? 'is-selected' : ''}>{submission.metrics?.[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="room-empty-state">
          <BarChart3 size={24} />
          <strong>아직 비교할 성과가 없습니다</strong>
          <p>{room.status === '모집 중' ? '대회 시작 후 같은 기준으로 계산된 지표가 표시됩니다.' : '성과 집계가 완료되면 지표별로 정렬할 수 있습니다.'}</p>
        </div>
      )}

      <div className="comparison-footnote">
        <AlertCircle size={15} />
        <p>화면의 값은 실행형 샘플용 모의 데이터입니다. 과거 또는 모의 성과는 실제 결과를 보장하지 않습니다.</p>
      </div>
    </div>
  );

  const renderParticipants = (room: Room) => (
    <div className="room-detail-view">
      <div className="participant-summary">
        <article><UserCheck size={17} /><span>제출 완료<strong>{submittedCount}명</strong></span></article>
        <article><Clock3 size={17} /><span>제출 대기<strong>{waitingCount}명</strong></span></article>
        <article><Users size={17} /><span>현재 참가<strong>{room.members}명</strong></span></article>
      </div>

      <header className="participant-tools">
        <div>
          <h3>참가자와 제출 현황</h3>
          <p>운영자는 제출 여부만 확인하며 전략 내부는 열람할 수 없습니다.</p>
        </div>
        <div className="room-filter-chips" aria-label="참가자 상태 필터">
          {([
            ['all', '전체'],
            ['submitted', '제출 완료'],
            ['waiting', '대기·철회'],
          ] as [ParticipantFilter, string][]).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={participantFilter === id ? 'is-active' : ''}
              onClick={() => setParticipantFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="participant-list">
        {visibleParticipants.map((submission) => (
          <article key={submission.id}>
            <span className={`submission-state-icon is-${submissionStatusTone[submission.status]}`}>
              {submission.status === '철회'
                ? <XCircle size={16} />
                : submission.status === '제출 대기'
                  ? <Clock3 size={16} />
                  : submission.status === '변경 잠금'
                    ? <Lock size={16} />
                    : <Check size={16} />}
            </span>
            <div>
              <strong>{submission.participantName}{submission.isMine && <em>나</em>}</strong>
              <p>
                {submission.botName
                  ? `${submission.botName} · ${submission.strategyVersion} · 전략 비공개`
                  : '아직 봇을 제출하지 않았습니다.'}
              </p>
            </div>
            <span className={`submission-state is-${submissionStatusTone[submission.status]}`}>{submission.status}</span>
            {room.mine && ['제출 완료', '변경 잠금'].includes(submission.status) && room.status !== '종료' && (
              <button type="button" onClick={() => setParticipantActionId(submission.id)}>제출 철회</button>
            )}
          </article>
        ))}
        {!visibleParticipants.length && (
          <div className="room-empty-state room-empty-state--compact">
            <Users size={22} />
            <strong>해당 상태의 참가자가 없습니다</strong>
          </div>
        )}
      </div>
    </div>
  );

  const renderOperations = (room: Room) => (
    <div className="room-detail-view">
      <section className={`room-permission-card is-${room.official ? 'official' : 'private'}`}>
        {room.official ? <Crown size={18} /> : <ShieldCheck size={18} />}
        <div>
          <span>{room.official ? '공식 방 권한' : '개인 방 권한'}</span>
          <strong>{room.official ? '공통 기준 고정과 공식 공지' : '모집·일정·참가 제출 관리'}</strong>
          <p>
            {room.official
              ? '공식 운영자만 비교 기준과 전체 공지를 관리하며 모든 변경은 감사 이력에 남습니다.'
              : '개인 운영자는 모집, 일정, 참가 상태를 관리할 수 있지만 공식 배지와 공식 기준은 사용할 수 없습니다.'}
          </p>
        </div>
      </section>

      <header className="operation-heading">
        <div><span className="eyebrow">AUDIT TRAIL</span><h3>운영 변경 이력</h3></div>
        {room.mine && <button type="button" className="button button--primary" onClick={() => openManagement(room)}><SlidersHorizontal size={14} /> 운영 관리</button>}
      </header>

      <div className="room-operation-list">
        {roomOperations.map((operation, index) => (
          <article key={operation.id}>
            <span><History size={15} /></span>
            <div>
              <strong>{operation.title}</strong>
              <p>{operation.detail}</p>
              <small>{formatRoomDateTime(operation.createdAt)} · {operation.actor}</small>
            </div>
            {index === 0 && <em>최근</em>}
          </article>
        ))}
        {!roomOperations.length && (
          <div className="room-empty-state">
            <History size={24} />
            <strong>아직 운영 변경 이력이 없습니다</strong>
            <p>모집, 일정, 참가 상태 변경이 발생하면 시간순으로 기록됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="page rooms-page rooms-page--phase5">
      <div className="rooms-head">
        <PageTitle
          eyebrow="COMPETITION ROOMS"
          title="대회 방"
          description="전략은 비공개로 유지하고, 같은 기준의 모의 성과를 원하는 지표로 비교하세요."
        />
        <button
          type="button"
          className={activeTab === 'create' ? 'button button--ghost' : 'button button--primary'}
          onClick={() => showTab(activeTab === 'create' ? 'browse' : 'create')}
        >
          {activeTab === 'create' ? <><ArrowLeft size={14} /> 목록으로</> : <><Plus size={14} /> 방 만들기</>}
        </button>
      </div>

      {activeTab !== 'create' && (
        <nav className="room-tabs" aria-label="방 범위">
          {([
            ['browse', '둘러보기'],
            ['joined', '참여 중'],
            ['mine', '내가 만든 방'],
          ] as [RoomTab, string][]).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={activeTab === id ? 'is-active' : ''}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => showTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {activeTab === 'create' ? (
        <div className="room-create-layout">
          <section className="room-form surface">
            <header className="room-create-intro">
              <span className="eyebrow">NEW PRIVATE ROOM</span>
              <h2>새 개인 대회 방 만들기</h2>
              <p>참가자의 전략을 받지 않고, 모든 봇에 적용할 공통 비교 기준만 정합니다.</p>
            </header>

            <fieldset className="room-form-group">
              <legend>1. 기본 정보</legend>
              <div className="form-stack">
                <label className="field"><span>방 이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="방 목적이 드러나는 이름" /></label>
              </div>
            </fieldset>

            <fieldset className="room-form-group">
              <legend>2. 일정과 제출</legend>
              <div className="form-stack">
                <div className="field-grid">
                  <label className="field"><span>모집 시작</span><input type="date" value={recruitmentStart} onChange={(event) => setRecruitmentStart(event.target.value)} /></label>
                  <label className="field"><span>모집 종료</span><input type="date" value={recruitmentEnd} onChange={(event) => setRecruitmentEnd(event.target.value)} /></label>
                </div>
                <div className="field-grid">
                  <label className="field"><span>대회 시작</span><input type="date" value={competitionStart} onChange={(event) => setCompetitionStart(event.target.value)} /></label>
                  <label className="field"><span>대회 종료</span><input type="date" value={competitionEnd} onChange={(event) => setCompetitionEnd(event.target.value)} /></label>
                </div>
                <label className="field"><span>사용자당 제출 봇 수</span><input type="number" min="1" value={submissionLimit} onChange={(event) => setSubmissionLimit(event.target.value)} /></label>
              </div>
            </fieldset>

            <fieldset className="room-form-group">
              <legend>3. 공통 비교 기준</legend>
              <div className="form-stack">
                <label className="field"><span>시작 가상자금</span><input value={initialCapital} onChange={(event) => setInitialCapital(event.target.value)} placeholder="대회에 동일하게 적용할 가상자금" /></label>
                <label className="field"><span>허용 종목 범위</span><input value={universeRule} onChange={(event) => setUniverseRule(event.target.value)} placeholder="참가자가 선택할 수 있는 데이터 범위" /></label>
                <label className="field"><span>비교 벤치마크</span><input value={benchmark} onChange={(event) => setBenchmark(event.target.value)} placeholder="성과 비교에 사용할 기준 이름" /></label>
                <label className="field"><span>모의 체결 기준</span><input value={executionRule} onChange={(event) => setExecutionRule(event.target.value)} placeholder="시장 시간과 체결 처리 방식" /></label>
                <label className="field"><span>비용 기준</span><input value={costRule} onChange={(event) => setCostRule(event.target.value)} placeholder="수수료와 슬리피지 적용 방식" /></label>
              </div>
            </fieldset>

            <div className="privacy-note"><ShieldCheck size={16} /><p>전략 비공개는 고정됩니다. 운영자도 참가자의 전략 구조, 선택 종목, 포지션과 주문 기록을 열람할 수 없습니다.</p></div>
            {creationError && <p className="form-error" role="alert">{creationError}</p>}
            <button type="button" className="button button--primary" onClick={createRoom}>입력 확인 후 방 생성</button>
          </section>

          <aside className="create-checklist surface">
            <span className="eyebrow">READY CHECK</span>
            <h3>생성 준비</h3>
            <p>작성 중에는 막지 않고, 생성할 때 필수 입력과 날짜 순서를 한 번에 확인합니다.</p>
            <div className="create-checklist__items">
              <CheckItem done={Boolean(name.trim())} label="방 이름" />
              <CheckItem done={Boolean(recruitmentStart && recruitmentEnd && competitionStart && competitionEnd)} label="모집·대회 일정" />
              <CheckItem done={Boolean(submissionLimit)} label="제출 봇 수" />
              <CheckItem done={Boolean(initialCapital && universeRule && benchmark && executionRule && costRule)} label="공통 비교 기준 5개" />
            </div>
            <section className="create-permission-note">
              <ShieldCheck size={16} />
              <div><strong>개인 방으로 생성</strong><p>공식 배지와 공식 운영 권한은 부여되지 않습니다.</p></div>
            </section>
          </aside>
        </div>
      ) : (
        <div className="rooms-browser rooms-browser--phase5">
          <section className="room-index">
            <header className="room-index__tools">
              <label className="room-search">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="방 이름 또는 운영자 검색" />
              </label>
              <div className="room-filter-row">
                <div className="room-filter-chips" aria-label="방 목록 필터">
                  {([
                    ['all', '전체'],
                    ['recruiting', '모집 중'],
                    ['official', '공식'],
                  ] as [RoomFilter, string][]).map(([id, label]) => (
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
                <span className="room-result-count">{visible.length}개</span>
              </div>
            </header>

            <div className="room-list" aria-label="방 목록">
              {visible.map((room) => {
                const mySubmission = submissions.find((submission) => (
                  submission.roomId === room.id && submission.isMine && submission.status !== '철회'
                ));
                return (
                  <button
                    type="button"
                    key={room.id}
                    className={detailRoom?.id === room.id ? 'is-active' : ''}
                    aria-pressed={detailRoom?.id === room.id}
                    onClick={() => setSelectedId(room.id)}
                  >
                    <span className={`room-status-dot is-${statusTone[room.status]}`} aria-hidden="true" />
                    <span className="room-list__copy">
                      <span>
                        <small>{room.status}</small>
                        {room.official && <b><Crown size={10} /> 공식</b>}
                        {mySubmission && <b className="is-joined"><Check size={10} /> 참여</b>}
                      </span>
                      <strong>{room.name}</strong>
                      <em>{room.period} · {room.members}명</em>
                    </span>
                  </button>
                );
              })}
              {!visible.length && (
                <div className="room-list-empty">
                  <Search size={21} />
                  <strong>조건에 맞는 방이 없습니다</strong>
                  <p>검색어를 지우거나 다른 필터를 선택해 보세요.</p>
                </div>
              )}
            </div>
          </section>

          {detailRoom ? (
            <aside className="room-detail room-detail--phase5">
              <header className="room-detail__header">
                <div>
                  <div className="room-detail__badges">
                    <span className={`room-status is-${statusTone[detailRoom.status]}`}>{detailRoom.status}</span>
                    <span>{detailRoom.official ? '공식 운영' : '개인 운영'}</span>
                    {activeMySubmission && <span className="is-participating"><Check size={10} /> 참여 중</span>}
                  </div>
                  <h2>{detailRoom.name}</h2>
                  <p>{detailRoom.owner} 운영</p>
                </div>
                <button
                  type="button"
                  className={savedRoomIds.includes(detailRoom.id) ? 'is-saved' : ''}
                  aria-label={savedRoomIds.includes(detailRoom.id) ? '저장한 방에서 제거' : '방 저장'}
                  aria-pressed={savedRoomIds.includes(detailRoom.id)}
                  title={savedRoomIds.includes(detailRoom.id) ? '저장됨' : '나중에 볼 방으로 저장'}
                  onClick={() => toggleSaved(detailRoom.id)}
                >
                  <Bookmark size={16} fill={savedRoomIds.includes(detailRoom.id) ? 'currentColor' : 'none'} />
                </button>
              </header>

              <nav className="room-detail-tabs" aria-label="방 상세 정보">
                {([
                  ['overview', '안내', ShieldCheck],
                  ['ranking', '성과 비교', BarChart3],
                  ['participants', detailRoom.mine ? '제출 관리' : '참가 현황', Users],
                  ['operations', '운영 이력', Activity],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    type="button"
                    key={id}
                    className={detailTab === id ? 'is-active' : ''}
                    aria-current={detailTab === id ? 'page' : undefined}
                    onClick={() => setDetailTab(id)}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </nav>

              {detailTab === 'overview' && renderOverview(detailRoom)}
              {detailTab === 'ranking' && renderRanking(detailRoom)}
              {detailTab === 'participants' && renderParticipants(detailRoom)}
              {detailTab === 'operations' && renderOperations(detailRoom)}
            </aside>
          ) : (
            <aside className="room-detail room-detail--empty">
              <Trophy size={25} />
              <strong>방을 선택하세요</strong>
              <p>목록에서 방을 선택하면 공통 기준, 참여 상태와 성과 비교를 확인할 수 있습니다.</p>
            </aside>
          )}
        </div>
      )}

      {submissionRoom && (
        <Modal
          title={activeMySubmission?.roomId === submissionRoom.id ? '참여 봇 교체' : '참여할 봇 선택'}
          onClose={() => setSubmissionRoomId(null)}
          wide
        >
          <div className="submission-modal-intro">
            <span><Bot size={19} /></span>
            <div>
              <strong>완료된 백테스트가 있는 봇만 제출할 수 있습니다</strong>
              <p>봇을 선택한 뒤 사용할 전략 버전을 확인하세요. 대회가 시작되면 선택이 잠깁니다.</p>
            </div>
          </div>

          <div className="submission-bot-list" role="radiogroup" aria-label="제출 봇">
            {submissionOptions.map((option) => (
              <button
                type="button"
                key={option.bot.id}
                role="radio"
                aria-checked={selectedBotId === option.bot.id}
                aria-disabled={!option.eligible}
                className={`${selectedBotId === option.bot.id ? 'is-selected' : ''} ${option.eligible ? '' : 'is-disabled'}`}
                onClick={() => selectBot(option)}
              >
                <span className="submission-radio">{selectedBotId === option.bot.id && option.eligible && <Check size={12} />}</span>
                <span className="submission-bot-copy">
                  <span><strong>{option.bot.name}</strong><em>{option.bot.version}</em></span>
                  <small>{option.bot.strategy} · {option.bot.state === 'running' ? '실행 중' : option.bot.state === 'paused' ? '일시정지' : option.bot.state === 'stopped' ? '중단' : option.bot.state === 'attention' ? '조치 필요' : '운영 종료'}</small>
                  <p className={option.eligible ? 'is-eligible' : ''}>
                    {option.eligible
                      ? `제출 가능 · 완료 백테스트 ${option.completedRuns.length}개`
                      : option.reason}
                  </p>
                </span>
                {option.eligible ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              </button>
            ))}
          </div>

          {selectedOption?.eligible && (
            <section className="submission-version-panel">
              <label className="field">
                <span>제출할 전략 버전</span>
                <select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)}>
                  {selectedOption.versions.map((version) => <option key={version}>{version}</option>)}
                </select>
              </label>
              <div>
                <span>확인한 백테스트</span>
                <strong>{selectedRun ? formatRoomDateTime(selectedRun.updatedAt) : '선택 필요'}</strong>
                <small>대회에서는 아래 공통 기준으로 성과를 다시 계산합니다.</small>
              </div>
            </section>
          )}

          <dl className="submission-rule-summary">
            <div><dt>시작 자본</dt><dd>{submissionRoom.initialCapital}</dd></div>
            <div><dt>종목 범위</dt><dd>{submissionRoom.universeRule}</dd></div>
            <div><dt>비용·체결</dt><dd>{submissionRoom.costRule} · {submissionRoom.executionRule}</dd></div>
          </dl>

          <section className="room-privacy-fixed room-privacy-fixed--modal">
            <EyeOff size={18} />
            <div><strong>제출해도 전략은 공개되지 않습니다</strong><p>다른 참가자는 봇 별칭과 여섯 가지 모의 성과 지표만 확인합니다.</p></div>
          </section>

          {submissionError && <p className="form-error" role="alert">{submissionError}</p>}
          <div className="modal-actions">
            <button type="button" className="button button--ghost" onClick={() => setSubmissionRoomId(null)}>취소</button>
            <button type="button" className="button button--primary" onClick={submitBot}>
              {activeMySubmission?.roomId === submissionRoom.id ? '선택한 봇으로 교체' : '선택한 봇 제출'}
            </button>
          </div>
        </Modal>
      )}

      {manageRoom && (
        <Modal title="방 운영 관리" onClose={() => setManageRoomId(null)} wide>
          <section className={`room-permission-card is-${manageRoom.official ? 'official' : 'private'}`}>
            {manageRoom.official ? <Crown size={18} /> : <ShieldCheck size={18} />}
            <div>
              <span>{manageRoom.official ? '공식 방' : '개인 방'}</span>
              <strong>{manageRoom.official ? '공식 운영 권한' : '개인 운영 권한'}</strong>
              <p>{manageRoom.official ? '공통 기준과 공지를 관리하고 모든 변경을 감사 이력에 남깁니다.' : '모집, 일정, 참가 제출과 종료를 관리할 수 있습니다. 공식 배지는 사용할 수 없습니다.'}</p>
            </div>
          </section>

          <div className="management-impact-grid">
            <article><Users size={17} /><span>영향 참가자<strong>{manageRoom.members}명</strong></span></article>
            <article><CheckCircle2 size={17} /><span>제출 유지<strong>{submittedCount}건</strong></span></article>
            <article><Clock3 size={17} /><span>제출 대기<strong>{waitingCount}건</strong></span></article>
          </div>

          <section className="management-section">
            <header><div><h3>모집 상태</h3><p>중단해도 기존 제출은 유지되며 새 제출과 봇 교체만 멈춥니다.</p></div><span className={`room-status is-${statusTone[manageRoom.status]}`}>{manageRoom.status}</span></header>
            {['예정', '모집 중', '모집 중단'].includes(manageRoom.status) && (
              <div className="management-action">
                <button type="button" className="button button--ghost" onClick={changeRecruitment}>
                  {manageRoom.status === '모집 중' ? <><PauseCircle size={14} /> 모집 중단</> : <><Activity size={14} /> 모집 시작·재개</>}
                </button>
                {managementConfirm === 'stop' && (
                  <div className="inline-confirm">
                    <AlertCircle size={15} />
                    <p>새 제출과 참가자의 봇 교체가 즉시 중단됩니다. 기존 제출 {submittedCount}건은 유지됩니다.</p>
                    <button type="button" onClick={changeRecruitment}>중단 확인</button>
                    <button type="button" onClick={() => setManagementConfirm(null)}>취소</button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="management-section">
            <header><div><h3>대회 일정 변경</h3><p>저장 전에 현재 참가자와 잠금 시점에 미치는 영향을 확인하세요.</p></div></header>
            <div className="field-grid">
              <label className="field"><span>대회 시작</span><input type="date" value={managementStart} onChange={(event) => setManagementStart(event.target.value)} /></label>
              <label className="field"><span>대회 종료</span><input type="date" value={managementEnd} onChange={(event) => setManagementEnd(event.target.value)} /></label>
            </div>
            <div className="schedule-impact">
              <CalendarDays size={15} />
              <p>시작일이 되면 제출 {submittedCount}건의 봇과 전략 버전이 잠기고, 참가자에게 변경된 일정이 표시됩니다.</p>
            </div>
            <button type="button" className="button button--ghost" onClick={saveCompetitionSchedule}>일정 변경 저장</button>
          </section>

          <section className="management-section management-section--danger">
            <header><div><h3>대회 종료</h3><p>성과 집계를 멈추고 모든 제출을 잠급니다. 전략 비공개 원칙은 종료 후에도 유지됩니다.</p></div></header>
            <button type="button" className="button button--danger" disabled={manageRoom.status === '종료'} onClick={endCompetition}>
              대회 종료
            </button>
            {managementConfirm === 'end' && (
              <div className="inline-confirm is-danger">
                <AlertCircle size={15} />
                <p>참가자 {manageRoom.members}명의 성과 집계를 종료합니다. 이 샘플에서는 종료 후 되돌릴 수 없습니다.</p>
                <button type="button" onClick={endCompetition}>종료 확인</button>
                <button type="button" onClick={() => setManagementConfirm(null)}>취소</button>
              </div>
            )}
          </section>

          {managementError && <p className="form-error" role="alert">{managementError}</p>}
          <div className="modal-actions">
            <button type="button" className="button button--primary" onClick={() => setManageRoomId(null)}>완료</button>
          </div>
        </Modal>
      )}

      {participantAction && (
        <Modal title="참가 제출 철회" onClose={() => setParticipantActionId(null)}>
          <div className="participant-withdraw-confirm">
            <span><AlertCircle size={20} /></span>
            <div>
              <strong>{participantAction.participantName}의 제출을 철회할까요?</strong>
              <p>성과 비교에서 즉시 제외되고 운영 이력에 처리 시간과 영향이 기록됩니다. 전략 내용은 열람하지 않습니다.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button--ghost" onClick={() => setParticipantActionId(null)}>취소</button>
            <button type="button" className="button button--danger" onClick={withdrawParticipant}>제출 철회 처리</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
