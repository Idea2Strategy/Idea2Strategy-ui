import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ArrowUpRight,
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
  모의투자 화면 초안 (#54, 임시).

  이전 초안이 전부 "방 목록"이었고, 정작 이 페이지에 오는 첫 질문인 "내 봇이 지금
  몇 위인가"에 답하지 않았다. 홈에는 이미 참여 중인 대회 요약이 있고 이 페이지가
  그 목적지인데도, 내 순위는 상세 페이지 안에만 있었다.

  그래서 정보 모델부터 다시 잡았다.
  - 새로 넣은 것: 내 순위/내 수익률(목록에서), 대회 길이(11일 대회인지 3개월
    시즌인지), 남은 참가 슬롯.
  - 뺀 것: 진행률 막대(정확도도 의미도 낮다), 모든 대회가 같은 공통 조건(시작
    자본·수수료·슬리피지 — 상세에서 한 번만), 공식 대회의 개설자(항상 운영팀).
  - 기본 정렬은 마감 임박(D- 짧은 순). 필터는 실제로 동작한다.

  클래스는 cdraft- 로 격리했고, 안을 고르면 이 파일과 /drafts 라우트는 삭제한다.
*/

type DraftId = 'mine' | 'dense' | 'buckets';
type Kind = 'official-live' | 'official-backtest' | 'general';
type Status = '모집 중' | '진행 중';
type SortKey = 'dday' | 'name' | 'bots' | 'length';

interface DraftCompetition {
  name: string;
  kind: Kind;
  scoring: string;
  bots: number;
  dday: number;
  /* 대회 길이(일). "11일 스프린트냐 3개월 시즌이냐"는 참가 판단의 핵심인데
     지금 화면에는 날짜 범위만 있어서 감이 오지 않았다. */
  lengthDays: number;
  status: Status;
  host: string;
  period: string;
  myBot: string | null;
  myRank: number | null;
  myReturn: string | null;
  entryLimit: number;
  usedSlots: number;
}

const KIND_META: Record<Kind, { label: string; icon: LucideIcon; basis: string }> = {
  'official-live': { label: '공식 라이브', icon: Radio, basis: '진행 기간의 실시간 시세로 채점' },
  'official-backtest': { label: '공식 백테스트', icon: History, basis: '같은 과거 구간을 다시 돌려 채점' },
  general: { label: '일반', icon: Users, basis: '사용자가 열고 실시간 시세로 채점' },
};

const SCORINGS = ['표준점수제', '위험조정 점수제', '수익률 점수제', '샤프 점수제', '백테스팅'];

const COMPETITIONS: DraftCompetition[] = [
  { name: 'ETF Sprint', kind: 'official-live', scoring: '수익률 점수제', bots: 128, dday: 5, lengthDays: 11, status: '모집 중', host: 'I2S 운영팀', period: '07.21–08.01', myBot: 'ETF Runner', myRank: 2, myReturn: '+12.44%', entryLimit: 3, usedSlots: 1 },
  { name: 'Earnings Play', kind: 'general', scoring: '수익률 점수제', bots: 9, dday: 7, lengthDays: 21, status: '진행 중', host: '실적시즌', period: '07.22–08.12', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Momentum Lab', kind: 'general', scoring: '표준점수제', bots: 8, dday: 8, lengthDays: 28, status: '진행 중', host: '이서준', period: '07.07–08.04', myBot: 'Room Beta', myRank: 2, myReturn: '+11.85%', entryLimit: 3, usedSlots: 1 },
  { name: 'Gap Hunters', kind: 'general', scoring: '수익률 점수제', bots: 15, dday: 11, lengthDays: 28, status: '진행 중', host: '한지민', period: '07.10–08.07', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Backtesting Challenge', kind: 'official-backtest', scoring: '백테스팅', bots: 42, dday: 12, lengthDays: 30, status: '모집 중', host: 'I2S 운영팀', period: '08.01–08.31', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Swing Lab 12', kind: 'general', scoring: '표준점수제', bots: 6, dday: 21, lengthDays: 28, status: '진행 중', host: '윤도현', period: '07.20–08.17', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'ETF Discipline', kind: 'general', scoring: '위험조정 점수제', bots: 18, dday: 29, lengthDays: 42, status: '모집 중', host: 'ETF연구회', period: '07.14–08.25', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Dividend Guard', kind: 'general', scoring: '샤프 점수제', bots: 7, dday: 32, lengthDays: 42, status: '모집 중', host: '배당사냥꾼', period: '07.17–08.28', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Macro Pulse', kind: 'general', scoring: '표준점수제', bots: 12, dday: 46, lengthDays: 70, status: '모집 중', host: '거시경제방', period: '07.03–09.11', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Slow Turtle', kind: 'general', scoring: '위험조정 점수제', bots: 5, dday: 55, lengthDays: 77, status: '모집 중', host: '거북이클럽', period: '07.05–09.20', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'Low Volatility Club', kind: 'general', scoring: '샤프 점수제', bots: 24, dday: 61, lengthDays: 87, status: '진행 중', host: '차분한투자', period: '07.01–09.26', myBot: null, myRank: null, myReturn: null, entryLimit: 3, usedSlots: 0 },
  { name: 'I2S Summer League', kind: 'official-live', scoring: '표준점수제', bots: 184, dday: 65, lengthDays: 92, status: '진행 중', host: 'I2S 운영팀', period: '07.01–09.30', myBot: 'Room Beta', myRank: 1, myReturn: '+13.18%', entryLimit: 5, usedSlots: 3 },
];

const DRAFTS: Array<{ id: DraftId; name: string; idea: string; spec: string }> = [
  {
    id: 'mine',
    name: 'A · 내 성적표 먼저',
    idea: '이 페이지의 첫 질문은 "내 봇이 몇 위인가"다. 참가 중인 대회를 위에 성적표로 두고, 아래에 참가할 대회를 마감 임박 순으로 놓는다. 두 가지 일(추적 / 탐색)을 블록으로 분리한다.',
    spec: '폭 1280 · 성적표 카드 min 320 · 표 행 60 · 열 96/1fr/136/80/104 · 여백 24/16',
  },
  {
    id: 'dense',
    name: 'B · 한 표에 전부',
    idea: '블록을 나누지 않고 한 표에 다 넣는다. 첫 열이 내 상태(순위 또는 미참가)라 스캔 한 번에 내 판과 남의 판이 같이 읽힌다. 필터는 표 위 한 줄, 헤더 클릭으로 정렬.',
    spec: '폭 1280 · 표 전폭 · 행 56 · 열 92/88/1fr/128/72/96 · 여백 24/16',
  },
  {
    id: 'buckets',
    name: 'C · 마감 구간 묶음',
    idea: '마감이 이 도메인의 시간축이다. 이번 주 / 이번 달 / 그 이후로 묶으면 급한 것이 구조적으로 위에 온다. 정렬을 설명할 필요가 없어진다.',
    spec: '폭 1232 · 묶음 헤더 40 · 행 64 · 열 1fr/128/88/108 · 여백 24/12',
  },
];

/* ── 공용 조각 ───────────────────────────────────────────────────────────── */

const KindChip = ({ kind, size = 'md' }: { kind: Kind; size?: 'sm' | 'md' }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className={`cdraft-kind is-${size}`} data-kind={kind}>
    <Icon size={size === 'sm' ? 11 : 12} aria-hidden="true" />
    {meta.label}
  </span>;
};

const Scoring = ({ scoring }: { scoring: string }) => <span className="cdraft-scoring" data-scoring={scoring}>{scoring}</span>;

/* 마감은 항상 D-day와 대회 길이를 함께 읽는다. 3일 남은 11일 대회와 3일 남은
   3개월 시즌은 전혀 다른 결정이다. */
const Deadline = ({ competition }: { competition: DraftCompetition }) => <span className="cdraft-deadline">
  <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
  <small>{`${competition.lengthDays}일 대회`}</small>
</span>;

const MyRank = ({ competition }: { competition: DraftCompetition }) => (
  competition.myRank
    ? <span className="cdraft-myrank">
      <b>{`${competition.myRank}위`}</b>
      <small>{competition.myReturn}</small>
    </span>
    : <span className="cdraft-myrank is-idle"><em>미참가</em></span>
);

interface FilterState {
  query: string;
  kinds: Kind[];
  scorings: string[];
  participation: 'all' | 'joined' | 'open';
  urgency: 'all' | '7' | '30';
  sort: SortKey;
}

const EMPTY_FILTERS: FilterState = {
  query: '',
  kinds: [],
  scorings: [],
  participation: 'all',
  urgency: 'all',
  /* 기본 정렬은 마감 임박 순. */
  sort: 'dday',
};

const useCompetitionFilters = () => {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const patch = (next: Partial<FilterState>) => setFilters((current) => ({ ...current, ...next }));
  const toggleKind = (kind: Kind) => patch({
    kinds: filters.kinds.includes(kind) ? filters.kinds.filter((item) => item !== kind) : [...filters.kinds, kind],
  });
  const toggleScoring = (scoring: string) => patch({
    scorings: filters.scorings.includes(scoring) ? filters.scorings.filter((item) => item !== scoring) : [...filters.scorings, scoring],
  });
  const results = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const matched = COMPETITIONS.filter((competition) => {
      const matchesQuery = !query
        || competition.name.toLowerCase().includes(query)
        || competition.host.toLowerCase().includes(query);
      const matchesKind = filters.kinds.length === 0 || filters.kinds.includes(competition.kind);
      const matchesScoring = filters.scorings.length === 0 || filters.scorings.includes(competition.scoring);
      const matchesParticipation = filters.participation === 'all'
        || (filters.participation === 'joined' ? Boolean(competition.myBot) : !competition.myBot);
      const matchesUrgency = filters.urgency === 'all' || competition.dday <= Number(filters.urgency);
      return matchesQuery && matchesKind && matchesScoring && matchesParticipation && matchesUrgency;
    });
    return matched.sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name);
      if (filters.sort === 'bots') return b.bots - a.bots;
      if (filters.sort === 'length') return a.lengthDays - b.lengthDays;
      return a.dday - b.dday;
    });
  }, [filters]);
  const active = filters.kinds.length + filters.scorings.length
    + (filters.participation === 'all' ? 0 : 1)
    + (filters.urgency === 'all' ? 0 : 1)
    + (filters.query ? 1 : 0);
  return { filters, patch, toggleKind, toggleScoring, results, active, reset: () => setFilters(EMPTY_FILTERS) };
};

