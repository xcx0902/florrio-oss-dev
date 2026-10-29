/** Recovered client static initializer guards (originals 1833,1835,1837,1839,
 * 1848,1850,1852,1855) plus the global setup guard 629.
 *
 * Each guard checks the low bit of its flag byte, acquires the initialization
 * lock once, constructs the static string object through 552, releases the lock
 * and returns the object address.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const guards = {
  1833: {flag: 7946040, object: 7946028, text: 21008},
  1835: {flag: 7946008, object: 7945996, text: 6147},
  1837: {flag: 7946104, object: 7946092, text: 12874},
  1839: {flag: 7946072, object: 7946060, text: 19720},
  1848: {flag: 7946056, object: 7946044, text: 126360},
  1850: {flag: 7946024, object: 7946012, text: 126324},
  1852: {flag: 7946120, object: 7946108, text: 126480},
  1855: {flag: 7946088, object: 7946076, text: 126396},
};

export const functionIds = Object.freeze([...Object.keys(guards).map(Number), 629]);

export function createStaticInitializerGuardHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const hooks = {};
  hooks[629] = () => {
    if ((memoryView().getUint8(151560) & 1) === 0) {
      if (runtime.call(369, 151560) !== 0) {
        runtime.call(521);
        runtime.call(370, 151560);
      }
    }
  };
  for (const [id, {flag, object, text}] of Object.entries(guards)) {
    hooks[id] = () => {
      if ((memoryView().getUint8(flag) & 1) === 0) {
        if (runtime.call(369, flag) !== 0) {
          runtime.call(552, object, text);
          runtime.call(370, flag);
        }
      }
      return object;
    };
  }
  return Object.freeze(hooks);
}
