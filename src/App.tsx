import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, CircleHelp, Moon, Palette, Settings, Sun, UserRound, X } from 'lucide-react';
import i2sLogo from './assets/i2s-logo.svg';
import { navItems, pageFromPathname, pagePaths, strategyModeFromPathname } from './lib/navigation';
import type { PageId } from './lib/navigation';
import { LanguageProvider, Localized, useLanguage } from './lib/i18n';
import { BOT_ICON_STORAGE_KEY, loadBotIcons } from './components/BotGlyph';
import type { BotIconMap, BotIconSelection } from './components/BotGlyph';
import { defaultBacktestClient } from './api/backtests';
import { defaultAccountClient } from './api/account';
import type { AccountClient, ThemePreference } from './api/account';
import { defaultAccountOperationsClient } from './api/accountOperations';
import type { AccountOperationsClient } from './api/accountOperations';
import type { OperatorRbacClient } from './api/operatorRbac';
import { defaultNotificationClient, NotificationApiError } from './api/notifications';
import type { NotificationClient, NotificationRecord } from './api/notifications';
import type { CompetitionRoomsClient } from './api/competitionRooms';
import type { OperatorAuthentication } from './components/OperatorAuthenticationView';
import { useSessionAccessToken } from './api/sessionAccessToken';
import { browserSessionStore, useSessionState } from './lib/session';
import './styles/tokens.css';
import './styles/base.css';
import './styles/balanced.css';

const DashboardView = lazy(() => import('./views/DashboardView').then((module) => ({ default: module.DashboardView })));
const LandingView = lazy(() => import('./views/LandingView').then((module) => ({ default: module.LandingView })));
const StrategyHome = lazy(() => import('./views/StrategyViews').then((module) => ({ default: module.StrategyHome })));
const BasicEditor = lazy(() => import('./views/StrategyViews').then((module) => ({ default: module.BasicEditor })));
const ProEditorUnavailableView = lazy(() => import('./views/ProEditorUnavailableView').then((module) => ({ default: module.ProEditorUnavailableView })));
const BotsView = lazy(() => import('./views/BotsView').then((module) => ({ default: module.BotsView })));
const BacktestView = lazy(() => import('./views/OperationsViews').then((module) => ({ default: module.BacktestView })));
const RoomsView = lazy(() => import('./views/OperationsViews').then((module) => ({ default: module.RoomsView })));
const NotificationsView = lazy(() => import('./views/SupportViews').then((module) => ({ default: module.NotificationsView })));
const HelpView = lazy(() => import('./views/SupportViews').then((module) => ({ default: module.HelpView })));
const AccountView = lazy(() => import('./views/SupportViews').then((module) => ({ default: module.AccountView })));
const LoginView = lazy(() => import('./views/AuthViews').then((module) => ({ default: module.LoginView })));
const SignupView = lazy(() => import('./views/AuthViews').then((module) => ({ default: module.SignupView })));
const OperatorCaseWorkspace = lazy(() => import('./components/CaseApiPanels').then((module) => ({ default: module.OperatorCaseWorkspace })));
const OperatorRbacWorkspace = lazy(() => import('./components/OperatorRbacViews').then((module) => ({ default: module.OperatorRbacWorkspace })));
const OperatorCompetitionWorkspace = lazy(() => import('./components/OperatorCompetitionWorkspace').then((module) => ({ default: module.OperatorCompetitionWorkspace })));
const OperatorAuthenticationView = lazy(() => import('./components/OperatorAuthenticationView').then((module) => ({ default: module.OperatorAuthenticationView })));

type SetPage = (page: PageId) => void;

/*
  Whether anyone is signed in, from either place the app keeps a credential:
  the in-memory token the API clients share, or the tab session the backtest
  screens read. Login populates both; either alone counts as signed in and the
  screen that needs the missing one still answers for itself.
*/
function useSignedIn() {
  const token = useSessionAccessToken();
  const tabSession = useSessionState(browserSessionStore);
  return token !== null || tabSession.status === 'authenticated';
}

/*
  Route guard for account-scoped screens. Signed out, the visit goes straight
  to the sign-in screen — no intermediate "sign-in required" page, no loading
  flash from a request that could only 401 — and returns here after login.
  Competition, landing, and help stay open without a session.
*/
function RequireSignIn({ children }: { children: ReactElement }) {
  const signedIn = useSignedIn();
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  return children;
}

