let accessToken: string | null = null;

/**
 * Keeps the current backend session token in memory only. This deliberately
 * avoids browser persistence; an application reload must re-establish auth.
 */
export function getSessionAccessToken() {
  return accessToken;
}

export function setSessionAccessToken(token: string | null) {
  accessToken = token;
}
