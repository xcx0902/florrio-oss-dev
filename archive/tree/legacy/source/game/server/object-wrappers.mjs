/** Recovered sp_server thin object wrappers (original 324, 369, 451, 481, 641).
 *
 * 369/451/481/641 run a cleanup helper (241/290/297/242) and free the object.
 * 324 constructs a one-character '-' string through 337.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([324, 369, 451, 481, 641]);

export function createObjectWrapperHooks(runtime) {
  return Object.freeze({
    324(destination) {
      runtime.call(337, destination, 1, 45);
    },
    369(record) {
      runtime.call(241, record);
      runtime.call(14, record);
    },
    451(record) {
      runtime.call(290, record);
      runtime.call(14, record);
    },
    481(record) {
      runtime.call(297, record);
      runtime.call(14, record);
    },
    641(record) {
      runtime.call(242, record);
      runtime.call(14, record);
    },
  });
}
