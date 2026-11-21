import { useEffect, useState } from 'react';
import { SheetView } from '../components/SheetView';
import { Icon } from '../components/Icon';
import { Button, EmptyState, Field, Header, Loading, Notice, Page, SectionTitle, useConfirm } from '../components/ui';
import { db, setRole, type GmTable } from '../lib/db';
import { useLive, useOnline } from '../lib/hooks';
import { go } from '../lib/router';
import { assimilationAvailable, determinationAvailable, healthCurrent, healthMax, assimilationLevel } from '../lib/rules';
import { engine, supabaseRemote, syncConfigured } from '../lib/sync';
import { friendlyError } from '../lib/sync/remote';

export function GmHome({ onSwitchRole }: { onSwitchRole: () => void }) {
  const tables = useLive(() => db.gmTables.toArray(), [], [] as GmTable[]);
  const online = useOnline();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [rec, setRec] = useState({ code: '', key: '' });

  // Sincroniza a lista com o servidor quando possível.
  useEffect(() => {
    if (!syncConfigured || !online) return;
    // Só considera "removidas" as mesas que já existiam localmente ANTES da consulta: uma mesa criada
    // enquanto a lista carrega não pode ser apagada por uma resposta que ainda não a conhecia.
    void db.gmTables
      .toArray()
      .then(async (before) => {
        const srv = await supabaseRemote.listTables();
        const keep = new Set(srv.map((t) => t.id));
        await db.transaction('rw', db.gmTables, async () => {
          for (const t of srv) {
            const cur = await db.gmTables.get(t.id);
            await db.gmTables.put({ ...t, recoveryKey: cur?.recoveryKey });
          }
          await db.gmTables.bulkDelete(before.filter((l) => !keep.has(l.id)).map((l) => l.id));
        });
      })
      .catch(() => undefined);
  }, [online]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await supabaseRemote.createTable(name.trim() || 'Mesa');
      await db.gmTables.put({ id: t.id, code: t.code, name: name.trim() || 'Mesa', recoveryKey: t.recoveryKey });
      go(`/gm/${t.id}`);
    } catch (e) {
      setMsg({ tone: 'bad', text: friendlyError(e) });
    }
    setBusy(false);
  };

  const recover = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await supabaseRemote.recoverTable(rec.code, rec.key);
      if (!r.ok) setMsg({ tone: 'bad', text: 'Código ou chave de recuperação incorretos.' });
      else {
        await db.gmTables.put({ id: r.id!, code: r.code!, name: r.name!, recoveryKey: rec.key.trim() });
        go(`/gm/${r.id}`);
      }
    } catch (e) {
      setMsg({ tone: 'bad', text: friendlyError(e) });
    }
    setBusy(false);
  };

  return (
    <>
      <Header title="ASSIMILADOR" right={<Button size="small" icon="swap" onClick={onSwitchRole} aria-label="Trocar papel"><span className="hide-sm">Trocar papel</span></Button>} />
      <Page>
        {!syncConfigured && <Notice tone="warn">A sincronização não está configurada nesta instalação (faltam as variáveis do Supabase). Criar mesas não está disponível. O tradutor de dados e as regras rápidas funcionam normalmente.</Notice>}
        <SectionTitle icon="users">Minhas mesas</SectionTitle>
        {tables.length === 0 && <EmptyState icon="users" title="Nenhuma mesa ainda">Crie uma mesa abaixo e compartilhe o código com os jogadores.</EmptyState>}
        {tables.map((t) => (
          <button key={t.id} className="choice" onClick={() => go(`/gm/${t.id}`)}>
            <span className="choice-icon"><Icon name="users" /></span>
            <span className="choice-body">
              <b>{t.name}</b>
              <span>Código {t.code}</span>
            </span>
            <Icon name="next" />
          </button>
        ))}
        <section className="card">
          <h2>Nova mesa</h2>
          <Field label="Nome da mesa">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Refúgio do Rio Comprido" />
          </Field>
          <button className="btn primary" disabled={busy || !syncConfigured || !online} onClick={() => void create()}>
            {busy ? 'Criando…' : 'Criar mesa e gerar código'}
          </button>
          {!online && <p className="muted">Conecte-se à internet para criar a mesa.</p>}
        </section>
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Recuperar mesa em aparelho novo</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <Field label="Código da mesa">
              <input value={rec.code} onChange={(e) => setRec({ ...rec, code: e.target.value.toUpperCase() })} autoCapitalize="characters" />
            </Field>
            <Field label="Chave de recuperação">
              <input value={rec.key} onChange={(e) => setRec({ ...rec, key: e.target.value })} autoCapitalize="none" autoCorrect="off" />
            </Field>
            <button className="btn" disabled={busy || !syncConfigured || !online || !rec.code || !rec.key} onClick={() => void recover()}>
              Recuperar
            </button>
          </div>
        </details>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Page>
    </>
  );
}

