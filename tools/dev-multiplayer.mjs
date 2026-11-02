#!/usr/bin/env node
/**
 * Start the paired native server and online-only client for local play.
 * The runner owns only the processes it starts and removes its temporary
 * configuration on every exit path.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = name => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
};
if (has('--help') || has('-h')) {
  console.log(`Usage: node tools/dev-multiplayer.mjs [options]

  --root DIR          online delivery tree (default dist-multiplayer)
  --server FILE       native server binary (default build/native/server/florr_server)
  --port N            HTTP port (default 8477; occupied ports advance)
  --game-port N       WebSocket port (default 8787; occupied ports advance)
  --players N         initial players per room (default 2, max 8)
  --rooms N           maximum rooms (default 2)
  --open              open the browser after startup
  --check             validate inputs only; do not start processes
  --help              show this help

This starts the production online client (no Worker/WASM fallback).`);
  process.exit(0);
}

const configuredRoot = path.resolve(value('--root', 'dist-multiplayer'));
const serverBinary = path.resolve(value('--server', 'build/native/server/florr_server'));
const requestedPort = Number(value('--port', 8477));
const requestedGamePort = Number(value('--game-port', 8787));
const players = Number(value('--players', 2));
const rooms = Number(value('--rooms', 2));
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('invalid --port');
if (!Number.isInteger(requestedGamePort) || requestedGamePort < 1 || requestedGamePort > 65535) throw new Error('invalid --game-port');
if (!Number.isInteger(players) || players < 1 || players > 8) throw new Error('--players must be 1..8');
if (!Number.isInteger(rooms) || rooms < 1 || rooms > 64) throw new Error('--rooms must be 1..64');

async function portAvailable(port) {
  return new Promise(resolve => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
async function nextPort(start) {
  for (let port = start; port <= Math.min(65535, start + 100); port++) if (await portAvailable(port)) return port;
  throw new Error(`No free port near ${start}`);
}
async function probeHealth(url, predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise(resolve => {
      const request = get(url, response => { let body = ''; response.on('data', chunk => body += chunk); response.on('end', () => resolve(response.statusCode === 200 && predicate(body))); });
      request.once('error', () => resolve(false));
      request.setTimeout(500, () => { request.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

const check = {
  root: configuredRoot,
  server: serverBinary,
  players,
  rooms,
  platform: `${process.platform}-${process.arch}`,
};
try {
  await readFile(path.join(configuredRoot, 'index.html'));
  await readFile(path.join(configuredRoot, 'build-manifest.json'));
  check.client = 'ok';
} catch { throw new Error(`Missing online delivery at ${configuredRoot}; run npm run build:multiplayer`); }
try { await readFile(serverBinary); check.native = 'ok'; }
catch { throw new Error(`Missing native server at ${serverBinary}; run npm run build:server`); }
if (has('--check')) {
  console.log(JSON.stringify({ ok: true, ...check }, null, 2));
  process.exit(0);
}

const webPort = await nextPort(requestedPort);
const gamePort = await nextPort(requestedGamePort);
const scratch = await mkdtemp(path.join(os.tmpdir(), 'florr-dev-'));
const configPath = path.join(scratch, 'server.json');
const template = JSON.parse(await readFile(path.join(root, 'server/config/default.json'), 'utf8'));
const config = {
  ...template,
  listenAddress: '127.0.0.1', listenPort: gamePort,
  initialMaxPlayersPerRoom: players, maxRooms: rooms,
  maxConnections: Math.max(64, players * rooms + 8),
  allowedOrigins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`],
  allowMissingOrigin: false, trustedProxies: [],
  shutdownDrainMs: 2000, closeTimeoutMs: 1000, emptyRoomTtlTicks: 400,
};
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
const children = [];
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}
async function fail(message) {
  stop();
  await rm(scratch, { recursive: true, force: true });
  console.error(`dev-multiplayer: ${message}`);
  process.exit(1);
}
function watch(child, name) {
  child.once('exit', (code, signal) => {
    if (!stopping) void fail(`${name} exited unexpectedly (${code ?? signal})`);
  });
  child.once('error', error => { if (!stopping) void fail(`${name}: ${error.message}`); });
}
const server = spawn(serverBinary, ['--config', configPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(server);
let serverOutput = '';
server.stdout.on('data', bytes => { serverOutput += bytes; process.stdout.write(bytes); });
server.stderr.on('data', bytes => { serverOutput += bytes; process.stderr.write(bytes); });
watch(server, 'native server');
const ready = await probeHealth(`http://127.0.0.1:${gamePort}/readyz`, body => body.includes('"ready":true'), 10000);
if (!ready) await fail(`native server did not become ready: ${serverOutput.trim().slice(-800)}`);
const web = spawn(process.execPath, [path.join(root, 'serve.mjs'), '--root', configuredRoot, '--server', `ws://127.0.0.1:${gamePort}/ws`, '--port', String(webPort), '--no-open'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(web);
let webOutput = '';
web.stdout.on('data', bytes => { webOutput += bytes; process.stdout.write(bytes); });
web.stderr.on('data', bytes => { webOutput += bytes; process.stderr.write(bytes); });
watch(web, 'static server');
const webReady = await probeHealth(`http://127.0.0.1:${webPort}/`, body => body.includes('florr.io'), 10000);
if (!webReady) await fail(`static server did not become ready: ${webOutput.trim().slice(-800)}`);
if (has('--open')) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(command, [`http://127.0.0.1:${webPort}/`], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
}
console.log(JSON.stringify({ event: 'ready', url: `http://127.0.0.1:${webPort}/`, websocket: `ws://127.0.0.1:${gamePort}/ws`, players, rooms, pid: process.pid }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop(signal); });
await Promise.all(children.map(child => new Promise(resolve => child.once('exit', resolve))));
await rm(scratch, { recursive: true, force: true });
