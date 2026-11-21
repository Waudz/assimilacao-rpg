# Assimilação RPG — Fichas Digitais

PWA mobile-first (Android e iPhone) para criar e usar fichas de Infectados e para o Assimilador acompanhar as fichas da mesa, sem cadastro. Baseado no **Livro de Regras** de Assimilação RPG (as páginas citadas são as do livro impresso).

## O que funciona

| Área | Estado |
|---|---|
| Escolha Infectado / Assimilador (persiste no aparelho) | ✅ |
| Criador em 9 etapas (Nome, Origens, Geração, Propósitos, Aptidões, Cabo de Guerra, Saúde, Características, Equipamentos), com rascunho retomável | ✅ |
| Validação das regras: 9 pontos de Instintos (1–3), 7 pontos de Conhecimentos/Práticas (0–2), 7 XP, custo = dobro do nível | ✅ |
| Catálogo das 49 Características (custo, requisitos, resumo, pág.) com validação de requisitos | ✅ |
| 9 pacotes de equipamentos → Inventário editável | ✅ |
| Ficha jogável: Saúde por níveis, Cabo de Guerra (níveis × pontos), Aptidões, Características, Inventário, Notas, modo evolução manual | ✅ |
| Salvamento automático (IndexedDB), funciona offline, backup/importação JSON (aceita fichas do protótipo v1) | ✅ |
| Tradutor de dados físicos D6/D10/D12 com seleção de dados mantidos | ✅ |
| Regras rápidas com páginas do livro | ✅ |
| Mesas por código, sincronização, visão somente leitura do Assimilador, tempo real + polling | ✅ código e testes · ⚠️ **precisa configurar o Supabase** (ver abaixo) |

Decisões fixas: sem combate/cartas/mapas digitais; o Assimilador só **lê** as fichas; a evolução é manual do jogador.

## Arquitetura

```
src/
  lib/rules.ts        modelo Character, Saúde, Cabo de Guerra, XP, validação, migração v1→v2
  lib/catalog.ts      Características + pacotes de equipamentos
  lib/dice.ts         tabela de faces → Sucesso/Adaptação/Pressão
  lib/db.ts           Dexie (IndexedDB): fichas, estado de sync, cópia das fichas da mesa
  lib/sync/engine.ts  motor offline-first (fila = flag dirty + reenvio), conflitos, vínculo à mesa
  lib/sync/remote.ts  cliente Supabase (interface Remote, testável sem rede)
  components/, pages/ interface React
supabase/migrations   esquema, RLS e funções (SECURITY DEFINER)
tests/                Vitest (regras, dados, sync, RLS em PostgreSQL real via PGlite)
e2e/                  Playwright (iPhone SE e Pixel 7)
```

Stack: React 19, TypeScript, Vite 7, Tailwind 4, Dexie, vite-plugin-pwa, Supabase (PostgreSQL + Auth anônima + Realtime).

### Sincronização e segurança
- Cada aparelho entra com **autenticação anônima** do Supabase (sem tela de login). `auth.uid()` identifica o aparelho.
- **O código da mesa não é credencial de edição**: só vincula uma ficha *própria* à mesa (`join_table`). Códigos têm 8 caracteres sem ambiguidade (≈10¹²) e há limite de 8 tentativas erradas por 10 min por aparelho.
- Nenhuma tabela aceita INSERT/UPDATE/DELETE direto do cliente; toda escrita passa por funções que validam o dono **no servidor**. Assimilador e dono podem ler; só o dono escreve.
- Só fichas **vinculadas a uma mesa** são enviadas ao servidor. Antes disso ficam apenas no aparelho.
- Offline: edições ficam marcadas como pendentes e são reenviadas ao voltar a conexão, ao reabrir o app, ao voltar à aba e a cada 20 s (não depende de Background Sync, indisponível no Safari). Estados exibidos: *Salvo neste dispositivo*, *Aguardando conexão*, *Sincronizando…*, *Sincronizado*, *Erro de sincronização*, *Conflito*.
- Conflitos (ex.: ficha restaurada de backup mais antigo) **nunca sobrescrevem em silêncio**: o jogador escolhe a versão do servidor ou a local.
- Recuperação: cada ficha tem um segredo (dentro do backup JSON) que permite reassumi-la em aparelho novo, revogando o antigo. Cada mesa tem uma *chave de recuperação*. O Assimilador pode remover fichas da mesa, girar o código e excluir a mesa.

