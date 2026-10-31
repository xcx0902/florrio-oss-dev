import type { DenseFieldSpec } from './field-types.js';
export type DenseValue = number | string | readonly number[] | readonly string[];

/** Event opcodes decoded by the snapshot reader. */
export type SnapshotEvent =
  | { readonly opcode: 9; readonly text: string }
  | { readonly opcode: 11; readonly handle: number }
  | { readonly opcode: 14; readonly handle: number; readonly index: number };

export interface EntitySnapshot {
  readonly handle: number;
  /** Domain kind for the accepted domain record (1 player, 2 mob, 3
   * petal, 4 drop). The catalog species id is `speciesId`. */
  readonly typeId: number;
  readonly kind?: number;
  readonly speciesId?: number;
  readonly variant?: number;
  readonly x: number;
  readonly y: number;
  /** Camera-follow component 478; visual position belongs to component 609. */
  readonly cameraX?: number;
  readonly cameraY?: number;
  readonly angle: number;
  readonly radius?: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthKnown?: boolean;
  readonly maxHealthKnown?: boolean;
  readonly level?: number;
  readonly levelProgress?: number;
  readonly score?: number;
  readonly flags: number;
  readonly byteField1?: number;
  readonly floatField5?: number;
  readonly floatFields?: Readonly<Record<number, number>>;
  readonly doubleField35?: number;
  readonly doubleField18?: number;
  readonly floatField27?: number;
  readonly stringField4?: string;
  readonly byteFields?: Readonly<Record<number, number>>;
  readonly byteArrayFields?: Readonly<Record<number, readonly { index: number; value: number }[]>>;
  readonly varintArrayFields?: Readonly<Record<number, readonly { index: number; value: number }[]>>;
  readonly shortArrayFields?: Readonly<Record<number, readonly { index: number; value: number }[]>>;
  readonly byteArrayField60?: readonly { index: number; value: number }[];
  readonly varintFields?: Readonly<Record<number, number>>;
  readonly referenceFields?: Readonly<Record<number, number>>;
  readonly stringFields?: Readonly<Record<number, string>>;
  readonly stringArrayFields?: Readonly<Record<number, readonly { index: number; value: string }[]>>;
  readonly floatField45?: number;
  readonly componentOrdinals?: readonly number[];
  readonly bitFields?: Readonly<Record<number, number>>;
  readonly angleField8?: number;
  readonly handleArrayFields?: Readonly<Record<number, readonly { index: number; handle: number }[]>>;
  readonly denseByteFields?: Readonly<Record<number, number>>;
  readonly denseFields?: Readonly<Record<number, DenseValue>>;
  readonly components?: Readonly<Record<number, Readonly<Record<number, unknown>>>>;
  readonly componentMask?: number;
}

export interface Snapshot {
  /** Explicit removals; omitted records in a delta remain alive. */
  readonly deletedHandles?: readonly number[];
  readonly sequence: number;
  readonly serverTime: number;
  readonly entities: readonly EntitySnapshot[];
  readonly events: readonly SnapshotEvent[];
}

export interface DenseGroupPlan {
  readonly offset: number;
  readonly specs: readonly DenseFieldSpec[];
}


/** Fields of the native controller record (component 478) that survive the
 * player's death and drive the death/menu HUD. */
export interface DeathMetadata {
  readonly killerName: string;
  readonly keptCount: number;
  readonly keptItems: readonly number[];
  readonly score: number;
  readonly deathLevel: number;
  readonly respawnLevel: number;
  readonly viewerHandle?: number;
}

