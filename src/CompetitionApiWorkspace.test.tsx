import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CompetitionApiWorkspace } from './components/CompetitionApiWorkspace';
import { CompetitionApiError } from './api/competitionRooms';
import type { CompetitionRoomsClient, PublicRoom, RoomInputCatalog } from './api/competitionRooms';
import { LanguageProvider } from './lib/i18n';
import { RoomsView } from './views/OperationsViews';

const room: PublicRoom = {
  id: '11111111-1111-4111-8111-111111111111', name: '실전 API 대회', organizerType: 'USER',
  createdAt: '2026-08-01T00:00:00Z', recruitmentOpensAt: '2026-08-01T00:00:00Z',
  participationClosesAt: '2099-08-10T00:00:00Z', botParticipationLimit: 25, perAccountBotLimit: 2,
};

const roomInputCatalog: RoomInputCatalog = {
  scoringTemplates: [{ id: '22222222-2222-4222-8222-222222222222', templateCode: 'TOTAL_RETURN', version: '1.0.0', kind: 'SINGLE', calculationRulesVersion: '1.0.0', components: [], adjustments: [], rulesHash: 'a'.repeat(64) }],
  feePolicies: [{ id: '33333333-3333-4333-8333-333333333333', policyCode: 'OFFICIAL', version: '1.0.0', feeRateBps: 20, calculationRulesVersion: '1.0.0', rulesHash: 'b'.repeat(64), effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null, publishedAt: '2026-08-01T00:00:00Z' }],
  buyingPowerBufferPolicies: [{ id: '44444444-4444-4444-8444-444444444444', policyCode: 'DEFAULT', version: '1.0.0', bufferBps: 100, roundingRulesVersion: '1.0.0', rulesHash: 'c'.repeat(64), effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null, publishedAt: '2026-08-01T00:00:00Z' }],
};
const validation = { validationRunId: '55555555-5555-4555-8555-555555555555', strategyId: 'strategy-1', strategyName: 'Momentum', requestedEditSequence: 7, semanticHash: 'd'.repeat(64), elementCatalogVersionId: 'catalog-1', languageVersion: 'basic/v1', schemaVersion: 'schema/v1', catalogVersion: 'catalog/v1', completedAt: '2026-08-04T09:59:00Z' };

