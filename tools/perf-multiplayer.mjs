#!/usr/bin/env node
/**
 * Repeatable native multiplayer load harness. Bots speak the real v2 binary
 * protocol over real WebSockets; the server is the production binary with an
 * explicit test configuration. Reports raw tick samples, CPU/RSS and bounded
 * queue counters under reports/multiplayer/capacity/<runId>/.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, connect as tcpConnect } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { get } from 'node:http';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const binarySha256 = (await import('node:crypto'))
  .createHash('sha256')
  .update(await readFile('build/native/server/florr_server'))
  .digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return args[index + 1];
};
if (has('--help') || has('-h')) {
  console.log(`Usage: node tools/perf-multiplayer.mjs [options]

  --scenario NAME   minimal|capacity|battle|lifecycle|slow|soak|all (default capacity)
  --duration SEC    measured duration (scenario default; lifecycle ignores)
  --warmup SEC      warmup before measurement (scenario default)
  --players N       players per room (default by scenario)
  --rooms N         rooms (default by scenario)
  --cycles N        lifecycle cycles (default 100)
  --server FILE     native server binary (default build/native/server/florr_server)
  --out DIR         report directory (default reports/multiplayer/capacity/<runId>)
  --help            show this help`);
  process.exit(0);
}
const codec = await import(
  pathToFileURL(path.join(root, 'build/client/schema/multiplayer.js')).href
).catch(() => {
  throw new Error('Missing compiled client schema; run npm run build:client first');
});
const { encodeMessage, decodeMessage, CATALOG_HASH, CommandKind } = codec;
const serverBinary = path.resolve(value('--server', 'build/native/server/florr_server'));
const scenarioName = value('--scenario', 'capacity');
const scenarios = {
  minimal: {
    rooms: 1,
    players: 2,
    duration: 600,
    warmup: 30,
    title: '1 room x 2 players, 10 minutes',
  },
  capacity: {
    rooms: 2,
    players: 8,
    duration: 900,
    warmup: 60,
    title: '2 rooms x 8 players, 15 minutes',
  },
  battle: {
    rooms: 1,
    players: 8,
    duration: 300,
    warmup: 30,
    title: '8 players concentrated battle',
  },
  lifecycle: {
    rooms: 2,
    players: 8,
    duration: 0,
    warmup: 0,
    title: '100 connection/spawn/death/respawn cycles',
    cycles: 100,
  },
  slow: {
    rooms: 1,
    players: 8,
    duration: 120,
    warmup: 20,
    title: 'one blocked reader + 7 healthy players',
  },
  soak: {
    rooms: 2,
    players: 8,
    duration: 1800,
    warmup: 300,
    title: '2 rooms x 8 players, 30 minutes after 5 minute warmup',
  },
};
if (scenarioName !== 'all' && !scenarios[scenarioName]) {
  throw new Error(`Unknown scenario ${scenarioName}`);
}
const selected = scenarioName === 'all' ? Object.keys(scenarios) : [scenarioName];
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
const output = path.resolve(value('--out', path.join('reports/multiplayer/capacity', runId)));

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
function stats(values) {
  if (!values.length) {
    return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  return {
    count: values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}
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
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('error', reject);
    request.setTimeout(2000, () => request.destroy(new Error('metrics timeout')));
  });
}
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class NativeServer {
  constructor(config) {
    this.config = config;
    this.output = '';
  }
  async start() {
    this.port = await freePort();
    this.dir = await mkdtemp(path.join(os.tmpdir(), 'florr-perf-'));
    const template = JSON.parse(
      await readFile(path.join(root, 'server/config/default.json'), 'utf8'),
    );
    const { rooms, players, ...overrides } = this.config;
    const config = {
      ...template,
      ...overrides,
      initialMaxPlayersPerRoom: players,
      maxRooms: rooms,
      listenAddress: '127.0.0.1',
      listenPort: this.port,
      allowMissingOrigin: true,
      trustedProxies: [],
      allowedOrigins: [],
      maxConnections: Math.max(64, players * rooms + 16),
    };
    this.configPath = path.join(this.dir, 'server.json');
    await writeFile(this.configPath, JSON.stringify(config, null, 2) + '\n');
    const launch =
      process.platform === 'darwin' && existsSync('/usr/sbin/taskpolicy')
        ? {
            command: '/usr/sbin/taskpolicy',
            args: ['-t', '0', '-l', '0', serverBinary, '--config', this.configPath],
          }
        : { command: serverBinary, args: ['--config', this.configPath] };
    this.child = spawn(launch.command, launch.args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (bytes) => (this.output += bytes));
    this.child.stderr.on('data', (bytes) => (this.output += bytes));
    this.child.on('error', (error) => {
      this.output += `\nspawn error: ${error.message}`;
    });
    await waitFor(
      async () => (await fetchJson(`http://127.0.0.1:${this.port}/readyz`)).ready === true,
      10000,
      'server readiness',
    ).catch((error) => {
      throw new Error(`${error.message}\n${this.output}`);
    });
    return this;
  }
  metrics(detail = false) {
    return fetchJson(`http://127.0.0.1:${this.port}/metrics${detail ? '?detail=1' : ''}`);
  }
  async sample() {
    const at = Date.now();
    const metrics = await this.metrics();
    let cpuPercent = 0;
    const cpu = metrics.process?.cpuMicros;
    if (Number.isFinite(cpu) && Number.isFinite(this.lastCpu) && this.lastAt) {
      cpuPercent = ((cpu - this.lastCpu) / Math.max(1, (at - this.lastAt) * 1000)) * 100;
    }
    this.lastCpu = cpu;
    this.lastAt = at;
    return { at, metrics, process: { rssBytes: metrics.process?.rssBytes ?? 0, cpuPercent } };
  }
  async stop() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    this.child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => this.child.once('exit', resolve)), sleep(10000)]);
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGKILL');
    }
    await rm(this.dir, { recursive: true, force: true });
  }
}

class Bot {
  constructor({ port, room, nickname, index, mode = 'load', target = null }) {
    Object.assign(this, { port, room, nickname, index, mode, target });
    this.url = `ws://127.0.0.1:${port}/ws`;
    this.epoch = 0;
    this.playerId = 0;
    this.serverTick = 0;
    this.self = null;
    this.controlled = 0;
    this.snapshots = 0;
    this.bytes = 0;
    this.events = 0;
    this.hits = 0;
    this.decodeErrors = 0;
    this.inputSeq = 0;
    this.commandSeq = 0;
    this.closed = null;
    this.alive = false;
    this.inputs = 0;
    this.everAlive = false;
    this.deaths = 0;
    this.respawns = 0;
    this.lastSpawnTry = 0;
    this.autoRespawn = mode === 'load';
    this.owners = new Set();
  }
  send(type, value, epoch = this.epoch) {
    try {
      this.ws.send(encodeMessage({ type, sessionEpoch: epoch, value }));
    } catch (error) {
      this.decodeErrors++;
    }
  }
  sendSpawn() {
    if (!this.ws || this.ws.readyState !== 1) {
      return;
    }
    this.lastSpawnTry = Date.now();
    this.send(4, {
      commandSeq: ++this.commandSeq,
      kind: CommandKind.Spawn,
      lifeEpoch: this.self?.lifeEpoch ?? 0,
      slotA: 0,
      typeA: 0,
      slotB: 0,
      typeB: 0,
      text: this.nickname,
    });
  }
  suicide() {
    if (!this.self || this.self.life !== 1) {
      return;
    }
    this.send(4, {
      commandSeq: ++this.commandSeq,
      kind: CommandKind.Suicide,
      lifeEpoch: this.self.lifeEpoch,
      slotA: 0,
      typeA: 0,
      slotB: 0,
      typeB: 0,
      text: '',
    });
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (event) => this.onMessage(event));
    this.ws.addEventListener('close', (event) => {
      this.closed = { code: event.code, reason: event.reason };
      this.stopInput();
    });
    this.ws.addEventListener('error', () => {
      this.closed ??= { code: 0, reason: 'websocket error' };
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`bot ${this.nickname} open timeout`)), 8000);
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
          reject(new Error(`bot ${this.nickname} open failed`));
        },
        { once: true },
      );
    });
    this.send(
      1,
      { protocolVersion: 2, catalogHash: CATALOG_HASH, roomId: this.room, nickname: this.nickname },
      0,
    );
    await waitFor(() => this.epoch > 0, 8000, `bot ${this.nickname} welcome`);
    this.sendSpawn();
    if (this.mode === 'load') {
      await waitFor(() => this.alive, 12000, `bot ${this.nickname} spawn`);
    }
    return this;
  }
  onMessage(event) {
    const bytes = new Uint8Array(event.data);
    this.bytes += bytes.length;
    let message;
    try {
      message = decodeMessage(bytes);
    } catch {
      this.decodeErrors++;
      return;
    }
    if (!message) {
      this.decodeErrors++;
      return;
    }
    if (message.type === 2) {
      this.epoch = message.sessionEpoch;
      this.playerId = message.value.playerId;
      this.serverTick = message.value.serverTick;
    } else if (message.type === 6) {
      const snapshot = message.value;
      this.snapshots++;
      this.serverTick = snapshot.serverTick;
      this.self = snapshot.selfState;
      this.controlled = snapshot.controlledHandle;
      if (snapshot.selfState.life === 1) {
        if (!this.alive) {
          if (this.everAlive) {
            this.respawns++;
          }
          this.alive = true;
          this.everAlive = true;
          if (this.mode === 'load') {
            this.startInput();
          }
        }
      } else if (this.alive) {
        this.alive = false;
        this.deaths++;
      }
      this.events += snapshot.events.length;
      for (const item of snapshot.events) {
        if (item.kind === 1) {
          this.hits++;
        }
      }
      for (const entity of snapshot.entities) {
        if (entity.ownerPlayerId) {
          this.owners.add(entity.ownerPlayerId);
        }
      }
    } else if (message.type === 8) {
      this.send(
        9,
        {
          nonce: message.value.nonce,
          serverTick: message.value.serverTick,
          monotonicMs: message.value.monotonicMs,
          serverMonotonicMs: message.value.monotonicMs,
          serverTimeMs: 0,
        },
        message.sessionEpoch,
      );
    } else if (message.type === 10 || message.type === 11) {
      this.closed ??= { code: message.value.code, reason: message.value.message };
    }
  }
  startInput() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.input(), 50);
  }
  stopInput() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = undefined;
  }
  input() {
    if (!this.self || !this.ws || this.ws.readyState !== 1) {
      return;
    }
    if (this.self.life !== 1) {
      if (
        this.autoRespawn &&
        this.serverTick >= (this.self.nextSpawnTick ?? 0) &&
        Date.now() - this.lastSpawnTry > 1000
      ) {
        this.sendSpawn();
      }
      return;
    }
    let angle = (Date.now() / 1000 + this.index * 0.7) % (Math.PI * 2);
    if (this.target) {
      const dx = this.target.x - this.self.positionX,
        dy = this.target.y - this.self.positionY;
      angle = Math.atan2(dy, dx);
      if (Math.hypot(dx, dy) < 30) {
        angle = (Date.now() / 250 + this.index) % (Math.PI * 2);
      }
    }
    const buttons =
      this.mode === 'battle' ? (Math.floor(Date.now() / 600 + this.index) % 3 === 0 ? 1 : 2) : 0;
    const strength = this.mode === 'load' && process.env.M08_STILL === '1' ? 0 : 200;
    this.send(3, {
      inputSeq: ++this.inputSeq,
      lifeEpoch: this.self.lifeEpoch,
      targetTick: this.serverTick + 1,
      buttons,
      angle,
      strength,
    });
    this.inputs++;
  }
  async close() {
    this.stopInput();
    if (this.ws && this.ws.readyState <= 1) {
      this.ws.close();
    }
    await sleep(100);
  }
}

async function startBots(server, { rooms, players, mode = 'load', battle = false, skip = 0 }) {
  const bots = [];
  for (let roomIndex = 0; roomIndex < rooms; roomIndex++) {
    const room = roomIndex === 0 ? 'garden' : 'other';
    for (let index = 0; index < players - (roomIndex === 0 ? skip : 0); index++) {
      const bot = new Bot({
        port: server.port,
        room,
        nickname: `Bot-${roomIndex}-${index}`,
        index,
        mode,
        target: battle ? { x: 0, y: 0 } : null,
      });
      await bot.connect();
      bots.push(bot);
      await sleep(120);
    }
  }
  return bots;
}

async function runLoad(scenario, settings) {
  const server = await new NativeServer({
    rooms: settings.rooms,
    players: settings.players,
    reconnectGraceTicks: 200,
    emptyRoomTtlTicks: 400,
  }).start();
  const samples = [];
  let bots = [];
  try {
    bots = await startBots(server, {
      rooms: settings.rooms,
      players: settings.players,
      mode: settings.battle ? 'battle' : 'load',
      battle: settings.battle,
    });
    const warmupEnd = Date.now() + settings.warmup * 1000;
    while (Date.now() < warmupEnd) {
      await sleep(250);
    }
    const measureStart = Date.now();
    const startMetrics = await server.metrics();
    const startTick = startMetrics.ticks;
    const sampleTimer = setInterval(async () => {
      const sample = await server.sample().catch(() => null);
      if (sample) {
        samples.push({ ...sample, phase: 'measure' });
      }
    }, 5000);
    await sleep(settings.duration * 1000);
    clearInterval(sampleTimer);
    const detail = await server.metrics(true);
    const endMetrics = await server.metrics();
    const roomSamples = (detail.roomTickSamples ?? []).filter(([tick]) => tick >= startTick);
    const roundSamples = (detail.roundSamples ?? []).filter(([tick]) => tick >= startTick);
    const roomMicros = roomSamples.map(([, micros]) => micros);
    const roundMicros = roundSamples.map(([, micros]) => micros);
    const roomOver = roomSamples.filter(([, micros, cpu]) => micros > 50000 && (cpu ?? 0) >= 20000);
    const roundOver = roundSamples.filter(
      ([, micros, cpu]) => micros > 50000 && (cpu ?? 0) >= 20000,
    );
    const roomHostPauses = roomSamples.filter(
      ([, micros, cpu]) => micros > 50000 && (cpu ?? 0) < 20000,
    ).length;
    const roundHostPauses = roundSamples.filter(
      ([, micros, cpu]) => micros > 50000 && (cpu ?? 0) < 20000,
    ).length;
    const eventLoopMicros = (detail.eventLoopLagSamples ?? [])
      .filter(([tick]) => tick >= startTick)
      .map(([, micros]) => micros);
    const measured = samples.filter((sample) => sample.at >= measureStart);
    const rss = measured.map((sample) => sample.process?.rssBytes).filter(Number.isFinite);
    const cpu = measured.map((sample) => sample.process?.cpuPercent).filter(Number.isFinite);
    const report = {
      scenario: settings.name,
      title: settings.title,
      still: Boolean(process.env.M08_STILL),
      serverSha256: binarySha256,
      passed: false,
      durationSeconds: settings.duration,
      warmupSeconds: settings.warmup,
      startTick,
      endTick: endMetrics.ticks,
      players: bots.length,
      snapshots: bots.reduce((sum, bot) => sum + bot.snapshots, 0),
      botBytes: bots.reduce((sum, bot) => sum + bot.bytes, 0),
      botEvents: bots.reduce((sum, bot) => sum + bot.events, 0),
      botHits: bots.reduce((sum, bot) => sum + bot.hits, 0),
      botDecodeErrors: bots.reduce((sum, bot) => sum + bot.decodeErrors, 0),
      botInputs: bots.reduce((sum, bot) => sum + bot.inputs, 0),
      botClosed: bots.filter((bot) => bot.closed).length,
      botDeaths: bots.reduce((sum, bot) => sum + bot.deaths, 0),
      botRespawns: bots.reduce((sum, bot) => sum + bot.respawns, 0),
      roomTickMicros: stats(roomMicros),
      roundMicros: stats(roundMicros),
      eventLoopLagMicros: stats(eventLoopMicros),
      eventLoopLagMaxMicros: eventLoopMicros.length ? Math.max(...eventLoopMicros) : 0,
      roomTicksOver50ms: roomOver.length,
      roundsOver50ms: roundOver.length,
      roomHostPauses,
      roundHostPauses,
      eventLoopLagHostPauses: eventLoopMicros.filter((micros) => micros > 50000).length,
      cumulativeRoomTicksOver50ms: endMetrics.roomTicksOver50ms,
      cumulativeRoundsOver50ms: endMetrics.roundsOver50ms,
      overloads: endMetrics.overloads,
      maxEventLoopLagMs: endMetrics.maxEventLoopLagMs,
      snapshotBytes: endMetrics.snapshotBytes,
      snapshotMessages: endMetrics.snapshotMessages,
      bytesSent: endMetrics.bytesSent,
      maxQueuedWriteBytes: endMetrics.maxQueuedWriteBytes,
      maxRoomEntities: endMetrics.maxRoomEntities,
      maxRoomPlayers: endMetrics.maxRoomPlayers,
      finalEntities: endMetrics.entities,
      finalPlayers: endMetrics.players,
      finalRooms: endMetrics.rooms,
      rss: stats(rss),
      cpuPercent: stats(cpu),
      samples: measured.length,
      checks: [],
    };
    const check = (name, ok, detail) => {
      report.checks.push({ name, ok, detail });
      if (!ok) {
        report.passed = false;
      }
    };
    report.passed = true;
    check(
      'all bots spawned and stayed connected',
      bots.every((bot) => bot.everAlive && !bot.closed),
      `${bots.filter((bot) => bot.everAlive && !bot.closed).length}/${bots.length}`,
    );
    check('no bot decode errors', report.botDecodeErrors === 0, report.botDecodeErrors);
    check(
      'room tick p99 <= 20ms',
      report.roomTickMicros.p99 <= 20000,
      `${report.roomTickMicros.p99}us`,
    );
    check(
      'round p99 <= 25ms for two rooms',
      settings.rooms < 2 || report.roundMicros.p99 <= 25000,
      `${report.roundMicros.p99}us`,
    );
    check(
      'no room tick over 50ms (server CPU)',
      report.roomTicksOver50ms === 0,
      `${report.roomTicksOver50ms} (host pauses excluded: ${roomHostPauses})`,
    );
    check(
      'no round over 50ms (server CPU)',
      report.roundsOver50ms === 0,
      `${report.roundsOver50ms} (host pauses excluded: ${roundHostPauses})`,
    );
    check('write queue bounded', report.maxQueuedWriteBytes < 1048576, report.maxQueuedWriteBytes);
    check(
      'snapshot traffic observed',
      report.snapshotMessages > 0 && report.snapshotBytes > 0,
      `${report.snapshotMessages} messages`,
    );
    if (settings.battle) {
      check('real combat events observed', report.botHits > 0, report.botHits);
    }
    if (settings.soak) {
      const cutoff = measureStart + settings.duration * 1000;
      const early = samples
        .filter((sample) => sample.at < measureStart + 300000)
        .map((sample) => sample.process?.rssBytes)
        .filter(Number.isFinite);
      const late = samples
        .filter((sample) => sample.at >= cutoff - 300000)
        .map((sample) => sample.process?.rssBytes)
        .filter(Number.isFinite);
      const earlyMedian = early.length ? stats(early).p50 : 0,
        lateMedian = late.length ? stats(late).p50 : 0;
      report.rssFirst5m = stats(early);
      report.rssLast5m = stats(late);
      check(
        'RSS growth <= max(16MiB, first 10%)',
        lateMedian - earlyMedian <= Math.max(16 * 1024 * 1024, earlyMedian * 0.1),
        `${earlyMedian} -> ${lateMedian}`,
      );
      check(
        'entity count did not grow',
        report.finalEntities <= report.maxRoomEntities * (settings.rooms ?? 1),
        `${report.finalEntities}/${report.maxRoomEntities * (settings.rooms ?? 1)}`,
      );
    }
    report.passed = report.checks.every((entry) => entry.ok);
    return { report, detail, samples };
  } finally {
    for (const bot of bots) {
      await bot.close();
    }
    await server.stop();
  }
}

async function runLifecycle(settings) {
  const server = await new NativeServer({
    rooms: settings.rooms,
    players: settings.players,
    reconnectGraceTicks: 20,
    emptyRoomTtlTicks: 100,
  }).start();
  const cycles = Number(value('--cycles', settings.cycles));
  const workers = 4;
  const records = [];
  const startedAt = Date.now();
  try {
    const worker = async (index) => {
      for (let cycle = index; cycle < cycles; cycle += workers) {
        const bot = new Bot({
          port: server.port,
          room: cycle % 2 === 0 ? 'garden' : 'other',
          nickname: `Life-${String(cycle).padStart(3, '0')}`,
          index,
          mode: 'lifecycle',
        });
        await bot.connect();
        const identity = {
          playerId: bot.playerId,
          lifeEpoch: bot.self?.lifeEpoch ?? 1,
          handle: bot.controlled,
        };
        await waitFor(() => bot.alive, 12000, `lifecycle ${cycle} spawn`);
        identity.lifeEpoch = bot.self.lifeEpoch;
        identity.handle = bot.controlled;
        bot.suicide();
        await waitFor(() => bot.self && bot.self.life !== 1, 12000, `lifecycle ${cycle} death`);
        await waitFor(
          () => bot.serverTick >= bot.self.nextSpawnTick,
          8000,
          `lifecycle ${cycle} cooldown`,
        );
        bot.sendSpawn();
        await waitFor(
          () => bot.alive && bot.self.lifeEpoch > identity.lifeEpoch,
          12000,
          `lifecycle ${cycle} respawn`,
        );
        records.push({
          cycle,
          playerId: identity.playerId,
          firstLife: identity.lifeEpoch,
          secondLife: bot.self.lifeEpoch,
          firstHandle: identity.handle,
          secondHandle: bot.controlled,
          samePlayer: bot.playerId === identity.playerId,
        });
        await bot.close();
        await sleep(1200);
      }
    };
    await Promise.all(Array.from({ length: workers }, (_, index) => worker(index)));
    await sleep(8000);
    const final = await server.metrics();
    const report = {
      scenario: 'lifecycle',
      title: settings.title,
      passed: true,
      cycles,
      completed: records.length,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      samePlayer: records.every((record) => record.samePlayer),
      newLife: records.every((record) => record.secondLife > record.firstLife),
      finalPlayers: final.players,
      finalRooms: final.rooms,
      finalEntities: final.entities,
      joins: final.joins,
      leaves: final.leaves,
      teardowns: final.teardowns,
      resumes: final.resumes,
      checks: [],
    };
    const check = (name, ok, detail) => {
      report.checks.push({ name, ok, detail });
      if (!ok) {
        report.passed = false;
      }
    };
    check(
      '100 lifecycle cycles completed',
      report.completed === cycles,
      `${report.completed}/${cycles}`,
    );
    check('player identity preserved', report.samePlayer, report.samePlayer);
    check('new life epoch after respawn', report.newLife, report.newLife);
    check('no residual players', final.players === 0, final.players);
    check('no residual rooms', final.rooms === 0, final.rooms);
    return { report, detail: await server.metrics(true), samples: [] };
  } finally {
    await server.stop();
  }
}

function maskedFrame(payload, opcode = 0x2) {
  const mask = randomBytes(4),
    length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  const frame = Buffer.concat([header, mask, Buffer.from(payload)]);
  for (let i = 0; i < length; i++) {
    frame[header.length + 4 + i] ^= mask[i % 4];
  }
  return frame;
}
class SlowClient {
  async connect(port, room, nickname) {
    this.buffer = Buffer.alloc(0);
    this.handshaken = false;
    this.epoch = 0;
    this.closed = false;
    this.socket = await new Promise((resolve, reject) => {
      const socket = tcpConnect(port, '127.0.0.1', () => resolve(socket));
      socket.once('error', reject);
    });
    this.socket.on('error', () => {
      this.closed = true;
    });
    this.socket.on('close', () => {
      this.closed = true;
    });
    this.socket.on('data', (chunk) => this.onData(chunk));
    const key = randomBytes(16).toString('base64');
    this.socket.write(
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );
    await waitFor(() => this.handshaken, 5000, 'slow client handshake');
    this.send({
      type: 1,
      sessionEpoch: 0,
      value: { protocolVersion: 2, catalogHash: CATALOG_HASH, roomId: room, nickname },
    });
    await waitFor(() => this.epoch > 0, 5000, 'slow client welcome');
    this.send({
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
    });
    await sleep(500);
    // Stop reading the TCP socket. The server keeps encoding snapshots into
    // its bounded per-connection FIFO until it closes this peer.
    this.socket.pause();
    return this;
  }
  send(message) {
    if (!this.socket.destroyed) {
      this.socket.write(maskedFrame(encodeMessage(message)));
    }
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshaken) {
      const end = this.buffer.indexOf('\r\n\r\n');
      if (end < 0) {
        return;
      }
      const header = this.buffer.subarray(0, end).toString('latin1');
      if (!header.startsWith('HTTP/1.1 101')) {
        throw new Error(`slow client upgrade failed: ${header.slice(0, 80)}`);
      }
      this.buffer = this.buffer.subarray(end + 4);
      this.handshaken = true;
    }
    while (this.buffer.length >= 2) {
      const first = this.buffer[0],
        second = this.buffer[1];
      let offset = 2,
        length = second & 0x7f;
      if (length === 126) {
        if (this.buffer.length < 4) {
          return;
        }
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) {
          return;
        }
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (second & 0x80) !== 0;
      const maskOffset = offset;
      if (masked) {
        offset += 4;
      }
      if (this.buffer.length < offset + length) {
        return;
      }
      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(maskOffset, maskOffset + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }
      this.buffer = this.buffer.subarray(offset + length);
      const opcode = first & 0x0f;
      if (opcode === 0x9) {
        this.socket.write(maskedFrame(payload, 0xa));
        continue;
      }
      if (opcode !== 0x2) {
        continue;
      }
      const message = decodeMessage(new Uint8Array(payload));
      if (!message) {
        continue;
      }
      if (message.type === 2) {
        this.epoch = message.sessionEpoch;
      }
      if (message.type === 8) {
        this.send({
          type: 9,
          sessionEpoch: this.epoch,
          value: {
            nonce: message.value.nonce,
            serverTick: message.value.serverTick,
            monotonicMs: message.value.monotonicMs,
            serverMonotonicMs: message.value.monotonicMs,
            serverTimeMs: 0,
          },
        });
      }
    }
  }
  close() {
    try {
      this.socket?.destroy();
    } catch {
      /* ignore */
    }
  }
}

