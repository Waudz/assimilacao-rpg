// Regras de criação e cálculo de Infectados — Livro de Regras de Assimilação RPG.
// Páginas citadas são as numeradas no livro impresso.

export const INSTINCTS = ['Influência', 'Percepção', 'Potência', 'Reação', 'Resolução', 'Sagacidade'] as const;
export const KNOWLEDGE = ['Biologia', 'Erudição', 'Engenharia', 'Geografia', 'Medicina', 'Segurança'] as const;
export const PRACTICES = ['Armas', 'Atletismo', 'Expressão', 'Furtividade', 'Manufaturas', 'Sobrevivência'] as const;
export const SKILLS = [...KNOWLEDGE, ...PRACTICES] as const;

export const HEALTH_LEVELS = [
  { level: 6, name: 'Saudável', tone: 'ok', recovery: 'Recupera a cada repouso completo' },
  { level: 5, name: 'Escoriação', tone: 'ok', recovery: 'Recupera a cada repouso completo' },
  { level: 4, name: 'Laceração', tone: 'warn', recovery: 'Recupera após uma semana · Menos 1 Sucesso em todos os testes' },
  { level: 3, name: 'Ferimentos', tone: 'warn', recovery: 'Recupera após uma semana · Menos 1 Sucesso em todos os testes' },
  { level: 2, name: 'Debilitação', tone: 'bad', recovery: 'Sem regeneração natural; exige tratamento médico · Menos 2 Sucessos; agir custa 1 Determinação' },
  { level: 1, name: 'Incapacitação', tone: 'bad', recovery: 'Sem regeneração natural; exige tratamento médico · Inconsciente; manter-se consciente custa 1 Determinação por rodada' },
] as const;

export const INSTINCT_START = 1;
export const INSTINCT_FREE_POINTS = 3;
export const INSTINCT_CREATION_MAX = 3;
export const INSTINCT_MAX = 5;
export const SKILL_POINTS = 7;
export const SKILL_CREATION_MAX = 2;
export const SKILL_MAX = 5;
export const START_XP = 7;
export const GAUGE_TOTAL = 10;

export const GENERATIONS = [
  { id: 'pre', label: 'Pré-Colapso', hint: 'Nascido e criado antes do Colapso' },
  { id: 'colapso', label: 'Geração-Colapso', hint: 'Passou pelo Colapso entre os 5 e 12 anos' },
  { id: 'pos', label: 'Pós-Colapso', hint: 'Nasceu depois do Colapso ou tinha menos de 5 anos' },
] as const;
export type GenerationId = (typeof GENERATIONS)[number]['id'];

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  note: string;
}

