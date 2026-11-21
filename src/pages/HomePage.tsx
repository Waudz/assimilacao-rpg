import { Header, Notice, Page } from '../components/ui';
import { listCharacters, db, setRole } from '../lib/db';
import { useLive, useOnline } from '../lib/hooks';
import { go } from '../lib/router';
import { GENERATIONS, STEPS, healthCurrent, healthMax, newCharacter } from '../lib/rules';
import { syncLabel } from '../lib/sync';

export function HomePage({ onSwitchRole }: { onSwitchRole: () => void }) {
  const chars = useLive(listCharacters, [], []);
  const metas = useLive(() => db.sync.toArray(), [], []);
  const online = useOnline();

  const create = async () => {
    const c = newCharacter();
    await db.characters.put(c);
    go(`/create/${c.id}`);
  };

  return (
    <>
      <Header
        title="INFECTADO"
        right={
          <button className="btn small" onClick={onSwitchRole}>
            Trocar papel
          </button>
        }
      />
      <Page>
        <button className="btn primary block" onClick={() => void create()}>
          + Novo Infectado
        </button>

        <h2>Minhas fichas</h2>
        {chars.length === 0 && <p className="muted">Nenhuma ficha neste aparelho ainda. Crie seu primeiro Infectado ou importe um backup.</p>}
        {chars.map((c) => {
          const meta = metas.find((m) => m.id === c.id);
          const lab = syncLabel(meta, online);
          const gen = GENERATIONS.find((g) => g.id === c.generation)?.label;
          return (
            <button key={c.id} className="choice" onClick={() => go(c.status === 'draft' ? `/create/${c.id}` : `/sheet/${c.id}`)}>
              <b>{c.name || 'Sem nome'}</b>
              <span>{c.status === 'draft' ? `Criação em andamento — etapa ${c.step + 1}/${STEPS.length} (${STEPS[c.step]})` : [c.occupation, gen].filter(Boolean).join(' · ')}</span>
              {c.status === 'ready' && (
                <span>
                  Saúde {healthCurrent(c)}/{healthMax(c)} · <span className={`badge ${lab.tone}`}>{lab.text}</span>
                  {meta?.tableName && <> · Mesa {meta.tableName}</>}
                </span>
              )}
            </button>
          );
        })}

        <h2>Ferramentas</h2>
        <div className="grid2">
          <button className="btn" onClick={() => go('/dice')}>🎲 Tradutor de dados</button>
          <button className="btn" onClick={() => go('/rules')}>📖 Regras rápidas</button>
        </div>
        <button className="btn" onClick={() => go('/backup')}>Backup e importação</button>
        <Notice tone="info">Suas fichas ficam salvas neste aparelho e funcionam sem internet. Faça backups periódicos: o iPhone pode apagar dados de sites que ficam muito tempo sem uso.</Notice>
      </Page>
    </>
  );
}

export function RolePage({ onChoose }: { onChoose: (r: 'player' | 'gm') => void }) {
  return (
    <>
      <Header />
      <Page>
        <h1>Como você vai participar?</h1>
        <p className="muted">Sem cadastro. Você pode trocar de papel depois.</p>
        <button className="choice" onClick={() => { setRole('player'); onChoose('player'); }}>
          <b>Infectado</b>
          <span>Criar e usar minha ficha de personagem</span>
        </button>
        <button className="choice" onClick={() => { setRole('gm'); onChoose('gm'); }}>
          <b>Assimilador</b>
          <span>Criar uma mesa e acompanhar as fichas do grupo</span>
        </button>
      </Page>
    </>
  );
}
