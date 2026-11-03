import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { stepMotion } from '../../build/client/state/player-motion.js';
test('640 independent frozen C++ movement steps match TypeScript position and f64 velocity', () => {
  const run = spawnSync('build/engine/engine_player_motion_tests', ['--fixture'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const rows = JSON.parse(run.stdout);
  assert.equal(rows.length, 640);
  for (const row of rows) {
    const actual = stepMotion(row.initial, row.input, row.parameters);
    assert.equal(actual.x, row.expected.x, JSON.stringify(row));
    assert.equal(actual.y, row.expected.y);
    for (const axis of ['vx', 'vy']) {
      assert.ok(
        Math.abs(actual[axis] - row.expected[axis]) <= 1e-14,
        `scenario ${row.scenario} phase ${row.phase} ${axis}`,
      );
    }
  }
});
