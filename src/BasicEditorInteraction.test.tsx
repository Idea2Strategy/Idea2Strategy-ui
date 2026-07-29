import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BasicEditor } from './views/StrategyViews';

const renderEditor = () => render(<BasicEditor goBack={() => {}} />);

const createDataTransfer = () => ({
  effectAllowed: '',
  dropEffect: '',
  setData: vi.fn(),
  getData: vi.fn(),
});

const openBlocks = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: /블록/ }));
  return screen.getByTestId('basic-block-library');
};

const openPackages = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: /패키지/ }));
  return screen.getByTestId('basic-templates-panel');
};

describe('Basic editor interactions', () => {
  test('uses one collapsible tabbed library for packages and blocks', async () => {
    const user = userEvent.setup();
    renderEditor();

    const library = screen.getByTestId('basic-library-panel');
    const blocks = screen.getByTestId('basic-block-library');
    expect(library).toContainElement(blocks);
    expect(within(blocks).getByText('가격')).toBeInTheDocument();
    expect(within(blocks).getByRole('button', { name: 'RSI 반등 블록 추가' })).toBeInTheDocument();
    expect(screen.queryByTestId('basic-templates-panel')).not.toBeInTheDocument();
    const intro = within(library).getByText('전략 카드를 선택한 뒤 블록을 클릭하거나 원하는 위치로 드래그하세요.');
    const tabs = within(library).getByRole('tablist', { name: '전략 라이브러리' });
    const search = within(blocks).getByRole('textbox', { name: '블록 검색' });
    expect(intro.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const packages = await openPackages(user);
    expect(library).toContainElement(packages);

    await user.click(within(library).getByRole('button', { name: '라이브러리 접기' }));
    expect(library).toHaveClass('is-docked-hidden');
    expect(library).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('basic-editor-workspace')).toHaveClass('is-library-collapsed');
    const reopen = screen.getByRole('button', { name: '라이브러리 펼치기' });
    expect(reopen).toHaveClass('pro-panel-edge-handle', 'basic-panel-edge-handle');
    await user.click(reopen);
    expect(library).not.toHaveClass('is-docked-hidden');
  });

  test('offers every package from the Basic specification', async () => {
    const user = userEvent.setup();
    renderEditor();
    const packages = await openPackages(user);
    for (const name of [
      '연속 상승·하락',
      '최근 평균 가격 돌파',
      '최근 최고 가격 돌파',
      '장 시작가 대비 상승',
      '하루 급락 매수',
      '정기 매수',
      'Donchian 돌파',
      'RSI 반등',
      'SMA 교차',
      'MACD 전환',
      'Bollinger 반전',
    ]) {
      expect(within(packages).getByRole('button', { name: `${name} 패키지 적용` })).toBeInTheDocument();
    }
    expect(within(packages).getByRole('separator', { name: '확장 패키지' })).toBeInTheDocument();
    expect(within(packages).getAllByText('PACKAGE').length).toBeGreaterThan(0);
    expect(packages.querySelector('.basic-package-card')).toBeInTheDocument();
    expect(packages.querySelector('.basic-package-card-stack')).toBeInTheDocument();
    expect(packages.querySelectorAll('.basic-package-layer')).toHaveLength(22);
  });

  test('adds blocks from the merged library and supports undo and redo', async () => {
    const user = userEvent.setup();
    renderEditor();
    const blocks = await openBlocks(user);
    const stack = screen.getByTestId('basic-buy-stack');
    const initialCount = stack.querySelectorAll('.draggable-strategy-block').length;

    await user.click(within(blocks).getByRole('button', { name: 'MACD 전환 블록 추가' }));
    expect(stack.querySelectorAll('.draggable-strategy-block')).toHaveLength(initialCount + 1);
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(stack.querySelectorAll('.draggable-strategy-block')).toHaveLength(initialCount);
    await user.click(screen.getByRole('button', { name: '다시 실행' }));
    expect(stack.querySelectorAll('.draggable-strategy-block')).toHaveLength(initialCount + 1);
  });

  test('copies, selects, deletes and restores strategy cards with Pro-style shortcuts', async () => {
    const user = userEvent.setup();
    renderEditor();
    const workspace = screen.getByTestId('basic-editor-workspace');

    await user.keyboard('{Control>}d{/Control}');
    expect(workspace.querySelectorAll('[data-strategy-card]')).toHaveLength(3);

    await user.keyboard('{Control>}a{/Control}');
    expect(workspace.querySelectorAll('[data-selected="true"]')).toHaveLength(3);
    await user.keyboard('{Delete}');
    expect(workspace.querySelectorAll('[data-strategy-card]')).toHaveLength(0);

    await user.keyboard('{Control>}z{/Control}');
    expect(workspace.querySelectorAll('[data-strategy-card]')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(workspace.querySelectorAll('[data-selected="true"]')).toHaveLength(0);
  });

  test('shows grid snap and one-click strategy organization controls', async () => {
    const user = userEvent.setup();
    renderEditor();
    const snap = screen.getByRole('button', { name: '그리드 스냅' });
    const organize = screen.getByRole('button', { name: '전략 카드 정리' });

    expect(snap).toHaveAttribute('aria-pressed', 'false');
    await user.click(snap);
    expect(snap).toHaveAttribute('aria-pressed', 'true');
    expect(organize).toBeEnabled();
    await user.click(organize);
    expect(screen.getByRole('status')).toHaveTextContent('전략 카드를 종류별로 정리했습니다.');
  });

  test('moves a strategy by its colored header and footer without a MOVE handle', () => {
    renderEditor();
    expect(document.querySelector('.strategy-card-move-handle')).not.toBeInTheDocument();

    const sellCard = screen.getByTestId('basic-sell-group');
    const header = sellCard.querySelector('.strategy-container-header') as HTMLElement;
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(header, { button: 0, clientX: 384, clientY: 136, pointerId: 7 });
    fireEvent.pointerMove(surface, { clientX: 24, clientY: 136, pointerId: 7 });
    fireEvent.pointerUp(surface, { clientX: 24, clientY: 136, pointerId: 7 });

    expect(sellCard).toHaveStyle({ left: '24px', top: '136px' });
    expect(screen.getByTestId('basic-buy-group')).toHaveStyle({ left: '24px', top: '136px' });
    expect(sellCard.querySelector('.strategy-container-footer')).toHaveAttribute('aria-label', '고정 매도 실행');
  });

  test('snaps a moved strategy card to the 16px grid', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: '그리드 스냅' }));

    const sellCard = screen.getByTestId('basic-sell-group');
    const header = sellCard.querySelector('.strategy-container-header') as HTMLElement;
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(header, { button: 0, clientX: 384, clientY: 136, pointerId: 8 });
    fireEvent.pointerMove(surface, { clientX: 373, clientY: 151, pointerId: 8 });
    fireEvent.pointerUp(surface, { clientX: 373, clientY: 151, pointerId: 8 });

    expect(sellCard).toHaveStyle({ left: '368px', top: '144px' });
  });

  test('lays a dropped package out side by side at the drop point', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: /패키지/ }));
    const packageButton = screen.getByRole('button', { name: 'Donchian 돌파 패키지 적용' });
    const section = screen.getByRole('article', { name: 'PARTITION 01' });
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(packageButton, { dataTransfer });
    fireEvent.drop(section, { dataTransfer, clientX: 180, clientY: 260 });

    const added = Array.from(section.querySelectorAll<HTMLElement>('[data-strategy-card]')).slice(-3);
    expect(added).toHaveLength(3);
    expect(added.map((card) => card.style.left)).toEqual(['24px', '384px', '744px']);
    expect(added.every((card) => card.style.top === '136px')).toBe(true);
  });

  test('edits a strategy name directly in its header', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: '매수 전략 이름 편집' }));
    const input = screen.getByRole('textbox', { name: '매수 전략 이름' });
    await user.clear(input);
    await user.type(input, '첫 진입');
    await user.keyboard('{Enter}');
    expect(within(screen.getByTestId('basic-buy-group')).getByText('첫진입')).toBeInTheDocument();
  });

  test('uses clearer repeat-entry wording and gives sell strategies an unset percentage', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: '매수 전략 실행 설정' }));
    const buySettings = screen.getByRole('group', { name: '매수 실행 설정' });
    expect(within(buySettings).getByRole('checkbox', { name: '반복 진입 허용' })).not.toBeChecked();
    expect(within(buySettings).getByText('조건이 다시 맞으면 재진입')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '매도 전략 실행 설정' }));
    const sellSettings = screen.getByRole('group', { name: '매도 실행 설정' });
    expect(within(sellSettings).getByRole('spinbutton', { name: '매도 비율' })).toHaveValue(null);
    expect(screen.getByTestId('sell-order-block')).toHaveTextContent('매도 요청');
    expect(screen.queryByText('전량 매도')).not.toBeInTheDocument();
  });

  test('uses strategy-card terminology instead of container terminology', () => {
    renderEditor();
    expect(screen.getByRole('group', { name: '매수 전략 카드 이동 영역' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '매도 전략 카드 이동 영역' })).toBeInTheDocument();
    expect(screen.queryByText(/컨테이너/)).not.toBeInTheDocument();
  });

  test('explains the selected strategy beside each block and ends with budget execution', async () => {
    const user = userEvent.setup();
    renderEditor();

    const buyCard = screen.getByTestId('basic-buy-group');
    expect(within(buyCard).getAllByRole('note', { name: /규칙 설명/ })).toHaveLength(2);
    const blockNarrative = within(buyCard).getByTestId('basic-narrative-block');
    expect(blockNarrative).toHaveTextContent('RSI');
    expect(blockNarrative).toHaveTextContent('RSI가 기준값에서 선택한 방향으로 움직일 때');
    expect(blockNarrative).not.toHaveTextContent('비어');
    expect(blockNarrative).toHaveClass('tone-condition');
    expect(blockNarrative.querySelectorAll('b').length).toBeGreaterThanOrEqual(2);
    const budgetNarrative = within(buyCard).getByTestId('basic-narrative-budget');
    expect(budgetNarrative).toHaveTextContent('예산');
    expect(budgetNarrative).toHaveClass('tone-buy');
    expect(budgetNarrative.querySelectorAll('b')).toHaveLength(2);

    const blocks = await openBlocks(user);
    await user.click(within(blocks).getByRole('button', { name: 'MACD 전환 블록 추가' }));
    const narratives = within(buyCard).getAllByTestId('basic-narrative-block');
    expect(narratives[0]).toHaveTextContent('움직이고');
    expect(narratives[1]).toHaveTextContent('움직일 때');

    fireEvent.keyDown(screen.getByRole('group', { name: '매도 전략 카드 이동 영역' }), { key: 'Enter' });
    const sellCard = screen.getByTestId('basic-sell-group');
    expect(within(buyCard).queryByRole('note', { name: /규칙 설명/ })).not.toBeInTheDocument();
    expect(within(sellCard).getByTestId('basic-narrative-budget')).toHaveTextContent('매도 비율');
  });

  test('represents multiple conditions as one non-directional chain-linked set', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.getByTestId('basic-buy-stack')).toHaveClass('has-center-marker');
    await openPackages(user);
    await user.click(screen.getByRole('button', { name: 'Donchian 돌파 패키지 적용' }));
    const multiStack = document.querySelector('.block-stack.is-multi-condition') as HTMLElement;
    expect(multiStack).toBeInTheDocument();
    expect(multiStack).toHaveClass('is-chain-linked-group');
    const chainLinks = multiStack.querySelectorAll('.condition-chain-link');
    expect(chainLinks).toHaveLength(
      multiStack.querySelectorAll('.draggable-strategy-block').length - 1,
    );
    expect(chainLinks[0]).toHaveClass('is-cutout');
    expect(chainLinks[0]).toHaveClass('is-outline-only');
    expect(chainLinks[0]).toHaveClass('is-foreground');
    expect(chainLinks[0]).toHaveClass('tone-neutral-metal');
    expect(chainLinks[0].querySelectorAll('svg')).toHaveLength(2);
    expect(chainLinks[0].querySelector('svg')).toHaveAttribute('width', '14');
    expect(chainLinks[0].querySelector('svg')).toHaveAttribute('height', '14');
    expect(multiStack).toHaveClass('has-center-marker');
    expect(multiStack.querySelector('.condition-stack-clips')).not.toBeInTheDocument();
    expect(within(multiStack).queryByText('AND')).not.toBeInTheDocument();
    expect(within(multiStack).queryByText('IF')).not.toBeInTheDocument();
  });

  test('does not render resize handles on the partition corners', () => {
    renderEditor();
    expect(document.querySelector('.section-corner')).not.toBeInTheDocument();
  });

  test('keeps block tones separate from buy, sell and risk card chrome', async () => {
    const user = userEvent.setup();
    renderEditor();
    const blocks = await openBlocks(user);
    expect(within(blocks).getByRole('button', { name: '가격 비교 블록 추가' }).closest('.block-category')).toHaveClass('tone-data');
    expect(within(blocks).getByRole('button', { name: 'RSI 반등 블록 추가' }).closest('.block-category')).toHaveClass('tone-condition');
    expect(screen.getByTestId('buy-rsi-block').querySelector('.scratch-block')).toHaveClass('block-condition');
    expect(screen.getByTestId('basic-buy-group')).toHaveClass('buy-container');
    expect(screen.getByTestId('basic-sell-group')).toHaveClass('sell-container');
  });

  test('renders block editors as compact recessed controls with a centered numeric value group', () => {
    renderEditor();
    const rsi = screen.getByTestId('buy-rsi-block');
    const relation = within(rsi).getByRole('combobox', { name: 'RSI 반등 방향' }).closest('.block-custom-select');
    const numberInput = within(rsi).getByRole('spinbutton', { name: 'RSI 반등 값' });
    const stepper = numberInput.closest('.block-number-stepper');

    expect(relation).toHaveClass('is-recessed-control');
    expect(stepper).toHaveClass('is-recessed-control');
    expect(numberInput.closest('label')).toContainElement(stepper?.querySelector('b') ?? null);
  });

  test('uses helpful library descriptions instead of repeating category labels', async () => {
    const user = userEvent.setup();
    renderEditor();
    const blocks = await openBlocks(user);
    expect(within(blocks).queryByText('가격 조건 블록')).not.toBeInTheDocument();
    expect(within(blocks).getByText('기준 가격과 현재가를 비교하는 블록이다.')).toBeInTheDocument();
    expect(blocks.querySelector('.block-category-divider')).toHaveClass('is-sticky');
  });

  test('pins favorite blocks above the categorized Basic library', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('i2s-basic-editor-favorite-blocks-v1');
    renderEditor();
    const blocks = await openBlocks(user);

    await user.click(within(blocks).getByRole('button', { name: 'RSI 반등 즐겨찾기에 추가' }));
    const favorites = within(blocks).getByRole('region', { name: '즐겨찾는 블록' });
    expect(within(favorites).getByRole('button', { name: 'RSI 반등 블록 추가' })).toBeInTheDocument();
    const favoriteToggle = within(favorites).getByRole('button', { name: 'RSI 반등 즐겨찾기 해제' });
    expect(favoriteToggle).toHaveClass('pro-library-favorite');
    expect(favoriteToggle.closest('.basic-library-title-row')).toHaveTextContent('RSI 반등');
    expect(window.localStorage.getItem('i2s-basic-editor-favorite-blocks-v1')).toContain('RSI 반등');
    expect(within(blocks).queryByText('기본')).not.toBeInTheDocument();
  });

  test('uses meaning-specific icons for Basic library blocks', async () => {
    const user = userEvent.setup();
    renderEditor();
    const blocks = await openBlocks(user);
    const priceIcon = within(blocks).getByRole('button', { name: '가격 비교 블록 추가' }).querySelector('.basic-library-block-icon svg');
    const rsiIcon = within(blocks).getAllByRole('button', { name: 'RSI 반등 블록 추가' })[0].querySelector('.basic-library-block-icon svg');
    expect(priceIcon).toBeInTheDocument();
    expect(rsiIcon).toBeInTheDocument();
    expect(priceIcon?.getAttribute('class')).not.toBe(rsiIcon?.getAttribute('class'));
  });

  test('marks partition settings and strategy add actions with their visual roles', () => {
    renderEditor();
    expect(screen.getAllByTestId('partition-setting-caption').map((caption) => caption.textContent)).toEqual(['종목', '예산', '봉 주기']);
    expect(screen.getByRole('button', { name: 'PARTITION 01 매수 전략 추가' })).toHaveClass('tone-buy');
    expect(screen.getByRole('button', { name: 'PARTITION 01 매도 전략 추가' })).toHaveClass('tone-sell');
    expect(screen.getByRole('button', { name: 'PARTITION 01 위기관리 전략 추가' })).toHaveClass('tone-risk');
  });

  test('does not zoom the canvas while the partition budget input handles the wheel', () => {
    renderEditor();
    const budget = screen.getByRole('spinbutton', { name: 'PARTITION 01 전체 전략 대비 예산' });
    const zoom = screen.getByRole('button', { name: '배율 초기화' });

    expect(zoom).toHaveTextContent('100%');
    fireEvent.wheel(budget, { deltaY: -100 });
    expect(zoom).toHaveTextContent('100%');
  });

  test('clears the selected strategy card when the empty canvas is pressed', () => {
    renderEditor();
    const buyCard = screen.getByTestId('basic-buy-group');
    expect(buyCard).toHaveClass('is-selected');
    expect(within(buyCard).getByTestId('basic-narrative-block')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('section-drawing-surface'), { button: 0, pointerId: 1 });

    expect(buyCard).not.toHaveClass('is-selected');
    expect(within(buyCard).queryByTestId('basic-narrative-block')).not.toBeInTheDocument();
  });

  test('toggles a strategy card off when its header is clicked again', () => {
    renderEditor();
    const buyCard = screen.getByTestId('basic-buy-group');
    const handle = screen.getByRole('group', { name: '매수 전략 카드 이동 영역' });

    expect(buyCard).toHaveClass('is-selected');
    fireEvent.click(handle);
    expect(buyCard).not.toHaveClass('is-selected');

    fireEvent.click(handle);
    expect(buyCard).toHaveClass('is-selected');
  });

  test('shows missing field wording on strategy cards', () => {
    renderEditor();
    expect(within(screen.getByTestId('basic-buy-group')).getByText('입력 필요')).toBeInTheDocument();
    expect(within(screen.getByTestId('basic-buy-group')).queryByText('조건 필요')).not.toBeInTheDocument();
  });

  test('places validation in a right-side drawer and toggles strong highlighting', async () => {
    const user = userEvent.setup();
    renderEditor();
    const trigger = screen.getByRole('button', { name: '미완성 오류 강조' });
    expect(trigger).toHaveTextContent(/미완성 · 오류/);
    expect(screen.queryByRole('complementary', { name: '전략 오류 안내' })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    const drawer = screen.getByRole('complementary', { name: '전략 오류 안내' });
    expect(drawer).toHaveClass('basic-validation-drawer');
    expect(screen.getByTestId('basic-editor-workspace')).toContainElement(drawer);
    expect(drawer).toHaveTextContent('수정할 항목');
    expect(within(drawer).getByRole('region', { name: 'PARTITION 01 오류' })).toBeInTheDocument();
    expect(within(drawer).getByRole('region', { name: 'PARTITION 01 오류' }).querySelector('li button > span:nth-child(2) strong')).toBeInTheDocument();
    expect(screen.getByTestId('basic-editor-workspace')).toHaveClass('is-validation-highlighting');
  });

  test('allows a complete strategy to launch after block fields and sell percentage are set', async () => {
    const user = userEvent.setup();
    const onLaunchBot = vi.fn();
    render(<BasicEditor goBack={() => {}} onLaunchBot={onLaunchBot} />);

    for (const [testId, direction, value] of [
      ['buy-rsi-block', '상승', '30'],
      ['sell-rsi-block', '하락', '70'],
    ] as const) {
      const block = screen.getByTestId(testId);
      await user.click(within(block).getByRole('combobox', { name: 'RSI 반등 방향' }));
      await user.click(screen.getByRole('option', { name: direction }));
      await user.type(within(block).getByLabelText('RSI 반등 값'), value);
    }
    await user.click(screen.getByRole('button', { name: '매도 전략 실행 설정' }));
    await user.type(screen.getByRole('spinbutton', { name: '매도 비율' }), '50');
    await user.click(screen.getByRole('button', { name: '개인 봇 출시' }));

    const dialog = screen.getByRole('dialog', { name: '개인 운용 봇 출시' });
    await user.type(within(dialog).getByRole('textbox', { name: '봇 이름' }), 'Basic Scout');
    await user.type(within(dialog).getByRole('textbox', { name: '봇 설명' }), '검증된 Basic 전략');
    await user.click(within(dialog).getByRole('button', { name: '봇 출시하기' }));
    expect(onLaunchBot).toHaveBeenCalledWith({ name: 'Basic Scout', description: '검증된 Basic 전략' });
  });
});
