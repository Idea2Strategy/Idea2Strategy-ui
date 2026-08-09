import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellRing, Check, Info, LoaderCircle, Mail } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeading, Panel, SignInRequiredState, Status } from './common';
import { ErrorPage, SignInRequiredPage } from './StatePages';
import { NotificationApiError } from '../api/notifications';
import type { NotificationClient, NotificationPage, NotificationPreference, NotificationRecord } from '../api/notifications';
import { Localized } from '../lib/i18n';

type LoadState<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; error: NotificationApiError };
const apiError = (value: unknown) => value instanceof NotificationApiError ? value : new NotificationApiError(0, 'NETWORK_ERROR', null);

export function NotificationCenter({ client }: { client: NotificationClient }) {
  const [state, setState] = useState<LoadState<NotificationPage>>({ kind: 'loading' });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pendingRead, setPendingRead] = useState<string | null>(null);
  const load = async () => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', value: await client.list() }); }
    catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
  };
  useEffect(() => { void load(); }, [client]);
  const items = state.kind === 'ready' ? state.value.items : [];
  const visible = useMemo(() => unreadOnly ? items.filter((item) => item.readAt === null) : items, [items, unreadOnly]);
  const unreadCount = items.filter((item) => item.readAt === null).length;
  const markRead = async (item: NotificationRecord) => {
    if (item.readAt !== null || state.kind !== 'ready') return;
    setPendingRead(item.id);
    try {
      await client.markRead(item.id);
      setState({ kind: 'ready', value: { ...state.value, items: state.value.items.map((current) => current.id === item.id ? { ...current, readAt: new Date().toISOString() } : current) } });
    } catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
    finally { setPendingRead(null); }
  };
  const more = async () => {
    if (state.kind !== 'ready') return;
    const beforeCreatedAt = state.value.nextCreatedAt;
    const beforeId = state.value.nextId;
    if (!beforeCreatedAt || !beforeId) return;
    const current = state.value;
    const cursor = { beforeCreatedAt, beforeId };
    try {
      const next = await client.list(cursor);
      const seen = new Set(current.items.map((item) => item.id));
      setState({ kind: 'ready', value: { ...next, items: [...current.items, ...next.items.filter((item) => !seen.has(item.id))] } });
    } catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
  };

  /*
    Nothing to show at all — signed out, or the load failed. The whole route
    renders the one shared state page; no page scaffold survives around it,
    so every screen fails the same way.
  */
  if (state.kind === 'error') {
    if (state.error.authenticationRequired) {
      return <SignInRequiredPage />;
    }
    return <ErrorPage
      title={state.error.retryable ? '알림 서버에 일시적으로 연결할 수 없습니다.' : '알림 요청을 처리하지 못했습니다.'}
      onRetry={() => void load()}
    />;
  }

  return <Localized><div className="page narrow-page notifications-page">
    <PageHeading eyebrow="INBOX" title="알림" description="내 계정에 발행된 알림과 서버의 읽음 상태를 확인합니다." />
    <Panel className="notification-panel" title="알림 목록" subtitle={state.kind === 'ready' ? `읽지 않음 ${unreadCount}개` : '서버 동기화 중'} action={<label className="notification-unread-toggle"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />읽지 않은 항목만</label>}>
      {state.kind === 'loading' && <div className="notification-api-state" role="status"><LoaderCircle size={17} />알림을 불러오는 중입니다.</div>}
      {state.kind === 'ready' && visible.length === 0 && <EmptyState icon={BellRing} title="표시할 알림이 없습니다." detail={unreadOnly ? '모든 알림을 읽었습니다.' : '아직 발행된 알림이 없습니다.'} />}
      {state.kind === 'ready' && visible.length > 0 && <div className="notification-list">{visible.map((item) => <article key={item.id} className={`notification-row ${item.readAt === null ? 'unread' : ''}`}>
        <span className="notification-mark"><Info size={17} /></span>
        <span className="notification-copy"><span className="notification-kind"><small>{item.typeCode}</small>{item.mandatory && <em>필수</em>}{item.readAt === null && <em>읽지 않음</em>}</span><strong>{item.typeCode}</strong><p>{argumentText(item)}</p><small>템플릿 {item.templateVersion} · {item.locale}</small></span>
        <span className="notification-api-actions"><time>{new Date(item.createdAt).toLocaleString()}</time>{item.readAt === null && <Button disabled={pendingRead === item.id} onClick={() => void markRead(item)}>{pendingRead === item.id ? <LoaderCircle size={13} /> : <Check size={13} />}읽음</Button>}</span>
      </article>)}</div>}
      {state.kind === 'ready' && state.value.nextCreatedAt && state.value.nextId && <footer className="notification-api-footer"><Button onClick={() => void more()}>이전 알림 더 보기</Button></footer>}
    </Panel>
  </div></Localized>;
}

