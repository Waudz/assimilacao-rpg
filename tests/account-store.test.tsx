import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingTable, getPendingTable, setPendingTable } from '../src/lib/pendingTable';

// Servidor/cliente Supabase simulados: o foco aqui é a lógica de conta, mesas e migração.
type U = { id: string; email: string; displayName: string };
const A: U = { id: 'user-a', email: 'a@exemplo.com', displayName: 'Ana' };
const B: U = { id: 'user-b', email: 'b@exemplo.com', displayName: '' };
const mock = vi.hoisted(() => ({
  storedUser: null as { id: string; email: string; displayName: string } | null,
  sessionUser: null as { id: string; email: string; displayName: string } | null,
  sessionError: false,
  listResult: [] as { tableId: string; tableName: string; tableCode: string }[],
  listError: null as Error | null,
  join: vi.fn(),
  authCb: null as null | ((u: { id: string; email: string; displayName: string } | null, ev: string) => void),
}));

vi.mock('../src/lib/sync/remote', () => ({
  syncConfigured: true,
  isNetworkError: (e: unknown) => /network|fetch/i.test(String(e)),
  readStoredAccount: () => mock.storedUser,
  accountSession: async () => {
    if (mock.sessionError) throw new Error('network');
    return mock.sessionUser;
  },
  onAccountChange: async (cb: (u: U | null, ev: string) => void) => {
    mock.authCb = cb;
    return () => undefined;
  },
  listAccountTables: async () => {
    if (mock.listError) throw mock.listError;
    return mock.listResult;
  },
  joinAccountTable: (...a: unknown[]) => mock.join(...a),
}));
vi.mock('../src/lib/sync', () => ({
  engine: { checkTableCode: vi.fn(async () => ({ ok: true })) },
  syncConfigured: true,
  syncLabel: () => ({ text: 'Salvo neste dispositivo', tone: 'muted' }),
}));

import { db } from '../src/lib/db';
import {
  __resetAccountStoreForTests,
  getAccountState,
  initAccountStore,
  joinTableWithAccount,
  migratePendingTable,
  prepareAutoJoinForNewCharacter,
  refreshAccountTables,
} from '../src/lib/sync/accountStore';
import { HomePage, RolePage } from '../src/pages/HomePage';

const table = (n: number) => ({ tableId: `t${n}`, tableName: `Mesa ${n}`, tableCode: `ABCD234${n + 4}` });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

function boot() {
  __resetAccountStoreForTests();
  initAccountStore();
}

beforeEach(async () => {
  localStorage.clear();
  clearPendingTable();
  mock.storedUser = mock.sessionUser = null;
  mock.sessionError = false;
  mock.listResult = [];
  mock.listError = null;
  mock.authCb = null;
  mock.join.mockReset();
  await db.characters.clear();
  await db.sync.clear();
});

describe('Bug 1 — sessão: tela inicial reconhece a conta', () => {
  it('sessão persistida aparece IMEDIATAMENTE (sem piscar o login) e é confirmada depois', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    __resetAccountStoreForTests(); // estado inicial lido do armazenamento, antes de qualquer rede
    expect(getAccountState()).toMatchObject({ status: 'signed-in', user: { email: A.email } });
    initAccountStore();
    await flush();
    expect(getAccountState().status).toBe('signed-in');
  });

  it('RolePage com sessão ativa mostra "Minha conta" e o nome, sem pedir login', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    boot();
    render(<RolePage onChoose={() => undefined} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Minha conta' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Entrar ou criar conta/ })).toBeNull();
    // e continua assim depois de confirmar com o cliente
    await flush();
    expect(screen.queryByRole('button', { name: /Entrar ou criar conta/ })).toBeNull();
  });

  it('sem sessão: mostra "Verificando…" (nunca o login antes de saber) e depois o login', async () => {
    let release: (u: U | null) => void = () => undefined;
    mock.sessionUser = null;
    // verificação lenta
    const remote = await import('../src/lib/sync/remote');
    vi.spyOn(remote, 'accountSession').mockImplementationOnce(() => new Promise((res) => (release = res)));
    boot();
    render(<RolePage onChoose={() => undefined} />);
    expect(screen.getByText('Verificando sua conta…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar ou criar conta/ })).toBeNull();
    await act(async () => release(null));
    expect(await screen.findByRole('button', { name: /Entrar ou criar conta/ })).toBeInTheDocument();
  });

  it('acompanha entrar e sair em tempo real (sem recarregar) e avisa o motor de sincronização', async () => {
    boot();
    await flush();
    expect(getAccountState().status).toBe('signed-out');
    const changed = vi.fn();
    window.addEventListener('account-changed', changed);
    mock.listResult = [table(1)];
    await act(async () => { mock.authCb?.(A, 'SIGNED_IN'); await new Promise((r) => setTimeout(r, 30)); });
    expect(getAccountState()).toMatchObject({ status: 'signed-in', user: { id: A.id } });
    expect(getAccountState().tables).toEqual([table(1)]);
    expect(changed).toHaveBeenCalled();
    await act(async () => { mock.authCb?.(null, 'SIGNED_OUT'); await new Promise((r) => setTimeout(r, 30)); });
    expect(getAccountState()).toMatchObject({ status: 'signed-out', user: null, tables: [] });
    window.removeEventListener('account-changed', changed);
  });

  it('trocar de conta não mistura a lista de mesas da anterior', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [table(1)];
    boot();
    await flush();
    expect(getAccountState().tables).toHaveLength(1);
    mock.listResult = [table(2)];
    await act(async () => { mock.authCb?.(B, 'SIGNED_IN'); await new Promise((r) => setTimeout(r, 30)); });
    expect(getAccountState().user?.id).toBe(B.id);
    expect(getAccountState().tables).toEqual([table(2)]);
  });

  it('offline ao abrir: mantém a conta e a última lista de mesas salvas', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [table(1)];
    boot();
    await flush();
    mock.sessionError = true;
    mock.listError = new Error('Failed to fetch');
    boot(); // reabre o app sem rede
    await flush();
    expect(getAccountState()).toMatchObject({ status: 'signed-in', tablesLoaded: true });
    expect(getAccountState().tables).toEqual([table(1)]);
    expect(getAccountState().tablesError).toMatch(/Sem conexão/);
  });
});

