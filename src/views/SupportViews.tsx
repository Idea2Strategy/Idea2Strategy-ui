import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Info,
  KeyRound,
  LockKeyhole,
  Mail,
  Search,
  UserRound,
} from 'lucide-react';
import { Button, EmptyState, PageHeading, Panel, Status } from '../components/common';
import type { StatusTone } from '../components/common';
import { notifications as seedNotifications } from '../data/mockData';
import type { NotificationItem } from '../data/mockData';
import type { PageId } from '../lib/navigation';
import { Localized, useLanguage } from '../lib/i18n';
import type { Language } from '../lib/i18n';

type Severity = NotificationItem['severity'];
type SeverityFilterId = Severity | 'all';

interface SeverityMeta {
  icon: LucideIcon;
  label: string;
  tone: StatusTone;
}

interface SeverityFilter {
  id: SeverityFilterId;
  label: string;
}

const severityMeta: Record<Severity, SeverityMeta> = {
  action: { icon: AlertTriangle, label: '조치 필요', tone: 'warning' },
  success: { icon: CheckCircle2, label: '완료', tone: 'positive' },
  info: { icon: Info, label: '정보', tone: 'neutral' },
};

const severityFilters: SeverityFilter[] = [
  { id: 'all', label: '전체' },
  { id: 'action', label: '조치 필요' },
  { id: 'success', label: '완료' },
  { id: 'info', label: '정보' },
];

/*
  Notification centre.

  This screen existed as a component but was never routed, so the only place a
  person could see notifications was a popover that showed three of them and led
  nowhere. Read state, severity filtering and navigation to the owning screen all
  live here; the popover now links into it.
*/
interface NotificationsViewProps {
  setPage?: (page: PageId) => void;
}

export function NotificationsView({ setPage }: NotificationsViewProps) {
  const [items, setItems] = useState<NotificationItem[]>(seedNotifications);
  const [severity, setSeverity] = useState<SeverityFilterId>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const visible = useMemo(() => items.filter((item) => {
    const matchesSeverity = severity === 'all' || item.severity === severity;
    return matchesSeverity && (!unreadOnly || item.unread);
  }), [items, severity, unreadOnly]);

  const unreadCount = items.filter((item) => item.unread).length;
  const markAllRead = () => setItems((current) => current.map((item) => ({ ...item, unread: false })));
  const openItem = (item: NotificationItem) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unread: false } : entry));
    if (item.target && setPage) setPage(item.target as PageId);
  };

  return <Localized><div className="page narrow-page notifications-page">
    <PageHeading
      eyebrow="INBOX"
      title="알림"
      description="봇 운영과 대회 일정에 영향을 주는 사건을 한곳에서 확인합니다."
      actions={<Button icon={Check} disabled={unreadCount === 0} onClick={markAllRead}>모두 읽음</Button>}
    />

    <Panel
      className="notification-panel"
      title="알림 목록"
      subtitle={unreadCount > 0 ? `읽지 않음 ${unreadCount}개` : '모두 읽었습니다'}
      action={<div className="notification-tools">
        <div className="notification-filter" role="group" aria-label="알림 유형 필터">
          {severityFilters.map((option) => <button
            key={option.id}
            type="button"
            aria-pressed={severity === option.id}
            className={severity === option.id ? 'active' : ''}
            onClick={() => setSeverity(option.id)}
          >{option.label}</button>)}
        </div>
        <label className="notification-unread-toggle">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          읽지 않은 항목만
        </label>
      </div>}
    >
      {visible.length > 0 ? <div className="notification-list">
        {visible.map((item) => {
          const meta = severityMeta[item.severity] ?? severityMeta.info;
          const Icon = meta.icon;
          const Tag = item.target ? 'button' : 'div';
          return <Tag
            key={item.id}
            className={`notification-row ${item.unread ? 'unread' : ''}`}
            {...(item.target ? { type: 'button', 'aria-label': `${item.title} 관련 화면 열기`, onClick: () => openItem(item) } : {})}
          >
            <span className={`notification-mark tone-${meta.tone}`}><Icon size={17} /></span>
            <span className="notification-copy">
              <span className="notification-kind"><small>{item.kind}</small>{item.unread && <em>읽지 않음</em>}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </span>
            <time>{item.time}</time>
          </Tag>;
        })}
      </div> : <EmptyState
        icon={BellRing}
        title="조건에 맞는 알림이 없습니다."
        detail="필터를 바꾸면 나머지 알림을 확인할 수 있습니다."
        action={<Button onClick={() => { setSeverity('all'); setUnreadOnly(false); }}>필터 초기화</Button>}
      />}
    </Panel>
  </div></Localized>;
}

