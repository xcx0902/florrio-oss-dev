import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkClock } from '../../../build/client/state/network-clock.js';
import { SnapshotBuffer } from '../../../build/client/state/snapshot-buffer.js';
import { LocalPrediction } from '../../../build/client/state/local-prediction.js';
import { stepMotion } from '../../../build/client/state/player-motion.js';
import { selfState, snapshot } from '../support/multiplayer.mjs';
const input = (seq, tick = 10, strength = 200) => ({
  inputSeq: seq,
  lifeEpoch: 1,
  targetTick: tick,
  buttons: 0,
  angle: 0,
  strength,
});
function setup(overrides = {}) {
  const clock = new NetworkClock();
  clock.reset(10, 0);
  let resyncs = 0;
  const prediction = new LocalPrediction(() => resyncs++);
  const s = snapshot({
    full: true,
    serverTick: 10,
    controlledHandle: 7,
    selfState: selfState({ life: 1, lifeEpoch: 1, ...overrides }),
  });
  prediction.reconcile(s, 0, clock);
  return { clock, prediction, s, resyncs: () => resyncs };
}
test('monotonic clock measures RTT/offset, rejects bad samples, bounds jitter/window and resets on reconnect', () => {
  const clock = new NetworkClock();
  clock.reset(100, 1000);
  assert.equal(clock.estimate(1050), 5050);
  assert.equal(
    clock.sample(
      { nonce: 1, monotonicMs: 1000, serverMonotonicMs: 9000, serverTimeMs: 5000, serverTick: 100 },
      1000,
      1100,
    ),
    true,
  );
  assert.equal(clock.rttMs, 100);
  assert.equal(clock.sampleCount, 1);
  assert.equal(clock.monotonicOffsetMs, 7950);
  assert.equal(
    clock.sample(
      { nonce: 2, monotonicMs: 1, serverMonotonicMs: 9001, serverTimeMs: 5000, serverTick: 100 },
      1,
      3000,
    ),
    false,
  );
  assert.equal(
    clock.sample(
      { nonce: 2, monotonicMs: 1200, serverMonotonicMs: 1, serverTimeMs: 5000, serverTick: 100 },
      1200,
      1300,
    ),
    false,
  );
  for (let i = 0; i < 35; i++) {
    clock.sample(
      {
        nonce: i + 2,
        monotonicMs: 1200 + i * 50,
        serverMonotonicMs: 9200 + i * 50,
        serverTimeMs: 5200 + i * 50,
        serverTick: 104 + i,
      },
      1200 + i * 50,
      1300 + i * 50,
    );
    clock.observeSnapshot(104 + i, 1300 + i * 50 + (i % 2 ? 20 : -20));
  }
  assert.ok(clock.sampleCount <= 20);
  assert.ok(clock.delayMs >= 50 && clock.delayMs <= 200);
  const before = clock.estimate(4000);
  assert.ok(clock.estimate(3000) >= before);
  clock.reset(1, 5000);
  assert.equal(clock.sampleCount, 0);
  assert.equal(clock.rttMs, 0);
  assert.equal(clock.estimate(5000), 50);
});
test('remote samples are tick-sorted, interpolate angle, extrapolate one tick then freeze; deletion/teleport clear history', () => {
  const b = new SnapshotBuffer(),
    point = (tick, x, angle = 0) => b.push(tick, [{ handle: 7, x, y: 0, angle, radius: 25 }]);
  point(10, 0, 3);
  point(12, 20, -3);
  point(11, 10, Math.PI);
  assert.equal(b.sample(7, 575, {}).x, 15);
  assert.ok(Math.abs(Math.abs(b.sample(7, 575, {}).angle) - Math.PI) < 0.15);
  assert.equal(b.sample(7, 625, {}).x, 25);
  assert.equal(b.sample(7, 9000, {}).x, 30);
  for (let t = 13; t < 50; t++) {
    point(t, t * 2);
  }
  assert.equal(b.depth, 8);
  point(50, 1000);
  assert.equal(b.depth, 1);
  assert.equal(b.sample(7, 0, {}).x, 1000);
  b.push(51, []);
  assert.equal(b.entityCount, 0);
  b.reset();
  assert.equal(b.depth, 0);
});
test('clock calibration and adaptive delay cannot jump or pause an existing render timeline', () => {
  const clock = new NetworkClock();
  clock.reset(10, 0);
  clock.observeSnapshot(10, 0);
  const before = clock.estimate(40);
  clock.observeSnapshot(11, 40);
  assert.equal(clock.estimate(40), before, 'snapshot receipt keeps the current frame continuous');
  let last = before,
    lastRemote = before - clock.delayMs;
  for (let at = 50; at <= 2000; at += 10) {
    if (at % 50 === 0) {
      const current = clock.estimate(at);
      clock.observeSnapshot(10 + at / 50, at);
      assert.equal(clock.estimate(at), current);
    }
    if (at === 1000) {
      const current = clock.estimate(at);
      assert.equal(
        clock.sample(
          {
            nonce: 1,
            monotonicMs: 900,
            serverMonotonicMs: 10000,
            serverTick: 29,
            serverTimeMs: 1450,
          },
          900,
          at,
        ),
        true,
      );
      assert.equal(
        clock.estimate(at),
        current,
        'quantised Pong changes the target, not the drawn time',
      );
    }
    const time = clock.estimate(at),
      remote = time - clock.delayMs;
    assert.ok(
      time - last >= 9 - 1e-9 && time - last <= 11 + 1e-9,
      `clock step at ${at}: ${time - last}`,
    );
    assert.ok(
      remote - lastRemote >= 8 - 1e-9 && remote - lastRemote <= 12 + 1e-9,
      `remote step at ${at}: ${remote - lastRemote}`,
    );
    last = time;
    lastRemote = remote;
  }
});
test('duplicate/coalesced packets integrate once per tick and repeat one seq across multiple phases', () => {
  const a = setup();
  a.prediction.input(input(1));
  a.prediction.input(input(2));
  a.prediction.input(input(2));
  const first = stepMotion({ x: 0, y: 0, vx: 0, vy: 0 }, input(2), a.s.selfState);
  assert.equal(a.prediction.display(0, a.clock).x, 0);
  assert.equal(a.prediction.display(50, a.clock).x, first.x);
  const second = stepMotion(first, input(2), a.s.selfState);
  assert.equal(a.prediction.display(100, a.clock).x, second.x);
  assert.equal(a.prediction.metrics.replayDepth, 2);
});
test('render frames interpolate fixed prediction steps instead of holding then jumping every 50ms', () => {
  const a = setup({ strength: 200, angle: 0, inputExpiresTick: 100, velocityX: 0.25 });
  const first = stepMotion({ x: 0, y: 0, vx: 0.25, vy: 0 }, input(1), a.s.selfState);
  const second = stepMotion(first, input(1), a.s.selfState);
  for (const now of [0, 10, 20, 30, 40, 50]) {
    const p = a.prediction.display(now, a.clock),
      expected = (first.x * now) / 50;
    assert.ok(Math.abs(p.x - expected) < 1e-10, `frame ${now}ms: ${p.x} vs ${expected}`);
  }
  assert.equal(
    a.prediction.display(100, a.clock).vx,
    second.vx,
    'whole ticks retain the exact fixed-step velocity',
  );
  const capped = a.prediction.display(200, a.clock);
  assert.equal(a.prediction.metrics.replayDepth, 4);
  assert.deepEqual(
    a.prediction.display(225, a.clock),
    capped,
    'fractional rendering cannot exceed the four-step horizon',
  );
});
test('ACK gaps discard adopted packets, remap coalesced late packets to unsimulated phases and preserve f64 correction', () => {
  const a = setup();
  a.prediction.input(input(1));
  a.prediction.input(input(3, 10, 0));
  a.prediction.input(input(4, 10));
  const self = selfState({
    life: 1,
    lifeEpoch: 1,
    positionX: 5,
    velocityX: 0.12345678912345,
    angle: 0,
    strength: 200,
    inputExpiresTick: 16,
  });
  a.prediction.reconcile(
    {
      ...a.s,
      full: false,
      serverTick: 11,
      lastAppliedInputSeq: 1,
      lastReceivedInputSeq: 4,
      selfState: self,
    },
    50,
    a.clock,
  );
  assert.equal(a.prediction.depth, 2);
  assert.ok(a.prediction.metrics.replayDepth <= 4);
  let expected = { x: 5, y: 0, vx: self.velocityX, vy: 0 };
  for (let phase = 11; phase < 14; phase++) {
    expected = stepMotion(expected, input(4), self);
  }
  // Display offset decays in 100ms; logical replay still uses the authoritative velocity.
  const point = a.prediction.display(200, a.clock);
  assert.equal(point.x, expected.x);
  assert.equal(point.vx, expected.vx);
  a.prediction.reconcile(
    { ...a.s, full: false, serverTick: 13, lastAppliedInputSeq: 4, selfState: self },
    200,
    a.clock,
  );
  assert.equal(a.prediction.depth, 0);
});
test('TTL, neutral and slow effects run in the same timeline; replay is bounded independently of frame rate', () => {
  const a = setup({ strength: 200, angle: 0, inputExpiresTick: 11, motionScale: 0.25 });
  let expected = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let tick = 10; tick < 14; tick++) {
    expected = stepMotion(expected, { angle: 0, strength: tick < 11 ? 200 : 0 }, a.s.selfState);
  }
  assert.equal(a.prediction.display(200, a.clock).x, expected.x);
  for (let now = 0; now < 200; now += 7) {
    a.prediction.display(now, a.clock);
  }
  assert.equal(a.prediction.display(200, a.clock).x, expected.x);
  assert.ok(a.prediction.metrics.replayDepth <= 4);
});
test('history overflow and persistent stalls stop prediction and request exactly one full resync', () => {
  const a = setup();
  for (let seq = 1; seq <= 257; seq++) {
    a.prediction.input(input(seq));
  }
  assert.equal(a.prediction.depth, 0);
  assert.equal(a.prediction.suspended, true);
  assert.equal(a.resyncs(), 1);
  a.prediction.input(input(258));
  assert.equal(a.resyncs(), 1);
  const b = setup();
  b.prediction.display(400, b.clock);
  b.prediction.display(1500, b.clock);
  assert.equal(b.resyncs(), 1);
  assert.equal(b.prediction.display(1600, b.clock).x, 0);
});
test('full/death/body removal/respawn reset pending input and correction; old-life input cannot move the new body', () => {
  for (const patch of [
    { full: true },
    { selfState: selfState({ life: 2, lifeEpoch: 1 }) },
    { controlledHandle: 0 },
    { controlledHandle: 8, selfState: selfState({ life: 1, lifeEpoch: 2, positionX: 500 }) },
  ]) {
    const a = setup();
    a.prediction.input(input(1));
    a.prediction.display(0, a.clock);
    a.prediction.reconcile({ ...a.s, full: false, ...patch }, 50, a.clock);
    assert.equal(a.prediction.depth, 0);
    assert.equal(a.prediction.suspended, false);
    a.prediction.input({ ...input(2), lifeEpoch: 3 });
    assert.equal(a.prediction.depth, 0);
  }
});
test('large collision/teleport corrections snap, small display errors decay within 100ms and never mutate authority', () => {
  const a = setup();
  a.prediction.input(input(1));
  a.prediction.display(0, a.clock);
  const next = { ...a.s, full: false, selfState: { ...a.s.selfState, positionX: 1000 } };
  a.prediction.reconcile(next, 0, a.clock);
  assert.equal(a.prediction.metrics.snaps, 1);
  assert.ok(a.prediction.display(0, a.clock).x >= 1000);
  assert.equal(next.selfState.positionX, 1000);
  assert.equal(a.s.selfState.positionX, 0);
  a.prediction.enabled = false;
  assert.equal(a.prediction.display(0, a.clock).x, 1000);
});

