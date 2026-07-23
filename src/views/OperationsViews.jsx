import { useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Bot, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock3, Coins, Play, Plus, RefreshCw, Search, SlidersHorizontal, TrendingUp, Trophy, Users } from 'lucide-react';
import { AreaChart, BarList, MiniSpark } from '../components/charts.jsx';
import { Button, DataTable, HelpNote, PageHeading, Panel, StatCard, Status } from '../components/common.jsx';
import { bots, botSeries, equitySeries, leaderboard, monthlyFailures, positions, trades } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

const botTone = (state) => state === '실행 중' || state === '평가 중' ? 'positive' : 'warning';

export function BotsView() {
  const botColumns = [
    { key: 'name', label: '봇', render: (row) => <span className="entity-cell"><span className="entity-icon"><Bot size={16} /></span><span><strong>{row.name}</strong><small>{row.room}</small></span></span> },
    { key: 'state', label: '상태', render: (row) => <Status tone={botTone(row.state)}>{row.state}</Status> },
    { key: 'capital', label: '총자산' },
    { key: 'change', label: '누적 수익률', render: (row) => <strong className={row.change.startsWith('+') ? 'positive' : 'negative'}>{row.change}</strong> },
    { key: 'strategies', label: '전략' },
  ];
  const positionColumns = [
    { key: 'symbol', label: '종목', render: (row) => <strong>{row.symbol}</strong> },
    { key: 'qty', label: '수량' }, { key: 'avg', label: '평균가' }, { key: 'price', label: '현재가' },
    { key: 'pnl', label: '평가손익', render: (row) => <span className="positive">{row.pnl}</span> }, { key: 'share', label: '비중' },
  ];
  return <Localized><div className="page"><PageHeading eyebrow="LIVE OPERATIONS" title="봇 운영 센터" description="서버에서 실행 중인 봇과 공식 가상 체결 상태를 확인합니다." actions={<><Button icon={RefreshCw}>새로고침</Button><Button kind="primary" icon={Plus}>봇 출시</Button></>} />
    <div className="stats-grid four"><StatCard label="실행 중" value="2 / 10" detail="최대 동시 운영" icon={Play} /><StatCard label="전체 가상자산" value="$54,016.60" detail="3개 봇 합계" trend="+1.11%" icon={Coins} /><StatCard label="오늘 체결" value="07" detail="개별 체결 기준" icon={CheckCircle2} /><StatCard label="확인 기한" value="D−18" detail="Atlas 07 계속 실행" icon={Clock3} /></div>
    <div className="content-grid operations-grid"><Panel className="span-2" title="운영 자산" subtitle="Atlas 07 · 미국 동부 시각 기준" action={<span className="live-pill"><i /> MARKET OPEN</span>}><div className="chart-summary"><strong>$24,892.40</strong><span className="positive">+$450.18 · 1.84%</span></div><AreaChart values={botSeries} label="Atlas 07 자산 변화" /></Panel><Panel title="봇 상태" subtitle="실행·평가·조치 상태"><DataTable columns={botColumns} rows={bots} /></Panel><Panel className="span-2" title="현재 포지션" subtitle="공식 가상 체결 원장 기준"><DataTable columns={positionColumns} rows={positions} /></Panel><Panel title="최근 판단" subtitle="실시간 노드 실행은 표시하지 않습니다"><div className="event-list"><div><span className="event-dot positive" /><strong>SPY 주문 체결</strong><small>10:14:08 ET · 12주</small></div><div><span className="event-dot" /><strong>예산 상한 검사 통과</strong><small>10:14:02 ET · Opening Range</small></div><div><span className="event-dot muted" /><strong>AAPL 조건 미충족</strong><small>10:13:00 ET · 최초 실패 RSI</small></div></div></Panel></div>
  </div></Localized>;
}

