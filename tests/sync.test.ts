import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, importCharacters, parseBackup } from '../src/lib/backup';
import { db, deleteCharacter, getCharacter, getSyncMeta, saveCharacter } from '../src/lib/db';
import { applyDamage, newCharacter, type Character } from '../src/lib/rules';
import { SyncEngine, syncLabel } from '../src/lib/sync/engine';
import { bindPendingTable, clearPendingTable, getPendingTable, setPendingTable } from '../src/lib/pendingTable';
import type { JoinResult, PushResult, Remote, ServerCharacterRow, ServerTable } from '../src/lib/sync/remote';

/** Servidor em memória com as mesmas regras de permissão do backend SQL (testadas à parte em rls.test.ts). */
class FakeServer {
  chars = new Map<string, { owner: string; tableId: string | null; rev: number; data: Character; updatedAt: number }>();
  tables = new Map<string, { id: string; code: string; name: string; gm: string }>();
  failNext: Error | null = null;
  pushes = 0;
}

class FakeRemote implements Remote {
  constructor(
    private s: FakeServer,
    private uid: string,
  ) {}
  private guard() {
    if (this.s.failNext) {
      const e = this.s.failNext;
      this.s.failNext = null;
      throw e;
    }
  }
  async push(c: Character, baseRev: number, force = false): Promise<PushResult> {
    this.guard();
    this.s.pushes++;
    const cur = this.s.chars.get(c.id);
    if (!cur) {
      this.s.chars.set(c.id, { owner: this.uid, tableId: null, rev: 1, data: structuredClone(c), updatedAt: Date.now() });
      return { status: 'ok', rev: 1 };
    }
    if (cur.owner !== this.uid) throw new Error('forbidden');
    if (cur.rev !== baseRev && !force) return { status: 'conflict', rev: cur.rev, data: cur.data };
    cur.data = structuredClone(c);
    cur.rev++;
    cur.updatedAt = Date.now();
    return { status: 'ok', rev: cur.rev };
  }
  async deleteCharacter(id: string) {
    if (this.s.chars.get(id)?.owner === this.uid) this.s.chars.delete(id);
  }
  async join(characterId: string, code: string): Promise<JoinResult> {
    this.guard();
    const t = [...this.s.tables.values()].find((x) => x.code === code.toUpperCase());
    if (!t) return { ok: false, error: 'invalid_code' };
    const c = this.s.chars.get(characterId);
    if (!c || c.owner !== this.uid) return { ok: false, error: 'character_not_synced' };
    c.tableId = t.id;
    return { ok: true, tableId: t.id, tableName: t.name };
  }
  async leave(id: string) {
    const c = this.s.chars.get(id);
    if (c?.owner === this.uid) c.tableId = null;
  }
  async claim(id: string) {
    const c = this.s.chars.get(id);
    if (!c) return { ok: false };
    c.owner = this.uid;
    return { ok: true, rev: c.rev };
  }
  async createTable(name: string) {
    const id = `t${this.s.tables.size + 1}`;
    this.s.tables.set(id, { id, code: 'ABCD2345', name, gm: this.uid });
    return { id, code: 'ABCD2345', recoveryKey: 'k' };
  }
  async recoverTable() {
    return { ok: false };
  }
  async rotateCode() {
    return 'X';
  }
  async deleteTable() {}
  async kick(id: string) {
    const c = this.s.chars.get(id);
    const t = c?.tableId ? this.s.tables.get(c.tableId) : undefined;
    if (!c || !t || t.gm !== this.uid) throw new Error('forbidden');
    c.tableId = null;
  }
  async listTables(): Promise<ServerTable[]> {
    return [...this.s.tables.values()].filter((t) => t.gm === this.uid);
  }
  async listTableCharacters(tableId: string): Promise<ServerCharacterRow[]> {
    this.guard();
    const t = this.s.tables.get(tableId);
    if (!t || t.gm !== this.uid) return [];
    return [...this.s.chars.entries()].filter(([, c]) => c.tableId === tableId).map(([id, c]) => ({ id, tableId, rev: c.rev, data: c.data, updatedAt: c.updatedAt }));
  }
  async getOwn(id: string) {
    const c = this.s.chars.get(id);
    return c && c.owner === this.uid ? { id, tableId: c.tableId, rev: c.rev, data: c.data, updatedAt: c.updatedAt } : null;
  }
  subscribe() {
    return () => undefined;
  }
}

let server: FakeServer;
let online = true;
const mk = (uid: string) => new SyncEngine(new FakeRemote(server, uid), { isOnline: () => online });

async function readyChar(name = 'Joaquin'): Promise<Character> {
  const c = { ...newCharacter(), name, status: 'ready' as const };
  await db.characters.put(c);
  return c;
}

