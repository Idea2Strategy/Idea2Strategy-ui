import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { App } from './App';
import type { AccountClient } from './api/account';
import type { NotificationClient } from './api/notifications';
import { setSessionAccessToken } from './api/sessionAccessToken';
import { SESSION_STORAGE_KEY } from './lib/session';
import { LanguageProvider } from './lib/i18n';
import { BacktestView } from './views/OperationsViews';

const englishPreferencesClient = {
  sessions: async () => [],
  reactivationPolicies: async () => [],
  preferences: async () => ({
    languageCode: 'en' as const,
    timezoneName: 'Asia/Seoul',
    themePreference: 'DARK' as const,
    updatedAt: '2026-08-07T00:00:00Z',
  }),
} as unknown as AccountClient;

const emptyNotificationClient = {
  list: async () => ({ items: [], nextCreatedAt: null, nextId: null }),
  markRead: async () => undefined,
  preferences: async () => [],
  replacePreference: async () => ({
    notificationTypeCode: 'TEST',
    inAppEnabled: true,
    emailEnabled: false,
    updatedAt: '2026-08-07T00:00:00Z',
  }),
} as unknown as NotificationClient;

const renderEnglishApp = () => render(
  <App accountClient={englishPreferencesClient} notificationClient={emptyNotificationClient} />,
);

/*
  영어 로케일 화면 점검.

  Localized는 화면으로 넘어가는 문자열 prop을 전부 번역한다. 그래서 한글 이름을
  식별자로도 쓰는 코드가 있으면 영어에서만 조회가 빗나가 화면이 통째로 죽는다.
  #47의 백테스트 검은 화면이 정확히 그 경우였다: 차트 기간 '1일'이 'Daily'로
  번역돼 캔들 개수 조회가 undefined가 되고, 캔들 0개로 렌더하다 예외가 났다.

  라우트를 한 번씩 열어보는 이 테스트가 같은 실수를 다시 들여놓지 못하게 막는다.
*/
const ROUTES: Array<{ path: string; marker: () => Promise<HTMLElement> }> = [
  { path: '/', marker: () => screen.findByRole('heading', { name: /Welcome back/i }) },
  { path: '/landing', marker: () => screen.findByRole('heading', { name: /Ideas, into strategies/i }) },
  { path: '/login', marker: () => screen.findByRole('heading', { name: /^Sign in$/i }) },
  { path: '/signup', marker: () => screen.findByRole('heading', { name: /^Sign up$/i }) },
  { path: '/reactivate', marker: () => screen.findByRole('heading', { name: /^Reactivate account$/i }) },
  { path: '/password-reset', marker: () => screen.findByRole('heading', { name: /^Find your password$/i }) },
  { path: '/strategies', marker: () => screen.findByRole('heading', { name: /^Strategies$/i }) },
  { path: '/strategies/new/basic', marker: () => screen.findByTestId('basic-editor-workspace') },
  { path: '/strategies/new/pro', marker: () => screen.findByRole('heading', { name: /Pro editor is being prepared/i }) },
  { path: '/bots', marker: () => screen.findByRole('heading', { name: /Bot operations/i }) },
  { path: '/backtests', marker: () => screen.findByRole('heading', { name: /Bots Backtest/i }) },
  { path: '/competition', marker: () => screen.findByRole('heading', { name: /^Competition$/i }) },
  { path: '/competition-v2', marker: () => screen.findByRole('heading', { name: /^Competition$/i }) },
  { path: '/notifications', marker: () => screen.findByRole('heading', { name: /^Notifications$/i, level: 1 }) },
  { path: '/help', marker: () => screen.findByRole('heading', { name: /Help/i }) },
  { path: '/account', marker: () => screen.findByRole('heading', { name: /My account/i }) },
];

describe('English locale', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('i2s-language', 'en');
    // Account-scoped routes redirect signed-out visits to /login, so the route
    // sweep signs in through both credential stores.
    setSessionAccessToken('locale-test-session');
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      accessToken: 'locale-test-session',
      accountId: '10000000-0000-4000-8000-000000000002',
      expiresAt: null,
    }));
  });
  afterEach(() => {
    window.localStorage.clear();
    setSessionAccessToken(null);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  });

  ROUTES.forEach(({ path, marker }) => {
    test(`renders ${path} without crashing`, async () => {
      window.history.replaceState({}, '', path);
      const { container } = renderEnglishApp();

      // 화면이 죽으면 root가 비어 버린다. 검은 화면의 정체가 이것이다.
      expect(await marker()).toBeInTheDocument();
      expect(container.querySelectorAll('*').length).toBeGreaterThan(20);
    });
  });

  test('translates the complete sign-in surface instead of only replacing the word login', async () => {
    window.history.replaceState({}, '', '/login');
    const { container } = renderEnglishApp();

    expect(await screen.findByLabelText('Sign-in email')).toBeInTheDocument();
    expect(screen.getByLabelText('Sign-in password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find your password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
    expect(container).toHaveTextContent('Sign in with your email and password.');
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  test('draws candles for every chart timeframe, not just the default', async () => {
    const user = userEvent.setup();
    render(<LanguageProvider><BacktestView /></LanguageProvider>);

    /* 기간 버튼의 이름은 번역돼도, 내부 식별자는 그대로여야 한다. 여섯 개 모두
       눌러 캔들이 그려지는지 확인한다. */
    const group = screen.getByTestId('backtest-timeframe');
    expect(group).toHaveAccessibleName('Chart period');
    const options = within(group).getAllByRole('button');
    expect(options).toHaveLength(6);

    for (const option of options) {
      await user.click(option);
      expect(screen.getByTestId('backtest-candle-canvas')).toBeInTheDocument();
      expect(screen.getAllByTestId('market-candle').length).toBeGreaterThan(0);
    }
  });
});
