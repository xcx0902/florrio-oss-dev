import { BIT_FIELDS, BYTE_ARRAY_FIELDS, BYTE_FIELDS, DENSE_GROUP_COMPONENTS, FIELD_COMPONENTS, FLOAT_FIELDS, REFERENCE_FIELDS, STRING_ARRAY_FIELDS, STRING_FIELDS, VARINT_FIELDS } from './field-types.js';
import type { DenseFieldSpec } from './field-types.js';

export type DenseValue = number | string | readonly number[] | readonly string[];

/** Original event opcodes decoded by function 1015. */
export type SnapshotEvent =
  | { readonly opcode: 9; readonly text: string }
  | { readonly opcode: 11; readonly handle: number }
  | { readonly opcode: 14; readonly handle: number; readonly index: number };

export interface EntitySnapshot {
  readonly handle: number;
  /** Domain kind for the accepted domain record (1 player, 2 mob, 3
   * petal, 4 drop). The original species id is `speciesId`. */
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

function buildComponents(values: Readonly<Record<number, unknown>>): Readonly<Record<number, Readonly<Record<number, unknown>>>> {
  const components: Record<number, Record<number, unknown>> = {};
  for (const [fieldText, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const field = Number(fieldText);
    const component = FIELD_COMPONENTS[field];
    if (component === undefined) continue;
    (components[component.constructor] ??= {})[component.offset] = value;
  }
  return components;
}

interface DomainProjection {
  readonly typeId: number;
  readonly kind?: number;
  readonly speciesId?: number;
  readonly variant?: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthKnown: boolean;
  readonly maxHealthKnown: boolean;
  readonly radius?: number;
  readonly level?: number;
  readonly levelProgress?: number;
  readonly score?: number;
}

/** Project protocol fields through the generated component locations. Original
 * constructor IDs and layout offsets belong to the schema table, not domain
 * projection logic. Field 26 remains the accepted permanent domain extension. */
function projectDomain(
  components: Readonly<Record<number, Readonly<Record<number, unknown>>>>,
  denseFields?: Readonly<Record<number, DenseValue>>,
): DomainProjection {
  const numberField = (field: number, denseFallback = false): number | undefined => {
    const location = FIELD_COMPONENTS[field];
    const value = components[location.constructor]?.[location.offset];
    if (typeof value === 'number') return value;
    const dense = denseFallback ? denseFields?.[field] : undefined;
    return typeof dense === 'number' ? dense : undefined;
  };
  const species = numberField(2, true);
  const kind = numberField(26, true);
  const health = numberField(53, true);
  const maxHealth = numberField(55, true);
  const variant = numberField(31, true);
  const radius = numberField(7, true);
  const level = numberField(62);
  const progressRaw = numberField(58);
  const score = numberField(59);
  return {
    typeId: kind ?? species ?? 0,
    level,
    levelProgress: progressRaw === undefined ? undefined : (progressRaw & 0xffff) / 65535,
    score,
    kind,
    speciesId: species,
    variant,
    health: health ?? 0,
    maxHealth: maxHealth ?? 0,
    healthKnown: health !== undefined,
    maxHealthKnown: maxHealth !== undefined,
    radius,
  };
}

export interface Snapshot {
  /** Explicit removals; omitted records in a delta remain alive. */
  readonly deletedHandles?: readonly number[];
  readonly sequence: number;
  readonly serverTime: number;
  readonly entities: readonly EntitySnapshot[];
  readonly events: readonly SnapshotEvent[];
}

/** Decode the original event block: opcode 9 chat, 11 entity time, 14 visual. */
export function decodeSnapshotEvents(reader: Reader, count: number): SnapshotEvent[] | null {
  const events: SnapshotEvent[] = [];
  for (let index = 0; index < count; ++index) {
    const opcode = reader.u8();
    if (opcode === 9) {
      events.push({ opcode: 9, text: reader.string() });
    } else if (opcode === 11) {
      events.push({ opcode: 11, handle: reader.u32() });
    } else if (opcode === 14) {
      events.push({ opcode: 14, handle: reader.u32(), index: reader.u8() });
    } else {
      return null;
    }
  }
  return events;
}

/** Decoder boundary. Field metadata comes from schema/protocol.yaml. Reader
 * implementations distinguish the domain sparse framing, original dense
 * field widths, and the separate fixed-record diagnostic skeleton. */
export interface SnapshotDecoder {
  decode(bytes: Uint8Array): Snapshot | null;
}

class Reader {
  private readonly view: DataView;
  private offset = 0;
  private bitByte = 0;
  private bitOffset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get eof(): boolean { return this.offset >= this.bytes.length; }

  private alignBits(): void {
    if (this.bitOffset !== 0) this.bitOffset = 0;
  }
  private rawU8(): number {
    if (this.offset + 1 > this.bytes.length) throw new Error('snapshot: out of bounds u8');
    return this.bytes[this.offset++];
  }
  u8(): number {
    this.alignBits();
    return this.rawU8();
  }
  bit(): number {
    if (this.bitOffset === 0) this.bitByte = this.rawU8();
    const value = this.bitByte & 1;
    this.bitByte >>= 1;
    this.bitOffset = (this.bitOffset + 1) & 7;
    return value;
  }
  u32(): number {
    this.alignBits();
    if (this.offset + 4 > this.bytes.length) throw new Error('snapshot: out of bounds u32');
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  string(): string {
    const chars: number[] = [];
    for (;;) {
      const byte = this.u8();
      if (byte === 0) break;
      chars.push(byte);
    }
    return new TextDecoder().decode(new Uint8Array(chars));
  }
  u16(): number {
    const low = this.u8();
    const high = this.u8();
    return (low | (high << 8)) >>> 0;
  }
  f64(): number {
    this.alignBits();
    if (this.offset + 8 > this.bytes.length) throw new Error('snapshot: out of bounds f64');
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    if (!Number.isFinite(value)) throw new Error('snapshot: non-finite f64');
    return value;
  }
  f32(): number {
    this.alignBits();
    if (this.offset + 4 > this.bytes.length) throw new Error('snapshot: out of bounds f32');
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    if (!Number.isFinite(value)) throw new Error('snapshot: non-finite f32');
    return value;
  }
  varint(): number {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = this.u8();
      if (shift === 28 && (byte & 0xf0) !== 0) throw new Error('snapshot: varint overflow');
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
    }
    throw new Error('snapshot: varint overflow');
  }
}

export interface SnapshotHeader {
  readonly sequence: number;
  readonly reliableAck: number;
}

/** Decode the original type-1 header: type, sequence, reliable ack. */
export function decodeSnapshotHeader(bytes: Uint8Array): SnapshotHeader | null {
  try {
    const reader = new Reader(bytes);
    if (reader.u8() !== 1) return null;
    return { sequence: reader.varint(), reliableAck: reader.varint() };
  } catch {
    return null;
  }
}

export interface SnapshotBlockCounts {
  readonly sequence: number;
  readonly reliableAck: number;
  readonly deletes: number;
  readonly updates: number;
  readonly events: number;
}

/** Header plus the three original block counts. Entry bodies are not decoded. */
export function decodeSnapshotBlockCounts(bytes: Uint8Array): SnapshotBlockCounts | null {
  try {
    const reader = new Reader(bytes);
    if (reader.u8() !== 1) return null;
    return {
      sequence: reader.varint(),
      reliableAck: reader.varint(),
      deletes: reader.varint(),
      updates: reader.varint(),
      events: reader.varint(),
    };
  } catch {
    return null;
  }
}

/** Decode original-style bare entity activations (flags=2, no fields). */
export class OriginalBareSnapshotDecoder implements SnapshotDecoder {
  private readonly masks = new Map<number, number>();
  /** Native component-pointer presence: the original decoder reads dense
   * groups only when the component constructor at the entity offset exists.
   * The mask/ordinal declaration is the wire proxy for that pointer. */
  private readonly componentPointers = new Map<number, Set<number>>();

  constructor(private readonly plans: readonly DenseGroupPlan[] = [],
              private readonly present: ReadonlySet<number> = new Set(),
              private readonly presentFor?: (handle: number, mask: number) => ReadonlySet<number>) {}

  private setMask(handle: number, mask: number): void {
    this.masks.set(handle, mask);
    const pointers = new Set<number>();
    for (let ordinal = 1; ordinal <= 30; ++ordinal)
      if ((mask & (1 << (ordinal - 1))) !== 0) pointers.add(ordinal);
    this.componentPointers.set(handle, pointers);
  }

  private addOrdinals(handle: number, ordinals: readonly number[]): void {
    const pointers = this.componentPointers.get(handle) ?? new Set<number>();
    for (const ordinal of ordinals) if (ordinal >= 1 && ordinal <= 30) pointers.add(ordinal);
    this.componentPointers.set(handle, pointers);
  }

  /** Native component-pointer presence, with the caller-supplied mask callback
   * retained for tests and transitional packets. */
  private presentForHandle(handle: number, mask: number): ReadonlySet<number> {
    if (this.presentFor) return this.presentFor(handle, mask);
    const pointers = this.componentPointers.get(handle);
    if (pointers === undefined) return this.present;
    const result = new Set<number>();
    for (const [offsetText, ordinal] of Object.entries(DENSE_GROUP_COMPONENTS)) {
      if (pointers.has(ordinal)) result.add(Number(offsetText));
    }
    return result;
  }

  private readDense(reader: Reader, specs: readonly DenseFieldSpec[]): Record<number, DenseValue> | null {
    const denseFields: Record<number, DenseValue> = {};
    for (const spec of specs) {
      if (spec.type === 'byte') denseFields[spec.field] = reader.u8();
      else if (spec.type === 'f32') denseFields[spec.field] = reader.f32();
      else if (spec.type === 'f64') denseFields[spec.field] = reader.f64();
      else if (spec.type === 'varint') denseFields[spec.field] = reader.varint();
      else if (spec.type === 'reference') denseFields[spec.field] = reader.u32();
      else if (spec.type === 'angle') denseFields[spec.field] = reader.u16();
      else if (spec.type === 'string') denseFields[spec.field] = reader.string();
      else if (spec.type === 'bit') denseFields[spec.field] = reader.bit();
      else if (spec.type === 'byteArray16') denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
      else if (spec.type === 'shortArray8') denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
      else if (spec.type === 'byteArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
      else if (spec.type === 'handleArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
      else if (spec.type === 'stringArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
      else if (spec.type === 'varintArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
      else return null;
    }
    return denseFields;
  }

  decodeEntityBody(reader: Reader, handle: number, flags: number): EntitySnapshot | null {
    if ((flags & 8) !== 0) {
      if (this.plans.length === 0) return null;
      const componentMask = this.masks.get(handle) ?? 0;
      const present = this.presentForHandle(handle, componentMask);
      const denseFields: Record<number, DenseValue> = {};
      for (const plan of this.plans) {
        if (!present.has(plan.offset)) continue;
        const specs = plan.offset === 152 && (flags & 64) === 0
          ? plan.specs.slice(0, 3) : plan.specs;
        const values = this.readDense(reader, specs);
        if (values === null) return null;
        Object.assign(denseFields, values);
      }
      const angleRaw = denseFields[8];
      const angle = typeof angleRaw === 'number' ? angleRaw * (2 * Math.PI / 65535) : 0;
      const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
      const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
      const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : cameraX ?? 0;
      const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : cameraY ?? 0;
      const components = buildComponents(denseFields);
      return { handle, ...projectDomain(components, denseFields), x: positionX, y: positionY,
        cameraX, cameraY, angle, flags, componentMask, denseFields, components };
    }
    let componentMask = this.masks.get(handle) ?? 0;
    const componentOrdinals: number[] = [];
    if ((flags & 1) !== 0) {
      componentMask = reader.u32();
      this.setMask(handle, componentMask);
    } else if ((flags & 2) === 0) {
      let ordinal = 0;
      for (;;) {
        const delta = reader.varint() ^ 1;
        if (delta === 0) break;
        ordinal += delta;
        componentOrdinals.push(ordinal);
        componentMask |= 1 << (ordinal - 1);
      }
      this.setMask(handle, componentMask);
      this.addOrdinals(handle, componentOrdinals);
    }
    let field = 0;
    let byteField1 = 0;
    const byteFields: Record<number, number> = {};
    const byteArrayFields: Record<number, { index: number; value: number }[]> = {};
    const varintArrayFields: Record<number, { index: number; value: number }[]> = {};
    const shortArrayFields: Record<number, { index: number; value: number }[]> = {};
    const stringFields: Record<number, string> = {};
    const stringArrayFields: Record<number, { index: number; value: string }[]> = {};
    const varintFields: Record<number, number> = {};
    const bitFields: Record<number, number> = {};
    const handleArrayFields: Record<number, { index: number; handle: number }[]> = {};
    const referenceFields: Record<number, number> = {};
    let floatField5 = 0;
    let doubleField35 = 0;
    let doubleField18 = 0;
    let floatField27 = 0;
    let stringField4 = '';
    let floatField45 = 0;
    let angleField8: number | undefined;
    const floatFields: Record<number, number> = {};
    for (;;) {
      const delta = reader.varint();
      if (delta === 0) break;
      field += delta;
      if (field < 1 || field > 63) field = 1;
      if (BYTE_FIELDS.has(field)) {
        const value = reader.u8();
        byteFields[field] = value;
        if (field === 1) byteField1 = value;
      }
      else if (FLOAT_FIELDS.has(field)) {
        const value = reader.f32();
        floatFields[field] = value;
        if (field === 5) floatField5 = value;
      } else if (field === 35) doubleField35 = reader.f64();
      else if (field === 18) doubleField18 = reader.f64();
      else if (field === 27) floatField27 = reader.f32();
      else if (field === 3) {
        let elementIndex = 0;
        handleArrayFields[3] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) break;
          elementIndex += elementDelta;
          handleArrayFields[3].push({ index: elementIndex - 1, handle: reader.u32() });
        }
      } else if (BYTE_ARRAY_FIELDS.has(field)) {
        let elementIndex = 0;
        byteArrayFields[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) break;
          elementIndex += elementDelta;
          byteArrayFields[field].push({ index: elementIndex - 1, value: reader.u8() });
        }
      } else if (field === 39 || field === 61) {
        let elementIndex = 0;
        const target = field === 39 ? varintArrayFields : shortArrayFields;
        target[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) break;
          elementIndex += elementDelta;
          const value = reader.varint();
          target[field].push({ index: elementIndex - 1, value: field === 61 ? value & 0xffff : value });
        }
      } else if (field === 4) {
        stringField4 = reader.string();
      } else if (STRING_FIELDS.has(field)) {
        stringFields[field] = reader.string();
      } else if (STRING_ARRAY_FIELDS.has(field)) {
        let elementIndex = 0;
        stringArrayFields[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) break;
          elementIndex += elementDelta;
          stringArrayFields[field].push({ index: elementIndex - 1, value: reader.string() });
        }
      } else if (REFERENCE_FIELDS.has(field)) {
        referenceFields[field] = reader.u32();
      } else if (field === 8) {
        angleField8 = reader.u16() * (2 * Math.PI / 65535);
      } else if (BIT_FIELDS.has(field)) {
        bitFields[field] = reader.bit();
      } else if (field === 45) {
        floatField45 = reader.f32();
      } else if (VARINT_FIELDS.has(field)) {
        varintFields[field] = reader.varint();
      } else return null;
    }
    const scalarValues: Record<number, unknown> = {
      ...byteFields, ...floatFields, ...varintFields, ...referenceFields,
      ...stringFields, ...bitFields,
    };
    if (stringField4 !== '') scalarValues[4] = stringField4;
    if (angleField8 !== undefined) scalarValues[8] = angleField8;
    if (doubleField35 !== 0) scalarValues[35] = doubleField35;
    if (doubleField18 !== 0) scalarValues[18] = doubleField18;
    if (floatField27 !== 0) scalarValues[27] = floatField27;
    if (floatField45 !== 0) scalarValues[45] = floatField45;
    const positionX = floatFields[49] ?? floatFields[5] ?? 0;
    const positionY = floatFields[28] ?? floatFields[24] ?? 0;
    const components = buildComponents(scalarValues);
    return { handle, ...projectDomain(components), x: positionX, y: positionY, angle: angleField8 ?? 0,
      cameraX: floatFields[5], cameraY: floatFields[24],
      flags, componentMask, componentOrdinals, components, byteField1, byteFields, floatField5,
      floatFields, doubleField35, doubleField18, floatField27, stringField4, byteArrayFields,
      varintArrayFields, shortArrayFields, byteArrayField60: byteArrayFields[60] ?? [],
      stringFields, stringArrayFields, varintFields, referenceFields, floatField45, bitFields,
      angleField8, handleArrayFields };
  }

  decode(bytes: Uint8Array): Snapshot | null {
    // Failed speculative decoding must not alter the component table used by
    // the next valid packet (or another decoder in CompositeSnapshotDecoder).
    const masks = new Map(this.masks);
    const pointers = new Map([...this.componentPointers].map(([handle, set]) => [handle, new Set(set)]));
    const snapshot = this.decodePacket(bytes);
    if (snapshot === null) {
      this.masks.clear();
      this.componentPointers.clear();
      for (const [handle, mask] of masks) this.masks.set(handle, mask);
      for (const [handle, set] of pointers) this.componentPointers.set(handle, set);
    }
    return snapshot;
  }

  private decodePacket(bytes: Uint8Array): Snapshot | null {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== 1) return null;
      const sequence = reader.varint();
      reader.varint(); // reliable ack
      const deletes = reader.varint();
      const updates = reader.varint();
      const events = reader.varint();
      const deletedHandles: number[] = [];
      for (let index = 0; index < deletes; ++index) {
        const handle = reader.u32();
        deletedHandles.push(handle);
        this.masks.delete(handle);
        this.componentPointers.delete(handle);
      }
      const entities: EntitySnapshot[] = [];
      for (let index = 0; index < updates; ++index) {
        const handle = reader.u32();
        const flags = reader.u8() ^ 54;
        const entity = this.decodeEntityBody(reader, handle, flags);
        if (entity === null) return null;
        entities.push(entity);
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) return null;
      return { sequence, serverTime: 0, entities, events: decodedEvents, deletedHandles };
    } catch {
      return null;
    }
  }
}

