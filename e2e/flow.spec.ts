import { expect, test, type Page } from '@playwright/test';

const inc = (page: Page, apt: string, times: number) => page.getByRole('button', { name: `Aumentar ${apt}`, exact: true }).click({ clickCount: times, delay: 30 });

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'rolagem horizontal').toBeLessThanOrEqual(0);
}

async function createCharacter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Infectado/ }).click();
  await page.getByRole('button', { name: '+ Novo Infectado' }).click();

  // 1 Nome
  await page.getByLabel('Nome', { exact: true }).fill('Joaquin Jardim');
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 2 Origens
  await page.getByLabel('Evento Marcante').fill('Fuga do extermínio do antigo grupo');
  await page.getByLabel('Ocupação').fill('Batedor');
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 3 Geração
  await page.getByRole('radio', { name: /Pós-Colapso/ }).click();
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 4 Propósitos
  await page.getByLabel('Propósito Pessoal 1').fill('Ter tranquilidade e segurança.');
  await page.getByLabel('Propósito Pessoal 2').fill('Entender o que fez o mundo ficar assim.');
  await page.getByLabel('Propósito Coletivo').fill('Mapear toda a região');
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 5 Aptidões — validação: não avança sem distribuir
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByRole('alert')).toContainText('Instintos');
  await noHorizontalScroll(page);
  await inc(page, 'Potência', 2);
  await inc(page, 'Resolução', 1);
  await inc(page, 'Biologia', 2);
  await inc(page, 'Geografia', 2);
  await inc(page, 'Armas', 2);
  await inc(page, 'Furtividade', 1);
  await expect(page.getByRole('button', { name: 'Aumentar Influência' })).toBeDisabled(); // 9 pontos usados
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 6 Cabo de Guerra, 7 Saúde
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByText('36', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 8 Características: Agricultor (1) + Batedor (2)
  await page.getByRole('heading', { name: 'Agricultor' }).locator('xpath=ancestor::div[contains(@class,"card")][1]').getByRole('button', { name: 'Selecionar' }).click();
  await page.getByRole('heading', { name: 'Batedor' }).locator('xpath=ancestor::div[contains(@class,"card")][1]').getByRole('button', { name: 'Selecionar' }).click();
  // Requisito não cumprido fica bloqueado
  await expect(page.getByRole('heading', { name: 'Mira Fatal' }).locator('xpath=ancestor::div[contains(@class,"card")][1]').getByRole('button')).toBeDisabled();
  await page.getByRole('button', { name: 'Próximo' }).click();
  // 9 Equipamentos
  await page.getByRole('button', { name: 'Concluir Infectado' }).click();
  await expect(page.getByRole('alert')).toContainText('pacote');
  await page.getByRole('radio', { name: /Nômade/ }).click();
  await page.getByRole('button', { name: 'Concluir Infectado' }).click();
  await expect(page.getByRole('heading', { name: 'Joaquin Jardim' })).toBeVisible();
}

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
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: /Joaquin Jardim/ })).toBeVisible();
});

test('criação em andamento pode ser retomada', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Infectado/ }).click();
  await page.getByRole('button', { name: '+ Novo Infectado' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Rascunho');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.goto('/#/');
  await page.getByRole('button', { name: /Rascunho/ }).click();
  await expect(page.getByRole('heading', { name: 'Origens' })).toBeVisible();
});

test('tradutor de dados converte faces e soma mantidos', async ({ page }) => {
  await page.goto('/#/dice');
  await page.getByRole('button', { name: /Infectado/ }).click().catch(() => undefined);
  await page.goto('/#/dice');
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
  await page.goto('/');
  await page.getByRole('button', { name: /Infectado/ }).click();
  for (const hash of ['/', '/dice', '/rules', '/backup']) {
    await page.goto(`/#${hash}`);
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
  }
});

test('Assimilador sem servidor configurado recebe aviso honesto', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Assimilador/ }).click();
  await expect(page.getByText(/sincronização não está configurada/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Criar mesa/ })).toBeDisabled();
});
