import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { OperatorAuthenticationView } from './OperatorAuthenticationView';

const authentication = (login = vi.fn().mockResolvedValue(undefined)) => ({
  snapshot: { kind: 'unauthenticated' as const },
  login,
  reauthenticate: vi.fn(),
  logout: vi.fn(),
});

describe('operator authentication view', () => {
  test('explains the dedicated account boundary and submits password plus TOTP in Korean', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><OperatorAuthenticationView authentication={authentication(login)} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '운영자 로그인' })).toBeInTheDocument();
    expect(screen.getByText('고객 계정과 분리된 운영자 전용 계정으로 로그인합니다.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('운영자 아이디'), 'operator');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret-password');
    await userEvent.type(screen.getByLabelText('인증 앱 6자리 코드'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '운영자 로그인' }));

    expect(login).toHaveBeenCalledWith({ loginName: 'operator', password: 'secret-password', totpCode: '123456' });
  });

  test('shows a useful localized rejection without revealing which credential failed', async () => {
    const login = vi.fn().mockRejectedValue(new Error('OPERATOR_AUTHENTICATION_REJECTED'));
    render(<MemoryRouter><OperatorAuthenticationView authentication={authentication(login)} /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('운영자 아이디'), 'operator');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong-password');
    await userEvent.type(screen.getByLabelText('인증 앱 6자리 코드'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '운영자 로그인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('아이디, 비밀번호 또는 인증 앱 코드를 확인해 주세요.');
  });
});
