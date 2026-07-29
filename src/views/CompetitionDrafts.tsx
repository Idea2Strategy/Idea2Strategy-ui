import { useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import {
  ArrowRight,
  BadgeCheck,
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
import alphaDashArt from '../assets/competition-v2/alpha-dash.png';
import dividendMarathonArt from '../assets/competition-v2/dividend-marathon.png';
import etfSprintArt from '../assets/competition-v2/etf-sprint.png';
import summerLeagueArt from '../assets/competition-v2/i2s-summer-league.png';
import riskControlArt from '../assets/competition-v2/risk-control-cup.png';
import volatilityShieldArt from '../assets/competition-v2/volatility-shield.png';

/*
  모의투자 초안 6차 (#54, 임시) — A·B·C 비교 + 공식 대회 수 조절.

  A안 — 원래 구조(레일+게시판) 그대로, 공식도 행. 두 섹션이 같은 열 그리드.
  B안 — 원래 구조, 공식만 종류색 테두리 카드. 이미지 없음.
  C안 — 5차 직전 안: 내 대회 현황 스트립 + 공식 아트워크 카드 + 일반은
        탭·검색·정렬의 자기설명 행 리스트(필터 레일 없음).

  공식 대회는 시즌에 따라 0~6개가 동시에 열릴 수 있다. 상단 컨트롤로 개수를
  바꿔가며 각 안이 어떻게 버티는지 본다: 0개(빈 상태), 1개(카드 한 장이 전폭을
  못 채울 때), 4~6개(줄바꿈). 클래스는 cdraft-/cdraftc- 로 격리, 확정 후 삭제.
*/

type DraftId = 'A' | 'B' | 'C';
type Kind = 'official-live' | 'official-backtest' | 'general';
type StatusFilter = 'all' | '모집 중' | '진행 중';
type JoinFilter = 'all' | 'joined' | 'open';
type UrgencyFilter = 'all' | '7' | '30';
type SortKey = 'dday' | 'bots' | 'name';

interface Competition {
  name: string;
  kind: Kind;
  scoring: string;
  bots: number;
  dday: number;
  lengthDays: number;
  status: '모집 중' | '진행 중';
  host: string;
  period: string;
  myBot: string | null;
  myRank: number | null;
  myReturn: string | null;
  tagline: string;
}

const KIND_META: Record<Kind, { label: string; icon: LucideIcon }> = {
  'official-live': { label: '라이브', icon: Radio },
  'official-backtest': { label: '백테스트', icon: History },
  general: { label: '일반', icon: Users },
};

const SCORINGS = ['표준점수제', '위험조정 점수제', '수익률 점수제', '샤프 점수제'];

const ARTWORK: Record<string, string> = {
  'ETF Sprint': etfSprintArt,
  'Risk Control Cup': riskControlArt,
  'Backtesting Challenge': alphaDashArt,
  'Volatility Shield': volatilityShieldArt,
  'Dividend Marathon': dividendMarathonArt,
  'I2S Summer League': summerLeagueArt,
};

/* 마감 임박 순. 개수 컨트롤은 이 배열의 앞에서부터 자른다. */
const OFFICIAL_ALL: Competition[] = [
  { name: 'ETF Sprint', kind: 'official-live', scoring: '수익률 점수제', bots: 128, dday: 5, lengthDays: 11, status: '모집 중', host: 'I2S 운영팀', period: '07.21–08.01', myBot: 'ETF Runner', myRank: 2, myReturn: '+12.44%', tagline: '11일 안에 누가 가장 많이 벌었나' },
  { name: 'Risk Control Cup', kind: 'official-live', scoring: '위험조정 점수제', bots: 66, dday: 9, lengthDays: 30, status: '진행 중', host: 'I2S 운영팀', period: '07.10–08.09', myBot: null, myRank: null, myReturn: null, tagline: '떨어질 때 덜 잃는 전략이 이긴다' },
  { name: 'Backtesting Challenge', kind: 'official-backtest', scoring: '백테스팅', bots: 42, dday: 12, lengthDays: 30, status: '모집 중', host: 'I2S 운영팀', period: '08.01–08.31', myBot: null, myRank: null, myReturn: null, tagline: '같은 과거 한 달, 내 전략은 몇 위였을까' },
  { name: 'Volatility Shield', kind: 'official-live', scoring: '샤프 점수제', bots: 51, dday: 23, lengthDays: 45, status: '진행 중', host: 'I2S 운영팀', period: '07.08–08.21', myBot: null, myRank: null, myReturn: null, tagline: '흔들리는 장에서 꾸준함을 증명하라' },
  { name: 'Dividend Marathon', kind: 'official-live', scoring: '표준점수제', bots: 73, dday: 40, lengthDays: 60, status: '모집 중', host: 'I2S 운영팀', period: '07.09–09.07', myBot: null, myRank: null, myReturn: null, tagline: '배당과 함께 달리는 60일' },
  { name: 'I2S Summer League', kind: 'official-live', scoring: '표준점수제', bots: 184, dday: 65, lengthDays: 92, status: '진행 중', host: 'I2S 운영팀', period: '07.01–09.30', myBot: 'Room Beta', myRank: 1, myReturn: '+13.18%', tagline: '한 시즌 동안 수익과 안정성을 함께' },
];

const GENERAL: Competition[] = [
  { name: 'Earnings Play', kind: 'general', scoring: '수익률 점수제', bots: 9, dday: 7, lengthDays: 21, status: '진행 중', host: '실적시즌', period: '07.22–08.12', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Momentum Lab', kind: 'general', scoring: '표준점수제', bots: 8, dday: 8, lengthDays: 28, status: '진행 중', host: '이서준', period: '07.07–08.04', myBot: 'Room Beta', myRank: 2, myReturn: '+11.85%', tagline: '' },
  { name: 'Gap Hunters', kind: 'general', scoring: '수익률 점수제', bots: 15, dday: 11, lengthDays: 28, status: '진행 중', host: '한지민', period: '07.10–08.07', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Swing Lab 12', kind: 'general', scoring: '표준점수제', bots: 6, dday: 21, lengthDays: 28, status: '진행 중', host: '윤도현', period: '07.20–08.17', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'ETF Discipline', kind: 'general', scoring: '위험조정 점수제', bots: 18, dday: 29, lengthDays: 42, status: '모집 중', host: 'ETF연구회', period: '07.14–08.25', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Dividend Guard', kind: 'general', scoring: '샤프 점수제', bots: 7, dday: 32, lengthDays: 42, status: '모집 중', host: '배당사냥꾼', period: '07.17–08.28', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Macro Pulse', kind: 'general', scoring: '표준점수제', bots: 12, dday: 46, lengthDays: 70, status: '모집 중', host: '거시경제방', period: '07.03–09.11', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Slow Turtle', kind: 'general', scoring: '위험조정 점수제', bots: 5, dday: 55, lengthDays: 77, status: '모집 중', host: '거북이클럽', period: '07.05–09.20', myBot: null, myRank: null, myReturn: null, tagline: '' },
  { name: 'Low Volatility Club', kind: 'general', scoring: '샤프 점수제', bots: 24, dday: 61, lengthDays: 87, status: '진행 중', host: '차분한투자', period: '07.01–09.26', myBot: null, myRank: null, myReturn: null, tagline: '' },
];

/* ── 공용 조각 ───────────────────────────────────────────────────────────── */

const KindChip = ({ kind, onImage = false }: { kind: Kind; onImage?: boolean }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className={`cdraft-kind${onImage ? ' is-on-image' : ''}`} data-kind={kind}>
    <Icon size={11} aria-hidden="true" />{meta.label}
  </span>;
};

const Scoring = ({ scoring }: { scoring: string }) => <span className="cdraft-scoring" data-scoring={scoring}>{scoring}</span>;

const Dday = ({ competition }: { competition: Competition }) => <b
  className={`cdraft-dday${competition.dday <= 7 ? ' is-urgent' : ''}`}
>{`D-${competition.dday}`}</b>;

const RowAction = ({ competition }: { competition: Competition }) => (
  competition.myBot
    ? <span className="cdraft-mine-badge"><Check size={12} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>
    : <span className="cdraft-cta">참가</span>
);

function OfficialEmpty() {
  return <div className="cdraft-official-empty">
    <Trophy size={18} aria-hidden="true" />
    <strong>지금 진행 중인 공식 대회가 없어요.</strong>
    <span>운영팀이 다음 시즌을 준비하고 있어요. 아래 일반 대회는 언제나 열려 있어요.</span>
  </div>;
}

function PageHead({ officials }: { officials: Competition[] }) {
  const mine = [...officials, ...GENERAL].filter((competition) => competition.myBot)
    .sort((a, b) => a.dday - b.dday);
  const line = mine.length > 0
    ? `내 봇이 대회 ${mine.length}개에서 뛰고 있어요. 가장 급한 마감은 ${mine[0].name} D-${mine[0].dday}예요.`
    : '아직 참가 중인 대회가 없어요. 모집 중인 대회에서 첫 도전을 시작해보세요.';
  return <header className="cdraft-page-head">
    <div>
      <p>BOT COMPETITION</p>
      <h1>모의투자</h1>
      <span>{line}</span>
    </div>
    <button type="button" className="cdraft-primary">대회 만들기</button>
  </header>;
}

interface Filters {
  query: string;
  status: StatusFilter;
  join: JoinFilter;
  scorings: string[];
  urgency: UrgencyFilter;
}

/*
  기본은 모집 중만. 이 페이지에 오는 목적은 "들어갈 방 찾기"이므로, 이미 닫힌
  진행 중 대회는 직접 골랐을 때만 보인다. 공식 핀은 예외로 항상 남는다.
*/
const EMPTY_FILTERS: Filters = { query: '', status: '모집 중', join: 'all', scorings: [], urgency: 'all' };

const useFilters = () => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const patch = (next: Partial<Filters>) => setFilters((current) => ({ ...current, ...next }));
  const toggleScoring = (scoring: string) => patch({
    scorings: filters.scorings.includes(scoring)
      ? filters.scorings.filter((item) => item !== scoring)
      : [...filters.scorings, scoring],
  });
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
    + (filters.status === EMPTY_FILTERS.status ? 0 : 1)
    + (filters.join === 'all' ? 0 : 1)
    + filters.scorings.length
    + (filters.urgency === 'all' ? 0 : 1);
  return { filters, patch, toggleScoring, rows, activeCount, reset: () => setFilters(EMPTY_FILTERS) };
};

type FilterApi = ReturnType<typeof useFilters>;

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
      {([['모집 중', '모집 중'], ['진행 중', '진행 중'], ['all', '전체']] as const)
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

/*
  게시판 행 — A·B가 공유한다. 개설자가 자기 컬럼을 갖고, 공식 대회는 그 자리에
  "공식" 배지가 앉아 목록을 훑을 때 바로 티가 난다.
*/
function BoardRow({ competition, pinned = false }: { competition: Competition; pinned?: boolean }) {
  return <button type="button" className={`cdraft-row${pinned ? ' is-pinned' : ''}`} role="listitem">
    <span className="cdraft-row-name">
      <strong>{pinned && <KindChip kind={competition.kind} />}{competition.name}</strong>
      <small>{competition.status}</small>
    </span>
    <span className="cdraft-row-cell is-host">
      {/* 공식은 글자 대신 인증마크. 색과 모양이 이름보다 먼저 읽힌다. */}
      {pinned
        ? <b className="cdraft-host-official" title="공식 대회" aria-label="공식 대회">
          <BadgeCheck size={16} aria-hidden="true" />Official
        </b>
        : competition.host}
    </span>
    <span className="cdraft-row-cell"><Scoring scoring={competition.scoring} /></span>
    <span className="cdraft-row-cell is-num"><Dday competition={competition} /><small>마감</small></span>
    <span className="cdraft-row-cell is-num"><b>{competition.bots}</b><small>참여 봇</small></span>
    <span className="cdraft-row-cell is-action"><RowAction competition={competition} /></span>
    <ArrowRight className="cdraft-row-arrow" size={15} aria-hidden="true" />
  </button>;
}

function FilterEmpty({ reset }: { reset: () => void }) {
  return <div className="cdraft-empty">
    <Search size={20} aria-hidden="true" />
    <strong>조건에 맞는 대회가 없어요.</strong>
    <button type="button" onClick={reset}>필터 초기화</button>
  </div>;
}

function GeneralSection({ api }: { api: FilterApi }) {
  const { rows, reset } = api;
  return <section className="cdraft-board-section" aria-label="일반 대회 목록">
    <header className="cdraft-board-head">
      <h3>일반 대회</h3>
      <span>{`${rows.length}개 · 마감 임박 순`}</span>
    </header>
    {rows.length === 0
      ? <FilterEmpty reset={reset} />
      : <div role="list">
        {rows.map((competition) => <BoardRow competition={competition} key={competition.name} />)}
      </div>}
  </section>;
}

/* ── A안: 한 테이블 + 공지핀 ─────────────────────────────────────────────── */
/*
  게시판 하나. 공식 대회는 커뮤니티 게시판의 공지 핀처럼 최상단에 몰려 있고,
  배경 틴트와 개설자 컬럼의 "공식" 배지로 구분된다. 필터는 일반 행에만 걸리고
  핀은 항상 남는다 — 공지가 검색에 밀려 사라지지 않는 것과 같다.
*/
function DraftA({ officials }: { officials: Competition[] }) {
  const api = useFilters();
  return <div className="cdraft-page">
    <PageHead officials={officials} />
    <div className="cdraft-layout">
      <FilterRail api={api} />
      <div className="cdraft-board">
        <section className="cdraft-board-section" aria-label="대회 목록">
          <header className="cdraft-board-head">
            <h3><Trophy size={14} aria-hidden="true" />대회 목록</h3>
            <span>{`공식 ${officials.length} · 일반 ${api.rows.length} · 마감 임박 순`}</span>
          </header>
          <div role="list">
            {officials.length === 0 && <div className="cdraft-pinned-empty">지금 진행 중인 공식 대회가 없어요. 운영팀이 다음 시즌을 준비하고 있어요.</div>}
            {officials.map((competition) => <BoardRow competition={competition} pinned key={competition.name} />)}
            {api.rows.map((competition) => <BoardRow competition={competition} key={competition.name} />)}
          </div>
          {api.rows.length === 0 && <FilterEmpty reset={api.reset} />}
        </section>
      </div>
    </div>
  </div>;
}

/* ── B안: 공식만 카드 ───────────────────────────────────────────────────── */
function DraftB({ officials }: { officials: Competition[] }) {
  const api = useFilters();
  return <div className="cdraft-page">
    <PageHead officials={officials} />
    <div className="cdraft-layout">
      <FilterRail api={api} />
      <div className="cdraft-board">
        <section className="cdraft-board-section is-official" aria-label="공식 대회 목록">
          <header className="cdraft-board-head">
            <h3><Trophy size={14} aria-hidden="true" />공식 대회</h3>
            <span>운영팀 주최 · 필터와 무관하게 항상 표시</span>
          </header>
          {officials.length === 0 ? <OfficialEmpty /> : <div className="cdraft-cards" role="list">
            {officials.map((competition) => <button type="button" className="cdraft-card" role="listitem" data-kind={competition.kind} key={competition.name}>
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
          </div>}
        </section>
        <GeneralSection api={api} />
      </div>
    </div>
  </div>;
}

/* ── C안: 5차 직전 안(스트립 + 아트워크 히어로 + 탭 리스트) ────────────────── */
const SORT_LABELS: Record<SortKey, string> = {
  dday: '마감 임박 순',
  bots: '참여 봇 많은 순',
  name: '이름 순',
};

function DraftC({ officials }: { officials: Competition[] }) {
  /* 기본 탭도 모집 중 — 들어갈 방을 찾으러 오는 페이지다. */
  const [tab, setTab] = useState<StatusFilter>('모집 중');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('dday');
  const mine = [...officials, ...GENERAL].filter((competition) => competition.myBot)
    .sort((a, b) => a.dday - b.dday);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return GENERAL.filter((competition) => {
      const matchesTab = tab === 'all' || competition.status === tab;
      const matchesQuery = !normalized
        || competition.name.toLowerCase().includes(normalized)
        || competition.host.toLowerCase().includes(normalized);
      return matchesTab && matchesQuery;
    }).sort((a, b) => {
      if (sort === 'bots') return b.bots - a.bots;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return a.dday - b.dday;
    });
  }, [tab, query, sort]);
  const tabCount = (status: StatusFilter) => (status === 'all'
    ? GENERAL.length
    : GENERAL.filter((competition) => competition.status === status).length);
  return <div className="cdraft-page">
    <PageHead officials={officials} />

    {mine.length > 0 && <section className="cdraftc-mine" aria-label="내 대회 현황">
      {mine.map((competition) => <button type="button" className="cdraftc-mine-card" key={competition.name}>
        <span className="cdraftc-mine-rank"><em>{competition.myRank}</em><small>위</small></span>
        <span className="cdraftc-mine-copy">
          <strong>{competition.name}</strong>
          <small>{`${competition.myBot} · ${competition.bots}봇 중`}</small>
        </span>
        <span className="cdraftc-mine-facts">
          <b>{competition.myReturn}</b>
          <small className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</small>
        </span>
      </button>)}
    </section>}

    <section className="cdraftc-official" aria-label="공식 대회">
      <header className="cdraft-section-head">
        <h2>공식 대회</h2>
        <p>운영팀이 같은 조건으로 열어요. 참가비 없음 · 결과는 프로필에 남아요.</p>
      </header>
      {officials.length === 0 ? <OfficialEmpty /> : <div className="cdraftc-art-cards" data-count={officials.length}>
        {officials.map((competition) => <button
          type="button"
          className="cdraftc-art-card"
          key={competition.name}
          style={{ '--art': `url("${ARTWORK[competition.name]}")` } as CSSProperties}
        >
          <span className="cdraftc-art-image" aria-hidden="true" />
          <span className="cdraftc-art-top">
            <KindChip kind={competition.kind} onImage />
            <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
          </span>
          <span className="cdraftc-art-body">
            <strong>{competition.name}</strong>
            <small>{competition.tagline}</small>
            <span className="cdraftc-art-meta">{`${competition.scoring} · ${competition.bots}봇 · ${competition.lengthDays}일`}</span>
          </span>
          <span className="cdraftc-art-foot">
            {competition.myBot
              ? <span className="cdraftc-art-mine"><Check size={13} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>
              : <span className="cdraftc-art-idle">아직 참가하지 않았어요</span>}
            <span className="cdraftc-art-cta">{competition.myBot ? '순위 보기' : '참가하기'}<ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </button>)}
      </div>}
    </section>

    <section className="cdraftc-general" aria-label="일반 대회">
      <header className="cdraft-section-head">
        <h2>일반 대회</h2>
        <p>사용자가 직접 열어요. 시작 자본·수수료는 공식 대회와 같아요.</p>
      </header>
      <div className="cdraftc-toolbar">
        <div className="cdraftc-tabs" role="tablist" aria-label="진행 상태">
          {([['모집 중', '모집 중'], ['진행 중', '진행 중'], ['all', '전체']] as const).map(([value, label]) => <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'is-active' : ''}
            onClick={() => setTab(value)}
          >{label}<b>{tabCount(value)}</b></button>)}
        </div>
        <label className="cdraft-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="일반 대회 검색"
            placeholder="대회명 · 개설자 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="cdraftc-sort"
          aria-label="정렬 기준"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
        </select>
      </div>
      {rows.length === 0
        ? <div className="cdraft-empty">
          <Search size={20} aria-hidden="true" />
          <strong>조건에 맞는 대회가 없어요.</strong>
          <button type="button" onClick={() => { setTab('all'); setQuery(''); }}>전체 보기</button>
        </div>
        : <div className="cdraftc-rows" role="list">
          {rows.map((competition) => <button type="button" className="cdraftc-row" role="listitem" key={competition.name}>
            <span className="cdraftc-row-main">
              <span className="cdraftc-row-title">
                <strong>{competition.name}</strong>
                <Scoring scoring={competition.scoring} />
                {competition.myBot && <span className="cdraft-mine-badge"><Check size={12} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>}
              </span>
              <span className="cdraftc-row-meta">
                {`개설자 ${competition.host} · ${competition.period} · ${competition.lengthDays}일 대회 · `}
                <em data-status={competition.status}>{competition.status}</em>
              </span>
            </span>
            <span className="cdraftc-row-side">
              <span><b>{competition.bots}</b><small>참여 봇</small></span>
              <span><b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b><small>{competition.status === '모집 중' ? '모집 마감' : '대회 마감'}</small></span>
              <ArrowRight className="cdraft-row-arrow" size={16} aria-hidden="true" />
            </span>
          </button>)}
        </div>}
    </section>
  </div>;
}

const VIEWS: Record<DraftId, (props: { officials: Competition[] }) => ReactElement> = {
  A: DraftA,
  B: DraftB,
  C: DraftC,
};

export function CompetitionDrafts() {
  const [draft, setDraft] = useState<DraftId>('B');
  const [officialCount, setOfficialCount] = useState(3);
  const officials = OFFICIAL_ALL.slice(0, officialCount);
  const View = VIEWS[draft];
  return <Localized><div className="cdraft-root">
    <nav className="cdraft-switch" aria-label="모의투자 배치안">
      <span className="cdraft-switch-label"><Trophy size={14} aria-hidden="true" />모의투자 배치안 #54</span>
      <div className="cdraft-switch-group" role="group" aria-label="배치안 선택">
        {([['A', 'A · 공식도 행'], ['B', 'B · 공식만 카드'], ['C', 'C · 스트립+히어로']] as const).map(([value, label]) => <button
          key={value}
          type="button"
          aria-pressed={draft === value}
          className={draft === value ? 'is-active' : ''}
          onClick={() => setDraft(value)}
        >{label}</button>)}
      </div>
      <div className="cdraft-switch-group" role="group" aria-label="공식 대회 수">
        <small>공식 대회 수</small>
        {[0, 1, 2, 3, 4, 5, 6].map((count) => <button
          key={count}
          type="button"
          aria-pressed={officialCount === count}
          className={officialCount === count ? 'is-active' : ''}
          onClick={() => setOfficialCount(count)}
        >{count}</button>)}
      </div>
    </nav>
    <View key={draft} officials={officials} />
  </div></Localized>;
}
