// Catálogo de Características de Infectados (livro, pág. 83-89) e pacotes de equipamentos (pág. 90).
// Os efeitos aqui são resumos curtos em palavras próprias; consulte o livro para o texto oficial.
import { aptitudeByName, type Character } from './rules';

/** Um requisito é satisfeito se QUALQUER aptidão de `any` tiver ao menos `min`. Todos os requisitos precisam valer. */
export interface Requirement {
  any: string[];
  min: number;
}

export interface Trait {
  id: string;
  name: string;
  cost: 1 | 2 | 3 | 4 | 5;
  req: Requirement[];
  summary: string;
  page: number;
  /** Pede uma escolha do jogador (ex.: qual sentido). */
  needsNote?: string;
  /** Só pode ser escolhida na criação da ficha. */
  creationOnly?: boolean;
}

const r = (min: number, ...any: string[]): Requirement => ({ any, min });

export const TRAITS: Trait[] = [
  // ---- 1 ponto (pág. 84)
  { id: 'agricultor', name: 'Agricultor', cost: 1, req: [r(1, 'Geografia')], page: 84, summary: '+1 Sucesso em jogadas sobre cultivo e vida vegetal.' },
  { id: 'cavaleiro', name: 'Cavaleiro', cost: 1, req: [], page: 84, summary: 'Testes de conduzir animais de montaria: 1 Adaptação vira Sucesso.' },
  { id: 'estagio-avancado', name: 'Estágio Avançado', cost: 1, req: [], page: 84, creationOnly: true, summary: 'Só na criação: +1 nível de Assimilação inicial (−1 de Determinação). O Assimilador precisa aprovar.' },
  { id: 'investigador-assimilacao', name: 'Investigador da Assimilação', cost: 1, req: [r(1, 'Biologia')], page: 84, summary: 'Testes para entender a Assimilação: 1 Adaptação vira Sucesso.' },
  { id: 'pegada-forte', name: 'Pegada Forte', cost: 1, req: [r(2, 'Potência')], page: 84, summary: 'Testes de firmeza ao segurar algo: 1 Adaptação vira Sucesso.' },
  { id: 'piloto', name: 'Piloto', cost: 1, req: [], page: 84, summary: 'Testes de condução de veículos: 1 Adaptação vira Sucesso.' },
  { id: 'punhos-de-ferro', name: 'Punhos de Ferro', cost: 1, req: [r(2, 'Potência'), r(2, 'Resolução')], page: 84, summary: 'Ao gastar Determinação em combate desarmado, 1 Adaptação vira Sucesso.' },
  { id: 'saque-rapido', name: 'Saque Rápido', cost: 1, req: [r(2, 'Reação')], page: 84, summary: 'Sacar ou guardar Equipamento não custa Adaptação, nem em Conflito.' },
  { id: 'sono-leve', name: 'Sono Leve', cost: 1, req: [], page: 84, summary: 'Teste de Percepção para não ser surpreendido durante o sono.' },
  { id: 'trato-animais', name: 'Trato com Animais', cost: 1, req: [r(2, 'Influência')], page: 84, summary: 'Influenciar animais de forma amistosa: 1 Adaptação vira Sucesso.' },
  { id: 'viajado', name: 'Viajado', cost: 1, req: [], page: 84, summary: 'Contato com outras culturas e povos: permite anular 1 Pressão.' },
  // ---- 2 pontos (pág. 85-86)
  { id: 'antecedente-marcante', name: 'Antecedente Marcante', cost: 2, req: [], page: 85, summary: 'Ao ativar o Evento Marcante, adiciona 1 Sucesso sem mudar os dados mantidos.' },
  { id: 'aparencia-inofensiva', name: 'Aparência Inofensiva', cost: 2, req: [r(2, 'Influência')], page: 85, summary: 'Em Conflito, gasta símbolos para encarecer as ativações de Ameaças contra você.' },
  { id: 'artes-marciais', name: 'Artes Marciais', cost: 2, req: [r(2, 'Atletismo'), r(2, 'Reação')], page: 85, summary: 'Testes de artes marciais permitem remover 1 Pressão.' },
  { id: 'atencao-redobrada', name: 'Atenção Redobrada', cost: 2, req: [r(2, 'Percepção')], page: 85, summary: 'Ao reagir a perigo súbito, transforma Adaptações em Sucessos até o valor de Reação.' },
  { id: 'atirador-astuto', name: 'Atirador Astuto', cost: 2, req: [r(2, 'Furtividade')], page: 85, summary: 'Atacando de uma cobertura, 1 Adaptação vira Sucesso.' },
  { id: 'batedor', name: 'Batedor', cost: 2, req: [r(2, 'Geografia')], page: 85, summary: 'Explora a Região na metade do tempo e acha marcos geográficos.' },
  { id: 'disciplinado', name: 'Disciplinado', cost: 2, req: [], page: 85, summary: 'Fora de Conflito, com calma e o dobro do tempo, ignora 1 Pressão.' },
  { id: 'dissimulado', name: 'Dissimulado', cost: 2, req: [r(2, 'Influência'), r(1, 'Expressão', 'Furtividade')], page: 85, summary: 'Facilidade de se passar por residente de outro Refúgio.' },
  { id: 'escaldado', name: 'Escaldado', cost: 2, req: [r(2, 'Sagacidade')], page: 85, summary: 'Percebendo segundas intenções, 1 Adaptação vira Sucesso por teste.' },
  { id: 'frugal', name: 'Frugal', cost: 2, req: [], page: 85, summary: 'Aguenta o dobro do tempo sem água e comida antes de sofrer penalidade.' },
  { id: 'intimidador', name: 'Intimidador', cost: 2, req: [], page: 85, summary: 'Ao intimidar, gasta Determinação para usar um Instinto no lugar de Expressão.' },
  { id: 'maos-leves', name: 'Mãos-Leves', cost: 2, req: [r(2, 'Reação'), r(2, 'Furtividade')], page: 86, summary: 'Roubar ou ocultar objetos à vista: +1 Adaptação ao resultado.' },
  { id: 'memoria-afiada', name: 'Memória Afiada', cost: 2, req: [r(2, 'Sagacidade')], page: 86, summary: 'Testes de lembrar informações garantem +1 Sucesso.' },
  { id: 'presenca-encantadora', name: 'Presença Encantadora', cost: 2, req: [r(3, 'Influência')], page: 86, summary: 'Gasta Determinação antes de rolar para anular todas as Pressões em interação social.' },
  { id: 'reliquia', name: 'Relíquia', cost: 2, req: [], page: 86, summary: 'O Artefato inicial é valioso, ignora o teto de Escassez e pode ser consertado quebrado; perdê-lo custa 1 Determinação.' },
  { id: 'sacrificio-heroico', name: 'Sacrifício Heroico', cost: 2, req: [], page: 86, summary: 'Uma vez por sessão, sofre todo o dano no lugar de um aliado próximo.' },
  { id: 'sentido-agucado', name: '[Sentido] Aguçado', cost: 2, req: [r(2, 'Percepção')], page: 86, needsNote: 'Qual sentido? (visão, audição, tato, paladar ou olfato)', summary: 'Percepção com o sentido escolhido adiciona +1 Sucesso.' },
  // ---- 3 pontos (pág. 87-88)
  { id: 'companheiro-animal', name: 'Companheiro Animal', cost: 3, req: [r(1, 'Sobrevivência')], page: 87, summary: 'Animal pequeno ou médio ajuda: +1 Adaptação quando auxilia numa ação.' },
  { id: 'construtor', name: 'Construtor', cost: 3, req: [r(3, 'Engenharia')], page: 87, summary: 'Constrói com eficiência, sem testes semanais de Engenharia para pontos de obra.' },
  { id: 'contra-ataque', name: 'Contra-Ataque', cost: 3, req: [r(2, 'Reação')], page: 87, summary: 'Após sofrer ataque em Conflito, o próximo teste de Neutralizar a Ameaça ganha +1 Sucesso.' },
  { id: 'corpo-grande', name: 'Corpo Grande', cost: 3, req: [r(2, 'Atletismo')], page: 87, summary: 'Testes físicos de Resolução podem usar Potência.' },
  { id: 'determinacao-inabalavel', name: 'Determinação Inabalável', cost: 3, req: [r(3, 'Resolução')], page: 87, summary: 'Testes ligados ao seu Propósito: 1 Adaptação vira Sucesso.' },
  { id: 'esquiva-precisa', name: 'Esquiva Precisa', cost: 3, req: [r(2, 'Reação')], page: 87, summary: 'Investe Sucessos para que ataques contra você sofram Pressões equivalentes.' },
  { id: 'gambiarra', name: 'Gambiarra', cost: 3, req: [r(2, 'Sagacidade')], page: 87, summary: 'Permite mudar Características de Artefatos.' },
  { id: 'inabalavel', name: 'Inabalável', cost: 3, req: [r(3, 'Resolução')], page: 87, summary: 'Resistência mental/emocional: Adaptações viram Sucessos até Resolução vezes por sessão.' },
  { id: 'olhar-minucioso', name: 'Olhar Minucioso', cost: 3, req: [r(2, 'Percepção')], page: 87, summary: 'Procurar algo oculto com Percepção ou Sagacidade: +1 Sucesso.' },
  { id: 'orientacao', name: 'Orientação', cost: 3, req: [r(2, 'Geografia', 'Sobrevivência')], page: 88, summary: 'Recuperar rastro ou saber onde está: +1 Adaptação.' },
  { id: 'parkour', name: 'Parkour', cost: 3, req: [r(2, 'Reação')], page: 88, summary: 'Escalada, equilíbrio, saltos, acrobacias: +1 Adaptação.' },
  { id: 'primeiros-socorros', name: 'Primeiros Socorros', cost: 3, req: [r(2, 'Medicina')], page: 88, summary: 'Cuidar de ferimentos e doenças: +1 Sucesso.' },
  { id: 'racional', name: 'Racional', cost: 3, req: [r(2, 'Erudição')], page: 88, summary: 'Testes mentais de Resolução podem usar Sagacidade.' },
  { id: 'recuperacao-rapida', name: 'Recuperação Rápida', cost: 3, req: [r(2, 'Resolução')], page: 88, summary: 'Cada Recuperação regenera 2 pontos de Saúde adicionais.' },
  { id: 'resiliente', name: 'Resiliente', cost: 3, req: [r(2, 'Assimilação')], page: 88, summary: 'Uma vez por Conflito, gasta Pontos de Assimilação para reduzir o dano sofrido.' },
  { id: 'vaso-ruim', name: 'Vaso Ruim', cost: 3, req: [r(2, 'Resolução')], page: 88, summary: 'Anula a primeira ativação que causaria sua morte; só reutiliza após uma Clareza de Propósito.' },
  // ---- 4 pontos (pág. 89)
  { id: 'heroi-local', name: 'Herói Local', cost: 4, req: [r(3, 'Influência')], page: 89, summary: 'Uma vez por arco, usa o Evento Marcante para evitar perda de Moral do Refúgio.' },
  { id: 'macgyver', name: 'MacGyver', cost: 4, req: [r(2, 'Sagacidade'), r(2, 'Manufaturas')], page: 89, summary: 'Uma vez por sessão, improvisa um Artefato que dura até o fim da cena.' },
  { id: 'suporte', name: 'Suporte', cost: 4, req: [r(2, 'Influência'), r(2, 'Reação')], page: 89, summary: 'Ao Ajudar Aliado transferindo Sucessos, adiciona 1 a mais.' },
  // ---- 5 pontos (pág. 89)
  { id: 'mira-fatal', name: 'Mira Fatal', cost: 5, req: [r(3, 'Armas'), r(3, 'Percepção', 'Reação')], page: 89, summary: 'Em ataques de pontaria, gasta 2 Determinação para dobrar Sucessos de Neutralização.' },
  { id: 'motivar-aliado', name: 'Motivar Aliado', cost: 5, req: [r(3, 'Expressão')], page: 89, summary: 'Ao Apoiar Aliado, cada Adaptação anula 2 Pressões do alvo; usos por sessão = Influência.' },
];

