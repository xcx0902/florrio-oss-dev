import { SNAPSHOT_EVENT } from '../schema/protocol.js';

/** Wire values of protocol field 26; keep in lockstep with engine::EntityKind. */
export const EntityKind = {
  None: 0,
  Player: 1,
  Mob: 2,
  Petal: 3,
  Drop: 4,
  Projectile: 5,
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];
import type { DenseFieldSpec } from './field-types.js';
export type DenseValue = number | string | readonly number[] | readonly string[];

/** Event opcodes decoded by the snapshot reader. */
export type SnapshotEvent =
  | { readonly opcode: typeof SNAPSHOT_EVENT.ChatString; readonly text: string }
  | { readonly opcode: typeof SNAPSHOT_EVENT.EntityTime; readonly handle: number }
  | {
      readonly opcode: typeof SNAPSHOT_EVENT.Visual;
      readonly handle: number;
      readonly index: number;
    };

export interface EntitySnapshot {
  readonly handle: number;
  readonly ownerPlayerId?: number;
  readonly nickname?: string;
  readonly ownerHandle?: number;
  readonly slot?: number;
  readonly instance?: number;
  /** Domain kind for the accepted domain record (1 player, 2 mob, 3
   * petal, 4 drop). The catalog species id is `speciesId`. */
  readonly typeId: number;
  readonly kind?: number;
  readonly speciesId?: number;
  readonly variant?: number;
  readonly x: number;
  readonly y: number;
  /** Camera target from the player-controller component; visual position
   * comes from the transform component. */
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
  readonly varintArrayFields?: Readonly<
    Record<number, readonly { index: number; value: number }[]>
  >;
  readonly shortArrayFields?: Readonly<Record<number, readonly { index: number; value: number }[]>>;
  readonly inventory?: readonly { index: number; value: number }[];
  readonly varintFields?: Readonly<Record<number, number>>;
  readonly referenceFields?: Readonly<Record<number, number>>;
  readonly stringFields?: Readonly<Record<number, string>>;
  readonly stringArrayFields?: Readonly<
    Record<number, readonly { index: number; value: string }[]>
  >;
  readonly floatField45?: number;
  readonly declaredComponents?: readonly number[];
  readonly bitFields?: Readonly<Record<number, number>>;
  readonly angleField8?: number;
  readonly handleArrayFields?: Readonly<
    Record<number, readonly { index: number; handle: number }[]>
  >;
  readonly denseByteFields?: Readonly<Record<number, number>>;
  readonly denseFields?: Readonly<Record<number, DenseValue>>;
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
  readonly component: number;
  readonly specs: readonly DenseFieldSpec[];
}

/** Player-controller fields that survive death and drive the death/menu HUD. */
export interface DeathMetadata {
  readonly killerName: string;
  readonly keptCount: number;
  readonly keptItems: readonly number[];
  readonly score: number;
  readonly deathLevel: number;
  readonly respawnLevel: number;
  readonly viewerHandle?: number;
}
