import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bootReference } from './browser.mjs';
import { readCatalog } from './catalog.mjs';
import { checkEvidence } from './evidence.mjs';
import { checkDispatch, probeGlue } from './glue.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'https://florr.io';
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const hash = (body) => createHash('sha256').update(body).digest('hex');
const identity = (file, body) => ({ file, bytes: body.length, sha256: hash(body) });

async function sourceIdentity() {
  const files = [
    'package.json',
    'package-lock.json',
    'web/index.html',
    'web/reference.css',
    'web/resources-20221030.json',
    'tools/reference/browser.mjs',
    'tools/reference/catalog.mjs',
    'tools/reference/evidence.mjs',
    'tools/reference/fetch-archive.mjs',
    'tools/reference/glue.mjs',
    'tools/reference/verify.mjs',
    'data/wire/20221030/bootstrap.json',
    'data/evidence/20221030/sources.json',
    'data/evidence/20221030/rules.json',
    'data/evidence/20221030/video-observations.json',
    'tests/scenarios/garden-w0.json',
  ].sort();
  const entries = await Promise.all(
    files.map(async (file) => identity(file, await readFile(path.join(root, file)))),
  );
  return { sha256: hash(JSON.stringify(entries)), entries };
}

async function checkedResource(directory, entry) {
  const body = await readFile(path.join(directory, entry.file));
  assert.equal(body.length, entry.bytes, `${entry.file} byte count`);
  assert.equal(hash(body), entry.sha256, `${entry.file} SHA-256`);
  return { ...entry, body };
}

