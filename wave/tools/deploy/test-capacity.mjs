import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startHost, defaultNative, root } from '../w2/host.mjs';
import { CaptureCodec, vu, f32, str, readVu } from '../w2/codec.mjs';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: defaultNative },
    players: { type: 'string', default: '32' },
    seconds: { type: 'string', default: '60' },
    ca: { type: 'string' },
    output: {
      type: 'string',
      default: path.resolve(root, '../reports/wave/preview/capacity.json'),
    },
  },
});
const tls = values.ca ? { ca: await readFile(values.ca) } : {};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const temporary = values.url ? null : await mkdtemp(path.join(tmpdir(), 'wave-capacity-'));
const host = values.url
  ? null
  : await startHost({
      snapshot: values.snapshot,
      nativeDir: values['native-dir'],
      port: 0,
      database: path.join(temporary, 'profiles.sqlite3'),
      environment: {
        WAVE_MAX_PLAYERS: values.players,
        WAVE_MAX_GUESTS: String(Math.max(8, Number(values.players))),
        WAVE_RECONNECT_SECONDS: '1',
      },
    });
const base = new URL(values.url ?? host.url);
function request(route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = (base.protocol === 'https:' ? https : http).get(
      new URL(route, base),
      { ...tls, agent: false, headers },
      (response) => {
        const parts = [];
        response.on('data', (part) => parts.push(part));
        response.on('end', () =>
          resolve({ status: response.statusCode, body: Buffer.concat(parts).toString() }),
        );
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });
}

function frame(opcode, input) {
  const payload = Buffer.from(input),
    mask = randomBytes(4);
  const head = Buffer.alloc(payload.length < 126 ? 2 : 4);
  head[0] = 0x80 | opcode;
  head[1] = 0x80 | (payload.length < 126 ? payload.length : 126);
  if (payload.length >= 126) {
    head.writeUInt16BE(payload.length, 2);
  }
  for (let i = 0; i < payload.length; ++i) {
    payload[i] ^= mask[i % 4];
  }
  return Buffer.concat([head, mask, payload]);
}

