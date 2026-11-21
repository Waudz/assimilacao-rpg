-- Assimilação RPG — fichas sincronizadas por mesa.
--
-- Modelo de segurança
--  * Cada aparelho entra com autenticação ANÔNIMA do Supabase (sem cadastro visível); auth.uid() identifica o aparelho.
--  * O código da mesa NÃO é credencial de edição: serve só para vincular uma ficha própria à mesa (join_table).
--  * Nenhuma tabela aceita INSERT/UPDATE/DELETE direto do cliente. Toda escrita passa por funções SECURITY DEFINER
--    que validam o dono no servidor.
--  * O Assimilador (gm_id da mesa) e o dono da ficha podem LER; só o dono escreve.
--  * Tentativas de código errado são limitadas por aparelho (join_attempts).

create extension if not exists pgcrypto;

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  gm_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key,
  owner_id uuid not null,
  table_id uuid references public.tables (id) on delete set null,
  name text not null default '',
  data jsonb not null,
  rev integer not null default 1,
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on public.characters (owner_id);
create index characters_table_idx on public.characters (table_id);

-- Segredos de recuperação (hash). Sem grants e sem policies: inacessível ao cliente.
create table public.secrets (
  kind text not null check (kind in ('table', 'character')),
  ref uuid not null,
  hash text not null,
  primary key (kind, ref)
);

