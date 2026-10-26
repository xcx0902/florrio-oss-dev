/**
 * Complete original client function 618, the move constructor for one entity
 * definition record.
 *
 * The destination and source layouts are:
 *
 *   +0   u32  name C-string pointer
 *   +4   u8   description count, followed by that many inline u32 pointers at +8
 *   +24  u64  shape and f32 scale, copied as one qword
 *   +32  u8   drop count, followed by that many inline u64 values at +36
 *   +100 u64  first two callback fields
 *   +108 u64  remaining record tail
 *
 * The native body does not call memcpy. It copies each inline array in 4-byte
 * or 8-byte chunks, in increasing address order, and clears the two source
 * counts. The chunk order is observable when the records overlap, so this
 * implementation performs the same individually bounds-checked loads and
 * stores instead of using a bulk copy. A trap leaves all earlier stores in
 * place.
 */
export const functionIds = Object.freeze([618]);

export function createEntityRecordHooks(runtime) {
  let buffer, view;

  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (address < 0 || address + size > view.byteLength)
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }

  const u8 = address => memory(address, 1).getUint8(address);
  const u32 = address => memory(address, 4).getUint32(address, true);
  const u64 = address => memory(address, 8).getBigUint64(address, true);
  const byte = (address, value) => memory(address, 1).setUint8(address, value);
  const word = (address, value) => memory(address, 4).setUint32(address, value, true);
  const long = (address, value) => memory(address, 8).setBigUint64(address, value, true);
  const next = (address, delta) => (address + delta) >>> 0;

  /** Copy `count` dwords. The native body has a leading 1..7 chunk loop and then
   * eight-chunk unrolled groups; both use a computed base pointer and memarg
   * offsets, whose effective address does not wrap. */
  function copyDwords(source, destination, count) {
    let from = source, to = destination;
    for (let index = 0, leading = count & 7; index < leading; index++) {
      word(to, u32(from));
      from = next(from, 4);
      to = next(to, 4);
    }
    for (let group = 0, groups = count >>> 3; group < groups; group++) {
      for (let offset = 0; offset < 32; offset += 4) {
        word(to + offset, u32(from + offset));
      }
      from = next(from, 32);
      to = next(to, 32);
    }
  }

  /** Copy `count` qwords with the same leading-chunk and unrolled-group shape. */
  function copyQwords(source, destination, count) {
    let from = source, to = destination;
    for (let index = 0, leading = count & 7; index < leading; index++) {
      long(to, u64(from));
      from = next(from, 8);
      to = next(to, 8);
    }
    for (let group = 0, groups = count >>> 3; group < groups; group++) {
      for (let offset = 0; offset < 64; offset += 8) {
        long(to + offset, u64(from + offset));
      }
      from = next(from, 64);
      to = next(to, 64);
    }
  }

  /** Original618(destination, source): destructively move one record. */
  function moveEntityRecord(destination, source) {
    destination >>>= 0;
    source >>>= 0;

    // The name is read before the destination count is cleared, so a
    // destination that covers source+4 changes the count the native body sees.
    const name = u32(source);
    byte(destination + 4, 0);
    word(destination, name);

    const descriptionCount = u8(source + 4);
    copyDwords(next(source, 8), next(destination, 8), descriptionCount);
    byte(destination + 4, descriptionCount);
    byte(source + 4, 0);

    const shape = u64(source + 24);
    byte(destination + 32, 0);
    long(destination + 24, shape);

    const dropCount = u8(source + 32);
    copyQwords(next(source, 36), next(destination, 36), dropCount);
    // For a nonzero drop count the native body rereads the source count after
    // the copy; only the zero-count path reuses the value read before it.
    byte(destination + 32, dropCount ? u8(source + 32) : dropCount);
    byte(source + 32, 0);

    long(destination + 108, u64(source + 108));
    long(destination + 100, u64(source + 100));
  }

  return Object.freeze({
    618: (destination, source) => moveEntityRecord(destination, source),
  });
}
