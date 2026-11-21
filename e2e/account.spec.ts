// Mesma conta em dois navegadores independentes (celular × PC), com a API do Supabase SIMULADA por interceptação de rede.
// Cobre: sessão reconhecida, mesa vinculada à conta sem ficha, aparecer em outro dispositivo, ficha criada depois,
// migração do código legado e isolamento de quem não está logado. (O contrato real das funções foi sondado à parte.)
import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import { createCharacter } from './helpers';

const ACCOUNT = { id: 'acct-1', email: 'jogador@exemplo.com', user_metadata: { assimilacao_display_name: 'Joaquin Jogador' } };
const TABLE = { id: 'table-1', code: 'ABCD2345', name: 'Mesa do Teste' };

class FakeBackend {
  memberships = new Map<string, Set<string>>(); // userId -> tableIds
  chars = new Map<string, { owner: string; tableId: string | null; data: unknown; rev: number }>();
  calls: string[] = [];
  anonCount = 0;

  userOf(auth: string | undefined): { id: string; account: boolean } {
    const tok = (auth ?? '').replace('Bearer ', '');
    if (tok === 'tok-acct-1') return { id: ACCOUNT.id, account: true };
    return { id: tok.replace('tok-', ''), account: false };
  }

  rpc(name: string, args: Record<string, unknown>, auth: string | undefined) {
    const u = this.userOf(auth);
    this.calls.push(`${name}:${u.account ? 'account' : 'anon'}`);
    const codeOk = String(args.p_code ?? '').toUpperCase() === TABLE.code;
    switch (name) {
      case 'list_my_table_memberships':
        return u.account && this.memberships.get(u.id)?.has(TABLE.id) ? [{ table_id: TABLE.id, table_name: TABLE.name, table_code: TABLE.code }] : [];
      case 'join_table_account':
        if (!u.account) return { ok: false, error: 'login_required' };
        if (!codeOk) return { ok: false, error: 'invalid_code' };
        this.memberships.set(u.id, (this.memberships.get(u.id) ?? new Set()).add(TABLE.id));
        return { ok: true, table_id: TABLE.id, table_name: TABLE.name };
      case 'join_table': {
        if (!codeOk) return { ok: false, error: 'invalid_code' };
        const c = this.chars.get(String(args.p_character_id));
        if (!c || c.owner !== u.id) return { ok: false, error: 'character_not_synced' };
        c.tableId = TABLE.id;
        return { ok: true, table_id: TABLE.id, table_name: TABLE.name };
      }
      case 'push_character':
        {
          const prev = this.chars.get(String(args.p_id));
          const rev = (prev?.rev ?? 0) + 1;
          this.chars.set(String(args.p_id), { owner: u.id, tableId: prev?.tableId ?? null, data: args.p_data, rev });
          return { status: 'ok', rev };
        }
      default:
        return {};
    }
  }

  async install(ctx: BrowserContext, opts: { account: boolean; pending?: string }) {
    await ctx.addInitScript(
      ({ account, user, pending }) => {
        if (account) {
          const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
          localStorage.setItem('assimilacao-auth', JSON.stringify({ access_token: 'tok-acct-1', refresh_token: 'r', token_type: 'bearer', expires_in: 31536000, expires_at: exp, user: { ...user, aud: 'authenticated', role: 'authenticated' } }));
        }
        if (pending) localStorage.setItem('assimilacao-pending-table-v1', JSON.stringify({ code: pending, validatedAt: 1 }));
      },
      { account: opts.account, user: ACCOUNT, pending: opts.pending },
    );
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    const handler = async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const url = new URL(req.url());
      const auth = req.headers()['authorization'];
      if (url.pathname.includes('/auth/v1/signup')) {
        const n = ++this.anonCount;
        const exp = Math.floor(Date.now() / 1000) + 3600;
        return route.fulfill({ headers: cors, body: JSON.stringify({ access_token: `tok-anon-${n}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r${n}`, user: { id: `anon-${n}`, aud: 'authenticated', role: 'authenticated', email: null, is_anonymous: true, user_metadata: {} } }) });
      }
      if (url.pathname.includes('/auth/v1/')) return route.fulfill({ headers: cors, body: '{}' });
      if (url.pathname.includes('/rest/v1/rpc/')) {
        const name = url.pathname.split('/rpc/')[1];
        const args = JSON.parse(req.postData() || '{}');
        return route.fulfill({ headers: cors, body: JSON.stringify(this.rpc(name, args, auth)) });
      }
      if (url.pathname.endsWith('/rest/v1/characters')) {
        // fichas do próprio usuário (como a RLS faria)
        const me = this.userOf(auth).id;
        const rows = [...this.chars.entries()].filter(([, c]) => c.owner === me).map(([id, c]) => ({ id, table_id: c.tableId, rev: c.rev, data: c.data, updated_at: new Date().toISOString() }));
        return route.fulfill({ headers: cors, body: JSON.stringify(rows) });
      }
      return route.fulfill({ headers: cors, body: '[]' }); // demais consultas: nada
    };
    await ctx.route('**/pdjzahpxjrlbqqtzkfdr.supabase.co/**', handler);
  }
}

const open = async (browser: import('@playwright/test').Browser, baseURL: string | undefined, be: FakeBackend, o: { account: boolean; pending?: string }) => {
  // serviceWorkers: 'block' → a interceptação de rede vale para todas as requisições da página
  const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 390, height: 800 } });
  await be.install(ctx, o);
  return { ctx, page: await ctx.newPage() };
};

