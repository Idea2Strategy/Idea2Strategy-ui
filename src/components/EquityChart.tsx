import { useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { useLanguage } from '../lib/i18n';
import { BotGlyph, FALLBACK_BOT_ICON } from './BotGlyph';
import type { BotIconSelection } from './BotGlyph';

export interface LaunchMark {
  name: string;
  index: number;
  kind?: 'start' | 'before-range';
  appearance?: BotIconSelection;
}

export interface EquityChartProps {
  values: number[];
  /* The return (%) on each day. Dollar-based charts show it as a secondary
     tooltip value; return-based charts can hide the duplicate. */
  rates: number[];
  dates: string[];
  launches?: LaunchMark[];
  format: (value: number) => string;
  ariaLabel: string;
  showRateInTooltip?: boolean;
}

export const getLaunchMarkerClusters = (positions: number[], collisionDistance = 34): number[][] => {
  const sorted = positions
    .map((position, index) => ({ index, position }))
    .sort((left, right) => left.position - right.position);

  return sorted.reduce<number[][]>((clusters, marker) => {
    const current = clusters.at(-1);
    const previousIndex = current?.at(-1);
    if (current && previousIndex !== undefined
      && marker.position - positions[previousIndex] < collisionDistance) {
      current.push(marker.index);
    } else {
      clusters.push([marker.index]);
    }
    return clusters;
  }, []);
};

/*
  The shared performance chart (Home aggregate and per-bot overview), kept to the
  grammar of consumer brokerage charts:

  - The line runs the full width. Stretches above zero wear the gain colour,
    stretches below zero wear the loss colour (the same series clipped at the
    baseline), with a soft fill — the person's chosen up/down convention rides
    on the --gain/--loss tokens.
  - The period high and low are annotated AT their own peak and trough, above
    and below the curve — by definition that space is empty.
  - The current value is the endpoint dot; the big figure above the chart is
    its label. No right-edge tag, no extra guide line.
  - The only reference line is the subtle zero baseline — unit context lives
    in the summary figure and the tooltip, not in grid lines.
  - Hover (or arrow keys) shows a crosshair, a dot, and one tooltip.

  The SVG stretches, strokes stay 1:1 via vector-effect, and every label is an
  HTML overlay so text never distorts.
*/
export function EquityChart({
  values,
  rates,
  dates,
  launches = [],
  format,
  ariaLabel,
  showRateInTooltip = true,
}: EquityChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Strings created inside a nested component render after the Localized walk,
  // so they translate through the hook instead.
  const { t } = useLanguage();
  const clipId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const width = 910;
  const height = 220;
  /* Vertical padding leaves room for the peak/trough annotations. */
  const padTop = 26;
  const padBottom = 26;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const yFor = (value: number) => padTop + (1 - (value - min) / range) * (height - padTop - padBottom);
  const xFor = (index: number) => (index / (values.length - 1)) * width;
  const line = values.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`).join(' ');
  const active = hoverIndex === null ? null : Math.min(hoverIndex, values.length - 1);
  const last = values[values.length - 1];
  const zeroY = yFor(0);
  const area = `${line} ${width},${zeroY.toFixed(1)} 0,${zeroY.toFixed(1)}`;
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const maxIndex = values.indexOf(maxValue);
  const minIndex = values.indexOf(minValue);
  /* Keep annotations inside the frame near the edges. */
  const clampPct = (pct: number) => Math.min(91, Math.max(9, pct));

  const indexFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / (bounds.width || 1)));
    setHoverIndex(Math.round(ratio * (values.length - 1)));
  };
  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setHoverIndex((current) => Math.min(Math.max((current ?? values.length - 1) + step, 0), values.length - 1));
  };
  const xTicks = [0, Math.round((values.length - 1) / 3), Math.round(((values.length - 1) * 2) / 3), values.length - 1];
  const launchPositions = launches.map((launch) => xFor(launch.index));
  const launchClusters = getLaunchMarkerClusters(launchPositions);

  return <div className="dashboard-chart-box"><div
    ref={frameRef}
    className="dashboard-chart-frame"
    tabIndex={0}
    onMouseMove={indexFromPointer}
    onMouseLeave={() => setHoverIndex(null)}
    onFocus={(_event: FocusEvent<HTMLDivElement>) => setHoverIndex((current) => current ?? values.length - 1)}
    onBlur={() => setHoverIndex(null)}
    onKeyDown={moveWithKeyboard}
  >
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t(ariaLabel)}>
      <defs>
        <clipPath id={`${clipId}-above`}><rect x="0" y="0" width={width} height={zeroY} /></clipPath>
        <clipPath id={`${clipId}-below`}><rect x="0" y={zeroY} width={width} height={height - zeroY} /></clipPath>
        <linearGradient id={`${clipId}-gain-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--gain)" stopOpacity=".16" /><stop offset="100%" stopColor="var(--gain)" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${clipId}-loss-fill`} x1="0" x2="0" y1="1" y2="0"><stop offset="0%" stopColor="var(--loss)" stopOpacity=".16" /><stop offset="100%" stopColor="var(--loss)" stopOpacity="0" /></linearGradient>
      </defs>

      <line className="dashboard-chart-zero" x1="0" x2={width} y1={zeroY} y2={zeroY} vectorEffect="non-scaling-stroke" />

      <g clipPath={`url(#${clipId}-above)`}>
        <polygon points={area} fill={`url(#${clipId}-gain-fill)`} />
        <polyline className="dashboard-chart-line is-gain" points={line} vectorEffect="non-scaling-stroke" />
      </g>
      <g clipPath={`url(#${clipId}-below)`}>
        <polygon points={area} fill={`url(#${clipId}-loss-fill)`} />
        <polyline className="dashboard-chart-line is-loss" points={line} vectorEffect="non-scaling-stroke" />
      </g>

      {launches.map((launch) => <line
        key={launch.name}
        className="dashboard-chart-launch"
        x1={xFor(launch.index)}
        x2={xFor(launch.index)}
        y1={padTop}
        y2={height - padBottom}
        vectorEffect="non-scaling-stroke"
      />)}

      {/* The current value is the endpoint. */}
      <circle className={`dashboard-chart-end ${last >= 0 ? 'is-gain' : 'is-loss'}`} cx={width} cy={yFor(last)} r={4.5} vectorEffect="non-scaling-stroke" />

      {active !== null && <>
        <line className="dashboard-chart-crosshair" x1={xFor(active)} x2={xFor(active)} y1={padTop - 12} y2={height - padBottom + 12} vectorEffect="non-scaling-stroke" />
        <circle className={`dashboard-chart-dot ${values[active] >= 0 ? 'is-gain' : 'is-loss'}`} cx={xFor(active)} cy={yFor(values[active])} r={4} vectorEffect="non-scaling-stroke" />
      </>}
    </svg>

    {/* High and low annotated at their own peak and trough — the one place on
        a line chart that is empty by definition. Hidden when the extreme is
        zero (the series starts at zero; the baseline already says it). */}
    {maxValue !== 0 && <span
      className={`dashboard-chart-peak is-above ${maxValue >= 0 ? 'is-up' : 'is-down'}`}
      style={{ left: `${clampPct((xFor(maxIndex) / width) * 100)}%`, top: `${(yFor(maxValue) / height) * 100}%` }}
    ><i className="sr-only">{t('최고')} </i>{format(maxValue)}</span>}
    {minValue !== 0 && <span
      className={`dashboard-chart-peak is-below ${minValue >= 0 ? 'is-up' : 'is-down'}`}
      style={{ left: `${clampPct((xFor(minIndex) / width) * 100)}%`, top: `${(yFor(minValue) / height) * 100}%` }}
    ><i className="sr-only">{t('최저')} </i>{format(minValue)}</span>}

    {launchClusters.map((cluster, clusterIndex) => {
      const clusterLaunches = cluster.map((launchIndex) => launches[launchIndex]);
      const position = (
        cluster.reduce((sum, launchIndex) => sum + launchPositions[launchIndex], 0)
        / cluster.length
        / width
      ) * 100;
      const isCluster = clusterLaunches.length > 1;
      const edgeClass = position <= 10 ? 'is-edge-start' : position >= 90 ? 'is-edge-end' : '';
      const firstLaunch = clusterLaunches[0];
      const status = firstLaunch.kind === 'before-range' ? t('이전부터 운용') : t('운용 시작');
      const tooltipId = `${clipId}-launch-cluster-${clusterIndex}`;
      const markerLabel = isCluster
        ? `${firstLaunch.name} ${t('외')} ${clusterLaunches.length - 1}${t('개 봇 운용 시작 정보')}`
        : `${firstLaunch.name} ${status} ${t('정보')}`;
      return <button
        type="button"
        key={clusterLaunches.map((launch) => launch.name).join('-')}
        className={`dashboard-chart-marker ${isCluster ? 'is-cluster' : ''} ${edgeClass}`}
        style={{ left: `${position}%` }}
        data-cluster-size={clusterLaunches.length}
        aria-label={markerLabel}
        aria-describedby={tooltipId}
        onFocus={(event) => event.stopPropagation()}
        onMouseMove={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight'].includes(event.key)) event.stopPropagation();
        }}
      >
        <span className="dashboard-chart-cluster-icons" aria-hidden="true">
          {clusterLaunches.slice(0, 2).map((launch) => <BotGlyph
            key={launch.name}
            selection={launch.appearance ?? FALLBACK_BOT_ICON}
            testId={`chart-launch-bot-icon-${launch.name}`}
          />)}
          {isCluster && <span className="dashboard-chart-cluster-count">{clusterLaunches.length}</span>}
        </span>
        <span
          id={tooltipId}
          role="tooltip"
          aria-label={isCluster
            ? `${clusterLaunches.length}${t('개 봇 운용 시작 상세')}`
            : `${firstLaunch.name} ${status} ${t('상세')}`}
          className={`dashboard-chart-launch-tooltip ${isCluster ? 'is-cluster' : ''}`}
        >
          {isCluster && <span className="dashboard-chart-cluster-title">
            {clusterLaunches.length}{t('개 봇의 시작 시점')}
          </span>}
          {clusterLaunches.map((launch) => {
            const tooltipTitle = launch.kind === 'before-range'
              ? t('선택 기간 이전에 시작')
              : t('운용 시작 시점');
            const tooltipDetail = launch.kind === 'before-range'
              ? t('기간 시작부터 성과에 포함')
              : `${dates[launch.index]} · ${t('이 날부터 성과에 포함')}`;
            return <span className="dashboard-chart-cluster-row" key={launch.name}>
              {isCluster && <BotGlyph selection={launch.appearance ?? FALLBACK_BOT_ICON} />}
              <span>
                <strong>{launch.name}</strong>
                <small>{tooltipTitle} · {tooltipDetail}</small>
              </span>
            </span>;
          })}
        </span>
      </button>;
    })}

    {active !== null && <div
      className={`dashboard-chart-tooltip ${active < values.length * .18 ? 'edge-left' : active > values.length * .82 ? 'edge-right' : ''}`}
      role="tooltip"
      style={{ left: `${(xFor(active) / width) * 100}%` }}
    >
      <strong>{dates[active]}</strong>
      <b>{format(values[active])}</b>
      {showRateInTooltip && <span className={rates[active] >= 0 ? 'positive' : 'negative'}>{`${rates[active] >= 0 ? '+' : ''}${rates[active].toFixed(2)}%`}</span>}
    </div>}
  </div>
  <div className="dashboard-chart-xlabels" aria-hidden="true">
    {xTicks.map((tick) => <span key={tick}>{dates[tick]}</span>)}
  </div>
  </div>;
}
