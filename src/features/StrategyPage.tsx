import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Blocks,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FolderOpen,
  History,
  Layers3,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Overlays';
import {
  copyStrategyEditorData,
  createStrategyMeta,
  createStrategyVersion,
  formatStrategyUpdatedAt,
  loadStrategyVersions,
  loadStrategyWorkspace,
  removeStrategyEditorData,
  restoreStrategyVersion,
  saveStrategyWorkspace,
  type StrategyMeta,
  type StrategyVersion,
  type StrategyWorkspace,
} from '../strategyStorage';
import {
  hasSeenStrategyTutorial,
  markStrategyTutorialSeen,
} from '../tutorialStorage';
import type {
  Mode,
  StrategyEditorStatus,
  StrategySaveState,
  StrategyTutorialAction,
  TutorialExitRequest,
} from '../types';
import { BasicStrategyEditor } from './strategy/BasicStrategyEditor';
import { ProStrategyEditor } from './strategy/ProStrategyEditor';

type StrategyPageProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onOpenBots: () => void;
  tutorialRequest?: number;
};

const initialEditorStatus: StrategyEditorStatus = {
  errorCount: 1,
  warningCount: 0,
  infoCount: 0,
  itemCount: 0,
  isReady: false,
};

export function StrategyPage({
  mode,
  onModeChange,
  onOpenBots,
  tutorialRequest = 0,
}: StrategyPageProps) {
  const needsInitialTutorial = !hasSeenStrategyTutorial(mode);
  const [tutorialStep, setTutorialStep] = useState(
    () => needsInitialTutorial ? 1 : 0,
  );
  const [tutorialSessionId, setTutorialSessionId] = useState(
    () => needsInitialTutorial ? 1 : 0,
  );
  const [tutorialPracticeActive, setTutorialPracticeActive] = useState(needsInitialTutorial);
  const [tutorialStartsFromBlank, setTutorialStartsFromBlank] = useState(false);
  const [tutorialOriginalWasBlank, setTutorialOriginalWasBlank] = useState<boolean | null>(null);
  const [tutorialExitRequest, setTutorialExitRequest] = useState<TutorialExitRequest | null>(null);
  const [showTutorialKeepChoice, setShowTutorialKeepChoice] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [workspace, setWorkspace] = useState<StrategyWorkspace>(loadStrategyWorkspace);
  const workspaceRef = useRef(workspace);
  const activeStrategy = workspace.strategies.find(
    (strategy) => strategy.id === workspace.activeStrategyId,
  ) ?? workspace.strategies[0];
  const [draftName, setDraftName] = useState(activeStrategy.name);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [showStrategyList, setShowStrategyList] = useState(false);
  const [strategyListFilter, setStrategyListFilter] = useState<'active' | 'archived'>('active');
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<StrategyVersion[]>(
    () => loadStrategyVersions(activeStrategy.id),
  );
  const [versionSummary, setVersionSummary] = useState('');
  const [pendingRestore, setPendingRestore] = useState<StrategyVersion | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StrategyMeta | null>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetRequest, setResetRequest] = useState(0);
  const [saveRequest, setSaveRequest] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [validationRequest, setValidationRequest] = useState(0);
  const [conversionRevision, setConversionRevision] = useState(0);
  const [convertFromBasic, setConvertFromBasic] = useState(false);
  const [editorStatus, setEditorStatus] = useState<StrategyEditorStatus>(initialEditorStatus);
  const [saveState, setSaveState] = useState<StrategySaveState>('saved');

  const beginTutorial = useCallback((startsFromBlank = false) => {
    setTutorialOriginalWasBlank(null);
    setTutorialExitRequest(null);
    setShowTutorialKeepChoice(false);
    setTutorialStartsFromBlank(startsFromBlank);
    setTutorialPracticeActive(true);
    setTutorialSessionId((sessionId) => sessionId + 1);
    setTutorialStep(1);
  }, []);

  const setTutorialForMode = useCallback((nextMode: Mode) => {
    if (hasSeenStrategyTutorial(nextMode)) {
      setTutorialStep(0);
      setTutorialPracticeActive(false);
      setTutorialStartsFromBlank(false);
      setTutorialOriginalWasBlank(null);
      setTutorialExitRequest(null);
      setShowTutorialKeepChoice(false);
      return;
    }
    beginTutorial();
  }, [beginTutorial]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    setVersions(loadStrategyVersions(activeStrategy.id));
    setVersionSummary('');
  }, [activeStrategy.id]);

  useEffect(() => {
    if (tutorialRequest > 0) beginTutorial();
  }, [beginTutorial, tutorialRequest]);

  useEffect(() => {
    if (mode !== activeStrategy.mode) onModeChange(activeStrategy.mode);
  }, [activeStrategy.mode, mode, onModeChange]);

  const commitWorkspace = useCallback((
    update: (current: StrategyWorkspace) => StrategyWorkspace,
  ) => {
    const next = update(workspaceRef.current);
    try {
      saveStrategyWorkspace(next);
      workspaceRef.current = next;
      setWorkspace(next);
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, []);

  const openNameEditor = () => {
    setDraftName(activeStrategy.name);
    setShowNameEditor(true);
  };

  const saveName = () => {
    const nextName = draftName.trim();
    if (!nextName) return;
    const updatedAt = new Date().toISOString();
    const saved = commitWorkspace((current) => ({
      ...current,
      strategies: current.strategies.map((strategy) => (
        strategy.id === activeStrategy.id
          ? { ...strategy, name: nextName, updatedAt }
          : strategy
      )),
    }));
    if (!saved) return;
    setSaveState('saved');
    setShowNameEditor(false);
  };

  const performReset = () => {
    setResetRequest((request) => request + 1);
    beginTutorial(true);
    setShowResetConfirm(false);
  };

  const startBlank = () => {
    if (editorStatus.itemCount === 0) {
      performReset();
      return;
    }
    setShowResetConfirm(true);
  };

  const requestModeChange = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setPendingMode(nextMode);
  };

  const applyModeChange = (nextMode: Mode, convert = false) => {
    const updatedAt = new Date().toISOString();
    if (!commitWorkspace((current) => ({
      ...current,
      strategies: current.strategies.map((strategy) => (
        strategy.id === activeStrategy.id
          ? { ...strategy, mode: nextMode, updatedAt }
          : strategy
      )),
    }))) return;
    setConvertFromBasic(convert);
    if (convert) setConversionRevision((revision) => revision + 1);
    onModeChange(nextMode);
    setEditorStatus(initialEditorStatus);
    setTutorialForMode(nextMode);
    setPendingMode(null);
  };

  const retrySave = () => {
    setSaveState('saving');
    setSaveRequest((request) => request + 1);
  };

  const handleStatusChange = useCallback((status: StrategyEditorStatus) => {
    setEditorStatus(status);
  }, []);

  const handleSaved = useCallback(() => {
    const updatedAt = new Date().toISOString();
    commitWorkspace((current) => ({
      ...current,
      strategies: current.strategies.map((strategy) => (
        strategy.id === current.activeStrategyId
          ? { ...strategy, updatedAt }
          : strategy
      )),
    }));
  }, [commitWorkspace]);

  const captureCurrentVersion = (summary?: string) => {
    if (saveState !== 'saved') return false;
    const fallbackSummary = `${mode === 'basic' ? 'Basic 퍼즐' : 'Pro 그래프'} · 구성 요소 ${editorStatus.itemCount}개 · 오류 ${editorStatus.errorCount}개 · 경고 ${editorStatus.warningCount}개`;
    try {
      createStrategyVersion(activeStrategy, summary?.trim() || versionSummary.trim() || fallbackSummary);
      setVersions(loadStrategyVersions(activeStrategy.id));
      setVersionSummary('');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  };

  const openVersionHistory = () => {
    setVersions(loadStrategyVersions(activeStrategy.id));
    setVersionSummary('');
    setShowVersions(true);
  };

  const restoreSelectedVersion = () => {
    if (!pendingRestore || saveState !== 'saved') return;
    try {
      createStrategyVersion(
        activeStrategy,
        `v${pendingRestore.number} 복원 전 자동 보관`,
      );
      restoreStrategyVersion(activeStrategy.id, pendingRestore);
    } catch {
      setSaveState('error');
      return;
    }
    const updatedAt = new Date().toISOString();
    const restored = commitWorkspace((current) => ({
      ...current,
      strategies: current.strategies.map((strategy) => (
        strategy.id === activeStrategy.id
          ? { ...strategy, mode: pendingRestore.mode, updatedAt }
          : strategy
      )),
    }));
    if (!restored) return;
    setVersions(loadStrategyVersions(activeStrategy.id));
    setPendingRestore(null);
    setConvertFromBasic(false);
    setEditorRevision((revision) => revision + 1);
    setEditorStatus(initialEditorStatus);
    setTutorialForMode(pendingRestore.mode);
    setSaveState('saved');
    onModeChange(pendingRestore.mode);
  };

  const resetWithVersion = () => {
    if (!captureCurrentVersion('초기화 전 자동 보관')) return;
    performReset();
  };

  const archiveStrategy = (strategy: StrategyMeta) => {
    const current = workspaceRef.current;
    const archivedAt = new Date().toISOString();
    let strategies = current.strategies.map((item) => (
      item.id === strategy.id ? { ...item, archivedAt } : item
    ));
    let nextActive = strategies.find(
      (item) => item.id !== strategy.id && !item.archivedAt,
    );
    if (strategy.id === current.activeStrategyId && !nextActive) {
      nextActive = createStrategyMeta('basic', strategies.length + 1);
      strategies = [nextActive, ...strategies];
    }
    const activeStrategyId = strategy.id === current.activeStrategyId
      ? nextActive!.id
      : current.activeStrategyId;
    if (!commitWorkspace(() => ({ activeStrategyId, strategies }))) return;
    if (strategy.id === current.activeStrategyId) {
      onModeChange(nextActive!.mode);
      setEditorStatus(initialEditorStatus);
      setEditorRevision((revision) => revision + 1);
      setTutorialForMode(nextActive!.mode);
    }
    setStrategyListFilter('archived');
  };

  const unarchiveStrategy = (strategy: StrategyMeta) => {
    const updatedAt = new Date().toISOString();
    if (!commitWorkspace((current) => ({
      ...current,
      strategies: current.strategies.map((item) => (
        item.id === strategy.id
          ? { ...item, archivedAt: undefined, updatedAt }
          : item
      )),
    }))) return;
    setStrategyListFilter('active');
  };

  const selectStrategy = (strategy: StrategyMeta) => {
    if (strategy.archivedAt) return;
    if (!commitWorkspace((current) => ({
      ...current,
      activeStrategyId: strategy.id,
    }))) return;
    setEditorStatus(initialEditorStatus);
    setSaveState('saved');
    setConvertFromBasic(false);
    setEditorRevision((revision) => revision + 1);
    onModeChange(strategy.mode);
    setShowStrategyList(false);
    setTutorialForMode(strategy.mode);
  };

  const createStrategy = (nextMode: Mode) => {
    const strategy = createStrategyMeta(
      nextMode,
      workspaceRef.current.strategies.length + 1,
    );
    if (!commitWorkspace((current) => ({
      activeStrategyId: strategy.id,
      strategies: [strategy, ...current.strategies],
    }))) return;
    setEditorStatus(initialEditorStatus);
    setSaveState('saved');
    setConvertFromBasic(false);
    setEditorRevision((revision) => revision + 1);
    onModeChange(nextMode);
    setShowStrategyList(false);
    setTutorialForMode(nextMode);
  };

  const duplicateStrategy = (strategy: StrategyMeta) => {
    const copy = createStrategyMeta(
      strategy.mode,
      workspaceRef.current.strategies.length + 1,
    );
    const duplicated = {
      ...copy,
      name: `${strategy.name} 복사본`,
    };
    copyStrategyEditorData(strategy.id, duplicated.id);
    if (!commitWorkspace((current) => ({
      activeStrategyId: duplicated.id,
      strategies: [duplicated, ...current.strategies],
    }))) return;
    setEditorStatus(initialEditorStatus);
    setSaveState('saved');
    setConvertFromBasic(false);
    setEditorRevision((revision) => revision + 1);
    onModeChange(duplicated.mode);
    setShowStrategyList(false);
    setTutorialForMode(duplicated.mode);
  };

  const deleteStrategy = () => {
    const current = workspaceRef.current;
    if (!pendingDelete || current.strategies.length <= 1) return;
    removeStrategyEditorData(pendingDelete.id);
    let remaining = current.strategies.filter((strategy) => strategy.id !== pendingDelete.id);
    let nextActive = remaining.find(
      (strategy) => strategy.id === current.activeStrategyId && !strategy.archivedAt,
    ) ?? remaining.find((strategy) => !strategy.archivedAt);
    if (!nextActive) {
      nextActive = createStrategyMeta('basic', remaining.length + 1);
      remaining = [nextActive, ...remaining];
    }
    if (!commitWorkspace(() => ({
      activeStrategyId: nextActive.id,
      strategies: remaining,
    }))) return;
    onModeChange(nextActive.mode);
    setPendingDelete(null);
    setShowStrategyList(true);
    setEditorStatus(initialEditorStatus);
    setSaveState('saved');
    setEditorRevision((revision) => revision + 1);
    setTutorialForMode(nextActive.mode);
  };

  const handleTutorialAction = (action: StrategyTutorialAction) => {
    const expectedActions: StrategyTutorialAction[] = mode === 'basic'
      ? [
        'basic-asset-placed',
        'basic-asset-configured',
        'basic-price-placed',
        'basic-price-configured',
      ]
      : [
        'pro-universe-placed',
        'pro-market-placed',
        'pro-connected',
        'pro-configured',
      ];
    setTutorialStep((current) => (
      expectedActions[current - 1] === action ? current + 1 : current
    ));
  };

  const handleTutorialSessionReady = useCallback((sessionId: number, wasBlank: boolean) => {
    if (sessionId === tutorialSessionId) setTutorialOriginalWasBlank(wasBlank);
  }, [tutorialSessionId]);

  const finalizeTutorialExit = (action: TutorialExitRequest['action']) => {
    setTutorialExitRequest({ sessionId: tutorialSessionId, action });
    setTutorialPracticeActive(false);
    setTutorialStartsFromBlank(false);
    setShowTutorialKeepChoice(false);
    markStrategyTutorialSeen(mode);
  };

  const requestTutorialExit = () => {
    setTutorialStep(0);
    if (tutorialOriginalWasBlank) {
      setShowTutorialKeepChoice(true);
      return;
    }
    finalizeTutorialExit('restore');
  };

  const updateTutorialStep = (nextStep: number) => {
    if (nextStep === 0) {
      requestTutorialExit();
      return;
    }
    setTutorialStep(nextStep);
  };

  const activeStrategies = workspace.strategies.filter((strategy) => !strategy.archivedAt);
  const archivedStrategies = workspace.strategies.filter((strategy) => strategy.archivedAt);
  const listedStrategies = strategyListFilter === 'active'
    ? activeStrategies
    : archivedStrategies;

  return (
    <div className={`strategy-studio strategy-studio--${mode} ${tutorialStep > 0 ? 'is-tutorial-active' : ''}`}>
      <StrategyToolbar
        mode={mode}
        onModeChange={requestModeChange}
        onTutorial={() => beginTutorial()}
        onReview={() => setShowReview(true)}
        strategyName={activeStrategy.name}
        onRename={openNameEditor}
        editorStatus={editorStatus}
        saveState={saveState}
        versionCount={versions.length}
        onOpenStrategies={() => setShowStrategyList(true)}
        onOpenVersions={openVersionHistory}
        onRetrySave={retrySave}
      />
      <StartPathBar onStartBlank={startBlank} onValidate={() => setValidationRequest((request) => request + 1)} />
      <div className="legal-strip">
        <ShieldCheck size={14} />
        <strong>사용자 직접 결정 원칙</strong>
        <span>종목, 방향, 기간, 비중, 임계값과 주문 가격을 추천하지 않습니다. 모든 값은 사용자가 직접 입력하며 구조 검사는 수익 가능성을 보장하지 않습니다.</span>
      </div>

      {mode === 'basic'
        ? (
          <BasicStrategyEditor
            key={`${activeStrategy.id}-basic-${editorRevision}`}
            strategyId={activeStrategy.id}
            resetRequest={resetRequest}
            saveRequest={saveRequest}
            validationRequest={validationRequest}
            tutorialStep={tutorialStep}
            tutorialSessionId={tutorialSessionId}
            tutorialPracticeActive={tutorialPracticeActive}
            tutorialStartsFromBlank={tutorialStartsFromBlank}
            tutorialExitRequest={tutorialExitRequest}
            onTutorialAction={handleTutorialAction}
            onTutorialSessionReady={handleTutorialSessionReady}
            onStatusChange={handleStatusChange}
            onSaveStateChange={setSaveState}
            onSaved={handleSaved}
            onRequestReset={startBlank}
          />
        )
        : (
          <ProStrategyEditor
            key={`${activeStrategy.id}-pro-${conversionRevision}-${editorRevision}`}
            strategyId={activeStrategy.id}
            convertFromBasic={convertFromBasic}
            resetRequest={resetRequest}
            saveRequest={saveRequest}
            validationRequest={validationRequest}
            tutorialStep={tutorialStep}
            tutorialSessionId={tutorialSessionId}
            tutorialPracticeActive={tutorialPracticeActive}
            tutorialStartsFromBlank={tutorialStartsFromBlank}
            tutorialExitRequest={tutorialExitRequest}
            onTutorialAction={handleTutorialAction}
            onTutorialSessionReady={handleTutorialSessionReady}
            onStatusChange={handleStatusChange}
            onSaveStateChange={setSaveState}
            onSaved={handleSaved}
          />
        )}

      {tutorialStep > 0 && (
        <Tutorial
          mode={mode}
          step={tutorialStep}
          originalWasBlank={tutorialOriginalWasBlank}
          onStep={updateTutorialStep}
        />
      )}

      {showTutorialKeepChoice && (
        <Modal title="튜토리얼 연습 내용을 유지할까요?" onClose={() => finalizeTutorialExit('restore')}>
          <div className="tutorial-exit-choice">
            <ShieldCheck size={22} />
            <div>
              <strong>튜토리얼을 시작하기 전 전략은 비어 있었습니다.</strong>
              <p>방금 배치하고 설정한 연습 내용을 현재 전략으로 남기거나, 다시 빈 편집기로 돌아갈 수 있습니다.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button button--ghost" onClick={() => finalizeTutorialExit('restore')}>
              빈 편집기로 돌아가기
            </button>
            <button className="button button--primary" onClick={() => finalizeTutorialExit('keep')}>
              연습 내용 유지
            </button>
          </div>
        </Modal>
      )}

      {showReview && (
        <Modal title="전략 완료 검사" onClose={() => setShowReview(false)} wide>
          <div className={`review-banner ${editorStatus.isReady ? 'is-ready' : 'is-blocked'}`}>
            {editorStatus.isReady ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
            <div>
              <strong>
                {editorStatus.isReady
                  ? '봇 생성 전 구조 검사를 통과했습니다.'
                  : `아직 해결해야 할 오류가 ${editorStatus.errorCount}개 있습니다.`}
              </strong>
              <p>
                {editorStatus.isReady
                  ? '경고와 운영 조건을 확인한 뒤 다음 단계로 이동할 수 있습니다.'
                  : '오류 위치로 돌아가 입력과 연결을 수정한 뒤 다시 확인하세요.'}
              </p>
            </div>
          </div>
          <div className="review-status-row" aria-label="현재 전략 검사 요약">
            <span><strong>{editorStatus.itemCount}</strong> {mode === 'basic' ? '연결 블록' : '전략 노드'}</span>
            <span className={editorStatus.errorCount ? 'is-error' : ''}><strong>{editorStatus.errorCount}</strong> 오류</span>
            <span className={editorStatus.warningCount ? 'is-warning' : ''}><strong>{editorStatus.warningCount}</strong> 경고</span>
            <span><strong>{editorStatus.infoCount}</strong> 참고</span>
          </div>
          <div className="review-grid">
            <article><span>01</span><strong>사용자 입력</strong><p>종목과 모든 수치를 사용자가 직접 정했는지 확인합니다.</p></article>
            <article><span>02</span><strong>타입·시간축</strong><p>포트 모양과 시간축이 맞고 역방향·순환 연결이 없는지 확인합니다.</p></article>
            <article><span>03</span><strong>운영 선택</strong><p>백테스트 범위, 비용 가정, 주문과 중단 정책을 마지막에 확인합니다.</p></article>
          </div>
          <div className="modal-actions">
            <button className="button button--ghost" onClick={() => setShowReview(false)}>편집 계속하기</button>
            {editorStatus.isReady ? (
              <button className="button button--primary" onClick={() => { setShowReview(false); onOpenBots(); }}>봇 생성 화면으로</button>
            ) : (
              <button
                className="button button--primary"
                onClick={() => {
                  setShowReview(false);
                  setValidationRequest((request) => request + 1);
                }}
              >
                첫 문제 위치 확인
              </button>
            )}
          </div>
        </Modal>
      )}

      {showStrategyList && (
        <Modal title="내 전략" onClose={() => setShowStrategyList(false)} wide>
          <div className="strategy-list-intro">
            <div>
              <span className="eyebrow">BROWSER-SAVED STRATEGIES</span>
              <h3>이어 만들 전략을 선택하세요</h3>
              <p>현재 샘플에서는 이 브라우저에만 저장되며 다른 계정이나 기기에는 공유되지 않습니다.</p>
            </div>
            <div className="strategy-list-create">
              <button className="button button--ghost" onClick={() => createStrategy('basic')}><Plus size={14} /> 새 Basic</button>
              <button className="button button--primary" onClick={() => createStrategy('pro')}><Plus size={14} /> 새 Pro</button>
            </div>
          </div>
          <div className="strategy-list-tabs" role="tablist" aria-label="전략 목록 구분">
            <button
              role="tab"
              aria-selected={strategyListFilter === 'active'}
              onClick={() => setStrategyListFilter('active')}
            >
              사용 중 <em>{activeStrategies.length}</em>
            </button>
            <button
              role="tab"
              aria-selected={strategyListFilter === 'archived'}
              onClick={() => setStrategyListFilter('archived')}
            >
              보관됨 <em>{archivedStrategies.length}</em>
            </button>
          </div>
          <div className="strategy-list">
            {listedStrategies.length === 0 && (
              <div className="strategy-list-empty">
                {strategyListFilter === 'active' ? <FolderOpen size={20} /> : <Archive size={20} />}
                <strong>{strategyListFilter === 'active' ? '사용 중인 전략이 없습니다' : '보관된 전략이 없습니다'}</strong>
                <p>{strategyListFilter === 'active' ? '새 Basic 또는 Pro 전략을 만들어 시작하세요.' : '당장 사용하지 않는 전략을 보관하면 이곳에서 다시 찾을 수 있습니다.'}</p>
              </div>
            )}
            {[...listedStrategies]
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .map((strategy) => (
                <article key={strategy.id} className={strategy.id === activeStrategy.id ? 'is-active' : ''}>
                  <span className={`strategy-mode-chip is-${strategy.mode}`}>{strategy.mode === 'basic' ? 'Basic' : 'Pro'}</span>
                  <div>
                    <strong>{strategy.name}</strong>
                    <small>
                      {formatStrategyUpdatedAt(strategy.updatedAt)} · {
                        strategy.archivedAt
                          ? '편집 목록에서 보관됨'
                          : strategy.id === activeStrategy.id
                            ? '현재 편집 중'
                            : '저장된 전략'
                      }
                    </small>
                  </div>
                  <div className="strategy-list__actions">
                    {strategy.archivedAt ? (
                      <button className="button button--ghost" onClick={() => unarchiveStrategy(strategy)}>
                        <ArchiveRestore size={13} /> 보관 해제
                      </button>
                    ) : (
                      <>
                        <button className="button button--ghost" onClick={() => selectStrategy(strategy)}>
                          {strategy.id === activeStrategy.id ? '편집 계속' : '열기'} <ArrowRight size={13} />
                        </button>
                        <button className="icon-button" onClick={() => duplicateStrategy(strategy)} aria-label={`${strategy.name} 복제`} title="전략 복제"><Copy size={14} /></button>
                        <button className="icon-button" onClick={() => archiveStrategy(strategy)} aria-label={`${strategy.name} 보관`} title="전략 보관"><Archive size={14} /></button>
                      </>
                    )}
                    <button
                      className="icon-button is-danger"
                      onClick={() => {
                        setPendingDelete(strategy);
                        setShowStrategyList(false);
                      }}
                      aria-label={`${strategy.name} 삭제`}
                      title={workspace.strategies.length <= 1 ? '마지막 전략은 삭제할 수 없습니다' : '전략 영구 삭제'}
                      disabled={workspace.strategies.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </Modal>
      )}

      {showVersions && (
        <Modal title="전략 버전" onClose={() => setShowVersions(false)} wide>
          <div className="version-capture">
            <div>
              <span className={`strategy-mode-chip is-${mode}`}>{mode === 'basic' ? 'Basic' : 'Pro'}</span>
              <div>
                <strong>{activeStrategy.name}</strong>
                <p>현재 편집 상태를 복원 가능한 시점으로 남깁니다. 종목이나 투자 수치를 추천하지 않고 입력 구조만 보관합니다.</p>
              </div>
            </div>
            <label>
              <span>이번 버전의 변경 요약</span>
              <input
                value={versionSummary}
                onChange={(event) => setVersionSummary(event.target.value)}
                maxLength={80}
                placeholder="예: 위험관리 노드와 기록 범위 수정"
              />
            </label>
            <button
              className="button button--primary"
              onClick={() => captureCurrentVersion()}
              disabled={saveState !== 'saved'}
              title={saveState === 'saved' ? '현재 상태를 새 버전으로 저장' : '현재 편집 내용 저장이 끝난 뒤 버전을 만들 수 있습니다'}
            >
              <Save size={14} /> 현재 버전 저장
            </button>
          </div>
          <div className="version-list">
            {versions.length === 0 ? (
              <div className="version-empty">
                <History size={22} />
                <strong>아직 저장한 버전이 없습니다</strong>
                <p>큰 변경 전이나 백테스트에 사용할 구조가 준비됐을 때 버전을 남겨보세요.</p>
              </div>
            ) : versions.map((version) => (
              <article key={version.id}>
                <span className="version-number">v{version.number}</span>
                <div>
                  <strong>{version.summary}</strong>
                  <small>{formatStrategyUpdatedAt(version.createdAt)} · {version.mode === 'basic' ? 'Basic 퍼즐' : 'Pro 그래프'} · 당시 이름 {version.strategyName}</small>
                </div>
                <button
                  className="button button--ghost"
                  onClick={() => {
                    setPendingRestore(version);
                    setShowVersions(false);
                  }}
                  disabled={saveState !== 'saved'}
                >
                  이 버전 복원
                </button>
              </article>
            ))}
          </div>
        </Modal>
      )}

      {pendingRestore && (
        <Modal
          title={`v${pendingRestore.number} 버전을 복원할까요?`}
          onClose={() => {
            setPendingRestore(null);
            setShowVersions(true);
          }}
        >
          <div className="version-restore-warning">
            <History size={21} />
            <div>
              <strong>{pendingRestore.summary}</strong>
              <p>현재 상태는 먼저 ‘복원 전 자동 보관’ 버전으로 남긴 뒤 선택한 시점의 Basic·Pro 작업공간을 복원합니다.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="button button--ghost"
              onClick={() => {
                setPendingRestore(null);
                setShowVersions(true);
              }}
            >
              취소
            </button>
            <button className="button button--primary" onClick={restoreSelectedVersion}>
              자동 보관 후 복원
            </button>
          </div>
        </Modal>
      )}

      {pendingMode && (
        <Modal title="모드 전환 미리보기" onClose={() => setPendingMode(null)} wide>
          <div className="mode-preview-flow" aria-label={`${mode} 모드에서 ${pendingMode} 모드로 전환`}>
            <span className={`strategy-mode-chip is-${mode}`}>{mode === 'basic' ? 'Basic 퍼즐' : 'Pro 그래프'}</span>
            <ArrowRight size={18} />
            <span className={`strategy-mode-chip is-${pendingMode}`}>{pendingMode === 'basic' ? 'Basic 퍼즐' : 'Pro 그래프'}</span>
          </div>
          {mode === 'basic' && pendingMode === 'pro' ? (
            <div className="mode-preview-grid">
              <article className="is-preserved">
                <Check size={17} />
                <div><strong>Basic 원본은 그대로 보존됩니다</strong><p>블록 순서와 직접 입력한 값은 Basic 작업공간에 남아 언제든 다시 열 수 있습니다.</p></div>
              </article>
              <article>
                <Layers3 size={17} />
                <div><strong>연결된 블록을 Pro 노드로 변환합니다</strong><p>종목, 가격, 지표, 시작 조건, 비중, 위험, 주문과 기록 노드를 자유 배치 그래프로 만듭니다.</p></div>
              </article>
              <article className="is-warning">
                <AlertTriangle size={17} />
                <div><strong>종료 조건과 Pro 전용 값은 다시 확인합니다</strong><p>Basic 종료 조건은 자동 연결하지 않으며 데이터 지연, 최소 현금, 하루 손실 한도 같은 Pro 전용 입력은 비워 둡니다.</p></div>
              </article>
            </div>
          ) : (
            <div className="mode-preview-grid">
              <article className="is-preserved">
                <Check size={17} />
                <div><strong>Pro 그래프는 그대로 보존됩니다</strong><p>노드, 연결, 그룹과 블루프린트는 Pro 작업공간에 남습니다.</p></div>
              </article>
              <article className="is-warning">
                <AlertTriangle size={17} />
                <div><strong>Pro 그래프를 Basic으로 축소 변환하지 않습니다</strong><p>분기와 다중 입력을 잃지 않도록 기존 Basic 작업공간을 별도로 엽니다.</p></div>
              </article>
            </div>
          )}
          <div className="modal-actions">
            <button className="button button--ghost" onClick={() => setPendingMode(null)}>취소</button>
            {mode === 'basic' && pendingMode === 'pro' && (
              <button className="button button--ghost" onClick={() => applyModeChange('pro', false)}>기존 Pro 작업공간 열기</button>
            )}
            <button className="button button--primary" onClick={() => applyModeChange(
              pendingMode,
              mode === 'basic' && pendingMode === 'pro',
            )}>
              {mode === 'basic' && pendingMode === 'pro' ? 'Basic 구조로 변환' : 'Basic 작업공간 열기'}
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="전략을 삭제할까요?" onClose={() => setPendingDelete(null)}>
          <div className="strategy-delete-warning">
            <Trash2 size={21} />
            <div>
              <strong>{pendingDelete.name}</strong>
              <p>이 브라우저에 저장된 Basic·Pro 편집 내용과 블루프린트가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button button--ghost" onClick={() => setPendingDelete(null)}>취소</button>
            <button className="button button--danger" onClick={deleteStrategy}>전략 삭제</button>
          </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal title="빈 편집기로 시작할까요?" onClose={() => setShowResetConfirm(false)}>
          <div className="strategy-reset-warning">
            <RotateCcw size={21} />
            <div>
              <strong>{mode === 'basic' ? '현재 Basic 퍼즐' : '현재 Pro 그래프'}의 구성 요소 {editorStatus.itemCount}개를 비웁니다</strong>
              <p>다른 모드의 작업공간과 기존 버전 기록은 유지됩니다. 초기화 전 상태가 필요하다면 먼저 자동 보관 버전을 만들어 주세요.</p>
            </div>
          </div>
          <div className="modal-actions modal-actions--wrap">
            <button className="button button--ghost" onClick={() => setShowResetConfirm(false)}>취소</button>
            <button className="button button--danger" onClick={performReset}>바로 초기화</button>
            <button
              className="button button--primary"
              onClick={resetWithVersion}
              disabled={saveState !== 'saved'}
              title={saveState === 'saved' ? '현재 상태를 버전으로 남긴 뒤 초기화' : '현재 편집 내용 저장이 끝난 뒤 사용할 수 있습니다'}
            >
              <Save size={14} /> 버전 저장 후 초기화
            </button>
          </div>
        </Modal>
      )}

      {showNameEditor && (
        <Modal title="전략 이름 변경" onClose={() => setShowNameEditor(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveName();
            }}
          >
            <label className="field">
              <span>전략 이름</span>
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={40}
                placeholder="전략을 구분할 이름"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button--ghost" onClick={() => setShowNameEditor(false)}>취소</button>
              <button type="submit" className="button button--primary" disabled={!draftName.trim()}>이름 저장</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StrategyToolbar({
  mode,
  onModeChange,
  onTutorial,
  onReview,
  strategyName,
  onRename,
  editorStatus,
  saveState,
  versionCount,
  onOpenStrategies,
  onOpenVersions,
  onRetrySave,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onTutorial: () => void;
  onReview: () => void;
  strategyName: string;
  onRename: () => void;
  editorStatus: StrategyEditorStatus;
  saveState: StrategySaveState;
  versionCount: number;
  onOpenStrategies: () => void;
  onOpenVersions: () => void;
  onRetrySave: () => void;
}) {
  const saveLabel = saveState === 'saving'
    ? '저장 중...'
    : saveState === 'error'
      ? '저장 실패'
      : '이 브라우저에 저장됨';

  return (
    <header className="strategy-toolbar">
      <div className="strategy-toolbar__title">
        <span className="eyebrow">STRATEGY STUDIO</span>
        <div>
          <h1>전략 만들기</h1>
          <button type="button" className="strategy-name-button" onClick={onRename} aria-label="전략 이름 변경">
            {strategyName} <Pencil size={12} />
          </button>
          {saveState === 'error' ? (
            <button
              className="save-state save-state--button is-error"
              onClick={onRetrySave}
              title="브라우저 저장을 다시 시도합니다"
            >
              <RotateCcw size={12} /> 저장 재시도
            </button>
          ) : (
            <span className={`save-state is-${saveState}`} title="현재 샘플에서는 이 브라우저에만 저장됩니다. 다른 기기나 계정에는 동기화되지 않습니다.">
              <Save size={12} /> {saveLabel}
            </span>
          )}
        </div>
      </div>
      <div className="strategy-toolbar__meta">
        <span className="market-pill" title="서비스가 특정 종목이나 투자 수치를 추천하지 않습니다">
          <ShieldCheck size={12} /> 종목·수치 직접 입력
        </span>
      </div>
      <div className="strategy-toolbar__actions">
        <button className="icon-text-button" onClick={onOpenStrategies}><FolderOpen size={15} /> 내 전략</button>
        <button className="icon-text-button" onClick={onOpenVersions}><History size={15} /> 버전 <em>{versionCount}</em></button>
        <button className="icon-text-button" onClick={onTutorial}><CircleHelp size={15} /> 튜토리얼</button>
        <div className="segmented-control" aria-label="전략 모드">
          <button aria-pressed={mode === 'basic'} onClick={() => onModeChange('basic')}>Basic</button>
          <button aria-pressed={mode === 'pro'} onClick={() => onModeChange('pro')}>Pro</button>
        </div>
        <button className="button button--primary strategy-create-button" onClick={onReview}>
          <Play size={15} /> 봇 생성
          {editorStatus.errorCount > 0 && <em aria-label={`오류 ${editorStatus.errorCount}개`}>{editorStatus.errorCount}</em>}
        </button>
      </div>
    </header>
  );
}

function StartPathBar({
  onStartBlank,
  onValidate,
}: {
  onStartBlank: () => void;
  onValidate: () => void;
}) {
  return (
    <section className="start-path-bar" aria-label="전략 시작과 검사">
      <ol className="strategy-stepper">
        <li className="strategy-step strategy-step--complete">
          <button
            type="button"
            onClick={onStartBlank}
            title="빈 편집기로 초기화하고 튜토리얼 시작"
            aria-label="1단계 구성 시작: 빈 편집기로 초기화하고 튜토리얼 시작"
          >
            <span className="strategy-step__dot"><Check size={13} /></span>
            <strong>구성 시작</strong>
          </button>
        </li>
        <li className="strategy-step strategy-step--current" aria-current="step">
          <div aria-label="2단계 전략 편집, 현재 단계">
            <span className="strategy-step__dot">2</span>
            <strong>전략 편집</strong>
          </div>
        </li>
        <li className="strategy-step strategy-step--next">
          <button
            type="button"
            onClick={onValidate}
            title="타입·순서·필수값 검사"
            aria-label="3단계 구조 검사: 타입·순서·필수값 확인"
          >
            <span className="strategy-step__dot">3</span>
            <strong>구조 검사</strong>
          </button>
        </li>
      </ol>
    </section>
  );
}

function Tutorial({
  mode,
  step,
  originalWasBlank,
  onStep,
}: {
  mode: Mode;
  step: number;
  originalWasBlank: boolean | null;
  onStep: (step: number) => void;
}) {
  const steps = mode === 'basic'
    ? [
      {
        title: '‘원하는 종목 선택하기’ 블록을 첫 홈에 끼우세요',
        description: '밝게 표시된 블록을 직접 끌어 가운데 첫 홈에 놓으세요. 올바른 순서와 퍼즐 모양이 맞으면 자동으로 결합됩니다.',
        actionHint: '블록을 홈에 놓으면 다음 단계로 자동 이동합니다.',
        arrowLabel: '블록을 끌어 놓기',
      },
      {
        title: '사용할 회사명 또는 심볼을 직접 입력하세요',
        description: '서비스가 종목을 추천하거나 자동으로 채우지 않습니다. 사용자가 선택한 항목을 직접 입력하면 다음 블록이 열립니다.',
        actionHint: '빈 입력칸에 사용자가 선택한 회사명 또는 심볼을 입력하세요.',
        arrowLabel: '',
      },
      {
        title: '‘가격 데이터 불러오기’ 블록을 다음 홈에 연결하세요',
        description: '새로 밝아진 가격 블록을 다음 홈으로 끌어 놓으세요. Universe 연결부 모양이 맞아야 퍼즐처럼 이어집니다.',
        actionHint: '가격 블록을 다음 홈에 놓으면 연결 상태를 바로 확인할 수 있습니다.',
        arrowLabel: '블록을 끌어 연결',
      },
      {
        title: '가격 데이터의 시간축을 직접 선택하세요',
        description: '특정 시간축을 권장하지 않습니다. 사용 목적에 맞는 항목을 직접 선택하면 설정 실습이 완료됩니다.',
        actionHint: '밝게 표시된 가격 블록 안에서 시간축을 직접 선택하세요.',
        arrowLabel: '',
      },
      {
        title: 'Basic 퍼즐의 첫 연결을 완성했습니다',
        description: '종목 선택과 가격 데이터 연결 방식을 익혔습니다. 이 실습은 투자 수치나 성과를 추천하지 않습니다.',
        actionHint: '완료를 누르면 기존 전략을 복원하거나, 원래 빈 전략이었다면 연습 내용 유지 여부를 선택합니다.',
        arrowLabel: '',
      },
    ]
    : [
      {
        title: '‘직접 선택 바스켓’을 캔버스에 배치하세요',
        description: '밝게 표시된 노드를 직접 끌어 가운데 원하는 위치에 놓으세요. 서비스가 종목을 대신 선택하지 않습니다.',
        actionHint: '노드를 캔버스에 놓으면 다음 단계로 자동 이동합니다.',
        arrowLabel: '노드를 끌어 배치',
      },
      {
        title: '‘가격·거래량’ 노드를 오른쪽에 배치하세요',
        description: '두 노드의 연결부가 잘 보이도록 직접 선택 바스켓의 오른쪽에 놓아보세요. 위치는 나중에도 자유롭게 바꿀 수 있습니다.',
        actionHint: '가격·거래량 노드를 캔버스에 직접 놓으세요.',
        arrowLabel: '노드를 끌어 배치',
      },
      {
        title: '두 노드의 Universe 연결부를 선으로 이으세요',
        description: '직접 선택 바스켓의 출력 연결부에서 가격·거래량의 입력 연결부까지 드래그하세요. 연결 가능한 같은 계열 도형만 밝게 표시됩니다.',
        actionHint: '밝은 출력 포트에서 밝은 입력 포트까지 선을 직접 끌어 연결하세요.',
        arrowLabel: '선을 끌어 연결',
      },
      {
        title: '시간축과 최대 지연을 직접 설정하세요',
        description: '가격·거래량 노드가 선택되어 오른쪽 설정에 표시됩니다. 특정 시간축이나 숫자를 추천하지 않으므로 두 값을 사용자가 직접 정하세요.',
        actionHint: '시간축을 선택하고 최대 지연을 입력하면 설정 실습이 완료됩니다.',
        arrowLabel: '오른쪽에서 설정',
      },
      {
        title: 'Pro 그래프의 배치·연결·설정을 완성했습니다',
        description: '노드 두 개를 배치하고 호환 포트를 연결한 뒤 필수 설정을 입력했습니다. 구조 실습은 투자 적합성이나 수익성을 보장하지 않습니다.',
        actionHint: '완료를 누르면 기존 그래프를 복원하거나, 원래 빈 전략이었다면 연습 내용 유지 여부를 선택합니다.',
        arrowLabel: '',
      },
    ];
  const current = steps[Math.min(step - 1, steps.length - 1)];
  const [arrow, setArrow] = useState<{
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null>(null);

  useEffect(() => {
    const updateArrow = () => {
      const source = document.querySelector<HTMLElement>('.tutorial-focus--source');
      const target = document.querySelector<HTMLElement>('.tutorial-focus--target');
      if (!source || !target || step >= steps.length) {
        setArrow(null);
        return;
      }

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setArrow({
        sourceX: sourceRect.right + 8,
        sourceY: sourceRect.top + sourceRect.height / 2,
        targetX: targetRect.left + Math.min(110, targetRect.width * 0.24),
        targetY: targetRect.top + targetRect.height / 2,
      });
    };

    updateArrow();
    const initialUpdate = window.setTimeout(updateArrow, 60);
    const trackingInterval = window.setInterval(updateArrow, 300);
    window.addEventListener('resize', updateArrow);
    window.addEventListener('scroll', updateArrow, true);

    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(trackingInterval);
      window.removeEventListener('resize', updateArrow);
      window.removeEventListener('scroll', updateArrow, true);
    };
  }, [mode, step, steps.length]);

  const arrowPath = arrow
    ? `M ${arrow.sourceX} ${arrow.sourceY} C ${arrow.sourceX + Math.max(70, (arrow.targetX - arrow.sourceX) * 0.42)} ${arrow.sourceY}, ${arrow.targetX - Math.max(70, (arrow.targetX - arrow.sourceX) * 0.32)} ${arrow.targetY}, ${arrow.targetX} ${arrow.targetY}`
    : '';

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-backdrop" aria-hidden="true" />
      {arrow && (
        <>
          <svg className="tutorial-arrow" aria-hidden="true">
            <defs>
              <marker id="tutorial-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <path className="tutorial-arrow__path" d={arrowPath} markerEnd="url(#tutorial-arrow-head)" />
          </svg>
          <span
            className="tutorial-target-pulse"
            style={{ left: arrow.targetX, top: arrow.targetY }}
            aria-hidden="true"
          />
          <span
            className="tutorial-drag-label"
            style={{
              left: (arrow.sourceX + arrow.targetX) / 2,
              top: Math.min(arrow.sourceY, arrow.targetY) - 18,
            }}
          >
            <MousePointer2 size={13} /> {current.arrowLabel}
          </span>
        </>
      )}

      <section
        key={`${mode}-${step}`}
        className={`tutorial-card tutorial-card--step-${step}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
      >
        <header className="tutorial-card__head">
          <span className="tutorial-card__visual" aria-hidden="true">
            {mode === 'basic' ? <Blocks size={21} /> : <Layers3 size={21} />}
          </span>
          <div>
            <span className="eyebrow">{mode === 'basic' ? 'BASIC 퍼즐 실습' : 'PRO 그래프 실습'} · {step}/{steps.length}</span>
            <h3 id="tutorial-title">{current.title}</h3>
          </div>
        </header>
        <p id="tutorial-description">{current.description}</p>
        <div className="tutorial-practice-note">
          <ShieldCheck size={15} />
          <span>
            {originalWasBlank === true
              ? '연습 전 전략이 비어 있어 종료할 때 연습 내용 유지 여부를 선택할 수 있습니다.'
              : originalWasBlank === false
                ? '연습 중 변경은 저장되지 않으며 종료하면 기존 전략을 자동으로 복원합니다.'
                : '기존 전략을 안전하게 보관한 뒤 연습 공간을 준비하고 있습니다.'}
          </span>
        </div>
        <div className="tutorial-action-hint">
          <MousePointer2 size={15} />
          <span>{current.actionHint}</span>
        </div>
        <div className="tutorial-progress" aria-label={`${steps.length}단계 중 ${step}단계`}>
          {steps.map((_, index) => <i key={index} className={index < step ? 'is-active' : ''} />)}
        </div>
        <footer className="tutorial-card__actions">
          <button className="text-button" onClick={() => onStep(0)}>전체 건너뛰기</button>
          <button
            className={step >= steps.length ? 'button button--primary' : 'button button--ghost'}
            onClick={() => onStep(step >= steps.length ? 0 : step + 1)}
          >
            {step >= steps.length ? '완료' : '이 단계 건너뛰기'} <ChevronRight size={14} />
          </button>
        </footer>
      </section>
    </div>
  );
}
