import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProEditor } from './views/StrategyViews.jsx';
import { LanguageProvider } from './lib/i18n.jsx';

const graphTools = () => within(screen.getByRole('group', { name: '그래프 도구' }));

describe('Pro editor shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('uses the same floating editor shell as the Basic canvas', () => {
    render(<ProEditor goBack={() => {}} openEditor={() => {}} />);

    expect(screen.getByRole('toolbar', { name: 'Pro 편집 작업' })).toHaveClass('floating-editor-controls');
    // No title or strategy meta in the bar — same clean shell as Basic.
    expect(screen.queryByRole('heading', { name: 'Pro 전략 편집기' })).not.toBeInTheDocument();
    expect(screen.queryByText(/샘플 데이터/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '편집기 전환' })).toHaveClass('floating-editor-mode-controls');
    expect(screen.getByRole('group', { name: '캔버스 확대/축소' })).toHaveClass('floating-zoom-controls');
    for (const name of ['목록', 'Basic 편집기', 'Pro 편집기', '저장', '검증', '축소', '배율 초기화', '확대']) {
      expect(screen.getByRole('button', { name })).toHaveClass('floating-editor-button');
    }
    expect(screen.getByTestId('pro-editor-workspace')).toHaveClass('full-editor-workspace');
    expect(screen.getByTestId('pro-node-library')).toHaveClass('floating-editor-panel');
    expect(screen.getByTestId('pro-node-inspector')).toHaveClass('floating-editor-panel');
    expect(screen.queryByTestId('strategy-editor-subnav')).not.toBeInTheDocument();
  });

  test('switches to the Basic editor from the floating mode controls', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    render(<ProEditor goBack={() => {}} openEditor={openEditor} />);

    await user.click(screen.getByRole('button', { name: 'Basic 편집기' }));
    expect(openEditor).toHaveBeenCalledWith('basic');
  });
});

describe('Pro editor infinite canvas', () => {
  test('pans the graph canvas by dragging empty space', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 170, pointerId: 1 });

    expect(screen.getByTestId('pro-graph-world')).toHaveStyle('transform: translate3d(120px, 80px, 0) scale(1)');
    const canvas = screen.getByRole('region', { name: 'Pro 전략 캔버스' });
    expect(canvas.style.getPropertyValue('--canvas-pan-x')).toBe('120px');
    expect(canvas.style.getPropertyValue('--canvas-pan-y')).toBe('80px');
  });

  test('pans with pointer movement while the space bar is held', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const world = screen.getByTestId('pro-graph-world');
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(surface).toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 155, clientY: 125, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    expect(surface).not.toHaveClass('is-space-panning');
  });

  test('zooms with the mouse wheel around the cursor position', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const world = screen.getByTestId('pro-graph-world');

    fireEvent.wheel(surface, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(-40px, -30px, 0) scale(1.1)');
    expect(screen.getByRole('button', { name: '배율 초기화' })).toHaveTextContent('110%');

    fireEvent.wheel(surface, { deltaY: 100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('places nodes freely and keeps the canvas scale applied to the move', () => {
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    const node = screen.getByTestId('pro-node-node-basket');
    expect(node).toHaveStyle({ left: '24px', top: '176px' });

    fireEvent.pointerDown(screen.getByRole('button', { name: '직접 선택 바스켓 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 4, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 160, clientY: 140, pointerId: 4 });
    expect(node).toHaveClass('is-node-moving');
    fireEvent.pointerUp(surface, { clientX: 160, clientY: 140, pointerId: 4 });

    expect(node).toHaveStyle({ left: '84px', top: '216px' });
    expect(node).not.toHaveClass('is-node-moving');
  });
});

describe('Pro editor parallel connections', () => {
  test('starts with one output feeding two parallel branches', () => {
    render(<ProEditor goBack={() => {}} />);

    expect(graphTools().getByText(/노드 9 · 연결 9/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /가격·거래량 시세 계열 출력 연결부/ })).toHaveClass('is-linked');
    expect(screen.getByRole('button', { name: /지표 계산 A 시세 계열 입력 연결부/ })).toHaveClass('is-linked');
    expect(screen.getByRole('button', { name: /지표 계산 B 시세 계열 입력 연결부/ })).toHaveClass('is-linked');
  });

  test('connects two ports of the same type', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '분기 노드 추가' }));
    expect(graphTools().getByText(/노드 10 · 연결 9/)).toBeInTheDocument();

    const surface = screen.getByTestId('pro-graph-surface');
    const output = screen.getByRole('button', { name: /값 비교 A 거짓 신호 출력 연결부/ });
    const input = screen.getByRole('button', { name: /^분기 판단 신호 입력 연결부/ });

    fireEvent.pointerDown(output, { clientX: 500, clientY: 200, pointerId: 7, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 540, clientY: 240, pointerId: 7 });
    expect(input).toHaveClass('is-compatible');
    fireEvent.pointerUp(input, { clientX: 540, clientY: 240, pointerId: 7 });

    expect(graphTools().getByText(/노드 10 · 연결 10/)).toBeInTheDocument();
    expect(input).toHaveClass('is-linked');
  });

  test('refuses a type mismatch with a problem, impact and resolution message', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '분기 노드 추가' }));
    const surface = screen.getByTestId('pro-graph-surface');
    const output = screen.getByRole('button', { name: /직접 선택 바스켓 종목 집합 출력 연결부/ });
    const input = screen.getByRole('button', { name: /^분기 판단 신호 입력 연결부/ });

    fireEvent.pointerDown(output, { clientX: 100, clientY: 200, pointerId: 8, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 240, pointerId: 8 });
    expect(input).not.toHaveClass('is-compatible');
    fireEvent.pointerUp(input, { clientX: 300, clientY: 240, pointerId: 8 });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('문제 ·');
    expect(alert).toHaveTextContent('영향 ·');
    expect(alert).toHaveTextContent('해결 ·');
    expect(graphTools().getByText(/노드 10 · 연결 9/)).toBeInTheDocument();
  });
});

