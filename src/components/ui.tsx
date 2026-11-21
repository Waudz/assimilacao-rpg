import type { ReactNode } from 'react';
import { back, go } from '../lib/router';
import { useOnline } from '../lib/hooks';

export function Header({ title, backTo, right }: { title?: string; backTo?: string; right?: ReactNode }) {
  return (
    <header className="app-header">
      {backTo !== undefined && (
        <button className="icon-btn" aria-label="Voltar" onClick={() => (backTo ? go(backTo) : back())}>
          ←
        </button>
      )}
      <div className="brand">
        ASSIMILAÇÃO
        <small>{title ?? 'FICHAS DIGITAIS'}</small>
      </div>
      {right}
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="notice warn" style={{ borderRadius: 0, textAlign: 'center' }} role="status">
      Sem conexão — a ficha continua funcionando e será sincronizada depois.
    </div>
  );
}

/** Controle −/+ com rótulos acessíveis. */
export function NumStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <strong aria-label={`${label}: ${value}`}>{value}</strong>
      <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/** Quadradinhos (Instintos) ou losangos (Conhecimentos/Práticas) como na ficha impressa. */
export function Pips({ base, ups = 0, max = 5, diamond = false }: { base: number; ups?: number; max?: number; diamond?: boolean }) {
  return (
    <div className="pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip${diamond ? ' diamond' : ''}${i < base ? ' on' : i < base + ups ? ' up' : ''}`} />
      ))}
    </div>
  );
}

// Símbolos dos dados
export function SymbolIcon({ kind, size = 22 }: { kind: 'success' | 'adapt' | 'pressure'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (kind === 'success')
    return (
      <svg {...common}>
        <ellipse cx="12" cy="14" rx="7.5" ry="7" fill="#c0392b" stroke="#231d16" strokeWidth="1.2" />
        <path d="M12 7v14" stroke="#231d16" strokeWidth="1.2" />
        <circle cx="12" cy="6" r="3" fill="#231d16" />
        <circle cx="8.5" cy="12" r="1.2" fill="#231d16" />
        <circle cx="15.5" cy="12" r="1.2" fill="#231d16" />
        <circle cx="9" cy="17" r="1.2" fill="#231d16" />
        <circle cx="15" cy="17" r="1.2" fill="#231d16" />
      </svg>
    );
  if (kind === 'adapt')
    return (
      <svg {...common}>
        <path d="M8 3l2 5M16 3l-2 5M12 6c-4 0-5 3-5 5 0 3 2 4 3 5l2 5 2-5c1-1 3-2 3-5 0-2-1-5-5-5z" fill="none" stroke="#1f6f73" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M6 5l-3-2m15 2l3-2" stroke="#1f6f73" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 3l5 6 4-2 4 2 5-6-1 10-4 6-4 2-4-2-4-6z" fill="none" stroke="#7b2a22" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="13" r="1" fill="#7b2a22" />
      <circle cx="14.5" cy="13" r="1" fill="#7b2a22" />
    </svg>
  );
}

export const SYMBOL_NAMES = { success: 'Sucesso (joaninha)', adapt: 'Adaptação (cervo)', pressure: 'Pressão (lobo)' } as const;

export function SymbolRow({ success, adapt, pressure, label }: { success: number; adapt: number; pressure: number; label?: string }) {
  const parts: ReactNode[] = [];
  (['success', 'adapt', 'pressure'] as const).forEach((k) => {
    const n = k === 'success' ? success : k === 'adapt' ? adapt : pressure;
    parts.push(
      <span key={k} className="sym" title={SYMBOL_NAMES[k]}>
        <SymbolIcon kind={k} />×{n}
      </span>,
    );
  });
  return (
    <div className="row wrap" role="group" aria-label={label ?? `${success} sucessos, ${adapt} adaptações, ${pressure} pressões`} style={{ gap: 12 }}>
      {parts}
    </div>
  );
}
