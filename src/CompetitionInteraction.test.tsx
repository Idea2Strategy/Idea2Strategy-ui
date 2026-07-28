import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews';

describe('Competition lobby', () => {
  test('opens a compact competition creation dialog without helper copy', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: '대회 만들기' }));

    const dialog = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(within(dialog).getByLabelText('대회 이름')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('대회 설명')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('시작일')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('종료일')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '채점 방식' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('시작 자본')).toBeInTheDocument();
    expect(within(dialog).queryByText('같은 조건에서 봇을 비교할 새로운 대회를 설정합니다.')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('선택한 방식으로 참가 봇의 순위를 계산합니다.')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('모든 참가 봇에 동일하게 적용됩니다.')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '대회 만들기' })).not.toBeInTheDocument();
  });

  test('keeps generated official-card artwork isolated to concept two', () => {
    const { container, rerender } = render(<RoomsView />);
    const defaultSummerCard = screen.getByRole('button', { name: 'I2S Summer League 열기' });

    expect(container.querySelector('.competition-concept-v2')).not.toBeInTheDocument();
    expect(defaultSummerCard).not.toHaveAttribute('data-card-art');

    rerender(<RoomsView visualVariant="image" />);
    const conceptSummerCard = screen.getByRole('button', { name: 'I2S Summer League 열기' });

    expect(container.querySelector('.competition-concept-v2')).toBeInTheDocument();
    expect(conceptSummerCard).toHaveAttribute('data-card-art', 'i2s-summer-league');
    expect(conceptSummerCard).toHaveClass('has-generated-art');
  });

  test('shows official competitions in a focused five-card carousel', () => {
    render(<RoomsView />);

    // The official rooms stay on the lobby without the old filter or framed
    // grid. One room is primary while two neighbours remain visible per side.
    expect(screen.getByRole('heading', { name: '공식 대회' })).toBeInTheDocument();
    expect(screen.getByText('OFFICIAL')).toBeInTheDocument();
    expect(screen.queryByText(/LIVE/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공식 대회 전체 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '공식 대회 참여 상태 필터' })).not.toBeInTheDocument();

    const carousel = screen.getByRole('region', { name: '공식 대회 캐러셀' });
    const officialRooms = within(carousel).getByRole('list', { name: '공식 대회 목록' });
    expect(within(officialRooms).getAllByRole('listitem')).toHaveLength(5);

    const summer = within(carousel).getByRole('button', { name: 'I2S Summer League 열기' });
    expect(summer).toHaveAttribute('aria-current', 'true');
    expect(within(summer).getByText('표준점수제')).toBeInTheDocument();
    expect(within(summer).queryByText('1위')).not.toBeInTheDocument();
    expect(within(summer).getByText('수익성과 안정성을 함께 평가하는 공식 시즌 대회입니다.')).toBeInTheDocument();
    expect(summer.querySelector('.official-card-schedule')).toHaveTextContent('07.01–09.30·65일 남음');
    expect(summer.querySelector('.official-card-schedule-separator')).toHaveTextContent('·');
    expect(within(summer).getByText('참여 봇 184개')).toBeInTheDocument();
    expect(summer.querySelector('.official-card-arrow')).toHaveAttribute('aria-hidden', 'true');
    expect(within(summer).queryByText('복합 점수 · 3개월')).not.toBeInTheDocument();

    const alpha = within(carousel).getByRole('button', { name: 'Alpha Dash 앞으로 이동' });
    expect(within(alpha).queryByText('미참가')).not.toBeInTheDocument();
    expect(within(carousel).queryByText('3위')).not.toBeInTheDocument();
    expect(within(carousel).getByRole('button', { name: '이전 공식 대회' })).toBeInTheDocument();
    expect(within(carousel).getByRole('button', { name: '다음 공식 대회' })).toBeInTheDocument();
    expect(within(carousel).getAllByRole('button', { name: /공식 대회 보기/ })).toHaveLength(6);
  });

  test('moves the official carousel with arrows and pagination', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const carousel = screen.getByRole('region', { name: '공식 대회 캐러셀' });
    await user.click(within(carousel).getByRole('button', { name: '다음 공식 대회' }));
    expect(within(carousel).getByRole('button', { name: 'Dividend Marathon 열기' })).toHaveAttribute('aria-current', 'true');

    await user.click(within(carousel).getByRole('button', { name: 'ETF Sprint 공식 대회 보기' }));
    const etf = within(carousel).getByRole('button', { name: 'ETF Sprint 열기' });
    expect(etf).toHaveAttribute('aria-current', 'true');
    expect(within(etf).getByText('5일 남음')).toHaveClass('is-urgent');
    expect(etf.querySelector('.official-card-schedule')).toHaveTextContent('07.21–08.01·5일 남음');
  });

  test('moves only one step when an outer official card is selected', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const carousel = screen.getByRole('region', { name: '공식 대회 캐러셀' });
    await user.click(within(carousel).getByRole('button', { name: 'Alpha Dash 앞으로 이동' }));

    expect(within(carousel).getByRole('button', { name: 'Risk Control Cup 열기' })).toHaveAttribute('aria-current', 'true');
    expect(within(carousel).queryByRole('button', { name: 'Alpha Dash 열기' })).not.toBeInTheDocument();
  });

  test('explains scoring and presents the four shared conditions on detail pages', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'I2S Summer League 열기' }));

    const detail = screen.getByRole('region', { name: 'I2S Summer League 상세 페이지' });
    const scoringHelp = within(detail).getByRole('button', { name: '표준점수제 계산 방식 보기' });
    expect(scoringHelp).toHaveAttribute('aria-describedby', 'competition-scoring-tooltip');
    expect(within(detail).getByRole('tooltip')).toHaveTextContent('표준화한 뒤 대회 가중치');
    expect(within(detail).getByRole('heading', { name: 'I2S Summer League 대회 안내' })).toBeInTheDocument();
    const directSections = [...detail.children].map((element) => element.className);
    expect(directSections.indexOf('competition-detail-guide'))
      .toBeLessThan(directSections.indexOf('competition-detail-summary'));

    const conditions = within(detail).getByLabelText('I2S Summer League 공통 조건');
    expect(within(conditions).getAllByRole('listitem')).toHaveLength(4);
    expect(within(conditions).getByText('시작 자본')).toBeInTheDocument();
    expect(within(conditions).getByText('종목 범위')).toBeInTheDocument();
    expect(within(conditions).getByText('수수료')).toBeInTheDocument();
    expect(within(conditions).getByText('슬리피지')).toBeInTheDocument();
    expect(within(conditions).queryByText('비교 기준')).not.toBeInTheDocument();
    expect(within(conditions).queryByText('체결·비용')).not.toBeInTheDocument();
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
    expect(details).toHaveTextContent('모든 참가 봇은 동일한 시장 데이터와 체결 조건을 적용받습니다.');
    expect(within(details).getByText('Room Beta')).toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: '대회 목록으로' }));
    expect(screen.getByRole('heading', { name: '대회 찾기' })).toBeInTheDocument();
  });
});
