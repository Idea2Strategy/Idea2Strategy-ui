import { useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  History,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Localized } from '../lib/i18n';
import alphaDashArt from '../assets/competition-v2/alpha-dash.png';
import etfSprintArt from '../assets/competition-v2/etf-sprint.png';
import summerLeagueArt from '../assets/competition-v2/i2s-summer-league.png';

/*
  모의투자 화면 초안 3차 (#54, 임시).

  피드백 반영점.
  1) 공식과 일반은 확연히 달라야 하고, 들어오자마자 공식 대회를 눌러보고 싶어야
     한다 → 공식은 표의 한 줄이 아니라 화면 맨 위의 큰 히어로다. 초안마다 히어로
     방식이 다르다(아트워크 카드 / 와이드 배너 / 틸 쇼케이스).
  2) 필터는 중요하지만 읽혀야 한다 → 칩을 한 줄에 몰아넣지 않고, 초안마다 다른
     방식으로 라벨을 항상 보이게 한다(라벨 레일 / 라벨 셀렉트 / 접히는 패널).

  공통: 일반 대회는 아래쪽 조용한 표, 기본 정렬은 마감 임박(D- 짧은 순),
  검색·필터는 실제로 동작. 클래스는 cdraft- 로 격리하고 안이 정해지면 삭제한다.
*/

type DraftId = 'artwork' | 'banner' | 'spotlight';
type Kind = 'official-live' | 'official-backtest' | 'general';
type SortKey = 'dday' | 'name' | 'bots' | 'length';

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

const KIND_META: Record<Kind, { label: string; icon: LucideIcon; basis: string }> = {
  'official-live': { label: '공식 라이브', icon: Radio, basis: '실시간 시세로 채점' },
  'official-backtest': { label: '공식 백테스트', icon: History, basis: '과거 구간을 다시 돌려 채점' },
  general: { label: '일반', icon: Users, basis: '사용자가 연 대회' },
};

const SCORINGS = ['표준점수제', '위험조정 점수제', '수익률 점수제', '샤프 점수제'];

/* 공식 대회는 히어로에 쓸 아트워크를 가진다. 일반 대회는 이미지가 없다 —
   이 차이 자체가 공식/일반을 가르는 가장 강한 신호다. */
const ARTWORK: Record<string, string> = {
  'ETF Sprint': etfSprintArt,
  'I2S Summer League': summerLeagueArt,
  'Backtesting Challenge': alphaDashArt,
};

