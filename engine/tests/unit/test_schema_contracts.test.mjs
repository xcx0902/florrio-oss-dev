import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCompiledLayouts } from '../../../tools/check-schema-layouts.mjs';

function fixture() {
  return {
    layouts: {
      types: new Map([['Point', { size: 8, alignment: 4, confidence: 'low',
        fields: [{ name: 'x', offset: 0, type: 'f32' }, { name: 'y', offset: 4, type: 'f32' }] }]]),
      globals: new Map([['table', { address: 64 }]]),
    },
    entries: [
      { kind: 'struct', name: 'Point', size: 8, alignment: 1, standardLayout: true, triviallyCopyable: true },
      { kind: 'field', owner: 'Point', name: 'x', offset: 0, size: 4, typeMatches: true },
      { kind: 'field', owner: 'Point', name: 'y', offset: 4, size: 4, typeMatches: true },
      { kind: 'global', name: 'table', address: 64 },
    ],
  };
}

test('packed byte-layout consistency preserves the declared/compiled alignment distinction', () => {
  const { layouts, entries } = fixture();
  const result = checkCompiledLayouts(layouts, entries);
  assert.equal(result.fields, 2);
  assert.deepEqual(result.alignments, [{ name: 'Point', declared: 4, compiled: 1 }]);
  assert.equal(layouts.types.get('Point').confidence, 'low');
});

for (const [name, mutate, message] of [
  ['stale generated size', ({ entries }) => { entries[0].size = 12; }, /Point size/],
  ['stale generated offset', ({ entries }) => { entries[2].offset = 0; }, /Point.y offset/],
  ['incorrect member width', ({ entries }) => { entries[2].size = 8; }, /Point.y width/],
  ['same-width incorrect scalar type', ({ entries }) => { entries[2].typeMatches = false; }, /Point.y C\+\+ scalar/],
  ['new YAML field missing from compiled output', ({ layouts }) => {
    layouts.types.get('Point').fields.push({ name: 'z', offset: 8, type: 'f32' });
  }, /missing compiler entry field:Point.z/],
  ['removed YAML field retained in compiler output', ({ layouts }) => {
    layouts.types.get('Point').fields.pop();
  }, /entries absent from current YAML/],
  ['duplicate target report', ({ entries }) => { entries.push({ ...entries[1] }); }, /duplicate compiler entry/],
  ['stale generated global address', ({ entries }) => { entries[3].address = 68; }, /table address/],
]) test(`rejects ${name}`, () => {
  const value = fixture();
  mutate(value);
  assert.throws(() => checkCompiledLayouts(value.layouts, value.entries), message);
});
