import { useMemo, useState } from 'react';
import { Header, Notice, NumStepper, Page, Pips, Field } from '../components/ui';
import { TraitPicker, type Update } from '../components/panels';
import { EQUIPMENT_PACKS, PACK_NAMES, TRAIT_BY_ID, describeRequirements, missingRequirements, traitsCost } from '../lib/catalog';
import { useCharacterEditor } from '../lib/hooks';
import { go } from '../lib/router';
import {
  GENERATIONS,
  INSTINCTS,
  INSTINCT_CREATION_MAX,
  INSTINCT_FREE_POINTS,
  INSTINCT_START,
  KNOWLEDGE,
  PRACTICES,
  SKILL_CREATION_MAX,
  SKILL_POINTS,
  START_XP,
  STEPS,
  clamp,
  healthLevels,
  healthPerLevel,
  randomId,
  skillUpgradeXp,
  sum,
  upgradeCost,
  validateStep,
  type Character,
} from '../lib/rules';

const hasEstagio = (c: Character) => c.traits.includes('estagio-avancado');

export function xpSpent(c: Character) {
  return traitsCost(c) + skillUpgradeXp(c);
}

/** Valida tudo; devolve a primeira etapa com problema e as mensagens. */
export function validateAll(c: Character): { step: number; errors: string[] } | null {
  for (let s = 0; s < STEPS.length; s++) {
    const errors = validateStep(c, s, xpSpent(c));
    if (s === 7) {
      for (const id of c.traits) {
        const t = TRAIT_BY_ID[id];
        if (!t) continue;
        const miss = missingRequirements(c, t);
        if (miss.length) errors.push(`${t.name}: requisito não atendido (${describeRequirements(t)}).`);
      }
    }
    if (errors.length) return { step: s, errors };
  }
  return null;
}

export function finalizeCharacter(c: Character): Character {
  const assim = clamp(c.initialAssimilation + (hasEstagio(c) ? 1 : 0), 0, 10);
  const pack = EQUIPMENT_PACKS[c.equipmentPack] ?? [];
  const inventory = c.inventory.length ? c.inventory : pack.map((name) => ({ id: randomId(), name, qty: 1, note: '' }));
  return { ...c, status: 'ready', step: STEPS.length - 1, determinationLevel: 10 - assim, determinationSpent: 0, assimilationSpent: 0, damage: 0, inventory };
}

export function CreatePage({ id }: { id: string }) {
  const { char, update, flush } = useCharacterEditor(id);
  const [errors, setErrors] = useState<string[]>([]);

  if (char === undefined) return <><Header title="CRIAR INFECTADO" backTo="/" /><Page><p>Carregando…</p></Page></>;
  if (char === null) return <><Header title="CRIAR INFECTADO" backTo="/" /><Page><Notice tone="bad">Ficha não encontrada.</Notice><button className="btn" onClick={() => go('/')}>Início</button></Page></>;

  const step = clamp(char.step, 0, STEPS.length - 1);
  const setStep = (s: number) => update({ step: s });
  const last = step === STEPS.length - 1;

  const next = () => {
    const e = validateStep(char, step, xpSpent(char));
    if (e.length) return setErrors(e);
    setErrors([]);
    if (!last) return setStep(step + 1);
    const all = validateAll(char);
    if (all) {
      setErrors(all.errors);
      setStep(all.step);
      return;
    }
    update(finalizeCharacter(char));
    void flush().then(() => go(`/sheet/${char.id}`, true));
  };

  return (
    <>
      <Header title={`CRIAR INFECTADO · ${step + 1}/${STEPS.length}`} backTo="/" />
      <Page>
        <div className="progress" aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'cur' : ''} />
          ))}
        </div>
        <h1>{STEPS[step]}</h1>
        {errors.length > 0 && (
          <Notice tone="bad">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </Notice>
        )}
        <StepBody step={step} char={char} update={update} />
        <p className="muted">Salvo automaticamente neste dispositivo. Você pode sair e continuar depois.</p>
      </Page>
      <div style={{ height: 70 }} />
      <div className="sticky-actions" style={{ maxWidth: 640, margin: '0 auto' }}>
        <button className="btn" disabled={step === 0} onClick={() => { setErrors([]); setStep(step - 1); }}>
          Voltar
        </button>
        <button className="btn primary" onClick={next}>
          {last ? 'Concluir Infectado' : 'Próximo'}
        </button>
      </div>
    </>
  );
}

