import test from 'node:test';
import assert from 'node:assert/strict';
import * as loadout from '../client/public/state/loadout.js';
import { readProductionState } from '../tools/parity/production-state.mjs';

function state(player, petals = []) {
  const entities = [{ kind: 1, handle: 7, ...player }, ...petals];
  return readProductionState({ world: { all: () => entities, count: entities.length,
    lastSequence: 1, lastServerTime: 100, chat: [], lastEvents: [] },
  ui: { started: true }, camera: {}, getCamera: () => ({ x: 0, y: 0, zoom: 1 }) }, loadout);
}

test('production discard observes authoritative zero while its corpse remains', () => {
  const corpse = { kind: 3, speciesId: 1, health: 0, byteFields: { 11: 2, 12: 0 } };
  const before = state({ denseFields: { 60: [1, 1, 1] } }, [corpse]);
  const after = state({ denseFields: { 60: [1, 1, 1] },
    byteArrayFields: { 60: [{ index: 2, value: 0 }] } }, [corpse]);
  assert.equal(before.slots[2], 1);
  assert.equal(after.slots[2], 0);
  assert.equal(after.slotsSource, 'player-field60');
});

test('production equip observes swapped slots during recharge without live petals', () => {
  const before = state({ byteArrayFields: { 60: [{ index: 0, value: 1 }] } });
  const after = state({ denseFields: { 60: [1, 1, 0] },
    byteArrayField60: [{ index: 0, value: 0 }, { index: 2, value: 1 }] });
  assert.equal(before.slots[0], 1);
  assert.equal(before.slots[2], 0);
  assert.equal(after.slots[0], 0);
  assert.equal(after.slots[2], 1);
  assert.equal(after.slotsSource, 'player-field60');
  assert.equal(after.slots.length, 16);
});

test('production uses petal fallback only when player field60 is absent', () => {
  const petal = { kind: 3, speciesId: 11, byteFields: { 11: 2, 12: 0 } };
  const fallback = state({}, [petal]);
  assert.equal(fallback.slots[2], 11);
  assert.equal(fallback.slotsSource, 'petal-fallback');
  const empty = state({ byteArrayFields: { 60: [] } }, [petal]);
  assert.deepEqual(empty.slots, Array(16).fill(0));
  assert.equal(empty.slotsSource, 'player-field60');
});
