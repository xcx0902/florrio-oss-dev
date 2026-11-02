#!/usr/bin/env node
/** Assemble the native deployment package from a verified multiplayer build. */
import { spawnSync } from 'node:child_process';
import { cp, mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('.');
const args = process.argv.slice(2);
const value = (name, fallback) => { const index = args.indexOf(name); if (index < 0) return fallback; if (!args[index + 1]) throw new Error(`${name} requires a value`); return args[index + 1]; };
if (args.includes('--help')) {
  console.log('Usage: node tools/pack-native.mjs [--skip-build] [--target linux-x86_64|darwin-arm64] [--out DIR] [--run-id ID]');
  process.exit(0);
}
const target = value('--target', process.platform === 'linux' ? 'linux-x86_64' : 'darwin-arm64');
const runId = value('--run-id', process.env.VERIFY_RUN_ID ?? new Date().toISOString().replaceAll(':', '-'));
if (!/^(linux-x86_64|linux-aarch64|darwin-arm64|darwin-x86_64)$/.test(target)) throw new Error(`Unsupported target ${target}`);
if (!args.includes('--skip-build')) {
  console.error('[pack] building multiplayer delivery');
  const build = spawnSync(process.execPath, ['tools/build-multiplayer.mjs'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('Multiplayer build failed');
}
const verify = spawnSync(process.execPath, ['tools/verify-multiplayer-dist.mjs'], { cwd: root, stdio: 'inherit' });
if (verify.status !== 0) throw new Error('Multiplayer delivery verification failed');
const manifest = JSON.parse(await readFile('dist-multiplayer/build-manifest.json', 'utf8'));
const version = manifest.server.version;
const source12 = manifest.source.sha256.slice(0, 12);
const output = path.resolve(value('--out', path.join('release/multiplayer', `${version}-${source12}-${runId}`)));
if (await stat(output).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) {
  if (!args.includes('--force')) throw new Error(`Package already exists: ${output}`);
  await rm(output, { recursive: true, force: true });
}
const staging = `${output}.stage-${process.pid}`;
await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true });
async function copy(from, to) { await mkdir(path.dirname(to), { recursive: true }); await cp(from, to, { recursive: true, dereference: true }); }
async function lines(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await lines(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
const files = [];
try {
  await copy('dist-multiplayer', path.join(staging, 'client'));
  await mkdir(path.join(staging, 'server'), { recursive: true });
  await cp('build/native/server/florr_server', path.join(staging, 'server/florr_server'));
  await cp('server/config/default.json', path.join(staging, 'server/config/default.json'));
  await copy('server/deploy', path.join(staging, 'server/deploy'));
  await copy('client/static/fonts/LICENCE.txt', path.join(staging, 'licenses/Ubuntu-Font-LICENCE.txt'));
  await writeFile(path.join(staging, 'THIRD_PARTY_NOTICES.md'), `# Third-party notices

- Boost 1.86.0 headers, Boost Software License 1.0: https://www.boost.org/LICENSE_1_0.txt
- Ubuntu Font Family, Ubuntu Font Licence 1.0: \`licenses/Ubuntu-Font-LICENCE.txt\`
- The native binary is statically linked against the C++ runtime and Boost headers as recorded in
  \`release-manifest.json\`; the exact dependency archive digest is part of the build identity.
`);
  await writeFile(path.join(staging, 'README.md'), `# Florr.io multiplayer deployment package

Version: \`${version}\`  
Target: \`${target}\`  
Source: \`${manifest.source.sha256}\`  
Protocol: \`${manifest.protocol.version}\` / catalog \`${manifest.protocol.catalogHash}\`

## Start

1. Copy \`server/config/default.json\` to \`/etc/florr/server.json\` and set \`listenPort\`,
   \`allowedOrigins\`, TLS termination and proxy trust for your deployment.
2. Serve \`client/\` from a static web server. The client requires an HTTP origin; it is never
   opened from \`file://\`.
3. Run \`server/florr_server --config /etc/florr/server.json\` under the supplied systemd unit.
4. Terminate TLS at nginx or Caddy using the examples in \`server/deploy/\`. Both \`/ws\` and
   \`/healthz\` must reach the native process; \`/metrics\` is internal-only and must not be exposed.

Do not serve \`server.wasm\`, \`server-worker.js\`, \`worker.js\`, \`local-worker.js\` or \`dev/\`:
this package contains none of them, and the online entry refuses to run without a network
server. Sessions are memory-only. A server restart interrupts live sessions; drain before
replacing the process. A client-only deployment is wire-compatible with the previous server
when the protocol version and catalog hash match. A server-only change is **not** backward
compatible: switch the client and server as a pair and keep the previous package for rollback.
`);
  const deployFiles = await lines(staging);
  for (const file of deployFiles) {
    const relative = path.relative(staging, file).split(path.sep).join('/');
    const bytes = await readFile(file);
    files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mode: (await stat(file)).mode & 0o777 });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const release = {
    schema: 1, name: 'florrio', version, target, buildId: runId,
    generatedAt: new Date().toISOString(),
    source: manifest.source, protocol: manifest.protocol,
    versions: manifest.versions,
    client: { entry: 'client/main.js', sourceEntry: manifest.client.entrySource, files: manifest.client.totals, manifestSha256: createHash('sha256').update(JSON.stringify(manifest.client.files)).digest('hex') },
    server: { path: 'server/florr_server', bytes: manifest.server.bytes, sha256: manifest.server.sha256,
      nativeSource: manifest.server.nativeSource, toolchain: manifest.server.toolchain, dependencies: manifest.server.dependencies },
    files,
    excludes: manifest.excludes,
    startup: { config: 'server/config/default.json', reverseProxy: ['server/deploy/nginx.conf', 'server/deploy/caddy.conf'], processManager: 'server/deploy/florr-server.service' },
    rollback: 'Keep the previous package and configuration. Drain the current process, switch the paired client and server artifacts, then start the previous package. Memory-only sessions cannot be resumed across a server restart.',
  };
  await writeFile(path.join(staging, 'release-manifest.json'), JSON.stringify(release, null, 2) + '\n');
  const sums = [...files, { path: 'release-manifest.json', sha256: createHash('sha256').update(await readFile(path.join(staging, 'release-manifest.json'))).digest('hex') }]
    .sort((a, b) => a.path.localeCompare(b.path)).map(entry => `${entry.sha256}  ${entry.path}`).join('\n') + '\n';
  await writeFile(path.join(staging, 'SHA256SUMS'), sums);
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { recursive: true, force: true });
  await cp(staging, output, { recursive: true });
  console.log(JSON.stringify({ package: path.relative(root, output), version, target, source: manifest.source.sha256,
    clientFiles: manifest.client.totals.files, releaseFiles: release.files.length, bytes: release.files.reduce((sum, entry) => sum + entry.bytes, 0) }, null, 2));
} finally { await rm(staging, { recursive: true, force: true }); }
