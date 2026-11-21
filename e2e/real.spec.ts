// Fluxo REAL contra o Supabase configurado no build (somente a chave pública). Dois navegadores independentes.
// Rodar: E2E_REAL=1 PW_CHANNEL=chrome npx playwright test e2e/real.spec.ts --project=iphone-se
// Cria dados de teste ("TESTE E2E ...") e os apaga ao final pelos próprios fluxos do app.
import { expect, test } from '@playwright/test';
import { createCharacter } from './helpers';

test.skip(!process.env.E2E_REAL, 'defina E2E_REAL=1 para testar contra o Supabase real');
test.setTimeout(180000);

const SB_URL = process.env.VITE_SUPABASE_URL ?? 'https://pdjzahpxjrlbqqtzkfdr.supabase.co';
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Apaga o que o teste criou (mesa e fichas) usando o token da sessão dona de cada coisa. Roda mesmo se o teste falhar. */
async function cleanup(pages: { gm: import('@playwright/test').Page; pl: import('@playwright/test').Page }, tableName: string) {
  const token = async (page: import('@playwright/test').Page) => {
    try {
      const raw = await page.evaluate(() => localStorage.getItem('assimilacao-auth'));
      return raw ? (JSON.parse(raw).access_token as string) : null;
    } catch {
      return null;
    }
  };
  const call = async (tok: string, path: string, init?: { method?: string; body?: unknown }) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method: init?.method ?? 'GET',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Profile': 'assimilacao', 'Accept-Profile': 'assimilacao' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    return r.ok && r.status !== 204 ? r.json() : null;
  };
  const gmTok = await token(pages.gm);
  const plTok = await token(pages.pl);
  if (plTok) for (const c of ((await call(plTok, 'characters?select=id')) ?? []) as { id: string }[]) await call(plTok, 'rpc/delete_character', { method: 'POST', body: { p_id: c.id } });
  if (gmTok) for (const t of ((await call(gmTok, `tables?select=id&name=eq.${encodeURIComponent(tableName)}`)) ?? []) as { id: string }[]) await call(gmTok, 'rpc/delete_table', { method: 'POST', body: { p_table_id: t.id } });
}

