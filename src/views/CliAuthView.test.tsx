import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CliAuthView } from './CliAuthView';

type StubApi = {
  approve: ReturnType<typeof vi.fn<(userCode: string) => Promise<void>>>;
  deny: ReturnType<typeof vi.fn<(userCode: string) => Promise<void>>>;
};

const renderAt = (path: string, api: StubApi) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CliAuthView api={api} />
    </MemoryRouter>,
  );

describe('CliAuthView', () => {
  const api = (): StubApi => ({
    approve: vi.fn<(userCode: string) => Promise<void>>().mockResolvedValue(undefined),
    deny: vi.fn<(userCode: string) => Promise<void>>().mockResolvedValue(undefined),
  });

  it('never approves from the address alone', () => {
    const client = api();

    renderAt('/cli-auth?code=ABCD-EFGH', client);

    expect(client.approve).not.toHaveBeenCalled();
    expect(screen.getByLabelText('코드')).toHaveValue('ABCD-EFGH');
  });

  it('approves the code the person confirmed', async () => {
    const client = api();
    renderAt('/cli-auth?code=ABCD-EFGH', client);

    await userEvent.click(screen.getByRole('button', { name: '승인' }));

    expect(client.approve).toHaveBeenCalledWith('ABCD-EFGH');
    expect(await screen.findByText('터미널에 로그인했습니다')).toBeInTheDocument();
  });

  it('denies without approving', async () => {
    const client = api();
    renderAt('/cli-auth?code=ABCD-EFGH', client);

    await userEvent.click(screen.getByRole('button', { name: '거절' }));

    expect(client.deny).toHaveBeenCalledWith('ABCD-EFGH');
    expect(client.approve).not.toHaveBeenCalled();
  });

  it('explains a code that can no longer be approved', async () => {
    const client = api();
    client.approve.mockRejectedValue(new Error('CODE_NOT_PENDING'));
    renderAt('/cli-auth?code=ABCD-EFGH', client);

    await userEvent.click(screen.getByRole('button', { name: '승인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시작');
  });
});
