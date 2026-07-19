import type { Mode } from './types';

type StrategyTutorialState = Record<Mode, boolean>;

const strategyTutorialStorageKey = 'i2s-strategy-tutorial-v1';

const defaultState: StrategyTutorialState = {
  basic: false,
  pro: false,
};

function loadState(): StrategyTutorialState {
  try {
    const stored = window.localStorage.getItem(strategyTutorialStorageKey);
    if (!stored) return { ...defaultState };
    const parsed = JSON.parse(stored) as Partial<StrategyTutorialState>;
    return {
      basic: parsed.basic === true,
      pro: parsed.pro === true,
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState(state: StrategyTutorialState) {
  try {
    window.localStorage.setItem(strategyTutorialStorageKey, JSON.stringify(state));
  } catch {
    return;
  }
}

export function hasSeenStrategyTutorial(mode: Mode) {
  return loadState()[mode];
}

export function markStrategyTutorialSeen(mode: Mode) {
  saveState({ ...loadState(), [mode]: true });
}

export function resetStrategyTutorial(mode: Mode) {
  saveState({ ...loadState(), [mode]: false });
}
