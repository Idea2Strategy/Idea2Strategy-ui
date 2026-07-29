import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from './lib/i18n';
import { ProEditor } from './views/StrategyViews';

const createDataTransfer = () => {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) ?? ''),
  };
};

describe('Pro editor shell and safety', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('uses the shared floating editor shell and blocks release while incomplete', () => {
    render(<ProEditor goBack={() => {}} openEditor={() => {}} />);

    expect(screen.getByRole('toolbar', { name: 'Pro 편집 작업' })).toHaveClass('floating-editor-controls');
    expect(screen.getByRole('group', { name: '편집기 전환' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '캔버스 확대/축소' })).toBeInTheDocument();
    expect(screen.getByTestId('pro-editor-workspace')).toHaveClass('full-editor-workspace');
    expect(screen.getByTestId('pro-node-library')).toHaveClass('floating-editor-panel');
    expect(screen.getByTestId('pro-node-inspector')).toHaveClass('floating-editor-panel');
    expect(screen.getByRole('button', { name: '개인 봇 출시' })).toBeDisabled();
    expect(screen.getByText(/미완성 · 오류/)).toBeInTheDocument();
    expect(screen.queryByText('Shift+드래그 / B 영역 선택 · Ctrl+A 전체 선택')).not.toBeInTheDocument();
  });

  test('switches to the Basic editor', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    render(<ProEditor goBack={() => {}} openEditor={openEditor} />);

    await user.click(screen.getByRole('button', { name: 'Basic 편집기' }));
    expect(openEditor).toHaveBeenCalledWith('basic');
  });

  test('starts with the specification structure and no removed legacy nodes', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByTestId('pro-node-pro-event')).toBeInTheDocument();
    expect(screen.getByTestId('pro-node-pro-universe')).toBeInTheDocument();
    expect(screen.getByTestId('pro-node-pro-order')).toBeInTheDocument();
    expect(screen.queryByText('직접 선택 바스켓')).not.toBeInTheDocument();
    expect(screen.queryByText('매수 후보')).not.toBeInTheDocument();
    expect(screen.queryByText('일반 합류')).not.toBeInTheDocument();
    expect(screen.queryByText(/노드 8/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '노드 그룹 만들기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그리드 스냅' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'RSI 노드 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /주문 요청 정보 출력 연결부/ })).not.toBeInTheDocument();
  });

  test('does not choose material values for the user', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByRole('combobox', { name: '이벤트 시작 이벤트' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'RSI 기간' })).toHaveValue(null);
    expect(screen.getAllByPlaceholderText('입력').length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('(Null)')).not.toBeInTheDocument();
  });
});

