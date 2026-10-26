import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createCollisionFilterHook, functionIds} from '../source/game/server/collision-filter.mjs';

let comparisons = 0;
after(() => console.log(
  `server collision-filter oracle comparisons: ${comparisons} total; `
  + 'all flag combinations, per-layer range/side boundaries and random records'));

test('collision layer filter 394 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createCollisionFilterHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const owner = 0x500000;
  const countRecord = 0x502000;
  const spatialFields = [
    256, 264, 288, 296, 304, 312, 328, 360, 368, 376,
    400, 408, 416, 424, 448, 456, 464, 472, 488,
  ];

  memory.fill(0x77, 0x500000, 0x504000);
  view.setUint32(owner, countRecord, true);
  view.setUint32(countRecord + 4, 5, true);
  view.setUint32(owner + 220, 5, true);
  for (const recordOffset of [316, 628, 1492]) view.setUint32(countRecord + recordOffset, 5, true);
  const pointerFields = [
    100, 104, 108, 112, 116, 120, 124, 128, 132, 136,
    140, 144, 148, 152, 156, 160, 164, 168, 172, 176,
    180, 184, 188, 192, 196, 200,
  ];
  for (const field of pointerFields) view.setUint32(owner + field, countRecord, true);

  function setFlags(flags) {
    for (let byte = 0; byte < 4; byte++) view.setUint8(owner + 92 + byte, flags[byte]);
  }
  function setSpatial(value, except = -1) {
    for (const field of spatialFields) {
      view.setUint32(owner + field, value, true);
      view.setUint32(owner + field + 4, value, true);
    }
    if (except >= 0) view.setUint32(owner + except, 0, true);
  }

  function check(flags, probe, ignore, side, spatialValue = 0) {
    setFlags(flags);
    setSpatial(spatialValue);
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(394, owner, probe >>> 0, ignore, side);
    assert.ok(before.equals(memory), `original wrote memory flags=${flags}`);
    runtime.stackPointer.value = stack;
    const actual = hook[394](owner, probe >>> 0, ignore, side);
    assert.equal(actual, expected,
      `flags=${flags}/probe=${probe}/ignore=${ignore}/side=${side}/spatial=${spatialValue}`);
    assert.ok(before.equals(memory), `hook wrote memory flags=${flags}/probe=${probe}`);
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }

  // Every combination of the first four flag bits.
  for (let flags = 0; flags < 256; flags++)
    check([flags, 0, 0, 0], 4, 0, 0);

  // Each individual bit in the upper three bytes, and all bits together.
  for (let byte = 1; byte < 4; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      const flags = [0, 0, 0, 0];
      flags[byte] = 1 << bit;
      check(flags, 4, 0, 0);
    }
    check([0, 0, 0, 0].map((_, index) => index === byte ? 255 : 0), 4, 0, 0);
  }

  // Per-layer threshold boundary on both side selectors.
  const layerCount = 30;
  for (let layer = 0; layer < layerCount; layer++) {
    const byte = Math.floor(layer / 8);
    const bit = layer % 8;
    const flags = [0, 0, 0, 0];
    flags[byte] = 1 << bit;
    for (const side of [0, 64]) {
      for (const probe of [4, 5, 0xffffffff]) check(flags, probe, 0, side);
    }
  }

  // Spatial side acceptance and rejection for every spatial layer.
  // Enumerate the spatial field of every layer so both sides are exercised.
  const spatialByBit = [
    [256, 264, 288, 296, 304, 312],
    [328, 360, 368, 376],
    [400, 408, 416, 424],
    [448, 456, 464, 472, 488],
  ];
  for (let byte = 0; byte < 4; byte++) {
    const fields = spatialByBit[byte];
    for (let bit = 0; bit < 8; bit++) {
      const flags = [0, 0, 0, 0];
      flags[byte] = 1 << bit;
      check(flags, 4, 0, 0, 0);
      check(flags, 4, 0, 64, 5);
      const spatial = fields[bit];
      if (spatial !== undefined) {
        setFlags(flags);
        setSpatial(0);
        view.setUint32(owner + spatial, 5, true);
        const before = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(394, owner, 4, 0, 0);
        assert.ok(before.equals(memory), 'original wrote memory');
        runtime.stackPointer.value = stack;
        assert.equal(hook[394](owner, 4, 0, 0), expected, `side0 rejection bit=${byte}.${bit}`);
        assert.ok(before.equals(memory), 'hook wrote memory');
        comparisons++;
      }
    }
  }

  // Ignore-ranges mode counts every set bit.
  for (let flags = 0; flags < 256; flags += 17)
    check([flags, flags, flags, flags], 5, 1, 0);

  // Deterministic mixed records.
  let state = 0x12345678;
  for (let trial = 0; trial < 120; trial++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const flags = [state & 255, (state >>> 8) & 255, (state >>> 16) & 255, (state >>> 24) & 255];
    const probe = [0, 1, 4, 5, 6, 50, 0xffffffff][state % 7];
    check(flags, probe, trial % 3 === 0 ? 1 : 0, trial % 2 ? 64 : 0, trial % 4 === 0 ? 50 : 0);
  }

});
