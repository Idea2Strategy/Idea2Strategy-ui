import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Moon, Search, Sun, X } from 'lucide-react';
import i2sLogo from './assets/i2s-logo.svg';
import { notifications } from './data/mockData.js';
import { navItems, pageFromPathname, pagePaths, strategyModeFromPathname } from './lib/navigation.js';
import { LanguageProvider, Localized, useLanguage } from './lib/i18n.jsx';
import { BasicEditor, ProEditor, StrategyHome } from './views/StrategyViews.jsx';
import { BacktestView, BotsView, RoomsView } from './views/OperationsViews.jsx';
import { AccountView } from './views/SupportViews.jsx';
import { DashboardView } from './views/DashboardView.jsx';
import { DesignConceptLab } from './views/DesignConceptLab.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/balanced.css';
import './styles/concepts.css';

function Topbar({ theme, setTheme, page, setPage }) {
  const { language, setLanguage } = useLanguage();
  const [openPanel, setOpenPanel] = useState(null);
  const labels = { home: 'HOME', strategy: 'STRATEGIES', bots: 'BOTS', backtest: 'BACKTEST', rooms: 'COMPETITION' };
  const togglePanel = (panel) => setOpenPanel((current) => current === panel ? null : panel);

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
      <label className="global-search">
        <Search size={15} />
        <input aria-label="전체 검색" placeholder="SEARCH" />
      </label>
      <div className="topbar-popover-anchor">
        <button className="icon-button has-count" aria-label="알림" onClick={() => togglePanel('notifications')}><Bell size={17} /><b>2</b></button>
        {openPanel === 'notifications' && <section className="topbar-popover notifications-popover" role="dialog" aria-label="최근 알림">
          <header><div><strong>최근 알림</strong><span>읽지 않음 2개</span></div><button aria-label="알림 닫기" onClick={() => setOpenPanel(null)}><X size={15} /></button></header>
          <div>{notifications.slice(0, 3).map((item) => <button className={item.unread ? 'unread' : ''} key={item.title}><i /><span><strong>{item.title}</strong><small>{item.time}</small></span></button>)}</div>
        </section>}
      </div>
      <button className="icon-button" aria-label={theme === 'light' ? '다크 모드' : '라이트 모드'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
      <label className="language-select">
        <span className="sr-only">언어 선택</span>
        <select aria-label="언어 선택" value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="ko">KO</option>
          <option value="en">EN</option>
        </select>
      </label>
      <button className={`signal-user ${page === 'account' ? 'active' : ''}`} aria-label="내 계정" onClick={() => setPage('account')}>KIM <i /></button>
    </div>
  </header></Localized>;
}

function StrategySubnav({ openEditor, mode }) {
  return <Localized><div className="strategy-subnav" data-testid="strategy-editor-subnav"><span>EDITOR</span><button className={mode === 'basic' ? 'active' : ''} onClick={() => openEditor('basic')}>Basic 편집기</button><button className={mode === 'pro' ? 'active' : ''} onClick={() => openEditor('pro')}>Pro 편집기</button></div></Localized>;
}

function ProductApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState('dark');
  const page = pageFromPathname(location.pathname);
  const strategyMode = strategyModeFromPathname(location.pathname);
  const isStrategyEditor = page === 'strategy' && strategyMode !== 'home';

  const setPage = (next) => {
    navigate(pagePaths[next] ?? pagePaths.home);
  };
  const openEditor = (mode) => {
    navigate(`/strategies/new/${mode}`);
  };

  const content = <Routes>
    <Route path="/" element={<DashboardView setPage={setPage} openEditor={openEditor} />} />
    <Route path="/strategies" element={<StrategyHome openEditor={openEditor} />} />
    <Route path="/strategies/new/basic" element={<BasicEditor goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} />} />
    <Route path="/strategies/new/pro" element={<ProEditor goBack={() => navigate(pagePaths.strategy)} />} />
    <Route path="/bots" element={<BotsView />} />
    <Route path="/backtests" element={<BacktestView />} />
    <Route path="/competition" element={<RoomsView />} />
    <Route path="/account" element={<AccountView />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;

  return <main
    data-testid="app-shell"
    data-variant="signal"
    data-design="signal-studio"
    data-theme={theme}
    className={`app-shell variant-balanced signal-product theme-${theme}`}
  >
    <div className="app-main">
      <Topbar theme={theme} setTheme={setTheme} page={page} setPage={setPage} />
      {isStrategyEditor
        ? <div className="strategy-editor-surface" data-testid="strategy-editor-surface">
          {strategyMode === 'pro' && <StrategySubnav openEditor={openEditor} mode={strategyMode} />}
          <div className="page-scroll">{content}</div>
        </div>
        : <div className="page-scroll">{content}</div>}
    </div>
  </main>;
}

export function App() {
  return <LanguageProvider><BrowserRouter><Routes>
    <Route path="/concepts/*" element={<DesignConceptLab />} />
    <Route path="*" element={<ProductApp />} />
  </Routes></BrowserRouter></LanguageProvider>;
}
