/** Snapshot-codec contracts: header, bare/dense groups, invalid packets and WorldState merges. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { DENSE_GROUPS, DENSE_GROUP_SPECS, DENSE_GROUP_COMPONENTS, densePresentForMask, FIELD_COMPONENTS } from '../../public/state/field-types.js';
import { WorldState } from '../../public/state/world.js';
import { browser, origin, start, stop } from '../support/worker-fixture.mjs';

before(start);
after(stop);

test('original snapshot header decoder reads type, sequence and ack', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { decodeSnapshotHeader } = await import('/state/snapshot.js');
    return decodeSnapshotHeader(new Uint8Array([1, 9, 3, 0, 0, 0]));
  });
  await page.close();
  assert.deepEqual(result, { sequence: 9, reliableAck: 3 });
});

test('original bare update decoder reads handle and flags', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { BareSnapshotDecoder } = await import('/state/snapshot.js');
    const bytes = new Uint8Array([1, 12, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 52, 0]);
    const snapshot = new BareSnapshotDecoder().decode(bytes);
    const maskBytes = new Uint8Array([1, 13, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 0]);
    const maskSnapshot = new BareSnapshotDecoder().decode(maskBytes);
    const fieldBytes = new Uint8Array([1, 14, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 1, 0x7A, 0]);
    const fieldSnapshot = new BareSnapshotDecoder().decode(fieldBytes);
    const floatBytes = new Uint8Array([
      1, 15, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0,
      5, 0, 0, 0xC0, 0x3F,
      2, 0, 0, 0x20, 0x40,
      17, 0, 0, 0x60, 0x40,
      0,
    ]);
    const floatSnapshot = new BareSnapshotDecoder().decode(floatBytes);
    const staticBytes = new Uint8Array([1, 16, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 19, 0, 0, 0x90, 0x40, 0]);
    const staticSnapshot = new BareSnapshotDecoder().decode(staticBytes);
    const doubleBytes = new Uint8Array([1, 17, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 35, 0, 0, 0, 0, 0, 0, 0x02, 0x40, 0]);
    const doubleSnapshot = new BareSnapshotDecoder().decode(doubleBytes);
    const field18Bytes = new Uint8Array([1, 18, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 18, 0, 0, 0, 0, 0, 0, 0x0A, 0x40, 0]);
    const field18Snapshot = new BareSnapshotDecoder().decode(field18Bytes);
    const field27Bytes = new Uint8Array([1, 19, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 27, 0, 0, 0xB0, 0x40, 0]);
    const field27Snapshot = new BareSnapshotDecoder().decode(field27Bytes);
    const stringBytes = new Uint8Array([1, 20, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 4, 0x68, 0x69, 0, 0]);
    const stringSnapshot = new BareSnapshotDecoder().decode(stringBytes);
    const byte2Bytes = new Uint8Array([1, 21, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 2, 0xAB, 0]);
    const byte2Snapshot = new BareSnapshotDecoder().decode(byte2Bytes);
    const arrayBytes = new Uint8Array([1, 22, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 60, 3, 0xCD, 0, 0]);
    const arraySnapshot = new BareSnapshotDecoder().decode(arrayBytes);
    const varintArrayBytes = new Uint8Array([1, 23, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 39, 2, 200, 1, 0, 0]);
    const varintArraySnapshot = new BareSnapshotDecoder().decode(varintArrayBytes);
    const shortArrayBytes = new Uint8Array([1, 24, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 61, 1, 239, 253, 2, 0, 0]);
    const shortArraySnapshot = new BareSnapshotDecoder().decode(shortArrayBytes);
    const varint30Bytes = new Uint8Array([1, 27, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 30, 0xAC, 2, 0]);
    const varint30Snapshot = new BareSnapshotDecoder().decode(varint30Bytes);
    const reference23Bytes = new Uint8Array([1, 28, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 23, 0x44, 0x33, 0x22, 0x11, 0]);
    const reference23Snapshot = new BareSnapshotDecoder().decode(reference23Bytes);
    const string48Bytes = new Uint8Array([1, 29, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 48, 0x61, 0x62, 0x63, 0, 0]);
    const string48Snapshot = new BareSnapshotDecoder().decode(string48Bytes);
    const stringArray25Bytes = new Uint8Array([1, 30, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 25, 2, 0x78, 0x79, 0, 0, 0]);
    const stringArray25Snapshot = new BareSnapshotDecoder().decode(stringArray25Bytes);
    const float45Bytes = new Uint8Array([1, 31, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 45, 0, 0, 0xD0, 0x40, 0]);
    const float45Snapshot = new BareSnapshotDecoder().decode(float45Bytes);
    const sparseBytes = new Uint8Array([1, 32, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 54, 0, 3, 1, 0]);
    const sparseSnapshot = new BareSnapshotDecoder().decode(sparseBytes);
    const bitBytes = new Uint8Array([1, 33, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 33, 1, 0]);
    const bitSnapshot = new BareSnapshotDecoder().decode(bitBytes);
    const angleBytes = new Uint8Array([1, 34, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 8, 0, 0x80, 0]);
    const angleSnapshot = new BareSnapshotDecoder().decode(angleBytes);
    const handleArrayBytes = new Uint8Array([1, 35, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 3, 1, 0xBE, 0xBA, 0xFE, 0xCA, 0, 0]);
    const handleArraySnapshot = new BareSnapshotDecoder().decode(handleArrayBytes);
    const mixedBytes = new Uint8Array([1, 36, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 5, 0, 0, 0xC0, 0x3F, 3, 0, 0x40, 0]);
    const mixedSnapshot = new BareSnapshotDecoder().decode(mixedBytes);
    const field13Bytes = new Uint8Array([1, 39, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 5, 0, 0, 0, 13, 0, 0, 0xF0, 0x40, 0]);
    const field13Snapshot = new BareSnapshotDecoder().decode(field13Bytes);
    const eventsBytes = new Uint8Array([
      1, 40, 4, 0, 0, 3,
      9, 0x68, 0x69, 0,
      11, 0x78, 0x56, 0x34, 0x12,
      14, 0x78, 0x56, 0x34, 0x12, 2,
    ]);
    const eventsSnapshot = new BareSnapshotDecoder().decode(eventsBytes);
    return {
      bare: snapshot?.entities.map(entity => ({ handle: entity.handle, typeId: entity.typeId })) ?? null,
      mask: maskSnapshot?.entities.map(entity => ({ handle: entity.handle, flags: entity.flags })) ?? null,
      field: fieldSnapshot?.entities.map(entity => ({ flags: entity.flags, field1: entity.byteField1 })) ?? null,
      float: floatSnapshot?.entities.map(entity => ({ flags: entity.flags, fields: entity.floatFields })) ?? null,
      staticFloat: staticSnapshot?.entities.map(entity => entity.floatFields) ?? null,
      double35: doubleSnapshot?.entities.map(entity => entity.doubleField35) ?? null,
      field18: field18Snapshot?.entities.map(entity => entity.doubleField18) ?? null,
      field27: field27Snapshot?.entities.map(entity => entity.floatField27) ?? null,
      field4: stringSnapshot?.entities.map(entity => entity.stringField4) ?? null,
      byte2: byte2Snapshot?.entities.map(entity => entity.byteFields) ?? null,
      array60: arraySnapshot?.entities.map(entity => entity.byteArrayField60) ?? null,
      varint39: varintArraySnapshot?.entities.map(entity => entity.varintArrayFields) ?? null,
      short61: shortArraySnapshot?.entities.map(entity => entity.shortArrayFields) ?? null,
      varint30: varint30Snapshot?.entities.map(entity => entity.varintFields) ?? null,
      reference23: reference23Snapshot?.entities.map(entity => entity.referenceFields) ?? null,
      string48: string48Snapshot?.entities.map(entity => entity.stringFields) ?? null,
      stringArray25: stringArray25Snapshot?.entities.map(entity => entity.stringArrayFields) ?? null,
      float45: float45Snapshot?.entities.map(entity => entity.floatField45) ?? null,
      sparseOrdinals: sparseSnapshot?.entities.map(entity => entity.componentOrdinals) ?? null,
      bit33: bitSnapshot?.entities.map(entity => entity.bitFields) ?? null,
      angle8: angleSnapshot?.entities.map(entity => entity.angleField8) ?? null,
      handleArray3: handleArraySnapshot?.entities.map(entity => entity.handleArrayFields) ?? null,
      mixed: mixedSnapshot?.entities.map(entity => ({ fields: entity.floatFields, angle: entity.angleField8 })) ?? null,
      field13: field13Snapshot?.entities.map(entity => entity.floatFields) ?? null,
      eventsOnly: eventsSnapshot !== null && eventsSnapshot.entities.length === 0,
    };
  });
  await page.close();
  assert.deepEqual(result, {
    bare: [{ handle: 0x12345678, typeId: 0 }],
    mask: [{ handle: 0x12345678, flags: 1 }],
    field: [{ flags: 1, field1: 0x7A }],
    float: [{ flags: 1, fields: { 5: 1.5, 7: 2.5, 24: 3.5 } }],
    staticFloat: [{ 19: 4.5 }],
    double35: [2.25],
    field18: [3.25],
    field27: [5.5],
    field4: ['hi'],
    byte2: [{ 2: 0xAB }],
    array60: [[{ index: 2, value: 0xCD }]],
    varint39: [{ 39: [{ index: 1, value: 200 }] }],
    short61: [{ 61: [{ index: 0, value: 0xBEEF }] }],
    varint30: [{ 30: 300 }],
    reference23: [{ 23: 0x11223344 }],
    string48: [{ 48: 'abc' }],
    stringArray25: [{ 25: [{ index: 1, value: 'xy' }] }],
    float45: [6.5],
    sparseOrdinals: [[1, 3]],
    bit33: [{ 33: 1 }],
    angle8: [2 * Math.PI * 32768 / 65535],
    handleArray3: [{ 3: [{ index: 0, handle: 0xCAFEBABE }] }],
    mixed: [{ fields: { 5: 1.5 }, angle: 2 * Math.PI * 16384 / 65535 }],
    field13: [{ 13: 7.5 }],
    eventsOnly: true,
  });
});

test('protocol schema covers all 63 field ordinals', () => {
  const protocol = parseYaml(readFileSync('schema/protocol.yaml', 'utf8'));
  const fieldTypes = protocol.output.snapshot.fieldTypes;
  const ids = new Set();
  for (const value of Object.values(fieldTypes)) {
    if (Array.isArray(value)) for (const id of value) ids.add(id);
  }
  const dense = protocol.output.snapshot.denseGroups;
  assert.equal(dense.length, 19);
  for (const group of dense) for (const id of [...group.fields, ...(group.extendedFields ?? [])]) ids.add(id);
  for (let field = 1; field <= 63; ++field) assert.ok(ids.has(field), `missing field ${field}`);
});

test('field component map covers every ordinal', () => {
  assert.equal(Object.keys(FIELD_COMPONENTS).length, 63);
  assert.deepEqual(FIELD_COMPONENTS[5], { constructor: 478, offset: 16 });
  assert.deepEqual(FIELD_COMPONENTS[24], { constructor: 478, offset: 112 });
  assert.deepEqual(FIELD_COMPONENTS[8], { constructor: 609, offset: 8 });
});

test('field catalog mirrors 19 dense groups', () => {
  assert.equal(DENSE_GROUPS.length, 19);
  assert.deepEqual(DENSE_GROUPS.at(-1).extendedFields, [58, 59, 60, 61, 62, 63]);
  assert.equal(Object.keys(DENSE_GROUP_SPECS).length, 19);
  assert.equal(DENSE_GROUP_SPECS[-16].length, 11);
  assert.equal(DENSE_GROUP_SPECS[152].length, 9);
  assert.equal(Object.keys(DENSE_GROUP_COMPONENTS).length, 19);
  for (const group of DENSE_GROUPS) {
    const specs = DENSE_GROUP_SPECS[group.offset];
    assert.ok(specs, `missing specs for group ${group.offset}`);
    const expected = [...group.fields, ...(group.extendedFields ?? [])];
    assert.deepEqual(specs.map(spec => spec.field), expected, `fields for group ${group.offset}`);
  }
});

test('dense groups follow the component-presence mask', () => {
  assert.equal(DENSE_GROUP_COMPONENTS[72], 6);
  assert.equal(DENSE_GROUP_COMPONENTS[152], 30);
  assert.ok(densePresentForMask(1 << 5).has(72));
  assert.ok(!densePresentForMask(1 << 5).has(120));
  assert.ok(densePresentForMask(1 << 29).has(152));
  assert.ok(densePresentForMask(1 << 7).has(-8));
  assert.ok(densePresentForMask(1 << 14).has(-15));
  assert.ok(densePresentForMask(1 << 26).has(-27));
  assert.equal(DENSE_GROUP_SPECS[152].length, 9);
  assert.equal(Object.keys(DENSE_GROUP_COMPONENTS).length, 19);
  assert.equal(DENSE_GROUP_SPECS[152].slice(0, 3).length, 3);
});

test('dense group 52 decoder reads two byte fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroup52Decoder } = await import('/state/snapshot.js');
    const bytes = new Uint8Array([1, 41, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x11, 0x22]);
    const snapshot = new DenseGroup52Decoder().decode(bytes);
    return snapshot?.entities.map(entity => ({ dense: entity.denseByteFields, components: entity.components })) ?? null;
  });
  await page.close();
  assert.deepEqual(result, [{ dense: { 22: 0x11, 54: 0x22 }, components: { 670: { 8: 0x11, 9: 0x22 } } }]);
});

test('dense byte group decoder reads configured fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseByteGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 42, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x33]);
    const snapshot = new DenseByteGroupDecoder([36]).decode(packet);
    return snapshot?.entities.map(entity => entity.denseByteFields) ?? null;
  });
  await page.close();
  assert.deepEqual(result, [{ 36: 0x33 }]);
});

test('dense float group decoder reads configured fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseFloatGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 43, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0, 0, 0xA0, 0x3F, 0, 0, 0x20, 0x40]);
    const snapshot = new DenseFloatGroupDecoder([53, 55]).decode(packet);
    return snapshot?.entities.map(entity => entity.denseFields) ?? null;
  });
  await page.close();
  assert.deepEqual(result, [{ 53: 1.25, 55: 2.5 }]);
});

test('dense string and mixed groups decode by spec', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseStringGroupDecoder, DenseGroupDecoder } = await import('/state/snapshot.js');
    const stringPacket = new Uint8Array([1, 44, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x61, 0x62, 0x63, 0]);
    const mixedPacket = new Uint8Array([1, 45, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0, 0x40, 0, 0, 0xC0, 0x3F, 0, 0, 0x20, 0x40]);
    const stringSnapshot = new DenseStringGroupDecoder([48]).decode(stringPacket);
    const mixedSnapshot = new DenseGroupDecoder([
      { field: 8, type: 'angle' }, { field: 28, type: 'f32' }, { field: 49, type: 'f32' },
    ]).decode(mixedPacket);
    return {
      string: stringSnapshot?.entities.map(entity => entity.denseFields) ?? null,
      mixed: mixedSnapshot?.entities.map(entity => entity.denseFields) ?? null,
    };
  });
  await page.close();
  assert.deepEqual(result, {
    string: [{ 48: 'abc' }],
    mixed: [{ 8: 0x4000, 28: 1.5, 49: 2.5 }],
  });
});

test('dense group 152 base fields decode', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 46, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 1, 2, 3, 0xAC, 2]);
    const snapshot = new DenseGroupDecoder([
      { field: 2, type: 'byte' }, { field: 26, type: 'byte' },
      { field: 31, type: 'byte' }, { field: 58, type: 'varint' },
    ]).decode(packet);
    return snapshot?.entities.map(entity => entity.denseFields) ?? null;
  });
  await page.close();
  assert.deepEqual(result, [{ 2: 1, 26: 2, 31: 3, 58: 300 }]);
});

test('dense group 152 extended fields decode', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 47, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 126,
      1, 2, 3, 0xAC, 2, 0, 0, 0xC0, 0x3F,
      ...Array.from({ length: 16 }, (_, index) => index),
      ...Array.from({ length: 8 }, (_, index) => 100 + index),
      7, 8,
    ]);
    const snapshot = new DenseGroupDecoder([
      { field: 2, type: 'byte' }, { field: 26, type: 'byte' },
      { field: 31, type: 'byte' }, { field: 58, type: 'varint' },
      { field: 59, type: 'f32' }, { field: 60, type: 'byteArray16' },
      { field: 61, type: 'shortArray8' }, { field: 62, type: 'byte' },
      { field: 63, type: 'byte' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, {
    2: 1, 26: 2, 31: 3, 58: 300, 59: 1.5,
    60: Array.from({ length: 16 }, (_, index) => index),
    61: Array.from({ length: 8 }, (_, index) => 100 + index),
    62: 7, 63: 8,
  });
});

test('dense bit group packs bits', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 48, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 1]);
    const snapshot = new DenseGroupDecoder([
      { field: 29, type: 'bit' }, { field: 40, type: 'bit' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 29: 1, 40: 0 });
});

test('dense float+bit group decodes', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 49, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0, 0, 0x60, 0x40, 1]);
    const snapshot = new DenseGroupDecoder([
      { field: 13, type: 'f32' }, { field: 37, type: 'bit' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 13: 3.5, 37: 1 });
});

test('dense reference group decodes', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 50, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22]);
    const snapshot = new DenseGroupDecoder([
      { field: 23, type: 'reference' }, { field: 57, type: 'reference' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 23: 0x11111111, 57: 0x22222222 });
});

test('dense group 72 mixed fields decode', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 51, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62,
      9, 0, 0, 0xA0, 0x3F, 0x6E, 0,
      ...Array.from({ length: 10 }, (_, index) => index),
      20, 0, 0, 0x20, 0x40, 0, 0, 0x60, 0x40, 0, 0, 0x90, 0x40,
      34, 47, 0xCD, 0xAB, 0, 0,
    ]);
    const snapshot = new DenseGroupDecoder([
      { field: 1, type: 'byte' }, { field: 5, type: 'f32' },
      { field: 6, type: 'string' }, { field: 16, type: 'byteArray10' },
      { field: 20, type: 'byte' }, { field: 21, type: 'f32' },
      { field: 24, type: 'f32' }, { field: 32, type: 'f32' },
      { field: 34, type: 'byte' }, { field: 47, type: 'byte' },
      { field: 56, type: 'reference' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, {
    1: 9, 5: 1.25, 6: 'n', 16: Array.from({ length: 10 }, (_, index) => index),
    20: 20, 21: 2.5, 24: 3.5, 32: 4.5, 34: 34, 47: 47, 56: 0xABCD,
  });
});

test('dense group -27 mixed fields decode', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 52, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62,
      0x61, 0, 0xAC, 2, 0, 0, 0, 0, 0, 0, 0xF8, 0x3F,
      0x62, 0, 0, 0, 0x20, 0x40, 1, 0, 0, 0, 0, 0, 0, 0x0C, 0x40, 0x90, 3, 5, 6,
    ]);
    const snapshot = new DenseGroupDecoder([
      { field: 4, type: 'string' }, { field: 15, type: 'varint' },
      { field: 18, type: 'f64' }, { field: 25, type: 'string' },
      { field: 27, type: 'f32' }, { field: 33, type: 'bit' },
      { field: 35, type: 'f64' }, { field: 41, type: 'varint' },
      { field: 44, type: 'varint' }, { field: 51, type: 'varint' },
    ]).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 4: 'a', 15: 300, 18: 1.5, 25: 'b', 27: 2.5, 33: 1, 35: 3.5, 41: 400, 44: 5, 51: 6 });
});

test('dense group -16 mixed arrays decode', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DenseGroupDecoder } = await import('/state/snapshot.js');
    const varint = (value) => {
      const out = [];
      do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; out.push(byte); } while (value);
      return out;
    };
    const body = [1, 53, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62];
    for (let index = 0; index < 10; ++index) body.push((0x100 + index) & 0xff, ((0x100 + index) >> 8) & 0xff, 0, 0);
    for (let index = 0; index < 10; ++index) body.push(0x73, 0x30 + index, 0);
    body.push(1, 2, 0, 0, 0xC0, 0x3F, ...varint(300));
    for (let index = 0; index < 10; ++index) body.push(...varint(400 + index));
    body.push(0, 0, 0x20, 0x40, 0, 0, 0x60, 0x40, 46, ...varint(500));
    const snapshot = new DenseGroupDecoder([
      { field: 3, type: 'handleArray10' }, { field: 10, type: 'stringArray10' },
      { field: 11, type: 'byte' }, { field: 12, type: 'byte' },
      { field: 19, type: 'f32' }, { field: 30, type: 'varint' },
      { field: 39, type: 'varintArray10' }, { field: 42, type: 'f32' },
      { field: 45, type: 'f32' }, { field: 46, type: 'byte' },
      { field: 52, type: 'varint' },
    ]).decode(new Uint8Array(body));
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, {
    3: Array.from({ length: 10 }, (_, index) => 0x100 + index),
    10: Array.from({ length: 10 }, (_, index) => `s${index}`),
    11: 1, 12: 2, 19: 1.5, 30: 300,
    39: Array.from({ length: 10 }, (_, index) => 400 + index),
    42: 2.5, 45: 3.5, 46: 46, 52: 500,
  });
});

test('dense plan decoder respects present groups', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const plans = [
      { offset: 52, specs: [{ field: 22, type: 'byte' }, { field: 54, type: 'byte' }] },
      { offset: 56, specs: [{ field: 36, type: 'byte' }] },
    ];
    const one = new Uint8Array([1, 60, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x11, 0x22]);
    const both = new Uint8Array([1, 61, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x11, 0x22, 0x33]);
    return {
      one: new DensePlanDecoder(plans, new Set([52])).decode(one)?.entities[0]?.denseFields ?? null,
      both: new DensePlanDecoder(plans, new Set([52, 56])).decode(both)?.entities[0]?.denseFields ?? null,
    };
  });
  await page.close();
  assert.deepEqual(result, {
    one: { 22: 0x11, 54: 0x22 },
    both: { 22: 0x11, 54: 0x22, 36: 0x33 },
  });
});

test('dense plan decoder handles angle and floats', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 62, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0, 0x40, 0, 0, 0xC0, 0x3F, 0, 0, 0x20, 0x40]);
    const snapshot = new DensePlanDecoder([{
      offset: 120,
      specs: [{ field: 8, type: 'angle' }, { field: 28, type: 'f32' }, { field: 49, type: 'f32' }],
    }], new Set([120])).decode(packet);
    return snapshot?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 8: 0x4000, 28: 1.5, 49: 2.5 });
});

test('dense plan decoder reads multiple byte groups in one entry', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const plans = [
      { offset: 52, specs: [{ field: 22, type: 'byte' }, { field: 54, type: 'byte' }] },
      { offset: 56, specs: [{ field: 36, type: 'byte' }] },
    ];
    const packet = new Uint8Array([1, 63, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x11, 0x22, 0x33]);
    return new DensePlanDecoder(plans, new Set([52, 56])).decode(packet)?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 22: 0x11, 54: 0x22, 36: 0x33 });
});

test('dense plan decodes live byte values for groups 56/68', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const plans = [
      { offset: 56, specs: [{ field: 36, type: 'byte' }] },
      { offset: 68, specs: [{ field: 9, type: 'byte' }] },
    ];
    const packet = new Uint8Array([1, 64, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 0x33, 0x44]);
    return new DensePlanDecoder(plans, new Set([56, 68])).decode(packet)?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 36: 0x33, 9: 0x44 });
});

test('dense plan decodes live bit group 124', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([1, 69, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 3]);
    return new DensePlanDecoder([{
      offset: 124, specs: [{ field: 29, type: 'bit' }, { field: 40, type: 'bit' }],
    }], new Set([124])).decode(packet)?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 29: 1, 40: 1 });
});

test('dense plan decodes live mixed group -27', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 70, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62,
      0x61, 0, 0xAC, 2, 0, 0, 0, 0, 0, 0, 0xF8, 0x3F,
      0x62, 0, 0, 0, 0x20, 0x40, 1, 0, 0, 0, 0, 0, 0, 0x0C, 0x40, 0x90, 3, 5, 6,
    ]);
    return new DensePlanDecoder([{
      offset: -27,
      specs: [
        { field: 4, type: 'string' }, { field: 15, type: 'varint' },
        { field: 18, type: 'f64' }, { field: 25, type: 'string' },
        { field: 27, type: 'f32' }, { field: 33, type: 'bit' },
        { field: 35, type: 'f64' }, { field: 41, type: 'varint' },
        { field: 44, type: 'varint' }, { field: 51, type: 'varint' },
      ],
    }], new Set([-27])).decode(packet)?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 4: 'a', 15: 300, 18: 1.5, 25: 'b', 27: 2.5, 33: 1, 35: 3.5, 41: 400, 44: 5, 51: 6 });
});

test('dense plan gates group 152 base fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const body = new Uint8Array([1, 76, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 62, 2, 26, 31]);
    return new DensePlanDecoder([{
      offset: 152,
      specs: [
        { field: 2, type: 'byte' }, { field: 26, type: 'byte' }, { field: 31, type: 'byte' },
        { field: 58, type: 'varint' }, { field: 59, type: 'f32' },
        { field: 60, type: 'byteArray16' }, { field: 61, type: 'shortArray8' },
        { field: 62, type: 'byte' }, { field: 63, type: 'byte' },
      ],
    }], new Set([152])).decode(body)?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 2: 2, 26: 26, 31: 31 });
});

test('dense plan decodes live group 152 extended fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { DensePlanDecoder } = await import('/state/snapshot.js');
    const varint = (value) => {
      const out = [];
      do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; out.push(byte); } while (value);
      return out;
    };
    const body = [1, 75, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 126, 2, 26, 31, 58];
    body.push(0, 0, 0xC0, 0x3F);
    for (let index = 0; index < 16; ++index) body.push(index);
    for (let index = 0; index < 8; ++index) body.push(...varint(0x100 + index));
    body.push(62, 63);
    return new DensePlanDecoder([{
      offset: 152,
      specs: [
        { field: 2, type: 'byte' }, { field: 26, type: 'byte' }, { field: 31, type: 'byte' },
        { field: 58, type: 'varint' }, { field: 59, type: 'f32' },
        { field: 60, type: 'byteArray16' }, { field: 61, type: 'shortArray8' },
        { field: 62, type: 'byte' }, { field: 63, type: 'byte' },
      ],
    }], new Set([152])).decode(new Uint8Array(body))?.entities[0]?.denseFields ?? null;
  });
  await page.close();
  assert.deepEqual(result, {
    2: 2, 26: 26, 31: 31, 58: 58, 59: 1.5,
    60: Array.from({ length: 16 }, (_, index) => index),
    61: Array.from({ length: 8 }, (_, index) => 0x100 + index),
    62: 62, 63: 63,
  });
});

test('original decoder mixes bare and dense updates', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { BareSnapshotDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 76, 4, 0, 2, 0,
      0x11, 0x11, 0x11, 0x11, 52, 0,
      0x22, 0x22, 0x22, 0x22, 62, 0x11, 0x22,
    ]);
    const snapshot = new BareSnapshotDecoder([
      { offset: 52, specs: [{ field: 22, type: 'byte' }, { field: 54, type: 'byte' }] },
    ], new Set([52])).decode(packet);
    return snapshot?.entities.map(entity => ({ handle: entity.handle, dense: entity.denseFields ?? null })) ?? null;
  });
  await page.close();
  assert.deepEqual(result, [
    { handle: 0x11111111, dense: null },
    { handle: 0x22222222, dense: { 22: 0x11, 54: 0x22 } },
  ]);
});

test('original decoder converts mask angle field 8 to radians', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { BareSnapshotDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 77, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 0, 0, 0, 0, 8, 0, 0x40, 0,
    ]);
    const snapshot = new BareSnapshotDecoder().decode(packet);
    return snapshot?.entities[0]?.angle ?? null;
  });
  await page.close();
  assert.ok(result !== null && Math.abs(result - Math.PI / 2) < 1e-4, String(result));
});

test('original decoder clamps out-of-range sparse fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { BareSnapshotDecoder } = await import('/state/snapshot.js');
    const bytes = new Uint8Array([1, 42, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 52, 64, 0x7A, 0]);
    return new BareSnapshotDecoder().decode(bytes)?.entities[0]?.byteField1 ?? null;
  });
  await page.close();
  assert.equal(result, 0x7A);
});

test('original decoder maps fields 5/24 to world position', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { BareSnapshotDecoder } = await import('/state/snapshot.js');
    const packet = new Uint8Array([
      1, 78, 4, 0, 1, 0, 0x78, 0x56, 0x34, 0x12, 55, 0, 0, 0, 0,
      5, 0, 0, 0x48, 0x41, 19, 0, 0, 0x0A, 0x42, 0,
    ]);
    const entity = new BareSnapshotDecoder().decode(packet)?.entities[0] ?? null;
    return entity ? { x: entity.x, y: entity.y, components: entity.components } : null;
  });
  await page.close();
  assert.deepEqual(result, {
    x: 12.5, y: 34.5,
    components: { 478: { 16: 12.5, 112: 34.5 } },
  });
});

test('WorldState.applyPartial preserves missing gameplay fields', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { WorldState } = await import('/state/world.js');
    const world = new WorldState();
    world.apply({ sequence: 1, serverTime: 0, entities: [
      { handle: 1, typeId: 3, x: 10, y: 20, angle: 0, health: 80, maxHealth: 100, flags: 5 },
    ] }, 0);
    world.applyPartial({ sequence: 2, serverTime: 0, entities: [
      { handle: 1, typeId: 0, x: 0, y: 0, angle: Math.PI / 2, health: 0, maxHealth: 0, flags: 0, angleField8: Math.PI / 2 },
    ] }, 100);
    const entity = world.get(1);
    return entity ? { x: entity.x, y: entity.y, health: entity.health, maxHealth: entity.maxHealth, flags: entity.flags, angle: entity.angle } : null;
  });
  await page.close();
  assert.deepEqual(result, { x: 10, y: 20, health: 80, maxHealth: 100, flags: 5, angle: Math.PI / 2 });
});

test('WorldState.applyPartial merges dense fields without dropping position', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { WorldState } = await import('/state/world.js');
    const world = new WorldState();
    world.apply({ sequence: 1, serverTime: 0, entities: [
      { handle: 2, typeId: 3, x: 1, y: 2, angle: 0, health: 50, maxHealth: 60, flags: 4, denseFields: { 5: 1, 24: 2, 8: 0 } },
    ] }, 0);
    world.applyPartial({ sequence: 2, serverTime: 0, entities: [
      { handle: 2, typeId: 0, x: 0, y: 0, angle: 0, health: 0, maxHealth: 0, flags: 0, denseFields: { 8: 0x4000 } },
    ] }, 100);
    const entity = world.get(2);
    return entity ? { x: entity.x, y: entity.y, angle: entity.angle, dense: entity.denseFields } : null;
  });
  await page.close();
  assert.deepEqual(result, { x: 1, y: 2, angle: 0x4000 * (2 * Math.PI / 65535), dense: { 5: 1, 24: 2, 8: 0x4000 } });
});

test('WorldState.applyPartial merges scalar field records', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { WorldState } = await import('/state/world.js');
    const world = new WorldState();
    world.apply({ sequence: 1, serverTime: 0, entities: [
      { handle: 3, typeId: 3, x: 5, y: 6, angle: 0, health: 10, maxHealth: 10, flags: 1, floatFields: { 5: 5, 24: 6 }, byteFields: { 1: 7 } },
    ] }, 0);
    world.applyPartial({ sequence: 2, serverTime: 0, entities: [
      { handle: 3, typeId: 0, x: 0, y: 0, angle: 0, health: 0, maxHealth: 0, flags: 0, floatFields: { 7: 1.5 }, byteFields: { 2: 9 } },
    ] }, 100);
    const entity = world.get(3);
    return entity ? { float: entity.floatFields, byte: entity.byteFields, x: entity.x, y: entity.y } : null;
  });
  await page.close();
  assert.deepEqual(result, { float: { 5: 5, 24: 6, 7: 1.5 }, byte: { 1: 7, 2: 9 }, x: 5, y: 6 });
});

test('WorldState.applyPartial merges component offsets', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const { WorldState } = await import('/state/world.js');
    const world = new WorldState();
    world.apply({ sequence: 1, serverTime: 0, entities: [
      { handle: 4, typeId: 3, x: 0, y: 0, angle: 0, health: 1, maxHealth: 1, flags: 1, components: { 478: { 16: 1 } } },
    ] }, 0);
    world.applyPartial({ sequence: 2, serverTime: 0, entities: [
      { handle: 4, typeId: 0, x: 0, y: 0, angle: 0, health: 0, maxHealth: 0, flags: 0, components: { 478: { 112: 2 }, 609: { 8: 0.5 } } },
    ] }, 100);
    return world.get(4)?.components ?? null;
  });
  await page.close();
  assert.deepEqual(result, { 478: { 16: 1, 112: 2 }, 609: { 8: 0.5 } });
});