type FilterApi = ReturnType<typeof useCompetitionFilters>;

/* 필터 한 줄. 세 초안이 같은 컨트롤을 공유하므로 초안 간 차이는 구조에만 있다. */
function FilterBar({ api, showParticipation = true }: { api: FilterApi; showParticipation?: boolean }) {
  const { filters, patch, toggleKind, toggleScoring, active, reset } = api;
  return <div className="cdraft-filters">
    <label className="cdraft-search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        aria-label="대회 검색"
        placeholder="대회명 또는 개설자"
        value={filters.query}
        onChange={(event) => patch({ query: event.target.value })}
      />
    </label>

    <div className="cdraft-chips" role="group" aria-label="대회 종류 필터">
      {(Object.keys(KIND_META) as Kind[]).map((kind) => <button
        key={kind}
        type="button"
        data-kind={kind}
        aria-pressed={filters.kinds.includes(kind)}
        className={filters.kinds.includes(kind) ? 'is-on' : ''}
        onClick={() => toggleKind(kind)}
      >{KIND_META[kind].label}</button>)}
    </div>

    <div className="cdraft-chips" role="group" aria-label="채점 방식 필터">
      {SCORINGS.map((scoring) => <button
        key={scoring}
        type="button"
        data-scoring={scoring}
        aria-pressed={filters.scorings.includes(scoring)}
        className={filters.scorings.includes(scoring) ? 'is-on' : ''}
        onClick={() => toggleScoring(scoring)}
      >{scoring}</button>)}
    </div>

    <div className="cdraft-segment" role="group" aria-label="마감 필터">
      {([['all', '전체 기간'], ['7', '7일 이내'], ['30', '30일 이내']] as const).map(([value, label]) => <button
        key={value}
        type="button"
        aria-pressed={filters.urgency === value}
        className={filters.urgency === value ? 'is-active' : ''}
        onClick={() => patch({ urgency: value })}
      >{label}</button>)}
    </div>

    {showParticipation && <div className="cdraft-segment" role="group" aria-label="참가 여부 필터">
      {([['all', '전체'], ['joined', '참가 중'], ['open', '미참가']] as const).map(([value, label]) => <button
        key={value}
        type="button"
        aria-pressed={filters.participation === value}
        className={filters.participation === value ? 'is-active' : ''}
        onClick={() => patch({ participation: value })}
      >{label}</button>)}
    </div>}

    <button type="button" className="cdraft-reset" disabled={active === 0} onClick={reset}>
      <RotateCcw size={13} aria-hidden="true" />{active === 0 ? '필터 없음' : `초기화 ${active}`}
    </button>
  </div>;
}