const OFFICIAL: Competition[] = [
  { name: 'ETF Sprint', kind: 'official-live', scoring: '수익률 점수제', bots: 128, dday: 5, lengthDays: 11, status: '모집 중', host: 'I2S 운영팀', period: '07.21–08.01', myBot: 'ETF Runner', myRank: 2, myReturn: '+12.44%', tagline: '11일 안에 누가 가장 많이 벌었나' },
  { name: 'Backtesting Challenge', kind: 'official-backtest', scoring: '백테스팅', bots: 42, dday: 12, lengthDays: 30, status: '모집 중', host: 'I2S 운영팀', period: '08.01–08.31', myBot: null, myRank: null, myReturn: null, tagline: '같은 과거 한 달, 내 전략은 몇 위였을까' },
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

const DRAFTS: Array<{ id: DraftId; name: string; hero: string; filter: string }> = [
  {
    id: 'artwork',
    name: 'A · 아트워크 카드 3장',
    hero: '공식 대회 3장을 이미지 카드로 크게 깐다. 이미지가 있는 카드 / 없는 표라는 차이만으로 공식과 일반이 즉시 갈린다.',
    filter: '왼쪽 라벨 필터 레일 — 그룹 제목이 항상 보이고 항목은 세로로 큼직하게(높이 34, 13px).',
  },
  {
    id: 'banner',
    name: 'B · 와이드 배너 + 서브',
    hero: '마감이 가장 급한 공식 대회 하나를 와이드 배너로 깔고, 남은 공식 2개는 옆에 작은 카드로. 시선이 한 곳으로 모인다.',
    filter: '표 위 라벨 셀렉트 4개 — 값이 접혀 있어 줄이 짧고, 라벨과 현재 값이 항상 함께 읽힌다.',
  },
  {
    id: 'spotlight',
    name: 'C · 틸 스포트라이트',
    hero: '이미지 없이 브랜드 틸 쇼케이스 한 판에 공식 3개를 얹는다. 배경 자체가 공식 구역임을 말한다(이미지 로딩 비용 없음).',
    filter: '기본은 검색 + 정렬만 보이고, 필터는 버튼으로 펼치는 패널. 화면이 가장 조용하다.',
  },
];

const won = (value: number) => value.toLocaleString('ko-KR');

/* ── 공용 조각 ───────────────────────────────────────────────────────────── */

const KindChip = ({ kind, tone = 'solid' }: { kind: Kind; tone?: 'solid' | 'onImage' }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className={`cdraft-kind is-${tone}`} data-kind={kind}>
    <Icon size={12} aria-hidden="true" />{meta.label}
  </span>;
};

const Scoring = ({ scoring }: { scoring: string }) => <span className="cdraft-scoring" data-scoring={scoring}>{scoring}</span>;

interface FilterState {
  query: string;
  scorings: string[];
  status: 'all' | '모집 중' | '진행 중';
  urgency: 'all' | '7' | '30';
  participation: 'all' | 'joined' | 'open';
  sort: SortKey;
}

const EMPTY: FilterState = {
  query: '',
  scorings: [],
  status: 'all',
  urgency: 'all',
  participation: 'all',
  sort: 'dday',
};

const SORT_LABELS: Record<SortKey, string> = {
  dday: '마감 임박 순',
  name: '이름 순',
  bots: '참여 봇 많은 순',
  length: '기간 짧은 순',
};

const useGeneralFilters = () => {
  const [filters, setFilters] = useState<FilterState>(EMPTY);
  const patch = (next: Partial<FilterState>) => setFilters((current) => ({ ...current, ...next }));
  const toggleScoring = (scoring: string) => patch({
    scorings: filters.scorings.includes(scoring)
      ? filters.scorings.filter((item) => item !== scoring)
      : [...filters.scorings, scoring],
  });
  const results = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return GENERAL.filter((competition) => {
      const matchesQuery = !query
        || competition.name.toLowerCase().includes(query)
        || competition.host.toLowerCase().includes(query);
      const matchesScoring = filters.scorings.length === 0 || filters.scorings.includes(competition.scoring);
      const matchesStatus = filters.status === 'all' || competition.status === filters.status;
      const matchesUrgency = filters.urgency === 'all' || competition.dday <= Number(filters.urgency);
      const matchesParticipation = filters.participation === 'all'
        || (filters.participation === 'joined' ? Boolean(competition.myBot) : !competition.myBot);
      return matchesQuery && matchesScoring && matchesStatus && matchesUrgency && matchesParticipation;
    }).sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name);
      if (filters.sort === 'bots') return b.bots - a.bots;
      if (filters.sort === 'length') return a.lengthDays - b.lengthDays;
      return a.dday - b.dday;
    });
  }, [filters]);
  const activeCount = filters.scorings.length
    + (filters.status === 'all' ? 0 : 1)
    + (filters.urgency === 'all' ? 0 : 1)
    + (filters.participation === 'all' ? 0 : 1)
    + (filters.query ? 1 : 0);
  return { filters, patch, toggleScoring, results, activeCount, reset: () => setFilters(EMPTY) };
};

type FilterApi = ReturnType<typeof useGeneralFilters>;

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

/* 일반 대회 표 — 세 초안이 공유한다. 공식 블록과 달리 조용하다. */
function GeneralTable({ api }: { api: FilterApi }) {
  const { results, reset } = api;
  if (results.length === 0) return <div className="cdraft-empty">
    <Search size={20} aria-hidden="true" />
    <strong>조건에 맞는 대회가 없어요.</strong>
    <button type="button" onClick={reset}>필터 초기화</button>
  </div>;
  return <div className="cdraft-table">
    <div className="cdraft-thead">
      <span>대회</span>
      <span>채점 방식</span>
      <span className="is-num">참여 봇</span>
      <span className="is-num">기간</span>
      <span className="is-num">마감</span>
      <span />
    </div>
    {results.map((competition) => <button type="button" className={`cdraft-trow${competition.myBot ? ' is-mine' : ''}`} key={competition.name}>
      <span className="cdraft-name">
        <strong>{competition.name}</strong>
        <small>{`${competition.host} · ${competition.period}`}</small>
      </span>
      <span><Scoring scoring={competition.scoring} /></span>
      <span className="is-num"><b>{competition.bots}</b></span>
      <span className="is-num"><b>{`${competition.lengthDays}일`}</b></span>
      <span className="is-num"><b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b></span>
      <span className="is-num">
        {competition.myBot
          ? <span className="cdraft-joined"><Check size={13} aria-hidden="true" />{`${competition.myRank}위`}</span>
          : <span className="cdraft-cta">참가<ArrowRight size={13} aria-hidden="true" /></span>}
      </span>
    </button>)}
  </div>;
}