interface HelpTopic {
  id: string;
  title: string;
  body: string;
}

const helpTopics: HelpTopic[] = [
  {
    id: 'strategy',
    title: '전략을 만들고 검사하기',
    body: 'Basic 편집기는 블록을 위에서 아래로 맞물려 각 종목을 독립적으로 평가합니다. Pro 편집기는 노드를 자유롭게 배치하고 같은 모양의 연결부끼리 이어 흐름을 만듭니다. 필수 입력이 비어 있어도 편집은 계속할 수 있고, 완료 단계에서 한 번에 검사합니다.',
  },
  {
    id: 'backtest',
    title: '백테스트 결과 읽기',
    body: '누적 수익률은 기간 시작 시점을 0으로 두고 계산합니다. 같은 화면의 지수 기준선과 비교해 시장 자체가 올랐는지, 전략이 더 벌었는지를 나눠서 보세요. 과거 구간 결과는 앞으로의 성과를 보장하지 않습니다.',
  },
  {
    id: 'bots',
    title: '봇 상태와 주문 상태',
    body: '봇은 실행 중, 평가 중, 조치 필요 상태를 가집니다. 주문은 접수 후 체결, 부분 체결, 취소, 거절로 갈라집니다. 주문으로 이어지지 않은 판단도 최초로 실패한 조건과 함께 기록에 남습니다.',
  },
  {
    id: 'competition',
    title: '대회에서 비교하기',
    body: '대회는 같은 시작 자본과 같은 체결·비용 기준을 적용합니다. 순위에는 익명 봇만 표시되고 사용자 이름과 개인 전략은 공개되지 않습니다. 정렬 지표는 직접 선택할 수 있습니다.',
  },
  {
    id: 'time',
    title: '시간대 표기',
    body: '시장 시각은 미국 동부 시각(ET) 기준이며, 서머타임 적용 여부에 따라 한국 시각(KST)과의 차이가 13시간 또는 14시간으로 바뀝니다. 화면의 시각 표기는 내 계정에서 바꿀 수 있습니다.',
  },
];

interface GlossaryEntry {
  term: string;
  detail: string;
}

const glossary: GlossaryEntry[] = [
  { term: '누적 수익률', detail: '기간 시작 시점을 0%로 두고, 현재까지 자산이 늘거나 줄어든 비율입니다.' },
  { term: '최대 낙폭 (MDD)', detail: '기간 중 자산이 가장 높았던 시점에서 가장 낮은 시점까지 떨어진 폭입니다. 위험을 보는 대표 지표입니다.' },
  { term: '샤프 지수', detail: '같은 수익률이라도 오르내림이 심했다면 낮아집니다. 변동성 대비 성과를 보는 값입니다.' },
  { term: '변동성', detail: '자산 가격이 위아래로 움직인 정도입니다. 값이 크면 결과의 폭이 넓다는 뜻입니다.' },
  { term: '승률', detail: '종료된 거래 중 이익으로 끝난 거래의 비율입니다. 승률이 높아도 손실 폭이 크면 전체 성과는 낮을 수 있습니다.' },
  { term: '벤치마크', detail: '비교 기준이 되는 시장 지수입니다. 전략 성과가 시장 흐름 때문인지 구분할 때 사용합니다.' },
  { term: '슬리피지', detail: '주문을 낸 가격과 실제로 체결된 가격의 차이입니다.' },
  { term: '부분 체결', detail: '주문한 수량 중 일부만 체결된 상태입니다. 남은 수량은 정책에 따라 유지되거나 취소됩니다.' },
  { term: '워밍업 구간', detail: '지표를 계산하기 위해 필요한 초기 데이터 구간입니다. 이 구간에서는 매매 판단을 하지 않습니다.' },
  { term: '유니버스', detail: '전략이 평가 대상으로 삼는 종목의 집합입니다.' },
];

interface OrderStateEntry {
  state: string;
  detail: string;
  tone: StatusTone;
}

const orderStates: OrderStateEntry[] = [
  { state: '접수', detail: '서버가 주문 요청을 받았고 아직 체결되지 않은 상태입니다.', tone: 'neutral' },
  { state: '부분 체결', detail: '주문 수량 중 일부만 체결되었습니다.', tone: 'neutral' },
  { state: '체결', detail: '주문 수량이 모두 체결되었습니다.', tone: 'positive' },
  { state: '취소', detail: '사용자 또는 정책에 따라 남은 수량이 취소되었습니다.', tone: 'neutral' },
  { state: '거절', detail: '예산 상한이나 위험 제한에 걸려 주문이 생성되지 않았습니다.', tone: 'warning' },
];

