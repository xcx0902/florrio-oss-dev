/** Recovered sp_server entity-definition catalog and lookup (original function 103).
 *
 * The server materialises its 23 entity records lazily on the first lookup.
 * A byte guard at 8551036 is acquired through the C++ static-initialisation
 * guard (function 32); the first acquirer builds the catalog in a 2192-byte
 * stack frame, then releases the guard (function 31). Records live at 8548368
 * with a 116-byte stride. The lookup itself masks `(id - 1) & 255` and rejects
 * slots above 21, so ids congruent to 1..22 modulo 256 alias onto the same
 * record; id 23 is built but not reachable through this lookup.
 *
 * Eighteen ordinary records are produced by initializeEntityDefinition
 * (function 56) from name/description/rarity/scale/component descriptors.
 * Five variants (Massive Ladybug, Hornet, the two extra centipedes and the
 * extra ladybug) are moved from a previously assembled record by function 166,
 * which is why their residual +108 text pointer and +112 scale are preserved.
 *
 * The stack frame is part of the observable guest state: the original leaves
 * all descriptor temporaries there after restoring the stack pointer. The
 * initializer below therefore writes the same descriptor pairs, description
 * arrays, component blocks and variant sources at their original frame
 * offsets before invoking the native record constructors. These offsets are
 * layout data, not a memory-simulation substitute: all catalog semantics are
 * expressed by the named records.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([103]);
export const dependencyIds = Object.freeze([31, 32, 56, 166]);

export const CATALOG_BASE = 8548368;
export const RECORD_BYTES = 116;
export const GUARD_ADDRESS = 8551036;
export const STACK_FRAME_BYTES = 2192;

const GUARD_RELEASE = 31;
const GUARD_ACQUIRE = 32;
const INITIALIZE_RECORD = 56;
const MOVE_RECORD = 166;

/** Component counters cleared by the original epilogue, in order. */
const CLEARED_COMPONENT_COUNTERS = Object.freeze([
  152, 352, 432, 632, 832, 1032, 1112, 1192, 1272, 1352, 1432,
  1512, 1592, 1792, 1872, 1952, 2032, 2112,
]);

/**
 * Catalog records in construction order. `name` and `descriptions` are
 * [stringPointer, text] pairs. `components` are [slot, flags] pairs copied to
 * record +36. `scaleBits` is the exact f32 bit pattern stored at record +28.
 * Standard records carry stack layout descriptors; variants carry the stack
 * source offset they are moved from.
 */
