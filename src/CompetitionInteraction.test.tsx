import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { RoomsView } from './views/OperationsViews';

const balancedStyles = readFileSync('src/styles/balanced.css', 'utf8');

/*
  모의투자 로비 (#54 확정 A안).

  왼쪽 필터 레일 + 오른쪽 단일 게시판. 공식 대회는 공지처럼 최상단에 핀되어
  보기와 무관하게 항상 보이고, 일반 대회는 행 번호를 달고 마감 임박 순으로
  이어진다. 보기 축은 모집 중 / 진행 중 / 참여 중 셋 중 하나다.
*/
describe('Competition lobby', () => {
  test('sizes competition facts by content instead of equal columns', () => {
    const factsRule = balancedStyles.match(
      /\.variant-balanced\[data-design="signal-studio"\] \.competition-detail-facts \{([^}]*)\}/,
    )?.[1] ?? '';

    expect(factsRule).toContain('display: flex');
    expect(factsRule).toContain('flex-wrap: wrap');
    expect(factsRule).not.toContain('grid-template-columns');
    expect(balancedStyles).toMatch(/\.competition-detail-facts > div\[data-fact-width="wide"\]/);
    expect(balancedStyles).toMatch(/\.competition-detail-facts > div\[data-fact-width="compact"\]/);
  });

  test('lets the metric selector escape the short leaderboard frame', () => {
    const singleLeaderboardRule = balancedStyles.match(
      /\.variant-balanced\[data-design="signal-studio"\] \.competition-leaderboard\.is-single \{([^}]*)\}/,
    )?.[1] ?? '';

    expect(singleLeaderboardRule).toContain('overflow: visible');
    expect(singleLeaderboardRule).not.toContain('overflow: hidden');
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
    render(<RoomsView />);

    const heading = screen.getByRole('heading', { name: '모의투자' }).closest('.page-heading');
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

    const detailSettings = within(dialog).getByRole('button', { name: '대회 세부 설정' });
    await user.click(detailSettings);
    expect(within(dialog).getByLabelText('종목 범위')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('참가 봇 한도')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('수수료')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('슬리피지')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog', { name: '대회 만들기' })).not.toBeInTheDocument();
  });

  test('pins the three official competitions above the community rows in one board', () => {
    render(<RoomsView />);

    const board = screen.getByRole('region', { name: '대회 게시판' });
    const rows = within(board).getAllByRole('listitem');

    // 공지 핀: 공식 3개가 최상단, 마감 임박 순.
    expect(rows[0]).toHaveAccessibleName('공식 대회 ETF Sprint 열기');
    expect(rows[1]).toHaveAccessibleName('공식 대회 Backtesting Challenge 열기');
    expect(rows[2]).toHaveAccessibleName('공식 대회 I2S Summer League 열기');
    rows.slice(0, 3).forEach((row) => expect(row).toHaveClass('is-pinned'));
    rows.slice(3).forEach((row) => expect(row).not.toHaveClass('is-pinned'));

    // 공식은 라이브/백테스트 칩 + Official 표기, 개설자 이름은 노출하지 않는다.
    expect(within(rows[0]).getByText('라이브')).toBeInTheDocument();
    expect(within(rows[1]).getByText('백테스트')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Official')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('I2S 운영팀')).not.toBeInTheDocument();

    // 일반 행은 같은 자리에 행 번호를 달고 개설자를 보조줄로 보여준다.
    const firstGeneral = rows[3];
    expect(within(firstGeneral).getByText('1')).toBeInTheDocument();
    expect(within(firstGeneral).queryByText('Official')).not.toBeInTheDocument();
  });

  test('defaults to recruiting, sorted by closing date, with no status text in rows', () => {
    render(<RoomsView />);

    const board = screen.getByRole('region', { name: '대회 게시판' });
    // 기본 보기는 모집 중. registering(봇 등록)도 아직 들어갈 수 있으므로 포함된다.
    expect(within(board).getByRole('listitem', { name: 'ETF Discipline 열기' })).toBeInTheDocument();
    expect(within(board).getByRole('listitem', { name: 'Quant Study 04 열기' })).toBeInTheDocument();
    expect(within(board).queryByRole('listitem', { name: 'Momentum Lab 열기' })).not.toBeInTheDocument();

    // 일반 행은 마감 임박 순으로 번호가 매겨진다.
    const generalRows = within(board).getAllByRole('listitem').filter((row) => !row.className.includes('is-pinned'));
    const ddays = generalRows.map((row) => Number(within(row).getByText(/^D-\d+$/).textContent!.slice(2)));
    expect([...ddays].sort((a, b) => a - b)).toEqual(ddays);

    // 보기가 상태를 보장하므로 행에는 모집 중/진행 중 텍스트가 없다.
    expect(within(board).queryByText('모집 중')).not.toBeInTheDocument();
    expect(within(board).queryByText('진행 중')).not.toBeInTheDocument();
  });

  test('switches between recruiting, running and joined views while pins stay', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const rail = screen.getByRole('complementary', { name: '일반 대회 필터' });
    const board = screen.getByRole('region', { name: '대회 게시판' });

    expect(within(rail).getByRole('radio', { name: '모집 중' })).toBeChecked();

    await user.click(within(rail).getByRole('radio', { name: '진행 중' }));
    expect(within(board).getByRole('listitem', { name: 'Momentum Lab 열기' })).toBeInTheDocument();
    expect(within(board).queryByRole('listitem', { name: 'ETF Discipline 열기' })).not.toBeInTheDocument();

    /* 참여 중: 상태와 무관하게 내 봇이 있는 방만. 공식 핀은 어느 보기에서도
       사라지지 않는다 — 공지가 검색에 밀리지 않는 것과 같다. */
    await user.click(within(rail).getByRole('radio', { name: '참여 중' }));
    const generalRows = within(board).getAllByRole('listitem').filter((row) => !row.className.includes('is-pinned'));
    expect(generalRows).toHaveLength(1);
    expect(generalRows[0]).toHaveAccessibleName('Momentum Lab 열기');
    expect(within(board).getByRole('listitem', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
  });

  test('marks rooms my bot competes in with a bot icon instead of repeating rank text', () => {
    render(<RoomsView />);

    const board = screen.getByRole('region', { name: '대회 게시판' });
    // 공식 핀 중 내 봇이 뛰는 방은 하나뿐이고(ETF Sprint), 그 행에만 봇 아이콘이 붙는다.
    const markers = within(board).getAllByLabelText('내 봇 참가 중');
    expect(markers).toHaveLength(1);
    // 행 오른쪽은 마감·참여 봇 숫자로 끝난다 — 참가 버튼을 줄마다 반복하지 않는다.
    expect(within(board).queryByText('참가')).not.toBeInTheDocument();
    expect(within(board).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('filters community rooms by search, scoring and deadline without losing pins', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const rail = screen.getByRole('complementary', { name: '일반 대회 필터' });
    const board = screen.getByRole('region', { name: '대회 게시판' });

    // 검색은 대회명과 개설자를 모두 맞춘다.
    await user.type(within(rail).getByRole('searchbox', { name: '대회 검색' }), '거북이');
    let generalRows = within(board).getAllByRole('listitem').filter((row) => !row.className.includes('is-pinned'));
    expect(generalRows).toHaveLength(1);
    expect(generalRows[0]).toHaveAccessibleName('Slow Turtle 열기');
    expect(within(board).getByRole('listitem', { name: '공식 대회 ETF Sprint 열기' })).toBeInTheDocument();
    await user.clear(within(rail).getByRole('searchbox', { name: '대회 검색' }));

    // 채점 방식 체크박스.
    await user.click(within(rail).getByRole('checkbox', { name: '표준점수제' }));
    generalRows = within(board).getAllByRole('listitem').filter((row) => !row.className.includes('is-pinned'));
    expect(generalRows.length).toBeGreaterThan(0);
    expect(generalRows.every((row) => Boolean(within(row).queryByText('표준점수제')))).toBe(true);
    await user.click(within(rail).getByRole('checkbox', { name: '표준점수제' }));

    // 남은 기간.
    await user.click(within(rail).getByRole('radio', { name: '7일 이내' }));
    generalRows = within(board).getAllByRole('listitem').filter((row) => !row.className.includes('is-pinned'));
    expect(generalRows).toHaveLength(0);
    expect(screen.getByText('조건에 맞는 대회가 없습니다.')).toBeInTheDocument();

    // 초기화는 기본 보기(모집 중)로 되돌린다. 빈 상태에도 같은 동작의 버튼이 있다.
    await user.click(within(rail).getByRole('button', { name: /초기화/ }));
    expect(within(rail).getByRole('radio', { name: '모집 중' })).toBeChecked();
    expect(within(board).getByRole('listitem', { name: 'ETF Discipline 열기' })).toBeInTheDocument();
  });

  test('opens a room detail page from a board row', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    const rail = screen.getByRole('complementary', { name: '일반 대회 필터' });
    await user.click(within(rail).getByRole('radio', { name: '진행 중' }));
    await user.click(screen.getByRole('listitem', { name: 'Momentum Lab 열기' }));

    const details = screen.getByRole('region', { name: 'Momentum Lab 상세 페이지' });
    expect(within(details).getByRole('heading', { name: 'Momentum Lab' })).toBeInTheDocument();
    expect(details).toHaveTextContent('Momentum Lab 참가 봇을 동일한 시장 데이터와 체결 조건에서 비교하는 모의투자 대회입니다.');
  });

  test('folds seven concise facts behind the 대회 조건 toggle with a period progress bar', async () => {
    const user = userEvent.setup();
    render(<RoomsView />);

    await user.click(screen.getByRole('listitem', { name: '공식 대회 I2S Summer League 열기' }));
    const detail = screen.getByRole('region', { name: 'I2S Summer League 상세 페이지' });
    expect(within(detail).getByText('Official')).toBeInTheDocument();

    /* 진행 중엔 리더보드 단일 컬럼 — 내 참가 봇 패널은 압축 순위표와 중복이라
       없앴다. */
    expect(within(detail).queryByLabelText('내 참가 봇 순위')).not.toBeInTheDocument();
    const leaderboardHeading = within(detail).getByRole('heading', { name: '대회 리더보드' });
    const leaderboard = leaderboardHeading.closest('section');
    expect(leaderboard).not.toBeNull();
    expect(leaderboard).toHaveClass('is-single');

    /* #54 확정: 조건은 모달이 아니라 접이식 인라인 표. 진행 중엔 기본 접힘,
       펼치면 조건 7개가 그 자리에 보이고 진행률은 기간 칸 미니 바뿐이다. */
    expect(screen.queryByRole('button', { name: '대회 상세보기' })).not.toBeInTheDocument();
    const factsToggle = within(detail).getByRole('button', { name: /대회 조건/ });
    expect(factsToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(factsToggle);
    const facts = within(detail).getByLabelText('I2S Summer League 대회 조건');
    ['운영자', '기간', '참여 봇', '시작 자본', '종목 범위', '수수료', '슬리피지'].forEach((label) => {
      expect(within(facts).getByText(label)).toBeInTheDocument();
    });
    expect(within(facts).getByText('기간').closest('div')).toHaveAttribute('data-fact-width', 'wide');
    expect(within(facts).getByText('종목 범위').closest('div')).toHaveAttribute('data-fact-width', 'wide');
    expect(within(facts).getByText('참여 봇').closest('div')).toHaveAttribute('data-fact-width', 'compact');
    expect(within(facts).getByText('수수료').closest('div')).toHaveAttribute('data-fact-width', 'compact');
    expect(within(facts).getByRole('progressbar', { name: 'I2S Summer League 진행률' })).toHaveAttribute('aria-valuenow', '5');
    expect(within(detail).getAllByRole('progressbar')).toHaveLength(1);
  });
});