type Theme = 'dark' | 'light';
type Updown = 'kr' | 'us';
const THEME_PREFERENCE_STORAGE_KEY = 'i2s-theme-preference';

function storedThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'DARK';
  const stored = localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  return stored === 'LIGHT' || stored === 'SYSTEM' ? stored : 'DARK';
}

function browserTheme(): Theme {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolvedTheme(preference: ThemePreference): Theme {
  if (preference === 'SYSTEM') return browserTheme();
  return preference === 'LIGHT' ? 'light' : 'dark';
}

function RouteLoadingState() {
  return <Localized><div className="route-loading-state" role="status">화면을 불러오는 중입니다.</div></Localized>;
}

interface TopbarProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  page: PageId;
  setPage: SetPage;
  updown: Updown;
  setUpdown: (updown: Updown) => void;
  notificationClient: NotificationClient;
}

type TopbarNotificationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: NotificationRecord[] }
  | { kind: 'error'; error: NotificationApiError };

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

function Topbar({ theme, setTheme, page, setPage, updown, setUpdown, notificationClient }: TopbarProps) {
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useSignedIn();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [notificationState, setNotificationState] = useState<TopbarNotificationState>({ kind: 'idle' });

  /*
    Signed out the top bar stays out of the way while reading: scrolling down
    slides it away, scrolling up brings it back, and once the scrolling motion
    settles it glides back in on its own. Signed in it stays put — the product
    areas live there.
  */
  useEffect(() => {
    if (signedIn) {
      setTopbarHidden(false);
      return undefined;
    }
    let lastY = window.scrollY;
    let settleTimer: number | undefined;
    /*
      The landing's cinematic motion owns the screen for exactly as long as it
      plays. The hero writes its act onto the page root: `data-act-line` "3"
      is the timeline's own "done" state (the last story line has exited), and
      that is the moment the bar starts back down. The features check is the
      reduced-motion fallback, where the acts never advance.
    */
    const landingMotion = (): 'none' | 'playing' | 'done' => {
      const landing = document.querySelector('.landing-page');
      if (!landing) return 'none';
      if (landing.getAttribute('data-act-line') === '3') return 'done';
      const features = document.querySelector('.landing-features');
      if (features && features.getBoundingClientRect().top < window.innerHeight) return 'done';
      return 'playing';
    };
    const onScroll = () => {
      const y = window.scrollY;
      const motion = landingMotion();
      if (motion === 'playing' && y >= 32) setTopbarHidden(true);
      else if (y < 32 || motion === 'done') setTopbarHidden(false);
      else if (y > lastY + 2) setTopbarHidden(true);
      else if (y < lastY - 2) setTopbarHidden(false);
      lastY = y;
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        /* Coming to rest reveals the bar everywhere except mid-motion — the
           story asked for the whole screen until it has finished. */
        if (landingMotion() !== 'playing') setTopbarHidden(false);
      }, 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };
  }, [signedIn]);
  const [notificationReload, setNotificationReload] = useState(0);
  const labels: Partial<Record<PageId, string>> = { home: 'HOME', strategy: 'STRATEGIES', bots: 'BOTS', backtest: 'BACKTEST', rooms: 'COMPETITION' };
  const togglePanel = (panel: string) => setOpenPanel((current) => current === panel ? null : panel);
  const unreadCount = notificationState.kind === 'ready'
    ? notificationState.items.filter((item) => item.readAt === null).length
    : 0;

  useEffect(() => {
    if (openPanel !== 'notifications') return undefined;

    const controller = new AbortController();
    setNotificationState({ kind: 'loading' });
    void notificationClient.list(null, 3, controller.signal).then((page) => {
      if (!controller.signal.aborted) setNotificationState({ kind: 'ready', items: page.items });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      const error = cause instanceof NotificationApiError
        ? cause
        : new NotificationApiError(0, 'NETWORK_ERROR', null);
      setNotificationState({ kind: 'error', error });
    });

    return () => controller.abort();
  }, [notificationClient, notificationReload, openPanel]);

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

  return <Localized><header className={`app-topbar signal-product-nav ${topbarHidden ? 'is-scrolled-away' : ''}`}>
    {/* The logo is the front door: it opens the landing introduction, while
        the HOME menu item remains the operational dashboard. */}
    {/* Signed out the logo is the front door (landing introduction); signed in
        it is the way home, same as the HOME menu item. */}
    <button className="signal-product-brand" aria-label={signedIn ? '홈으로 이동' : 'Idea2Strategy 소개'} onClick={() => setPage(signedIn ? 'home' : 'landing')}>
      <img src={i2sLogo} alt="Idea2Strategy" />
      <strong>IDEA<span>2</span>STRATEGY</strong>
    </button>
    {/* The product areas are all account-scoped, so the tabs only exist for
        signed-in visitors; signed out they would each just open sign-in. */}
    {signedIn && <nav aria-label="Signal 주요 메뉴" data-orientation="horizontal">
      {navItems.map(({ id, label }) => <button
        key={id}
        className={page === id ? 'active' : ''}
        aria-label={label}
        onClick={() => setPage(id)}
      >{labels[id]}</button>)}
    </nav>}
    <div className="signal-nav-tools">
      {signedIn && <div className="topbar-popover-anchor">
        <button className="icon-button has-count" aria-label="알림" onClick={() => togglePanel('notifications')}><Bell size={17} />{unreadCount > 0 && <b>{unreadCount}</b>}</button>
        {openPanel === 'notifications' && <section className="topbar-popover notifications-popover" role="dialog" aria-label="최근 알림">
          <header><div><strong>최근 알림</strong><span>{notificationState.kind === 'loading'
            ? '동기화 중'
            : notificationState.kind === 'error'
              ? notificationState.error.authenticationRequired ? '로그인 필요' : '불러오기 실패'
              : `읽지 않음 ${unreadCount}개`}</span></div><button aria-label="알림 닫기" onClick={() => setOpenPanel(null)}><X size={15} /></button></header>
          <div>{notificationState.kind === 'loading'
            ? <div className="notifications-popover-state" role="status">알림을 불러오는 중입니다.</div>
            : notificationState.kind === 'error'
              ? notificationState.error.authenticationRequired
                /* Only reachable when the session died while this panel was in
                   use: the bell itself renders for signed-in visitors only. */
                ? <div className="notifications-popover-state" role="status">
                  <strong>로그인이 필요합니다.</strong>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => { setOpenPanel(null); navigate('/login', { state: { returnTo: location.pathname } }); }}
                  >로그인</button>
                </div>
                : <div className="notifications-popover-state" role="alert">
                  <strong>알림을 불러오지 못했습니다.</strong>
                  <button type="button" className="button" onClick={() => setNotificationReload((value) => value + 1)}>다시 시도</button>
                </div>
              : notificationState.kind === 'ready' && notificationState.items.length === 0
                ? <div className="notifications-popover-state" role="status">새 알림이 없습니다.</div>
                : notificationState.kind === 'ready' && notificationState.items.map((item) => <button
                  className={item.readAt === null ? 'unread' : ''}
                  key={item.id}
                  aria-label={`${item.typeCode} 알림 열기`}
                  onClick={() => { setOpenPanel(null); setPage('notifications'); }}
                ><i /><span><strong>{item.typeCode}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span></button>)}</div>
          {!(notificationState.kind === 'error' && notificationState.error.authenticationRequired)
            && <footer><button onClick={() => { setOpenPanel(null); setPage('notifications'); }}>알림 전체 보기<ArrowRight size={13} aria-hidden="true" /></button></footer>}
        </section>}
      </div>}
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
      {/* No fabricated identity: the API never returns the account's name or
          email, so the account entry is an icon, not a made-up "KIM". Signed
          out there is no account (and no notifications), so the tools give way
          to the two ways in. */}
      {signedIn
        ? <button className={`icon-button signal-user ${page === 'account' ? 'active' : ''}`} aria-label="내 계정" onClick={() => setPage('account')}><UserRound size={17} /></button>
        : <div className="topbar-auth">
          {/* aria-label keeps this distinct from the sign-in form's submit
              button, which owns the bare name "로그인". */}
          <button type="button" className="button" aria-label="로그인 페이지로 이동" onClick={() => navigate('/login', { state: { returnTo: location.pathname } })}>로그인</button>
          <button type="button" className="button button-primary" onClick={() => navigate('/signup')}>회원가입</button>
        </div>}
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

