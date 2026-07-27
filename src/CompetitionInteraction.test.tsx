import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews';

describe('Competition lobby', () => {
  test('shows official competitions as a compact badge-led showcase, each on its own calendar', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    // The showcase is on the lobby itself. There is no shared season frame:
    // no page-level progress bar or D-day — each card carries its own period.
    expect(screen.getByRole('heading', { name: '공식 대회' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    for (const name of ['I2S Summer League', 'Risk Control Cup', 'ETF Sprint', 'Volatility Shield', 'Dividend Marathon', 'Alpha Dash']) {
      expect(screen.getByRole('button', { name: `${name} 열기` })).toBeInTheDocument();
    }
    const summer = screen.getByRole('button', { name: 'I2S Summer League 열기' });
    expect(within(summer).getByText('표준점수제')).toBeInTheDocument();
    expect(within(summer).getByText('복합 점수 · 3개월')).toBeInTheDocument();
    expect(within(summer).getByText('07.01–09.30')).toBeInTheDocument();
    expect(within(summer).getByText('D-65')).toBeInTheDocument();
    // The stat block is gone from cards — stats live on the detail page.
    expect(within(summer).queryByText('총 제출')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '공식 대회 전체 보기' }));

    const official = screen.getByRole('region', { name: '공식 대회 페이지' });
    expect(within(official).getByRole('heading', { level: 1, name: '공식 대회' })).toBeInTheDocument();
    expect(within(official).getByRole('img', { name: '공식 대회별 누적 수익률 추이' })).toBeInTheDocument();
    expect(within(official).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '진행 중인 대회',
      '누적 성과',
      '전체 순위',
    ]);
    const officialRooms = within(official).getByRole('region', { name: '진행 중인 대회' });
    for (const value of ['Volatility Shield', '샤프 지수 · 1년', '01.02–12.30', 'D-156', 'Alpha Dash', 'D-12']) {
      expect(within(officialRooms).getByText(value)).toBeInTheDocument();
    }

    await user.click(within(official).getByRole('button', { name: '대회 홈으로' }));
    expect(screen.getByRole('heading', { name: '대회 찾기' })).toBeInTheDocument();
  });

  test('filters the screener immediately with compact controls', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.selectOptions(screen.getByRole('combobox', { name: '점수 방식 필터' }), '최대 낙폭');
    await user.selectOptions(screen.getByRole('combobox', { name: '참여 규모 필터' }), 'large');

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(1);
    expect(within(results).getByRole('listitem', { name: 'ETF Discipline 선택' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'ETF Discipline 순위' })).toBeInTheDocument();
  });

  test('paginates and sorts the room list', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    // 11 rooms, 5 per page, sorted by participants by default.
    const results = () => screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results()).getAllByRole('listitem')).toHaveLength(5);
    expect(within(results()).getByText('Low Volatility Club')).toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: '대회 목록 페이지' });
    expect(within(pager).getByRole('button', { name: '이전 페이지' })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: '다음 페이지' }));
    expect(within(results()).queryByText('Low Volatility Club')).not.toBeInTheDocument();
    await user.click(within(pager).getByRole('button', { name: '다음 페이지' }));
    expect(within(pager).getByRole('button', { name: '다음 페이지' })).toBeDisabled();

    // Sorting is on the column headers, list-view convention: click sorts,
    // clicking again flips the direction.
    await user.click(within(pager).getByRole('button', { name: '이전 페이지' }));
    await user.click(within(pager).getByRole('button', { name: '이전 페이지' }));
    await user.click(screen.getByRole('button', { name: '대회 이름 정렬' }));
    expect(within(results()).getByText('Dividend Guard')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '대회 이름 정렬' }));
    expect(within(results()).queryByText('Dividend Guard')).not.toBeInTheDocument();
    expect(within(results()).getByText('Swing Lab 12')).toBeInTheDocument();
  });

  test('the right panel shows the selected room ranking, aware of participation', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    // Momentum Lab is the room my bot competes in: my standing leads. The bot
    // and its rank appear twice by design — the standing card and its row.
    const mine = screen.getByRole('complementary', { name: 'Momentum Lab 순위' });
    expect(within(mine).getAllByText('Room Beta')).toHaveLength(2);
    expect(within(mine).getAllByText('#2')).toHaveLength(2);
    expect(within(mine).queryByText(/아직 참가하지 않은 대회/)).not.toBeInTheDocument();

    // A room I have not joined shows its top bots plus the join hint instead.
    await user.click(screen.getByRole('listitem', { name: 'Low Volatility Club 선택' }));
    const inspector = screen.getByRole('complementary', { name: 'Low Volatility Club 순위' });
    expect(within(inspector).getByRole('heading', { name: 'Low Volatility Club' })).toBeInTheDocument();
    expect(within(inspector).getByText(/아직 참가하지 않은 대회/)).toBeInTheDocument();
    expect(within(inspector).getByRole('list', { name: 'Low Volatility Club 상위 순위' })).toBeInTheDocument();
    // The row facts (host, period, counts) are not repeated in the panel.
    expect(within(inspector).queryByText('차분한투자')).not.toBeInTheDocument();
  });

  test('opens the selected Competition on a dedicated detail page', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));

    const details = screen.getByRole('region', { name: 'Momentum Lab 상세 페이지' });
    expect(within(details).getByRole('heading', { name: 'Momentum Lab' })).toBeInTheDocument();
    expect(details).toHaveTextContent('사용자 대신 익명 봇만 순위에 표시됩니다.');
    expect(within(details).getByText('Room Beta')).toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: '대회 목록으로' }));
    expect(screen.getByRole('heading', { name: '대회 찾기' })).toBeInTheDocument();
  });
});
