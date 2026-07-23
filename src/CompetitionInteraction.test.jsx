import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews.jsx';

describe('Competition discovery experience', () => {
  test('opens official competitions on a dedicated season page', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    expect(screen.queryByText('조건을 비교하고 내 봇에 맞는 Competition을 쉽게 찾아보세요.')).not.toBeInTheDocument();

    const season = screen.getByRole('button', { name: '2026 Q3 공식 대회 보러가기' });
    expect(within(season).getByRole('heading', { name: '2026 Q3 공식 시즌' })).toBeInTheDocument();
    expect(within(season).getByText('2026.07.01 – 2026.09.30')).toBeInTheDocument();
    expect(within(season).getByText('480')).toBeInTheDocument();
    expect(within(season).getByText('4개 공식 방')).toBeInTheDocument();
    expect(within(season).getByText('D-73')).toBeInTheDocument();
    expect(within(season).getByRole('progressbar', { name: '2026 Q3 시즌 진행률' })).toHaveAttribute('aria-valuenow', '21');
    expect(within(season).queryByText('LIVE')).not.toBeInTheDocument();
    expect(within(season).queryByText('언제든 참가 가능')).not.toBeInTheDocument();
    expect(within(season).queryByText('공식 방은 3개월마다 새 시즌으로 시작합니다.')).not.toBeInTheDocument();
    expect(within(season).getByText('공식 대회 보러가기')).toBeInTheDocument();

    expect(screen.queryByRole('region', { name: 'OFFICAL' })).not.toBeInTheDocument();
    expect(screen.queryByText('I2S Summer League')).not.toBeInTheDocument();

    await user.click(season);

    const official = screen.getByRole('region', { name: '2026 Q3 공식 대회 페이지' });
    expect(within(official).queryByText('운영팀이 검증한 규칙으로 진행됩니다.')).not.toBeInTheDocument();
    expect(within(official).getByRole('heading', { name: '2026 Q3 공식 대회' })).toBeInTheDocument();
    expect(within(official).getByText('18,742건')).toBeInTheDocument();
    expect(within(official).getByText('+8.73%')).toBeInTheDocument();
    const performance = within(official).getByRole('region', { name: '2026 Q3 시즌 성과 차트' });
    expect(within(performance).getByRole('img', { name: '공식 대회별 누적 수익률 추이' })).toBeInTheDocument();
    expect(within(performance).getByText('I2S Summer League')).toBeInTheDocument();
    expect(within(performance).getByText('Risk Control Cup')).toBeInTheDocument();
    expect(within(performance).getByText('ETF Sprint')).toBeInTheDocument();
    expect(within(performance).getByText('Volatility Shield')).toBeInTheDocument();
    const leaderboard = within(official).getByRole('region', { name: '2026 Q3 전체 순위' });
    expect(within(leaderboard).getByText('AlphaCore_7X')).toBeInTheDocument();
    expect(within(leaderboard).getByText('+28.47%')).toBeInTheDocument();
    expect(within(official).getAllByRole('listitem')).toHaveLength(4);

    const summerCard = within(official).getByRole('heading', { name: 'I2S Summer League' }).closest('article');
    expect(summerCard).toHaveClass('competition-discovery-card');
    expect(within(summerCard).getByText('184개')).toBeInTheDocument();
    expect(within(summerCard).getByText('6,512건')).toBeInTheDocument();
    expect(within(summerCard).getByText('+12.64%')).toBeInTheDocument();
    expect(within(summerCard).getByText('표준점수제')).toHaveAttribute('data-ranking-tone', 'standard');
    expect(within(summerCard).queryByText('OFFICIAL')).not.toBeInTheDocument();
    expect(within(summerCard).queryByText('진행 중')).not.toBeInTheDocument();
    expect(within(summerCard).queryByText('수익률과 안정성을 함께 평가하는 대표 리그')).not.toBeInTheDocument();
    expect(within(summerCard).queryByText('복합 점수')).not.toBeInTheDocument();
    expect(within(summerCard).queryByText('12일 남음')).not.toBeInTheDocument();

    expect(within(official).getByRole('button', { name: 'I2S Summer League 열기' })).toBeInTheDocument();
    expect(within(official).getByRole('button', { name: 'Risk Control Cup 열기' })).toBeInTheDocument();
    expect(within(official).getByRole('button', { name: 'ETF Sprint 열기' })).toBeInTheDocument();
    const volatilityCard = within(official).getByRole('button', { name: 'Volatility Shield 열기' });
    expect(within(volatilityCard).getByText('72개')).toBeInTheDocument();
    expect(within(volatilityCard).getByText('샤프 점수제')).toHaveAttribute('data-ranking-tone', 'sharpe');
    expect(within(official).getByText('위험조정 점수제')).toHaveAttribute('data-ranking-tone', 'risk');
    expect(within(official).getByText('수익률 점수제')).toHaveAttribute('data-ranking-tone', 'return');
    expect(within(official).queryByText('상세보기')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '내 봇에 맞는 Competition 찾기' })).not.toBeInTheDocument();

    await user.click(within(official).getByRole('button', { name: 'Competition으로' }));
    expect(screen.getByRole('heading', { name: '내 봇에 맞는 Competition 찾기' })).toBeInTheDocument();
  });

  test('uses one friendly filter panel instead of score and participant dropdowns', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    expect(screen.queryByRole('combobox', { name: '점수 방식 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '참여 인원 필터' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Competition 필터' }));
    const filters = screen.getByRole('dialog', { name: 'Competition 필터 설정' });

    await user.click(within(filters).getByRole('button', { name: '최대 낙폭 점수 방식 선택' }));
    await user.click(within(filters).getByRole('button', { name: '11명 이상 참여 인원 선택' }));

    expect(screen.getByText('ETF Discipline')).toBeInTheDocument();
    expect(screen.queryByText('Momentum Lab')).not.toBeInTheDocument();
    expect(screen.getByText('1개의 Competition')).toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: '필터 적용' }));
    expect(screen.queryByRole('dialog', { name: 'Competition 필터 설정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Competition 필터' })).toHaveTextContent('2');
  });

  test('shows ranking at the top right and four useful participation metrics without statuses', () => {
    render(<RoomsView />);

    expect(screen.queryByText('모집 상태와 점수 방식을 확인하고 상세 내용을 펼쳐보세요.')).not.toBeInTheDocument();
    expect(screen.queryByText('상세 보기에서 순위와 참여 조건을 확인할 수 있습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Competition 상태 필터' })).not.toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Competition 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    const momentumCard = within(list).getByRole('heading', { name: 'Momentum Lab' }).closest('article');
    const momentumHeader = momentumCard.querySelector('header');
    expect(within(momentumCard).getByText('참여 인원')).toBeInTheDocument();
    expect(within(momentumCard).getByText('10명')).toBeInTheDocument();
    expect(within(momentumCard).getByText('참여 봇')).toBeInTheDocument();
    expect(within(momentumCard).getByText('8개')).toBeInTheDocument();
    expect(within(momentumCard).getByText('봇당 평균 제출')).toBeInTheDocument();
    expect(within(momentumCard).getByText('4.5회')).toBeInTheDocument();
    expect(within(momentumCard).getByText('총 제출')).toBeInTheDocument();
    expect(within(momentumCard).getByText('36회')).toBeInTheDocument();
    expect(within(momentumCard).getByText('순위 산정 방식')).toBeInTheDocument();
    expect(within(momentumHeader).getByText('표준점수제')).toHaveAttribute('data-ranking-tone', 'standard');
    expect(within(momentumCard).queryByText('진행 중')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByText('모집 중')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByText('수익성과 변동성을 균형 있게 비교합니다.')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByText('복합 점수')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByText('12일 남음')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(momentumCard).queryByText('상세보기')).not.toBeInTheDocument();

    const sharpeCard = within(list).getByRole('heading', { name: 'Low Volatility Club' }).closest('article');
    expect(within(sharpeCard).getByText('샤프 점수제')).toHaveAttribute('data-ranking-tone', 'sharpe');
  });

  test('moves to a dedicated room page instead of expanding the list row', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: 'Momentum Lab 열기' }));

    const details = screen.getByRole('region', { name: 'Momentum Lab 상세 페이지' });
    expect(within(details).getByRole('heading', { name: 'Momentum Lab' })).toBeInTheDocument();
    expect(details).toHaveTextContent('사용자 대신 익명 봇만 순위에 표시됩니다.');
    expect(within(details).getByText('Room Beta')).toBeInTheDocument();
    expect(screen.queryByText('ETF Discipline')).not.toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: 'Competition 목록으로' }));
    expect(screen.getByText('ETF Discipline')).toBeInTheDocument();
  });
});
