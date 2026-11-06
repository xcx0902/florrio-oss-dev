import type { DenseFieldSpec } from '../state/field-types.js';
import {
  COMPONENT_COUNT,
  EXTENDED_DENSE_BASE_FIELDS,
  EXTENDED_DENSE_COMPONENT,
  OUTPUT_PAYLOAD_TYPE,
  SNAPSHOT_EVENT,
} from '../schema/protocol.js';
import {
  BIT_FIELDS,
  BYTE_ARRAY_FIELDS,
  BYTE_FIELDS,
  DENSE_GROUPS,
  FLOAT_FIELDS,
  REFERENCE_FIELDS,
  STRING_ARRAY_FIELDS,
  STRING_FIELDS,
  VARINT_FIELDS,
  componentBit,
} from '../state/field-types.js';

import { projectDomain } from '../state/snapshot-projection.js';
import type {
  DenseGroupPlan,
  DenseValue,
  EntitySnapshot,
  Snapshot,
  SnapshotEvent,
} from '../state/snapshot-types.js';
import { BinaryReader as Reader } from './binary-reader.js';
export function decodeSnapshotEvents(reader: Reader, count: number): SnapshotEvent[] | null {
  const events: SnapshotEvent[] = [];
  for (let index = 0; index < count; ++index) {
    const opcode = reader.u8();
    if (opcode === SNAPSHOT_EVENT.ChatString) {
      events.push({ opcode: SNAPSHOT_EVENT.ChatString, text: reader.string() });
    } else if (opcode === SNAPSHOT_EVENT.EntityTime) {
      events.push({ opcode: SNAPSHOT_EVENT.EntityTime, handle: reader.u32() });
    } else if (opcode === SNAPSHOT_EVENT.Visual) {
      events.push({
        opcode: SNAPSHOT_EVENT.Visual,
        handle: reader.u32(),
        index: reader.u8(),
      });
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
    if (reader.u8() !== OUTPUT_PAYLOAD_TYPE.EntitySnapshot) {
      return null;
    }
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
    if (reader.u8() !== OUTPUT_PAYLOAD_TYPE.EntitySnapshot) {
      return null;
    }
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
  /** Components declared for an entity. A dense group is decoded only when its
   * component is present; the declaration mask and ordinal deltas both feed it. */
  private readonly componentPointers = new Map<number, Set<number>>();

  constructor(
    private readonly plans: readonly DenseGroupPlan[] = [],
    private readonly present: ReadonlySet<number> = new Set(),
    private readonly presentFor?: (handle: number, mask: number) => ReadonlySet<number>,
  ) {}

  private setMask(handle: number, mask: number): void {
    this.masks.set(handle, mask);
    const pointers = new Set<number>();
    for (const { component } of DENSE_GROUPS) {
      if ((mask & componentBit(component)) !== 0) {
        pointers.add(component);
      }
    }
    this.componentPointers.set(handle, pointers);
  }

  private addOrdinals(handle: number, components: readonly number[]): void {
    const pointers = this.componentPointers.get(handle) ?? new Set<number>();
    for (const component of components) {
      if (component >= 1 && component <= COMPONENT_COUNT) {
        pointers.add(component);
      }
    }
    this.componentPointers.set(handle, pointers);
  }

  /** Components with dense payload, with the caller-supplied mask callback
   * retained for tests and transitional packets. */
  private presentForHandle(handle: number, mask: number): ReadonlySet<number> {
    if (this.presentFor) {
      return this.presentFor(handle, mask);
    }
    const pointers = this.componentPointers.get(handle);
    if (pointers === undefined) {
      return this.present;
    }
    const result = new Set<number>();
    for (const { component } of DENSE_GROUPS) {
      if (pointers.has(component)) {
        result.add(component);
      }
    }
    return result;
  }

  private readDense(
    reader: Reader,
    specs: readonly DenseFieldSpec[],
  ): Record<number, DenseValue> | null {
    const denseFields: Record<number, DenseValue> = {};
    for (const spec of specs) {
      if (spec.type === 'byte') {
        denseFields[spec.field] = reader.u8();
      } else if (spec.type === 'f32') {
        denseFields[spec.field] = reader.f32();
      } else if (spec.type === 'f64') {
        denseFields[spec.field] = reader.f64();
      } else if (spec.type === 'varint') {
        denseFields[spec.field] = reader.varint();
      } else if (spec.type === 'reference') {
        denseFields[spec.field] = reader.u32();
      } else if (spec.type === 'angle') {
        denseFields[spec.field] = reader.u16();
      } else if (spec.type === 'string') {
        denseFields[spec.field] = reader.string();
      } else if (spec.type === 'bit') {
        denseFields[spec.field] = reader.bit();
      } else if (spec.type === 'byteArray16') {
        denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
      } else if (spec.type === 'shortArray8') {
        denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
      } else if (spec.type === 'byteArray10') {
        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
      } else if (spec.type === 'handleArray10') {
        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
      } else if (spec.type === 'stringArray10') {
        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
      } else if (spec.type === 'varintArray10') {
        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
      } else {
        return null;
      }
    }
    return denseFields;
  }

  decodeEntityBody(reader: Reader, handle: number, flags: number): EntitySnapshot | null {
    if ((flags & 8) !== 0) {
      if (this.plans.length === 0) {
        return null;
      }
      const componentMask = this.masks.get(handle) ?? 0;
      const present = this.presentForHandle(handle, componentMask);
      const denseFields: Record<number, DenseValue> = {};
      for (const plan of this.plans) {
        if (!present.has(plan.component)) {
          continue;
        }
        const specs =
          plan.component === EXTENDED_DENSE_COMPONENT && (flags & 64) === 0
            ? plan.specs.slice(0, EXTENDED_DENSE_BASE_FIELDS)
            : plan.specs;
        const values = this.readDense(reader, specs);
        if (values === null) {
          return null;
        }
        Object.assign(denseFields, values);
      }
      const angleRaw = denseFields[8];
      const angle = typeof angleRaw === 'number' ? angleRaw * ((2 * Math.PI) / 65535) : 0;
      const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
      const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
      const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : (cameraX ?? 0);
      const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : (cameraY ?? 0);
      return {
        handle,
        ...projectDomain(denseFields),
        x: positionX,
        y: positionY,
        cameraX,
        cameraY,
        angle,
        flags,
        componentMask,
        denseFields,
      };
    }
    let componentMask = this.masks.get(handle) ?? 0;
    const declaredComponents: number[] = [];
    if ((flags & 1) !== 0) {
      componentMask = reader.u32();
      this.setMask(handle, componentMask);
    } else if ((flags & 2) === 0) {
      let ordinal = 0;
      for (;;) {
        const delta = reader.varint() ^ 1;
        if (delta === 0) {
          break;
        }
        ordinal += delta;
        declaredComponents.push(ordinal);
        componentMask |= componentBit(ordinal);
      }
      this.setMask(handle, componentMask);
      this.addOrdinals(handle, declaredComponents);
    }
    let field = 0;
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
    const floatFields: Record<number, number> = {};
    const doubleFields: Record<number, number> = {};
    for (;;) {
      const delta = reader.varint();
      if (delta === 0) {
        break;
      }
      field += delta;
      if (field < 1 || field > 63) {
        return null;
      }
      if (BYTE_FIELDS.has(field)) {
        byteFields[field] = reader.u8();
      } else if (FLOAT_FIELDS.has(field)) {
        floatFields[field] = reader.f32();
      } else if (field === 35 || field === 18) {
        doubleFields[field] = reader.f64();
      } else if (field === 27 || field === 45) {
        floatFields[field] = reader.f32();
      } else if (field === 3) {
        let elementIndex = 0;
        handleArrayFields[3] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) {
            break;
          }
          elementIndex += elementDelta;
          handleArrayFields[3].push({ index: elementIndex - 1, handle: reader.u32() });
        }
      } else if (BYTE_ARRAY_FIELDS.has(field)) {
        let elementIndex = 0;
        byteArrayFields[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) {
            break;
          }
          elementIndex += elementDelta;
          byteArrayFields[field].push({ index: elementIndex - 1, value: reader.u8() });
        }
      } else if (field === 39 || field === 61) {
        let elementIndex = 0;
        const target = field === 39 ? varintArrayFields : shortArrayFields;
        target[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) {
            break;
          }
          elementIndex += elementDelta;
          const value = reader.varint();
          target[field].push({
            index: elementIndex - 1,
            value: field === 61 ? value & 0xffff : value,
          });
        }
      } else if (STRING_FIELDS.has(field)) {
        stringFields[field] = reader.string();
      } else if (STRING_ARRAY_FIELDS.has(field)) {
        let elementIndex = 0;
        stringArrayFields[field] = [];
        for (;;) {
          const elementDelta = reader.varint();
          if (elementDelta === 0) {
            break;
          }
          elementIndex += elementDelta;
          stringArrayFields[field].push({ index: elementIndex - 1, value: reader.string() });
        }
      } else if (REFERENCE_FIELDS.has(field)) {
        referenceFields[field] = reader.u32();
      } else if (field === 8) {
        // Sparse angles are raw u16 on the wire; the domain stores radians so
        // the sparse and dense views agree.
        floatFields[8] = reader.u16() * ((2 * Math.PI) / 65535);
      } else if (BIT_FIELDS.has(field)) {
        bitFields[field] = reader.bit();
      } else if (VARINT_FIELDS.has(field)) {
        varintFields[field] = reader.varint();
      } else {
        return null;
      }
    }
    const scalarValues: Record<number, unknown> = {
      ...byteFields,
      ...floatFields,
      ...doubleFields,
      ...varintFields,
      ...referenceFields,
      ...stringFields,
      ...bitFields,
    };
    const positionX = floatFields[49] ?? floatFields[5] ?? 0;
    const positionY = floatFields[28] ?? floatFields[24] ?? 0;
    return {
      handle,
      ...projectDomain(scalarValues),
      x: positionX,
      y: positionY,
      angle: floatFields[8] ?? 0,
      cameraX: floatFields[5],
      cameraY: floatFields[24],
      flags,
      componentMask,
      declaredComponents,
      byteFields,
      floatFields,
      doubleFields,
      byteArrayFields,
      varintArrayFields,
      shortArrayFields,
      stringFields,
      stringArrayFields,
      varintFields,
      referenceFields,
      bitFields,
      handleArrayFields,
    };
  }

  reset(): void {
    this.masks.clear();
    this.componentPointers.clear();
  }
  decode(bytes: Uint8Array): Snapshot | null {
    const transaction = new SnapshotDecoder(this.plans, this.present, this.presentFor);
    for (const [handle, mask] of this.masks) {
      transaction.masks.set(handle, mask);
    }
    for (const [handle, pointers] of this.componentPointers) {
      transaction.componentPointers.set(handle, new Set(pointers));
    }
    const snapshot = transaction.decodePacket(bytes);
    if (snapshot !== null) {
      this.masks.clear();
      this.componentPointers.clear();
      for (const [handle, mask] of transaction.masks) {
        this.masks.set(handle, mask);
      }
      for (const [handle, pointers] of transaction.componentPointers) {
        this.componentPointers.set(handle, pointers);
      }
    }
    return snapshot;
  }

  private decodePacket(bytes: Uint8Array): Snapshot | null {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== OUTPUT_PAYLOAD_TYPE.EntitySnapshot) {
        return null;
      }
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
        if (entity === null) {
          return null;
        }
        entities.push(entity);
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) {
        return null;
      }
      return { sequence, serverTime: 0, entities, events: decodedEvents, deletedHandles };
    } catch {
      return null;
    }
  }
}
