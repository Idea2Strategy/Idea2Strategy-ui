import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { BacktestView } from './views/OperationsViews.jsx';

describe('BacktestView', () => {
  test('compares the selected trading bot with the S&P 500 benchmark', async () => {
    const user = userEvent.setup();
    render(<BacktestView />);

    const atlasButton = screen.getByRole('button', { name: /Atlas 07 백테스트 보기/ });
    const pairLabButton = screen.getByRole('button', { name: /Pair Lab 백테스트 보기/ });

    expect(atlasButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Atlas 07와 S&P 500 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Atlas 07');
    expect(screen.getByTestId('backtest-benchmark-series')).toHaveAttribute('data-benchmark', 'S&P 500');

    await user.click(pairLabButton);

    expect(pairLabButton).toHaveAttribute('aria-pressed', 'true');
    expect(atlasButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('img', { name: 'Pair Lab와 S&P 500 누적 수익률 비교' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-bot-series')).toHaveAttribute('data-bot', 'Pair Lab');
    expect(screen.getByText('S&P 500 대비')).toBeInTheDocument();
    expect(screen.getAllByText('-13.4%').length).toBeGreaterThan(0);
  });

  test('places a vertical bot selector beside the chart and reveals values at the hovered point', () => {
    render(<BacktestView />);

    const comparisonWorkspace = screen.getByTestId('backtest-comparison-workspace');
    expect(within(comparisonWorkspace).getByRole('list', { name: '백테스트 봇 목록' })).toBeInTheDocument();
    expect(within(comparisonWorkspace).getByRole('heading', { name: '봇 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '조건 미충족 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 봇 보기' })).not.toBeInTheDocument();

    const chart = screen.getByTestId('backtest-comparison-chart');
    chart.getBoundingClientRect = () => ({ left: 0, width: 820 });
    fireEvent.mouseMove(chart, { clientX: 410 });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Atlas 07');
    expect(tooltip).toHaveTextContent('S&P 500');
    expect(tooltip).toHaveTextContent('2025 Q1');

    fireEvent.mouseLeave(chart);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
