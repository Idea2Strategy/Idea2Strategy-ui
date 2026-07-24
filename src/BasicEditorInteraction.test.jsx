import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BasicEditor } from './views/StrategyViews.jsx';

describe('Basic editor strategy explanations', () => {
  test('uses the full editor workspace without a page title and floats its side panels', () => {
    render(<BasicEditor goBack={() => {}} openEditor={() => {}} />);

    expect(screen.queryByRole('heading', { name: 'Basic 전략 편집기' })).not.toBeInTheDocument();
    const editorControls = screen.getByRole('toolbar', { name: 'Basic 편집 작업' });
    expect(editorControls).toHaveClass('floating-editor-controls');
    expect(screen.queryByText('EDITOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Opening Range Flow')).not.toBeInTheDocument();
    expect(screen.queryByText('미저장 변경')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '편집기 전환' })).toHaveClass('floating-editor-mode-controls');
    expect(screen.getByRole('group', { name: '캔버스 확대/축소' })).toHaveClass('floating-zoom-controls');
    for (const name of ['목록', 'Basic 편집기', 'Pro 편집기', '저장', '검증', '축소', '배율 초기화', '확대']) {
      expect(screen.getByRole('button', { name })).toHaveClass('floating-editor-button');
    }
    expect(screen.getByTestId('basic-editor-workspace')).toHaveClass('full-editor-workspace');
    expect(screen.getByTestId('basic-templates-panel')).toHaveClass('floating-editor-panel');
    expect(screen.getByTestId('basic-block-library')).toHaveClass('floating-editor-panel');
  });

  test('switches from the floating mode controls', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    render(<BasicEditor goBack={() => {}} openEditor={openEditor} />);

    await user.click(screen.getByRole('button', { name: 'Pro 편집기' }));
    expect(openEditor).toHaveBeenCalledWith('pro');
  });

  test('uses beginner templates on the left and block ingredients on the right', () => {
    render(<BasicEditor goBack={() => {}} />);

    expect(within(screen.getByTestId('basic-templates-panel')).getByText('TEMPLATES')).toBeInTheDocument();
    const blockLibrary = screen.getByTestId('basic-block-library');
    expect(within(blockLibrary).getByText('BLOCKS')).toBeInTheDocument();
    for (const category of ['데이터', '추세 지표', '모멘텀 지표', '변동성 지표', '거래량 지표', '조건', '논리', '시간·이벤트', '주문', '위험관리']) {
      expect(within(blockLibrary).getByText(category)).toBeInTheDocument();
    }
  });

  test('adds an RSI buy and sell strategy pair to the selected section from a template', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(screen.getByRole('button', { name: 'RSI 반등 템플릿 적용' }));

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
    expect(within(section).getByText('RSI 반등 매수')).toBeInTheDocument();
    expect(within(section).getByText('RSI 과열 매도')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/RSI 반등 템플릿/);
  });

  test('drags a template from the library onto a target partition', () => {
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    const template = screen.getByRole('button', { name: 'SMA 교차 템플릿 적용' });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };

    expect(template).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(template, { dataTransfer });
    expect(section).toHaveClass('is-template-drop-ready');
    fireEvent.dragOver(section, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');
    fireEvent.drop(section, { dataTransfer });

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
    expect(within(section).getByText('SMA 교차 매수')).toBeInTheDocument();
    expect(within(section).getByText('SMA 교차 매도')).toBeInTheDocument();
    expect(section).not.toHaveClass('is-template-drop-ready');
  });

  test('adds a library block to the currently selected strategy card', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'MACD 블록 추가' }));
    expect(within(screen.getByTestId('basic-buy-stack')).getByText('MACD')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '매도 전략 자연어 설명' }));
    await user.click(screen.getByRole('button', { name: '손절 블록 추가' }));
    expect(within(screen.getByTestId('basic-sell-stack')).getByText('손절')).toBeInTheDocument();
  });

  test('drags a library block onto the chosen strategy card', () => {
    render(<BasicEditor goBack={() => {}} />);

    const block = screen.getByRole('button', { name: 'MACD 블록 추가' });
    const sellRsi = screen.getByTestId('sell-rsi-block');
    const sellStack = screen.getByTestId('basic-sell-stack');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };

    expect(block).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(block, { dataTransfer });
    expect(screen.getByTestId('basic-sell-group')).toHaveClass('is-library-drop-ready');
    fireEvent.dragOver(sellRsi, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');
    fireEvent.drop(sellRsi, { dataTransfer });

    expect(within(sellStack).getByText('MACD')).toBeInTheDocument();
    expect(within(screen.getByTestId('basic-buy-stack')).queryByText('MACD')).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-sell-group')).not.toHaveClass('is-library-drop-ready');
    expect(screen.getByRole('status')).toHaveTextContent(/MACD 블록을 대상 전략에 추가/);
  });

  test('uses the same block category themes in the canvas and the block library', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.getByTestId('buy-trigger-block').querySelector('.scratch-block')).toHaveClass('block-time');
    expect(screen.getByTestId('buy-rsi-block').querySelector('.scratch-block')).toHaveClass('block-indicator');
    expect(screen.getByTestId('buy-budget-block').querySelector('.scratch-block')).toHaveClass('block-risk');
    expect(screen.getByTestId('sell-position-block').querySelector('.scratch-block')).toHaveClass('block-condition');

    await user.click(screen.getByRole('button', { name: 'MACD 블록 추가' }));
    expect(within(screen.getByTestId('basic-buy-stack')).getByText('MACD').closest('.scratch-block')).toHaveClass('block-indicator');
  });

  test('edits numeric block values with stepper buttons, direct input, and an operator dropdown', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    const valueInput = within(buyRsi).getByLabelText('RSI 값');
    const increaseButton = within(buyRsi).getByRole('button', { name: 'RSI 값 증가' });
    await user.click(increaseButton);
    expect(valueInput).toHaveValue(31);

    await user.clear(valueInput);
    await user.type(valueInput, '42');
    expect(valueInput).toHaveValue(42);
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 연산자' }));
    await user.click(screen.getByRole('option', { name: '>' }));

    await user.click(screen.getByRole('button', { name: '매수 전략 자연어 설명' }));
    expect(screen.getByRole('note', { name: '2단계 규칙 설명' })).toHaveTextContent('42 초과');
    expect(screen.getByRole('status')).toHaveTextContent('블록 설정을 변경했습니다.');
  });

  test('repeats numeric changes while a stepper button is held', () => {
    vi.useFakeTimers();
    try {
      render(<BasicEditor goBack={() => {}} />);

      const buyRsi = screen.getByTestId('buy-rsi-block');
      const valueInput = buyRsi.querySelector('.block-number-stepper input');
      const increaseButton = buyRsi.querySelector('.block-number-stepper button:last-child');

      fireEvent.pointerDown(increaseButton, { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(900));
      fireEvent.pointerUp(increaseButton, { pointerId: 1 });

      expect(valueInput.valueAsNumber).toBeGreaterThan(31);
    } finally {
      vi.useRealTimers();
    }
  });

  test('changes state-based block values with a real dropdown', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const position = screen.getByTestId('sell-position-block');
    const select = within(position).getByRole('combobox', { name: 'POSITION 값 선택' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'CLOSED' }));
    expect(select).toHaveAttribute('data-value', 'CLOSED');

    await user.click(screen.getByRole('button', { name: '매도 전략 자연어 설명' }));
    expect(screen.getByRole('note', { name: '1단계 규칙 설명' })).toHaveTextContent('포지션을 보유하지 않음');
  });

  test('aligns one rule-based natural-language note with every block', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.hover(screen.getByTestId('buy-rsi-block'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    const buyExplanation = screen.getByRole('button', { name: '매수 전략 자연어 설명' });
    await user.click(buyExplanation);
    expect(screen.getAllByRole('note')).toHaveLength(4);
    expect(screen.getByRole('note', { name: '1단계 규칙 설명' })).toHaveTextContent('1분봉');
    const indicatorRule = screen.getByRole('note', { name: '2단계 규칙 설명' });
    expect(within(indicatorRule).getByText('RSI(14)')).toHaveProperty('tagName', 'B');
    expect(within(indicatorRule).getByText('30 미만')).toHaveProperty('tagName', 'B');
    expect(within(screen.getByRole('note', { name: '3단계 규칙 설명' })).getByText('25%')).toHaveProperty('tagName', 'B');
    expect(screen.getByRole('note', { name: '4단계 규칙 설명' })).toHaveTextContent('시장가 매수');
    expect(buyExplanation).toHaveAttribute('aria-expanded', 'true');

    const sellExplanation = screen.getByRole('button', { name: '매도 전략 자연어 설명' });
    await user.click(sellExplanation);
    expect(screen.getAllByRole('note')).toHaveLength(3);
    expect(screen.getByRole('note', { name: '1단계 규칙 설명' })).toHaveTextContent('포지션을 보유 중');
    expect(screen.getByRole('note', { name: '2단계 규칙 설명' })).toHaveTextContent('RSI(14)');
    expect(screen.getByRole('note', { name: '2단계 규칙 설명' })).toHaveTextContent('70 초과');
    expect(screen.getByRole('note', { name: '3단계 규칙 설명' })).toHaveTextContent('100%');

    await user.click(sellExplanation);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  test('keeps the final buy and sell outputs attached and non-interactive', () => {
    render(<BasicEditor goBack={() => {}} />);

    for (const testId of ['buy-order-block', 'sell-order-block']) {
      const output = screen.getByTestId(testId);
      expect(output).toHaveClass('fixed-terminal-block');
      expect(output).toHaveAttribute('aria-disabled', 'true');
      expect(output).not.toHaveAttribute('draggable', 'true');
      expect(output.closest('.strategy-container-footer')).not.toBeNull();
    }
  });

  test('moves editable blocks between buy and sell strategies with drag and drop', () => {
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    const sellRsi = screen.getByTestId('sell-rsi-block');
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(),
    };

    expect(buyRsi).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(buyRsi, { dataTransfer });
    fireEvent.dragOver(sellRsi, { dataTransfer });
    fireEvent.drop(sellRsi, { dataTransfer });

    expect(within(screen.getByTestId('basic-sell-stack')).getByTestId('buy-rsi-block')).toBeInTheDocument();
    expect(within(screen.getByTestId('basic-buy-group')).getByText('3 BLOCKS')).toBeInTheDocument();
    expect(within(screen.getByTestId('basic-sell-group')).getByText('4 BLOCKS')).toBeInTheDocument();
  });

  test('adds one block at a time and keeps strategy containers content-sized', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyGroup = screen.getByTestId('basic-buy-group');
    expect(buyGroup).toHaveClass('content-sized-strategy');

    await user.click(within(buyGroup).getByRole('button', { name: /블록 추가/ }));

    expect(within(buyGroup).getByText('5 BLOCKS')).toBeInTheDocument();
    expect(within(buyGroup).getByTestId('buy-custom-block-1')).toBeInTheDocument();
  });

  test('reorders focused blocks with alt and arrow keys', () => {
    render(<BasicEditor goBack={() => {}} />);

    const buyStack = screen.getByTestId('basic-buy-stack');
    const trigger = screen.getByTestId('buy-trigger-block');
    fireEvent.keyDown(trigger, { key: 'ArrowDown', altKey: true });

    expect(within(buyStack).getAllByTestId(/buy-(trigger|rsi|budget)-block/)[1]).toBe(trigger);
    expect(screen.getByRole('status')).toHaveTextContent(/이동/);
  });

  test('groups buy and sell strategies inside a section with symbol and capital settings', () => {
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    expect(within(section).getByLabelText('SECTION 01 종목')).toHaveTextContent('AAPL');
    expect(within(section).getByLabelText('SECTION 01 전체 자본 대비 투자비율')).toHaveValue(40);
    expect(within(section).getByTestId('basic-buy-group')).toBeInTheDocument();
    expect(within(section).getByTestId('basic-sell-group')).toBeInTheDocument();
  });

  test('creates a new section by drawing a rectangle with a required buy strategy', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '섹션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const section = screen.getByTestId('strategy-section-2');
    expect(within(section).getByTestId('strategy-card-section-2-buy-1')).toBeInTheDocument();
    expect(within(section).queryByTestId('strategy-card-section-2-sell-1')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('button', { name: /매도 블록 추가/ }).length).toBeGreaterThan(0);
  });

  test('allows multiple buy and optional sell strategies in one section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(within(section).getByRole('button', { name: '매수 블록 추가' }));
    await user.click(within(section).getByRole('button', { name: '매도 블록 추가' }));

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
  });

  test('moves a sell strategy card into another section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '섹션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const sellCard = screen.getByTestId('basic-sell-group');
    const targetSection = screen.getByTestId('strategy-section-2');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(sellCard, { dataTransfer });
    fireEvent.dragOver(targetSection, { dataTransfer });
    fireEvent.drop(targetSection, { dataTransfer });

    expect(within(targetSection).getByTestId('basic-sell-group')).toBeInTheDocument();
  });

  test('does not allow moving the last buy strategy out of a section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '섹션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const sourceSection = screen.getByTestId('strategy-section-2');
    const targetSection = screen.getByTestId('strategy-section-1');
    const requiredBuyCard = within(sourceSection).getByTestId('strategy-card-section-2-buy-1');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(requiredBuyCard, { dataTransfer });
    fireEvent.dragOver(targetSection, { dataTransfer });
    fireEvent.drop(targetSection, { dataTransfer });

    expect(within(sourceSection).getByTestId('strategy-card-section-2-buy-1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/매수 블록이 하나 이상/);
  });

  test('moves a dot-only cursor spotlight across the editor canvas', () => {
    render(<BasicEditor goBack={() => {}} />);

    const canvas = screen.getByRole('region', { name: /Basic/ });
    const surface = screen.getByTestId('section-drawing-surface');
    expect(screen.getByTestId('cursor-dot-spotlight')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.pointerMove(surface, { clientX: 420, clientY: 260, pointerId: 1 });
    expect(canvas.style.getPropertyValue('--spotlight-x')).toBe('420px');
    expect(canvas.style.getPropertyValue('--spotlight-y')).toBe('260px');
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('1');

    fireEvent.pointerLeave(surface);
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('0');
  });

  test('zooms the strategy canvas in, out, and back to 100 percent', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const world = screen.getByTestId('section-world');
    const zoomLevel = screen.getByRole('button', { name: '배율 초기화' });

    await user.click(screen.getByRole('button', { name: '확대' }));
    expect(zoomLevel).toHaveTextContent('110%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1.1)');

    await user.click(screen.getByRole('button', { name: '축소' }));
    await user.click(screen.getByRole('button', { name: '축소' }));
    expect(zoomLevel).toHaveTextContent('90%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(0.9)');

    await user.click(zoomLevel);
    expect(zoomLevel).toHaveTextContent('100%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('zooms with the mouse wheel around the cursor position', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const world = screen.getByTestId('section-world');

    fireEvent.wheel(surface, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(-40px, -30px, 0) scale(1.1)');
    expect(screen.getByRole('button', { name: '배율 초기화' })).toHaveTextContent('110%');

    fireEvent.wheel(surface, { deltaY: 100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('pans the infinite canvas by dragging empty space', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 170, pointerId: 1 });

    expect(screen.getByTestId('section-world')).toHaveStyle('transform: translate3d(120px, 80px, 0) scale(1)');
    const canvas = screen.getByRole('region', { name: /Basic/ });
    expect(canvas.style.getPropertyValue('--canvas-pan-x')).toBe('120px');
    expect(canvas.style.getPropertyValue('--canvas-pan-y')).toBe('80px');
  });

  test('pans with pointer movement while the space bar is held', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const world = screen.getByTestId('section-world');
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(surface).toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 155, clientY: 125, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    expect(surface).not.toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 180, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');
  });

  test('keeps the space bar available while typing in an input', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const search = screen.getByRole('textbox', { name: '템플릿 검색' });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.keyDown(search, { key: ' ', code: 'Space' });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 140, pointerId: 1 });

    expect(surface).not.toHaveClass('is-space-panning');
    expect(screen.getByTestId('section-world')).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('moves a section and lets strategy cards overlap anywhere inside it', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    fireEvent.pointerDown(screen.getByTestId('section-1-move-handle'), { clientX: 300, clientY: 120, pointerId: 2 });
    fireEvent.pointerMove(surface, { clientX: 360, clientY: 160, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 360, clientY: 160, pointerId: 2 });
    expect(section).toHaveStyle({ left: '350px', top: '148px' });

    const buyCard = screen.getByTestId('basic-buy-group');
    const sellCard = screen.getByTestId('basic-sell-group');
    const sellMoveHandle = screen.getByRole('button', { name: '매도 전략 자유 이동' });

    fireEvent.pointerDown(sellMoveHandle, { clientX: 310, clientY: 112, pointerId: 3 });
    fireEvent.pointerMove(surface, { clientX: 24, clientY: 112, pointerId: 3 });
    fireEvent.pointerUp(surface, { clientX: 24, clientY: 112, pointerId: 3 });

    expect(buyCard).toHaveStyle({ left: '24px', top: '112px' });
    expect(sellCard).toHaveStyle({ left: '24px', top: '112px' });
    expect(section).toHaveStyle({ width: '600px' });
    expect(screen.queryByTestId('section-1-resize-handle')).not.toBeInTheDocument();
  });

  test('moves a partition by dragging its empty boundary area', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    fireEvent.pointerDown(section, { clientX: 900, clientY: 500, pointerId: 6, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 950, clientY: 530, pointerId: 6 });
    expect(section).toHaveClass('is-section-moving');
    fireEvent.pointerUp(surface, { clientX: 950, clientY: 530, pointerId: 6 });

    expect(section).toHaveStyle({ left: '340px', top: '138px' });
    expect(section).not.toHaveClass('is-section-moving');
  });

  test('automatically expands and shrinks a section boundary around moved strategies', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    const sellMoveHandle = screen.getByRole('button', { name: '매도 전략 자유 이동' });

    expect(section).toHaveStyle({ width: '600px' });
    fireEvent.pointerDown(sellMoveHandle, { clientX: 310, clientY: 112, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 700, clientY: 400, pointerId: 4 });
    fireEvent.pointerUp(surface, { clientX: 700, clientY: 400, pointerId: 4 });
    expect(section).toHaveStyle({ width: '984px', height: '710px' });

    fireEvent.pointerDown(sellMoveHandle, { clientX: 700, clientY: 400, pointerId: 5 });
    fireEvent.pointerMove(surface, { clientX: 310, clientY: 112, pointerId: 5 });
    fireEvent.pointerUp(surface, { clientX: 310, clientY: 112, pointerId: 5 });
    expect(section).toHaveStyle({ width: '600px', height: '422px' });
  });

  test('reorders strategy cards inside a section with drag and drop', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(within(section).getByRole('button', { name: '매수 블록 추가' }));
    const cards = section.querySelectorAll('.buy-container');
    const primaryCard = cards[0];
    const addedCard = cards[1];
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(addedCard, { dataTransfer });
    fireEvent.dragOver(primaryCard, { dataTransfer });
    fireEvent.drop(primaryCard, { dataTransfer });

    expect(section.querySelectorAll('.buy-container')[0]).toBe(addedCard);
  });

  test('reorders condition blocks inside one strategy by drag and drop', () => {
    render(<BasicEditor goBack={() => {}} />);

    const stack = screen.getByTestId('basic-buy-stack');
    const budget = screen.getByTestId('buy-budget-block');
    const trigger = screen.getByTestId('buy-trigger-block');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(budget, { dataTransfer });
    fireEvent.dragOver(trigger, { dataTransfer });
    fireEvent.drop(trigger, { dataTransfer });

    expect(stack.querySelectorAll('.draggable-strategy-block')[0]).toBe(budget);
  });

  test('deletes a condition block by dropping it into the bottom trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const block = screen.getByTestId('buy-rsi-block');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(block, { dataTransfer });

    const trash = screen.getByTestId('editor-trash-zone');
    expect(trash).toHaveAttribute('aria-label', '블록 삭제 영역');
    fireEvent.dragOver(trash, { dataTransfer });
    expect(trash).toHaveClass('is-ready');
    fireEvent.drop(trash, { dataTransfer });

    expect(screen.queryByTestId('buy-rsi-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-trash-zone')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('블록을 삭제했습니다.');
  });

  test('deletes a strategy card by dropping it into the bottom trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const card = screen.getByTestId('basic-sell-group');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(card, { dataTransfer });

    const trash = screen.getByTestId('editor-trash-zone');
    expect(trash).toHaveAttribute('aria-label', '전략 삭제 영역');
    fireEvent.drop(trash, { dataTransfer });

    expect(screen.queryByTestId('basic-sell-group')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('전략을 삭제했습니다.');
  });

  test('deletes a partition when its pointer drag ends over the trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(screen.getByTestId('section-1-move-handle'), {
      clientX: 300,
      clientY: 120,
      pointerId: 8,
    });
    const trash = screen.getByTestId('editor-trash-zone');
    vi.spyOn(trash, 'getBoundingClientRect').mockReturnValue({
      left: 400,
      right: 620,
      top: 700,
      bottom: 760,
      width: 220,
      height: 60,
      x: 400,
      y: 700,
      toJSON: () => {},
    });

    fireEvent.pointerMove(surface, { clientX: 500, clientY: 730, pointerId: 8 });
    expect(trash).toHaveClass('is-ready');
    fireEvent.pointerUp(surface, { clientX: 500, clientY: 730, pointerId: 8 });

    expect(screen.queryByTestId('strategy-section-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-trash-zone')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('파티션을 삭제했습니다.');
  });
});