beforeEach(async () => {
  server = new FakeServer();
  online = true;
  await Promise.all([db.characters.clear(), db.sync.clear(), db.remote.clear(), db.gmTables.clear()]);
});

describe('persistência local', () => {
  it('salva, fecha (nova leitura) e recupera a ficha', async () => {
    const c = await readyChar();
    await saveCharacter({ ...c, damage: 3, notes: 'olá' });
    db.close();
    await db.open();
    const again = await getCharacter(c.id);
    expect(again).toMatchObject({ name: 'Joaquin', damage: 3, notes: 'olá' });
  });

  it('exporta e importa backup JSON sem perder dados; mantém a versão mais recente', async () => {
    const c = await readyChar();
    await saveCharacter({ ...c, damage: 2, traits: ['agricultor'] });
    const backup = await buildBackup();
    const text = JSON.stringify(backup);
    await deleteCharacter(c.id);
    expect(await getCharacter(c.id)).toBeUndefined();
    const r = await importCharacters(parseBackup(text));
    expect(r.added).toBe(1);
    expect(await getCharacter(c.id)).toMatchObject({ damage: 2, traits: ['agricultor'] });
    // importar de novo não duplica nem sobrescreve versão igual
    expect((await importCharacters(parseBackup(text))).skipped).toBe(1);
  });

  it('importa o JSON individual do protótipo (v1)', () => {
    const legacy = JSON.stringify({ format: 'assimilacao-rpg-character', version: 1, character: { id: 'abc', name: 'Antiga', instincts: [1, 1, 1, 1, 1, 4], skills: Array(12).fill(0), determination: 9, assimilation: 1, health: 18 } });
    const [c] = parseBackup(legacy);
    expect(c).toMatchObject({ id: 'abc', name: 'Antiga', schema: 2 });
  });

  it('rejeita arquivos inválidos', () => {
    expect(() => parseBackup('não é json')).toThrow();
    expect(() => parseBackup('{}')).toThrow(/Nenhuma ficha/);
  });
});

describe('fluxo Assimilador × Infectado', () => {
  it('jogador entra com o código; alterações chegam ao Assimilador; Assimilador não consegue editar', async () => {
    const gmEngine = mk('gm');
    const playerEngine = mk('player');
    const table = await new FakeRemote(server, 'gm').createTable('Mesa');
    await db.gmTables.put({ id: table.id, code: table.code, name: 'Mesa' });

    const c = await readyChar();
    const join = await playerEngine.joinTable(c.id, table.code);
    expect(join).toEqual({ ok: true, tableName: 'Mesa' });
    expect((await getSyncMeta(c.id)).state).toBe('synced');

    // Assimilador vê a ficha
    expect((await gmEngine.pullTable(table.id)).ok).toBe(true);
    expect((await db.remote.get(c.id))?.data.name).toBe('Joaquin');

    // Jogador altera a Saúde → sincroniza
    const cur = (await getCharacter(c.id))!;
    await saveCharacter(applyDamage(cur, 4));
    expect((await getSyncMeta(c.id)).dirty).toBe(true);
    await playerEngine.syncAll();
    expect((await getSyncMeta(c.id))).toMatchObject({ dirty: false, state: 'synced', baseRev: 2 });
    await gmEngine.pullTable(table.id);
    expect((await db.remote.get(c.id))?.data.damage).toBe(4);

    // Assimilador não consegue enviar alterações para a ficha do jogador
    await expect(new FakeRemote(server, 'gm').push({ ...cur, name: 'Adulterada' }, 2)).rejects.toThrow('forbidden');
    expect(server.chars.get(c.id)?.data.name).toBe('Joaquin');
  });

  it('código inválido e ficha em rascunho são recusados', async () => {
    const e = mk('player');
    const c = await readyChar();
    expect(await e.joinTable(c.id, 'ZZZZZZZZ')).toMatchObject({ ok: false, error: expect.stringMatching(/Código inválido/) });
    const draft = { ...newCharacter(), name: 'Rascunho' };
    await db.characters.put(draft);
    expect(await e.joinTable(draft.id, 'ABCD2345')).toMatchObject({ ok: false, error: expect.stringMatching(/Conclua a criação/) });
  });

  it('só envia fichas vinculadas a uma mesa (privacidade)', async () => {
    const e = mk('player');
    const c = await readyChar();
    await saveCharacter({ ...c, damage: 1 });
    await e.syncAll();
    expect(server.pushes).toBe(0);
    expect(syncLabel(await getSyncMeta(c.id), true).text).toBe('Salvo neste dispositivo');
  });
});

