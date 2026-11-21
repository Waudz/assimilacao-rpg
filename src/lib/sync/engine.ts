import { syncAccount } from './account';
// Motor de sincronização offline-first.
// - A ficha sempre é salva primeiro no aparelho (Dexie). Só fichas vinculadas a uma mesa são enviadas ao servidor.
// - Alterações pendentes ficam marcadas (`SyncMeta.dirty`) e são reenviadas quando há conexão: ao voltar online,
//   ao reabrir o app, ao voltar à aba e por temporizador. Não depende de Background Sync (indisponível no Safari/iOS).
// - Conflitos nunca sobrescrevem em silêncio: o servidor devolve a versão mais nova e o jogador escolhe.
import { db, getCharacter, getSyncMeta, patchSyncMeta, type SyncMeta } from '../db';
import { clearPendingTable, getPendingTable } from '../pendingTable';
import { normalizeCharacter, randomId, type Character } from '../rules';
import { friendlyError, isNetworkError, type Remote } from './remote';

export interface EngineOptions {
  isOnline?: () => boolean;
  intervalMs?: number;
  debounceMs?: number;
}

export class SyncEngine {
  private running = false;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private stopHooks: Array<() => void> = [];
  private readonly isOnline: () => boolean;

  constructor(
    private remote: Remote,
    private opts: EngineOptions = {},
  ) {
    this.isOnline = opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  }

