import { Bot, FlaskConical, House, LayoutGrid, Trophy } from 'lucide-react';

export const navItems = [
  { id: 'home', label: '홈', icon: House },
  { id: 'strategy', label: '전략', icon: LayoutGrid },
  { id: 'bots', label: '봇', icon: Bot },
  { id: 'backtest', label: '백테스트', icon: FlaskConical },
  { id: 'rooms', label: 'Competition', icon: Trophy },
];

export const pagePaths = {
  home: '/',
  strategy: '/strategies',
  bots: '/bots',
  backtest: '/backtests',
  rooms: '/competition',
  account: '/account',
};

export function pageFromPathname(pathname = '/') {
  if (pathname.startsWith('/strategies')) return 'strategy';
  if (pathname.startsWith('/bots')) return 'bots';
  if (pathname.startsWith('/backtests')) return 'backtest';
  if (pathname.startsWith('/competition')) return 'rooms';
  if (pathname.startsWith('/account')) return 'account';
  return 'home';
}

export function strategyModeFromPathname(pathname = '/') {
  if (pathname === '/strategies/new/basic') return 'basic';
  if (pathname === '/strategies/new/pro') return 'pro';
  return 'home';
}

export function variantFromLocation(pathname = '') {
  return pathname.includes('terminal') ? 'terminal' : 'balanced';
}
