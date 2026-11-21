import { useState } from 'react';
import { describeRequirements, missingRequirements, TRAIT_BY_ID, TRAITS, type Trait } from '../lib/catalog';
import {
  applyDamage,
  applyHealing,
  assimilationAvailable,
  assimilationLevel,
  clamp,
  currentHealthLevel,
  determinationAvailable,
  healthCurrent,
  healthLevels,
  healthMax,
  healthPerLevel,
  INSTINCT_MAX,
  INSTINCTS,
  KNOWLEDGE,
  PRACTICES,
  randomId,
  regenAmount,
  SKILL_MAX,
  instinctValue,
  skillValue,
  type Character,
  type InventoryItem,
} from '../lib/rules';
import { NumStepper, Pips } from './ui';

export type Update = (patch: Partial<Character> | ((c: Character) => Character)) => void;

// ------------------------------------------------------------------ Saúde
export function HealthPanel({ char, update }: { char: Character; update?: Update }) {
  const [amount, setAmount] = useState(1);
  const levels = healthLevels(char);
  const lvl = currentHealthLevel(char);
  const dead = lvl === 0;
  return (
    <section className="card" aria-label="Saúde">
      <div className="row">
        <div className="grow">
          <h2>Saúde</h2>
          <p className="muted">
            {healthPerLevel(char)} pontos por nível (1 + Potência + Resolução) · Total {healthCurrent(char)}/{healthMax(char)}
          </p>
        </div>
        <div className="big-num" aria-label={`${healthCurrent(char)} de ${healthMax(char)} pontos de Saúde`}>
          {healthCurrent(char)}
        </div>
      </div>
      {dead ? (
        <div className="notice bad">Todos os pontos de Saúde foram perdidos: o Infectado não suportou os danos.</div>
      ) : (
        <p>
          <b>Nível {lvl} — {levels[6 - lvl].name}</b> · {levels[6 - lvl].remaining}/{levels[6 - lvl].max} pontos neste nível
        </p>
      )}
      {update && (
        <div className="stack">
          <div className="row">
            <span className="muted grow">Quantidade</span>
            <NumStepper label="quantidade de pontos" value={amount} min={1} max={Math.max(1, healthPerLevel(char))} onChange={setAmount} />
          </div>
          <div className="grid2">
            <button className="btn danger" onClick={() => update((c) => applyDamage(c, amount))} disabled={dead}>
              − Sofrer dano ({amount})
            </button>
            <button className="btn" onClick={() => update((c) => applyHealing(c, amount))} disabled={char.damage === 0}>
              + Curar ({amount})
            </button>
          </div>
          <button className="btn block small" onClick={() => update((c) => applyHealing(c, regenAmount(c)))} disabled={char.damage === 0} title="Pág. 65 e 67">
            Ativar Recuperação (+{regenAmount(char)} pontos)
          </button>
          <p className="muted">Recuperação: níveis 6–5 após cada repouso completo; 4–3 após uma semana; 2–1 só com tratamento médico (pág. 66–67).</p>
        </div>
      )}
      <div className="stack">
        {levels.map((l) => (
          <div key={l.level} className={`hlevel ${l.tone}${l.level === lvl ? ' current' : ''}${l.status === 'lost' ? ' lost' : ''}`} aria-current={l.level === lvl ? 'true' : undefined}>
            <div className="head">
              <span className="num">{l.level}</span>
              <span className="grow">{l.name}</span>
              <span style={{ fontFamily: 'system-ui', fontSize: '.85rem' }}>
                {l.remaining}/{l.max}
              </span>
            </div>
            <div className="drops" aria-hidden="true">
              {Array.from({ length: l.max }, (_, i) => (
                <span key={i} className={`drop${i < l.remaining ? ' on' : ''}`} />
              ))}
            </div>
            <div className="note">{l.recovery}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Cabo de Guerra
export function GaugePanel({ char, update }: { char: Character; update?: Update }) {
  const det = char.determinationLevel;
  const assim = assimilationLevel(char);
  const detAvail = determinationAvailable(char);
  const assimAvail = assimilationAvailable(char);
  const set = (fn: (c: Character) => Character) => update?.(fn);
  const shift = (delta: number) =>
    set((c) => {
      const d = clamp(c.determinationLevel + delta, 0, 10);
      return { ...c, determinationLevel: d, determinationSpent: Math.min(c.determinationSpent, d), assimilationSpent: Math.min(c.assimilationSpent, 10 - d) };
    });
  return (
    <section className="card" aria-label="Cabo de Guerra">
      <h2>Cabo de Guerra</h2>
      <div className="grid2">
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className="muted">Determinação</span>
          <span className="big-num" style={{ color: 'var(--color-det)' }} aria-label={`Determinação: ${detAvail} pontos de ${det}`}>
            {detAvail}
          </span>
          <span className="muted">Nível {det}</span>
          {update && (
            <div className="row">
              <button className="btn small" aria-label="Gastar 1 ponto de Determinação" disabled={detAvail === 0} onClick={() => set((c) => ({ ...c, determinationSpent: c.determinationSpent + 1 }))}>
                − Gastar
              </button>
              <button className="btn small" aria-label="Recuperar 1 ponto de Determinação" disabled={char.determinationSpent === 0} onClick={() => set((c) => ({ ...c, determinationSpent: c.determinationSpent - 1 }))}>
                + Voltar
              </button>
            </div>
          )}
        </div>
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className="muted">Assimilação</span>
          <span className="big-num" style={{ color: 'var(--color-assim)' }} aria-label={`Assimilação: ${assimAvail} pontos de ${assim}`}>
            {assimAvail}
          </span>
          <span className="muted">Nível {assim}</span>
          {update && (
            <div className="row">
              <button className="btn small" aria-label="Gastar 1 ponto de Assimilação" disabled={assimAvail === 0} onClick={() => set((c) => ({ ...c, assimilationSpent: c.assimilationSpent + 1 }))}>
                − Gastar
              </button>
              <button className="btn small" aria-label="Recuperar 1 ponto de Assimilação" disabled={char.assimilationSpent === 0} onClick={() => set((c) => ({ ...c, assimilationSpent: c.assimilationSpent - 1 }))}>
                + Voltar
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="gauge" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < det ? 'det' : 'assim'} />
        ))}
      </div>
      <p className="muted">A soma dos níveis é sempre 10. Níveis são o total; pontos são o recurso gasto e recuperado (pág. 58 e 81).</p>
      {detAvail === 0 && <div className="notice warn">Estado Suscetível: sem pontos de Determinação, não é possível gastá-la até concluir a Assimilação (pág. 81).</div>}
      {update && (
        <div className="grid2">
          <button className="btn small" disabled={assim >= 10} onClick={() => shift(-1)}>
            Assimilação avança (nível +1)
          </button>
          <button className="btn small" disabled={det >= 10} onClick={() => shift(1)}>
            Determinação avança (nível +1)
          </button>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Aptidões
export function AptitudesPanel({ char, update, evolve = false }: { char: Character; update?: Update; evolve?: boolean }) {
  const editing = Boolean(update && evolve);
  const group = (title: string, cls: 'instinct' | 'skill', names: readonly string[], offset: number, isInstinct: boolean, diamond: boolean) => (
    <div>
      <div className={`group-head ${cls}`}>
        <span>{title}</span>
      </div>
      <div className={`grid3${editing ? ' edit' : ''}`} style={{ marginTop: 6 }}>
        {names.map((n, i) => {
          const idx = offset + i;
          const base = isInstinct ? char.instincts[idx] : char.skills[idx];
          const ups = isInstinct ? (char.instinctUps?.[idx] ?? 0) : (char.skillUps?.[idx] ?? 0);
          const total = isInstinct ? instinctValue(char, idx) : skillValue(char, idx);
          const min = isInstinct ? 1 : 0;
          const max = isInstinct ? INSTINCT_MAX : SKILL_MAX;
          return (
            <div className="apt" key={n}>
              <span className="name">{n}</span>
              <Pips base={base} ups={ups} max={5} diamond={diamond} />
              {editing ? (
                <NumStepper
                  label={n}
                  value={total}
                  min={min}
                  max={max}
                  onChange={(v) =>
                    update!((c) =>
                      isInstinct
                        ? { ...c, instinctUps: c.instinctUps.map((u, k) => (k === idx ? v - c.instincts[idx] : u)) }
                        : { ...c, skillUps: c.skillUps.map((u, k) => (k === idx ? v - c.skills[idx] : u)) },
                    )
                  }
                />
              ) : (
                <strong aria-label={`${n}: ${total}`}>{total}</strong>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <section className="card" aria-label="Aptidões">
      <h2>Aptidões</h2>
      {group('Instintos', 'instinct', INSTINCTS, 0, true, false)}
      {group('Conhecimentos', 'skill', KNOWLEDGE, 0, false, true)}
      {group('Práticas', 'skill', PRACTICES, 6, false, true)}
      {editing && <p className="muted">Evolução manual: ajuste conforme a progressão combinada com o Assimilador. Valores em azul-petróleo foram adquiridos depois da criação.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ Características
export function TraitCard({ t, note, children }: { t: Trait; note?: string; children?: React.ReactNode }) {
  return (
    <div className="card flat">
      <div className="row">
        <h3 className="grow">{t.name}</h3>
        <span className="badge">{t.cost} {t.cost === 1 ? 'ponto' : 'pontos'}</span>
      </div>
      <p className="muted">
        {describeRequirements(t)} · pág. {t.page}
      </p>
      <p>{t.summary}</p>
      {note && <p className="muted">Escolha: {note}</p>}
      {children}
    </div>
  );
}

export function TraitsList({ char, update, evolve = false }: { char: Character; update?: Update; evolve?: boolean }) {
  const [picking, setPicking] = useState(false);
  const owned = char.traits.map((id) => TRAIT_BY_ID[id]).filter(Boolean);
  return (
    <section className="stack">
      <h2>Características de Infectado</h2>
      {owned.length === 0 && !char.customTraits && <p className="muted">Nenhuma Característica registrada.</p>}
      {owned.map((t) => (
        <TraitCard key={t.id} t={t} note={char.traitNotes[t.id]}>
          {update && evolve && (
            <button className="btn small danger" onClick={() => update((c) => ({ ...c, traits: c.traits.filter((x) => x !== t.id) }))}>
              Remover
            </button>
          )}
        </TraitCard>
      ))}
      {(char.customTraits || (update && evolve)) && (
        <label className="field">
          Outras Características / Assimilações / mutações (texto livre)
          <textarea rows={3} value={char.customTraits} readOnly={!update} onChange={(e) => update?.({ customTraits: e.target.value })} />
        </label>
      )}
      {update && evolve && (
        <>
          <button className="btn" onClick={() => setPicking((p) => !p)}>
            {picking ? 'Fechar catálogo' : '+ Adicionar do catálogo'}
          </button>
          {picking && (
            <TraitPicker
              char={char}
              onToggle={(id) => update((c) => ({ ...c, traits: c.traits.includes(id) ? c.traits.filter((x) => x !== id) : [...c.traits, id] }))}
              onNote={(id, text) => update((c) => ({ ...c, traitNotes: { ...c.traitNotes, [id]: text } }))}
              enforce={false}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Catálogo com requisitos. `enforce` bloqueia seleção quando faltam requisitos (criação). */
export function TraitPicker({
  char,
  onToggle,
  onNote,
  enforce,
  remainingXp,
}: {
  char: Character;
  onToggle: (id: string) => void;
  onNote: (id: string, text: string) => void;
  enforce: boolean;
  remainingXp?: number;
}) {
  const [cost, setCost] = useState<number | 0>(0);
  const list = TRAITS.filter((t) => (!cost || t.cost === cost) && (enforce || !t.creationOnly || char.traits.includes(t.id)));
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Filtrar por custo">
        {[0, 1, 2, 3, 4, 5].map((c) => (
          <button key={c} aria-pressed={cost === c} onClick={() => setCost(c)}>
            {c === 0 ? 'Todas' : c}
          </button>
        ))}
      </div>
      {list.map((t) => {
        const has = char.traits.includes(t.id);
        const missing = missingRequirements(char, t);
        const unaffordable = remainingXp !== undefined && !has && t.cost > remainingXp;
        const blocked = enforce && !has && (missing.length > 0 || unaffordable);
        return (
          <TraitCard key={t.id} t={t} note={t.needsNote}>
            {missing.length > 0 && <p className="muted" style={{ color: 'var(--color-bad)' }}>Requisito não atendido: {missing.map((q) => `${q.any.join(' ou ')} ${q.min}+`).join(', ')}</p>}
            {unaffordable && <p className="muted" style={{ color: 'var(--color-bad)' }}>Experiência insuficiente.</p>}
            {has && t.needsNote && (
              <label className="field">
                {t.needsNote}
                <input value={char.traitNotes[t.id] ?? ''} onChange={(e) => onNote(t.id, e.target.value)} />
              </label>
            )}
            <button className={`btn small${has ? '' : ' primary'}`} disabled={blocked} onClick={() => onToggle(t.id)} aria-pressed={has}>
              {has ? '✓ Selecionada (remover)' : 'Selecionar'}
            </button>
          </TraitCard>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Inventário
export function InventoryPanel({ char, update }: { char: Character; update?: Update }) {
  const [name, setName] = useState('');
  const edit = (id: string, patch: Partial<InventoryItem>) => update?.((c) => ({ ...c, inventory: c.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    update?.((c) => ({ ...c, inventory: [...c.inventory, { id: randomId(), name: n, qty: 1, note: '' }] }));
    setName('');
  };
  return (
    <section className="stack">
      <h2>Inventário</h2>
      <p className="muted">Pacote inicial: {char.equipmentPack || '—'}. Vestuário, cantil e mochila não precisam ser anotados (pág. 90).</p>
      {char.inventory.length === 0 && <p className="muted">Nenhum item.</p>}
      {char.inventory.map((it) => (
        <div className="card" key={it.id}>
          <div className="row">
            {update ? <input aria-label="Nome do item" className="grow" value={it.name} onChange={(e) => edit(it.id, { name: e.target.value })} /> : <b className="grow">{it.name}</b>}
            {update ? <NumStepper label={`quantidade de ${it.name}`} value={it.qty} min={0} max={99} onChange={(v) => edit(it.id, { qty: v })} /> : <span>×{it.qty}</span>}
          </div>
          {update ? (
            <div className="row">
              <input aria-label={`Observação de ${it.name}`} placeholder="Observação" className="grow" value={it.note} onChange={(e) => edit(it.id, { note: e.target.value })} />
              <button className="btn small danger" aria-label={`Remover ${it.name}`} onClick={() => update((c) => ({ ...c, inventory: c.inventory.filter((x) => x.id !== it.id) }))}>
                ✕
              </button>
            </div>
          ) : (
            it.note && <p className="muted">{it.note}</p>
          )}
        </div>
      ))}
      {update && (
        <div className="row">
          <input aria-label="Novo item" className="grow" placeholder="Novo item" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add}>
            Adicionar
          </button>
        </div>
      )}
    </section>
  );
}