describe('Pro editor infinite canvas', () => {
  beforeEach(() => window.localStorage.clear());

  test('pans the graph by dragging empty space', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 170, pointerId: 1 });

    expect(screen.getByTestId('pro-graph-world')).toHaveStyle('transform: translate3d(120px, 80px, 0) scale(1)');
  });

  test('pans with the space bar and zooms around the pointer', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const world = screen.getByTestId('pro-graph-world');
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(surface).toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 155, clientY: 125, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    fireEvent.wheel(surface, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(screen.getByRole('button', { name: '배율 초기화' })).toHaveTextContent('110%');
  });

  test('moves a node freely without entering the fixed control area', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const node = screen.getByTestId('pro-node-pro-universe');
    expect(node).toHaveStyle({ left: '372px', top: '160px' });

    fireEvent.pointerDown(screen.getByRole('button', { name: '종목 선택·반복 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 4, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 160, clientY: -200, pointerId: 4 });
    fireEvent.pointerUp(surface, { clientX: 160, clientY: -200, pointerId: 4 });

    expect(node).toHaveStyle({ left: '432px', top: '24px' });
  });

  test('drags a node from its header without panning the canvas', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const world = screen.getByTestId('pro-graph-world');
    const node = screen.getByTestId('pro-node-pro-market');
    const heading = within(node).getByText('시세 데이터');

    fireEvent.pointerDown(heading, { clientX: 300, clientY: 200, pointerId: 12, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 380, clientY: 250, pointerId: 12 });
    fireEvent.pointerUp(surface, { clientX: 380, clientY: 250, pointerId: 12 });

    expect(node).toHaveStyle({ left: '834px', top: '210px' });
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('collapses an empty inspector while navigating and reopens it when a node is selected', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(surface, { clientX: 70, clientY: 70, pointerId: 13, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 70, clientY: 70, pointerId: 13 });
    expect(screen.getByTestId('pro-editor-workspace')).toHaveClass('is-inspector-collapsed');

    fireEvent.pointerDown(screen.getByTestId('pro-node-pro-rsi').querySelector('.pro-node-heading strong')!, {
      clientX: 500,
      clientY: 220,
      pointerId: 14,
      button: 0,
    });
    expect(screen.getByTestId('pro-editor-workspace')).not.toHaveClass('is-inspector-collapsed');
  });

  test('groups selected nodes and moves the group together', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const eventNode = screen.getByTestId('pro-node-pro-event');
    const universeNode = screen.getByTestId('pro-node-pro-universe');
    fireEvent.click(eventNode);
    fireEvent.click(universeNode, { shiftKey: true });
    await user.click(screen.getByRole('button', { name: '노드 그룹 만들기' }));

    const group = document.querySelector('.pro-node-group')!;
    expect(group).toBeInTheDocument();
    fireEvent.pointerDown(within(group as HTMLElement).getByText('노드 그룹 1'), { clientX: 200, clientY: 100, pointerId: 15, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 130, pointerId: 15 });
    fireEvent.pointerUp(surface, { clientX: 240, clientY: 130, pointerId: 15 });

    expect(eventNode).toHaveStyle({ left: '80px', top: '190px' });
    expect(universeNode).toHaveStyle({ left: '412px', top: '190px' });

    await user.click(within(group as HTMLElement).getByRole('button', { name: '노드 그룹 1 그룹 이름 수정' }));
    const nameInput = within(group as HTMLElement).getByRole('textbox', { name: '노드 그룹 1 그룹 이름' });
    await user.clear(nameInput);
    await user.type(nameInput, '진입 준비');
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(within(group as HTMLElement).getByText('진입 준비')).toBeInTheDocument();

    await user.click(within(group as HTMLElement).getByRole('button', { name: '진입 준비 그룹 접기' }));
    expect(group).toHaveClass('is-collapsed');
    expect(screen.queryByTestId('pro-node-pro-event')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /종목 선택·반복에서 조건 분기 연결 선택/ })).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText('실행 흐름 ×1')).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText('종목 ×2')).toBeInTheDocument();

    await user.click(within(group as HTMLElement).getByRole('button', { name: '진입 준비 그룹 펼치기' }));
    expect(screen.getByTestId('pro-node-pro-event')).toBeInTheDocument();
  });

  test('snaps moved nodes to the grid only when enabled', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '그리드 스냅' }));
    expect(screen.getByRole('button', { name: '그리드 스냅' })).toHaveAttribute('aria-pressed', 'true');

    const surface = screen.getByTestId('pro-graph-surface');
    const node = screen.getByTestId('pro-node-pro-rsi');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'RSI 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 16, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 107, clientY: 107, pointerId: 16 });
    fireEvent.pointerUp(surface, { clientX: 107, clientY: 107, pointerId: 16 });

    expect(node).toHaveStyle({ left: '1088px', top: '112px' });
  });

  test('organizes selected nodes using the product flow and refreshes their links', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const eventNode = screen.getByTestId('pro-node-pro-event');
    const universeNode = screen.getByTestId('pro-node-pro-universe');
    const marketNode = screen.getByTestId('pro-node-pro-market');
    const link = screen.getByRole('button', { name: '종목 선택·반복에서 시세 데이터 연결 선택' });
    const previousPath = link.getAttribute('d');
    fireEvent.click(eventNode);
    fireEvent.click(universeNode, { shiftKey: true });
    fireEvent.click(marketNode, { shiftKey: true });

    await user.click(screen.getByRole('button', { name: '노드 정리' }));
    expect(marketNode).not.toHaveStyle({ left: '754px' });
    const refreshedLink = screen.getByRole('button', { name: '종목 선택·반복에서 시세 데이터 연결 선택' });
    expect(refreshedLink).not.toBe(link);
    expect(refreshedLink.getAttribute('d')).not.toBe(previousPath);
    await user.click(refreshedLink);
    await user.click(screen.getByRole('button', { name: '선택 연결 삭제' }));
    expect(screen.queryByRole('button', { name: '종목 선택·반복에서 시세 데이터 연결 선택' })).not.toBeInTheDocument();
  });

  test('selects intersecting nodes with a Shift-drag marquee and exposes quick actions', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(surface, { clientX: 20, clientY: 100, pointerId: 21, button: 0, shiftKey: true });
    fireEvent.pointerMove(surface, { clientX: 700, clientY: 430, pointerId: 21, shiftKey: true });
    expect(screen.getByTestId('pro-selection-marquee')).toBeInTheDocument();
    fireEvent.pointerUp(surface, { clientX: 700, clientY: 430, pointerId: 21, shiftKey: true });

    expect(screen.getByTestId('pro-node-pro-event')).toHaveClass('is-selected');
    expect(screen.getByTestId('pro-node-pro-universe')).toHaveClass('is-selected');
    expect(screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' })).toBeInTheDocument();
  });

  test('creates a group from the selected-node quick toolbar and cycles its color', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    fireEvent.click(screen.getByTestId('pro-node-pro-event'));
    fireEvent.click(screen.getByTestId('pro-node-pro-universe'), { shiftKey: true });
    await user.click(within(screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' })).getByRole('button', { name: '그룹' }));

    const group = document.querySelector<HTMLElement>('.pro-node-group')!;
    const originalColor = group.style.getPropertyValue('--group-color');
    await user.click(within(group).getByRole('button', { name: '노드 그룹 1 그룹 색상 변경' }));
    expect(group.style.getPropertyValue('--group-color')).not.toBe(originalColor);
  });

  test('selects a node even when its editable control is clicked', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const marketNode = screen.getByTestId('pro-node-pro-market');
    await user.click(screen.getByRole('combobox', { name: '시세 데이터 데이터' }));

    expect(marketNode).toHaveClass('is-selected');
    expect(screen.getByRole('textbox', { name: '노드 이름' })).toHaveValue('시세 데이터');
  });

  test('moves a multi-selection together and duplicates it with the keyboard', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const eventNode = screen.getByTestId('pro-node-pro-event');
    const universeNode = screen.getByTestId('pro-node-pro-universe');
    fireEvent.click(eventNode);
    fireEvent.click(universeNode, { shiftKey: true });

    fireEvent.pointerDown(screen.getByRole('button', { name: '이벤트 시작 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 5, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 140, clientY: 130, pointerId: 5 });
    fireEvent.pointerUp(surface, { clientX: 140, clientY: 130, pointerId: 5 });
    expect(eventNode).toHaveStyle({ left: '80px', top: '190px' });
    expect(universeNode).toHaveStyle({ left: '412px', top: '190px' });

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(screen.getAllByText('이벤트 시작 복사본')).toHaveLength(1);
    expect(screen.getAllByText('종목 선택·반복 복사본')).toHaveLength(1);
  });
});

