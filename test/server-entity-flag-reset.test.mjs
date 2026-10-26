import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createEntityFlagResetHook, functionIds} from '../source/game/server/entity-flag-reset.mjs';

const WAT_SHA256 = 'dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8';
test('entity definition flag reset matches original 490', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [490], construct: false});
  const hook = createEntityFlagResetHook(runtime)[490];
  assert.deepEqual(functionIds, [490]);
  const memory = new Uint8Array(runtime.memory.buffer);
  let seed = 0x9e3779b9;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
  let comparisons = 0;
  for (let trial = 0; trial < 64; trial++) {
    for (let i = 0; i < memory.length; i += 4096) memory[i] = random();
    for (const address of [8545795, 8545796, 8545848, 8546836, 8547720, 8547772, 8547773]) memory[address] = random();
    const saved = Buffer.from(memory);
    const savedStack = runtime.stackPointer.value;
    const nativeResult = runtime.call(490, 0x1234);
    const nativeMemory = Buffer.from(memory);
    memory.set(saved);
    runtime.stackPointer.value = savedStack;
    const hookResult = hook(0x1234);
    assert.equal(hookResult, nativeResult);
    assert.equal(runtime.stackPointer.value, savedStack);
    assert.ok(nativeMemory.equals(Buffer.from(memory)), `trial ${trial}`);
    comparisons++;
  }
  assert.ok(comparisons >= 60);
  console.log(`# server entity flag reset oracle comparisons: ${comparisons}; WAT ${WAT_SHA256.slice(0, 12)}`);
});
