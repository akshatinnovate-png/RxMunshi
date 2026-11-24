'use client';
import { useEffect, type ReactNode } from 'react';
import type { Bucket } from '@/core/expiry';
import { BUCKET_LABEL } from '@/core/expiry';
import { inr } from '@/core/util';

export function Win({ title, count, children, tools, flush, className, id }: { title: ReactNode; count?: ReactNode; children: ReactNode; tools?: ReactNode; flush?: boolean; className?: string; id?: string }) {
  return (
    <section className={`win rg ${className ?? ''}`} id={id}>
      <div className="tb">
        <span className="t">{title}</span>
        {count !== undefined && <span className="count">{count}</span>}
        {tools}
      </div>
      <div className={`body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Chip({ tone, children, plain }: { tone?: 'bad' | 'warn' | 'good' | 'hot' | 'ink'; children: ReactNode; plain?: boolean }) {
  return <span className={`chip ${tone ?? ''} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function BucketChip({ b }: { b: Bucket }) {
  const tone = b === 'expired' || b === 'd30' ? 'bad' : b === 'd60' ? 'warn' : b === 'd90' ? 'warn' : 'good';
  return <Chip tone={tone}>{BUCKET_LABEL[b]}</Chip>;
}

/** Evidence tags from the design system: obs (typed/confirmed), der (computed), imp (read by OCR), syn (synthetic). */
export function Ev({ k, title }: { k: 'obs' | 'der' | 'imp' | 'syn'; title?: string }) {
  const label = { obs: 'obs', der: 'der', imp: 'imp', syn: 'syn' }[k];
  return (
    <span className={`tag ${k}`} title={title ?? { obs: 'Observed: typed or confirmed by a person', der: 'Derived: computed from records', imp: 'Imputed: read by OCR, check it', syn: 'Synthetic demo data' }[k]}>
      {label}
    </span>
  );
}

export function Money({ v, tone, compact }: { v: number; tone?: 'good' | 'bad'; compact?: boolean }) {
  return <span className={`tnum ${tone === 'good' ? 'money-good' : tone === 'bad' ? 'money-bad' : ''}`}>{inr(v, { compact })}</span>;
}

export function Source({ children }: { children: ReactNode }) {
  return <div className="ev">{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="win rg focused modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 760 } : undefined}>
        <div className="tb">
          <span className="t">{title}</span>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="hint" style={{ padding: 14 }}>{children}</div>;
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-h">
      <h1>{title}</h1>
      {actions && <div className="actions">{actions}</div>}
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Bar({ label, v, max, tone, right }: { label: ReactNode; v: number; max: number; tone?: 'bad' | 'warn' | 'hot'; right: ReactNode }) {
  return (
    <div className="br">
      <span>{label}</span>
      <div className="tr">
        <i className={tone} style={{ width: `${max > 0 ? Math.min(100, (v / max) * 100) : 0}%` }} />
      </div>
      <span className="num">{right}</span>
    </div>
  );
}

export function Sparkline({ values, w = 90, h = 22 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [1 + (i * (w - 2)) / (values.length - 1), h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="var(--hot)" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}
