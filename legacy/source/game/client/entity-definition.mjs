/**
 * Complete original client entity-definition functions 391 and 441.
 *
 * 441 writes one 116-byte catalog record. 391 is the one-time initializer for
 * the whole catalog: type 0 is the "None" record, types 1..22 are the shipped
 * entities, and the returned pointer is 384096 + 116 * type for those types.
 *
 * The catalog table below is the original initialized state. Name and
 * description fields retain the original C-string pointers because the game
 * reads those strings directly; the adjacent comments are the bytes at those
 * pointers. The entry values are the original eight-byte drops vector values.
 */
export const functionIds = Object.freeze([391, 441]);

const CATALOG_BASE = 384096;
const CATALOG_STRIDE = 116;
const INITIALIZATION_GUARD = 386764;
const INITIALIZATION_FRAME_SIZE = 2192;

/*
 * Native 391 materializes every 441 argument template in its dead 2192-byte
 * stack frame. The frame is not game state, but the original leaves it behind,
 * so exact-memory composition checks observe it. Each run is an `[offset, hex]`
 * pair of bytes written by the original; bytes outside the runs stay untouched.
 * The compiler also stored 36 base-relative pointers, listed separately and
 * rebased when the frame is recreated.
 */
const INITIALIZATION_SCRATCH_RUNS = Object.freeze([
  [8, '00000000010000000000000001000000000000000100000000000000010000000000000001000000000000000100000000000000010000000000000001000000000000000100000000000000010000000000000001000000000000000100000000000000010000000000000001000000000000000100000000000000010000000000000001000000000000000100000000'],
  [156, '080000000000000007000000000000000e000000000000001d000000000000001e00000000000000'],
  [220, 'b86200000000000001000000f43a000000'],
  [240, '56660000'],
  [256, '010000000000a04000'],
  [268, '060000000000000018000000000000001000000000000000090000000000000012000000000000001100000000000000'],
  [332, 'e7000000e6000000010000'],
  [344, 'cdcc4c3e'],
  [352, '00'],
  [356, '0f0000000000000018000000000000000900000000000000120000000000000011000000000000001c00000000000000'],
  [420, 'bb6e0000000000000100000000'],
  [436, '0500000000000000'],
  [500, '876f000000000000010000007c42000000'],
  [520, '8a660000'],
  [536, '020000000000a04000'],
  [612, 'e100000000000000001111'],
  [624, '0000803f'],
  [632, '00'],
  [636, '08000000000000000c0000000000000022000000000000001100000000000000'],
  [700, '8a66000000000000010000008142000000'],
  [720, '376a0000'],
  [736, '010000000000404000'],
  [812, 'de00000000000000000f0f'],
  [824, '0000803f'],
  [832, '00'],
  [836, '0200000000000000200000000000000010000000000000000b000000000000000c000000000000001100000000000000'],
  [900, '376a000000000000010000000022000000'],
  [920, '2e670000'],
  [936, '010000000000204100'],
  [948, '0a0000000000000009000000000000001f00000000000000120000000000000014000000000000001900000000000000'],
  [1012, 'db000000da000000010000'],
  [1024, '00000040'],
  [1032, '00'],
  [1036, '0800000000000000090000000000000011000000000000001700000000000000'],
  [1100, '5d630000000000000100000000'],
  [1116, '0800000000000000090000000000000024000000000000001100000000000000'],
  [1180, '9c690000000000000100000000'],
  [1196, '080000000000000009000000000000001600000000000000'],
  [1260, 'e8640000000000000100000000'],
  [1276, '100000000000000009000000000000000e00000000000000110000000000000016000000000000001b00000000000000'],
  [1340, '1f630000000000000100000000'],
  [1356, '1000000000000000080000000000000009000000000000000e000000000000001100000000000000'],
  [1420, '4d690000000000000100000000'],
  [1436, '02000000000000002000000000000000100000000000000011000000000000002600000000000000'],
  [1500, '686c0000000000000100000000'],
  [1516, '02000000000000002000000000000000100000000000000011000000000000002500000000000000'],
  [1580, 'b1660000000000000100000000'],
  [1596, '020000000000000007000000000000001000000000000000090000000000000012000000000000001f00000000000000'],
  [1660, 'cd6400000000000001000000ec3a000000'],
  [1680, '416b0000'],
  [1696, '030000000000484200'],
  [1708, '0600000000000000120000000000000018000000000000000f00000000000000'],
  [1772, 'c9000000c8000000010000'],
  [1784, '00002041'],
  [1792, '00'],
  [1796, '02000000000000000600000000000000100000000000000009000000000000001200000000000000'],
  [1860, '77660000000000000100000000'],
  [1876, '07000000000000000a000000000000000d0000000000000015000000000000002100000000000000'],
  [1940, 'b6650000000000000100000000'],
  [1956, '030000000000000004000000000000001a00000000000000'],
  [2020, '3f680000000000000100000000'],
  [2036, '020000000000000003000000000000000400000000000000'],
  [2100, '1b6a0000000000000100000000'],
  [2180, '615b00000000000001000000'],
]);

