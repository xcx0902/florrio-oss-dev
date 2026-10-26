import type { EntitySnapshot, Snapshot, SnapshotEvent } from './snapshot.js';
import { interpolateEntity, interpolateCameraTarget } from './interpolation.js';
import { BYTE_FIELDS, FLOAT_FIELDS } from './field-types.js';

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

export interface VisualEventState {
  readonly handle: number;
  readonly index: number;
  readonly receivedAt: number;
}

/** Client-side entity table. Server snapshots are authoritative. */
export class WorldState {
  private readonly entities = new Map<number, EntityState>();
  private sequence = 0;
  private serverTime = 0;
  private events: readonly SnapshotEvent[] = [];
  private readonly chatLines: string[] = [];
  private readonly visualEvents = new Map<number, VisualEventState>();
  private readonly hitTimes = new Map<number, number>();
  private readonly collected = new Set<number>();
  /** The native control component survives player death and respawn. */
  private controlledCamera: EntityState | undefined;

  apply(snapshot: Snapshot, now: number): void {
    this.sequence = snapshot.sequence;
    this.serverTime = snapshot.serverTime;
    this.applyEvents(snapshot.events, now);
    const seen = new Set<number>();
    for (const entity of snapshot.entities) {
      seen.add(entity.handle);
      const previous = this.entities.get(entity.handle);
      this.entities.set(entity.handle, {
        ...entity,
        // Synthetic traces apply at clock 0; treat those as already settled so
        // the archived first frame keeps the native full-size drop card.
        firstSeenAt: previous?.firstSeenAt ?? (now > 0 ? now : Number.NEGATIVE_INFINITY),
        arrivalMarked: previous?.arrivalMarked ?? ((entity.flags & 128) !== 0),
        previousX: previous?.x ?? entity.x,
        previousY: previous?.y ?? entity.y,
        previousAngle: previous?.angle ?? entity.angle,
        previousRadius: previous?.radius ?? entity.radius,
        receivedAt: now,
      });
    }
    for (const handle of this.entities.keys()) if (!seen.has(handle)) this.entities.delete(handle);
  }