function ProductApp({ accountClient, operationsClient, notificationClient, competitionRoomsClient, operatorCompetitionClient, operatorRbacClient, operatorCaseAccessVerified, operatorAuthentication, catalogReadPermissionId, assignmentReadPermissionId }: {
  accountClient: AccountClient;
  operationsClient: AccountOperationsClient;
  notificationClient: NotificationClient;
  competitionRoomsClient?: CompetitionRoomsClient;
  operatorCompetitionClient?: CompetitionRoomsClient;
  operatorRbacClient?: OperatorRbacClient;
  operatorCaseAccessVerified: boolean;
  operatorAuthentication?: OperatorAuthentication;
  catalogReadPermissionId?: string;
  assignmentReadPermissionId?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const { setLanguage } = useLanguage();
  const [themePreference, setThemePreference] = useState<ThemePreference>(storedThemePreference);
  const [theme, setTheme] = useState<Theme>(() => resolvedTheme(storedThemePreference()));
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
  useEffect(() => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
    if (themePreference !== 'SYSTEM' || typeof window.matchMedia !== 'function') {
      setTheme(resolvedTheme(themePreference));
      return undefined;
    }
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => setTheme(systemTheme.matches ? 'dark' : 'light');
    applySystemTheme();
    systemTheme.addEventListener('change', applySystemTheme);
    return () => systemTheme.removeEventListener('change', applySystemTheme);
  }, [themePreference]);
  useEffect(() => {
    if (!signedIn) return undefined;
    const controller = new AbortController();
    void accountClient.preferences(controller.signal).then((preferences) => {
      if (controller.signal.aborted) return;
      if (preferences.languageCode === 'ko' || preferences.languageCode === 'en') {
        setLanguage(preferences.languageCode);
      }
      setThemePreference(preferences.themePreference);
    }).catch(() => {
      // Display preferences are progressive enhancement. A temporary account
      // API failure must not prevent the signed-in product from rendering.
    });
    return () => controller.abort();
  }, [accountClient, setLanguage, signedIn]);
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
  const openEditor = (mode: 'basic' | 'pro', blank = false, strategyId?: string) => {
    navigate(`/strategies/new/${mode}`, { state: { blank, strategyId } });
  };
  // A freshly created strategy opens on a blank canvas. Landing on the editor
  // URL directly (or refreshing it) also opens blank: there is no strategy
  // behind it, so seeding a demo strategy would show data the user never made.
  const editorState = location.state as { blank?: boolean; strategyId?: string } | null;
  const editorBlank = editorState ? Boolean(editorState.blank) : true;
  const changeBotIcon = (botName: string, selection: BotIconSelection) => {
    setBotIcons((current) => ({ ...current, [botName]: selection }));
  };
  /* 대회 리더보드에서 내 봇을 누르면 봇 운영 화면의 그 봇을 연다(#54).
     라우터 state로 이름을 넘기고, BotsView가 필터까지 맞춰 선택한다. */
  const openBot = (botName: string) => {
    navigate(pagePaths.bots, { state: { bot: botName } });
  };
  const requestedBot = (location.state as { bot?: string } | null)?.bot;

  const selectTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    setThemePreference(nextTheme === 'light' ? 'LIGHT' : 'DARK');
  };

  const content = <Suspense fallback={<RouteLoadingState />}><Routes>
    <Route path="/" element={<RequireSignIn><DashboardView setPage={setPage} botIcons={botIcons} /></RequireSignIn>} />
    <Route path="/landing" element={<LandingView setPage={setPage} />} />
    <Route path="/strategies" element={<RequireSignIn><StrategyHome openEditor={openEditor} /></RequireSignIn>} />
    <Route path="/strategies/new/basic" element={<RequireSignIn><BasicEditor strategyId={editorState?.strategyId} blank={editorBlank} goBack={() => navigate(pagePaths.strategy)} openEditor={openEditor} onLaunchBot={() => navigate(pagePaths.bots)} /></RequireSignIn>} />
    <Route path="/strategies/new/pro" element={<RequireSignIn><ProEditorUnavailableView goBack={() => navigate(pagePaths.strategy)} /></RequireSignIn>} />
    <Route path="/bots" element={<RequireSignIn><BotsView key={requestedBot ?? 'bots'} botIcons={botIcons} onBotIconChange={changeBotIcon} initialBot={requestedBot} /></RequireSignIn>} />
    <Route path="/backtests" element={<RequireSignIn><BacktestView client={defaultBacktestClient} /></RequireSignIn>} />
    <Route path="/competition" element={<RoomsView client={competitionRoomsClient} openBot={openBot} />} />
    <Route path="/competition-v2" element={<Navigate to="/competition" replace />} />
    <Route path="/notifications" element={<RequireSignIn><NotificationsView setPage={setPage} client={notificationClient} /></RequireSignIn>} />
    <Route path="/login" element={<LoginView client={accountClient} />} />
    <Route path="/signup" element={<SignupView client={accountClient} />} />
    <Route path="/operations/login" element={operatorAuthentication
      ? <OperatorAuthenticationView authentication={operatorAuthentication} />
      : <Navigate to="/" replace />} />
    <Route path="/operations/callback" element={operatorAuthentication
      ? <OperatorAuthenticationView authentication={operatorAuthentication} />
      : <Navigate to="/" replace />} />
    <Route path="/operations/cases" element={operatorCaseAccessVerified
      ? <OperatorCaseWorkspace client={operationsClient} />
      : operatorAuthentication
        ? <Navigate to="/operations/login" state={{ returnTo: location.pathname }} replace />
        : <Navigate to="/" replace />} />
    <Route path="/operations/rbac" element={operatorRbacClient
      ? <OperatorRbacWorkspace
        client={operatorRbacClient}
        mutationsClient={operationsClient}
        catalogReadPermissionId={catalogReadPermissionId}
        assignmentReadPermissionId={assignmentReadPermissionId}
      />
      : operatorAuthentication
        ? <Navigate to="/operations/login" state={{ returnTo: location.pathname }} replace />
        : <Navigate to="/" replace />} />
    <Route path="/operations/competition" element={operatorCompetitionClient
      ? <OperatorCompetitionWorkspace client={operatorCompetitionClient} />
      : operatorAuthentication
        ? <Navigate to="/operations/login" state={{ returnTo: location.pathname }} replace />
        : <Navigate to="/" replace />} />
    <Route path="/help" element={<HelpView />} />
    <Route path="/account" element={<RequireSignIn><AccountView
      theme={theme}
      setTheme={selectTheme}
      setThemePreference={setThemePreference}
      timezone={timezone}
      setTimezone={setTimezone}
      reduceMotion={reduceMotion}
      setReduceMotion={setReduceMotion}
      updown={updown}
      setUpdown={setUpdown}
      accountClient={accountClient}
      operationsClient={operationsClient}
      notificationClient={notificationClient}
    /></RequireSignIn>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;

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
      <Topbar theme={theme} setTheme={selectTheme} page={page} setPage={setPage} updown={updown} setUpdown={setUpdown} notificationClient={notificationClient} />
      {operatorAuthentication?.snapshot.kind === 'authenticated' && <button
        className="operator-logout-button"
        type="button"
        onClick={operatorAuthentication.logout}
      >Operator logout</button>}
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
export function App({
  accountClient = defaultAccountClient,
  operationsClient = defaultAccountOperationsClient,
  notificationClient = defaultNotificationClient,
  competitionRoomsClient,
  operatorCompetitionClient,
  operatorRbacClient,
  operatorCaseAccessVerified = false,
  operatorAuthentication,
  catalogReadPermissionId = import.meta.env.VITE_OPERATOR_RBAC_CATALOG_READ_PERMISSION_ID,
  assignmentReadPermissionId = import.meta.env.VITE_OPERATOR_RBAC_ASSIGNMENT_READ_PERMISSION_ID,
}: {
  initialVariant?: string;
  accountClient?: AccountClient;
  operationsClient?: AccountOperationsClient;
  notificationClient?: NotificationClient;
  competitionRoomsClient?: CompetitionRoomsClient;
  operatorCompetitionClient?: CompetitionRoomsClient;
  operatorRbacClient?: OperatorRbacClient;
  operatorCaseAccessVerified?: boolean;
  operatorAuthentication?: OperatorAuthentication;
  catalogReadPermissionId?: string;
  assignmentReadPermissionId?: string;
} = {}) {
  return <LanguageProvider><BrowserRouter><Routes>
    <Route path="*" element={<ProductApp
      accountClient={accountClient}
      operationsClient={operationsClient}
      notificationClient={notificationClient}
      competitionRoomsClient={competitionRoomsClient}
      operatorCompetitionClient={operatorCompetitionClient}
      operatorRbacClient={operatorRbacClient}
      operatorCaseAccessVerified={operatorCaseAccessVerified}
      operatorAuthentication={operatorAuthentication}
      catalogReadPermissionId={catalogReadPermissionId}
      assignmentReadPermissionId={assignmentReadPermissionId}
    />} />
  </Routes></BrowserRouter></LanguageProvider>;
}