function PageHead({ line }: { line: string }) {
  return <header className="cdraft-page-head">
    <div>
      <p>BOT COMPETITION</p>
      <h1>모의투자</h1>
      <span>{line}</span>
    </div>
    <button type="button" className="cdraft-primary">대회 만들기</button>
  </header>;
}

function EmptyRow({ onReset }: { onReset: () => void }) {
  return <div className="cdraft-empty">
    <Search size={20} aria-hidden="true" />
    <strong>조건에 맞는 대회가 없어요.</strong>
    <button type="button" onClick={onReset}>필터 초기화</button>
  </div>;
}

/* ── A · 내 성적표 먼저 ──────────────────────────────────────────────────── */
function MineFirstDraft() {
  const api = useCompetitionFilters();
  const mine = COMPETITIONS.filter((competition) => competition.myBot)
    .sort((a, b) => a.dday - b.dday);
  const open = api.results.filter((competition) => !competition.myBot);
  return <div className="cdraft-page is-mine">
    <PageHead line={`내 봇이 대회 ${mine.length}개에서 뛰고 있어요. 가장 급한 마감은 ${mine[0].name} D-${mine[0].dday}예요.`} />

    <section className="cdraft-block" aria-label="참가 중인 대회">
      <header className="cdraft-block-head">
        <div><h2>참가 중인 대회</h2><p>내 봇의 현재 순위예요. 순위는 마감까지 계속 바뀝니다.</p></div>
        <span className="cdraft-count">{`${mine.length}개`}</span>
      </header>
      <div className="cdraft-scorecards">
        {mine.map((competition) => <button type="button" className="cdraft-scorecard" key={competition.name} data-kind={competition.kind}>
          <header>
            <KindChip kind={competition.kind} size="sm" />
            <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
          </header>
          <strong className="cdraft-scorecard-name">{competition.name}</strong>
          <div className="cdraft-scorecard-rank">
            <span>
              <em>{competition.myRank}</em>
              <small>{`/ ${competition.bots}위`}</small>
            </span>
            <span className="cdraft-scorecard-return">
              <small>내 수익률</small>
              <b>{competition.myReturn}</b>
            </span>
          </div>
          <footer>
            <span>{competition.myBot}</span>
            <span className="cdraft-open">순위 보기<ArrowUpRight size={13} aria-hidden="true" /></span>
          </footer>
        </button>)}
      </div>
    </section>

    <section className="cdraft-block" aria-label="참가할 대회">
      <header className="cdraft-block-head">
        <div><h2>참가할 대회</h2><p>마감이 가까운 순서예요. 채점 방식이 내 전략과 맞는지 보고 고르세요.</p></div>
        <span className="cdraft-count">{`${open.length}개`}</span>
      </header>
      <FilterBar api={api} showParticipation={false} />
      {open.length === 0 ? <EmptyRow onReset={api.reset} /> : <div className="cdraft-table is-mine-table">
        <div className="cdraft-thead">
          <span className="is-num">마감</span>
          <span>대회</span>
          <span>채점 방식</span>
          <span className="is-num">참여 봇</span>
          <span />
        </div>
        {open.map((competition) => <button type="button" className="cdraft-trow" key={competition.name}>
          <span className="is-num"><Deadline competition={competition} /></span>
          <span className="cdraft-name">
            <strong>{competition.name}</strong>
            <small><KindChip kind={competition.kind} size="sm" />{competition.kind === 'general' && competition.host}</small>
          </span>
          <span><Scoring scoring={competition.scoring} /></span>
          <span className="is-num"><b>{competition.bots}</b></span>
          <span className="cdraft-cta">참가<ArrowUpRight size={13} aria-hidden="true" /></span>
        </button>)}
      </div>}
    </section>
  </div>;
}