  /** Merge an original-style snapshot that may contain only a subset of the
   * gameplay fields. Missing position/health/flags keep the prior state. */
  applyPartial(snapshot: Snapshot, now: number): void {
    this.sequence = snapshot.sequence;
    this.serverTime = snapshot.serverTime;
    this.applyEvents(snapshot.events, now);
    for (const handle of snapshot.deletedHandles ?? []) {
      this.entities.delete(handle);
      this.collected.delete(handle);
    }
    for (const entity of snapshot.entities) {
      const previous = this.entities.get(entity.handle);
      // The original scalar receiver samples the value currently on screen
      // before installing the next target (entity-snapshot/readInterpolated).
      // Using the previous target makes a 20 Hz stream rotate petals too far
      // ahead; resetting every clock for a health-only update causes a jump.
      const displayed = previous ? interpolateEntity(previous, now) : entity;
      // The native control component already exists at the menu with a zero
      // camera target. Joining attaches the player to that component; its
      // first follow coordinates therefore interpolate from the origin.
      const displayedCamera = previous ? interpolateCameraTarget(previous, now)
        : entity.kind === 1 ? this.controlledCamera
          ? interpolateCameraTarget(this.controlledCamera, now) : { x: 0, y: 0 }
        : { x: entity.cameraX ?? entity.x, y: entity.cameraY ?? entity.y };
      const hasFloat = (field: number): boolean =>
        entity.floatFields?.[field] !== undefined;
      const hasDense = (field: number): boolean =>
        entity.denseFields !== undefined && Object.prototype.hasOwnProperty.call(entity.denseFields, field);
      const hasVisualX = hasFloat(49) || hasDense(49);
      const hasVisualY = hasFloat(28) || hasDense(28);
      const hasCameraX = hasFloat(5) || hasDense(5);
      const hasCameraY = hasFloat(24) || hasDense(24);
      const hasX = hasVisualX || hasCameraX && previous?.floatFields?.[49] === undefined && previous?.denseFields?.[49] === undefined;
      const hasY = hasVisualY || hasCameraY && previous?.floatFields?.[28] === undefined && previous?.denseFields?.[28] === undefined;
      const hasAngle = entity.angleField8 !== undefined || hasDense(8);
      const hasRadius = hasFloat(7) || hasDense(7);
      const hasScore = hasFloat(59) || hasDense(59);
      const displayedScore = previous?.score === undefined ? entity.score
        : Math.fround((previous.previousScore ?? previous.score)
          + Math.fround(previous.score - (previous.previousScore ?? previous.score))
          * Math.max(0, Math.min(1, (now - (previous.receivedScoreAt ?? previous.receivedAt)) / 120)));
      const rawVisualFlags = entity.byteFields?.[38] ?? entity.denseByteFields?.[38] ?? entity.denseFields?.[38];
      const visualFlags = typeof rawVisualFlags === 'number' ? rawVisualFlags : previous?.visualFlags;
      const mergedDenseFields = previous?.denseFields !== undefined && entity.denseFields !== undefined
        ? { ...previous.denseFields, ...entity.denseFields }
        : (entity.denseFields ?? previous?.denseFields);
      const mergeRecord = <T>(a: Readonly<Record<number, T>> | undefined,
                             b: Readonly<Record<number, T>> | undefined):
        Readonly<Record<number, T>> | undefined =>
        a !== undefined && b !== undefined ? { ...a, ...b } : (b ?? a);
      let mergedFloatFields = mergeRecord(previous?.floatFields, entity.floatFields);
      let mergedByteFields = mergeRecord(previous?.byteFields, entity.byteFields);
      // Dense and sparse records write the same native component slots.
      // Keep the current field view coherent when the encoding changes, so
      // an older sparse flag cannot hide a newer dense activity/effect byte.
      for (const [fieldText, value] of Object.entries(entity.denseFields ?? {})) {
        if (typeof value !== 'number') continue;
        const field = Number(fieldText);
        if (BYTE_FIELDS.has(field)) mergedByteFields = { ...mergedByteFields, [field]: value };
        else if (FLOAT_FIELDS.has(field)) mergedFloatFields = { ...mergedFloatFields, [field]: value };
      }
      const mergedVarintFields = mergeRecord(previous?.varintFields, entity.varintFields);
      const mergedReferenceFields = mergeRecord(previous?.referenceFields, entity.referenceFields);
      const mergedStringFields = mergeRecord(previous?.stringFields, entity.stringFields);
      const mergedBitFields = mergeRecord(previous?.bitFields, entity.bitFields);
      const mergedDenseByteFields = mergeRecord(previous?.denseByteFields, entity.denseByteFields);
      const mergeIndexed = <T extends { readonly index: number }>(
        a: Readonly<Record<number, readonly T[]>> | undefined,
        b: Readonly<Record<number, readonly T[]>> | undefined): Readonly<Record<number, readonly T[]>> | undefined => {
        if (!b) return a;
        const result = { ...a };
        for (const [field, items] of Object.entries(b)) {
          const entries = new Map((result[Number(field)] ?? []).map(item => [item.index, item]));
          for (const item of items) entries.set(item.index, item);
          result[Number(field)] = [...entries.values()].sort((left, right) => left.index - right.index);
        }
        return result;
      };
      let mergedByteArrays = mergeIndexed(previous?.byteArrayFields, entity.byteArrayFields);
      let mergedShortArrays = mergeIndexed(previous?.shortArrayFields, entity.shortArrayFields);
      // A dense group replaces its complete array; sparse element deltas
      // retain all other indices, including when a value becomes zero.
      const denseInventory = entity.denseFields?.[60], denseRecharge = entity.denseFields?.[61];
      if (Array.isArray(denseInventory)) mergedByteArrays = { ...mergedByteArrays,
        60: denseInventory.map((value, index) => ({ index, value: Number(value) })) };
      if (Array.isArray(denseRecharge)) mergedShortArrays = { ...mergedShortArrays,
        61: denseRecharge.map((value, index) => ({ index, value: Number(value) })) };
      let mergedComponents = previous?.components;
      if (entity.components !== undefined) {
        const components: Record<number, Record<number, unknown>> = {};
        for (const [constructor, offsets] of Object.entries(previous?.components ?? {})) {
          components[Number(constructor)] = { ...offsets };
        }
        for (const [constructor, offsets] of Object.entries(entity.components)) {
          const key = Number(constructor);
          components[key] = { ...(components[key] ?? {}), ...offsets };
        }
        mergedComponents = components;
      }
      // Only this record can supply a new angle. A dense value retained from
      // an earlier packet must not override a subsequent sparse field 8.
      const dense8 = entity.denseFields?.[8];
      const angle = hasAngle
        ? (typeof dense8 === 'number' ? dense8 * (2 * Math.PI / 65535) : entity.angle)
        : (previous?.angle ?? entity.angle);
      const health = entity.healthKnown ? entity.health : (previous?.health ?? entity.health);
      const maxHealth = entity.maxHealthKnown ? entity.maxHealth : (previous?.maxHealth ?? entity.maxHealth);
      const kind = entity.kind ?? previous?.kind;
      const radius = entity.radius ?? previous?.radius;
      const speciesId = entity.speciesId ?? previous?.speciesId;
      const typeId = kind ?? (entity.typeId !== 0 ? entity.typeId : (previous?.typeId ?? entity.typeId));
      this.entities.set(entity.handle, {
        ...entity,
        firstSeenAt: previous?.firstSeenAt ?? (now > 0 ? now : Number.NEGATIVE_INFINITY),
        arrivalMarked: previous?.arrivalMarked ?? ((entity.flags & 128) !== 0),
        typeId,
        kind,
        speciesId,
        // A profile/loadout-only delta projects these markers as false. It
        // does not remove a health component already decoded on this entity.
        healthKnown: entity.healthKnown === true || previous?.healthKnown === true,
        maxHealthKnown: entity.maxHealthKnown === true || previous?.maxHealthKnown === true,
        x: hasX ? entity.x : (previous?.x ?? entity.x),
        y: hasY ? entity.y : (previous?.y ?? entity.y),
        cameraX: hasCameraX ? entity.cameraX ?? entity.x : previous?.cameraX,
        cameraY: hasCameraY ? entity.cameraY ?? entity.y : previous?.cameraY,
        angle,
        radius,
        health,
        maxHealth,
        level: entity.level ?? previous?.level,
        levelProgress: entity.levelProgress ?? previous?.levelProgress,
        score: entity.score ?? previous?.score,
        previousScore: hasScore ? displayedScore : previous?.previousScore,
        receivedScoreAt: hasScore ? now : previous?.receivedScoreAt,
        visualFlags,
        fadingAt: visualFlags !== undefined && (visualFlags & 1) !== 0
          ? previous?.fadingAt ?? (previous ? now : now - 150) : previous?.fadingAt,
        flags: entity.flags !== 0 ? entity.flags : (previous?.flags ?? 0),
        componentMask: entity.componentMask ?? previous?.componentMask,
        denseFields: mergedDenseFields,
        floatFields: mergedFloatFields,
        byteFields: mergedByteFields,
        varintFields: mergedVarintFields,
        referenceFields: mergedReferenceFields,
        stringFields: mergedStringFields,
        bitFields: mergedBitFields,
        denseByteFields: mergedDenseByteFields,
        byteArrayFields: mergedByteArrays,
        byteArrayField60: mergedByteArrays?.[60],
        shortArrayFields: mergedShortArrays,
        varintArrayFields: mergeIndexed(previous?.varintArrayFields, entity.varintArrayFields),
        handleArrayFields: mergeIndexed(previous?.handleArrayFields, entity.handleArrayFields),
        stringArrayFields: mergeIndexed(previous?.stringArrayFields, entity.stringArrayFields),
        components: mergedComponents,
        previousX: hasX ? displayed.x : (previous?.previousX ?? entity.x),
        previousY: hasY ? displayed.y : (previous?.previousY ?? entity.y),
        previousAngle: hasAngle ? displayed.angle : (previous?.previousAngle ?? entity.angle),
        previousRadius: hasRadius ? displayed.radius : (previous?.previousRadius ?? entity.radius),
        previousCameraX: hasCameraX ? displayedCamera.x : previous?.previousCameraX,
        previousCameraY: hasCameraY ? displayedCamera.y : previous?.previousCameraY,
        receivedCameraXAt: hasCameraX ? now : previous?.receivedCameraXAt,
        receivedCameraYAt: hasCameraY ? now : previous?.receivedCameraYAt,
        receivedXAt: hasX ? now : (previous?.receivedXAt ?? previous?.receivedAt ?? now),
        receivedYAt: hasY ? now : (previous?.receivedYAt ?? previous?.receivedAt ?? now),
        receivedAngleAt: hasAngle ? now : (previous?.receivedAngleAt ?? previous?.receivedAt ?? now),
        receivedRadiusAt: hasRadius ? now : (previous?.receivedRadiusAt ?? previous?.receivedAt ?? now),
        receivedAt: now,
      });
      if (kind === 1) this.controlledCamera = this.entities.get(entity.handle);
    }
  }

