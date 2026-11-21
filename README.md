# Assimilação — Fichas Digitais

Aplicativo PWA mobile-first de apoio a Assimilação RPG, independente do Compêndio 5e.

## Stack
React 19, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB) e vite-plugin-pwa. Backend de sincronização ainda não implementado.

## Estado (protótipo em desenvolvimento)
- Escolha de papel Infectado/Assimilador salva no aparelho.
- Criação inicial de Infectados: nome, origens, geração, propósitos, Instintos (9 pontos) e Conhecimentos/Práticas (7 pontos).
- Validação de limites iniciais; Saúde calculada por nível (1 + Potência + Resolução).
- Fichas locais no IndexedDB, edição de pontos de Saúde/Determinação e anotações.
- Tradutor de D6/D10/D12, múltiplos dados e escolha de quais manter.
- Configuração PWA para instalação e cache; **ainda não testada em dispositivo iOS real**.

## Limitações importantes
- **Não está pronto para jogar:** faltam características de Infectados, custos de experiência, equipamentos, evolução e detalhes da Saúde.
- **Sem sincronização:** código de convite ainda desativado. Assimilador não consegue consultar fichas de outros aparelhos.
- Não há exportação/importação ou recuperação em caso de limpeza dos dados do navegador.
- O salvamento das edições de ficha exige tocar em “Salvar alterações”; ainda não é automático.
- O projeto ainda não passou por build/CI verificado nem teste real em Safari/iPhone.
- Não usar este protótipo como única cópia de fichas importantes.

## Desenvolvimento
```bash
npm install
npm run dev
npm run build
```
GitHub Pages precisa de workflow de build e publicação de `dist`; publicar arquivos-fonte diretamente não executará o React.

## Decisões fixadas
- Sem cadastro visível. Assimilador compartilha código; jogador entra com código.
- Dados persistem no dispositivo; sincronização futura quando online, com autenticação de dispositivo e permissões reais.
- Assimilador apenas visualiza fichas. Evolução é manual pelo jogador.
- Conflitos, baralhos e eventos permanecem físicos.
- Consulta rápida das regras, sem reproduzir integralmente o livro.
- Aparência inspirada na ficha original, com interface adaptada a iOS/Android.

## Próximas tarefas
1. Concluir criação pelas páginas 83–90 e verificar regras de saúde/evolução.
2. Testes automatizados, CI, lockfile e GitHub Pages via build.
3. Exportação/importação e persistência confiável offline.
4. Regras rápidas.
5. Sincronização segura sem login visível e testes de permissão.
6. Testes reais de PWA no Safari/iPhone e Android.

Projeto não oficial. Respeitar direitos autorais sobre texto e arte do livro.
