import { BellRing, Check, KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Button, HelpNote, ListRow, PageHeading, Panel, Status } from '../components/common.jsx';
import { notifications } from '../data/mockData.js';
import { Localized } from '../lib/i18n.jsx';

export function NotificationsView() {
  return <Localized><div className="page narrow-page"><PageHeading eyebrow="INBOX" title="알림" description="봇 운영과 방 일정에 영향을 주는 사건을 한곳에서 확인합니다." actions={<Button icon={Check}>모두 읽음</Button>} /><Panel className="notification-panel" title="최근 알림" subtitle="미확인 2개">{notifications.map((item) => <button className={`notification-row ${item.unread ? 'unread' : ''}`} key={item.title}><span className="notification-mark"><BellRing size={17} /></span><span><small>{item.kind}</small><strong>{item.title}</strong><p>{item.detail}</p></span><time>{item.time}</time></button>)}</Panel></div></Localized>;
}

export function AccountView() {
  return <Localized><div className="page narrow-page"><PageHeading eyebrow="MY ACCOUNT" title="내 계정" description="프로필, 로그인 수단과 계정 보안을 한곳에서 관리합니다." />
    <div className="settings-grid"><Panel title="프로필"><ListRow icon={UserRound} title="김전략" detail="kyoungcheul.min@gmail.com" /><ListRow icon={Mail} title="이메일 로그인" detail="인증 완료" end={<Status tone="positive">연결됨</Status>} /></Panel><Panel title="접근 보안"><ListRow icon={KeyRound} title="소셜 로그인" detail="Google 계정" end={<Status tone="positive">연결됨</Status>} /><ListRow icon={LockKeyhole} title="동시 접속" detail="한 번에 하나의 세션만 허용" /></Panel><Panel className="span-2" title="무소속 봇 계속 실행"><div className="renew-card"><div><strong>Atlas 07</strong><span>다음 확인 기한 · 2026.08.10 10:42 ET</span></div><Button kind="primary">30일 연장</Button></div><HelpNote>로그인이나 화면 조회만으로 기한은 연장되지 않습니다. 서버가 버튼 요청을 접수한 시각을 기준으로 계산합니다.</HelpNote></Panel></div>
  </div></Localized>;
}