export function BacktestView() {
  const columns = [{ key: 'time', label: '시각 (ET)' }, { key: 'symbol', label: '종목' }, { key: 'side', label: '행동', render: (r) => <span className={r.side === '매수' ? 'buy-text' : 'sell-text'}>{r.side}</span> }, { key: 'order', label: '요청액' }, { key: 'fill', label: '체결액' }, { key: 'fee', label: '수수료' }, { key: 'result', label: '결과' }];
  return <Localized><div className="page"><PageHeading eyebrow="AUTOMATED REVIEW" title="자동 백테스트" description="출시된 전략을 같은 분기의 고정 구간과 공식 데이터 스냅샷으로 평가합니다." meta={<Status tone="positive">완료 · 2026 Q3</Status>} actions={<Button icon={CalendarDays}>2026년 7월</Button>} />
    <div className="stats-grid four"><StatCard label="기간 수익률" value="+3.58%" detail="초기 $10,000" icon={ArrowUpRight} /><StatCard label="최대 낙폭" value="−2.14%" detail="기간 내 고점 대비" icon={Activity} /><StatCard label="개별 체결" value="42" detail="부분 체결 각각 집계" icon={CheckCircle2} /><StatCard label="비용 모델" value="0.25%" detail="수수료 0.2 + 슬리피지 0.05" icon={Coins} /></div>
    <div className="content-grid backtest-grid"><Panel className="span-2" title="자산 곡선" subtitle="2023 Q3–2026 Q2 · 조정 가격 데이터"><div className="chart-summary"><strong>$10,358.00</strong><span className="positive">+$358.00</span></div><AreaChart values={equitySeries} label="백테스트 자산 곡선" /></Panel><Panel title="조건 미충족 요약" subtitle="최초 실패 조건별 월간 횟수"><BarList items={monthlyFailures} /><HelpNote>거래가 없었던 개별 평가 로그는 보존하거나 표시하지 않습니다.</HelpNote></Panel><Panel className="span-3" title="2026년 7월 거래 상세" subtitle="주문·개별 체결·취소·거절과 거래 후 상태"><DataTable columns={columns} rows={trades} rowKey="time" /></Panel></div>
  </div></Localized>;
}

const officialCompetitions = [
  { name: 'I2S Summer League', bots: 184, ranking: '표준점수제', score: '복합 점수', submissions: '6,512건', averageReturn: '+12.64%', bestReturn: '+38.21%', tone: 'standard', official: true },
  { name: 'Risk Control Cup', bots: 96, ranking: '위험조정 점수제', score: '최대 낙폭', submissions: '3,742건', averageReturn: '+8.91%', bestReturn: '+26.73%', tone: 'risk', official: true },
  { name: 'ETF Sprint', bots: 128, ranking: '수익률 점수제', score: '수익률', submissions: '5,183건', averageReturn: '+6.47%', bestReturn: '+22.18%', tone: 'return', official: true },
  { name: 'Volatility Shield', bots: 72, ranking: '샤프 점수제', score: '샤프 지수', submissions: '3,305건', averageReturn: '-1.29%', bestReturn: '+11.02%', tone: 'sharpe', official: true },
];

const officialBotsTotal = officialCompetitions.reduce((total, competition) => total + competition.bots, 0);
const officialLeaderboard = [
  { rank: 1, bot: 'AlphaCore_7X', score: '9,842.15', return: '+28.47%' },
  { rank: 2, bot: 'QuantumFlow', score: '9,215.63', return: '+22.31%' },
  { rank: 3, bot: 'Nimbus_Algo', score: '8,743.28', return: '+19.84%' },
  { rank: 4, bot: 'VectorEdge', score: '8,201.47', return: '+15.73%' },
  { rank: 5, bot: 'AtlasQuant', score: '7,890.54', return: '+13.29%' },
];
const officialChartSeries = [
  { name: 'I2S Summer League', tone: 'standard', points: '16,221 75,216 135,204 194,187 254,163 313,139 373,118 432,98 492,71 551,52 611,37 670,31 724,28', value: '+24.61%' },
  { name: 'Risk Control Cup', tone: 'risk', points: '16,221 75,219 135,210 194,199 254,181 313,166 373,151 432,136 492,117 551,105 611,91 670,83 724,78', value: '+16.38%' },
  { name: 'ETF Sprint', tone: 'return', points: '16,221 75,220 135,216 194,213 254,204 313,198 373,188 432,178 492,167 551,156 611,147 670,140 724,134', value: '+9.21%' },
  { name: 'Volatility Shield', tone: 'sharpe', points: '16,221 75,223 135,222 194,225 254,228 313,226 373,230 432,226 492,229 551,225 611,231 670,227 724,232', value: '-1.84%' },
];