create table public.attempts (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index attempts_user_idx on public.attempts (user_id, kind, at desc);

alter table public.tables enable row level security;
alter table public.characters enable row level security;
alter table public.attempts enable row level security;
alter table public.secrets enable row level security;

-- Somente leitura direta. (Sem policies de escrita = escrita negada.)
create policy tables_select_gm on public.tables for select to authenticated
  using (gm_id = auth.uid());

create policy characters_select_owner on public.characters for select to authenticated
  using (owner_id = auth.uid());

create policy characters_select_gm on public.characters for select to authenticated
  using (table_id is not null and exists (
    select 1 from public.tables t where t.id = characters.table_id and t.gm_id = auth.uid()
  ));

revoke all on public.tables, public.characters, public.attempts, public.secrets from anon, authenticated;
grant select on public.tables, public.characters to authenticated;

-- ------------------------------------------------------------------ helpers
create or replace function public.sha256_hex(p text) returns text
language sql immutable as $$ select encode(digest(p, 'sha256'), 'hex') $$;

create or replace function public.random_code(p_len int) returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O/1/I
  bytes bytea := gen_random_bytes(p_len);
  out text := '';
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

-- Lança exceção se o aparelho errou demais nos últimos 10 minutos.
create or replace function public.guard_attempts(p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); failures int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from attempts where at < now() - interval '1 day';
  select count(*) into failures from attempts
    where user_id = uid and kind = p_kind and not ok and at > now() - interval '10 minutes';
  if failures >= 8 then raise exception 'too_many_attempts' using errcode = '54000'; end if;
end $$;

-- ------------------------------------------------------------------ mesas (Assimilador)
create or replace function public.create_table(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_code text; v_key text; v_id uuid; n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select count(*) into n from tables where gm_id = uid;
  if n >= 5 then raise exception 'too_many_tables' using errcode = '54000'; end if;
  loop
    v_code := random_code(8);
    exit when not exists (select 1 from tables where code = v_code);
  end loop;
  v_key := encode(gen_random_bytes(12), 'hex');
  insert into tables (code, name, gm_id) values (v_code, left(btrim(p_name), 80), uid) returning id into v_id;
  insert into secrets (kind, ref, hash) values ('table', v_id, sha256_hex(v_key));
  return jsonb_build_object('id', v_id, 'code', v_code, 'recovery_key', v_key);
end $$;

create or replace function public.rotate_table_code(p_table_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text;
begin
  if not exists (select 1 from tables where id = p_table_id and gm_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  loop
    v_code := random_code(8);
    exit when not exists (select 1 from tables where code = v_code);
  end loop;
  update tables set code = v_code where id = p_table_id;
  return v_code;
end $$;

create or replace function public.delete_table(p_table_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from tables where id = p_table_id and gm_id = auth.uid();
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from secrets where kind = 'table' and ref = p_table_id;
end $$;

-- Recupera uma mesa em um aparelho novo usando o código + chave de recuperação.
create or replace function public.recover_table(p_code text, p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t tables;
begin
  perform guard_attempts('recover_table');
  select t2.* into t from tables t2 join secrets s on s.kind = 'table' and s.ref = t2.id
   where t2.code = upper(btrim(p_code)) and s.hash = sha256_hex(btrim(p_key));
  if not found then
    insert into attempts (user_id, kind, ok) values (uid, 'recover_table', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;
  update tables set gm_id = uid where id = t.id;
  return jsonb_build_object('ok', true, 'id', t.id, 'name', t.name, 'code', t.code);
end $$;

-- O Assimilador remove uma ficha da sua mesa (revoga o acesso de leitura).
create or replace function public.kick_character(p_character_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update characters set table_id = null
   where id = p_character_id
     and table_id in (select id from tables where gm_id = auth.uid());
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ------------------------------------------------------------------ fichas (Infectado)
create or replace function public.push_character(
  p_id uuid, p_data jsonb, p_base_rev int, p_client_updated_at bigint, p_secret text, p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur characters; new_rev int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 200000 then
    raise exception 'invalid_data' using errcode = '22023';
  end if;
  if p_data->>'id' is distinct from p_id::text then raise exception 'invalid_data' using errcode = '22023'; end if;

  select * into cur from characters where id = p_id for update;
  if not found then
    if length(coalesce(p_secret, '')) < 16 then raise exception 'invalid_secret' using errcode = '22023'; end if;
    insert into characters (id, owner_id, name, data, client_updated_at)
      values (p_id, uid, left(coalesce(p_data->>'name', ''), 120), p_data, p_client_updated_at);
    insert into secrets (kind, ref, hash) values ('character', p_id, sha256_hex(p_secret));
    return jsonb_build_object('status', 'ok', 'rev', 1);
  end if;

  if cur.owner_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;

  if cur.rev <> p_base_rev and not p_force then
    return jsonb_build_object('status', 'conflict', 'rev', cur.rev, 'data', cur.data,
                              'client_updated_at', cur.client_updated_at);
  end if;

  new_rev := cur.rev + 1;
  update characters
     set data = p_data, name = left(coalesce(p_data->>'name', ''), 120), rev = new_rev,
         client_updated_at = p_client_updated_at, updated_at = now()
   where id = p_id;
  return jsonb_build_object('status', 'ok', 'rev', new_rev);
end $$;

create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from characters where id = p_id and owner_id = auth.uid();
  if found then delete from secrets where kind = 'character' and ref = p_id; end if;
end $$;

-- Vincula uma ficha PRÓPRIA a uma mesa usando o código. Não dá acesso de edição a ninguém.
create or replace function public.join_table(p_character_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t tables;
begin
  perform guard_attempts('join_table');
  select * into t from tables where code = upper(btrim(p_code));
  if not found then
    insert into attempts (user_id, kind, ok) values (uid, 'join_table', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  update characters set table_id = t.id where id = p_character_id and owner_id = uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'character_not_synced'); end if;
  return jsonb_build_object('ok', true, 'table_id', t.id, 'table_name', t.name);
end $$;

create or replace function public.leave_table(p_character_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update characters set table_id = null where id = p_character_id and owner_id = auth.uid();
end $$;

-- Recupera a propriedade de uma ficha em aparelho novo (backup JSON contém o segredo). Revoga o aparelho antigo.
create or replace function public.claim_character(p_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur characters;
begin
  perform guard_attempts('claim_character');
  select c.* into cur from characters c join secrets s on s.kind = 'character' and s.ref = c.id
   where c.id = p_id and s.hash = sha256_hex(btrim(p_secret)) for update of c;
  if not found then
    insert into attempts (user_id, kind, ok) values (uid, 'claim_character', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;
  update characters set owner_id = uid where id = p_id;
  return jsonb_build_object('ok', true, 'rev', cur.rev);
end $$;

-- ------------------------------------------------------------------ permissões de execução
revoke all on function public.create_table(text), public.rotate_table_code(uuid), public.delete_table(uuid),
  public.recover_table(text, text), public.kick_character(uuid),
  public.push_character(uuid, jsonb, int, bigint, text, boolean), public.delete_character(uuid),
  public.join_table(uuid, text), public.leave_table(uuid), public.claim_character(uuid, text),
  public.guard_attempts(text), public.sha256_hex(text), public.random_code(int)
  from public, anon;
grant execute on function public.create_table(text), public.rotate_table_code(uuid), public.delete_table(uuid),
  public.recover_table(text, text), public.kick_character(uuid),
  public.push_character(uuid, jsonb, int, bigint, text, boolean), public.delete_character(uuid),
  public.join_table(uuid, text), public.leave_table(uuid), public.claim_character(uuid, text)
  to authenticated;

-- Realtime (apenas em Supabase; ignorado onde não existe a publicação).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.characters;
  end if;
end $$;