test('input presentation telemetry is emitted only after a real drawing pass', () => {
  const a = setup();
  a.prediction.presented(0, { x: 0, y: 0 });
  a.prediction.input(input(1), 5);
  a.prediction.display(10, a.clock);
  assert.equal(a.prediction.metrics.responses.length, 0);
  a.prediction.presented(20, { x: 5, y: 0 });
  assert.deepEqual(a.prediction.metrics.responses, [15]);
});

test('future input waits for its target phase and small display correction fully decays at 100ms', () => {
  const future = setup();
  future.prediction.input(input(1, 12));
  assert.equal(future.prediction.display(50, future.clock).x, 0);
  assert.equal(future.prediction.display(100, future.clock).x, 0);
  assert.ok(future.prediction.display(125, future.clock).x > 0);
  const a = setup();
  a.prediction.display(0, a.clock);
  a.prediction.reconcile(
    { ...a.s, full: false, selfState: { ...a.s.selfState, positionX: 2 } },
    0,
    a.clock,
  );
  assert.equal(a.prediction.display(0, a.clock).x, 0);
  assert.equal(a.prediction.display(50, a.clock).x, 1);
  assert.equal(a.prediction.display(100, a.clock).x, 2);
  a.clock.reset(4294966270, 0);
  assert.equal(a.clock.targetTick(5000), 4294966270);
});