describe('Pro editor node picker', () => {
  test('opens a categorized compatible-node picker where a connection is released', () => {
    render(<ProEditor goBack={() => {}} />);

    fireEvent.pointerUp(screen.getByTestId('true-output'), { clientX: 438, clientY: 276 });
    const picker = screen.getByRole('dialog', { name: '호환 노드 선택' });
    expect(picker).toHaveStyle({ left: '438px', top: '276px' });
    expect(within(picker).getByText('조건 · 비교')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: '포지션 확인' })).toBeEnabled();
  });

  test('adds the chosen node and connects it to the released output', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    fireEvent.pointerUp(screen.getByTestId('true-output'), { clientX: 438, clientY: 276 });
    await user.click(screen.getByRole('button', { name: '포지션 확인' }));

    expect(screen.queryByRole('dialog', { name: '호환 노드 선택' })).not.toBeInTheDocument();
    expect(graphTools().getByText(/노드 10 · 연결 10/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /포지션 확인 판단 신호 입력 연결부/ })).toHaveClass('is-linked');
  });
});

describe('Pro editor deletion and validation', () => {
  test('deletes a node on the trash zone and restores it with undo', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    const surface = screen.getByTestId('pro-graph-surface');
    expect(screen.queryByTestId('pro-trash-zone')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: '주문 처리기 노드 자유 이동' }), { clientX: 100, clientY: 100, pointerId: 9, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 120, clientY: 120, pointerId: 9 });
    expect(screen.getByTestId('pro-trash-zone')).toBeInTheDocument();
    fireEvent.pointerUp(surface, { clientX: 0, clientY: 0, pointerId: 9 });

    expect(screen.queryByTestId('pro-node-node-processor')).not.toBeInTheDocument();
    expect(graphTools().getByText(/노드 8 · 연결 8/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getByTestId('pro-node-node-processor')).toBeInTheDocument();
    expect(graphTools().getByText(/노드 9 · 연결 9/)).toBeInTheDocument();
  });

  test('reports the first structural problem as problem, impact and resolution', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '검증' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('문제 ·');
    expect(alert).toHaveTextContent('영향 ·');
    expect(alert).toHaveTextContent('해결 ·');
  });

  test('does not present the demo editor as a real save', async () => {
    const user = userEvent.setup();
    render(<ProEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 저장하지 않습니다');
  });
});

describe('Pro editor localization', () => {
  test('translates the node library into the English locale', () => {
    window.localStorage.setItem('i2s-language', 'en');
    render(<LanguageProvider><ProEditor goBack={() => {}} openEditor={() => {}} /></LanguageProvider>);

    expect(screen.getByRole('toolbar', { name: 'Pro editing actions' })).toBeInTheDocument();
    expect(screen.getByText('Market data')).toBeInTheDocument();
    expect(screen.getByText('Condition · signal')).toBeInTheDocument();
    window.localStorage.clear();
  });
});
