import { AssimilacaoMark } from './BrandAssets';
// Conjunto único de ícones (SVG inline, traço 1.75, 24×24). Sem biblioteca externa.
const PATHS = {
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  dice: 'M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  book: 'M4 5a2 2 0 012-2h13v15H6a2 2 0 00-2 2zM4 20a2 2 0 002 1h13v-3M9 7h6',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3',
  upload: 'M12 15V3m0 0L8 7m4-4l4 4M4 17v3h16v-3',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  user: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 010 6.6M18 14.8c2.4.6 4 2.2 4 5.2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v8h14v-8',
  copy: 'M9 9h11v12H9zM5 15V3h11',
  cloud: 'M7 18a4 4 0 010-8 5.5 5.5 0 0110.7 1.3A3.4 3.4 0 0117 18z',
  offline: 'M2 8.8a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M3 3l18 18',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z',
  swap: 'M4 8h14l-4-4M20 16H6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8h.01M11 12h1v5',
  lock: 'M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z',
  key: 'M14.5 9.5a4 4 0 11-3 6.7L5 16.5V14h2.5v-2l2.2-.5',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2',
  scroll: 'M7 3h11a2 2 0 012 2v12a3 3 0 01-3 3H6a3 3 0 01-3-3v-1h4V5a2 2 0 012-2zM7 20a3 3 0 003-3v-1',
  sync: 'M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 9c0 6-8 11-8 11z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '', title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Marca do aplicativo (traço vinho + linha e ponto em azul-petróleo), igual ao ícone do PWA. */
export function Mark({ className = '' }: { className?: string }) {
  return <AssimilacaoMark className={`mark ${className}`.trim()} />;
}