describe('Pro editor library and packages', () => {
  beforeEach(() => window.localStorage.clear());

  test('groups nodes by accepted input and exposes packages as a primary library view', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByRole('tab', { name: '노드 라이브러리' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: '이벤트·흐름 색상 묶음' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '값·계산 색상 묶음' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '기술 지표 색상 묶음' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이벤트 시작 노드 추가' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '고급' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Donchian Channel 노드 추가' })).not.toBeInTheDocument();
    const advancedToggle = screen.getByRole('button', { name: '확장 노드 함께 보기' });
    const nodeSearch = screen.getByLabelText('노드 검색').closest('label')!;
    expect(nodeSearch.compareDocumentPosition(advancedToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(advancedToggle);
    expect(screen.getByRole('button', { name: 'Donchian Channel 노드 추가' })).toHaveClass('is-advanced');
    expect(screen.getByRole('button', { name: '주문 규모 계산 노드 추가' })).toHaveClass('is-advanced');
    expect(within(screen.getByRole('region', { name: '이벤트·흐름 색상 묶음' })).getByRole('button', { name: '종목 선택·반복 노드 추가' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /전략 패키지/ }));
    const rsiPackage = screen.getByRole('button', { name: /RSI 반등/ });
    expect(rsiPackage).toHaveClass('template-card', 'basic-package-card');
    expect(rsiPackage.closest('.basic-package-card-stack')?.querySelectorAll('.basic-package-layer')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /ATR 손절/ })).toBeInTheDocument();
    expect(screen.getAllByText('8개 노드 · 9개 연결').length).toBeGreaterThan(0);
  });

  test('keeps category headings sticky and uses the Basic editor graph tool icons', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByRole('region', { name: '이벤트·흐름 색상 묶음' }).querySelector(':scope > header')).toHaveClass('is-sticky');
    expect(screen.getByRole('button', { name: '그리드 스냅' }).querySelector('.lucide-grid-3x3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '노드 정리' }).querySelector('.lucide-layout-grid')).toBeInTheDocument();
  });

  test('groups library nodes by their actual node color', () => {
    render(<ProEditor goBack={() => {}} />);

    const indicatorGroup = screen.getByRole('region', { name: '기술 지표 색상 묶음' });
    expect(within(indicatorGroup).getByRole('button', { name: 'RSI 노드 추가' })).toBeInTheDocument();
    expect(within(indicatorGroup).getByRole('button', { name: 'SMA 노드 추가' })).toBeInTheDocument();
  });

  test('uses the same category color in the library and on the actual node', () => {
    render(<ProEditor goBack={() => {}} />);

    const libraryItem = screen.getByRole('button', { name: 'RSI 노드 추가' });
    const node = screen.getByTestId('pro-node-pro-rsi');
    expect(libraryItem.style.getPropertyValue('--category-color')).toBe(node.style.getPropertyValue('--node-color'));
  });

  test('uses green flow colors, orange portfolio colors, and a start icon consistently', async () => {
    render(<ProEditor goBack={() => {}} />);

    const eventItem = screen.getByRole('button', { name: '이벤트 시작 노드 추가' });
    const universeItem = screen.getByRole('button', { name: '종목 선택·반복 노드 추가' });
    expect(eventItem.style.getPropertyValue('--category-color')).toBe('#48d17f');
    expect(universeItem.style.getPropertyValue('--category-color')).toBe('#48d17f');
    expect(within(eventItem).getByTestId('pro-start-library-icon')).toBeInTheDocument();

    const portfolioItem = screen.getByRole('button', { name: '포지션·계좌 값 노드 추가' });
    expect(portfolioItem.style.getPropertyValue('--category-color')).toBe('#f97316');
  });

  test('previews a package footprint at the drop position before inserting it', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('tab', { name: /전략 패키지/ }));
    const card = screen.getByRole('button', { name: /RSI 반등/ });
    const surface = screen.getByTestId('pro-graph-surface');
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(surface, { clientX: 900, clientY: 500, dataTransfer });

    expect(screen.getByTestId('pro-package-preview')).toHaveTextContent('RSI 반등');
    fireEvent.drop(surface, { clientX: 900, clientY: 500, dataTransfer });
    expect(screen.queryByTestId('pro-package-preview')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.pro-node-group').length).toBeGreaterThan(0);
  });

  test('adds a value-free structural package as a named group and can undo it', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('tab', { name: /전략 패키지/ }));
    await user.click(screen.getByRole('button', { name: /RSI 반등/ }));
    expect(screen.getAllByText('이벤트 시작').length).toBeGreaterThan(1);
    expect(document.querySelector('.pro-node-group')).toHaveTextContent('RSI 반등');
    expect(screen.getByRole('button', { name: '실행 취소' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getAllByText('이벤트 시작')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeEnabled();
  });

  test('slides side panels while leaving their reopen controls available', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '노드 라이브러리 접기' }));
    expect(screen.getByTestId('pro-editor-workspace')).toHaveClass('is-library-collapsed');
    expect(screen.getByRole('button', { name: '노드 라이브러리 펼치기' })).toHaveClass('is-panel-title-height');

    await user.click(screen.getByRole('button', { name: '설정 패널 접기' }));
    expect(screen.getByTestId('pro-editor-workspace')).toHaveClass('is-inspector-collapsed');
    expect(screen.getByRole('button', { name: '설정 패널 펼치기' })).toBeInTheDocument();
  });

  test('keeps the inspector reopen control at the same height for automatic and manual collapse', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const workspace = screen.getByTestId('pro-editor-workspace');
    const collapseButton = screen.getByRole('button', { name: '설정 패널 접기' });
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 10, top: 10, left: 0, right: 1200, bottom: 800, width: 1200, height: 790, toJSON: () => ({}) });
    vi.spyOn(collapseButton, 'getBoundingClientRect').mockReturnValue({ x: 1150, y: 100, top: 100, left: 1150, right: 1180, bottom: 130, width: 30, height: 30, toJSON: () => ({}) });

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(surface, { clientX: 70, clientY: 70, pointerId: 31, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 70, clientY: 70, pointerId: 31 });
    expect(screen.getByRole('button', { name: '설정 패널 펼치기' })).toHaveStyle({ top: '90px' });

    await user.click(screen.getByRole('button', { name: '설정 패널 펼치기' }));
    const manualCollapseButton = screen.getByRole('button', { name: '설정 패널 접기' });
    vi.spyOn(manualCollapseButton, 'getBoundingClientRect').mockReturnValue({ x: 1150, y: 100, top: 100, left: 1150, right: 1180, bottom: 130, width: 30, height: 30, toJSON: () => ({}) });
    await user.click(manualCollapseButton);
    expect(screen.getByRole('button', { name: '설정 패널 펼치기' })).toHaveStyle({ top: '90px' });
  });

  test('pins favorite nodes above the categorized library and persists the choice', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const rsiFavorite = screen.getByRole('button', { name: 'RSI 즐겨찾기에 추가' });
    expect(rsiFavorite.closest('.pro-library-title-row')).toHaveTextContent('RSI');
    expect(rsiFavorite.closest('.pro-library-title-row')).toHaveTextContent('핵심');
    expect(rsiFavorite.closest('.pro-library-badges')).toBeNull();
    expect(rsiFavorite).toHaveClass('pro-library-favorite');
    expect(rsiFavorite.closest('.pro-library-node-card')?.querySelector('.pro-library-add-icon')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'RSI 즐겨찾기에 추가' }));
    const favorites = screen.getByRole('region', { name: '즐겨찾는 노드' });
    expect(within(favorites).getByRole('button', { name: 'RSI 노드 추가' })).toBeInTheDocument();
    expect(favorites.querySelector('.pro-library-node-card')).toHaveClass('is-pinned');
    expect(window.localStorage.getItem('i2s-pro-editor-favorite-nodes-v1')).toContain('rsi');

    await user.click(within(favorites).getByRole('button', { name: 'RSI 즐겨찾기 해제' }));
    expect(screen.queryByRole('region', { name: '즐겨찾는 노드' })).not.toBeInTheDocument();
  });

  test('uses clearer library wording for optional nodes and package levels', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByText('확장 노드')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /전략 패키지/ }));
    expect(screen.getByText('핵심 전략 패키지')).toBeInTheDocument();
    expect(screen.getByText('확장 전략 패키지')).toBeInTheDocument();
  });
});