/*
  Help and glossary.

  Roadmap phase 6 asks for per-screen guidance, a searchable financial glossary
  and an explicit statement of the simulation's limits. The glossary search
  matches the term and its explanation so a person can look something up by the
  words they already know.
*/
export function HelpView() {
  const [query, setQuery] = useState('');
  const { t } = useLanguage();
  const needle = query.trim().toLowerCase();
  const matchingTerms = glossary.filter((entry) => !needle
    || `${entry.term} ${entry.detail} ${t(entry.term)} ${t(entry.detail)}`.toLowerCase().includes(needle));

  return <Localized><div className="page narrow-page help-page">
    <PageHeading
      eyebrow="HELP"
      title="도움말"
      description="화면별 사용법과 금융 용어를 확인하고, 이 시험판의 한계를 명확히 알 수 있습니다."
    />

    <Panel title="화면별 사용법" subtitle="지금 보고 있는 화면이 무엇을 하는지 설명합니다">
      <div className="help-topics">
        {helpTopics.map((topic) => <details key={topic.id}>
          <summary><BookOpen size={15} aria-hidden="true" />{topic.title}</summary>
          <p>{topic.body}</p>
        </details>)}
      </div>
    </Panel>

    <Panel
      title="금융 용어집"
      subtitle="모르는 단어를 검색해 뜻을 확인하세요"
      action={<label className="help-glossary-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" aria-label="용어 검색" placeholder="용어 또는 설명 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>}
    >
      {matchingTerms.length > 0 ? <dl className="help-glossary">
        {matchingTerms.map((entry) => <div key={entry.term}>
          <dt>{entry.term}</dt>
          <dd>{entry.detail}</dd>
        </div>)}
      </dl> : <EmptyState
        icon={Search}
        title="검색과 일치하는 용어가 없습니다."
        detail="다른 단어로 검색하거나 검색어를 지워 전체 목록을 확인하세요."
        action={<Button onClick={() => setQuery('')}>검색어 지우기</Button>}
      />}
    </Panel>

    <Panel title="주문 상태" subtitle="주문이 어떤 단계를 거치는지 확인합니다">
      <div className="help-order-states">
        {orderStates.map((entry) => <div key={entry.state}>
          <Status tone={entry.tone}>{entry.state}</Status>
          <p>{entry.detail}</p>
        </div>)}
      </div>
    </Panel>

    <Panel className="help-limits" title="이 시험판의 한계" subtitle="반드시 확인해야 하는 내용입니다">
      <ul>
        <li>실제 증권 계좌에 연결되지 않으며 실제 주문을 내지 않습니다. 모든 매매는 모의입니다.</li>
        <li>종목, 비중, 기간, 임계값, 주문 가격을 추천하지 않습니다. 투자 판단 수치는 직접 입력합니다.</li>
        <li>화면의 가격과 성과는 샘플 데이터이며 실제 시장 정보가 아닙니다.</li>
        <li>변경 내용은 이 브라우저에만 보관되며 서버에 저장되지 않습니다.</li>
        <li>구조 검사를 통과해도 수익성, 안전성, 전략 적합성을 보장하지 않습니다.</li>
      </ul>
    </Panel>
  </div></Localized>;
}

interface TimezoneOption {
  id: string;
  label: string;
}

const timezoneOptions: TimezoneOption[] = [
  { id: 'kst', label: 'KST · 한국 시각' },
  { id: 'et', label: 'ET · 미국 동부 시각' },
  { id: 'both', label: 'ET · KST 병기' },
];

/*
  Account.

  This screen previously held four rows and nothing else, while the settings a
  person actually looks for — theme, language, motion, time zone, notification
  preferences — had no home at all. The display controls are wired to the live
  app state rather than being decorative.
*/
type Theme = 'dark' | 'light';
type Updown = 'kr' | 'us';

interface AccountViewProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  timezone: string;
  setTimezone: (timezone: string) => void;
  reduceMotion: boolean;
  setReduceMotion: (reduceMotion: boolean) => void;
  updown?: Updown;
  setUpdown?: (updown: Updown) => void;
}

