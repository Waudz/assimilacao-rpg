// @vitest-environment node
// Prova que o Assimilação RPG não depende de objetos do Rastreador D&D (schema public), não os altera
// e que o isolamento vem de permissões/RLS — não só de nomes de schema.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEnv, MIGRATION, runAs, snapshot, type Env } from './pg-harness';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const CH = '10000000-0000-4000-8000-0000000000b1';
const SECRET = 'b'.repeat(32);

let env: Env;
const as = <T = Record<string, unknown>>(uid: string | 'anon', sql: string, params: unknown[] = []) => runAs<T>(env.db, uid, sql, params);
const fails = (uid: string | 'anon', sql: string, params: unknown[] = []) =>
  as(uid, sql, params).then(
    () => null,
    (e: Error) => e.message,
  );
const doc = (name: string, extra: object = {}) => JSON.stringify({ id: CH, name, schema: 2, ...extra });

beforeAll(async () => {
  env = await createEnv();
});

describe('isolamento do Rastreador D&D (schema public)', () => {
  it('a migration não alterou objetos, ACLs, policies, triggers, defaults, roles, extensões, publicações nem dados fora de `assimilacao`', async () => {
    expect(await snapshot(env.db)).toBe(env.before);
  });

  it('o SQL é aditivo: sem DROP/TRUNCATE/ALTER globais, sem `public`, tudo qualificado', () => {
    const sql = MIGRATION.replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/public\./i);
    expect(sql).not.toMatch(/\b(drop|truncate)\b/i);
    expect(sql).not.toMatch(/\balter\s+(publication|extension|role|system|database|default)/i);
    expect(sql).not.toMatch(/\bcreate\s+(extension|role|publication|trigger|type|domain)\b/i);
    for (const m of sql.matchAll(/\bcreate\s+(?:unique\s+)?(table|function|schema)\s+(?:if not exists\s+)?(\S+)/gi)) expect(m[2], m[0]).toMatch(/^assimilacao(\.|$|;)/);
    for (const m of sql.matchAll(/\balter\s+table\s+(\S+)/gi)) expect(m[1]).toMatch(/^assimilacao\./);
    for (const m of sql.matchAll(/\bcreate\s+policy\s+\w+\s+on\s+(\S+)/gi)) expect(m[1]).toMatch(/^assimilacao\./);
    for (const m of sql.matchAll(/\bcreate\s+(?:unique\s+)?index\s+\w+\s+on\s+(\S+)/gi)) expect(m[1]).toMatch(/^assimilacao\./);
    // `revoke/grant` só em objetos do schema (ou no próprio schema)
    for (const m of sql.matchAll(/\b(?:revoke|grant)\b[^;]*?\b(?:on|in)\s+(?:all\s+\w+\s+in\s+)?(?:schema\s+|table\s+|function\s+)?(\S+)/gi)) expect(m[0]).toMatch(/assimilacao/);
  });

  it('todas as funções fixam search_path sem `public`', async () => {
    const rows = (
      await env.db.query<{ proname: string; cfg: string | null }>(
        `select p.proname, array_to_string(p.proconfig, ',') as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'assimilacao'`,
      )
    ).rows;
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const r of rows) {
      expect(r.cfg, r.proname).toMatch(/search_path=pg_catalog/);
      expect(r.cfg, r.proname).not.toMatch(/\bpublic\b/);
    }
  });

  it('funciona com objetos homônimos em `public` (sha256_hex/random_code/gen_random_uuid falsos): usa os próprios', async () => {
    const t = (await as<{ r: { code: string; recovery_key: string } }>(A, `select assimilacao.create_table('Mesa') as r`))[0].r;
    expect(t.code).not.toBe('DECOY123');
    expect(t.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(t.recovery_key).toMatch(/^[0-9a-f]{24}$/);
    expect(t.recovery_key).not.toContain('DECOY');
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add((await as<{ r: { id: string } }>(B, `select assimilacao.create_table('M${i}') as r`))[0].r.id);
    expect(ids.size).toBe(5); // gen_random_uuid real (o falso devolveria sempre o mesmo)
  });

  it('funciona mesmo sem o schema public (nenhuma dependência oculta)', async () => {
    const solo = new PGlite();
    await solo.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      drop schema public cascade;
    `);
    await solo.exec(MIGRATION);
    const [row] = await runAs<{ r: { code: string } }>(solo, A, `select assimilacao.create_table('X') as r`);
    expect(row.r.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const [p] = await runAs<{ r: { status: string } }>(solo, A, `select assimilacao.push_character($1, $2::jsonb, 0, 1, $3) as r`, [CH, doc('Solo'), SECRET]);
    expect(p.r.status).toBe('ok');
  });
});

describe('o app não consegue ler nem modificar dados fora de `assimilacao`', () => {
  it('nenhuma função da API toca em tabelas de public (dados e catálogo idênticos após exercitá-las)', async () => {
    const t = (await as<{ r: { id: string; code: string } }>(A, `select assimilacao.create_table('Exerc') as r`))[0].r;
    await as(B, `select assimilacao.push_character($1, $2::jsonb, 0, 1, $3)`, [CH, doc('X'), SECRET]);
    await as(B, `select assimilacao.join_table($1, $2)`, [CH, t.code]);
    await as(B, `select assimilacao.push_character($1, $2::jsonb, 1, 2, $3)`, [CH, doc('Y'), SECRET]);
    await as(A, `select assimilacao.kick_character($1)`, [CH]);
    await as(B, `select assimilacao.join_table($1, $2)`, [CH, t.code]);
    await as(B, `select assimilacao.leave_table($1)`, [CH]);
    await as(A, `select assimilacao.rotate_table_code($1)`, [t.id]);
    await as(B, `select assimilacao.claim_character($1, $2)`, [CH, SECRET]);
    await as(A, `select assimilacao.recover_table('AAAAAAAA', 'x')`);
    await as(B, `select assimilacao.delete_character($1)`, [CH]);
    await as(A, `select assimilacao.delete_table($1)`, [t.id]);
    expect(await snapshot(env.db)).toBe(env.before);
    expect((await env.db.query(`select * from public.characters`)).rows).toHaveLength(1);
  });

  it('as tabelas do Assimilação não são alcançáveis pelas permissões/policies do Rastreador (e vice-versa)', async () => {
    // O decoy dá `all` + policy permissiva em public.characters a `authenticated`; isso não vaza para assimilacao.characters.
    expect(await as(B, 'select id from public.characters')).toHaveLength(1); // comportamento preexistente do Rastreador
    expect(await as(B, 'select id from assimilacao.characters')).toHaveLength(0); // dado de outra pessoa: invisível
    expect(await fails(B, `insert into assimilacao.characters (id, owner_id, data) values (gen_random_uuid(), '${B}', '{}')`)).toMatch(/permission denied/);
    expect(await fails(B, `update assimilacao.tables set name = 'x'`)).toMatch(/permission denied/);
  });

  it('`anon` não acessa nada do schema', async () => {
    expect(await fails('anon', 'select * from assimilacao.characters')).toMatch(/permission denied/);
    expect(await fails('anon', `select assimilacao.create_table('x')`)).toMatch(/permission denied/);
  });

  it('privilégios exatos: authenticated lê tables/characters e executa somente as 10 funções da API', async () => {
    const q = async (sql: string) => (await env.db.query<{ ok: boolean }>(sql)).rows[0].ok;
    for (const t of ['characters', 'tables']) expect(await q(`select has_table_privilege('authenticated','assimilacao.${t}','select') as ok`)).toBe(true);
    for (const t of ['characters', 'tables', 'secrets', 'attempts'])
      for (const priv of ['insert', 'update', 'delete', 'truncate'])
        expect(await q(`select has_table_privilege('authenticated','assimilacao.${t}','${priv}') as ok`), `${t} ${priv}`).toBe(false);
    for (const t of ['secrets', 'attempts']) expect(await q(`select has_table_privilege('authenticated','assimilacao.${t}','select') as ok`)).toBe(false);
    expect(await q(`select has_sequence_privilege('authenticated','assimilacao.attempts_id_seq','usage') as ok`)).toBe(false);
    const fns = (
      await env.db.query<{ proname: string; ok: boolean; anon: boolean; pub: boolean }>(
        `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as ok, has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('public', p.oid, 'execute') as pub
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'assimilacao'`,
      )
    ).rows;
    const api = ['create_table', 'rotate_table_code', 'delete_table', 'recover_table', 'kick_character', 'push_character', 'delete_character', 'join_table', 'leave_table', 'claim_character'];
    expect(fns.filter((f) => f.ok).map((f) => f.proname).sort()).toEqual([...api].sort());
    expect(fns.some((f) => f.anon || f.pub)).toBe(false);
  });
});

describe('segredos, força bruta e limites', () => {
  it('o segredo de recuperação nunca fica no JSON legível pelo Assimilador', async () => {
    const id = '10000000-0000-4000-8000-0000000000aa';
    const secret = 'z'.repeat(32);
    const d = (rev: number) => as(B, `select assimilacao.push_character($1, $2::jsonb, $3, 1, $4)`, [id, JSON.stringify({ id, name: 'S', recoverySecret: secret }), rev, secret]);
    await d(0);
    await d(1);
    const [row] = await as<{ data: Record<string, unknown> }>(B, 'select data from assimilacao.characters where id = $1', [id]);
    expect(row.data).not.toHaveProperty('recoverySecret');
    expect(JSON.stringify(row.data)).not.toContain(secret);
    // e o hash guardado separadamente continua permitindo recuperar
    expect((await as<{ r: { ok: boolean } }>('00000000-0000-4000-8000-0000000000c1', `select assimilacao.claim_character($1, $2) as r`, [id, secret]))[0].r.ok).toBe(true);
  });

  it('limita fichas por aparelho', async () => {
    const F = '00000000-0000-4000-8000-0000000000f0';
    const mk = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    for (let i = 0; i < 50; i++) await as(F, 'select assimilacao.push_character($1, $2::jsonb, 0, 1, $3)', [mk(i), JSON.stringify({ id: mk(i), name: 'n' }), 'f'.repeat(32)]);
    expect(await fails(F, 'select assimilacao.push_character($1, $2::jsonb, 0, 1, $3)', [mk(99), JSON.stringify({ id: mk(99), name: 'x' }), 'f'.repeat(32)])).toMatch(/too_many_characters/);
  });

  it('força bruta com identidades anônimas novas é barrada pelo limite global', async () => {
    await env.db.exec(`delete from assimilacao.attempts`);
    for (let i = 0; i < 300; i++) await env.db.exec(`insert into assimilacao.attempts (user_id, kind, ok) values (gen_random_uuid(), 'join_table', false)`);
    expect(await fails('00000000-0000-4000-8000-0000000000e1', `select assimilacao.join_table($1, 'AAAAAAAA')`, [CH])).toMatch(/too_many_attempts/);
    await env.db.exec(`delete from assimilacao.attempts`);
  });

  it('os códigos têm entropia e formato esperados (sem colisão em amostra de 200)', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = (await env.db.query<{ c: string }>(`select assimilacao.random_code() as c`)).rows[0].c;
      expect(r).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      codes.add(r);
    }
    expect(codes.size).toBe(200);
    const letters = new Set([...codes].join(''));
    expect(letters.size).toBeGreaterThan(25); // distribuição cobre o alfabeto
  });

  it('estado final: Rastreador intacto após toda a suíte', async () => {
    expect(await snapshot(env.db)).toBe(env.before);
  });
});
