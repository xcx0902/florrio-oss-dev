import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createContainerEndHook, functionIds} from '../source/game/server/container-end.mjs';

let comparisons = 0;
after(() => console.log(
  `server container-end oracle comparisons: ${comparisons} total; `
  + 'inline and heap storage for word and byte containers'));

test('container end accessors 109 and 111 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createContainerEndHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const container = 0x3e0000;
  const payload = 0x3e0400;
  for (const [kind, id, scale] of [['word', 109, 4], ['byte', 111, 1]]) {
    assert.equal(hook[id].length, runtime.exports[`__fn${id}`].length);
    for (const heap of [false, true]) {
      for (const count of [0, 1, 7, 63, 127]) {
        memory.fill(0x5c, container, container + 1024);
        view.setUint8(container + 11, heap ? 0x80 | count : count);
        if (heap) {
          view.setUint32(container, payload, true);
          view.setUint32(container + 4, count, true);
        }
        const before = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(id, container);
        const expectedMemory = Buffer.from(memory);
        memory.set(before);
        runtime.stackPointer.value = stack;
        const actual = hook[id](container);
        assert.equal(actual, expected, `${kind}/${heap}/${count}: result`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${kind}/${heap}/${count}: memory`);
        assert.equal(runtime.stackPointer.value, stack, `${kind}/${count}: stack`);
        comparisons++;
      }
    }
  }
});
