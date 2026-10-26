import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSineOffsetHook, functionIds} from '../source/game/server/sine-offset.mjs';

let comparisons = 0;
let memoryChecks = 0;
after(() => console.log(
  `server sine-offset oracle comparisons: ${comparisons} total, `
  + `${memoryChecks} complete-memory checks; fixed inputs plus 50k fuzz`));

test('sine offset kernel 154 matches the original bit for bit', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createSineOffsetHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  assert.equal(hooks[154].length, runtime.exports.__fn154.length);

  function compare(x, y, flag) {
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(154, x, y, flag);
    assert.equal(runtime.stackPointer.value, stack, `${x}/${y}/${flag}: native stack`);
    const actual = hooks[154](x, y, flag);
    assert.ok(Object.is(actual, expected),
      `${x}/${y}/${flag}: ${actual} !== ${expected}`);
    assert.equal(runtime.stackPointer.value, stack, `${x}/${y}/${flag}: stack`);
    comparisons++;
  }
  function checkMemory(label) {
    const before = Buffer.from(memory);
    runtime.call(154, 0.75, -0.5, 1);
    const native = Buffer.from(memory);
    hooks[154](0.75, -0.5, 1);
    assert.ok(Buffer.from(memory).equals(native), `${label}: native changed memory`);
    assert.ok(native.equals(before), `${label}: kernel wrote memory`);
    memoryChecks++;
  }

  const fixedX = [
    -8, -6.283185307179586, -3.141592653589793, -2, -1.5, -1, -0.75, -0.5,
    -0.25, -1e-9, 0, 1e-9, 0.25, 0.5, 0.75, 1, 1.5, 2, 3,
    3.141592653589793, 6.283185307179586, 8,
  ];
  const fixedY = [-4, -1, -0.5, 0, 0.5, 1, 4];
  for (const x of fixedX) {
    for (const y of fixedY) {
      compare(x, y, 0);
      compare(x, y, 1);
    }
  }
  checkMemory('fixed');

  let state = 0x9e3779b9;
  function nextRandom() {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return state >>> 0;
  }
  for (let index = 0; index < 50000; index++) {
    const x = ((nextRandom() / 0x100000000) * 2 - 1) * 20;
    const y = ((nextRandom() / 0x100000000) * 2 - 1) * 10;
    const flag = nextRandom() & 1;
    compare(x, y, flag);
    if (index % 5000 === 0) checkMemory(`fuzz-${index}`);
  }
  checkMemory('final');
});
