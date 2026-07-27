import { useMemo, useRef, useState } from 'react';
import type { ComponentType, FocusEvent, ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ChevronDown,
  Plus,
  Trophy,
  X,
} from 'lucide-react';
import { Button, Status } from '../components/common.jsx';
import { EquityChart } from '../components/EquityChart';
import type { LaunchMark } from '../components/EquityChart';
import { dateLabels, money, percent, signedMoney, walkSeries } from '../lib/equitySim';
import { bots } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

/* ---------- Types (the product is migrating to TypeScript page by page) ---- */

type PeriodKey = 'week' | 'month' | 'quarter';
type PageId = 'home' | 'strategy' | 'bots' | 'backtest' | 'rooms' | 'account' | 'notifications' | 'help';

interface BotRecord {
  name: string;
  state: string;
  capital: string;
  change: string;
  strategies: number;
  room: string;
  labels: string[];
  startDaysAgo: number;
}

interface HomeTask {
  id: string;
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' }>;
  tone: 'warning' | 'neutral';
  title: string;
  detail: string;
  action: string;
}

interface DashboardViewProps {
  setPage: (page: PageId) => void;
  openEditor: (mode: 'basic' | 'pro') => void;
}

const botList = bots as BotRecord[];

/*
  Only items that are user-actionable AND time-bound qualify as Home tasks.
  Routine engine events — rejected orders, unmet conditions — are not tasks: a
  running bot's strategy is locked, so there is nothing to act on, and they are
  frequent by design. They live in the bot's decision log and in notifications.
  Unfinished drafts are the strategy page's concern, not Home's.

  A task resolves in place: the action asks for confirmation, and once
  confirmed the banner is gone — a handled task must not keep nagging.
*/
const INITIAL_TASKS: HomeTask[] = [
  { id: 'extend-atlas', icon: CalendarClock, tone: 'warning', title: 'Atlas 07 계속 실행 확인', detail: '무소속 봇은 기한 전에 연장해야 계속 실행됩니다 · 08.10까지 (D-18)', action: '연장하기' },
];

/*
  Per-bot equity curves: a seeded random walk, one point per trading day,
  blended so each bot still ends exactly at its current capital. A smooth
  synthetic ramp reads as fake; daily noise and drawdowns are what make the
  aggregate feel like real operation. The seed is fixed so the chart is stable
  across renders and test runs.

  Bots start on different dates with the same $10,000 initial capital. A bot launched inside
  the window contributes nothing before its start and enters as a capital
  inflow. Both chart views neutralise that inflow — profit subtracts invested
  principal and the return index chain-links around inflow days — so adding a
  bot never reads as performance.
*/
const PERIODS: Record<PeriodKey, { label: string; days: number }> = {
  week: { label: '1주', days: 7 },
  month: { label: '1개월', days: 30 },
  quarter: { label: '3개월', days: 91 },
};
const INITIAL_CAPITAL = 10000;
const CAPITALS: Record<string, number> = { 'Atlas 07': 10540, 'Room Beta': 10490, 'Pair Lab': 9790 };
const LIFETIME_RETURNS: Record<string, number> = Object.fromEntries(
  Object.entries(CAPITALS).map(([name, capital]) => [name, capital / INITIAL_CAPITAL - 1]),
);
const DAILY_VOL: Record<string, number> = { 'Atlas 07': .011, 'Room Beta': .009, 'Pair Lab': .005 };
const SAMPLE_END_DATE = Date.UTC(2026, 6, 23);

/* The bot's value on each day of the window; null before its launch. */
const equitySeries = (bot: BotRecord, days: number): { startIndex: number; values: Array<number | null> } => {
  const activeDays = Math.min(days, bot.startDaysAgo);
  const startIndex = days - activeDays;
  const lifetime = LIFETIME_RETURNS[bot.name];
  const windowReturn = lifetime * (activeDays / bot.startDaysAgo);
  const active = walkSeries(bot.name, activeDays, CAPITALS[bot.name], windowReturn, DAILY_VOL[bot.name]);
  return {
    startIndex,
    values: Array.from({ length: days + 1 }, (_, index) => (index < startIndex ? null : active[index - startIndex])),
  };
};