describe('Bug 2 — mesas vinculadas à conta, sem ficha', () => {
  it('entrar com o código estando logado grava o vínculo no servidor e mostra em "Minhas mesas"', async () => {
    const u = userEvent.setup();
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [];
    mock.join.mockImplementation(async () => {
      mock.listResult = [table(1)]; // o servidor passa a listar a mesa
      return { ok: true, tableId: 't1', tableName: 'Mesa 1' };
    });
    boot();
    render(<HomePage onSwitchRole={() => undefined} />);
    expect(await screen.findByText(/Nenhuma mesa ainda/)).toBeInTheDocument();
    await u.type(screen.getByLabelText('Código da mesa'), 'abcd2345');
    await u.click(screen.getByRole('button', { name: 'Entrar na mesa' }));
    expect(mock.join).toHaveBeenCalledWith('ABCD2345');
    expect(await screen.findByText(/Vinculada à sua conta/)).toBeInTheDocument();
    expect(screen.getByText('Mesa 1')).toBeInTheDocument();
    expect(getPendingTable()).toBeNull(); // nada local: o vínculo está no servidor
    expect(await db.characters.count()).toBe(0); // sem personagem
  });

  it('a mesma conta em outro dispositivo recebe a mesa ao abrir/entrar', async () => {
    mock.listResult = [table(1)]; // vínculo feito no celular
    mock.storedUser = null;
    mock.sessionUser = A;
    boot(); // PC: abre sem sessão local conhecida; o cliente confirma a conta
    await flush();
    expect(getAccountState().status).toBe('signed-in');
    expect(getAccountState().tables).toEqual([table(1)]);
  });

  it('não decide o caminho antes de saber se há conta (corrida): botão desabilitado enquanto verifica', async () => {
    let release: (u: U | null) => void = () => undefined;
    const remote = await import('../src/lib/sync/remote');
    vi.spyOn(remote, 'accountSession').mockImplementationOnce(() => new Promise((res) => (release = res)));
    const u = userEvent.setup();
    boot();
    render(<HomePage onSwitchRole={() => undefined} />);
    await u.type(screen.getByLabelText('Código da mesa'), 'ABCD2345');
    expect(screen.getByRole('button', { name: /Verificando conta/ })).toBeDisabled();
    expect(getPendingTable()).toBeNull(); // não caiu no caminho local
    mock.join.mockResolvedValue({ ok: true, tableId: 't1', tableName: 'Mesa 1' });
    mock.listResult = [table(1)];
    await act(async () => release(A));
    await u.click(await screen.findByRole('button', { name: 'Entrar na mesa' }));
    expect(mock.join).toHaveBeenCalled();
    expect(getPendingTable()).toBeNull();
  });

  it('código inválido, sem login e sem rede têm mensagens próprias', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    boot();
    mock.join.mockResolvedValueOnce({ ok: false, error: 'invalid_code' });
    expect(await joinTableWithAccount('ZZZZZZZZ')).toEqual({ ok: false, error: expect.stringMatching(/Código inválido/) });
    mock.join.mockResolvedValueOnce({ ok: false, error: 'login_required' });
    expect(await joinTableWithAccount('ABCD2345')).toEqual({ ok: false, error: expect.stringMatching(/Entre na sua conta/) });
    mock.join.mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(await joinTableWithAccount('ABCD2345')).toEqual({ ok: false, error: expect.stringMatching(/Sem conexão/) });
  });

  it('listas simultâneas se unem em uma só consulta ao servidor', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    boot();
    await flush();
    const calls = vi.fn(async () => mock.listResult);
    const remote = await import('../src/lib/sync/remote');
    vi.spyOn(remote, 'listAccountTables').mockImplementation(calls);
    await Promise.all([refreshAccountTables(), refreshAccountTables(), refreshAccountTables()]);
    expect(calls).toHaveBeenCalledTimes(1);
  });
});

