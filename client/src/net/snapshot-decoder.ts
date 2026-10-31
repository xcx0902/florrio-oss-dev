import type { DenseFieldSpec } from '../state/field-types.js';
import { BIT_FIELDS,BYTE_ARRAY_FIELDS,BYTE_FIELDS,DENSE_GROUP_COMPONENTS,FLOAT_FIELDS,REFERENCE_FIELDS,STRING_ARRAY_FIELDS,STRING_FIELDS,VARINT_FIELDS } from '../state/field-types.js';

import { buildComponents,projectDomain } from '../state/snapshot-projection.js';
import type { DenseGroupPlan,DenseValue,EntitySnapshot,Snapshot,SnapshotEvent } from '../state/snapshot-types.js';
import { BinaryReader as Reader } from './binary-reader.js';
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

export interface SnapshotHeader {
  readonly sequence: number;
  readonly reliableAck: number;
}

/** Decode the type-1 header: type, sequence, reliable ack. */
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

/** Header plus the three block counts. Entry bodies are not decoded. */
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

export class SnapshotDecoder {
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
      if (field < 1 || field > 63) return null;
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

  reset(): void { this.masks.clear(); this.componentPointers.clear(); }
  decode(bytes: Uint8Array): Snapshot | null {
    const transaction = new SnapshotDecoder(this.plans, this.present, this.presentFor);
    for (const [handle, mask] of this.masks) transaction.masks.set(handle, mask);
    for (const [handle, pointers] of this.componentPointers) transaction.componentPointers.set(handle, new Set(pointers));
    const snapshot = transaction.decodePacket(bytes);
    if (snapshot !== null) {
      this.masks.clear(); this.componentPointers.clear();
      for (const [handle, mask] of transaction.masks) this.masks.set(handle, mask);
      for (const [handle, pointers] of transaction.componentPointers) this.componentPointers.set(handle, pointers);
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