class WireClient {
  constructor(token) {
    this.token = token;
    this.sendCodec = new CaptureCodec(true);
    this.receiveCodec = new CaptureCodec();
    this.sequence = 2;
    this.frames = 0;
    this.bytes = 0;
    this.buffer = Buffer.alloc(0);
    this.errors = [];
  }
  async open() {
    const key = randomBytes(16).toString('base64');
    await new Promise((resolve, reject) => {
      const req = (base.protocol === 'https:' ? https : http).get(new URL('/wave/socket', base), {
        ...tls,
        headers: {
          Origin: base.origin,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': key,
        },
      });
      req.setTimeout(10000, () => req.destroy(new Error('Upgrade timeout')));
      req.on('response', (response) => {
        response.resume();
        reject(new Error(`Upgrade HTTP ${response.statusCode}`));
      });
      req.on('error', reject);
      req.on('upgrade', (response, socket, head) => {
        assert.equal(
          response.headers['sec-websocket-accept'],
          createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64'),
        );
        this.socket = socket;
        socket.on('error', (error) => this.errors.push(error.message));
        socket.on('data', (part) => this.consume(part));
        socket.on('close', () => {
          this.closed = true;
        });
        if (head.length) {
          this.consume(head);
        }
        this.send(
          Buffer.concat([
            Buffer.from([48]),
            str('b632797f0ee487dd99df460b13bde6d7ce5c9773'),
            str(this.token),
          ]),
        );
        resolve();
      });
    });
  }
  send(bytes) {
    this.socket.write(frame(2, bytes));
  }
  consume(part) {
    this.buffer = Buffer.concat([this.buffer, part]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 15;
      let size = this.buffer[1] & 127,
        offset = 2;
      if (size === 126) {
        if (this.buffer.length < 4) {
          return;
        }
        size = this.buffer.readUInt16BE(2);
        offset = 4;
      }
      if (size === 127) {
        if (this.buffer.length < 10) {
          return;
        }
        size = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      assert.ok(size <= 4 * 1024 * 1024, 'Bounded server frame');
      if (this.buffer.length < offset + size) {
        return;
      }
      const body = this.buffer.subarray(offset, offset + size);
      this.buffer = this.buffer.subarray(offset + size);
      if (opcode === 9) {
        this.socket.write(frame(10, body));
        continue;
      }
      if (opcode === 8) {
        this.closed = true;
        this.socket.end(frame(8, body));
        continue;
      }
      if (opcode !== 2) {
        continue;
      }
      ++this.frames;
      this.bytes += size;
      const plain = this.receiveCodec.decode(body);
      if (plain[0] === 1) {
        const cursor = { offset: 1 };
        this.epoch = readVu(plain, cursor);
        this.tick = readVu(plain, cursor);
        this.send(
          this.sendCodec.outer(Buffer.concat([Buffer.from([2]), vu(this.epoch), vu(this.tick)])),
        );
        if (!this.started) {
          this.started = true;
          this.send(
            this.sendCodec.seal(
              Buffer.concat([
                Buffer.from([1]),
                vu(this.epoch),
                vu(1),
                vu(13),
                Buffer.from([1]),
                str('capacity-test'),
                str(''),
                str(this.token),
                vu(2),
                vu(7),
                Buffer.from([1]),
              ]),
              2,
            ),
          );
        }
      } else if (plain[0] === 0) {
        this.errors.push('Server rejected session');
      }
    }
  }
  move() {
    if (this.closed || !this.started) {
      return;
    }
    this.send(
      this.sendCodec.seal(
        Buffer.concat([
          Buffer.from([1]),
          vu(this.epoch),
          vu(++this.sequence),
          vu(9),
          vu(1),
          f32(0),
          f32(0),
        ]),
        2,
      ),
    );
  }
  close() {
    this.socket?.destroy();
  }
}

const clients = [],
  samples = [];
let movement;
try {
  for (const route of ['/wave/dev/inventory/' + 'a'.repeat(64), '/wave/test/state', '/dev.js']) {
    assert.equal(
      (await request(route)).status,
      404,
      'Production host omits debug and fixture routes',
    );
  }
  const forbidden = await request('/wave/socket', {
    Origin: 'https://untrusted.invalid',
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
  });
  assert.equal(forbidden.status, 403, 'Unlisted origins are rejected');
  // More visitors than the configured member cache must not exhaust it.
  if (host) {
    for (let i = 0; i < Math.max(8, Number(values.players)) + 8; ++i) {
      const profile = JSON.parse((await request('/wave/cache/')).body);
      const c = new WireClient(profile.token);
      await c.open();
      const until = Date.now() + 5000;
      while (c.frames < 4 && !c.closed && Date.now() < until) {
        await delay(10);
      }
      assert.ok(
        c.frames >= 4 && !c.closed,
        `Admission churn remains playable: ${JSON.stringify({ iteration: i, frames: c.frames, closed: c.closed, errors: c.errors })}`,
      );
      c.close();
      await delay(60);
    }
    await delay(2100);
  }
  const count = Number(values.players);
  for (let i = 0; i < count; ++i) {
    const profile = await request('/wave/cache/');
    assert.equal(profile.status, 200);
    const c = new WireClient(JSON.parse(profile.body).token);
    clients.push(c);
    await c.open();
    await delay(35);
  }
  const overflow = await request('/wave/socket', {
    Origin: base.origin,
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
  });
  assert.equal(overflow.status, 503, 'Full host returns explicit overload response');
  movement = setInterval(() => clients.forEach((c) => c.move()), 100);
  console.log(`Holding ${count} real protocol sessions for ${values.seconds}s at ${base.origin}`);
  for (let i = 0; i < Number(values.seconds); ++i) {
    await delay(1000);
    const health = JSON.parse((await request('/healthz')).body);
    assert.equal(health.players, count);
    assert.ok(
      clients.every((c) => !c.closed && c.errors.length === 0),
      'Every admitted client stays connected',
    );
    samples.push(health);
  }
  clearInterval(movement);
  assert.ok(
    clients.every((c) => c.frames > 20),
    'Every client receives live snapshots',
  );
  const report = {
    status: 'passed',
    url: base.origin,
    players: count,
    durationSeconds: Number(values.seconds),
    samples,
    clients: clients.map((c) => ({ frames: c.frames, bytes: c.bytes, errors: c.errors })),
    checks: [
      'debug routes absent',
      'origin rejected',
      'overflow 503',
      'live protocol and ACKs',
      ...(host ? ['guest churn beyond cache capacity'] : []),
    ],
  };
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      players: count,
      maxStepMs: Math.max(...samples.map((s) => s.maxStepMs)),
      report: values.output,
    }),
  );
} finally {
  clearInterval(movement);
  clients.forEach((c) => c.close());
  await host?.stop();
  if (temporary) {
    await rm(temporary, { recursive: true, force: true });
  }
}