## Executar localmente

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # unitários + segurança (RLS)
npm run build && npm run test:e2e   # E2E (use PW_CHANNEL=chrome para usar o Chrome instalado)
```

Sem as variáveis do Supabase o app roda normalmente, mas **criar/entrar em mesas fica desativado** (com aviso na tela).

## Configurar o Supabase (necessário uma vez)

1. Crie um projeto em supabase.com (plano gratuito basta).
2. **Authentication → Providers → Anonymous sign-ins → habilitar.** (Recomendado: ativar CAPTCHA/limites de taxa em *Authentication → Rate Limits*.)
3. No **SQL Editor**, execute o conteúdo de `supabase/migrations/20261121000000_init.sql`.
4. Copie *Project URL* e a chave **anon/publishable** (nunca a `service_role`) de *Project Settings → API*.
5. Local: copie `.env.example` para `.env.local` e preencha.
6. Publicação: no GitHub, *Settings → Secrets and variables → Actions → Variables* → crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

A chave anon é pública por desenho; quem protege os dados são as políticas RLS e funções da migration (testadas em `tests/rls.test.ts`).

## Publicar (GitHub Pages)

1. *Settings → Pages → Source: **GitHub Actions***.
2. Faça merge na `main`: o workflow `.github/workflows/deploy.yml` roda tipos, testes, build, E2E e publica `dist/`.
3. O app fica em `https://<usuário>.github.io/assimilacao-rpg/` (HTTPS, exigido para PWA).

## Instalar no celular

- **iPhone (Safari):** abra o endereço → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar aplicativo** / *Adicionar à tela inicial*.

## Como usar a mesa

1. **Assimilador:** abra o app → *Assimilador* → *Criar mesa e gerar código* → compartilhe o código de 8 caracteres. Guarde a *chave de recuperação*.
2. **Infectado:** crie e conclua o personagem → na ficha, seção *Mesa* → digite o código → *Entrar na mesa*.
3. O Assimilador vê a lista e abre cada ficha (somente leitura); as alterações do jogador chegam automaticamente.

## Backup
*Início → Backup e importação.* O JSON contém todas as fichas (e o segredo de recuperação: trate como privado). O iPhone pode apagar dados de sites sem uso — faça backups periódicos.

## Limitações conhecidas / pendências
- **Não validado em iPhone/Android reais.** Testado automaticamente em Chrome emulando iPhone SE e Pixel 7. Falta teste manual no Safari (instalação, standalone, reabertura) e em dois aparelhos com o Supabase real.
- Supabase real ainda não conectado (depende de conta do proprietário). O esquema/RLS foi validado em PostgreSQL (PGlite), mas o **Realtime** só pode ser comprovado no projeto real (há polling de 15 s como reserva).
- Características têm *resumos curtos próprios* dos efeitos; o texto oficial está no livro. Assimilações/mutações (cap. 4) são registradas em texto livre.
- Modo evolução é manual e sem validação de XP (decisão do Assimilador).
- Escassez (pág. 94) e Teste de Assimilação inicial (pág. 124) não são automatizados.
- Regras de dados mantidos não são impostas (o livro tem várias exceções); o tradutor apenas soma o que o jogador marcar.

## Documentos
- `docs/requisitos-assimilador.md` — decisões obrigatórias do Assimilador.
- `docs/auditoria-referencias.md` — comparação com apps existentes (nenhum código foi copiado).
