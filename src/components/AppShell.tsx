import {
  Bell,
  Blocks,
  Bot,
  CircleHelp,
  Home,
  Settings,
  Trophy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Route } from '../types';

type AppShellProps = {
  route: Route;
  onRoute: (route: Route) => void;
  onNotifications: () => void;
  onHelp: () => void;
  onSettings: () => void;
  timeZone: 'KST' | 'ET';
  reduceMotion: boolean;
  children: ReactNode;
};

const navigation = [
  { id: 'home' as const, label: '홈', icon: Home },
  { id: 'strategy' as const, label: '전략', icon: Blocks },
  { id: 'bots' as const, label: '봇', icon: Bot },
  { id: 'rooms' as const, label: '방', icon: Trophy },
];

export function AppShell({
  route,
  onRoute,
  onNotifications,
  onHelp,
  onSettings,
  timeZone,
  reduceMotion,
  children,
}: AppShellProps) {
  return (
    <div className={`app-shell ${reduceMotion ? 'is-reduced-motion' : ''}`}>
      <aside className="app-rail" aria-label="주요 메뉴">
        <button className="rail-brand" onClick={() => onRoute('home')} aria-label="I2S 홈">
          <BrandMark compact />
        </button>
        <nav className="rail-navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={route === id ? 'is-active' : ''}
              onClick={() => onRoute(id)}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-utilities">
          <button onClick={onHelp}><CircleHelp size={19} /><span>도움말</span></button>
          <button onClick={onSettings}><Settings size={19} /><span>설정</span></button>
        </div>
      </aside>

      <div className="app-content">
        <header className="global-topbar">
          <BrandMark />
          <div className="global-topbar__right">
            <span className="environment-badge"><i /> 데모 환경</span>
            <span className="timezone-label"><strong>{timeZone}</strong><small>· {timeZone === 'KST' ? 'ET' : 'KST'} 병기</small></span>
            <button className="topbar-icon-button" onClick={onNotifications} aria-label="알림">
              <Bell size={17} />
              <em>2</em>
            </button>
            <button className="avatar-button" onClick={onSettings} aria-label="사용자 설정">RM</button>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="Idea to Strategy">
      <span className="brand-mark__symbol">i2s</span>
      {!compact && <span className="brand-mark__name">Idea to Strategy</span>}
    </div>
  );
}
