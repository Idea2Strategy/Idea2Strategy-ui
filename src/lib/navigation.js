import { Bot, FlaskConical, House, LayoutGrid, Trophy } from 'lucide-react';

export const navItems = [
  { id: 'home', label: '홈', icon: House },
  { id: 'strategy', label: '전략', icon: LayoutGrid },
  { id: 'bots', label: '봇', icon: Bot },
  { id: 'backtest', label: '백테스트', icon: FlaskConical },
  { id: 'rooms', label: 'Competition', icon: Trophy },
];

export function variantFromLocation(pathname = '') {
  return pathname.includes('terminal') ? 'terminal' : 'balanced';
}
