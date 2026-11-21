import { db, getCharacter, getSyncMeta, patchSyncMeta } from '../db';
import { normalizeCharacter } from '../rules';
import { accountSession, supabaseRemote } from './remote';

const OWNER = 'assimilacao-account-owner';
const DELETIONS = 'assimilacao-account-deletions';

export async function clearAccountLocal() {
  await db.transaction('rw', db.characters, db.sync, db.gmTables, db.remote, async () => {
    await Promise.all([db.characters.clear(), db.sync.clear(), db.gmTables.clear(), db.remote.clear()]);
  });
  localStorage.removeItem(OWNER);
  localStorage.removeItem(DELETIONS);
}

export function queueAccountDeletion(id: string) {
  if (!localStorage.getItem(OWNER)) return;
  const ids: string[] = JSON.parse(localStorage.getItem(DELETIONS) || '[]');
  localStorage.setItem(DELETIONS, JSON.stringify([...new Set([...ids, id])]));
}

/** Primeiro baixa, depois envia alterações locais; nunca substitui uma revisão remota sem detectar conflito. */
export async function syncAccount(push: (id: string) => Promise<unknown>) {
  const user = await accountSession();
  if (!user) return;
  const previous = localStorage.getItem(OWNER);
  if (previous !== user.id) {
    if (previous && previous !== user.id) {
      // Troca entre contas: não misturar dados de proprietários diferentes.
      await clearAccountLocal();
    }
    // Primeiro login: manter rascunhos deste dispositivo para que possam ser salvos na conta.
    localStorage.setItem(OWNER, user.id);
  }
  const pendingDeletes: string[] = JSON.parse(localStorage.getItem(DELETIONS) || '[]');
  for (const id of pendingDeletes) {
    await supabaseRemote.deleteCharacter(id);
    localStorage.setItem(DELETIONS, JSON.stringify(pendingDeletes.filter((x) => x !== id)));
  }
  const rows = await supabaseRemote.listOwn!();
  const remoteIds = new Set(rows.map((r) => r.id));
  for (const row of rows) {
    const local = await getCharacter(row.id);
    const meta = await getSyncMeta(row.id);
    if (local && meta.dirty) {
      if (meta.baseRev !== row.rev) {
        await patchSyncMeta(row.id, { state: 'conflict', conflict: normalizeCharacter(row.data), dirty: true, baseRev: row.rev });
      }
      continue;
    }
    if (!local || row.rev > meta.baseRev) {
      await db.characters.put(normalizeCharacter({ ...row.data, recoverySecret: local?.recoverySecret || '' }));
      await patchSyncMeta(row.id, { baseRev: row.rev, tableId: row.tableId || undefined, state: 'synced', dirty: false, syncedAt: Date.now() });
    }
  }
  for (const local of await db.characters.toArray()) {
    const meta = await getSyncMeta(local.id);
    if (!remoteIds.has(local.id) || meta.dirty) {
      if (meta.state === 'conflict') continue;
      if (!remoteIds.has(local.id) && meta.baseRev > 0 && local.recoverySecret) {
        // Ficha criada numa sessão anônima: transfere a posse usando seu segredo.
        const claimed = await supabaseRemote.claim(local.id, local.recoverySecret);
        if (!claimed.ok) {
          await patchSyncMeta(local.id, { state: 'error', error: 'Não foi possível vincular esta ficha à conta. Use a recuperação da ficha.' });
          continue;
        }
        await patchSyncMeta(local.id, { baseRev: claimed.rev ?? meta.baseRev, dirty: true, state: 'pending' });
      }
      await push(local.id);
    }
  }
}
