import { AlertTriangle, ArrowUpRight, ChevronRight, CircleHelp, Inbox, Loader2, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Localized } from '../lib/i18n';

export interface PageHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function PageHeading({ eyebrow, title, description, actions, meta }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      <div className="page-actions">{meta && <span className="heading-meta">{meta}</span>}{actions}</div>
    </header>
  );
}

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>;
}

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  trend?: string;
  icon?: LucideIcon;
}

export function StatCard({ label, value, detail, trend, icon: Icon }: StatCardProps) {
  return (
    <article className="stat-card panel">
      <div className="stat-card-top"><span>{label}</span>{Icon && <Icon size={16} aria-hidden="true" />}</div>
      <strong>{value}</strong>
      <div className="stat-card-bottom">
        {trend && <span className={trend.startsWith('+') ? 'positive' : trend.startsWith('-') ? 'negative' : ''}>{trend}</span>}
        <span>{detail}</span>
      </div>
    </article>
  );
}

export interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Panel({ title, subtitle, action, className = '', children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <header className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
      {children}
    </section>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'primary' | 'secondary' | 'ghost';
  icon?: LucideIcon;
}

export function Button({ children, kind = 'secondary', icon: Icon, className = '', ...props }: ButtonProps) {
  return <button className={`button button-${kind} ${className}`} {...props}>{Icon && <Icon size={16} aria-hidden="true" />}{children}</button>;
}

export function SearchBar({ placeholder = '검색' }: { placeholder?: string }) {
  return <label className="search-box"><Search size={16} aria-hidden="true" /><input aria-label={placeholder} placeholder={placeholder} /><kbd>⌘K</kbd></label>;
}

export function FilterButton() {
  return <Button icon={SlidersHorizontal}>필터</Button>;
}

export interface DataTableColumn<Row> {
  key: string;
  label: ReactNode;
  render?: (row: Row) => ReactNode;
}

export interface DataTableProps<Row extends object> {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  rowKey?: string;
  className?: string;
}

export function DataTable<Row extends object>({ columns, rows, rowKey = 'name', className = '' }: DataTableProps<Row>) {
  const cell = (row: Row, key: string) => (row as Record<string, unknown>)[key];
  return (
    <Localized><div className={`table-wrap ${className}`}>
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={String(cell(row, rowKey) ?? index)} className={cell(row, 'mine') ? 'is-mine' : ''}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : (cell(row, column.key) as ReactNode)}</td>)}</tr>)}</tbody>
      </table>
    </div></Localized>
  );
}

export function InlineLink({ children }: { children: ReactNode }) {
  return <button className="inline-link">{children}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}

export function HelpNote({ children }: { children: ReactNode }) {
  return <div className="help-note"><CircleHelp size={16} aria-hidden="true" /><span>{children}</span></div>;
}

export interface ListRowProps {
  icon?: LucideIcon;
  title: ReactNode;
  detail?: ReactNode;
  end?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function ListRow({ icon: Icon, title, detail, end, active = false, onClick }: ListRowProps) {
  const Tag = (onClick ? 'button' : 'div') as 'button';
  return <Tag className={`list-row ${active ? 'is-active' : ''}`} onClick={onClick}>{Icon && <span className="list-row-icon"><Icon size={17} /></span>}<span className="list-row-copy"><strong>{title}</strong><small>{detail}</small></span>{end ?? <ChevronRight size={16} className="muted" />}</Tag>;
}

export interface SegmentedItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
}

export interface SegmentedProps<Id extends string = string> {
  value: Id;
  onChange: (id: Id) => void;
  items: Array<SegmentedItem<Id>>;
  label?: string;
}

export function Segmented<Id extends string = string>({ value, onChange, items, label }: SegmentedProps<Id>) {
  return <div className="segmented" aria-label={label}>{items.map((item) => <button key={item.id} className={value === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>;
}

/*
  Shared result states.

  Every surface that can come back with nothing, fail, or still be working uses
  these three so the same situation always looks the same. Each one states what
  happened and what the person can do next, rather than only that something is
  missing.
*/
export interface EmptyStateProps {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}

export function EmptyState({ title, detail, action, icon: Icon = Inbox }: EmptyStateProps) {
  return <div className="result-state is-empty">
    <span className="result-state-icon"><Icon size={20} aria-hidden="true" /></span>
    <strong>{title}</strong>
    {detail && <p>{detail}</p>}
    {action}
  </div>;
}

export interface ErrorStateProps {
  title: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title, detail, onRetry, retryLabel = '다시 시도' }: ErrorStateProps) {
  return <div className="result-state is-error" role="alert">
    <span className="result-state-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
    <strong>{title}</strong>
    {detail && <p>{detail}</p>}
    {onRetry && <Button icon={RotateCcw} onClick={onRetry}>{retryLabel}</Button>}
  </div>;
}

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return <div className="result-state is-loading" role="status">
    <span className="result-state-icon"><Loader2 size={20} aria-hidden="true" /></span>
    <strong>{label}</strong>
  </div>;
}

/*
  Tab set that keeps detail behind a deliberate choice instead of stacking every
  panel onto one screen.
*/
export interface TabItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
  count?: number;
}

export interface TabsProps<Id extends string = string> {
  value: Id;
  onChange: (id: Id) => void;
  items: Array<TabItem<Id>>;
  label?: string;
}

export function Tabs<Id extends string = string>({ value, onChange, items, label }: TabsProps<Id>) {
  return <div className="detail-tabs" role="tablist" aria-label={label}>
    {items.map((item) => <button
      key={item.id}
      type="button"
      role="tab"
      id={`tab-${item.id}`}
      aria-selected={value === item.id}
      aria-controls={`tabpanel-${item.id}`}
      tabIndex={value === item.id ? 0 : -1}
      className={value === item.id ? 'active' : ''}
      onClick={() => onChange(item.id)}
    >{item.label}{item.count !== undefined && <b>{item.count}</b>}</button>)}
  </div>;
}

export function TabPanel({ id, children }: { id: string; children?: ReactNode }) {
  return <div className="detail-tabpanel" role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>;
}

/*
  Compact metric row. Replaces the 130px stat cards on the operations and
  backtest screens, which spent most of their height on padding.
*/
export interface MetricRowItem {
  label: string;
  figure: ReactNode;
  detail?: ReactNode;
  tone?: string;
}

export function MetricRow({ items, label }: { items: MetricRowItem[]; label?: string }) {
  // The data key is `figure`, not `value`: the localization walk skips
  // properties named `value` (a DOM attribute), which left metric figures
  // untranslated in English.
  return <div className="metric-row" aria-label={label}>
    {items.map((item) => <div key={item.label}>
      <span>{item.label}</span>
      <strong className={item.tone ? item.tone : ''}>{item.figure}</strong>
      {item.detail && <small>{item.detail}</small>}
    </div>)}
  </div>;
}
