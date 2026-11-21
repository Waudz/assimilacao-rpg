import Dexie, { type Table } from 'dexie';
import { migrateLegacy, normalizeCharacter, type Character } from './rules';

export type SyncState = 'local' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

/** Estado de sincronização de uma ficha local (não vai para o servidor). */
export interface SyncMeta {
  id: string;
  /** Há alterações locais ainda não enviadas. */
  dirty: boolean;
  /** Revisão do servidor da qual a versão local deriva (0 = nunca enviada). */
  baseRev: number;
  tableId?: string;
  tableName?: string;
  state: SyncState;
  error?: string;
  syncedAt?: number;
  /** Versão do servidor quando há conflito. */
  conflict?: Character;
}

/** Cópia local das fichas lidas pelo Assimilador (para consulta offline). */
export interface RemoteCharacter {
  id: string;
  tableId: string;
  rev: number;
  data: Character;
  updatedAt: number;
}

export interface GmTable {
  id: string;
  code: string;
  name: string;
  recoveryKey?: string;
}

class LocalDB extends Dexie {
  characters!: Table<Character, string>;
  sync!: Table<SyncMeta, string>;
  remote!: Table<RemoteCharacter, string>;
  gmTables!: Table<GmTable, string>;

  constructor(name = 'assimilacao-local') {
    super(name);
    this.version(1).stores({ characters: 'id,updatedAt' });
    this.version(2)
      .stores({ characters: 'id,updatedAt,status', sync: 'id', remote: 'id,tableId', gmTables: 'id' })
      .upgrade(async (tx) => {
        // Preserva as fichas do protótipo (v1) convertendo-as para o modelo atual.
        const chars = tx.table('characters');
        const all = await chars.toArray();
        for (const old of all) {
          if ((old as { schema?: number }).schema !== 2) await chars.put(migrateLegacy(old));
        }
      });
  }
}

export const db = new LocalDB();

// ---------------------------------------------------------------- fichas
export async function listCharacters(): Promise<Character[]> {
  const rows = await db.characters.toArray();
  return rows.map(normalizeCharacter).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const row = await db.characters.get(id);
  return row ? normalizeCharacter(row) : undefined;
}

/** Salva a ficha localmente e marca como pendente de envio ao servidor. */
export async function saveCharacter(c: Character): Promise<Character> {
  const saved: Character = { ...c, updatedAt: Date.now() };
  await db.transaction('rw', db.characters, db.sync, async () => {
    await db.characters.put(saved);
    const meta = await db.sync.get(saved.id);
    if (meta?.tableId || meta?.baseRev || localStorage.getItem('assimilacao-account-owner')) {
      await db.sync.put({ ...meta, dirty: true, state: meta.state === 'conflict' ? 'conflict' : 'pending' });
    }
  });
  return saved;
}

export async function deleteCharacter(id: string): Promise<void> {
  // Tombstone para evitar que uma ficha excluída offline reapareça da nuvem.
  try {
    if (localStorage.getItem('assimilacao-account-owner')) {
      const key = 'assimilacao-account-deletions';
      const ids: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([...new Set([...ids, id])]));
    }
  } catch { /* armazenamento indisponível */ }
  await db.transaction('rw', db.characters, db.sync, async () => {
    await db.characters.delete(id);
    await db.sync.delete(id);
  });
}

export async function getSyncMeta(id: string): Promise<SyncMeta> {
  return (await db.sync.get(id)) ?? { id, dirty: false, baseRev: 0, state: 'local' };
}

export async function patchSyncMeta(id: string, patch: Partial<SyncMeta>): Promise<SyncMeta> {
  const cur = await getSyncMeta(id);
  const next = { ...cur, ...patch, id };
  await db.sync.put(next);
  return next;
}

// ---------------------------------------------------------------- preferências simples
const ROLE_KEY = 'assimilacao-role-v1';
export type Role = 'player' | 'gm';
export function getRole(): Role | null {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === 'player' || v === 'gm' ? v : null;
  } catch {
    return null;
  }
}
export function setRole(role: Role | null) {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}
