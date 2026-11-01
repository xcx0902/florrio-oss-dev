import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { NetworkTransport } from '../../../build/client/net/websocket.js';
import { connectionConfig } from '../../../build/client/net/connection-config.js';
import { decodeMessage, encodeMessage, CommandKind, ErrorCode, LIMITS, ResultCode } from '../../../build/client/schema/multiplayer.js';
import { welcome, snapshot, selfState } from '../support/multiplayer.mjs';
const config = connectionConfig({}, 'http://localhost:8477/');
class Socket {
  readyState = 0; bufferedAmount = 0; sent = [];
  send(bytes) { this.sent.push(decodeMessage(bytes, true)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(type, value, epoch = welcome.sessionEpoch) { const bytes = encodeMessage({ type, value, sessionEpoch: epoch }); this.onmessage?.({ data: bytes.buffer }); }
}
function setup(options = {}) {
  const sockets = [], statuses = [], values = [], records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
  const network = new NetworkTransport(config, { socket: () => { const socket = new Socket(); sockets.push(socket); return socket; }, storage, ...options });
  network.onClose(status => statuses.push(status)); network.onSnapshot(value => values.push(value));
  return { network, sockets, statuses, values, records };
}
async function connected(h, self = selfState()) {
  const ready = h.network.connect('Alice'); const socket = h.sockets.at(-1); socket.open();
  assert.equal(h.network.state, 'handshaking'); assert.equal(socket.sent[0].type, 1);
  socket.receive(2, welcome); socket.receive(6, snapshot({ selfState: self })); await ready;
  return socket;
}
test('public runtime configuration defaults to network/same-origin and rejects mixed content or mismatched identities', () => {
  assert.equal(connectionConfig({}, 'https://garden.test/').url, 'wss://garden.test/ws');
  assert.equal(config.profile, 'network');
  assert.equal(connectionConfig({}, 'http://garden.test/?profile=offline').profile, 'local');
  for (const value of [{ url: 'ws://garden.test/ws' }, { url: 'wss://u:p@garden.test/ws' }, { protocolVersion: 1 }, { catalogHash: '0'.repeat(64) }, { roomId: '../x' }])
    assert.throws(() => connectionConfig(value, 'https://garden.test/'));
});
test('real codec handshake, independent inputs, heartbeat and explicit command confirmations', async t => {
  const h = setup(); t.after(() => h.network.dispose()); const socket = await connected(h, selfState({ lifeEpoch: 1, life: 1 }));
  assert.equal(h.network.state, 'connected');
  h.network.sendInput({ buttons: 3, angle: 1, strength: 1000 }); h.network.sendInput({ buttons: 0, angle: 0, strength: 0 });
  const inputs = socket.sent.filter(m => m.type === 3);
  assert.deepEqual(inputs.map(m => m.value.inputSeq), [1, 2]); assert.equal(inputs[0].value.strength, 200);
  assert.equal(inputs[0].value.lifeEpoch, 1); assert.equal(inputs[0].value.targetTick, 2);
  const pending = h.network.sendCommand({ kind: CommandKind.Spawn, text: 'Alice' });
  socket.receive(5, { commandSeq: 1, code: ResultCode.Cooldown, nextSpawnTick: 50 });
  assert.equal((await pending).nextSpawnTick, 50); assert.equal(h.network.pendingCount, 0);
  socket.receive(8, { nonce: 1, serverTick: 5, monotonicMs: 42 });
  assert.equal(socket.sent.at(-1).type, 9); assert.equal(socket.sent.at(-1).value.nonce, 1);
  assert.equal(h.records.size, 1); assert.ok(!config.url.includes('token'));
});
test('gap/decode failure are atomic and request one bounded resync, full rebind drops old entities/events', async t => {
  const h = setup(); t.after(() => h.network.dispose()); const socket = await connected(h);
  socket.receive(6, snapshot({ full: false, snapshotSeq: 3 })); socket.receive(6, snapshot({ full: false, snapshotSeq: 4 }));
  assert.equal(h.values.length, 1); assert.equal(socket.sent.filter(m => m.type === 7).length, 1);
  const chat = { tick: 1, ordinal: 1, kind: 3, target: 0, actorPlayerId: 1, actorHandle: 0, amount: 0, slot: 0, text: 'Alice: hello' };
  socket.receive(6, snapshot({ full: true, snapshotSeq: 5, baselineId: 2, events: [chat] }));
  assert.equal(h.values.at(-1).value.events.length, 1);
  socket.receive(6, snapshot({ full: true, snapshotSeq: 6, baselineId: 3, events: [chat] }));
  assert.equal(h.values.at(-1).value.events.length, 0);
  const before = h.values.length;
  socket.receive(6, snapshot({ snapshotSeq: 7, baselineId: 4 }), 99);
  assert.equal(h.values.length, before);
});
test('resume rotates token/counters/full baseline and late callbacks cannot mutate the new socket', async t => {
  const h = setup(); t.after(() => h.network.dispose()); const socket = await connected(h, selfState({ lifeEpoch: 1, life: 1 }));
  const oldMessage = socket.onmessage, oldClose = socket.onclose;
  const pending = h.network.sendCommand({ kind: CommandKind.Swap }); const rejected = assert.rejects(pending, /Connection lost/);
  socket.onclose({}); await rejected; assert.equal(h.network.state, 'reconnecting');
  await delay(550); const next = h.sockets.at(-1); assert.notEqual(next, socket); next.open();
  assert.deepEqual(next.sent[0].value.resumeToken, welcome.resumeToken);
  const resumed = { ...welcome, sessionEpoch: 8, resumeToken: new Uint8Array(32).fill(5) };
  next.receive(2, resumed, 8); next.receive(6, snapshot({ selfState: selfState({ lifeEpoch: 1, life: 1 }) }), 8);
  oldMessage({ data: encodeMessage({ type: 6, value: snapshot(), sessionEpoch: 7 }).buffer }); oldClose({});
  assert.equal(h.network.welcome.sessionEpoch, 8); assert.equal(h.network.state, 'connected'); assert.equal(h.values.length, 2);
  h.network.sendInput({ buttons: 0, angle: 0, strength: 0 }); assert.equal(next.sent.at(-1).value.inputSeq, 1);
  assert.deepEqual(JSON.parse([...h.records.values()][0]).token, Array(32).fill(5));
});
test('pending commands time out, clear on life change/close/dispose and enforce the fixed queue bound', async () => {
  const h = setup({ commandTimeoutMs: 10 }); const socket = await connected(h, selfState({ lifeEpoch: 1, life: 1 }));
  await assert.rejects(h.network.sendCommand({ kind: CommandKind.Swap }), /timed out/); assert.equal(h.network.pendingCount, 0);
  const oldLife = assert.rejects(h.network.sendCommand({ kind: CommandKind.Swap }), /life changed/);
  socket.receive(6, snapshot({ full: false, snapshotSeq: 2, selfState: selfState({ lifeEpoch: 2, life: 1 }) })); await oldLife;
  const promises = Array.from({ length: LIMITS.maxQueuedCommands }, () => h.network.sendCommand({ kind: CommandKind.Chat, text: 'hi' }));
  const checks = Promise.all(promises.map(p => assert.rejects(p, /disposed/)));
  await assert.rejects(h.network.sendCommand({ kind: CommandKind.Chat, text: 'hi' }), /queue full/);
  h.network.dispose(); await checks; assert.equal(h.network.pendingCount, 0); assert.equal(h.network.timerCount, 0);
  assert.equal(socket.onmessage, null); assert.equal(socket.onclose, null); assert.equal(socket.readyState, 3);
  await assert.rejects(h.network.connect('Alice'), /disposed/);
});
test('version/full-room/invalid-token/maintenance failures terminate and clear tokens without retry', async () => {
  for (const code of [ErrorCode.Version, ErrorCode.RoomFull, ErrorCode.Session, ErrorCode.Stopping]) {
    const h = setup(); const promise = assert.rejects(h.network.connect('Alice')); const socket = h.sockets[0]; socket.open();
    socket.receive(10, { code, message: 'rejected', retryable: false }, 0); await promise;
    assert.equal(h.network.state, 'error'); assert.equal(h.network.timerCount, 0); assert.equal(h.records.size, 0); h.network.dispose();
  }
});
test('handshake deadline, expired grace and write backpressure cannot leave pending requests or unbounded reconnects', async () => {
  const h = setup({ handshakeTimeoutMs: 10 }); const rejection = assert.rejects(h.network.connect('Alice'), /Cannot connect/); await rejection;
  assert.equal(h.network.timerCount, 0); h.network.dispose();
  let now = 100;
  const slow = setup({ now: () => now }); const socket = await connected(slow, selfState({ lifeEpoch: 1, life: 1 }));
  socket.bufferedAmount = LIMITS.maxQueuedWriteBytes;
  slow.network.sendInput({ buttons: 1, angle: 0, strength: 200 }); assert.equal(slow.network.state, 'reconnecting');
  now += 11000; slow.network.dispose(); assert.equal(slow.network.timerCount, 0);
});
