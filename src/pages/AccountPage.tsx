import { useEffect, useState } from 'react';
import { Header, Notice, Page } from '../components/ui';
import { go } from '../lib/router';
import { engine } from '../lib/sync';
import { accountResetPassword, accountSession, accountSignIn, accountSignOut, accountSignUp, accountUpdatePassword, friendlyError } from '../lib/sync/remote';
import { clearAccountLocal } from '../lib/sync/account';
import { db, getSyncMeta } from '../lib/db';

type Mode = 'login' | 'register' | 'reset' | 'password';
export function AccountPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<{id:string;email:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void accountSession().then(setUser).catch((e) => setError(friendlyError(e))); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'register') {
        await accountSignUp(email.trim(), password);
        setMessage('Confira seu e-mail para confirmar o cadastro. Depois, entre com sua senha.');
        setMode('login');
      } else if (mode === 'reset') {
        await accountResetPassword(email.trim());
        setMessage('Se o e-mail estiver cadastrado, você receberá instruções de recuperação.');
      } else if (mode === 'password') {
        await accountUpdatePassword(password);
        setMessage('Senha atualizada.');
      } else {
        await accountSignIn(email.trim(), password);
        setUser(await accountSession());
        engine.schedule(0);
        const next = new URLSearchParams(window.location.search).get('next');
        go(next === 'table' ? '/' : '/');
      }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      await engine.syncAll();
      const chars = await db.characters.toArray();
      const unsaved = await Promise.all(chars.map(async (c) => (await getSyncMeta(c.id)).state !== 'synced'));
      if (unsaved.some(Boolean)) throw new Error('Há fichas sem cópia confirmada na nuvem. Conecte-se e aguarde a sincronização antes de sair.');
      engine.stop();
      await accountSignOut();
      await clearAccountLocal();
      setUser(null);
      setMessage('Você saiu da conta. As fichas sincronizadas continuam disponíveis quando entrar novamente.');
      engine.start();
    } catch (e) { setError(friendlyError(e)); engine.start(); }
    finally { setBusy(false); }
  }
  return <><Header title="MINHA CONTA" backTo="/" /><Page>
    <h1>Conta e sincronização</h1>
    <p className="muted">Use o mesmo e-mail e senha no PC e no celular para acessar suas fichas. O app salva localmente e sincroniza ao recuperar a conexão.</p>
    {error && <Notice tone="bad">{error}</Notice>}
    {message && <Notice tone="info">{message}</Notice>}
    {user ? <section className="card stack">
      <p>Conectado como <strong>{user.email}</strong>.</p>
      <button className="btn" onClick={() => {setMode('password');setPassword('');}}>Alterar senha</button>
      {mode === 'password' && <form onSubmit={(e) => void submit(e)}><label>Nova senha <input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="btn primary" disabled={busy}>Salvar nova senha</button></form>}
      <button className="btn" disabled={busy} onClick={() => void logout()}>Sair da conta</button>
    </section> : <section className="card stack">
      <div className="row wrap">
        <button className="btn" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Entrar</button>
        <button className="btn" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Criar conta</button>
        <button className="btn" aria-pressed={mode === 'reset'} onClick={() => setMode('reset')}>Esqueci minha senha</button>
      </div>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label>E-mail <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && <label>Senha <input type="password" minLength={8} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        <button className="btn primary" disabled={busy}>{busy ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : mode === 'reset' ? 'Enviar recuperação' : 'Entrar'}</button>
      </form>
    </section>}
  </Page></>;
}
