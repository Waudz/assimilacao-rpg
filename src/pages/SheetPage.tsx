import { useState } from 'react';
import { SheetView } from '../components/SheetView';
import { Field, Header, Notice, Page } from '../components/ui';
import { buildBackup, downloadJson } from '../lib/backup';
import { deleteCharacter, getSyncMeta } from '../lib/db';
import { useCharacterEditor, useLive, useOnline } from '../lib/hooks';
import { go } from '../lib/router';
import { engine, supabaseRemote, syncConfigured, syncLabel } from '../lib/sync';

export function SheetPage({ id }: { id: string }) {
  const { char, update, status, reload } = useCharacterEditor(id);
  const meta = useLive(() => getSyncMeta(id), [id], undefined);
  const online = useOnline();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (char === undefined) return <><Header title="FICHA" backTo="/" /><Page><p>Carregando…</p></Page></>;
  if (char === null)
    return (
      <>
        <Header title="FICHA" backTo="/" />
        <Page>
          <Notice tone="bad">Ficha não encontrada neste aparelho.</Notice>
          <button className="btn" onClick={() => go('/')}>Início</button>
        </Page>
      </>
    );
  if (char.status === 'draft') {
    go(`/create/${char.id}`, true);
    return null;
  }

  const label = syncLabel(meta, online);
  const saveText = status === 'saving' ? 'Salvando…' : status === 'error' ? 'Falha ao salvar — exporte um backup' : 'Salvo automaticamente neste dispositivo';

  const join = async () => {
    setBusy(true);
    setMsg(null);
    const r = await engine.joinTable(char.id, code);
    setBusy(false);
    setMsg(r.ok ? { tone: 'ok', text: `Conectado à mesa “${r.tableName}”. Suas alterações serão sincronizadas.` } : { tone: 'bad', text: r.error });
    if (r.ok) setCode('');
  };
  const leave = async () => {
    if (!confirm('Sair da mesa? O Assimilador deixará de ver esta ficha.')) return;
    setBusy(true);
    try {
      await engine.leaveTable(char.id);
      setMsg({ tone: 'info', text: 'Você saiu da mesa.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Falha ao sair da mesa.' });
    }
    setBusy(false);
  };

  return (
    <>
      <Header title="FICHA DE INFECTADO" backTo="/" />
      <Page>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span className="badge" role="status">{saveText}</span>
          {meta?.tableId && <span className={`badge ${label.tone}`} role="status">{label.text}</span>}
        </div>

        {meta?.state === 'conflict' && meta.conflict && (
          <div className="card" role="alert" style={{ borderColor: 'var(--color-bad)' }}>
            <h2 style={{ color: 'var(--color-bad)' }}>Conflito de sincronização</h2>
            <p>
              O servidor tem uma versão diferente desta ficha (atualizada em {new Date(meta.conflict.updatedAt).toLocaleString('pt-BR')}). Esta versão local é de {new Date(char.updatedAt).toLocaleString('pt-BR')}. Escolha qual manter; nada foi sobrescrito.
            </p>
            <div className="grid2">
              <button className="btn" onClick={async () => { await engine.resolveConflict(id, 'server'); await reload(); }}>Usar a do servidor</button>
              <button className="btn primary" onClick={() => void engine.resolveConflict(id, 'local')}>Manter a minha</button>
            </div>
          </div>
        )}

        <SheetView char={char} update={update} />

        <section className="card" aria-label="Mesa e sincronização">
          <h2>Mesa</h2>
          {!syncConfigured ? (
            <Notice tone="info">A sincronização com o Assimilador não está configurada nesta instalação. Sua ficha continua salva e funcionando no aparelho; use o backup JSON para guardar uma cópia.</Notice>
          ) : meta?.tableId ? (
            <>
              <p>
                Conectado à mesa <b>{meta.tableName}</b>. O Assimilador pode ver esta ficha, mas não editá-la.
              </p>
              <div className="grid2">
                <button className="btn" disabled={busy || !online} onClick={() => void engine.pushOne(id)}>Sincronizar agora</button>
                <button className="btn danger" disabled={busy || !online} onClick={() => void leave()}>Sair da mesa</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Peça o código ao Assimilador. O código só vincula esta ficha à mesa; ninguém consegue editá-la por ele.</p>
              <Field label="Código da mesa">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} autoCapitalize="characters" autoCorrect="off" inputMode="text" placeholder="8 caracteres" aria-label="Código da mesa" />
              </Field>
              <button className="btn primary" disabled={busy || code.length !== 8 || !online} onClick={() => void join()}>
                {busy ? 'Conectando…' : 'Entrar na mesa'}
              </button>
              {!online && <p className="muted">Conecte-se à internet para entrar na mesa.</p>}
              <details>
                <summary className="muted">Ficha vinda de um backup em aparelho novo?</summary>
                <p className="muted" style={{ margin: '8px 0' }}>Recupere a propriedade desta ficha no servidor usando o segredo guardado no backup.</p>
                <button
                  className="btn small"
                  disabled={busy || !online}
                  onClick={async () => {
                    setBusy(true);
                    const r = await engine.reclaim(char);
                    setBusy(false);
                    setMsg(r.ok ? { tone: 'ok', text: 'Ficha recuperada no servidor.' } : { tone: 'bad', text: r.error ?? 'Falha.' });
                  }}
                >
                  Recuperar no servidor
                </button>
              </details>
            </>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </section>

        <section className="card">
          <h2>Backup</h2>
          <button className="btn" onClick={async () => downloadJson(await buildBackup(char.id), `assimilacao-${(char.name || 'ficha').replace(/\W+/g, '-')}.json`)}>
            Exportar esta ficha (JSON)
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm(`Excluir “${char.name}” deste aparelho? Exporte um backup antes se quiser guardá-la.`)) return;
              if (meta?.tableId) {
                try {
                  await supabaseRemote.deleteCharacter(char.id);
                } catch {
                  /* sem conexão: apenas local */
                }
              }
              await deleteCharacter(char.id);
              go('/');
            }}
          >
            Excluir ficha
          </button>
        </section>
      </Page>
    </>
  );
}
