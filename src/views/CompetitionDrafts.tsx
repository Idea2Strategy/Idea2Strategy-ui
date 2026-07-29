import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  History,
  Radio,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Localized } from '../lib/i18n';
import backtestArt from '../assets/competition-v2/alpha-dash.png';
import etfSprintArt from '../assets/competition-v2/etf-sprint.png';
import summerLeagueArt from '../assets/competition-v2/i2s-summer-league.png';

/*
  모의투자 화면 초안 4차 (#54, 임시) — 이번에는 여러 안이 아니라 하나.

  유저 플로우에서 역산했다. 이 페이지에 오는 사람은 둘뿐이다.

  1. 참가 중인 사람 — "내 봇 지금 몇 위지?"
     → 맨 위 내 대회 현황 스트립이 즉답한다. 카드 하나가 대회 하나, 순위가
       가장 크다. 눌러서 리더보드로 간다.
  2. 참가할 대회를 찾는 사람 — "뭐가 열려 있고, 뭐부터 볼까?"
     → 공식 대회 히어로(아트워크 카드)가 가장 먼저 눈에 들어오고,
       그 아래 일반 대회 리스트가 마감 임박 순으로 이어진다.

  이전 초안들이 어긋났던 지점과 이번 답.
  - 표가 이상했다 → 표를 버렸다. 컬럼 헤더가 있는 데이터 표는 관리 도구 문법이고
    이 페이지는 탐색 문법이다. Kaggle·Dacon처럼 한 줄이 하나의 대회로 자기설명되는
    행 카드로 바꿨다. 헤더가 없으니 열 정렬·열 폭 문제 자체가 사라진다.
  - 필터가 어려웠다 → 컨트롤을 세 개로 줄였다. 상태 탭(전체/모집 중/진행 중),
    검색, 정렬 셀렉트. 끝. 채점 방식은 필터가 아니라 행 위의 배지로 남긴다 —
    10개 남짓한 목록에서 체크박스 그룹은 비용만 있고 효용이 없다.

  클래스는 cdraft- 로 격리. 안이 확정되면 이 파일과 /drafts 라우트는 삭제하고
  제품 페이지에 옮긴다.
*/

type Kind = 'official-live' | 'official-backtest' | 'general';
type StatusTab = 'all' | '모집 중' | '진행 중';
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
  'official-live': { label: '공식 라이브', icon: Radio },
  'official-backtest': { label: '공식 백테스트', icon: History },
  general: { label: '일반', icon: Users },
};

const ARTWORK: Record<string, string> = {
  'ETF Sprint': etfSprintArt,
  'I2S Summer League': summerLeagueArt,
  'Backtesting Challenge': backtestArt,
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

const MINE = [...OFFICIAL, ...GENERAL]
  .filter((competition) => competition.myBot)
  .sort((a, b) => a.dday - b.dday);

const SORT_LABELS: Record<SortKey, string> = {
  dday: '마감 임박 순',
  bots: '참여 봇 많은 순',
  name: '이름 순',
};

const KindChip = ({ kind, onImage = false }: { kind: Kind; onImage?: boolean }) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return <span className={`cdraft-kind${onImage ? ' is-on-image' : ''}`} data-kind={kind}>
    <Icon size={12} aria-hidden="true" />{meta.label}
  </span>;
};

const Scoring = ({ scoring }: { scoring: string }) => <span className="cdraft-scoring" data-scoring={scoring}>{scoring}</span>;

