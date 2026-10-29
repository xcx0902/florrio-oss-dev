/** Recovered client pending-task-queue destructors (55 originals).
 *
 * Every original tears down one statically allocated queue object and is
 * identical apart from the object address.  The object layout is:
 *   +72  previous link      +76  next link       +96  pending count
 *   +116 std::string message (small-string flag at +127)
 * A count of -1 means the queue was never started.  Tearing a started queue
 * down unlinks it from the global registry (`ACTIVE_HEAD`), notifies the
 * JavaScript side through `emscripten_asm_const_int` with the pending count,
 * marks the queue dead and decrements the live-queue counter.  A final
 * invariant aborts when the registry still points at the destroyed queue
 * while both of its links are clear.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  2545, 2564, 2571, 2572, 2573, 2576, 2578, 2581, 2585, 2589,
  2590, 2591, 2595, 2597, 2602, 2607, 2609, 2615, 2616, 2617,
  2618, 2620, 2621, 2622, 2623, 2624, 2625, 2626, 2627, 2638,
  2641, 2642, 2643, 2644, 2646, 2647, 2649, 2650, 2652, 2655,
  2656, 2658, 2659, 2663, 2664, 2665, 2666, 2667, 2668, 2670,
  2671, 2675, 2676, 2677, 4063,
  2395, 2628, 2634, 2678, 4062,
]);

const PREVIOUS_LINK = 72;
const NEXT_LINK = 76;
const PENDING_COUNT = 96;
const MESSAGE = 116;
const MESSAGE_SMALL_STRING_FLAG = 11;
const FRAME_BYTES = 16;

/** Global list of live queues and the number of live queues. */
const ACTIVE_HEAD = 441324;
const ACTIVE_COUNT = 441320;

/** JavaScript notification: (tag 136033, code 31967, &count). */
const NOTIFY_TAG = 136033;
const NOTIFY_CODE = 31967;

/** id -> address of the queue object. */
const queues = Object.freeze({
  2545: 7937744, 2564: 7938352, 2571: 7918624, 2572: 7918464, 2573: 7918304, 2576: 7917920,
  2578: 7917536, 2581: 7917152, 2585: 7919360, 2589: 7918952, 2590: 7918784, 2591: 7916768,
  2595: 7916384, 2597: 7916000, 2602: 7910488, 2607: 159040, 2609: 158872, 2615: 7932120,
  2616: 7931960, 2617: 378104, 2618: 377944, 2620: 377784, 2621: 377624, 2622: 377464,
  2623: 377304, 2624: 377144, 2625: 376984, 2626: 376824, 2627: 376664, 2638: 7932832,
  2641: 160128, 2642: 159968, 2643: 159808, 2644: 159648, 2646: 159488, 2647: 159328,
  2649: 158216, 2650: 158056, 2652: 157648, 2655: 157264, 2656: 438976, 2658: 437584,
  2659: 437424, 2663: 157104, 2664: 156944, 2665: 156784, 2666: 440664, 2667: 440504,
  2668: 440344, 2670: 440184, 2671: 440024, 2675: 439384, 2676: 439224, 2677: 156624,
  4063: 151344,
});

export { queues as queueAddresses };

/** id -> address of a queue object that has no message string. */
const messageLessQueues = Object.freeze({
  2395: 386816, 2628: 158504, 2634: 158368, 2678: 156504, 4062: 7932984,
});

export { messageLessQueues as messageLessQueueAddresses };

function buildQueueTools(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function read(method, address) {
    try {
      return dataView()[method](address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function write(method, address, value) {
    try {
      dataView()[method](address >>> 0, value, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const readInt8 = address => read('getInt8', address);
  const readInt32 = address => read('getInt32', address);
  const readUint32 = address => read('getUint32', address);
  const writeUint32 = (address, value) => write('setUint32', address, value >>> 0);
  const writeInt32 = (address, value) => write('setInt32', address, value | 0);
  const free = pointer => runtime.call(362, pointer);
  const notify = count => runtime.host('a', 'a', NOTIFY_TAG, NOTIFY_CODE, count);
  const abort = () => { runtime.host('a', 'b'); throw new WebAssembly.RuntimeError('unreachable'); };

  /** Tear one queue down using `frame` for the notification.
   *  Returns whether the object is still linked afterwards. */
  function teardownQueue(base, hasMessage, frame) {
    if (hasMessage && readInt8(base + MESSAGE + MESSAGE_SMALL_STRING_FLAG) <= -1) free(readUint32(base + MESSAGE));
    const pending = readInt32(base + PENDING_COUNT);
    if (pending !== -1) {
      const next = readInt32(base + NEXT_LINK);
      const previous = readUint32(base + PREVIOUS_LINK);
      if (next !== 0) {
        writeUint32(next + PREVIOUS_LINK, previous);
      } else if (readUint32(ACTIVE_HEAD) === base) {
        writeUint32(ACTIVE_HEAD, previous);
      }
      const tail = readUint32(base + PREVIOUS_LINK);
      if (tail !== 0) writeUint32(tail + NEXT_LINK, next);
      write('setBigUint64', base + PREVIOUS_LINK, 0n);
      writeInt32(frame, pending);
      notify(frame);
      writeInt32(base + PENDING_COUNT, -1);
      writeUint32(ACTIVE_COUNT, (readUint32(ACTIVE_COUNT) - 1) >>> 0);
    }
    return readUint32(base + PREVIOUS_LINK) !== 0 || readUint32(base + NEXT_LINK) !== 0 || readUint32(ACTIVE_HEAD) === base;
  }

  return { teardownQueue, abort };
}

export function createPendingQueueDestructorHooks(runtime) {
  const { teardownQueue, abort } = buildQueueTools(runtime);
  // The object must be fully unlinked and the registry must no longer name it.
  function destroyQueue(base, hasMessage) {
    const frame = (runtime.stackPointer.value - FRAME_BYTES) >>> 0;
    runtime.stackPointer.value = frame;
    if (teardownQueue(base, hasMessage, frame)) abort();
    runtime.stackPointer.value = (frame + FRAME_BYTES) >>> 0;
  }
  const hooks = {};
  for (const [id, base] of Object.entries(queues)) hooks[id] = () => destroyQueue(base, true);
  for (const [id, base] of Object.entries(messageLessQueues)) hooks[id] = () => destroyQueue(base, false);
  return Object.freeze(hooks);
}

/** Shared teardown used by the static queue-array destructors. */
export function createQueueTeardown(runtime) {
  return buildQueueTools(runtime).teardownQueue;
}