test('Assimilador e Infectado em navegadores separados: mesa, código, sincronização, offline e reconexão', async ({ browser, baseURL }) => {
  const mk = async () => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 } });
    return { ctx, page: await ctx.newPage() };
  };
  const gm = await mk();
  const pl = await mk();
  const tableName = `TESTE E2E ${Date.now()}`;
  const consoleErrors: string[] = [];
  for (const { page } of [gm, pl]) page.on('pageerror', (e) => consoleErrors.push(e.message));

  try {

  // --- Assimilador cria a mesa (autenticação anônima real)
  await gm.page.goto('./');
  await gm.page.getByRole('button', { name: /Assimilador/ }).click();
  await gm.page.getByLabel('Nome da mesa').fill(tableName);
  await gm.page.getByRole('button', { name: /Criar mesa/ }).click();
  await gm.page.getByText('Convite e código da mesa').click(); // bloco recolhido na tela da mesa
  const codeEl = gm.page.locator('[aria-label^="Código "]');
  await expect(codeEl).toBeVisible({ timeout: 20000 });
  const code = (await codeEl.textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

  // --- Infectado informa o código ANTES de ter personagem (nenhuma ficha vazia é criada)
  await pl.page.goto('./');
  await pl.page.getByRole('button', { name: /^Infectado/ }).click();
  await pl.page.getByLabel('Código da mesa').fill('ZZZZZZZZ');
  await pl.page.getByRole('button', { name: /Usar este código/ }).click();
  await expect(pl.page.getByRole('alert')).toContainText('Código inválido', { timeout: 20000 }); // código errado é recusado
  await pl.page.getByLabel('Código da mesa').fill(code);
  await pl.page.getByRole('button', { name: /Usar este código/ }).click();
  await expect(pl.page.getByText(/confirmado/)).toBeVisible({ timeout: 20000 });
  await expect(pl.page.getByText('Nenhuma ficha encontrada')).toBeVisible(); // nada foi criado

  // --- ao concluir o personagem, ele entra na mesa automaticamente
  await createCharacter(pl.page);
  await pl.page.getByText('Gerenciar personagem').click(); // bloco recolhido
  await expect(pl.page.getByText(new RegExp(`Conectado à mesa .*${tableName}`)).first()).toBeVisible({ timeout: 30000 });
  await expect(pl.page.getByText('Sincronizado').first()).toBeVisible({ timeout: 30000 });

  // --- Assimilador vê a ficha (atualização automática, sem recarregar)
  await expect(gm.page.getByRole('button', { name: /Joaquin Jardim/ })).toBeVisible({ timeout: 30000 });
  await gm.page.getByRole('button', { name: /Joaquin Jardim/ }).click();
  await expect(gm.page.getByText(/somente leitura/i).first()).toBeVisible();
  await expect(gm.page.getByRole('button', { name: /Sofrer dano/ })).toHaveCount(0); // não consegue editar
  await expect(gm.page.getByLabel(/36 de 36 pontos de Saúde/)).toBeVisible();

  // --- Jogador altera Saúde e Determinação → Assimilador recebe sozinho (sem recarregar)
  await pl.page.getByRole('button', { name: /Sofrer dano/ }).click({ clickCount: 7, delay: 40 });
  await pl.page.getByRole('button', { name: 'Gastar 1 ponto de Determinação' }).click();
  await expect(gm.page.getByLabel(/29 de 36 pontos de Saúde/)).toBeVisible({ timeout: 40000 });
  await expect(gm.page.getByLabel('Determinação: 8 pontos de 9')).toBeVisible({ timeout: 40000 });

  // --- Perde a conexão: continua utilizável, mostra pendência
  await pl.ctx.setOffline(true);
  await pl.page.getByRole('button', { name: /Sofrer dano/ }).click({ clickCount: 2, delay: 40 });
  await expect(pl.page.getByText('Aguardando conexão').first()).toBeVisible({ timeout: 20000 });
  await expect(pl.page.getByLabel(/27 de 36 pontos de Saúde/)).toBeVisible();
  await page_wait(2500);
  await expect(gm.page.getByLabel(/29 de 36 pontos de Saúde/)).toBeVisible(); // GM ainda vê o antigo

  // --- Reconecta: sincroniza sozinho
  await pl.ctx.setOffline(false);
  await expect(gm.page.getByLabel(/27 de 36 pontos de Saúde/)).toBeVisible({ timeout: 60000 });
  await expect(pl.page.getByText('Sincronizado').first()).toBeVisible({ timeout: 30000 });

  // --- Atualizar a página do jogador: mantém ficha, mesa e estado
  await pl.page.reload();
  await expect(pl.page.getByLabel(/27 de 36 pontos de Saúde/)).toBeVisible({ timeout: 20000 });
  await expect(pl.page.getByText(new RegExp(`Conectado à mesa .*${tableName}`)).first()).toBeVisible();

  // --- Atualizar a página do Assimilador: mesa e fichas continuam
  await gm.page.reload();
  await expect(gm.page.getByLabel(/27 de 36 pontos de Saúde/)).toBeVisible({ timeout: 30000 });

  // --- Segundo jogador (outro navegador) com o mesmo código não vê a ficha do primeiro
  const pl2 = await mk();
  await pl2.page.goto('./');
  await pl2.page.getByRole('button', { name: /^Infectado/ }).click();
  await expect(pl2.page.getByText(/Joaquin/)).toHaveCount(0);
  await pl2.ctx.close();

  // --- Limpeza: jogador exclui a ficha, Assimilador exclui a mesa
  await pl.page.getByRole('button', { name: 'Excluir ficha' }).click();
  await pl.page.getByRole('dialog').getByRole('button', { name: 'Excluir ficha' }).click();
  await expect(pl.page.getByRole('button', { name: /Novo Infectado/ })).toBeVisible({ timeout: 20000 });
  await gm.page.goto('./#/');
  await gm.page.getByRole('button', { name: new RegExp(tableName) }).click();
  await gm.page.getByText('Recuperação e administração').click();
  await gm.page.getByRole('button', { name: 'Excluir mesa' }).click();
  await gm.page.getByRole('dialog').getByRole('button', { name: 'Excluir mesa' }).click();
  await expect(gm.page.getByText(tableName)).toHaveCount(0, { timeout: 20000 });

  expect(consoleErrors).toEqual([]);
  } finally {
    await cleanup({ gm: gm.page, pl: pl.page }, tableName);
    await gm.ctx.close();
    await pl.ctx.close();
  }
});

const page_wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
