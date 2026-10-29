import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
test('JavaScript recovery is reproducible and only changes approved identifier/property tokens', () => {
  for (const variant of [[], ['--upstream']]) {
    const result = spawnSync(process.execPath, ['tools/recover-javascript.mjs', '--check', ...variant], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
});
test('shipped and recovered JavaScript agree on runtime bridge probes', () => {
  const result = spawnSync(process.execPath, ['tools/verify-javascript.mjs'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
