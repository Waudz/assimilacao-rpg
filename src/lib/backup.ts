import { db, listCharacters } from './db';
import { normalizeCharacter, type Character } from './rules';

export const BACKUP_FORMAT = 'assimilacao-rpg-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  characters: Character[];
}

export async function buildBackup(onlyId?: string): Promise<BackupFile> {
  const all = await listCharacters();
  return {
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    characters: onlyId ? all.filter((c) => c.id === onlyId) : all,
  };
}

/** Lê backups novos (v2) e o formato JSON individual do protótipo (v1). */
export function parseBackup(text: string): Character[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const o = json as Record<string, unknown>;
  const list: unknown[] = Array.isArray(o?.characters) ? (o.characters as unknown[]) : o?.character ? [o.character] : [];
  if (list.length === 0) throw new Error('Nenhuma ficha encontrada no arquivo.');
  return list.map((raw) => {
    const r = raw as { id?: unknown; name?: unknown };
    if (!r || typeof r.id !== 'string' || !r.id) throw new Error('Ficha inválida no arquivo (sem identificador).');
    return normalizeCharacter(r as Partial<Character> & { id: string });
  });
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Importa fichas. Se já existir uma com o mesmo id, mantém a mais recente. */
export async function importCharacters(chars: Character[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  await db.transaction('rw', db.characters, async () => {
    for (const c of chars) {
      const existing = await db.characters.get(c.id);
      if (!existing) {
        await db.characters.put(c);
        result.added++;
      } else if (c.updatedAt > existing.updatedAt) {
        await db.characters.put(c);
        result.updated++;
      } else result.skipped++;
    }
  });
  return result;
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
