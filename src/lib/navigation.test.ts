import { describe, expect, test } from 'vitest';
import { pageFromPathname, strategyModeFromPathname } from './navigation';

describe('navigation', () => {
  test('treats both the prototype canvas and a saved strategy as the editor', () => {
    expect(strategyModeFromPathname('/strategies/new/basic')).toBe('basic');
    expect(strategyModeFromPathname('/strategies/new/pro')).toBe('pro');
    expect(strategyModeFromPathname('/strategies/20000000-0000-4000-8000-000000000001/basic')).toBe('basic');
    expect(strategyModeFromPathname('/strategies/20000000-0000-4000-8000-000000000001/pro')).toBe('pro');
  });

  test('does not mistake the strategy list or a deeper path for the editor', () => {
    expect(strategyModeFromPathname('/strategies')).toBe('home');
    expect(strategyModeFromPathname('/strategies/some-id')).toBe('home');
    expect(strategyModeFromPathname('/strategies/some-id/basic/extra')).toBe('home');
    expect(strategyModeFromPathname('/bots')).toBe('home');
  });

  test('keeps every strategy URL on the strategy page', () => {
    expect(pageFromPathname('/strategies')).toBe('strategy');
    expect(pageFromPathname('/strategies/new/basic')).toBe('strategy');
    expect(pageFromPathname('/strategies/20000000-0000-4000-8000-000000000001/basic')).toBe('strategy');
  });
});
