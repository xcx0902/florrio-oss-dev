/** Recovered client object initializers and config setters (originals 1023,2303,2312).
 *
 * 1023 initialises a parser record and zero-fills 40 bytes. 2303 clears or validates
 * a configuration flag. 2312 validates a 16-byte descriptor shape. 1990 emits a
 * 257-byte diagnostic request unless logging is already active.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1023, 1990, 2303, 2312]);

export function createObjectInitializerHooks(runtime) {
  return Object.freeze({
    1990() {
      const view = new DataView(runtime.memory.buffer);
      const active = view.getUint32(7940580, true);
      if (active !== 0 && (view.getUint8(active >>> 0) & 2) !== 0) return 125873;
      const saved = runtime.stackPointer.value;
      const frame = (saved - 64) >>> 0;
      runtime.stackPointer.value = frame;
      view.setUint32(frame + 8, 257, true);
      runtime.call(402, frame + 8);
      runtime.stackPointer.value = saved;
      return 125873;
    },
    1023(record, source) {
      const view = new DataView(runtime.memory.buffer);
      const start = record >>> 0;
      view.setUint32(start + 20, 0, true);
      view.setUint32(start + 24, source, true);
      view.setUint32(start + 12, 0, true);
      view.setBigUint64(start + 4, 25769807874n, true);
      view.setUint32(start + 16, source === 0 ? 1 : 0, true);
      new Uint8Array(runtime.memory.buffer).fill(0, start + 32, start + 72);
      runtime.call(909, start + 28);
    },
    2303(record, value, unused, text) {
      const view = new DataView(runtime.memory.buffer);
      const start = record >>> 0;
      if (text === 0) {
        view.setUint32(start + 124, 0, true);
        return;
      }
      const first = view.getUint8(text >>> 0);
      if (first === 0 || first === 49) {
        view.setUint32(start + 124, 0, true);
        return;
      }
      if (runtime.call(415, text >>> 0, 15893) === 0) {
        view.setUint32(start + 124, 0, true);
        return;
      }
      view.setUint32(start + 124, 1, true);
      runtime.call(983, -1n);
    },
    2312(descriptor) {
      const view = new DataView(runtime.memory.buffer);
      if (view.getUint32(descriptor >>> 0, true) !== 1541) return 1;
      const text = view.getUint32((descriptor >>> 0) + 8, true);
      if (runtime.call(996, text) === 0) return 1;
      const saved = runtime.stackPointer.value;
      const frame = (saved - 64) >>> 0;
      runtime.stackPointer.value = frame;
      view.setUint32(frame + 8, 1619, true);
      view.setUint32(frame + 16, text, true);
      runtime.call(402, frame + 8);
      runtime.stackPointer.value = saved;
      return 1;
    },
  });
}
