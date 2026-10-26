/** Whole-world deterministic replay through all currently migrated server bodies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld as world } from './helpers/server-world.mjs';

const hash = memory => createHash('sha256').update(new Uint8Array(memory.buffer)).digest('hex');

test('active high-level server preserves complete world memory and output over captured inputs and fifty ticks', async () => {
  const original = await world(false), recovered = await world(true);
  const timeline = [];
  function compare(label) {
    const originalHash = hash(original.runtime.memory), recoveredHash = hash(recovered.runtime.memory);
    if (recoveredHash !== originalHash) {
      const before = new Uint8Array(original.runtime.memory.buffer), after = new Uint8Array(recovered.runtime.memory.buffer);
      const differences = [];
      for (let address = 0; address < before.length && differences.length < 32; address++) {
        if (before[address] !== after[address]) differences.push({ address, original: before[address], recovered: after[address] });
      }
      assert.equal(recoveredHash, originalHash, `${label}: all 64 MiB; first differences ${JSON.stringify(differences)}`);
    }
    assert.equal(recovered.runtime.stackPointer.value, original.runtime.stackPointer.value, `${label}: stack`);
    assert.deepEqual(recovered.outgoing, original.outgoing, `${label}: output`);
    timeline.push({ label, originalMemorySha256: originalHash, recoveredMemorySha256: recoveredHash,
      stackPointer: recovered.runtime.stackPointer.value, outputCount: recovered.outgoing.length });
  }
  compare('initial world');
  const capture = JSON.parse(await fs.readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url), 'utf8'));
  const packets = capture.packets.filter(packet => packet.direction === 'toWorker');
  const ticks = 50;
  for (let step = 0; step < ticks; step++) {
    if (step < packets.length) {
      const bytes = Uint8Array.from(packets[step].bytes);
      original.send(bytes); recovered.send(bytes);
    }
    original.advance(); recovered.advance();
    compare(`tick ${step}`);
  }
  assert.ok(recovered.runtime.calls[657] >= ticks, 'output hook actually ran');
  assert.ok(recovered.runtime.calls[56] > 0, 'definition hook actually ran');
  assert.ok(Object.keys(recovered.runtime.calls).length > 10, 'multiple actual entity and gameplay hooks ran');
  await fs.writeFile(new URL('../reports/server-replay.json', import.meta.url), JSON.stringify({
    coverage: 'A bounded deterministic replay of captured local inputs and fifty server ticks; not exhaustive gameplay proof.',
    source: 'reports/runtime/client-packet-traces.json', ticks,
    inputPackets: Math.min(ticks, packets.length), calls: recovered.runtime.calls, timeline,
  }, null, 2) + '\n');
});