async function runSlow(settings) {
  const server = await new NativeServer({
    rooms: 1,
    players: settings.players,
    reconnectGraceTicks: 200,
    emptyRoomTtlTicks: 400,
    pongTimeoutMs: 120000,
    writeTimeoutMs: 60000,
  }).start();
  let bots = [],
    slow;
  try {
    bots = await startBots(server, { rooms: 1, players: settings.players - 1 });
    slow = await new SlowClient().connect(server.port, 'garden', 'Slow-Reader');
    const before = await server.metrics();
    const deadline = Date.now() + 120000;
    let after;
    while (Date.now() < deadline) {
      after = await server.metrics();
      if (
        after.closed.SLOW_CONSUMER > before.closed.SLOW_CONSUMER ||
        after.closed.TIMEOUT > before.closed.TIMEOUT
      ) {
        break;
      }
      await sleep(1000);
    }
    const healthyBefore = bots.reduce((sum, bot) => sum + bot.snapshots, 0);
    await sleep(10000);
    const healthyAfter = bots.reduce((sum, bot) => sum + bot.snapshots, 0);
    const final = await server.metrics();
    const report = {
      scenario: 'slow',
      title: settings.title,
      passed: true,
      slowClosed: (after?.closed.SLOW_CONSUMER ?? 0) > before.closed.SLOW_CONSUMER,
      slowTimedOut: (after?.closed.TIMEOUT ?? 0) > before.closed.TIMEOUT,
      healthySnapshotsBefore: healthyBefore,
      healthySnapshotsAfter: healthyAfter,
      healthyClosed: bots.filter((bot) => bot.closed).length,
      maxQueuedWriteBytes: final.maxQueuedWriteBytes,
      roomTickMicros: final.roomTickMicros,
      checks: [],
    };
    const check = (name, ok, detail) => {
      report.checks.push({ name, ok, detail });
      if (!ok) {
        report.passed = false;
      }
    };
    check(
      'blocked reader closed within bound',
      report.slowClosed || report.slowTimedOut,
      report.slowClosed ? 'SLOW_CONSUMER' : report.slowTimedOut ? 'TIMEOUT' : 'none',
    );
    check(
      'healthy players received more snapshots',
      healthyAfter > healthyBefore,
      `${healthyBefore} -> ${healthyAfter}`,
    );
    check('healthy players stayed connected', report.healthyClosed === 0, report.healthyClosed);
    check('write queue bounded', report.maxQueuedWriteBytes < 1048576, report.maxQueuedWriteBytes);
    return { report, detail: final, samples: [] };
  } finally {
    slow?.close();
    for (const bot of bots) {
      await bot.close();
    }
    await server.stop();
  }
}

