import { getSessionAccessToken } from './sessionAccessToken';

export type RoomOrganizerType = 'USER' | 'PLATFORM';
export type RoomAccessType = 'PUBLIC' | 'SECRET';
export type RoomStatus = 'DRAFT' | 'RECRUITING' | 'EVALUATING' | 'ENDED' | 'CANCELLED' | 'INVALIDATED';
export type PostEvaluationAction = 'CONTINUE_PRIVATE' | 'STOP_AFTER_EVALUATION';

export interface PublicRoom {
  id: string; name: string; organizerType: RoomOrganizerType; createdAt: string;
  recruitmentOpensAt: string; participationClosesAt: string;
  botParticipationLimit: number; perAccountBotLimit: number;
}
export interface PublicRoomPage { items: PublicRoom[]; nextCursor: string | null; hasMore: boolean }
export interface LeaderboardEvidence { botId: string; participationId: string; performanceSnapshotId: string | null; backtestAggregateResultId: string | null; eligibilityReasonCode: string | null }
export interface LeaderboardItem {
  rank: number | null; jointRank: boolean; anonymousAlias: string; score: number | null;
  eligibilityStatus: string; equityAmount: number | null; totalReturnPct: number | null;
  maxDrawdownPct: number | null; sharpeRatio: number | null; viewerEvidence: LeaderboardEvidence | null;
}
export interface LeaderboardPage { snapshotId: string | null; snapshotStatus: string | null; cutoffAt: string | null; items: LeaderboardItem[]; nextCursor: string | null; hasMore: boolean }
export interface CreateRoomInput {
  name: string; accessType: RoomAccessType; scoringTemplateVersionId: string; scoringAdjustments: Record<string, number>;
  initialCashAmount: number; botParticipationLimit: number; perAccountBotLimit: number; stoppedBotSlotPolicy: string;
  minimumOperationSeconds: number; minimumFillCount: number; feePolicyId: string; buyingPowerBufferPolicyId: string;
  recruitmentOpensAt: string; participationOpensAt: string; evaluationStartsAt: string; participationClosesAt: string;
  evaluationEndsAt: string; finalizationDeadlineAt: string; timezoneName: string;
}
export interface JoinRoomInput {
  validationRunId: string; anonymousAlias: string; languageVersion: string; schemaVersion: string; catalogVersion: string;
  budgetCapBps: number; brokerRulesVersion: string; accountingRulesVersion: string; candidateConflictPolicy: Record<string, unknown>;
}
export interface Participation { id: string; roomId: string; botId: string; anonymousAlias: string; joinedAt: string }
export interface PostEvaluationChoice { roomId: string; participationId: string; action: PostEvaluationAction; recordedAt: string; lockedAt: string | null }
export interface ScoringComponent { metric: string; direction: string; coefficient: number }
export interface ScoringAdjustment { code: string; unit: string; minimum: number; maximum: number; scale: number }
export interface ScoringTemplateOption {
  id: string; templateCode: string; version: string; kind: string; calculationRulesVersion: string;
  components: ScoringComponent[]; adjustments: ScoringAdjustment[]; rulesHash: string;
}
export interface FeePolicyOption {
  id: string; policyCode: string; version: string; feeRateBps: number; calculationRulesVersion: string;
  rulesHash: string; effectiveFrom: string; effectiveTo: string | null; publishedAt: string;
}
export interface BuyingPowerBufferPolicyOption {
  id: string; policyCode: string; version: string; bufferBps: number; roundingRulesVersion: string;
  rulesHash: string; effectiveFrom: string; effectiveTo: string | null; publishedAt: string;
}
export interface RoomInputCatalog {
  scoringTemplates: ScoringTemplateOption[];
  feePolicies: FeePolicyOption[];
  buyingPowerBufferPolicies: BuyingPowerBufferPolicyOption[];
}
export interface CurrentStrategyValidation {
  validationRunId: string; strategyId: string; strategyName: string; requestedEditSequence: number;
  semanticHash: string; elementCatalogVersionId: string; completedAt: string;
}
export interface CurrentStrategyValidationPage { items: CurrentStrategyValidation[] }

