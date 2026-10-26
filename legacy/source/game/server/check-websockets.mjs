/** Recovered sp_server websocket pump (original function 660).
 *
 * For every socket in the process-local list at 8548284 the server drains the
 * pending event queue through the emscripten asm-const dispatcher (selector
 * 22639, operation 5170). Each event carries a payload pointer and a second
 * word in the dispatcher frame:
 *
 *   1 -> socket handler +48, called as (handler, &payload, &word);
 *   2 -> socket handler +24, called as (handler);
 *   3 -> socket handler +72, called as (handler);
 *   4 -> ends the pump; its payload is released by the close path;
 *   anything else -> no handler, payload released.
 *
 * Kind 4 ends the pump and then runs the optional close handler at +96 and
 * releases the dispatcher's output word; without a close handler the last
 * payload is released instead. An empty queue (kind 0) skips the close path
 * entirely. Then the next socket node is visited.
 *
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([660]);
export const dependencyIds = Object.freeze([14]);
const SOCKET_LIST = 8548284;
const DISPATCHER_SELECTOR = 22639;
const DISPATCHER_OPERATION = 5170;

export function createCheckWebSocketsHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readU32(address) {
    try {
      return dataView().getUint32(address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeU32(address, value) {
    try {
      dataView().setUint32(address >>> 0, value >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const release = address => runtime.call(14, address >>> 0);
  const callOne = (handler, methodOffset) => {
    const method = readU32(readU32(handler) + methodOffset);
    runtime.indirect({parameters: ['i32'], results: []}, method, handler);
  };

  /** Original 660: drain every pending socket event and close callback. */
  function checkWebSockets() {
    const stack = (runtime.stackPointer.value - 32) >>> 0;
    runtime.stackPointer.value = stack;
    for (let node = readU32(SOCKET_LIST); node !== 0; node = readU32(node)) {
      const socket = readU32(node + 8);
      let payload = 0;
      let closeEvent = false;
      for (;;) {
        writeU32(stack, readU32(socket));
        writeU32(stack + 8, (stack + 16) >>> 0);
        writeU32(stack + 4, (stack + 20) >>> 0);
        const kind = runtime.host('a', 'b', DISPATCHER_SELECTOR, DISPATCHER_OPERATION, stack) | 0;
        if (kind === 0) break;
        payload = readU32(stack + 20);
        if (kind === 1) {
          const handler = readU32(socket + 48);
          if (handler !== 0) {
            const word = readU32(stack + 16);
            writeU32(stack + 28, payload);
            writeU32(stack + 24, word);
            const method = readU32(readU32(handler) + 24);
            runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: []},
              method, handler, (stack + 28) >>> 0, (stack + 24) >>> 0);
          }
          release(payload);
          continue;
        }
        if (kind === 2 || kind === 3) {
          const handler = readU32(socket + (kind === 2 ? 24 : 72));
          if (handler !== 0) callOne(handler, 24);
          release(payload);
          continue;
        }
        // Kind 4 ends the event pump immediately; its payload is released by
        // the close path below, not here. Any other kind is a discarded event.
        if (kind === 4) { closeEvent = true; break; }
        release(payload);
      }
      if (!closeEvent) continue;
      const closeHandler = readU32(socket + 96);
      if (closeHandler !== 0) {
        callOne(closeHandler, 24);
        release(readU32(stack + 20));
      } else {
        release(payload);
      }
    }
    runtime.stackPointer.value = (stack + 32) >>> 0;
  }

  return Object.freeze({660: checkWebSockets});
}
