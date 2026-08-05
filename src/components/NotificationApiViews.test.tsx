import { render as renderBare, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// The 401 state navigates to /login, so renders need a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationApiError } from '../api/notifications';
import type { NotificationClient, NotificationRecord } from '../api/notifications';
import { NotificationCenter, NotificationPreferencesPanel } from './NotificationApiViews';

const unread: NotificationRecord = {
  id: 'notification-1', typeCode: 'CASE_UPDATED', mandatory: false, templateVersion: 'v1', locale: 'ko-KR',
  templateArguments: { caseId: 'case-1' }, createdAt: '2026-08-03T00:00:00Z', readAt: null,
};

function client(overrides: Partial<NotificationClient> = {}): NotificationClient {
  return {
    list: vi.fn().mockResolvedValue({ items: [unread], nextCreatedAt: null, nextId: null }),
    markRead: vi.fn().mockResolvedValue(undefined),
    preferences: vi.fn().mockResolvedValue([]),
    replacePreference: vi.fn(),
    ...overrides,
  };
}

describe('NotificationCenter', () => {
  it('renders only server-owned fields and marks an item read after the server succeeds', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    render(<NotificationCenter client={client({ markRead })} />);
    expect(await screen.findByText('caseId: case-1')).toBeInTheDocument();
    expect(screen.getByText('템플릿 v1 · ko-KR')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /읽음/ }));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('notification-1'));
    expect(screen.queryByRole('button', { name: /읽음/ })).not.toBeInTheDocument();
  });

  it('uses the exact paired cursor and de-duplicates a repeated boundary row', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ items: [unread], nextCreatedAt: unread.createdAt, nextId: unread.id })
      .mockResolvedValueOnce({ items: [unread, { ...unread, id: 'notification-2', typeCode: 'SECURITY_EVENT' }], nextCreatedAt: null, nextId: null });
    render(<NotificationCenter client={client({ list })} />);
    await userEvent.click(await screen.findByRole('button', { name: '이전 알림 더 보기' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ beforeCreatedAt: unread.createdAt, beforeId: unread.id }));
    expect(screen.getAllByText('CASE_UPDATED')).toHaveLength(2); // type label + heading, not a duplicate row
    expect(screen.getAllByText('SECURITY_EVENT')).toHaveLength(2);
  });

  it('shows authentication and correlation state without falling back to mock data', async () => {
    render(<NotificationCenter client={client({ list: vi.fn().mockRejectedValue(new NotificationApiError(400, 'INVALID_NOTIFICATION_REQUEST', 'corr-auth')) })} />);
    expect(await screen.findByText('로그인이 필요합니다')).toBeInTheDocument();
    expect(screen.getByText(/문의 코드 corr-auth/)).toBeInTheDocument();
    expect(screen.queryByText('CASE_UPDATED')).not.toBeInTheDocument();
  });
});

describe('NotificationPreferencesPanel', () => {
  it('keeps mandatory channels immutable and lets an optional current EMAIL channel be disabled', async () => {
    const preferences = [
      { typeCode: 'SECURITY_EVENT', policyVersion: 'policy-v1', mandatory: true, enabledChannels: ['APP'] as const },
      { typeCode: 'CASE_UPDATED', policyVersion: 'policy-v2', mandatory: false, enabledChannels: ['APP', 'EMAIL'] as const },
    ].map((value) => ({ ...value, enabledChannels: [...value.enabledChannels] }));
    const replacePreference = vi.fn().mockResolvedValue({ ...preferences[1], enabledChannels: ['APP'] });
    render(<NotificationPreferencesPanel client={client({ preferences: vi.fn().mockResolvedValue(preferences), replacePreference })} />);
    expect(await screen.findByText('필수')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이메일 끄기' }));
    await waitFor(() => expect(replacePreference).toHaveBeenCalledWith('CASE_UPDATED', ['APP']));
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });
});
