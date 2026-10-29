import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createScanUtilitiesHook, functionIds} from '../source/game/server/scan-utilities.mjs';

let comparisons = 0;
after(() => console.log(
  `server scan-utility oracle comparisons: ${comparisons} total; `
  + 'word/byte search, bounded length, decimal cursor'));

test('scan utilities 231/234/378/380 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createScanUtilitiesHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x380000;
  const view = new DataView(runtime.memory.buffer);
  for (const id of functionIds)
    assert.equal(hooks[id].length, runtime.exports[`__fn${id}`].length);
  const before = Buffer.from(memory);
  const run = (label, invoke, hook, ...args) => {
    memory.set(before);
    const stack = runtime.stackPointer.value;
    const expectedMemory = Buffer.from(memory);
    const expected = invoke(...args);
    assert.equal(runtime.stackPointer.value, stack, `${label}: native stack`);
    const observedMemory = Buffer.from(memory);
    memory.set(expectedMemory);
    runtime.stackPointer.value = stack;
    const actual = hook(...args);
    assert.equal(actual, expected, `${label}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${label}: stack`);
    assert.ok(Buffer.from(memory).equals(observedMemory), `${label}: memory`);
    comparisons++;
  };

  // Word search over empty, single and repeated ranges, aligned and unaligned.
  const words = [0x11223344, 0x55667788, 0x99aabbcc, 0xdeadbeef];
  for (let offset = 0; offset < 16; offset += 4) {
    words.forEach((word, index) => view.setUint32(base + offset + index * 4, word, true));
  }
  for (let start = 0; start < 4; start++) {
    for (let end = start; end <= 4; end++) {
      for (const needle of [...words, 0x01020304]) {
        view.setUint32(base + 64, needle, true);
        run(`231/${start}/${end}/${needle.toString(16)}`,
          p => runtime.call(231, p, base + end * 4, base + 64),
          p => hooks[231](p, base + end * 4, base + 64), base + start * 4);
      }
    }
  }

  for (let fill = 0; fill < 256; fill += 17) memory.fill(fill, base + 256, base + 276);
  for (let start = 0; start < 20; start += 3) {
    for (let end = start; end <= 20; end++) {
      for (const needle of [0, 255, 17, 34]) {
        memory[base + 255] = needle;
        run(`234/${start}/${end}/${needle}`,
          p => runtime.call(234, p, base + 256 + end, base + 255),
          p => hooks[234](p, base + 256 + end, base + 255), base + 256 + start);
      }
    }
  }

  for (const text of ['', 'a', 'abc', 'abcdefghijklmnop']) {
    memory.fill(0, base + 512, base + 560);
    memory.set([...text].map(c => c.charCodeAt(0)), base + 512);
    for (let limit = 0; limit <= text.length + 3; limit++) {
      run(`378/${text.length}/${limit}`,
        () => runtime.call(378, base + 512, limit),
        () => hooks[378](base + 512, limit));
    }
  }

  for (const text of ['', '0', '7', '42', '000123', '9x', 'x9', '2147483647', '4294967295']) {
    memory.fill(0, base + 768, base + 800);
    memory.set([...text].map(c => c.charCodeAt(0)), base + 768);
    view.setUint32(base + 800, base + 768, true);
    run(`380/${text}`,
      p => runtime.call(380, p),
      p => hooks[380](p), base + 800);
  }
});
