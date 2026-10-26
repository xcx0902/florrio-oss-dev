/** Recovered client static-range cleanup loops (originals 1844,1845,1846).
 *
 * Each walks a fixed static range backwards in 12-byte steps through the destructor
 * 413 until the range start is reached.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1844, 1845, 1846]);

const ranges = Object.freeze({
  1844: [7946472, 7946304],
  1845: [7947072, 7946904],
  1846: [7947144, 7946976],
});

export function createStaticCleanupHooks(runtime) {
  const hooks = {};
  for (const [id, [start, end]] of Object.entries(ranges)) {
    hooks[id] = () => {
      let cursor = start;
      do {
        cursor = runtime.call(413, cursor - 12);
      } while (cursor !== end);
    };
  }
  return Object.freeze(hooks);
}
