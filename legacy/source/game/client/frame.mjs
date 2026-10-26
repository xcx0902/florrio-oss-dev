/** Client reliable-input serialization and frame orchestration.
 * Original client.wasm SHA256 c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 * The enclosing update/render frame763 is recovered in render-frame.mjs.
 */
export const functionIds = Object.freeze([ 762 ]);

const add = (a, b) => a + b >>> 0;

export function createClientFrameHooks(runtime) {
  const call = (id, ...args) => runtime.call(id, ...args), memory = runtime.memory;
  let buffer = memory.buffer, view = new DataView(buffer);
  function access(method, address, ...args) {
    if (buffer !== memory.buffer) {
      buffer = memory.buffer;
      view = new DataView(buffer);
    }
    try {
      return view[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError("memory access out of bounds");
      throw error;
    }
  }
  const uint = address => access("getUint32", address, true), byte = address => access("getUint8", address);
  const put = (address, value) => access("setUint32", address, value, true), putByte = (address, value) => access("setUint8", address, value);
  const long = address => access("getBigUint64", address, true), putLong = (address, value) => access("setBigUint64", address, BigInt.asUintN(64, value), true);
  const float = address => access("getFloat32", address, true), double = address => access("getFloat64", address, true);
  const putFloat = (address, value) => access("setFloat32", address, value, true), putDouble = (address, value) => access("setFloat64", address, value, true);
  const zeroLong = address => putLong(address, 0n);
  function appendBytes(packet, source, count) {
    if (uint(packet)) put(packet, 0);
    const oldLength = uint(packet + 4), required = add(oldLength, count), inline = packet + 16;
    let storage = uint(packet + 12), capacity = storage ? uint(packet + 8) : 4096;
    if (capacity < required) {
      do {
        capacity = capacity << 1 >>> 0;
      } while (capacity < required);
      const previous = storage || inline;
      storage = call(368, capacity) >>> 0;
      const copied = call(363, storage, previous, oldLength);
      if (previous !== inline) call(362, previous);
      put(packet + 12, copied);
      put(packet + 8, capacity);
    }
    call(363, add(storage || inline, oldLength), source, count);
    put(packet + 4, required);
  }
  function releaseReliableOwner(owner) {
    if (!owner) return;
    const biased = uint(owner + 4);
    put(owner + 4, biased - 1);
    if (biased) return;
    runtime.indirect({
      parameters: [ "i32" ],
      results: []
    }, uint(uint(owner) + 8), owner);
    call(436, owner);
  }
  /** func762: serialize unacknowledged records, compact one-shot records, XOR only appended bytes. */  function serializeReliableInput(state, packet) {
    state >>>= 0;
    packet >>>= 0;
    const scratch = add(runtime.stackPointer.value, -16);
    runtime.stackPointer.value = scratch;
    let entries = uint(state + 2344), count = uint(state + 2336), first = entries, length = count;
    if (count) {
      const acknowledgement = uint(state + 2356);
      do {
        const half = length >>> 1, middle = add(first, half << 4);
        if (uint(middle) > acknowledgement) length = half; else {
          first = middle + 16;
          length = length - half - 1;
        }
      } while (length);
    }
    const originalLength = uint(packet + 4);
    let end = add(entries, count << 4);
    for (let entry = first; entry !== end; entry += 16) {
      const sequence = uint(entry), previous = uint(state + 2352);
      put(state + 2352, previous < sequence ? sequence : previous);
      let value = byte(entry + 12) ? sequence : 0, encoded = 0;
      do {
        const continued = value > 127;
        putByte(scratch + 8 + encoded, value & 127 | (continued ? 128 : 0));
        encoded++;
        value >>>= 7;
      } while (value);
      appendBytes(packet, scratch + 8, encoded);
      const sourcePacket = uint(entry + 4);
      appendBytes(packet, uint(sourcePacket + 12) || sourcePacket + 16, uint(sourcePacket + 4));
      entries = uint(state + 2344);
      count = uint(state + 2336);
      end = add(entries, count << 4);
    }
    // std::stable_partition keeps persistent records before one-shot records.
        let retainedEnd = entries;
    if (count) {
      while (retainedEnd !== end && byte(retainedEnd + 12)) retainedEnd += 16;
      if (retainedEnd !== end) {
        let last = end;
        for (;;) {
          const previous = last - 16;
          if (previous === retainedEnd) break;
          const persistent = byte(last - 4);
          last = previous;
          if (!persistent) continue;
          const distance = last - retainedEnd, items = (distance >> 4) + 1;
          if (distance > 32) {
            const capacity = Math.min(items, 134217727), temporary = call(371, capacity << 4) >>> 0;
            retainedEnd = call(671, retainedEnd, last, items, temporary, capacity) >>> 0;
            call(362, temporary);
          } else retainedEnd = call(671, retainedEnd, last, items, 0, 0) >>> 0;
          break;
        }
      }
    }
    const storage = uint(state + 2344), oldEnd = add(storage, uint(state + 2336) << 4);
    for (let entry = retainedEnd; entry !== oldEnd; entry += 16) releaseReliableOwner(uint(entry + 8));
    put(state + 2336, retainedEnd - storage >> 4);
    const appended = add(uint(packet + 4), -originalLength);
    for (let index = 0; index < appended; index++) {
      const address = add(uint(packet + 12) || packet + 16, add(originalLength, index));
      putByte(address, byte(address) ^ byte(32272 + (index & 255)));
    }
    runtime.stackPointer.value = add(scratch, 16);
  }
  return {
    762: serializeReliableInput
  };
}
