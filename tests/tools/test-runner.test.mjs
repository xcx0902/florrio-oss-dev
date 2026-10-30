import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest } from '../../tools/test-manifest.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));

async function fixture(t, suites, extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'florr-test-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'tests/unit'), { recursive: true });
  await mkdir(path.join(root, 'client/tests'), { recursive: true });
  await writeFile(path.join(root, 'tests/product-tests.json'), JSON.stringify({ schema: 1, suites }));
  for (const [file, source] of Object.entries(extra)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), source);
  }
  return root;
}

test('manifest accepts explicit files and rejects omissions, archive paths, globs and zero-test files', async t => {
  const source = 'test("example", () => {});\n';
  const root = await fixture(t, { unit: ['tests/unit/a.test.mjs'] }, {
    'tests/unit/a.test.mjs': source,
    'tests/unit/omitted.test.mjs': source,
  });
  await assert.rejects(validateManifest(root, {
    schema: 1,
    suites: { unit: ['tests/unit/a.test.mjs'] },
  }), /omits: tests\/unit\/omitted\.test\.mjs/);

  const base = { schema: 1, suites: { unit: ['tests/unit/a.test.mjs'] } };
  await assert.rejects(validateManifest(root, { ...base, suites: { unit: [] } }), /is empty/);
  await assert.rejects(validateManifest(root, { ...base, suites: { unit: ['archive/tree/old.test.mjs'] } }), /archive/);
  await assert.rejects(validateManifest(root, { ...base, suites: { unit: ['tests/unit/*.test.mjs'] } }), /explicit files/);
  await writeFile(path.join(root, 'tests/unit/a.test.mjs'), '// no test\n');
  await assert.rejects(validateManifest(root, base), /no discovered test/);
});

test('manifest rejects an unknown suite and an engine inventory without expected tests', async t => {
  const root = await fixture(t, { unit: [] });
  await assert.rejects(validateManifest(root, { schema: 1, suites: { mystery: [] } }), /unknown suite/);
  await assert.rejects(validateManifest(root, { schema: 1, suites: { engine: { runner: 'ctest', expected: [] } } }), /nonempty ctest/);
});

test('runner rejects a suite whose files discover zero tests despite exit code 0', async t => {
  const root = await fixture(t, { unit: ['tests/unit/empty.test.mjs'] }, {
    'tests/unit/empty.test.mjs': "import { describe } from 'node:test';\ndescribe('empty', () => {});\n",
  });
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, [path.join(repo, 'tools/run-tests.mjs'), 'unit'], {
    cwd: root, encoding: 'utf8', timeout: 30000, env,
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /did not establish a nonempty pass|no tests discovered/);
  assert.match(run.stdout, /# tests 0/);
});