export function CompetitionDrafts() {
  const [tab, setTab] = useState<StatusTab>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('dday');

  const generalRows = useMemo(() => {
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

  const tabCount = (status: StatusTab) => (status === 'all'
    ? GENERAL.length
    : GENERAL.filter((competition) => competition.status === status).length);

  return <Localized><div className="cdraft-root">
    <p className="cdraft-draft-note">
      <Trophy size={13} aria-hidden="true" />
      모의투자 초안 4차 #54 — 흐름: ① 내 대회 현황 ② 공식 대회 ③ 일반 대회 탐색.
      표 대신 자기설명 행 카드, 필터는 상태 탭 · 검색 · 정렬 셋뿐.
    </p>

    <div className="cdraft-page">
      <header className="cdraft-page-head">
        <div>
          <p>BOT COMPETITION</p>
          <h1>모의투자</h1>
          <span>{`내 봇이 대회 ${MINE.length}개에서 뛰고 있어요. 가장 급한 마감은 ${MINE[0].name} D-${MINE[0].dday}예요.`}</span>
        </div>
        <button type="button" className="cdraft-primary">대회 만들기</button>
      </header>

      {/* ① 내 대회 현황 — 이 페이지의 첫 질문 "내 봇 몇 위지?"의 즉답. */}
      <section className="cdraft-mine" aria-label="내 대회 현황">
        {MINE.map((competition) => <button type="button" className="cdraft-mine-card" key={competition.name}>
          <span className="cdraft-mine-rank">
            <em>{competition.myRank}</em>
            <small>위</small>
          </span>
          <span className="cdraft-mine-copy">
            <strong>{competition.name}</strong>
            <small>{`${competition.myBot} · ${won(competition.bots)}봇 중`}</small>
          </span>
          <span className="cdraft-mine-facts">
            <b className="is-gain">{competition.myReturn}</b>
            <small className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</small>
          </span>
        </button>)}
      </section>

      {/* ② 공식 대회 — 들어오자마자 눌러보고 싶은 블록. 이미지가 있는 카드는
          이 구역뿐이라, 형태만으로 공식과 일반이 갈린다. */}
      <section className="cdraft-official" aria-label="공식 대회">
        <header className="cdraft-section-head">
          <h2>공식 대회</h2>
          <p>운영팀이 같은 조건으로 열어요. 참가비 없음 · 결과는 프로필에 남아요.</p>
        </header>
        <div className="cdraft-art-cards">
          {OFFICIAL.map((competition) => <button
            type="button"
            className="cdraft-art-card"
            key={competition.name}
            style={{ '--art': `url("${ARTWORK[competition.name]}")` } as CSSProperties}
          >
            <span className="cdraft-art-image" aria-hidden="true" />
            <span className="cdraft-art-top">
              <KindChip kind={competition.kind} onImage />
              <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
            </span>
            <span className="cdraft-art-body">
              <strong>{competition.name}</strong>
              <small>{competition.tagline}</small>
              <span className="cdraft-art-meta">{`${competition.scoring} · ${won(competition.bots)}봇 · ${competition.lengthDays}일`}</span>
            </span>
            <span className="cdraft-art-foot">
              {competition.myBot
                ? <span className="cdraft-art-mine"><Check size={13} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>
                : <span className="cdraft-art-idle">아직 참가하지 않았어요</span>}
              <span className="cdraft-art-cta">{competition.myBot ? '순위 보기' : '참가하기'}<ArrowRight size={14} aria-hidden="true" /></span>
            </span>
          </button>)}
        </div>
      </section>

      {/* ③ 일반 대회 — 탐색 리스트. 컨트롤은 탭·검색·정렬 셋뿐이고,
          행은 헤더 없이 스스로 설명한다. */}
      <section className="cdraft-general" aria-label="일반 대회">
        <header className="cdraft-section-head">
          <h2>일반 대회</h2>
          <p>사용자가 직접 열어요. 시작 자본·수수료는 공식 대회와 같아요.</p>
        </header>

        <div className="cdraft-toolbar">
          <div className="cdraft-tabs" role="tablist" aria-label="진행 상태">
            {([['all', '전체'], ['모집 중', '모집 중'], ['진행 중', '진행 중']] as const).map(([value, label]) => <button
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
            className="cdraft-sort"
            aria-label="정렬 기준"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </div>

        {generalRows.length === 0
          ? <div className="cdraft-empty">
            <Search size={20} aria-hidden="true" />
            <strong>조건에 맞는 대회가 없어요.</strong>
            <button type="button" onClick={() => { setTab('all'); setQuery(''); }}>전체 보기</button>
          </div>
          : <div className="cdraft-rows" role="list">
            {generalRows.map((competition) => <button type="button" className="cdraft-row" role="listitem" key={competition.name}>
              <span className="cdraft-row-main">
                <span className="cdraft-row-title">
                  <strong>{competition.name}</strong>
                  <Scoring scoring={competition.scoring} />
                  {competition.myBot && <span className="cdraft-row-mine"><Check size={12} aria-hidden="true" />{`내 봇 ${competition.myRank}위`}</span>}
                </span>
                <span className="cdraft-row-meta">
                  {`개설자 ${competition.host} · ${competition.period} · ${competition.lengthDays}일 대회 · `}
                  <em data-status={competition.status}>{competition.status}</em>
                </span>
              </span>
              <span className="cdraft-row-side">
                <span className="cdraft-row-bots">
                  <b>{won(competition.bots)}</b>
                  <small>참여 봇</small>
                </span>
                <span className="cdraft-row-dday">
                  <b className={competition.dday <= 7 ? 'is-urgent' : ''}>{`D-${competition.dday}`}</b>
                  <small>{competition.status === '모집 중' ? '모집 마감' : '대회 마감'}</small>
                </span>
                <ArrowRight className="cdraft-row-arrow" size={16} aria-hidden="true" />
              </span>
            </button>)}
          </div>}
      </section>
    </div>
  </div></Localized>;
}

function won(value: number): string {
  return value.toLocaleString('ko-KR');
}