describe('Pro editor typed connections', () => {
  beforeEach(() => window.localStorage.clear());

  test('keeps ordinary graph connections visible when no group is collapsed', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(document.querySelectorAll('.pro-graph-link:not(.is-draft)')).toHaveLength(9);
  });

  test('opens a compatible-node picker where a flow connection is released', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(screen.getByTestId('true-output'), { clientX: 438, clientY: 276, pointerId: 7, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 520, clientY: 330, pointerId: 7 });
    expect(surface).toHaveClass('is-linking');
    fireEvent.pointerUp(surface, { clientX: 520, clientY: 330, pointerId: 7 });

    const picker = screen.getByRole('dialog', { name: '호환 노드 선택' });
    expect(picker).toHaveStyle({ left: '520px', top: '330px' });
    expect(within(picker).getByText('실행 흐름 출력')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: /주문 요청/ })).toBeEnabled();
  });

  test('adds and connects a compatible node from the picker', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    fireEvent.pointerDown(screen.getByTestId('true-output'), { clientX: 438, clientY: 276, pointerId: 8, button: 0 });
    fireEvent.pointerUp(screen.getByTestId('true-output'), { clientX: 438, clientY: 276, pointerId: 8 });
    await user.click(within(screen.getByRole('dialog', { name: '호환 노드 선택' })).getByRole('button', { name: /주문 요청/ }));

    expect(screen.queryByRole('dialog', { name: '호환 노드 선택' })).not.toBeInTheDocument();
    expect(screen.getAllByText('주문 요청').length).toBeGreaterThan(1);
  });

  test('finds and connects a compatible producer by dragging from an input', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    await user.click(within(screen.getByTestId('pro-node-pro-order')).getByRole('button', { name: '주문 요청 추가 포트 펼치기' }));
    const input = screen.getByRole('button', { name: '주문 요청 주문 금액 입력 연결부 · 금액' });
    fireEvent.pointerDown(input, { clientX: 320, clientY: 300, pointerId: 18, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 360, pointerId: 18 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 360, pointerId: 18 });

    const picker = screen.getByRole('dialog', { name: '호환 노드 선택' });
    expect(within(picker).getByText('금액 입력')).toBeInTheDocument();
    await user.click(within(picker).getByRole('button', { name: /주문 규모 계산/ }));

    expect(input).toHaveClass('is-linked');
    expect(screen.queryByRole('dialog', { name: '호환 노드 선택' })).not.toBeInTheDocument();
  });

  test('dims incompatible nodes while preserving compatible connection targets', () => {
    render(<ProEditor goBack={() => {}} />);

    fireEvent.pointerDown(screen.getByTestId('rsi-output'), {
      clientX: 400,
      clientY: 260,
      pointerId: 29,
      button: 0,
    });

    expect(screen.getByTestId('pro-node-pro-event')).toHaveClass('is-link-incompatible');
    expect(screen.getByTestId('pro-node-pro-universe')).toHaveClass('is-link-incompatible');
    expect(screen.getByTestId('pro-node-pro-compare')).toHaveClass('is-link-compatible');
  });

  test('marks compatible subtype conversions on the connection itself', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '이전 값 노드 추가' }));
    const moneyOutput = screen.getByRole('button', { name: '주문 요청 주문 금액 출력 연결부 · 금액' });
    const numberInput = screen.getAllByRole('button', { name: '이전 값 시계열 값 입력 연결부 · 수치' }).at(-1)!;
    fireEvent.pointerDown(moneyOutput, { clientX: 400, clientY: 300, pointerId: 28, button: 0 });
    fireEvent.pointerUp(numberInput, { clientX: 520, clientY: 300, pointerId: 28 });

    expect(screen.getByRole('button', { name: /주문 요청에서 이전 값 연결 선택/ }).closest('g')).toHaveClass('is-adapted');
    expect(screen.getByLabelText('금액에서 수치로 변환')).toBeInTheDocument();
  });

  test('reconnects a used input and replaces its previous link without a prompt', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '종목 선택·반복 노드 추가' }));
    const newUniverse = screen.getAllByText('종목 선택·반복').at(-1)!.closest('.pro-graph-node')!;
    const newSymbolOutput = within(newUniverse as HTMLElement).getByRole('button', { name: /현재 종목 출력 연결부/ });
    const usedInput = screen.getByRole('button', { name: '주문 요청 종목 입력 연결부 · 종목' });
    expect(usedInput).toHaveClass('is-linked');

    fireEvent.pointerDown(newSymbolOutput, { clientX: 200, clientY: 200, pointerId: 19, button: 0 });
    fireEvent.pointerUp(usedInput, { clientX: 300, clientY: 200, pointerId: 19 });

    expect(newSymbolOutput).toHaveClass('is-linked');
    expect(screen.queryByText('이미 사용 중인 입력입니다')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.pro-graph-link:not(.is-draft)')).toHaveLength(9);
  });

  test('starts reconnection by dragging an already linked input', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const usedInput = screen.getByRole('button', { name: '주문 요청 종목 입력 연결부 · 종목' });
    fireEvent.pointerDown(usedInput, { clientX: 300, clientY: 220, pointerId: 20, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 230, clientY: 270, pointerId: 20 });

    expect(surface).toHaveClass('is-linking');
  });

  test('moves an existing connection by dragging its linked input to another input', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '이전 값 노드 추가' }));
    const currentInput = screen.getByRole('button', { name: '값 비교 값 A 입력 연결부 · 수치' });
    const nextInput = screen.getAllByRole('button', { name: '이전 값 시계열 값 입력 연결부 · 수치' }).at(-1)!;
    expect(currentInput).toHaveClass('is-linked');

    fireEvent.pointerDown(currentInput, { clientX: 540, clientY: 260, pointerId: 31, button: 0 });
    expect(nextInput).toHaveClass('is-compatible');
    fireEvent.pointerUp(nextInput, { clientX: 690, clientY: 360, pointerId: 31 });

    expect(currentInput).not.toHaveClass('is-linked');
    expect(nextInput).toHaveClass('is-linked');
    expect(screen.getByTestId('rsi-output')).toHaveClass('is-linked');
    expect(document.querySelectorAll('.pro-graph-link:not(.is-draft)')).toHaveLength(9);
  });

  test('moves only the grabbed branch when dragging a link from a fan-out output', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '시세 데이터 노드 추가' }));
    const marketInputs = screen.getAllByRole('button', { name: '시세 데이터 종목 입력 연결부 · 종목' });
    const originalMarketInput = marketInputs[0];
    const newMarketInput = marketInputs.at(-1)!;
    const orderInput = screen.getByRole('button', { name: '주문 요청 종목 입력 연결부 · 종목' });
    const orderBranch = screen.getByRole('button', { name: '종목 선택·반복에서 주문 요청 연결 선택' });

    fireEvent.pointerDown(orderBranch, { clientX: 1200, clientY: 420, pointerId: 33, button: 0 });
    fireEvent.pointerMove(newMarketInput, { clientX: 1480, clientY: 520, pointerId: 33 });

    expect(newMarketInput).toHaveClass('is-compatible');
    expect(newMarketInput.querySelector('.pro-port-drop-label')).toHaveTextContent('종목');

    fireEvent.pointerUp(newMarketInput, { clientX: 1480, clientY: 520, pointerId: 33 });

    expect(originalMarketInput).toHaveClass('is-linked');
    expect(newMarketInput).toHaveClass('is-linked');
    expect(orderInput).not.toHaveClass('is-linked');
    expect(document.querySelectorAll('.pro-graph-link:not(.is-draft)')).toHaveLength(9);
  });

  test('groups interchangeable OHLC outputs and lets the user switch the active price', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const market = screen.getByTestId('pro-node-pro-market');
    expect(within(market).queryByRole('button', { name: /시가 출력 연결부/ })).not.toBeInTheDocument();
    expect(within(market).queryByRole('button', { name: /고가 출력 연결부/ })).not.toBeInTheDocument();
    const closePort = within(market).getByRole('button', { name: '시세 데이터 종가 출력 연결부 · 가격' });
    expect(closePort).toBeInTheDocument();
    expect(closePort.querySelector('.pro-port-variant-cue')).toBeInTheDocument();
    expect(closePort.querySelector('.pro-port-variant-cue')).toHaveClass('lucide-chevron-right');
    expect(within(closePort).queryByRole('tooltip')).not.toBeInTheDocument();

    await user.click(within(market).getByRole('menuitem', { name: '고가 출력으로 사용' }));
    expect(within(market).getByRole('button', { name: '시세 데이터 고가 출력 연결부 · 가격' })).toHaveClass('is-linked');
    expect(screen.getByTestId('rsi-output')).toHaveClass('is-linked');
  });

  test('selects a link before deleting it and removes a dragged connection dropped on empty space', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const firstLink = screen.getByRole('button', { name: '이벤트 시작에서 종목 선택·반복 연결 선택' });
    await user.click(firstLink);
    expect(firstLink.closest('g')).toHaveClass('is-selected');
    await user.click(screen.getByRole('button', { name: '선택 연결 삭제' }));
    expect(screen.queryByRole('button', { name: '이벤트 시작에서 종목 선택·반복 연결 선택' })).not.toBeInTheDocument();

    const surface = screen.getByTestId('pro-graph-surface');
    const secondLink = screen.getByRole('button', { name: '종목 선택·반복에서 시세 데이터 연결 선택' });
    fireEvent.pointerDown(secondLink, { clientX: 500, clientY: 260, pointerId: 34, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 650, clientY: 540, pointerId: 34 });
    fireEvent.pointerUp(surface, { clientX: 650, clientY: 540, pointerId: 34 });

    expect(screen.queryByRole('button', { name: '종목 선택·반복에서 시세 데이터 연결 선택' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '호환 노드 선택' })).not.toBeInTheDocument();
  });

  test('rejects different port types with a meaningful reason', () => {
    render(<ProEditor goBack={() => {}} />);

    const output = screen.getByTestId('rsi-output');
    const input = screen.getByRole('button', { name: '주문 요청 종목 입력 연결부 · 종목' });
    fireEvent.pointerDown(output, { clientX: 100, clientY: 100, pointerId: 9, button: 0 });
    fireEvent.pointerUp(input, { clientX: 200, clientY: 100, pointerId: 9 });

    expect(screen.getByRole('alert')).toHaveTextContent('서로 다른 종류의 포트입니다');
    expect(screen.getByRole('alert')).toHaveTextContent('수치 출력은 종목 입력에 연결할 수 없습니다');
  });

  test('connects compatible ports on existing nodes by dragging', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '조건 분기 노드 추가' }));
    const newInput = screen.getAllByRole('button', { name: /조건 분기 조건 입력 연결부 · 조건/ }).at(-1)!;
    fireEvent.pointerDown(screen.getByTestId('condition-output'), { clientX: 100, clientY: 100, pointerId: 10, button: 0 });
    expect(newInput).toHaveClass('is-compatible');
    fireEvent.pointerUp(newInput, { clientX: 200, clientY: 100, pointerId: 10 });

    expect(newInput).toHaveClass('is-linked');
  });

  test('repairs duplicate links from a previously saved draft', () => {
    window.localStorage.setItem('i2s-pro-editor-draft-v2', JSON.stringify({
      nodes: [
        { id: 'saved-event', blueprintId: 'event', title: '이벤트 시작', x: 40, y: 120, collapsed: false, values: {} },
        { id: 'saved-universe', blueprintId: 'universe', title: '종목 선택·반복', x: 380, y: 120, collapsed: false, values: {} },
      ],
      links: [
        { id: 'duplicate-link', from: { nodeId: 'saved-event', portId: 'flow' }, to: { nodeId: 'saved-universe', portId: 'flow' }, type: 'flow' },
        { id: 'duplicate-link', from: { nodeId: 'saved-event', portId: 'flow' }, to: { nodeId: 'saved-universe', portId: 'flow' }, type: 'flow' },
      ],
      groups: [],
    }));

    render(<ProEditor goBack={() => {}} />);

    expect(screen.getAllByRole('button', { name: '이벤트 시작에서 종목 선택·반복 연결 선택' })).toHaveLength(1);
  });
});

