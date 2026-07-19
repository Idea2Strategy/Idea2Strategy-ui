import type {
  CompetitionMetricKey,
  CompetitionMetrics,
  Room,
  RoomOperation,
  RoomSubmission,
} from './types';

const roomsStorageKey = 'i2s-competition-rooms-v1';
const submissionsStorageKey = 'i2s-competition-submissions-v1';
const operationsStorageKey = 'i2s-competition-operations-v1';

export const metricLabels: Record<CompetitionMetricKey, string> = {
  cumulativeReturn: '누적 수익률',
  maxDrawdown: '최대 낙폭(MDD)',
  volatility: '변동성',
  sharpe: '샤프지수',
  winRate: '승률',
  tradeCount: '거래 횟수',
};

export const competitionMetricKeys = Object.keys(metricLabels) as CompetitionMetricKey[];

const roomDefaults: Record<number, Partial<Room>> = {
  1: {
    official: true,
    recruitmentStart: '2026-07-20',
    recruitmentEnd: '2026-07-31',
    competitionStart: '2026-08-01',
    competitionEnd: '2026-08-31',
    submissionLimit: 1,
    initialCapital: '가상자금 10,000,000원',
    universeRule: '참가자가 선택한 국내·해외 주식 중 데이터 제공 범위',
    benchmark: '방 운영자가 지정한 시장 지수',
    executionRule: '정규장 모의 체결, 제출 시점의 주문 정책 적용',
    costRule: '방에 고지된 수수료·슬리피지 공통 적용',
  },
  2: {
    recruitmentStart: '2026-07-01',
    recruitmentEnd: '2026-07-14',
    competitionStart: '2026-07-15',
    competitionEnd: '2026-08-15',
    submissionLimit: 1,
    initialCapital: '가상자금 5,000,000원',
    universeRule: '참가자가 선택한 주식 중 데이터 제공 범위',
    benchmark: '운영자가 지정한 비교 지수',
    executionRule: '정규장 모의 체결',
    costRule: '공통 수수료·슬리피지 적용',
  },
  3: {
    recruitmentStart: '2026-08-01',
    recruitmentEnd: '2026-08-09',
    competitionStart: '2026-08-10',
    competitionEnd: '2026-09-10',
    submissionLimit: 1,
    initialCapital: '가상자금 3,000,000원',
    universeRule: '참가자가 선택한 주식 중 데이터 제공 범위',
    benchmark: '운영자가 입력한 비교 지수',
    executionRule: '정규장 모의 체결',
    costRule: '공통 수수료·슬리피지 적용',
  },
};

const seedMetrics: CompetitionMetrics[] = [
  {
    cumulativeReturn: '+4.2%',
    maxDrawdown: '-6.8%',
    volatility: '12.4%',
    sharpe: '0.61',
    winRate: '55.6%',
    tradeCount: '18건',
  },
  {
    cumulativeReturn: '+2.8%',
    maxDrawdown: '-4.9%',
    volatility: '9.7%',
    sharpe: '0.48',
    winRate: '51.4%',
    tradeCount: '27건',
  },
  {
    cumulativeReturn: '-0.6%',
    maxDrawdown: '-8.1%',
    volatility: '14.2%',
    sharpe: '-0.09',
    winRate: '46.8%',
    tradeCount: '11건',
  },
  {
    cumulativeReturn: '+5.1%',
    maxDrawdown: '-9.4%',
    volatility: '16.8%',
    sharpe: '0.55',
    winRate: '58.2%',
    tradeCount: '33건',
  },
  {
    cumulativeReturn: '+1.7%',
    maxDrawdown: '-3.8%',
    volatility: '8.5%',
    sharpe: '0.39',
    winRate: '49.1%',
    tradeCount: '21건',
  },
  {
    cumulativeReturn: '+3.3%',
    maxDrawdown: '-7.2%',
    volatility: '13.1%',
    sharpe: '0.44',
    winRate: '52.7%',
    tradeCount: '16건',
  },
  {
    cumulativeReturn: '+0.9%',
    maxDrawdown: '-5.6%',
    volatility: '10.3%',
    sharpe: '0.18',
    winRate: '48.5%',
    tradeCount: '24건',
  },
];

