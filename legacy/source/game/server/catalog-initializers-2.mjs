/** Recovered sp_server lazy catalog initializers (original 528, 530, 531).
 *
 * The same guarded construction pattern as 513–515, but each string is built by
 * original 28 instead of 27. On the cold path: acquire guard, clear the inner
 * 12-byte string range with 24, assign literals with 28, publish the table
 * pointer, release. Warm calls return the published pointer.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([528, 530, 531]);

export const catalogs = Object.freeze({
  528: Object.freeze({
    outerGuard: 8570824, resultPointer: 8570820, resultValue: 8571952,
    innerGuard: 8571976, clearFrom: 8571952, clearTo: 8571976,
    strings: Object.freeze([[8571952, 18640], [8571964, 18652]]),
  }),
  530: Object.freeze({
    outerGuard: 8570808, resultPointer: 8570804, resultValue: 8571616,
    innerGuard: 8571904, clearFrom: 8571616, clearTo: 8571904,
    strings: Object.freeze([
      [8571616, 18120], [8571628, 18152], [8571640, 18188], [8571652, 18212],
      [8571664, 18236], [8571676, 18252], [8571688, 18272], [8571700, 18292],
      [8571712, 18320], [8571724, 18360], [8571736, 18392], [8571748, 18428],
      [8571760, 18464], [8571772, 18480], [8571784, 18496], [8571796, 18512],
      [8571808, 18236], [8571820, 18528], [8571832, 18544], [8571844, 18560],
      [8571856, 18576], [8571868, 18592], [8571880, 18608], [8571892, 18624],
    ]),
  }),
  531: Object.freeze({
    outerGuard: 8570792, resultPointer: 8570788, resultValue: 8571136,
    innerGuard: 8571304, clearFrom: 8571136, clearTo: 8571304,
    strings: Object.freeze([
      [8571136, 17780], [8571148, 17808], [8571160, 17836], [8571172, 17868],
      [8571184, 17908], [8571196, 17944], [8571208, 17972], [8571220, 18008],
      [8571232, 18024], [8571244, 18040], [8571256, 18056], [8571268, 18072],
      [8571280, 18088], [8571292, 18104],
    ]),
  }),
});

export function createCatalogInitializer2Hooks(runtime) {
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
    for (const [pointer, literal] of catalog.strings) runtime.call(28, pointer, literal);
    memory.setUint32(catalog.resultPointer, catalog.resultValue, true);
    runtime.call(31, catalog.outerGuard);
    return memory.getUint32(catalog.resultPointer, true);
  }

  return Object.freeze({
    528: () => getCatalog(catalogs[528]),
    530: () => getCatalog(catalogs[530]),
    531: () => getCatalog(catalogs[531]),
  });
}