export interface Character {
  id: string;
  schema: 2;
  /** 'draft' enquanto a criação não foi concluída. */
  status: 'draft' | 'ready';
  /** Última etapa do assistente (0-8). */
  step: number;
  name: string;
  event: string;
  occupation: string;
  generation: GenerationId | '';
  age: string;
  personalGoals: [string, string];
  collectiveGoal: string;
  /** Pontos de criação nos Instintos (soma 9, cada um 1-3). */
  instincts: number[];
  /** Pontos de criação em Conhecimentos+Práticas (soma 7, cada um 0-2). */
  skills: number[];
  /** Melhorias compradas com experiência (somadas ao valor de criação). */
  skillUps: number[];
  /** Melhorias manuais de Instintos após a criação (evolução). */
  instinctUps: number[];
  /** Nível inicial de Assimilação definido pelo Assimilador (padrão 1). */
  initialAssimilation: number;
  /** Nível atual de Determinação (Assimilação = 10 - Determinação). */
  determinationLevel: number;
  determinationSpent: number;
  assimilationSpent: number;
  /** Pontos de Saúde perdidos no total. */
  damage: number;
  /** IDs de Características do catálogo. */
  traits: string[];
  traitNotes: Record<string, string>;
  /** Características registradas à mão (fora do catálogo). */
  customTraits: string;
  equipmentPack: string;
  inventory: InventoryItem[];
  notes: string;
  /** Segredo local para recuperar a propriedade da ficha no servidor. */
  recoverySecret: string;
  createdAt: number;
  updatedAt: number;
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newCharacter(): Character {
  const now = Date.now();
  return {
    id: randomId(),
    schema: 2,
    status: 'draft',
    step: 0,
    name: '',
    event: '',
    occupation: '',
    generation: '',
    age: '',
    personalGoals: ['', ''],
    collectiveGoal: '',
    instincts: Array(6).fill(INSTINCT_START),
    skills: Array(12).fill(0),
    skillUps: Array(12).fill(0),
    instinctUps: Array(6).fill(0),
    initialAssimilation: 1,
    determinationLevel: 9,
    determinationSpent: 0,
    assimilationSpent: 0,
    damage: 0,
    traits: [],
    traitNotes: {},
    customTraits: '',
    equipmentPack: '',
    inventory: [],
    notes: '',
    recoverySecret: randomSecret(),
    createdAt: now,
    updatedAt: now,
  };
}

export const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ---------------------------------------------------------------- valores efetivos
export const instinctValue = (c: Character, i: number) => c.instincts[i] + (c.instinctUps?.[i] ?? 0);
export const skillValue = (c: Character, i: number) => c.skills[i] + (c.skillUps?.[i] ?? 0);

/** Valor atual de qualquer aptidão pelo nome (Instinto, Conhecimento, Prática ou Assimilação). */
export function aptitudeByName(c: Character, name: string): number {
  const i = (INSTINCTS as readonly string[]).indexOf(name);
  if (i >= 0) return instinctValue(c, i);
  const s = (SKILLS as readonly string[]).indexOf(name);
  if (s >= 0) return skillValue(c, s);
  if (name === 'Assimilação') return assimilationLevel(c);
  return 0;
}

// ---------------------------------------------------------------- Cabo de Guerra (pág. 58 e 81)
export const assimilationLevel = (c: Character) =>
  // Durante a criação o nível ainda não foi gravado: vale o inicial + Estágio Avançado.
  c.status === 'draft' ? clamp(c.initialAssimilation + (c.traits.includes('estagio-avancado') ? 1 : 0), 0, GAUGE_TOTAL) : GAUGE_TOTAL - c.determinationLevel;
export const determinationAvailable = (c: Character) => Math.max(0, c.determinationLevel - c.determinationSpent);
export const assimilationAvailable = (c: Character) => Math.max(0, assimilationLevel(c) - c.assimilationSpent);

// ---------------------------------------------------------------- Saúde (pág. 65-67 e 82)
export const POTENCIA = 2;
export const RESOLUCAO = 4;
export const healthPerLevel = (c: Character) => 1 + instinctValue(c, POTENCIA) + instinctValue(c, RESOLUCAO);
export const healthMax = (c: Character) => healthPerLevel(c) * 6;
export const healthCurrent = (c: Character) => Math.max(0, healthMax(c) - c.damage);
export const isDead = (c: Character) => healthMax(c) - c.damage <= 0;
/** Pontos de Saúde regenerados a cada Recuperação: Potência + 1 (pág. 65). */
export const regenAmount = (c: Character) => instinctValue(c, POTENCIA) + 1;

export interface HealthLevelState {
  level: number;
  name: string;
  tone: 'ok' | 'warn' | 'bad';
  recovery: string;
  /** Pontos de Saúde restantes neste nível. */
  remaining: number;
  max: number;
  status: 'full' | 'current' | 'lost';
}

/** Estado de cada um dos seis níveis, do 6 (Saudável) ao 1 (Incapacitação). */
export function healthLevels(c: Character): HealthLevelState[] {
  const per = healthPerLevel(c);
  const damage = clamp(c.damage, 0, per * 6);
  return HEALTH_LEVELS.map((h, idx) => {
    const lost = clamp(damage - idx * per, 0, per);
    const remaining = per - lost;
    const status: HealthLevelState['status'] = lost === 0 ? 'full' : remaining === 0 ? 'lost' : 'current';
    return { ...h, remaining, max: per, status };
  });
}

/** Nível de Saúde em que o Infectado está (6..1) ou 0 se morto. */
export function currentHealthLevel(c: Character): number {
  const per = healthPerLevel(c);
  if (c.damage >= per * 6) return 0;
  return 6 - Math.floor(c.damage / per);
}

export function applyDamage(c: Character, points: number): Character {
  return { ...c, damage: clamp(c.damage + points, 0, healthMax(c)) };
}
export function applyHealing(c: Character, points: number): Character {
  return { ...c, damage: clamp(c.damage - points, 0, healthMax(c)) };
}

// ---------------------------------------------------------------- Experiência (pág. 83)
/** Custo de subir uma Aptidão de Conhecimento/Prática para o nível `to`: o dobro do nível desejado. */
export const upgradeCost = (to: number) => 2 * to;

export function skillUpgradeXp(c: Character): number {
  let total = 0;
  for (let i = 0; i < 12; i++) {
    for (let lvl = c.skills[i] + 1; lvl <= c.skills[i] + c.skillUps[i]; lvl++) total += upgradeCost(lvl);
  }
  return total;
}

// ---------------------------------------------------------------- validação por etapa
export const STEPS = [
  'Nome',
  'Origens',
  'Geração',
  'Propósitos',
  'Aptidões',
  'Cabo de Guerra',
  'Saúde',
  'Características',
  'Equipamentos',
] as const;

export function validateStep(c: Character, step: number, xpSpent = 0): string[] {
  const e: string[] = [];
  switch (step) {
    case 0:
      if (!c.name.trim()) e.push('Informe o nome do Infectado.');
      break;
    case 1:
      if (!c.event.trim()) e.push('Descreva o Evento Marcante.');
      if (!c.occupation.trim()) e.push('Informe a Ocupação.');
      break;
    case 2:
      if (!c.generation) e.push('Escolha a Geração.');
      break;
    case 3:
      if (c.personalGoals.some((g) => !g.trim())) e.push('Informe os dois Propósitos Pessoais.');
      if (!c.collectiveGoal.trim()) e.push('Informe o Propósito Coletivo.');
      break;
    case 4:
      if (sum(c.instincts) !== INSTINCT_START * 6 + INSTINCT_FREE_POINTS || c.instincts.some((v) => !Number.isInteger(v) || v < 1 || v > INSTINCT_CREATION_MAX))
        e.push('Instintos: use exatamente 9 pontos, de 1 a 3 em cada Instinto.');
      if (sum(c.skills) !== SKILL_POINTS || c.skills.some((v) => !Number.isInteger(v) || v < 0 || v > SKILL_CREATION_MAX))
        e.push('Conhecimentos e Práticas: use exatamente 7 pontos, no máximo 2 em cada.');
      break;
    case 5:
      if (!Number.isInteger(c.initialAssimilation) || c.initialAssimilation < 0 || c.initialAssimilation > 10)
        e.push('O nível inicial de Assimilação deve ficar entre 0 e 9 (Determinação 10 a 1).');
      break;
    case 7:
      if (xpSpent > START_XP) e.push(`Você gastou ${xpSpent} de ${START_XP} pontos de experiência.`);
      break;
    case 8:
      if (!c.equipmentPack) e.push('Escolha um pacote de equipamentos iniciais.');
      break;
  }
  return e;
}

// ---------------------------------------------------------------- migração de fichas antigas (v1)
interface LegacyCharacter {
  id: string;
  name?: string;
  event?: string;
  occupation?: string;
  generation?: string;
  personalGoals?: [string, string];
  collectiveGoal?: string;
  instincts?: number[];
  skills?: number[];
  determination?: number;
  assimilation?: number;
  health?: number;
  notes?: string;
  equipmentPack?: string;
  equipmentNotes?: string;
  characteristics?: string;
  createdAt?: number;
  updatedAt?: number;
}

export function migrateLegacy(old: LegacyCharacter): Character {
  const base = newCharacter();
  const instincts = old.instincts?.length === 6 ? old.instincts : base.instincts;
  const skills = old.skills?.length === 12 ? old.skills : base.skills;
  const assim = clamp(old.assimilation ?? 1, 0, 10);
  const detLevel = GAUGE_TOTAL - assim;
  const draft: Character = {
    ...base,
    id: old.id,
    status: 'ready',
    step: 8,
    name: old.name ?? '',
    event: old.event ?? '',
    occupation: old.occupation ?? '',
    generation: matchGeneration(old.generation),
    age: !matchGeneration(old.generation) && old.generation ? old.generation : '',
    personalGoals: old.personalGoals ?? ['', ''],
    collectiveGoal: old.collectiveGoal ?? '',
    instincts,
    skills,
    initialAssimilation: assim,
    determinationLevel: detLevel,
    determinationSpent: Math.max(0, detLevel - (old.determination ?? detLevel)),
    customTraits: old.characteristics ?? '',
    equipmentPack: old.equipmentPack ?? '',
    inventory: old.equipmentNotes ? [{ id: randomId(), name: old.equipmentNotes, qty: 1, note: '' }] : [],
    notes: old.notes ?? '',
    createdAt: old.createdAt ?? Date.now(),
    updatedAt: old.updatedAt ?? Date.now(),
  };
  const max = healthMax(draft);
  const oldMax = (1 + instincts[2] + instincts[4]) * 6;
  const oldHealth = old.health ?? oldMax;
  return { ...draft, damage: clamp(oldMax - oldHealth, 0, max) };
}

function matchGeneration(text?: string): GenerationId | '' {
  if (!text) return '';
  const t = text.toLowerCase();
  if (t.includes('pós') || t.includes('pos')) return 'pos';
  if (t.includes('pré') || t.includes('pre')) return 'pre';
  if (t.includes('colapso')) return 'colapso';
  return '';
}

/** Garante que qualquer objeto vindo de disco/backup/servidor tenha todos os campos do modelo atual. */
export function normalizeCharacter(raw: Partial<Character> & { id: string }): Character {
  if ((raw as { schema?: number }).schema !== 2) return migrateLegacy(raw as LegacyCharacter);
  const base = newCharacter();
  const c = { ...base, ...raw } as Character;
  c.instincts = fit(c.instincts, 6, 1);
  c.skills = fit(c.skills, 12, 0);
  c.skillUps = fit(c.skillUps, 12, 0);
  c.instinctUps = fit(c.instinctUps, 6, 0);
  c.personalGoals = [c.personalGoals?.[0] ?? '', c.personalGoals?.[1] ?? ''];
  c.traits = Array.isArray(c.traits) ? c.traits : [];
  c.inventory = Array.isArray(c.inventory) ? c.inventory : [];
  c.traitNotes = c.traitNotes ?? {};
  c.damage = clamp(Number(c.damage) || 0, 0, healthMax(c));
  c.determinationLevel = clamp(Number(c.determinationLevel) || 0, 0, GAUGE_TOTAL);
  return c;
}

function fit(a: number[] | undefined, n: number, fill: number) {
  return Array.from({ length: n }, (_, i) => (typeof a?.[i] === 'number' ? a[i] : fill));
}
