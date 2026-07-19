import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { Modal, Notice, SidePanel } from './components/Overlays';
import { BotsPage } from './features/BotsPage';
import { HomePage } from './features/HomePage';
import { LoginPage } from './features/LoginPage';
import { RoomsPage } from './features/RoomsPage';
import { StrategyPage } from './features/StrategyPage';
import { loadStrategyWorkspace } from './strategyStorage';
import {
  hasSeenStrategyTutorial,
  resetStrategyTutorial,
} from './tutorialStorage';
import type { Mode, Route } from './types';

type HelpTopic = 'menu' | 'glossary' | 'orders';
type TimeZone = 'KST' | 'ET';
type ThemePreference = 'system' | 'light' | 'dark';

function loadThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem('i2s-theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function loadInitialStrategyMode(): Mode {
  const workspace = loadStrategyWorkspace();
  return workspace.strategies.find(
    (strategy) => strategy.id === workspace.activeStrategyId,
  )?.mode ?? 'basic';
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [route, setRoute] = useState<Route>('home');
  const [mode, setMode] = useState<Mode>(loadInitialStrategyMode);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic>('menu');
  const [tutorialRequest, setTutorialRequest] = useState(0);
  const [tutorialResetNotice, setTutorialResetNotice] = useState('');
  const [botCreateRequest, setBotCreateRequest] = useState(0);
  const [timeZone, setTimeZone] = useState<TimeZone>('KST');
  const [reduceMotion, setReduceMotion] = useState(true);
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme = themePreference === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : themePreference;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem('i2s-theme', themePreference);
  }, [resolvedTheme, themePreference]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  return (
    <AppShell
      route={route}
      onRoute={setRoute}
      onNotifications={() => setShowNotifications(true)}
      onHelp={() => {
        setHelpTopic('menu');
        setShowHelp(true);
      }}
      onSettings={() => setShowSettings(true)}
      timeZone={timeZone}
      reduceMotion={reduceMotion}
    >
      {route === 'home' && <HomePage onNavigate={setRoute} />}
      {route === 'strategy' && (
        <StrategyPage
          mode={mode}
          onModeChange={setMode}
          onOpenBots={() => {
            setRoute('bots');
            setBotCreateRequest((request) => request + 1);
          }}
          tutorialRequest={tutorialRequest}
        />
      )}
      {route === 'bots' && <BotsPage createRequest={botCreateRequest} />}
      {route === 'rooms' && <RoomsPage />}

      {showNotifications && (
        <SidePanel title="알림" onClose={() => setShowNotifications(false)}>
          <Notice tone="danger" title="데이터 확인이 필요합니다" body="데이터 확인 필요 봇의 가격 갱신이 지연됐습니다." />
          <Notice tone="warning" title="열린 주문이 유지되고 있습니다" body="일시정지한 봇의 주문 1건은 조건이 맞으면 체결될 수 있습니다." />
          <Notice tone="neutral" title="방 모집 일정" body="여름 학습 대회 모집이 5일 후 마감됩니다." />
        </SidePanel>
      )}

      {showHelp && (
        <SidePanel title={helpTopic === 'menu' ? '도움말' : helpTopic === 'glossary' ? '금융·데이터 용어집' : '주문 상태 이해하기'} onClose={() => setShowHelp(false)}>
          {helpTopic === 'menu' ? (
            <>
              <div className="help-hero">
                <span>현재 화면 도움말</span>
                <h3>{route === 'strategy' ? '블록과 그래프를 직접 구성하는 방법' : route === 'bots' ? '일시정지·중단·운영 종료의 차이' : route === 'rooms' ? '대회 방 참여와 관리' : '지금 확인할 작업 찾기'}</h3>
                <p>추천값 없이 사용자가 직접 선택하고 입력하는 흐름을 안내합니다.</p>
              </div>
              <button
                type="button"
                className="side-list-button"
                onClick={() => {
                  setRoute('strategy');
                  setTutorialRequest((request) => request + 1);
                  setShowHelp(false);
                }}
              >
                빠른 튜토리얼 다시 시작 <span>→</span>
              </button>
              <button type="button" className="side-list-button" onClick={() => setHelpTopic('glossary')}>
                금융·데이터 용어집 <span>→</span>
              </button>
              <button type="button" className="side-list-button" onClick={() => setHelpTopic('orders')}>
                주문 상태 이해하기 <span>→</span>
              </button>
            </>
          ) : (
            <HelpTopicContent topic={helpTopic} onBack={() => setHelpTopic('menu')} />
          )}
        </SidePanel>
      )}

      {showSettings && (
        <Modal title="설정" onClose={() => setShowSettings(false)}>
          <p className="settings-note">변경 내용은 이 데모 화면에 즉시 적용됩니다.</p>
          <label className="field">
            <span>화면 테마</span>
            <select value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
              <option value="system">시스템 설정 사용</option>
              <option value="light">라이트 모드</option>
              <option value="dark">다크 모드</option>
            </select>
          </label>
          <label className="field"><span>기본 시간대</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value as TimeZone)}><option value="KST">KST · 한국 표준시</option><option value="ET">ET · 미국 동부시간</option></select></label>
          <label className="field"><span>기본 전략 모드</span><select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="basic">Basic · 퍼즐 블록</option><option value="pro">Pro · 자유 그래프</option></select></label>
          <label className="switch-line"><input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} /> 모션 줄이기</label>
          <section className="settings-tutorials">
            <div>
              <strong>전략 튜토리얼</strong>
              <p>완료하거나 전체 건너뛰기 한 모드는 자동으로 다시 열리지 않습니다.</p>
            </div>
            {(['basic', 'pro'] as Mode[]).map((tutorialMode) => (
              <button
                type="button"
                key={tutorialMode}
                className="button button--ghost"
                onClick={() => {
                  resetStrategyTutorial(tutorialMode);
                  if (mode === tutorialMode) {
                    setRoute('strategy');
                    setTutorialRequest((request) => request + 1);
                    setShowSettings(false);
                    setTutorialResetNotice('');
                    return;
                  }
                  setTutorialResetNotice(`${tutorialMode === 'basic' ? 'Basic' : 'Pro'} 튜토리얼을 다시 표시하도록 설정했습니다. 해당 모드 전략을 열면 시작됩니다.`);
                }}
              >
                {tutorialMode === 'basic' ? 'Basic' : 'Pro'} 다시 보기
                <span>{hasSeenStrategyTutorial(tutorialMode) ? '확인 완료' : '표시 예정'}</span>
              </button>
            ))}
            {tutorialResetNotice && <p className="settings-tutorials__notice" role="status">{tutorialResetNotice}</p>}
          </section>
          <button className="button button--primary" onClick={() => setShowSettings(false)}>완료</button>
        </Modal>
      )}
    </AppShell>
  );
}