/* ── B · 한 표에 전부 ───────────────────────────────────────────────────── */
function DenseDraft() {
  const api = useCompetitionFilters();
  const { filters, patch, results } = api;
  const joined = COMPETITIONS.filter((competition) => competition.myBot).length;
  const columns: Array<{ key: SortKey | null; label: string; num?: boolean }> = [
    { key: null, label: '내 순위', num: true },
    { key: 'dday', label: '마감', num: true },
    { key: 'name', label: '대회' },
    { key: null, label: '채점 방식' },
    { key: 'bots', label: '참여 봇', num: true },
    { key: 'length', label: '길이', num: true },
  ];
  return <div className="cdraft-page is-dense">
    <PageHead line={`대회 ${COMPETITIONS.length}개 중 ${joined}개에 참가 중이에요. 마감이 가까운 순서로 보여줘요.`} />
    <FilterBar api={api} />
    {results.length === 0 ? <EmptyRow onReset={api.reset} /> : <div className="cdraft-table is-dense-table">
      <div className="cdraft-thead">
        {columns.map((column) => column.key
          ? <button
            type="button"
            key={column.label}
            className={`${column.num ? 'is-num' : ''}${filters.sort === column.key ? ' is-sorted' : ''}`}
            onClick={() => patch({ sort: column.key as SortKey })}
          >{column.label}<i aria-hidden="true">{filters.sort === column.key ? '▲' : '↕'}</i></button>
          : <span key={column.label} className={column.num ? 'is-num' : ''}>{column.label}</span>)}
      </div>
      {results.map((competition) => <button
        type="button"
        className={`cdraft-trow${competition.myBot ? ' is-mine' : ''}`}
        key={competition.name}
      >
        <span className="is-num"><MyRank competition={competition} /></span>
        <span className="is-num"><b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b></span>
        <span className="cdraft-name">
          <strong>{competition.name}</strong>
          <small>{competition.kind === 'general' ? competition.host : KIND_META[competition.kind].basis}</small>
        </span>
        <span><KindChip kind={competition.kind} size="sm" /><Scoring scoring={competition.scoring} /></span>
        <span className="is-num"><b>{competition.bots}</b></span>
        <span className="is-num"><b>{`${competition.lengthDays}일`}</b></span>
      </button>)}
    </div>}
  </div>;
}

