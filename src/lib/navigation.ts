import { Bot, FlaskConical, House, LayoutGrid, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PageId =
  | 'landing'
  | 'home'
  | 'strategy'
  | 'bots'
  | 'backtest'
  | 'rooms'
  | 'account'
  | 'notifications'
  | 'help';

export type StrategyMode = 'basic' | 'pro' | 'home';

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

/*
  Primary navigation. Notifications, help and the account screen are reachable
  from the navigation tools rather than from this list, so the five product areas
  stay the only top-level choices.
*/
export const navItems: NavItem[] = [
  { id: 'home', label: '홈', icon: House },
  { id: 'strategy', label: '전략', icon: LayoutGrid },
  { id: 'bots', label: '봇', icon: Bot },
  { id: 'backtest', label: '백테스트', icon: FlaskConical },
  { id: 'rooms', label: '모의투자', icon: Trophy },
];

export const pagePaths: Record<PageId, string> = {
  landing: '/landing',
  home: '/',
  strategy: '/strategies',
  bots: '/bots',
  backtest: '/backtests',
  rooms: '/competition',
  account: '/account',
  notifications: '/notifications',
  help: '/help',
};

export function pageFromPathname(pathname = '/'): PageId {
  if (pathname.startsWith('/landing')) return 'landing';
  if (pathname.startsWith('/strategies')) return 'strategy';
  if (pathname.startsWith('/bots')) return 'bots';
  if (pathname.startsWith('/backtests')) return 'backtest';
  if (pathname.startsWith('/competition')) return 'rooms';
  if (pathname.startsWith('/account')) return 'account';
  if (pathname.startsWith('/notifications')) return 'notifications';
  if (pathname.startsWith('/help')) return 'help';
  return 'home';
}

export function strategyModeFromPathname(pathname = '/'): StrategyMode {
  if (pathname === '/strategies/new/basic') return 'basic';
  if (pathname === '/strategies/new/pro') return 'pro';
  return 'home';
}
