import type { EntitySnapshot } from './snapshot-types.js';

export interface EntityState extends EntitySnapshot {
  readonly previousX: number;
  readonly previousY: number;
  readonly previousAngle: number;
  readonly previousRadius?: number;
  readonly receivedAt: number;
  readonly receivedXAt?: number;
  readonly receivedYAt?: number;
  readonly receivedAngleAt?: number;
  readonly receivedRadiusAt?: number;
  readonly previousScore?: number;
  readonly receivedScoreAt?: number;
  readonly visualFlags?: number;
  readonly fadingAt?: number;
  readonly previousCameraX?: number;
  readonly previousCameraY?: number;
  readonly receivedCameraXAt?: number;
  readonly receivedCameraYAt?: number;
  /** First snapshot clock at which this handle was rendered. */
  readonly firstSeenAt?: number;
  /** Retain the constructor marker across deltas received before a render. */
  readonly arrivalMarked?: boolean;
}