/* ── C · 마감 구간 묶음 ─────────────────────────────────────────────────── */
const BUCKETS: Array<{ id: string; label: string; hint: string; test: (dday: number) => boolean }> = [
  { id: 'week', label: '이번 주 마감', hint: '지금 결정해야 하는 대회예요.', test: (dday) => dday <= 7 },
  { id: 'month', label: '이번 달 마감', hint: '전략을 다듬을 시간이 있어요.', test: (dday) => dday > 7 && dday <= 30 },
  { id: 'later', label: '그 이후', hint: '길게 보는 시즌 대회예요.', test: (dday) => dday > 30 },
];

function BucketsDraft() {
  const api = useCompetitionFilters();
  const { results } = api;
  const urgent = results.filter((competition) => competition.dday <= 7).length;
  return <div className="cdraft-page is-buckets">
    <PageHead line={`이번 주에 마감하는 대회가 ${urgent}개예요. 급한 것부터 묶어서 보여줘요.`} />
    <FilterBar api={api} />
    {results.length === 0 ? <EmptyRow onReset={api.reset} /> : <div className="cdraft-buckets">
      {BUCKETS.map((bucket) => {
        const rows = results.filter((competition) => bucket.test(competition.dday));
        if (rows.length === 0) return null;
        return <section className="cdraft-bucket" key={bucket.id} data-bucket={bucket.id}>
          <header>
            <h2>{bucket.label}</h2>
            <p>{bucket.hint}</p>
            <span className="cdraft-count">{`${rows.length}개`}</span>
          </header>
          <div className="cdraft-bucket-rows">
            {rows.map((competition) => <button type="button" className="cdraft-bucket-row" key={competition.name}>
              <span className="cdraft-name">
                <strong>{competition.name}</strong>
                <small><KindChip kind={competition.kind} size="sm" />{competition.kind === 'general' ? competition.host : KIND_META[competition.kind].basis}</small>
              </span>
              <span><Scoring scoring={competition.scoring} /></span>
              <span className="is-num"><b>{competition.bots}</b><small>참여 봇</small></span>
              <span className="is-num">
                {competition.myBot
                  ? <span className="cdraft-joined"><Check size={13} aria-hidden="true" />{`${competition.myRank}위`}</span>
                  : <span className="cdraft-cta">참가<ArrowUpRight size={13} aria-hidden="true" /></span>}
              </span>
            </button>)}
          </div>
        </section>;
      })}
    </div>}
  </div>;
}

const DRAFT_VIEWS: Record<DraftId, () => ReactElement> = {
  mine: MineFirstDraft,
  dense: DenseDraft,
  buckets: BucketsDraft,
};

export function CompetitionDrafts() {
  const [draft, setDraft] = useState<DraftId>('mine');
  const active = DRAFTS.find((item) => item.id === draft) ?? DRAFTS[0];
  const View = DRAFT_VIEWS[draft];
  return <Localized><div className="cdraft-root">
    <nav className="cdraft-switch" aria-label="모의투자 화면 초안">
      <span className="cdraft-switch-label"><Trophy size={14} aria-hidden="true" />모의투자 초안 #54</span>
      <div>
        {DRAFTS.map((item) => <button
          key={item.id}
          type="button"
          aria-pressed={draft === item.id}
          className={draft === item.id ? 'is-active' : ''}
          onClick={() => setDraft(item.id)}
        >{item.name}</button>)}
      </div>
    </nav>
    <p className="cdraft-idea">{active.idea}</p>
    <p className="cdraft-spec">{active.spec}</p>
    <View key={draft} />
  </div></Localized>;
}