const competitionRooms = [
  { name: 'Momentum Lab', score: '복합 점수', ranking: '표준점수제', people: 10, joined: 8, averageSubmissions: '4.5회', submissions: '36회' },
  { name: 'ETF Discipline', score: '최대 낙폭', ranking: '위험조정 점수제', people: 20, joined: 5, averageSubmissions: '3.8회', submissions: '19회' },
  { name: 'Quant Study 04', score: '수익률', ranking: '수익률 점수제', people: 8, joined: 3, averageSubmissions: '6.0회', submissions: '18회' },
  { name: 'Low Volatility Club', score: '샤프 지수', ranking: '샤프 점수제', people: 30, joined: 24, averageSubmissions: '2.5회', submissions: '60회' },
];

const rankingToneByLabel = {
  표준점수제: 'standard',
  '위험조정 점수제': 'risk',
  '수익률 점수제': 'return',
  '샤프 점수제': 'sharpe',
};

function CompetitionRankingMethod({ ranking }) {
  return <span className="competition-ranking-method">
    <small>순위 산정 방식</small>
    <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[ranking] ?? 'standard'}>{ranking}</strong>
  </span>;
}

function OfficialPerformanceChart() {
  return <section className="official-performance-panel" aria-label="2026 Q3 시즌 성과 차트">
    <header>
      <h2>시즌 성과</h2>
      <span>누적 수익률(%)</span>
    </header>
    <div className="official-performance-legend">
      {officialChartSeries.map((series) => <span key={series.name} data-chart-tone={series.tone}><i />{series.name}</span>)}
    </div>
    <div className="official-performance-chart">
      <svg viewBox="0 0 800 260" role="img" aria-label="공식 대회별 누적 수익률 추이" preserveAspectRatio="none">
        {[32, 92, 152, 212].map((y) => <line className="official-chart-gridline" key={y} x1="16" x2="784" y1={y} y2={y} />)}
        {officialChartSeries.map((series) => <g key={series.name} data-chart-tone={series.tone}>
          <polyline className="official-chart-line" points={series.points} />
          <text className="official-chart-value" x="735" y={Number(series.points.split(' ').at(-1).split(',')[1]) + 4}>{series.value}</text>
        </g>)}
      </svg>
      <div className="official-chart-axis"><span>07.01</span><span>07.29</span><span>08.26</span><span>09.23</span><span>09.30</span></div>
    </div>
  </section>;
}

function OfficialLeaderboard() {
  return <section className="official-leaderboard-panel" aria-label="2026 Q3 전체 순위">
    <header><h2>전체 순위</h2><span>TOP 5</span></header>
    <div className="official-leaderboard-head"><span>순위</span><span>봇 이름</span><span>총점</span><span>수익률</span></div>
    <div className="official-leaderboard-body">
      {officialLeaderboard.map((entry) => <div key={entry.rank}>
        <strong data-rank={entry.rank}>{entry.rank}</strong>
        <span><Bot size={14} />{entry.bot}</span>
        <b>{entry.score}</b>
        <em>{entry.return}</em>
      </div>)}
    </div>
  </section>;
}

function OfficialCompetitionGrid({ onSelect }) {
  return <div className="official-competition-list competition-card-grid" role="list">{officialCompetitions.map((competition, index) =>
    <div role="listitem" key={competition.name}>
      <article className="competition-discovery-card official-competition-card-tile" data-card-tone={competition.tone} role="button" tabIndex="0" aria-label={`${competition.name} 열기`} onClick={() => onSelect(competition)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(competition);
        }
      }}>
        <header><h3>{competition.name}</h3><span className="official-competition-index">{String(index + 1).padStart(2, '0')}</span></header>
        <CompetitionRankingMethod ranking={competition.ranking} />
        <div className="competition-card-counts">
          <span><small>참여 봇</small><strong>{competition.bots}개</strong></span>
          <span><small>총 제출</small><strong>{competition.submissions}</strong></span>
          <span><small>평균 수익률</small><strong className={competition.averageReturn.startsWith('+') ? 'positive' : 'negative'}>{competition.averageReturn}</strong></span>
          <span><small>최고 수익률</small><strong className="positive">{competition.bestReturn}</strong></span>
        </div>
      </article>
    </div>
  )}</div>;
}

