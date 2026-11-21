import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';

let resolveList: (v: { id: string; code: string; name: string }[]) => void = () => undefined;
vi.mock('../src/lib/sync', () => ({
  engine: { pullTable: async () => ({ ok: true }) },
  supabaseRemote: {
    listTables: () => new Promise((res) => (resolveList = res as typeof resolveList)),
    subscribe: () => () => undefined,
  },
  syncConfigured: true,
  syncLabel: () => ({ text: '', tone: 'muted' }),
}));

import { GmHome } from '../src/pages/GmPages';

beforeEach(async () => {
  await db.gmTables.clear();
});

describe('regressão: lista de mesas do servidor não apaga mesa recém-criada', () => {
  it('mesa criada enquanto a consulta inicial carrega continua existindo', async () => {
    render(<GmHome onSwitchRole={() => undefined} />);
    await waitFor(() => expect(typeof resolveList).toBe('function'));
    await new Promise((r) => setTimeout(r, 30)); // consulta pendente
    await db.gmTables.put({ id: 'nova', code: 'ABCD2345', name: 'Nova', recoveryKey: 'k' }); // criada agora
    resolveList([]); // resposta antiga, que não conhecia a mesa nova
    await new Promise((r) => setTimeout(r, 80));
    expect(await db.gmTables.get('nova')).toMatchObject({ name: 'Nova', recoveryKey: 'k' });
  });

  it('mesas removidas no servidor (que já existiam localmente) são limpas; as do servidor preservam a chave local', async () => {
    await db.gmTables.bulkPut([
      { id: 'velha', code: 'AAAAAAAA', name: 'Velha' },
      { id: 'viva', code: 'BBBBBBBB', name: 'Viva', recoveryKey: 'segredo' },
    ]);
    render(<GmHome onSwitchRole={() => undefined} />);
    await new Promise((r) => setTimeout(r, 30));
    resolveList([{ id: 'viva', code: 'BBBBBBBB', name: 'Viva' }]);
    await waitFor(async () => expect(await db.gmTables.get('velha')).toBeUndefined());
    expect(await db.gmTables.get('viva')).toMatchObject({ recoveryKey: 'segredo' });
  });
});
