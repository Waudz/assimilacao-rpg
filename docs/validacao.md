# Validação — o que foi testado, e como

Data: 2026-11-21. Diferenciamos **simulado** (sem rede / banco em memória) de **real** (API do Supabase de verdade).

## Simulado (roda no CI, sem depender do Supabase)
| Camada | O que cobre | Arquivo |
|---|---|---|
| Regras do livro | criação, Saúde, Cabo de Guerra, XP, Características, dados D6/D10/D12, migração v1 | `tests/rules.test.ts` |
| Sincronização offline-first | fila de pendências, offline → reconexão, conflitos, recuperação, GM sem internet (servidor falso com as mesmas regras) | `tests/sync.test.ts` |
| Cliente Supabase | schema `assimilacao`, nomes de RPC, Realtime, segredo fora do JSON (cliente espiado) | `tests/remote.test.ts` |
| Banco e RLS | PostgreSQL real em memória (PGlite): permissões, RLS, códigos, recuperação, limites | `tests/rls.test.ts` |
| Isolamento do Rastreador | catálogo e dados de um `public` simulado idênticos antes/depois; funciona sem `public` | `tests/isolation.test.ts` |
| Componentes | dados, abas por teclado, Cabo de Guerra, ficha do Assimilador atualizando | `tests/ui.test.tsx`, `tests/gm-pull.test.tsx` |
| Navegador (Chromium emulando iPhone SE e Pixel 7) | criar/jogar/reabrir, rascunho, 320 px sem rolagem horizontal, app offline com service worker | `e2e/flow.spec.ts` |

## Real, via API do Supabase (manual / sob demanda)
`e2e/real.spec.ts` — dois navegadores independentes contra o projeto real, **somente com a chave pública**:

```powershell
$env:VITE_SUPABASE_URL="https://<projeto>.supabase.co"; $env:VITE_SUPABASE_ANON_KEY="<chave publishable>"
npm run build
$env:E2E_REAL="1"; $env:PW_CHANNEL="chrome"; npx playwright test e2e/real.spec.ts
```
Verifica: login anônimo real → Assimilador cria mesa e recebe código → jogador cria personagem → **código inválido é recusado** → entra pelo código → Assimilador vê a ficha sem recarregar (somente leitura, sem botões de edição) → dano e Determinação do jogador chegam ao Assimilador sozinhos → jogador fica **offline** (ficha segue utilizável, "Aguardando conexão", Assimilador ainda vê o valor antigo) → **reconecta** e o Assimilador recebe → recarregar página do jogador e do Assimilador mantém tudo → outro navegador não vê a ficha → o app apaga os dados que criou.

Resultado em 2026-11-21: **passou** em iPhone SE (emulado) e Pixel 7 (emulado), ~28 s cada.

Observação: sem Realtime habilitado na publicação, as atualizações chegam pela consulta a cada 8 s (foi o caminho exercitado). Habilitar `supabase/optional/realtime.sql` deixa instantâneo, mas não é necessário.

## Não validado
- **Aparelhos reais** (Safari/iPhone, Chrome/Android): instalação na tela inicial, modo standalone e reabertura. Testes acima usam Chromium emulando as telas.
- **Realtime** (publicação não habilitada nesta validação).
- Efeitos no Rastreador D&D: nenhum objeto dele foi tocado; a preservação foi verificada em banco simulado e a migration é aditiva.

## Publicação (GitHub Pages) — verificação de 2026-11-21
- Workflow da `main` (`e38dfa7`): job `test` **passou**; job `deploy` **falhou** com `Failed to create deployment (status: 404) ... Ensure GitHub Pages has been enabled`. Causa: o Pages não estava habilitado no repositório (a API de Pages também respondia 404). Não é erro de código.
- **Ação do proprietário:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***, depois *Actions → CI e publicação → Re-run all jobs* (ou um novo push na `main`). Habilitar o Pages exige permissão de administrador do repositório.
- Validação equivalente feita localmente: o build de produção (`dist/`) servido em **`/assimilacao-rpg/`** (mesmo subcaminho do Pages, `scripts/serve-subpath.mjs`) com `PW_BASE_URL`:
  manifest, ícones (192/512/maskable/apple-touch), `sw.js` e `registerSW.js` respondem 200; `start_url`/`scope` relativos; 16 testes E2E + o fluxo real com Supabase (2 execuções por dispositivo) **passaram** nesse subcaminho.
- Corrigidos nesta verificação (regressões em `tests/gm-home-race.test.tsx` e `tests/remote.test.ts`): (1) a lista de mesas carregada na abertura podia apagar uma mesa recém-criada ("Mesa não encontrada"); (2) chamadas simultâneas faziam dois logins anônimos, podendo trocar a identidade no meio.

## v2 — interface (branch `feat/ui-v2`)
Cobertura nova (simulada): `tests/ui.test.tsx` (tradutor: feedback, seleção, desmarcar, totais), `tests/pending-ui.test.tsx` (código antes da ficha, modal de confirmação), `tests/sync.test.ts` (validação do código sem ficha e vínculo automático, offline, erro de rede), `tests/rules.test.ts` (10/0 … 1/9, Estágio Avançado, Resiliente), `e2e/flow.spec.ts` (tradutor e 10/0 em iPhone SE/Pixel 7).
Via API real: `e2e/real.spec.ts` foi atualizado para o novo fluxo (código informado **antes** de criar o personagem, vínculo automático, modais, limpeza dos dados de teste) e **passou** contra o Supabase real.