const generalLine = (results: Competition[]) => `일반 대회 ${results.length}개 · 마감 임박 순`;

/* ── A · 아트워크 카드 3장 ──────────────────────────────────────────────── */
function ArtworkDraft() {
  const api = useGeneralFilters();
  const { filters, patch, toggleScoring, activeCount, reset } = api;
  return <div className="cdraft-page is-artwork">
    <PageHead line="운영팀이 여는 공식 대회 3개가 열려 있어요. 가장 급한 마감은 ETF Sprint D-5예요." />

    <section className="cdraft-official" aria-label="공식 대회">
      <header className="cdraft-official-head">
        <div><Trophy size={16} aria-hidden="true" /><h2>공식 대회</h2></div>
        <p>운영팀이 같은 조건으로 여는 대회예요. 참가비는 없고 결과는 프로필에 남아요.</p>
      </header>
      <div className="cdraft-art-cards">
        {OFFICIAL.map((competition) => <button
          type="button"
          className="cdraft-art-card"
          key={competition.name}
          data-kind={competition.kind}
          style={{ '--art': `url("${ARTWORK[competition.name]}")` } as CSSProperties}
        >
          <span className="cdraft-art-image" aria-hidden="true" />
          <span className="cdraft-art-top">
            <KindChip kind={competition.kind} tone="onImage" />
            <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
          </span>
          <span className="cdraft-art-body">
            <strong>{competition.name}</strong>
            <small>{competition.tagline}</small>
            <span className="cdraft-art-facts">
              <Scoring scoring={competition.scoring} />
              <em>{`참여 봇 ${won(competition.bots)}`}</em>
              <em>{`${competition.lengthDays}일`}</em>
            </span>
          </span>
          <span className="cdraft-art-foot">
            {competition.myBot
              ? <span className="cdraft-joined"><Check size={13} aria-hidden="true" />{`내 봇 ${competition.myRank}위 · ${competition.myReturn}`}</span>
              : <span className="cdraft-muted">아직 참가하지 않았어요</span>}
            <span className="cdraft-cta is-strong">{competition.myBot ? '순위 보기' : '참가하기'}<ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </button>)}
      </div>
    </section>

    <section className="cdraft-general" aria-label="일반 대회">
      <header className="cdraft-general-head">
        <h2>일반 대회</h2>
        <span>{generalLine(api.results)}</span>
      </header>
      <div className="cdraft-rail-layout">
        <aside className="cdraft-rail" aria-label="일반 대회 필터">
          <header>
            <strong>필터</strong>
            <button type="button" disabled={activeCount === 0} onClick={reset}>
              <RotateCcw size={12} aria-hidden="true" />초기화
            </button>
          </header>
          <label className="cdraft-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              aria-label="일반 대회 검색"
              placeholder="대회명 · 개설자"
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
            />
          </label>
          <fieldset>
            <legend>채점 방식</legend>
            {SCORINGS.map((scoring) => <label key={scoring} className="cdraft-check">
              <input type="checkbox" checked={filters.scorings.includes(scoring)} onChange={() => toggleScoring(scoring)} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{scoring}</span>
            </label>)}
          </fieldset>
          <fieldset>
            <legend>진행 상태</legend>
            {([['all', '전체'], ['모집 중', '모집 중'], ['진행 중', '진행 중']] as const).map(([value, label]) => <label key={value} className="cdraft-check is-radio">
              <input type="radio" name="a-status" checked={filters.status === value} onChange={() => patch({ status: value })} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{label}</span>
            </label>)}
          </fieldset>
          <fieldset>
            <legend>마감까지</legend>
            {([['all', '전체'], ['7', '7일 이내'], ['30', '30일 이내']] as const).map(([value, label]) => <label key={value} className="cdraft-check is-radio">
              <input type="radio" name="a-urgency" checked={filters.urgency === value} onChange={() => patch({ urgency: value })} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{label}</span>
            </label>)}
          </fieldset>
        </aside>
        <GeneralTable api={api} />
      </div>
    </section>
  </div>;
}

