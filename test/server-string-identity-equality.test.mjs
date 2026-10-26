import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringIdentityEqualityHook, functionIds} from '../source/game/server/string-identity-equality.mjs';

let comparisons = 0;
after(() => console.log(
  `server string identity equality oracle comparisons: ${comparisons} total; pointer and text modes`));

test('string identity/equality predicate matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 126], construct: false});
  const hook = createStringIdentityEqualityHook(runtime)[69];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const left = 0x760000;
  const right = 0x761000;
  const first = 0x762000;
  const second = 0x763000;

  function putText(address, text) {
    for (let index = 0; index < text.length; index++) memory[address + index] = text.charCodeAt(index);
    memory[address + text.length] = 0;
  }

  const cases = [
    ['abc', 'abc', true], ['abc', 'abd', true], ['abc', 'ab', true], ['', '', true],
    ['abc', 'abc', false], ['abc', 'abd', false],
  ];
  for (const [a, b, compareText] of cases) {
    for (const sameRecord of [false, true]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      putText(first, a);
      putText(second, b);
      view.setUint32(left + 4, first, true);
      view.setUint32((sameRecord ? left : right) + 4, second === a ? first : second, true);
      const rightArg = sameRecord ? left : right;
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(69, left, rightArg, compareText ? 1 : 0);
      const actual = hook(left, rightArg, compareText ? 1 : 0);
      assert.equal(actual, expected, `${a}/${b}/${compareText}/${sameRecord}: result`);
      assert.equal(runtime.stackPointer.value, stack);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 10);
});
