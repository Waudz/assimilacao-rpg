import { expect, test } from '@playwright/test';
import { createCharacter, noHorizontalScroll } from './helpers';

test('cria personagem, joga, fecha e reabre sem perder a ficha', async ({ page }) => {
  await createCharacter(page);
  await noHorizontalScroll(page);

  // Saúde: 6 pontos por nível, 36 no total
  await expect(page.getByText('6 pontos por nível')).toBeVisible();
  await page.getByRole('button', { name: /Sofrer dano/ }).click({ clickCount: 7, delay: 30 });
  await expect(page.getByText(/Nível 5/).first()).toBeVisible();
  // Determinação
  await page.getByRole('button', { name: 'Gastar 1 ponto de Determinação' }).click();
  await expect(page.getByLabel('Determinação: 8 pontos de 9')).toBeVisible();

  // Inventário veio do pacote
  await page.getByRole('tab', { name: 'Inventário' }).click();
  await expect(page.getByLabel('Nome do item').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Características' }).click();
  await expect(page.getByRole('heading', { name: 'Batedor' })).toBeVisible();

  // Fecha e reabre
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Joaquin Jardim' })).toBeVisible();
  await expect(page.getByText(/Nível 5/).first()).toBeVisible();
  await expect(page.getByLabel('Determinação: 8 pontos de 9')).toBeVisible();
  await page.goto('./#/');
  await expect(page.getByRole('button', { name: /Joaquin Jardim/ })).toBeVisible();
});

test('criação em andamento pode ser retomada', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Infectado/ }).click();
  await page.getByRole('button', { name: '+ Novo Infectado' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Rascunho');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.goto('./#/');
  await page.getByRole('button', { name: /Rascunho/ }).click();
  await expect(page.getByRole('heading', { name: 'Origens' })).toBeVisible();
});

test('tradutor de dados converte faces e soma mantidos', async ({ page }) => {
  await page.goto('./#/dice');
  await page.getByRole('button', { name: /Infectado/ }).click().catch(() => undefined);
  await page.goto('./#/dice');
  await page.getByRole('button', { name: 'D12' }).click();
  await page.getByRole('button', { name: 'Adicionar D12 face 11' }).click();
  await page.getByRole('button', { name: 'D10' }).click();
  await page.getByRole('button', { name: 'Adicionar D10 face 10' }).click();
  await page.getByRole('button', { name: 'Adicionar D10 face 3' }).click();
  await page.getByLabel('Manter D12 face 11').check();
  await page.getByLabel('Manter D10 face 10').check();
  await expect(page.getByLabel('3 sucessos, 2 adaptações, 2 pressões')).toBeVisible();
  await page.getByLabel('Remover D10 face 3').click();
  await page.getByRole('button', { name: 'Limpar' }).click();
  await expect(page.getByText('Nenhum dado adicionado.')).toBeVisible();
});

test('páginas principais não têm rolagem horizontal', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Infectado/ }).click();
  for (const hash of ['/', '/dice', '/rules', '/backup']) {
    await page.goto(`./#${hash}`);
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
  }
});

test('Assimilador: tela de mesas coerente com a configuração do build', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Assimilador/ }).click();
  const create = page.getByRole('button', { name: /Criar mesa/ });
  await expect(create).toBeVisible();
  const warned = await page.getByText(/sincronização não está configurada/i).isVisible();
  if (warned) await expect(create).toBeDisabled(); // build sem Supabase: aviso honesto e botão desativado
  else await expect(create).toBeEnabled(); // build configurado
});

test('etapa de Aptidões cabe em tela de 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');
  await page.getByRole('button', { name: /Infectado/ }).click();
  await page.getByRole('button', { name: '+ Novo Infectado' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Estreito');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Evento Marcante').fill('a');
  await page.getByLabel('Ocupação').fill('b');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('radio', { name: /Pós-Colapso/ }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByLabel('Propósito Pessoal 1').fill('a');
  await page.getByLabel('Propósito Pessoal 2').fill('b');
  await page.getByLabel('Propósito Coletivo').fill('c');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByRole('heading', { name: 'Aptidões' })).toBeVisible();
  await noHorizontalScroll(page);
});

test('depois de instalado, o app abre e funciona totalmente offline', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Infectado/ }).click();
  // aguarda o service worker assumir o controle (cache pré-carregado)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '+ Novo Infectado' })).toBeVisible();
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await page.getByRole('button', { name: '+ Novo Infectado' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Offline');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.waitForTimeout(500);
  await page.goto('./#/');
  await expect(page.getByRole('button', { name: /Offline/ })).toBeVisible();
  await context.setOffline(false);
});
