import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Pede armazenamento persistente: no iOS/Android reduz o risco de o navegador apagar as fichas locais.
try {
  void navigator.storage?.persist?.();
} catch {
  /* indisponível */
}

// Atualização do PWA: o service worker novo assume sozinho (autoUpdate); aqui garantimos que ele seja procurado
// ao reabrir/voltar ao app (celular instalado fica dias aberto em segundo plano) e que a página recarregue uma vez.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const check = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      // Confere o carimbo publicado (sem cache): se for diferente do que está rodando, força nova busca do SW.
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = (await r.json()) as { id?: string };
      if (v.id && v.id !== __BUILD_ID__) await reg?.update();
    } catch {
      /* offline: tenta depois */
    }
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void check());
  window.addEventListener('online', () => void check());
  setInterval(() => void check(), 15 * 60 * 1000);
  // Recarrega UMA vez quando um SW novo assume o controle (evita laço e perda de digitação no meio de uso).
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true; // primeira instalação: não recarrega
      return;
    }
    if (sessionStorage.getItem('sw-reloaded') === __BUILD_ID__) return;
    sessionStorage.setItem('sw-reloaded', __BUILD_ID__);
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
