import { describe, expect, test } from 'vitest';

import { formatStrategyCardBudgetPercent } from './views/StrategyViews';

describe('strategy card budget presentation', () => {
  test('preserves the partition total instead of rounding every card upward', () => {
    expect(formatStrategyCardBudgetPercent(40, 2)).toBe('20');
    expect(formatStrategyCardBudgetPercent(35, 2)).toBe('17.5');
    expect(formatStrategyCardBudgetPercent(25, 2)).toBe('12.5');
  });
});
