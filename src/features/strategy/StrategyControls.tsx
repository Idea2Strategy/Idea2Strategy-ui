import type { ChangeEvent } from 'react';
import { portShapeLabel } from '../../data';
import type { ParameterSchema, PortDefinition, PortType } from '../../types';

export function portTypeClass(type: PortType) {
  return `port-shape--${type.toLowerCase()}`;
}

export function portTooltip(
  port: Pick<PortDefinition, 'type' | 'timeframe' | 'observation'>,
  label?: string,
) {
  const details = [
    label,
    port.type,
    portShapeLabel[port.type],
    port.timeframe,
    port.observation ? '관찰 전용' : '타입·시간축 조건 확인',
  ].filter(Boolean);
  return details.join(' · ');
}

export function PortSwatch({
  port,
  label,
  className = '',
}: {
  port: Pick<PortDefinition, 'type' | 'timeframe' | 'observation'>;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`port-swatch ${portTypeClass(port.type)} ${port.observation ? 'is-observation' : ''} ${className}`}
      aria-label={label ? portTooltip(port, label) : undefined}
      aria-hidden={label ? undefined : true}
      title={portTooltip(port, label)}
    />
  );
}

const portFamilies: Array<{
  label: string;
  types: PortType[];
}> = [
  { label: '대상', types: ['Asset', 'Universe', 'AssetPair'] },
  { label: '데이터', types: ['PriceSeries', 'VolumeSeries'] },
  { label: '수치', types: ['Scalar', 'Metric', 'ScoreVector', 'WeightVector'] },
  { label: '신호', types: ['BooleanSignal', 'EventTrigger'] },
  { label: '주문·상태', types: ['OrderIntent', 'ApprovedOrder', 'PositionState'] },
];

export function PortLegend() {
  return (
    <details className="port-legend">
      <summary>
        <span>
          <strong>연결부 모양 안내</strong>
          <small>같은 계열은 같은 외곽 형태를 사용합니다</small>
        </span>
        <span className="port-legend__preview" aria-hidden="true">
          {portFamilies.map((family) => <PortSwatch key={family.label} port={{ type: family.types[0] }} />)}
        </span>
      </summary>
      <div className="port-legend__groups">
        {portFamilies.map((family) => (
          <section key={family.label}>
            <strong>{family.label}</strong>
            <span>
              {family.types.map((type) => (
                <span key={type} className="port-legend__item">
                  <PortSwatch port={{ type }} label={`${type} ${portShapeLabel[type]}`} />
                  <small>{type}</small>
                </span>
              ))}
            </span>
          </section>
        ))}
      </div>
      <p>입력은 노드 왼쪽, 출력은 오른쪽입니다. 정확한 타입은 도형에 마우스를 올려 확인하세요.</p>
    </details>
  );
}

export function ParameterField({
  schema,
  value,
  onChange,
  compact = false,
}: {
  schema: ParameterSchema;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  compact?: boolean;
}) {
  const handleValue = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (schema.type === 'number') {
      onChange(event.target.value === '' ? '' : Number(event.target.value));
      return;
    }
    onChange(event.target.value);
  };

  if (schema.type === 'toggle') {
    return (
      <label className={`parameter-field parameter-field--toggle ${compact ? 'is-compact' : ''}`}>
        <span>{schema.label}</span>
        <button
          type="button"
          className="nodrag nowheel"
          aria-pressed={Boolean(value)}
          onClick={() => onChange(!value)}
        >
          <i />
          {Boolean(value) ? '사용' : '사용 안 함'}
        </button>
      </label>
    );
  }

  return (
    <label className={`parameter-field ${compact ? 'is-compact' : ''}`}>
      <span>
        {schema.label}
        {schema.required && <em aria-label="필수 입력">*</em>}
      </span>
      <span className="parameter-field__control">
        {schema.type === 'select' ? (
          <select
            className="nodrag nowheel"
            value={String(value ?? '')}
            onChange={handleValue}
            aria-label={schema.label}
          >
            <option value="">직접 선택</option>
            {schema.options?.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            className="nodrag nowheel"
            type={schema.type}
            value={String(value ?? '')}
            placeholder={schema.placeholder}
            min={schema.min}
            max={schema.max}
            step={schema.step}
            onChange={handleValue}
            onWheel={(event) => event.currentTarget.blur()}
            aria-label={schema.label}
          />
        )}
        {schema.suffix && <small>{schema.suffix}</small>}
      </span>
    </label>
  );
}
