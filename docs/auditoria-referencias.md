# Auditoria de referências — Assimilação RPG (20/11/2026)

## Objetivo
Comparar projetos publicados com o escopo acordado: ficha local no celular, criador fiel ao livro completo, tradutor de dados físicos, regras rápidas e sincronização por código para visualização do Assimilador (sem login visível).

## Referências externas verificadas
- LPfontes — https://github.com/LPfontes/ficha-assimilacao — ficha interativa; aptidões e atualização de Saúde conforme Potência/Resolução; entrada matemática de recursos. Referência de comportamento, não código copiado.
- Guilherme Gouvêa — https://github.com/guilhermeperluxodegouvea/AssimilacaoRPGFichas — exportação/importação JSON; baseado no Fastplay, não presumir equivalência com livro completo. README contém condições de uso/publicação; não incorporar código sem avaliação da licença.
- Isaac4lves — https://github.com/Isaac4lves/ASRPG-dices — conversão dos símbolos; ferramenta originalmente voltada a dados virtuais. O README usa o termo Coruja para pressão; no nosso produto manter a equivalência de símbolos conferida nas imagens enviadas.
- Oficina do Hasta — https://push-to-close.catarse.com.br/posts/vitrine-assimilacao-rpg-pc — planilha com características, mutações, pacotes de equipamentos e barras dinâmicas. Boa referência de funcionalidades, mas não importar a planilha nem seus scripts sem autorização.
- VTT — https://ficha-assimilacao-rpg.vercel.app/ — já exibe entrada em mesa por código e visualização de personagens; referência para experiência de uso, não para copiar implementação.
- Dados + Ficha Temporária — https://ike-grifact.github.io/dadosoffilineassimila-a-rpg/ — construtor de rolagem por aptidão, dados mantidos e resultados. Não salva fichas permanentemente.

## Matriz de decisões
| Área | Inspiração | Nossa implementação |
| --- | --- | --- |
| Aptidões e Saúde | LPfontes | Cálculos independentes, validados com o livro |
| Exportação/importação | Guilherme | JSON próprio com versão de esquema e validação |
| Características/equipamentos | Oficina do Hasta | Fluxo enxuto, com custos e limites do livro completo |
| Código de mesa | VTT | Grupo com segredo de convite e credenciais de dispositivo distintas; leitura apenas para Assimilador |
| Dados | Isaac4lves / Ficha Temporária | Entrada manual de faces físicas, seleção dos dados mantidos, soma de símbolos |
| Interface | Ficha original | Layout mobile-first, navegação curta e acessível |

## Regras confirmadas no livro enviado
Resumo da criação na página impressa 91: nove etapas (Nome, Origens, Geração, Propósitos, Aptidões, Cabo de Guerra, Saúde, Características, Equipamentos). Página 80: seis Instintos começam em 1 e recebem mais três pontos, máximo 3 por Instinto na criação; Conhecimentos e Práticas recebem sete pontos no total, máximo 2 cada nessa etapa. Página 82: Saúde por nível = 1 + Potência + Resolução. Página 81: Determinação 9 e Assimilação 1 por padrão, podendo o Assimilador ajustar proporcionalmente.

## Problemas e riscos já identificados
1. O criador atual cobre só parte das nove etapas; não declarar criação completa antes de implementar Características, Equipamentos e regras pertinentes.
2. Ficha local ainda não sincroniza; botão de código deve permanecer desabilitado até existir autenticação de dispositivo e controle de acesso no servidor.
3. O armazenamento local deve ser protegido contra perda acidental por exportação/importação e sincronização; iOS pode remover dados de sites.
4. A ficha atual requer salvamento manual de edições, contrário ao objetivo de persistência automática; corrigir antes de liberar para uso real.
5. O repositório React/Vite ainda precisa de pipeline de build, teste e deploy; não presumir que arquivos de origem são publicáveis diretamente pelo GitHub Pages.
6. O rolador atual soma símbolos de dados marcados como mantidos, mas não impõe as regras de quantos podem ser mantidos; conferir no livro antes de automatizar.
7. Não reproduzir integralmente imagens, textos ou assets protegidos dos projetos consultados.

## Ordem recomendada
1. Corrigir build/CI e fluxo de deploy do React.
2. Concluir criador conforme livro, separar valores de criação de evolução.
3. Persistência automática + backup JSON.
4. Consulta rápida com referências de páginas.
5. Sincronização segura por código e testes entre dispositivos.
6. Testes reais no Safari/iPhone (instalação, offline, atualização e retorno à conexão).

Esta auditoria não é validação funcional dos projetos de terceiros; é uma comparação de recursos documentados publicamente.
