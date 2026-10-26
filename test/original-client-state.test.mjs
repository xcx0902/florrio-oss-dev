import test from 'node:test';
import assert from 'node:assert/strict';
import { findOriginalClientState, readOriginalClientState } from '../tools/parity/original-client-state.mjs';

function fixture() {
  const memory = { buffer: new ArrayBuffer(8000000) }, state = 1024, view = new DataView(memory.buffer);
  const u = (at, value) => view.setUint32(at, value, true), f = (at, value) => view.setFloat32(at, value, true);
  const controller = 20000, body = state + 2928 + 3 * 448;
  u(state + 256, 1); u(state + 264, 19000); u(19000, controller);
  const owner = state + 2928 + 448;
  u(state + 2928, state); u(state + 2928 + 16, 16384); u(state + 2276, 1);
  u(owner, state); u(owner + 16, 16385); u(owner + 72, controller);
  u(controller, owner); u(controller + 144, body); f(controller + 136, 0.9);
  u(body, state); u(body + 16, 16387); u(body + 120, 22000); u(body + 116, 23000); u(body + 188, owner);
  u(body + 144, 24000); u(body + 152, 25000);
  f(22000 + 64, 123); f(22000 + 40, 456); f(23000 + 8, 100); f(23000 + 12, 100);
  view.setUint8(state + 1, 1); f(state + 900, 50000); f(state + 988, 4000);
  f(7926696, 1);
  return { memory, state, view, u, f, controller, body, read: () => readOriginalClientState({ memory }, state) };
}

test('original-client observation requires real world metadata and one bound controller', () => {
  const x = fixture(), value = x.read();
  assert.equal(value.worldReady, true);
  assert.equal(value.controlledBodyValid, true);
  assert.equal(value.controlLinkValid, true);
  assert.equal(value.mainWorldAlpha, 1);
  assert.deepEqual([value.player.x, value.player.y, value.player.health], [123, 456, 100]);
  x.view.setUint8(x.state + 1, 0);
  assert.equal(x.read().worldReady, false, 'a player flag alone is not world readiness');
  x.u(x.state + 256, 872);
  assert.equal(x.read().controlledBodyValid, false, 'per-entity cameras are not a local controller');
});

test('original-client locator waits for decoded metadata and verifies owner self-pointers', () => {
  const x = fixture();
  assert.equal(findOriginalClientState({memory:x.memory}), x.state);
  x.view.setUint8(x.state + 1, 0);
  assert.equal(findOriginalClientState({memory:x.memory}), 0, 'an arrived packet is not a decoded world');
  x.view.setUint8(x.state + 1, 1); x.u(x.controller, 21000);
  assert.equal(findOriginalClientState({memory:x.memory}), 0, 'sequence-like allocation headers cannot locate the world');
});

test('original-client observation distinguishes death, stale generations and a new body', () => {
  const x = fixture();
  x.f(23000 + 8, 0); assert.equal(x.read().player.health, 0);
  x.u(x.controller + 144, 0); assert.equal(x.read().player, null);
  x.u(x.controller + 144, x.body); x.u(x.body + 16, 16388);
  assert.equal(x.read().controlledBodyValid, false, 'a mismatched slot is not a valid control binding');
  x.u(x.body + 16, 32771); x.f(23000 + 8, 100);
  assert.equal(x.read().player.handle, 32771);
  assert.equal(x.read().player.health, 100);
});

test('original-client observation rejects missing state and invalid pointers without inventing health', () => {
  assert.equal(readOriginalClientState(null, 1024), null);
  const x = fixture(); x.u(x.body + 116, 0);
  assert.equal(x.read().player.health, null);
  x.u(x.controller + 144, 999999);
  assert.equal(x.read().player, null);
});

test('original-client petal observation uses native attribution, not the spatial parent', () => {
  const x = fixture(), petal = x.state + 2928 + 4 * 448;
  x.u(petal + 16, 16388); x.u(petal + 76, 26000);
  x.u(petal + 120, 27000); x.u(petal + 116, 28000);
  x.f(27000 + 64, 183); x.f(27000 + 40, 456); x.f(28000 + 8, 10);
  x.u(petal + 176, 0); x.u(petal + 188, x.body);
  assert.equal(x.read().player.petalDistance, 60);
  assert.equal(x.read().player.petalCount, 1);
  x.u(petal + 188, 0); x.u(petal + 176, x.body);
  assert.equal(x.read().player.petalCount, 0, 'spatial parenting is not petal ownership');
});
