import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from './App.jsx';

describe('Signal product UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
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
    expect(screen.getByRole('heading', { name: '봇 백테스트' })).toBeInTheDocument();
  });

  test('gives Basic and Pro editors stable direct URLs', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('button', { name: '전략' }));
    await user.click(screen.getByRole('button', { name: '새 전략' }));
    await user.click(screen.getByRole('button', { name: 'Basic으로 시작' }));
    expect(window.location.pathname).toBe('/strategies/new/basic');
    const editorSurface = screen.getByTestId('strategy-editor-surface');
    expect(editorSurface).toContainElement(screen.getByRole('region', { name: 'Basic 전략 캔버스' }));
    expect(screen.queryByTestId('strategy-editor-subnav')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basic 편집기' })).toHaveClass('active');

    unmount();
    window.history.replaceState({}, '', '/strategies/new/pro');
    render(<App />);
    // The Pro command bar is as clean as Basic's: navigation and actions only.
    expect(screen.getByRole('toolbar', { name: 'Pro 편집 작업' })).toBeInTheDocument();
    expect(screen.queryByText(/샘플 데이터/)).not.toBeInTheDocument();
  });

  test('opens on the home dashboard and returns home when the brand is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: '반갑습니다, 김전략님' })).toBeInTheDocument();
    expect(screen.getByText('확인이 필요한 작업')).toBeInTheDocument();
    expect(screen.getByText('전체 성과')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '전략' }));
    expect(screen.getByRole('heading', { name: '전략' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Idea2Strategy 홈' }));
    expect(screen.getByRole('heading', { name: '반갑습니다, 김전략님' })).toBeInTheDocument();
  });

  test('removes admin and watchlist entry points and opens security inside My account', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole('button', { name: '관리자' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '관심종목 설정' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '내 계정' }));
    expect(screen.getByRole('heading', { name: '내 계정' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '접근 보안' })).toBeInTheDocument();
  });

  test('switches the product between Korean and English and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.selectOptions(screen.getByRole('combobox', { name: '언어 선택' }), 'en');
    expect(screen.getByRole('heading', { name: 'Welcome back, KIM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New strategy' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    await user.click(screen.getByRole('button', { name: 'Bots' }));
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bots');

    unmount();
    render(<App />);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
  });

  test('uses one heading composition and one active navigation rule on every primary page', async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const [navigation, heading] of [
      ['홈', '반갑습니다, 김전략님'],
      ['전략', '전략'],
      ['봇', '봇 운영 센터'],
      ['백테스트', '봇 백테스트'],
      ['모의투자', '모의투자'],
    ]) {
      await user.click(screen.getByRole('button', { name: navigation }));
      expect(screen.getByRole('heading', { name: heading }).closest('.page-heading')).not.toBeNull();
      const activeItems = document.querySelectorAll('.signal-product-nav > nav button.active');
      expect(activeItems).toHaveLength(1);
      expect(activeItems[0]).toHaveAccessibleName(navigation);
    }
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

  test('switches theme without losing the active page', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '봇' }));
    await user.click(screen.getByRole('button', { name: '라이트 모드' }));
    expect(screen.getByRole('heading', { name: '봇 운영 센터' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light');
    expect(screen.queryByRole('button', { name: '터미널형 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '균형형 보기' })).not.toBeInTheDocument();
  });

  test('shows the buy rule as one natural-language note per block', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '전략' }));
    await user.click(screen.getByRole('button', { name: '새 전략' }));
    await user.click(screen.getByRole('button', { name: 'Basic으로 시작' }));
    await user.hover(screen.getByTestId('buy-rsi-block'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '매수 전략 자연어 설명' }));
    const explanations = screen.getAllByRole('note');
    expect(explanations).toHaveLength(4);
    expect(explanations[0]).toHaveTextContent('1분봉');
    expect(explanations[1]).toHaveTextContent('RSI(14)');
    expect(explanations[1]).toHaveTextContent('30 미만');
    expect(explanations[2]).toHaveTextContent('25%');
    expect(explanations[3]).toHaveTextContent('시장가 매수');
  });

  test('opens a categorized compatible-node picker where a Pro connection is released', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="terminal" />);
    await user.click(screen.getByRole('button', { name: '전략' }));
    await user.click(screen.getByRole('button', { name: '새 전략' }));
    await user.click(screen.getByRole('button', { name: 'Pro로 시작' }));
    fireEvent.pointerUp(screen.getByTestId('true-output'), { clientX: 438, clientY: 276 });
    const picker = screen.getByRole('dialog', { name: '호환 노드 선택' });
    expect(picker).toHaveStyle({ left: '438px', top: '276px' });
    expect(screen.getByText('조건 · 비교')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '포지션 확인' })).toBeEnabled();
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
    expect(screen.queryByRole('button', { name: 'Opening Range Flow 복사' })).not.toBeInTheDocument();
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

  test('separates the official season from the searchable Competition list', async () => {
    const user = userEvent.setup();
    render(<App initialVariant="balanced" />);
    await user.click(screen.getByRole('button', { name: '모의투자' }));

    expect(screen.getByRole('heading', { name: '모의투자' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공식 대회 전체 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'OFFICAL' })).not.toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: '대회 검색' });
    await user.type(search, 'ETF Disc');
    expect(
      screen.getByRole('complementary', { name: 'ETF Discipline 순위' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Momentum Lab')).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));
    expect(screen.getByText('Room Beta')).toBeInTheDocument();
  });
});
