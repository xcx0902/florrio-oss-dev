import assert from 'node:assert/strict';
import binaryen from 'binaryen';
import { probeGlue } from './glue.mjs';

const rarities = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const petalSamples = [
  { id: 1, name: 'Basic', countCandidate: 1 },
  { id: 5, name: 'Rose', countCandidate: 1 },
  { id: 10, name: 'Grapes', countCandidate: 4 },
  { id: 12, name: 'Faster', countCandidate: 1 },
  { id: 20, name: 'Web', countCandidate: 1 },
  { id: 22, name: 'Leaf', countCandidate: 1 },
  { id: 44, name: 'Peas', countCandidate: 4 },
];

function readString(heap, address) {
  assert.ok(address > 0 && address < heap.length);
  const end = heap.indexOf(0, address);
  assert.ok(end >= address);
  return heap.toString('utf8', address, end);
}

function readMobs(js, wasm, transport) {
  // $22 lazily initializes the original mob gallery records. Expose only this
  // function in a research copy. The reference browser always receives the original.
  const module = binaryen.readBinary(wasm);
  let instrumented;
  try {
    module.addFunctionExport('22', 'w0MobGalleryRecord');
    instrumented = module.emitBinary();
  } finally {
    module.dispose();
  }
  const { instance } = probeGlue(js, instrumented, transport);
  const { Jf: memory, w0MobGalleryRecord: record } = instance.exports;
  assert.equal(record(0), 0);
  assert.equal(record(36), 0);
  const heap = Buffer.from(memory.buffer);
  const entries = Array.from({ length: 35 }, (_, index) => {
    const id = index + 1;
    const address = record(id);
    assert.equal(address, 909552 + 216 * id);
    const nameAddress = heap.readUInt32LE(address);
    const descriptionCount = heap.readUInt32LE(address + 4);
    assert.ok(descriptionCount <= 4);
    return {
      id,
      address,
      name: readString(heap, nameAddress),
      descriptions: Array.from({ length: descriptionCount }, (_, i) =>
        readString(heap, heap.readUInt32LE(address + 8 + 4 * i)),
      ),
      f32At24: heap.readFloatLE(address + 24),
      f32At28: heap.readFloatLE(address + 28),
      gallerySlots: rarities.map((name, rarity) => ({
        rarity,
        name,
        rawCount: heap.readUInt32LE(address + 120 + 12 * rarity),
      })),
    };
  });
  assert.deepEqual(
    [entries[2].name, entries[10].name, entries[20].name],
    ['Ladybug', 'Hornet', 'Spider'],
  );
  return { accessor: '$22', researchCopy: true, stride: 216, entries };
}

export function readCatalog(probe, js, wasm, transport) {
  const { instance, alloc } = probe;
  const { Jf: memory, bg: table, Mf: free } = instance.exports;
  const heap = Buffer.from(memory.buffer);
  const u32 = (address) => heap.readUInt32LE(address);
  const f32 = (address) => heap.readFloatLE(address);
  const string = (address) => readString(heap, address);
  const petals = Array.from({ length: 46 }, (_, id) => {
    const address = 829696 + 24 * id;
    return {
      id,
      address,
      name: string(u32(address)),
      longName: string(u32(address + 4)),
      f32At8: f32(address + 8),
      flagsAt12: heap.readUInt16LE(address + 12),
      orderAt20: u32(address + 20),
    };
  });
  assert.equal(petals[0].name, 'None');
  assert.equal(u32(829696 + 24 * petals.length), 0);

  const input = alloc(8);
  const descriptor = alloc(8);
  table.get(1019)(descriptor, 0);
  assert.equal(u32(u32(descriptor)), 30790);
  const offsets = [8, 12, 16, 20, 24];
  const constructors = petalSamples.map(({ id, name, countCandidate }) => {
    assert.equal(petals[id].name, name);
    // The registry's +20 field is the constructor table slot, not UI order.
    // Hand-written slot numbers previously selected the following petal.
    const slot = petals[id].orderAt20;
    let vtable;
    let descriptions;
    const values = rarities.map((rarityName, rarity) => {
      heap.writeUInt16LE(id | (rarity << 8), input);
      const record = table.get(slot)(input);
      vtable ??= u32(record);
      assert.equal(u32(record), vtable);
      const raw = offsets.map((offset) => f32(record + offset));
      table.get(u32(vtable + 8))(descriptor, record);
      descriptions ??= Array.from({ length: u32(descriptor + 4) }, (_, i) => {
        const address = u32(u32(descriptor) + i * 4);
        return { address, text: string(address) };
      });
      table.get(u32(vtable + 4))(record);
      return { rarity, name: rarityName, raw };
    });
    return {
      id,
      name,
      slot,
      vtable,
      countCandidate,
      values,
      descriptions,
      authoritativeValues: null,
    };
  });
  free(input);
  free(descriptor);
  const basic = constructors[0];
  assert.deepEqual(
    basic.values.map(({ raw }) => raw[1]),
    [10, 13, 18, 24, 32, 40],
  );
  assert.deepEqual(
    basic.values.map(({ raw }) => raw[2]),
    [10, 12, 14, 17, 21, 25],
  );
  assert.equal(basic.descriptions[0].text, 'A nice petal, not too strong but not too weak');

  return {
    scope: '原客户端图鉴和构造器',
    petalRegistry: { stride: 24, entries: petals },
    mobRegistry: readMobs(js, wasm, transport),
    rarities: rarities.map((name, id) => ({ id, name })),
    constructors: {
      rawF32Offsets: offsets,
      entries: constructors,
      basicEvidence: {
        function: '$1169',
        descriptionSlot: 1019,
        fieldMeaning: {
          12: 'Damage，已由原版 $96 tooltip 确认',
          16: 'Health，已由原版 $96 tooltip 确认',
        },
        preRoundMultipliers: {
          12: rarities.map((_, i) => f32(56656 + 4 * i)),
          16: rarities.map((_, i) => f32(56688 + 4 * i)),
        },
        rounding:
          'f32 乘积经 $23 就近取整，半整数远离零，+16 下限为 1。Damage/Health 已由完整原版 tooltip 确认；历史服务器算法另行取证。',
      },
    },
  };
}
