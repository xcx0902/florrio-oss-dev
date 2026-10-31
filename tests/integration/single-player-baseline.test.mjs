import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');
const expected = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/product/multiplayer/single-player.expected.json'), 'utf8'));
function capture() {
  const run = spawnSync(path.join(root, 'build/engine/engine_single_player_baseline_tests'), [], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('seeded native movement, combat, death and respawn match the frozen M00 domain baseline twice', () => {
  const first = capture(), second = capture();
  assert.deepEqual(first, expected, 'domain behaviour changed; review the M00 contract before updating the fixture');
  assert.deepEqual(second, first, 'the same seeds and inputs must produce identical domain values');
  assert.equal(first.complete, true);
});
