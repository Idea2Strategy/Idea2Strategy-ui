import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, CircleHelp, Moon, Palette, Settings, Sun, X } from 'lucide-react';
import i2sLogo from './assets/i2s-logo.svg';
import { notifications } from './data/mockData';
import { navItems, pageFromPathname, pagePaths, strategyModeFromPathname } from './lib/navigation';
import type { PageId } from './lib/navigation';
import { LanguageProvider, Localized, useLanguage } from './lib/i18n';
import { BasicEditor, ProEditor, StrategyHome } from './views/StrategyViews';
import { LandingView } from './views/LandingView';
import { BacktestView, RoomsView } from './views/OperationsViews';
import { BotsView } from './views/BotsView';
import { AccountView, HelpView, NotificationsView } from './views/SupportViews';
import { DashboardView } from './views/DashboardView';
import { DesignConceptLab } from './views/DesignConceptLab';
import { BOT_ICON_STORAGE_KEY, loadBotIcons } from './components/BotGlyph';
import type { BotIconMap, BotIconSelection } from './components/BotGlyph';
import './styles/tokens.css';
import './styles/base.css';
import './styles/balanced.css';
import './styles/pro-editor.css';
import './styles/concepts.css';

type SetPage = (page: PageId) => void;

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

// Flag geometry adapted from lipis/flag-icons (MIT),
// Copyright (c) 2013 Panayiotis Lipiridis.
function MarketFlag({ country }: { country: Updown }) {
  if (country === 'us') return <svg className="nav-market-flag flag-us" viewBox="0 0 640 480" aria-hidden="true">
    <defs>
      <marker id="nav-us-star" markerHeight="30" markerWidth="30">
        <path fill="#fff" d="m14 0 9 27L0 10h28L5 27z" />
      </marker>
    </defs>
    <path fill="#bd3d44" d="M0 0h640v480H0" />
    <path stroke="#fff" strokeWidth="37" d="M0 55.3h640M0 129h640M0 203h640M0 277h640M0 351h640M0 425h640" />
    <path fill="#192f5d" d="M0 0h364.8v258.5H0" />
    <path fill="none" markerMid="url(#nav-us-star)" d="m0 0 16 11h61 61 61 61 60L47 37h61 61 60 61L16 63h61 61 61 61 60L47 89h61 61 60 61L16 115h61 61 61 61 60L47 141h61 61 60 61L16 166h61 61 61 61 60L47 192h61 61 60 61L16 218h61 61 61 61 60z" />
  </svg>;

  return <svg className="nav-market-flag flag-kr" viewBox="0 0 640 480" aria-hidden="true">
    <path fill="#fff" d="M0 0h640v480H0z" />
    <g fillRule="evenodd" transform="translate(89.8 .4)scale(.9375)">
      <g transform="rotate(-56.3 361.6 -101.3)scale(10.66667)">
        <g data-trigram="geon">
          <path fill="#000001" d="M-6-26H6v2H-6Zm0 3H6v2H-6Zm0 3H6v2H-6Z" />
        </g>
        <g data-trigram="gon">
          <path fill="#000001" d="M-6 18H6v2H-6Zm0 3H6v2H-6Zm0 3H6v2H-6Z" />
          <path stroke="#fff" d="M0 17v10" />
        </g>
        <path fill="#cd2e3a" d="M0-12a12 12 0 0 1 0 24Z" />
        <path fill="#0047a0" d="M0-12a12 12 0 0 0 0 24A6 6 0 0 0 0 0Z" />
        <circle cy="-6" r="6" fill="#cd2e3a" />
      </g>
      <g transform="rotate(-123.7 191.2 62.2)scale(10.66667)">
        <g data-trigram="gam">
          <path fill="#000001" d="M-6-26H6v2H-6Zm0 3H6v2H-6Zm0 3H6v2H-6Z" />
          <path stroke="#fff" d="M0-23.5v3" />
        </g>
        <g data-trigram="ri">
          <path fill="#000001" d="M-6 18H6v2H-6Zm0 3H6v2H-6Zm0 3H6v2H-6Z" />
          <path stroke="#fff" d="M0 17v3.5m0 3v3" />
        </g>
      </g>
    </g>
  </svg>;
}

