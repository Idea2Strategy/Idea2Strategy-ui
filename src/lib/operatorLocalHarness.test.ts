import { describe, expect, it } from 'vitest';
import { createLocalOperatorHarness, LOCAL_OPERATOR_TOKEN_KEY } from './operatorLocalHarness';

const storage = (token: string | null): Pick<Storage, 'getItem'> => ({
  getItem: (key) => key === LOCAL_OPERATOR_TOKEN_KEY ? token : null,
});

describe('local operator browser harness', () => {
  it('is dormant unless an explicit development-only flag is present', () => {
    expect(createLocalOperatorHarness({ enabled: false, mode: 'development', storage: storage('token') })).toBeNull();
    expect(createLocalOperatorHarness({ enabled: true, mode: 'production', storage: storage('token') })).toBeNull();
  });

  it('reads a runtime session token without embedding it in the bundle', () => {
    const harness = createLocalOperatorHarness({ enabled: true, mode: 'development', storage: storage('operator-token') });
    expect(harness).not.toBeNull();
    expect(harness?.getOperatorAccessToken()).toBe('operator-token');
  });

  it('stays fail closed when the local browser has no token', () => {
    const harness = createLocalOperatorHarness({ enabled: true, mode: 'development', storage: storage(null) });
    expect(harness?.getOperatorAccessToken()).toBeNull();
  });
});