async function execute(settings) {
  if (settings.name === 'lifecycle') {
    return runLifecycle(settings);
  }
  if (settings.name === 'slow') {
    return runSlow(settings);
  }
  const config = {
    ...settings,
    battle: settings.name === 'battle',
    soak: settings.name === 'soak',
  };
  return runLoad(config, config);
}

await mkdir(output, { recursive: true });
const summary = {
  schema: 1,
  runId,
  startedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  serverBinary,
  serverSha256: null,
  scenarios: [],
};
try {
  summary.serverSha256 = (await import('node:crypto'))
    .createHash('sha256')
    .update(await readFile(serverBinary))
    .digest('hex');
  for (const name of selected) {
    const base = scenarios[name];
    const settings = {
      ...base,
      name,
      rooms: Number(value('--rooms', base.rooms)),
      players: Number(value('--players', base.players)),
      duration: Number(value('--duration', base.duration)),
      warmup: Number(value('--warmup', base.warmup)),
    };
    console.error(`[perf] ${name}: ${settings.title}`);
    const result = await execute(settings);
    const folder = path.join(output, name);
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, 'report.json'),
      JSON.stringify(result.report, null, 2) + '\n',
    );
    await writeFile(
      path.join(folder, 'samples.jsonl'),
      result.samples
        .map((sample) =>
          JSON.stringify({
            at: sample.at,
            phase: sample.phase,
            metrics: sample.metrics,
            process: sample.process,
          }),
        )
        .join('\n') + (result.samples.length ? '\n' : ''),
    );
    if (result.detail.roomTickSamples || result.detail.roundSamples) {
      const start = result.report.startTick ?? 0;
      await writeFile(
        path.join(folder, 'tick-samples.json'),
        JSON.stringify({
          roomTickSamples: (result.detail.roomTickSamples ?? []).filter(([tick]) => tick >= start),
          roundSamples: (result.detail.roundSamples ?? []).filter(([tick]) => tick >= start),
          eventLoopLagSamples: (result.detail.eventLoopLagSamples ?? []).filter(
            ([tick]) => tick >= start,
          ),
        }) + '\n',
      );
    }
    summary.scenarios.push({
      name,
      passed: result.report.passed,
      report: path.relative(root, path.join(folder, 'report.json')),
    });
    console.log(
      JSON.stringify({ scenario: name, passed: result.report.passed, ...result.report }, null, 2),
    );
  }
  summary.passed = summary.scenarios.every((scenario) => scenario.passed);
} catch (error) {
  summary.passed = false;
  summary.error = error.stack ?? error.message;
  console.error(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  await writeFile(
    'reports/multiplayer/capacity/current.json',
    JSON.stringify(
      {
        runId,
        passed: summary.passed,
        generatedAt: summary.finishedAt,
        output: path.relative(root, output),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[perf] ${runId}: ${summary.passed ? 'PASS' : 'FAIL'} (${path.relative(root, output)})`,
  );
  if (!summary.passed) {
    process.exitCode = 1;
  }
}
