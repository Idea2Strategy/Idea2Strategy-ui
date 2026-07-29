import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ArrowRight,
  Check,
  History,
  Radio,
  RotateCcw,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Localized } from '../lib/i18n';

/*
  모의투자 초안 5차 (#54, 임시) — 배치 확정 전 비교용 A·B안.

  이번에는 "무엇을 어디에"를 먼저 확정하고 그렸다.

  목록에 보여주는 것: 이름 · 종류 칩 · 채점 배지 · D-day(기본 정렬 축) ·
  참여 봇 수 · 개설자(일반만) · 내 순위(참가 중일 때만).
  상세로 미룬 것: 기간 날짜범위, 진행률 %, 시작자본·수수료·슬리피지(모든
  대회 동일), 설명 문장.

  두 안 모두 원래 구조(왼쪽 필터 레일 + 오른쪽 게시판, 공식이 일반 위에
  고정)를 유지한다. 차이는 공식 대회의 형태뿐이다.

  A안 — 공식도 행. 게시판 안의 두 섹션이 같은 열 그리드를 공유해 가장
        보수적이고 밀도가 높다.
  B안 — 공식만 카드 3장으로 승격. 카드(종류색 테두리) vs 행이라는 형태
        차이가 공식/일반을 가른다. 이미지는 쓰지 않는다.

  필터는 일반 대회에만 적용된다(공식은 3개뿐이고 항상 보여야 하는 기준점).
  레일 제목에 "일반 대회 필터"로 명시한다. 클래스는 cdraft- 로 격리하고,
  안이 확정되면 이 화면은 삭제한다.
*/

type DraftId = 'A' | 'B';
type Kind = 'official-live' | 'official-backtest' | 'general';
type StatusFilter = 'all' | '모집 중' | '진행 중';
type JoinFilter = 'all' | 'joined' | 'open';
type UrgencyFilter = 'all' | '7' | '30';

interface Competition {
  name: string;
  kind: Kind;
  scoring: string;
  bots: number;
  dday: number;
  status: '모집 중' | '진행 중';
  host: string;
  myBot: string | null;
  myRank: number | null;
}

const KIND_META: Record<Kind, { label: string; icon: LucideIcon }> = {
  'official-live': { label: '라이브', icon: Radio },
  'official-backtest': { label: '백테스트', icon: History },
  general: { label: '일반', icon: Users },
};

const SCORINGS = ['표준점수제', '위험조정 점수제', '수익률 점수제', '샤프 점수제'];

const OFFICIAL: Competition[] = [
  { name: 'ETF Sprint', kind: 'official-live', scoring: '수익률 점수제', bots: 128, dday: 5, status: '모집 중', host: 'I2S 운영팀', myBot: 'ETF Runner', myRank: 2 },
  { name: 'Backtesting Challenge', kind: 'official-backtest', scoring: '백테스팅', bots: 42, dday: 12, status: '모집 중', host: 'I2S 운영팀', myBot: null, myRank: null },
  { name: 'I2S Summer League', kind: 'official-live', scoring: '표준점수제', bots: 184, dday: 65, status: '진행 중', host: 'I2S 운영팀', myBot: 'Room Beta', myRank: 1 },
];

const GENERAL: Competition[] = [
  { name: 'Earnings Play', kind: 'general', scoring: '수익률 점수제', bots: 9, dday: 7, status: '진행 중', host: '실적시즌', myBot: null, myRank: null },
  { name: 'Momentum Lab', kind: 'general', scoring: '표준점수제', bots: 8, dday: 8, status: '진행 중', host: '이서준', myBot: 'Room Beta', myRank: 2 },
  { name: 'Gap Hunters', kind: 'general', scoring: '수익률 점수제', bots: 15, dday: 11, status: '진행 중', host: '한지민', myBot: null, myRank: null },
  { name: 'Swing Lab 12', kind: 'general', scoring: '표준점수제', bots: 6, dday: 21, status: '진행 중', host: '윤도현', myBot: null, myRank: null },
  { name: 'ETF Discipline', kind: 'general', scoring: '위험조정 점수제', bots: 18, dday: 29, status: '모집 중', host: 'ETF연구회', myBot: null, myRank: null },
  { name: 'Dividend Guard', kind: 'general', scoring: '샤프 점수제', bots: 7, dday: 32, status: '모집 중', host: '배당사냥꾼', myBot: null, myRank: null },
  { name: 'Macro Pulse', kind: 'general', scoring: '표준점수제', bots: 12, dday: 46, status: '모집 중', host: '거시경제방', myBot: null, myRank: null },
  { name: 'Slow Turtle', kind: 'general', scoring: '위험조정 점수제', bots: 5, dday: 55, status: '모집 중', host: '거북이클럽', myBot: null, myRank: null },
  { name: 'Low Volatility Club', kind: 'general', scoring: '샤프 점수제', bots: 24, dday: 61, status: '진행 중', host: '차분한투자', myBot: null, myRank: null },
];

