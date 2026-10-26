#!/usr/bin/env node
/**
 * Deterministic replay of the original sp_server.wasm in Node.
 *
 * Inputs are the `sp_server_send` packets recorded by the browser parity run
 * (tests/parity/golden/<scenario>/server.json). The replay interleaves sends and
 * 20 Hz ticks on the same virtual clock, flushes output after every tick, and
 * records packet hashes plus optional memory digests.
 *
 * Usage:
 *   node tools/parity/server-trace.mjs --all
 *   node tools/parity/server-trace.mjs --scenario garden-idle
 *   node tools/parity/server-trace.mjs --all --memory-every 25
 */
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { scenarios, scenarioByName } from './scenarios.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const root = path.resolve('.');
const goldenRoot = path.resolve(option('--golden', 'tests/parity/golden'));
const outputRoot = path.resolve(option('--out', 'tests/parity/server'));
const memoryEvery = Number(option('--memory-every', 25));
const dumpPackets = Number(option('--dump-packets', 0));
const seed0 = 0x6f6c6446;
const selected = flag('--all')
  ? scenarios
  : args.filter((value, index) => index > 0 && args[index - 1] === '--scenario').flatMap(name => [scenarioByName(name)]);
if (!selected.length) throw new Error('choose --scenario NAME or --all');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fnv = bytes => {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
};
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = text => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