export function AccountView({ theme, setTheme, timezone, setTimezone, reduceMotion, setReduceMotion, updown = 'kr', setUpdown = () => {} }: AccountViewProps) {
  const { language, setLanguage } = useLanguage();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [actionAlerts, setActionAlerts] = useState(true);
  const [competitionAlerts, setCompetitionAlerts] = useState(false);

  return <Localized><div className="page narrow-page account-page">
    <PageHeading
      eyebrow="MY ACCOUNT"
      title="내 계정"
      description="프로필, 로그인 수단, 화면 설정과 알림을 한곳에서 관리합니다."
    />

    <div className="settings-grid">
      <Panel title="프로필">
        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-icon"><UserRound size={17} /></span>
            <span className="settings-row-copy"><strong>김전략</strong><small>kyoungcheul.min@gmail.com</small></span>
          </div>
          <div className="settings-row">
            <span className="settings-row-icon"><Mail size={17} /></span>
            <span className="settings-row-copy"><strong>이메일 로그인</strong><small>인증 완료</small></span>
            <Status tone="positive">연결됨</Status>
          </div>
        </div>
      </Panel>

      <Panel title="접근 보안">
        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-icon"><KeyRound size={17} /></span>
            <span className="settings-row-copy"><strong>소셜 로그인</strong><small>Google 계정</small></span>
            <Status tone="positive">연결됨</Status>
          </div>
          <div className="settings-row">
            <span className="settings-row-icon"><LockKeyhole size={17} /></span>
            <span className="settings-row-copy"><strong>동시 접속</strong><small>한 번에 하나의 세션만 허용</small></span>
          </div>
        </div>
      </Panel>

      <Panel className="span-2" title="화면 설정" subtitle="선택한 값은 이 브라우저에 보관됩니다">
        <div className="settings-fields">
          <label>
            <span>테마</span>
            <select aria-label="테마 선택" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="dark">다크</option>
              <option value="light">라이트</option>
            </select>
          </label>
          <label>
            <span>언어</span>
            <select aria-label="화면 언어 선택" value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <span>시간대 표기</span>
            <select aria-label="시간대 표기 선택" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {timezoneOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>상승·하락 색상</span>
            <select aria-label="상승·하락 색상 선택" value={updown} onChange={(event) => setUpdown(event.target.value as Updown)}>
              <option value="kr">한국식 · 상승 빨강, 하락 파랑</option>
              <option value="us">미국식 · 상승 초록, 하락 빨강</option>
            </select>
          </label>
          <label className="settings-switch">
            <input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} />
            <span><strong>모션 줄이기</strong><small>화면 전환과 강조 애니메이션을 최소화합니다</small></span>
          </label>
        </div>
      </Panel>

      <Panel className="span-2" title="알림" subtitle="어떤 사건을 알림으로 받을지 선택합니다">
        <div className="settings-fields">
          <label className="settings-switch">
            <input type="checkbox" checked={actionAlerts} onChange={(event) => setActionAlerts(event.target.checked)} />
            <span><strong>조치가 필요한 사건</strong><small>주문 거절, 데이터 확인, 전략 미완성</small></span>
          </label>
          <label className="settings-switch">
            <input type="checkbox" checked={competitionAlerts} onChange={(event) => setCompetitionAlerts(event.target.checked)} />
            <span><strong>대회 일정</strong><small>제출 마감과 평가 종료 안내</small></span>
          </label>
          <label className="settings-switch">
            <input type="checkbox" checked={emailAlerts} onChange={(event) => setEmailAlerts(event.target.checked)} />
            <span><strong>이메일로도 받기</strong><small>시험판에서는 실제 메일을 보내지 않습니다</small></span>
          </label>
        </div>
      </Panel>

      <Panel className="span-2" title="무소속 봇 계속 실행">
        <div className="renew-card">
          <div><strong>Atlas 07</strong><span>다음 확인 기한 · 2026.08.10 10:42 ET</span></div>
          <Button kind="primary">30일 연장</Button>
        </div>
        <div className="help-note">
          <CircleHelp size={16} aria-hidden="true" />
          <span>로그인이나 화면 조회만으로 기한은 연장되지 않습니다. 서버가 버튼 요청을 접수한 시각을 기준으로 계산합니다.</span>
        </div>
      </Panel>

      <Panel className="span-2 account-demo-note" title="데이터와 저장 범위">
        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-icon"><Clock3 size={17} /></span>
            <span className="settings-row-copy"><strong>데이터 기준 2026.07.23 16:00 ET</strong><small>가격·성과 데이터의 최신 시각입니다</small></span>
          </div>
          <div className="settings-row">
            <span className="settings-row-icon"><LockKeyhole size={17} /></span>
            <span className="settings-row-copy"><strong>이 브라우저에만 저장</strong><small>전략과 설정은 서버에 저장되지 않습니다</small></span>
          </div>
        </div>
      </Panel>
    </div>
  </div></Localized>;
}