function HelpTopicContent({
  topic,
  onBack,
}: {
  topic: Exclude<HelpTopic, 'menu'>;
  onBack: () => void;
}) {
  const items = topic === 'glossary'
    ? [
      ['유니버스', '사용자가 분석 대상으로 직접 선택한 종목 집합입니다.'],
      ['시계열', '시간 순서대로 쌓인 가격·거래량 같은 데이터입니다.'],
      ['백테스트', '과거 데이터에서 전략 구조가 어떻게 동작했는지 확인하는 모의 실행입니다.'],
      ['미체결 주문', '주문은 전송됐지만 아직 거래가 완료되지 않은 상태입니다.'],
    ]
    : [
      ['일시정지', '새 주문 생성을 멈춥니다. 이미 보낸 미체결 주문과 보유 포지션은 유지될 수 있습니다.'],
      ['중단', '새 주문을 멈추고 미체결 주문을 취소합니다. 보유 포지션은 유지하며 나중에 재개할 수 있습니다.'],
      ['운영 종료', '봇 운영을 끝냅니다. 다시 시작하려면 새 운영 절차가 필요합니다.'],
      ['재개', '현재 상태에서 평가를 다시 시작합니다. 취소된 주문은 자동으로 복원되지 않습니다.'],
    ];

  return (
    <div className="help-topic">
      <button type="button" className="text-button" onClick={onBack}>← 도움말 목록</button>
      <div className="help-topic__list">
        {items.map(([title, body]) => (
          <article key={title}>
            <strong>{title}</strong>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
