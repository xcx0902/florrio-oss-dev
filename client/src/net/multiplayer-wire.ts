/** Strict network v2 primitives. No Worker framing, XOR or implicit coercion. */
import { BYTE_FIELDS, Component, componentBit } from '../state/field-types.js';
import { PUBLIC_FIELDS, PUBLIC_COMPONENT_MASK, LIMITS } from '../schema/multiplayer.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function normalize(value: string, max: number, points: number, kind: string): string {
  if (typeof value !== 'string' || encoder.encode(value).length > max) {
    throw new Error('text length');
  }
  // TextEncoder replaces unpaired surrogates; reject them before encoding.
  for (const c of value) {
    const cp = c.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      throw new Error('unicode');
    }
  }
  if (kind === 'nickname') {
    value = value.replace(/^[\s\u0085]+|[\s\u0085]+$/gu, '');
  }
  if ([...value].length > points || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error('text');
  }
  if (kind === 'nickname' && !value.length) {
    throw new Error('nickname');
  }
  if (kind === 'room' && !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('room');
  }
  if (kind === 'hash' && !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('hash');
  }
  return value;
}
function check(v: number, min: number, max: number, integer: boolean): void {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  ) {
    throw new Error('number');
  }
}
export class WireWriter {
  private readonly data: number[] = [];
  u8(v: number, min = 0, max = 255): void {
    check(v, min, max, true);
    this.data.push(v);
  }
  u16(v: number, min = 0, max = 65535): void {
    check(v, min, max, true);
    this.data.push(v & 255, v >>> 8);
  }
  u32(v: number, min = 0, max = 0xffffffff): void {
    check(v, min, max, true);
    for (let i = 0; i < 4; i++) {
      this.data.push((v >>> (8 * i)) & 255);
    }
  }
  f32(v: number, min = -Infinity, max = Infinity): void {
    check(v, min, max, false);
    check(Math.fround(v), min, max, false);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.data.push(...b);
  }
  f64(v: number, min = -Infinity, max = Infinity): void {
    check(v, min, max, false);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.data.push(...b);
  }
  boolean(v: boolean): void {
    if (typeof v !== 'boolean') {
      throw new Error('bool');
    }
    this.u8(v ? 1 : 0);
  }
  varint(v: number): void {
    check(v, 0, 0xffffffff, true);
    do {
      const b = v & 127;
      v >>>= 7;
      this.u8(b | (v ? 128 : 0));
    } while (v);
  }
  length(n: number, fixed: number, max: number, prefix: boolean): void {
    check(n, 0, max, true);
    if (fixed && n !== fixed) {
      throw new Error('count');
    }
    if (prefix) {
      this.varint(n);
    }
  }
  bytes(v: Uint8Array, fixed: number, max: number): void {
    if (!(v instanceof Uint8Array)) {
      throw new Error('bytes');
    }
    this.length(v.length, fixed, max, !fixed);
    for (const b of v) {
      this.data.push(b);
    }
  }
  text(v: string, max: number, points: number, kind: string): void {
    this.bytes(encoder.encode(normalize(v, max, points, kind)), 0, max);
  }
  finish(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}
export class WireReader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  private take(n: number): number {
    if (this.offset + n > this.data.length) {
      throw new Error('truncated');
    }
    const p = this.offset;
    this.offset += n;
    return p;
  }
  u8(min = 0, max = 255): number {
    const v = this.view.getUint8(this.take(1));
    check(v, min, max, true);
    return v;
  }
  u16(min = 0, max = 65535): number {
    const v = this.view.getUint16(this.take(2), true);
    check(v, min, max, true);
    return v;
  }
  u32(min = 0, max = 0xffffffff): number {
    const v = this.view.getUint32(this.take(4), true);
    check(v, min, max, true);
    return v;
  }
  f32(min = -Infinity, max = Infinity): number {
    const v = this.view.getFloat32(this.take(4), true);
    check(v, min, max, false);
    return v;
  }
  f64(min = -Infinity, max = Infinity): number {
    const v = this.view.getFloat64(this.take(8), true);
    check(v, min, max, false);
    return v;
  }
  boolean(): boolean {
    return this.u8(0, 1) === 1;
  }
  varint(): number {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 4 && b & 240) {
        throw new Error('varint overflow');
      }
      v |= (b & 127) << (7 * i);
      if (!(b & 128)) {
        if (i && b === 0) {
          throw new Error('overlong');
        }
        return v >>> 0;
      }
    }
    throw new Error('varint overflow');
  }
  length(fixed: number, max: number, prefix: boolean): number {
    const n = prefix ? this.varint() : fixed;
    if (n > max || n > this.data.length - this.offset) {
      throw new Error('count');
    }
    return n;
  }
  bytes(fixed: number, max: number): Uint8Array {
    const n = this.length(fixed, max, !fixed);
    const p = this.take(n);
    return this.data.slice(p, p + n);
  }
  text(max: number, points: number, kind: string): string {
    return normalize(decoder.decode(this.bytes(0, max)), max, points, kind);
  }
  done(): void {
    if (this.offset !== this.data.length) {
      throw new Error('trailing bytes');
    }
  }
}
export function frame(type: number, epoch: number, payload: Uint8Array, max: number): Uint8Array {
  if (payload.length + 16 > max) {
    throw new Error('frame size');
  }
  const w = new WireWriter();
  w.bytes(new Uint8Array([70, 76, 82, 50]), 4, 4);
  w.u16(2);
  w.u8(type);
  w.u8(0);
  w.u32(epoch);
  w.u32(payload.length);
  const result = new Uint8Array(payload.length + 16);
  result.set(w.finish());
  result.set(payload, 16);
  return result;
}
export function unframe(bytes: Uint8Array, max: number): { type: number; sessionEpoch: number } {
  if (bytes.length < 16 || bytes.length > max) {
    throw new Error('frame size');
  }
  const r = new WireReader(bytes.subarray(0, 16));
  if (r.u8() !== 70 || r.u8() !== 76 || r.u8() !== 82 || r.u8() !== 50 || r.u16() !== 2) {
    throw new Error('version');
  }
  const type = r.u8();
  r.u8(0, 0);
  const sessionEpoch = r.u32();
  if (r.u32() !== bytes.length - 16) {
    throw new Error('payload length');
  }
  r.done();
  return { type, sessionEpoch };
}

