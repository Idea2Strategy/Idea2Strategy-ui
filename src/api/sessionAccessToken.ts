import { useSyncExternalStore } from 'react';

let accessToken: string | null = null;
let refreshToken: string | null = null;
const listeners = new Set<() => void>();

/**
 * Keeps the current backend session token in memory only. This deliberately
 * avoids browser persistence; an application reload must re-establish auth.
 */
export function getSessionAccessToken() {
  return accessToken;
}

export function getSessionRefreshToken() {
  return refreshToken;
}

export function setSessionTokens(access: string | null, refresh: string | null) {
  if (access === accessToken && refresh === refreshToken) return;
  accessToken = access;
  refreshToken = refresh;
  for (const listener of [...listeners]) listener();
}

export function setSessionAccessToken(token: string | null) {
  setSessionTokens(token, token === null ? null : refreshToken);
}

export function subscribeSessionAccessToken(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Subscribe a component to the in-memory session token, so a screen can gate
 * on "is anyone signed in" and re-render the moment login or logout happens.
 */
export function useSessionAccessToken() {
  return useSyncExternalStore(subscribeSessionAccessToken, getSessionAccessToken, getSessionAccessToken);
}
