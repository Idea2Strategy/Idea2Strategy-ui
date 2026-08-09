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
    emailPreference: vi.fn().mockResolvedValue({ enabled: false }),
    replaceEmailPreference: vi.fn().mockResolvedValue({ enabled: true }),
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

  it('shows the sign-in state without raw codes and without falling back to mock data', async () => {
    render(<NotificationCenter client={client({ list: vi.fn().mockRejectedValue(new NotificationApiError(400, 'INVALID_NOTIFICATION_REQUEST', 'corr-auth')) })} />);
    expect(await screen.findByText('로그인이 필요합니다')).toBeInTheDocument();
    // The correlation id is client-minted noise on this card — never shown.
    expect(screen.queryByText(/corr-auth/)).not.toBeInTheDocument();
    expect(screen.queryByText('CASE_UPDATED')).not.toBeInTheDocument();
  });
});

describe('NotificationPreferencesPanel', () => {
  it('shows one friendly account-wide toggle and trusts the saved server response', async () => {
    const replaceEmailPreference = vi.fn().mockResolvedValue({ enabled: true });
    render(<NotificationPreferencesPanel client={client({ replaceEmailPreference })} />);
    expect(await screen.findByRole('heading', { name: '이메일 알림' })).toBeInTheDocument();
    expect(screen.queryByText(/SECURITY_EVENT|CASE_UPDATED|policy-v/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: '이메일 알림 받기' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(replaceEmailPreference).toHaveBeenCalledWith(true));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('저장 완료')).toBeInTheDocument();
    expect(screen.getByText('중요한 보안 안내는 이 설정과 관계없이 발송될 수 있습니다.')).toBeInTheDocument();
  });

  it('retries a failed load and never renders an empty settings card', async () => {
    const emailPreference = vi.fn()
      .mockRejectedValueOnce(new NotificationApiError(503, 'UNAVAILABLE', 'corr-load'))
      .mockResolvedValueOnce({ enabled: false });
    render(<NotificationPreferencesPanel client={client({ emailPreference })} />);
    expect(await screen.findByText('알림 서버에 일시적으로 연결할 수 없습니다.')).toBeInTheDocument();
    const unavailableToggle = screen.getByRole('switch', { name: '이메일 알림 받기' });
    expect(unavailableToggle).toBeDisabled();
    expect(screen.getByText('확인 필요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    const availableToggle = await screen.findByRole('switch', { name: '이메일 알림 받기' });
    expect(availableToggle).toBeEnabled();
    expect(availableToggle).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the previous value when saving fails', async () => {
    const replaceEmailPreference = vi.fn().mockRejectedValue(new NotificationApiError(503, 'UNAVAILABLE', 'corr-save'));
    render(<NotificationPreferencesPanel client={client({ replaceEmailPreference })} />);
    const toggle = await screen.findByRole('switch', { name: '이메일 알림 받기' });
    await userEvent.click(toggle);
    expect(await screen.findByText('변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
