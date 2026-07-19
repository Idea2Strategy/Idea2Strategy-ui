import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay modal-overlay" role="presentation">
      <section className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="닫기"><X size={17} /></button></header>
        {children}
      </section>
    </div>
  );
}

export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overlay" role="presentation">
      <aside className="side-panel" aria-label={title}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="닫기"><X size={17} /></button></header>
        {children}
      </aside>
    </div>
  );
}

export function Notice({
  tone,
  title,
  body,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  title: string;
  body: string;
}) {
  return (
    <article className={`notice notice--${tone}`}>
      <span className="notice__dot" />
      <div><strong>{title}</strong><p>{body}</p></div>
    </article>
  );
}

export function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`check-item ${done ? 'is-done' : ''}`}>
      <span>{done && <Check size={12} strokeWidth={2.8} />}</span>
      <p>{label}</p>
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
