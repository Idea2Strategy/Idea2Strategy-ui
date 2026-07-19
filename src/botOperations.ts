import type { Bot } from './types';

export type OrderStatus = 'submitted' | 'partial' | 'filled' | 'cancelled';
export type ActivityActor = 'user' | 'system';
export type ActivityCategory = 'operation' | 'order' | 'risk' | 'connectivity';

export type BotOrder = {
  id: string;
  symbol: string;
  side: '매수' | '매도';
  orderType: '지정가' | '시장가';
  quantity: number;
  filledQuantity: number;
  limitPrice?: number;
  averageFillPrice?: number;
  status: OrderStatus;
  submittedAt: string;
  updatedAt: string;
  note: string;
};

export type BotPosition = {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
};

export type DecisionCondition = {
  label: string;
  result: 'pass' | 'fail' | 'hold';
  detail: string;
};

export type BotDecision = {
  id: string;
  time: string;
  symbol: string;
  result: '주문 생성' | '주문 없음';
  summary: string;
  conditions: DecisionCondition[];
};

export type ConnectivityEvent = {
  id: string;
  time: string;
  state: 'normal' | 'disconnected' | 'reconnected' | 'paused' | 'stopped' | 'ended';
  actor: ActivityActor;
  title: string;
  detail: string;
};

export type BotActivityRecord = {
  id: string;
  time: string;
  actor: ActivityActor;
  category: ActivityCategory;
  title: string;
  detail: string;
};

export type BotOperationSnapshot = {
  currency: 'USD';
  cash: number;
  equity: number;
  evaluatedProfitLoss: number;
  positions: BotPosition[];
  orders: BotOrder[];
  decisions: BotDecision[];
  connectivity: ConnectivityEvent[];
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  submitted: '미체결',
  partial: '부분 체결',
  filled: '체결',
  cancelled: '취소',
};

function createConnectivity(bot: Bot): ConnectivityEvent[] {
  if (bot.state === 'attention') {
    return [
      {
        id: `connectivity-${bot.id}-3`,
        time: '22:41:18',
        state: 'disconnected',
        actor: 'system',
        title: '가격 데이터 연결 지연 감지',
        detail: '최신 데이터 확인 전까지 신규 판단과 주문 생성을 자동 보류했습니다.',
      },
      {
        id: `connectivity-${bot.id}-2`,
        time: '22:41:20',
        state: 'paused',
        actor: 'system',
        title: '안전 보류 상태 전환',
        detail: '이미 제출된 주문은 유지하고 새 주문만 차단했습니다.',
      },
      {
        id: `connectivity-${bot.id}-1`,
        time: '22:45:02',
        state: 'reconnected',
        actor: 'system',
        title: '데이터 연결 재확인 중',
        detail: '수신은 재개됐으며 연속 데이터 검증 후 사용자가 재개할 수 있습니다.',
      },
    ];
  }

  if (bot.state === 'stopped') {
    return [
      {
        id: `connectivity-${bot.id}-2`,
        time: '22:31:04',
        state: 'normal',
        actor: 'system',
        title: '데이터·주문 연결 정상',
        detail: '마지막 판단까지 정상적으로 처리했습니다.',
      },
      {
        id: `connectivity-${bot.id}-1`,
        time: '22:35:10',
        state: 'stopped',
        actor: 'user',
        title: '사용자 중단',
        detail: '신규 판단을 멈추고 취소 가능한 미체결 주문에 취소 요청을 보냈습니다.',
      },
    ];
  }

  if (bot.state === 'paused') {
    return [
      {
        id: `connectivity-${bot.id}-2`,
        time: '21:10:12',
        state: 'normal',
        actor: 'system',
        title: '마지막 조건 평가 완료',
        detail: '데이터와 주문 연결은 정상입니다.',
      },
      {
        id: `connectivity-${bot.id}-1`,
        time: '21:15:00',
        state: 'paused',
        actor: 'user',
        title: '사용자 일시정지',
        detail: '새 판단만 중단했으며 기존 미체결 주문은 유지합니다.',
      },
    ];
  }

  if (bot.state === 'ended') {
    return [
      {
        id: `connectivity-${bot.id}-2`,
        time: '20:05:32',
        state: 'stopped',
        actor: 'user',
        title: '운영 종료 준비',
        detail: '신규 판단을 중지하고 미체결 주문 취소를 요청했습니다.',
      },
      {
        id: `connectivity-${bot.id}-1`,
        time: '20:06:01',
        state: 'ended',
        actor: 'system',
        title: '운영 세션 종료',
        detail: '활동·주문·성과 기록을 읽기 전용으로 보관합니다.',
      },
    ];
  }

  return [
    {
      id: `connectivity-${bot.id}-2`,
      time: '22:37:08',
      state: 'normal',
      actor: 'system',
      title: '데이터 연결 정상',
      detail: '최근 가격 데이터와 시장 상태를 정상적으로 수신했습니다.',
    },
    {
      id: `connectivity-${bot.id}-1`,
      time: '22:42:11',
      state: 'normal',
      actor: 'system',
      title: '주문 채널 정상',
      detail: '모의 주문 제출과 상태 갱신이 정상입니다.',
    },
  ];
}