/** Reuse the entity field codec, with an explicit public-only v2 projection. */
export function validatePublicEntity(bytes: Uint8Array, handle: number): void {
  const r = new WireReader(bytes);
  if (!handle || r.u8() !== 1 || r.varint() !== 1 || r.varint() !== 0 || r.varint() !== 0) {
    throw new Error('entity header');
  }
  const count = r.varint();
  if (!count || count > LIMITS.maxEntityFieldRecords || r.varint() !== 0) {
    throw new Error('entity counts');
  }
  const core = PUBLIC_COMPONENT_MASK,
    // Render components are optional decorations on top of the public core:
    // petal artwork and projectile presence. No other component is public.
    renderComponents =
      componentBit(Component.PetalVariant) |
      componentBit(Component.PetalSpecies) |
      componentBit(Component.WebProjectileTag) |
      componentBit(Component.ProjectileTag);
  let mask = 0;
  const seen = new Set<number>();
  const allowed: ReadonlySet<number> = new Set(PUBLIC_FIELDS);
  for (let i = 0; i < count; i++) {
    if (r.u32() !== handle) {
      throw new Error('handle');
    }
    const flags = r.u8() ^ 54;
    if (flags === 8) {
      if (mask !== core) {
        throw new Error('private dense group');
      }
      r.f32();
      r.f32();
      r.u16();
      r.f32();
      r.f32();
      r.f32();
      r.u8();
      r.u8();
      r.u8();
      continue;
    }
    if (flags !== 1 && flags !== 129) {
      throw new Error('entity flags');
    }
    mask = r.u32();
    if (mask & ~(core | renderComponents) || (mask & core) !== core) {
      throw new Error('private mask');
    }
    let field = 0;
    for (;;) {
      const delta = r.varint();
      if (!delta) {
        break;
      }
      field += delta;
      if (!allowed.has(field)) {
        throw new Error('private field');
      }
      seen.add(field);
      if (BYTE_FIELDS.has(field)) {
        r.u8();
      } else if (field === 8) {
        r.u16();
      } else if (field === 4) {
        const data: number[] = [];
        for (;;) {
          const byte = r.u8();
          if (!byte) {
            break;
          }
          if (data.length === 128) {
            throw new Error('name length');
          }
          data.push(byte);
        }
        normalize(decoder.decode(Uint8Array.from(data)), 128, 32, 'nickname');
      } else {
        r.f32();
      }
    }
  }
  for (const field of [2, 7, 8, 26, 28, 31, 38, 49, 53, 55]) {
    if (!seen.has(field)) {
      throw new Error('incomplete entity');
    }
  }
  r.done();
}