function client(overrides: Partial<CompetitionRoomsClient> = {}): CompetitionRoomsClient {
  return {
    roomInputCatalog: vi.fn(async () => roomInputCatalog),
    strategyReleaseInputs: vi.fn(async () => ({
      executionPolicies: [{ version: 'policy-1', brokerRulesVersion: 'broker-1', accountingRulesVersion: 'accounting-1', precisionRulesVersion: 'precision-1', feePolicyId: roomInputCatalog.feePolicies[0].id, feeRateBps: 20, buyingPowerBufferPolicyId: roomInputCatalog.buyingPowerBufferPolicies[0].id, buyingPowerBufferBps: 100 }],
      datasets: [], observedAt: '2026-08-04T10:00:00Z',
    })),
    ownedRooms: vi.fn(async () => []),
    currentStrategyValidations: vi.fn(async () => ({ items: [validation] })),
    searchRooms: vi.fn(async () => ({ items: [room], nextCursor: null, hasMore: false })),
    createRoom: vi.fn(async () => ({ id: room.id, accessType: 'PUBLIC' as const, status: 'RECRUITING' as const })),
    joinRoom: vi.fn(async () => ({ id: 'p1', roomId: room.id, botId: 'b1', anonymousAlias: 'Bot Mine', joinedAt: room.createdAt })),
    leaderboard: vi.fn(async () => ({ snapshotId: 's1', snapshotStatus: 'FINAL', cutoffAt: room.participationClosesAt, nextCursor: null, hasMore: false, items: [
      { rank: 1, jointRank: false, anonymousAlias: 'Bot 3F9A', score: 91.2, eligibilityStatus: 'ELIGIBLE', equityAmount: 11000, totalReturnPct: 10, maxDrawdownPct: -2, sharpeRatio: 1.8, viewerEvidence: null },
    ] })),
    myBots: vi.fn(async () => ({ snapshotId: 's1', snapshotStatus: 'FINAL', cutoffAt: room.participationClosesAt, nextCursor: null, hasMore: false, items: [
      { rank: 3, jointRank: false, anonymousAlias: 'Bot Mine', score: 82, eligibilityStatus: 'ELIGIBLE', equityAmount: 10500, totalReturnPct: 5, maxDrawdownPct: -3, sharpeRatio: 1.2, viewerEvidence: { botId: 'b1', participationId: 'p1', performanceSnapshotId: 'ps1', backtestAggregateResultId: null, eligibilityReasonCode: null } },
    ] })),
    getPostEvaluationChoice: vi.fn(async () => ({ roomId: room.id, participationId: 'p1', action: 'STOP_AFTER_EVALUATION' as const, recordedAt: room.createdAt, lockedAt: null })),
    setPostEvaluationChoice: vi.fn(async (_room, _participation, action) => ({ roomId: room.id, participationId: 'p1', action, recordedAt: room.createdAt, lockedAt: null })),
    updateRoom: vi.fn(async () => undefined),
    issueInvitation: vi.fn(async () => ({ id: 'invite-1', roomId: room.id, credentialType: 'LINK' as const, secret: 'secret-1', expiresAt: '2026-08-08T00:00:00Z' })),
    revokeInvitation: vi.fn(async () => undefined),
    consumeInvitation: vi.fn(async () => ({ invitationId: 'invite-1', roomId: room.id })),
    withdrawParticipation: vi.fn(async () => ({ roomId: room.id, participationsTerminated: 1, occurredAt: room.createdAt })),
    cancelRoom: vi.fn(async () => ({ roomId: room.id, participationsTerminated: 1, occurredAt: room.createdAt })),
    expelParticipation: vi.fn(async () => ({ roomId: room.id, participationsTerminated: 1, occurredAt: room.createdAt })),
    operatorRoom: vi.fn(async () => { throw new CompetitionApiError(403, 'Forbidden', '', 'OPERATOR_PERMISSION_REQUIRED'); }),
    createOfficialRoom: vi.fn(async () => ({ id: room.id, organizerType: 'PLATFORM' as const, accessType: 'PUBLIC' as const, status: 'RECRUITING' as const, lockedAt: room.createdAt })),
    cancelOperatorRoom: vi.fn(async () => ({ roomId: room.id, participationsTerminated: 1, occurredAt: room.createdAt })),
    invalidateOperatorRoom: vi.fn(async () => ({ roomId: room.id, participationsTerminated: 1, occurredAt: room.createdAt })),
    ...overrides,
  };
}

