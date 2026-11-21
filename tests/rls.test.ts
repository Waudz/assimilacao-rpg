// @vitest-environment node
// Testa as políticas e funções do backend diretamente em um PostgreSQL real (PGlite), sem passar pela interface.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '00000000-0000-4000-8000-00000000000a'; // Assimilador
const B = '00000000-0000-4000-8000-00000000000b'; // Jogador 1
const C = '00000000-0000-4000-8000-00000000000c'; // Jogador 2 / outro Assimilador
const D = '00000000-0000-4000-8000-00000000000d'; // Aparelho novo (recuperação)
const CH_B = '10000000-0000-4000-8000-00000000000b';
const CH_C = '10000000-0000-4000-8000-00000000000c';
const SECRET_B = 'b'.repeat(32);

let db: PGlite;

/** Executa uma consulta como um usuário autenticado (role `authenticated` + auth.uid()). */
async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  let rows: T[] = [];
  await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    rows = (await tx.query<T>(sql, params)).rows;
  });
  return rows;
}
const asFails = (uid: string, sql: string, params: unknown[] = []) =>
  as(uid, sql, params).then(
    () => null,
    (e: Error) => e.message,
  );

const data = (id: string, name: string, extra: object = {}) => JSON.stringify({ id, name, schema: 2, ...extra });
const push = (uid: string, id: string, name: string, baseRev = 0, secret = SECRET_B, force = false, extra = {}) =>
  as<{ r: Record<string, unknown> }>(uid, 'select push_character($1, $2::jsonb, $3, $4, $5, $6) as r', [id, data(id, name, extra), baseRev, Date.now(), secret, force]).then(
    (r) => r[0].r,
  );

