import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, LockKeyhole, LogOut, ShieldCheck, Trash2, X } from 'lucide-react';
import type { AccountClient } from '../api/account';
import { AccountApiError } from '../api/account';
import { setSessionAccessToken } from '../api/sessionAccessToken';
import { browserSessionStore } from '../lib/session';
import { Button } from './common';

function dropTabSession(reason?: 'rejected') {
  setSessionAccessToken(null);
  browserSessionStore.signOut(reason);
}

interface AccountApiPanelsProps {
  client: AccountClient;
  createIdempotencyKey?: () => string;
}

type WithdrawalState =
  | { kind: 'idle' | 'pending' }
  | { kind: 'error'; error: AccountApiError };

const fallbackError = (error: unknown) => error instanceof AccountApiError
  ? error
  : new AccountApiError(0, 'NETWORK_ERROR', null);

export function AccountApiPanels({
  client,
  createIdempotencyKey = () => crypto.randomUUID(),
}: AccountApiPanelsProps) {
  const [securityPending, setSecurityPending] = useState<'current' | 'all' | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const logout = async (all: boolean) => {
    setSecurityPending(all ? 'all' : 'current');
    try {
      if (all) await client.logoutAll();
      else await client.logoutCurrent();
    } catch {
      // A local sign-out still protects the current tab when the server is unavailable.
    } finally {
      dropTabSession();
      setSecurityPending(null);
    }
  };

  return <>
    <section className="account-section account-security-section" id="account-security" aria-labelledby="account-security-title">
      <header className="account-section-heading">
        <span className="account-section-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="account-security-title">로그인 및 보안</h2>
          <p>현재 기기에서 로그아웃하거나 로그인된 모든 기기의 세션을 종료할 수 있습니다.</p>
        </div>
      </header>
      <div className="account-security-actions" role="group" aria-label="로그인 보안 작업">
        <Button
          className="account-logout-button"
          icon={LogOut}
          onClick={() => void logout(false)}
          disabled={securityPending !== null}
        >
          {securityPending === 'current' ? '로그아웃 중' : '로그아웃'}
        </Button>
        <Button
          className="account-logout-all-button"
          icon={LockKeyhole}
          onClick={() => void logout(true)}
          disabled={securityPending !== null}
        >
          {securityPending === 'all' ? '세션 종료 중' : '모든 기기에서 로그아웃'}
        </Button>
      </div>
    </section>

    <section className="account-section account-danger-section" id="account-management" aria-labelledby="account-management-title">
      <header className="account-section-heading">
        <span className="account-section-icon is-danger"><AlertTriangle size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="account-management-title">계정 관리</h2>
          <p>회원 탈퇴는 계정과 연결된 서비스 이용을 종료하는 중요한 작업입니다.</p>
        </div>
      </header>
      <div className="account-danger-action">
        <div>
          <strong>Idea2Strategy 회원 탈퇴</strong>
          <span>본인 확인 후 탈퇴 요청을 진행합니다.</span>
        </div>
        <Button className="account-withdrawal-trigger" icon={Trash2} onClick={() => setWithdrawalOpen(true)}>
          회원 탈퇴
        </Button>
      </div>
    </section>

    {withdrawalOpen && <WithdrawalDialog
      client={client}
      createIdempotencyKey={createIdempotencyKey}
      onClose={() => setWithdrawalOpen(false)}
    />}
  </>;
}

function WithdrawalDialog({
  client,
  createIdempotencyKey,
  onClose,
}: {
  client: AccountClient;
  createIdempotencyKey: () => string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [state, setState] = useState<WithdrawalState>({ kind: 'idle' });

  useEffect(() => {
    passwordRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state.kind !== 'pending') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, state.kind]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || state.kind === 'pending') return;
    setState({ kind: 'pending' });
    try {
      await client.requestWithdrawal(password, createIdempotencyKey());
      setPassword('');
      onClose();
      dropTabSession();
    } catch (cause) {
      setState({ kind: 'error', error: fallbackError(cause) });
      passwordRef.current?.focus();
    }
  };

  const errorMessage = state.kind === 'error'
    ? state.error.code === 'PASSWORD_STEP_UP_EMAIL_UNAVAILABLE'
      ? '보안을 위해 다시 로그인한 뒤 시도해주세요.'
      : state.error.status === 401
        ? '비밀번호를 다시 확인해주세요.'
        : '탈퇴 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null;

  return <div
    className="account-modal-backdrop"
    onMouseDown={(event) => {
      if (event.currentTarget === event.target && state.kind !== 'pending') onClose();
    }}
  >
    <section
      className="account-withdrawal-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-withdrawal-title"
      ref={dialogRef}
    >
      <header>
        <span className="account-withdrawal-modal-icon"><Trash2 size={22} aria-hidden="true" /></span>
        <div>
          <small>DELETE ACCOUNT</small>
          <h2 id="account-withdrawal-title">회원 탈퇴</h2>
        </div>
        <button
          className="account-dialog-close"
          type="button"
          aria-label="회원 탈퇴 창 닫기"
          onClick={onClose}
          disabled={state.kind === 'pending'}
        ><X size={18} aria-hidden="true" /></button>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <div className="account-withdrawal-modal-body">
          <div className="account-withdrawal-warning">
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>계정을 삭제하면 복구할 수 없습니다.</strong>
              <p>탈퇴 요청이 접수되면 현재 계정에서 로그아웃됩니다.</p>
            </div>
          </div>
          <label className="account-withdrawal-password">
            <span>현재 비밀번호</span>
            <input
              ref={passwordRef}
              aria-label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (state.kind === 'error') setState({ kind: 'idle' });
              }}
              placeholder="비밀번호를 입력해주세요"
            />
            <small>본인 확인을 위해 현재 비밀번호를 입력해주세요.</small>
          </label>
          {errorMessage && <p className="account-withdrawal-error" role="alert">{errorMessage}</p>}
        </div>
        <footer>
          <Button type="button" onClick={onClose} disabled={state.kind === 'pending'}>취소</Button>
          <Button className="account-withdrawal-confirm" type="submit" disabled={!password || state.kind === 'pending'}>
            {state.kind === 'pending' ? <><Loader2 size={16} aria-hidden="true" />탈퇴 처리 중</> : '탈퇴'}
          </Button>
        </footer>
      </form>
    </section>
  </div>;
}
