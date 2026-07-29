import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';
import { App } from './App';

const balancedStyles = readFileSync(resolve(process.cwd(), 'src/styles/balanced.css'), 'utf8');

/* Theme, market colours and language live behind the nav gear, so open it
   first. The trigger keeps its accessible name in both languages. */
const openDisplaySettings = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /화면 설정 열기|Open display settings/ }));

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
    const editorPage = screen.getByTestId('basic-editor-workspace').closest('.editor-shell-page');
    expect(editorPage).not.toBeNull();
    expect(editorSurface.firstElementChild).toHaveClass('strategy-editor-scroll');

    unmount();
    window.history.replaceState({}, '', '/strategies/new/pro');
    render(<App />);
    // The Pro command bar is as clean as Basic's: navigation and actions only.
    expect(screen.getByRole('toolbar', { name: 'Pro 편집 작업' })).toBeInTheDocument();
    expect(screen.queryByText(/샘플 데이터/)).not.toBeInTheDocument();
  });

  test('moves to bot operations after launching a personal bot', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/strategies/new/basic');
    render(<App />);

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
    await user.click(screen.getByRole('button', { name: 'Idea2Strategy 홈' }));
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

    await openDisplaySettings(user);
    const languageToggle = screen.getByRole('group', { name: '언어 선택' });
    expect(within(languageToggle).getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(languageToggle).getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Welcome back, KIM' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New strategy' })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    await user.click(screen.getByRole('button', { name: 'Bots' }));
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/bots');

    unmount();
    render(<App />);
    await openDisplaySettings(user);
    expect(within(screen.getByRole('group', { name: 'Language' })).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Bot operations' })).toBeInTheDocument();
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
    await openDisplaySettings(user);
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
    await user.click(screen.getByRole('button', { name: '매수 컨테이너 자연어 설명' }));
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
    expect(screen.getAllByText('Room Beta')).toHaveLength(2);
  });
});
