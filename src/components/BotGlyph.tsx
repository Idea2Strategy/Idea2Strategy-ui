import type { CSSProperties, ReactNode } from 'react';
import botAdaptive from '../assets/bots/bot-adaptive.svg';
import botAggressive from '../assets/bots/bot-aggressive.svg';
import botAnalytical from '../assets/bots/bot-analytical.svg';
import botBalanced from '../assets/bots/bot-balanced.svg';
import botConfident from '../assets/bots/bot-confident.svg';
import botDefensive from '../assets/bots/bot-defensive.svg';
import botFocus from '../assets/bots/bot-focus.svg';
import botHappy from '../assets/bots/bot-happy.svg';
import botHighGrowth from '../assets/bots/bot-high-growth.svg';
import botNormal from '../assets/bots/bot-normal.svg';
import botOpportunistic from '../assets/bots/bot-opportunistic.svg';
import botRelaxed from '../assets/bots/bot-relaxed.svg';

export interface BotIconOption {
  id: string;
  label: string;
  src: string;
}

export interface BotIconColor {
  id: string;
  label: string;
  value: string;
}

export interface BotIconSelection {
  iconId: string;
  colorId: string;
}

export type BotIconMap = Record<string, BotIconSelection>;

export const BOT_ICON_OPTIONS: BotIconOption[] = [
  { id: 'focus', label: '집중형 봇', src: botFocus },
  { id: 'aggressive', label: '공격형 봇', src: botAggressive },
  { id: 'balanced', label: '균형형 봇', src: botBalanced },
  { id: 'defensive', label: '방어형 봇', src: botDefensive },
  { id: 'relaxed', label: '릴렉스형 봇', src: botRelaxed },
  { id: 'high-growth', label: '고성장형 봇', src: botHighGrowth },
  { id: 'analytical', label: '분석형 봇', src: botAnalytical },
  { id: 'adaptive', label: '적응형 봇', src: botAdaptive },
  { id: 'confident', label: '자신감형 봇', src: botConfident },
  { id: 'happy', label: '행복한 봇', src: botHappy },
  { id: 'normal', label: '기본형 봇', src: botNormal },
  { id: 'opportunistic', label: '기회포착형 봇', src: botOpportunistic },
];

export const BOT_ICON_COLORS: BotIconColor[] = [
  { id: 'gray', label: '회색', value: '#565958' },
  { id: 'light-gray', label: '연한 회색', value: '#a6a59f' },
  { id: 'brown', label: '갈색', value: '#9d725b' },
  { id: 'yellow', label: '노란색', value: '#c59636' },
  { id: 'orange', label: '주황색', value: '#d17526' },
  { id: 'green', label: '초록색', value: '#5d8f70' },
  { id: 'blue', label: '파란색', value: '#5686bd' },
  { id: 'purple', label: '보라색', value: '#8769b6' },
  { id: 'pink', label: '분홍색', value: '#b65b89' },
  { id: 'red', label: '빨간색', value: '#c35b50' },
];

export const FALLBACK_BOT_ICON: BotIconSelection = { iconId: 'normal', colorId: 'gray' };

export const DEFAULT_BOT_ICONS: BotIconMap = {
  'Atlas 07': { iconId: 'focus', colorId: 'gray' },
  'Room Beta': { iconId: 'aggressive', colorId: 'red' },
  'Pair Lab': { iconId: 'relaxed', colorId: 'blue' },
  'Pulse Grid': { iconId: 'analytical', colorId: 'purple' },
};

export const BOT_ICON_STORAGE_KEY = 'i2s-bot-icons';

const isValidSelection = (value: unknown): value is BotIconSelection => {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Partial<BotIconSelection>;
  return BOT_ICON_OPTIONS.some((option) => option.id === selection.iconId)
    && BOT_ICON_COLORS.some((option) => option.id === selection.colorId);
};

export const loadBotIcons = (): BotIconMap => {
  if (typeof localStorage === 'undefined') return DEFAULT_BOT_ICONS;
  try {
    const stored = JSON.parse(localStorage.getItem(BOT_ICON_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const validEntries = Object.entries(stored).filter(
      (entry): entry is [string, BotIconSelection] => isValidSelection(entry[1]),
    );
    return { ...DEFAULT_BOT_ICONS, ...Object.fromEntries(validEntries) };
  } catch {
    return DEFAULT_BOT_ICONS;
  }
};

export function BotGlyph({ selection, testId }: { selection: BotIconSelection; testId?: string }): ReactNode {
  const icon = BOT_ICON_OPTIONS.find((option) => option.id === selection.iconId) ?? BOT_ICON_OPTIONS[0];
  const color = BOT_ICON_COLORS.find((option) => option.id === selection.colorId) ?? BOT_ICON_COLORS[0];
  const style = {
    '--bot-icon-mask': `url("${icon.src}")`,
    '--bot-icon-color': color.value,
  } as CSSProperties;

  return <span
    className="bot-icon-glyph"
    aria-hidden="true"
    data-testid={testId}
    data-icon={icon.id}
    data-color={color.id}
    style={style}
  />;
}
