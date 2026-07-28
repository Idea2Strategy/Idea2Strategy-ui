import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, CircleHelp, Moon, Palette, Search, Sun, X } from 'lucide-react';
import i2sLogo from './assets/i2s-logo.svg';
import { bots, notifications, rooms, strategies } from './data/mockData';
import { navItems, pageFromPathname, pagePaths, strategyModeFromPathname } from './lib/navigation';
import type { PageId } from './lib/navigation';
import { LanguageProvider, Localized, useLanguage } from './lib/i18n';
import { BasicEditor, ProEditor, StrategyHome } from './views/StrategyViews';
import { BacktestView, RoomsView } from './views/OperationsViews';
import { BotsView } from './views/BotsView';
import { AccountView, HelpView, NotificationsView } from './views/SupportViews';
import { DashboardView } from './views/DashboardView';
import { DesignConceptLab } from './views/DesignConceptLab';
import './styles/tokens.css';
import './styles/base.css';
import './styles/balanced.css';
import './styles/concepts.css';

/*
  Everything the global search can reach. The box used to be decorative: it
  looked like the product's main search affordance but had no behaviour at all,
  which is exactly the pattern the interaction audit rules out.
*/
interface SearchTarget {
  kind: string;
  label: string;
  page: PageId;
}

const searchTargets: SearchTarget[] = [
  ...navItems.map((item) => ({ kind: '화면', label: item.label, page: item.id })),
  { kind: '화면', label: '내 계정', page: 'account' as const },
  { kind: '화면', label: '알림', page: 'notifications' as const },
  { kind: '화면', label: '도움말', page: 'help' as const },
  ...strategies.map((strategy) => ({ kind: '전략', label: strategy.name, page: 'strategy' as const })),
  ...bots.map((bot) => ({ kind: '봇', label: bot.name, page: 'bots' as const })),
  ...rooms.map((room) => ({ kind: '대회', label: room.name, page: 'rooms' as const })),
];

type SetPage = (page: PageId) => void;