export function getBotOperationSnapshot(bot: Bot): BotOperationSnapshot {
  const symbol = bot.symbols[0] ?? '사용자 종목';
  const cannotKeepOpenOrders = bot.state === 'stopped' || bot.state === 'ended';
  const positions: BotPosition[] = bot.positionCount > 0
    ? [{
      symbol,
      quantity: 12,
      averagePrice: 190.2,
      currentPrice: bot.state === 'attention' ? 192.1 : 193.4,
    }]
    : [];
  const openStatus: OrderStatus = cannotKeepOpenOrders ? 'cancelled' : 'submitted';
  const partialStatus: OrderStatus = cannotKeepOpenOrders ? 'cancelled' : 'partial';
  const orders: BotOrder[] = [
    {
      id: `ORD-${bot.id}-1042`,
      symbol,
      side: '매수',
      orderType: '지정가',
      quantity: 3,
      filledQuantity: 0,
      limitPrice: 185,
      status: openStatus,
      submittedAt: '22:36:12',
      updatedAt: cannotKeepOpenOrders ? '22:35:12' : '22:42:10',
      note: cannotKeepOpenOrders ? '사용자 중단으로 취소 요청 완료' : '사용자가 입력한 가격에 도달하기 전',
    },
    {
      id: `ORD-${bot.id}-1038`,
      symbol,
      side: '매수',
      orderType: '지정가',
      quantity: 10,
      filledQuantity: cannotKeepOpenOrders ? 4 : 4,
      limitPrice: 189.5,
      averageFillPrice: 189.42,
      status: partialStatus,
      submittedAt: '22:31:45',
      updatedAt: cannotKeepOpenOrders ? '22:35:12' : '22:40:02',
      note: cannotKeepOpenOrders ? '체결된 4주는 유지하고 잔여 6주 취소' : '4주 체결, 잔여 6주 대기',
    },
    {
      id: `ORD-${bot.id}-1029`,
      symbol,
      side: '매도',
      orderType: '시장가',
      quantity: 5,
      filledQuantity: 5,
      averageFillPrice: 191.7,
      status: 'filled',
      submittedAt: '21:58:02',
      updatedAt: '21:58:04',
      note: '모의 시장가 주문 전체 체결',
    },
    {
      id: `ORD-${bot.id}-1017`,
      symbol,
      side: '매수',
      orderType: '지정가',
      quantity: 2,
      filledQuantity: 0,
      limitPrice: 181,
      status: 'cancelled',
      submittedAt: '21:24:18',
      updatedAt: '21:31:10',
      note: '사용자 지정 유효시간 만료',
    },
  ];
  const positionValue = positions.reduce(
    (total, position) => total + position.quantity * position.currentPrice,
    0,
  );
  const evaluatedProfitLoss = positions.reduce(
    (total, position) => total + position.quantity * (position.currentPrice - position.averagePrice),
    0,
  );
  const cash = bot.id % 2 === 0 ? 78240 : 48250;

  return {
    currency: 'USD',
    cash,
    equity: cash + positionValue,
    evaluatedProfitLoss,
    positions,
    orders,
    decisions: [
      {
        id: `decision-${bot.id}-1`,
        time: '22:42:00',
        symbol,
        result: '주문 없음',
        summary: bot.issue
          ? '신호는 충족했지만 데이터 최신성 검사를 통과하지 못했습니다.'
          : '진입 신호가 충족되지 않아 주문을 만들지 않았습니다.',
        conditions: bot.issue
          ? [
            { label: '사용자 진입 조건', result: 'pass', detail: '사용자가 구성한 조건은 참입니다.' },
            { label: '가격 데이터 최신성', result: 'fail', detail: '마지막 정상 데이터 이후 지연이 감지됐습니다.' },
            { label: '주문 생성', result: 'hold', detail: '최신성 확인 전까지 안전 보류했습니다.' },
          ]
          : [
            { label: '사용자 진입 조건', result: 'fail', detail: '사용자가 구성한 비교 조건이 거짓입니다.' },
            { label: '위험 한도', result: 'pass', detail: '사용자 설정 한도 안입니다.' },
            { label: '주문 생성', result: 'hold', detail: '진입 조건 미충족으로 주문을 만들지 않았습니다.' },
          ],
      },
      {
        id: `decision-${bot.id}-2`,
        time: '22:37:00',
        symbol,
        result: '주문 생성',
        summary: '사용자 조건과 위험 한도를 통과해 모의 주문을 제출했습니다.',
        conditions: [
          { label: '사용자 진입 조건', result: 'pass', detail: '사용자가 구성한 조건이 참입니다.' },
          { label: '위험 한도', result: 'pass', detail: '사용자 설정 한도 안입니다.' },
          { label: '주문 생성', result: 'pass', detail: '모의 주문 채널로 전달했습니다.' },
        ],
      },
    ],
    connectivity: createConnectivity(bot),
  };
}