const INITIALIZATION_SCRATCH_POINTERS = Object.freeze([
  [8, 220],
  [16, 420],
  [24, 500],
  [32, 700],
  [40, 900],
  [48, 1100],
  [56, 1180],
  [64, 1260],
  [72, 1340],
  [80, 1420],
  [88, 1500],
  [96, 1580],
  [104, 1660],
  [112, 1860],
  [120, 1940],
  [128, 2020],
  [136, 2100],
  [144, 2180],
  [224, 220],
  [424, 420],
  [504, 500],
  [704, 700],
  [904, 900],
  [1104, 1100],
  [1184, 1180],
  [1264, 1260],
  [1344, 1340],
  [1424, 1420],
  [1504, 1500],
  [1584, 1580],
  [1664, 1660],
  [1864, 1860],
  [1944, 1940],
  [2024, 2020],
  [2104, 2100],
  [2184, 2180],
]);

/** @type {ReadonlyArray<{namePointer:number,name:string,descriptions:Array<[number,string]>,shape:number,scale:number,entries:bigint[],callbacks:[number,number],flags:number,marker:number,tailScale:number,rawTail?:bigint}>} */
const entityDefinitions = Object.freeze([
  {
    namePointer: 16292, name: 'None',
    descriptions: [[23393, '???']],
    shape: 0, scale: 0, entries: [], callbacks: [0, 0],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 14105, name: 'Rock',
    descriptions: [[27163, "A rock. It doesn't do much."]],
    shape: 0, scale: 1, entries: [2n, 3n, 4n], callbacks: [192, 193],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 12654, name: 'Boulder',
    descriptions: [[26687, "A bigger rock. It doesn't do much either."]],
    shape: 1, scale: 10, entries: [3n, 4n, 26n], callbacks: [194, 195],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 9630, name: 'Cactus',
    descriptions: [[26038, 'Avoid touching it, it hurts.']],
    shape: 0, scale: 2, entries: [7n, 10n, 13n, 21n, 33n], callbacks: [196, 197],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 15092, name: 'Ladybug',
    descriptions: [[26231, 'Cute and harmless.']],
    shape: 0, scale: 3, entries: [2n, 6n, 16n, 9n, 18n], callbacks: [198, 199],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 15084, name: 'Massive Ladybug',
    descriptions: [[27457, 'This one is really big, but still cute.']],
    shape: 3, scale: 50, entries: [6n, 18n, 24n, 15n], callbacks: [201, 200],
    flags: 1, marker: 0, tailScale: 10, rawTail: 0x4120000000000001n,
  },
  {
    namePointer: 16961, name: 'Bee',
    descriptions: [[25805, "It stings. Don't touch it."]],
    shape: 0, scale: 3, entries: [2n, 7n, 16n, 9n, 18n, 31n], callbacks: [202, 203],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 8384, name: 'Baby Ant',
    descriptions: [[26289, 'Weak and defenseless, but big dreams.']],
    shape: 0, scale: 1, entries: [2n, 32n, 16n, 17n, 37n], callbacks: [204, 205],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 8393, name: 'Worker Ant',
    descriptions: [[27752, "It's a bit temperamental, probably from working all the time."]],
    shape: 0, scale: 2, entries: [2n, 32n, 16n, 17n, 38n], callbacks: [206, 207],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 8404, name: 'Soldier Ant',
    descriptions: [[26957, "It's got wings and it's ready to use them."]],
    shape: 1, scale: 5, entries: [16n, 8n, 9n, 14n, 17n], callbacks: [208, 209],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 8416, name: 'Queen Ant',
    descriptions: [[25375, "You must have done something really bad if she's chasing you."]],
    shape: 2, scale: 20, entries: [16n, 9n, 14n, 17n, 22n, 27n], callbacks: [210, 211],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 16453, name: 'Ant Hole',
    descriptions: [[25832, "Ants go in, and come out. Can't explain that."]],
    shape: 2, scale: 20, entries: [8n, 9n, 22n], callbacks: [212, 213],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 16413, name: 'Beetle',
    descriptions: [[27036, "It's hungry and flowers are its favorite meal."]],
    shape: 1, scale: 5, entries: [8n, 9n, 36n, 17n], callbacks: [214, 215],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 16405, name: 'Massive Beetle',
    descriptions: [[25437, 'Someone overfed this one, you might be next.']],
    shape: 2, scale: 50, entries: [8n, 9n, 17n, 23n], callbacks: [216, 217],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 8704, name: 'Hornet',
    descriptions: [[26414, "These aren't quite as nice as the little bees."]],
    shape: 1, scale: 10, entries: [10n, 9n, 31n, 18n, 20n, 25n], callbacks: [219, 218],
    flags: 1, marker: 0, tailScale: 2, rawTail: 0x4000000000000001n,
  },
  {
    namePointer: 17025, name: 'Centipede',
    descriptions: [[27191, "It's just there doing its thing."]],
    shape: 1, scale: 3, entries: [2n, 32n, 16n, 11n, 12n, 17n], callbacks: [220, 221],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    // The original writes this variant through its 116-byte record copy path,
    // which leaves flags 0x0f00 and marker 0x0f instead of the normal 1/0.
    namePointer: 17025, name: 'Centipede',
    descriptions: [[27191, "It's just there doing its thing."]],
    shape: 1, scale: 3, entries: [], callbacks: [222, 0],
    flags: 0x0f00, marker: 0x0f, tailScale: 1, rawTail: 0x3f800000000f0f00n,
  },
  {
    namePointer: 17020, name: 'Evil Centipede',
    descriptions: [[26250, 'This one loves flowers.']],
    shape: 2, scale: 5, entries: [8n, 12n, 34n, 17n], callbacks: [223, 224],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    // As with type 16, the record copy path preserves 0x1100/0x11 here.
    namePointer: 17020, name: 'Evil Centipede',
    descriptions: [[26250, 'This one loves flowers.']],
    shape: 2, scale: 5, entries: [], callbacks: [225, 0],
    flags: 0x1100, marker: 0x11, tailScale: 1, rawTail: 0x3f80000000111100n,
  },
  {
    namePointer: 16241, name: 'Square',
    descriptions: [[28551, 'This shape... it looks familiar...']],
    shape: 5, scale: 10, entries: [5n], callbacks: [226, 227],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 15092, name: 'Ladybug',
    descriptions: [[28347, 'Cute and harmless... if left unprovoked.']],
    shape: 1, scale: 5, entries: [15n, 24n, 9n, 18n, 17n, 28n], callbacks: [228, 229],
    flags: 1, marker: 0, tailScale: 1,
  },
  {
    namePointer: 15092, name: 'Ladybug',
    descriptions: [[26198, 'Shiny, cute and mostly harmless.']],
    shape: 1, scale: 5, entries: [6n, 24n, 16n, 9n, 18n, 17n], callbacks: [231, 230],
    flags: 1, marker: 0, tailScale: 1 / 5, rawTail: 0x3e4ccccd00000001n,
  },
  {
    namePointer: 12662, name: 'Spider',
    descriptions: [[25272, 'Spooky.']],
    shape: 1, scale: 5, entries: [8n, 7n, 14n, 29n, 30n], callbacks: [232, 233],
    flags: 1, marker: 0, tailScale: 1,
  },
].map(spec => Object.freeze(spec)));

