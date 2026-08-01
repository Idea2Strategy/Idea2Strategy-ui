import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { App } from './App';
import { LanguageProvider } from './lib/i18n';
import { BacktestView } from './views/OperationsViews';

/*
  영어 로케일 화면 점검.

  Localized는 화면으로 넘어가는 문자열 prop을 전부 번역한다. 그래서 한글 이름을
  식별자로도 쓰는 코드가 있으면 영어에서만 조회가 빗나가 화면이 통째로 죽는다.
  #47의 백테스트 검은 화면이 정확히 그 경우였다: 차트 기간 '1일'이 'Daily'로
  번역돼 캔들 개수 조회가 undefined가 되고, 캔들 0개로 렌더하다 예외가 났다.

  라우트를 한 번씩 열어보는 이 테스트가 같은 실수를 다시 들여놓지 못하게 막는다.
*/
const ROUTES: Array<{ path: string; marker: () => HTMLElement }> = [
  { path: '/', marker: () => screen.getByRole('heading', { name: /Welcome back/i }) },
  { path: '/landing', marker: () => screen.getByRole('heading', { name: /Ideas, into strategies/i }) },
  { path: '/strategies', marker: () => screen.getByRole('heading', { name: /^Strategies$/i }) },
  { path: '/strategies/new/basic', marker: () => screen.getByTestId('basic-editor-workspace') },
  { path: '/strategies/new/pro', marker: () => screen.getByTestId('pro-editor-workspace') },
  { path: '/bots', marker: () => screen.getByRole('heading', { name: /Bot operations/i }) },
  { path: '/backtests', marker: () => screen.getByRole('heading', { name: /Bots Backtest/i }) },
  { path: '/competition', marker: () => screen.getByRole('heading', { name: /^Competition$/i }) },
  { path: '/competition-v2', marker: () => screen.getByRole('heading', { name: /^Competition$/i }) },
  { path: '/notifications', marker: () => screen.getAllByRole('heading', { name: /Notifications/i })[0] },
  { path: '/help', marker: () => screen.getByRole('heading', { name: /Help/i }) },
  { path: '/account', marker: () => screen.getByRole('heading', { name: /Account/i }) },
];

describe('English locale', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('i2s-language', 'en');
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  ROUTES.forEach(({ path, marker }) => {
    test(`renders ${path} without crashing`, () => {
      window.history.replaceState({}, '', path);
      const { container } = render(<App />);

      // 화면이 죽으면 root가 비어 버린다. 검은 화면의 정체가 이것이다.
      expect(container.querySelectorAll('*').length).toBeGreaterThan(20);
      expect(marker()).toBeInTheDocument();
    });
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
