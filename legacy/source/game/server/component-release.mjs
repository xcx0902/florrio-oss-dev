/** Recovered sp_server component release (original 421, 425).
 *
 * Releases the component referenced by the slot at record-8: publishes the host
 * generation into +296/+300, frees the two deferred effect slots indexed by the
 * low 14 bits of +16, copies the host generation into the two component tables,
 * and mirrors it into the record at +112.
 * 425 is the same release with a 96-byte slot back-reference and a +144 mirror.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([421, 425]);

export function createComponentReleaseHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function releaseSlot(memory, tableBase, index) {
    const slot = (tableBase + index * 8) >>> 0;
    const entry = memory.getUint32(slot, true);
    memory.setUint32(slot, 0, true);
    if (entry !== 0) {
      runtime.call(14, memory.getUint32(entry + 12, true));
      runtime.call(14, entry);
    }
  }

  function release(record, back, mirror) {
      const memory = memoryView();
      const slot = (record - back) >>> 0;
      const node = memory.getUint32(slot, true);
      if (node === 0) return;
      const host = memory.getUint32(node, true);
      const generation = memory.getUint32(host + 2140, true);
      memory.setUint32(node + 296, generation, true);
      memory.setUint32(node + 300, generation, true);
      const index = memory.getUint32(node + 16, true) & 0x3fff;
      releaseSlot(memory, 264876, index);
      releaseSlot(memory, 264880, index);
      memory.setUint32(host + index * 4 + 68268, generation, true);
      memory.setUint32(host + index * 4 + 133804, generation, true);
      memory.setUint32(slot + mirror, memory.getUint32(memory.getUint32(memory.getUint32(slot, true), true) + 2140, true), true);
  }

  return Object.freeze({
    421(record) {
      release(record, 8, 112);
    },
    425(record) {
      release(record, 96, 144);
    },
  });
}
