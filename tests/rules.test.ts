import { describe, expect, it } from 'vitest';
import { TRAITS, TRAIT_BY_ID, EQUIPMENT_PACKS, missingRequirements, traitsCost } from '../src/lib/catalog';
import { DIE_TYPES, isValidFace, sumKept, translateFace } from '../src/lib/dice';
import {
  applyDamage,
  applyHealing,
  assimilationLevel,
  currentHealthLevel,
  healthCurrent,
  healthLevels,
  healthMax,
  healthPerLevel,
  isDead,
  migrateLegacy,
  newCharacter,
  normalizeCharacter,
  regenAmount,
  skillUpgradeXp,
  upgradeCost,
  validateStep,
  type Character,
} from '../src/lib/rules';

const withApt = (over: Partial<Character>) => ({ ...newCharacter(), ...over });

describe('criação — Aptidões (pág. 80)', () => {
  it('aceita 9 pontos em Instintos (1-3) e 7 em Conhecimentos/Práticas (0-2)', () => {
    const c = withApt({ instincts: [3, 2, 1, 1, 1, 1], skills: [2, 1, 0, 0, 2, 0, 1, 1, 0, 0, 0, 0] });
    expect(validateStep(c, 4)).toEqual([]);
  });
  it('rejeita Instinto acima de 3 na criação', () => {
    const c = withApt({ instincts: [4, 1, 1, 1, 1, 1] });
    expect(validateStep(c, 4).join(' ')).toMatch(/Instintos/);
  });
  it('rejeita total de Instintos diferente de 9', () => {
    expect(validateStep(withApt({ instincts: [1, 1, 1, 1, 1, 1] }), 4).join(' ')).toMatch(/Instintos/);
    expect(validateStep(withApt({ instincts: [3, 3, 1, 1, 1, 1] }), 4).join(' ')).toMatch(/Instintos/);
  });
  it('rejeita Instinto abaixo de 1', () => {
    expect(validateStep(withApt({ instincts: [0, 3, 3, 1, 1, 1] }), 4).join(' ')).toMatch(/Instintos/);
  });
  it('rejeita aptidão acima de 2 ou total diferente de 7', () => {
    expect(validateStep(withApt({ skills: [3, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }), 4).join(' ')).toMatch(/Conhecimentos/);
    expect(validateStep(withApt({ skills: [2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 4).join(' ')).toMatch(/Conhecimentos/);
  });
  it('valores não inteiros são rejeitados', () => {
    expect(validateStep(withApt({ instincts: [1.5, 1.5, 3, 1, 1, 1] }), 4).length).toBeGreaterThan(0);
  });
});

describe('criação — etapas narrativas', () => {
  it('exige nome, origens, geração e propósitos', () => {
    const c = newCharacter();
    expect(validateStep(c, 0)).toHaveLength(1);
    expect(validateStep(c, 1)).toHaveLength(2);
    expect(validateStep(c, 2)).toHaveLength(1);
    expect(validateStep(c, 3)).toHaveLength(2);
    expect(validateStep(c, 8)).toHaveLength(1);
  });
  it('experiência acima de 7 é inválida', () => {
    expect(validateStep(newCharacter(), 7, 8)).toHaveLength(1);
    expect(validateStep(newCharacter(), 7, 7)).toHaveLength(0);
  });
});

describe('Saúde (pág. 65–67, 82)', () => {
  it('pontos por nível = 1 + Potência + Resolução (exemplos do livro)', () => {
    const a = withApt({ instincts: [1, 1, 2, 1, 3, 1] }); // Potência 2, Resolução 3
    expect(healthPerLevel(a)).toBe(6);
    expect(healthMax(a)).toBe(36);
    expect(healthPerLevel(withApt({ instincts: [1, 1, 3, 1, 2, 1] }))).toBe(6);
    expect(healthPerLevel(newCharacter())).toBe(3); // Potência 1 e Resolução 1
  });
  it('o dano atravessa os níveis em ordem', () => {
    let c = withApt({ instincts: [1, 1, 1, 1, 1, 1] }); // 3 por nível
    expect(currentHealthLevel(c)).toBe(6);
    c = applyDamage(c, 2);
    expect(currentHealthLevel(c)).toBe(6);
    expect(healthLevels(c)[0]).toMatchObject({ remaining: 1, status: 'current' });
    c = applyDamage(c, 1);
    expect(currentHealthLevel(c)).toBe(5);
    expect(healthLevels(c)[0].status).toBe('lost');
    c = applyDamage(c, 4); // 7 de dano: nível 4 com 2 restantes
    expect(currentHealthLevel(c)).toBe(4);
    expect(healthLevels(c)[2]).toMatchObject({ remaining: 2, status: 'current' });
  });
  it('dano excedente reduz níveis seguintes até a morte', () => {
    let c = newCharacter();
    c = applyDamage(c, 17);
    expect(currentHealthLevel(c)).toBe(1);
    expect(isDead(c)).toBe(false);
    c = applyDamage(c, 1);
    expect(isDead(c)).toBe(true);
    expect(currentHealthLevel(c)).toBe(0);
    expect(healthCurrent(c)).toBe(0);
    expect(applyDamage(c, 50).damage).toBe(healthMax(c));
  });
  it('cura limitada ao máximo; Recuperação = Potência + 1', () => {
    const c = withApt({ instincts: [1, 1, 3, 1, 1, 1], damage: 5 });
    expect(regenAmount(c)).toBe(4);
    expect(applyHealing(c, 100).damage).toBe(0);
    expect(applyHealing(c, 4).damage).toBe(1);
  });
});

describe('Cabo de Guerra (pág. 58, 81)', () => {
  it('padrão Determinação 9 / Assimilação 1; soma sempre 10', () => {
    const c = newCharacter();
    expect(c.determinationLevel).toBe(9);
    expect(assimilationLevel(c)).toBe(1);
    expect(c.determinationLevel + assimilationLevel(c)).toBe(10);
  });
});

describe('experiência (pág. 83)', () => {
  it('custo = dobro do nível desejado', () => {
    expect(upgradeCost(3)).toBe(6);
    expect(upgradeCost(1)).toBe(2);
  });
  it('soma custos de melhorias de Conhecimentos/Práticas', () => {
    const c = withApt({ skills: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], skillUps: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    // Biologia 2→3 = 6; Erudição 0→1 = 2, 1→2 = 4
    expect(skillUpgradeXp(c)).toBe(12);
  });
});

describe('catálogo de Características (pág. 83–89)', () => {
  it('tem custos de 1 a 5 e ids únicos', () => {
    expect(new Set(TRAITS.map((t) => t.id)).size).toBe(TRAITS.length);
    expect(Math.min(...TRAITS.map((t) => t.cost))).toBe(1);
    expect(Math.max(...TRAITS.map((t) => t.cost))).toBe(5);
    expect(TRAITS.filter((t) => t.cost === 1)).toHaveLength(11);
    expect(TRAITS.filter((t) => t.cost === 2)).toHaveLength(17);
    expect(TRAITS.filter((t) => t.cost === 3)).toHaveLength(16);
    expect(TRAITS.filter((t) => t.cost === 4)).toHaveLength(3);
    expect(TRAITS.filter((t) => t.cost === 5)).toHaveLength(2);
  });
  it('valida requisitos simples, compostos e do tipo "ou"', () => {
    const c = newCharacter(); // tudo 1/0
    expect(missingRequirements(c, TRAIT_BY_ID['pegada-forte'])).toHaveLength(1); // Potência 2+
    expect(missingRequirements({ ...c, instincts: [1, 1, 2, 1, 1, 1] }, TRAIT_BY_ID['pegada-forte'])).toHaveLength(0);
    expect(missingRequirements({ ...c, instincts: [1, 1, 2, 1, 1, 1] }, TRAIT_BY_ID['punhos-de-ferro'])).toHaveLength(1); // falta Resolução
    // Orientação: Geografia OU Sobrevivência 2+
    expect(missingRequirements(c, TRAIT_BY_ID['orientacao'])).toHaveLength(1);
    expect(missingRequirements({ ...c, skills: [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0] }, TRAIT_BY_ID['orientacao'])).toHaveLength(0);
    expect(missingRequirements({ ...c, skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2] }, TRAIT_BY_ID['orientacao'])).toHaveLength(0);
    // Resiliente exige nível de Assimilação 2+
    expect(missingRequirements(c, TRAIT_BY_ID['resiliente'])).toHaveLength(1);
    expect(missingRequirements({ ...c, determinationLevel: 8 }, TRAIT_BY_ID['resiliente'])).toHaveLength(0);
  });
  it('melhorias de experiência contam para requisitos', () => {
    const c = withApt({ skillUps: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(missingRequirements(c, TRAIT_BY_ID['agricultor'])).toHaveLength(0); // Geografia 1+
  });
  it('soma custo das Características escolhidas', () => {
    expect(traitsCost(withApt({ traits: ['agricultor', 'mira-fatal'] }))).toBe(6);
  });
  it('nove pacotes de equipamentos', () => {
    expect(Object.keys(EQUIPMENT_PACKS)).toHaveLength(9);
    for (const items of Object.values(EQUIPMENT_PACKS)) expect(items).toHaveLength(5);
  });
});

describe('tradutor de dados', () => {
  // Sucessos / Adaptações / Pressões — tabela fornecida pelo Assimilador.
  const expected: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    2: [0, 0, 0],
    3: [0, 0, 1],
    4: [0, 1, 1],
    5: [0, 1, 1],
    6: [1, 0, 0],
    7: [2, 0, 0],
    8: [1, 1, 0],
    9: [1, 1, 1],
    10: [2, 0, 1],
    11: [1, 2, 1],
    12: [0, 0, 2],
  };
  for (const die of DIE_TYPES) {
    it(`converte todas as faces do D${die}`, () => {
      for (let f = 1; f <= die; f++) {
        const s = translateFace(die, f);
        expect([s.success, s.adapt, s.pressure]).toEqual(expected[f]);
      }
    });
    it(`rejeita faces fora de 1–${die}`, () => {
      expect(isValidFace(die, 0)).toBe(false);
      expect(isValidFace(die, die + 1)).toBe(false);
      expect(() => translateFace(die, die + 1)).toThrow();
    });
  }
  it('soma apenas os dados mantidos', () => {
    const rolls = [
      { id: 'a', die: 12 as const, face: 11, keep: true },
      { id: 'b', die: 10 as const, face: 10, keep: true },
      { id: 'c', die: 6 as const, face: 6, keep: false },
    ];
    expect(sumKept(rolls)).toEqual({ success: 3, adapt: 2, pressure: 2 });
    expect(sumKept([])).toEqual({ success: 0, adapt: 0, pressure: 0 });
  });
});

describe('migração de fichas do protótipo (v1)', () => {
  it('converte uma ficha antiga preservando dados', () => {
    const c = migrateLegacy({
      id: 'old-1',
      name: 'Joaquin Jardim',
      event: 'Fuga',
      occupation: 'Batedor',
      generation: 'Pós-Colapso',
      personalGoals: ['a', 'b'],
      collectiveGoal: 'c',
      instincts: [2, 2, 2, 2, 1, 1],
      skills: [0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1],
      determination: 7,
      assimilation: 1,
      health: 14,
      equipmentPack: 'Nômade',
      characteristics: 'Batedor (2)',
      notes: 'n',
    });
    expect(c.schema).toBe(2);
    expect(c.id).toBe('old-1');
    expect(c.status).toBe('ready');
    expect(c.generation).toBe('pos');
    expect(c.determinationLevel).toBe(9);
    expect(c.determinationSpent).toBe(2);
    expect(healthMax(c)).toBe(24); // 1 + 2 + 1 = 4 × 6
    expect(c.damage).toBe(10);
    expect(c.customTraits).toBe('Batedor (2)');
    expect(c.equipmentPack).toBe('Nômade');
  });
  it('normalizeCharacter completa campos ausentes', () => {
    const c = normalizeCharacter({ id: 'x', schema: 2, name: 'A' } as Partial<Character> & { id: string });
    expect(c.skills).toHaveLength(12);
    expect(c.inventory).toEqual([]);
    expect(c.traitNotes).toEqual({});
  });
});
