// Fronteira com o servidor. A interface `Remote` permite testar o motor de sincronização sem rede.
import { createClient } from '@supabase/supabase-js';
import type { Character } from '../rules';

export type PushResult = { status: 'ok'; rev: number } | { status: 'conflict'; rev: number; data: Character };
export type JoinResult = { ok: true; tableId: string; tableName: string } | { ok: false; error: string };

export interface ServerCharacterRow {
  id: string;
  tableId: string | null;
  rev: number;
  data: Character;
  updatedAt: number;
}
export interface ServerTable {
  id: string;
  code: string;
  name: string;
}

export interface Remote {
  push(c: Character, baseRev: number, force?: boolean): Promise<PushResult>;
  deleteCharacter(id: string): Promise<void>;
  join(characterId: string, code: string): Promise<JoinResult>;
  leave(characterId: string): Promise<void>;
  claim(characterId: string, secret: string): Promise<{ ok: boolean; rev?: number; error?: string }>;
  createTable(name: string): Promise<{ id: string; code: string; recoveryKey: string }>;
  recoverTable(code: string, key: string): Promise<{ ok: boolean; id?: string; name?: string; code?: string; error?: string }>;
  rotateCode(tableId: string): Promise<string>;
  deleteTable(tableId: string): Promise<void>;
  kick(characterId: string): Promise<void>;
  listTables(): Promise<ServerTable[]>;
  listTableCharacters(tableId: string): Promise<ServerCharacterRow[]>;
  getOwn(characterId: string): Promise<ServerCharacterRow | null>;
  /** Chama `onChange` quando houver alterações em fichas da mesa. Retorna função de cancelamento. */
  subscribe(tableId: string, onChange: () => void): () => void;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = ReturnType<typeof createClient<any, 'assimilacao'>>;
export const syncConfigured = Boolean(url && key);

/** Schema dedicado: o projeto Supabase é compartilhado com outro app; nada aqui toca em `public`. */
export const DB_SCHEMA = 'assimilacao';

let client: Client | null = null;
let ready: Promise<Client> | null = null;

/** Para testes. */
export function __setClientForTests(c: Client | null) {
  client = c;
  ready = null;
}

/** Cria o cliente e garante UMA sessão anônima, mesmo com várias chamadas simultâneas (evita identidades duplicadas). */
function getClient(): Promise<Client> {
  if (!url || !key) return Promise.reject(new Error('not_configured'));
  ready ??= connect().catch((e) => {
    ready = null; // permite nova tentativa depois de falha (ex.: sem rede)
    throw e;
  });
  return ready;
}

async function connect(): Promise<Client> {
  client ??= createClient(url!, key!, { db: { schema: DB_SCHEMA }, auth: { persistSession: true, autoRefreshToken: true, storageKey: 'assimilacao-auth' } });
  const { data } = await client.auth.getSession();
  if (!data.session) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw new Error(error.message);
  }
  return client;
}

export function withoutSecret(c: Character): Omit<Character, 'recoverySecret'> {
  const { recoverySecret: _omit, ...rest } = c;
  void _omit;
  return rest;
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

interface Row {
  id: string;
  table_id: string | null;
  rev: number;
  data: Character;
  updated_at: string;
}
const COLS = 'id, table_id, rev, data, updated_at';
const toRow = (r: Row): ServerCharacterRow => ({ id: r.id, tableId: r.table_id, rev: r.rev, data: r.data, updatedAt: Date.parse(r.updated_at) });

export const supabaseRemote: Remote = {
  async push(c, baseRev, force = false) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('push_character', {
      p_id: c.id,
      // O segredo de recuperação vai separado (p_secret) e nunca dentro do JSON legível pelo Assimilador.
      p_data: withoutSecret(c),
      p_base_rev: baseRev,
      p_client_updated_at: c.updatedAt,
      p_secret: c.recoverySecret,
      p_force: force,
    });
    fail(error);
    return data as PushResult;
  },
  async deleteCharacter(id) {
    const sb = await getClient();
    fail((await sb.rpc('delete_character', { p_id: id })).error);
  },
  async join(characterId, code) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('join_table', { p_character_id: characterId, p_code: code });
    fail(error);
    const r = data as { ok: boolean; error?: string; table_id?: string; table_name?: string };
    return r.ok ? { ok: true, tableId: r.table_id!, tableName: r.table_name! } : { ok: false, error: r.error ?? 'unknown' };
  },
  async leave(characterId) {
    const sb = await getClient();
    fail((await sb.rpc('leave_table', { p_character_id: characterId })).error);
  },
  async claim(characterId, secret) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('claim_character', { p_id: characterId, p_secret: secret });
    fail(error);
    return data as { ok: boolean; rev?: number; error?: string };
  },
  async createTable(name) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('create_table', { p_name: name });
    fail(error);
    const r = data as { id: string; code: string; recovery_key: string };
    return { id: r.id, code: r.code, recoveryKey: r.recovery_key };
  },
  async recoverTable(code, k) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('recover_table', { p_code: code, p_key: k });
    fail(error);
    return data as { ok: boolean; id?: string; name?: string; code?: string; error?: string };
  },
  async rotateCode(tableId) {
    const sb = await getClient();
    const { data, error } = await sb.rpc('rotate_table_code', { p_table_id: tableId });
    fail(error);
    return data as string;
  },
  async deleteTable(tableId) {
    const sb = await getClient();
    fail((await sb.rpc('delete_table', { p_table_id: tableId })).error);
  },
  async kick(characterId) {
    const sb = await getClient();
    fail((await sb.rpc('kick_character', { p_character_id: characterId })).error);
  },
  async listTables() {
    const sb = await getClient();
    const { data, error } = await sb.from('tables').select('id, code, name').order('created_at');
    fail(error);
    return (data ?? []) as ServerTable[];
  },
  async listTableCharacters(tableId) {
    const sb = await getClient();
    const { data, error } = await sb.from('characters').select(COLS).eq('table_id', tableId).order('name');
    fail(error);
    return ((data ?? []) as Row[]).map(toRow);
  },
  async getOwn(characterId) {
    const sb = await getClient();
    const { data, error } = await sb.from('characters').select(COLS).eq('id', characterId).maybeSingle();
    fail(error);
    return data ? toRow(data as Row) : null;
  },
  subscribe(tableId, onChange) {
    let channel: ReturnType<Client['channel']> | null = null;
    let cancelled = false;
    void getClient().then((sb) => {
      if (cancelled) return;
      channel = sb
        .channel(`table-${tableId}`)
        .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'characters', filter: `table_id=eq.${tableId}` }, onChange)
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel && client) void client.removeChannel(channel);
    };
  },
};

/** Traduz erros do servidor em mensagens para o usuário. */
export function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === 'not_configured') return 'Sincronização não configurada neste aplicativo.';
  if (m.includes('too_many_attempts')) return 'Muitas tentativas incorretas. Aguarde alguns minutos.';
  if (m.includes('too_many_tables')) return 'Limite de mesas atingido.';
  if (m.includes('forbidden')) return 'Sem permissão para esta ação.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão com o servidor.';
  return m;
}

export const isNetworkError = (e: unknown) => /failed to fetch|network|load failed|not_configured/i.test(e instanceof Error ? e.message : String(e));
