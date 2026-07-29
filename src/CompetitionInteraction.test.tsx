import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews';

const balancedStyles = readFileSync('src/styles/balanced.css', 'utf8');

describe('Competition lobby', () => {
  test('uses color emphasis without check icons for progress and scoring filters', () => {
    const { container } = render(<RoomsView />);

    expect(container.querySelector('.competition-filter-statuses svg')).not.toBeInTheDocument();
    expect(container.querySelector('.competition-filter-scores svg')).not.toBeInTheDocument();
  });

  test('uses the shared primary-page heading rhythm and divider', () => {
    const competitionHeadingRule = balancedStyles.match(
      /\.variant-balanced\[data-design="signal-studio"\] \.competition-lobby-page > \.page-heading \{([\s\S]*?)\}/,
    )?.[1] ?? '';

    expect(competitionHeadingRule).toContain('max-width: 1232px');
    expect(competitionHeadingRule).toContain('margin-inline: auto');
    expect(competitionHeadingRule).not.toContain('padding-block');
    expect(competitionHeadingRule).not.toContain('border-bottom: 0');
    expect(balancedStyles).not.toMatch(
      /\.competition-lobby-page \.page-heading \{\s*margin-bottom:\s*0;\s*\}/,
    );
    /* [^}] keeps the match inside the one rule block: with [\s\S] the lazy
       span crossed rule boundaries and any unrelated margin-bottom: 12px
       thousands of lines later failed this assertion. */
    expect(balancedStyles).not.toMatch(
      /\.competition-page \.page-heading \{[^}]*?margin-bottom:\s*12px;[^}]*?\}/,
    );
  });

  test('places the competition create action in the page heading', async () => {
    const user = userEvent.setup();
    const { container } = render(<RoomsView />);

    const heading = container.querySelector('.competition-lobby-page > .page-heading');
    expect(heading).not.toBeNull();
    const createButton = within(heading as HTMLElement).getByRole('button', { name: '대회 만들기' });

    await user.click(createButton);
    const dialog = screen.getByRole('dialog', { name: '대회 만들기' });
    expect(within(dialog).getByLabelText('대회 이름')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('대회 설명')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('시작일')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('종료일')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '채점 방식' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('시작 자본')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '채점 방식 도움말' })).not.toBeInTheDocument();

    const detailSettings = within(dialog).getByRole('button', { name: '대회 세부 설정' });
    expect(detailSettings).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByLabelText('종목 범위')).not.toBeInTheDocument();
    await user.click(detailSettings);
    expect(detailSettings).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByLabelText('종목 범위')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('참가 봇 한도')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('수수료')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('슬리피지')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '대회 만들기' })).not.toBeInTheDocument();
  });

  test('removes the official carousel and keeps official competitions pinned in the board', () => {
    render(<RoomsView />);

    expect(screen.queryByRole('region', { name: '공식 대회 캐러셀' })).not.toBeInTheDocument();

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getByRole('heading', { name: '공식 대회' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 Backtesting Challenge 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 I2S Summer League 열기' })).not.toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 Risk Control Cup 열기' })).not.toBeInTheDocument();
  });

  test('filters immediately with a consistent left filter panel', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const filter = screen.getByRole('complementary', { name: '대회 필터' });
    expect(within(filter).queryByRole('button', { name: /결과 보기/ })).not.toBeInTheDocument();

    const participation = within(filter).getByRole('group', { name: '참가 상태' });
    expect(within(participation).getAllByRole('radio')[0]).toHaveAccessibleName('전체');
    await user.click(within(participation).getByRole('radio', { name: '참가 중' }));

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getByRole('button', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 Backtesting Challenge 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 I2S Summer League 열기' })).not.toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: 'ETF Discipline 열기' })).not.toBeInTheDocument();

    await user.click(within(participation).getByRole('radio', { name: '전체' }));
    const scoring = within(filter).getByRole('group', { name: '채점 방식' });
    await user.click(within(scoring).getByRole('checkbox', { name: '표준점수제' }));
    expect(within(results).getByRole('button', { name: 'Macro Pulse 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: 'ETF Discipline 열기' })).not.toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
  });

  test('defaults to recruiting, switches to running, and removes bot registration', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const filter = screen.getByRole('complementary', { name: '대회 필터' });
    const progress = within(filter).getByRole('group', { name: '진행 상태' });
    expect(within(progress).queryByRole('radio', { name: '봇 등록' })).not.toBeInTheDocument();
    expect(within(progress).getByRole('radio', { name: '모집 중' })).toBeChecked();

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getByRole('button', { name: 'ETF Discipline 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: 'Momentum Lab 열기' })).not.toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 I2S Summer League 열기' })).not.toBeInTheDocument();

    await user.click(within(progress).getByRole('radio', { name: '대회 진행 중' }));
    expect(within(results).getByRole('button', { name: 'Momentum Lab 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: 'ETF Discipline 열기' })).not.toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 I2S Summer League 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 ETF Sprint 열기' })).not.toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: '공식 대회 Backtesting Challenge 열기' })).not.toBeInTheDocument();

    const remaining = within(filter).getByRole('group', { name: '남은 기간' });
    expect(within(remaining).getAllByRole('radio')[0]).toHaveAccessibleName('전체');
    await user.click(within(remaining).getByRole('radio', { name: '7일 이내' }));
    expect(within(results).queryByRole('button', { name: 'Momentum Lab 열기' })).not.toBeInTheDocument();
    const earnings = within(results).getByRole('button', { name: 'Earnings Play 열기' });
    expect(within(earnings).getByText('D-7')).toHaveClass('is-urgent');
  });

  test('changes the page size and keeps compact pagination', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(7);

    const pageSize = screen.getByRole('combobox', { name: '페이지당 표시 개수' });
    const generalGroup = within(results).getByRole('group', { name: '일반 대회 목록' });
    expect(within(generalGroup).getByRole('combobox', { name: '페이지당 표시 개수' })).toBe(pageSize);
    expect(within(pageSize).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '10개씩 보기',
      '20개씩 보기',
      '30개씩 보기',
    ]);
    await user.selectOptions(pageSize, '20');
    expect(within(results).getAllByRole('listitem')).toHaveLength(7);

    expect(screen.getByRole('navigation', { name: '대회 목록 페이지' })).toBeInTheDocument();
    expect(screen.queryByText('11개 결과')).not.toBeInTheDocument();
  });

  test('prioritizes scoring and period while keeping the official room pinned', () => {
    render(<RoomsView />);

    const board = screen.getByRole('region', { name: '대회 게시판' });
    expect(within(board).queryByRole('heading', { name: '대회 게시판' })).not.toBeInTheDocument();
    const headers = within(board).getAllByRole('button', { name: /정렬/ });
    expect(headers.map((header) => header.getAttribute('aria-label'))).toEqual([
      '채점 방식 정렬',
      '대회 제목 정렬',
      '기간 정렬',
      '참여 봇 수 정렬',
    ]);
    expect(within(board).queryByRole('button', { name: '대회 상태 정렬' })).not.toBeInTheDocument();
    expect(within(board).getByRole('button', { name: '기간 정렬' })).toHaveClass('is-sorted');

    const results = within(board).getByRole('list', { name: '대회 탐색 결과' });
    const officialGroup = within(results).getByRole('group', { name: '공식 대회 목록' });
    const generalGroup = within(results).getByRole('group', { name: '일반 대회 목록' });
    expect(within(officialGroup).getByRole('heading', { name: '공식 대회' })).toBeInTheDocument();
    expect(within(generalGroup).getByRole('heading', { name: '일반 대회' })).toBeInTheDocument();
    expect(within(officialGroup).getByText('대회 제목')).toBeInTheDocument();
    expect(within(officialGroup).getByText('기간')).toBeInTheDocument();
    expect(within(officialGroup).queryByText('진행률')).not.toBeInTheDocument();
    expect(within(officialGroup).getByText('참여 봇 수')).toBeInTheDocument();
    expect(within(officialGroup).getByText('채점 방식')).toBeInTheDocument();
    expect(within(officialGroup).queryByText('OFFICIAL')).not.toBeInTheDocument();
    expect(within(generalGroup).queryByText('COMMUNITY')).not.toBeInTheDocument();
    expect(within(generalGroup).queryByText('5개')).not.toBeInTheDocument();
    expect(within(officialGroup).queryByRole('button', { name: /정렬/ })).not.toBeInTheDocument();
    expect(within(generalGroup).getAllByRole('button', { name: /정렬/ })).toHaveLength(4);
    expect(
      officialGroup.compareDocumentPosition(generalGroup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const roomButtons = within(results).getAllByRole('button', { name: /열기/ });
    expect(roomButtons[0]).toHaveAccessibleName('공식 대회 ETF Sprint 열기');
    expect(roomButtons[1]).toHaveAccessibleName('공식 대회 Backtesting Challenge 열기');
    expect(within(roomButtons[0]).getByText('D-5')).toHaveClass('is-urgent');
    expect(within(roomButtons[0]).getByText('모집 마감까지')).toBeInTheDocument();
    expect(within(roomButtons[1]).getByText('백테스팅')).toHaveAttribute('data-ranking-tone', 'backtesting');
    expect(within(roomButtons[1]).getByText('모집 마감까지')).toBeInTheDocument();
    expect(within(officialGroup).queryByText('모집 중')).not.toBeInTheDocument();
    expect(within(officialGroup).queryByText('대회 진행 중')).not.toBeInTheDocument();
    expect(within(officialGroup).queryByText('참여 봇')).not.toBeInTheDocument();
    expect(within(officialGroup).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(officialGroup).getAllByRole('tooltip')).toHaveLength(2);
    expect(within(screen.getByRole('complementary', { name: '대회 필터' })).queryByRole('checkbox', { name: '백테스팅' })).not.toBeInTheDocument();
    expect(within(results).queryByText('◆ 공식 대회')).not.toBeInTheDocument();
    expect(within(roomButtons[0]).queryByText('07.21–08.01')).not.toBeInTheDocument();
    expect(within(roomButtons[0]).getByRole('tooltip', { name: '수익률 점수제 설명' })).toHaveTextContent('누적 수익률');
    expect(within(roomButtons[1]).getByRole('tooltip', { name: '백테스팅 설명' })).toHaveTextContent('과거 데이터');
    expect(within(roomButtons[0]).queryByText('?')).not.toBeInTheDocument();
    expect(within(roomButtons[1]).queryByText('?')).not.toBeInTheDocument();
    expect(roomButtons[2]).toHaveAccessibleName('Golden Cross Club 열기');
    expect(within(roomButtons[2]).getByText('D-25')).toBeInTheDocument();
    expect(within(roomButtons[2]).getByText('모집 마감까지')).toBeInTheDocument();
    expect(within(roomButtons[2]).getByRole('tooltip', { name: '표준점수제 설명' })).toHaveTextContent('표준화');
    expect(within(roomButtons[2]).getByText('김골든')).toBeInTheDocument();
    expect(within(roomButtons[2]).queryByText('운영자 · 김골든')).not.toBeInTheDocument();
  });

  test('uses participation-size blocks instead of a range slider', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const filter = screen.getByRole('complementary', { name: '대회 필터' });
    const sizeGroup = within(filter).getByRole('group', { name: '참여 봇 수' });
    expect(within(sizeGroup).queryByRole('slider')).not.toBeInTheDocument();
    expect(within(sizeGroup).getAllByRole('radio')).toHaveLength(4);
    expect(within(sizeGroup).getAllByRole('radio')[0]).toHaveAccessibleName('전체');
    expect(within(sizeGroup).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'all',
      '10',
      '11-50',
      '51',
    ]);
    expect(within(sizeGroup).getByRole('radio', { name: '0–10' })).toBeInTheDocument();
    expect(within(sizeGroup).getByRole('radio', { name: '11–50' })).toBeInTheDocument();
    expect(within(sizeGroup).getByRole('radio', { name: '51+' })).toBeInTheDocument();

    await user.click(within(sizeGroup).getByRole('radio', { name: '0–10' }));
    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    expect(within(results).getByRole('button', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 Backtesting Challenge 열기' })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: 'ETF Discipline 열기' })).not.toBeInTheDocument();

    await user.click(within(sizeGroup).getByRole('radio', { name: '51+' }));
    expect(within(results).queryByRole('button', { name: 'Momentum Lab 열기' })).not.toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: '공식 대회 Backtesting Challenge 열기' })).toBeInTheDocument();
  });

  test('hides room creators from the competition board', () => {
    render(<RoomsView />);

    const board = screen.getByRole('region', { name: '대회 게시판' });
    expect(within(board).queryByText('I2S 운영팀')).not.toBeInTheDocument();
    expect(within(board).queryByText('실적시즌')).not.toBeInTheDocument();
  });

  test('sorts from the list headers and opens a room detail page', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('button', { name: '대회 제목 정렬' }));
    const results = screen.getByRole('list', { name: '대회 탐색 결과' });
    const roomButtons = within(results).getAllByRole('button', { name: /열기/ });
    expect(roomButtons[2]).toHaveAccessibleName('Dividend Guard 열기');

    const progress = screen.getByRole('group', { name: '진행 상태' });
    await user.click(within(progress).getByRole('radio', { name: '대회 진행 중' }));
    await user.click(within(results).getByRole('button', { name: 'Momentum Lab 열기' }));
    const details = screen.getByRole('region', { name: 'Momentum Lab 상세 페이지' });
    expect(within(details).getByRole('heading', { name: 'Momentum Lab' })).toBeInTheDocument();
    expect(details).toHaveTextContent('Momentum Lab 참가 봇을 동일한 시장 데이터와 체결 조건에서 비교하는 모의투자 대회입니다.');
  });

  test('groups seven concise facts below the leaderboard and scoring beside its title', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(within(screen.getByRole('group', { name: '진행 상태' })).getByRole('radio', { name: '대회 진행 중' }));
    await user.click(screen.getByRole('button', { name: '공식 대회 I2S Summer League 열기' }));
    const detail = screen.getByRole('region', { name: 'I2S Summer League 상세 페이지' });
    expect(within(detail).getByRole('tooltip')).toHaveTextContent('수익률과 위험 지표를 표준화');
    expect(within(detail).queryByText('?')).not.toBeInTheDocument();
    expect(within(detail).getByText('공식 대회')).toBeInTheDocument();

    const myRanks = within(detail).getByLabelText('내 참가 봇 순위');
    const leaderboardHeading = within(detail).getByRole('heading', { name: '대회 리더보드' });
    const leaderboard = leaderboardHeading.closest('section');
    expect(leaderboard).not.toBeNull();
    expect(leaderboard!.parentElement).toHaveClass('competition-detail-rankings');
    expect(myRanks.parentElement).toBe(leaderboard!.parentElement);
    expect(within(leaderboard!).getByText('표준점수제')).toBeInTheDocument();
    expect(within(detail).queryByLabelText('I2S Summer League 대회 정보')).not.toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: '대회 상세보기' }));
    const detailDialog = screen.getByRole('dialog', { name: 'I2S Summer League 대회 상세 정보' });
    expect(within(detailDialog).queryByText('채점 방식')).not.toBeInTheDocument();
    expect(within(detailDialog).getByText('운영자')).toBeInTheDocument();
    expect(within(detailDialog).getByText('기간')).toBeInTheDocument();
    expect(within(detailDialog).getByText('참여 봇')).toBeInTheDocument();
    expect(within(detailDialog).getByText('시작 자본')).toBeInTheDocument();
    expect(within(detailDialog).getByText('종목 범위')).toBeInTheDocument();
    expect(within(detailDialog).getByText('수수료')).toBeInTheDocument();
    expect(within(detailDialog).getByText('슬리피지')).toBeInTheDocument();
  });
});