export const TRAIT_BY_ID: Record<string, Trait> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function describeRequirements(t: Trait): string {
  if (t.req.length === 0) return 'Sem requisitos';
  return t.req.map((q) => `${q.any.join(' ou ')} ${q.min}+`).join(' e ');
}

/** Lista de requisitos que o personagem ainda não cumpre. */
export function missingRequirements(c: Character, t: Trait): Requirement[] {
  return t.req.filter((q) => !q.any.some((name) => aptitudeByName(c, name) >= q.min));
}

export const traitsCost = (c: Character) => c.traits.reduce((s, id) => s + (TRAIT_BY_ID[id]?.cost ?? 0), 0);

// ---------------------------------------------------------------- equipamentos iniciais (pág. 90)
export const EQUIPMENT_PACKS: Record<string, string[]> = {
  Combatente: ['Bebida', 'Corda (15 metros)', 'Faca', 'Arma branca 1', 'Arma branca 2'],
  Curandeiro: ['Álcool', 'Curativos', 'Faca', 'Kit de costura', 'Serrote'],
  Desbravador: ['Bússola', 'Facão', 'Mapas úteis', 'Saco de dormir', 'Tenda desmontável'],
  Estudioso: ['Caderno de notas', 'Caixa de velas', 'Canivete', 'Kit de escrita', 'Livros (3)'],
  Mercador: ['Ábaco', 'Balança', 'Caderno de notas', 'Kit de escrita', 'Mapas úteis'],
  Nômade: ['Aljava com 10 flechas', 'Arco', 'Facão', 'Manto camuflado', 'Sinalizador'],
  Infiltrador: ['Corda (15 metros)', 'Faca', 'Gazuas', 'Manto camuflado', 'Pé de cabra'],
  Selvagem: ['Faca de osso', 'Lança', 'Pintura ritualística', 'Rede de dormir', 'Rede de pesca'],
  Sobrevivente: ['Corda (15 metros)', 'Faca', 'Machado', 'Pederneira', 'Saco de dormir'],
};
export const PACK_NAMES = Object.keys(EQUIPMENT_PACKS);