async function createServer() {
  const wasm = await readFile(path.join(root, 'web/sp_server.wasm'));
  let instance;
  let clock = 0;
  let seed = seed0;
  let memory = null;
  let outgoing = [];
  const imports = {
    a: {
      a: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      b: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      c: (pointer, length) => respond(true, pointer, length),
      d: (pointer, length) => respond(false, pointer, length),
      e: () => { throw new WebAssembly.RuntimeError('OOM'); },
      f: () => { throw new WebAssembly.RuntimeError('abort'); },
      g: () => 0,
      h: (pointer) => { new DataView(memory.buffer).setUint32(pointer >>> 0, 0, true); return 0; },
      i: (countPointer, sizePointer) => {
        const view = new DataView(memory.buffer);
        view.setUint32(countPointer >>> 0, 0, true);
        view.setUint32(sizePointer >>> 0, 0, true);
        return 0;
      },
      j: (descriptor, vectors, count, writtenPointer) => {
        const view = new DataView(memory.buffer);
        let total = 0;
        for (let index = 0; index < count; index++) total += view.getUint32(vectors + index * 8 + 4, true);
        view.setUint32(writtenPointer >>> 0, total >>> 0, true);
        return 0;
      },
      k: () => 0,
      l: () => {},
      m: (target, start, length) => { new Uint8Array(memory.buffer).copyWithin(target, start, start + length); },
      n: (pointer, length) => {
        const bytes = new Uint8Array(memory.buffer);
        for (let index = 0; index < length; index++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          bytes[pointer + index] = seed & 255;
        }
        return 0;
      },
    },
  };
  function asmConst(address, signaturePointer, argumentsPointer) {
    const bytes = new Uint8Array(memory.buffer);
    const view = new DataView(memory.buffer);
    const values = [];
    let word = argumentsPointer >>> 2;
    let cursor = signaturePointer;
    let type;
    while ((type = bytes[cursor++])) {
      const isDouble = type < 105;
      if (isDouble && (word & 1)) word++;
      values.push(isDouble ? view.getFloat64(word * 4, true) : view.getInt32(word * 4, true));
      word += isDouble ? 2 : 1;
    }
    switch (address) {
      case 22600: return 0; // setInterval: the replay drives think explicitly
      case 22639: return 0; // no websocket events
      case 22791: return 1;
      case 22855: return values[0] ? clock : clock;
      case 22903: return values[0] % values[1];
      default: throw new Error(`unexpected host bridge ${address}`);
    }
  }
  function respond(final, pointer, length) {
    const bytes = pointer ? new Uint8Array(memory.buffer).slice(pointer, pointer + length) : new Uint8Array(0);
    outgoing.push({ final, length: bytes.length, hash: fnv(bytes), hex: bytes.length && bytes.length <= 8192 ? hex(bytes) : null });
  }
  ({ instance } = await WebAssembly.instantiate(wasm, imports));
  memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
  instance.exports.p();
  const api = {
    wasmSha256: sha256(wasm),
    exports: instance.exports,
    get memory() { return memory; },
    get clock() { return clock; },
    setClock(value) { clock = value; },
    flush() { outgoing = []; instance.exports.t(0, 0); return outgoing.splice(0); },
    init() {
      clock = 0;
      instance.exports.u(0, 0);
      return outgoing.splice(0);
    },
    send(bytes) {
      const pointer = instance.exports.q(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      instance.exports.w(pointer, bytes.length);
      instance.exports.r(pointer);
    },
    think(at) {
      clock = at;
      instance.exports.v();
      return api.flush();
    },
    memoryHash() { return sha256(new Uint8Array(memory.buffer)); },
  };
  return api;
}

async function replay(scenario) {
  const goldenFile = path.join(goldenRoot, scenario.name, 'server.json');
  const browser = JSON.parse(await readFile(goldenFile, 'utf8'));
  const sends = browser.messages.filter(message => message.funcName === 'sp_server_send' && message.dataHex)
    .map(message => ({ at: message.at, bytes: fromHex(message.dataHex), hash: message.hash }));
  const flushTimes = browser.messages.filter(message => message.funcName === 'sp_server_flush').map(message => message.at);
  const server = await createServer();
  const initial = server.init();
  const ticks = [];
  const events = [
    ...sends.map((send, index) => ({ kind: 'send', at: send.at, order: index, send })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  let eventIndex = 0;
  const maxTime = browser.messages.length ? Math.max(...browser.messages.map(message => message.at), 0) : 0;
  const lastTick = Math.floor(maxTime / 50) * 50;
  for (let at = 50; at <= lastTick; at += 50) {
    while (eventIndex < events.length && events[eventIndex].at <= at) {
      const event = events[eventIndex++];
      server.setClock(event.at);
      server.send(event.send.bytes);
    }
    const packets = server.think(at);
    // A tick whose output was never followed by a client flush is not visible in
    // the browser trace. The browser's rAF flush at the same timestamp runs
    // before the 50 ms interval think, so the comparison requires a strictly
    // later flush.
    const observable = flushTimes.some(time => time > at);
    const visible = packets.filter(packet => !packet.final);
    ticks.push({
      at,
      observable,
      packets: observable ? visible.map(packet => packet.hash) : [],
      ...(observable && ticks.length < dumpPackets ? { packetsHex: visible.map(packet => packet.hex) } : {}),
      finalCount: packets.filter(packet => packet.final).length,
      ...(memoryEvery > 0 && (at % (memoryEvery * 50) === 0) ? { memoryHash: server.memoryHash() } : {}),
    });
  }
  const browserPackets = browser.responses.filter(response => response.finalResponse === false).map(response => response.hash);
  const replayPackets = ticks.flatMap(tick => tick.packets);
  const match = browserPackets.length === replayPackets.length && browserPackets.every((value, index) => value === replayPackets[index]);
  const firstDifference = match ? null : (() => {
    for (let i = 0; i < Math.max(browserPackets.length, replayPackets.length); i++) {
      if (browserPackets[i] !== replayPackets[i]) return { index: i, browser: browserPackets[i] ?? null, replay: replayPackets[i] ?? null };
    }
    return null;
  })();
  return {
    scenario: scenario.name,
    wasmSha256: server.wasmSha256,
    inputs: sends.length,
    ticks: ticks.length,
    browserPackets: browserPackets.length,
    replayPackets: replayPackets.length,
    match,
    firstDifference,
    initial,
    trace: ticks,
  };
}

await mkdir(outputRoot, { recursive: true });
const report = { evidence: await evidence(), generatedAt: new Date().toISOString(), memoryEvery, scenarios: [], passed: true };
for (const scenario of selected) {
  const result = await replay(scenario);
  await writeFile(path.join(outputRoot, `${scenario.name}.json`), JSON.stringify(result) + '\n');
  report.scenarios.push({ scenario: scenario.name, match: result.match, inputs: result.inputs, ticks: result.ticks, browserPackets: result.browserPackets, replayPackets: result.replayPackets, firstDifference: result.firstDifference });
  if (!result.match) report.passed = false;
  console.log(JSON.stringify({ scenario: scenario.name, match: result.match, inputs: result.inputs, ticks: result.ticks, browserPackets: result.browserPackets, replayPackets: result.replayPackets, firstDifference: result.firstDifference }, null, 2));
}
await writeFile(path.join(outputRoot, selected.length === scenarios.length ? 'report.json' : 'report-partial.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.length }, null, 2));
if (!report.passed) process.exitCode = 1;
