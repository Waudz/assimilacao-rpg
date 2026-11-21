import { useState } from 'react';
import { Header, Notice, Page, SymbolIcon, SymbolRow } from '../components/ui';
import { DIE_TYPES, sumKept, translateFace, type DieType, type Roll } from '../lib/dice';
import { randomId } from '../lib/rules';

export function DicePage() {
  const [die, setDie] = useState<DieType>(6);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const total = sumKept(rolls);
  const keptCount = rolls.filter((r) => r.keep).length;

  const add = (face: number) => setRolls((r) => [...r, { id: randomId(), die, face, keep: false }]);
  const toggle = (id: string) => setRolls((r) => r.map((x) => (x.id === id ? { ...x, keep: !x.keep } : x)));
  const remove = (id: string) => setRolls((r) => r.filter((x) => x.id !== id));

  return (
    <>
      <Header title="TRADUTOR DE DADOS" backTo="/" />
      <Page>
        <p className="muted">Role seus dados físicos e toque no número que saiu. O aplicativo mostra os símbolos. Depois escolha quais dados ficam mantidos.</p>
        <div className="seg" role="group" aria-label="Tipo de dado">
          {DIE_TYPES.map((d) => (
            <button key={d} aria-pressed={die === d} onClick={() => setDie(d)}>
              D{d}
            </button>
          ))}
        </div>
        <div className="facegrid" role="group" aria-label={`Faces do D${die}`}>
          {Array.from({ length: die }, (_, i) => i + 1).map((f) => (
            <button key={f} aria-label={`Adicionar D${die} face ${f}`} onClick={() => add(f)}>
              {f}
            </button>
          ))}
        </div>

        <section className="stack" aria-label="Resultados">
          <div className="row">
            <h2 className="grow">Resultados ({rolls.length})</h2>
            <button className="btn small" disabled={rolls.length === 0} onClick={() => setRolls([])}>
              Limpar
            </button>
          </div>
          {rolls.length === 0 && <p className="muted">Nenhum dado adicionado.</p>}
          {rolls.map((r) => {
            const s = translateFace(r.die, r.face);
            return (
              <div key={r.id} className={`roll${r.keep ? ' kept' : ''}`}>
                <input type="checkbox" style={{ width: 28, minHeight: 28 }} checked={r.keep} onChange={() => toggle(r.id)} aria-label={`Manter D${r.die} face ${r.face}`} />
                <b style={{ minWidth: 70 }}>
                  D{r.die} · {r.face}
                </b>
                <div className="grow">
                  <SymbolRow {...s} />
                </div>
                <button className="icon-btn" aria-label={`Remover D${r.die} face ${r.face}`} onClick={() => remove(r.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </section>

        <section className="card" aria-label="Total dos dados mantidos">
          <h2>Dados mantidos: {keptCount}</h2>
          <SymbolRow {...total} />
          <div className="row wrap muted" style={{ gap: 14 }}>
            <span className="sym"><SymbolIcon kind="success" size={16} /> Sucesso = joaninha</span>
            <span className="sym"><SymbolIcon kind="adapt" size={16} /> Adaptação = cervo</span>
            <span className="sym"><SymbolIcon kind="pressure" size={16} /> Pressão = lobo</span>
          </div>
        </section>
        <Notice tone="info">
          Regra geral: o Infectado mantém somente um dado por teste. Gastar um Ponto de Determinação, ativar uma Origem (uma vez por sessão) ou certas Características permitem manter dados adicionais (pág. 56–59 e 63). O aplicativo não limita a seleção; confira com o Assimilador.
        </Notice>
      </Page>
    </>
  );
}
