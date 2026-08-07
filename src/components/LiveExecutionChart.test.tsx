import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LiveExecutionChart } from './LiveExecutionChart';

describe('LiveExecutionChart API market source', () => {
  test('offers one, five, and fifteen minute display-only chart periods', async () => {
    const user = userEvent.setup();
    const onTimeframeChange = vi.fn();
    render(<LiveExecutionChart
      botName="Atlas 07"
      executions={[]}
      marketBars={[]}
      symbols={['AAPL']}
      symbol="AAPL"
      onSymbolChange={vi.fn()}
      onTimeframeChange={onTimeframeChange}
    />);

    await user.click(screen.getByRole('button', { name: '1분' }));
    await user.click(screen.getByRole('button', { name: '5분' }));
    await user.click(screen.getByRole('button', { name: '15분' }));

    expect(onTimeframeChange.mock.calls.map(([timeframe]) => timeframe)).toEqual(['1m', '5m', '15m']);
  });

  test('labels connected OHLCV bars as API data instead of a simulation', () => {
    render(<LiveExecutionChart
      botName="Atlas 07"
      executions={[{
        time: '08.01 12:01 UTC',
        timestamp: '2026-08-01T12:01:00Z',
        side: '매수',
        symbol: 'AAPL',
        quantity: '2주',
        price: '$100',
      }]}
      marketBars={[
        { time: '2026-08-01T12:00:00Z', open: 99, high: 101, low: 98, close: 100, volume: 1200 },
        { time: '2026-08-01T12:01:00Z', open: 100, high: 102, low: 99, close: 101, volume: 1600 },
      ]}
      symbols={['AAPL']}
      symbol="AAPL"
      onSymbolChange={vi.fn()}
    />);

    expect(screen.getByText('실시간 API')).toBeInTheDocument();
    expect(screen.queryByText('실시간 데모')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-candlestick-canvas')).toHaveAttribute('data-market-source', 'api');
  });

  test('does not fabricate candles while connected market bars are absent', () => {
    render(<LiveExecutionChart
      botName="Atlas 07"
      executions={[]}
      marketBars={[]}
      symbols={['AAPL']}
      symbol="AAPL"
      onSymbolChange={vi.fn()}
    />);

    expect(screen.getByText('시세 데이터 대기')).toBeInTheDocument();
    expect(screen.queryByText('실시간 데모')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-candlestick-canvas')).toHaveAttribute('data-market-source', 'api-pending');
  });
});
