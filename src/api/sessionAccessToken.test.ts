import { afterEach, describe, expect, it } from 'vitest';
import { getSessionAccessToken, setSessionAccessToken } from './sessionAccessToken';

describe('session access token', () => {
  afterEach(() => setSessionAccessToken(null));

  it('shares the current token in memory and clears it without browser persistence', () => {
    expect(getSessionAccessToken()).toBeNull();
    setSessionAccessToken('session-token');
    expect(getSessionAccessToken()).toBe('session-token');
    setSessionAccessToken(null);
    expect(getSessionAccessToken()).toBeNull();
  });
});
