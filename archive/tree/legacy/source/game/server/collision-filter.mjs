/** Recovered sp_server collision-layer filter (original function 394).
 *
 * The owner record carries four bytes of layer flags at +92..+95. For every
 * set bit, one layer is counted when the probe value passes that layer's range
 * test. The function returns the number of matching layers, not a boolean.
 *
 * Each layer names either a state record pointer (read as u32 at the owner
 * field, then the threshold at record+4) or a direct threshold word. Most
 * layers also have two side thresholds selected by bit 6 of the selector:
 * owner + spatialOffset + 0 or +4. A layer matches when
 *
 *   threshold > probe   and   sideThreshold <= probe
 *
 * unless `ignoreRanges` is non-zero, in which case every set flag counts.
 * Bit 7 uses the sign-extended flag byte in the original, which is simply the
 * 0x80 bit.
 *
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([394]);
export const LAYER_FLAG_OFFSETS = Object.freeze([92, 93, 94, 95]);
const SIDE_SELECTOR_SHIFT = 4;
const SIDE_SELECTOR_MASK = 4;

/** `pointer` reads a record pointer then +4; `direct` reads the word itself. */
const LAYERS = Object.freeze([
  {name: 'flags0.layer0', byte: 0, mask: 1, threshold: {kind: 'pointer', offset: 100}, spatial: 256},
  {name: 'flags0.layer1', byte: 0, mask: 2, threshold: {kind: 'pointer', offset: 104}, spatial: 264},
  {name: 'flags0.layer2', byte: 0, mask: 4, threshold: {kind: 'pointer', offset: 108}},
  {name: 'flags0.layer3', byte: 0, mask: 8, threshold: {kind: 'pointer', offset: 112}},
  {name: 'flags0.layer4', byte: 0, mask: 16, threshold: {kind: 'pointer', offset: 116}, spatial: 288},
  {name: 'flags0.layer5', byte: 0, mask: 32, threshold: {kind: 'pointer', offset: 120}, spatial: 296},
  {name: 'flags0.layer6', byte: 0, mask: 64, threshold: {kind: 'pointer', offset: 124}, spatial: 304},
  {name: 'flags0.layer7', byte: 0, mask: 128,
    threshold: {kind: 'dereference', offset: 0, recordOffset: 316}, spatial: 312},

  {name: 'flags1.layer0', byte: 1, mask: 1, threshold: {kind: 'pointer', offset: 128}},
  {name: 'flags1.layer1', byte: 1, mask: 2, threshold: {kind: 'pointer', offset: 132}, spatial: 328},
  {name: 'flags1.layer2', byte: 1, mask: 4, threshold: {kind: 'pointer', offset: 136}},
  {name: 'flags1.layer3', byte: 1, mask: 8, threshold: {kind: 'pointer', offset: 140}},
  {name: 'flags1.layer4', byte: 1, mask: 16, threshold: {kind: 'pointer', offset: 144}},
  {name: 'flags1.layer5', byte: 1, mask: 32, threshold: {kind: 'pointer', offset: 148}, spatial: 360},
  {name: 'flags1.layer6', byte: 1, mask: 64, threshold: {kind: 'direct', offset: 220}, spatial: 368},
  {name: 'flags1.layer7', byte: 1, mask: 128,
    threshold: {kind: 'dereference', offset: 0, recordOffset: 628}, spatial: 376},

  {name: 'flags2.layer0', byte: 2, mask: 1, threshold: {kind: 'pointer', offset: 152}},
  {name: 'flags2.layer1', byte: 2, mask: 2, threshold: {kind: 'pointer', offset: 156}},
  {name: 'flags2.layer2', byte: 2, mask: 4, threshold: {kind: 'pointer', offset: 160}, spatial: 400},
  {name: 'flags2.layer3', byte: 2, mask: 8, threshold: {kind: 'pointer', offset: 164}, spatial: 408},
  {name: 'flags2.layer4', byte: 2, mask: 16, threshold: {kind: 'pointer', offset: 168}, spatial: 416},
  {name: 'flags2.layer5', byte: 2, mask: 32, threshold: {kind: 'pointer', offset: 172}, spatial: 424},
  {name: 'flags2.layer6', byte: 2, mask: 64, threshold: {kind: 'pointer', offset: 176}},
  {name: 'flags2.layer7', byte: 2, mask: 128, threshold: {kind: 'pointer', offset: 180}},

  {name: 'flags3.layer0', byte: 3, mask: 1, threshold: {kind: 'pointer', offset: 184}, spatial: 448},
  {name: 'flags3.layer1', byte: 3, mask: 2, threshold: {kind: 'pointer', offset: 188}, spatial: 456},
  {name: 'flags3.layer2', byte: 3, mask: 4,
    threshold: {kind: 'dereference', offset: 0, recordOffset: 1492}, spatial: 464},
  {name: 'flags3.layer3', byte: 3, mask: 8, threshold: {kind: 'pointer', offset: 192}, spatial: 472},
  {name: 'flags3.layer4', byte: 3, mask: 16, threshold: {kind: 'pointer', offset: 196}},
  {name: 'flags3.layer5', byte: 3, mask: 32, threshold: {kind: 'pointer', offset: 200}, spatial: 488},
]);

export function createCollisionFilterHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function thresholdOf(view, owner, threshold) {
    if (threshold.kind === 'pointer')
      return view.getUint32((view.getUint32((owner + threshold.offset) >>> 0, true) + 4) >>> 0, true) >>> 0;
    if (threshold.kind === 'direct')
      return view.getUint32((owner + threshold.offset) >>> 0, true) >>> 0;
    const record = view.getUint32((owner + threshold.offset) >>> 0, true) >>> 0;
    return view.getUint32((record + threshold.recordOffset) >>> 0, true) >>> 0;
  }

  /** Original 394: count layers whose range contains the probe. */
  function countMatchingLayers(owner, probe, ignoreRanges, sideSelector) {
    try {
      const view = dataView();
      const probeValue = probe >>> 0;
      let matched = 0;
      for (const layer of LAYERS) {
        const flags = view.getUint8((owner + LAYER_FLAG_OFFSETS[layer.byte]) >>> 0);
        if ((flags & layer.mask) === 0) continue;
        if (ignoreRanges === 0) {
          if (thresholdOf(view, owner, layer.threshold) <= probeValue) continue;
          if (layer.spatial !== undefined) {
            const sideOffset = layer.spatial
              + (((sideSelector >>> SIDE_SELECTOR_SHIFT) & SIDE_SELECTOR_MASK) >>> 0);
            if (view.getUint32((owner + sideOffset) >>> 0, true) > probeValue) continue;
          }
        }
        matched++;
      }
      return matched;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({394: countMatchingLayers});
}