describe('caso legado: código só no aparelho (localStorage) → migra para a conta', () => {
  it('com login e internet, grava o vínculo no servidor e só então apaga o código local', async () => {
    setPendingTable('ABCD2345');
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.join.mockImplementation(async () => {
      mock.listResult = [table(1)];
      return { ok: true, tableId: 't1', tableName: 'Mesa 1' };
    });
    boot();
    await flush();
    expect(mock.join).toHaveBeenCalledWith('ABCD2345');
    expect(getPendingTable()).toBeNull();
    expect(getAccountState().tables).toEqual([table(1)]);
    expect(getAccountState().migration).toMatchObject({ status: 'ok', tableName: 'Mesa 1' });
  });

  it('sem rede mantém o código local (nada se perde) e tenta de novo depois', async () => {
    setPendingTable('ABCD2345');
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.join.mockRejectedValueOnce(new Error('Failed to fetch'));
    boot();
    await flush();
    expect(getPendingTable()?.code).toBe('ABCD2345');
    mock.join.mockResolvedValue({ ok: true, tableId: 't1', tableName: 'Mesa 1' });
    await act(async () => { await refreshAccountTables(); });
    expect(getPendingTable()).toBeNull();
  });

  it('código que não vale mais é avisado e NÃO é apagado em silêncio', async () => {
    setPendingTable('ZZZZZZZ2');
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.join.mockResolvedValue({ ok: false, error: 'invalid_code' });
    boot();
    await flush();
    expect(getPendingTable()?.code).toBe('ZZZZZZZ2');
    expect(getAccountState().migration).toEqual({ code: 'ZZZZZZZ2', status: 'invalid' });
  });

  it('sessão sem e-mail (anônima) não migra; o código continua pendente', async () => {
    setPendingTable('ABCD2345');
    boot();
    await flush();
    expect(mock.join).not.toHaveBeenCalled();
    await migratePendingTable();
    expect(getPendingTable()?.code).toBe('ABCD2345');
  });

  it('código já ligado a uma ficha concluída não é tratado como legado', async () => {
    setPendingTable('ABCD2345');
    localStorage.setItem('assimilacao-pending-table-v1', JSON.stringify({ code: 'ABCD2345', validatedAt: 1, characterId: 'c1' }));
    mock.storedUser = A;
    mock.sessionUser = A;
    boot();
    await flush();
    expect(mock.join).not.toHaveBeenCalled();
  });
});

describe('criar ficha depois: vincular à mesa existente', () => {
  it('com uma única mesa na conta, a ficha concluída entra nela; com várias, não adivinha', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [table(1)];
    boot();
    await flush();
    prepareAutoJoinForNewCharacter();
    expect(getPendingTable()?.code).toBe('ABCD2345');

    clearPendingTable();
    mock.listResult = [table(1), table(2)];
    await act(async () => { await refreshAccountTables(); });
    prepareAutoJoinForNewCharacter();
    expect(getPendingTable()).toBeNull();
  });

  it('não sobrescreve um destino já escolhido', async () => {
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [table(1)];
    boot();
    await flush();
    setPendingTable('ZZZZZZZ2');
    prepareAutoJoinForNewCharacter();
    expect(getPendingTable()?.code).toBe('ZZZZZZZ2');
  });
});

describe('fichas existentes continuam intactas', () => {
  it('nenhuma operação de conta/mesa apaga fichas locais', async () => {
    await db.characters.put({ id: 'c1', schema: 2, status: 'ready', name: 'Joaquin' } as never);
    mock.storedUser = A;
    mock.sessionUser = A;
    mock.listResult = [table(1)];
    setPendingTable('ABCD2345');
    mock.join.mockResolvedValue({ ok: true, tableId: 't1', tableName: 'Mesa 1' });
    boot();
    await flush();
    await act(async () => { mock.authCb?.(null, 'SIGNED_OUT'); await new Promise((r) => setTimeout(r, 30)); });
    expect(await db.characters.count()).toBe(1);
    await waitFor(() => expect(getAccountState().status).toBe('signed-out'));
  });
});
