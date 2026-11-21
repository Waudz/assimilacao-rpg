import { toolReturnPath } from '../lib/router';\nimport { useState } from 'react';
import { Header, Page } from '../components/ui';
import { go } from '../lib/router';

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
    body: ['Joaninha = Sucesso, Cervo = Adaptação, Coruja = Pressão. Use o Tradutor de Dados para converter as faces dos seus dados físicos.'],
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
  const [mode, setMode] = useState<'start' | 'lookup'>('start');
  const list = RULES.filter((r) => (r.title + r.body.join(' ')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Header title="REGRAS RÁPIDAS" backTo={toolReturnPath()} />
      <Page>
        <section className="card rules-intro">
          <h2>Primeira vez jogando?</h2>
          <p>Não precisa decorar o livro para começar. Este guia explica o básico do papel do Infectado e ajuda a consultar as regras durante a sessão.</p>
          <p className="muted"><strong>Importante:</strong> este é um guia de apoio, não o livro completo. Existem outras regras, exceções e decisões do Assimilador. As páginas indicadas mostram onde conferir a regra oficial.</p>
          <div className="rules-mode" role="group" aria-label="Modo de consulta">
            <button type="button" className={mode === 'start' ? 'btn primary' : 'btn'} aria-pressed={mode === 'start'} onClick={() => setMode('start')}>Aprender a jogar</button>
            <button type="button" className={mode === 'lookup' ? 'btn primary' : 'btn'} aria-pressed={mode === 'lookup'} onClick={() => setMode('lookup')}>Consultar regras</button>
          </div>
        </section>
        {mode === 'start' && (
          <section className="rules-guide" aria-label="Primeiros passos">
            <h2>O essencial para a primeira sessão</h2>
            <ol className="rules-guide-list">
              <li><strong>Tu descreves o que teu Infectado tenta fazer.</strong> Não precisa conhecer todas as mecânicas para agir: explica a intenção e o Assimilador orienta quando houver um teste.</li>
              <li><strong>O Assimilador indica as aptidões envolvidas.</strong> Instintos, Conhecimentos e Práticas representam capacidades da ficha. A quantidade de dados depende das aptidões usadas no teste (livro, págs. 28–35 e 44).</li>
              <li><strong>Rola os dados físicos e escolhe quais manter.</strong> Normalmente apenas um resultado é mantido. Determinação, Origens e algumas Características podem permitir manter dados adicionais (págs. 31–41).</li>
              <li><strong>Traduz os símbolos dos dados mantidos.</strong> Joaninha representa Sucesso, Cervo representa Adaptação e o símbolo de Pressão representa Pressão. Usa o Tradutor para somar os resultados, mas o Assimilador interpreta as consequências na cena (págs. 35–43).</li>
              <li><strong>Acompanha teus recursos na ficha.</strong> Saúde, Determinação e Assimilação têm efeitos diferentes. Gastos, ferimentos e recuperação seguem regras próprias; consulta os tópicos abaixo quando ocorrerem (págs. 58–67).</li>
            </ol>
            <button type="button" className="btn" onClick={() => go('/dice')}>Abrir Tradutor de Dados</button>
            <p className="muted">Dica: quando tiver dúvida, descreve a ação normalmente. O Assimilador conduz a cena e explica a regra necessária.</p>
          </section>
        )}
        <h2>{mode === 'start' ? 'Regras para consultar durante a sessão' : 'Buscar por assunto'}</h2>
        <input type="search" aria-label="Buscar nas regras" placeholder="Buscar regras: saúde, testes, determinação…" value={q} onChange={(e) => setQ(e.target.value)} />
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
        {list.length === 0 && <p className="muted">Nada encontrado. Tenta outro termo ou pede orientação ao Assimilador.</p>}
      </Page>
    </>
  );
}
