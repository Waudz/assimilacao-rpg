import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Button, Card, EmptyState, Header, Notice, Page, SectionTitle, SymbolIcon, SymbolRow, SYMBOL_NAMES, SYMBOL_SHORT, type SymbolKind } from '../components/ui';
import { DIE_TYPES, sumKept, translateFace, type DieType, type Roll } from '../lib/dice';
import { randomId } from '../lib/rules';\nimport { toolReturnPath } from '../lib/router';

/** Total de um símbolo: o número "pulsa" sempre que muda, para o resultado ser percebido na hora. */
function Total({ kind, value }: { kind: SymbolKind; value: number }) {
  const prev = useRef(value);
  const changed = prev.current !== value;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  return (
    <div className={`total ${kind}${value === 0 ? ' zero' : ''}`} title={SYMBOL_NAMES[kind]}>
      <SymbolIcon kind={kind} size={34} />
      <span key={value} className={`n${changed ? ' bump' : ''}`} aria-hidden="true">
        {value}
      </span>
      <span className="l">{SYMBOL_SHORT[kind]}</span>
    </div>
  );
}

export function DicePage() {
  const [die, setDie] = useState<DieType>(6);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = sumKept(rolls);
  const keptCount = rolls.filter((r) => r.keep).length;

  const add = (face: number) => {
    setRolls((r) => [...r, { id: randomId(), die, face, keep: false }]);
    setFlash(face); // feedback imediato no botão tocado
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 220);
  };
  const toggle = (id: string) => setRolls((r) => r.map((x) => (x.id === id ? { ...x, keep: !x.keep } : x)));
  const remove = (id: string) => setRolls((r) => r.filter((x) => x.id !== id));

  return (
    <>
      <Header title="TRADUTOR DE DADOS" backTo={toolReturnPath()} />
      <Page>
        <p className="muted">Role seus dados físicos e toque no número que saiu. Depois toque nos resultados que ficam mantidos — o total é atualizado na hora.</p>
        <div className="seg" role="group" aria-label="Tipo de dado">
          {DIE_TYPES.map((d) => (
            <button key={d} aria-pressed={die === d} onClick={() => setDie(d)}>
              D{d}
            </button>
          ))}
        </div>
        <div className="facegrid" role="group" aria-label={`Faces do D${die}`}>
          {Array.from({ length: die }, (_, i) => i + 1).map((f) => (
            <button key={f} className={flash === f ? 'flash' : ''} aria-label={`Adicionar D${die} face ${f}`} onClick={() => add(f)}>
              {f}
            </button>
          ))}
        </div>

        <Card title="Dados mantidos" icon="check" tone="accent" aria-label="Total dos dados mantidos">
          <div className="totals" role="group" aria-label={`Total mantido: ${total.success} sucessos, ${total.adapt} adaptações, ${total.pressure} pressões`}>
            <Total kind="success" value={total.success} />
            <Total kind="adapt" value={total.adapt} />
            <Total kind="pressure" value={total.pressure} />
          </div>
          <p className="muted" aria-live="polite">
            {rolls.length === 0 ? 'Adicione os resultados dos seus dados.' : `${keptCount} de ${rolls.length} ${rolls.length === 1 ? 'resultado mantido' : 'resultados mantidos'}.`}
          </p>
        </Card>

        <section className="stack" aria-label="Resultados">
          <div className="row">
            <SectionTitle>Resultados ({rolls.length})</SectionTitle>
            <div className="grow" />
            <Button size="small" icon="trash" disabled={rolls.length === 0} onClick={() => setRolls([])}>
              Limpar
            </Button>
          </div>
          {rolls.length === 0 && <EmptyState icon="dice" title="Nenhum dado adicionado">Toque em uma face acima.</EmptyState>}
          {rolls.map((r) => {
            const s = translateFace(r.die, r.face);
            return (
              <div key={r.id} className="row">
                <button className="roll-card" aria-pressed={r.keep} aria-label={`D${r.die} face ${r.face}: ${r.keep ? 'mantido' : 'não mantido'}. Toque para ${r.keep ? 'desmarcar' : 'manter'}`} onClick={() => toggle(r.id)}>
                  <span className="check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  <span className="rc-main">
                    <span className="face">
                      D{r.die} · {r.face}
                      <small>{r.keep ? 'Mantido' : 'Toque para manter'}</small>
                    </span>
                    <SymbolRow {...s} label={`${s.success} sucessos, ${s.adapt} adaptações, ${s.pressure} pressões`} />
                  </span>
                </button>
                <button className="icon-btn" aria-label={`Remover D${r.die} face ${r.face}`} onClick={() => remove(r.id)}>
                  <Icon name="x" />
                </button>
              </div>
            );
          })}
        </section>

        <Notice tone="info">
          Regra geral: o Infectado mantém somente um dado por teste. Gastar um Ponto de Determinação, ativar uma Origem (uma vez por sessão) ou certas Características permitem manter dados adicionais (pág. 56–59 e 63). O aplicativo não limita a seleção; confira com o Assimilador.
        </Notice>
      </Page>
    </>
  );
}
