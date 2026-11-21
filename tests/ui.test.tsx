import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { HealthPanel, TraitPicker } from '../src/components/panels';
import { DicePage } from '../src/pages/DicePage';
import { newCharacter } from '../src/lib/rules';

describe('DicePage', () => {
  it('adiciona faces, mantém dados e soma símbolos', async () => {
    const u = userEvent.setup();
    render(<DicePage />);
    await u.click(screen.getByRole('button', { name: 'D12' }));
    await u.click(screen.getByRole('button', { name: 'Adicionar D12 face 12' }));
    await u.click(screen.getByLabelText('Manter D12 face 12'));
    expect(screen.getAllByLabelText('0 sucessos, 0 adaptações, 2 pressões')).toHaveLength(2); // linha + total
    await u.click(screen.getByRole('button', { name: 'D6' }));
    expect(screen.queryByRole('button', { name: 'Adicionar D6 face 7' })).toBeNull();
  });
});

describe('TraitPicker', () => {
  it('bloqueia seleção sem requisito na criação e libera no modo evolução', () => {
    const c = newCharacter();
    const noop = () => undefined;
    const { unmount } = render(<TraitPicker char={c} enforce onToggle={noop} onNote={noop} />);
    const card = screen.getByRole('heading', { name: 'Pegada Forte' }).closest('.card')!;
    expect(card.querySelector('button')).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Estágio Avançado' })).toBeInTheDocument();
    unmount();
    render(<TraitPicker char={c} enforce={false} onToggle={noop} onNote={noop} />);
    expect(screen.queryByRole('heading', { name: 'Estágio Avançado' })).toBeNull(); // só na criação
  });
});

describe('HealthPanel', () => {
  it('aplica dano e mostra o nível atual', async () => {
    const u = userEvent.setup();
    let c = newCharacter(); // 3 pontos por nível
    const { rerender } = render(<HealthPanel char={c} update={(p) => { c = typeof p === 'function' ? p(c) : { ...c, ...p }; }} />);
    await u.click(screen.getByRole('button', { name: /Sofrer dano/ }));
    rerender(<HealthPanel char={c} update={() => undefined} />);
    expect(screen.getByText(/Nível 6 — Saudável/)).toBeInTheDocument();
    expect(screen.getByLabelText('17 de 18 pontos de Saúde')).toBeInTheDocument();
  });
});
