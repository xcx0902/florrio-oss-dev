/** Recovered sp_server static object lifecycle helpers (516-518, 520-527).
 *
 * Destructors either destroy one 12-byte static object with original 37 or walk
 * a contiguous array downward using the destructor's return cursor. The lazy
 * initializers use a C++ guard: acquire, construct the object with original
 * 131 from a static literal descriptor, release, then return the object
 * address. All primitives are called natively (31, 32, 37, 131).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([516, 517, 518, 520, 521, 522, 523, 524, 525, 526, 527]);

/** Array destructors: [top, bottom), walked downward by 12. */
export const objectArrays = Object.freeze({
  516: Object.freeze([8571304, 8571136]),
  517: Object.freeze([8571904, 8571616]),
  518: Object.freeze([8571976, 8571952]),
});

/** Single-object destructors. */
export const singleObjects = Object.freeze({
  520: 8570876, 522: 8570844, 524: 8570940, 526: 8570908,
});

/** Guarded lazy initializers: object, guard and literal descriptor. */
export const lazyObjects = Object.freeze({
  521: Object.freeze({object: 8570876, guard: 8570888, literal: 13640}),
  523: Object.freeze({object: 8570844, guard: 8570856, literal: 13604}),
  525: Object.freeze({object: 8570940, guard: 8570952, literal: 13760}),
  527: Object.freeze({object: 8570908, guard: 8570920, literal: 13676}),
});

export function createStaticObjectLifecycleHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function destroyArray([top, bottom]) {
    let cursor = top;
    do {
      cursor = runtime.call(37, cursor - 12);
    } while (cursor !== bottom);
  }

  function initializeLazy({object, guard, literal}) {
    const memory = memoryView();
    if ((memory.getUint8(guard) & 1) !== 0) return object;
    if (runtime.call(32, guard) === 0) return object;
    runtime.call(131, object, literal);
    runtime.call(31, guard);
    return object;
  }

  return Object.freeze({
    516: () => destroyArray(objectArrays[516]),
    517: () => destroyArray(objectArrays[517]),
    518: () => destroyArray(objectArrays[518]),
    520: () => { runtime.call(37, singleObjects[520]); },
    521: () => initializeLazy(lazyObjects[521]),
    522: () => { runtime.call(37, singleObjects[522]); },
    523: () => initializeLazy(lazyObjects[523]),
    524: () => { runtime.call(37, singleObjects[524]); },
    525: () => initializeLazy(lazyObjects[525]),
    526: () => { runtime.call(37, singleObjects[526]); },
    527: () => initializeLazy(lazyObjects[527]),
  });
}
