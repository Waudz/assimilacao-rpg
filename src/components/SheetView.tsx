import { useState } from 'react';
import { GENERATIONS, type Character } from '../lib/rules';
import { AptitudesPanel, GaugePanel, HealthPanel, InventoryPanel, TraitsList, type Update } from './panels';

const TABS = ['Ficha', 'Perfil', 'Características', 'Inventário', 'Notas'] as const;
type Tab = (typeof TABS)[number];

/**
 * Ficha completa. Sem `update` ela é somente leitura (visão do Assimilador).
 */
export function SheetView({ char, update }: { char: Character; update?: Update }) {
  const [tab, setTab] = useState<Tab>('Ficha');
  const [evolve, setEvolve] = useState(false);
  const gen = GENERATIONS.find((g) => g.id === char.generation);
  const ro = !update;
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 2 }}>
        <h1>{char.name || 'Sem nome'}</h1>
        <p className="muted">
          {[char.occupation, gen?.label, char.age && `${char.age} anos`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label="Seções da ficha">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ficha' && (
        <div className="stack" role="tabpanel">
          <HealthPanel char={char} update={update} />
          <GaugePanel char={char} update={update} />
          <AptitudesPanel char={char} update={update} evolve={evolve} />
          {!ro && (
            <label className="row card flat" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 24, minHeight: 24 }} checked={evolve} onChange={(e) => setEvolve(e.target.checked)} />
              <span className="grow">
                <b>Modo evolução</b>
                <br />
                <span className="muted">Libera ajuste manual de Aptidões e Características.</span>
              </span>
            </label>
          )}
        </div>
      )}

      {tab === 'Perfil' && (
        <div className="stack" role="tabpanel">
          <div className="card">
            <h2>Origens</h2>
            <p>
              <b>Evento Marcante:</b> {char.event || '—'}
            </p>
            <p>
              <b>Ocupação:</b> {char.occupation || '—'}
            </p>
            <p>
              <b>Geração:</b> {gen?.label ?? '—'} {char.age && `· ${char.age} anos`}
            </p>
          </div>
          <div className="card">
            <h2>Propósitos</h2>
            {char.personalGoals.map((g, i) => (
              <p key={i}>
                <b>Pessoal {i + 1}:</b> {g || '—'}
              </p>
            ))}
            <p>
              <b>Coletivo:</b> {char.collectiveGoal || '—'}
            </p>
            {!ro && <p className="muted">Quando um Propósito Pessoal é realizado, o Assimilador o substitui por um novo (pág. 79). Edite na criação ou pelo botão abaixo.</p>}
          </div>
          {!ro && (
            <div className="card">
              <h3>Editar Propósitos</h3>
              {char.personalGoals.map((g, i) => (
                <label className="field" key={i}>
                  Propósito Pessoal {i + 1}
                  <input value={g} onChange={(e) => update!((c) => ({ ...c, personalGoals: c.personalGoals.map((v, k) => (k === i ? e.target.value : v)) as [string, string] }))} />
                </label>
              ))}
              <label className="field">
                Propósito Coletivo
                <input value={char.collectiveGoal} onChange={(e) => update!({ collectiveGoal: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      )}

      {tab === 'Características' && (
        <div role="tabpanel">
          <TraitsList char={char} update={update} evolve={evolve} />
          {!ro && !evolve && <p className="muted" style={{ marginTop: 10 }}>Para adicionar ou remover Características, ative o Modo evolução na aba Ficha.</p>}
        </div>
      )}

      {tab === 'Inventário' && (
        <div role="tabpanel">
          <InventoryPanel char={char} update={update} />
        </div>
      )}

      {tab === 'Notas' && (
        <div role="tabpanel" className="stack">
          <h2>Anotações</h2>
          <textarea aria-label="Anotações" rows={10} value={char.notes} readOnly={ro} onChange={(e) => update?.({ notes: e.target.value })} />
        </div>
      )}
    </div>
  );
}