function Topbar({ theme, setTheme, page, setPage, updown, setUpdown }: TopbarProps) {
  const { language, setLanguage } = useLanguage();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const labels: Partial<Record<PageId, string>> = { home: 'HOME', strategy: 'STRATEGIES', bots: 'BOTS', backtest: 'BACKTEST', rooms: 'COMPETITION' };
  const togglePanel = (panel: string) => setOpenPanel((current) => current === panel ? null : panel);
  const unreadCount = notifications.filter((item) => item.unread).length;

  /*
    A press outside the open panel closes it. `.topbar-popover-anchor` wraps
    both the trigger and its panel, so pressing inside either keeps the panel
    open, and pressing the other tool's trigger still switches panels through
    togglePanel rather than being swallowed here.

    pointerdown, not click: the panel should be gone before the press it was
    dismissed by finishes, and mouse, touch and pen all report it.
  */
  useEffect(() => {
    if (!openPanel) return undefined;

    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.topbar-popover-anchor')) setOpenPanel(null);
    };

    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [openPanel]);

  return <Localized><header className="app-topbar signal-product-nav">
    {/* The logo is the front door: it opens the landing introduction, while
        the HOME menu item remains the operational dashboard. */}
    <button className="signal-product-brand" aria-label="Idea2Strategy 소개" onClick={() => setPage('landing')}>
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
      {/* Theme, market colour convention and language are all display
          preferences set once and rarely revisited, so they sit behind one gear
          instead of three toggles competing with the five product areas. */}
      <div className="topbar-popover-anchor">
        <button
          className={`icon-button ${openPanel === 'settings' ? 'active' : ''}`}
          aria-label="화면 설정 열기"
          aria-expanded={openPanel === 'settings'}
          onClick={() => togglePanel('settings')}
        ><Settings size={17} /></button>
        {openPanel === 'settings' && <section className="topbar-popover settings-popover" role="dialog" aria-label="화면 설정">
          <header><div><strong>화면 설정</strong><span>테마 · 상승·하락 색상 · 언어</span></div><button aria-label="화면 설정 닫기" onClick={() => setOpenPanel(null)}><X size={15} /></button></header>
          <div className="display-settings-rows">
            {/* Two explicit choices rather than one flip: in a panel the current
                theme has to be readable, not inferred from the icon. */}
            <div className="display-settings-row">
              <span className="display-settings-label">테마</span>
              <div className="nav-segmented-toggle nav-theme-toggle" role="group" aria-label="테마 선택" data-value={theme}>
                <button type="button" aria-label="라이트 모드" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={14} aria-hidden="true" /></button>
                <button type="button" aria-label="다크 모드" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={14} aria-hidden="true" /></button>
              </div>
            </div>

            <div className="display-settings-row">
              {/* The row label names the setting, so the palette icon and its
                  wrapper pill are gone: this is the same segmented control as
                  theme and language, only with flags inside. */}
              <span className="display-settings-label">상승·하락 색상</span>
              <div className="nav-segmented-toggle nav-market-toggle" role="group" aria-label="상승·하락 색상 선택" data-value={updown}>
                <button
                  type="button"
                  aria-label="미국식 · 상승 초록, 하락 빨강"
                  aria-pressed={updown === 'us'}
                  title="미국식 · 상승 초록, 하락 빨강"
                  onClick={() => setUpdown('us')}
                ><MarketFlag country="us" /></button>
                <button
                  type="button"
                  aria-label="한국식 · 상승 빨강, 하락 파랑"
                  aria-pressed={updown === 'kr'}
                  title="한국식 · 상승 빨강, 하락 파랑"
                  onClick={() => setUpdown('kr')}
                ><MarketFlag country="kr" /></button>
              </div>
            </div>

            <div className="display-settings-row">
              <span className="display-settings-label">언어</span>
              <div className="nav-segmented-toggle nav-language-toggle" role="group" aria-label="언어 선택" data-value={language}>
                <button type="button" aria-label="한국어" aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>KO</button>
                <button type="button" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
          </div>
        </section>}
      </div>
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
  const [botIcons, setBotIcons] = useState<BotIconMap>(loadBotIcons);
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
  useEffect(() => {
    localStorage.setItem(BOT_ICON_STORAGE_KEY, JSON.stringify(botIcons));
  }, [botIcons]);
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
  const changeBotIcon = (botName: string, selection: BotIconSelection) => {
    setBotIcons((current) => ({ ...current, [botName]: selection }));
  };
  /* 대회 리더보드에서 내 봇을 누르면 봇 운영 화면의 그 봇을 연다(#54).
     라우터 state로 이름을 넘기고, BotsView가 필터까지 맞춰 선택한다. */
  const openBot = (botName: string) => {
    navigate(pagePaths.bots, { state: { bot: botName } });
  };
  const requestedBot = (location.state as { bot?: string } | null)?.bot;

  const content = <Routes>
    <Route path="/" element={<DashboardView setPage={setPage} botIcons={botIcons} />} />
    <Route path="/landing" element={<LandingView setPage={setPage} />} />
    <Route path="/strategies" element={<StrategyHome openEditor={openEditor} />} />
    <Route path="/strategies/new/basic" element={<BasicEditor goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} onLaunchBot={() => navigate(pagePaths.bots)} />} />
    <Route path="/strategies/new/pro" element={<ProEditor goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} onLaunchBot={() => navigate(pagePaths.bots)} />} />
    <Route path="/bots" element={<BotsView key={requestedBot ?? 'bots'} botIcons={botIcons} onBotIconChange={changeBotIcon} initialBot={requestedBot} />} />
    <Route path="/backtests" element={<BacktestView />} />
    <Route path="/competition" element={<RoomsView openBot={openBot} />} />
    <Route path="/competition-v2" element={<RoomsView visualVariant="image" openBot={openBot} />} />
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
        /* The landing hero pins with position:sticky against the window, and
           the default overflow:hidden would make it a scroll container that
           never scrolls — the sticky stage would simply not stick. */
        : <div className={`page-scroll${page === 'landing' ? ' landing-scroll' : ''}`}>{content}</div>}
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