let code = '';
let recoveryKey = '';
let tableId = '';

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create extension if not exists pgcrypto;
  `);
  await db.exec(readFileSync('supabase/migrations/20261121000000_init.sql', 'utf-8'));
  const t = (await as<{ r: { id: string; code: string; recovery_key: string } }>(A, `select create_table('Mesa de Teste') as r`))[0].r;
  ({ code, recovery_key: recoveryKey, id: tableId } = t);
});

describe('mesa e código', () => {
  it('gera código de 8 caracteres sem ambiguidade', () => {
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('jogadores não conseguem escrever direto nas tabelas', async () => {
    expect(await asFails(B, `insert into characters (id, owner_id, data) values ('${CH_B}', '${B}', '{}')`)).toMatch(/permission denied/);
    expect(await asFails(B, `update tables set name = 'x'`)).toMatch(/permission denied/);
    expect(await asFails(B, `delete from characters`)).toMatch(/permission denied/);
  });

  it('segredos de recuperação são inacessíveis ao cliente', async () => {
    expect(await asFails(A, 'select * from secrets')).toMatch(/permission denied/);
    expect(await asFails(A, 'select * from attempts')).toMatch(/permission denied/);
  });

  it('só o Assimilador vê a mesa dele', async () => {
    expect(await as(A, 'select id from tables')).toHaveLength(1);
    expect(await as(B, 'select id from tables')).toHaveLength(0);
  });
});

describe('fichas e permissões', () => {
  it('jogador cria e lê a própria ficha', async () => {
    expect(await push(B, CH_B, 'Joaquin')).toMatchObject({ status: 'ok', rev: 1 });
    expect(await as(B, 'select name from characters')).toEqual([{ name: 'Joaquin' }]);
  });

  it('outro jogador não vê nem edita a ficha de terceiros', async () => {
    expect(await as(C, 'select id from characters')).toHaveLength(0);
    expect(await asFails(C, 'select push_character($1, $2::jsonb, 1, 1, $3)', [CH_B, data(CH_B, 'Invasor'), SECRET_B])).toMatch(/forbidden/);
    expect(await as(B, 'select name from characters')).toEqual([{ name: 'Joaquin' }]);
  });

  it('o código sozinho não dá acesso a fichas de outros', async () => {
    const r = await as<{ r: { ok: boolean; error: string } }>(C, 'select join_table($1, $2) as r', [CH_B, code]);
    expect(r[0].r).toEqual({ ok: false, error: 'character_not_synced' });
    expect(await as(C, 'select id from characters')).toHaveLength(0);
  });

  it('Assimilador não enxerga fichas antes de vinculadas', async () => {
    expect(await as(A, 'select id from characters')).toHaveLength(0);
  });

  it('código inválido é recusado', async () => {
    const r = await as<{ r: { ok: boolean; error: string } }>(B, `select join_table($1, 'ZZZZZZZZ') as r`, [CH_B]);
    expect(r[0].r).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('jogador vincula a própria ficha com o código; Assimilador passa a lê-la', async () => {
    const r = await as<{ r: { ok: boolean; table_id: string } }>(B, 'select join_table($1, $2) as r', [CH_B, code.toLowerCase()]);
    expect(r[0].r).toMatchObject({ ok: true, table_id: tableId });
    expect(await as<{ name: string }>(A, 'select name from characters')).toEqual([{ name: 'Joaquin' }]);
  });

  it('Assimilador não consegue editar nem apagar a ficha do jogador', async () => {
    expect(await asFails(A, 'select push_character($1, $2::jsonb, 1, 1, $3)', [CH_B, data(CH_B, 'Adulterada'), SECRET_B])).toMatch(/forbidden/);
    expect(await asFails(A, `update characters set name = 'x'`)).toMatch(/permission denied/);
    await as(A, 'select delete_character($1)', [CH_B]);
    expect(await as(B, 'select name from characters')).toEqual([{ name: 'Joaquin' }]);
  });

  it('alterações do jogador aparecem para o Assimilador', async () => {
    expect(await push(B, CH_B, 'Joaquin', 1, SECRET_B, false, { damage: 3 })).toMatchObject({ status: 'ok', rev: 2 });
    const [row] = await as<{ data: { damage: number }; rev: number }>(A, 'select data, rev from characters');
    expect(row.data.damage).toBe(3);
    expect(row.rev).toBe(2);
  });

  it('o jogador não consegue trocar a mesa da ficha por conta própria', async () => {
    expect(await asFails(B, `update characters set table_id = null`)).toMatch(/permission denied/);
  });

  it('atualização com revisão antiga devolve conflito sem sobrescrever', async () => {
    const r = await push(B, CH_B, 'Versão velha', 1);
    expect(r.status).toBe('conflict');
    expect((r.data as { name: string }).name).toBe('Joaquin');
    expect(await push(B, CH_B, 'Forçada', 1, SECRET_B, true)).toMatchObject({ status: 'ok', rev: 3 });
  });

  it('rejeita dados inválidos', async () => {
    expect(await asFails(B, 'select push_character($1, $2::jsonb, 3, 1, $3)', [CH_B, `{"id":"outra"}`, SECRET_B])).toMatch(/invalid_data/);
    expect(await asFails(C, 'select push_character($1, $2::jsonb, 0, 1, $3)', [CH_C, data(CH_C, 'x'), 'curto'])).toMatch(/invalid_secret/);
  });

  it('outro Assimilador não vê fichas de uma mesa que não é dele', async () => {
    await as(C, `select create_table('Outra')`);
    expect(await as(C, 'select id from characters')).toHaveLength(0);
  });
});

describe('revogação e recuperação', () => {
  it('Assimilador remove a ficha da mesa e perde a leitura', async () => {
    await as(A, 'select kick_character($1)', [CH_B]);
    expect(await as(A, 'select id from characters')).toHaveLength(0);
    expect(await as(B, 'select id from characters')).toHaveLength(1);
  });

  it('outro Assimilador não consegue remover fichas de mesa alheia', async () => {
    await as(B, 'select join_table($1, $2)', [CH_B, code]);
    expect(await asFails(C, 'select kick_character($1)', [CH_B])).toMatch(/forbidden/);
  });

  it('segredo errado não recupera a ficha; correto transfere e revoga o aparelho antigo', async () => {
    expect(await as(D, 'select claim_character($1, $2) as r', [CH_B, 'errado'])).toEqual([{ r: { ok: false, error: 'invalid_credentials' } }]);
    expect(await as(D, 'select id from characters')).toHaveLength(0);
    expect(await as(D, 'select claim_character($1, $2) as r', [CH_B, SECRET_B])).toEqual([{ r: { ok: true, rev: 3 } }]);
    expect(await as(D, 'select id from characters')).toHaveLength(1);
    expect(await as(B, 'select id from characters')).toHaveLength(0);
    expect(await asFails(B, 'select push_character($1, $2::jsonb, 3, 1, $3)', [CH_B, data(CH_B, 'x'), SECRET_B])).toMatch(/forbidden/);
  });

  it('recuperação de mesa exige a chave correta', async () => {
    expect(await as(D, 'select recover_table($1, $2) as r', [code, 'chave-errada'])).toEqual([{ r: { ok: false, error: 'invalid_credentials' } }]);
    expect(await as(D, 'select id from tables')).toHaveLength(0);
    const [ok] = await as<{ r: { ok: boolean } }>(D, 'select recover_table($1, $2) as r', [code, recoveryKey]);
    expect(ok.r.ok).toBe(true);
    expect(await as(D, 'select id from tables')).toHaveLength(1);
    expect(await as(A, 'select id from tables')).toHaveLength(0);
  });

  it('girar o código invalida o antigo', async () => {
    const newCode = (await as<{ c: string }>(D, 'select rotate_table_code($1) as c', [tableId]))[0].c;
    expect(newCode).not.toBe(code);
    expect(await asFails(A, 'select rotate_table_code($1)', [tableId])).toMatch(/forbidden/);
    const r = await as<{ r: { error: string } }>(B, 'select join_table($1, $2) as r', [CH_B, code]);
    expect(r[0].r.error).toBe('invalid_code');
  });
});

describe('limite de tentativas', () => {
  it('bloqueia o aparelho após muitas tentativas erradas', async () => {
    const E = '00000000-0000-4000-8000-00000000000e';
    for (let i = 0; i < 8; i++) await as(E, `select join_table($1, 'AAAAAAAA')`, [CH_B]);
    expect(await asFails(E, `select join_table($1, 'AAAAAAAA')`, [CH_B])).toMatch(/too_many_attempts/);
  });
});
