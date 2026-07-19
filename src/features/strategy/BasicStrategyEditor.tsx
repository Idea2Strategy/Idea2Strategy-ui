import {
  AlertTriangle,
  Blocks,
  Check,
  CircleAlert,
  CircleHelp,
  Layers3,
  LockKeyhole,
  MousePointer2,
  PackageOpen,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { Modal } from '../../components/Overlays';
import { basicLibrary, portShapeLabel } from '../../data';
import {
  loadBasicEditorSnapshot,
  saveBasicEditorSnapshot,
  type BasicEditorSnapshot,
  type BasicEditorValues,
} from '../../strategyStorage';
import type {
  BasicBlockKind,
  ParameterSchema,
  PortDefinition,
  StrategyEditorStatus,
  StrategySaveState,
  StrategyTutorialAction,
  TutorialExitRequest,
  ValidationIssue,
} from '../../types';
import { ParameterField, PortLegend, PortSwatch, portTooltip } from './StrategyControls';

function createBasicValues(): BasicEditorValues {
  return Object.fromEntries(
    basicLibrary.map((block) => [
      block.id,
      Object.fromEntries(block.parameters.map((parameter) => [parameter.key, ''])),
    ]),
  ) as BasicEditorValues;
}

function cloneBasicValues(values: BasicEditorValues): BasicEditorValues {
  return Object.fromEntries(
    basicLibrary.map((block) => [block.id, { ...values[block.id] }]),
  ) as BasicEditorValues;
}

function isMissing(value: string | number | boolean | undefined) {
  return value === '' || value === undefined || value === null;
}

function buildBasicIssues(blockIds: BasicBlockKind[], values: BasicEditorValues): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (blockIds.length < basicLibrary.length) {
    const next = basicLibrary[blockIds.length];
    issues.push({
      id: 'basic-structure',
      severity: 'error',
      title: '전략 흐름이 아직 끝까지 연결되지 않았습니다.',
      message: next
        ? `현재 ${blockIds.length}단계까지 연결됐고 다음에는 ‘${next.title}’ 블록이 필요합니다.`
        : '필수 블록이 남아 있습니다.',
      solution: '같은 모양의 돌출부와 홈을 확인한 뒤 다음 블록을 끼워 넣으세요.',
    });
  }

  blockIds.forEach((id) => {
    const block = basicLibrary.find((item) => item.id === id);
    if (!block) return;
    block.parameters.forEach((parameter) => {
      if (parameter.required && isMissing(values[id][parameter.key])) {
        issues.push({
          id: `basic-${id}-${parameter.key}`,
          severity: 'error',
          title: `${block.title}: ${parameter.label} 입력이 필요합니다.`,
          message: '필수값이 비어 있어 완료 단계의 구조 검사를 통과할 수 없습니다.',
          solution: '추천값 없이 사용자가 원하는 값을 직접 입력하거나 선택하세요.',
        });
      }
    });
  });

  const allocation = Number(values.portfolio.allocation);
  const maxWeight = Number(values.risk.maxWeight);
  if (
    blockIds.includes('portfolio')
    && blockIds.includes('risk')
    && !isMissing(values.portfolio.allocation)
    && !isMissing(values.risk.maxWeight)
    && maxWeight < allocation
  ) {
    issues.push({
      id: 'basic-risk-cap',
      severity: 'info',
      title: '위험 제한이 목표 비중보다 먼저 적용됩니다.',
      message: `입력한 목표 비중 ${allocation}%는 종목당 최대 ${maxWeight}%로 축소될 수 있습니다.`,
      solution: '의도한 제한이라면 유지하고, 아니라면 두 입력값의 관계를 다시 확인하세요.',
    });
  }

  return issues;
}

function renderConnector(port: PortDefinition, direction: 'input' | 'output') {
  return (
    <span
      className={`puzzle-port puzzle-port--${direction}`}
      aria-label={portTooltip(port, `${direction === 'input' ? '입력' : '출력'} 연결부`)}
      title={portTooltip(port, `${direction === 'input' ? '입력' : '출력'} 연결부`)}
    >
      <PortSwatch port={port} className="puzzle-port__glyph" />
    </span>
  );
}

