# Supabase compartilhado com o Rastreador D&D

O Assimilação RPG usa o projeto Supabase **`rastreador-dnd`**, que já contém dados reais do Rastreador D&D. **Preservar esses dados é exigência absoluta.** O app usa exclusivamente o schema PostgreSQL **`assimilacao`**.

> Schemas não são bancos separados: o isolamento vem de **permissões, RLS e testes**, não do nome.

## O que o código garante (testado em `tests/isolation.test.ts`, `tests/rls.test.ts`, `tests/remote.test.ts`)

| Garantia | Como é comprovada |
|---|---|
| A migration é **aditiva**: só cria `assimilacao` e objetos dentro dele; sem `DROP`/`TRUNCATE`/`ALTER` de objetos existentes; sem criar roles, extensões, publicações ou triggers | Varredura estática do SQL + foto do catálogo antes/depois |
| Nada fora de `assimilacao` muda (objetos, ACLs, policies, triggers, default privileges, roles, extensões, publicações, **linhas de dados**) | Foto do catálogo e hash dos dados de um `public` simulado (com tabelas/funções de **mesmo nome** e RLS permissiva) idêntica antes, depois da migration e depois de exercitar todas as funções |
| Nenhuma dependência de `public`/pgcrypto | Funções usam só `pg_catalog` + `auth.uid()`; `search_path = pg_catalog, assimilacao, pg_temp`; o app roda com funções falsas homônimas em `public` e até **sem** o schema `public` |
| O cliente só fala com `assimilacao` | `createClient(..., { db: { schema: 'assimilacao' } })`; RPCs, consultas e Realtime verificados com cliente espiado |
| Escrita só pelo servidor | Sem policies de INSERT/UPDATE/DELETE; `authenticated` só tem `SELECT`; 10 funções `SECURITY DEFINER` validam o dono; `anon` e `PUBLIC` sem acesso |
| Segredo de recuperação não vaza | Só o hash fica em `assimilacao.secrets` (sem grants); o JSON da ficha lido pelo Assimilador **não** contém `recoverySecret` (removido no cliente e no servidor) |
| Força bruta de códigos | 8 tentativas erradas/10 min por aparelho **e** 300/10 min globais (identidades anônimas são baratas); código de 8 caracteres (32⁸ ≈ 10¹²) |

## Passos que dependem do projeto Supabase (NÃO executados pelo código)

Responsável: quem audita o projeto (ChatGPT / proprietário). Tudo abaixo é **configuração global** — conferir o impacto no Rastreador antes.

1. **Auditar o Rastreador** antes de qualquer mudança: listar schemas, tabelas, policies (principalmente as `TO authenticated`), funções, triggers e publicações Realtime. Fazer backup.
2. **Executar `supabase/migrations/20261121120000_assimilacao_schema.sql`** (aditiva). Conferir que nada novo apareceu fora de `assimilacao`.
3. **Expor o schema na API:** *Project Settings → API → Exposed schemas* → **acrescentar** `assimilacao` (manter os atuais) — e **não** mexer em *Extra search path*. Isto recarrega a configuração do PostgREST (afeta a API do projeto inteiro, só acrescentando um schema).
4. **Autenticação anônima** (*Authentication → Sign In / Providers → Allow anonymous sign-ins*): é **global**. Ver o risco abaixo.
5. **Realtime (opcional):** `supabase/optional/realtime.sql` acrescenta `assimilacao.characters` à publicação compartilhada `supabase_realtime`. Sem isso, o Assimilador atualiza por consulta a cada 15 s.
6. **Variáveis de ambiente do build:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave anon/publishable; **nunca** `service_role`).

## ⚠️ Risco principal do projeto compartilhado: usuários anônimos são `authenticated`

No Supabase, quem entra anonimamente recebe o role Postgres **`authenticated`** (com `is_anonymous = true` no JWT). Além disso, **qualquer pessoa com a chave anon pública pode criar usuários anônimos**, usando ou não o nosso app.

Se alguma tabela do Rastreador tiver policy como `TO authenticated USING (true)` (ou `auth.uid() IS NOT NULL`), **visitantes anônimos passam a ler/gravar esses dados**. Nosso código não cria esse risco, mas habilitar o login anônimo o **expõe**. Isto não pode ser corrigido dentro do schema `assimilacao`.

O que fazer (decisão do proprietário; nada disto foi aplicado):

- **Antes de habilitar login anônimo**, auditar todas as policies/grants do Rastreador. Se o Rastreador usa login real, suas policies devem checar identidade real, por exemplo acrescentando uma policy **restritiva** `AS RESTRICTIVE ... USING (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)` — isso **modifica o Rastreador** e exige coordenação.
- **Alternativa segura:** usar um **projeto Supabase separado e gratuito** para o Assimilação (nenhuma mudança no Rastreador; o código só precisa de outras duas variáveis de ambiente — nenhuma alteração de código).
- Se o Rastreador não usa Supabase Auth (ex.: só chave anon + RLS por `anon`), o risco é menor, mas confirmar mesmo assim.
- Ativar CAPTCHA/limites de taxa do Auth ajuda contra criação em massa de identidades.

Também considerar: usuários anônimos aparecem em `auth.users` do projeto compartilhado (visíveis ao Rastreador como usuários sem e-mail); limites de taxa e cotas do plano são compartilhados.

## Reversão

Para remover o Assimilação do projeto sem afetar o Rastreador: `drop schema assimilacao cascade;` (só atinge o schema dele) e remover `assimilacao` de *Exposed schemas* e, se adicionada, a tabela da publicação Realtime. **Não faz parte da migration.**
