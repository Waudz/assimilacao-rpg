# Conta e mesas vinculadas à conta — causa dos bugs e correção

## Bug 1 — tela inicial pedia login mesmo com sessão ativa
**Causas**
1. A correção do PR #19 (`RolePage` reconhecer a conta) **nunca entrou na `main`**: a tela "Como você vai participar?" sempre mostrava "Entrar ou criar conta".
2. Mesmo no #19, o estado da conta era lido **uma vez ao montar** (`accountSession()` → `auth.getUser()`, uma chamada de rede) e ninguém ouvia `onAuthStateChange`. Logo: tela com estado velho depois de entrar/sair, "piscar" do login enquanto a rede respondia, e nada funcionava offline.

**Correção** (`src/lib/sync/accountStore.ts`, `remote.ts`)
- A sessão persistida (`localStorage`, chave `assimilacao-auth`) é lida **sem rede** ao abrir → "Minha conta" aparece imediatamente (inclusive offline); depois o cliente confirma.
- `onAuthStateChange` mantém o estado em dia (entrar, sair, renovar, outra aba). `accountSession()` agora usa `getSession()` (sem chamada extra).
- Enquanto não se sabe, a tela mostra "Verificando sua conta…" — nunca o login por engano.
- Trocar Infectado/Assimilador não toca na sessão. Ao sair da conta o app volta à sessão anônima do aparelho.

## Bug 2 — mesa vinculada no celular não aparecia no PC
**Causas**
1. `TableCodeCard` começava com `account = false` e só descobria a conta numa consulta assíncrona. Quem digitava o código antes disso (ou com falha momentânea da consulta) caía no **caminho legado**: só `localStorage`, que **nunca chega ao servidor** — por isso o PC não via a mesa.
2. Nada migrava esse código local para a conta depois do login.
3. As mesas da conta só eram carregadas na montagem e a cada 20 s, sem reagir a login, reconexão ou volta ao primeiro plano, e sem cópia para uso offline.
4. A ficha criada depois não tinha como ser ligada a uma mesa já existente da conta sem redigitar o código.

(Backend conferido por sonda com a chave pública: `join_table_account` exige conta — sessão anônima recebe `login_required`; `list_my_table_memberships` e `table_memberships` só devolvem o que é do próprio usuário. O banco estava correto.)

**Correção**
- O caminho (conta × local) só é decidido quando o estado da conta é conhecido; com conta, o vínculo **auth.uid ↔ mesa é gravado no servidor na hora** (`join_table_account`) e a mesa aparece em "Minhas mesas" **sem ficha**.
- **Migração do legado:** com login e internet, o código guardado só no aparelho é gravado na conta; **só depois** do sucesso o código local é apagado. Falha de rede mantém o código; código inválido avisa e **não apaga em silêncio**.
- As mesas são atualizadas ao abrir, ao mudar a sessão, ao reconectar, ao voltar ao primeiro plano e a cada 30 s (consultas simultâneas se unem); a última lista fica salva para uso offline (por usuário — não mistura contas).
- Ficha depois: ao concluir o personagem, se a conta tem **uma** mesa, a ficha entra nela; com várias, a ficha oferece "Vincular a <mesa>" (sem digitar código).
- Sem alterar o banco: nenhuma migration nesta correção.

## Versão publicada sem cache velho
- `version.json` (id do commit + hora do build) é emitido a cada build, fora do pré-cache; a versão também aparece em *Minha conta*.
- O service worker usa `autoUpdate` (`skipWaiting` + `clientsClaim`); o app procura SW novo ao voltar ao primeiro plano, ao reconectar e a cada 15 min, e recarrega **uma vez** quando um SW novo assume.

## Testes
- Unitários (`tests/account-store.test.tsx`, 19): sessão imediata e confirmada, "Verificando…", entrar/sair em tempo real, troca de conta, offline, mesa sem ficha, corrida da verificação, migração do legado (ok / offline / inválido / anônimo), ficha posterior, fichas existentes intactas.
- E2E com **duas sessões independentes da mesma conta** (`e2e/account.spec.ts`, API simulada por interceptação de rede — não há credenciais de conta real para o teste): sessão reconhecida e mantida ao recarregar, mesa entra sem ficha, aparece no outro navegador, troca de papel mantém a sessão, ficha criada depois entra na mesa, migração do legado, e quem não está logado não vê mesas de outra conta.
- Backend real (somente leitura/limpo, sessão anônima): `login_required` para anônimo, listas vazias para quem não é dono.

## Pendências conhecidas
- Teste ponta a ponta com **conta real** (e-mail) não automatizado: exige credenciais.
- `e2e/real.spec.ts` (fluxo anônimo real) está defasado em relação à interface atual e agora **sempre se limpa** (apaga mesa e fichas por API ao final, mesmo em falha).
