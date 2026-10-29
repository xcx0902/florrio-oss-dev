/** Single-player worker snapshots and their live frame boundary.
 * Evidence: original client.wasm c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 * The large entity-state decoder 1015 remains an explicit native dependency.
 */
import { typedIndirectCall } from '../../runtime/indirect.mjs';

export const functionIds = Object.freeze([
  1006, 1011, 1013, 2338, 2339, 2346, 2347, 2348, 2349, 2400, 2401,
]);

const add = (left, right) => (left + right) >>> 0;
const PACKET_HEADER_BYTES = 16;
const INLINE_PACKET_BYTES = 4096;
const EVENT_XOR_KEY_ADDRESS = 32272;
const GAME_WORKER_OFFSET = 7342968;
const GAME_TRANSPORT_OFFSET = 7343004;
const GAME_DISCONNECTED_OFFSET = 7343001;

export function createClientSnapshotHooks(runtime) {
  const call = (id, ...args) => runtime.call(id, ...args);
  function memory(method, address, ...args) {
    try {
      return new DataView(runtime.memory.buffer)[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const uint = address => memory('getUint32', address, true);
  const byte = address => memory('getUint8', address);
  const put = (address, value) => memory('setUint32', address, value, true);
  const putByte = (address, value) => memory('setUint8', address, value);
  const long = (address, value) => memory('setBigUint64', address, BigInt.asUintN(64, value), true);
  const invoke = (types, result, index, ...args) =>
    typedIndirectCall(
      runtime.table,
      {
        parameters: types,
        results: result ? [result] : [],
      },
      index,
      ...args,
    );
  const virtual = (object, slot, types, ...args) =>
    invoke(['i32', ...types], null, uint(uint(object) + slot * 4), object, ...args);
  const stack = size => {
    const before = call(3475) >>> 0;
    return {
      before: before,
      pointer: call(3256, size) >>> 0,
    };
  };
  const restore = frame => call(3364, frame.before);
  const payload = packet => uint(packet + 12) || add(packet, PACKET_HEADER_BYTES);

  /** Allocate the original growable byte buffer (4096-byte inline storage). */
  function copyPacket(pointer, length) {
    const packet = call(371, PACKET_HEADER_BYTES + INLINE_PACKET_BYTES) >>> 0;
    long(packet, 0n);
    long(packet + 8, 0n);
    let storage = 0;
    if (length >>> 0 > INLINE_PACKET_BYTES) {
      let capacity = INLINE_PACKET_BYTES;
      do {
        capacity = (capacity << 1) >>> 0;
      } while (capacity < length >>> 0);
      storage = call(368, capacity) >>> 0;
      put(packet + 12, storage);
      put(packet + 8, capacity);
    }
    call(363, storage || packet + PACKET_HEADER_BYTES, pointer, length);
    put(packet + 4, length);
    return packet;
  }
  /** Move the packet vector, retaining its type byte and transferred ownership. */
  function appendPacket(queue, type, packet) {
    const oldCount = uint(queue),
      count = add(oldCount, 1);
    let capacity = uint(queue + 4),
      entries = uint(queue + 8);
    if (capacity < count) {
      let next = capacity ? capacity << 1 : 512;
      do {
        capacity = next >>> 0;
        next = (capacity << 1) >>> 0;
      } while (capacity < count);
      const previous = entries;
      entries = call(368, capacity << 3) >>> 0;
      for (let index = 0; index < uint(queue); index++) {
        const from = add(previous, index << 3),
          to = add(entries, index << 3);
        putByte(to, byte(from));
        const moved = uint(from + 4);
        put(from + 4, 0);
        put(to + 4, moved);
        const leftover = uint(from + 4);
        put(from + 4, 0);
        if (leftover) {
          call(362, uint(leftover + 12));
          call(362, leftover);
        }
      }
      call(362, previous);
      put(queue + 8, entries);
      put(queue + 4, capacity);
    }
    const entry = add(entries, oldCount << 3);
    put(entry + 4, packet);
    putByte(entry, type);
    put(queue, count);
  }
  /** func2348, table slot245: actual Emscripten worker response callback. */
  function acceptWorkerSnapshot(pointer, length, worker) {
    pointer >>>= 0;
    length |= 0;
    worker >>>= 0;
    if (!pointer || length < 1) return;
    const type = byte(pointer),
      packet = copyPacket(add(pointer, 1), length - 1);
    appendPacket(worker + 4, type, packet);
  }
  /** func2338, table slot246: callback used while detaching a worker's queue. */
  function collectWorkerSnapshot(type, pointer, length, queue) {
    const packet = copyPacket(pointer, length);
    appendPacket(queue >>> 0, type, packet);
  }
  /** func2346: detach first, then call out, so reentrant responses enter a new queue. */
  function drainWorkerSnapshots(worker, userData, callbackIndex) {
    worker >>>= 0;
    put(worker + 8, 0);
    const count = uint(worker + 4);
    put(worker + 4, 0);
    const entries = uint(worker + 12);
    put(worker + 12, 0);
    for (let index = 0; index < count; index++) {
      const entry = add(entries, index << 3),
        packet = uint(entry + 4);
      invoke(
        ['i32', 'i32', 'i32', 'i32'],
        null,
        callbackIndex,
        byte(entry),
        payload(packet),
        uint(packet + 4),
        userData,
      );
    }
    for (let index = 0; index < count; index++) {
      const entry = add(entries, index << 3),
        packet = uint(entry + 4);
      put(entry + 4, 0);
      if (packet) {
        call(362, uint(packet + 12));
        call(362, packet);
      }
    }
    call(362, entries);
  }
  function sendSinglePlayerInput(worker, pointer, length) {
    runtime.host('a', 'o', uint((worker >>> 0) + 16), 17770, pointer, length, 245, worker);
  }
  function requestSinglePlayerSnapshots(worker, time) {
    runtime.host('a', 'o', uint((worker >>> 0) + 16), 14937, 0, 0, 245, worker);
  }
  /** func2339: live single-player frame boundary, including both outgoing flushes. */
  function singlePlayerFrame(game, renderer, time, width, height) {
    game >>>= 0;
    const frame = stack(4128),
      scratch = frame.pointer;
    const hasPendingInput = () => uint(game + 2360) < add(uint(game + 2356), -1);
    function flushInput() {
      long(scratch + 8, 0n);
      long(scratch, 0n);
      call(762, game + 8, scratch);
      const worker = uint(game + GAME_WORKER_OFFSET);
      virtual(worker, 1, ['i32', 'i32'], payload(scratch), uint(scratch + 4));
      call(362, uint(scratch + 12));
    }
    if (hasPendingInput()) flushInput();
    put(scratch + 4120, 0);
    long(scratch + 4112, 0n);
    let worker = uint(game + GAME_WORKER_OFFSET);
    virtual(worker, 2, ['i32', 'i32'], scratch + 4112, 246);
    let entries = uint(scratch + 4120),
      count = uint(scratch + 4112);
    for (let index = 0; index < count; index++) {
      const entry = add(entries, index << 3),
        packet = uint(entry + 4);
      put(scratch, payload(packet));
      const size = uint(packet + 4);
      long(scratch + 8, 0n);
      put(scratch + 4, size);
      const type = byte(entry);
      if (type === 1) call(1015, game + 8, scratch);
      else if (type === 5) call(1006, game + 8, scratch);
    }
    // Packet handlers can mutate the detached vector, so reload its metadata.
    entries = uint(scratch + 4120);
    count = uint(scratch + 4112);
    for (let index = 0; index < count; index++) {
      const entry = add(entries, index << 3),
        packet = uint(entry + 4);
      put(entry + 4, 0);
      if (packet) {
        call(362, uint(packet + 12));
        call(362, packet);
      }
    }
    call(362, uint(scratch + 4120));
    worker = uint(game + GAME_WORKER_OFFSET);
    virtual(worker, 0, ['f64'], time);
    call(763, game, renderer, time, width, height);
    if (hasPendingInput()) flushInput();
    restore(frame);
  }
  /** Reader layout {data,length,cursor,pendingByte}. The optional pending byte
   * belongs to the original mixed byte/field reader and is consumed before varints.
   */
  function readVarint(reader) {
    let cursor = uint(reader + 8);
    if (uint(reader + 12)) {
      put(reader + 12, 0);
      cursor = add(cursor, 1);
      put(reader + 8, cursor);
    }
    const length = uint(reader + 4),
      data = uint(reader);
    let result = 0;
    for (let group = 0; group < 5; group++) {
      const next = add(cursor, 1);
      if (next > length) break;
      put(reader + 8, next);
      const value = byte(add(data, cursor));
      result = (result | ((value & 127) << (group * 7))) >>> 0;
      cursor = next;
      if (!(value & 128) || cursor === length) break;
    }
    return result;
  }
  /** func1006: full type-5 event packet framing, XOR and duplicate suppression.
   * The separate event-specific handler1009 remains an explicit native dependency.
   */
  function decodeSnapshotEvents(state, reader) {
    state >>>= 0;
    reader >>>= 0;
    let cursor = uint(reader + 8),
      pending = uint(reader + 12);
    const remaining = add(uint(reader + 4), pending ? ~cursor : -cursor);
    const start = add(uint(reader), add(cursor, pending ? 1 : 0));
    for (let index = 0; index < remaining; index++)
      putByte(
        add(start, index),
        byte(add(start, index)) ^ byte(EVENT_XOR_KEY_ADDRESS + (index & 255)),
      );
    for (;;) {
      cursor = uint(reader + 8);
      pending = uint(reader + 12);
      const length = uint(reader + 4);
      if (pending ? add(length, ~cursor) < 2 : cursor === length) return;
      const sequence = readVarint(reader);
      let duplicate = 0;
      if (sequence) {
        if (sequence <= uint(state + 2360)) duplicate = 1;
        else put(state + 2360, sequence);
      }
      call(1009, state, reader, duplicate);
    }
  }
  /** func1011: relocate entity-reference groups and repair each circular sentinel. */
  function growSnapshotReferenceGroups(vector, required) {
    vector >>>= 0;
    required >>>= 0;
    let capacity = uint(vector + 8) ? uint(vector + 4) : 32,
      previousCapacity;
    do {
      previousCapacity = capacity;
      capacity = (capacity << 1) >>> 0;
    } while (capacity < required);
    const inline = vector + 12,
      previous = uint(vector + 8) || inline;
    const entries = call(368, previousCapacity << 5) >>> 0,
      count = uint(vector);
    for (let index = 0; index < count; index++) {
      const from = add(previous, index << 4),
        to = add(entries, index << 4),
        sentinel = to + 4,
        oldSentinel = from + 4;
      put(to + 12, sentinel);
      put(to + 8, sentinel);
      put(to + 4, 0);
      put(to, uint(from));
      const first = uint(from + 8);
      put(to + 4, uint(from + 4));
      if (first === oldSentinel) {
        put(to + 8, sentinel);
        put(to + 12, sentinel);
        put(from + 4, 0);
        put(from + 8, oldSentinel);
      } else {
        put(to + 8, first);
        const last = uint(from + 12);
        put(to + 12, last);
        put(first + 8, sentinel);
        put(last + 4, sentinel);
        put(from + 4, 0);
        put(from + 8, oldSentinel);
      }
      put(from + 12, oldSentinel);
      put(uint(from + 12) + 4, oldSentinel);
    }
    if (previous !== inline) call(362, previous);
    put(vector + 8, entries);
    put(vector + 4, capacity);
  }
  /** func1013: destroy an entity's optional cached canvas, preserving list invariants. */
  function destroySnapshotCanvas(cache) {
    cache >>>= 0;
    const frame = stack(16);
    if (cache) {
      const owner = uint(cache + 184);
      put(cache + 184, 0);
      if (owner) virtual(owner, 1, []);
      if (byte(cache + 143) >= 128) call(362, uint(cache + 132));
      const renderer = cache + 16,
        context = uint(cache + 112);
      if (context !== 4294967295) {
        const previous = uint(cache + 92),
          next = uint(cache + 88);
        if (previous) put(previous + 72, next);
        else if (uint(441324) === renderer) put(441324, next);
        if (next) put(next + 76, previous);
        long(cache + 88, 0n);
        put(frame.pointer, context);
        void (+runtime.host('a', 'a', 136033, 31967, frame.pointer) | 0);
        put(cache + 112, -1);
        put(441320, uint(441320) - 1);
      }
      if (uint(cache + 88) || uint(cache + 92) || uint(441324) === renderer) {
        runtime.host('a', 'b');
        throw new WebAssembly.RuntimeError('unreachable');
      }
      call(362, cache);
    }
    restore(frame);
  }
  function isTransportDisconnected(game) {
    return byte((game >>> 0) + GAME_DISCONNECTED_OFFSET);
  }
  function isTransportOpen(game) {
    const transport = uint((game >>> 0) + GAME_TRANSPORT_OFFSET);
    return transport ? Number(uint(transport + 104) === 2) : 0;
  }
  return {
    1006: decodeSnapshotEvents,
    1011: growSnapshotReferenceGroups,
    1013: destroySnapshotCanvas,
    2338: collectWorkerSnapshot,
    2339: singlePlayerFrame,
    2346: drainWorkerSnapshots,
    2347: sendSinglePlayerInput,
    2348: acceptWorkerSnapshot,
    2349: requestSinglePlayerSnapshots,
    2400: isTransportDisconnected,
    2401: isTransportOpen,
  };
}
