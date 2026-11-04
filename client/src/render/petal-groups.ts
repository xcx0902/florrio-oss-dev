import { PetalId } from '../schema/catalog-ids.js';

const PEAS = new Set<number>([PetalId.PeasRare, PetalId.PeasEpic, PetalId.PeasLegendary]);

const ORBIT_SPIN = new Set<number>([...PEAS, PetalId.AntennaeLegendary]);

export const isPeasPetal = (typeId: number): boolean => PEAS.has(typeId);
export const hasOrbitSeedPhase = (typeId: number): boolean =>
  typeId === PetalId.SquareUnique || spinsOnOrbit(typeId);
export const spinsOnOrbit = (typeId: number): boolean => ORBIT_SPIN.has(typeId);