function StepBody({ step, char, update }: { step: number; char: Character; update: Update }) {
  switch (step) {
    case 0:
      return (
        <>
          <p className="muted">Como se chama o seu Infectado? (pág. 75)</p>
          <Field label="Nome">
            <input autoFocus value={char.name} onChange={(e) => update({ name: e.target.value })} autoComplete="off" />
          </Field>
        </>
      );
    case 1:
      return (
        <>
          <p className="muted">Origens são duas escolhas curtas: um Evento Marcante (passado) e uma Ocupação (presente). Basta uma frase (pág. 76–77).</p>
          <Field label="Evento Marcante">
            <input value={char.event} placeholder="Ex.: Fuga do extermínio do antigo grupo" onChange={(e) => update({ event: e.target.value })} />
          </Field>
          <Field label="Ocupação">
            <input value={char.occupation} placeholder="Ex.: Batedor" onChange={(e) => update({ occupation: e.target.value })} />
          </Field>
        </>
      );
    case 2:
      return (
        <>
          <p className="muted">Quando o seu Infectado nasceu, em relação ao Colapso (pág. 78). O Assimilador indica em que ponto da cronologia a campanha se passa.</p>
          <div className="stack" role="radiogroup" aria-label="Geração">
            {GENERATIONS.map((g) => (
              <button key={g.id} role="radio" aria-checked={char.generation === g.id} className="choice" style={char.generation === g.id ? { background: 'var(--color-instinct)', color: '#fff8ea' } : undefined} onClick={() => update({ generation: g.id })}>
                <b>{g.label}</b>
                <span style={char.generation === g.id ? { color: '#fff8ea' } : undefined}>{g.hint}</span>
              </button>
            ))}
          </div>
          <Field label="Idade (opcional)">
            <input inputMode="numeric" value={char.age} onChange={(e) => update({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </Field>
        </>
      );
    case 3:
      return (
        <>
          <p className="muted">Propósitos indicam para onde o Infectado quer seguir. São frases curtas (pág. 79). O Propósito Coletivo é definido com o grupo e o Assimilador.</p>
          {[0, 1].map((i) => (
            <Field key={i} label={`Propósito Pessoal ${i + 1}`}>
              <input value={char.personalGoals[i]} onChange={(e) => update({ personalGoals: char.personalGoals.map((v, k) => (k === i ? e.target.value : v)) as [string, string] })} />
            </Field>
          ))}
          <Field label="Propósito Coletivo">
            <input value={char.collectiveGoal} onChange={(e) => update({ collectiveGoal: e.target.value })} />
          </Field>
        </>
      );
    case 4:
      return <AptitudeStep char={char} update={update} />;
    case 5:
      return <GaugeStep char={char} update={update} />;
    case 6:
      return <HealthStep char={char} />;
    case 7:
      return <TraitStep char={char} update={update} />;
    default:
      return <EquipmentStep char={char} update={update} />;
  }
}

function AptitudeStep({ char, update }: { char: Character; update: Update }) {
  const iUsed = sum(char.instincts) - INSTINCT_START * 6;
  const sUsed = sum(char.skills);
  const setI = (i: number, v: number) => update({ instincts: char.instincts.map((x, k) => (k === i ? v : x)) });
  const setS = (i: number, v: number) => update({ skills: char.skills.map((x, k) => (k === i ? v : x)) });
  const row = (name: string, base: number, diamond: boolean, ctl: React.ReactNode) => (
    <div className="apt" key={name}>
      <span className="name">{name}</span>
      <Pips base={base} diamond={diamond} />
      {ctl}
    </div>
  );
  return (
    <>
      <p className="muted">Cada Instinto começa com 1 e você distribui mais 3 pontos (máx. {INSTINCT_CREATION_MAX} por Instinto). Conhecimentos e Práticas: {SKILL_POINTS} pontos, máx. {SKILL_CREATION_MAX} em cada (pág. 80).</p>
      <section className="card">
        <div className="group-head instinct">
          <span>Instintos</span>
          <span aria-live="polite">{iUsed}/{INSTINCT_FREE_POINTS} pontos livres usados</span>
        </div>
        <div className="grid3 edit">
          {INSTINCTS.map((n, i) => row(n, char.instincts[i], false, <NumStepper label={n} value={char.instincts[i]} min={INSTINCT_START} max={Math.min(INSTINCT_CREATION_MAX, char.instincts[i] + (INSTINCT_FREE_POINTS - iUsed))} onChange={(v) => setI(i, v)} />))}
        </div>
      </section>
      <section className="card">
        <div className="group-head skill">
          <span>Conhecimentos</span>
          <span aria-live="polite">{sUsed}/{SKILL_POINTS} pontos</span>
        </div>
        <div className="grid3 edit">
          {KNOWLEDGE.map((n, i) => row(n, char.skills[i], true, <NumStepper label={n} value={char.skills[i]} min={0} max={Math.min(SKILL_CREATION_MAX, char.skills[i] + (SKILL_POINTS - sUsed))} onChange={(v) => setS(i, v)} />))}
        </div>
        <div className="group-head skill">
          <span>Práticas</span>
        </div>
        <div className="grid3 edit">
          {PRACTICES.map((n, i) => row(n, char.skills[6 + i], true, <NumStepper label={n} value={char.skills[6 + i]} min={0} max={Math.min(SKILL_CREATION_MAX, char.skills[6 + i] + (SKILL_POINTS - sUsed))} onChange={(v) => setS(6 + i, v)} />))}
        </div>
      </section>
    </>
  );
}

function GaugeStep({ char, update }: { char: Character; update: Update }) {
  const assim = clamp(char.initialAssimilation + (hasEstagio(char) ? 1 : 0), 0, 10);
  return (
    <>
      <p className="muted">
        Recomenda-se Determinação 9 e Assimilação 1. O Assimilador pode aumentar a Assimilação do grupo e reduzir a Determinação na mesma proporção; a soma é sempre 10 (pág. 81).
      </p>
      <div className="card">
        <div className="row">
          <span className="grow">Nível inicial de Assimilação (definido pelo Assimilador)</span>
          <NumStepper label="Assimilação inicial" value={char.initialAssimilation} min={1} max={9} onChange={(v) => update({ initialAssimilation: v })} />
        </div>
        <div className="grid2">
          <div className="stack" style={{ alignItems: 'center' }}>
            <span className="muted">Determinação</span>
            <span className="big-num" style={{ color: 'var(--color-det)' }}>{10 - assim}</span>
          </div>
          <div className="stack" style={{ alignItems: 'center' }}>
            <span className="muted">Assimilação</span>
            <span className="big-num" style={{ color: 'var(--color-assim)' }}>{assim}</span>
          </div>
        </div>
        {hasEstagio(char) && <Notice tone="info">Estágio Avançado soma +1 de Assimilação inicial (com aprovação do Assimilador).</Notice>}
        {char.initialAssimilation > 1 && <Notice tone="warn">Se começar com níveis de Assimilação, o livro pede um Teste de Assimilação para definir as mutações (pág. 81 e 124). Anote o resultado em Características.</Notice>}
      </div>
    </>
  );
}

function HealthStep({ char }: { char: Character }) {
  return (
    <>
      <p className="muted">
        Cada um dos seis níveis tem 1 + Potência + Resolução pontos (pág. 82). Seu Infectado tem <b>{healthPerLevel(char)}</b> por nível, <b>{healthPerLevel(char) * 6}</b> no total. Nada a preencher aqui.
      </p>
      <div className="stack">
        {healthLevels(char).map((l) => (
          <div key={l.level} className={`hlevel ${l.tone}`}>
            <div className="head">
              <span className="num">{l.level}</span>
              <span className="grow">{l.name}</span>
            </div>
            <div className="drops" aria-hidden="true">
              {Array.from({ length: l.max }, (_, i) => (
                <span key={i} className="drop on" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TraitStep({ char, update }: { char: Character; update: Update }) {
  const spent = xpSpent(char);
  const remaining = START_XP - spent;
  const skillNames = [...KNOWLEDGE, ...PRACTICES];
  const ups = (i: number, d: 1 | -1) =>
    update((c) => {
      const cur = c.skillUps[i];
      const lvl = c.skills[i] + cur;
      if (d === 1 && lvl >= 5) return c;
      if (d === -1 && cur <= 0) return c;
      return { ...c, skillUps: c.skillUps.map((u, k) => (k === i ? u + d : u)) };
    });
  const toggle = (id: string) =>
    update((c) => {
      const has = c.traits.includes(id);
      return { ...c, traits: has ? c.traits.filter((x) => x !== id) : [...c.traits, id] };
    });
  return (
    <>
      <p className="muted">
        Você tem {START_XP} pontos de experiência para Características (requisitos precisam ser cumpridos) ou para melhorar Conhecimentos/Práticas, pelo dobro do nível desejado (pág. 83).
      </p>
      <div className="card" style={{ position: 'sticky', top: 62, zIndex: 10 }}>
        <div className="row">
          <b className="grow">Experiência</b>
          <span className="big-num" style={{ fontSize: '2rem', color: remaining < 0 ? 'var(--color-bad)' : undefined }} aria-live="polite">
            {remaining}/{START_XP}
          </span>
        </div>
      </div>
      <h2>Melhorar Conhecimentos e Práticas</h2>
      <div className="stack">
        {skillNames.map((n, i) => {
          const lvl = char.skills[i] + char.skillUps[i];
          return (
            <div className="row card" key={n} style={{ padding: 8 }}>
              <span className="grow">
                {n} <b>{lvl}</b>
              </span>
              <button className="btn small" aria-label={`Reduzir melhoria de ${n}`} disabled={char.skillUps[i] === 0} onClick={() => ups(i, -1)}>
                −
              </button>
              <button className="btn small" aria-label={`Melhorar ${n} para ${lvl + 1} (custa ${upgradeCost(lvl + 1)})`} disabled={lvl >= 5 || upgradeCost(lvl + 1) > remaining} onClick={() => ups(i, 1)}>
                +1 ({upgradeCost(lvl + 1)})
              </button>
            </div>
          );
        })}
      </div>
      <h2>Características</h2>
      <TraitPicker char={char} remainingXp={remaining} enforce onToggle={toggle} onNote={(id, text) => update((c) => ({ ...c, traitNotes: { ...c.traitNotes, [id]: text } }))} />
      <Field label="Outras Características (opcional, texto livre)">
        <textarea rows={2} value={char.customTraits} onChange={(e) => update({ customTraits: e.target.value })} />
      </Field>
    </>
  );
}

function EquipmentStep({ char, update }: { char: Character; update: Update }) {
  const [extra, setExtra] = useState('');
  const pack = useMemo(() => EQUIPMENT_PACKS[char.equipmentPack] ?? [], [char.equipmentPack]);
  return (
    <>
      <p className="muted">
        Escolha um pacote inicial. Se o Assimilador permitir, você pode somar até três equipamentos comuns ou um artefato, respeitando o teto de Escassez da mesa (pág. 90). Vestuário, cantil e mochila já estão incluídos.
      </p>
      <div className="stack" role="radiogroup" aria-label="Pacote de equipamentos">
        {PACK_NAMES.map((p) => {
          const on = char.equipmentPack === p;
          return (
            <button key={p} role="radio" aria-checked={on} className="choice" style={on ? { background: 'var(--color-instinct)', color: '#fff8ea' } : undefined} onClick={() => { setExtra(''); update({ equipmentPack: p, inventory: [] }); }}>
              <b>{p}</b>
              <span style={on ? { color: '#fff8ea' } : undefined}>{EQUIPMENT_PACKS[p].join(' · ')}</span>
            </button>
          );
        })}
      </div>
      {pack.length > 0 && (
        <Field label="Equipamentos extras permitidos pelo Assimilador (um por linha, opcional)">
          <textarea
            rows={3}
            value={extra}
            onChange={(e) => {
              setExtra(e.target.value);
              update((c) => ({
                ...c,
                inventory: [...EQUIPMENT_PACKS[c.equipmentPack].map((name) => ({ id: randomId(), name, qty: 1, note: '' })), ...e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ id: randomId(), name, qty: 1, note: '' }))],
              }));
            }}
          />
        </Field>
      )}
      <Notice tone="info">Ao concluir, os itens entram no Inventário da ficha, onde podem ser atualizados durante o jogo.</Notice>
    </>
  );
}
