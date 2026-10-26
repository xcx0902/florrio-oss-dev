import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createUtf8EncodeCodepointHook, functionIds} from '../source/game/server/utf8-encode-codepoint.mjs';

let comparisons = 0;
after(() => console.log(
  `server UTF-8 encoder oracle comparisons: ${comparisons} total; 1-4 byte, locale and error paths`));

test('UTF-8 code point encoder matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createUtf8EncodeCodepointHook(runtime)[124];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x670000;
  const localeCell = 0x670800;
  const values = [0, 0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdfff,
    0xe000, 0xdf80, 0xdf9f, 0xfffd, 0xffff, 0x10000, 0x10ffff, 0x110000, 0xffffffff];

  for (const localeNonZero of [false, true]) {
    for (const value of values) {
      for (const zeroOutput of [false, true]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(22540, localeCell, true);
        view.setUint32(localeCell, localeNonZero ? 7 : 0, true);
        const output = zeroOutput ? 0 : base;
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(124, output, value);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hook(output, value);
        assert.equal(actual, expected, `${localeNonZero}/${value}/${zeroOutput}: result`);
        assert.equal(runtime.stackPointer.value, stack, `${localeNonZero}/${value}/${zeroOutput}: stack`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${localeNonZero}/${value}/${zeroOutput}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 60);
});