export function createEntityDefinitionHooks(runtime) {
  let buffer, view;
  function refresh() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
  }
  function location(base, size, offset = 0) {
    refresh();
    const address = (base + offset) >>> 0;
    if (address + size > view.byteLength)
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    return address;
  }
  function readU8(base) { const at = location(base, 1); return view.getUint8(at); }
  function readU16(base) { const at = location(base, 2); return view.getUint16(at, true); }
  function readU32(base) { const at = location(base, 4); return view.getUint32(at, true); }
  function readU64(base) { const at = location(base, 8); return view.getBigUint64(at, true); }
  function writeU8(base, value) { const at = location(base, 1); view.setUint8(at, value); }
  function writeU16(base, value) { const at = location(base, 2); view.setUint16(at, value, true); }
  function writeU32(base, value) { const at = location(base, 4); view.setUint32(at, value, true); }
  function writeU64(base, value) { const at = location(base, 8); view.setBigUint64(at, value, true); }
  function writeF32(base, value) {
    const at = location(base, 4), number = Number(value);
    // The wasm f32 boundary canonicalizes NaN, including ToNumber(undefined).
    view.setFloat32(at, Number.isNaN(number) ? NaN : number, true);
  }

  /** Original441: write one entity catalog record, preserving copy and trap order. */
  function initializeEntityDefinition(destination, name, descriptions, shape, scale, entries, firstCallback, secondCallback) {
    let p0 = destination >>> 0;
    writeU32(p0, name);
    const description = readU64(descriptions >>> 0);
    const descriptionCount = Number(description >> 32n) >>> 0;
    writeU8((p0 + 4) >>> 0, descriptionCount & 255);
    let source = Number(description & 0xffffffffn) >>> 0;
    let target = (p0 + 8) >>> 0;
    for (let index = 0; index < descriptionCount; index++) {
      writeU32(target, readU32(source));
      source = (source + 4) >>> 0;
      target = (target + 4) >>> 0;
    }

    p0 = destination >>> 0;
    writeU8((p0 + 32) >>> 0, 0);
    writeF32((p0 + 28) >>> 0, scale);
    writeU32((p0 + 24) >>> 0, shape);

    const p5 = entries >>> 0;
    const entryCount = readU8(p5);
    source = (p5 + 4) >>> 0;
    target = (p0 + 36) >>> 0;
    for (let index = 0; index < entryCount; index++) {
      writeU64(target, readU64(source));
      source = (source + 8) >>> 0;
      target = (target + 8) >>> 0;
    }

    p0 = destination >>> 0;
    writeF32((p0 + 112) >>> 0, 1);
    writeU8((p0 + 110) >>> 0, 0);
    writeU16((p0 + 108) >>> 0, 1);
    writeU32((p0 + 104) >>> 0, secondCallback);
    writeU32((p0 + 100) >>> 0, firstCallback);
    writeU8((p0 + 32) >>> 0, readU8(p5));
  }

  /** Write the exact fields present in one initialized catalog record. */
  function writeDefinition(destination, definition) {
    const p0 = destination >>> 0;
    writeU32(p0, definition.namePointer);
    writeU8((p0 + 4) >>> 0, definition.descriptions.length);
    for (let index = 0; index < definition.descriptions.length; index++)
      writeU32((p0 + 8 + index * 4) >>> 0, definition.descriptions[index][0]);
    writeU32((p0 + 24) >>> 0, definition.shape);
    writeF32((p0 + 28) >>> 0, definition.scale);
    writeU8((p0 + 32) >>> 0, definition.entries.length);
    for (let index = 0; index < definition.entries.length; index++)
      writeU64((p0 + 36 + index * 8) >>> 0, definition.entries[index]);
    writeU32((p0 + 100) >>> 0, definition.callbacks[0]);
    writeU32((p0 + 104) >>> 0, definition.callbacks[1]);
    if (definition.rawTail !== undefined) {
      // The 116-byte record copy path overwrites the complete tail, including
      // byte 111, which the ordinary 441 field stores leave untouched.
      writeU64((p0 + 108) >>> 0, definition.rawTail);
    } else {
      writeU16((p0 + 108) >>> 0, definition.flags);
      writeU8((p0 + 110) >>> 0, definition.marker);
      writeF32((p0 + 112) >>> 0, definition.tailScale);
    }
  }

  /** Recreate the dead argument frame native 391 leaves below its entry SP. */
  function writeInitializationScratch(base) {
    for (const [offset, bytes] of INITIALIZATION_SCRATCH_RUNS) {
      for (let index = 0; index < bytes.length; index += 2) {
        const value = Number.parseInt(bytes.slice(index, index + 2), 16);
        writeU8((base + offset + index / 2) >>> 0, value);
      }
    }
    for (const [offset, delta] of INITIALIZATION_SCRATCH_POINTERS)
      writeU32((base + offset) >>> 0, (base + delta) >>> 0);
  }

  /** 369 and 370 both allocate this 16-byte frame with three live fields. */
  function writeGuardOuterScratch(saved, address) {
    writeU32((saved - 16) >>> 0, address);
    writeU32((saved - 12) >>> 0, address);
    writeU32((saved - 8) >>> 0, (address + 1) >>> 0);
    writeU32((saved - 4) >>> 0, 0);
  }

  /** 369 additionally calls an atomic helper with its own 16-byte frame. */
  function writeGuardScratch(saved, address) {
    writeU32((saved - 24) >>> 0, address);
    writeGuardOuterScratch(saved, address);
  }

  /** Original 369 state machine used by the catalog's one-time guard. */
  function acquireStaticInitializationGuard(address) {
    const saved = runtime.stackPointer.value;
    // 369 allocates one 16-byte frame and its inner atomic helper another.
    runtime.stackPointer.value = (saved - 32) >>> 0;
    writeGuardScratch(saved, address);
    let acquired = 0;
    if (readU8(address) === 0) {
      const state = readU8((address + 1) >>> 0);
      if (state === 1) {
        acquired = 0;
      } else if ((state & 2) !== 0) {
        // Native `unreachable`; both frames remain allocated on a trap.
        throw new WebAssembly.RuntimeError('unreachable');
      } else {
        writeU8((address + 1) >>> 0, 2);
        acquired = 1;
      }
    }
    runtime.stackPointer.value = saved;
    return acquired;
  }

  /** Original370 commits the one-time initialization guard. */
  function releaseStaticInitializationGuard(address) {
    const saved = runtime.stackPointer.value;
    runtime.stackPointer.value = (saved - 16) >>> 0;
    writeGuardOuterScratch(saved, address);
    writeU8(address, 1);
    writeU8((address + 1) >>> 0, 1);
    runtime.stackPointer.value = saved;
  }

  /** Original391: lazily initialize the catalog, then look up one entity type. */
  function getEntityDefinition(type) {
    const rawType = type >>> 0;
    const entryStack = runtime.stackPointer.value;
    runtime.stackPointer.value = (entryStack - INITIALIZATION_FRAME_SIZE) >>> 0;
    if ((readU8(INITIALIZATION_GUARD) & 1) === 0 &&
        acquireStaticInitializationGuard(INITIALIZATION_GUARD)) {
      writeInitializationScratch((entryStack - INITIALIZATION_FRAME_SIZE) >>> 0);
      for (let index = 0; index < entityDefinitions.length; index++)
        writeDefinition(CATALOG_BASE + index * CATALOG_STRIDE, entityDefinitions[index]);
      releaseStaticInitializationGuard(INITIALIZATION_GUARD);
    }
    runtime.stackPointer.value = entryStack;

    const index = (rawType - 1) >>> 0;
    if ((index & 255) > 21) return 0;
    return (CATALOG_BASE + Math.imul(rawType, CATALOG_STRIDE)) >>> 0;
  }

  return Object.freeze({391: getEntityDefinition, 441: initializeEntityDefinition});
}
