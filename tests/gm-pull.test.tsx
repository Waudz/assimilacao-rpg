import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';
import { newCharacter } from '../src/lib/rules';

const pullTable = vi.fn(async () => ({ ok: true }));
vi.mock('../src/lib/sync', () => ({
  engine: { pullTable: (...a: unknown[]) => (pullTable as (...x: unknown[]) => unknown)(...a) },
  supabaseRemote: { subscribe: () => () => undefined, kick: async () => undefined },
  syncConfigured: true,
  syncLabel: () => ({ text: '', tone: 'muted' }),
}));

import { GmCharacterPage } from '../src/pages/GmPages';

beforeEach(async () => {
  pullTable.mockClear();
  await db.remote.clear();
});

describe('Assimilador: ficha aberta recebe atualizações (regressão)', () => {
  it('a tela da ficha também puxa a mesa (antes só a lista atualizava) e reflete mudanças da cópia local', async () => {
    const c = { ...newCharacter(), name: 'Joaquin', status: 'ready' as const };
    await db.remote.put({ id: c.id, tableId: 'mesa-1', rev: 1, data: c, updatedAt: Date.now() });
    render(<GmCharacterPage tableId="mesa-1" charId={c.id} />);
    await waitFor(() => expect(pullTable).toHaveBeenCalledWith('mesa-1'));
    expect(await screen.findByLabelText('18 de 18 pontos de Saúde')).toBeInTheDocument();
    // chega uma atualização do servidor → a tela muda sem recarregar
    await db.remote.put({ id: c.id, tableId: 'mesa-1', rev: 2, data: { ...c, damage: 5 }, updatedAt: Date.now() });
    expect(await screen.findByLabelText('13 de 18 pontos de Saúde')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sofrer dano/ })).toBeNull(); // somente leitura
  });
});
