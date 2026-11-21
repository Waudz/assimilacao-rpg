import { useEffect, useState } from 'react';

/** Roteador mínimo baseado em hash (funciona em GitHub Pages e em PWA instalado). */
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function toolReturnPath(): string {\n  try {\n    const path = sessionStorage.getItem('assimilacao-tool-return');\n    return path && path.startsWith('/') && !['/dice', '/rules'].includes(path) ? path : '/';\n  } catch { return '/'; }\n}\n\nexport function go(path: string, replace = false) {\n  if ((path === '/dice' || path === '/rules') && currentPath() !== path) {\n    const origin = currentPath();\n    if (origin !== '/dice' && origin !== '/rules') {\n      try { sessionStorage.setItem('assimilacao-tool-return', origin); } catch { /* armazenamento indisponível */ }\n    }\n  }
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}

export function match(path: string, pattern: string): Record<string, string> | null {
  const a = path.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (b[i] !== a[i]) return null;
  }
  return params;
}
