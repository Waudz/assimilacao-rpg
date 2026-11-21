import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GaugePanel, HealthPanel, TraitPicker } from '../src/components/panels';
import { SheetView } from '../src/components/SheetView';
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

describe('SheetView — abas acessíveis e botões do Cabo de Guerra', () => {
  it('setas, Home e End navegam entre abas com foco e aria corretos', async () => {
    const u = userEvent.setup();
    render(<SheetView char={{ ...newCharacter(), name: 'Teste', status: 'ready' }} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    tabs[0].focus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Perfil' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Perfil' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Perfil' }).id);
    await u.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Notas' })).toHaveFocus();
    await u.keyboard('{ArrowRight}'); // volta ao início
    expect(screen.getByRole('tab', { name: 'Ficha' })).toHaveFocus();
    await u.keyboard('{ArrowLeft}'); // e circula para o fim
    expect(screen.getByRole('tab', { name: 'Notas' })).toHaveFocus();
  });

  it('botões de nível explicam o efeito e mantêm a soma 10', async () => {
    const u = userEvent.setup();
    let c = { ...newCharacter(), status: 'ready' as const };
    const { rerender } = render(<GaugePanel char={c} update={(p) => { c = typeof p === 'function' ? p(c) : { ...c, ...p }; }} />);
    await u.click(screen.getByRole('button', { name: /Assimilação avançou/ }));
    expect(c.determinationLevel).toBe(8);
    rerender(<GaugePanel char={c} update={() => undefined} />);
    expect(screen.getByText('Nível 8')).toBeInTheDocument();
    expect(screen.getByText('Nível 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Determinação recuperou/ })).toBeInTheDocument();
  });
});
