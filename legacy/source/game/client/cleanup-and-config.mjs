/** Recovered client cleanup and configuration helpers (originals 600,603,1368,2040).
 *
 * 1357 releases thirty-nine pool blocks; 1368 releases sixteen static registries. 600 copies two ownership fields. 603
 * converts a 1e-6/1e3 pair into a delay. 2040 fills two locale descriptors.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const registries = [
  395244, 395240, 395236, 395232, 395228, 395224, 395220, 395216,
  395212, 395208, 395204, 395200, 395196, 395192, 395188, 395184,
];

const poolBlocks = Array.from({length: 39}, (_, index) => 436288 - index * 1080);

export const functionIds = Object.freeze([600, 603, 1357, 1368, 2040]);

export function createCleanupAndConfigHooks(runtime) {
  return Object.freeze({
    600(record, first, second) {
      const view = new DataView(runtime.memory.buffer);
      const registry = view.getUint32(7944488, true);
      if (registry === 0) {
        runtime.call(364, 17911, 0);
        return;
      }
      const start = record >>> 0;
      if (record !== 0 && view.getUint32(start, true) !== registry + 316) {
        runtime.call(364, 6459, 0);
        return;
      }
      if (first !== 0) view.setUint32(first >>> 0, view.getUint32(start + 24, true), true);
      if (second !== 0) view.setUint32(second >>> 0, view.getUint32(start + 28, true), true);
    },
    603(record) {
      const view = new DataView(runtime.memory.buffer);
      if (record === 0) {
        view.setUint32(7944552, 28, true);
        return -1;
      }
      const start = record >>> 0;
      const count = view.getUint32(start + 4, true);
      const id = view.getInt32(start, true);
      if (count > 999999999 || id > -1) {
        view.setUint32(7944552, 28, true);
        return -1;
      }
      runtime.call(92, count / 1000000 + id * 1000);
      return 0;
    },
    1357() {
      for (const block of poolBlocks) runtime.call(400, block);
    },
    1368() {
      for (const registry of registries) runtime.call(416, registry, 0);
    },
    2040(a, b, descriptor) {
      if (descriptor === 0) return 0;
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      const start = descriptor >>> 0;
      view.setBigUint64(start, 0n, true);
      view.setUint8(frame + 15, 0);
      view.setUint32(start + 8, runtime.host('a', 'a', 144931, frame + 15, 0), true);
      view.setUint8(frame + 14, 0);
      view.setUint32(start + 12, runtime.host('a', 'a', 144961, frame + 14, 0), true);
      runtime.stackPointer.value = saved;
      return 0;
    },
  });
}