describe('Pro editor node deletion', () => {
  beforeEach(() => window.localStorage.clear());

  test('shows the Basic-style trash target while moving a node and restores deletion with undo', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(screen.getByRole('button', { name: '값 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 11, button: 0 });
    expect(screen.getByTestId('pro-trash-zone')).toBeInTheDocument();
    expect(screen.getByTestId('pro-trash-zone')).toHaveTextContent('값 버리기');
    expect(screen.getByTestId('pro-trash-zone')).toHaveTextContent('여기에 놓으면 삭제됩니다');
    fireEvent.pointerMove(surface, { clientX: 0, clientY: 0, pointerId: 11 });
    fireEvent.pointerUp(surface, { clientX: 0, clientY: 0, pointerId: 11 });

    expect(screen.queryByTestId('pro-node-pro-value')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getByTestId('pro-node-pro-value')).toBeInTheDocument();
  });

  test('deletes a dragged group with its nodes and restores it with undo', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    fireEvent.click(screen.getByTestId('pro-node-pro-event'));
    fireEvent.click(screen.getByTestId('pro-node-pro-universe'), { shiftKey: true });
    await user.click(screen.getByRole('button', { name: '노드 그룹 만들기' }));
    const group = document.querySelector<HTMLElement>('.pro-node-group')!;
    const header = group.querySelector<HTMLElement>('header')!;
    const surface = screen.getByTestId('pro-graph-surface');

    fireEvent.pointerDown(header, { clientX: 100, clientY: 100, pointerId: 22, button: 0 });
    expect(screen.getByTestId('pro-trash-zone')).toHaveTextContent('노드 그룹 1 버리기');
    fireEvent.pointerMove(surface, { clientX: 0, clientY: 0, pointerId: 22 });
    fireEvent.pointerUp(surface, { clientX: 0, clientY: 0, pointerId: 22 });

    expect(screen.queryByTestId('pro-node-pro-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pro-node-pro-universe')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getByTestId('pro-node-pro-event')).toBeInTheDocument();
    expect(document.querySelector('.pro-node-group')).toBeInTheDocument();
  });

  test('deletes every selected node when a multi-selection is dropped in the trash', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.click(screen.getByTestId('pro-node-pro-event'));
    fireEvent.click(screen.getByTestId('pro-node-pro-universe'), { shiftKey: true });
    fireEvent.pointerDown(screen.getByRole('button', { name: '이벤트 시작 노드 자유 이동' }), {
      clientX: 100,
      clientY: 100,
      pointerId: 23,
      button: 0,
    });

    expect(screen.getByTestId('pro-trash-zone')).toHaveTextContent('2개 노드 버리기');
    fireEvent.pointerMove(surface, { clientX: 0, clientY: 0, pointerId: 23 });
    fireEvent.pointerUp(surface, { clientX: 0, clientY: 0, pointerId: 23 });

    expect(screen.queryByTestId('pro-node-pro-event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pro-node-pro-universe')).not.toBeInTheDocument();
  });
});

