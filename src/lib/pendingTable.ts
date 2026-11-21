// "Mesa pendente": o jogador informa o código da mesa ANTES de ter ficha. O código fica guardado no aparelho
// (nenhuma ficha vazia é criada) e é aplicado automaticamente à primeira ficha que for concluída.
const KEY = 'assimilacao-pending-table-v1';

export interface PendingTable {
  code: string;
  /** Quando o código foi validado no servidor. */
  validatedAt: number;
  /** Ficha concluída que deve entrar na mesa, mesmo após reiniciar o aplicativo. */
  characterId?: string;
}

export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export function getPendingTable(): PendingTable | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PendingTable;
    return typeof v.code === 'string' && CODE_PATTERN.test(v.code) ? v : null;
  } catch {
    return null;
  }
}

export function setPendingTable(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, validatedAt: Date.now() } satisfies PendingTable));
    window.dispatchEvent(new Event('pending-table'));
  } catch {
    /* armazenamento indisponível */
  }
}

export function clearPendingTable(): void {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('pending-table'));
  } catch {
    /* ignore */
  }
}

/** Associa a mesa pendente a uma ficha específica antes da tentativa de envio. */
export function bindPendingTable(characterId: string): void {
  const pending = getPendingTable();
  if (!pending || pending.characterId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pending, characterId } satisfies PendingTable));
    window.dispatchEvent(new Event('pending-table'));
  } catch {
    /* sem armazenamento persistente */
  }
}
