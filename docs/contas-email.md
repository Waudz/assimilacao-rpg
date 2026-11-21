# Contas e sincronização (Assimilação RPG)

## Objetivo
A mesma conta de e-mail deve acessar suas fichas no PC e no celular, inclusive fichas que não pertencem a nenhuma mesa. Salvamento local permanece offline-first.

## Segurança e implantação
- O app reutiliza o Supabase Auth e o schema isolado `assimilacao`; o banco e o Auth são compartilhados com o projeto `rastreador-dnd`. **Não modificar tabelas de outros apps.**
- Conferir no Dashboard: Authentication > Providers > Email habilitado; confirmação de e-mail habilitada; URL do site `https://waudz.github.io/assimilacao-rpg/` na lista de URLs de redirecionamento.
- Testar criação de conta, confirmação, login, redefinição de senha, logout, acesso cruzado entre navegadores, edição offline e conflitos antes de liberar produção.
- As policies atuais limitam leitura a `owner_id = auth.uid()` ou Assimilador autorizado; as funções RPC verificam propriedade.
- Não executar migração em lote de fichas legadas. Entretanto, ao entrar na conta, preservar os rascunhos locais do dispositivo e permitir que as fichas anônimas ainda presentes sejam vinculadas à conta por segredo de recuperação.
- No logout, bloquear saída quando existirem fichas sem confirmação de salvamento na nuvem. Excluir fichas cria uma exclusão pendente para sincronizar quando voltar online.
- **Atenção:** o mesmo Supabase Auth é global ao projeto compartilhado. Auditar configurações e políticas antes de modificar qualquer opção global.
- Não prometer sincronização quando o serviço estiver offline ou o schema não estiver exposto na API.

## Verificações manuais obrigatórias antes do merge
1. Conta A no PC cria uma ficha sem mesa; conta A no celular baixa a ficha e vê os mesmos dados.
2. Edição no celular aparece no PC; edição offline sincroniza ao reconectar.
3. Conta B não enxerga fichas de A, inclusive via requisição direta à API.
4. Exclusão offline não restaura a ficha ao sincronizar.
5. Login, confirmação de e-mail, senha esquecida, alteração de senha e logout.
6. Troca de conta não mistura personagens de identidades diferentes.
7. Entrar em uma mesa sem login continua funcionando, inclusive código antes de criar ficha.\n8. Ficha anônima vinculada a uma mesa pode ser associada à conta sem perder vínculo.\n9. Criar rascunho sem login e entrar depois não apaga o rascunho.\n10. Mesa existente continua acessível após login da mesma identidade; novos convites funcionam.
