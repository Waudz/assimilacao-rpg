// Fonte única de verdade da conta e das mesas vinculadas a ela.
//
// Por que existe: antes, cada tela consultava a sessão uma vez ("ao montar") e ninguém ouvia mudanças. O resultado era
// estado velho (tela de login mesmo logado), corridas (o campo de código era usado antes de saber se havia conta e caía no
// caminho local) e mesas que só apareciam depois de um recarregamento. Agora:
//   • a sessão persistida é lida SEM rede ao abrir (sem piscar o login) e depois confirmada pelo cliente;
//   • `onAuthStateChange` mantém o estado em dia (entrar, sair, renovar token, outra aba);
//   • as mesas da conta vêm do servidor (`list_my_table_memberships`) com cópia local para uso offline;
//   • o código "pendente" legado (só no localStorage) é migrado para a conta assim que houver login + internet;
//   • tudo é atualizado ao abrir, ao mudar a sessão, ao reconectar, ao voltar ao primeiro plano e periodicamente.
import { useEffect, useSyncExternalStore } from 'react';
import { clearPendingTable, getPendingTable, setPendingTable } from '../pendingTable';
import {
  accountSession,
  isNetworkError,
  joinAccountTable,
  listAccountTables,
  onAccountChange,
  readStoredAccount,
  syncConfigured,
  type AccountTable,
  type AccountUser,
} from './remote';

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  tables: AccountTable[];
  /** Já temos uma lista (do servidor ou da cópia local) para mostrar. */
  tablesLoaded: boolean;
  tablesSyncing: boolean;
  tablesError: string;
  /** Resultado da migração do código pendente legado, para avisar o usuário. */
  migration: { code: string; status: 'ok' | 'invalid'; tableName?: string } | null;
}

const TABLES_CACHE = 'assimilacao-account-tables-v1';

function cachedTables(userId: string): AccountTable[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(TABLES_CACHE) || 'null') as { userId: string; items: AccountTable[] } | null;
    return v && v.userId === userId && Array.isArray(v.items) ? v.items : null;
  } catch {
    return null;
  }
}
function saveTablesCache(userId: string, items: AccountTable[]) {
  try {
    localStorage.setItem(TABLES_CACHE, JSON.stringify({ userId, items }));
  } catch {
    /* sem armazenamento */
  }
}
function dropTablesCache() {
  try {
    localStorage.removeItem(TABLES_CACHE);
  } catch {
    /* ignore */
  }
}

function initialState(): AccountState {
  if (!syncConfigured) return { status: 'signed-out', user: null, tables: [], tablesLoaded: true, tablesSyncing: false, tablesError: '', migration: null };
  const stored = readStoredAccount();
  const items = stored ? cachedTables(stored.id) : null;
  return {
    // Sessão persistida conhecida → já mostra a conta; senão ainda "verificando" até o cliente confirmar.
    status: stored ? 'signed-in' : 'loading',
    user: stored,
    tables: items ?? [],
    tablesLoaded: Boolean(items),
    tablesSyncing: false,
    tablesError: '',
    migration: null,
  };
}

let state: AccountState = initialState();
const listeners = new Set<() => void>();

