import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFloatFormatSuffixHook, functionIds} from '../source/game/server/float-format-suffix.mjs';

let comparisons = 0;
after(() => console.log(
  `server float format-spec oracle comparisons: ${comparisons} total; `
  + 'all 0..300 styles, sign/alternate/uppercase, payload lengths and boundaries'));

test('float format-spec suffix 178 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [178, 16], construct: false});
  const hook = createFloatFormatSuffixHook(runtime);
  assert.deepEqual(functionIds, [178]);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const source = runtime.call(16, 64);
  const destination = runtime.call(16, 128);
  assert.equal(hook[178].length, runtime.exports.__fn178.length);

  function hashMemory() {
    return createHash('sha256').update(memory).digest('hex');
  }

  function check(label, payload, options, address = destination) {
    memory.fill(0, source, source + 64);
    memory.set(Buffer.from(payload, 'latin1'), source);
    memory.fill(0xa5, address, address + 32);

    const before = Buffer.from(memory.subarray(address, address + 32));
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(178, address, source, options);
    const expectedHash = hashMemory();
    const expectedBytes = Buffer.from(memory.subarray(address, address + 32));
    const expectedStack = runtime.stackPointer.value;

    memory.set(before, address);
    runtime.stackPointer.value = stack;
    const actual = hook[178](address, source, options);
    const actualHash = hashMemory();
    const actualBytes = Buffer.from(memory.subarray(address, address + 32));

    assert.equal(actual, expected, `${label}: return`);
    assert.deepEqual(actualBytes, expectedBytes, `${label}: destination bytes`);
    assert.equal(actualHash, expectedHash, `${label}: complete 64 MiB memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }

  // Every style value 0..300, with and without each visible flag.
  for (let style = 0; style <= 300; style++) {
    for (const flags of [0, 0x800, 0x400, 0x4000, 0x800 | 0x400 | 0x4000]) {
      check(`style ${style} flags ${flags}`, '12.5', style | flags);
    }
  }

  // Payload lengths 0..8 (including an embedded NUL) and both letter cases.
  for (const style of [0, 4, 256, 260, 1, 512, 0x104 | 1]) {
    for (let length = 0; length <= 8; length++) {
      const payload = 'x'.repeat(length);
      for (const flags of [0, 0x4000, 0x800, 0x400]) {
        check(`style ${style} len ${length} flags ${flags}`, payload, style | flags);
      }
    }
    check(`style ${style} embedded NUL`, 'ab\0cd', style | 0x4000);
  }

  // Exact destination boundaries and non-zero starting bytes.
  for (const address of [0, 8, destination, memory.length - 8]) {
    for (const style of [0, 4, 256, 260, 0x4000]) {
      for (const flags of [0, 0x800 | 0x400]) {
        check(`boundary ${address} style ${style} flags ${flags}`, '1', style | flags, address);
      }
    }
  }

  // The suffix is written one byte past the payload; the next byte is untouched.
  memory.fill(0, source, source + 64);
  memory.set(Buffer.from('12.5'), source);
  memory.fill(0x5a, destination, destination + 32);
  runtime.call(178, destination, source, 0);
  const suffixAt = destination + 2 + 4;
  assert.equal(memory[suffixAt], 103);
  assert.equal(memory[suffixAt + 1], 0x5a);
});
