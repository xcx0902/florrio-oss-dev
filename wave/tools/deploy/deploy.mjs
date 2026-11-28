import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { values } = parseArgs({
  options: {
    snapshot: {
      type: 'string',
      default: process.env.WAVE_SNAPSHOT ?? path.join(repo, 'wave-reference/20221030'),
    },
    'native-dir': {
      type: 'string',
      default: process.env.WAVE_NATIVE_DIR ?? path.join(repo, 'build/wave/native'),
    },
    url: { type: 'string', default: 'https://preview.florriowave.xcx0902.dpdns.org:18443/' },
    jobs: { type: 'string', default: '6' },
    'prepare-only': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run deploy:wave -- [options]
  --snapshot PATH    Original 20221030 snapshot (or WAVE_SNAPSHOT)
  --native-dir PATH  CMake build directory (or WAVE_NATIVE_DIR)
  --jobs N           Build parallelism (default: 6)
  --url URL          Public origin for post-deploy verification
  --prepare-only     Build, test and assemble without changing the live service
  --dry-run          Print the deployment plan without writing files

Deploys the current workspace, including uncommitted changes. Requires macOS,
CMake, C++20, Python 3, SQLite3 and the existing Caddy public service.
The backend restarts gracefully; committed saves are preserved. Caddy stays up.`);
  process.exit(0);
}
if (!/^[1-9]\d*$/.test(values.jobs)) {
  throw new Error('--jobs must be a positive integer');
}
const origin = new URL(values.url);
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
) {
  throw new Error('--url must be an HTTP(S) origin, e.g. https://example.com:18443/');
}
const nativeDir = path.resolve(values['native-dir']);
const snapshot = path.resolve(values.snapshot);
const preview = path.join(repo, 'build/wave/preview');
const run = async (command, args) => {
  console.log(`> ${command} ${args.join(' ')}`);
  const child = spawn(command, args, { cwd: repo, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)),
    );
  });
};
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Cannot determine workspace revision');
  }
  return result.stdout.trim();
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

console.log(`Wave deploy: current workspace → ${origin.origin}
1. Configure and build Release; run native CTest and deployment recovery tests.
2. Verify the original client hashes and assemble a fresh release directory.
3. Stage files, drain the backend, back up SQLite, install and restart launchd.
4. Verify backend health and public health/resources; record the release.
Backend startup failures restore the previous program, web files and launchd config.`);
if (values['dry-run']) {
  process.exit(0);
}
if (process.platform !== 'darwin' && !values['prepare-only']) {
  throw new Error('Live deployment requires macOS launchd; use --prepare-only elsewhere');
}
await mkdir(preview, { recursive: true });
const lock = path.join(preview, '.deploy.lock');
await mkdir(lock);
try {
  await run('cmake', [
    '-S',
    'wave',
    '-B',
    nativeDir,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DWAVE_BUILD_HOST=ON',
    '-DBUILD_TESTING=ON',
  ]);
  await run('cmake', ['--build', nativeDir, '--config', 'Release', '--parallel', values.jobs]);
  await run('ctest', [
    '--test-dir',
    nativeDir,
    '-C',
    'Release',
    '--output-on-failure',
    '--no-tests=error',
  ]);
  await run(process.execPath, ['--test', 'wave/tools/deploy/install-backend-macos.test.mjs']);
  const releases = path.join(preview, 'releases');
  await mkdir(releases, { recursive: true });
  const release = await mkdtemp(
    path.join(releases, new Date().toISOString().replaceAll(':', '-') + '-'),
  );
  await run(process.execPath, [
    'wave/tools/deploy/serve.mjs',
    '--assemble-only',
    '--snapshot',
    snapshot,
    '--native-dir',
    nativeDir,
    '--web-root',
    path.join(release, 'web'),
  ]);
  await cp(path.join(nativeDir, 'wave_host'), path.join(release, 'wave_host'));
  const checksums = {};
  for (const file of [
    'wave_host',
    'web/local.js',
    'web/index.html',
    'web/client.js',
    'web/client.wasm',
  ]) {
    checksums[file] = hash(await readFile(path.join(release, file)));
  }
  const metadata = {
    id: path.basename(release),
    preparedAt: new Date().toISOString(),
    gitRevision: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    checksums,
  };
  const metadataFile = path.join(release, 'release.json');
  await writeFile(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
  if (values['prepare-only']) {
    console.log(`Prepared release (live service unchanged): ${release}`);
  } else {
    await run(process.execPath, [
      'wave/tools/deploy/install-backend-macos.mjs',
      '--native-dir',
      release,
      '--web-root',
      path.join(release, 'web'),
      '--metadata',
      metadataFile,
    ]);
    // A public routing/TLS failure must not roll back a healthy backend or saves.
    try {
      const response = await fetch(new URL('/healthz', origin), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || (await response.json()).status !== 'ok') {
        throw new Error('Public /healthz is unhealthy');
      }
      for (const file of ['local.js', 'index.html']) {
        const response = await fetch(new URL(file === 'index.html' ? '/' : '/' + file, origin), {
          signal: AbortSignal.timeout(15000),
        });
        if (
          !response.ok ||
          hash(Buffer.from(await response.arrayBuffer())) !== checksums['web/' + file]
        ) {
          throw new Error(`Public ${file} differs from the prepared release`);
        }
      }
    } catch (error) {
      throw new Error(
        `Backend installed, but public verification failed: ${error.message}. Inspect Caddy/DNS/network; release: ${release}`,
        { cause: error },
      );
    }
    await writeFile(
      path.join(preview, 'last-deploy.json'),
      JSON.stringify(
        { ...metadata, deployedAt: new Date().toISOString(), url: origin.origin, release },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Published ${metadata.id} (${metadata.gitRevision.slice(0, 12)}${metadata.dirty ? ', dirty workspace' : ''}): ${origin.origin}/`,
    );
  }
} finally {
  await rm(lock, { recursive: true, force: true });
}
