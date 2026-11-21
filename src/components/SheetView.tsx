import { useRef, useState, type KeyboardEvent } from 'react';
import { GENERATIONS, type Character } from '../lib/rules';
import { AptitudesPanel, GaugePanel, HealthPanel, InventoryPanel, TraitsList, type Update } from './panels';

const TABS = ['Ficha', 'Perfil', 'Características', 'Inventário', 'Notas'] as const;
type Tab = (typeof TABS)[number];

/**
 * Ficha completa. Sem `update` ela é somente leitura (visão do Assimilador).
 */
export function SheetView({ char, update }: { char: Character; update?: Update }) {
  const [tab, setTab] = useState<Tab>('Ficha');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = (t: Tab) => TABS.indexOf(t);
  const panel = (t: Tab) => ({ role: 'tabpanel' as const, id: `sheet-panel-${idx(t)}`, 'aria-labelledby': `sheet-tab-${idx(t)}`, tabIndex: 0 });
  // Padrão WAI-ARIA de abas: setas, Home e End movem o foco e ativam a aba.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = idx(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };
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
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            role="tab"
            id={`sheet-tab-${idx(t)}`}
            aria-controls={`sheet-panel-${idx(t)}`}
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={onTabKey}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ficha' && (
        <div className="stack" {...panel('Ficha')}>
          <div className="sheet-cols">
            <div className="stack">
              <HealthPanel char={char} update={update} />
            </div>
            <div className="stack">
              <GaugePanel char={char} update={update} />
              <AptitudesPanel char={char} update={update} evolve={evolve} />
            </div>
          </div>
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
        <div className="stack" {...panel('Perfil')}>
          {!ro && (
            <div className="card stack">
              <h2>Editar dados do personagem</h2>
              <label className="field">Nome
                <input value={char.name} maxLength={80} onChange={(e) => update!({ name: e.target.value })} />
              </label>
              <label className="field">Evento Marcante
                <input value={char.event} onChange={(e) => update!({ event: e.target.value })} />
              </label>
              <label className="field">Ocupação
                <input value={char.occupation} onChange={(e) => update!({ occupation: e.target.value })} />
              </label>
              <label className="field">Geração
                <select value={char.generation} onChange={(e) => update!({ generation: e.target.value as Character['generation'] })}>
                  {GENERATIONS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
              <label className="field">Idade (opcional)
                <input inputMode="numeric" value={char.age} onChange={(e) => update!({ age: e.target.value.replace(/\\D/g, '').slice(0, 3) })} />
              </label>
              <p className="muted">As alterações são salvas automaticamente e sincronizadas com a mesa quando houver conexão.</p>
            </div>
          )}
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
        <div {...panel('Características')}>
          <TraitsList char={char} update={update} evolve={evolve} />
          {!ro && !evolve && <p className="muted" style={{ marginTop: 10 }}>Para adicionar ou remover Características, ative o Modo evolução na aba Ficha.</p>}
        </div>
      )}

      {tab === 'Inventário' && (
        <div {...panel('Inventário')}>
          <InventoryPanel char={char} update={update} />
        </div>
      )}

      {tab === 'Notas' && (
        <div className="stack" {...panel('Notas')}>
          <h2>Anotações</h2>
          <textarea aria-label="Anotações" rows={10} value={char.notes} readOnly={ro} onChange={(e) => update?.({ notes: e.target.value })} />
        </div>
      )}
    </div>
  );
}
