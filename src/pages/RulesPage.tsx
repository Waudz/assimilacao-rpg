import { useState } from 'react';
import { Header, Page } from '../components/ui';

// Consulta rápida: resumos curtos em palavras próprias, com a página do livro para o texto oficial.
const RULES: { title: string; page: string; body: string[] }[] = [
  {
    title: 'Criação em nove passos',
    page: 'pág. 91',
    body: ['Nome → Origens (Evento Marcante e Ocupação) → Geração → Propósitos (2 pessoais + 1 coletivo) → Aptidões → Cabo de Guerra → Saúde → Características → Equipamentos.'],
  },
  {
    title: 'Aptidões na criação',
    page: 'pág. 80',
    body: ['Instintos: começam com 1 cada e recebem 3 pontos livres; máximo 3 por Instinto.', 'Conhecimentos e Práticas: 7 pontos no total, máximo 2 em cada. Melhorias posteriores vêm de experiência.'],
  },
  {
    title: 'Teste e dados mantidos',
    page: 'pág. 56–59',
    body: ['O jogador rola dados iguais ao valor de cada aptidão do teste e, em regra, mantém apenas um dado à sua escolha.', 'Gastar Determinação, ativar uma Origem ou certas Características permite manter dados adicionais.'],
  },
  {
    title: 'Símbolos dos dados',
    page: 'tradutor',
    body: ['Joaninha = Sucesso, Cervo = Adaptação, Lobo = Pressão. Use o Tradutor de Dados para converter as faces dos seus dados físicos.'],
  },
  {
    title: 'Cabo de Guerra',
    page: 'pág. 58 e 81',
    body: ['Determinação e Assimilação somam sempre 10 níveis. Quando um sobe, o outro desce.', 'Nível é o total; ponto é o recurso que se gasta e recupera. Sem pontos de Determinação, o Infectado entra em Estado Suscetível.'],
  },
  {
    title: 'Saúde',
    page: 'pág. 65–67 e 82',
    body: ['Seis níveis, cada um com 1 + Potência + Resolução pontos. O dano consome pontos do nível atual e, ao esgotá-los, passa ao próximo.', 'Níveis 6 e 5: sem penalidade. 4 e 3: perde 1 Sucesso em todos os testes. 2: perde 2 Sucessos e agir exige 1 Determinação. 1: inconsciente; manter a consciência custa 1 Determinação por rodada.'],
  },
  {
    title: 'Recuperação',
    page: 'pág. 66–67',
    body: ['Níveis 6–5: a cada repouso completo (8 h com boas condições). Níveis 4–3: a cada semana. Níveis 2–1: não se recupera naturalmente, só com tratamento médico.', 'Cada Recuperação regenera Potência + 1 pontos de Saúde.'],
  },
  {
    title: 'Dano',
    page: 'pág. 66',
    body: ['Em rolagens de dano, cada símbolo vale 1 ponto de dano. O Assimilador pode usar dano fixo para ameaças pequenas.'],
  },
  {
    title: 'Experiência e Características',
    page: 'pág. 83–89',
    body: ['Infectados começam com 7 pontos de experiência para Características (custo de 1 a 5, com requisitos) ou para subir Conhecimentos/Práticas pelo dobro do nível desejado (de 2 para 3 custa 6).'],
  },
  {
    title: 'Equipamentos iniciais',
    page: 'pág. 90',
    body: ['Um dos nove pacotes. Se o Assimilador permitir: até três equipamentos comuns adicionais ou um artefato, respeitando o teto de Escassez da mesa.'],
  },
  {
    title: 'Propósitos',
    page: 'pág. 79',
    body: ['Dois pessoais por Infectado; quando realizado, o Assimilador pede um novo. O coletivo é combinado com o grupo.'],
  },
];

export function RulesPage() {
  const [q, setQ] = useState('');
  const list = RULES.filter((r) => (r.title + r.body.join(' ')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Header title="REGRAS RÁPIDAS" backTo="/" />
      <Page>
        <p className="muted">Resumos curtos para consulta durante a mesa. O texto oficial está no Livro de Regras, nas páginas indicadas.</p>
        <input type="search" aria-label="Buscar nas regras" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.map((r) => (
          <details key={r.title} className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              {r.title} <span className="badge">{r.page}</span>
            </summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {r.body.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </div>
          </details>
        ))}
        {list.length === 0 && <p className="muted">Nada encontrado.</p>}
      </Page>
    </>
  );
}
