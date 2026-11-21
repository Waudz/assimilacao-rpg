# Assimilação — Fichas Digitais

PWA mobile-first de apoio a **Assimilação RPG**, separado do Compêndio 5e.

## Estado atual
- Tela de escolha entre **Infectado** e **Assimilador**, com preferência salva localmente.
- Tradutor de dados físicos D6, D10 e D12, com seleção de múltiplos dados e soma somente dos dados mantidos.
- Interface responsiva e service worker para cache do aplicativo.
- Manifest e metadados para instalação em Android e iOS.

**Ainda não implementados:** criador e ficha inteligente, sincronização, convite por código, consulta de regras, armazenamento de fichas em IndexedDB. Os botões de código estão desativados intencionalmente; nenhum código falso é exibido.

## Decisões do produto
- Sem cadastro/login visível; Assimilador cria grupo e compartilha código; Infectados entram com código.
- Fichas ficam nos dispositivos, com sincronização segura entre aparelhos quando online.
- Assimilador **somente lê** as fichas; jogadores controlam alterações e evolução.
- Conflitos, cartas e eventos continuam físicos.
- Consulta de regras curta, contextual e com referência de página.
- Estética inspirada na ficha, mas interface própria e responsiva.
- iOS: testar Safari e **Adicionar à Tela de Início**; não depender de Background Sync ou push para preservar alterações.
- Exportação/importação como backup antes de uso real.

## Segurança pendente
Código de grupo não deve ser credencial de edição. Implementar identidade anônima de dispositivo com tokens secretos, vínculo de propriedade por ficha, permissões server-side, revogação de acesso, proteção contra tentativas de código e reconciliação de edições offline. Nenhum segredo de servidor deve ser enviado ao cliente. Não ativar sincronização antes de testes de acesso cruzado.

## Rodar localmente
Sirva a pasta com um servidor HTTP local (ex.: `python3 -m http.server 8000`). Abra `http://localhost:8000`. Service workers exigem HTTPS ou localhost. Para publicar, habilite GitHub Pages em Settings → Pages (deploy from main/root).

## Próximas etapas
1. Criador e ficha com validações conferidas no livro.
2. IndexedDB, exportação e testes de persistência.
3. Regras rápidas e referências de páginas.
4. Backend de sincronização e convites seguros.
5. Testes reais no iPhone (Safari instalado), Android e offline.

Projeto independente, não oficial. Não reproduzir integralmente textos e imagens protegidos do livro.