/* ── B · 와이드 배너 + 서브 ─────────────────────────────────────────────── */
function BannerDraft() {
  const api = useGeneralFilters();
  const { filters, patch, activeCount, reset } = api;
  const [lead, ...rest] = OFFICIAL;
  return <div className="cdraft-page is-banner">
    <PageHead line="ETF Sprint 모집이 5일 뒤 닫혀요. 공식 대회 3개가 열려 있어요." />

    <section className="cdraft-official" aria-label="공식 대회">
      <header className="cdraft-official-head">
        <div><Trophy size={16} aria-hidden="true" /><h2>공식 대회</h2></div>
        <p>운영팀이 같은 조건으로 여는 대회예요.</p>
      </header>
      <div className="cdraft-banner-grid">
        <button
          type="button"
          className="cdraft-banner"
          data-kind={lead.kind}
          style={{ '--art': `url("${ARTWORK[lead.name]}")` } as CSSProperties}
        >
          <span className="cdraft-banner-copy">
            <KindChip kind={lead.kind} tone="onImage" />
            <strong>{lead.name}</strong>
            <small>{lead.tagline}</small>
            <span className="cdraft-banner-facts">
              <span><em>마감</em><b className="is-urgent">{`D-${lead.dday}`}</b></span>
              <span><em>채점</em><b>{lead.scoring}</b></span>
              <span><em>참여 봇</em><b>{won(lead.bots)}</b></span>
              <span><em>기간</em><b>{`${lead.lengthDays}일`}</b></span>
            </span>
            <span className="cdraft-cta is-button">{lead.myBot ? '내 순위 보기' : '참가하기'}<ArrowRight size={15} aria-hidden="true" /></span>
          </span>
        </button>
        <div className="cdraft-banner-side">
          {rest.map((competition) => <button type="button" className="cdraft-side-card" key={competition.name} data-kind={competition.kind}>
            <KindChip kind={competition.kind} />
            <strong>{competition.name}</strong>
            <small>{competition.tagline}</small>
            <span className="cdraft-side-facts">
              <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
              <em>{`${won(competition.bots)}봇 · ${competition.lengthDays}일`}</em>
            </span>
          </button>)}
        </div>
      </div>
    </section>

    <section className="cdraft-general" aria-label="일반 대회">
      <header className="cdraft-general-head">
        <h2>일반 대회</h2>
        <span>{generalLine(api.results)}</span>
      </header>
      {/* 라벨 셀렉트 — 라벨과 현재 값이 늘 함께 읽히고 줄이 짧다. */}
      <div className="cdraft-selects">
        <label className="cdraft-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="일반 대회 검색"
            placeholder="대회명 · 개설자"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
          />
        </label>
        <label className="cdraft-select">
          <span>채점 방식</span>
          <select
            aria-label="채점 방식 필터"
            value={filters.scorings[0] ?? 'all'}
            onChange={(event) => patch({ scorings: event.target.value === 'all' ? [] : [event.target.value] })}
          >
            <option value="all">전체</option>
            {SCORINGS.map((scoring) => <option key={scoring} value={scoring}>{scoring}</option>)}
          </select>
        </label>
        <label className="cdraft-select">
          <span>진행 상태</span>
          <select aria-label="진행 상태 필터" value={filters.status} onChange={(event) => patch({ status: event.target.value as FilterState['status'] })}>
            <option value="all">전체</option>
            <option value="모집 중">모집 중</option>
            <option value="진행 중">진행 중</option>
          </select>
        </label>
        <label className="cdraft-select">
          <span>마감까지</span>
          <select aria-label="마감 필터" value={filters.urgency} onChange={(event) => patch({ urgency: event.target.value as FilterState['urgency'] })}>
            <option value="all">전체</option>
            <option value="7">7일 이내</option>
            <option value="30">30일 이내</option>
          </select>
        </label>
        <label className="cdraft-select">
          <span>정렬</span>
          <select aria-label="정렬 기준" value={filters.sort} onChange={(event) => patch({ sort: event.target.value as SortKey })}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
        <button type="button" className="cdraft-reset" disabled={activeCount === 0} onClick={reset}>
          <RotateCcw size={13} aria-hidden="true" />초기화
        </button>
      </div>
      <GeneralTable api={api} />
    </section>
  </div>;
}