const MY_COUNT = [...OFFICIAL, ...GENERAL].filter((competition) => competition.myBot).length;
const MOST_URGENT = [...OFFICIAL, ...GENERAL]
  .filter((competition) => competition.myBot)
  .sort((a, b) => a.dday - b.dday)[0];

/* ── 공용 조각 ───────────────────────────────────────────────────────────── */

const KindChip = ({ kind }: { kind: Kind }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className="cdraft-kind" data-kind={kind}>
    <Icon size={11} aria-hidden="true" />{meta.label}
  </span>;
};

const Scoring = ({ scoring }: { scoring: string }) => <span className="cdraft-scoring" data-scoring={scoring}>{scoring}</span>;

const Dday = ({ competition }: { competition: Competition }) => <b
  className={`cdraft-dday${competition.dday <= 7 ? ' is-urgent' : ''}`}
>{`D-${competition.dday}`}</b>;

/* 마지막 칸: 참가 중이면 내 순위, 아니면 참가 CTA. */
const RowAction = ({ competition }: { competition: Competition }) => (
  competition.myBot
    ? <span className="cdraft-mine-badge"><Check size={12} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>
    : <span className="cdraft-cta">참가</span>
);

interface Filters {
  query: string;
  status: StatusFilter;
  join: JoinFilter;
  scorings: string[];
  urgency: UrgencyFilter;
}

const EMPTY_FILTERS: Filters = { query: '', status: 'all', join: 'all', scorings: [], urgency: 'all' };

const useFilters = () => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const patch = (next: Partial<Filters>) => setFilters((current) => ({ ...current, ...next }));
  const toggleScoring = (scoring: string) => patch({
    scorings: filters.scorings.includes(scoring)
      ? filters.scorings.filter((item) => item !== scoring)
      : [...filters.scorings, scoring],
  });
  /* 기본 정렬은 마감 임박(D- 짧은 순) 하나로 못박는다. */
  const rows = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return GENERAL.filter((competition) => {
      const matchesQuery = !query
        || competition.name.toLowerCase().includes(query)
        || competition.host.toLowerCase().includes(query);
      const matchesStatus = filters.status === 'all' || competition.status === filters.status;
      const matchesJoin = filters.join === 'all'
        || (filters.join === 'joined' ? Boolean(competition.myBot) : !competition.myBot);
      const matchesScoring = filters.scorings.length === 0 || filters.scorings.includes(competition.scoring);
      const matchesUrgency = filters.urgency === 'all' || competition.dday <= Number(filters.urgency);
      return matchesQuery && matchesStatus && matchesJoin && matchesScoring && matchesUrgency;
    }).sort((a, b) => a.dday - b.dday);
  }, [filters]);
  const activeCount = (filters.query ? 1 : 0)
    + (filters.status === 'all' ? 0 : 1)
    + (filters.join === 'all' ? 0 : 1)
    + filters.scorings.length
    + (filters.urgency === 'all' ? 0 : 1);
  return { filters, patch, toggleScoring, rows, activeCount, reset: () => setFilters(EMPTY_FILTERS) };
};

type FilterApi = ReturnType<typeof useFilters>;

/* 왼쪽 필터 레일 — 원래 구조의 필터 항목 그대로, 가독성만 고친다.
   라벨은 13px, 항목 행 높이 34px, 그룹 제목이 항상 보인다. */
