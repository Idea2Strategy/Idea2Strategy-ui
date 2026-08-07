import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import type { AccountClient } from './api/account';
import { NotificationApiError } from './api/notifications';
import type { NotificationClient } from './api/notifications';
import { setSessionAccessToken } from './api/sessionAccessToken';
import { SESSION_STORAGE_KEY } from './lib/session';
import { ProEditor } from './views/StrategyViews';

const balancedStyles = readFileSync(resolve(process.cwd(), 'src/styles/balanced.css'), 'utf8');
const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const tokenStyles = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

/* Theme, market colours and language live behind the nav gear, so open it
   first. The trigger keeps its accessible name in both languages. */
const openDisplaySettings = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /화면 설정 열기|Open display settings/ }));

/* Account-scoped routes redirect signed-out visits to /login, so the suite
   signs in by default — both the in-memory token the API clients read and the
   tab session the backtest screens read. Signed-out specs drop them. */
const signIn = () => {
  setSessionAccessToken('app-test-session');
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'app-test-session',
    accountId: '10000000-0000-4000-8000-000000000001',
    expiresAt: null,
  }));
};
const signOut = () => {
  setSessionAccessToken(null);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

describe('Signal product UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    signIn();
  });
  afterEach(() => {
    signOut();
  });

  test('keeps primary navigation and direct entry in sync with the browser URL', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('button', { name: '전략' }));
    expect(window.location.pathname).toBe('/strategies');

    await user.click(screen.getByRole('button', { name: '봇' }));
    expect(window.location.pathname).toBe('/bots');

    unmount();
    window.history.replaceState({}, '', '/backtests');
    render(<App />);
    expect(await screen.findByRole('heading', { name: '봇 백테스트' })).toBeInTheDocument();
  });

  test('does not expose the comparison lab or prototype metadata from the product app', async () => {
    window.history.replaceState({}, '', '/concepts');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByText(/Concept Lab/i)).not.toBeInTheDocument();
    expect(indexHtml).toContain('<title>Idea2Strategy</title>');
    expect(indexHtml).not.toMatch(/UI Lab|comparison prototypes/);
  });

  test('sends a signed-out visit to an account-scoped route straight to the sign-in screen', async () => {
    signOut();
    window.history.replaceState({}, '', '/backtests');
    render(<App />);

    // No intermediate "sign-in required" page and no loading flash: the visit
    // lands on the sign-in screen itself, and returns after login.
    expect(window.location.pathname).toBe('/login');
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
  });

  test('shows sign-in and sign-up instead of notifications and account while signed out', async () => {
    const user = userEvent.setup();
    signOut();
    window.history.replaceState({}, '', '/landing');
    render(<App />);

    expect(screen.queryByRole('button', { name: '알림' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '내 계정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();

    // Signed out the logo stays the front door to the landing introduction.
    expect(screen.getByRole('button', { name: 'Idea2Strategy 소개' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그인 페이지로 이동' }));
    expect(window.location.pathname).toBe('/login');
  });

  test('gives Basic a stable direct URL and blocks direct Pro editor access', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('button', { name: '전략' }));
    await user.click(await screen.findByRole('button', { name: '새 전략' }));
    await user.click(screen.getByRole('button', { name: 'Basic으로 시작' }));
    expect(window.location.pathname).toBe('/strategies/new/basic');
    const editorSurface = screen.getByTestId('strategy-editor-surface');
    expect(editorSurface).toContainElement(await screen.findByRole('region', { name: 'Basic 전략 캔버스' }));
    expect(screen.queryByTestId('strategy-editor-subnav')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basic 편집기' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Pro 편집기' })).toBeDisabled();
    const editorPage = screen.getByTestId('basic-editor-workspace').closest('.editor-shell-page');
    expect(editorPage).not.toBeNull();
    expect(editorSurface.firstElementChild).toHaveClass('strategy-editor-scroll');

    unmount();
    window.history.replaceState({}, '', '/strategies/new/pro');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Pro 편집기는 준비 중입니다' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Pro 편집 작업' })).not.toBeInTheDocument();
  });

  test('marks every Pro strategy entry point unavailable', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/strategies');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '새 전략' }));
    expect(screen.getByRole('button', { name: 'Pro로 시작 (준비 중)' })).toBeDisabled();
    expect(screen.getByText('현재 사용할 수 없습니다')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '새 전략 선택 닫기' }));
    const proRow = screen.getByTestId('strategy-row-Pair Spread Monitor');
    expect(within(proRow).getByRole('button', { name: 'Pair Spread Monitor 열기 (Pro 준비 중)' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '새 전략' }));
    await user.click(screen.getByRole('button', { name: '기존 전략 가져오기' }));
    expect(screen.getByRole('button', { name: 'Pair Spread Monitor 가져오기 (Pro 준비 중)' })).toBeDisabled();
  });

  test('moves to bot operations after launching a personal bot', async () => {
    const user = userEvent.setup();
    // Direct entry now opens blank; the seeded canvas needs the router state an
    // in-app "open existing" navigation would carry (BrowserRouter keeps
    // location.state under history.state.usr).
    window.history.replaceState({ usr: { blank: false } }, '', '/strategies/new/basic');
    render(<App />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    await user.type(within(buyRsi).getByLabelText('RSI 반등 값'), '30');
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '상승' }));
    const sellRsi = screen.getByTestId('sell-rsi-block');
    await user.type(within(sellRsi).getByLabelText('RSI 반등 값'), '70');
    await user.click(within(sellRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '하락' }));
    await user.type(screen.getByRole('spinbutton', { name: '매도 비율' }), '100');

    await user.click(screen.getByRole('button', { name: '개인 봇 출시' }));
    const dialog = screen.getByRole('dialog', { name: '개인 운용 봇 출시' });
    await user.type(within(dialog).getByRole('textbox', { name: '봇 이름' }), 'Momentum Scout');
    await user.type(within(dialog).getByRole('textbox', { name: '봇 설명' }), 'RSI 반등 전략을 운용합니다.');
    await user.click(within(dialog).getByRole('button', { name: '봇 출시하기' }));

    expect(window.location.pathname).toBe('/bots');
    expect(screen.getByRole('heading', { name: '봇 운영 센터' })).toBeInTheDocument();
  });

  test('opens on the home dashboard and returns home when the brand is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: '반갑습니다, 김전략님' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새 전략' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '확인이 필요한 작업' })).not.toBeInTheDocument();
    expect(screen.getByText('봇 3개가 정상 운영 중이에요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '시간가중 운용 수익률' })).toBeInTheDocument();
    expect(screen.queryByText('전체 성과')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '전략' }));
    expect(screen.getByRole('heading', { name: '전략' })).toBeInTheDocument();
    // Signed in, the logo goes home — the landing introduction is the signed-out front door.
    await user.click(screen.getByRole('button', { name: '홈으로 이동' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: '반갑습니다, 김전략님' })).toBeInTheDocument();
  });

  test('shows each bot custom icon on the home dashboard after it is changed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '봇' }));
    await user.click(screen.getByRole('button', { name: 'Atlas 07 아이콘 설정' }));
    await user.click(within(screen.getByRole('group', { name: '아이콘 모양' })).getByRole('button', { name: '분석형 봇 아이콘' }));
    await user.click(within(screen.getByRole('group', { name: '분석형 봇 아이콘 색상 선택' })).getByRole('button', { name: '분석형 봇 아이콘 파란색 적용' }));
    await user.click(screen.getByRole('button', { name: '홈' }));

    expect(screen.getByTestId('dashboard-bot-icon-Atlas 07')).toHaveAttribute('data-icon', 'analytical');
    expect(screen.getByTestId('dashboard-bot-icon-Atlas 07')).toHaveAttribute('data-color', 'blue');
    expect(screen.getByTestId('chart-launch-bot-icon-Atlas 07')).toHaveAttribute('data-icon', 'analytical');
    expect(screen.getByTestId('chart-launch-bot-icon-Atlas 07')).toHaveAttribute('data-color', 'blue');
  });

  test('separates personal and competition performance without mixing their bots', async () => {
    const user = userEvent.setup();
    render(<App />);

    const performance = screen.getByRole('region', { name: '운용 성과' });
    const scope = within(performance).getByRole('group', { name: '성과 유형' });
    const personal = within(scope).getByRole('button', { name: '개인 운용' });
    const competition = within(scope).getByRole('button', { name: '대회 참가' });
    const botFilter = within(performance).getByRole('button', { name: '합산에 포함할 봇 선택' });
    expect(personal).toHaveAttribute('aria-pressed', 'true');
    expect(competition).toHaveAttribute('aria-pressed', 'false');
    expect(within(performance).getByRole('heading', { name: '시간가중 운용 수익률' })).toBeInTheDocument();
    expect(within(performance).queryByText('운용 성과')).not.toBeInTheDocument();
    expect(within(performance).queryByText('시간가중수익률')).not.toBeInTheDocument();
    const returnInfo = within(performance).getByRole('button', { name: '시간가중수익률 설명' });
    const returnInfoTooltip = within(performance).getByRole('tooltip', { name: '시간가중수익률 설명' });
    expect(returnInfo).toHaveTextContent('?');
    expect(returnInfo).toHaveAttribute('aria-describedby', returnInfoTooltip.id);
    expect(returnInfoTooltip).toHaveTextContent('시작 자금 유입은 수익에서 제외');
    expect(performance.querySelector('.dashboard-chart-note')).not.toBeInTheDocument();
    expect(within(performance).getByRole('img', { name: '개인 운용 봇의 시간가중수익률 차트' })).toBeInTheDocument();
    const periodGroup = within(performance).getByRole('group', { name: '성과 기간' });
    expect(scope).toHaveClass('dashboard-chart-control');
    expect(botFilter.closest('.dashboard-chart-control')).not.toBeNull();
    expect(periodGroup).toHaveClass('dashboard-chart-control');
    expect(within(periodGroup).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    const oldestLaunch = within(performance).getByRole('button', { name: 'Atlas 07 운용 시작 정보' });
    expect(oldestLaunch).toHaveClass('is-edge-start');
    expect(oldestLaunch).toHaveStyle({ left: '0%' });
    expect(screen.getByTestId('chart-launch-bot-icon-Atlas 07')).toHaveAttribute('data-icon', 'focus');
    expect(screen.getByTestId('chart-launch-bot-icon-Atlas 07')).toHaveAttribute('data-color', 'gray');
    expect(within(performance).getByRole('tooltip', { name: 'Atlas 07 운용 시작 상세' })).toHaveTextContent('07.08 · 이 날부터 성과에 포함');
    const launchCluster = within(performance).getByRole('button', { name: 'Pulse Grid 외 1개 봇 운용 시작 정보' });
    expect(launchCluster).toHaveClass('is-cluster', 'is-edge-end');
    expect(launchCluster).toHaveAttribute('data-cluster-size', '2');
    expect(within(launchCluster).queryByText('2', { selector: '.dashboard-chart-cluster-count' })).not.toBeInTheDocument();
    expect(within(launchCluster).getByRole('tooltip', { name: '2개 봇 운용 시작 상세' })).toHaveTextContent('Pulse Grid');
    expect(within(launchCluster).getByRole('tooltip', { name: '2개 봇 운용 시작 상세' })).toHaveTextContent('Pair Lab');
    expect(within(launchCluster).getByRole('tooltip', { name: '2개 봇 운용 시작 상세' })).toHaveTextContent('07.03');
    expect(within(launchCluster).getByRole('tooltip', { name: '2개 봇 운용 시작 상세' })).toHaveTextContent('07.05');
    expect(within(performance).queryByRole('button', { name: 'Pair Lab 운용 시작 정보' })).not.toBeInTheDocument();
    expect(within(performance).queryByRole('button', { name: 'Pulse Grid 운용 시작 정보' })).not.toBeInTheDocument();
    expect(within(performance).queryByText('Pair Lab 운용 시작', { selector: '.dashboard-chart-marker' })).not.toBeInTheDocument();
    expect(performance).toHaveTextContent('‘운용 시작’은 실제 시작일이고, ‘이전부터 운용’은 선택 기간보다 먼저 시작된 봇입니다.');
    for (const annotation of performance.querySelectorAll('.dashboard-chart-peak')) {
      expect(annotation).toHaveTextContent('%');
    }

    await user.click(within(periodGroup).getByRole('button', { name: '1개월' }));
    expect(within(performance).getByRole('button', { name: 'Atlas 07 이전부터 운용 정보' })).toBeInTheDocument();
    expect(within(performance).getByRole('tooltip', { name: 'Atlas 07 이전부터 운용 상세' })).toHaveTextContent('선택 기간 이전에 시작');
    expect(within(performance).getByRole('button', { name: 'Pair Lab 운용 시작 정보' })).toBeInTheDocument();

    await user.click(within(performance).getByRole('button', { name: '합산에 포함할 봇 선택' }));
    let botPicker = within(performance).getByRole('group', { name: '합산에 포함할 봇 선택' });
    expect(within(botPicker).queryByText('라벨로 선택')).not.toBeInTheDocument();
    expect(within(botPicker).getByText('봇 개별 선택')).toBeInTheDocument();
    expect(within(botPicker).getByText('Atlas 07')).toBeInTheDocument();
    expect(within(botPicker).getAllByText('Pair Lab').length).toBeGreaterThan(0);
    expect(within(botPicker).queryByText('Room Beta')).not.toBeInTheDocument();

    await user.click(competition);
    expect(competition).toHaveAttribute('aria-pressed', 'true');
    expect(performance).not.toHaveTextContent('대회 참가 봇의 시간가중 성과');
    expect(within(performance).getByText('봇 1/1 포함')).toBeInTheDocument();
    await user.click(within(performance).getByRole('button', { name: '합산에 포함할 봇 선택' }));
    botPicker = within(performance).getByRole('group', { name: '합산에 포함할 봇 선택' });
    expect(within(botPicker).getAllByText('Room Beta').length).toBeGreaterThan(0);
    expect(within(botPicker).queryByText('Atlas 07')).not.toBeInTheDocument();
    expect(within(botPicker).queryByText('Pair Lab')).not.toBeInTheDocument();
    expect(performance).toHaveTextContent('개인 운용과 대회 성과는 합산하지 않습니다.');
  });

  test('removes admin and watchlist entry points and centralizes account settings in My account', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole('button', { name: '관리자' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '관심종목 설정' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '내 계정' }));
    expect(await screen.findByRole('heading', { name: '내 계정' })).toBeInTheDocument();
    // The fabricated identity is gone: no made-up profile name, no social
    // login that never existed, only what the real API panels can prove.
    expect(screen.queryByText('김전략')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '접근 보안' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '계정 설정' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 및 보안' })).toHaveAttribute('href', '#account-security');
    expect(screen.getByRole('link', { name: '서비스 환경' })).toHaveAttribute('href', '#account-environment');
    expect(screen.queryByRole('heading', { name: '화면 설정' })).not.toBeInTheDocument();
    expect(screen.getByText('테마와 화면 표시는 상단 톱니바퀴에서 변경할 수 있습니다.')).toBeInTheDocument();
  });

  test('switches the product between Korean and English and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await openDisplaySettings(user);
    const languageToggle = screen.getByRole('group', { name: '언어 선택' });
    expect(within(languageToggle).getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(languageToggle).getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Welcome back, KIM' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New strategy' })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    await user.click(within(languageToggle).getByRole('button', { name: 'Korean' }));
    expect(screen.getByRole('heading', { name: '반갑습니다, 김전략님' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'ko');
    await user.click(within(languageToggle).getByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Bots' }));
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bots');

    unmount();
    render(<App />);
    await openDisplaySettings(user);
    expect(within(screen.getByRole('group', { name: 'Language' })).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
  });

  test('applies authenticated server display preferences before visiting My account', async () => {
    const preferences = vi.fn().mockResolvedValue({
      languageCode: 'en',
      timezoneName: 'Asia/Seoul',
      themePreference: 'LIGHT',
      updatedAt: '2026-08-07T00:00:00Z',
    });
    const accountClient = { preferences } as unknown as AccountClient;

    render(<App accountClient={accountClient} />);

    expect(await screen.findByRole('heading', { name: 'Welcome back, KIM' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light'));
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(preferences).toHaveBeenCalledTimes(1);
  });

  test('keeps a server SYSTEM theme synchronized with the browser colour scheme', async () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: true as boolean,
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    };
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => media) });
    const accountClient = {
      preferences: vi.fn().mockResolvedValue({
        languageCode: 'ko', timezoneName: 'Asia/Seoul', themePreference: 'SYSTEM', updatedAt: '2026-08-07T00:00:00Z',
      }),
    } as unknown as AccountClient;

    const view = render(<App accountClient={accountClient} />);
    try {
      await waitFor(() => expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function)));
      expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark');

      media.matches = false;
      act(() => listeners.forEach((listener) => listener()));
      expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light');
    } finally {
      view.unmount();
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: previousMatchMedia });
    }
  });

  test('loads product screens through route-level dynamic imports', () => {
    expect(appSource).toContain("lazy(() => import('./views/DashboardView')");
    expect(appSource).toContain("lazy(() => import('./views/StrategyViews')");
    expect(appSource).toContain("lazy(() => import('./views/BotsView')");
    expect(appSource).toContain("lazy(() => import('./views/OperationsViews')");
    expect(appSource).not.toMatch(/import \{[^}]*DashboardView[^}]*\} from '\.\/views\/DashboardView'/);
    expect(appSource).not.toMatch(/import \{[^}]*BotsView[^}]*\} from '\.\/views\/BotsView'/);
  });

  test('closes an open top-bar panel on the next press outside it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openDisplaySettings(user);
    expect(screen.getByRole('dialog', { name: '화면 설정' })).toBeInTheDocument();

    // Pressing a control inside must not dismiss the panel that holds it.
    await user.click(screen.getByRole('button', { name: '라이트 모드' }));
    expect(screen.getByRole('dialog', { name: '화면 설정' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light');

    // Anywhere outside closes it, without needing the ✕.
    await user.click(screen.getByRole('button', { name: '홈으로 이동' }));
    expect(screen.queryByRole('dialog', { name: '화면 설정' })).not.toBeInTheDocument();
  });

  test('switches directly between top-bar panels and dismisses the notifications panel outside', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '알림' }));
    expect(screen.getByRole('dialog', { name: '최근 알림' })).toBeInTheDocument();

    /* The other trigger lives in its own anchor, so the press is not treated as
       "outside": the panels swap instead of the first one just closing. */
    await openDisplaySettings(user);
    expect(screen.queryByRole('dialog', { name: '최근 알림' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '화면 설정' })).toBeInTheDocument();

    // One handler serves both panels, so notifications dismiss the same way.
    await user.click(screen.getByRole('button', { name: '알림' }));
    expect(screen.getByRole('dialog', { name: '최근 알림' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '홈으로 이동' }));
    expect(screen.queryByRole('dialog', { name: '최근 알림' })).not.toBeInTheDocument();
  });

  test('loads the top-bar notification summary from the authenticated API without sample fallback', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue({
      items: [{
        id: 'server-notification-1',
        typeCode: 'SECURITY_EVENT',
        mandatory: true,
        templateVersion: 'v1',
        locale: 'ko-KR',
        templateArguments: { device: 'new-browser' },
        createdAt: '2026-08-04T10:00:00Z',
        readAt: null,
      }],
      nextCreatedAt: null,
      nextId: null,
    });
    const notificationClient: NotificationClient = {
      list,
      markRead: vi.fn(),
      preferences: vi.fn(),
      replacePreference: vi.fn(),
    };
    render(<App notificationClient={notificationClient} />);

    await user.click(screen.getByRole('button', { name: '알림' }));
    const dialog = screen.getByRole('dialog', { name: '최근 알림' });
    expect(await within(dialog).findByText('SECURITY_EVENT')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Atlas 07/)).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(null, 3, expect.any(AbortSignal));
  });

  test('shows the top-bar authentication boundary instead of stale notifications', async () => {
    const user = userEvent.setup();
    const notificationClient: NotificationClient = {
      list: vi.fn().mockRejectedValue(new NotificationApiError(401, 'AUTHENTICATION_REQUIRED', 'corr-topbar')),
      markRead: vi.fn(),
      preferences: vi.fn(),
      replacePreference: vi.fn(),
    };
    render(<App notificationClient={notificationClient} />);

    await user.click(screen.getByRole('button', { name: '알림' }));
    const dialog = screen.getByRole('dialog', { name: '최근 알림' });
    // Signed-out renders as the sign-in state — no raw error code, and the only
    // offered action is the one that resolves it.
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('로그인이 필요합니다.'));
    expect(within(dialog).queryByText(/AUTHENTICATION_REQUIRED/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Atlas 07/)).not.toBeInTheDocument();
  });

  test('the top navigation reads and behaves as a row of buttons', () => {
    /* #74. jsdom applies no stylesheet, so these are asserted against the CSS
       source — the same way the competition heading rhythm is checked. */
    const navButtonRule = balancedStyles.match(
      /\.signal-product-nav > nav button \{([^}]*)\}/,
    )?.[1] ?? '';

    /* Was 9px, the micro-label floor: too small for the five primary
       destinations. 11px is the caption tier and still clears the documented
       86px target for COMPETITION. */
    expect(navButtonRule).toMatch(/font:\s*700\s*11px/);
    /* And exactly one rule may own that type. A later `.signal-product-nav >
       nav button { font: ... }` re-declaration is what pinned the labels at
       9px while the rule above already said otherwise. */
    const fontDeclaringRules = balancedStyles.match(
      /\.signal-product-nav > nav button \{[^}]*\bfont:[^}]*\}/g,
    ) ?? [];
    expect(fontDeclaringRules).toHaveLength(1);
    /* Hover has to say "button": a cursor and a visible surface, not just a
       faint colour shift on flat text. */
    expect(navButtonRule).toContain('cursor:pointer');
    expect(balancedStyles).toMatch(
      /\.signal-product-nav > nav button:hover \{[^}]*background:\s*var\(--surface-2\)/,
    );

    const userRule = balancedStyles.match(
      /\.signal-product-nav \.signal-user \{([^}]*)\}/,
    )?.[1] ?? '';
    expect(userRule).toContain('cursor:pointer');
  });

  test('the narrow-width nav row scrolls sideways only, never vertically', () => {
    /* #74. The reported scrollbar was inside the nav row, not on the document:
       CSS promotes the other axis to `auto` when one axis scrolls, so the row
       gained a vertical scrollbar as soon as the active item's underline bled
       past its box. Both halves of the fix are pinned here. */
    const narrowNavRule = balancedStyles.match(
      /\.signal-product-nav > nav \{[^}]*overflow-x:\s*auto[^}]*\}/,
    )?.[0] ?? '';

    expect(narrowNavRule).toContain('overflow-x:auto');
    expect(narrowNavRule).toMatch(/overflow-y:\s*hidden/);

    /* And the underline must sit inside the box, so `overflow-y: hidden` has
       nothing to clip. A negative bottom is what caused the overflow. */
    const underlineRule = balancedStyles.match(
      /\.signal-product-nav > nav button::after \{([^}]*)\}/,
    )?.[1] ?? '';
    expect(underlineRule).toMatch(/bottom:\s*0/);
    expect(underlineRule).not.toMatch(/bottom:\s*-/);
  });

  test('reserves the scrollbar gutter without forcing a scrollbar on pages that fit', () => {
    /* #74. The gutter is what keeps navigation from shifting when page height
       changes; `overflow-y: scroll` additionally painted a track on pages with
       nothing to scroll. Keep the first, never reintroduce the second. */
    const htmlRule = baseStyles.match(/(?:^|\n)html \{([^}]*)\}/)?.[1] ?? '';

    expect(htmlRule).toContain('scrollbar-gutter: stable');
    expect(htmlRule).not.toMatch(/overflow-y:\s*scroll/);
  });

  test('does not show a global search box in the top navigation', () => {
    render(<App />);

    expect(screen.queryByRole('searchbox', { name: '전체 검색' })).not.toBeInTheDocument();
    expect(document.querySelector('.signal-product-nav .global-search-anchor')).not.toBeInTheDocument();
  });

  test('uses compact segmented toggles for the market colour convention and language', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openDisplaySettings(user);
    const colourToggle = screen.getByRole('group', { name: '상승·하락 색상 선택' });
    const koreanColours = within(colourToggle).getByRole('button', { name: '한국식 · 상승 빨강, 하락 파랑' });
    const usColours = within(colourToggle).getByRole('button', { name: '미국식 · 상승 초록, 하락 빨강' });

    expect(koreanColours).toHaveAttribute('aria-pressed', 'true');
    expect(usColours).toHaveAttribute('aria-pressed', 'false');
    // Same pill as theme and language: no wrapper control, no icon divider.
    expect(document.querySelector('.nav-market-control')).not.toBeInTheDocument();
    expect(document.querySelector('.nav-market-control-icon')).not.toBeInTheDocument();
    expect(colourToggle).toHaveClass('nav-segmented-toggle');
    const koreanFlag = koreanColours.querySelector('.nav-market-flag.flag-kr');
    expect(koreanFlag).toBeInTheDocument();
    expect(koreanFlag).toHaveAttribute('viewBox', '0 0 640 480');
    expect(koreanFlag?.querySelectorAll('[data-trigram]')).toHaveLength(4);
    expect(usColours.querySelector('.nav-market-flag.flag-us')).toBeInTheDocument();
    expect(within(colourToggle).getAllByRole('button')).toHaveLength(2);
    expect(colourToggle.querySelector('.nav-market-icon')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '상승·하락 색상 선택' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '언어 선택' })).not.toBeInTheDocument();

    expect(balancedStyles).not.toMatch(
      /\.signal-product-nav \.nav-market-toggle > button:hover \.nav-market-flag\s*\{[^}]*transform:/s,
    );
    expect(balancedStyles).not.toMatch(
      /\.signal-product-nav \.nav-market-toggle > button\[aria-pressed="true"\] \.nav-market-flag\s*\{[^}]*filter:/s,
    );
    expect(balancedStyles).toMatch(
      /\.signal-product-nav \.nav-segmented-toggle::before\s*\{[^}]*display:\s*none/s,
    );
    expect(balancedStyles).toMatch(
      /\.signal-product-nav \.nav-segmented-toggle > button\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*var\(--line-strong\);[^}]*background:\s*var\(--surface\)/s,
    );

    await user.click(usColours);
    expect(usColours).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-updown', 'us');
  });

  test('uses one heading composition and one active navigation rule on every primary page', async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const [navigation, heading] of [
      ['홈', '반갑습니다, 김전략님'],
      ['전략', '전략'],
      ['봇', '봇 운영 센터'],
      ['모의투자', '모의투자'],
    ]) {
      await user.click(screen.getByRole('button', { name: navigation }));
      expect((await screen.findByRole('heading', { name: heading })).closest('.page-heading')).not.toBeNull();
      const activeItems = document.querySelectorAll('.signal-product-nav > nav button.active');
      expect(activeItems).toHaveLength(1);
      expect(activeItems[0]).toHaveAccessibleName(navigation);
    }

    // 백테스트 has no reachable engine in this suite, so its route settles on
    // the shared full-page failure state; the nav item still activates alone.
    await user.click(screen.getByRole('button', { name: '백테스트' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('백테스트 결과를 불러오지 못했습니다.'));
    const activeItems = document.querySelectorAll('.signal-product-nav > nav button.active');
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]).toHaveAccessibleName('백테스트');
  });

  test.each(['balanced', 'terminal'])('uses the official I2S logo in the %s navigation', (variant) => {
    render(<App initialVariant={variant} />);
    const logo = screen.getByRole('img', { name: 'Idea2Strategy' });
    expect(logo).toHaveAttribute('src', expect.stringContaining('i2s-logo.svg'));
  });

  test.each(['balanced', 'terminal'])('resolves the legacy %s entry to the shared Signal product UI', (variant) => {
    render(<App initialVariant={variant} />);
    for (const name of ['홈', '전략', '봇', '백테스트', '모의투자']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '알림' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-variant', 'signal');
    expect(screen.queryByText('TERMINAL / PULSE')).not.toBeInTheDocument();
    expect(screen.queryByText('BALANCED / SIGNAL')).not.toBeInTheDocument();
  });

  test('uses Signal Studio as the balanced visual baseline', () => {
    render(<App initialVariant="balanced" />);

    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-design', 'signal-studio');
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark');
  });

  test('keeps one fixed teal accent per light and dark theme without a palette picker', () => {
    render(<App initialVariant="balanced" />);

    expect(screen.getByTestId('app-shell')).not.toHaveAttribute('data-palette');
    expect(screen.queryByRole('group', { name: '색상 템플릿 선택' })).not.toBeInTheDocument();
    expect(appSource).not.toContain('i2s-palette');
    expect(balancedStyles).not.toContain('.palette-dock');
    expect(tokenStyles).toMatch(/:root,[\s\S]*?\.theme-dark\s*\{[\s\S]*?--accent:\s*#5ecfca;/);
    expect(tokenStyles).toMatch(/\.theme-light\s*\{[\s\S]*?--accent:\s*#0e7476;/);
    expect(tokenStyles).not.toContain('[data-palette=');
  });

  test('switches theme without losing the active page', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '봇' }));
    await openDisplaySettings(user);
    await user.click(screen.getByRole('button', { name: '라이트 모드' }));
    expect(screen.getByRole('heading', { name: '봇 운영 센터' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light');
    expect(screen.queryByRole('button', { name: '터미널형 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '균형형 보기' })).not.toBeInTheDocument();
  });

  test('keeps natural-language rule notes attached to the selected Basic strategy card', () => {
    // The create flow and direct entry both open a blank canvas now, so the
    // seeded editor needs the router state an in-app navigation would carry.
    window.history.replaceState({ usr: { blank: false } }, '', '/strategies/new/basic');
    render(<App initialVariant="balanced" />);
    expect(screen.getAllByRole('note')).toHaveLength(2);
    expect(screen.getByTestId('basic-narrative-budget')).toHaveTextContent('전략 예산');
    fireEvent.keyDown(screen.getByLabelText('매도 전략 카드 이동 영역'), { key: 'Enter' });
    expect(screen.getAllByRole('note')).toHaveLength(2);
    expect(screen.getByTestId('basic-narrative-budget')).toHaveTextContent('매도 비율');
  });

  test('opens a typed compatible-node picker where a Pro connection is released', () => {
    // The production route is locked, while the editor component keeps its
    // own regression suite so work can continue behind the release gate.
    render(<ProEditor goBack={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId('true-output'), { clientX: 438, clientY: 276, pointerId: 4, button: 0 });
    fireEvent.pointerUp(screen.getByTestId('true-output'), { clientX: 438, clientY: 276, pointerId: 4 });
    const picker = screen.getByRole('dialog', { name: '호환 노드 선택' });
    expect(picker).toHaveStyle({ left: '438px', top: '276px' });
    expect(screen.getByText('실행 흐름 출력')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: /주문 요청/ })).toBeEnabled();
  });

  test.each(['balanced', 'terminal'])('uses one Signal horizontal menu for the legacy %s entry', (variant) => {
    render(<App initialVariant={variant} />);
    const signalMenu = screen.getByRole('navigation', { name: 'Signal 주요 메뉴' });
    expect(signalMenu).toHaveAttribute('data-orientation', 'horizontal');
    expect(screen.queryByTestId('primary-sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Idea2Strategy' }).parentElement).toHaveTextContent('IDEA2STRATEGY');
    expect(screen.queryByRole('button', { name: '메뉴 접기' })).not.toBeInTheDocument();
    expect(screen.queryByText('SIMULATION OS')).not.toBeInTheDocument();
  });

  test('searches and filters balanced strategies', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '전략' }));

    await user.type(screen.getByRole('searchbox', { name: '전략 검색' }), 'Pair');
    expect(screen.getByText('Pair Spread Monitor')).toBeInTheDocument();
    expect(screen.queryByText('Opening Range Flow')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: '전략 검색' }));
    await user.click(screen.getByRole('button', { name: 'Pro 전략만 보기' }));
    expect(screen.getByText('Pair Spread Monitor')).toBeInTheDocument();
    expect(screen.getByText('Volume Regime Draft')).toBeInTheDocument();
    expect(screen.queryByText('Opening Range Flow')).not.toBeInTheDocument();
  });

  test('uses only launchable and incomplete strategy states', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '전략' }));

    const stateLabels = Array.from(document.querySelectorAll('[data-testid^="strategy-row-"] .status'))
      .map((element) => element.textContent);
    expect(stateLabels).toEqual(['출시 가능', '미완성', '미완성']);
    expect(screen.getByTestId('strategy-counts')).toHaveTextContent('출시 가능 1');
    expect(screen.getByTestId('strategy-counts')).toHaveTextContent('미완성 2');
    expect(screen.queryByText('검증 완료')).not.toBeInTheDocument();
    expect(screen.queryByText('임시 저장')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '준비 완료' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '확인 필요' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '출시 가능' }));
    expect(screen.getByText('Opening Range Flow')).toBeInTheDocument();
    expect(screen.queryByText('Pair Spread Monitor')).not.toBeInTheDocument();
    expect(screen.queryByText('Volume Regime Draft')).not.toBeInTheDocument();
  });

  test('removes blocks and copy actions from the strategy home and imports only during creation', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '전략' }));

    expect(screen.queryByRole('searchbox', { name: '블록 검색' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opening Range Flow 복사' })).toBeInTheDocument();
    expect(screen.queryByText('7 blocks')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '새 전략' }));
    expect(screen.getByRole('dialog', { name: '새 전략 선택' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '기존 전략 가져오기' }));
    expect(screen.getByRole('button', { name: 'Opening Range Flow 가져오기' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opening Range Flow 가져오기' }));
    expect(screen.getByRole('region', { name: 'Basic 전략 캔버스' })).toBeInTheDocument();
  });

  test('uses compact strategy counts without a secondary block panel', () => {
    render(<App initialVariant="balanced" />);
    fireEvent.click(screen.getByRole('button', { name: '전략' }));

    expect(screen.queryByLabelText('전략 요약')).not.toBeInTheDocument();
    expect(screen.getByTestId('strategy-counts')).toHaveTextContent('전체 3');
    expect(screen.queryByRole('heading', { name: '블록' })).not.toBeInTheDocument();
  });

  test('lets the strategy list shrink to the rendered rows', () => {
    const strategyRowsRule = balancedStyles.match(/\.strategy-rows\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(strategyRowsRule).not.toMatch(/(?:min-)?height\s*:/);
  });

  test('gives strategy names and dates the flexible column instead of a removed drag-handle track', () => {
    expect(balancedStyles).toMatch(/\.strategy-row\s*\{[^}]*grid-template-columns:\s*38px minmax\(180px,\s*1fr\) 64px 90px auto;/s);
    expect(balancedStyles).toMatch(/\.variant-balanced\[data-design="signal-studio"\] \.strategy-row\s*\{[^}]*grid-template-columns:\s*30px minmax\(180px,\s*1fr\) 72px 96px auto;/s);
    expect(balancedStyles).not.toMatch(/grid-template-columns:\s*(?:16px 38px|13px 30px)/);
  });

  test('keeps market status out of navigation and uses topbar notifications', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);

    expect(screen.queryByText('MARKET')).not.toBeInTheDocument();
    expect(screen.queryByTestId('primary-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '관심종목 설정' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '알림' }));
    expect(screen.getByRole('dialog', { name: '최근 알림' })).toBeInTheDocument();
  });

  test('uses unfinished terminology instead of input-needed terminology', () => {
    render(<App initialVariant="balanced" />);
    fireEvent.click(screen.getByRole('button', { name: '전략' }));
    expect(screen.getAllByText('미완성').length).toBeGreaterThan(0);
    expect(screen.queryByText('입력 필요')).not.toBeInTheDocument();
  });

  test('keeps official pins above the searchable Competition list', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '모의투자' }));

    expect(screen.getByRole('heading', { name: '모의투자' })).toBeInTheDocument();
    /* #54: 한 게시판. 검색은 일반 대회만 좁히고 공식 핀은 항상 남는다. */
    const search = screen.getByRole('searchbox', { name: '대회 검색' });
    await user.type(search, 'ETF Disc');
    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getByRole('listitem', { name: 'ETF Discipline 열기' })).toBeInTheDocument();
    expect(within(results).getByRole('listitem', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'ETF Discipline 순위' })).not.toBeInTheDocument();
    expect(screen.queryByText('Momentum Lab')).not.toBeInTheDocument();

    await user.clear(search);
    const rail = screen.getByRole('complementary', { name: '일반 대회 필터' });
    await user.click(within(rail).getByRole('radio', { name: '진행 중' }));
    await user.click(screen.getByRole('listitem', { name: 'Momentum Lab 열기' }));
    // 상세에서 Room Beta는 순위표 강조 행 한 곳에만 나온다(내 봇 패널 중복 제거).
    expect(screen.getAllByText('Room Beta')).toHaveLength(1);
  });
});
