import test from 'node:test';
import assert from 'node:assert/strict';
import { loadoutSlots, playerLoadoutSlots, playerSlotProgress } from '../../public/state/loadout.js';

test('loadout slots come from petal byte fields 11/12', () => {
  const entities = [
    { typeId: 6, byteFields: { 11: 0, 12: 0 } },
    { typeId: 6, byteFields: { 11: 0, 12: 1 } }, // same slot, instance 1
    { typeId: 11, byteFields: { 11: 2, 12: 0 } },
    { typeId: 1, byteFields: { 11: 5, 12: 0 } }, // out of range
  ];
  assert.deepEqual(loadoutSlots(entities), [6, 0, 11, 0, 0]);
});

test('loadout slots fall back to zero when no petal carries the fields', () => {
  assert.deepEqual(loadoutSlots([{ typeId: 1 }]), [0, 0, 0, 0, 0]);
});

test('domain petal kind does not replace its species in the loadout', () => {
  assert.deepEqual(loadoutSlots([
    { typeId: 3, kind: 3, speciesId: 11, byteFields: { 11: 0, 12: 0 } },
    { typeId: 3, kind: 3, speciesId: 6, denseFields: { 11: 2, 12: 0 } },
  ]), [11, 0, 6, 0, 0]);
});

test('player inventory preserves intentionally empty slots and recharge data', () => {
  const player = { byteArrayFields: { 60: [{ index: 0, value: 0 }, { index: 6, value: 11 }] },
    shortArrayFields: { 61: [{ index: 0, value: 0 }, { index: 1, value: 32768 }, { index: 7, value: 65535 }] } };
  assert.deepEqual(playerLoadoutSlots(player), [0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(playerSlotProgress(player), [0, 32768 / 65535, 0, 0, 0, 0, 0, 1]);
  assert.equal(playerLoadoutSlots({}), undefined);
});