/* ---------- Page ------------------------------------------------------------ */

const myCompetitions = [
  { room: 'Momentum Lab', bot: 'Room Beta', phase: '평가 중', remaining: '12일 남음', standing: '현재 2위 / 8' },
];

/* Each state gets its own tone: running green, evaluating blue, attention
   amber — two different states must never share a colour. */
const botTone = (state: string): 'positive' | 'info' | 'warning' =>
  state === '실행 중' ? 'positive' : state === '평가 중' ? 'info' : 'warning';

/* Label groups for aggregate selection, with the bots each one contains. */
const labelGroups = (): Array<{ label: string; names: string[] }> => {
  const groups = new Map<string, string[]>();
  for (const bot of botList) {
    for (const label of bot.labels) {
      const names = groups.get(label) ?? [];
      names.push(bot.name);
      groups.set(label, names);
    }
  }
  return [{ label: '전체', names: botList.map((bot) => bot.name) }, ...[...groups.entries()].map(([label, names]) => ({ label, names }))];
};

export function DashboardView({ setPage, openEditor }: DashboardViewProps): ReactNode {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [included, setIncluded] = useState<Set<string>>(() => new Set(botList.map((bot) => bot.name)));
  const [filterOpen, setFilterOpen] = useState(false);
  const [taskList, setTaskList] = useState<HomeTask[]>(INITIAL_TASKS);
  const [confirming, setConfirming] = useState<HomeTask | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const allClear = taskList.length === 0;
  const groups = useMemo(labelGroups, []);

  const confirmExtension = () => {
    if (!confirming) return;
    const finished = confirming;
    setTaskList((current) => current.filter((task) => task.id !== finished.id));
    setConfirming(null);
  };

  const toggleBot = (name: string) => {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        // At least one bot stays included so the chart always has a subject.
        if (next.size > 1) next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const { profit, rate, dates, launches, total, invested, twr, today, drawdown, high } = useMemo(() => {
    const { days } = PERIODS[period];
    const selected = botList.filter((bot) => included.has(bot.name));
    const series = selected.map((bot) => ({ bot, ...equitySeries(bot, days) }));

    const points = Array.from({ length: days + 1 }, (_, index) =>
      series.reduce((sum, one) => sum + (one.values[index] ?? 0), 0));
    // Invested principal per day: each launch raises it, so profit below is
    // pure performance with injections cancelled out.
    const principal = Array.from({ length: days + 1 }, (_, index) =>
      series.reduce((sum, one) => sum + (one.values[index] === null ? 0 : (one.values[one.startIndex] ?? 0)), 0));
    const starts: LaunchMark[] = series
      .filter((one) => one.startIndex > 0)
      .map((one) => ({ name: one.bot.name, index: one.startIndex }));

    // Chain-linked daily returns, excluding capital injected on launch days:
    // the time-weighted return, so a bot joining mid-window is not "profit".
    const rateSeries = [0];
    let indexValue = 1;
    let peak = 1;
    let worst = 0;
    for (let day = 1; day <= days; day += 1) {
      const inflow = series.reduce((sum, one) => sum + (one.startIndex === day ? (one.values[day] ?? 0) : 0), 0);
      if (points[day - 1] > 0) {
        indexValue *= (points[day] - inflow) / points[day - 1];
        peak = Math.max(peak, indexValue);
        worst = Math.min(worst, indexValue / peak - 1);
      }
      rateSeries.push((indexValue - 1) * 100);
    }

    return {
      profit: points.map((value, index) => value - principal[index]),
      rate: rateSeries,
      dates: dateLabels(SAMPLE_END_DATE, days),
      launches: starts,
      total: points[points.length - 1],
      invested: principal[principal.length - 1],
      twr: indexValue - 1,
      today: points[points.length - 1] / points[points.length - 2] - 1,
      drawdown: worst,
      high: Math.max(...points),
    };
  }, [included, period]);

  return <Localized><div className="page dashboard-page">
    <header className="page-heading dashboard-heading">
      <div>
        <p className="eyebrow">HOME</p>
        <h1>반갑습니다, 김전략님</h1>
        <p className="page-description">
          {allClear
            ? '봇 3개가 정상 운영 중이에요. 오늘은 확인할 일이 없습니다.'
            : `봇 3개가 정상 운영 중이에요. 아래 ${taskList.length}가지만 확인하면 됩니다.`}
        </p>
      </div>
      <div className="page-actions">
        <Button kind="primary" icon={Plus} onClick={() => openEditor('basic')}>새 전략</Button>
      </div>
    </header>

    {/* Slim banners, one line each — an inbox, not a hero panel. When there is
        nothing to check, the section does not exist: an empty inbox rendering
        "all clear" would still be claiming attention, and the situation
        sentence in the heading already says today needs nothing. */}
    {!allClear && <section className="dashboard-alerts" aria-label="확인이 필요한 작업">
      <h2 className="dashboard-alerts-label">확인이 필요한 작업<b>{taskList.length}</b></h2>
      {taskList.map((task) => {
        const Icon = task.icon;
        return <button key={task.id} className={`dashboard-alert tone-${task.tone}`} onClick={() => setConfirming(task)}>
          <Icon size={15} aria-hidden="true" />
          <span><strong>{task.title}</strong><small>{task.detail}</small></span>
          <b>{task.action}<ArrowRight size={13} /></b>
        </button>;
      })}
    </section>}

    {confirming && <div className="strategy-dialog-backdrop" onMouseDown={() => setConfirming(null)}>
      <section role="dialog" aria-modal="true" aria-label="연장 확인" className="strategy-create-dialog dashboard-confirm-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><h2>Atlas 07 계속 실행을 연장하시겠습니까?</h2><p>기한이 30일 연장됩니다. 서버가 요청을 접수한 시각 기준으로 계산합니다.</p></div>
          <button aria-label="연장 확인 닫기" onClick={() => setConfirming(null)}><X size={18} /></button>
        </header>
        <footer className="dashboard-confirm-actions">
          <Button onClick={() => setConfirming(null)}>취소</Button>
          <Button kind="primary" onClick={confirmExtension}>연장하기</Button>
        </footer>
      </section>
    </div>}

    <div className="dashboard-context-row">
      <section className="dashboard-section" aria-label="전체 성과">
        <header className="dashboard-section-head">
          <div><h2>전체 성과</h2><p>선택한 봇의 가상자산 합계</p></div>
          <div className="dashboard-chart-controls">
            {/* A dropdown with label groups plus per-bot checkboxes: up to ten
                bots can run at once, so one chip per bot does not scale. Each
                label row lists the bots it contains — picking a label must
                never be a mystery set. */}
            <div className="dashboard-filter-anchor" ref={filterRef} onBlur={(event: FocusEvent<HTMLDivElement>) => {
              if (!filterRef.current?.contains(event.relatedTarget as Node)) setFilterOpen(false);
            }}>
              <button
                type="button"
                className="dashboard-filter-trigger"
                aria-expanded={filterOpen}
                aria-label="합산에 포함할 봇 선택"
                onClick={() => setFilterOpen((open) => !open)}
              >{`봇 ${included.size}/${botList.length} 포함`}<ChevronDown size={13} aria-hidden="true" /></button>
              {filterOpen && <div className="dashboard-filter-panel" role="group" aria-label="합산에 포함할 봇 선택">
                <p className="dashboard-filter-heading">라벨로 선택</p>
                {groups.map((group) => {
                  const activeGroup = group.names.length === included.size && group.names.every((name) => included.has(name));
                  return <button
                    key={group.label}
                    type="button"
                    className={`dashboard-filter-group ${activeGroup ? 'active' : ''}`}
                    aria-pressed={activeGroup}
                    onClick={() => setIncluded(new Set(group.names))}
                  >
                    <span className="dashboard-filter-copy"><strong>{group.label}</strong><small>{group.names.join(' · ')}</small></span>
                    <b>{group.names.length}</b>
                  </button>;
                })}
                <p className="dashboard-filter-heading">봇 개별 선택</p>
                {botList.map((bot) => <label key={bot.name}>
                  <input
                    type="checkbox"
                    checked={included.has(bot.name)}
                    onChange={() => toggleBot(bot.name)}
                  />
                  <span className="dashboard-filter-copy"><strong>{bot.name}</strong><small>{bot.capital}</small></span>
                </label>)}
              </div>}
            </div>
            <div aria-label="성과 기간">{(Object.entries(PERIODS) as Array<[PeriodKey, { label: string }]>).map(([id, item]) => <button key={id} className={period === id ? 'active' : ''} aria-pressed={period === id} onClick={() => setPeriod(id)}>{item.label}</button>)}</div>
          </div>
        </header>
        {/* P&L and return are one story in two units, so they share one chart:
            the line is currency, and the day's return rides in the tooltip. */}
        <div className="dashboard-chart-summary">
          <div>
            <strong>{money(total)}</strong>
            <span className={twr >= 0 ? 'positive' : 'negative'}>{`${signedMoney(profit[profit.length - 1])} · ${percent(twr)}`}</span>
          </div>
        </div>
        <EquityChart values={profit} rates={rate} dates={dates} launches={launches} format={signedMoney} ariaLabel="선택한 봇의 손익과 수익률 차트" />
        <dl className="dashboard-chart-stats">
          <div><dt>오늘</dt><dd className={today >= 0 ? 'positive' : 'negative'}>{percent(today)}</dd></div>
          <div><dt>최대 낙폭</dt><dd>{percent(drawdown)}</dd></div>
          <div><dt>투입 원금</dt><dd>{money(invested)}</dd></div>
          <div><dt>기간 최고</dt><dd>{money(high)}</dd></div>
        </dl>
        <p className="dashboard-chart-note">손익과 수익률은 자금 유입을 제외해 계산합니다. 봇 시작 시점은 세로 점선으로 표시합니다.</p>
      </section>

      <div className="dashboard-side">
        <section className="dashboard-section" aria-label="운용 중인 봇">
          <header className="dashboard-section-head">
            <div><h2>운용 중인 봇</h2></div>
            <button className="dashboard-section-link" onClick={() => setPage('bots')}>봇 전체 보기<ArrowRight size={13} /></button>
          </header>
          <div className="dashboard-bot-list">
            {botList.map((bot) => <button key={bot.name} onClick={() => setPage('bots')}>
              <span className="dashboard-bot-icon" aria-hidden="true"><Bot size={16} /></span>
              {/* Competition entries keep the personal label's format; only
                  the colour and the tiny trophy differ. */}
              <span className="dashboard-bot-name">
                <strong>{bot.name}</strong>
                {bot.room === '개인 봇'
                  ? <small>개인 운용</small>
                  : <small className="dashboard-bot-scope"><Trophy size={10} aria-hidden="true" />{`${bot.room} 대회`}</small>}
              </span>
              <Status tone={botTone(bot.state)}>{bot.state}</Status>
              <span className="dashboard-bot-figures">
                <strong className={bot.change.startsWith('+') ? 'positive' : 'negative'}>{bot.change}</strong>
                <small>{bot.capital}</small>
              </span>
            </button>)}
          </div>
        </section>

        <section className="dashboard-section" aria-label="참여 중인 대회">
          <header className="dashboard-section-head">
            <div><h2>참여 중인 대회</h2></div>
            <button className="dashboard-section-link" onClick={() => setPage('rooms')}>대회 보기<ArrowRight size={13} /></button>
          </header>
          <div className="dashboard-room-list">
            {myCompetitions.map((entry) => <button key={entry.room} onClick={() => setPage('rooms')}>
              <span className="dashboard-bot-icon is-room" aria-hidden="true"><Trophy size={15} /></span>
              <span className="dashboard-bot-name">
                <strong>{entry.room}</strong>
                <small>{entry.bot} · {entry.standing}</small>
              </span>
              <span className="dashboard-room-phase"><Status tone="positive">{entry.phase}</Status><small>{entry.remaining}</small></span>
            </button>)}
          </div>
        </section>
      </div>
    </div>
  </div></Localized>;
}
