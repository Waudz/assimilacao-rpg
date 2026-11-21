import { expect, type Page } from '@playwright/test';

export const inc = (page: Page, apt: string, times: number) => page.getByRole('button', { name: `Aumentar ${apt}`, exact: true }).click({ clickCount: times, delay: 30 });

export async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'rolagem horizontal').toBeLessThanOrEqual(0);
}

export async function createCharacter(page: Page) {
  await page.goto('./');
  const role = page.getByRole('button', { name: /^Infectado/ });
  const novo = page.getByRole('button', { name: /Novo Infectado/ });
  await role.or(novo).first().waitFor();
  if (await role.isVisible()) await role.click(); // primeira abertura: escolher o papel
  await novo.click();

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