function FilterRail({ api }: { api: FilterApi }) {
  const { filters, patch, toggleScoring, activeCount, reset } = api;
  const radioRow = (
    name: string,
    checked: boolean,
    label: string,
    onChange: () => void,
  ) => <label className="cdraft-option is-radio" key={`${name}-${label}`}>
    <input type="radio" name={name} checked={checked} onChange={onChange} />
    <span className="cdraft-option-box" aria-hidden="true"><Check size={12} /></span>
    <span className="cdraft-option-text">{label}</span>
  </label>;
  return <aside className="cdraft-rail" aria-label="일반 대회 필터">
    <header>
      <strong>일반 대회 필터</strong>
      <button type="button" disabled={activeCount === 0} onClick={reset}>
        <RotateCcw size={12} aria-hidden="true" />초기화{activeCount > 0 && ` ${activeCount}`}
      </button>
    </header>
    <label className="cdraft-search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        aria-label="대회 검색"
        placeholder="대회명 · 개설자"
        value={filters.query}
        onChange={(event) => patch({ query: event.target.value })}
      />
    </label>
    <fieldset>
      <legend>진행 상태</legend>
      {([['all', '전체'], ['모집 중', '모집 중'], ['진행 중', '진행 중']] as const)
        .map(([value, label]) => radioRow('status', filters.status === value, label, () => patch({ status: value })))}
    </fieldset>
    <fieldset>
      <legend>참가 상태</legend>
      {([['all', '전체'], ['joined', '참가 중'], ['open', '미참가']] as const)
        .map(([value, label]) => radioRow('join', filters.join === value, label, () => patch({ join: value })))}
    </fieldset>
    <fieldset>
      <legend>채점 방식</legend>
      {SCORINGS.map((scoring) => <label className="cdraft-option" key={scoring}>
        <input type="checkbox" checked={filters.scorings.includes(scoring)} onChange={() => toggleScoring(scoring)} />
        <span className="cdraft-option-box" aria-hidden="true"><Check size={12} /></span>
        <span className="cdraft-option-text">{scoring}</span>
      </label>)}
    </fieldset>
    <fieldset>
      <legend>남은 기간</legend>
      {([['all', '전체'], ['7', '7일 이내'], ['30', '30일 이내']] as const)
        .map(([value, label]) => radioRow('urgency', filters.urgency === value, label, () => patch({ urgency: value })))}
    </fieldset>
  </aside>;
}

/* 일반 대회 행 — 두 안이 공유. 이름+개설자 | 채점 | D-day | 봇 | 액션. */
function GeneralSection({ api }: { api: FilterApi }) {
  const { rows, reset } = api;
  return <section className="cdraft-board-section" aria-label="일반 대회 목록">
    <header className="cdraft-board-head">
      <h3>일반 대회</h3>
      <span>{`${rows.length}개 · 마감 임박 순`}</span>
    </header>
    {rows.length === 0
      ? <div className="cdraft-empty">
        <Search size={20} aria-hidden="true" />
        <strong>조건에 맞는 대회가 없어요.</strong>
        <button type="button" onClick={reset}>필터 초기화</button>
      </div>
      : <div role="list">
        {rows.map((competition) => <button type="button" className="cdraft-row" role="listitem" key={competition.name}>
          <span className="cdraft-row-name">
            <strong>{competition.name}</strong>
            <small>{`${competition.host} · ${competition.status}`}</small>
          </span>
          <span className="cdraft-row-cell"><Scoring scoring={competition.scoring} /></span>
          <span className="cdraft-row-cell is-num"><Dday competition={competition} /><small>마감</small></span>
          <span className="cdraft-row-cell is-num"><b>{competition.bots}</b><small>참여 봇</small></span>
          <span className="cdraft-row-cell is-action"><RowAction competition={competition} /></span>
          <ArrowRight className="cdraft-row-arrow" size={15} aria-hidden="true" />
        </button>)}
      </div>}
  </section>;
}