test('mesma conta em dois navegadores: sessão reconhecida, mesa sem ficha aparece nos dois e ficha posterior entra nela', async ({ browser, baseURL }) => {
  const be = new FakeBackend();
  const phone = await open(browser, baseURL, be, { account: true });
  const pc = await open(browser, baseURL, be, { account: true });

  // BUG 1 — celular: autenticado, a tela de papel mostra a conta e NÃO pede login; mantém ao recarregar
  await phone.page.goto('./');
  await expect(phone.page.getByText('Joaquin Jogador')).toBeVisible();
  await expect(phone.page.getByRole('button', { name: /Entrar ou criar conta/ })).toHaveCount(0);
  await phone.page.reload();
  await expect(phone.page.getByText('Joaquin Jogador')).toBeVisible();
  await expect(phone.page.getByRole('button', { name: /Entrar ou criar conta/ })).toHaveCount(0);

  // BUG 2 — celular: sem nenhuma ficha, entra na mesa pelo código → vínculo da conta gravado no servidor
  await phone.page.getByRole('button', { name: /^Infectado/ }).click();
  await expect(phone.page.getByText('Nenhuma mesa ainda')).toBeVisible();
  await phone.page.getByLabel('Código da mesa').fill(TABLE.code);
  await phone.page.getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(phone.page.getByText(/Você entrou na mesa Mesa do Teste/)).toBeVisible();
  await expect(phone.page.getByText('Vinculada à sua conta', { exact: true })).toBeVisible();
  expect(be.memberships.get(ACCOUNT.id)?.has(TABLE.id)).toBe(true);
  expect(be.calls).toContain('join_table_account:account');
  await expect(phone.page.getByText('Nenhuma ficha encontrada')).toBeVisible(); // não criou personagem

  // PC (outro navegador, mesma conta, sem nada local): a mesa aparece sozinha, sem ficha
  await pc.page.goto('./');
  await expect(pc.page.getByText('Joaquin Jogador')).toBeVisible();
  await pc.page.getByRole('button', { name: /^Infectado/ }).click();
  await expect(pc.page.getByText('Mesa do Teste').first()).toBeVisible();
  await expect(pc.page.getByText('Vinculada à sua conta', { exact: true })).toBeVisible();

  // trocar de papel não perde a sessão
  await pc.page.evaluate(() => window.dispatchEvent(new Event('app-switch-role')));
  await expect(pc.page.getByText('Joaquin Jogador')).toBeVisible();
  await expect(pc.page.getByRole('button', { name: /Entrar ou criar conta/ })).toHaveCount(0);

  // criar a ficha DEPOIS: ela entra automaticamente na mesa que a conta já tem
  await createCharacter(pc.page);
  // (a mensagem fica no bloco recolhido "Gerenciar personagem"; a prova é o estado no servidor e o rótulo na Home)
  await expect.poll(() => [...be.chars.values()].some((c) => c.owner === ACCOUNT.id && c.tableId === TABLE.id), { timeout: 20000 }).toBe(true);

  // a ficha criada não faz a mesa desaparecer; continua listada ao voltar
  await pc.page.goto('./#/');
  await expect(pc.page.getByText('Mesa do Teste').first()).toBeVisible();
  await expect(pc.page.getByText(/Mesa Mesa do Teste/).first()).toBeVisible(); // a ficha aparece sob a mesa
  await phone.ctx.close();
  await pc.ctx.close();
});

test('código guardado só no aparelho (legado) migra para a conta ao entrar; nada se perde', async ({ browser, baseURL }) => {
  const be = new FakeBackend();
  const { ctx, page } = await open(browser, baseURL, be, { account: true, pending: TABLE.code });
  await page.goto('./');
  await page.getByRole('button', { name: /^Infectado/ }).click();
  await expect(page.getByText('Vinculada à sua conta', { exact: true })).toBeVisible({ timeout: 15000 });
  expect(be.memberships.get(ACCOUNT.id)?.has(TABLE.id)).toBe(true);
  // o código local só é apagado depois de gravado no servidor
  expect(await page.evaluate(() => localStorage.getItem('assimilacao-pending-table-v1'))).toBeNull();
  await expect(page.getByText(/agora está vinculado à sua conta/)).toBeVisible();
  await ctx.close();
});

test('quem não está logado não vê mesas de outras contas e não grava vínculo de conta', async ({ browser, baseURL }) => {
  const be = new FakeBackend();
  be.memberships.set(ACCOUNT.id, new Set([TABLE.id])); // mesa privada de outra conta
  const { ctx, page } = await open(browser, baseURL, be, { account: false });
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Entrar ou criar conta/ })).toBeVisible();
  await page.getByRole('button', { name: /^Infectado/ }).click();
  await expect(page.getByText('Mesa do Teste')).toHaveCount(0);
  await expect(page.getByText('Vinculada à sua conta', { exact: true })).toHaveCount(0);
  // informar o código sem conta: fica só local (pendente), sem vínculo de conta no servidor
  await page.getByLabel('Código da mesa').fill(TABLE.code);
  await page.getByRole('button', { name: 'Usar este código' }).click();
  await expect(page.getByText(/confirmado/)).toBeVisible();
  expect(be.calls.filter((c) => c.startsWith('join_table_account')).length).toBe(0);
  expect(be.memberships.get('anon-1')?.size ?? 0).toBe(0);
  await ctx.close();
});