/* ── C · 틸 스포트라이트 ────────────────────────────────────────────────── */
function SpotlightDraft() {
  const api = useGeneralFilters();
  const { filters, patch, toggleScoring, activeCount, reset } = api;
  const [filtersOpen, setFiltersOpen] = useState(false);
  return <div className="cdraft-page is-spotlight">
    <PageHead line="공식 대회 3개가 열려 있어요. 참가는 봇 하나만 있으면 돼요." />

    <section className="cdraft-spotlight" aria-label="공식 대회">
      <header>
        <div><Trophy size={16} aria-hidden="true" /><h2>공식 대회</h2></div>
        <p>운영팀 주최 · 같은 시작 자본과 체결 조건</p>
      </header>
      <div className="cdraft-spot-cards">
        {OFFICIAL.map((competition) => <button type="button" className="cdraft-spot-card" key={competition.name} data-kind={competition.kind}>
          <span className="cdraft-spot-top">
            <KindChip kind={competition.kind} tone="onImage" />
            <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
          </span>
          <strong>{competition.name}</strong>
          <small>{competition.tagline}</small>
          <span className="cdraft-spot-facts">
            <span><em>채점</em><b>{competition.scoring}</b></span>
            <span><em>참여 봇</em><b>{won(competition.bots)}</b></span>
            <span><em>기간</em><b>{`${competition.lengthDays}일`}</b></span>
          </span>
          <span className="cdraft-spot-foot">
            {competition.myBot
              ? <span className="cdraft-joined-light"><Check size={13} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>
              : <span className="cdraft-muted-light">미참가</span>}
            <span className="cdraft-cta is-light">{competition.myBot ? '순위 보기' : '참가하기'}<ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </button>)}
      </div>
    </section>

    <section className="cdraft-general" aria-label="일반 대회">
      <header className="cdraft-general-head">
        <h2>일반 대회</h2>
        <span>{generalLine(api.results)}</span>
      </header>
      {/* 기본은 검색과 정렬만. 나머지는 눌러서 펼친다. */}
      <div className="cdraft-quietbar">
        <label className="cdraft-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="일반 대회 검색"
            placeholder="대회명 · 개설자"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
          />
        </label>
        <label className="cdraft-select">
          <span>정렬</span>
          <select aria-label="정렬 기준" value={filters.sort} onChange={(event) => patch({ sort: event.target.value as SortKey })}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
        <button
          type="button"
          className={`cdraft-filter-toggle${filtersOpen ? ' is-open' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          필터{activeCount > 0 && <b>{activeCount}</b>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {filtersOpen && <div className="cdraft-filter-panel">
        <fieldset>
          <legend>채점 방식</legend>
          <div>
            {SCORINGS.map((scoring) => <label key={scoring} className="cdraft-check">
              <input type="checkbox" checked={filters.scorings.includes(scoring)} onChange={() => toggleScoring(scoring)} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{scoring}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>진행 상태</legend>
          <div>
            {([['all', '전체'], ['모집 중', '모집 중'], ['진행 중', '진행 중']] as const).map(([value, label]) => <label key={value} className="cdraft-check is-radio">
              <input type="radio" name="c-status" checked={filters.status === value} onChange={() => patch({ status: value })} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{label}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>마감까지</legend>
          <div>
            {([['all', '전체'], ['7', '7일 이내'], ['30', '30일 이내']] as const).map(([value, label]) => <label key={value} className="cdraft-check is-radio">
              <input type="radio" name="c-urgency" checked={filters.urgency === value} onChange={() => patch({ urgency: value })} />
              <span className="cdraft-check-box" aria-hidden="true"><Check size={12} /></span>
              <span className="cdraft-check-text">{label}</span>
            </label>)}
          </div>
        </fieldset>
        <button type="button" className="cdraft-reset" disabled={activeCount === 0} onClick={reset}>
          <RotateCcw size={13} aria-hidden="true" />초기화
        </button>
      </div>}
      <GeneralTable api={api} />
    </section>
  </div>;
}

const VIEWS: Record<DraftId, () => ReactElement> = {
  artwork: ArtworkDraft,
  banner: BannerDraft,
  spotlight: SpotlightDraft,
};

export function CompetitionDrafts() {
  const [draft, setDraft] = useState<DraftId>('artwork');
  const active = DRAFTS.find((item) => item.id === draft) ?? DRAFTS[0];
  const View = VIEWS[draft];
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
    <dl className="cdraft-notes">
      <div><dt>공식 대회</dt><dd>{active.hero}</dd></div>
      <div><dt>필터</dt><dd>{active.filter}</dd></div>
    </dl>
    <View key={draft} />
  </div></Localized>;
}
