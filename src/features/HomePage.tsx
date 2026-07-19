import {
  AlertTriangle,
  ArrowRight,
  CirclePause,
  Clock3,
  FilePenLine,
  RadioTower,
  Trophy,
} from 'lucide-react';
import { PageTitle } from '../components/Overlays';
import {
  formatStrategyUpdatedAt,
  loadStrategyWorkspace,
} from '../strategyStorage';
import type { Route } from '../types';

export function HomePage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const strategyWorkspace = loadStrategyWorkspace();
  const lastStrategy = strategyWorkspace.strategies.find(
    (strategy) => strategy.id === strategyWorkspace.activeStrategyId,
  ) ?? strategyWorkspace.strategies[0];

  return (
    <div className="page home-page">
      <div className="home-page__head">
        <PageTitle
          eyebrow="TODAY"
          title="오늘 할 일"
          description="문제와 다음 행동만 먼저 확인하세요."
        />
        <span className="home-last-sync"><Clock3 size={13} /> 최근 갱신 22:45 KST</span>
      </div>

      <section className="home-priority" aria-labelledby="home-priority-title">
        <span className="home-priority__icon"><AlertTriangle size={20} /></span>
        <div className="home-priority__copy">
          <span>조치 필요 · 가장 먼저</span>
          <h2 id="home-priority-title">가격 데이터 갱신이 지연됐습니다</h2>
          <p>신규 주문은 멈췄지만 기존 지정가 주문 1건은 아직 유효합니다.</p>
        </div>
        <button type="button" onClick={() => onNavigate('bots')}>
          문제 확인 <ArrowRight size={14} />
        </button>
      </section>

      <div className="home-content-grid">
        <section className="surface home-task-panel">
          <header className="home-section-head">
            <div><span className="eyebrow">NEXT ACTION</span><h2>이어서 할 일</h2></div>
            <span className="home-section-count">2개</span>
          </header>

          <div className="home-task-list">
            <button type="button" className="home-task-row is-primary" onClick={() => onNavigate('strategy')}>
              <span className="home-task-row__icon"><FilePenLine size={18} /></span>
              <span className="home-task-row__copy">
                <small>마지막 편집 전략 · {lastStrategy.mode === 'basic' ? 'Basic' : 'Pro'}</small>
                <strong>{lastStrategy.name}</strong>
                <span>{formatStrategyUpdatedAt(lastStrategy.updatedAt)} · 이 브라우저에 보관</span>
              </span>
              <span className="home-task-row__action">편집 계속 <ArrowRight size={13} /></span>
            </button>

            <button type="button" className="home-task-row" onClick={() => onNavigate('rooms')}>
              <span className="home-task-row__icon"><Trophy size={18} /></span>
              <span className="home-task-row__copy">
                <small>참여 중인 방 · 진행 중</small>
                <strong>B205 전략 실험실</strong>
                <span>종료까지 28일 · 7명 참여</span>
              </span>
              <span className="home-task-row__action">방 열기 <ArrowRight size={13} /></span>
            </button>
          </div>
        </section>

        <aside className="surface home-status-panel">
          <header className="home-section-head">
            <div><span className="eyebrow">OPERATIONS</span><h2>운영 요약</h2></div>
            <button type="button" className="text-button" onClick={() => onNavigate('bots')}>봇 관리</button>
          </header>

          <div className="home-status-list">
            <button type="button" className="is-attention" onClick={() => onNavigate('bots')}>
              <AlertTriangle size={15} /><span>조치 필요</span><strong>1</strong>
            </button>
            <button type="button" onClick={() => onNavigate('bots')}>
              <RadioTower size={15} /><span>실행 중</span><strong>1</strong>
            </button>
            <button type="button" onClick={() => onNavigate('bots')}>
              <CirclePause size={15} /><span>일시정지</span><strong>1</strong>
            </button>
          </div>

          <section className="home-order-summary" aria-label="오늘 주문 처리 요약">
            <header><strong>오늘 주문</strong><span>총 8건</span></header>
            <div className="home-order-track" aria-hidden="true">
              <i className="is-filled" style={{ flex: 5 }} />
              <i className="is-open" style={{ flex: 2 }} />
              <i className="is-cancelled" style={{ flex: 1 }} />
            </div>
            <dl>
              <div><dt>체결</dt><dd>5</dd></div>
              <div><dt>미체결</dt><dd>2</dd></div>
              <div><dt>취소</dt><dd>1</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