export function RoomsView() {
  const [query, setQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [officialSeasonOpen, setOfficialSeasonOpen] = useState(false);
  const visibleRooms = useMemo(() => competitionRooms.filter((room) => {
    const matchesQuery = room.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesScore = scoreFilter === 'all' || room.score === scoreFilter;
    const matchesSize = sizeFilter === 'all' || (sizeFilter === 'small' ? room.people <= 10 : room.people > 10);
    return matchesQuery && matchesScore && matchesSize;
  }), [query, scoreFilter, sizeFilter]);
  const activeFilterCount = Number(scoreFilter !== 'all') + Number(sizeFilter !== 'all');

  if (selectedRoom) return <Localized><div className="page competition-page competition-detail-page">
    <section aria-label={`${selectedRoom.name} 상세 페이지`}>
      <button className="competition-back-button" onClick={() => setSelectedRoom(null)}><ArrowLeft size={15} /> Competition 목록으로</button>
      <header className="competition-detail-heading">
        <div><p>COMPETITION DETAIL</p><h1>{selectedRoom.name}</h1></div>
      </header>
      <div className="competition-detail-summary">
        {!selectedRoom.official && <span><small>참여 인원</small><strong>{selectedRoom.people}명</strong></span>}
        <span><small>참여 봇</small><strong>{selectedRoom.official ? selectedRoom.bots : selectedRoom.joined}개</strong></span>
        <span><small>순위 산정 방식</small><strong>{selectedRoom.ranking}</strong></span>
      </div>
      <div className="competition-detail-guide">
        <div><Bot size={17} /><span><strong>봇끼리 공정하게 비교합니다.</strong><small>사용자 대신 익명 봇만 순위에 표시됩니다.</small></span></div>
      </div>
      <div className="competition-ranking" aria-label={`${selectedRoom.name} 봇 순위`}>
        <header><span>순위</span><span>봇</span><span>점수</span><span>수익률</span></header>
        {leaderboard.map((entry) => <div className={entry.mine ? 'is-mine' : ''} key={entry.rank}><strong>#{entry.rank}</strong><span>{entry.bot}{entry.mine && <small>내 봇</small>}</span><b>{entry.score}</b><span className="positive">{entry.return}</span></div>)}
      </div>
    </section>
  </div></Localized>;

  if (officialSeasonOpen) return <Localized><div className="page competition-page official-season-page">
    <section aria-label="2026 Q3 공식 대회 페이지">
      <button className="competition-back-button" onClick={() => setOfficialSeasonOpen(false)}><ArrowLeft size={15} /> Competition으로</button>
      <header className="official-season-page-heading">
        <div><p>OFFICIAL SEASON</p><h1>2026 Q3 공식 대회</h1></div>
        <span>2026.07.01 – 2026.09.30 <strong>D-73</strong></span>
      </header>
      <div className="official-season-page-summary">
        <span><i data-summary-tone="standard"><Trophy size={18} /></i><small>공식 대회</small><strong>{officialCompetitions.length}개</strong></span>
        <span><i data-summary-tone="risk"><Bot size={18} /></i><small>참여 봇</small><strong>{officialBotsTotal}개</strong></span>
        <span><i data-summary-tone="return"><ClipboardList size={18} /></i><small>총 제출</small><strong>18,742건</strong></span>
        <span><i data-summary-tone="sharpe"><TrendingUp size={18} /></i><small>평균 수익률</small><strong className="positive">+8.73%</strong></span>
      </div>
      <div className="official-season-insights">
        <OfficialPerformanceChart />
        <OfficialLeaderboard />
      </div>
      <section className="official-season-rooms" aria-labelledby="official-season-rooms-title">
        <header><h2 id="official-season-rooms-title">공식 대회</h2><span>{officialCompetitions.length}개</span></header>
        <OfficialCompetitionGrid onSelect={setSelectedRoom} />
      </section>
    </section>
  </div></Localized>;

  return <Localized><div className="page competition-page">
    <PageHeading eyebrow="BOT COMPETITION" title="Competition" />

    <section className="competition-season" role="button" tabIndex="0" aria-label="2026 Q3 공식 대회 보러가기" onClick={() => setOfficialSeasonOpen(true)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOfficialSeasonOpen(true);
      }
    }}>
      <div className="competition-season-title">
        <div className="competition-season-eyebrow"><span>CURRENT SEASON</span></div>
        <h2>2026 Q3 공식 시즌</h2>
        <p><CalendarDays size={14} /> 2026.07.01 – 2026.09.30</p>
      </div>
      <div className="competition-season-progress">
        <div><span>시즌 진행률</span><strong>21%</strong></div>
        <span role="progressbar" aria-label="2026 Q3 시즌 진행률" aria-valuemin="0" aria-valuenow="21" aria-valuemax="100"><i style={{ width: '21%' }} /></span>
        <div className="competition-season-scale"><span>시작</span><span>종료</span></div>
      </div>
      <div className="competition-season-stats">
        <div><small>전체 참여</small><strong>{officialBotsTotal}</strong><span>{officialCompetitions.length}개 공식 방</span></div>
        <div><small>시즌 종료</small><strong>D-73</strong><span>성과 확정까지</span></div>
      </div>
      <span className="competition-season-detail">공식 대회 보러가기 <ArrowUpRight size={16} /></span>
    </section>

    <section className="competition-browser panel">
      <header className="competition-browser-head">
        <div><h2>내 봇에 맞는 Competition 찾기</h2></div>
        <Button kind="primary" icon={Plus}>Competition 만들기</Button>
      </header>
      <div className="competition-toolbar">
        <label><Search size={15} /><input type="search" aria-label="Competition 검색" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="competition-filter">
          <button className={activeFilterCount ? 'competition-filter-trigger is-active' : 'competition-filter-trigger'} aria-label="Competition 필터" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal size={15} /><span>필터</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}{filtersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {filtersOpen && <section className="competition-filter-panel" role="dialog" aria-label="Competition 필터 설정">
            <div className="competition-filter-group">
              <strong>점수 방식</strong>
              <div role="group" aria-label="점수 방식 선택">
                {[['all', '전체'], ['복합 점수', '복합 점수'], ['최대 낙폭', '최대 낙폭'], ['수익률', '수익률'], ['샤프 지수', '샤프 지수']].map(([value, label]) =>
                  <button key={value} className={scoreFilter === value ? 'active' : ''} aria-label={`${label} 점수 방식 선택`} aria-pressed={scoreFilter === value} onClick={() => setScoreFilter(value)}>{label}</button>
                )}
              </div>
            </div>
            <div className="competition-filter-group">
              <strong>참여 인원</strong>
              <div role="group" aria-label="참여 인원 선택">
                {[['all', '전체'], ['small', '10명 이하'], ['large', '11명 이상']].map(([value, label]) =>
                  <button key={value} className={sizeFilter === value ? 'active' : ''} aria-label={`${label} 참여 인원 선택`} aria-pressed={sizeFilter === value} onClick={() => setSizeFilter(value)}>{label}</button>
                )}
              </div>
            </div>
            <footer>
              <button onClick={() => { setScoreFilter('all'); setSizeFilter('all'); }}>필터 초기화</button>
              <button className="primary" onClick={() => setFiltersOpen(false)}>필터 적용</button>
            </footer>
          </section>}
        </div>
      </div>
      <div className="competition-result-summary"><strong>{visibleRooms.length}개의 Competition</strong></div>
      <div className="competition-list competition-card-grid" role="list" aria-label="Competition 목록">
        {visibleRooms.map((room) => <div role="listitem" key={room.name}>
          <article className="competition-discovery-card competition-room-card" role="button" tabIndex="0" aria-label={`${room.name} 열기`} onClick={() => setSelectedRoom(room)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedRoom(room);
            }
          }}>
            <header><h3>{room.name}</h3><CompetitionRankingMethod ranking={room.ranking} /></header>
            <div className="competition-card-counts">
              <span><small>참여 봇</small><strong>{room.joined}개</strong></span>
              <span><small>참여 인원</small><strong>{room.people}명</strong></span>
              <span><small>봇당 평균 제출</small><strong>{room.averageSubmissions}</strong></span>
              <span><small>총 제출</small><strong>{room.submissions}</strong></span>
            </div>
          </article>
        </div>)}
        {visibleRooms.length === 0 && <div className="competition-empty"><Search size={20} /><strong>조건에 맞는 Competition이 없습니다.</strong><button onClick={() => { setQuery(''); setScoreFilter('all'); setSizeFilter('all'); }}>필터 초기화</button></div>}
      </div>
    </section>
  </div></Localized>;
}