export function BasicStrategyEditor({
  resetRequest = 0,
  validationRequest = 0,
  tutorialStep = 0,
  tutorialSessionId = 0,
  tutorialPracticeActive = false,
  tutorialStartsFromBlank = false,
  tutorialExitRequest,
  onTutorialAction,
  onTutorialSessionReady,
  onStatusChange,
  strategyId,
  saveRequest = 0,
  onSaveStateChange,
  onSaved,
  onRequestReset,
}: {
  resetRequest?: number;
  validationRequest?: number;
  tutorialStep?: number;
  tutorialSessionId?: number;
  tutorialPracticeActive?: boolean;
  tutorialStartsFromBlank?: boolean;
  tutorialExitRequest?: TutorialExitRequest | null;
  onTutorialAction?: (action: StrategyTutorialAction) => void;
  onTutorialSessionReady?: (sessionId: number, wasBlank: boolean) => void;
  onStatusChange?: (status: StrategyEditorStatus) => void;
  strategyId: string;
  saveRequest?: number;
  onSaveStateChange?: (state: StrategySaveState) => void;
  onSaved?: () => void;
  onRequestReset?: () => void;
}) {
  const [initialSnapshot] = useState(() => loadBasicEditorSnapshot(strategyId));
  const [blockIds, setBlockIds] = useState<BasicBlockKind[]>(() => {
    const allowed = new Set(basicLibrary.map((block) => block.id));
    return initialSnapshot?.blockIds.filter((id) => allowed.has(id)) ?? [];
  });
  const [values, setValues] = useState<BasicEditorValues>(() => {
    const defaults = createBasicValues();
    if (!initialSnapshot) return defaults;
    return Object.fromEntries(
      basicLibrary.map((block) => [
        block.id,
        { ...defaults[block.id], ...(initialSnapshot.values[block.id] ?? {}) },
      ]),
    ) as BasicEditorValues;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<BasicBlockKind | null>(null);
  const [showResult, setShowResult] = useState(false);
  const lastResetRequest = useRef(resetRequest);
  const lastValidationRequest = useRef(validationRequest);
  const lastTutorialSession = useRef(0);
  const lastTutorialExitSession = useRef(0);
  const tutorialBackup = useRef<BasicEditorSnapshot | null>(null);
  const suppressNextSave = useRef(false);

  const nextBlock = basicLibrary[blockIds.length];
  const issues = useMemo(() => buildBasicIssues(blockIds, values), [blockIds, values]);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;
  const completed = blockIds.length === basicLibrary.length && errorCount === 0;
  const filledRequired = blockIds.reduce((count, id) => {
    const block = basicLibrary.find((item) => item.id === id);
    return count + (block?.parameters.filter(
      (parameter) => parameter.required && !isMissing(values[id][parameter.key]),
    ).length ?? 0);
  }, 0);
  const totalRequired = basicLibrary.reduce(
    (count, block) => count + block.parameters.filter((parameter) => parameter.required).length,
    0,
  );
  const progress = Math.round(
    ((blockIds.length + filledRequired) / (basicLibrary.length + totalRequired)) * 100,
  );

  const explainWrongOrder = (id: BasicBlockKind) => {
    const attempted = basicLibrary.find((block) => block.id === id);
    if (!nextBlock || !attempted) return;
    const expectedType = nextBlock.input?.type;
    setMessage(
      `문제: ‘${attempted.title}’ 블록은 지금 홈에 맞지 않습니다. 영향: 실행 순서가 끊어집니다. 해결: ${expectedType ? `${portShapeLabel[expectedType]} ${expectedType} 홈에 맞는 ` : ''}‘${nextBlock.title}’ 블록을 먼저 연결하세요.`,
    );
  };

  const addBlock = (id: BasicBlockKind) => {
    if (blockIds.includes(id)) return;
    if (nextBlock?.id !== id) {
      explainWrongOrder(id);
      return;
    }
    setBlockIds((current) => current.includes(id) ? current : [...current, id]);
    setMessage(`‘${nextBlock.title}’ 블록이 ${nextBlock.order + 1}번째 위치에 정확히 결합됐습니다.`);
  };

  const handleDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    id: BasicBlockKind,
  ) => {
    event.dataTransfer.setData('application/x-i2s-basic', id);
    event.dataTransfer.effectAllowed = 'copy';
    setDraggingId(id);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('application/x-i2s-basic') as BasicBlockKind;
    const accepted = Boolean(id && nextBlock?.id === id && !blockIds.includes(id));
    if (id) addBlock(id);
    if (accepted && tutorialStep === 1 && id === 'asset') {
      onTutorialAction?.('basic-asset-placed');
    }
    if (accepted && tutorialStep === 3 && id === 'price') {
      onTutorialAction?.('basic-price-placed');
    }
    setDraggingId(null);
  };

  const updateValue = (
    blockId: BasicBlockKind,
    schema: ParameterSchema,
    value: string | number | boolean,
  ) => {
    setValues((current) => ({
      ...current,
      [blockId]: { ...current[blockId], [schema.key]: value },
    }));
    if (tutorialStep === 2 && blockId === 'asset' && schema.key === 'symbols' && String(value).trim()) {
      onTutorialAction?.('basic-asset-configured');
    }
    if (tutorialStep === 4 && blockId === 'price' && schema.key === 'timeframe' && String(value).trim()) {
      onTutorialAction?.('basic-price-configured');
    }
  };

  const removeFrom = (index: number) => {
    const removedCount = blockIds.length - index;
    setBlockIds((current) => current.slice(0, index));
    setMessage(
      removedCount > 1
        ? `중간 블록을 분리해 뒤쪽 ${removedCount}개 블록도 함께 보관함으로 돌아갔습니다. 실행 순서가 깨지는 상태는 만들지 않습니다.`
        : '마지막 블록을 분리했습니다.',
    );
  };

  const reset = () => {
    setBlockIds([]);
    setValues(createBasicValues());
    setMessage('빈 편집기로 초기화했습니다. 왼쪽에서 첫 블록부터 시작하세요.');
    setShowResult(false);
  };

  useEffect(() => {
    if (
      !tutorialPracticeActive
      || tutorialSessionId <= 0
      || lastTutorialSession.current === tutorialSessionId
    ) return;
    lastTutorialSession.current = tutorialSessionId;
    const backup: BasicEditorSnapshot = tutorialStartsFromBlank
      ? { blockIds: [], values: createBasicValues() }
      : { blockIds: [...blockIds], values: cloneBasicValues(values) };
    tutorialBackup.current = backup;
    onTutorialSessionReady?.(tutorialSessionId, backup.blockIds.length === 0);
    setBlockIds([]);
    setValues(createBasicValues());
    setDraggingId(null);
    setShowResult(false);
    setMessage('튜토리얼 연습 공간입니다. 종료할 때 기존 전략을 복원합니다.');
  }, [
    blockIds,
    onTutorialSessionReady,
    tutorialPracticeActive,
    tutorialSessionId,
    tutorialStartsFromBlank,
    values,
  ]);

  useEffect(() => {
    if (
      !tutorialExitRequest
      || tutorialExitRequest.sessionId !== tutorialSessionId
      || lastTutorialExitSession.current === tutorialExitRequest.sessionId
    ) return;
    lastTutorialExitSession.current = tutorialExitRequest.sessionId;
    if (tutorialExitRequest.action === 'restore' && tutorialBackup.current) {
      suppressNextSave.current = true;
      setBlockIds([...tutorialBackup.current.blockIds]);
      setValues(cloneBasicValues(tutorialBackup.current.values));
      setMessage(
        tutorialBackup.current.blockIds.length
          ? '튜토리얼 전의 Basic 전략을 복원했습니다.'
          : '튜토리얼 전의 빈 Basic 편집기로 돌아왔습니다.',
      );
    } else {
      setMessage('튜토리얼 연습 내용을 현재 Basic 전략에 유지했습니다.');
    }
    tutorialBackup.current = null;
  }, [tutorialExitRequest, tutorialSessionId]);

  useEffect(() => {
    if (lastResetRequest.current === resetRequest) return;
    lastResetRequest.current = resetRequest;
    reset();
  }, [resetRequest]);

  useEffect(() => {
    if (lastValidationRequest.current === validationRequest) return;
    lastValidationRequest.current = validationRequest;
    const first = issues.find((issue) => issue.severity === 'error') ?? issues[0];
    setMessage(
      first
        ? `검사 결과: ${first.title} 해결: ${first.solution}`
        : '전략 검사 완료: 현재 구조 오류가 없습니다. 수익 가능성을 검증한 결과는 아닙니다.',
    );
  }, [issues, validationRequest]);

  useEffect(() => {
    onStatusChange?.({
      errorCount,
      warningCount,
      infoCount,
      itemCount: blockIds.length,
      isReady: completed,
    });
  }, [blockIds.length, completed, errorCount, infoCount, onStatusChange, warningCount]);

  useEffect(() => {
    if (tutorialPracticeActive) {
      onSaveStateChange?.('saved');
      return;
    }
    if (suppressNextSave.current) {
      suppressNextSave.current = false;
      return;
    }
    onSaveStateChange?.('saving');
    const saveTimer = window.setTimeout(() => {
      try {
        saveBasicEditorSnapshot(strategyId, { blockIds, values });
        onSaveStateChange?.('saved');
        onSaved?.();
      } catch {
        onSaveStateChange?.('error');
      }
    }, 260);
    return () => window.clearTimeout(saveTimer);
  }, [
    blockIds,
    onSaveStateChange,
    onSaved,
    saveRequest,
    strategyId,
    tutorialPracticeActive,
    values,
  ]);

  return (
    <div className="builder-workspace basic-workspace">
      <aside className="block-library">
        <PanelHeading icon={<Blocks size={16} />} eyebrow="PUZZLE BLOCKS" title="순서 블록" count={basicLibrary.length} />
        <div className="guided-message">
          <MousePointer2 size={17} />
          <div>
            <strong>모양이 맞는 블록만 결합됩니다</strong>
            <span>색은 역할, 돌출부 모양은 전달 데이터, 세로 위치는 실행 순서입니다.</span>
          </div>
        </div>
        <PortLegend />
        <div className="block-library__scroll">
          {basicLibrary.map((block) => {
            const added = blockIds.includes(block.id);
            const isNext = nextBlock?.id === block.id;
            const isTutorialSource = (
              (tutorialStep === 1 && block.id === 'asset')
              || (tutorialStep === 3 && block.id === 'price')
            );
            return (
              <button
                key={block.id}
                className={`library-block basic-library-block ${added ? 'is-added' : ''} ${isNext ? 'is-next' : ''} ${!added && !isNext ? 'is-order-locked' : ''} ${isTutorialSource ? 'tutorial-focus tutorial-focus--source' : ''}`}
                draggable={!added}
                onDragStart={(event) => handleDragStart(event, block.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => {
                  if (isTutorialSource) return;
                  addBlock(block.id);
                }}
                style={{ '--block-color': block.color } as React.CSSProperties}
                aria-disabled={!added && !isNext}
              >
                <i />
                <span>
                  <small>{block.stage}</small>
                  <strong>{block.title}</strong>
                  <em>{block.description}</em>
                  <span className="library-port-signature">
                    {block.input && <PortSwatch port={block.input} />}
                    <b>{block.input ? block.input.type : '시작'}</b>
                    <span>→</span>
                    <b>{block.output ? block.output.type : '종료'}</b>
                    {block.output && <PortSwatch port={block.output} />}
                  </span>
                </span>
                {added ? <Check size={15} /> : isNext ? <Plus size={15} /> : <LockKeyhole size={14} />}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="puzzle-canvas">
        <div className="canvas-context">
          <span><Layers3 size={14} /> 강제 실행 흐름</span>
          <span>잘못된 순서·타입은 놓는 순간 되돌아옵니다</span>
        </div>
        <div
          className={`puzzle-canvas__viewport ${draggingId ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = draggingId === nextBlock?.id ? 'copy' : 'none';
          }}
          onDrop={handleDrop}
        >
          <div className="puzzle-guide">
            <span className="puzzle-guide__start"><Play size={13} /> 전략 시작</span>
            {blockIds.length === 0 ? (
              <div className={`puzzle-empty ${draggingId === nextBlock?.id ? 'is-compatible' : ''} ${draggingId && draggingId !== nextBlock?.id ? 'is-incompatible' : ''} ${tutorialStep === 1 ? 'tutorial-focus tutorial-focus--target' : ''}`}>
                <PackageOpen size={31} />
                <h3>첫 블록을 이 홈에 끼워 보세요</h3>
                <p>왼쪽의 <strong>{nextBlock?.title}</strong>부터 시작합니다.</p>
                {nextBlock?.output && (
                  <span className="puzzle-empty__expected">
                    다음 출력 <PortSwatch port={nextBlock.output} /> {nextBlock.output.type}
                  </span>
                )}
              </div>
            ) : (
              <div className="puzzle-chain">
                {blockIds.map((id, index) => {
                  const block = basicLibrary.find((item) => item.id === id)!;
                  const previous = index > 0
                    ? basicLibrary.find((item) => item.id === blockIds[index - 1])
                    : undefined;
                  return (
                    <div className="puzzle-chain__step" key={id}>
                      {previous?.output && block.input && (
                        <div className={`puzzle-join ${previous.output.type === block.input.type ? 'is-valid' : 'is-invalid'} ${block.input.observation ? 'is-observation' : ''}`}>
                          <PortSwatch port={previous.output} />
                          <span>
                            <Check size={11} />
                            {previous.output.type}
                            {previous.output.timeframe && ` · ${previous.output.timeframe}`}
                          </span>
                          <PortSwatch port={block.input} />
                        </div>
                      )}
                      <article
                        className={`puzzle-block ${block.input?.observation ? 'is-observation' : ''} ${
                          (tutorialStep === 2 && id === 'asset')
                          || (tutorialStep === 4 && id === 'price')
                            ? 'tutorial-focus tutorial-focus--panel'
                            : ''
                        }`}
                        style={{ '--block-color': block.color } as React.CSSProperties}
                      >
                        {block.input && renderConnector(block.input, 'input')}
                        <div className="puzzle-block__handle">
                          <span>{index + 1}</span>
                          <LockKeyhole size={12} />
                        </div>
                        <div className="puzzle-block__body">
                          <small>{block.stage}</small>
                          <strong>{block.title}</strong>
                          <p>{block.description}</p>
                          <div className="puzzle-block__fields">
                            {block.parameters.map((schema) => (
                              <ParameterField
                                key={schema.key}
                                schema={schema}
                                value={values[id][schema.key]}
                                onChange={(value) => updateValue(id, schema, value)}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          className="puzzle-block__delete"
                          onClick={() => removeFrom(index)}
                          aria-label={`${block.title}부터 뒤쪽 블록 분리`}
                          title="이 블록부터 뒤쪽 흐름 분리"
                        >
                          <X size={14} />
                        </button>
                        {block.output && renderConnector(block.output, 'output')}
                      </article>
                    </div>
                  );
                })}

                {nextBlock ? (
                  <button
                    className={`puzzle-next-slot ${draggingId === nextBlock.id ? 'is-compatible' : ''} ${draggingId && draggingId !== nextBlock.id ? 'is-incompatible' : ''} ${tutorialStep === 3 && nextBlock.id === 'price' ? 'tutorial-focus tutorial-focus--target' : ''}`}
                    onClick={() => {
                      if (tutorialStep === 3 && nextBlock.id === 'price') return;
                      addBlock(nextBlock.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {nextBlock.input && <PortSwatch port={nextBlock.input} />}
                    <span>
                      <small>다음에 맞는 블록</small>
                      <strong>{nextBlock.title}</strong>
                      <em>{nextBlock.input ? `${portShapeLabel[nextBlock.input.type]} · ${nextBlock.input.type}` : '시작 블록'}</em>
                    </span>
                    <Plus size={15} />
                  </button>
                ) : (
                  <span className="puzzle-guide__end">판단 기록까지 연결됨 <Check size={13} /></span>
                )}
              </div>
            )}
          </div>
        </div>
        {message && (
          <button className="connection-toast basic-connection-toast" onClick={() => setMessage(null)}>
            {message}<X size={13} />
          </button>
        )}
      </section>

      <aside className="inspector-panel basic-inspector">
        <PanelHeading icon={<ShieldCheck size={16} />} eyebrow="STRATEGY CHECK" title="전략 확인" />
        <div className={`validation-summary ${completed ? 'is-valid' : errorCount ? 'has-error' : ''}`}>
          <span>{completed ? <Check size={15} /> : errorCount}</span>
          <div>
            <strong>{completed ? '구조와 필수 입력이 완성됐습니다' : `완료 전에 해결할 항목 ${errorCount}개`}</strong>
            <small>{completed ? '구조 미리보기 단계로 이동할 수 있습니다.' : '입력 중에는 막지 않고 완료 단계에서 검사합니다.'}</small>
          </div>
        </div>
        <div className="progress-meter"><i style={{ width: `${progress}%` }} /></div>
        <div className="basic-next-guide">
          {nextBlock ? (
            <>
              <span>{nextBlock.order + 1}</span>
              <div>
                <small>현재 필요한 블록</small>
                <strong>{nextBlock.title}</strong>
                {nextBlock.input && (
                  <em><PortSwatch port={nextBlock.input} /> {nextBlock.input.type} 홈</em>
                )}
              </div>
            </>
          ) : (
            <>
              <span><Check size={14} /></span>
              <div><small>퍼즐 순서</small><strong>모든 단계 연결 완료</strong></div>
            </>
          )}
        </div>
        <div className="strategy-issue-list">
          {issues.slice(0, 5).map((issue) => (
            <article key={issue.id} className={`strategy-issue is-${issue.severity}`}>
              {issue.severity === 'error' ? <CircleAlert size={14} /> : issue.severity === 'warning' ? <AlertTriangle size={14} /> : <CircleHelp size={14} />}
              <div>
                <strong>{issue.title}</strong>
                <p>{issue.message}</p>
                <small>해결: {issue.solution}</small>
              </div>
            </article>
          ))}
          {issues.length > 5 && <p className="issue-more">외 {issues.length - 5}개 항목은 입력하면서 순서대로 표시됩니다.</p>}
          {!issues.length && (
            <div className="issue-empty"><Check size={16} /><span>현재 발견된 구조 오류가 없습니다.</span></div>
          )}
        </div>
        <div className="inspector-note">
          <LockKeyhole size={15} />
          <p>종목·기간·비중·기준값은 추천하지 않습니다. 모든 값은 사용자가 직접 결정하며 이 화면의 검사는 수익 가능성을 보장하지 않습니다.</p>
        </div>
        <button className="button button--primary button--full" disabled={!completed} onClick={() => setShowResult(true)}>
          <Play size={14} /> 구조 결과 확인
        </button>
        <button className="button button--ghost button--full" onClick={onRequestReset ?? reset}>
          <RotateCcw size={14} /> 빈 편집기로 초기화
        </button>

        {showResult && (
          <Modal title="Basic 전략 구조 결과" onClose={() => setShowResult(false)} wide>
            <div className="basic-result-head">
              <div><span>사용자 선택 종목</span><strong>{String(values.asset.symbols || '미입력')}</strong></div>
              <div><span>연결된 블록</span><strong>{blockIds.length}개</strong></div>
              <div><span>구조 상태</span><strong>필수 입력·타입 확인</strong></div>
            </div>
            <div className="basic-structure-result">
              <div className="basic-structure-result__flow">
                {blockIds.map((id, index) => {
                  const block = basicLibrary.find((item) => item.id === id)!;
                  return (
                    <div key={id}>
                      <span style={{ '--block-color': block.color } as React.CSSProperties}>{index + 1}</span>
                      <strong>{block.title}</strong>
                      {index < blockIds.length - 1 && <i />}
                    </div>
                  );
                })}
              </div>
              <div className="result-copy">
                <strong>구조 검사를 통과했습니다</strong>
                <p>아직 투자 성과 결과가 아닙니다. 사용자가 선택한 실제 데이터 범위와 비용 가정을 확인한 뒤 백테스트를 실행해야 결과를 볼 수 있습니다.</p>
              </div>
            </div>
          </Modal>
        )}
      </aside>
    </div>
  );
}

function PanelHeading({
  icon,
  eyebrow,
  title,
  count,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="panel-heading">
      <span>{icon}</span>
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      {typeof count === 'number' && <em>{count}</em>}
    </div>
  );
}
