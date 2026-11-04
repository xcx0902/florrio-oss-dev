import { SpeciesId } from '../schema/catalog-ids.js';

/** Product-level species groups. Membership is explicit so a new numeric id
 * never silently joins a range just because it was allocated inside it. */
const BACKGROUND = new Set<number>([
  SpeciesId.Rock,
  SpeciesId.Boulder,
  SpeciesId.Cactus,
  SpeciesId.AntHole,
  SpeciesId.Square,
]);

const ANTS = new Set<number>([
  SpeciesId.BabyAnt,
  SpeciesId.WorkerAnt,
  SpeciesId.SoldierAnt,
  SpeciesId.QueenAnt,
]);

const CENTIPEDES = new Set<number>([
  SpeciesId.CentipedeHead,
  SpeciesId.CentipedeSegment,
  SpeciesId.EvilCentipedeHead,
  SpeciesId.EvilCentipedeSegment,
]);

const ANIMATED_ACTIVITY = new Set<number>([...ANTS, SpeciesId.Beetle, SpeciesId.MassiveBeetle]);

export const AntCaste = {
  Baby: 0,
  Worker: 1,
  Soldier: 2,
  Queen: 3,
} as const;
export type AntCaste = (typeof AntCaste)[keyof typeof AntCaste];

export function antCaste(species: number): AntCaste | undefined {
  switch (species) {
    case SpeciesId.BabyAnt:
      return AntCaste.Baby;
    case SpeciesId.WorkerAnt:
      return AntCaste.Worker;
    case SpeciesId.SoldierAnt:
      return AntCaste.Soldier;
    case SpeciesId.QueenAnt:
      return AntCaste.Queen;
    default:
      return undefined;
  }
}

export const isBackgroundSpecies = (species: number): boolean => BACKGROUND.has(species);
export const isAntSpecies = (species: number): boolean => ANTS.has(species);
export const isCentipedeSpecies = (species: number): boolean => CENTIPEDES.has(species);
export const usesActivityAnimation = (species: number): boolean => ANIMATED_ACTIVITY.has(species);
export const isSpiderSpecies = (species: number): boolean => species === SpeciesId.Spider;
