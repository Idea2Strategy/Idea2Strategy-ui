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

  test('only exposes realtime controls after a websocket price update', () => {
    const props = {
      botName: 'Atlas 07',
      executions: [{
        time: '08.01 12:01 UTC',
        timestamp: '2026-08-01T12:01:00Z',
        side: '매수' as const,
        symbol: 'AAPL',
        quantity: '2주',
        price: '$100',
      }],
      marketBars: [
        { time: '2026-08-01T12:00:00Z', open: 99, high: 101, low: 98, close: 100, volume: 1200 },
        { time: '2026-08-01T12:01:00Z', open: 100, high: 102, low: 99, close: 101, volume: 1600 },
      ],
      symbols: ['AAPL'],
      symbol: 'AAPL',
      onSymbolChange: vi.fn(),
    };
    const { rerender } = render(<LiveExecutionChart
      {...props}
    />);

    expect(screen.getByText('시장 데이터')).toBeInTheDocument();
    expect(screen.queryByText('실시간 API')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '실시간으로 이동' })).not.toBeInTheDocument();
    expect(screen.getByTestId('live-candlestick-canvas')).toHaveAttribute('data-market-source', 'api');

    rerender(<LiveExecutionChart
      {...props}
      livePrice={{
        schemaVersion: 1,
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        price: 101.25,
        lastTradeSize: 2,
        intervalOpen: 101,
        intervalHigh: 101.5,
        intervalLow: 100.75,
        intervalClose: 101.25,
        intervalVolume: 2,
        intervalTradeCount: 1,
        providerTradeId: 7,
        occurredAt: '2026-08-01T12:02:00Z',
        publishedAt: '2026-08-01T12:02:00Z',
      }}
    />);

    expect(screen.getByText('실시간 API')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '실시간으로 이동' })).toBeInTheDocument();
  });

  test('explains that empty minute charts are only available during regular market hours', () => {
    render(<LiveExecutionChart
      botName="Atlas 07"
      executions={[]}
      marketBars={[]}
      timeframe="1m"
      symbols={['AAPL']}
      symbol="AAPL"
      onSymbolChange={vi.fn()}
    />);

    expect(screen.getByText('정규장에만 제공되는 데이터입니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '실시간으로 이동' })).not.toBeInTheDocument();
    expect(screen.getByTestId('live-candlestick-canvas')).toHaveAttribute('data-market-source', 'api-pending');
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
    expect(screen.queryByText('데모 차트')).not.toBeInTheDocument();
    expect(screen.queryByText('정규장에만 제공되는 데이터입니다')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-candlestick-canvas')).toHaveAttribute('data-market-source', 'api-pending');
  });
});
