import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Play,
  Plus,
  Trophy,
} from 'lucide-react';
import { Button, PageHeading, Panel, Status } from '../components/common.jsx';
import { notifications, strategies } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

const performance = {
  week: {
    label: '1주',
    value: '+1.24%',
    points: '0,112 70,105 140,108 210,91 280,96 350,72 420,78 490,54 560,61 630,37 700,43 770,20 840,27 910,12',
    benchmark: '0,118 70,114 140,109 210,104 280,99 350,94 420,88 490,82 560,77 630,70 700,65 770,58 840,54 910,47',
  },
  month: {
    label: '1개월',
    value: '+4.82%',
    points: '0,119 70,111 140,115 210,99 280,86 350,92 420,69 490,76 560,48 630,58 700,35 770,42 840,18 910,10',
    benchmark: '0,120 70,116 140,112 210,106 280,101 350,96 420,91 490,85 560,79 630,74 700,68 770,61 840,55 910,49',
  },
  quarter: {
    label: '3개월',
    value: '+8.36%',
    points: '0,124 70,118 140,101 210,109 280,83 350,88 420,62 490,72 560,49 630,55 700,31 770,38 840,16 910,8',
    benchmark: '0,123 70,119 140,114 210,110 280,103 350,98 420,92 490,87 560,81 630,75 700,69 770,63 840,57 910,50',
  },
};

const tasks = [
  { icon: AlertTriangle, tone: 'warning', title: 'Pair Lab 주문 거절', detail: '예산 상한을 초과해 주문이 생성되지 않았습니다.', action: '확인', target: 'bots' },
  { icon: Clock3, tone: 'neutral', title: 'Pair Spread Monitor 미완성', detail: '종목 섹션의 매수 전략을 완성해 주세요.', action: '이어 만들기', target: 'strategy' },
];

const recentStrategies = [
  { ...strategies[0], symbols: 'SPY · QQQ', return: '+2.18%', stateTone: 'positive' },
  { ...strategies[1], symbols: 'AAPL · MSFT', return: '—', stateTone: 'warning' },
  { ...strategies[2], symbols: 'NVDA', return: '+0.74%', stateTone: 'neutral' },
];

export function DashboardView({ setPage, openEditor }) {
  const [period, setPeriod] = useState('month');
  const [compare, setCompare] = useState('S&P 500');
  const chart = performance[period];

  return <Localized><div className="page dashboard-page">
    <PageHeading
      eyebrow="HOME · 2026.07.23"
      title="오늘의 운용 현황"
      description="확인이 필요한 작업과 내 전략의 성과를 한눈에 확인하세요."
      actions={<Button kind="primary" icon={Plus} onClick={() => openEditor('basic')}>새 전략</Button>}
    />

    <section className="dashboard-metrics" aria-label="운용 요약">
      <article><span><Bot size={15} />운용 중인 봇</span><strong>3</strong><small>개인 2 · 대회 1</small></article>
      <article><span><CircleDollarSign size={15} />오늘 수익률</span><strong className="positive">+1.24%</strong><small>+$312.48</small></article>
      <article><span><AlertTriangle size={15} />확인 필요</span><strong>2</strong><small>주문 1 · 전략 1</small></article>
      <article><span><Trophy size={15} />대회 순위</span><strong>12위</strong><small>Momentum Lab · 48명</small></article>
    </section>

    <div className="dashboard-main-grid">
      <Panel
        className="dashboard-tasks"
        title="확인이 필요한 작업"
        subtitle="운영에 영향을 주는 항목만 모았습니다"
        action={<span className="dashboard-count">2</span>}
      >
        <div className="dashboard-task-list">
          {tasks.map(({ icon: Icon, tone, title, detail, action, target }) => (
            <button key={title} onClick={() => setPage(target)}>
              <span className={`dashboard-task-icon tone-${tone}`}><Icon size={16} /></span>
              <span><strong>{title}</strong><small>{detail}</small></span>
              <b>{action}<ArrowRight size={13} /></b>
            </button>
          ))}
        </div>
        <div className="dashboard-all-clear"><CheckCircle2 size={14} />나머지 봇과 전략은 정상입니다.</div>
      </Panel>

      <Panel
        className="dashboard-performance"
        title="전체 성과"
        subtitle="운용 중인 봇의 가상자산 합계"
        action={<div className="dashboard-chart-controls">
          <label><span className="sr-only">비교 기준</span><select aria-label="비교 기준" value={compare} onChange={(event) => setCompare(event.target.value)}><option>S&amp;P 500</option><option>NASDAQ 100</option><option>비교 안 함</option></select></label>
          <div aria-label="성과 기간">{Object.entries(performance).map(([id, item]) => <button key={id} className={period === id ? 'active' : ''} onClick={() => setPeriod(id)}>{item.label}</button>)}</div>
        </div>}
      >
        <div className="dashboard-chart-summary">
          <div><strong>$25,204.88</strong><span className="positive">{chart.value}</span></div>
          <div className="dashboard-legend"><span><i />내 자산</span>{compare !== '비교 안 함' && <span><i />{compare}</span>}</div>
        </div>
        <div className="dashboard-chart" aria-label={`${chart.label} 전체 성과 차트`}>
          <svg viewBox="0 0 910 140" role="img">
            <defs><linearGradient id="home-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".2" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
            {[20, 60, 100, 140].map((y) => <line key={y} x1="0" x2="910" y1={y} y2={y} />)}
            <polygon points={`${chart.points} 910,140 0,140`} />
            {compare !== '비교 안 함' && <polyline className="benchmark" points={chart.benchmark} />}
            <polyline className="portfolio" points={chart.points} />
          </svg>
        </div>
      </Panel>
    </div>

    <Panel
      className="dashboard-strategies"
      title="내 전략"
      subtitle="최근 사용한 전략"
      action={<button className="dashboard-section-link" onClick={() => setPage('strategy')}>전체 보기<ArrowRight size={13} /></button>}
    >
      <div className="dashboard-strategy-list">
        {recentStrategies.map((strategy) => <button key={strategy.name} onClick={() => setPage('strategy')}>
          <span className={`dashboard-mode mode-${strategy.mode.toLowerCase()}`}>{strategy.mode.slice(0, 1)}</span>
          <span className="dashboard-strategy-name"><strong>{strategy.name}</strong><small>{strategy.symbols}</small></span>
          <span><small>상태</small><Status tone={strategy.stateTone}>{strategy.state}</Status></span>
          <span><small>최근 수익률</small><strong className={strategy.return.startsWith('+') ? 'positive' : ''}>{strategy.return}</strong></span>
          <ArrowRight size={15} />
        </button>)}
      </div>
    </Panel>

    <Panel className="dashboard-activity" title="최근 활동" subtitle="의미 있는 실행 결과만 표시합니다">
      <div className="dashboard-activity-list">
        {notifications.slice(0, 4).map((item, index) => <button key={item.title} onClick={() => setPage(index === 3 ? 'backtest' : index === 2 ? 'rooms' : 'bots')}>
          <span className="activity-mark"><Play size={11} /></span>
          <span><small>{item.kind}</small><strong>{item.title}</strong></span>
          <time>{item.time}</time>
          <ArrowRight size={14} />
        </button>)}
      </div>
    </Panel>
  </div></Localized>;
}
