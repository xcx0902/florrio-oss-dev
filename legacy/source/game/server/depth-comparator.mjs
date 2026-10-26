/** Recovered sp_server three-element depth comparator (original function 139).
 *
 * Each argument is a slot holding an entity pointer. An entity's depth is the
 * f32 at manager(+100) -> spatial(+200) -> +16, or 0 when either the manager is
 * absent or the entity pointer's +100 word is zero. The routine is the
 * three-element exchange network used by the entity layering code: it sorts the
 * three referenced entities by descending depth, swapping only the slot
 * pointers, and returns the number of exchanges performed (0, 1 or 2).
 *
 * Every comparison is written as the negated original predicate, so NaN depths
 * follow the same non-total-order path as the shipped binary.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([139]);
const MANAGER_OFFSET = 100;
const SPATIAL_OFFSET = 200;
const DEPTH_OFFSET = 16;

export function createDepthComparatorHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function depthOfSlot(view, slot) {
    const entity = view.getUint32(slot, true) >>> 0;
    const manager = view.getUint32(entity + MANAGER_OFFSET, true) >>> 0;
    if (manager === 0) return 0;
    const spatial = view.getUint32(manager + SPATIAL_OFFSET, true) >>> 0;
    return view.getFloat32(spatial + DEPTH_OFFSET, true);
  }

  function swapSlots(view, left, right) {
    const first = view.getUint32(left, true);
    const second = view.getUint32(right, true);
    view.setUint32(left, second, true);
    view.setUint32(right, first, true);
  }

  /** Original 139: descending three-slot depth network, returning exchange count. */
  function sortThreeByDepth(first, second, third) {
    try {
      const view = dataView();
      let depthSecond = depthOfSlot(view, second);
      let depthFirst = depthOfSlot(view, first);
      // Branch taken when second > first; NaN follows the other path.
      if (depthSecond > depthFirst) {
        let depthThird = depthOfSlot(view, third);
        if (!(depthSecond < depthThird)) {
          swapSlots(view, first, second);
          let newSecond = depthOfSlot(view, second);
          let newThird = depthOfSlot(view, third);
          if (newThird > newSecond) {
            swapSlots(view, second, third);
            return 2;
          }
          return 1;
        }
        swapSlots(view, first, third);
        return 1;
      }
      let depthThird = depthOfSlot(view, third);
      if (!(depthThird > depthSecond)) return 0;
      swapSlots(view, second, third);
      let swappedSecond = depthOfSlot(view, second);
      let swappedFirst = depthOfSlot(view, first);
      if (!(swappedSecond > swappedFirst)) return 1;
      swapSlots(view, first, second);
      return 2;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({139: sortThreeByDepth});
}