export class SkeletonSnapshotDecoder implements SnapshotDecoder {
  decode(bytes: Uint8Array): Snapshot | null {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== 1) return null;
      const sequence = reader.varint();
      reader.varint(); // reliable ack
      const deletes = reader.varint();
      const updates = reader.varint();
      const events = reader.varint();
      const deletedHandles: number[] = [];
      for (let index = 0; index < deletes; ++index) deletedHandles.push(reader.u32());
      const entities: EntitySnapshot[] = [];
      for (let index = 0; index < updates; ++index) {
        const handle = reader.u32();
        const typeId = reader.u8();
        if (typeId < 1 || typeId > 4 || handle === 0) return null;
        const x = reader.f32();
        const y = reader.f32();
        const angle = reader.f32();
        const health = reader.f32();
        const maxHealth = reader.f32();
        const level = reader.u8();
        entities.push({ handle, typeId, kind: typeId, x, y, angle, health, maxHealth,
          healthKnown: true, maxHealthKnown: true, level, flags: 0 });
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) return null;
      return { sequence, serverTime: 0, entities, events: decodedEvents, deletedHandles };
    } catch {
      return null;
    }
  }
}


/** Dense field specs for the types implemented by DenseGroupDecoder. */

/** Dense group decoder with an explicit field spec list. Group presence is
 * supplied by the caller; original target-existence checks are still pending. */
