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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
