/** Recovered sp_server lazy catalog initializers (original 513, 514, 515).
 *
 * Each function returns a pointer to a static table of 12-byte libc++ strings,
 * building it once behind a C++ guard. On the cold path it acquires the guard,
 * clears an inner range with `clearThreeWords`, assigns each string from a
 * static literal with `function_27`, publishes the table pointer, and releases
 * the guard. All four primitives are called natively (24, 27, 31, 32).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([513, 514, 515]);

/** String tables built by each initializer. */
export const catalogs = Object.freeze({
  513: Object.freeze({
    outerGuard: 8570816, resultPointer: 8570812, resultValue: 8571920,
    innerGuard: 8571944, clearFrom: 8571920, clearTo: 8571944,
    strings: Object.freeze([[8571920, 3589], [8571932, 3586]]),
  }),
  514: Object.freeze({
    outerGuard: 8570800, resultPointer: 8570796, resultValue: 8571312,
    innerGuard: 8571600, clearFrom: 8571312, clearTo: 8571600,
    strings: Object.freeze([
      [8571312, 1490], [8571324, 1481], [8571336, 2999], [8571348, 2688],
      [8571360, 1857], [8571372, 3215], [8571384, 1562], [8571396, 1907],
      [8571408, 2532], [8571420, 2515], [8571432, 2523], [8571444, 2542],
      [8571456, 2664], [8571468, 3542], [8571480, 2551], [8571492, 2375],
      [8571504, 1857], [8571516, 2575], [8571528, 2681], [8571540, 3021],
      [8571552, 2555], [8571564, 2060], [8571576, 1899], [8571588, 3534],
    ]),
  }),
  515: Object.freeze({
    outerGuard: 8570784, resultPointer: 8570780, resultValue: 8570960,
    innerGuard: 8571128, clearFrom: 8570960, clearTo: 8571128,
    strings: Object.freeze([
      [8570960, 1836], [8570972, 1843], [8570984, 1809], [8570996, 1817],
      [8571008, 1800], [8571020, 1850], [8571032, 1827], [8571044, 2571],
      [8571056, 2644], [8571068, 3175], [8571080, 3466], [8571092, 1903],
      [8571104, 2819], [8571116, 2064],
    ]),
  }),
});

export function createCatalogInitializerHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function getCatalog(catalog) {
    const memory = memoryView();
    if ((memory.getUint8(catalog.outerGuard) & 1) !== 0) {
      return memory.getUint32(catalog.resultPointer, true);
    }
    if (runtime.call(32, catalog.outerGuard) === 0) {
      return memory.getUint32(catalog.resultPointer, true);
    }
    if ((memory.getUint8(catalog.innerGuard) & 1) === 0
        && runtime.call(32, catalog.innerGuard) !== 0) {
      for (let pointer = catalog.clearFrom; pointer !== catalog.clearTo; pointer += 12) {
        runtime.call(24, pointer);
      }
      runtime.call(31, catalog.innerGuard);
    }
    for (const [pointer, literal] of catalog.strings) runtime.call(27, pointer, literal);
    memory.setUint32(catalog.resultPointer, catalog.resultValue, true);
    runtime.call(31, catalog.outerGuard);
    return memory.getUint32(catalog.resultPointer, true);
  }

  return Object.freeze({
    513: () => getCatalog(catalogs[513]),
    514: () => getCatalog(catalogs[514]),
    515: () => getCatalog(catalogs[515]),
  });
}
