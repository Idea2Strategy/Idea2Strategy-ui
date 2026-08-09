import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createDeviceAuthorizationApi, DeviceAuthorizationApi } from '../api/deviceAuthorization';

type Outcome = 'idle' | 'working' | 'approved' | 'denied' | 'failed';

/**
 * Approves a command-line client that asked to sign in.
 *
 * <p>The code arrives in the address, but it is shown for the person to compare against what their
 * terminal printed rather than approved on arrival. A link is easy to send to someone; a code they
 * have to recognise is not, and this screen hands out a live session.
 */
export function CliAuthView({ api }: { api?: DeviceAuthorizationApi }) {
  const [params] = useSearchParams();
  const client = useMemo(() => api ?? createDeviceAuthorizationApi(), [api]);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [failure, setFailure] = useState('');

  const act = async (decide: (userCode: string) => Promise<void>, settled: Outcome) => {
    setOutcome('working');
    setFailure('');
    try {
      await decide(code.trim());
      setOutcome(settled);
    } catch (error) {
      setOutcome('failed');
      setFailure(
        error instanceof Error && error.message === 'SIGN_IN_REQUIRED'
          ? '로그인이 필요합니다. 로그인한 뒤 다시 시도하세요.'
          : '이 코드는 더 이상 승인할 수 없습니다. 터미널에서 다시 시작하세요.',
      );
    }
  };

  if (outcome === 'approved') {
    return (
      <section aria-labelledby="cli-auth-heading">
        <h1 id="cli-auth-heading">터미널에 로그인했습니다</h1>
        <p>이 창을 닫아도 됩니다. 터미널로 돌아가세요.</p>
      </section>
    );
  }

  if (outcome === 'denied') {
    return (
      <section aria-labelledby="cli-auth-heading">
        <h1 id="cli-auth-heading">요청을 거절했습니다</h1>
        <p>터미널은 로그인되지 않았습니다.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="cli-auth-heading">
      <h1 id="cli-auth-heading">터미널 로그인을 승인할까요?</h1>
      <p>
        터미널에 표시된 코드와 아래 코드가 <strong>같은지 확인</strong>하세요. 다르면 승인하지 마세요.
      </p>
      <label htmlFor="cli-auth-code">코드</label>
      <input
        id="cli-auth-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <p>
        승인하면 그 터미널이 회원님 계정으로 전략을 읽고 만들 수 있습니다. 주문·출시·자금 이동은 할 수
        없습니다.
      </p>
      {failure ? <p role="alert">{failure}</p> : null}
      <button
        type="button"
        disabled={outcome === 'working' || code.trim().length === 0}
        onClick={() => act(client.approve, 'approved')}
      >
        승인
      </button>
      <button
        type="button"
        disabled={outcome === 'working' || code.trim().length === 0}
        onClick={() => act(client.deny, 'denied')}
      >
        거절
      </button>
    </section>
  );
}

export default CliAuthView;
