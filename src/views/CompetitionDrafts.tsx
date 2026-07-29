import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  ArrowUpRight,
  History,
  Radio,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Localized } from '../lib/i18n';

/*
  대회 화면 초안 비교용 임시 화면 (#54).

  실제 제품 토큰(tokens.css)과 같은 폰트·색·간격 스케일을 쓰지만, 클래스는 모두
  `cdraft-` 접두사로 격리해 제품 CSS에 영향을 주지 않는다. 초안을 고르면 이
  파일과 competition-drafts.css, /drafts 라우트는 삭제하고 고른 안만 제품에
  구현한다.

  네 초안은 정보 구조가 서로 다르고, 컨테이너 폭·행 높이·열 폭 같은 수치도 각각
  다르게 잡았다. 헤더에 수치를 그대로 적어 두었으니 "C안 표 폭 + A안 행 높이"처럼
  섞어서 골라도 된다.
*/

type DraftId = 'league' | 'terminal' | 'featured' | 'timeline';
type Kind = 'official-live' | 'official-backtest' | 'general';

interface DraftCompetition {
  name: string;
  kind: Kind;
  scoring: string;
  bots: number;
  dday: number;
  status: '모집 중' | '진행 중';
  host: string;
  period: string;
  myRank: string | null;
  topReturn: string;
}

const KIND_META: Record<Kind, { label: string; icon: LucideIcon; basis: string }> = {
  'official-live': { label: '공식 라이브', icon: Radio, basis: '진행 기간의 실시간 시세로 채점' },
  'official-backtest': { label: '공식 백테스트', icon: History, basis: '같은 과거 구간을 다시 돌려 채점' },
  general: { label: '일반', icon: Users, basis: '사용자가 열고 실시간 시세로 채점' },
};

const COMPETITIONS: DraftCompetition[] = [
  { name: 'I2S Summer League', kind: 'official-live', scoring: '표준점수제', bots: 184, dday: 65, status: '진행 중', host: 'I2S 운영팀', period: '07.01–09.30', myRank: '1위', topReturn: '+24.61%' },
  { name: 'ETF Sprint', kind: 'official-live', scoring: '수익률 점수제', bots: 128, dday: 5, status: '모집 중', host: 'I2S 운영팀', period: '07.21–08.01', myRank: '2위', topReturn: '+9.21%' },
  { name: 'Backtesting Challenge', kind: 'official-backtest', scoring: '백테스팅', bots: 42, dday: 12, status: '모집 중', host: 'I2S 운영팀', period: '08.01–08.31', myRank: null, topReturn: '+18.04%' },
  { name: 'Momentum Lab', kind: 'general', scoring: '표준점수제', bots: 8, dday: 8, status: '진행 중', host: '이서준', period: '07.07–08.04', myRank: '2위', topReturn: '+11.85%' },
  { name: 'Low Volatility Club', kind: 'general', scoring: '샤프 점수제', bots: 24, dday: 61, status: '진행 중', host: '차분한투자', period: '07.01–09.26', myRank: null, topReturn: '+6.40%' },
  { name: 'ETF Discipline', kind: 'general', scoring: '위험조정 점수제', bots: 18, dday: 29, status: '모집 중', host: 'ETF연구회', period: '07.14–08.25', myRank: null, topReturn: '+4.12%' },
  { name: 'Gap Hunters', kind: 'general', scoring: '수익률 점수제', bots: 15, dday: 11, status: '진행 중', host: '한지민', period: '07.10–08.07', myRank: null, topReturn: '+15.73%' },
  { name: 'Macro Pulse', kind: 'general', scoring: '표준점수제', bots: 12, dday: 46, status: '모집 중', host: '거시경제방', period: '07.03–09.11', myRank: null, topReturn: '+8.06%' },
  { name: 'Dividend Guard', kind: 'general', scoring: '샤프 점수제', bots: 7, dday: 32, status: '모집 중', host: '배당사냥꾼', period: '07.17–08.28', myRank: null, topReturn: '+3.88%' },
  { name: 'Slow Turtle', kind: 'general', scoring: '위험조정 점수제', bots: 5, dday: 55, status: '모집 중', host: '거북이클럽', period: '07.05–09.20', myRank: null, topReturn: '+2.15%' },
];

const LEADERS = [
  { rank: 1, bot: 'Room Beta', score: '96.42', ret: '+13.18%', mine: true },
  { rank: 2, bot: 'Bot 8C21', score: '94.87', ret: '+12.44%', mine: false },
  { rank: 3, bot: 'Bot 11D0', score: '93.15', ret: '+11.02%', mine: false },
  { rank: 4, bot: 'Bot 5E77', score: '91.73', ret: '+10.35%', mine: false },
  { rank: 5, bot: 'Bot 902B', score: '90.28', ret: '+9.61%', mine: false },
];

