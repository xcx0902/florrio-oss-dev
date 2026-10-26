import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEntities, f32Ulp } from '../../../tools/parity/entity-state-diff.mjs';
import { originalEntityIdentity } from '../../../tools/parity/original-entity-identity.mjs';

const entity = { type: 14, kind: 5, x: 10000, y: 0, angle: 0, radius: 11,
  health: 10, maxHealth: 10, vx: 1.4, vy: 0, ax: 0.6, ay: 0 };
const compare = (a, b, options) => compareEntities(new Map([[37, a]]), new Map([[37, b]]), options);
test('strict entity comparator accepts equal finite states', () => {
  assert.equal(compare(entity, { ...entity }).matched, true);
});
for (const field of ['type', 'kind']) test(`strict comparison rejects changed ${field}`, () => {
  assert.equal(compare(entity, { ...entity, [field]: entity[field] + 1 }).matched, false);
});
for (const field of ['type', 'kind']) {
  for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '14', 1.5, -1]) {
    test(`rejects invalid identity ${field} = ${String(invalid)} even when equal`, () => {
      const invalidEntity = { ...entity, [field]: invalid };
      assert.equal(compare(invalidEntity, invalidEntity).matched, false);
    });
  }
}
for (const field of ['x', 'y', 'angle', 'radius', 'health', 'maxHealth', 'vx', 'vy', 'ax', 'ay']) {
  for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '0']) test(`rejects ${field} = ${invalid} on either side`, () => {
    assert.equal(compare(entity, { ...entity, [field]: invalid }).matched, false);
    assert.equal(compare({ ...entity, [field]: invalid }, entity).matched, false);
    assert.equal(compare({ ...entity, [field]: invalid }, { ...entity, [field]: invalid }).matched, false);
  });
}
test('unknown identities cannot pass against each other', () => {
  const unknown = { ...entity, type: -1, kind: -1 };
  assert.equal(compare(unknown, unknown).matched, false);
});
test('missing and extra handles fail even if numeric fields match', () => {
  assert.equal(compareEntities(new Map([[37, entity]]), new Map([[38, entity]])).matched, false);
});
test('strict comparison inspects middle ticks and all mismatches after sample cap', () => {
  const timeline = [entity, { ...entity, kind: 2 }, entity].map(state => compare(entity, state));
  assert.deepEqual(timeline.map(row => row.matched), [true, false, true]);
  assert.equal(timeline.every(row => row.matched), false);
  const original = new Map(Array.from({ length: 20 }, (_, index) => [index + 1, entity]));
  const candidate = new Map([...original].map(([handle, value]) => [handle, { ...value, type: 6 }]));
  const diff = compareEntities(original, candidate);
  assert.equal(diff.mismatchCount, 20);
  assert.equal(diff.mismatched.length, 12);
  assert.equal(diff.mismatchedHandles.length, 20);
});
test('existing absolute/ULP and velocity budgets remain enforced', () => {
  assert.equal(compare(entity, { ...entity, x: entity.x + 0.01 }).matched, false);
  assert.equal(compare(entity, { ...entity, vx: entity.vx + 0.002 }).matched, false);
  assert.equal(compare(entity, { ...entity, x: entity.x + f32Ulp(entity.x) }).matched, true);
  assert.equal(compare(entity, { ...entity, angle: 2 * Math.PI }).matched, true);
  assert.throws(() => compare(entity, entity, { tolerance: NaN }));
});
test('position ULP budgets apply independently to each axis', () => {
  const state = { ...entity, x: 32768, y: 0 };
  assert.equal(compare(state, { ...state, x: state.x + 2 * f32Ulp(state.x) }).matched, true);
  assert.equal(compare(state, { ...state, y: 0.002 }).matched, false);
  const swapped = { ...entity, x: 0, y: 32768 };
  assert.equal(compare(swapped, { ...swapped, x: 0.002 }).matched, false);
});
test('strict options reject nonnumeric, negative and nonfinite tolerances', () => {
  for (const name of ['tolerance', 'velocityTolerance', 'ulpTolerance']) {
    for (const value of ['0.001', -1, NaN, Infinity, -Infinity, null]) {
      assert.throws(() => compare(entity, entity, { [name]: value }), /invalid/);
    }
  }
});
test('original identity uses components, never the field-26 extension byte', () => {
  // Synthetic unit record; actual wasm identity evidence lives in report.json.
  const view = new DataView(new ArrayBuffer(2048)), address = 64;
  view.setUint8(address + 94, 255);
  assert.deepEqual(originalEntityIdentity(view, address), { type: -1, kind: -1 });
  view.setUint32(address + 148, 512, true); view.setUint8(520, 14);
  assert.deepEqual(originalEntityIdentity(view, address), { type: 14, kind: 2 });
  view.setUint32(address + 148, 0, true); view.setUint32(address + 156, 600, true);
  view.setUint32(address + 236, 768, true); view.setUint32(768 + 148, 1024, true);
  view.setUint8(1032, 14);
  assert.deepEqual(originalEntityIdentity(view, address), { type: 14, kind: 5 });
  view.setUint8(1032, 6);
  assert.deepEqual(originalEntityIdentity(view, address), { type: -1, kind: -1 });
});