function PageHead() {
  return <header className="cdraft-page-head">
    <div>
      <p>BOT COMPETITION</p>
      <h1>모의투자</h1>
      <span>{`내 봇이 대회 ${MY_COUNT}개에서 뛰고 있어요. 가장 급한 마감은 ${MOST_URGENT.name} D-${MOST_URGENT.dday}예요.`}</span>
    </div>
    <button type="button" className="cdraft-primary">대회 만들기</button>
  </header>;
}

/* ── A안: 공식도 행 ──────────────────────────────────────────────────────── */
function DraftA() {
  const api = useFilters();
  return <div className="cdraft-page">
    <PageHead />
    <div className="cdraft-layout">
      <FilterRail api={api} />
      <div className="cdraft-board">
        <section className="cdraft-board-section is-official" aria-label="공식 대회 목록">
          <header className="cdraft-board-head">
            <h3><Trophy size={14} aria-hidden="true" />공식 대회</h3>
            <span>운영팀 주최 · 필터와 무관하게 항상 표시</span>
          </header>
          <div role="list">
            {OFFICIAL.map((competition) => <button type="button" className="cdraft-row is-official" role="listitem" key={competition.name}>
              <span className="cdraft-row-name">
                <strong><KindChip kind={competition.kind} />{competition.name}</strong>
                <small>{competition.status}</small>
              </span>
              <span className="cdraft-row-cell"><Scoring scoring={competition.scoring} /></span>
              <span className="cdraft-row-cell is-num"><Dday competition={competition} /><small>마감</small></span>
              <span className="cdraft-row-cell is-num"><b>{competition.bots}</b><small>참여 봇</small></span>
              <span className="cdraft-row-cell is-action"><RowAction competition={competition} /></span>
              <ArrowRight className="cdraft-row-arrow" size={15} aria-hidden="true" />
            </button>)}
          </div>
        </section>
        <GeneralSection api={api} />
      </div>
    </div>
  </div>;
}

/* ── B안: 공식만 카드 ───────────────────────────────────────────────────── */
function DraftB() {
  const api = useFilters();
  return <div className="cdraft-page">
    <PageHead />
    <div className="cdraft-layout">
      <FilterRail api={api} />
      <div className="cdraft-board">
        <section className="cdraft-board-section is-official" aria-label="공식 대회 목록">
          <header className="cdraft-board-head">
            <h3><Trophy size={14} aria-hidden="true" />공식 대회</h3>
            <span>운영팀 주최 · 필터와 무관하게 항상 표시</span>
          </header>
          <div className="cdraft-cards" role="list">
            {OFFICIAL.map((competition) => <button type="button" className="cdraft-card" role="listitem" data-kind={competition.kind} key={competition.name}>
              <span className="cdraft-card-top">
                <KindChip kind={competition.kind} />
                <Dday competition={competition} />
              </span>
              <strong className="cdraft-card-name">{competition.name}</strong>
              <span className="cdraft-card-meta">
                <Scoring scoring={competition.scoring} />
                <em>{`참여 봇 ${competition.bots}`}</em>
              </span>
              <span className="cdraft-card-foot">
                <RowAction competition={competition} />
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>)}
          </div>
        </section>
        <GeneralSection api={api} />
      </div>
    </div>
  </div>;
}

const VIEWS: Record<DraftId, () => ReactElement> = { A: DraftA, B: DraftB };

export function CompetitionDrafts() {
  const [draft, setDraft] = useState<DraftId>('B');
  const View = VIEWS[draft];
  return <Localized><div className="cdraft-root">
    <nav className="cdraft-switch" aria-label="모의투자 배치안">
      <span className="cdraft-switch-label"><Trophy size={14} aria-hidden="true" />모의투자 배치안 #54 — 원래 구조 유지</span>
      <div>
        <button type="button" aria-pressed={draft === 'A'} className={draft === 'A' ? 'is-active' : ''} onClick={() => setDraft('A')}>A · 공식도 행</button>
        <button type="button" aria-pressed={draft === 'B'} className={draft === 'B' ? 'is-active' : ''} onClick={() => setDraft('B')}>B · 공식만 카드</button>
      </div>
    </nav>
    <View key={draft} />
  </div></Localized>;
}
