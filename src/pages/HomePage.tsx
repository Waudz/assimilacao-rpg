import { useEffect, useState } from 'react';
import { Icon, Mark, type IconName } from '../components/Icon';
import { Button, Card, EmptyState, Field, Header, Notice, Page, SectionTitle } from '../components/ui';
import { db, listCharacters, setRole } from '../lib/db';
import { useLive, useOnline } from '../lib/hooks';
import { clearPendingTable, getPendingTable, normalizeCode, setPendingTable, type PendingTable } from '../lib/pendingTable';
import { go } from '../lib/router';
import { GENERATIONS, STEPS, healthCurrent, healthMax, newCharacter } from '../lib/rules';
import { engine, syncConfigured, syncLabel } from '../lib/sync';
import { accountSession, joinAccountTable, listAccountTables, type AccountTable } from '../lib/sync/remote';

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
  const [account, setAccount] = useState(false);
  const [tables, setTables] = useState<AccountTable[]>([]);
  const [success, setSuccess] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const online = useOnline();
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const user = await accountSession();
        if (!alive) return;
        setAccount(Boolean(user));
        setTables(user ? await listAccountTables() : []);
      } catch { /* retry when online */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    window.addEventListener('online', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('online', refresh); };
  }, []);

  useEffect(() => {
    const on = () => setPending(getPendingTable());
    window.addEventListener('pending-table', on);
    return () => window.removeEventListener('pending-table', on);
  }, []);

  if (!syncConfigured) return null;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (account) {
        const r = await joinAccountTable(code);
        if (!r.ok) setError(r.error === 'invalid_code' ? 'Código inválido. Confira com o Assimilador.' : 'Não foi possível entrar na mesa.');
        else {
          setTables(await listAccountTables());
          setSuccess(`Você entrou na mesa ${r.tableName}. Pode criar sua ficha depois, em qualquer dispositivo.`);
          setCode('');
        }
      } else {
        const r = await engine.checkTableCode(code);
        if (r.ok) { setPendingTable(code); setCode(''); }
        else setError(r.error);
      }
    } catch { setError('Não foi possível sincronizar a mesa. Tente novamente.'); }
    finally { setBusy(false); }
  };

  if (pending && !account)
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
    <Card title="Minhas mesas" icon="users">
      {tables.map((t) => <div key={t.tableId} className="stack">
        <p><strong>{t.tableName}</strong> · Código {t.tableCode} · Participação vinculada à sua conta</p>
        <button className="btn small" type="button" onClick={() => { setPendingTable(t.tableCode); setSuccess(`Sua próxima ficha concluída será vinculada à mesa ${t.tableName}.`); }}>Usar mesa na próxima ficha</button>
      </div>)}
      {success && <Notice tone="ok">{success}</Notice>}
      <p className="muted">{account ? 'Entre com o código para vincular a mesa à sua conta, sem precisar criar uma ficha. Ela aparecerá nos seus outros dispositivos.' : 'Você pode informar o código sem cadastro. Para manter a participação na mesa entre dispositivos, entre na sua conta.'}</p>
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
        {busy ? 'Conferindo…' : account ? 'Entrar na mesa' : 'Usar este código'}
      </Button>
      {!online && <p className="muted">Conecte-se à internet para validar o código.</p>}
    </Card>
  );
}

export function HomePage({ onSwitchRole }: { onSwitchRole: () => void }) {
  const chars = useLive(listCharacters, [], []);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  useEffect(() => { if (syncConfigured) void accountSession().then((u) => setHasAccount(Boolean(u))).catch(() => {}); }, []);
  const metas = useLive(() => db.sync.toArray(), [], []);
  const online = useOnline();
  const [selectedTable, setSelectedTable] = useState<string>('all');
  const groups = Array.from(new Map(metas.filter((m) => m.tableId && chars.some((c) => c.id === m.id)).map((m) => [m.tableId!, { id: m.tableId!, name: m.tableName || 'Mesa' }])).values());
  const visibleChars = selectedTable === 'all' ? chars : selectedTable === 'none' ? chars.filter((c) => !metas.some((m) => m.id === c.id && m.tableId)) : chars.filter((c) => metas.some((m) => m.id === c.id && m.tableId === selectedTable));

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

        {syncConfigured && hasAccount === false && <section className="card stack"><h2>Salve suas fichas em uma conta</h2><p className="muted">Você pode experimentar o criador sem login. Para sincronizar suas fichas entre PC e celular, entre na sua conta. É possível participar de mesas sem login.</p><button className="btn primary" onClick={() => go('/account')}>Criar conta ou entrar</button></section>}
        <TableCodeCard />

        {groups.length > 0 && (
          <section className="card" aria-label="Selecionar mesa">
            <h2><Icon name="users" /> Mesas</h2>
            <div className="row wrap">
              {groups.map((g) => <button key={g.id} type="button" className={selectedTable === g.id ? 'btn primary small' : 'btn small'} aria-pressed={selectedTable === g.id} onClick={() => setSelectedTable(g.id)}>{g.name}</button>)}
              <button type="button" className={selectedTable === 'all' ? 'btn primary small' : 'btn small'} aria-pressed={selectedTable === 'all'} onClick={() => setSelectedTable('all')}>Todas</button>
              <button type="button" className={selectedTable === 'none' ? 'btn primary small' : 'btn small'} aria-pressed={selectedTable === 'none'} onClick={() => setSelectedTable('none')}>Sem mesa</button>
            </div>
          </section>
        )}
        <SectionTitle icon="user">{selectedTable === 'all' ? 'Todos os Infectados' : selectedTable === 'none' ? 'Fichas sem mesa' : 'Fichas da mesa'}</SectionTitle>
        {visibleChars.length === 0 && (
          <EmptyState icon="scroll" title={selectedTable === "all" ? "Nenhuma ficha encontrada" : selectedTable === "none" ? "Nenhuma ficha sem mesa" : "Nenhuma ficha nesta mesa"}>
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
  const [account, setAccount] = useState<{ email: string } | null>(null);
  useEffect(() => { if (syncConfigured) void accountSession().then((user) => setAccount(user)).catch(() => {}); }, []);
  return (
    <>
      <Header />
      <Page>
        <div className="hero">
          <Mark />
          <h1>Como você vai participar?</h1>
          <p className="muted">{account ? `Conectado como ${account.email}. Escolha como deseja participar.` : 'Você pode jogar sem cadastro. Entre na sua conta para salvar e sincronizar fichas entre dispositivos.'}</p>
        </div>
        <Button variant="primary" block icon="user" onClick={() => go('/account')}>{account ? 'Minha conta' : 'Entrar ou criar conta'}</Button>
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
