import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingTable, getPendingTable } from '../src/lib/pendingTable';

const checkTableCode = vi.fn();
vi.mock('../src/lib/sync', () => ({
  engine: { checkTableCode: (c: string) => checkTableCode(c) },
  syncConfigured: true,
  syncLabel: () => ({ text: 'Salvo neste dispositivo', tone: 'muted' }),
}));

import { useConfirm } from '../src/components/ui';
import { db } from '../src/lib/db';
import { HomePage } from '../src/pages/HomePage';

beforeEach(async () => {
  clearPendingTable();
  checkTableCode.mockReset();
  await db.characters.clear();
});

describe('Home: entrar na mesa antes de criar personagem', () => {
  it('código válido fica guardado (sem criar ficha) e pode ser removido', async () => {
    const u = userEvent.setup();
    checkTableCode.mockResolvedValue({ ok: true });
    render(<HomePage onSwitchRole={() => undefined} />);
    const input = screen.getByLabelText('Código da mesa');
    await u.type(input, 'abcd-2345');
    expect(input).toHaveValue('ABCD2345'); // normalizado
    await u.click(screen.getByRole('button', { name: /Usar este código/ }));
    expect(await screen.findByText(/confirmado/)).toBeInTheDocument();
    expect(getPendingTable()?.code).toBe('ABCD2345');
    expect(await db.characters.count()).toBe(0); // nenhum personagem vazio
    await u.click(screen.getByRole('button', { name: /Remover código/ }));
    expect(getPendingTable()).toBeNull();
    expect(screen.getByLabelText('Código da mesa')).toBeInTheDocument();
  });

  it('código inválido mostra o erro e não guarda nada; botão só habilita com 8 caracteres', async () => {
    const u = userEvent.setup();
    checkTableCode.mockResolvedValue({ ok: false, error: 'Código inválido. Confira com o Assimilador.' });
    render(<HomePage onSwitchRole={() => undefined} />);
    const btn = screen.getByRole('button', { name: /Usar este código/ });
    expect(btn).toBeDisabled();
    await u.type(screen.getByLabelText('Código da mesa'), 'ZZZZZZZZ');
    expect(btn).toBeEnabled();
    await u.click(btn);
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(getPendingTable()).toBeNull();
  });
});

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const [ask, dialog] = useConfirm();
  const [n, setN] = useState(0);
  return (
    <>
      <button
        onClick={async () => {
          onResult(await ask({ title: 'Excluir?', message: 'Sem volta', confirmLabel: 'Excluir', tone: 'danger' }));
          setN(n + 1);
        }}
      >
        abrir
      </button>
      <span>{n}</span>
      {dialog}
    </>
  );
}

describe('Modal de confirmação (substitui window.confirm)', () => {
  it('confirma, cancela e fecha com Esc', async () => {
    const u = userEvent.setup();
    const results: boolean[] = [];
    render(<Harness onResult={(v) => results.push(v)} />);
    await u.click(screen.getByText('abrir'));
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAccessibleName('Excluir?');
    await u.click(screen.getByRole('button', { name: 'Excluir', hidden: true }));
    await waitFor(() => expect(results).toEqual([true]));
    await u.click(screen.getByText('abrir'));
    await u.click(screen.getByRole('button', { name: 'Cancelar', hidden: true }));
    await waitFor(() => expect(results).toEqual([true, false]));
    await u.click(screen.getByText('abrir'));
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(results).toEqual([true, false, false]));
  });
});