function activityCategory(title: string): ActivityCategory {
  if (title.includes('주문') || title.includes('체결')) return 'order';
  if (title.includes('데이터') || title.includes('연결') || title.includes('재개')) return 'connectivity';
  if (title.includes('위험') || title.includes('보류') || title.includes('지연')) return 'risk';
  return 'operation';
}

export function getBotActivityRecords(bot: Bot): BotActivityRecord[] {
  const snapshot = getBotOperationSnapshot(bot);
  const currentRecords = bot.activity.map((title, index): BotActivityRecord => ({
    id: `activity-${bot.id}-${index}`,
    time: index === 0 ? '지금' : `${index * 5}분 전`,
    actor: title.includes('사용자') || title.includes('운영 종료') ? 'user' : 'system',
    category: activityCategory(title),
    title,
    detail: title.includes('사용자')
      ? '사용자가 직접 실행한 행동입니다.'
      : '서비스가 상태를 감지하거나 처리한 시스템 사건입니다.',
  }));
  const connectivityRecords = snapshot.connectivity.map((event): BotActivityRecord => ({
    id: event.id,
    time: event.time,
    actor: event.actor,
    category: 'connectivity',
    title: event.title,
    detail: event.detail,
  }));
  const orderRecords = snapshot.orders.slice(0, 3).map((order): BotActivityRecord => ({
    id: `activity-${order.id}`,
    time: order.updatedAt,
    actor: order.status === 'cancelled' && bot.state === 'stopped' ? 'user' : 'system',
    category: 'order',
    title: `${order.symbol} ${order.side} 주문 · ${orderStatusLabel[order.status]}`,
    detail: `${order.filledQuantity}/${order.quantity}주 처리 · ${order.note}`,
  }));

  return [...currentRecords, ...connectivityRecords, ...orderRecords];
}

export function formatOperationMoney(value: number, currency: 'USD' = 'USD') {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
