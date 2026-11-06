import { BinaryReader as Reader } from '../../../build/client/net/binary-reader.js';
import { projectDomain } from '../../../build/client/state/snapshot-projection.js';
import { decodeSnapshotEvents } from '../../../build/client/net/snapshot-decoder.js';

/** Independent reference readers for dense group payloads. One table instead of
 * a decoder branch per dense type; the expected bytes in the tests are written
 * by hand, so this decoder is checked against them rather than against the
 * production decoder. */
const DENSE_READERS = {
  byte: (reader) => reader.u8(),
  f32: (reader) => reader.f32(),
  f64: (reader) => reader.f64(),
  varint: (reader) => reader.varint(),
  string: (reader) => reader.string(),
  bit: (reader) => reader.bit(),
  reference: (reader) => reader.u32(),
  angle: (reader) => reader.u16(),
  byteArray16: (reader) => Array.from({ length: 16 }, () => reader.u8()),
  shortArray8: (reader) => Array.from({ length: 8 }, () => reader.varint() & 0xffff),
  byteArray10: (reader) => Array.from({ length: 10 }, () => reader.u8()),
  handleArray10: (reader) => Array.from({ length: 10 }, () => reader.u32()),
  stringArray10: (reader) => Array.from({ length: 10 }, () => reader.string()),
  varintArray10: (reader) => Array.from({ length: 10 }, () => reader.varint()),
};

/**
 * Decode one snapshot packet whose updates carry only dense group payloads.
 * `specs` is the ordered list of `{ field, type }` entries the packet encodes;
 * `type` is one of the DENSE_READERS keys.
 */
export class DenseGroupDecoder {
  specs;
  constructor(specs) {
    this.specs = specs;
  }
  decode(bytes) {
    try {
      const reader = new Reader(bytes);
      if (reader.u8() !== 1) {
        return null;
      }
      const sequence = reader.varint();
      reader.varint();
      const deletes = reader.varint();
      const updates = reader.varint();
      const events = reader.varint();
      const deletedHandles = Array.from({ length: deletes }, () => reader.u32());
      const entities = [];
      for (let index = 0; index < updates; ++index) {
        const handle = reader.u32();
        const flags = reader.u8() ^ 54;
        if ((flags & 8) === 0) {
          return null;
        }
        const denseFields = {};
        for (const spec of this.specs) {
          const read = DENSE_READERS[spec.type];
          if (read === undefined) {
            return null;
          }
          denseFields[spec.field] = read(reader);
        }
        const angleRaw = denseFields[8];
        const angle = typeof angleRaw === 'number' ? angleRaw * ((2 * Math.PI) / 65535) : 0;
        const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
        const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
        const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : (cameraX ?? 0);
        const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : (cameraY ?? 0);
        entities.push({
          handle,
          ...projectDomain(denseFields),
          x: positionX,
          y: positionY,
          cameraX,
          cameraY,
          angle,
          flags,
          denseFields,
        });
      }
      const decodedEvents = decodeSnapshotEvents(reader, events);
      if (decodedEvents === null || !reader.eof) {
        return null;
      }
      return { sequence, serverTime: 0, entities, deletedHandles, events: decodedEvents };
    } catch {
      return null;
    }
  }
}
