/** Recovered client lifecycle forwarding wrappers (originals 387,398,406,428,429,
 * 451,456,2383,2387,2556,2560,2567,2611,2690).
 *
 * Each wrapper forwards its arguments, or a fixed data address, to one native
 * dependency; the abort pair reports through function 1 and then traps.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  387, 398, 406, 428, 429, 451, 456, 2383, 2387, 2556, 2560, 2567, 2611, 2690,
]);

export function createLifecycleWrapperHooks(runtime) {
  return Object.freeze({
    387(pointer, value) { return runtime.call(1090, pointer, value); },
    398() { runtime.call(406); throw new WebAssembly.RuntimeError('unreachable'); },
    406() { runtime.call(1); throw new WebAssembly.RuntimeError('unreachable'); },
    428(pointer, value) { return runtime.call(901, pointer, value); },
    429(pointer, value) { return runtime.call(905, pointer, value); },
    451(pointer) { return runtime.call(518, pointer, 7945884); },
    456(pointer) { return runtime.call(518, pointer, 7945892); },
    2383() { return runtime.call(630, 11821); },
    2387() { return runtime.call(630, 31452); },
    2556() { return runtime.call(792, 374968); },
    2560() { return runtime.call(795, 7890440); },
    2567() { return runtime.call(797, 7907352); },
    2611() { return runtime.call(687, 379680); },
    2690() { return runtime.call(1114, 151576); },
  });
}
