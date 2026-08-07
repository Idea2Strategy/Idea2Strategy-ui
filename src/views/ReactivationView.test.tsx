import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AccountClient } from '../api/account';
import { LanguageProvider } from '../lib/i18n';
import { ReactivationView } from './AuthViews';

describe('signed-out account reactivation', () => {
  it('submits the exact required policy ids only after explicit acceptance', async () => {
    const reactivateWithPassword = vi.fn().mockResolvedValue({
      accountId: 'account-1', status: 'ACTIVE', version: 3,
      withdrawalRequestedAt: null, cancellationDeadlineAt: null, applied: true,
    });
    const client = {
      reactivationPolicies: vi.fn().mockResolvedValue([{
        id: 'policy-1', policyCode: 'TERMS', version: '2', languageCode: 'ko',
        title: '이용약관', contentFormat: 'text/markdown', contentText: '필수 약관',
        contentHash: 'sha256:terms', required: true,
        publishedAt: '2026-08-07T00:00:00Z', retiredAt: null,
      }]),
      reactivateWithPassword,
    } as unknown as AccountClient;

    render(<LanguageProvider><MemoryRouter><ReactivationView client={client} /></MemoryRouter></LanguageProvider>);

    expect(await screen.findByRole('heading', { name: '계정 재활성화' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('재활성화 이메일'), { target: { value: 'dormant@example.com' } });
    fireEvent.change(screen.getByLabelText('재활성화 비밀번호'), { target: { value: 'correct horse battery staple' } });
    const submit = screen.getByRole('button', { name: '계정 재활성화' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    fireEvent.click(submit);

    await waitFor(() => expect(reactivateWithPassword).toHaveBeenCalledWith(
      'dormant@example.com', 'correct horse battery staple', ['policy-1'], expect.any(String),
    ));
    expect(await screen.findByText('계정을 다시 활성화했습니다. 로그인해 주세요.')).toBeInTheDocument();
  });
});
