import { useEffect, useState } from 'react';
import { Icon, Mark, type IconName } from '../components/Icon';
import { Button, Card, EmptyState, Field, Header, Notice, Page, SectionTitle } from '../components/ui';
import { db, listCharacters, setRole } from '../lib/db';
import { useLive, useOnline } from '../lib/hooks';
import { clearPendingTable, getPendingTable, normalizeCode, setPendingTable, type PendingTable } from '../lib/pendingTable';
import { go } from '../lib/router';
import { GENERATIONS, STEPS, healthCurrent, healthMax, newCharacter } from '../lib/rules';
import { engine, syncConfigured, syncLabel } from '../lib/sync';

export function ToolLinks({ hide = [] }: { hide?: string[] }) {
  const tiles: { to: string; icon: IconName; title: string; hint: string }[] = [
    { to: '/dice', icon: 'dice', title: 'Tradutor de dados', hint: 'Converta as faces dos seus dados físicos' },
    { to: '/rules', icon: 'book', title: 'Regras rápidas', hint: 'Consulta com páginas do livro' },
    { to: '/backup', icon: 'download', title: 'Backup e importação', hint: 'Guarde uma cópia das suas fichas' },
  ];
  return (
    <div className="stack">
      {tiles.filter((t) => !hide.includes(t.to)).map((t) => (
        <button key={t.to} className="choice" onClick={() => go(t.to)}>
          <span className="choice-icon">
            <Icon name={t.icon} />
          </span>
          <span className="choice-body">
            <b>{t.title}</b>
            <span>{t.hint}</span>
          </span>
          <Icon name="next" />
        </button>
      ))}
    </div>
  );
}

