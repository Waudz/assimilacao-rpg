import { liveQuery } from 'dexie';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCharacter, saveCharacter } from './db';
import type { Character } from './rules';

/** Observa uma consulta do Dexie e reexecuta quando os dados mudam. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => undefined });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * Edita uma ficha com salvamento automático no aparelho.
 * `update` aplica a mudança na tela na hora e grava no IndexedDB logo em seguida.
 */
export function useCharacterEditor(id: string | undefined, delay = 250) {
  const [char, setChar] = useState<Character | null | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef<Character | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      await saveCharacter(latest.current);
      if (!dirty.current) setStatus('saved');
    } catch {
      dirty.current = true;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setChar(undefined);
    if (!id) return;
    void getCharacter(id).then((c) => {
      if (!alive) return;
      latest.current = c ?? null;
      setChar(c ?? null);
    });
    return () => {
      alive = false;
      void flush();
    };
  }, [id, flush]);

  // Garante a gravação ao fechar/ocultar a página (importante no iOS).
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  const update = useCallback(
    (patch: Partial<Character> | ((c: Character) => Character)) => {
      if (!latest.current) return;
      const next = typeof patch === 'function' ? patch(latest.current) : { ...latest.current, ...patch };
      latest.current = next;
      dirty.current = true;
      setChar(next);
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  /** Recarrega do disco (após resolver conflito de sincronização, por exemplo). */
  const reload = useCallback(async () => {
    if (!id) return;
    const c = await getCharacter(id);
    latest.current = c ?? null;
    setChar(c ?? null);
  }, [id]);

  return { char, update, status, flush, reload };
}
