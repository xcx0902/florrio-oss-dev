/** Recovered client refcounted string destructors (originals 433,466).
 *
 * Frees the inline buffer, unlinks the string from the global ring, reports the
 * released block through the host bridge, marks the slot unused and asserts that
 * the link fields are clear. Slot 536 repeats this over a 304-byte element array.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const layouts = {
  433: {base: 8, prelude: [], postlude: []},
  466: {base: 16, prelude: [], postlude: []},
  539: {base: 248, prelude: [], postlude: [[377, 8]]},
  550: {base: 32, prelude: [[789, 1040], [619, 184]], postlude: []},
  585: {base: 24, prelude: [[377, 448], [377, 216]], postlude: []},
  620: {base: 240, prelude: [], postlude: [[377, 8]]},
  621: {base: 32, prelude: [[377, 984], [377, 744], [377, 376]], postlude: []},
  795: {base: 24, prelude: [[377, 976], [377, 736], [377, 368]], postlude: []},
  797: {base: 24, prelude: [[377, 1096], [377, 856], [377, 488]], postlude: []},
  1070: {base: 32, prelude: [[377, 1032], [377, 792], [377, 424]], postlude: []},
  1111: {base: 256, prelude: [], postlude: [[377, 16]]},
  1114: {base: 32, prelude: [[377, 4528], [377, 4288], [377, 3920], [697, 288]], postlude: []},
};

export const layoutBases = Object.freeze(
  Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, layout.base])));

export const functionIds = Object.freeze([...Object.keys(layouts).map(Number), 536]);

export function createRefcountedStringDestructorHooks(runtime) {
  const hooks = {};

  function destroyString(start) {
    const view = new DataView(runtime.memory.buffer);
    if (view.getInt8(start + 127) <= -1) runtime.call(362, view.getUint32(start + 116, true));
      const reference = view.getUint32(start + 96, true);
      if (reference !== 0xffffffff) {
        const previous = view.getUint32(start + 76, true);
        if (previous !== 0) view.setUint32(previous + 72, view.getUint32(start + 72, true), true);
        else if (view.getUint32(441324, true) === start)
          view.setUint32(441324, view.getUint32(start + 72, true), true);
        const next = view.getUint32(start + 72, true);
        if (next !== 0) view.setUint32(next + 76, previous, true);
        view.setBigUint64(start + 72, 0n, true);
        const frame = (runtime.stackPointer.value - 16) >>> 0;
        view.setUint32(frame, reference, true);
        runtime.host('a', 'a', 136033, 31967, frame);
        view.setUint32(start + 96, 0xffffffff, true);
        view.setUint32(441320, (view.getUint32(441320, true) - 1) >>> 0, true);
      }
      if (view.getUint32(start + 72, true) === 0 && view.getUint32(start + 76, true) === 0
        && view.getUint32(441324, true) === start) {
        runtime.call(1);
        throw new WebAssembly.RuntimeError('unreachable');
      }
  }

  for (const [id, {base, prelude, postlude}] of Object.entries(layouts)) {
    hooks[id] = record => {
      for (const [target, offset] of prelude) runtime.call(target, ((record >>> 0) + offset) >>> 0);
      destroyString(((record >>> 0) + base) >>> 0);
      for (const [target, offset] of postlude) runtime.call(target, ((record >>> 0) + offset) >>> 0);
    };
  }

  hooks[536] = record => {
    const view = new DataView(runtime.memory.buffer);
    const count = view.getUint8(record >>> 0);
    for (let index = 0; index < count; index++) {
      const element = ((record >>> 0) + 8 + index * 304) >>> 0;
      runtime.call(519, element + 152);
      destroyString(element + 8);
    }
    view.setUint8(record >>> 0, 0);
  };
  return Object.freeze(hooks);
}
