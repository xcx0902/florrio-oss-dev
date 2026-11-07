// October 2022 capture/replay helpers. Production encoding remains in C++.
export const payloadKey = Buffer.from(
  '1319779d7721fe7acd95e993e03aeeedc0acaad5ee169dc978def504dd8b3281396834289c1d89d88908d231e836a10cde939b67008604c419f28563782f00a84abdcddc89150238531c970a120d6cf3cabf0b4db56eea808afa30cea13b5042723b0d452c1a89b4f71d97a51da9ccc38f9f1ae0a6107bffb30e336e1ee049c0e39ac9e25941e04ea0e1e840473468892528487efb1301000037ed4e8bbfa16e0092914bc056ca298e09c1889bbb2c96a5961212b86b0de6305f48093e2b6d6431c8b7feb64dd59f15ef872883060bc5789bf75ac69635ce00f8825164d1abf34fa65f59c8b1e65a9852f1597da4071beed8fa45a47a670a9aae808cdaab7013',
  'hex',
);
const next = (state) => (state * 83875 + 1323) % 2147171462;
function permutation(seed, fixed) {
  const values = Array.from({ length: 100 }, (_, i) => i);
  for (let i = 99; i > 0; --i) {
    seed = next(seed);
    const j = seed % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  for (const i of fixed) {
    const j = values.indexOf(i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
export const vu = (value) => {
  const bytes = [];
  do {
    bytes.push((value & 127) | (value > 127 ? 128 : 0));
    value >>>= 7;
  } while (value);
  return Buffer.from(bytes);
};
export const u32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};
export const f32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeFloatLE(value);
  return bytes;
};
export const str = (value) => Buffer.from(value + '\0');
export function readVu(bytes, cursor) {
  let value = 0;
  for (let shift = 0; shift <= 28; shift += 7) {
    if (cursor.offset >= bytes.length) {
      throw new Error('Truncated varint');
    }
    const byte = bytes[cursor.offset++];
    value += (byte & 127) * 2 ** shift;
    if (byte < 128) {
      return value;
    }
  }
  throw new Error('Varint overflow');
}
export class CaptureCodec {
  constructor(client = false) {
    this.client = client;
    this.state = client ? 0x99df460b : 0x13bde6d7;
    this.fixed = client ? [3, 66, 64, 65, 48] : [0, 64, 4];
    this.table = permutation(client ? 249858013 : 3056761215, this.fixed);
    this.inverse = this.table.map((_, i) => this.table.indexOf(i));
  }
  outer(bytes, decode = false) {
    bytes = Buffer.from(bytes);
    if (!bytes.length || this.fixed.includes(bytes[0])) {
      return bytes;
    }
    this.state = next(this.state);
    const rounds = (this.client ? this.state & 15 : this.state % 12) + 1;
    for (let i = 0; i < rounds; ++i) {
      bytes[0] = (decode ? this.inverse : this.table)[bytes[0]];
    }
    const key = Array.from({ length: 22 }, () => {
      this.state = next(this.state);
      return this.state & 255;
    });
    for (let i = 1; i < bytes.length; ++i) {
      bytes[i] ^= key[i % 22];
    }
    return bytes;
  }
  decode(bytes) {
    const plain = this.outer(bytes, true);
    let offset = 2;
    if (!this.client && plain[0] === 1) {
      const cursor = { offset };
      readVu(plain, cursor);
      offset = cursor.offset;
    }
    if (plain[0] === (this.client ? 1 : 5) || (!this.client && plain[0] === 1)) {
      for (let i = offset; i < plain.length; ++i) {
        plain[i] ^= payloadKey[(i - offset) % 256];
      }
    }
    return plain;
  }
  seal(plain, offset) {
    plain = Buffer.from(plain);
    for (let i = offset; i < plain.length; ++i) {
      plain[i] ^= payloadKey[(i - offset) % 256];
    }
    return this.outer(plain);
  }
  world(tick, records = Buffer.alloc(0), acknowledged = 0, prefix = Buffer.alloc(4)) {
    const header = Buffer.concat([Buffer.from([1, 0]), vu(tick)]);
    return this.seal(
      Buffer.concat([header, vu(acknowledged), prefix, records, Buffer.alloc(5)]),
      header.length,
    );
  }
}
export function record(handle, mask, body) {
  return Buffer.concat([
    u32(handle),
    Buffer.from([0xcc, mask & 255, (mask >>> 8) & 255, mask >>> 16]),
    body,
  ]);
}
