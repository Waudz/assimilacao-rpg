import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useOnline } from '../lib/hooks';
import { back, go } from '../lib/router';
import { Icon, Mark, type IconName } from './Icon';

// ------------------------------------------------------------------ estrutura
export function Header({ title, backTo, right }: { title?: string; backTo?: string; right?: ReactNode }) {
  return (
    <header className="app-header">
      {backTo !== undefined ? (
        <button className="icon-btn" aria-label="Voltar" onClick={() => (backTo ? go(backTo) : back())}>
          <Icon name="back" />
        </button>
      ) : (
        <Mark />
      )}
      <div className="brand">
        Assimilação
        <small>{title ?? 'FICHAS DIGITAIS'}</small>
      </div>
      {right}
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="section-title">
      <h2>
        {icon && <Icon name={icon} />}
        {children}
      </h2>
    </div>
  );
}

export function Card({ title, icon, tone, children, className = '', ...rest }: { title?: ReactNode; icon?: IconName; tone?: 'accent' | 'bad' | 'flat'; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  const toneClass = tone === 'accent' ? ' accent' : tone === 'bad' ? ' tone-bad' : tone === 'flat' ? ' flat' : '';
  return (
    <section className={`card${toneClass} ${className}`.trim()} {...rest}>
      {title && (
        <h2>
          {icon && <Icon name={icon} />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ ações
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'secondary' | 'primary' | 'danger' | 'ghost';
  size?: 'normal' | 'small' | 'big';
  block?: boolean;
  icon?: IconName;
};

export function Button({ variant = 'secondary', size = 'normal', block, icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', variant !== 'secondary' && variant, size !== 'normal' && size, block && 'block', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ feedback
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ icon = 'scroll', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children && <p className="muted">{children}</p>}
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
    <div className="notice warn" style={{ borderRadius: 0, textAlign: 'center', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }} role="status">
      <Icon name="offline" />
      Sem conexão — a ficha continua funcionando e será sincronizada depois.
    </div>
  );
}

// ------------------------------------------------------------------ modal
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'normal' | 'danger';
}

/** Substitui window.confirm: `const [ask, dialog] = useConfirm(); if (!(await ask({...}))) return; … {dialog}` */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return [ask, state ? <ConfirmDialog opts={state.opts} onClose={close} /> : null];
}

export function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      onClick={(e) => e.target === ref.current && onClose(false)}
    >
      <div className="modal-body">
        <h2 id="modal-title">{opts.title}</h2>
        {opts.message && <div>{opts.message}</div>}
      </div>
      <div className="modal-actions">
        <Button onClick={() => onClose(false)} autoFocus>
          {opts.cancelLabel ?? 'Cancelar'}
        </Button>
        <Button variant={opts.tone === 'danger' ? 'danger' : 'primary'} className={opts.tone === 'danger' ? 'solid' : ''} onClick={() => onClose(true)}>
          {opts.confirmLabel ?? 'Confirmar'}
        </Button>
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------------ aptidões
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

// ------------------------------------------------------------------ símbolos dos dados
export type SymbolKind = 'success' | 'adapt' | 'pressure';

export function SymbolIcon({ kind, size = 22 }: { kind: SymbolKind; size?: number }) {
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
        <path d="M8 3l2 5M16 3l-2 5M12 6c-4 0-5 3-5 5 0 3 2 4 3 5l2 5 2-5c1-1 3-2 3-5 0-2-1-5-5-5z" fill="rgba(29,100,104,.12)" stroke="#1d6468" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M6 5l-3-2m15 2l3-2" stroke="#1d6468" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 3l5 6 4-2 4 2 5-6-1 10-4 6-4 2-4-2-4-6z" fill="rgba(123,42,34,.12)" stroke="#7b2a22" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="13" r="1" fill="#7b2a22" />
      <circle cx="14.5" cy="13" r="1" fill="#7b2a22" />
    </svg>
  );
}

export const SYMBOL_NAMES = { success: 'Sucesso (joaninha)', adapt: 'Adaptação (cervo)', pressure: 'Pressão (lobo)' } as const;
export const SYMBOL_SHORT = { success: 'Sucesso', adapt: 'Adaptação', pressure: 'Pressão' } as const;

/** Fichas coloridas com ícone e contagem. Valores zerados ficam esmaecidos. */
export function SymbolRow({ success, adapt, pressure, label }: { success: number; adapt: number; pressure: number; label?: string }) {
  const items: [SymbolKind, number][] = [
    ['success', success],
    ['adapt', adapt],
    ['pressure', pressure],
  ];
  return (
    <div className="symchips" role="group" aria-label={label ?? `${success} sucessos, ${adapt} adaptações, ${pressure} pressões`}>
      {items.map(([k, n]) => (
        <span key={k} className={`symchip ${k}${n === 0 ? ' zero' : ''}`} title={SYMBOL_NAMES[k]}>
          <SymbolIcon kind={k} />×{n}
        </span>
      ))}
    </div>
  );
}
