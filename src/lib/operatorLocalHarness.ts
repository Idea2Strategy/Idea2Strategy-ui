export const LOCAL_OPERATOR_TOKEN_KEY = 'idea2strategy.local.operatorAccessToken';

interface LocalOperatorHarnessOptions {
  enabled: boolean;
  mode: string;
  storage: Pick<Storage, 'getItem'>;
}

export interface LocalOperatorHarness {
  getOperatorAccessToken(): string | null;
}

/**
 * Development-only bridge for the offline Chromium journey. Production operator
 * credentials still come from the deployed OIDC integration; this bridge cannot be
 * activated in a production build and never contains a credential of its own.
 */
export function createLocalOperatorHarness({ enabled, mode, storage }: LocalOperatorHarnessOptions): LocalOperatorHarness | null {
  if (!enabled || mode !== 'development') return null;
  return {
    getOperatorAccessToken() {
      const token = storage.getItem(LOCAL_OPERATOR_TOKEN_KEY)?.trim();
      return token || null;
    },
  };
}
