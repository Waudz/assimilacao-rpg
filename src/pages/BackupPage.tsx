import { useRef, useState } from 'react';
import { Button, Header, Notice, Page } from '../components/ui';
import { buildBackup, downloadJson, importCharacters, parseBackup } from '../lib/backup';

export function BackupPage() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const doImport = async (file: File) => {
    try {
      const chars = parseBackup(await file.text());
      const r = await importCharacters(chars);
      setMsg({ tone: 'ok', text: `Importação concluída: ${r.added} nova(s), ${r.updated} atualizada(s), ${r.skipped} ignorada(s) (já tinham versão mais recente).` });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Falha ao importar.' });
    }
  };

  return (
    <>
      <Header title="BACKUP" backTo="/" />
      <Page>
        <p className="muted">O backup é um arquivo JSON com todas as suas fichas. Guarde-o fora do aparelho (e-mail, nuvem). Ele também contém o segredo que permite recuperar suas fichas no servidor em um aparelho novo.</p>
        <Button variant="primary" icon="download" onClick={async () => downloadJson(await buildBackup(), `assimilacao-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
          Exportar todas as fichas
        </Button>
        <Button icon="upload" onClick={() => input.current?.click()}>
          Importar arquivo de backup
        </Button>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Arquivo de backup" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Notice tone="warn">Trate o arquivo de backup como privado: quem o tiver pode recuperar a posse das suas fichas.</Notice>
      </Page>
    </>
  );
}
