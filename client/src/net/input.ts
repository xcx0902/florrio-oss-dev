import { PACKET_XOR_KEY } from '../schema/packet-key.js';

/** Client-side input packet writer. The server applies the same repeating
 * 256-byte XOR key before reading the varint sequence and commands. */
export class InputPacketEncoder {
  private sequence = 0;

  private nextSequence(): number {
    this.sequence = (this.sequence + 1) >>> 0;
    if (this.sequence === 0) this.sequence = 1;
    return this.sequence;
  }

  private finish(body: readonly number[]): Uint8Array {
    const bytes = Uint8Array.from(body);
    for (let index = 0; index < bytes.length; ++index) {
      bytes[index] ^= PACKET_XOR_KEY[index % PACKET_XOR_KEY.length];
    }
    return bytes;
  }

  private static varint(value: number, out: number[]): void {
    let remaining = value >>> 0;
    while (remaining >= 0x80) {
      out.push((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    out.push(remaining);
  }

  private static f32(value: number, out: number[]): void {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true);
    out.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  }

  /** Opcode 4: restart / enter the garden. */
  restart(): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(4, body);
    return this.finish(body);
  }

  /** Opcode 3: suicide. Argument 0 kills the current player; a nonzero value is
   * ignored by the server. */
  suicide(argument = 0): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(3, body);
    InputPacketEncoder.varint(argument >>> 0, body);
    return this.finish(body);
  }

  /** Opcode 13: cycle the bench slot. */
  benchCycle(): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(13, body);
    return this.finish(body);
  }

  /** Opcode 8: discard one petal slot. */
  discard(slot: number, petal: number): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(8, body);
    body.push(slot & 0xff, petal & 0xff);
    return this.finish(body);
  }

  /** Opcode 10: swap two petal slots. */
  swap(first: number, firstValue: number, second: number, secondValue: number): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(10, body);
    body.push(first & 0xff, firstValue & 0xff, second & 0xff, secondValue & 0xff);
    return this.finish(body);
  }

  /** Opcode 6: NUL-terminated player name. */
  spawn(name: string): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(6, body);
    for (const byte of new TextEncoder().encode(name)) body.push(byte);
    body.push(0);
    return this.finish(body);
  }

  /** Opcode 12: buttons, binary32 angle (radians), binary32 strength. */
  input(buttons: number, angle: number, strength: number): Uint8Array {
    const body: number[] = [];
    InputPacketEncoder.varint(this.nextSequence(), body);
    InputPacketEncoder.varint(12, body);
    InputPacketEncoder.varint(buttons >>> 0, body);
    InputPacketEncoder.f32(angle, body);
    InputPacketEncoder.f32(strength, body);
    return this.finish(body);
  }
}
