/** Recovered client static queue-array destructors (4 originals).
 *
 * These run at shutdown over a statically allocated array of queue records.
 * Each record is `stride` bytes long and ends with a 144-byte queue object, so
 * the destructor walks from the last record down to the first and tears every
 * queue down with the shared teardown used by the single-object destructors.
 *
 * Like the single-object destructors, an element that is still linked aborts
 * the whole teardown instead of continuing with the remaining records.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createQueueTeardown } from './pending-queue-destructors.mjs';

export const functionIds = Object.freeze([2550, 2657, 4066, 4067]);

/** id -> { start: end of the last record, stride, stop: end of the first record }. */
const arrays = Object.freeze({
  2550: { start: 7791360, stride: 160, stop: 7785120 },
  2657: { start: 438960, stride: 152, stop: 437744 },
  4066: { start: 7936160, stride: 152, stop: 7934640 },
  4067: { start: 7934624, stride: 152, stop: 7933104 },
});

export { arrays as queueArrays };

const RECORD_QUEUE_BYTES = 144;
const FRAME_BYTES = 16;

export function createStaticQueueArrayHooks(runtime) {
  const teardown = createQueueTeardown(runtime);
  const abort = () => {
    runtime.host('a', 'b');
    throw new WebAssembly.RuntimeError('unreachable');
  };
  const hooks = {};
  for (const [id, { start, stride, stop }] of Object.entries(arrays)) {
    hooks[id] = () => {
      const frame = (runtime.stackPointer.value - FRAME_BYTES) >>> 0;
      runtime.stackPointer.value = frame;
      let cursor = start;
      for (;;) {
        if (teardown((cursor - RECORD_QUEUE_BYTES) >>> 0, true, frame)) abort();
        cursor = (cursor - stride) >>> 0;
        if (cursor === stop) break;
      }
      runtime.stackPointer.value = (frame + FRAME_BYTES) >>> 0;
    };
  }
  return Object.freeze(hooks);
}
