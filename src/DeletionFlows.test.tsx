import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { BotOperationsClient, BotOperationsView } from './api/botOperations';
import type { StrategyAuthoringClient, StrategyLibraryClient } from './api/strategies';
import { BotsView } from './views/BotsView';
import { StrategyHome } from './views/StrategyViews';

const strategyLibrary: StrategyLibraryClient = {
  list: vi.fn().mockResolvedValue({
    items: [{
      id: 'strategy-id', kind: 'draft', mode: 'BASIC', name: '삭제할 전략', description: null,
      status: 'DRAFT', validationStatus: 'VALID', backtestStatus: null, editable: true,
      updatedAt: '2026-08-09T00:00:00Z', version: null, blockCount: 1, symbols: ['AAPL'],
    }],
    nextCursor: null,
    hasMore: false,
  }),
};

const stoppedBot: BotOperationsView = {
  botId: 'bot-id',
  name: '정지된 봇',
  state: 'stopped',
  lifecycleChangedAt: '2026-08-09T00:00:00Z',
  executionBlockedAt: null,
  executionBlockReasonCode: null,
  lastEventSequence: 0,
  instruments: [],
};

describe('destructive resource flows', () => {
  test('confirms and removes an owned strategy from the library', async () => {
    const user = userEvent.setup();
    const deleteStrategy = vi.fn().mockResolvedValue(undefined);
    const authoringClient = { deleteStrategy } as unknown as StrategyAuthoringClient;

    render(<MemoryRouter><StrategyHome openEditor={() => {}} client={strategyLibrary} authoringClient={authoringClient} /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: '삭제할 전략 삭제' }));
    expect(screen.getByRole('dialog', { name: '전략 삭제 확인' })).toHaveTextContent('출시된 봇과 기록은 유지됩니다');
    await user.click(screen.getByRole('button', { name: '전략 삭제' }));

    await waitFor(() => expect(deleteStrategy).toHaveBeenCalledWith('strategy-id'));
    expect(screen.queryByTestId('strategy-row-삭제할 전략')).not.toBeInTheDocument();
  });

  test('offers deletion only for a stopped bot and removes it after confirmation', async () => {
    const user = userEvent.setup();
    const deleteBot = vi.fn().mockResolvedValue(undefined);
    const operationsClient: BotOperationsClient = {
      listOperations: vi.fn().mockResolvedValue([stoppedBot]),
      listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
      runBot: vi.fn(),
      stopBot: vi.fn(),
      deleteBot,
    };

    render(<MemoryRouter><BotsView operationsClient={operationsClient} tradingClient={null} marketDataClient={null} /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: '정지된 봇 삭제' }));
    expect(screen.getByRole('dialog', { name: '봇 삭제 확인' })).toHaveTextContent('운용 및 거래 기록은 유지됩니다');
    await user.click(screen.getByRole('button', { name: '봇 삭제' }));

    await waitFor(() => expect(deleteBot).toHaveBeenCalledWith('bot-id'));
    expect(screen.queryByRole('button', { name: '정지된 봇 상세 보기' })).not.toBeInTheDocument();
  });

  test('deletes the selected bot id when two bots have the same display name', async () => {
    const user = userEvent.setup();
    const deleteBot = vi.fn().mockResolvedValue(undefined);
    const operationsClient: BotOperationsClient = {
      listOperations: vi.fn().mockResolvedValue([
        { ...stoppedBot, botId: 'bot-id-1', name: '같은 이름' },
        { ...stoppedBot, botId: 'bot-id-2', name: '같은 이름' },
      ]),
      listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
      runBot: vi.fn(),
      stopBot: vi.fn(),
      deleteBot,
    };

    render(<MemoryRouter><BotsView operationsClient={operationsClient} tradingClient={null} marketDataClient={null} /></MemoryRouter>);

    const duplicateRows = await screen.findAllByRole('button', { name: '같은 이름 상세 보기' });
    await user.click(duplicateRows[1]);
    await user.click(screen.getByRole('button', { name: '같은 이름 삭제' }));
    await user.click(screen.getByRole('button', { name: '봇 삭제' }));

    await waitFor(() => expect(deleteBot).toHaveBeenCalledWith('bot-id-2'));
  });

  test('does not expose deletion while a bot is still running', async () => {
    const operationsClient: BotOperationsClient = {
      listOperations: vi.fn().mockResolvedValue([{ ...stoppedBot, name: '실행 중 봇', state: 'running' }]),
      listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
      runBot: vi.fn(),
      stopBot: vi.fn(),
      deleteBot: vi.fn(),
    };

    render(<MemoryRouter><BotsView operationsClient={operationsClient} tradingClient={null} marketDataClient={null} /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: '실행 중 봇 상세 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '실행 중 봇 삭제' })).not.toBeInTheDocument();
  });
});