function GlobalSearch({ setPage }: { setPage: SetPage }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return searchTargets
      .filter((target) => `${target.label} ${t(target.label)}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [query, t]);

  const choose = (target: SearchTarget) => {
    setPage(target.page);
    setQuery('');
    setOpen(false);
  };

  return <div className="global-search-anchor" ref={wrapRef} onBlur={(event: FocusEvent<HTMLDivElement>) => {
    if (!wrapRef.current?.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label className="global-search">
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        aria-label="전체 검색"
        placeholder="SEARCH"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Escape') { setQuery(''); setOpen(false); }
          if (event.key === 'Enter' && matches.length > 0) choose(matches[0]);
        }}
      />
    </label>
    {open && query.trim() && <div className="global-search-results" role="listbox" aria-label="검색 결과">
      {matches.length > 0
        ? matches.map((target) => <button
          key={`${target.kind}-${target.label}`}
          type="button"
          role="option"
          aria-selected="false"
          onClick={() => choose(target)}
        ><small>{target.kind}</small><strong>{target.label}</strong><ArrowRight size={13} aria-hidden="true" /></button>)
        : <p>일치하는 화면이나 항목이 없습니다.</p>}
    </div>}
  </div>;
}

type Theme = 'dark' | 'light';
type Updown = 'kr' | 'us';

interface TopbarProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  page: PageId;
  setPage: SetPage;
  updown: Updown;
  setUpdown: (updown: Updown) => void;
}

function Topbar({ theme, setTheme, page, setPage, updown, setUpdown }: TopbarProps) {
  const { language, setLanguage } = useLanguage();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const labels: Partial<Record<PageId, string>> = { home: 'HOME', strategy: 'STRATEGIES', bots: 'BOTS', backtest: 'BACKTEST', rooms: 'COMPETITION' };
  const togglePanel = (panel: string) => setOpenPanel((current) => current === panel ? null : panel);
  const unreadCount = notifications.filter((item) => item.unread).length;

  return <Localized><header className="app-topbar signal-product-nav">
    <button className="signal-product-brand" aria-label="Idea2Strategy 홈" onClick={() => setPage('home')}>
      <img src={i2sLogo} alt="Idea2Strategy" />
      <strong>IDEA<span>2</span>STRATEGY</strong>
    </button>
    <nav aria-label="Signal 주요 메뉴" data-orientation="horizontal">
      {navItems.map(({ id, label }) => <button
        key={id}
        className={page === id ? 'active' : ''}
        aria-label={label}
        onClick={() => setPage(id)}
      >{labels[id]}</button>)}
    </nav>
    <div className="signal-nav-tools">
      <GlobalSearch setPage={setPage} />
      <div className="topbar-popover-anchor">
        <button className="icon-button has-count" aria-label="알림" onClick={() => togglePanel('notifications')}><Bell size={17} />{unreadCount > 0 && <b>{unreadCount}</b>}</button>
        {openPanel === 'notifications' && <section className="topbar-popover notifications-popover" role="dialog" aria-label="최근 알림">
          <header><div><strong>최근 알림</strong><span>읽지 않음 {unreadCount}개</span></div><button aria-label="알림 닫기" onClick={() => setOpenPanel(null)}><X size={15} /></button></header>
          <div>{notifications.slice(0, 3).map((item) => <button
            className={item.unread ? 'unread' : ''}
            key={item.title}
            aria-label={`${item.title} 알림 열기`}
            onClick={() => { setOpenPanel(null); setPage('notifications'); }}
          ><i /><span><strong>{item.title}</strong><small>{item.time}</small></span></button>)}</div>
          <footer><button onClick={() => { setOpenPanel(null); setPage('notifications'); }}>알림 전체 보기<ArrowRight size={13} aria-hidden="true" /></button></footer>
        </section>}
      </div>
      <button className={`icon-button ${page === 'help' ? 'active' : ''}`} aria-label="도움말" onClick={() => setPage('help')}><CircleHelp size={17} /></button>
      <button className="icon-button" aria-label={theme === 'light' ? '다크 모드' : '라이트 모드'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
      <label className="language-select">
        <span className="sr-only">상승·하락 색상 선택</span>
        <select aria-label="상승·하락 색상 선택" value={updown} onChange={(event) => setUpdown(event.target.value as Updown)}>
          <option value="kr">상승 빨강</option>
          <option value="us">상승 초록</option>
        </select>
      </label>
      <label className="language-select">
        <span className="sr-only">언어 선택</span>
        <select aria-label="언어 선택" value={language} onChange={(event) => setLanguage(event.target.value as 'ko' | 'en')}>
          <option value="ko">KO</option>
          <option value="en">EN</option>
        </select>
      </label>
      <button className={`signal-user ${page === 'account' ? 'active' : ''}`} aria-label="내 계정" onClick={() => setPage('account')}>KIM <i /></button>
    </div>
  </header></Localized>;
}

/*
  Colour templates: each swaps only the brand accent (per theme, in
  tokens.css). The dot previews the accent the current theme would get.
*/
type PaletteId = 'teal' | 'blue' | 'violet' | 'green' | 'amber' | 'rose';

interface PaletteTemplate {
  id: PaletteId;
  label: string;
  dark: string;
  light: string;
}

const paletteTemplates: PaletteTemplate[] = [
  { id: 'teal', label: '틸', dark: '#5ecfca', light: '#0e7476' },
  { id: 'blue', label: '블루', dark: '#8fb3ff', light: '#2563eb' },
  { id: 'violet', label: '바이올렛', dark: '#bda4ff', light: '#6d4bc4' },
  { id: 'green', label: '그린', dark: '#7fd1a4', light: '#1f7a55' },
  { id: 'amber', label: '앰버', dark: '#eec27e', light: '#8c5c0d' },
  { id: 'rose', label: '로즈', dark: '#f79ab0', light: '#b42a52' },
];

function ProductApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>('dark');
  const [timezone, setTimezone] = useState('et');
  const [reduceMotion, setReduceMotion] = useState(false);
  // Up/down colour convention: Korean charts paint gains red and losses blue,
  // US charts the opposite hues. Korean is the default for this product.
  const [updown, setUpdown] = useState<Updown>('kr');
  const [palette, setPalette] = useState<PaletteId>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('i2s-palette') : null;
    return paletteTemplates.some((template) => template.id === saved) ? (saved as PaletteId) : 'teal';
  });
  useEffect(() => {
    localStorage.setItem('i2s-palette', palette);
  }, [palette]);
  // html carries the theme too, so body and the overscroll area match the shell
  // instead of showing the dark default behind a light page.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const page = pageFromPathname(location.pathname);
  const strategyMode = strategyModeFromPathname(location.pathname);
  const isStrategyEditor = page === 'strategy' && strategyMode !== 'home';

  const setPage: SetPage = (next) => {
    navigate(pagePaths[next] ?? pagePaths.home);
  };
  const openEditor = (mode: 'basic' | 'pro') => {
    navigate(`/strategies/new/${mode}`);
  };

  const content = <Routes>
    <Route path="/" element={<DashboardView setPage={setPage} />} />
    <Route path="/strategies" element={<StrategyHome openEditor={openEditor} />} />
    <Route path="/strategies/new/basic" element={<BasicEditor goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} onLaunchBot={() => navigate(pagePaths.bots)} />} />
    <Route path="/strategies/new/pro" element={<ProEditor goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} />} />
    <Route path="/bots" element={<BotsView />} />
    <Route path="/backtests" element={<BacktestView />} />
    <Route path="/competition" element={<RoomsView />} />
    <Route path="/competition-v2" element={<RoomsView visualVariant="image" />} />
    <Route path="/notifications" element={<NotificationsView setPage={setPage} />} />
    <Route path="/help" element={<HelpView />} />
    <Route path="/account" element={<AccountView
      theme={theme}
      setTheme={setTheme}
      timezone={timezone}
      setTimezone={setTimezone}
      reduceMotion={reduceMotion}
      setReduceMotion={setReduceMotion}
      updown={updown}
      setUpdown={setUpdown}
    />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;

  return <main
    data-testid="app-shell"
    data-variant="signal"
    data-design="signal-studio"
    data-theme={theme}
    data-timezone={timezone}
    data-updown={updown}
    data-palette={palette}
    className={`app-shell variant-balanced signal-product theme-${theme}${reduceMotion ? ' reduce-motion' : ''}`}
  >
    <div className="app-main">
      <Topbar theme={theme} setTheme={setTheme} page={page} setPage={setPage} updown={updown} setUpdown={setUpdown} />
      {isStrategyEditor
        ? <div className="strategy-editor-surface" data-testid="strategy-editor-surface">
          <div className="page-scroll strategy-editor-scroll">{content}</div>
        </div>
        : <div className="page-scroll">{content}</div>}
    </div>
    <Localized><div className="palette-dock" role="group" aria-label="색상 템플릿 선택">
      <Palette size={13} aria-hidden="true" />
      {paletteTemplates.map((template) => <button
        key={template.id}
        type="button"
        aria-label={`${template.label} 템플릿`}
        aria-pressed={palette === template.id}
        className={palette === template.id ? 'active' : ''}
        style={{ '--swatch': theme === 'light' ? template.light : template.dark } as CSSProperties}
        onClick={() => setPalette(template.id)}
      />)}
    </div></Localized>
  </main>;
}

/*
  `initialVariant` is a legacy entry point kept for the test suite: both former
  variants resolve to the same Signal product shell, so the value is unused.
*/
export function App(_props: { initialVariant?: string } = {}) {
  return <LanguageProvider><BrowserRouter><Routes>
    <Route path="/concepts/*" element={<DesignConceptLab />} />
    <Route path="*" element={<ProductApp />} />
  </Routes></BrowserRouter></LanguageProvider>;
}