function cloneRoom(room: Room): Room {
  return { ...roomDefaults[room.id], ...room, official: room.official ?? room.owner === 'I2S 공식' };
}

function readArray<T>(key: string): T[] {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, values: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    return;
  }
}

function seedSubmissions(): RoomSubmission[] {
  return [
    {
      id: 'seed-room-1-01',
      roomId: 1,
      participantName: '학습자 08',
      botName: '첫 전략 실험 봇',
      strategyVersion: 'v2',
      status: '제출 완료',
      submittedAt: '2026-07-18T04:21:00.000Z',
    },
    {
      id: 'seed-room-1-02',
      roomId: 1,
      participantName: '참가자 14',
      status: '제출 대기',
    },
    {
      id: 'seed-room-2-mine',
      roomId: 2,
      participantName: '나',
      botId: 2,
      botName: '학습용 라이브 모의 봇',
      strategyVersion: 'v1',
      status: '변경 잠금',
      submittedAt: '2026-07-14T07:35:00.000Z',
      isMine: true,
      metrics: seedMetrics[0],
    },
    ...seedMetrics.slice(1).map((metrics, index) => ({
      id: `seed-room-2-${index + 1}`,
      roomId: 2,
      participantName: `참가자 ${String(index + 3).padStart(2, '0')}`,
      botName: `비공개 봇 ${index + 1}`,
      strategyVersion: `v${(index % 3) + 1}`,
      status: '변경 잠금' as const,
      submittedAt: `2026-07-${String(12 + index).padStart(2, '0')}T08:00:00.000Z`,
      metrics,
    })),
    {
      id: 'seed-room-3-01',
      roomId: 3,
      participantName: '참가자 01',
      botName: '리스크 관찰 봇',
      strategyVersion: 'v1',
      status: '제출 완료',
      submittedAt: '2026-07-18T10:00:00.000Z',
    },
    {
      id: 'seed-room-3-02',
      roomId: 3,
      participantName: '참가자 02',
      status: '제출 대기',
    },
    {
      id: 'seed-room-3-03',
      roomId: 3,
      participantName: '참가자 03',
      status: '철회',
    },
  ];
}

function seedOperations(): RoomOperation[] {
  return [
    {
      id: 'seed-operation-3-01',
      roomId: 3,
      createdAt: '2026-07-18T09:10:00.000Z',
      actor: 'RM',
      title: '방 생성',
      detail: '모집·대회 일정과 공통 비교 기준을 등록했습니다.',
    },
    {
      id: 'seed-operation-3-02',
      roomId: 3,
      createdAt: '2026-07-18T09:15:00.000Z',
      actor: 'RM',
      title: '비공개 원칙 고정',
      detail: '참가자의 전략 구조, 종목, 주문 기록은 운영자에게도 공개되지 않습니다.',
    },
  ];
}

export function loadCompetitionRooms(initialRooms: Room[]): Room[] {
  const stored = readArray<Room>(roomsStorageKey);
  return (stored.length ? stored : initialRooms).map(cloneRoom);
}

export function saveCompetitionRooms(rooms: Room[]) {
  writeArray(roomsStorageKey, rooms);
}

export function loadRoomSubmissions(): RoomSubmission[] {
  const stored = readArray<RoomSubmission>(submissionsStorageKey);
  if (stored.length) return stored;
  const seeds = seedSubmissions();
  writeArray(submissionsStorageKey, seeds);
  return seeds;
}

export function saveRoomSubmissions(submissions: RoomSubmission[]) {
  writeArray(submissionsStorageKey, submissions);
}

export function loadRoomOperations(): RoomOperation[] {
  const stored = readArray<RoomOperation>(operationsStorageKey);
  if (stored.length) return stored;
  const seeds = seedOperations();
  writeArray(operationsStorageKey, seeds);
  return seeds;
}

export function saveRoomOperations(operations: RoomOperation[]) {
  writeArray(operationsStorageKey, operations);
}

export function createRoomOperation(
  roomId: number,
  title: string,
  detail: string,
): RoomOperation {
  return {
    id: `room-operation-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    roomId,
    createdAt: new Date().toISOString(),
    actor: 'RM',
    title,
    detail,
  };
}

export function parseMetricValue(value: string | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function formatRoomDateTime(value: string | undefined) {
  if (!value) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