export function NotificationPreferencesPanel({ client }: { client: NotificationClient }) {
  const [state, setState] = useState<LoadState<NotificationPreference[]>>({ kind: 'loading' });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const load = async () => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', value: await client.preferences() }); }
    catch (cause) { setState({ kind: 'error', error: apiError(cause) }); }
  };
  useEffect(() => { void load(); }, [client]);
  const toggleEmail = async (preference: NotificationPreference) => {
    const enabled = preference.enabledChannels.includes('EMAIL');
    setSaving(preference.typeCode); setSaved(null); setSaveError(false);
    try {
      const updated = await client.replacePreference(preference.typeCode, enabled ? ['APP'] : ['APP', 'EMAIL']);
      setState((current) => current.kind === 'ready' ? { kind: 'ready', value: current.value.map((item) => item.typeCode === updated.typeCode ? updated : item) } : current);
      setSaved(updated.typeCode);
    } catch { setSaveError(true); }
    finally { setSaving(null); }
  };
  return <Localized><Panel className="span-2 notification-preferences-api" title="알림 설정" subtitle="받고 싶은 소식을 이메일로도 알려드릴게요.">
    {state.kind === 'loading' && <div className="notification-preferences-state" role="status"><LoaderCircle size={16} /> 알림 설정을 불러오고 있습니다.</div>}
    {state.kind === 'error' && <NotificationError error={state.error} retry={load} />}
    {state.kind === 'ready' && state.value.length === 0 && <EmptyState icon={BellRing} title="지금 설정할 수 있는 알림이 없습니다." detail="새로운 알림 항목이 생기면 이곳에서 이메일 수신 여부를 선택할 수 있습니다." />}
    {saveError && <p className="notification-preferences-save-error" role="alert">변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    {state.kind === 'ready' && <div className="notification-preference-list">{state.value.map((preference) => {
      const email = preference.enabledChannels.includes('EMAIL');
      const copy = notificationPreferenceCopy(preference.typeCode);
      return <div className="notification-preference-row" key={preference.typeCode}>
        <span className="notification-preference-icon"><Mail size={17} /></span>
        <span className="notification-preference-copy"><strong>{copy.title}</strong><small>{preference.mandatory ? '서비스 이용에 꼭 필요한 알림입니다.' : copy.description}</small></span>
        <span className="notification-preference-control">
          <button
            type="button"
            role="switch"
            aria-checked={email}
            aria-label={`${copy.title} 이메일 알림`}
            disabled={preference.mandatory || saving === preference.typeCode}
            onClick={() => void toggleEmail(preference)}
          ><i /></button>
          <small>{preference.mandatory ? email ? '필수 수신' : '서비스 내 알림' : saving === preference.typeCode ? '저장 중' : email ? '켜짐' : '꺼짐'}</small>
        </span>
        {saved === preference.typeCode && <span className="notification-preference-saved" role="status"><Check size={13} />저장됨</span>}
      </div>;
    })}</div>}
  </Panel></Localized>;
}

const preferenceCopies: Record<string, { title: string; description: string }> = {
  SECURITY_EVENT: { title: '보안 및 로그인', description: '새로운 로그인이나 보안 관련 변경을 알려드립니다.' },
  CASE_UPDATED: { title: '문의 답변', description: '문의 상태가 바뀌거나 답변이 등록되면 알려드립니다.' },
  COMPETITION: { title: '대회 소식', description: '참여 중인 대회의 주요 일정과 결과를 알려드립니다.' },
  BOT_STATUS: { title: '봇 상태', description: '운영 중인 봇에 확인이 필요한 변화가 생기면 알려드립니다.' },
  BACKTEST_STATUS: { title: '백테스트 결과', description: '백테스트 실행이 끝나면 알려드립니다.' },
};
function notificationPreferenceCopy(typeCode: string) {
  return preferenceCopies[typeCode] ?? { title: '서비스 알림', description: '서비스 이용에 필요한 주요 소식을 알려드립니다.' };
}

function NotificationError({ error, retry }: { error: NotificationApiError; retry: () => void | Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (error.authenticationRequired) {
    // A 401 is the server working as designed, not a failure — the shared
    // sign-in state, with no correlation id: on this card it is client-minted
    // noise nobody can look up.
    return <SignInRequiredState
      detail="알림은 로그인 후 확인할 수 있습니다."
      onSignIn={() => navigate('/login', { state: { returnTo: location.pathname } })}
    />;
  }
  const message = error.retryable ? '알림 서버에 일시적으로 연결할 수 없습니다.' : '알림 요청을 처리하지 못했습니다.';
  return <ErrorState
    title={message}
    onRetry={() => void retry()}
  />;
}

function argumentText(item: NotificationRecord) {
  const entries = Object.entries(item.templateArguments);
  return entries.length === 0 ? '추가 내용 없음' : entries.map(([key, value]) => `${key}: ${value}`).join(' · ');
}
