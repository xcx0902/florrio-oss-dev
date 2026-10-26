/** Recovered client diagnostic wrappers (originals 589,993,994).
 *
 * Each reserves a 16-byte frame, spills the second argument at frame+12 and calls
 * a shared logger: 927 with the current logger object, or 749 with a level and
 * category pair.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([589, 993, 994]);

export function createLogWrapperHooks(runtime) {
  function frameFor(value) {
    const saved = runtime.stackPointer.value;
    const frame = (saved - 16) >>> 0;
    runtime.stackPointer.value = frame;
    new DataView(runtime.memory.buffer).setUint32(frame + 12, value, true);
    return {frame, saved};
  }

  return Object.freeze({
    589(kind, value) {
      const {frame, saved} = frameFor(value);
      runtime.call(927, new DataView(runtime.memory.buffer).getUint32(119488, true), kind, value);
      runtime.stackPointer.value = saved;
      void frame;
    },
    993(kind, value) {
      const {saved} = frameFor(value);
      runtime.call(749, 4, 6, kind, value);
      runtime.stackPointer.value = saved;
    },
    994(kind, value) {
      const {saved} = frameFor(value);
      runtime.call(749, 0, 3, kind, value);
      runtime.stackPointer.value = saved;
    },
  });
}