async function main() {
  const { values } = parseArgs({
    options: {
      snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
      resources: { type: 'string' },
      'output-dir': { type: 'string', default: path.join(root, '../reports/wave/W0') },
      'build-dir': { type: 'string', default: path.join(root, '../build/wave/reference') },
      browser: { type: 'string', default: process.env.CHROME_PATH },
      revision: { type: 'string' },
    },
  });
  assert.ok(values.snapshot, 'Provide --snapshot <20221030-directory> or WAVE_SNAPSHOT');
  const reportDir = path.resolve(values['output-dir']);
  const buildDir = path.resolve(values['build-dir']);
  const reportPath = path.join(reportDir, 'reference.json');
  await mkdir(reportDir, { recursive: true });
  const report = { schemaVersion: 1, status: 'failed', node: process.version };
  try {
    let revision = values.revision ?? null;
    if (!revision) {
      try {
        revision = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        // The isolated source tree can run without Git metadata.
      }
    }
    report.revision = revision;
    report.source = await sourceIdentity();
    await writeFile(path.join(reportDir, 'revision.txt'), (revision ?? 'unavailable') + '\n');
    report.playwright = (
      await json(path.join(root, 'node_modules/playwright-core/package.json'))
    ).version;
    const manifest = await json(path.join(root, 'web/resources-20221030.json'));
    const fixture = await json(path.join(root, 'data/wire/20221030/bootstrap.json'));
    report.cutoffUtc = manifest.cutoffUtc;
    report.buildHash = manifest.buildHash;
    const inputs = await Promise.all(
      manifest.snapshot.map((entry) => checkedResource(values.snapshot, entry)),
    );
    report.snapshot = inputs.map(({ file, body }) => identity(file, body));
    const js = inputs.find(({ file }) => file === 'client.js').body;
    const wasm = inputs.find(({ file }) => file === 'client.wasm').body;
    assert.equal(hash(wasm), fixture.snapshotSha256);
    const source = js.toString('utf8');
    assert.match(source, /FILE ARCHIVED ON 21:00:58 Oct 30, 2022/);
    report.archiveFooter = '21:00:58 Oct 30, 2022';
    const evidenceRoot = path.join(root, 'data/evidence/20221030');
    const [sources, rules, videos, scenarios] = await Promise.all([
      json(path.join(evidenceRoot, 'sources.json')),
      json(path.join(evidenceRoot, 'rules.json')),
      json(path.join(evidenceRoot, 'video-observations.json')),
      json(path.join(root, 'tests/scenarios/garden-w0.json')),
    ]);
    report.evidence = checkEvidence({ sources, rules, videos, scenarios, manifest, wasm });
    for (const data of [
      fixture.discovery.response,
      fixture.socket.request,
      fixture.socket.response,
      fixture.transport,
    ]) {
      assert.match(data.hex, /^(?:[0-9a-f]{2})*$/);
      assert.equal(Buffer.from(data.hex, 'hex').length, data.length);
    }
    assert.deepEqual(
      JSON.parse(Buffer.from(fixture.discovery.response.hex, 'hex')),
      fixture.discovery.response.body,
    );

    await mkdir(buildDir, { recursive: true });
    const watPath = path.join(buildDir, 'client.wat');
    const disassembler = process.env.WASM_DIS || process.execPath;
    const disArgs = process.env.WASM_DIS
      ? []
      : [path.join(root, 'node_modules/binaryen/bin/wasm-dis')];
    report.disassembler = execFileSync(disassembler, [...disArgs, '--version'], {
      encoding: 'utf8',
    }).trim();
    await writeFile(path.join(reportDir, 'disassembler.txt'), report.disassembler + '\n');
    const wat = execFileSync(disassembler, [...disArgs, '-'], {
      input: wasm,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    await writeFile(watPath, wat);
    report.dispatch = checkDispatch(wat, source);
    const probe = probeGlue(source, wasm, fixture.transport);
    report.transport = probe.transport;
    const catalog = readCatalog(probe, source, wasm, fixture.transport);
    await writeFile(path.join(reportDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
    report.catalog = {
      file: 'catalog.json',
      petals: catalog.petalRegistry.entries.length - 1,
      petalRegistryRows: catalog.petalRegistry.entries.length,
      mobs: catalog.mobRegistry.entries.length,
    };

    const shell = await Promise.all(
      [
        ['/', 'index.html', 'text/html'],
        ['/reference.css', 'reference.css', 'text/css'],
      ].map(async ([url, file, contentType]) => ({
        url: origin + url,
        file,
        contentType,
        body: await readFile(path.join(root, 'web', file)),
      })),
    );
    report.shell = shell.map(({ file, body }) => identity(file, body));
    const localResources = new Map(
      [
        ...shell,
        ...inputs.map((resource) => ({
          ...resource,
          url: origin + '/' + resource.file,
        })),
      ].map((resource) => [resource.url, resource]),
    );
    const passes = [{ resources: localResources, output: path.join(reportDir, 'boot.png') }];
    if (values.resources) {
      const archive = await Promise.all(
        manifest.archive.map((entry) => checkedResource(values.resources, entry)),
      );
      report.archivedResources = archive.map(({ file, body }) => identity(file, body));
      passes.push({
        resources: new Map([...archive, ...inputs].map((resource) => [resource.url, resource])),
        output: path.join(reportDir, 'boot-archived-html.png'),
        archive: true,
      });
    } else {
      report.archivedResources = null;
    }
    report.bootstrap = await bootReference({ passes, executablePath: values.browser, fixture });
    report.blocker = fixture.blocker;
    for (const run of report.bootstrap) {
      const { events, state } = run;
      assert.ok(state.wasm && !state.error, `${run.page} client failed to initialize`);
      assert.ok(events.some((event) => event.event === 'console' && event.text === 'Initialized'));
      assert.ok(
        events.some(
          (event) => event.event === 'http-request' && event.url === fixture.discovery.url,
        ),
      );
      assert.ok(
        events.some((event) => event.event === 'socket-open' && event.url === fixture.socket.url),
      );
      assert.ok(
        events.some(
          (event) => event.event === 'socket-receive' && event.hex === fixture.socket.response.hex,
        ),
      );
      const firstFrame = events.find((event) => event.event === 'socket-send');
      assert.equal(firstFrame?.hex, fixture.socket.request.hex, `${run.page} first frame`);
      assert.equal(firstFrame?.binary, true);
      assert.ok(
        events.some(
          (event) =>
            event.event === 'console' && event.text === fixture.socket.response.expectedLog,
        ),
      );
      assert.ok(
        !events.some((event) => event.event === 'page-error'),
        `${run.page} uncaught browser error`,
      );
      if (run.page === 'archived-html') {
        assert.ok(state.ubuntuLoaded, 'Archived Ubuntu font did not load');
      }
    }

    report.status = 'passed';
    console.log(
      `W0 reference passed: 148 dispatch IDs, ${report.transport.observedHex}, ${report.bootstrap.length} Chromium startup path(s)`,
    );
  } catch (error) {
    report.failure = error.message;
    throw error;
  } finally {
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(reportPath);
  }
}

await main();
