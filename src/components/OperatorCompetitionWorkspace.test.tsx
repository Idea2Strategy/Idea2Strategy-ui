import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CompetitionRoomsClient } from '../api/competitionRooms';
import { OperatorCompetitionWorkspace } from './OperatorCompetitionWorkspace';

const now = '2026-08-07T00:00:00Z';
const roomView = {
  room: { roomId: 'room-1', name: 'Official Cup', competitionType: 'LIVE_PAPER', accessType: 'PUBLIC' as const, status: 'RECRUITING' as const, createdAt: now, evaluationStartsAt: now, evaluationEndsAt: now, endedAt: null, invalidatedAt: null, invalidationReasonCode: null, scoringTemplateVersionId: 'score-1', rulesHash: 'rules-hash' },
  roomEvents: [{ sequence: 1, eventType: 'ROOM_CREATED', resultingStatus: 'RECRUITING', reasonCode: null, occurredAt: now }],
  participationEvents: [], finalResult: null,
};

const makeClient = (overrides: Partial<CompetitionRoomsClient> = {}): CompetitionRoomsClient => ({
  roomInputCatalog: vi.fn().mockResolvedValue({ scoringTemplates: [{ id: 'score-1', templateCode: 'RETURN', version: '2', kind: 'WEIGHTED', calculationRulesVersion: 'calc-2', components: [], adjustments: [], rulesHash: 'score-hash' }], feePolicies: [{ id: 'fee-1', policyCode: 'DEFAULT', version: '2', feeRateBps: 2, calculationRulesVersion: 'fee-calc-2', rulesHash: 'fee-hash', effectiveFrom: now, effectiveTo: null, publishedAt: now }], buyingPowerBufferPolicies: [{ id: 'buffer-1', policyCode: 'DEFAULT', version: '2', bufferBps: 5, roundingRulesVersion: 'round-2', rulesHash: 'buffer-hash', effectiveFrom: now, effectiveTo: null, publishedAt: now }] }),
  strategyReleaseInputs: vi.fn().mockResolvedValue({ executionPolicies: [{ version: 'execution-2', brokerRulesVersion: 'broker-2', accountingRulesVersion: 'accounting-2', precisionRulesVersion: 'precision-2', feePolicyId: 'fee-1', feeRateBps: 2, buyingPowerBufferPolicyId: 'buffer-1', buyingPowerBufferBps: 5 }], datasets: [], observedAt: now }),
  operatorRoom: vi.fn().mockResolvedValue(roomView), createOfficialRoom: vi.fn().mockResolvedValue({ id: 'room-2', organizerType: 'PLATFORM', accessType: 'PUBLIC', status: 'RECRUITING', lockedAt: now }),
  cancelOperatorRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', participationsTerminated: 3, occurredAt: now }), invalidateOperatorRoom: vi.fn(),
  ownedRooms: vi.fn(), currentStrategyValidations: vi.fn(), searchRooms: vi.fn(), createRoom: vi.fn(), joinRoom: vi.fn(), leaderboard: vi.fn(), myBots: vi.fn(), getPostEvaluationChoice: vi.fn(), setPostEvaluationChoice: vi.fn(), updateRoom: vi.fn(), issueInvitation: vi.fn(), revokeInvitation: vi.fn(), consumeInvitation: vi.fn(), withdrawParticipation: vi.fn(), cancelRoom: vi.fn(), expelParticipation: vi.fn(),
  ...overrides,
});

describe('OperatorCompetitionWorkspace', () => {
  it('shows immutable audit evidence and requires typed confirmation to cancel', async () => {
    const api = makeClient();
    render(<OperatorCompetitionWorkspace client={api} />);
    await userEvent.type(screen.getByLabelText('Operator competition room ID'), 'room-1');
    await userEvent.click(screen.getByRole('button', { name: '조회' }));
    expect(await screen.findByText(/Official Cup/)).toBeInTheDocument();
    expect(screen.getByText(/ROOM_CREATED/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '대회 취소' }));
    expect(screen.getByRole('button', { name: '확인 후 실행' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type CANCEL to confirm'), 'CANCEL');
    await userEvent.click(screen.getByRole('button', { name: '확인 후 실행' }));
    await waitFor(() => expect(api.cancelOperatorRoom).toHaveBeenCalledWith('room-1', 'OPERATOR_REQUEST'));
  });

  it('creates an official room with server catalog identifiers and precision policy', async () => {
    const api = makeClient();
    render(<OperatorCompetitionWorkspace client={api} />);
    await screen.findByRole('button', { name: '공식 대회 생성' });
    await userEvent.type(screen.getByLabelText('Official room name'), 'Platform Cup');
    await userEvent.click(screen.getByRole('button', { name: '공식 대회 생성' }));
    await waitFor(() => expect(api.createOfficialRoom).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Platform Cup', scoringTemplateVersionId: 'score-1', feePolicyId: 'fee-1', buyingPowerBufferPolicyId: 'buffer-1', precisionRulesVersion: 'precision-2', eligibilityCriteria: { minimumAccountAgeDays: 0 }, marketScope: { market: 'US' },
    })));
    expect(await screen.findByText('공식 대회 room-2가 생성되었습니다.')).toBeInTheDocument();
  });
});