/** Informar o código da mesa antes de ter personagem: fica guardado e é aplicado à primeira ficha concluída. */
function TableCodeCard() {
  const [pending, setPending] = useState<PendingTable | null>(getPendingTable());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const online = useOnline();

  useEffect(() => {
    const on = () => setPending(getPendingTable());
    window.addEventListener('pending-table', on);
    return () => window.removeEventListener('pending-table', on);
  }, []);

  if (!syncConfigured) return null;

  const submit = async () => {
    setBusy(true);
    setError('');
    const r = await engine.checkTableCode(code);
    setBusy(false);
    if (r.ok) {
      setPendingTable(code);
      setCode('');
    } else setError(r.error);
  };

  if (pending)
    return (
      <Card title="Mesa" icon="users" tone="accent">
        <p>
          Código <b style={{ letterSpacing: '0.15em' }}>{pending.code}</b> confirmado.
        </p>
        <Notice tone="ok">Quando você concluir seu personagem, ele entra nesta mesa automaticamente.</Notice>
        <Button size="small" icon="x" onClick={() => clearPendingTable()}>
          Remover código
        </Button>
      </Card>
    );

  return (
    <Card title="Entrar em uma mesa" icon="users">
      <p className="muted">Já tem o código do Assimilador? Informe agora; seu personagem será vinculado quando estiver pronto.</p>
      <Field label="Código da mesa">
        <input
          value={code}
          onChange={(e) => {
            setCode(normalizeCode(e.target.value));
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && code.length === 8 && void submit()}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          placeholder="8 caracteres"
          aria-label="Código da mesa"
        />
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button variant="primary" icon="key" disabled={busy || code.length !== 8 || !online} onClick={() => void submit()}>
        {busy ? 'Conferindo…' : 'Usar este código'}
      </Button>
      {!online && <p className="muted">Conecte-se à internet para validar o código.</p>}
    </Card>
  );
}

export function HomePage({ onSwitchRole }: { onSwitchRole: () => void }) {
  const chars = useLive(listCharacters, [], []);
  const metas = useLive(() => db.sync.toArray(), [], []);
  const online = useOnline();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const groups = Array.from(new Map(metas.filter((m) => m.tableId && chars.some((c) => c.id === m.id)).map((m) => [m.tableId!, { id: m.tableId!, name: m.tableName || 'Mesa' }])).values());
  const visibleChars = selectedTable === null ? chars.filter((c) => !metas.some((m) => m.id === c.id && m.tableId)) : chars.filter((c) => metas.some((m) => m.id === c.id && m.tableId === selectedTable));

  const create = async () => {
    const c = newCharacter();
    await db.characters.put(c);
    go(`/create/${c.id}`);
  };

  return (
    <>
      <Header title="INFECTADO" />
      <Page>
        <Button variant="primary" size="big" block icon="plus" onClick={() => void create()}>
          Novo Infectado
        </Button>

        <TableCodeCard />

        {groups.length > 0 && (
          <section className="card" aria-label="Selecionar mesa">
            <h2><Icon name="users" /> Mesas</h2>
            <div className="row wrap">
              {groups.map((g) => <button key={g.id} type="button" className={selectedTable === g.id ? 'btn primary small' : 'btn small'} aria-pressed={selectedTable === g.id} onClick={() => setSelectedTable(g.id)}>{g.name}</button>)}
              <button type="button" className={selectedTable === null ? 'btn primary small' : 'btn small'} aria-pressed={selectedTable === null} onClick={() => setSelectedTable(null)}>Sem mesa</button>
            </div>
          </section>
        )}
        <SectionTitle icon="user">{selectedTable ? 'Fichas da mesa' : 'Fichas sem mesa'}</SectionTitle>
        {visibleChars.length === 0 && (
          <EmptyState icon="scroll" title={selectedTable ? "Nenhuma ficha nesta mesa" : "Nenhuma ficha sem mesa"}>
            Crie seu primeiro Infectado ou importe um backup.
          </EmptyState>
        )}
        {visibleChars.map((c) => {
          const meta = metas.find((m) => m.id === c.id);
          const lab = syncLabel(meta, online);
          const gen = GENERATIONS.find((g) => g.id === c.generation)?.label;
          return (
            <button key={c.id} className="choice" onClick={() => go(c.status === 'draft' ? `/create/${c.id}` : `/sheet/${c.id}`)}>
              <span className="choice-icon">
                <Icon name={c.status === 'draft' ? 'edit' : 'user'} />
              </span>
              <span className="choice-body">
                <b>{c.name || 'Sem nome'}</b>
                <span>{c.status === 'draft' ? `Criação em andamento — etapa ${c.step + 1}/${STEPS.length} (${STEPS[c.step]})` : [c.occupation, gen].filter(Boolean).join(' · ')}</span>
                {c.status === 'ready' && (
                  <>
                    <span>
                      <Icon name="drop" /> Saúde {healthCurrent(c)}/{healthMax(c)}
                      {meta?.tableName && <> · Mesa {meta.tableName}</>}
                    </span>
                    <span>
                      <span className={`badge ${lab.tone}`}>{lab.text}</span>
                    </span>
                  </>
                )}
              </span>
              <Icon name="next" />
            </button>
          );
        })}

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
        <div className="hero">
          <Mark />
          <h1>Como você vai participar?</h1>
          <p className="muted">Sem cadastro. Você pode trocar de papel depois.</p>
        </div>
        <button
          className="choice"
          onClick={() => {
            setRole('player');
            onChoose('player');
          }}
        >
          <span className="choice-icon">
            <Icon name="user" />
          </span>
          <span className="choice-body">
            <b>Infectado</b>
            <span>Criar e usar minha ficha de personagem</span>
          </span>
          <Icon name="next" />
        </button>
        <button
          className="choice"
          onClick={() => {
            setRole('gm');
            onChoose('gm');
          }}
        >
          <span className="choice-icon">
            <Icon name="eye" />
          </span>
          <span className="choice-body">
            <b>Assimilador</b>
            <span>Criar uma mesa e acompanhar as fichas do grupo</span>
          </span>
          <Icon name="next" />
        </button>
      </Page>
    </>
  );
}
