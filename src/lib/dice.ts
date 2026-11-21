// Tradutor de dados físicos. O aplicativo não rola dados: o jogador informa a face obtida.
export type DieType = 6 | 10 | 12;
export const DIE_TYPES: DieType[] = [6, 10, 12];

export interface Symbols {
  /** Sucesso — joaninha */
  success: number;
  /** Adaptação — cervo */
  adapt: number;
  /** Pressão — lobo */
  pressure: number;
}

/** Índice = face - 1. Ordem: Sucessos / Adaptações / Pressões. */
const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 1],
  [0, 1, 1],
  [1, 0, 0],
  [2, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
  [2, 0, 1],
  [1, 2, 1],
  [0, 0, 2],
];

export function isValidFace(die: DieType, face: number): boolean {
  return Number.isInteger(face) && face >= 1 && face <= die;
}

export function translateFace(die: DieType, face: number): Symbols {
  if (!isValidFace(die, face)) throw new RangeError(`Face ${face} inválida para D${die}`);
  const [success, adapt, pressure] = FACES[face - 1];
  return { success, adapt, pressure };
}

export interface Roll {
  id: string;
  die: DieType;
  face: number;
  keep: boolean;
}

export function sumKept(rolls: Roll[]): Symbols {
  return rolls
    .filter((r) => r.keep)
    .reduce<Symbols>(
      (acc, r) => {
        const s = translateFace(r.die, r.face);
        return { success: acc.success + s.success, adapt: acc.adapt + s.adapt, pressure: acc.pressure + s.pressure };
      },
      { success: 0, adapt: 0, pressure: 0 },
    );
}
