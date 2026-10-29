/** Recovered client global destructor functions (8 originals).
 *
 * These clear module-level owning pointers through the native free function
 * (function 362). The original bodies are:
 *
 *   1390, 1401, 2398, 2604, 2661: free(*slot); store 0 at slot-8..slot+3
 *   2608: p = *slot; if (p) { *slot+4 = p; free(p); }
 *   2285, 2574, 1291, 1302: if ((signed char)*flag <= -1) free(*slot);
 *   374, 845, 895, 1269, 1313, 2635, 3841: direct/list/tree-style frees.
 *
 * WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  374, 413, 833, 845, 895, 1269, 1291, 1302, 1313, 1390, 1401, 2285,
  2398, 2574, 2604, 2608, 2635, 2661, 3841, 439, 499, 1280, 1379,
  381, 1335, 1412,
]);

const FREE = 362;

export function createGlobalDestructorHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(method, address, ...args) {
    try {
      return dataView()[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const i8At = address => access('getInt8', address);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);
  const free = pointer => runtime.call(FREE, pointer);

  const simple = Object.freeze({
    1390: [391048, 391040],
    1401: [386936, 386928],
    2398: [441276, 441268],
    2604: [7922264, 7922256],
    2661: [437396, 437388],
  });
  const hooks = {};
  for (const [id, [slot, base]] of Object.entries(simple)) {
    hooks[id] = () => {
      free(u32At(slot));
      set64(base, 0n);
      set32(slot, 0);
    };
  }
  hooks[2608] = () => {
    const pointer = u32At(7948276);
    if (pointer !== 0) {
      set32(7948280, pointer);
      free(pointer);
    }
  };
  hooks[2285] = () => {
    if (i8At(7922303) <= -1) free(u32At(7922292));
  };
  hooks[2574] = () => {
    if (i8At(167971) <= -1) free(u32At(167960));
  };
  hooks[374] = pointer => free(pointer);
  hooks[413] = pointer => {
    if ((access('getUint8', (pointer + 11) >>> 0) >>> 7) !== 0) {
      u32At((pointer + 8) >>> 0);
      free(u32At(pointer));
    }
    return pointer;
  };
  hooks[833] = pointer => {
    set32(pointer, 126108);
    const child = u32At((pointer + 8) >>> 0);
    if (child !== 0 && access('getUint8', (pointer + 12) >>> 0) !== 0) free(child);
    return pointer;
  };
  hooks[845] = (left, right, _ignored) => {
    if (left === right) set8((left + 128) >>> 0, 0);
    else free(right);
  };
  hooks[895] = pointer => {
    if (pointer !== 0 && pointer !== 131484 && pointer !== 131508) free(pointer);
  };
  hooks[1269] = () => {
    let node = u32At(7910236);
    while (node !== 0) {
      const next = u32At(node);
      free(node);
      node = next;
    }
    const tail = u32At(7910228);
    set32(7910228, 0);
    if (tail !== 0) free(tail);
  };
  hooks[1291] = () => {
    if (i8At(441395) <= -1) free(u32At(441384));
    if (i8At(441383) <= -1) free(u32At(441372));
  };
  hooks[1302] = () => {
    if (i8At(439203) <= -1) free(u32At(439192));
    if (i8At(439191) <= -1) free(u32At(439180));
  };
  hooks[1313] = () => {
    let node = u32At(441352);
    while (node !== 0) {
      const next = u32At(node);
      free(node);
      node = next;
    }
    const tail = u32At(441344);
    set32(441344, 0);
    if (tail !== 0) free(tail);
  };
  hooks[2635] = pointer => {
    const child = u32At((pointer + 12) >>> 0);
    if (child !== 0) {
      free(u32At((child + 12) >>> 0));
      free(child);
    }
  };
  hooks[1412] = () => {
    const count = u32At(386772);
    if (count !== 0) {
      const data = u32At(386780);
      const size = (count << 2) >>> 0;
      const last = (size - 4) >>> 0;
      const chunks = ((last >>> 2) + 1) >>> 0;
      const head = chunks & 7;
      let pointer = data;
      for (let index = 0; index < head; index++) {
        free(u32At(pointer));
        pointer = (pointer + 4) >>> 0;
      }
      if (last >= 28) {
        const end = (data + size) >>> 0;
        while (pointer !== end) {
          for (let offset = 0; offset < 32; offset += 4)
            free(u32At((pointer + offset) >>> 0));
          pointer = (pointer + 32) >>> 0;
        }
      }
    }
    free(u32At(386792));
    set64(386784, 0n);
    set32(386792, 0);
    free(u32At(386780));
    set64(386772, 0n);
    set32(386780, 0);
  };
  hooks[381] = pointer => {
    if ((access('getUint8', (pointer + 11) >>> 0) >>> 7) !== 0) free(u32At(pointer));
    return pointer;
  };
  hooks[1335] = () => {
    for (let slot = 441260; slot >= 441148; slot -= 16) {
      free(u32At(slot));
      set64(slot - 8, 0n);
      set32(slot, 0);
    }
  };
  hooks[439] = (destination, source) => {
    if ((access('getUint8', (destination + 11) >>> 0) >>> 7) !== 0) free(u32At(destination));
    set32((destination + 8) >>> 0, u32At((source + 8) >>> 0));
    set32(destination, u32At(source));
    set32((destination + 4) >>> 0, u32At((source + 4) >>> 0));
    set8((source + 11) >>> 0, 0);
    set8(source, 0);
  };
  hooks[499] = (destination, source) => {
    if ((access('getUint8', (destination + 11) >>> 0) >>> 7) !== 0) free(u32At(destination));
    set32((destination + 8) >>> 0, u32At((source + 8) >>> 0));
    set32(destination, u32At(source));
    set32((destination + 4) >>> 0, u32At((source + 4) >>> 0));
    set8((source + 11) >>> 0, 0);
    set32(source, 0);
  };
  hooks[1280] = () => {
    for (const [slot, base] of [[7908904, 7908896], [7908892, 7908884],
      [7908880, 7908872], [7908868, 7908860]]) {
      free(u32At(slot));
      set64(base, 0n);
      set32(slot, 0);
    }
  };
  hooks[1379] = () => {
    let node = u32At(395156);
    while (node !== 0) {
      const next = u32At(node);
      if (i8At((node + 31) >>> 0) <= -1) free(u32At((node + 20) >>> 0));
      if (i8At((node + 19) >>> 0) <= -1) free(u32At((node + 8) >>> 0));
      free(node);
      node = next;
    }
    const tail = u32At(395148);
    set32(395148, 0);
    if (tail !== 0) free(tail);
  };
  hooks[3841] = pointer => {
    set32(pointer, 33508);
    const first = u32At((pointer + 28) >>> 0);
    const second = u32At((pointer + 32) >>> 0);
    set32((first + 8) >>> 0, second);
    set32((second + 4) >>> 0, first);
    free(pointer);
  };
  return hooks;
}