describe('real competition room workspace', () => {
  test('uses a product-styled search control without a manual refresh action', async () => {
    const user = userEvent.setup();
    render(<CompetitionApiWorkspace client={client()} />);
    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });

    const search = screen.getByRole('searchbox', { name: '대회 검색' });
    expect(search.closest('label')).toHaveClass('competition-api-search');
    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();

    await user.type(search, '실전');
    const clear = screen.getByRole('button', { name: '대회 검색어 지우기' });
    await user.click(clear);
    expect(search).toHaveValue('');
  });

  test('shows loading, schedule, anonymous ranking, owned comparison and post-end choice', async () => {
    const api = client();
    render(<CompetitionApiWorkspace client={api} />);
    expect(screen.getByText('대회 목록을 불러오는 중입니다.')).toBeInTheDocument();

    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });
    await userEvent.click(screen.getByRole('listitem', { name: '실전 API 대회 열기' }));
    const detail = await screen.findByRole('region', { name: '실전 API 대회 상세' });
    expect(within(detail).getByText('2026. 8. 1.')).toBeInTheDocument();
    expect(within(detail).getByText('Bot 3F9A')).toBeInTheDocument();
    expect(within(detail).getAllByText('Bot Mine').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('내 봇').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('모의 성과 · 실제 투자 결과를 보장하지 않습니다.')).toHaveLength(2);

    await userEvent.click(within(detail).getByRole('radio', { name: '비공개 봇으로 계속 운용' }));
    await userEvent.click(within(detail).getByRole('button', { name: '종료 후 선택 저장' }));
    await waitFor(() => expect(api.setPostEvaluationChoice).toHaveBeenCalledWith(room.id, 'p1', 'CONTINUE_PRIVATE'));
    expect(within(detail).getByRole('status')).toHaveTextContent('저장했습니다');
  });

  test('renders empty, error, retry and permission states', async () => {
    const searchRooms = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
    render(<CompetitionApiWorkspace client={client({ searchRooms })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('대회 목록을 불러오지 못했습니다');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('참가 가능한 공개 대회가 없습니다.')).toBeInTheDocument();
  });

  test('submits room creation schedule and joins with a validation run', async () => {
    const api = client();
    render(<CompetitionApiWorkspace client={api} />);
    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });
    await userEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    let create = screen.getByRole('dialog', { name: '대회 만들기' });
    const createForm = create.querySelector('form');
    const createScrollArea = create.querySelector('.competition-create-form-scroll');
    expect(createForm).toHaveClass('competition-create-form');
    expect(createScrollArea).toBeInTheDocument();
    expect(within(create).getByRole('group', { name: '기본 설정' })).toBeInTheDocument();
    expect(within(create).getByRole('group', { name: '대회 일정' })).toBeInTheDocument();
    expect(within(create).getByRole('group', { name: '운영 정책' })).toBeInTheDocument();
    expect(createScrollArea).toContainElement(within(create).getByRole('group', { name: '기본 설정' }));
    expect(createScrollArea).not.toContainElement(within(create).getByRole('button', { name: '대회 생성' }));
    await screen.findByRole('option', { name: /TOTAL_RETURN · 1.0.0/ }, { timeout: 5_000 });
    create = screen.getByRole('dialog', { name: '대회 만들기' });
    await userEvent.type(within(create).getByLabelText('대회 이름'), '새 대회');
    expect(within(create).queryByLabelText('채점 템플릿 버전 ID')).not.toBeInTheDocument();
    const closesAt = new Date((within(create).getByLabelText('참가 마감') as HTMLInputElement).value);
    const evaluationStartsAt = new Date((within(create).getByLabelText('평가 시작') as HTMLInputElement).value);
    expect(closesAt.getTime()).toBeLessThan(evaluationStartsAt.getTime());
    await userEvent.click(within(create).getByRole('button', { name: '대회 생성' }));
    await waitFor(() => expect(api.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      scoringTemplateVersionId: roomInputCatalog.scoringTemplates[0].id,
      feePolicyId: roomInputCatalog.feePolicies[0].id,
      buyingPowerBufferPolicyId: roomInputCatalog.buyingPowerBufferPolicies[0].id,
    })));

    await userEvent.click(screen.getByRole('listitem', { name: '실전 API 대회 열기' }));
    await userEvent.click(await screen.findByRole('button', { name: '이 대회 참가하기' }));
    await screen.findByRole('option', { name: /Momentum · 편집 7/ }, { timeout: 5_000 });
    const join = screen.getByRole('dialog', { name: '대회 참가' });
    expect(within(join).queryByLabelText('검증 실행 ID')).not.toBeInTheDocument();
    const budget = within(join).getByLabelText('봇 예산 비율');
    await userEvent.clear(budget);
    await userEvent.type(budget, '25.5');
    await userEvent.type(within(join).getByLabelText('익명 봇 별칭'), 'Bot 7ABC');
    await userEvent.click(within(join).getByRole('button', { name: '참가 확정' }));
    await waitFor(() => expect(api.joinRoom).toHaveBeenCalledWith(room.id, expect.objectContaining({ validationRunId: validation.validationRunId, anonymousAlias: 'Bot 7ABC', budgetCapBps: 2550 })));
  });

  test('keeps creation fail closed while catalog inputs load or are empty', async () => {
    let resolveCatalog!: (value: RoomInputCatalog) => void;
    const roomInputCatalogCall = vi.fn(() => new Promise<RoomInputCatalog>((resolve) => { resolveCatalog = resolve; }));
    render(<CompetitionApiWorkspace client={client({ roomInputCatalog: roomInputCatalogCall })} />);
    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });
    await userEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    let create = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(within(create).getByRole('status')).toHaveTextContent('대회 생성 입력을 불러오는 중입니다.');
    expect(within(create).getByRole('button', { name: '대회 생성' })).toBeDisabled();

    await act(async () => {
      resolveCatalog({ scoringTemplates: [], feePolicies: [], buyingPowerBufferPolicies: [] });
    });
    await screen.findByText('운영 정책 카탈로그가 준비되지 않아 대회를 만들 수 없습니다.');
    create = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(within(create).getByRole('button', { name: '대회 생성' })).toBeDisabled();
  });

  test('shows an unauthorized catalog error and never enables creation', async () => {
    render(<CompetitionApiWorkspace client={client({ roomInputCatalog: vi.fn().mockRejectedValue(new CompetitionApiError(401, 'Unauthorized', 'login required', 'AUTHENTICATION_REQUIRED')) })} />);
    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });
    await userEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    const create = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(await within(create).findByRole('alert')).toHaveTextContent('로그인 후 대회 생성 정책을 확인할 수 있습니다.');
    expect(within(create).getByRole('button', { name: '대회 생성' })).toBeDisabled();
  });

  test('recovers from a catalog load failure only after an explicit retry', async () => {
    const roomInputCatalogCall = vi.fn()
      .mockRejectedValueOnce(new Error('temporary catalog outage'))
      .mockResolvedValue(roomInputCatalog);
    render(<CompetitionApiWorkspace client={client({ roomInputCatalog: roomInputCatalogCall })} />);
    await screen.findByRole('listitem', { name: '실전 API 대회 열기' });
    await userEvent.click(screen.getByRole('button', { name: '대회 만들기' }));
    let create = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(await within(create).findByRole('alert')).toHaveTextContent('대회 생성 정책을 불러오지 못했습니다.');
    expect(within(create).getByRole('button', { name: '대회 생성' })).toBeDisabled();

    const attemptsBeforeRetry = roomInputCatalogCall.mock.calls.length;
    await userEvent.click(within(create).getByRole('button', { name: '정책 다시 불러오기' }));
    await screen.findByRole('option', { name: /TOTAL_RETURN · 1.0.0/ });
    create = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(within(create).getByRole('button', { name: '대회 생성' })).toBeEnabled();
    expect(roomInputCatalogCall.mock.calls.length).toBeGreaterThan(attemptsBeforeRetry);
  });

  test('keeps joining fail closed when there is no current owned validation', async () => {
    render(<CompetitionApiWorkspace client={client({ currentStrategyValidations: vi.fn(async () => ({ items: [] })) })} />);
    await userEvent.click(await screen.findByRole('listitem', { name: '실전 API 대회 열기' }));
    await userEvent.click(await screen.findByRole('button', { name: '이 대회 참가하기' }));
    const join = screen.getByRole('dialog', { name: '대회 참가' });
    expect(await within(join).findByText('현재 제출 가능한 검증 완료 전략이 없습니다.')).toBeInTheDocument();
    expect(within(join).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(join).getByRole('button', { name: '참가 확정' })).toBeDisabled();
  });

  test('translates the live create and join dialogs completely in English', async () => {
    window.localStorage.setItem('i2s-language', 'en');
    try {
      const api = client();
      const englishRoom = { ...room, name: 'Live API Competition' };
      api.searchRooms = vi.fn(async () => ({ items: [englishRoom], nextCursor: null, hasMore: false }));
      const first = render(<LanguageProvider><RoomsView client={api} /></LanguageProvider>);
      await screen.findByRole('listitem', { name: 'Live API Competition Open' });
      await userEvent.click(screen.getByRole('button', { name: 'Create competition' }));
      const create = screen.getByRole('dialog', { name: 'Create competition' });
      expect(create.textContent).not.toMatch(/[가-힣]/);
      first.unmount();

      render(<LanguageProvider><RoomsView client={api} /></LanguageProvider>);
      await userEvent.click(await screen.findByRole('listitem', { name: 'Live API Competition Open' }));
      const detail = await screen.findByRole('region', { name: 'Live API Competition details' });
      await within(detail).findByText('Bot 3F9A');
      expect(within(detail).getAllByText('Simulated performance · Actual investment results are not guaranteed.')).toHaveLength(2);
      expect(detail.textContent).not.toMatch(/[가-힣]/);
      await userEvent.click(await screen.findByRole('button', { name: 'Join this competition' }));
      const join = screen.getByRole('dialog', { name: 'Competition' });
      await within(join).findByRole('option', { name: /Momentum/ });
      expect(join.textContent).not.toMatch(/[가-힣]/);
    } finally {
      window.localStorage.clear();
    }
  });
});
