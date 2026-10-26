/** Recovered sp_server guarded singleton accessors (original 505, 507, 510, 512).
 *
 * Each checks its guard byte, acquires the guard through 32, constructs the
 * static object through 123 on first use, releases through 31 and returns the
 * static address.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([505, 507, 510, 512]);

const singletons = new Map([
  [505, {guard: 8570872, object: 8570860, size: 3573}],
  [507, {guard: 8570840, object: 8570828, size: 1861}],
  [510, {guard: 8570936, object: 8570924, size: 2559}],
  [512, {guard: 8570904, object: 8570892, size: 3546}],
]);

export function createSingletonGetterHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function get(record) {
    const memory = memoryView();
    if ((memory.getUint8(record.guard) & 1) === 0) {
      if (runtime.call(32, record.guard) !== 0) {
        runtime.call(123, record.object, record.size);
        runtime.call(31, record.guard);
      }
    }
    return record.object;
  }

  return Object.freeze({
    505() { return get(singletons.get(505)); },
    507() { return get(singletons.get(507)); },
    510() { return get(singletons.get(510)); },
    512() { return get(singletons.get(512)); },
  });
}
