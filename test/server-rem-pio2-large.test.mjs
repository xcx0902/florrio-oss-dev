import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRemPio2LargeHook, functionIds} from '../source/game/server/rem-pio2-large.mjs';
import {createRemPio2Hook} from '../source/game/server/rem-pio2.mjs';
import {createRemPio2fHook} from '../source/game/server/rem-pio2f.mjs';

let comparisons = 0;
after(() => console.log(
  `server rem_pio2_large oracle comparisons: ${comparisons} total; `
  + 'prec 0..3, nx 1..4, cancellation and recomputation cases'));

test('rem_pio2_large matches original 285 with native scalbn 107', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [283, 284, 285, 107], construct: false});
  const hook = createRemPio2LargeHook(runtime)[285];
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const xPointer = 0x500000;
  const yPointer = 0x502000;
  const clean = Buffer.from(memory);
  const current = Buffer.from(memory.buffer);
  assert.deepEqual(functionIds, [285]);

  function compare(e0, nx, precision, label) {
    const stack = runtime.stackPointer.value;
    view.setFloat64(yPointer, 0, true);
    view.setFloat64(yPointer + 8, 0, true);
    view.setFloat64(yPointer + 16, 0, true);
    const expectedResult = runtime.call(285, xPointer, yPointer, e0, nx, precision) | 0;
    const expected = [view.getFloat64(yPointer, true), view.getFloat64(yPointer + 8, true),
      view.getFloat64(yPointer + 16, true)];
    view.setFloat64(yPointer, 0, true);
    view.setFloat64(yPointer + 8, 0, true);
    view.setFloat64(yPointer + 16, 0, true);
    const actualResult = hook(xPointer, yPointer, e0, nx, precision) | 0;
    const actual = [view.getFloat64(yPointer, true), view.getFloat64(yPointer + 8, true),
      view.getFloat64(yPointer + 16, true)];
    const tag = `${label}: e0=${e0} nx=${nx} prec=${precision}`;
    assert.equal(actualResult, expectedResult, `${tag}: result`);
    assert.equal(actual[0], expected[0], `${tag}: y0`);
    assert.equal(actual[1], expected[1], `${tag}: y1`);
    if (precision === 3) assert.equal(actual[2], expected[2], `${tag}: y2`);
    assert.equal(runtime.stackPointer.value, stack, `${tag}: stack`);
    // Everything outside the dead 560-byte frame, the x limbs and y output
    // must be byte-identical to the pre-call image.
    const frameStart = stack - 560;
    assert.equal(Buffer.compare(current.subarray(0, xPointer), clean.subarray(0, xPointer)), 0,
      `${tag}: memory before x`);
    assert.equal(Buffer.compare(current.subarray(xPointer + 64, yPointer), clean.subarray(xPointer + 64, yPointer)), 0,
      `${tag}: memory between x and y`);
    assert.equal(Buffer.compare(current.subarray(yPointer + 32, frameStart), clean.subarray(yPointer + 32, frameStart)), 0,
      `${tag}: memory below frame`);
    assert.equal(Buffer.compare(current.subarray(stack), clean.subarray(stack)), 0,
      `${tag}: memory above frame`);
    comparisons++;
  }

  function writeLimbs(limbs) {
    for (let index = 0; index < 8; index++) view.setFloat64(xPointer + index * 8, 0, true);
    for (let index = 0; index < limbs.length; index++) {
      view.setFloat64(xPointer + index * 8, limbs[index], true);
    }
  }

  const edgeTopics = [
    [1, [1]], [1, [2]], [1, [16777215]], [1, [8388608]],
    [2, [1, 0]], [2, [1, 1]], [2, [16777215, 0]], [2, [16777215, 16777215]],
    [3, [1, 0, 0]], [3, [1, 1, 0]], [3, [1, 0, 1]], [3, [0xffffff, 0, 0]],
    [4, [1, 2, 3, 4]], [4, [0xffffff, 0, 0xffffff, 0]],
  ];
  for (const [nx, limbs] of edgeTopics) {
    for (const precision of [0, 1, 2, 3]) {
      for (const e0 of [3, 4, 24, 25, 48, 49, 72, 73]) {
        memory.set(clean);
        writeLimbs(limbs);
        view.setFloat64(yPointer, 0, true);
        view.setFloat64(yPointer + 8, 0, true);
        view.setFloat64(yPointer + 16, 0, true);
        compare(e0, nx, precision, 'edge');
      }
    }
  }

  let state = 0x0badf00d;
  const random = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  for (let trial = 0; trial < 300; trial++) {
    const nx = 1 + random() % 4;
    const precision = random() % 4;
    const e0 = random() % 96;
    memory.set(clean);
    const limbs = [];
    for (let index = 0; index < nx; index++) limbs.push(random() % 16777216);
    writeLimbs(limbs);
    view.setFloat64(yPointer, 0, true);
    view.setFloat64(yPointer + 8, 0, true);
    view.setFloat64(yPointer + 16, 0, true);
    compare(e0, nx, precision, 'random');
  }
  // Composition: the recovered 283/284 hooks call the recovered 285 hook
  // instead of the native body.
  const shim = Object.create(runtime);
  shim.call = (id, ...args) => id === 285 ? hook(...args) : runtime.call(id, ...args);
  const recovered283 = createRemPio2Hook(shim)[283];
  const recovered284 = createRemPio2fHook(shim)[284];
  const out = yPointer;
  let state2 = 0x5eed1234;
  const random2 = () => state2 = (Math.imul(state2, 1664525) + 1013904223) >>> 0;
  for (let trial = 0; trial < 40; trial++) {
    const bits = trial < 20
      ? (BigInt(random2()) << 32n) | BigInt(random2() >>> 0)
      : (0x4000000000000000n | (BigInt(random2()) << 21n) | BigInt(random2() & 0x1fffff));
    view.setBigUint64(xPointer, bits, true);
    const value = view.getFloat64(xPointer, true);
    const stack = runtime.stackPointer.value;
    view.setFloat64(out, 0, true);
    view.setFloat64(out + 8, 0, true);
    const expected = runtime.call(283, value, out) | 0;
    const expectedY = [view.getFloat64(out, true), view.getFloat64(out + 8, true)];
    view.setFloat64(out, 0, true);
    view.setFloat64(out + 8, 0, true);
    const actual = recovered283(value, out) | 0;
    assert.equal(actual, expected, `283 composition ${trial}: result`);
    assert.deepEqual([view.getFloat64(out, true), view.getFloat64(out + 8, true)], expectedY,
      `283 composition ${trial}: words`);
    assert.equal(runtime.stackPointer.value, stack, `283 composition ${trial}: stack`);
    comparisons++;

    view.setUint32(xPointer, random2(), true);
    const fvalue = view.getFloat32(xPointer, true);
    view.setFloat64(out, 0, true);
    view.setFloat64(out + 8, 0, true);
    const fexpected = runtime.call(284, fvalue, out) | 0;
    const fexpectedY = view.getFloat64(out, true);
    view.setFloat64(out, 0, true);
    view.setFloat64(out + 8, 0, true);
    const factual = recovered284(fvalue, out) | 0;
    assert.equal(factual, fexpected, `284 composition ${trial}: result`);
    assert.equal(view.getFloat64(out, true), fexpectedY, `284 composition ${trial}: word`);
    assert.equal(runtime.stackPointer.value, stack, `284 composition ${trial}: stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 500);
});
