-- Assimilação RPG — fichas sincronizadas por mesa.
--
-- ISOLAMENTO (projeto Supabase compartilhado com o Rastreador D&D)
--  * Esta migration é ADITIVA: cria somente o schema `assimilacao` e objetos dentro dele.
--  * Não cria nada em `public`, não altera `auth`/`storage`/`public`, não cria roles, extensões,
--    publicações Realtime nem altera configurações globais. Não contém DROP/TRUNCATE/ALTER de objetos existentes.
--  * Não depende de nenhum objeto de `public` (nem de pgcrypto): só usa funções nativas (`pg_catalog`)
--    e `auth.uid()` (somente leitura do JWT). Todas as funções fixam `search_path = pg_catalog, assimilacao, pg_temp`.
--  * Realtime e exposição do schema na API são passos MANUAIS e globais: ver supabase/optional/ e README.
--
-- MODELO DE SEGURANÇA
--  * Cada aparelho usa autenticação ANÔNIMA do Supabase; auth.uid() identifica o aparelho.
--  * O código da mesa NÃO é credencial de edição: só vincula uma ficha própria à mesa (join_table).
--  * Nenhuma tabela aceita INSERT/UPDATE/DELETE direto do cliente; toda escrita passa por funções
--    SECURITY DEFINER que validam o dono no servidor. Assimilador e dono leem; só o dono escreve.
--  * Segredos de recuperação ficam em tabela sem grants (só hash) e nunca dentro do JSON da ficha.
--  * Tentativas erradas de código são limitadas por aparelho E globalmente (identidades anônimas são baratas).

create schema if not exists assimilacao;

create table assimilacao.tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  gm_id uuid not null,
  created_at timestamptz not null default now()
);

