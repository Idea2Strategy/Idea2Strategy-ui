import { initialBots } from './data';
import type { Bot, BotTab } from './types';

const botStorageKey = 'i2s-bots-v1';
const botViewStorageKey = 'i2s-bot-view-v1';
const botTabs: BotTab[] = ['overview', 'orders', 'backtest', 'activity'];

function cloneInitialBots() {
  return initialBots.map((bot) => ({
    ...bot,
    symbols: [...bot.symbols],
    activity: [...bot.activity],
  }));
}

export function loadBots(): Bot[] {
  try {
    const stored = window.localStorage.getItem(botStorageKey);
    if (!stored) return cloneInitialBots();
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) && parsed.length ? parsed as Bot[] : cloneInitialBots();
  } catch {
    return cloneInitialBots();
  }
}

export function saveBots(bots: Bot[]) {
  try {
    window.localStorage.setItem(botStorageKey, JSON.stringify(bots));
  } catch {
    return;
  }
}

export function loadBotViewState(bots: Bot[]): { selectedId: number; activeTab: BotTab } {
  const fallback = {
    selectedId: bots[0]?.id ?? 1,
    activeTab: 'overview' as BotTab,
  };

  try {
    const stored = window.localStorage.getItem(botViewStorageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<{ selectedId: number; activeTab: BotTab }>;
    return {
      selectedId: bots.some((bot) => bot.id === parsed.selectedId)
        ? parsed.selectedId as number
        : fallback.selectedId,
      activeTab: parsed.activeTab && botTabs.includes(parsed.activeTab)
        ? parsed.activeTab
        : fallback.activeTab,
    };
  } catch {
    return fallback;
  }
}

export function saveBotViewState(selectedId: number, activeTab: BotTab) {
  try {
    window.localStorage.setItem(botViewStorageKey, JSON.stringify({ selectedId, activeTab }));
  } catch {
    return;
  }
}