const CONDITIONS = [
  ['시작 자본', '$10,000'],
  ['종목 범위', '미국 주식 · ETF'],
  ['수수료', '0.20%'],
  ['슬리피지', '0.05%'],
];

const DRAFTS: Array<{ id: DraftId; name: string; idea: string; spec: string }> = [
  {
    id: 'league',
    name: 'A · 리그 순위표',
    idea: '대회를 "지금 순위표"로 본다. 목록 행에 내 순위와 선두 수익률이 바로 있어서, 들어가 보지 않아도 판이 어떤지 읽힌다. 필터 레일을 없애고 상단 세그먼트 하나로 줄였다.',
    spec: '컨테이너 1280 · 표 전폭 · 행 56 · 열 116/1fr/128/72/88/84 · 패딩 16',
  },
  {
    id: 'terminal',
    name: 'B · 목록 + 미리보기',
    idea: '봇 화면과 같은 마스터-디테일 문법. 왼쪽에서 고르면 오른쪽에 리더보드와 조건이 바로 뜨고 페이지 이동이 없다. 제품 안에서 가장 일관된 방식.',
    spec: '컨테이너 1280 · 좌 400 + 우 1fr · 행 48 · 패딩 12/16',
  },
  {
    id: 'featured',
    name: 'C · 공식 카드 + 일반 표',
    idea: '공식 대회는 카드로 크게, 일반 대회는 표로 조용히. 종류 차이를 형태 차이로 만든다. 필터는 표 위 툴바로 내려 레일을 없앴다.',
    spec: '컨테이너 1232 · 카드 min 300 · 표 행 64 · 열 128/1fr/112/88/32 · 패딩 16',
  },
  {
    id: 'timeline',
    name: 'D · 마감 타임라인',
    idea: '이 도메인에서 가장 중요한 것은 "언제 닫히나"다. 위쪽 축에 대회를 마감 순서로 얹고, 급한 것이 왼쪽에 온다. 아래 표는 같은 순서를 그대로 잇는다.',
    spec: '컨테이너 1280 · 타임라인 높이 132 · 표 행 52 · 열 1fr/120/96/96 · 패딩 16',
  },
];

const KindChip = ({ kind, size = 'md' }: { kind: Kind; size?: 'sm' | 'md' }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className={`cdraft-kind is-${size}`} data-kind={kind}>
    <Icon size={size === 'sm' ? 11 : 12} aria-hidden="true" />
    {meta.label}
  </span>;
};

const DdayCell = ({ competition }: { competition: DraftCompetition }) => <span className="cdraft-dday">
  <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
  <small>{competition.status === '진행 중' ? '대회 마감' : '모집 마감'}</small>
</span>;

/* A · 리그 순위표 ---------------------------------------------------------- */
function LeagueDraft() {
  const [scope, setScope] = useState<'all' | 'official' | 'general'>('all');
  const rows = COMPETITIONS.filter((competition) => scope === 'all'
    || (scope === 'official' ? competition.kind !== 'general' : competition.kind === 'general'));
  return <div className="cdraft-page is-league">
    <header className="cdraft-page-head">
      <div>
        <p>BOT COMPETITION</p>
        <h1>모의투자</h1>
        <span>내 봇이 대회 3개에서 뛰고 있어요. 모집 중인 7개 중 다음 도전을 고르세요.</span>
      </div>
      <button type="button" className="cdraft-primary">대회 만들기</button>
    </header>

    <div className="cdraft-league-toolbar">
      <div className="cdraft-segment" role="group" aria-label="대회 범위">
        {([['all', '전체'], ['official', '공식'], ['general', '일반']] as const).map(([value, label]) => <button
          key={value}
          type="button"
          className={scope === value ? 'is-active' : ''}
          onClick={() => setScope(value)}
        >{label}</button>)}
      </div>
      <label className="cdraft-search">
        <Search size={14} aria-hidden="true" />
        <input type="search" placeholder="대회명 또는 개설자" aria-label="대회 검색" />
      </label>
    </div>

    <div className="cdraft-league-table">
      <div className="cdraft-league-head">
        <span>종류</span>
        <span>대회</span>
        <span>채점 방식</span>
        <span className="is-num">참여 봇</span>
        <span className="is-num">마감</span>
        <span className="is-num">내 순위</span>
      </div>
      {rows.map((competition) => <button type="button" className="cdraft-league-row" key={competition.name}>
        <KindChip kind={competition.kind} size="sm" />
        <span className="cdraft-league-name">
          <strong>{competition.name}</strong>
          <small>{`${competition.host} · ${competition.period}`}</small>
        </span>
        <span className="cdraft-scoring" data-scoring={competition.scoring}>{competition.scoring}</span>
        <span className="is-num"><b>{competition.bots}</b></span>
        <span className="is-num"><DdayCell competition={competition} /></span>
        <span className="is-num cdraft-league-rank">
          {competition.myRank
            ? <><b>{competition.myRank}</b><small>{competition.topReturn}</small></>
            : <em>미참가</em>}
        </span>
      </button>)}
    </div>
  </div>;
}