function set(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getAccountState = () => state;
export function subscribeAccount(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Para testes: volta ao estado inicial e permite nova inicialização. */
export function __resetAccountStoreForTests() {
  stopFns.splice(0).forEach((f) => f());
  started = false;
  inflight = null;
  state = initialState();
  listeners.forEach((l) => l());
}

// ------------------------------------------------------------------ mesas da conta
let inflight: Promise<void> | null = null;

/** Baixa as mesas vinculadas à conta (e migra o código pendente legado antes). Chamadas simultâneas se unem. */
export function refreshAccountTables(): Promise<void> {
  if (!syncConfigured || !state.user) return Promise.resolve();
  inflight ??= (async () => {
    const userId = state.user!.id;
    set({ tablesSyncing: true });
    try {
      await migratePendingTable();
      const items = await listAccountTables();
      if (state.user?.id !== userId) return; // a conta mudou durante a consulta
      saveTablesCache(userId, items);
      set({ tables: items, tablesLoaded: true, tablesError: '' });
    } catch (e) {
      // Offline/erro: mantém a lista local (cópia) em vez de apagá-la.
      set({ tablesError: isNetworkError(e) ? 'Sem conexão — mostrando a última lista salva.' : 'Não foi possível atualizar as mesas agora.', tablesLoaded: state.tablesLoaded || Boolean(cachedTables(userId)) });
    } finally {
      set({ tablesSyncing: false });
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Caso legado: antes, entrar numa mesa sem ficha guardava só o código no aparelho. Com login ativo, grava esse vínculo
 * na conta (servidor) e só então apaga o código local. Falha de rede mantém o código; código inválido é avisado e mantido
 * visível até o jogador remover (nada é perdido em silêncio).
 */
export async function migratePendingTable(): Promise<void> {
  const pending = getPendingTable();
  if (!pending || pending.characterId || !state.user) return;
  const r = await joinAccountTable(pending.code); // erro de rede propaga: tenta de novo depois
  if (r.ok) {
    clearPendingTable();
    set({ migration: { code: pending.code, status: 'ok', tableName: r.tableName } });
  } else if (r.error === 'invalid_code') {
    set({ migration: { code: pending.code, status: 'invalid' } });
  }
  // login_required (sessão sem e-mail): não migra; continua pendente.
}

/** Entrar numa mesa pela conta: registra o vínculo (auth.uid ↔ mesa) no servidor na hora. */
export async function joinTableWithAccount(code: string): Promise<{ ok: true; tableName: string } | { ok: false; error: string }> {
  try {
    const r = await joinAccountTable(code);
    if (!r.ok) return { ok: false, error: r.error === 'invalid_code' ? 'Código inválido. Confira com o Assimilador.' : r.error === 'login_required' ? 'Entre na sua conta para vincular a mesa a ela.' : 'Não foi possível entrar na mesa.' };
    await refreshAccountTables();
    return { ok: true, tableName: r.tableName ?? 'Mesa' };
  } catch (e) {
    return { ok: false, error: isNetworkError(e) ? 'Sem conexão. Conecte-se para entrar na mesa.' : 'Não foi possível entrar na mesa. Tente novamente.' };
  }
}

/**
 * Ao concluir a primeira ficha: se a conta tem exatamente uma mesa e nenhum destino foi escolhido,
 * a ficha entra nela (o jogador já a escolheu ao informar o código). Com várias mesas, a escolha é feita na ficha.
 */
export function prepareAutoJoinForNewCharacter(): void {
  if (getPendingTable()) return;
  if (state.user && state.tables.length === 1) setPendingTable(state.tables[0].tableCode);
}

// ------------------------------------------------------------------ ciclo de vida
let started = false;
const stopFns: Array<() => void> = [];

function applyUser(user: AccountUser | null, event = 'init') {
  const prev = state.user;
  const changed = prev?.id !== user?.id;
  if (!user) {
    if (changed) dropTablesCache();
    set({ status: 'signed-out', user: null, tables: changed ? [] : state.tables, tablesLoaded: true, tablesError: '', migration: changed ? null : state.migration });
  } else {
    const items = changed ? cachedTables(user.id) : state.tables;
    set({ status: 'signed-in', user, tables: items ?? [], tablesLoaded: changed ? Boolean(items) : state.tablesLoaded });
    void refreshAccountTables();
  }
  if (changed || event === 'SIGNED_IN') window.dispatchEvent(new Event('account-changed'));
}

/** Idempotente. Liga a verificação da sessão e todos os gatilhos de atualização. */
export function initAccountStore(): void {
  if (started || !syncConfigured) return;
  started = true;

  const verify = async () => {
    try {
      applyUser(await accountSession(), 'verify');
    } catch {
      // Sem rede e sem sessão local utilizável: se nunca soubemos de conta, tratamos como "sem conta" por ora.
      if (state.status === 'loading') set({ status: 'signed-out', tablesLoaded: true });
      // Conta conhecida pelo armazenamento local: ainda assim tenta atualizar as mesas (cai na cópia salva se falhar).
      else void refreshAccountTables();
    }
  };
  void verify();

  let unsub: (() => void) | null = null;
  void onAccountChange((user, event) => {
    // Não chamar métodos de auth dentro do callback (deadlock do cliente): adia.
    setTimeout(() => applyUser(user, event), 0);
  })
    .then((u) => {
      unsub = u;
    })
    .catch(() => undefined);

  const refresh = () => {
    if (document.visibilityState === 'hidden') return;
    void verify();
    void refreshAccountTables();
  };
  window.addEventListener('online', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  const timer = setInterval(refresh, 30000);
  stopFns.push(
    () => unsub?.(),
    () => window.removeEventListener('online', refresh),
    () => window.removeEventListener('focus', refresh),
    () => document.removeEventListener('visibilitychange', refresh),
    () => clearInterval(timer),
  );
}

/** Hook React: estado reativo da conta e das mesas. */
export function useAccount(): AccountState {
  useEffect(() => {
    initAccountStore();
  }, []);
  return useSyncExternalStore(subscribeAccount, getAccountState, getAccountState);
}
