// Ambiente PostgreSQL (PGlite) que imita o projeto Supabase compartilhado: roles, auth.uid() e um schema `public`
// com os dados e objetos "do Rastreador D&D" (nomes propositalmente iguais aos nossos).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const MIGRATION_FILE = 'supabase/migrations/20261121120000_assimilacao_schema.sql';
export const MIGRATION = readFileSync(MIGRATION_FILE, 'utf-8');

const SUPABASE_BASE = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

/** Objetos homônimos aos do Assimilação, RLS permissiva e dados reais no schema `public`. */
const DECOY_RASTREADOR = `
  create table public.characters (id uuid primary key, owner text, data text);
  create table public.tables (id int primary key, name text);
  create table public.secrets (kind text, ref uuid, hash text);
  create table public.attempts (id int, note text);
  insert into public.characters values ('90000000-0000-4000-8000-000000000001', 'dm', 'ficha de D&D');
  insert into public.tables values (1, 'campanha real');
  insert into public.secrets values ('x', null, 'segredo do rastreador');
  alter table public.characters enable row level security;
  create policy rastreador_all on public.characters for all to authenticated using (true) with check (true);
  grant all on public.characters, public.tables, public.secrets, public.attempts to authenticated;
  create function public.sha256_hex(p text) returns text language sql as $$ select 'DECOY' $$;
  create function public.random_code() returns text language sql as $$ select 'DECOY123' $$;
  create function public.random_hex(n int) returns text language sql as $$ select 'DECOY' $$;
  create function public.gen_random_uuid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;
  create function public.push_character(uuid, jsonb, int, bigint, text, boolean) returns jsonb language sql as $$ select '{"decoy":true}'::jsonb $$;
  grant execute on all functions in schema public to anon, authenticated;
`;

export interface Env {
  db: PGlite;
  /** Foto do que não pertence a `assimilacao`, tirada ANTES da migration. */
  before: string;
}

export async function createEnv(): Promise<Env> {
  const db = new PGlite();
  await db.exec(SUPABASE_BASE);
  await db.exec(DECOY_RASTREADOR);
  const before = await snapshot(db);
  await db.exec(MIGRATION);
  return { db, before };
}

/** Foto de tudo que NÃO é de `assimilacao`: objetos, ACLs, policies, triggers, defaults, roles, extensões, publicações e dados. */
export async function snapshot(d: PGlite): Promise<string> {
  const notOurs = `n.nspname not in ('assimilacao','pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;
  const q = `
    select 'rel|' || n.nspname || '|' || c.relname || '|' || c.relkind::text || '|' || coalesce(c.relacl::text,'') || '|' || c.relrowsecurity::text as x
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where ${notOurs}
    union all select 'proc|' || n.nspname || '|' || p.proname || '|' || md5(p.prosrc) || '|' || coalesce(p.proacl::text,'') || '|' || coalesce(p.proconfig::text,'')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where ${notOurs}
    union all select 'policy|' || schemaname || '|' || tablename || '|' || policyname || '|' || coalesce(qual,'') || '|' || roles::text || '|' || cmd
      from pg_policies where schemaname <> 'assimilacao'
    union all select 'trigger|' || c.relname || '|' || t.tgname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and ${notOurs}
    union all select 'defacl|' || coalesce(n.nspname,'') || '|' || d.defaclrole::regrole::text || '|' || d.defaclobjtype::text || '|' || d.defaclacl::text
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    union all select 'schema|' || nspname || '|' || nspowner::regrole::text || '|' || coalesce(nspacl::text,'')
      from pg_namespace where nspname not like 'pg_%' and nspname not in ('assimilacao','information_schema')
    union all select 'role|' || rolname || '|' || rolsuper::text || '|' || rolcanlogin::text from pg_roles where rolname not like 'pg_%'
    union all select 'ext|' || extname || '|' || extversion from pg_extension
    union all select 'pub|' || pubname from pg_publication
    union all select 'rows|characters|' || coalesce(md5(string_agg(t::text, ',' order by t::text)), '') from public.characters t
    union all select 'rows|tables|' || coalesce(md5(string_agg(t::text, ',' order by t::text)), '') from public.tables t
    union all select 'rows|secrets|' || coalesce(md5(string_agg(t::text, ',' order by t::text)), '') from public.secrets t
    order by 1`;
  return (await d.query<{ x: string }>(q)).rows.map((r) => r.x).join('\n');
}

/** Executa SQL como usuário autenticado (role `authenticated` + auth.uid()) ou como `anon`. */
export async function runAs<T = Record<string, unknown>>(db: PGlite, uid: string | 'anon', sql: string, params: unknown[] = []) {
  let rows: T[] = [];
  await db.transaction(async (tx) => {
    if (uid === 'anon') await tx.exec('set local role anon');
    else await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    rows = (await tx.query<T>(sql, params)).rows;
  });
  return rows;
}