/* B · 목록 + 미리보기 ------------------------------------------------------ */
function TerminalDraft() {
  const [selected, setSelected] = useState(COMPETITIONS[0].name);
  const active = COMPETITIONS.find((competition) => competition.name === selected) ?? COMPETITIONS[0];
  return <div className="cdraft-page is-terminal">
    <header className="cdraft-page-head">
      <div>
        <p>BOT COMPETITION</p>
        <h1>모의투자</h1>
        <span>내 봇이 대회 3개에서 뛰고 있어요. 목록에서 고르면 오른쪽에 순위가 바로 나와요.</span>
      </div>
      <button type="button" className="cdraft-primary">대회 만들기</button>
    </header>

    <div className="cdraft-terminal-grid">
      <section className="cdraft-terminal-list" aria-label="대회 목록">
        <header>
          <label className="cdraft-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="대회 검색" aria-label="대회 검색" />
          </label>
        </header>
        <div>
          {COMPETITIONS.map((competition) => <button
            type="button"
            key={competition.name}
            className={`cdraft-terminal-row${competition.name === selected ? ' is-selected' : ''}`}
            onClick={() => setSelected(competition.name)}
          >
            <KindChip kind={competition.kind} size="sm" />
            <span>
              <strong>{competition.name}</strong>
              <small>{competition.scoring}</small>
            </span>
            <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
          </button>)}
        </div>
      </section>

      <section className="cdraft-terminal-detail" aria-label={`${active.name} 미리보기`}>
        <header>
          <div>
            <KindChip kind={active.kind} />
            <h2>{active.name}</h2>
            <p>{KIND_META[active.kind].basis}</p>
          </div>
          <button type="button" className="cdraft-primary">대회 참가</button>
        </header>
        <dl className="cdraft-conditions">
          {[['운영자', active.host], ['기간', active.period], ['참여 봇', `${active.bots}`], ...CONDITIONS].map(([label, value]) => <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>)}
        </dl>
        <div className="cdraft-leaderboard">
          <header><h3>리더보드</h3><span>{active.scoring}</span></header>
          <div className="cdraft-leader-head"><span>순위</span><span>봇</span><span className="is-num">점수</span><span className="is-num">수익률</span></div>
          {LEADERS.map((entry) => <div className={`cdraft-leader-row${entry.mine ? ' is-mine' : ''}`} key={entry.rank}>
            <b>{`#${entry.rank}`}</b>
            <span>{entry.bot}{entry.mine && <em>내 봇</em>}</span>
            <span className="is-num">{entry.score}</span>
            <span className="is-num is-gain">{entry.ret}</span>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}

/* C · 공식 카드 + 일반 표 -------------------------------------------------- */
function FeaturedDraft() {
  const official = COMPETITIONS.filter((competition) => competition.kind !== 'general');
  const general = COMPETITIONS.filter((competition) => competition.kind === 'general');
  return <div className="cdraft-page is-featured">
    <header className="cdraft-page-head">
      <div>
        <p>BOT COMPETITION</p>
        <h1>모의투자</h1>
        <span>내 봇이 대회 3개에서 뛰고 있어요. 모집 중인 7개 중 다음 도전을 고르세요.</span>
      </div>
      <button type="button" className="cdraft-primary">대회 만들기</button>
    </header>

    <section className="cdraft-block">
      <header className="cdraft-block-head">
        <div>
          <h2>공식 대회</h2>
          <p>운영팀이 같은 조건으로 여는 대회예요. 라이브는 실시간 시세로, 백테스트는 같은 과거 구간으로 채점해요.</p>
        </div>
        <span className="cdraft-count">3개</span>
      </header>
      <div className="cdraft-official-cards">
        {official.map((competition) => <article className="cdraft-official-card" data-kind={competition.kind} key={competition.name}>
          <button type="button">
            <header>
              <KindChip kind={competition.kind} />
              <span className="cdraft-state" data-status={competition.status}><i aria-hidden="true" />{competition.status}</span>
            </header>
            <h3>{competition.name}</h3>
            <p>{KIND_META[competition.kind].basis}</p>
            <dl>
              <div><dt>채점 방식</dt><dd><span className="cdraft-scoring" data-scoring={competition.scoring}>{competition.scoring}</span></dd></div>
              <div><dt>기간</dt><dd><b>{competition.period}</b></dd></div>
              <div><dt>참여 봇</dt><dd><b>{competition.bots}</b></dd></div>
              <div><dt>내 순위</dt><dd><b className={competition.myRank ? '' : 'is-idle'}>{competition.myRank ?? '미참가'}</b></dd></div>
            </dl>
            <footer>
              <DdayCell competition={competition} />
              <span className="cdraft-open">대회 열기<ArrowUpRight size={14} aria-hidden="true" /></span>
            </footer>
          </button>
        </article>)}
      </div>
    </section>

    <section className="cdraft-block">
      <header className="cdraft-block-head">
        <div>
          <h2>일반 대회</h2>
          <p>사용자가 직접 열고 참가자를 모으는 대회예요.</p>
        </div>
        <div className="cdraft-toolbar">
          <label className="cdraft-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="대회명 또는 개설자" aria-label="일반 대회 검색" />
          </label>
          <div className="cdraft-segment" role="group" aria-label="진행 상태">
            <button type="button" className="is-active">모집 중</button>
            <button type="button">진행 중</button>
          </div>
        </div>
      </header>
      <div className="cdraft-general-table">
        <div className="cdraft-general-head">
          <span>채점 방식</span><span>대회</span><span className="is-num">마감</span><span className="is-num">참여 봇</span><span />
        </div>
        {general.map((competition) => <button type="button" className="cdraft-general-row" key={competition.name}>
          <span className="cdraft-scoring" data-scoring={competition.scoring}>{competition.scoring}</span>
          <span className="cdraft-general-name">
            <strong>{competition.name}</strong>
            <small>{`개설자 ${competition.host} · ${competition.period}`}</small>
          </span>
          <span className="is-num"><DdayCell competition={competition} /></span>
          <span className="is-num"><b>{competition.bots}</b><small>참여 봇</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>)}
      </div>
    </section>
  </div>;
}

/* D · 마감 타임라인 -------------------------------------------------------- */
function TimelineDraft() {
  const ordered = [...COMPETITIONS].sort((a, b) => a.dday - b.dday);
  const maxDday = ordered[ordered.length - 1].dday;
  return <div className="cdraft-page is-timeline">
    <header className="cdraft-page-head">
      <div>
        <p>BOT COMPETITION</p>
        <h1>모의투자</h1>
        <span>모집이 가장 급한 대회는 ETF Sprint예요. 5일 뒤 마감돼요.</span>
      </div>
      <button type="button" className="cdraft-primary">대회 만들기</button>
    </header>

    <section className="cdraft-timeline" aria-label="대회 마감 타임라인">
      <header>
        <h2>마감 순서</h2>
        <div className="cdraft-timeline-legend">
          <span data-kind="official-live"><i />공식 라이브</span>
          <span data-kind="official-backtest"><i />공식 백테스트</span>
          <span data-kind="general"><i />일반</span>
        </div>
      </header>
      <div className="cdraft-timeline-track">
        {ordered.map((competition) => <button
          type="button"
          key={competition.name}
          className="cdraft-timeline-item"
          data-kind={competition.kind}
          style={{ left: `${(competition.dday / maxDday) * 88}%` }}
        >
          <b>{`D-${competition.dday}`}</b>
          <small>{competition.name}</small>
        </button>)}
        <div className="cdraft-timeline-axis">
          <span>오늘</span><span>2주</span><span>1개월</span><span>2개월+</span>
        </div>
      </div>
    </section>

    <div className="cdraft-timeline-table">
      <div className="cdraft-timeline-head">
        <span>대회</span><span>채점 방식</span><span className="is-num">참여 봇</span><span className="is-num">마감</span>
      </div>
      {ordered.map((competition) => <button type="button" className="cdraft-timeline-row" key={competition.name}>
        <span className="cdraft-timeline-name">
          <KindChip kind={competition.kind} size="sm" />
          <strong>{competition.name}</strong>
          <small>{competition.host}</small>
        </span>
        <span className="cdraft-scoring" data-scoring={competition.scoring}>{competition.scoring}</span>
        <span className="is-num"><b>{competition.bots}</b></span>
        <span className="is-num"><b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b></span>
      </button>)}
    </div>
  </div>;
}

const DRAFT_VIEWS: Record<DraftId, () => ReactElement> = {
  league: LeagueDraft,
  terminal: TerminalDraft,
  featured: FeaturedDraft,
  timeline: TimelineDraft,
};

export function CompetitionDrafts() {
  const [draft, setDraft] = useState<DraftId>('league');
  const active = DRAFTS.find((item) => item.id === draft) ?? DRAFTS[0];
  const View = DRAFT_VIEWS[draft];
  return <Localized><div className="cdraft-root">
    <nav className="cdraft-switch" aria-label="대회 화면 초안">
      <span className="cdraft-switch-label"><Trophy size={14} aria-hidden="true" />대회 화면 초안 #54</span>
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
    <View />
  </div></Localized>;
}