/**
 * Mantém a cópia local das fichas da mesa atualizada: Realtime (se habilitado), consulta periódica,
 * ao voltar à aba e ao reconectar. Usado nas telas da mesa E da ficha (que também precisa de atualizações).
 */
export function useTablePull(tableId: string): string {
  const [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const r = await engine.pullTable(tableId);
      if (!alive) return;
      setStatus(r.ok ? `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}` : r.offline ? 'Sem conexão — mostrando a última cópia salva' : (r.error ?? ''));
    };
    void pull();
    const unsub = syncConfigured ? supabaseRemote.subscribe(tableId, () => void pull()) : () => undefined;
    const iv = setInterval(() => void pull(), 8000);
    const vis = () => document.visibilityState === 'visible' && void pull();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', vis);
    return () => {
      alive = false;
      unsub();
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', vis);
    };
  }, [tableId]);
  return status;
}

export function GmTablePage({ tableId }: { tableId: string }) {
  const table = useLive(() => db.gmTables.get(tableId).then((t) => t ?? null), [tableId], undefined);
  const chars = useLive(() => db.remote.where('tableId').equals(tableId).toArray(), [tableId], []);
  const online = useOnline();
  const status = useTablePull(tableId);
  const [ask, dialog] = useConfirm();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  if (table === undefined) return <><Header title="MESA" backTo="/" /><Page><Loading /></Page></>;
  if (!table) return <><Header title="MESA" backTo="/" /><Page><Notice tone="bad">Mesa não encontrada neste aparelho.</Notice></Page></>;

  const share = async () => {
    const text = `Entre na mesa “${table.name}” de Assimilação RPG com o código ${table.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(table.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelado */
    }
  };

  return (
    <>
      <Header title={table.name.toUpperCase()} backTo="/" />
      <Page>
        <details className="card gm-table-admin">
          <summary>Convite e código da mesa</summary>
          <div className="stack">
          <p className="muted">Código da mesa</p>
          <div className="big-num" style={{ letterSpacing: '0.2em', fontSize: '2.8rem' }} aria-label={`Código ${table.code.split('').join(' ')}`}>{table.code}</div>
          <div className="grid2">
            <button className="btn" onClick={() => void share()}>{copied ? 'Copiado!' : 'Compartilhar / copiar'}</button>
            <button
              className="btn"
              disabled={!online}
              onClick={async () => {
                if (!(await ask({ title: 'Gerar novo código?', message: 'O código antigo deixa de funcionar. Fichas já vinculadas continuam na mesa.', confirmLabel: 'Gerar novo código' }))) return;
                const code = await supabaseRemote.rotateCode(tableId);
                await db.gmTables.update(tableId, { code });
              }}
            >
              Gerar novo código
            </button>
          </div>
          <p className="muted">O código só permite vincular fichas à mesa. Você apenas visualiza as fichas; quem edita é cada jogador.</p>
          </div>
        </details>

        <section className="gm-dashboard" aria-label="Resumo da mesa">
          <div className="gm-dashboard-head">
            <div>
              <h2>Visão da mesa</h2>
              <p className="muted">Acompanhamento dos Infectados · somente leitura</p>
            </div>
            <span className="badge">{chars.length} {chars.length === 1 ? 'Infectado' : 'Infectados'}</span>
          </div>
          <div className="gm-dashboard-tools">
            <Button size="small" icon="dice" onClick={() => go('/dice')}>Tradutor de Dados</Button>
            <Button size="small" icon="book" onClick={() => go('/rules')}>Regras rápidas</Button>
          </div>
          {chars.length > 0 && (
            <div className="gm-summary-list">
              {chars.map((r) => (
                <button key={r.id} className="gm-summary-row" onClick={() => go(`/gm/${tableId}/${r.id}`)} aria-label={`Ver ficha de ${r.data.name || 'Infectado'}`}>
                  <strong>{r.data.name || 'Sem nome'}</strong>
                  <span><small>Saúde</small><b>{healthCurrent(r.data)}/{healthMax(r.data)}</b></span>
                  <span><small>Determinação</small><b>{determinationAvailable(r.data)}/{r.data.determinationLevel}</b></span>
                  <span><small>Assimilação</small><b>{assimilationAvailable(r.data)}/{assimilationLevel(r.data)}</b></span>
                  <Icon name="next" />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="row">
          <div className="grow">
            <SectionTitle icon="user">Infectados ({chars.length})</SectionTitle>
          </div>
          <Button size="small" icon="sync" disabled={!online} onClick={() => void engine.pullTable(tableId)}>
            Atualizar
          </Button>
        </div>
        <p className="muted" role="status">{status}</p>
        {chars.length === 0 && <EmptyState icon="users" title="Nenhuma ficha conectada ainda">Compartilhe o código com os jogadores.</EmptyState>}
        {chars.map((r) => (
          <button key={r.id} className="choice" onClick={() => go(`/gm/${tableId}/${r.id}`)}>
            <span className="choice-icon"><Icon name="user" /></span>
            <span className="choice-body">
              <b>{r.data.name || 'Sem nome'}</b>
              <span>{r.data.occupation}</span>
              <span>
                <Icon name="drop" /> Saúde {healthCurrent(r.data)}/{healthMax(r.data)} · Determinação {determinationAvailable(r.data)}/{r.data.determinationLevel} · Assimilação {assimilationAvailable(r.data)}/{assimilationLevel(r.data)}
              </span>
              <span>Atualizada {new Date(r.updatedAt).toLocaleString('pt-BR')}</span>
            </span>
            <Icon name="next" />
          </button>
        ))}

        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Recuperação e administração</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <p className="muted">Guarde a chave de recuperação: ela permite reassumir a mesa em outro aparelho.</p>
            <button className="btn small" onClick={() => setShowKey((s) => !s)}>{showKey ? 'Ocultar chave' : 'Mostrar chave de recuperação'}</button>
            {showKey && <code style={{ wordBreak: 'break-all', padding: 8, background: 'var(--color-paper-2)', borderRadius: 6 }}>{table.recoveryKey ?? 'Indisponível neste aparelho (mostrada apenas na criação).'}</code>}
            <button
              className="btn danger"
              disabled={!online}
              onClick={async () => {
                if (!(await ask({ title: `Excluir a mesa “${table.name}”?`, message: 'As fichas dos jogadores continuam com eles, mas você deixa de vê-las.', confirmLabel: 'Excluir mesa', tone: 'danger' }))) return;
                await supabaseRemote.deleteTable(tableId);
                await db.transaction('rw', db.gmTables, db.remote, async () => {
                  await db.gmTables.delete(tableId);
                  await db.remote.where('tableId').equals(tableId).delete();
                });
                go('/');
              }}
            >
              Excluir mesa
            </button>
          </div>
        </details>
      </Page>
      {dialog}
    </>
  );
}

export function GmCharacterPage({ tableId, charId }: { tableId: string; charId: string }) {
  const row = useLive(() => db.remote.get(charId).then((r) => r ?? null), [charId], undefined);
  const status = useTablePull(tableId);
  const online = useOnline();
  const [ask, dialog] = useConfirm();
  if (row === undefined) return <><Header title="FICHA" backTo={`/gm/${tableId}`} /><Page><Loading /></Page></>;
  if (!row) return <><Header title="FICHA" backTo={`/gm/${tableId}`} /><Page><Notice tone="warn">Esta ficha não está mais na mesa.</Notice></Page></>;
  return (
    <>
      <Header title="FICHA · SOMENTE LEITURA" backTo={`/gm/${tableId}`} />
      <Page>
        <Notice tone="info">Visão do Assimilador: somente leitura. Atualizada em {new Date(row.updatedAt).toLocaleString('pt-BR')}{online ? '' : ' (cópia salva, sem conexão)'}.</Notice>
        <p className="muted" role="status">{status}</p>
        <SheetView char={row.data} />
        <button
          className="btn danger"
          disabled={!online}
          onClick={async () => {
            if (!(await ask({ title: `Remover “${row.data.name}” da mesa?`, message: 'Você deixará de ver esta ficha.', confirmLabel: 'Remover', tone: 'danger' }))) return;
            await supabaseRemote.kick(charId);
            await db.remote.delete(charId);
            go(`/gm/${tableId}`);
          }}
        >
          Remover da mesa
        </button>
      </Page>
      {dialog}
    </>
  );
}

export const leaveGm = () => setRole(null);
