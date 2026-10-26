/** Recovered sp_server C-string construction and null-safe UTF-8 wrapper
 * (original 200, 382).
 *
 * 200 measures the NUL-terminated text and constructs a libc++ string through
 * the length-aware constructor 204. 382 returns 0 for a null destination and
 * otherwise forwards to the UTF-8 code point encoder 124.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([200, 382]);

export function createStringConstructionWrapperHooks(runtime) {
  let buffer, memory;
  function bytes() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      memory = new Uint8Array(buffer);
    }
    return memory;
  }

  return Object.freeze({
    200(destination, text) {
      const memory = bytes();
      const start = text >>> 0;
      let end = start;
      while (memory[end] !== 0) end++;
      runtime.call(204, destination, text, end - start);
    },
    382(destination, codePoint) {
      if ((destination >>> 0) === 0) return 0;
      return runtime.call(124, destination, codePoint);
    },
  });
}