create table assimilacao.characters (
  id uuid primary key,
  owner_id uuid not null,
  table_id uuid references assimilacao.tables (id) on delete set null,
  name text not null default '',
  data jsonb not null,
  rev integer not null default 1,
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on assimilacao.characters (owner_id);
create index characters_table_idx on assimilacao.characters (table_id);

-- Hashes de recuperação. Sem grants e sem policies: inacessível ao cliente.
create table assimilacao.secrets (
  kind text not null check (kind in ('table', 'character')),
  ref uuid not null,
  hash text not null,
  primary key (kind, ref)
);

create table assimilacao.attempts (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index attempts_user_idx on assimilacao.attempts (user_id, kind, at desc);
create index attempts_kind_idx on assimilacao.attempts (kind, at desc);

alter table assimilacao.tables enable row level security;
alter table assimilacao.characters enable row level security;
alter table assimilacao.secrets enable row level security;
alter table assimilacao.attempts enable row level security;

-- Somente leitura direta. (Sem policies de escrita = escrita negada.)
create policy tables_select_gm on assimilacao.tables for select to authenticated
  using (gm_id = auth.uid());

create policy characters_select_owner on assimilacao.characters for select to authenticated
  using (owner_id = auth.uid());

create policy characters_select_gm on assimilacao.characters for select to authenticated
  using (table_id is not null and exists (
    select 1 from assimilacao.tables t where t.id = characters.table_id and t.gm_id = auth.uid()
  ));

-- Permissões explícitas: nada herdado de privilégios padrão do projeto.
revoke all on schema assimilacao from public, anon;
grant usage on schema assimilacao to authenticated;
revoke all on all tables in schema assimilacao from public, anon, authenticated;
revoke all on all sequences in schema assimilacao from public, anon, authenticated;
grant select on assimilacao.tables, assimilacao.characters to authenticated;

-- ------------------------------------------------------------------ helpers (puros, sem pgcrypto)
create function assimilacao.sha256_hex(p text) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- n caracteres hexadecimais aleatórios (gen_random_uuid usa o gerador criptográfico do servidor;
-- removemos os nibbles fixos de versão/variante do UUID v4). n <= 30.
create function assimilacao.random_hex(n int) returns text
language sql volatile set search_path = pg_catalog, pg_temp
as $$
  select substr(
    overlay(overlay(replace(gen_random_uuid()::text, '-', '') placing '' from 17 for 1) placing '' from 13 for 1),
    1, n)
$$;

-- Código de convite de 8 caracteres sem ambiguidade (sem 0/O/1/I).
create function assimilacao.random_code() returns text
language plpgsql volatile set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  h text := assimilacao.random_hex(16);
  out text := '';
begin
  for i in 0 .. 7 loop
    out := out || substr(alphabet, (('x' || substr(h, i * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
  end loop;
  return out;
end $$;

-- Lança exceção se o aparelho (ou o conjunto de todos) errou demais nos últimos 10 minutos.
create function assimilacao.guard_attempts(p_kind text) returns void
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); mine int; everyone int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from assimilacao.attempts where at < now() - interval '1 day';
  select count(*) into mine from assimilacao.attempts
    where user_id = uid and kind = p_kind and not ok and at > now() - interval '10 minutes';
  if mine >= 8 then raise exception 'too_many_attempts' using errcode = '54000'; end if;
  -- Limite global: criar novas identidades anônimas não deve permitir força bruta ilimitada.
  select count(*) into everyone from assimilacao.attempts
    where kind = p_kind and not ok and at > now() - interval '10 minutes';
  if everyone >= 300 then raise exception 'too_many_attempts' using errcode = '54000'; end if;
end $$;

-- ------------------------------------------------------------------ mesas (Assimilador)
create function assimilacao.create_table(p_name text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); v_code text; v_key text; v_id uuid; n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'invalid_data' using errcode = '22023'; end if;
  select count(*) into n from assimilacao.tables where gm_id = uid;
  if n >= 5 then raise exception 'too_many_tables' using errcode = '54000'; end if;
  loop
    v_code := assimilacao.random_code();
    exit when not exists (select 1 from assimilacao.tables where code = v_code);
  end loop;
  v_key := assimilacao.random_hex(24);
  insert into assimilacao.tables (code, name, gm_id) values (v_code, left(btrim(p_name), 80), uid) returning id into v_id;
  insert into assimilacao.secrets (kind, ref, hash) values ('table', v_id, assimilacao.sha256_hex(v_key));
  return jsonb_build_object('id', v_id, 'code', v_code, 'recovery_key', v_key);
end $$;

create function assimilacao.rotate_table_code(p_table_id uuid) returns text
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare v_code text;
begin
  if not exists (select 1 from assimilacao.tables where id = p_table_id and gm_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  loop
    v_code := assimilacao.random_code();
    exit when not exists (select 1 from assimilacao.tables where code = v_code);
  end loop;
  update assimilacao.tables set code = v_code where id = p_table_id;
  return v_code;
end $$;

create function assimilacao.delete_table(p_table_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
begin
  delete from assimilacao.tables where id = p_table_id and gm_id = auth.uid();
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from assimilacao.secrets where kind = 'table' and ref = p_table_id;
end $$;

-- Recupera uma mesa em aparelho novo usando código + chave de recuperação.
create function assimilacao.recover_table(p_code text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); t assimilacao.tables;
begin
  perform assimilacao.guard_attempts('recover_table');
  select t2.* into t from assimilacao.tables t2
    join assimilacao.secrets s on s.kind = 'table' and s.ref = t2.id
   where t2.code = upper(btrim(p_code)) and s.hash = assimilacao.sha256_hex(btrim(p_key));
  if not found then
    insert into assimilacao.attempts (user_id, kind, ok) values (uid, 'recover_table', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;
  update assimilacao.tables set gm_id = uid where id = t.id;
  return jsonb_build_object('ok', true, 'id', t.id, 'name', t.name, 'code', t.code);
end $$;

-- O Assimilador remove uma ficha da sua mesa (revoga a leitura).
create function assimilacao.kick_character(p_character_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
begin
  update assimilacao.characters set table_id = null
   where id = p_character_id
     and table_id in (select id from assimilacao.tables where gm_id = auth.uid());
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ------------------------------------------------------------------ fichas (Infectado)
-- O segredo de recuperação NUNCA é armazenado no JSON (o Assimilador lê o JSON): é removido aqui.
create function assimilacao.push_character(
  p_id uuid, p_data jsonb, p_base_rev int, p_client_updated_at bigint, p_secret text, p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); cur assimilacao.characters; new_rev int; clean jsonb; n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 200000 then
    raise exception 'invalid_data' using errcode = '22023';
  end if;
  if p_data->>'id' is distinct from p_id::text then raise exception 'invalid_data' using errcode = '22023'; end if;
  clean := p_data - 'recoverySecret';

  select * into cur from assimilacao.characters where id = p_id for update;
  if not found then
    if length(coalesce(p_secret, '')) < 16 then raise exception 'invalid_secret' using errcode = '22023'; end if;
    select count(*) into n from assimilacao.characters where owner_id = uid;
    if n >= 50 then raise exception 'too_many_characters' using errcode = '54000'; end if;
    insert into assimilacao.characters (id, owner_id, name, data, client_updated_at)
      values (p_id, uid, left(coalesce(clean->>'name', ''), 120), clean, p_client_updated_at);
    insert into assimilacao.secrets (kind, ref, hash) values ('character', p_id, assimilacao.sha256_hex(p_secret));
    return jsonb_build_object('status', 'ok', 'rev', 1);
  end if;

  if cur.owner_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;

  if cur.rev <> p_base_rev and not p_force then
    return jsonb_build_object('status', 'conflict', 'rev', cur.rev, 'data', cur.data,
                              'client_updated_at', cur.client_updated_at);
  end if;

  new_rev := cur.rev + 1;
  update assimilacao.characters
     set data = clean, name = left(coalesce(clean->>'name', ''), 120), rev = new_rev,
         client_updated_at = p_client_updated_at, updated_at = now()
   where id = p_id;
  return jsonb_build_object('status', 'ok', 'rev', new_rev);
end $$;

create function assimilacao.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
begin
  delete from assimilacao.characters where id = p_id and owner_id = auth.uid();
  if found then delete from assimilacao.secrets where kind = 'character' and ref = p_id; end if;
end $$;

-- Vincula uma ficha PRÓPRIA a uma mesa usando o código. Não dá acesso de edição a ninguém.
create function assimilacao.join_table(p_character_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); t assimilacao.tables;
begin
  perform assimilacao.guard_attempts('join_table');
  select * into t from assimilacao.tables where code = upper(btrim(p_code));
  if not found then
    insert into assimilacao.attempts (user_id, kind, ok) values (uid, 'join_table', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  update assimilacao.characters set table_id = t.id where id = p_character_id and owner_id = uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'character_not_synced'); end if;
  return jsonb_build_object('ok', true, 'table_id', t.id, 'table_name', t.name);
end $$;

create function assimilacao.leave_table(p_character_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
begin
  update assimilacao.characters set table_id = null where id = p_character_id and owner_id = auth.uid();
end $$;

-- Recupera a propriedade de uma ficha em aparelho novo (o backup JSON contém o segredo). Revoga o aparelho antigo.
create function assimilacao.claim_character(p_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, assimilacao, pg_temp
as $$
declare uid uuid := auth.uid(); cur assimilacao.characters;
begin
  perform assimilacao.guard_attempts('claim_character');
  select c.* into cur from assimilacao.characters c
    join assimilacao.secrets s on s.kind = 'character' and s.ref = c.id
   where c.id = p_id and s.hash = assimilacao.sha256_hex(btrim(p_secret)) for update of c;
  if not found then
    insert into assimilacao.attempts (user_id, kind, ok) values (uid, 'claim_character', false);
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;
  update assimilacao.characters set owner_id = uid where id = p_id;
  return jsonb_build_object('ok', true, 'rev', cur.rev);
end $$;

-- ------------------------------------------------------------------ permissões de execução
-- Funções nascem executáveis por PUBLIC: revoga tudo e concede só o necessário a `authenticated`.
revoke all on all functions in schema assimilacao from public, anon, authenticated;
grant execute on function
  assimilacao.create_table(text), assimilacao.rotate_table_code(uuid), assimilacao.delete_table(uuid),
  assimilacao.recover_table(text, text), assimilacao.kick_character(uuid),
  assimilacao.push_character(uuid, jsonb, int, bigint, text, boolean), assimilacao.delete_character(uuid),
  assimilacao.join_table(uuid, text), assimilacao.leave_table(uuid), assimilacao.claim_character(uuid, text)
  to authenticated;
-- (guard_attempts, sha256_hex, random_hex e random_code são internas: sem EXECUTE para clientes.)
