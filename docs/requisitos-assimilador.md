# Requisitos obrigatórios — decisões do Assimilador

Este documento é a fonte de verdade de produto para a primeira versão. As decisões abaixo foram informadas pelo Assimilador e confirmadas pelo responsável pelo projeto. Não substituí-las por funcionalidades de outros aplicativos ou conveniências técnicas.

## Regras funcionais
1. **Dados físicos e tradutor:** o jogador informa a face obtida em D6, D10 ou D12 e vê os símbolos e sua tradução. O aplicativo não precisa rolar dados virtualmente. Suportar múltiplos resultados, respeitando as regras do livro para dados mantidos.
2. **Área do Assimilador:** visualizar **todos os detalhes** das fichas dos Infectados conectados. Acesso estritamente de leitura, sem edição.
3. **Dados locais e sincronização:** cada pessoa mantém sua ficha no próprio dispositivo, sincronizada com o Assimilador quando online. Sem internet, a ficha deve continuar utilizável; sincronizar quando retornar.
4. **Sem login visível:** primeira entrada pergunta **Infectado** ou **Assimilador**. Assimilador cria mesa e compartilha código; Infectado informa código para entrar. A escolha persiste no dispositivo.
5. **Conflitos:** gerenciados em papel pelo Assimilador; não implementar gerenciador digital na primeira versão.
6. **Cartas e eventos:** físicos; não implementar sorteadores.
7. **Regras:** consulta rápida, explicações curtas e contextuais, com referências ao livro.
8. **Anotações do Assimilador:** não houve especificação funcional; não criar módulo complexo.
9. **Evolução:** o jogador controla manualmente alterações e progressão, sem automação de aprovação ou mudanças feitas pelo Assimilador.
10. **Visual:** inspirado na ficha original e identidade de Assimilação, adaptado a celular.
11. **Prioridades declaradas pelo Assimilador:** tradutor de dados, consulta rápida de regras e sincronização entre celulares.
12. **Prioridade de entrega definida pelo responsável:** primeiro ficha funcional e criador, depois sincronização e visualização pelo Assimilador, seguidos de publicação/testes em Android e iPhone. As prioridades do Assimilador continuam obrigatórias, mas não devem bloquear a entrega da ficha.

## Conversão dos dados (Sucessos / Adaptações / Pressões)
| Face | D6 | D10 | D12 |
|---|---|---|---|
| 1 | 0/0/0 | 0/0/0 | 0/0/0 |
| 2 | 0/0/0 | 0/0/0 | 0/0/0 |
| 3 | 0/0/1 | 0/0/1 | 0/0/1 |
| 4 | 0/1/1 | 0/1/1 | 0/1/1 |
| 5 | 0/1/1 | 0/1/1 | 0/1/1 |
| 6 | 1/0/0 | 1/0/0 | 1/0/0 |
| 7 | — | 2/0/0 | 2/0/0 |
| 8 | — | 1/1/0 | 1/1/0 |
| 9 | — | 1/1/1 | 1/1/1 |
| 10 | — | 2/0/1 | 2/0/1 |
| 11 | — | — | 1/2/1 |
| 12 | — | — | 0/0/2 |

Lobo = Pressão, Cervo = Adaptação, Joaninha = Sucesso. Conferido nas imagens enviadas pelo usuário.

## Requisitos técnicos e de segurança
- PWA instalável em Android e iPhone via Safari > Adicionar à Tela de Início.
- Persistência local real (IndexedDB), sem perder alterações ao fechar e reabrir o app.
- Sincronização entre dispositivos exige servidor. Código de convite **não pode ser credencial de edição**. Identidade anônima de dispositivo, autorização por ficha e leitura do Assimilador no servidor.
- Offline não significa sincronização instantânea: mostrar estado de conexão e pendências, tratar conflitos e reenvio.
- Não apresentar botões de código como funcionais antes de implementar o backend.
- Respeitar direitos autorais de arte e texto do livro.

## Critérios de aceitação da primeira versão
- Um Infectado cria personagem pelo celular conforme regras do livro, fecha/reabre e recupera ficha.
- O Assimilador cria código, o Infectado entra e sua ficha aparece no celular do Assimilador.
- Alterações feitas pelo jogador são sincronizadas e vistas pelo Assimilador; ele não pode editar.
- Tradutor converte corretamente todas as faces das três tabelas.
- Consulta rápida de regras está acessível no celular.
- Funciona em Safari/iOS e Android, inclusive leitura/edição local sem conexão.

Não marcar como concluído sem teste funcional e validação de permissões.
