import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews.jsx';

describe('Competition lobby', () => {
  test('shows official competitions in a responsive closing-soonest grid', () => {
    render(<RoomsView />);

    // The official rooms stay on the lobby: no duplicate LIVE label, separate
    // overview action, shared progress bar, or horizontal carousel.
    expect(screen.getByRole('heading', { name: '공식 대회' })).toBeInTheDocument();
    expect(screen.getByText('OFFICIAL')).toBeInTheDocument();
    expect(screen.queryByText(/LIVE/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공식 대회 전체 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    const officialRooms = screen.getByRole('list', { name: '공식 대회 목록' });
    expect(within(officialRooms).getAllByRole('button').map((card) => card.getAttribute('aria-label'))).toEqual([
      'ETF Sprint 열기',
      'Alpha Dash 열기',
      'Risk Control Cup 열기',
      'I2S Summer League 열기',
      'Dividend Marathon 열기',
      'Volatility Shield 열기',
    ]);

    const summer = screen.getByRole('button', { name: 'I2S Summer League 열기' });
    expect(within(summer).getByText('표준점수제')).toBeInTheDocument();
    expect(within(summer).getByText('1위')).toBeInTheDocument();
    expect(summer.querySelector('.official-card-schedule')).toHaveTextContent('07.01–09.30·65일 남음');
    expect(summer.querySelector('.official-card-schedule-separator')).toHaveTextContent('·');
    expect(within(summer).getByText('참여 봇 184개')).toBeInTheDocument();
    expect(summer.querySelector('.official-card-arrow')).toHaveAttribute('aria-hidden', 'true');
    expect(within(summer).queryByText('복합 점수 · 3개월')).not.toBeInTheDocument();

    const etf = screen.getByRole('button', { name: 'ETF Sprint 열기' });
    expect(within(etf).getByText('2위')).toBeInTheDocument();
    expect(within(etf).getByText('5일 남음')).toHaveClass('is-urgent');
    expect(etf.querySelector('.official-card-schedule')).toHaveTextContent('07.21–08.01·5일 남음');
    const alpha = screen.getByRole('button', { name: 'Alpha Dash 열기' });
    expect(within(alpha).getByText('미참가')).toBeInTheDocument();
  });

  test('filters official competitions by participation state', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const filters = screen.getByRole('group', { name: '공식 대회 참여 상태 필터' });
    const officialRooms = screen.getByRole('list', { name: '공식 대회 목록' });
    const allFilter = within(filters).getByRole('button', { name: '전체 6' });
    const joinedFilter = within(filters).getByRole('button', { name: '참가 4' });
    const unjoinedFilter = within(filters).getByRole('button', { name: '미참가 2' });

    expect(allFilter).toHaveAttribute('aria-pressed', 'true');
    expect(within(officialRooms).getAllByRole('listitem')).toHaveLength(6);

    await user.click(joinedFilter);
    expect(joinedFilter).toHaveAttribute('aria-pressed', 'true');
    expect(within(officialRooms).getAllByRole('listitem')).toHaveLength(4);
    expect(within(officialRooms).queryByRole('button', { name: 'Alpha Dash 열기' })).not.toBeInTheDocument();
    expect(within(officialRooms).getByRole('button', { name: 'I2S Summer League 열기' })).toBeInTheDocument();

    await user.click(unjoinedFilter);
    expect(unjoinedFilter).toHaveAttribute('aria-pressed', 'true');
    expect(within(officialRooms).getAllByRole('listitem')).toHaveLength(2);
    expect(within(officialRooms).getByRole('button', { name: 'Alpha Dash 열기' })).toBeInTheDocument();
    expect(within(officialRooms).getByRole('button', { name: 'Risk Control Cup 열기' })).toBeInTheDocument();
    expect(within(officialRooms).queryByRole('button', { name: 'ETF Sprint 열기' })).not.toBeInTheDocument();
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

  test('filters rooms by participation and highlights the seven-day deadline', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    const earnings = within(results).getByRole('listitem', { name: 'Earnings Play 선택' });
    expect(within(earnings).getByText('7일 남음')).toHaveClass('is-urgent');
    expect(earnings).toHaveTextContent('07.22–08.12·7일 남음');

    const participationFilter = screen.getByRole('combobox', { name: '참가 상태 필터' });
    await user.selectOptions(participationFilter, 'joined');
    expect(within(results).getAllByRole('listitem')).toHaveLength(1);
    expect(within(results).getByRole('listitem', { name: 'Momentum Lab 선택' })).toBeInTheDocument();

    await user.selectOptions(participationFilter, 'unjoined');
    expect(within(results).queryByRole('listitem', { name: 'Momentum Lab 선택' })).not.toBeInTheDocument();
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
