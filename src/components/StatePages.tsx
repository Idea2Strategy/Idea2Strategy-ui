import { AlertTriangle, LockKeyhole, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './common';
import { Localized } from '../lib/i18n';

/*
  The one way a screen looks when it cannot show its content.

  Every route that fails to load — signed out, server unreachable, request
  refused — renders one of these two pages and nothing else: no per-page
  heading, no half-built toolbars around a small card. The person sees the
  same layout with the same actions wherever the failure happens, instead of
  each page improvising its own error arrangement.
*/

function StatePage({ tone, icon, title, detail, action, role }: {
  tone: 'sign-in' | 'error';
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  role: 'status' | 'alert';
}) {
  return <Localized><div className={`page state-page is-${tone}`} role={role}>
    <div className="state-page-card">
      <span className="state-page-icon">{icon}</span>
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  </div></Localized>;
}

interface SignInRequiredPageProps {
  /* Overridable for session-gate variants (expired, rejected) that need to
     name why the previous session ended; the layout stays the same. */
  title?: ReactNode;
  detail?: ReactNode;
}

/**
 * A 401 is not a failure: the server answered exactly as designed. The whole
 * screen becomes this one page, and the only offered action is the one that
 * resolves it.
 */
export function SignInRequiredPage({
  title = '로그인이 필요합니다',
  detail = '이 화면은 로그인 후 이용할 수 있습니다.',
}: SignInRequiredPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  return <StatePage
    tone="sign-in"
    role="status"
    icon={<LockKeyhole size={26} aria-hidden="true" />}
    title={title}
    detail={detail}
    action={<Button
      kind="primary"
      onClick={() => navigate('/login', { state: { returnTo: location.pathname } })}
    >로그인</Button>}
  />;
}

interface ErrorPageProps {
  title: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

/** The failed-to-load screen. Same page everywhere something cannot load. */
export function ErrorPage({ title, detail, onRetry, retryLabel = '다시 시도' }: ErrorPageProps) {
  return <StatePage
    tone="error"
    role="alert"
    icon={<AlertTriangle size={26} aria-hidden="true" />}
    title={title}
    detail={detail}
    action={onRetry && <Button icon={RotateCcw} onClick={onRetry}>{retryLabel}</Button>}
  />;
}
