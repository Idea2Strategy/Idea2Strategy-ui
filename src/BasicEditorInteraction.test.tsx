import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BasicEditor } from './views/StrategyViews';

describe('Basic editor strategy explanations', () => {
  test('keeps execution settings out of condition blocks and exposes risk controls', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.queryByTestId('buy-trigger-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('buy-budget-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sell-position-block')).not.toBeInTheDocument();

    expect(screen.getByRole('combobox', { name: 'PARTITION 01 기본 봉 주기' })).toHaveValue('1분봉');
    expect(screen.getByRole('spinbutton', { name: 'PARTITION 01 전체 전략 대비 예산' })).toHaveValue(40);
    expect(screen.getByRole('button', { name: 'PARTITION 01 종목 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '매수 레인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '매도 레인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '위기관리 레인' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 종목 관리' }));
    const symbolDialog = screen.getByRole('dialog', { name: 'PARTITION 1 종목 관리' });
    expect(within(symbolDialog).getByRole('spinbutton', { name: 'AAPL 종목별 최대 보유 비율' })).toHaveValue(40);
    expect(within(symbolDialog).getByRole('spinbutton', { name: 'MSFT 종목별 최대 보유 비율' })).toHaveValue(40);
    await user.click(within(symbolDialog).getByRole('button', { name: '완료' }));

    await user.click(screen.getByRole('button', { name: '매수 컨테이너 실행 설정' }));
    const buySettings = within(screen.getByTestId('basic-buy-group')).getByRole('group', { name: '매수 실행 설정' });
    expect(within(buySettings).getByText('사용 예산')).toBeInTheDocument();
    expect(within(buySettings).getByRole('spinbutton', { name: '1회 주문 최대' })).toBeInTheDocument();
    expect(buySettings.querySelector('.settings-natural-summary')).not.toBeInTheDocument();
    expect(within(buySettings).getByRole('button', { name: '매수 실행 설정 닫기' })).toBeInTheDocument();
    const additionalBuy = within(buySettings).getByRole('checkbox', { name: '추가 매수 허용' });
    expect(additionalBuy).not.toBeChecked();
    await user.click(additionalBuy);
    expect(within(buySettings).getByRole('spinbutton', { name: '재실행 간격' })).toBeInTheDocument();
    expect(within(buySettings).getByRole('spinbutton', { name: '한 포지션 최대 진입 횟수' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 위기관리 컨테이너 추가' }));
    expect(screen.getByRole('region', { name: 'PARTITION 01 위기관리 컨테이너' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'PARTITION 01 위기관리 컨테이너' })).getByTestId(/order-block/)).toHaveTextContent('전량 청산');
  });

  test('edits a container name directly from its header and keeps the right panel block-only', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const rightPanel = screen.getByTestId('basic-block-library');
    expect(within(rightPanel).queryByText('컨테이너 이름')).not.toBeInTheDocument();
    expect(within(rightPanel).queryByText('블록을 넣을 곳')).not.toBeInTheDocument();
    expect(within(rightPanel).queryByText(/클릭하거나 원하는 컨테이너로 드래그하세요/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '매수 컨테이너 이름 편집' }));
    const titleInput = within(screen.getByTestId('basic-buy-group')).getByRole('textbox', { name: '매수 컨테이너 이름' });
    await user.clear(titleInput);
    await user.type(titleInput, '첫 진입');
    await user.keyboard('{Enter}');

    expect(within(screen.getByTestId('basic-buy-group')).getByText('첫 진입')).toBeInTheDocument();
    expect(within(rightPanel).queryByDisplayValue('첫 진입')).not.toBeInTheDocument();
  });

  test('uses the full editor workspace without a page title and floats its side panels', () => {
    render(<BasicEditor goBack={() => {}} openEditor={() => {}} />);

    expect(screen.queryByRole('heading', { name: 'Basic 전략 편집기' })).not.toBeInTheDocument();
    const editorControls = screen.getByRole('toolbar', { name: 'Basic 편집 작업' });
    expect(editorControls).toHaveClass('floating-editor-controls');
    expect(screen.queryByText('EDITOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Opening Range Flow')).not.toBeInTheDocument();
    expect(screen.queryByText('미저장 변경')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '편집기 전환' })).toHaveClass('floating-editor-mode-controls');
    expect(screen.getByRole('group', { name: '캔버스 확대/축소' })).toHaveClass('floating-zoom-controls');
    for (const name of ['목록', 'Basic 편집기', 'Pro 편집기', '저장', '개인 봇 출시', '축소', '배율 초기화', '확대']) {
      expect(screen.getByRole('button', { name })).toHaveClass('floating-editor-button');
    }
    const launchButton = screen.getByRole('button', { name: '개인 봇 출시' });
    expect(launchButton).not.toHaveAttribute('title');
    expect(launchButton).toHaveAttribute('aria-describedby', 'personal-bot-launch-tooltip');
    expect(screen.getByRole('tooltip')).toHaveTextContent('개인 운용 봇');
    expect(screen.getByRole('tooltip')).toHaveTextContent('전략을 검증하고 바로 출시해요.');
    expect(screen.queryByRole('button', { name: '검증' })).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-editor-workspace')).toHaveClass('full-editor-workspace');
    const leftRail = screen.getByTestId('basic-editor-left-rail');
    const completeness = screen.getByRole('region', { name: '전략 완성도' });
    const templates = screen.getByTestId('basic-templates-panel');
    expect(leftRail.firstElementChild).toBe(completeness);
    expect(leftRail).toContainElement(templates);
    expect(templates).toHaveClass('floating-editor-panel');
    expect(screen.getByTestId('basic-block-library')).toHaveClass('floating-editor-panel');
  });

  test('collapses and restores the package and block sidebars independently', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const templates = screen.getByTestId('basic-templates-panel');
    const blocks = screen.getByTestId('basic-block-library');
    const templateToggle = within(templates).getByRole('button', { name: '패키지 사이드바 접기' });
    const blockToggle = within(blocks).getByRole('button', { name: '블록 사이드바 접기' });

    expect(templateToggle).toHaveAttribute('aria-expanded', 'true');
    expect(blockToggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(templateToggle);
    await user.click(blockToggle);
    expect(templates).toHaveClass('is-collapsed');
    expect(blocks).toHaveClass('is-collapsed');
    expect(templates).toHaveAttribute('data-collapse-direction', 'left');
    expect(blocks).toHaveAttribute('data-collapse-direction', 'right');
    expect(within(templates).getByRole('button', { name: '패키지 사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(blocks).getByRole('button', { name: '블록 사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('shows block categories as always-visible dividers instead of dropdowns', () => {
    render(<BasicEditor goBack={() => {}} />);

    const blocks = screen.getByTestId('basic-block-library');
    expect(blocks.querySelector('details')).not.toBeInTheDocument();
    expect(blocks.querySelectorAll('.block-category-divider').length).toBeGreaterThanOrEqual(5);
    expect(within(blocks).getByText('가격')).toBeInTheDocument();
    expect(within(blocks).getByText('위기관리')).toBeInTheDocument();
  });

  test('switches from the floating mode controls', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    render(<BasicEditor goBack={() => {}} openEditor={openEditor} />);

    await user.click(screen.getByRole('button', { name: 'Pro 편집기' }));
    expect(openEditor).toHaveBeenCalledWith('pro');
  });

  test('collects a bot name and description before launching a valid strategy', async () => {
    const user = userEvent.setup();
    const onLaunchBot = vi.fn();
    render(<BasicEditor goBack={() => {}} openEditor={() => {}} onLaunchBot={onLaunchBot} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    await user.type(within(buyRsi).getByLabelText('RSI 반등 값'), '30');
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '상승' }));
    const sellRsi = screen.getByTestId('sell-rsi-block');
    await user.type(within(sellRsi).getByLabelText('RSI 반등 값'), '70');
    await user.click(within(sellRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '하락' }));

    await user.click(screen.getByRole('button', { name: '개인 봇 출시' }));

    const dialog = screen.getByRole('dialog', { name: '개인 운용 봇 출시' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const launchButton = within(dialog).getByRole('button', { name: '봇 출시하기' });
    expect(launchButton).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: '봇 이름' }), '  Momentum Scout  ');
    expect(launchButton).toBeDisabled();
    await user.type(
      within(dialog).getByRole('textbox', { name: '봇 설명' }),
      '  RSI 반등 구간을 포착하는 개인 운용 봇입니다.  ',
    );
    expect(launchButton).toBeEnabled();

    await user.click(launchButton);
    expect(onLaunchBot).toHaveBeenCalledWith({
      name: 'Momentum Scout',
      description: 'RSI 반등 구간을 포착하는 개인 운용 봇입니다.',
    });
    expect(screen.queryByRole('dialog', { name: '개인 운용 봇 출시' })).not.toBeInTheDocument();
  });

  test('uses packages, partitions, and buy or sell containers as the Basic editor terminology', () => {
    render(<BasicEditor goBack={() => {}} />);

    const packages = screen.getByTestId('basic-templates-panel');
    expect(within(packages).getByText('PACKAGES')).toBeInTheDocument();
    expect(within(packages).getByRole('textbox', { name: '패키지 검색' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '파티션 도구' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '파티션 그리기' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'PARTITION 01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매수 컨테이너 선택' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매도 컨테이너 선택' })).toBeInTheDocument();
    const blockLibrary = screen.getByTestId('basic-block-library');
    expect(within(blockLibrary).getByText('BLOCKS')).toBeInTheDocument();
    for (const category of ['가격', '추세', '반전', '일정', '위기관리']) {
      expect(within(blockLibrary).getByText(category)).toBeInTheDocument();
    }
    for (const block of ['가격 비교', '가격 변화율', '연속 상승·하락', '평균선 교차', 'RSI 반등', 'MACD 전환', '가격 띠 반전', '정기 실행', '현재 수익률', '보유 기간', '최고 수익률', '고점 대비 하락']) {
      expect(within(blockLibrary).getByRole('button', { name: `${block} 블록 추가` })).toBeInTheDocument();
    }
  });

  test('offers every Basic strategy template from the final specification', () => {
    render(<BasicEditor goBack={() => {}} />);

    const templates = screen.getByTestId('basic-templates-panel');
    for (const template of ['연속 상승·하락', '최근 평균 가격 돌파', '최근 최고 가격 돌파', '장 시작가 대비 상승', '하루 급락 매수', '정기 매수', 'Donchian 돌파', 'RSI 반등', 'SMA 교차', 'MACD 전환', 'Bollinger 반전']) {
      expect(within(templates).getByRole('button', { name: `${template} 패키지 적용` })).toBeInTheDocument();
    }
    expect(within(templates).getByRole('separator', { name: '고급 패키지' })).toBeInTheDocument();
    expect(within(templates).getByRole('button', { name: '최근 평균 가격 돌파 패키지 적용' })).toHaveAttribute('data-package-group', '가격');
    expect(within(templates).getByRole('button', { name: 'SMA 교차 패키지 적용' })).toHaveAttribute('data-package-group', '추세');
    expect(within(templates).getByRole('button', { name: 'RSI 반등 패키지 적용' })).toHaveAttribute('data-package-group', '반전');
  });

  test('keeps container headers minimal and opens buy settings as a compact overlay', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyCard = screen.getByTestId('basic-buy-group');
    expect(within(buyCard).queryByText('B')).not.toBeInTheDocument();
    expect(within(buyCard).queryByText('가격 갱신 · 종목별 평가')).not.toBeInTheDocument();
    expect(within(buyCard).queryByText('선택됨')).not.toBeInTheDocument();
    expect(within(buyCard).queryByText(/CONDITIONS/)).not.toBeInTheDocument();
    expect(within(buyCard.querySelector('.strategy-container-header') as HTMLElement).getByText('예산 40%')).toBeInTheDocument();
    expect(buyCard.querySelector('.container-quick-meta')).not.toBeInTheDocument();

    await user.click(within(buyCard).getByRole('button', { name: '매수 컨테이너 실행 설정' }));
    expect(within(buyCard).getByRole('group', { name: '매수 실행 설정' })).toHaveClass('is-popover');
  });

  test('uses one compact empty drop target without a duplicate add button', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 위기관리 컨테이너 추가' }));
    const riskCard = screen.getByRole('region', { name: 'PARTITION 01 위기관리 컨테이너' });
    expect(within(riskCard).getByText('조건 놓기')).toBeInTheDocument();
    expect(within(riskCard).queryByRole('button', { name: '조건 추가' })).not.toBeInTheDocument();
  });

  test('uses concise block labels and only offers operators that match the block meaning', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '연속 상승·하락 패키지 적용' }));
    const streak = screen.getAllByLabelText(/연속 상승·하락 블록/)[0];
    expect(within(streak).getByText('연속')).toBeInTheDocument();
    expect(within(streak).queryByText('연속 상승·하락')).not.toBeInTheDocument();

    await user.click(within(streak).getByRole('combobox', { name: '연속 상승·하락 방향' }));
    expect(screen.getByRole('option', { name: '상승' })).toHaveClass('tone-up');
    expect(screen.getByRole('option', { name: '하락' })).toHaveClass('tone-down');
    expect(screen.queryByRole('option', { name: '>' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '<' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '하락' }));
    expect(within(streak).getByRole('combobox', { name: '연속 상승·하락 방향' })).toHaveTextContent('하락');
  });

  test('starts every editable field unset without exposing implementation terminology', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    const unsetRelation = within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' });
    expect(unsetRelation).toHaveAttribute('data-value', '');
    expect(unsetRelation).toHaveTextContent('선택');
    expect(unsetRelation).not.toHaveTextContent('-');
    expect(unsetRelation.querySelector('svg')).not.toBeInTheDocument();
    expect(unsetRelation.closest('.block-custom-select')).toHaveClass('is-fixed-width');
    expect(unsetRelation).not.toHaveTextContent('Null');
    expect(within(buyRsi).getByLabelText('RSI 반등 값')).toHaveValue(null);
    expect(within(buyRsi).getByLabelText('RSI 반등 값')).toHaveAttribute('placeholder', '입력');
    expect(within(buyRsi).getByLabelText('RSI 반등 값')).toHaveClass('is-centered-number');
    expect(within(buyRsi).getByLabelText('RSI 반등 값').closest('.block-number-stepper')).toHaveClass('is-fixed-width');
    expect(screen.getByRole('button', { name: '개인 봇 출시' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('button', { name: '가격 비교 블록 추가' }));
    const priceBlock = screen.getAllByLabelText('가격 비교 블록. 드래그하거나 Alt와 방향키로 이동').at(-1) as HTMLElement;
    const relationControl = within(priceBlock).getByRole('combobox', { name: '가격 비교 비교' });
    const valueControl = within(priceBlock).getByRole('combobox', { name: '가격 비교 값 선택' });
    expect(relationControl).toHaveAttribute('data-value', '');
    expect(relationControl.closest('.block-custom-select')).toHaveClass('is-relation-select');
    expect(valueControl).toHaveAttribute('data-value', '');
    expect(valueControl.closest('.block-custom-select')).toHaveClass('is-value-select');

    await user.click(screen.getByRole('button', { name: '연속 상승·하락 패키지 적용' }));
    const packagedStreak = screen.getAllByLabelText('연속 상승·하락 블록. 드래그하거나 Alt와 방향키로 이동').at(-1) as HTMLElement;
    expect(within(packagedStreak).getByRole('combobox', { name: '연속 상승·하락 방향' })).toHaveAttribute('data-value', '');
    expect(within(packagedStreak).getByRole('combobox', { name: '연속 상승·하락 값 선택' })).toHaveAttribute('data-value', '');
  });

  test('uses a candlestick icon for candle-count dropdown values', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '연속 상승·하락 패키지 적용' }));
    const streak = screen.getAllByLabelText(/연속 상승·하락 블록/)[0];
    await user.click(within(streak).getByRole('combobox', { name: '연속 상승·하락 값 선택' }));

    expect(screen.getByRole('option', { name: '2봉' }).querySelector('.lucide-chart-candlestick')).toBeInTheDocument();
  });

  test('uses an opening-bell icon for the current-session opening price', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '가격 비교 블록 추가' }));
    const priceBlock = screen.getAllByLabelText('가격 비교 블록. 드래그하거나 Alt와 방향키로 이동').at(-1) as HTMLElement;
    await user.click(within(priceBlock).getByRole('combobox', { name: '가격 비교 값 선택' }));

    expect(screen.getByRole('option', { name: '당일 장 시작가' }).querySelector('.lucide-bell-ring')).toBeInTheDocument();
  });

  test('adds an RSI buy and sell strategy pair to the selected section from a template', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(screen.getByRole('button', { name: 'RSI 반등 패키지 적용' }));

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
    expect(within(section).getByText('RSI 반등 매수')).toBeInTheDocument();
    expect(within(section).getByText('RSI 하락 매도')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/RSI 반등 패키지/);
  });

  test('builds the advanced Donchian package with confirmed entry, exit, and trailing-risk conditions', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const packageButton = screen.getByRole('button', { name: 'Donchian 돌파 패키지 적용' });
    expect(packageButton).toHaveTextContent('매수 2 · 매도 2 · 위기 1');
    await user.click(packageButton);

    const section = screen.getByTestId('strategy-section-1');
    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
    expect(section.querySelectorAll('.risk-container')).toHaveLength(1);

    const buyCard = within(section).getByText('Donchian 상향 돌파').closest('.strategy-card') as HTMLElement;
    const sellCard = within(section).getByText('Donchian 하향 이탈').closest('.strategy-card') as HTMLElement;
    const riskCard = within(section).getByText('수익 보호 청산').closest('.strategy-card') as HTMLElement;
    expect(buyCard.querySelectorAll('.draggable-strategy-block')).toHaveLength(2);
    expect(sellCard.querySelectorAll('.draggable-strategy-block')).toHaveLength(2);
    expect(riskCard.querySelectorAll('.draggable-strategy-block')).toHaveLength(2);
    expect(within(buyCard).getByLabelText(/가격 비교 블록/)).toBeInTheDocument();
    expect(within(buyCard).getByLabelText(/평균선 교차 블록/)).toBeInTheDocument();
    expect(within(riskCard).getByLabelText(/최고 수익률 블록/)).toBeInTheDocument();
    expect(within(riskCard).getByLabelText(/고점 대비 하락 블록/)).toBeInTheDocument();
  });

  test('uses a risk container for the session-close exit package described as liquidation', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '장 시작가 대비 상승 패키지 적용' }));

    const section = screen.getByTestId('strategy-section-1');
    expect(section.querySelectorAll('.sell-container')).toHaveLength(1);
    expect(section.querySelectorAll('.risk-container')).toHaveLength(1);
    const riskCard = within(section).getByText('당일 장 마감 청산').closest('.strategy-card') as HTMLElement;
    expect(within(riskCard).getByLabelText(/보유 기간 블록/)).toBeInTheDocument();
  });

  test('drags a template from the library onto a target partition', () => {
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    const template = screen.getByRole('button', { name: 'SMA 교차 패키지 적용' });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };

    expect(template).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(template, { dataTransfer });
    expect(section).toHaveClass('is-template-drop-ready');
    fireEvent.dragOver(section, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');
    fireEvent.drop(section, { dataTransfer });

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
    expect(within(section).getByText('SMA 교차 매수')).toBeInTheDocument();
    expect(within(section).getByText('SMA 교차 매도')).toBeInTheDocument();
    expect(section).not.toHaveClass('is-template-drop-ready');
  });

  test('adds a library block to the currently selected strategy card', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'MACD 전환 블록 추가' }));
    expect(within(screen.getByTestId('basic-buy-stack')).getByLabelText(/MACD 전환 블록/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '매도 컨테이너 선택' }));
    await user.click(screen.getByRole('button', { name: '현재 수익률 블록 추가' }));
    expect(within(screen.getByTestId('basic-sell-stack')).getByLabelText(/현재 수익률 블록/)).toBeInTheDocument();
  });

  test('drags a library block onto the chosen strategy card', () => {
    render(<BasicEditor goBack={() => {}} />);

    const block = screen.getByRole('button', { name: 'MACD 전환 블록 추가' });
    const sellRsi = screen.getByTestId('sell-rsi-block');
    const sellStack = screen.getByTestId('basic-sell-stack');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };

    expect(block).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(block, { dataTransfer });
    expect(screen.getByTestId('basic-sell-group')).toHaveClass('is-library-drop-ready');
    fireEvent.dragOver(sellRsi, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');
    fireEvent.drop(sellRsi, { dataTransfer });

    expect(within(sellStack).getByLabelText(/MACD 전환 블록/)).toBeInTheDocument();
    expect(within(screen.getByTestId('basic-buy-stack')).queryByLabelText(/MACD 전환 블록/)).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-sell-group')).not.toHaveClass('is-library-drop-ready');
    expect(screen.getByRole('status')).toHaveTextContent(/MACD 전환 블록을 대상 컨테이너에 추가/);
  });

  test('uses the same block category themes in the canvas and the block library', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.getByTestId('buy-rsi-block').querySelector('.scratch-block')).toHaveClass('block-condition');
    expect(screen.getByTestId('sell-rsi-block').querySelector('.scratch-block')).toHaveClass('block-condition');

    await user.click(screen.getByRole('button', { name: '평균선 교차 블록 추가' }));
    expect(within(screen.getByTestId('basic-buy-stack')).getByLabelText(/평균선 교차 블록/).querySelector('.scratch-block')).toHaveClass('block-indicator');
  });

  test('edits numeric block values with stepper buttons, direct input, and an operator dropdown', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    const valueInput = within(buyRsi).getByLabelText('RSI 반등 값');
    const increaseButton = within(buyRsi).getByRole('button', { name: 'RSI 반등 값 증가' });
    await user.click(increaseButton);
    expect(valueInput).toHaveValue(1);

    await user.clear(valueInput);
    await user.type(valueInput, '42');
    expect(valueInput).toHaveValue(42);
    await user.click(within(buyRsi).getByRole('combobox', { name: 'RSI 반등 방향' }));
    await user.click(screen.getByRole('option', { name: '하락' }));

    expect(screen.getByRole('status')).toHaveTextContent('블록 설정을 변경했습니다.');
  });

  test('repeats numeric changes while a stepper button is held', () => {
    vi.useFakeTimers();
    try {
      render(<BasicEditor goBack={() => {}} />);

      const buyRsi = screen.getByTestId('buy-rsi-block');
      const valueInput = buyRsi.querySelector<HTMLInputElement>('.block-number-stepper input')!;
      const increaseButton = buyRsi.querySelector<HTMLButtonElement>('.block-number-stepper button:last-child')!;

      fireEvent.pointerDown(increaseButton, { button: 0, pointerId: 1 });
      act(() => vi.advanceTimersByTime(900));
      fireEvent.pointerUp(increaseButton, { pointerId: 1 });

      expect(valueInput.valueAsNumber).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not open the retired natural-language notes from container headers', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '매수 컨테이너 선택' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  test('keeps the final buy and sell outputs attached and non-interactive', () => {
    render(<BasicEditor goBack={() => {}} />);

    for (const testId of ['buy-order-block', 'sell-order-block']) {
      const output = screen.getByTestId(testId);
      expect(output).toHaveClass('fixed-terminal-block');
      expect(output).toHaveAttribute('aria-disabled', 'true');
      expect(output).not.toHaveAttribute('draggable', 'true');
      expect(output.closest('.strategy-container-footer')).not.toBeNull();
    }
  });

  test('moves editable blocks between buy and sell strategies with drag and drop', () => {
    render(<BasicEditor goBack={() => {}} />);

    const buyRsi = screen.getByTestId('buy-rsi-block');
    const sellRsi = screen.getByTestId('sell-rsi-block');
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(),
    };

    expect(buyRsi).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(buyRsi, { dataTransfer });
    fireEvent.dragOver(sellRsi, { dataTransfer });
    fireEvent.drop(sellRsi, { dataTransfer });

    expect(within(screen.getByTestId('basic-sell-stack')).getByTestId('buy-rsi-block')).toBeInTheDocument();
    expect(screen.getByTestId('basic-buy-stack').querySelectorAll('.draggable-strategy-block')).toHaveLength(0);
    expect(screen.getByTestId('basic-sell-stack').querySelectorAll('.draggable-strategy-block')).toHaveLength(2);
  });

  test('adds one block at a time and keeps strategy containers content-sized', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyGroup = screen.getByTestId('basic-buy-group');
    expect(buyGroup).toHaveClass('content-sized-strategy');

    await user.click(screen.getByRole('button', { name: '가격 비교 블록 추가' }));

    expect(within(buyGroup).queryByText(/CONDITIONS/)).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-buy-stack').querySelectorAll('.draggable-strategy-block')).toHaveLength(2);
  });

  test('reorders focused blocks with alt and arrow keys', () => {
    render(<BasicEditor goBack={() => {}} />);

    const buyStack = screen.getByTestId('basic-buy-stack');
    fireEvent.click(screen.getByRole('button', { name: '평균선 교차 블록 추가' }));
    const rsi = screen.getByTestId('buy-rsi-block');
    fireEvent.keyDown(rsi, { key: 'ArrowDown', altKey: true });

    expect(buyStack.querySelectorAll('.draggable-strategy-block')[1]).toBe(rsi);
    expect(screen.getByRole('status')).toHaveTextContent(/이동/);
  });

  test('groups buy and sell strategies inside a section with symbol and capital settings', () => {
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    expect(within(section).getByRole('button', { name: 'PARTITION 01 종목 관리' })).toHaveTextContent('3개 종목');
    expect(within(section).getByRole('spinbutton', { name: 'PARTITION 01 전체 전략 대비 예산' })).toHaveValue(40);
    expect(within(section).getByTestId('basic-buy-group')).toBeInTheDocument();
    expect(within(section).getByTestId('basic-sell-group')).toBeInTheDocument();
  });

  test('creates a new section by drawing a rectangle with a required buy strategy', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '파티션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const section = screen.getByTestId('strategy-section-2');
    expect(within(section).getByTestId('strategy-card-section-2-buy-1')).toBeInTheDocument();
    expect(within(section).queryByTestId('strategy-card-section-2-sell-1')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('button', { name: /매도 컨테이너 추가/ }).length).toBeGreaterThan(0);
  });

  test('allows multiple buy and optional sell strategies in one section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(within(section).getByRole('button', { name: 'PARTITION 01 매수 컨테이너 추가' }));
    await user.click(within(section).getByRole('button', { name: 'PARTITION 01 매도 컨테이너 추가' }));

    expect(section.querySelectorAll('.buy-container')).toHaveLength(2);
    expect(section.querySelectorAll('.sell-container')).toHaveLength(2);
  });

  test('moves a sell strategy card into another section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '파티션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const sellCard = screen.getByTestId('basic-sell-group');
    const targetSection = screen.getByTestId('strategy-section-2');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(sellCard, { dataTransfer });
    fireEvent.dragOver(targetSection, { dataTransfer });
    fireEvent.drop(targetSection, { dataTransfer });

    expect(within(targetSection).getByTestId('basic-sell-group')).toBeInTheDocument();
  });

  test('does not allow moving the last buy strategy out of a section', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    await user.click(screen.getByRole('button', { name: '파티션 그리기' }));
    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 320, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 920, clientY: 520, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 920, clientY: 520, pointerId: 1 });

    const sourceSection = screen.getByTestId('strategy-section-2');
    const targetSection = screen.getByTestId('strategy-section-1');
    const requiredBuyCard = within(sourceSection).getByTestId('strategy-card-section-2-buy-1');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(requiredBuyCard, { dataTransfer });
    fireEvent.dragOver(targetSection, { dataTransfer });
    fireEvent.drop(targetSection, { dataTransfer });

    expect(within(sourceSection).getByTestId('strategy-card-section-2-buy-1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/매수 컨테이너가 하나 이상/);
  });

  test('moves a dot-only cursor spotlight across the editor canvas', () => {
    render(<BasicEditor goBack={() => {}} />);

    const canvas = screen.getByRole('region', { name: /Basic/ });
    const surface = screen.getByTestId('section-drawing-surface');
    expect(screen.getByTestId('cursor-dot-spotlight')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.pointerMove(surface, { clientX: 420, clientY: 260, pointerId: 1 });
    expect(canvas.style.getPropertyValue('--spotlight-x')).toBe('420px');
    expect(canvas.style.getPropertyValue('--spotlight-y')).toBe('260px');
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('1');

    fireEvent.pointerLeave(surface);
    expect(canvas.style.getPropertyValue('--spotlight-opacity')).toBe('0');
  });

  test('zooms the strategy canvas in, out, and back to 100 percent', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const world = screen.getByTestId('section-world');
    const zoomLevel = screen.getByRole('button', { name: '배율 초기화' });

    await user.click(screen.getByRole('button', { name: '확대' }));
    expect(zoomLevel).toHaveTextContent('110%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1.1)');

    await user.click(screen.getByRole('button', { name: '축소' }));
    await user.click(screen.getByRole('button', { name: '축소' }));
    expect(zoomLevel).toHaveTextContent('90%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(0.9)');

    await user.click(zoomLevel);
    expect(zoomLevel).toHaveTextContent('100%');
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('zooms with the mouse wheel around the cursor position', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const world = screen.getByTestId('section-world');

    fireEvent.wheel(surface, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(-40px, -30px, 0) scale(1.1)');
    expect(screen.getByRole('button', { name: '배율 초기화' })).toHaveTextContent('110%');

    fireEvent.wheel(surface, { deltaY: 100, clientX: 400, clientY: 300 });
    expect(world).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('does not zoom the canvas while scrolling a block dropdown', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const zoomLevel = screen.getByRole('button', { name: '배율 초기화' });
    const rsiOperator = within(screen.getByTestId('buy-rsi-block')).getByRole('combobox', { name: 'RSI 반등 방향' });
    await user.click(rsiOperator);
    fireEvent.wheel(rsiOperator, { deltaY: 100 });
    expect(zoomLevel).toHaveTextContent('100%');
  });

  test('pans the infinite canvas by dragging empty space', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 220, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 220, clientY: 170, pointerId: 1 });

    expect(screen.getByTestId('section-world')).toHaveStyle('transform: translate3d(120px, 80px, 0) scale(1)');
    const canvas = screen.getByRole('region', { name: /Basic/ });
    expect(canvas.style.getPropertyValue('--canvas-pan-x')).toBe('120px');
    expect(canvas.style.getPropertyValue('--canvas-pan-y')).toBe('80px');
  });

  test('pans with pointer movement while the space bar is held', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const world = screen.getByTestId('section-world');
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(surface).toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 155, clientY: 125, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    expect(surface).not.toHaveClass('is-space-panning');
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 180, pointerId: 1 });
    expect(world).toHaveStyle('transform: translate3d(55px, 35px, 0) scale(1)');
  });

  test('keeps the space bar available while typing in an input', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const search = screen.getByRole('textbox', { name: '패키지 검색' });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 90, pointerId: 1 });
    fireEvent.keyDown(search, { key: ' ', code: 'Space' });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 140, pointerId: 1 });

    expect(surface).not.toHaveClass('is-space-panning');
    expect(screen.getByTestId('section-world')).toHaveStyle('transform: translate3d(0px, 0px, 0) scale(1)');
  });

  test('moves a section and settles a dropped strategy card into the nearest non-overlapping space', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    fireEvent.pointerDown(screen.getByTestId('section-1-move-handle'), { clientX: 300, clientY: 120, pointerId: 2 });
    fireEvent.pointerMove(surface, { clientX: 360, clientY: 160, pointerId: 2 });
    fireEvent.pointerUp(surface, { clientX: 360, clientY: 160, pointerId: 2 });
    expect(section).toHaveStyle({ left: '350px', top: '148px' });

    const buyCard = screen.getByTestId('basic-buy-group');
    const sellCard = screen.getByTestId('basic-sell-group');
    const sellMoveHandle = screen.getByRole('button', { name: '매도 컨테이너 자유 이동' });

    fireEvent.pointerDown(sellMoveHandle, { clientX: 310, clientY: 112, pointerId: 3 });
    fireEvent.pointerMove(surface, { clientX: 24, clientY: 112, pointerId: 3 });
    fireEvent.pointerUp(surface, { clientX: 24, clientY: 112, pointerId: 3 });

    expect(buyCard).toHaveStyle({ left: '24px', top: '136px' });
    expect(sellCard).toHaveStyle({ left: '320px', top: '136px' });
    expect(section).toHaveStyle({ width: '624px' });
    expect(screen.queryByTestId('section-1-resize-handle')).not.toBeInTheDocument();
  });

  test('keeps freely moved containers below the partition header controls', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const buyCard = screen.getByTestId('basic-buy-group');
    const moveHandle = screen.getByRole('button', { name: '매수 컨테이너 자유 이동' });
    fireEvent.pointerDown(moveHandle, { clientX: 24, clientY: 112, pointerId: 9 });
    fireEvent.pointerMove(surface, { clientX: 24, clientY: 0, pointerId: 9 });
    fireEvent.pointerUp(surface, { clientX: 24, clientY: 0, pointerId: 9 });

    expect(buyCard).toHaveStyle({ top: '136px' });
  });

  test('uses icons in dropdown options and a compact relation token inside blocks', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const operator = within(screen.getByTestId('buy-rsi-block')).getByRole('combobox');
    expect(operator.closest('.block-custom-select')).toHaveClass('is-compact');
    expect(operator.querySelector('.block-relation-icon')).not.toBeInTheDocument();

    await user.click(operator);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    options.filter((option) => !option.textContent?.includes('선택')).forEach((option) => {
      expect(option.querySelector('.select-option-icon')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: '상승' }));
    expect(operator.querySelector('.block-relation-icon')).toBeInTheDocument();
  });

  test('uses icon-led mouse guidance and omits the redundant condition add row', () => {
    render(<BasicEditor goBack={() => {}} />);

    const guide = screen.getByTestId('canvas-gesture-guide');
    expect(guide.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    expect(guide).not.toHaveTextContent('1개 파티션');
    expect(guide).toHaveTextContent('드래그로 이동');
    expect(guide).not.toHaveTextContent('드래그 이동');
    expect(screen.getByTestId('partition-count-badge')).toHaveTextContent('1');
    expect(screen.getByTestId('basic-buy-stack').querySelector('.block-add')).not.toBeInTheDocument();
  });

  test('visually integrates condition blocks with IF and AND stack rails', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const buyStack = screen.getByTestId('basic-buy-stack');
    expect(buyStack).toHaveClass('has-condition-blocks', 'is-single-condition');
    expect(within(buyStack).getByText('IF')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '가격 비교 블록 추가' }));
    expect(buyStack).toHaveClass('is-multi-condition', 'is-segmented-condition');
    expect(within(buyStack).getByText('AND')).toBeInTheDocument();
    expect(buyStack.querySelector('.condition-join-marker')).not.toBeInTheDocument();
  });

  test('uses a broad category-colour band instead of a circular library marker', () => {
    render(<BasicEditor goBack={() => {}} />);

    const priceButton = screen.getByRole('button', { name: '가격 비교 블록 추가' });
    expect(priceButton).toHaveClass('library-block-button', 'has-tone-band');
    expect(priceButton.querySelector('.block-chip-accent')).toBeInTheDocument();
    expect(priceButton.querySelector('.lucide-circle-dot')).not.toBeInTheDocument();
    expect(priceButton.querySelector('.block-chip-name')).toHaveTextContent('가격 비교');
  });

  test('moves a partition by dragging its empty boundary area', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    fireEvent.pointerDown(section, { clientX: 900, clientY: 500, pointerId: 6, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 950, clientY: 530, pointerId: 6 });
    expect(section).toHaveClass('is-section-moving');
    fireEvent.pointerUp(surface, { clientX: 950, clientY: 530, pointerId: 6 });

    expect(section).toHaveStyle({ left: '340px', top: '138px' });
    expect(section).not.toHaveClass('is-section-moving');
  });

  test('automatically expands and shrinks a section boundary around moved strategies', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    const section = screen.getByTestId('strategy-section-1');
    const sellMoveHandle = screen.getByRole('button', { name: '매도 컨테이너 자유 이동' });

    expect(section).toHaveStyle({ width: '624px' });
    fireEvent.pointerDown(sellMoveHandle, { clientX: 310, clientY: 112, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 700, clientY: 400, pointerId: 4 });
    fireEvent.pointerUp(surface, { clientX: 700, clientY: 400, pointerId: 4 });
    expect(section).toHaveStyle({ width: '1014px', height: '734px' });

    fireEvent.pointerDown(sellMoveHandle, { clientX: 700, clientY: 400, pointerId: 5 });
    fireEvent.pointerMove(surface, { clientX: 310, clientY: 112, pointerId: 5 });
    fireEvent.pointerUp(surface, { clientX: 310, clientY: 112, pointerId: 5 });
    expect(section).toHaveStyle({ width: '624px', height: '446px' });
  });

  test('reorders strategy cards inside a section with drag and drop', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const section = screen.getByTestId('strategy-section-1');
    await user.click(within(section).getByRole('button', { name: 'PARTITION 01 매수 컨테이너 추가' }));
    const cards = section.querySelectorAll('.buy-container');
    const primaryCard = cards[0];
    const addedCard = cards[1];
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(addedCard, { dataTransfer });
    fireEvent.dragOver(primaryCard, { dataTransfer });
    fireEvent.drop(primaryCard, { dataTransfer });

    expect(section.querySelectorAll('.buy-container')[0]).toBe(addedCard);
  });

  test('reorders condition blocks inside one strategy by drag and drop', () => {
    render(<BasicEditor goBack={() => {}} />);

    const stack = screen.getByTestId('basic-buy-stack');
    fireEvent.click(screen.getByRole('button', { name: '평균선 교차 블록 추가' }));
    const added = within(stack).getByLabelText(/평균선 교차 블록/);
    const rsi = screen.getByTestId('buy-rsi-block');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(added, { dataTransfer });
    fireEvent.dragOver(rsi, { dataTransfer });
    fireEvent.drop(rsi, { dataTransfer });

    expect(stack.querySelectorAll('.draggable-strategy-block')[0]).toBe(added);
  });

  test('inserts a dragged library block after the bottom block when dropped on its lower half', () => {
    render(<BasicEditor goBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '평균선 교차 블록 추가' }));
    const stack = screen.getByTestId('basic-buy-stack');
    const bottomBlock = within(stack).getByLabelText(/평균선 교차 블록/);
    vi.spyOn(bottomBlock, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      right: 280,
      bottom: 160,
      left: 0,
      width: 280,
      height: 60,
      toJSON: () => ({}),
    });

    const libraryBlock = screen.getByRole('button', { name: 'MACD 전환 블록 추가' });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(libraryBlock, { dataTransfer });
    const dragOverEvent = createEvent.dragOver(bottomBlock, { dataTransfer });
    Object.defineProperty(dragOverEvent, 'clientY', { value: 150 });
    fireEvent(bottomBlock, dragOverEvent);
    expect(bottomBlock).toHaveAttribute('data-drop-position', 'after');
    const dropEvent = createEvent.drop(bottomBlock, { dataTransfer });
    Object.defineProperty(dropEvent, 'clientY', { value: 150 });
    fireEvent(bottomBlock, dropEvent);

    const blocks = stack.querySelectorAll('.draggable-strategy-block');
    expect(blocks[blocks.length - 1]).toHaveAccessibleName(/MACD 전환 블록/);
  });

  test('deletes a condition block by dropping it into the bottom trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const block = screen.getByTestId('buy-rsi-block');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(block, { dataTransfer });

    const trash = screen.getByTestId('editor-trash-zone');
    expect(trash).toHaveAttribute('aria-label', '블록 삭제 영역');
    fireEvent.dragOver(trash, { dataTransfer });
    expect(trash).toHaveClass('is-ready');
    fireEvent.drop(trash, { dataTransfer });

    expect(screen.queryByTestId('buy-rsi-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-trash-zone')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('블록을 삭제했습니다.');
  });

  test('deletes a strategy card by dropping it into the bottom trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const card = screen.getByTestId('basic-sell-group');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(card, { dataTransfer });

    const trash = screen.getByTestId('editor-trash-zone');
    expect(trash).toHaveAttribute('aria-label', '컨테이너 삭제 영역');
    fireEvent.drop(trash, { dataTransfer });

    expect(screen.queryByTestId('basic-sell-group')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('컨테이너를 삭제했습니다.');
  });

  test('marks a strategy incomplete when a section has no buy strategy and explains the requirement on save', async () => {
    const user = userEvent.setup();
    render(<BasicEditor goBack={() => {}} />);

    const card = screen.getByTestId('basic-buy-group');
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(screen.getByTestId('editor-trash-zone'), { dataTransfer });

    const completeness = screen.getByRole('region', { name: '전략 완성도' });
    expect(completeness).toHaveTextContent('미완성 전략');
    expect(completeness).toHaveTextContent('PARTITION 01에 매수 컨테이너가 필요합니다.');
    expect(screen.getByTestId('strategy-section-1')).toHaveClass('has-validation-error');
    expect(screen.getByRole('button', { name: 'PARTITION 01 필수 매수 컨테이너 추가' })).toBeInTheDocument();
    const unavailableLaunch = screen.getByRole('button', { name: '개인 봇 출시' });
    expect(unavailableLaunch).toHaveClass('is-unavailable');
    expect(unavailableLaunch).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('미완성 상태로 저장했습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('모든 컨테이너의 조건을 완성하면 출시할 수 있습니다.');

    await user.click(screen.getByRole('button', { name: '개인 봇 출시' }));
    expect(screen.queryByRole('dialog', { name: '개인 운용 봇 출시' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('출시하려면 1개 항목을 완성해 주세요.');
    expect(screen.getByRole('alert')).toHaveTextContent('PARTITION 01에 매수 컨테이너가 필요합니다.');

    await user.click(screen.getByRole('button', { name: 'PARTITION 01 필수 매수 컨테이너 추가' }));
    expect(completeness).toHaveTextContent('매수 컨테이너에 조건 블록을 하나 이상 추가해 주세요.');
    await user.click(screen.getByRole('button', { name: 'RSI 반등 블록 추가' }));
    expect(completeness).toHaveTextContent('입력하지 않은 블록 설정을 완료해 주세요');
    expect(completeness).not.toHaveTextContent('Null');
    expect(screen.getByTestId('strategy-section-1')).toHaveClass('has-validation-error');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows save feedback as a toast and dismisses it automatically', () => {
    vi.useFakeTimers();
    try {
      render(<BasicEditor goBack={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: '저장' }));

      const toast = screen.getByRole('alert');
      expect(toast).toHaveClass('editor-save-toast');
      expect(toast).toHaveClass('is-bottom-center');
      expect(toast).toHaveTextContent('미완성 상태로 저장했습니다.');

      act(() => {
        vi.advanceTimersByTime(2_000);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('marks a buy strategy incomplete when it contains no condition blocks', () => {
    render(<BasicEditor goBack={() => {}} />);

    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(screen.getByTestId('buy-rsi-block'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('editor-trash-zone'), { dataTransfer });

    expect(screen.getByTestId('basic-buy-group')).toHaveClass('has-validation-error');
    expect(screen.getByRole('region', { name: '전략 완성도' })).toHaveTextContent(
      'PARTITION 01의 매수 컨테이너에 조건 블록을 하나 이상 추가해 주세요.',
    );
  });

  test('deletes a partition when its pointer drag ends over the trash zone', () => {
    render(<BasicEditor goBack={() => {}} />);

    const surface = screen.getByTestId('section-drawing-surface');
    fireEvent.pointerDown(screen.getByTestId('section-1-move-handle'), {
      clientX: 300,
      clientY: 120,
      pointerId: 8,
    });
    const trash = screen.getByTestId('editor-trash-zone');
    vi.spyOn(trash, 'getBoundingClientRect').mockReturnValue({
      left: 400,
      right: 620,
      top: 700,
      bottom: 760,
      width: 220,
      height: 60,
      x: 400,
      y: 700,
      toJSON: () => {},
    });

    fireEvent.pointerMove(surface, { clientX: 500, clientY: 730, pointerId: 8 });
    expect(trash).toHaveClass('is-ready');
    fireEvent.pointerUp(surface, { clientX: 500, clientY: 730, pointerId: 8 });

    expect(screen.queryByTestId('strategy-section-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-trash-zone')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('파티션을 삭제했습니다.');
  });
});