  /** Liga os gatilhos automáticos de sincronização. */
  start() {
    this.stop();
    const trigger = () => this.schedule(0);
    const onVisible = () => document.visibilityState === 'visible' && trigger();
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisible);
    this.stopHooks.push(
      () => window.removeEventListener('online', trigger),
      () => document.removeEventListener('visibilitychange', onVisible),
    );
    const onChange = () => {
      this.schedule();
    };
    db.characters.hook('creating', onChange);
    db.characters.hook('updating', onChange);
    this.stopHooks.push(
      () => db.characters.hook('creating').unsubscribe(onChange),
      () => db.characters.hook('updating').unsubscribe(onChange),
    );
    this.interval = setInterval(trigger, this.opts.intervalMs ?? 20000);
    this.schedule(0);
  }

  stop() {
    this.stopHooks.splice(0).forEach((f) => f());
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    this.interval = this.timer = null;
  }

  schedule(delay = this.opts.debounceMs ?? 1200) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncAll(), delay);
  }

  /** Envia todas as fichas vinculadas que têm alterações pendentes. */
  async syncAll(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        // Recomeça a vinculação pendente mesmo se o jogador reabrir na Home,
        // sem depender de manter a ficha aberta. O destino foi fixado na conclusão.
        try { await syncAccount((id) => this.pushOne(id)); } catch { /* offline: retry on next tick */ }
        const pending = getPendingTable();
        if (pending?.characterId) await this.applyPendingTable(pending.characterId);
        const metas = await db.sync.filter((m) => m.dirty && Boolean(m.tableId) && m.state !== 'conflict').toArray();
        for (const m of metas) await this.pushOne(m.id);
      } while (this.rerun);
    } finally {
      this.running = false;
    }
  }

  async pushOne(id: string, force = false): Promise<SyncMeta> {
    const c = await getCharacter(id);
    const meta = await getSyncMeta(id);
    if (!c) return meta;
    if (!this.isOnline()) return patchSyncMeta(id, { state: meta.dirty ? 'offline' : meta.state });
    await patchSyncMeta(id, { state: 'syncing', error: undefined });
    try {
      const res = await this.remote.push(c, meta.baseRev, force);
      if (res.status === 'conflict') {
        return patchSyncMeta(id, { state: 'conflict', conflict: normalizeCharacter(res.data), baseRev: res.rev, dirty: true });
      }
      // Se a ficha mudou durante o envio, continua pendente.
      const latest = await getCharacter(id);
      const stale = latest ? latest.updatedAt !== c.updatedAt : false;
      return patchSyncMeta(id, { baseRev: res.rev, dirty: stale, state: stale ? 'pending' : 'synced', syncedAt: Date.now(), conflict: undefined, error: undefined });
    } catch (e) {
      return patchSyncMeta(id, isNetworkError(e) ? { state: 'offline' } : { state: 'error', error: friendlyError(e) });
    }
  }

  /** Envia a ficha ao servidor e a vincula à mesa do código informado. */
  async joinTable(characterId: string, code: string): Promise<{ ok: true; tableName: string } | { ok: false; error: string }> {
    if (!this.isOnline()) return { ok: false, error: 'Sem conexão. Conecte-se à internet para entrar na mesa.' };
    try {
      const c = await getCharacter(characterId);
      if (!c) return { ok: false, error: 'Ficha não encontrada.' };
      if (c.status !== 'ready') return { ok: false, error: 'Conclua a criação do personagem antes de entrar na mesa.' };
      const meta = await getSyncMeta(characterId);
      if (meta.state === 'conflict') return { ok: false, error: 'Resolva o conflito de sincronização antes de entrar na mesa.' };
      // A ficha precisa existir no servidor (e pertencer a este aparelho) antes de ser vinculada.
      const pushed = await this.remote.push(c, meta.baseRev);
      if (pushed.status === 'conflict') {
        await patchSyncMeta(characterId, { state: 'conflict', conflict: normalizeCharacter(pushed.data), baseRev: pushed.rev, dirty: true });
        return { ok: false, error: 'O servidor tem uma versão diferente desta ficha. Resolva o conflito primeiro.' };
      }
      await patchSyncMeta(characterId, { baseRev: pushed.rev, dirty: false });
      const res = await this.remote.join(characterId, code.trim());
      if (!res.ok) return { ok: false, error: joinErrorMessage(res.error) };
      await patchSyncMeta(characterId, { tableId: res.tableId, tableName: res.tableName, state: 'synced', syncedAt: Date.now(), dirty: false });
      return { ok: true, tableName: res.tableName };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /**
   * Confere o código no servidor SEM ficha e sem efeito colateral, usando a função existente `join_table` com um id
   * de ficha inexistente: `character_not_synced` = a mesa existe (código válido); `invalid_code` = código inválido.
   * (Tentativas inválidas contam no mesmo limite de força bruta do servidor.)
   */
  async checkTableCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.isOnline()) return { ok: false, error: 'Sem conexão. Conecte-se à internet para validar o código.' };
    try {
      const res = await this.remote.join(randomId(), code.trim());
      if (res.ok) return { ok: true }; // não deveria ocorrer (id inexistente), mas indica mesa válida
      if (res.error === 'character_not_synced') return { ok: true };
      return { ok: false, error: joinErrorMessage(res.error) };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /**
   * Se há uma mesa pendente e a ficha está concluída, vincula-a automaticamente.
   * Erro de rede mantém a mesa pendente (nova tentativa depois); código inválido a descarta.
   */
  async applyPendingTable(characterId: string): Promise<{ status: 'none' | 'waiting' | 'joined' | 'failed'; tableName?: string; error?: string }> {
    const pending = getPendingTable();
    if (!pending || (pending.characterId && pending.characterId !== characterId)) return { status: 'none' };
    const meta = await getSyncMeta(characterId);
    if (meta.tableId) {
      clearPendingTable();
      return { status: 'none' };
    }
    const c = await getCharacter(characterId);
    if (!c || c.status !== 'ready' || !this.isOnline()) return { status: 'waiting' };
    const r = await this.joinTable(characterId, pending.code);
    if (r.ok) {
      clearPendingTable();
      return { status: 'joined', tableName: r.tableName };
    }
    // Falha definitiva (código inválido/ficha em conflito de dono): descarta. Falha de rede: continua pendente.
    if (/Código inválido/.test(r.error)) {
      clearPendingTable();
      return { status: 'failed', error: r.error };
    }
    return { status: 'waiting', error: r.error };
  }

  async leaveTable(characterId: string): Promise<void> {
    await this.remote.leave(characterId);
    await patchSyncMeta(characterId, { tableId: undefined, tableName: undefined, state: 'local', dirty: false });
  }

  /** Resolve conflito: 'server' adota a versão do servidor; 'local' reenvia a versão deste aparelho. */
  async resolveConflict(id: string, keep: 'server' | 'local'): Promise<void> {
    const meta = await getSyncMeta(id);
    if (keep === 'server' && meta.conflict) {
      await db.transaction('rw', db.characters, db.sync, async () => {
        await db.characters.put({ ...meta.conflict!, recoverySecret: (await getCharacter(id))?.recoverySecret ?? meta.conflict!.recoverySecret });
        await patchSyncMeta(id, { conflict: undefined, dirty: false, state: 'synced', syncedAt: Date.now() });
      });
      return;
    }
    await patchSyncMeta(id, { conflict: undefined, state: 'pending', dirty: true });
    await this.pushOne(id, true);
  }

  /** Recupera a ficha em aparelho novo usando o segredo de recuperação do backup. */
  async reclaim(c: Character): Promise<{ ok: boolean; error?: string }> {
    try {
      const claim = await this.remote.claim(c.id, c.recoverySecret);
      if (!claim.ok) return { ok: false, error: 'Não foi possível recuperar esta ficha no servidor (credenciais inválidas).' };
      const server = await this.remote.getOwn(c.id);
      await patchSyncMeta(c.id, { baseRev: server?.rev ?? claim.rev ?? 0, tableId: server?.tableId ?? undefined });
      if (server && server.data.updatedAt > c.updatedAt) {
        await patchSyncMeta(c.id, { state: 'conflict', conflict: normalizeCharacter(server.data), dirty: true });
      } else {
        await patchSyncMeta(c.id, { dirty: true, state: 'pending' });
        await this.pushOne(c.id);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  // ------------------------------------------------------------ Assimilador
  /** Baixa as fichas da mesa e guarda uma cópia local para consulta offline. */
  async pullTable(tableId: string): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
    if (!this.isOnline()) return { ok: false, offline: true };
    try {
      const rows = await this.remote.listTableCharacters(tableId);
      await db.transaction('rw', db.remote, async () => {
        const keep = new Set(rows.map((r) => r.id));
        const old = await db.remote.where('tableId').equals(tableId).primaryKeys();
        await db.remote.bulkDelete(old.filter((k) => !keep.has(k)));
        await db.remote.bulkPut(rows.map((r) => ({ id: r.id, tableId, rev: r.rev, data: normalizeCharacter(r.data), updatedAt: r.updatedAt })));
      });
      return { ok: true };
    } catch (e) {
      return isNetworkError(e) ? { ok: false, offline: true } : { ok: false, error: friendlyError(e) };
    }
  }
}

function joinErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_code':
      return 'Código inválido. Confira com o Assimilador.';
    case 'character_not_synced':
      return 'Esta ficha não pertence a este aparelho.';
    default:
      return 'Não foi possível entrar na mesa.';
  }
}

export function syncLabel(meta: SyncMeta | undefined, online: boolean): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (!meta || meta.state === 'local' || !meta.tableId) return { text: 'Salvo neste dispositivo', tone: 'muted' };
  switch (meta.state) {
    case 'syncing':
      return { text: 'Sincronizando…', tone: 'warn' };
    case 'conflict':
      return { text: 'Conflito: escolha qual versão manter', tone: 'bad' };
    case 'error':
      return { text: `Erro de sincronização${meta.error ? `: ${meta.error}` : ''}`, tone: 'bad' };
    case 'offline':
    case 'pending':
      return { text: online ? 'Alterações aguardando envio' : 'Aguardando conexão', tone: 'warn' };
    default:
      return meta.dirty ? { text: 'Alterações aguardando envio', tone: 'warn' } : { text: 'Sincronizado', tone: 'ok' };
  }
}
