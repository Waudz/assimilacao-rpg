# Auditoria de interface e decisões — v2 (branch `feat/ui-v2`)

Base: v1 publicada (`main` @ `023e81d`). A v1 continua no ar; esta atualização só vai para a `main` por PR revisado.

## O que a auditoria encontrou (capturas da v1 em iPhone SE)
| Área | Problema |
|---|---|
| Identidade | Títulos caem numa fonte genérica (a fonte de display declarada nunca é carregada); aparência "app comum", pouca relação com a ficha impressa |
| Ícones | Emojis coloridos (🎲 📖) misturados a texto; sem conjunto coerente |
| Hierarquia | Cartões e botões têm o mesmo peso; títulos de seção fracos; muito espaço vazio e pouca separação entre blocos |
| Tradutor de dados | Símbolos empilham em coluna estreita; "manter" é um checkbox pequeno sem destaque; sem resposta visual ao adicionar; total pouco evidente |
| Confirmações | `window.confirm()` nativo (estilo do sistema, sem consistência, ruim em PWA) |
| Carregamento | Texto "Carregando…" solto |
| Desktop | Coluna única de 640 px; sobra de espaço |
| Componentes | Estilos repetidos inline (`style={{…}}`) em vez de componentes |

## Decisões visuais
- **Paleta refinada** (mantém bege/marrom/vinho): papel `#efe6d2`, tinta `#2a2118`, marrom `#7d4f26`, vinho `#6e2420`, verde-oliva `#6f7449` (Saúde ok), laranja `#b0612f` (alerta), vermelho `#8a2a24` (Determinação), azul-petróleo `#1d6468` (Assimilação). Contrastes conferidos para texto ≥ 4.5:1.
- **Tipografia:** títulos em **Oswald** (condensada, como a ficha impressa), empacotada localmente via `@fontsource` (funciona offline; só o subconjunto latino); corpo em fonte do sistema (legibilidade). Escala tipográfica única (tokens).
- **Detalhes gráficos discretos:** textura de papel por SVG inline minúsculo, divisor de arame farpado (SVG repetido), rachaduras em azul-petróleo nos cantos do cabeçalho, bordas de "cartão de ficha". Nenhuma imagem pesada.
- **Ícones:** conjunto único de SVGs inline (traço de 1.75 px) em `components/Icon.tsx`. Sem biblioteca nova.
- **Movimento:** transições de 120–200 ms (entrada de página, pressionar botão, "pop" ao adicionar dado, pulso nos totais). Respeita `prefers-reduced-motion`.
- **Desktop:** contêiner até 960 px; aba "Ficha" em duas colunas (Saúde | Cabo de Guerra + Aptidões) a partir de 900 px.

## Decisões técnicas
- **Reaproveitar nomes de classe existentes** (`.card`, `.btn`, `.choice`, `.grid2`…) e restilizá-los: troca de visual sem reescrever telas estáveis.
- **Novos componentes reutilizáveis:** `Icon`, `Button`, `Card`, `SectionTitle`, `Modal`/`ConfirmDialog` (elemento `<dialog>` nativo: foco preso, Esc fecha), `Loading`, `EmptyState`. `window.confirm` removido.
- **Sem novas dependências além da fonte** (`@fontsource/oswald`, ~20 KB por peso, empacotada no PWA).
- **Sem mudanças no Supabase / sem migration.**

## Funcionalidades pedidas — decisões
1. **Assimilação inicial 10/0** (notação *Determinação/Assimilação*, como a ficha: padrão 9/1): o seletor passa a oferecer **10/0, 9/1, 8/2 … 1/9** (antes 1–9). 10/0 = Determinação 10, Assimilação 0. Validações revistas: faixa 0–9, Estágio Avançado soma +1, Resiliente continua exigindo Assimilação 2+, botões do Cabo de Guerra respeitam 0 e 10. *Se a intenção era Assimilação 10 / Determinação 0, é uma troca de rótulo/limite — avisar.*
2. **Entrar na mesa antes de criar o personagem — sem migration.** O Infectado informa o código na Home. O app o **valida no servidor sem efeito colateral** chamando a função já existente `join_table` com um id de ficha inexistente: resposta `character_not_synced` = código válido; `invalid_code` = inválido (conta como tentativa errada, com o mesmo limite). O código fica guardado no aparelho como "mesa pendente"; **nenhuma ficha vazia é criada**. Ao **concluir** o primeiro personagem, ele é enviado e vinculado automaticamente; se estiver offline, a vinculação é tentada de novo ao reconectar/abrir a ficha. Pode remover a mesa pendente.
3. **Tradutor de dados:** cada resultado vira um cartão grande e tocável (toque = mantém/desmarca) com marca de seleção, borda e fundo destacados, animação ao entrar e ao marcar; totais grandes com pulso ao mudar; Sucesso/Adaptação/Pressão em "fichas" coloridas com ícone, nome e contagem; resumo "mantidos × descartados".
