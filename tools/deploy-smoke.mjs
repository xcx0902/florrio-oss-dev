#!/usr/bin/env node
/**
 * Process-level deployment smoke for the native package: start, drain, proxy
 * switch, rollback and a fresh client session at every step. This exercises the
 * same binary and configuration shipped in the package; nginx/Caddy are
 * configuration examples, not compiled dependencies.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, connect as tcpConnect } from 'node:net';
import { get } from 'node:http';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  if (!args[index + 1]) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const codec = await import(
  pathToFileURL(path.join(root, 'build/client/schema/multiplayer.js')).href
);
const { encodeMessage, decodeMessage, CATALOG_HASH, CommandKind } = codec;
const packageDir = path.resolve(
  value(
    '--package',
    await (async () => {
      const { readdir } = await import('node:fs/promises');
      const entries = (
        await readdir('release/multiplayer', { withFileTypes: true }).catch(() => [])
      ).filter((entry) => entry.isDirectory() && !entry.name.includes('.stage-'));
      if (!entries.length) {
        throw new Error('No native package; run npm run pack:native first');
      }
      const packages = await Promise.all(
        entries.map(async (entry) => ({
          name: entry.name,
          mtime: (await stat(path.join('release/multiplayer', entry.name))).mtimeMs,
        })),
      );
      packages.sort((left, right) => right.mtime - left.mtime);
      return path.join('release/multiplayer', packages[0].name);
    })(),
  ),
);
const manifest = JSON.parse(await readFile(path.join(packageDir, 'release-manifest.json'), 'utf8'));
const binary = path.join(packageDir, 'server/florr_server');
const serverBytes = await readFile(binary);
if (createHash('sha256').update(serverBytes).digest('hex') !== manifest.server.sha256) {
  throw new Error('Package server hash mismatch');
}
const baseConfig = JSON.parse(
  await readFile(path.join(packageDir, 'server/config/default.json'), 'utf8'),
);

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}
function httpJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = get({ host: '127.0.0.1', port, path: pathname, timeout: 1000 }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('timeout')));
  });
}
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) {
        return true;
      }
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
class Server {
  constructor(name) {
    this.name = name;
  }
  async start(port) {
    this.port = port ?? (await freePort());
    this.dir = await mkdtemp(path.join(os.tmpdir(), 'florr-deploy-'));
    const config = {
      ...baseConfig,
      listenAddress: '127.0.0.1',
      listenPort: this.port,
      allowMissingOrigin: true,
      allowedOrigins: [],
      trustedProxies: [],
      shutdownDrainMs: 1000,
      closeTimeoutMs: 1000,
      maxRooms: 2,
      initialMaxPlayersPerRoom: 8,
    };
    this.configPath = path.join(this.dir, 'server.json');
    await writeFile(this.configPath, JSON.stringify(config, null, 2) + '\n');
    this.output = '';
    this.child = spawn(binary, ['--config', this.configPath], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (bytes) => (this.output += bytes));
    this.child.stderr.on('data', (bytes) => (this.output += bytes));
    await waitFor(
      async () => (await httpJson(this.port, '/readyz')).status === 200,
      10000,
      `${this.name} ready`,
    ).catch((error) => {
      throw new Error(`${error.message}\n${this.output}`);
    });
    return this;
  }
  async ready() {
    return (await httpJson(this.port, '/readyz')).status === 200;
  }
  async stop() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
      return this.child?.exitCode;
    }
    this.child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => this.child.once('exit', resolve)), sleep(8000)]);
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGKILL');
    }
    return this.child.exitCode;
  }
  async cleanup() {
    await this.stop();
    await rm(this.dir, { recursive: true, force: true });
  }
}
class Bot {
  async connect(port, nickname = 'DeployBot') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.binaryType = 'arraybuffer';
    this.epoch = 0;
    this.life = 0;
    this.snapshots = 0;
    this.ws.addEventListener('message', (event) => {
      const message = decodeMessage(new Uint8Array(event.data));
      if (!message) {
        return;
      }
      if (message.type === 2) {
        this.epoch = message.sessionEpoch;
      }
      if (message.type === 6) {
        this.snapshots++;
        this.life = message.value.selfState.life;
      }
      if (message.type === 8) {
        this.ws.send(
          encodeMessage({
            type: 9,
            sessionEpoch: this.epoch,
            value: {
              nonce: message.value.nonce,
              serverTick: message.value.serverTick,
              monotonicMs: message.value.monotonicMs,
              serverMonotonicMs: message.value.monotonicMs,
              serverTimeMs: 0,
            },
          }),
        );
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bot open timeout')), 5000);
      this.ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      this.ws.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('bot open failed'));
        },
        { once: true },
      );
    });
    this.ws.send(
      encodeMessage({
        type: 1,
        sessionEpoch: 0,
        value: { protocolVersion: 2, catalogHash: CATALOG_HASH, roomId: 'garden', nickname },
      }),
    );
    await waitFor(() => this.epoch > 0, 5000, 'bot welcome');
    await sleep(100);
    this.ws.send(
      encodeMessage({
        type: 4,
        sessionEpoch: this.epoch,
        value: {
          commandSeq: 1,
          kind: CommandKind.Spawn,
          lifeEpoch: 0,
          slotA: 0,
          typeA: 0,
          slotB: 0,
          typeB: 0,
          text: nickname,
        },
      }),
    );
    await waitFor(() => this.life === 1 && this.snapshots > 0, 10000, 'bot spawn');
    return this;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
class SwitchProxy {
  async start(upstreamPort) {
    this.upstream = upstreamPort;
    this.sockets = new Set();
    this.server = createServer((client) => {
      const upstream = tcpConnect(this.upstream, '127.0.0.1');
      this.sockets.add(client);
      this.sockets.add(upstream);
      client.pipe(upstream);
      upstream.pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
        this.sockets.delete(client);
        this.sockets.delete(upstream);
      };
      client.on('error', close);
      upstream.on('error', close);
      client.on('close', close);
      upstream.on('close', close);
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
    return this;
  }
  switchTo(port) {
    this.upstream = port;
  }
  async close() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => this.server.close(resolve));
  }
}

const started = new Date().toISOString();
const checks = [];
const servers = [];
let proxy;
const check = (name, ok, detail) => checks.push({ name, ok, detail });
try {
  const old = await new Server('old').start();
  servers.push(old);
  const fresh = await new Server('new').start();
  servers.push(fresh);
  const oldBot = await new Bot().connect(old.port, 'OldClient');
  check('old package starts and accepts a native session', oldBot.life === 1, {
    port: old.port,
    snapshots: oldBot.snapshots,
  });
  const drain = old.stop();
  await waitFor(
    async () => (await httpJson(old.port, '/readyz')).status === 503,
    3000,
    'drain readiness',
  );
  check('SIGTERM makes /readyz fail before exit', true, 503);
  const oldExit = await drain;
  check('drain exits cleanly', oldExit === 0, oldExit);
  oldBot.close();
  const newBot = await new Bot().connect(fresh.port, 'NewClient');
  check('replacement package accepts a fresh session', newBot.life === 1, {
    port: fresh.port,
    snapshots: newBot.snapshots,
  });
  newBot.close();
  const rollback = await new Server('rollback').start();
  servers.push(rollback);
  proxy = await new SwitchProxy().start(fresh.port);
  const viaProxy = await new Bot().connect(proxy.port, 'ProxyReplacement');
  check('reverse-proxy style switch reaches replacement package', viaProxy.life === 1, proxy.port);
  proxy.switchTo(rollback.port);
  const viaNew = await new Bot().connect(proxy.port, 'ProxyRollback');
  check('new connections switch to rollback without restart', viaNew.life === 1, {
    upstream: rollback.port,
  });
  viaProxy.close();
  viaNew.close();
  const rollbackBot = await new Bot().connect(proxy.port, 'RollbackClient');
  check('rollback package accepts a fresh session', rollbackBot.life === 1, {
    port: rollback.port,
  });
  rollbackBot.close();
  check(
    'all sessions are fresh native v2 sessions',
    [oldBot, newBot, viaProxy, viaNew, rollbackBot].every(
      (bot) => bot.epoch > 0 && bot.snapshots > 0,
    ),
    true,
  );
} catch (error) {
  check('deployment smoke completed', false, error.stack ?? error.message);
} finally {
  await proxy?.close();
  const exits = [];
  for (const server of servers) {
    exits.push(await server.cleanup());
  }
  const report = {
    schema: 1,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    package: path.relative(root, packageDir),
    version: manifest.version,
    target: manifest.target,
    serverSha256: manifest.server.sha256,
    checks,
    passed: checks.length > 0 && checks.every((entry) => entry.ok),
    exits,
  };
  await (await import('node:fs/promises')).mkdir('reports/multiplayer', { recursive: true });
  await writeFile('reports/multiplayer/deploy-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        checks,
        package: report.package,
        version: report.version,
        target: report.target,
      },
      null,
      2,
    ),
  );
  if (!report.passed) {
    process.exitCode = 1;
  }
}