const RECORDS = Object.freeze([
  {
    "id": 1,
    "destination": 8548368,
    "kind": "standard",
    "name": [
      3220,
      "None"
    ],
    "descriptions": [
      [
        3610,
        "???"
      ]
    ],
    "rarity": 0,
    "scaleBits": 0,
    "entityType": 0,
    "components": [],
    "layout": {
      "descriptor": 144,
      "descriptionArray": 2180,
      "componentArray": 2112
    }
  },
  {
    "id": 2,
    "destination": 8548484,
    "kind": "standard",
    "name": [
      2768,
      "Rock"
    ],
    "descriptions": [
      [
        4180,
        "A rock. It doesn't do much."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1065353216,
    "entityType": 51,
    "components": [
      [
        2,
        0
      ],
      [
        3,
        0
      ],
      [
        4,
        0
      ]
    ],
    "layout": {
      "descriptor": 136,
      "descriptionArray": 2100,
      "componentArray": 2032
    }
  },
  {
    "id": 3,
    "destination": 8548600,
    "kind": "standard",
    "name": [
      2500,
      "Boulder"
    ],
    "descriptions": [
      [
        4048,
        "A bigger rock. It doesn't do much either."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1092616192,
    "entityType": 52,
    "components": [
      [
        3,
        0
      ],
      [
        4,
        0
      ],
      [
        26,
        0
      ]
    ],
    "layout": {
      "descriptor": 128,
      "descriptionArray": 2020,
      "componentArray": 1952
    }
  },
  {
    "id": 4,
    "destination": 8548716,
    "kind": "standard",
    "name": [
      2068,
      "Cactus"
    ],
    "descriptions": [
      [
        3858,
        "Avoid touching it, it hurts."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1073741824,
    "entityType": 53,
    "components": [
      [
        7,
        0
      ],
      [
        10,
        0
      ],
      [
        13,
        0
      ],
      [
        21,
        0
      ],
      [
        33,
        0
      ]
    ],
    "layout": {
      "descriptor": 120,
      "descriptionArray": 1940,
      "componentArray": 1872
    }
  },
  {
    "id": 5,
    "destination": 8548832,
    "kind": "standard",
    "name": [
      3013,
      "Ladybug"
    ],
    "descriptions": [
      [
        3920,
        "Cute and harmless."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1077936128,
    "entityType": 54,
    "components": [
      [
        2,
        0
      ],
      [
        6,
        0
      ],
      [
        16,
        0
      ],
      [
        9,
        0
      ],
      [
        18,
        0
      ]
    ],
    "layout": {
      "descriptor": 112,
      "descriptionArray": 1860,
      "componentArray": 1792
    }
  },
  {
    "id": 6,
    "destination": 8548948,
    "kind": "variant",
    "name": [
      3005,
      "Massive Ladybug"
    ],
    "descriptions": [
      [
        4241,
        "This one is really big, but still cute."
      ]
    ],
    "rarity": 3,
    "scaleBits": 1112014848,
    "entityType": 55,
    "components": [
      [
        6,
        0
      ],
      [
        18,
        0
      ],
      [
        24,
        0
      ],
      [
        15,
        0
      ]
    ],
    "sourceOffset": 1672,
    "variantTag": 1,
    "variantLevel": 0,
    "variantScaleBits": 1092616192
  },
  {
    "id": 7,
    "destination": 8549064,
    "kind": "standard",
    "name": [
      3388,
      "Bee"
    ],
    "descriptions": [
      [
        3785,
        "It stings. Don't touch it."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1077936128,
    "entityType": 56,
    "components": [
      [
        2,
        0
      ],
      [
        7,
        0
      ],
      [
        16,
        0
      ],
      [
        9,
        0
      ],
      [
        18,
        0
      ],
      [
        31,
        0
      ]
    ],
    "layout": {
      "descriptor": 104,
      "descriptionArray": 1660,
      "componentArray": 1592
    }
  },
  {
    "id": 8,
    "destination": 8549180,
    "kind": "standard",
    "name": [
      1928,
      "Baby Ant"
    ],
    "descriptions": [
      [
        3963,
        "Weak and defenseless, but big dreams."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1065353216,
    "entityType": 57,
    "components": [
      [
        2,
        0
      ],
      [
        32,
        0
      ],
      [
        16,
        0
      ],
      [
        17,
        0
      ],
      [
        37,
        0
      ]
    ],
    "layout": {
      "descriptor": 96,
      "descriptionArray": 1580,
      "componentArray": 1512
    }
  },
  {
    "id": 9,
    "destination": 8549296,
    "kind": "standard",
    "name": [
      1937,
      "Worker Ant"
    ],
    "descriptions": [
      [
        4281,
        "It's a bit temperamental, probably from working all the time."
      ]
    ],
    "rarity": 0,
    "scaleBits": 1073741824,
    "entityType": 58,
    "components": [
      [
        2,
        0
      ],
      [
        32,
        0
      ],
      [
        16,
        0
      ],
      [
        17,
        0
      ],
      [
        38,
        0
      ]
    ],
    "layout": {
      "descriptor": 88,
      "descriptionArray": 1500,
      "componentArray": 1432
    }
  },
  {
    "id": 10,
    "destination": 8549412,
    "kind": "standard",
    "name": [
      1948,
      "Soldier Ant"
    ],
    "descriptions": [
      [
        4090,
        "It's got wings and it's ready to use them."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1084227584,
    "entityType": 59,
    "components": [
      [
        16,
        0
      ],
      [
        8,
        0
      ],
      [
        9,
        0
      ],
      [
        14,
        0
      ],
      [
        17,
        0
      ]
    ],
    "layout": {
      "descriptor": 80,
      "descriptionArray": 1420,
      "componentArray": 1352
    }
  },
  {
    "id": 11,
    "destination": 8549528,
    "kind": "standard",
    "name": [
      1960,
      "Queen Ant"
    ],
    "descriptions": [
      [
        3678,
        "You must have done something really bad if she's chasing you."
      ]
    ],
    "rarity": 2,
    "scaleBits": 1101004800,
    "entityType": 60,
    "components": [
      [
        16,
        0
      ],
      [
        9,
        0
      ],
      [
        14,
        0
      ],
      [
        17,
        0
      ],
      [
        22,
        0
      ],
      [
        27,
        0
      ]
    ],
    "layout": {
      "descriptor": 72,
      "descriptionArray": 1340,
      "componentArray": 1272
    }
  },
  {
    "id": 12,
    "destination": 8549644,
    "kind": "standard",
    "name": [
      3272,
      "Ant Hole"
    ],
    "descriptions": [
      [
        3812,
        "Ants go in, and come out. Can't explain that."
      ]
    ],
    "rarity": 2,
    "scaleBits": 1101004800,
    "entityType": 61,
    "components": [
      [
        8,
        0
      ],
      [
        9,
        0
      ],
      [
        22,
        0
      ]
    ],
    "layout": {
      "descriptor": 64,
      "descriptionArray": 1260,
      "componentArray": 1192
    }
  },
  {
    "id": 13,
    "destination": 8549760,
    "kind": "standard",
    "name": [
      3265,
      "Beetle"
    ],
    "descriptions": [
      [
        4133,
        "It's hungry and flowers are its favorite meal."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1084227584,
    "entityType": 62,
    "components": [
      [
        8,
        0
      ],
      [
        9,
        0
      ],
      [
        36,
        0
      ],
      [
        17,
        0
      ]
    ],
    "layout": {
      "descriptor": 56,
      "descriptionArray": 1180,
      "componentArray": 1112
    }
  },
  {
    "id": 14,
    "destination": 8549876,
    "kind": "standard",
    "name": [
      3257,
      "Massive Beetle"
    ],
    "descriptions": [
      [
        3740,
        "Someone overfed this one, you might be next."
      ]
    ],
    "rarity": 2,
    "scaleBits": 1112014848,
    "entityType": 63,
    "components": [
      [
        8,
        0
      ],
      [
        9,
        0
      ],
      [
        17,
        0
      ],
      [
        23,
        0
      ]
    ],
    "layout": {
      "descriptor": 48,
      "descriptionArray": 1100,
      "componentArray": 1032
    }
  },
  {
    "id": 15,
    "destination": 8549992,
    "kind": "variant",
    "name": [
      2045,
      "Hornet"
    ],
    "descriptions": [
      [
        4001,
        "These aren't quite as nice as the little bees."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1092616192,
    "entityType": 64,
    "components": [
      [
        10,
        0
      ],
      [
        9,
        0
      ],
      [
        31,
        0
      ],
      [
        18,
        0
      ],
      [
        20,
        0
      ],
      [
        25,
        0
      ]
    ],
    "sourceOffset": 912,
    "variantTag": 1,
    "variantLevel": 0,
    "variantScaleBits": 1073741824
  },
  {
    "id": 16,
    "destination": 8550108,
    "kind": "standard",
    "name": [
      3397,
      "Centipede"
    ],
    "descriptions": [
      [
        4208,
        "It's just there doing its thing."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1077936128,
    "entityType": 65,
    "components": [
      [
        2,
        0
      ],
      [
        32,
        0
      ],
      [
        16,
        0
      ],
      [
        11,
        0
      ],
      [
        12,
        0
      ],
      [
        17,
        0
      ]
    ],
    "layout": {
      "descriptor": 40,
      "descriptionArray": 900,
      "componentArray": 832
    }
  },
  {
    "id": 17,
    "destination": 8550224,
    "kind": "variant",
    "name": [
      3397,
      "Centipede"
    ],
    "descriptions": [
      [
        4208,
        "It's just there doing its thing."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1077936128,
    "entityType": 66,
    "components": [],
    "sourceOffset": 712,
    "variantTag": 3840,
    "variantLevel": 15,
    "variantScaleBits": 1065353216
  },
  {
    "id": 18,
    "destination": 8550340,
    "kind": "standard",
    "name": [
      3392,
      "Evil Centipede"
    ],
    "descriptions": [
      [
        3939,
        "This one loves flowers."
      ]
    ],
    "rarity": 2,
    "scaleBits": 1084227584,
    "entityType": 67,
    "components": [
      [
        8,
        0
      ],
      [
        12,
        0
      ],
      [
        34,
        0
      ],
      [
        17,
        0
      ]
    ],
    "layout": {
      "descriptor": 32,
      "descriptionArray": 700,
      "componentArray": 632
    }
  },
  {
    "id": 19,
    "destination": 8550456,
    "kind": "variant",
    "name": [
      3392,
      "Evil Centipede"
    ],
    "descriptions": [
      [
        3939,
        "This one loves flowers."
      ]
    ],
    "rarity": 2,
    "scaleBits": 1084227584,
    "entityType": 68,
    "components": [],
    "sourceOffset": 512,
    "variantTag": 4352,
    "variantLevel": 17,
    "variantScaleBits": 1065353216
  },
  {
    "id": 20,
    "destination": 8550572,
    "kind": "standard",
    "name": [
      3208,
      "Square"
    ],
    "descriptions": [
      [
        4384,
        "This shape... it looks familiar..."
      ]
    ],
    "rarity": 5,
    "scaleBits": 1092616192,
    "entityType": 69,
    "components": [
      [
        5,
        0
      ]
    ],
    "layout": {
      "descriptor": 24,
      "descriptionArray": 500,
      "componentArray": 432
    }
  },
  {
    "id": 21,
    "destination": 8550688,
    "kind": "standard",
    "name": [
      3013,
      "Ladybug"
    ],
    "descriptions": [
      [
        4343,
        "Cute and harmless... if left unprovoked."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1084227584,
    "entityType": 70,
    "components": [
      [
        15,
        0
      ],
      [
        24,
        0
      ],
      [
        9,
        0
      ],
      [
        18,
        0
      ],
      [
        17,
        0
      ],
      [
        28,
        0
      ]
    ],
    "layout": {
      "descriptor": 16,
      "descriptionArray": 420,
      "componentArray": 352
    }
  },
  {
    "id": 22,
    "destination": 8550804,
    "kind": "variant",
    "name": [
      3013,
      "Ladybug"
    ],
    "descriptions": [
      [
        3887,
        "Shiny, cute and mostly harmless."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1084227584,
    "entityType": 71,
    "components": [
      [
        6,
        0
      ],
      [
        24,
        0
      ],
      [
        16,
        0
      ],
      [
        9,
        0
      ],
      [
        18,
        0
      ],
      [
        17,
        0
      ]
    ],
    "sourceOffset": 232,
    "variantTag": 1,
    "variantLevel": 0,
    "variantScaleBits": 1045220557
  },
  {
    "id": 23,
    "destination": 8550920,
    "kind": "standard",
    "name": [
      2508,
      "Spider"
    ],
    "descriptions": [
      [
        3670,
        "Spooky."
      ]
    ],
    "rarity": 1,
    "scaleBits": 1084227584,
    "entityType": 72,
    "components": [
      [
        8,
        0
      ],
      [
        7,
        0
      ],
      [
        14,
        0
      ],
      [
        29,
        0
      ],
      [
        30,
        0
      ]
    ],
    "layout": {
      "descriptor": 8,
      "descriptionArray": 220,
      "componentArray": 152
    }
  }
]);

export function createEntityDefinitionHook(runtime) {
  const memory = new DataView(runtime.memory.buffer);
  const stackPointer = runtime.stackPointer;

  function writeU32(address, value) {
    memory.setUint32(address, value >>> 0, true);
  }

  function writeU8(address, value) {
    memory.setUint8(address, value);
  }

  /** Write a standard record's descriptor temporaries into the stack frame. */
  function writeStandardDescriptors(frame, record) {
    const descriptionArray = frame + record.layout.descriptionArray;
    const componentArray = frame + record.layout.componentArray;
    const descriptor = frame + record.layout.descriptor;

    writeU32(descriptionArray, record.descriptions[0][0]);
    // Descriptor pair {array pointer, element count}; the same pair is also
    // written to the temporary slot immediately after the description array.
    writeU32(descriptor, descriptionArray);
    writeU32(descriptor + 4, record.descriptions.length);
    writeU32(descriptionArray + 4, descriptionArray);
    writeU32(descriptionArray + 8, record.descriptions.length);

    writeU8(componentArray, record.components.length);
    for (let index = 0; index < record.components.length; index += 1) {
      writeU32(componentArray + 4 + index * 8, record.components[index][0]);
      writeU32(componentArray + 8 + index * 8, record.components[index][1]);
    }
    return {descriptionArray, componentArray, descriptor};
  }

  /** Write the source image of a variant record that function 166 moves. */
  function writeVariantSource(frame, record) {
    const source = frame + record.sourceOffset;
    writeU32(source, record.name[0]);
    writeU8(source + 4, record.descriptions.length);
    writeU32(source + 8, record.descriptions[0][0]);
    writeU32(source + 24, record.rarity);
    writeU32(source + 28, record.scaleBits);
    writeU8(source + 32, record.components.length);
    for (let index = 0; index < record.components.length; index += 1) {
      writeU32(source + 36 + index * 8, record.components[index][0]);
      writeU32(source + 40 + index * 8, record.components[index][1]);
    }
    writeU32(source + 100, record.entityType);
    writeU32(source + 104, 0);
    memory.setUint16(source + 108, record.variantTag, true);
    writeU8(source + 110, record.variantLevel);
    writeU32(source + 112, record.variantScaleBits);
    return source;
  }

  /** First-call catalog construction, including the original stack frame. */
  function buildCatalog(frame) {
    for (const record of RECORDS) {
      if (record.kind === 'standard') {
        const slots = writeStandardDescriptors(frame, record);
        runtime.call(
          INITIALIZE_RECORD,
          record.destination,
          record.name[0],
          slots.descriptor,
          record.rarity,
          bitsToFloat(record.scaleBits),
          slots.componentArray,
          record.entityType,
        );
      } else {
        runtime.call(MOVE_RECORD, record.destination, writeVariantSource(frame, record));
      }
    }
    for (const offset of CLEARED_COMPONENT_COUNTERS) writeU8(frame + offset, 0);
    runtime.call(GUARD_RELEASE, GUARD_ADDRESS);
    stackPointer.value = (frame + STACK_FRAME_BYTES) | 0;
  }

  /** Original 103: lazily build the catalog, then resolve a definition id. */
  function getEntityDefinition(entityId) {
    if ((memory.getUint8(GUARD_ADDRESS) & 1) === 0) {
      const frame = (stackPointer.value - STACK_FRAME_BYTES) | 0;
      stackPointer.value = frame;
      const acquired = runtime.call(GUARD_ACQUIRE, GUARD_ADDRESS);
      if (acquired !== 0) {
        buildCatalog(frame);
      } else {
        stackPointer.value = (frame + STACK_FRAME_BYTES) | 0;
      }
    }
    const slot = (entityId - 1) & 0xff;
    if (slot > 21) return 0;
    return (CATALOG_BASE + entityId * RECORD_BYTES) | 0;
  }

  return Object.freeze({103: getEntityDefinition});
}

const FLOAT_SCRATCH = new DataView(new ArrayBuffer(4));
function bitsToFloat(bits) {
  FLOAT_SCRATCH.setUint32(0, bits, true);
  return FLOAT_SCRATCH.getFloat32(0, true);
}
