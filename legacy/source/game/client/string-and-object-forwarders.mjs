/** Recovered client string and object forwarders (26 originals).
 *
 * These slots append a length argument, bias an object pointer, forward a fixed
 * range or thread one derived object into a shared helper.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const at = (base, offset = 0) => (base >>> 0) + offset;

export const functionIds = Object.freeze([
  423, 471, 728, 864, 927, 980, 1133, 1819, 1826, 1862, 1939, 1942,
  2008, 2315, 2508, 2510, 2511, 2513, 2517, 2520, 2524, 2526, 2528, 2531, 2542, 2544,
]);

export function createStringAndObjectForwarderHooks(runtime) {
  return Object.freeze({
    423(record, text) { return runtime.call(459, record, text, runtime.call(378, text)); },
    471(record, text) { return runtime.call(453, record, text, runtime.call(378, text)); },
    728(record) {
      runtime.call(673, at(record, 8));
      return record;
    },
    864(record) { runtime.call(876, record, 1, 45); },
    927(record, first, second) { runtime.call(921, record, first, second, 0, 0); },
    980(record, value) {
      return Number(BigInt.asIntN(32, runtime.call(730, record, value, 0, 2147483648n)));
    },
    1133(record, first, second) { return runtime.call(921, record, first, second, 65, 66); },
    1819(record, value) { return runtime.call(718, record, at(value, 12)); },
    1826(record, value) { return runtime.call(718, record, at(value, 16)); },
    1862(record, _second, _third, _fourth, _fifth, sixth) { return runtime.call(718, record, sixth); },
    1939(record, _second, third, fourth) { runtime.call(890, record, third, fourth); },
    1942(record, _second, third, fourth) { runtime.call(647, record, third, fourth); },
    2008() { runtime.call(364, 18063, 0); },
    2315() {
      runtime.call(364, 18063, 0);
      return -1;
    },
    2508(record) { runtime.call(678, runtime.call(533, record), 1, 0); },
    2510(record) { runtime.call(678, runtime.call(533, record), 1, 1); },
    2511(record) { runtime.call(678, runtime.call(533, record), 0, 0); },
    2513(record) { runtime.call(678, runtime.call(533, record), 0, 1); },
    2517(record) { runtime.call(1042, runtime.call(679, record), 1); },
    2520(record) { runtime.call(1042, runtime.call(679, record), 0); },
    2524(record) { runtime.call(680, runtime.call(549, record), 3); },
    2526(record) { runtime.call(680, runtime.call(549, record), 2); },
    2528(record) { runtime.call(680, runtime.call(549, record), 1); },
    2531(record) { runtime.call(680, runtime.call(549, record), 0); },
    2542(record) { runtime.call(1046, runtime.call(682, record), 1); },
    2544(record) { runtime.call(1046, runtime.call(682, record), 0); },
  });
}
