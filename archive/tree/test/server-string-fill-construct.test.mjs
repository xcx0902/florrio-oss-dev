import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringFillConstructHook, functionIds} from '../source/game/server/string-fill-construct.mjs';

let comparisons = 0;
after(() => console.log(
  `server string fill construct oracle comparisons: ${comparisons} total; lengths`));

test('string fill constructor matches original semantics', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 75, 173, 121], construct: false});
  const hook = createStringFillConstructHook(runtime)[214];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  function read(pointer) {
    const view = new DataView(runtime.memory.buffer);
    const long = (view.getUint8(pointer + 11) & 0x80) !== 0;
    const size = long ? view.getUint32(pointer + 4, true) : view.getUint8(pointer + 11);
    const data = long ? view.getUint32(pointer, true) : pointer;
    return {size, bytes: Buffer.from(memory.subarray(data, data + size))};
  }

  for (const length of [0, 1, 5, 10, 11, 20]) {
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[0xc11000 + index] = 97 + (index % 26);
    const destination = 0xc10000;
    runtime.call(214, destination, 0xc11000, length);
    const expected = read(destination);
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[0xc11000 + index] = 97 + (index % 26);
    hook(destination, 0xc11000, length);
    const actual = read(destination);
    assert.equal(actual.size, expected.size, `${length}: size`);
    assert.ok(actual.bytes.equals(expected.bytes), `${length}: bytes`);
    comparisons++;
  }
  assert.ok(comparisons >= 6);
});