describe('offline e reconexão', () => {
  it('edita offline, mostra pendência e sincroniza ao voltar a internet', async () => {
    const gm = mk('gm');
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);

    online = false;
    await saveCharacter(applyDamage((await getCharacter(c.id))!, 2));
    await player.syncAll();
    let meta = await getSyncMeta(c.id);
    expect(meta).toMatchObject({ dirty: true, state: 'offline' });
    expect(syncLabel(meta, false).text).toBe('Aguardando conexão');
    expect(server.chars.get(c.id)?.data.damage).toBe(0);
    expect(await getCharacter(c.id)).toMatchObject({ damage: 2 }); // continua utilizável

    online = true;
    await player.syncAll();
    meta = await getSyncMeta(c.id);
    expect(meta).toMatchObject({ dirty: false, state: 'synced' });
    expect(syncLabel(meta, true).text).toBe('Sincronizado');
    await gm.pullTable(t.id);
    expect((await db.remote.get(c.id))?.data.damage).toBe(2);
  });

  it('falha de rede com internet "ligada" mantém a pendência e tenta de novo', async () => {
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);
    await saveCharacter(applyDamage((await getCharacter(c.id))!, 1));
    server.failNext = new Error('Failed to fetch');
    await player.syncAll();
    expect(await getSyncMeta(c.id)).toMatchObject({ dirty: true, state: 'offline' });
    await player.pushOne(c.id);
    expect(await getSyncMeta(c.id)).toMatchObject({ dirty: false, state: 'synced' });
  });

  it('erro do servidor é exibido como erro de sincronização', async () => {
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);
    await saveCharacter(applyDamage((await getCharacter(c.id))!, 1));
    server.failNext = new Error('forbidden');
    await player.syncAll();
    const meta = await getSyncMeta(c.id);
    expect(meta.state).toBe('error');
    expect(syncLabel(meta, true).tone).toBe('bad');
  });

  it('Assimilador sem internet continua vendo a última cópia', async () => {
    const gm = mk('gm');
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);
    await gm.pullTable(t.id);
    online = false;
    expect(await gm.pullTable(t.id)).toMatchObject({ ok: false, offline: true });
    expect(await db.remote.get(c.id)).toBeTruthy();
  });
});

describe('conflitos', () => {
  it('não sobrescreve em silêncio: guarda a versão do servidor e deixa o jogador escolher', async () => {
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);

    // Outra "sessão" do mesmo dono altera a ficha no servidor
    const srv = server.chars.get(c.id)!;
    srv.data = { ...srv.data, notes: 'versão do servidor', updatedAt: Date.now() + 5000 };
    srv.rev = 5;

    await saveCharacter({ ...(await getCharacter(c.id))!, notes: 'versão local' });
    await player.syncAll();
    let meta = await getSyncMeta(c.id);
    expect(meta.state).toBe('conflict');
    expect(meta.conflict?.notes).toBe('versão do servidor');
    expect(server.chars.get(c.id)?.data.notes).toBe('versão do servidor'); // intacto

    // escolher a do servidor
    await player.resolveConflict(c.id, 'server');
    expect((await getCharacter(c.id))?.notes).toBe('versão do servidor');
    expect(await getSyncMeta(c.id)).toMatchObject({ state: 'synced', dirty: false });
  });

  it('escolher a versão local reenvia e vence', async () => {
    const player = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await player.joinTable(c.id, t.code);
    const srv = server.chars.get(c.id)!;
    srv.data = { ...srv.data, notes: 'servidor' };
    srv.rev = 9;
    await saveCharacter({ ...(await getCharacter(c.id))!, notes: 'local' });
    await player.syncAll();
    await player.resolveConflict(c.id, 'local');
    expect(server.chars.get(c.id)?.data.notes).toBe('local');
    expect(await getSyncMeta(c.id)).toMatchObject({ state: 'synced', dirty: false });
  });
});

describe('segurança entre jogadores e recuperação', () => {
  it('outro jogador não consegue sobrescrever a ficha de terceiros', async () => {
    const owner = mk('p1');
    const c = await readyChar();
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    await owner.joinTable(c.id, t.code);
    await expect(new FakeRemote(server, 'p2').push({ ...c, name: 'Invasor' }, 1)).rejects.toThrow('forbidden');
  });

  it('recuperação em aparelho novo: assume a ficha e envia a versão mais recente', async () => {
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await mk('old-device').joinTable(c.id, t.code);
    const newDevice = mk('new-device');
    const local = await saveCharacter({ ...(await getCharacter(c.id))!, notes: 'backup mais novo' });
    const r = await newDevice.reclaim(local);
    expect(r.ok).toBe(true);
    expect(server.chars.get(c.id)?.owner).toBe('new-device');
    expect(server.chars.get(c.id)?.data.notes).toBe('backup mais novo');
    // aparelho antigo perdeu acesso
    await expect(new FakeRemote(server, 'old-device').push(local, 2)).rejects.toThrow('forbidden');
  });

  it('sair da mesa interrompe a visibilidade do Assimilador', async () => {
    const gm = mk('gm');
    const p = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    await p.joinTable(c.id, t.code);
    await p.leaveTable(c.id);
    await gm.pullTable(t.id);
    expect(await db.remote.get(c.id)).toBeUndefined();
  });
});