  private applyEvents(events: readonly SnapshotEvent[] | undefined, now: number): void {
    this.events = events ?? [];
    for (const event of this.events) {
      if (event.opcode === 9) {
        this.chatLines.push(event.text);
        if (this.chatLines.length > 8) this.chatLines.shift();
      } else if (event.opcode === 14) {
        this.visualEvents.set(event.handle, { handle: event.handle, index: event.index, receivedAt: now });
      } else if (event.opcode === 11) {
        // Opcode 11 stamps the hit clock; opcode 14 has its own indexed
        // presentation object and must not overwrite the hit timestamp.
        this.hitTimes.set(event.handle, now);
      }
    }
    for (const [handle, visual] of this.visualEvents)
      if (now - visual.receivedAt > 1000) this.visualEvents.delete(handle);
    for (const [handle, at] of this.hitTimes)
      if (now - at > 1000) this.hitTimes.delete(handle);
  }

  /** Clear all client-side state (used by deterministic parity scenes). */
  reset(): void {
    this.entities.clear();
    this.chatLines.length = 0;
    this.visualEvents.clear();
    this.hitTimes.clear();
    this.collected.clear();
    this.controlledCamera = undefined;
    this.events = [];
    this.sequence = 0;
    this.serverTime = 0;
  }

  get(handle: number): EntityState | undefined { return this.entities.get(handle); }
  all(): IterableIterator<EntityState> { return this.entities.values(); }
  /** Authoritative deletion is immediate: the old 150 ms retiring window made
   * killed mobs/petals flash back into view before disappearing. */
  *renderable(_now: number): IterableIterator<EntityState> {
    for (const entity of this.entities.values())
      if (!this.collected.has(entity.handle)) yield entity;
  }
  get count(): number { return this.entities.size; }
  /** Original event14 marks the pickup visual as owned by its HUD transfer. */
  markCollected(handle: number): void { this.collected.add(handle); }
  get lastSequence(): number { return this.sequence; }
  get lastServerTime(): number { return this.serverTime; }
  get lastEvents(): readonly SnapshotEvent[] { return this.events; }
  get chat(): readonly string[] { return this.chatLines; }
  /** Visual hit index (1..4) for the last 180 ms, or 0 when idle. */
  visualIndex(handle: number, now: number): number {
    const visual = this.visualEvents.get(handle);
    if (visual === undefined || now - visual.receivedAt > 180) return 0;
    return visual.index;
  }
  hitTime(handle: number): number | undefined { return this.hitTimes.get(handle); }
  hitFlash(handle: number, now: number): number {
    const at = this.hitTime(handle);
    return at === undefined ? 0 : Math.max(0, Math.min(1, 1 - (now - at) / 150));
  }
}