export class DenseGroupDecoder implements SnapshotDecoder {
  constructor(private readonly specs: readonly DenseFieldSpec[]) {}
  decode(bytes: Uint8Array): Snapshot | null {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== 1) return null;
      const sequence = reader.varint();
      reader.varint();
      const deletes = reader.varint();
      const updates = reader.varint();
      const events = reader.varint();
      const deletedHandles = Array.from({ length: deletes }, () => reader.u32());
      const entities: EntitySnapshot[] = [];
      for (let index = 0; index < updates; ++index) {
        const handle = reader.u32();
        const flags = reader.u8() ^ 54;
        if ((flags & 8) === 0) return null;
        const denseFields: Record<number, DenseValue> = {};
        for (const spec of this.specs) {
          if (spec.type === 'byte') denseFields[spec.field] = reader.u8();
          else if (spec.type === 'f32') denseFields[spec.field] = reader.f32();
          else if (spec.type === 'f64') denseFields[spec.field] = reader.f64();
          else if (spec.type === 'varint') denseFields[spec.field] = reader.varint();
          else if (spec.type === 'string') denseFields[spec.field] = reader.string();
          else if (spec.type === 'byteArray16') denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
          else if (spec.type === 'shortArray8') denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
          else if (spec.type === 'bit') denseFields[spec.field] = reader.bit();
          else if (spec.type === 'reference') denseFields[spec.field] = reader.u32();
          else if (spec.type === 'byteArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
          else if (spec.type === 'handleArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
          else if (spec.type === 'stringArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
          else if (spec.type === 'varintArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
          else denseFields[spec.field] = reader.u16();
        }
        const angleRaw = denseFields[8];
        const angle = typeof angleRaw === 'number' ? angleRaw * (2 * Math.PI / 65535) : 0;
        const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
        const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
        const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : cameraX ?? 0;
        const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : cameraY ?? 0;
        const components = buildComponents(denseFields);
        entities.push({ handle, ...projectDomain(components, denseFields), x: positionX, y: positionY,
          cameraX, cameraY, angle, flags, denseFields, denseByteFields: denseFields as Record<number, number>,
          components });
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) return null;
      return { sequence, serverTime: 0, entities, deletedHandles, events: decodedEvents };
    } catch {
      return null;
    }
  }
}

export class DenseByteGroupDecoder extends DenseGroupDecoder {
  constructor(fields: readonly number[]) {
    super(fields.map(field => ({ field, type: 'byte' as const })));
  }
}

export class DenseFloatGroupDecoder extends DenseGroupDecoder {
  constructor(fields: readonly number[]) {
    super(fields.map(field => ({ field, type: 'f32' as const })));
  }
}

export class DenseStringGroupDecoder extends DenseGroupDecoder {
  constructor(fields: readonly number[]) {
    super(fields.map(field => ({ field, type: 'string' as const })));
  }
}

/** Group 52 convenience wrapper (fields 22/54). */
export class DenseGroup52Decoder extends DenseByteGroupDecoder {
  constructor() { super([22, 54]); }
}


export interface DenseGroupPlan {
  readonly offset: number;
  readonly specs: readonly DenseFieldSpec[];
}

/** Dense decoder driven by an explicit present-group set. Groups absent from
 * the set consume no bytes, matching the original target-existence gate. */
export class DensePlanDecoder implements SnapshotDecoder {
  constructor(private readonly plans: readonly DenseGroupPlan[],
              private readonly present: ReadonlySet<number>) {}
  decode(bytes: Uint8Array): Snapshot | null {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== 1) return null;
      const sequence = reader.varint();
      reader.varint();
      const deletes = reader.varint();
      const updates = reader.varint();
      const events = reader.varint();
      const deletedHandles = Array.from({ length: deletes }, () => reader.u32());
      const entities: EntitySnapshot[] = [];
      for (let index = 0; index < updates; ++index) {
        const handle = reader.u32();
        const flags = reader.u8() ^ 54;
        if ((flags & 8) === 0) return null;
        const denseFields: Record<number, DenseValue> = {};
        for (const plan of this.plans) {
          if (!this.present.has(plan.offset)) continue;
          const specs = plan.offset === 152 && (flags & 64) === 0
            ? plan.specs.slice(0, 3) : plan.specs;
          for (const spec of specs) {
            if (spec.type === 'byte') denseFields[spec.field] = reader.u8();
            else if (spec.type === 'f32') denseFields[spec.field] = reader.f32();
            else if (spec.type === 'f64') denseFields[spec.field] = reader.f64();
            else if (spec.type === 'varint') denseFields[spec.field] = reader.varint();
            else if (spec.type === 'reference') denseFields[spec.field] = reader.u32();
            else if (spec.type === 'angle') denseFields[spec.field] = reader.u16();
            else if (spec.type === 'string') denseFields[spec.field] = reader.string();
            else if (spec.type === 'bit') denseFields[spec.field] = reader.bit();
            else if (spec.type === 'byteArray16') denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
            else if (spec.type === 'shortArray8') denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
            else if (spec.type === 'byteArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
            else if (spec.type === 'handleArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
            else if (spec.type === 'stringArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
            else if (spec.type === 'varintArray10') denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
            else return null;
          }
        }
        const angleRaw = denseFields[8];
        const angle = typeof angleRaw === 'number' ? angleRaw * (2 * Math.PI / 65535) : 0;
        const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
        const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
        const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : cameraX ?? 0;
        const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : cameraY ?? 0;
        const components = buildComponents(denseFields);
        entities.push({ handle, ...projectDomain(components, denseFields), x: positionX, y: positionY,
          cameraX, cameraY, angle, flags, denseFields, components });
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) return null;
      return { sequence, serverTime: 0, entities, deletedHandles, events: decodedEvents };
    } catch {
      return null;
    }
  }
}


/** Tries each decoder in order; exposes which one accepted the packet. */
export class CompositeSnapshotDecoder implements SnapshotDecoder {
  lastIndex = -1;
  constructor(private readonly decoders: readonly SnapshotDecoder[]) {}
  decode(bytes: Uint8Array): Snapshot | null {
    for (let index = 0; index < this.decoders.length; ++index) {
      const snapshot = this.decoders[index].decode(bytes);
      if (snapshot !== null) {
        this.lastIndex = index;
        return snapshot;
      }
    }
    this.lastIndex = -1;
    return null;
  }
}