describe('mesa antes da ficha (mesa pendente)', () => {
  beforeEach(() => clearPendingTable());

  it('valida o código sem ficha e sem efeito colateral (nada é criado no servidor)', async () => {
    const e = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    expect(await e.checkTableCode(t.code)).toEqual({ ok: true });
    expect(await e.checkTableCode('ZZZZZZZZ')).toMatchObject({ ok: false, error: expect.stringMatching(/Código inválido/) });
    expect(server.chars.size).toBe(0);
    online = false;
    expect(await e.checkTableCode(t.code)).toMatchObject({ ok: false, error: expect.stringMatching(/Sem conexão/) });
  });

  it('o código fica guardado e a primeira ficha concluída entra na mesa automaticamente', async () => {
    const e = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    setPendingTable(t.code);
    const draft = { ...newCharacter(), name: 'Rascunho' };
    await db.characters.put(draft);
    expect((await e.applyPendingTable(draft.id)).status).toBe('waiting'); // rascunho não entra
    expect(getPendingTable()?.code).toBe(t.code);
    expect(server.chars.size).toBe(0); // nenhuma ficha vazia criada

    await db.characters.put({ ...draft, status: 'ready' });
    const r = await e.applyPendingTable(draft.id);
    expect(r).toEqual({ status: 'joined', tableName: 'Mesa' });
    expect(getPendingTable()).toBeNull();
    expect(await getSyncMeta(draft.id)).toMatchObject({ tableName: 'Mesa', state: 'synced' });
    expect(server.chars.get(draft.id)?.tableId).toBe(t.id);
    expect((await e.applyPendingTable(draft.id)).status).toBe('none'); // segunda chamada: nada a fazer
  });

  it('offline mantém a mesa pendente e tenta de novo ao reconectar', async () => {
    const e = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    setPendingTable(t.code);
    const c = await readyChar();
    online = false;
    expect((await e.applyPendingTable(c.id)).status).toBe('waiting');
    expect(getPendingTable()).not.toBeNull();
    online = true;
    expect((await e.applyPendingTable(c.id)).status).toBe('joined');
  });

  it('código que deixou de valer é descartado com aviso; erro de rede mantém pendente', async () => {
    const e = mk('player');
    setPendingTable('ZZZZZZZ2');
    const c = await readyChar();
    server.failNext = new Error('Failed to fetch');
    expect((await e.applyPendingTable(c.id)).status).toBe('waiting');
    expect(getPendingTable()).not.toBeNull();
    const r = await e.applyPendingTable(c.id);
    expect(r).toMatchObject({ status: 'failed', error: expect.stringMatching(/Código inválido/) });
    expect(getPendingTable()).toBeNull();
  });

  it('não cria personagens: sem ficha, nada muda no aparelho', async () => {
    const e = mk('player');
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    await e.checkTableCode(t.code);
    setPendingTable(t.code);
    expect(await db.characters.count()).toBe(0);
  });
});


describe('reconexão automática de mesa pendente após reabrir', () => {
  beforeEach(() => clearPendingTable());

  it('reenvia a ficha correta quando o app reinicia na Home', async () => {
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const first = await readyChar('Primeira');
    const other = await readyChar('Outra');
    setPendingTable(t.code);
    bindPendingTable(first.id);
    online = false;
    const e = mk('player');
    await e.syncAll();
    expect(getPendingTable()?.characterId).toBe(first.id);
    expect(server.chars.size).toBe(0);
    online = true;
    // Simula o próximo ciclo automático de sincronização após reabrir o app.
    await mk('player').syncAll();
    expect(getPendingTable()).toBeNull();
    expect((await getSyncMeta(first.id)).tableId).toBe(t.id);
    expect((await getSyncMeta(other.id)).tableId).toBeUndefined();
  });

  it('falha temporária mantém o código para o próximo ciclo', async () => {
    const t = await new FakeRemote(server, 'gm').createTable('Mesa');
    const c = await readyChar();
    setPendingTable(t.code);
    bindPendingTable(c.id);
    server.failNext = new Error('Failed to fetch');
    const e = mk('player');
    await e.syncAll();
    expect(getPendingTable()?.characterId).toBe(c.id);
    await e.syncAll();
    expect(getPendingTable()).toBeNull();
    expect((await getSyncMeta(c.id)).tableId).toBe(t.id);
  });
});
