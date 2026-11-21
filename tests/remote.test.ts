import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCharacter } from '../src/lib/rules';

// O cliente real é substituído por um espião: verificamos schema, RPCs, consultas e Realtime sem rede.
const calls: { rpc: [string, Record<string, unknown>][]; from: string[]; channels: { event: Record<string, unknown> }[]; options?: Record<string, unknown> } = {
  rpc: [],
  from: [],
  channels: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    calls.options = options;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return {
      auth: { getSession: async () => ({ data: { session: {} } }), signInAnonymously: async () => ({ error: null }) },
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.rpc.push([name, args]);
        return { data: name === 'push_character' ? { status: 'ok', rev: 1 } : { ok: true }, error: null };
      },
      from: (t: string) => {
        calls.from.push(t);
        return chain;
      },
      channel: () => ({
        on(_type: string, event: Record<string, unknown>) {
          calls.channels.push({ event });
          return this;
        },
        subscribe() {
          return this;
        },
      }),
      removeChannel: () => undefined,
    };
  },
}));

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  return import('../src/lib/sync/remote');
}

beforeEach(() => {
  calls.rpc = [];
  calls.from = [];
  calls.channels = [];
  calls.options = undefined;
});
afterEach(() => vi.unstubAllEnvs());

describe('cliente Supabase usa exclusivamente o schema assimilacao', () => {
  it('cria o cliente com db.schema = assimilacao e chave de sessão própria', async () => {
    const { supabaseRemote, DB_SCHEMA } = await load();
    expect(DB_SCHEMA).toBe('assimilacao');
    await supabaseRemote.listTables();
    expect(calls.options).toMatchObject({ db: { schema: 'assimilacao' }, auth: { storageKey: 'assimilacao-auth' } });
  });

  it('todas as chamadas RPC e consultas usam apenas nomes da API do schema', async () => {
    const { supabaseRemote } = await load();
    const c = newCharacter();
    await supabaseRemote.push(c, 0);
    await supabaseRemote.join(c.id, 'ABCD2345');
    await supabaseRemote.leave(c.id);
    await supabaseRemote.claim(c.id, c.recoverySecret);
    await supabaseRemote.createTable('M');
    await supabaseRemote.recoverTable('ABCD2345', 'k');
    await supabaseRemote.rotateCode('t');
    await supabaseRemote.deleteTable('t');
    await supabaseRemote.kick(c.id);
    await supabaseRemote.deleteCharacter(c.id);
    await supabaseRemote.listTables();
    await supabaseRemote.listTableCharacters('t');
    await supabaseRemote.getOwn(c.id);
    const names = calls.rpc.map(([n]) => n).sort();
    expect(names).toEqual(['claim_character', 'create_table', 'delete_character', 'delete_table', 'join_table', 'kick_character', 'leave_table', 'push_character', 'recover_table', 'rotate_table_code']);
    expect(new Set(calls.from)).toEqual(new Set(['tables', 'characters']));
    expect(names.every((n) => !n.includes('.'))).toBe(true); // o schema vem do cliente, não de prefixos
  });

  it('o segredo de recuperação não vai dentro do JSON da ficha enviado ao servidor', async () => {
    const { supabaseRemote } = await load();
    const c = newCharacter();
    await supabaseRemote.push(c, 0);
    const [, args] = calls.rpc.find(([n]) => n === 'push_character')!;
    expect(args.p_data).not.toHaveProperty('recoverySecret');
    expect(JSON.stringify(args.p_data)).not.toContain(c.recoverySecret);
    expect(args.p_secret).toBe(c.recoverySecret);
  });

  it('a assinatura Realtime escuta o schema assimilacao filtrando pela mesa', async () => {
    const { supabaseRemote } = await load();
    const off = supabaseRemote.subscribe('tab-1', () => undefined);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.channels[0].event).toMatchObject({ schema: 'assimilacao', table: 'characters', filter: 'table_id=eq.tab-1' });
    off();
  });

  it('sem variáveis de ambiente a sincronização fica desativada', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m = await import('../src/lib/sync/remote');
    expect(m.syncConfigured).toBe(false);
    await expect(m.supabaseRemote.listTables()).rejects.toThrow('not_configured');
  });
});
