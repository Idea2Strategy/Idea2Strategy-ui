import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews.jsx';

describe('Competition lobby', () => {
  test('summarizes the official season in one command bar', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const season = screen.getByRole('button', { name: '2026 Q3 공식 대회 보러가기' });
    expect(within(season).getByText('2026 Q3 공식 시즌')).toBeInTheDocument();
    expect(within(season).getByText('480')).toBeInTheDocument();
    expect(within(season).getByText('D-73')).toBeInTheDocument();
    expect(within(season).getByRole('progressbar', { name: '2026 Q3 시즌 진행률' })).toHaveAttribute('aria-valuenow', '21');

    await user.click(season);

    const official = screen.getByRole('region', { name: '2026 Q3 공식 대회 페이지' });
    expect(within(official).getByRole('heading', { name: '2026 Q3 공식 대회' })).toBeInTheDocument();
    expect(official.querySelector('.official-season-page-summary')).not.toBeInTheDocument();
    expect(within(official).queryByText('18,742건')).not.toBeInTheDocument();
    expect(within(official).queryByText('480개')).not.toBeInTheDocument();
    expect(within(official).queryByText('+8.73%')).not.toBeInTheDocument();
    expect(within(official).getByRole('img', { name: '공식 대회별 누적 수익률 추이' })).toBeInTheDocument();
    expect(within(official).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '공식 대회',
      '시즌 성과',
      '전체 순위',
    ]);
    const officialRooms = within(official).getByRole('region', { name: '공식 대회' });
    for (const value of ['I2S Summer League', '6,512건', '+12.64%', '+38.21%', 'Risk Control Cup', '3,742건', '+8.91%', '+26.73%', 'ETF Sprint', '5,183건', '+6.47%', '+22.18%', 'Volatility Shield', '3,305건', '-1.29%', '+11.02%']) {
      expect(within(officialRooms).getByText(value)).toBeInTheDocument();
    }

    await user.click(within(official).getByRole('button', { name: 'Competition으로' }));
    expect(screen.getByRole('heading', { name: 'Competition 찾기' })).toBeInTheDocument();
  });

  test('filters the screener immediately with compact controls', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.selectOptions(screen.getByRole('combobox', { name: '점수 방식 필터' }), '최대 낙폭');
    await user.selectOptions(screen.getByRole('combobox', { name: '참여 인원 필터' }), 'large');

    const results = screen.getByRole('list', { name: 'Competition 탐색 결과' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(1);
    expect(within(results).getByRole('listitem', { name: 'ETF Discipline 선택' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'ETF Discipline 선택 정보' })).toBeInTheDocument();
  });

  test('selects a row and updates the fixed inspector', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const results = screen.getByRole('list', { name: 'Competition 탐색 결과' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(4);

    await user.click(within(results).getByRole('listitem', { name: 'Low Volatility Club 선택' }));

    const inspector = screen.getByRole('complementary', { name: 'Low Volatility Club 선택 정보' });
    expect(within(inspector).getByRole('heading', { name: 'Low Volatility Club' })).toBeInTheDocument();
    expect(within(inspector).getByText('24개')).toBeInTheDocument();
    expect(within(inspector).getByText('30명')).toBeInTheDocument();
    expect(within(inspector).getByText('2.5회')).toBeInTheDocument();
    expect(within(inspector).getByText('60회')).toBeInTheDocument();
    expect(within(inspector).getByText('샤프 점수제')).toHaveAttribute('data-ranking-tone', 'sharpe');
  });

  test('opens the selected Competition on a dedicated detail page', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));

    const details = screen.getByRole('region', { name: 'Momentum Lab 상세 페이지' });
    expect(within(details).getByRole('heading', { name: 'Momentum Lab' })).toBeInTheDocument();
    expect(details).toHaveTextContent('사용자 대신 익명 봇만 순위에 표시됩니다.');
    expect(within(details).getByText('Room Beta')).toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: 'Competition 목록으로' }));
    expect(screen.getByRole('heading', { name: 'Competition 찾기' })).toBeInTheDocument();
  });
});