describe('Pro editor settings, save and validation', () => {
  beforeEach(() => window.localStorage.clear());

  test('edits common settings directly inside the node', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const eventType = screen.getByRole('combobox', { name: '이벤트 시작 이벤트' });
    await user.selectOptions(eventType, '봉 마감');
    expect(eventType).toHaveValue('봉 마감');
    expect(screen.getByRole('button', { name: '실행 취소' })).toBeEnabled();
  });

  test('uses an aligned custom option surface instead of the native dropdown popup', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const eventType = screen.getByRole('combobox', { name: '이벤트 시작 이벤트' });
    await user.click(eventType);
    const options = screen.getByRole('listbox', { name: '이벤트 시작 이벤트 선택' });
    const closeOption = within(options).getByRole('option', { name: '봉 마감' });
    expect(closeOption).toHaveClass('tone-time');
    expect(closeOption.querySelector('.pro-select-option-icon')).toBeInTheDocument();
    expect(closeOption.querySelector('.pro-select-option-caption')).toHaveTextContent('시간');
    await user.click(closeOption);

    expect(eventType).toHaveValue('봉 마감');
    expect(screen.queryByRole('listbox', { name: '이벤트 시작 이벤트 선택' })).not.toBeInTheDocument();
  });

  test('saves an incomplete draft locally without enabling release', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('초안을 이 기기에 저장했습니다');
    expect(window.localStorage.getItem('i2s-pro-editor-draft-v2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '개인 봇 출시' })).toBeDisabled();
  });

  test('shows validation issues and moves to the problem node', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '검증' }));
    expect(screen.getByRole('alert')).toHaveTextContent('출시를 막는 오류');
    expect(screen.getByRole('tab', { name: /검증/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('button', { name: /설정하지 않았습니다/ }).length).toBeGreaterThan(0);
  });

  test('shows primary ports first and expands advanced ports only when requested', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const universe = screen.getByTestId('pro-node-pro-universe');
    const header = universe.querySelector('.pro-node-header')!;
    const issue = within(universe).getByLabelText(/검증 문제/);
    const portToggle = within(universe).getByRole('button', { name: '종목 선택·반복 추가 포트 펼치기' });
    expect(Array.from(header.children).indexOf(issue)).toBeLessThan(Array.from(header.children).indexOf(portToggle));
    expect(within(universe).queryByRole('button', { name: /전체 수 출력 연결부/ })).not.toBeInTheDocument();
    await user.click(portToggle);
    expect(within(universe).getByRole('button', { name: /전체 수 출력 연결부/ })).toBeInTheDocument();
    await user.click(within(universe).getByRole('button', { name: '종목 선택·반복 추가 포트 접기' }));
    expect(within(universe).queryByRole('button', { name: /전체 수 출력 연결부/ })).not.toBeInTheDocument();
  });

  test('persists advanced port visibility as an editor preference', async () => {
    const user = userEvent.setup();
    const first = render(<ProEditor goBack={() => {}} />);

    const firstUniverse = screen.getByTestId('pro-node-pro-universe');
    const toggle = firstUniverse.querySelector<HTMLButtonElement>('.pro-node-port-toggle')!;
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(window.localStorage.getItem('i2s-pro-editor-expanded-ports-v1')).toContain('pro-universe');

    first.unmount();
    render(<ProEditor goBack={() => {}} />);
    expect(screen.getByTestId('pro-node-pro-universe').querySelector('.pro-node-port-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('shows concise connection guidance on ports and marks advanced labels subtly', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const rsiOutput = screen.getByTestId('rsi-output');
    expect(within(rsiOutput).getByRole('tooltip')).toHaveTextContent('연결 가능');

    const universe = screen.getByTestId('pro-node-pro-universe');
    await user.click(universe.querySelector<HTMLButtonElement>('.pro-node-port-toggle')!);
    const advancedPort = Array.from(universe.querySelectorAll('.pro-port.is-advanced'))[0];
    expect(advancedPort).toBeInTheDocument();
  });

  test('separates input and output documentation and avoids native port tooltips', () => {
    render(<ProEditor goBack={() => {}} />);

    fireEvent.click(screen.getByTestId('pro-node-pro-compare'));
    expect(screen.getByRole('group', { name: '입력 포트' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '출력 포트' })).toBeInTheDocument();
    expect(screen.getByTestId('rsi-output')).not.toHaveAttribute('title');
  });

  test('highlights the complete connected flow for the selected validation issue', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '검증' }));
    await user.click(screen.getByRole('button', { name: /이벤트 시작의 이벤트/ }));

    expect(screen.getByTestId('pro-node-pro-event')).toHaveClass('is-validation-focus');
    expect(screen.getByRole('button', { name: '이벤트 시작에서 종목 선택·반복 연결 선택' }).closest('g')).toHaveClass('is-validation-flow');
    expect(screen.getByRole('button', { name: '검증 강조 끄기' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검증 강조 끄기' }));
    expect(screen.getByTestId('pro-node-pro-event')).not.toHaveClass('is-validation-focus');
  });

  test('places the occasionally disabled organize action after the persistent graph tools', () => {
    render(<ProEditor goBack={() => {}} />);

    const controls = screen.getByRole('group', { name: '그래프 도구' });
    const buttons = within(controls).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '노드 그룹 만들기',
      '그리드 스냅',
      '노드 정리',
    ]);
  });

  test('automatically dismisses validation notices', () => {
    vi.useFakeTimers();
    try {
      render(<ProEditor goBack={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: '검증' }));
      expect(screen.getByRole('alert')).toHaveTextContent('출시를 막는 오류');
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('offers a compact minimap without an additional category list', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByRole('img', { name: '전략 미니맵' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '그룹 및 색상 묶음' })).not.toBeInTheDocument();
  });

  test('keeps group and organize actions for multi-selection and uses an icon delete action', () => {
    render(<ProEditor goBack={() => {}} />);

    const toolbar = screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' });
    expect(toolbar).toHaveStyle({ top: '212px' });
    expect(within(toolbar).queryByRole('button', { name: '정리' })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: '그룹' })).not.toBeInTheDocument();
    const duplicate = within(toolbar).getByRole('button', { name: '선택 노드 복제' });
    expect(duplicate.querySelector('svg')).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: '선택 노드 삭제' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '노드 정리' })).toBeDisabled();

    const nodeCount = document.querySelectorAll('.pro-graph-node').length;
    fireEvent.click(duplicate);
    expect(document.querySelectorAll('.pro-graph-node')).toHaveLength(nodeCount + 1);

    fireEvent.click(screen.getByTestId('pro-node-pro-event'));
    fireEvent.click(screen.getByTestId('pro-node-pro-universe'), { shiftKey: true });
    expect(within(screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' })).getByRole('button', { name: '정리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '노드 정리' })).toBeEnabled();
  });

  test('supports select-all, escape-to-clear, and one-shot box selection shortcuts', () => {
    render(<ProEditor goBack={() => {}} />);

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    expect(screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' })).toHaveTextContent('8');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: '선택 노드 빠른 작업' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b' });
    const surface = screen.getByTestId('pro-graph-surface');
    expect(surface).toHaveClass('is-box-selecting');
    fireEvent.pointerDown(surface, { clientX: 20, clientY: 100, pointerId: 35, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 700, clientY: 430, pointerId: 35 });
    fireEvent.pointerUp(surface, { clientX: 700, clientY: 430, pointerId: 35 });
    expect(screen.getByTestId('pro-node-pro-event')).toHaveClass('is-selected');
    expect(surface).not.toHaveClass('is-box-selecting');
  });

  test('shows the Basic-style cursor spotlight and synchronizes validation emphasis', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerMove(surface, { clientX: 320, clientY: 240, pointerId: 36 });
    const canvas = surface.closest<HTMLElement>('.pro-canvas')!;
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('1');
    expect(screen.getByTestId('pro-cursor-dot-spotlight')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '검증' }));
    expect(canvas).toHaveClass('is-validation-reviewing');
    expect(screen.getByRole('button', { name: '오류 경로 강조' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '오류 경로 강조' }));
    expect(canvas).not.toHaveClass('is-validation-reviewing');

    await user.click(screen.getByRole('button', { name: '검증' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '이벤트 시작 이벤트' }), '봉 마감');
    expect(canvas).not.toHaveClass('is-validation-reviewing');
  });

  test('places the selection toolbar below a node near the visible top edge', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const handle = screen.getByRole('button', { name: '값 노드 자유 이동' });
    fireEvent.pointerDown(handle, { clientX: 420, clientY: 220, pointerId: 32, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 420, clientY: -120, pointerId: 32 });
    fireEvent.pointerUp(surface, { clientX: 420, clientY: -120, pointerId: 32 });

    expect(screen.getByRole('toolbar', { name: '선택 노드 빠른 작업' })).toHaveClass('is-below');
  });

  test('uses the terminal treatment on the order request node', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(screen.getByTestId('pro-node-pro-order')).toHaveClass('is-order-node');
  });

  test('shows the natural-language strategy explanation and Pro disclaimer', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('tab', { name: '전략 설명' }));
    expect(screen.getByText('대상 종목')).toBeInTheDocument();
    expect(screen.getByText('재진입 방식')).toBeInTheDocument();
    expect(screen.getByText(/실제 대주 가능 여부와 차입 비용/)).toBeInTheDocument();
  });
});

describe('Pro editor localization', () => {
  test('keeps the editor usable in the English locale', () => {
    window.localStorage.setItem('i2s-language', 'en');
    render(<LanguageProvider><ProEditor goBack={() => {}} openEditor={() => {}} /></LanguageProvider>);

    expect(screen.getByRole('toolbar', { name: 'Pro editing actions' })).toBeInTheDocument();
    expect(screen.getAllByText('Market data').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Launch personal bot' })).toBeDisabled();
    window.localStorage.clear();
  });
});