export interface CompetitionRoomsClient {
  roomInputCatalog(signal?: AbortSignal): Promise<RoomInputCatalog>;
  currentStrategyValidations(signal?: AbortSignal): Promise<CurrentStrategyValidationPage>;
  searchRooms(options?: { q?: string; cursor?: string; limit?: number }, signal?: AbortSignal): Promise<PublicRoomPage>;
  createRoom(input: CreateRoomInput, signal?: AbortSignal): Promise<{ id: string; accessType: RoomAccessType; status: RoomStatus }>;
  joinRoom(roomId: string, input: JoinRoomInput, signal?: AbortSignal): Promise<Participation>;
  leaderboard(roomId: string, options?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<LeaderboardPage>;
  myBots(roomId: string, options?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<LeaderboardPage>;
  getPostEvaluationChoice(roomId: string, participationId: string, signal?: AbortSignal): Promise<PostEvaluationChoice>;
  setPostEvaluationChoice(roomId: string, participationId: string, action: PostEvaluationAction, signal?: AbortSignal): Promise<PostEvaluationChoice>;
}

export class CompetitionApiError extends Error {
  constructor(readonly status: number, readonly title: string, readonly detail: string, readonly code: string | null) {
    super(detail || title || `Competition request failed (${status})`); this.name = 'CompetitionApiError';
  }
  get unauthenticated() { return this.status === 401; }
  get forbidden() { return this.status === 403; }
  get conflict() { return this.status === 409; }
}

export function createCompetitionRoomsClient({ baseUrl = '', fetchImpl = fetch, getAccessToken = getSessionAccessToken }: { baseUrl?: string; fetchImpl?: typeof fetch; getAccessToken?: () => string | null } = {}): CompetitionRoomsClient {
  const root = baseUrl.replace(/\/$/, '');
  const request = async (path: string, signal?: AbortSignal, init: RequestInit = {}) => {
    const token = getAccessToken();
    const response = await fetchImpl(`${root}${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }, signal });
    if (!response.ok) throw await readError(response);
    return response.json() as Promise<unknown>;
  };
  const pagePath = (roomId: string, suffix: string, options: { cursor?: string; limit?: number } = {}) => {
    const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
    if (options.cursor) query.set('cursor', options.cursor);
    return `/api/v1/competition/rooms/${encodeURIComponent(roomId)}/${suffix}?${query}`;
  };
  return {
    async roomInputCatalog(signal) { return readRoomInputCatalog(await request('/api/v1/competition/room-input-catalog', signal)); },
    async currentStrategyValidations(signal) { return readCurrentStrategyValidations(await request('/api/v1/strategy-validations/current', signal)); },
    async searchRooms({ q = '', cursor, limit = 20 } = {}, signal) {
      const query = new URLSearchParams({ q, limit: String(limit) }); if (cursor) query.set('cursor', cursor);
      return readPublicPage(await request(`/api/v1/competition/rooms/public?${query}`, signal));
    },
    async createRoom(input, signal) { const value = object(await request('/api/v1/competition/rooms', signal, { method: 'POST', body: JSON.stringify(input) }), 'room creation'); return { id: text(value.id, 'room id'), accessType: enumValue(value.accessType, ['PUBLIC', 'SECRET'], 'access type'), status: enumValue(value.status, ['DRAFT','RECRUITING','EVALUATING','ENDED','CANCELLED','INVALIDATED'], 'room status') }; },
    async joinRoom(roomId, input, signal) { return readParticipation(await request(`/api/v1/competition/rooms/${encodeURIComponent(roomId)}/participations`, signal, { method: 'POST', body: JSON.stringify(input) })); },
    async leaderboard(roomId, options, signal) { return readLeaderboard(await request(pagePath(roomId, 'leaderboard', options), signal)); },
    async myBots(roomId, options, signal) { return readLeaderboard(await request(pagePath(roomId, 'leaderboard/my-bots', options), signal), true); },
    async getPostEvaluationChoice(roomId, participationId, signal) { return readChoice(await request(choicePath(roomId, participationId), signal)); },
    async setPostEvaluationChoice(roomId, participationId, action, signal) { return readChoice(await request(choicePath(roomId, participationId), signal, { method: 'PUT', body: JSON.stringify({ action }) })); },
  };
}

const choicePath = (roomId: string, participationId: string) => `/api/v1/competition/rooms/${encodeURIComponent(roomId)}/participations/${encodeURIComponent(participationId)}/post-evaluation-choice`;
async function readError(response: Response) { let body: Record<string, unknown> = {}; try { body = object(await response.json(), 'error'); } catch { /* empty/non-json response */ } return new CompetitionApiError(response.status, optionalText(body.title) ?? '', optionalText(body.detail) ?? '', optionalText(body.code)); }
function readPublicPage(value: unknown): PublicRoomPage { const page = object(value, 'room page'); return { items: array(page.items, 'room items').map((raw) => { const item = object(raw, 'room'); return { id: text(item.id, 'room id'), name: text(item.name, 'room name'), organizerType: enumValue(item.organizerType, ['USER','PLATFORM'], 'organizer type'), createdAt: instant(item.createdAt, 'createdAt'), recruitmentOpensAt: instant(item.recruitmentOpensAt, 'recruitmentOpensAt'), participationClosesAt: instant(item.participationClosesAt, 'participationClosesAt'), botParticipationLimit: positive(item.botParticipationLimit, 'botParticipationLimit'), perAccountBotLimit: positive(item.perAccountBotLimit, 'perAccountBotLimit') }; }), nextCursor: optionalText(page.nextCursor), hasMore: bool(page.hasMore, 'hasMore') }; }
function readLeaderboard(value: unknown, owned = false): LeaderboardPage { const page = object(value, 'leaderboard'); return { snapshotId: optionalText(page.snapshotId), snapshotStatus: optionalText(page.snapshotStatus), cutoffAt: optionalInstant(page.cutoffAt, 'cutoffAt'), items: array(page.items, 'leaderboard items').map((raw) => { const item = object(raw, 'leaderboard item'); const evidenceValue = owned ? item.evidence : item.viewerEvidence; return { rank: nullablePositive(item.rank, 'rank'), jointRank: bool(item.jointRank, 'jointRank'), anonymousAlias: text(item.anonymousAlias, 'anonymousAlias'), score: decimal(item.score, 'score'), eligibilityStatus: text(item.eligibilityStatus, 'eligibilityStatus'), equityAmount: decimal(item.equityAmount, 'equityAmount'), totalReturnPct: decimal(item.totalReturnPct, 'totalReturnPct'), maxDrawdownPct: decimal(item.maxDrawdownPct, 'maxDrawdownPct'), sharpeRatio: decimal(item.sharpeRatio, 'sharpeRatio'), viewerEvidence: evidenceValue === null ? null : readEvidence(evidenceValue) }; }), nextCursor: optionalText(page.nextCursor), hasMore: bool(page.hasMore, 'hasMore') }; }
function readEvidence(value: unknown): LeaderboardEvidence { const item = object(value, 'leaderboard evidence'); return { botId: text(item.botId, 'botId'), participationId: text(item.participationId, 'participationId'), performanceSnapshotId: optionalText(item.performanceSnapshotId), backtestAggregateResultId: optionalText(item.backtestAggregateResultId), eligibilityReasonCode: optionalText(item.eligibilityReasonCode) }; }
function readParticipation(value: unknown): Participation { const item = object(value, 'participation'); return { id: text(item.id, 'participation id'), roomId: text(item.roomId, 'room id'), botId: text(item.botId, 'bot id'), anonymousAlias: text(item.anonymousAlias, 'anonymousAlias'), joinedAt: instant(item.joinedAt, 'joinedAt') }; }
function readChoice(value: unknown): PostEvaluationChoice { const item = object(value, 'post-evaluation choice'); return { roomId: text(item.roomId, 'roomId'), participationId: text(item.participationId, 'participationId'), action: enumValue(item.action, ['CONTINUE_PRIVATE','STOP_AFTER_EVALUATION'], 'post-evaluation action'), recordedAt: instant(item.recordedAt, 'recordedAt'), lockedAt: optionalInstant(item.lockedAt, 'lockedAt') }; }
function readRoomInputCatalog(value: unknown): RoomInputCatalog {
  const catalog = object(value, 'room input catalog');
  return {
    scoringTemplates: array(catalog.scoringTemplates, 'scoring templates').map((raw) => {
      const item = object(raw, 'scoring template');
      return {
        id: text(item.id, 'scoring template id'), templateCode: text(item.templateCode, 'templateCode'),
        version: text(item.version, 'template version'), kind: text(item.kind, 'template kind'),
        calculationRulesVersion: text(item.calculationRulesVersion, 'calculationRulesVersion'),
        components: array(item.components, 'scoring components').map((componentRaw) => {
          const component = object(componentRaw, 'scoring component');
          return { metric: text(component.metric, 'metric'), direction: text(component.direction, 'direction'), coefficient: requiredDecimal(component.coefficient, 'coefficient') };
        }),
        adjustments: array(item.adjustments, 'scoring adjustments').map((adjustmentRaw) => {
          const adjustment = object(adjustmentRaw, 'scoring adjustment');
          return { code: text(adjustment.code, 'adjustment code'), unit: text(adjustment.unit, 'adjustment unit'), minimum: requiredDecimal(adjustment.minimum, 'minimum'), maximum: requiredDecimal(adjustment.maximum, 'maximum'), scale: nonNegative(adjustment.scale, 'scale') };
        }),
        rulesHash: text(item.rulesHash, 'rulesHash'),
      };
    }),
    feePolicies: array(catalog.feePolicies, 'fee policies').map((raw) => {
      const item = object(raw, 'fee policy');
      return { id: text(item.id, 'fee policy id'), policyCode: text(item.policyCode, 'policyCode'), version: text(item.version, 'fee version'), feeRateBps: nonNegative(item.feeRateBps, 'feeRateBps'), calculationRulesVersion: text(item.calculationRulesVersion, 'calculationRulesVersion'), rulesHash: text(item.rulesHash, 'rulesHash'), effectiveFrom: instant(item.effectiveFrom, 'effectiveFrom'), effectiveTo: optionalInstant(item.effectiveTo, 'effectiveTo'), publishedAt: instant(item.publishedAt, 'publishedAt') };
    }),
    buyingPowerBufferPolicies: array(catalog.buyingPowerBufferPolicies, 'buying power buffer policies').map((raw) => {
      const item = object(raw, 'buying power buffer policy');
      return { id: text(item.id, 'buffer policy id'), policyCode: text(item.policyCode, 'policyCode'), version: text(item.version, 'buffer version'), bufferBps: nonNegative(item.bufferBps, 'bufferBps'), roundingRulesVersion: text(item.roundingRulesVersion, 'roundingRulesVersion'), rulesHash: text(item.rulesHash, 'rulesHash'), effectiveFrom: instant(item.effectiveFrom, 'effectiveFrom'), effectiveTo: optionalInstant(item.effectiveTo, 'effectiveTo'), publishedAt: instant(item.publishedAt, 'publishedAt') };
    }),
  };
}
function readCurrentStrategyValidations(value: unknown): CurrentStrategyValidationPage {
  const page = object(value, 'current strategy validations');
  return { items: array(page.items, 'validation items').map((raw) => {
    const item = object(raw, 'validation item');
    return { validationRunId: text(item.validationRunId, 'validationRunId'), strategyId: text(item.strategyId, 'strategyId'), strategyName: text(item.strategyName, 'strategyName'), requestedEditSequence: nonNegative(item.requestedEditSequence, 'requestedEditSequence'), semanticHash: text(item.semanticHash, 'semanticHash'), elementCatalogVersionId: text(item.elementCatalogVersionId, 'elementCatalogVersionId'), completedAt: instant(item.completedAt, 'completedAt') };
  }) };
}
function object(value: unknown, label: string): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${label}`); return value as Record<string, unknown>; }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`Invalid ${label}`); return value; }
function text(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`); return value; }
function optionalText(value: unknown): string | null { return value == null ? null : text(value, 'optional text'); }
function bool(value: unknown, label: string): boolean { if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`); return value; }
function positive(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`Invalid ${label}`); return Number(value); }
function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`Invalid ${label}`); return Number(value); }
function nullablePositive(value: unknown, label: string): number | null { return value == null ? null : positive(value, label); }
function decimal(value: unknown, label: string): number | null { if (value == null) return null; const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`); return parsed; }
function requiredDecimal(value: unknown, label: string): number { const result = decimal(value, label); if (result === null) throw new Error(`Invalid ${label}`); return result; }
function instant(value: unknown, label: string): string { const result = text(value, label); if (Number.isNaN(Date.parse(result))) throw new Error(`Invalid ${label}`); return result; }
function optionalInstant(value: unknown, label: string): string | null { return value == null ? null : instant(value, label); }
function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T { const result = text(value, label); if (!values.includes(result as T)) throw new Error(`Invalid ${label}`); return result as T; }

export const defaultCompetitionRoomsClient = createCompetitionRoomsClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' });
