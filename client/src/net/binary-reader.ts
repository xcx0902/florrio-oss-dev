export class BinaryReader {
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

