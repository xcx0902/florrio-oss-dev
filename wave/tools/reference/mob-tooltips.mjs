import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import binaryen from 'binaryen';
import { probeGlue } from './glue.mjs';

const SHA256 = '68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0';
const RARITIES = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const f32 = Math.fround;
const mul = (a, b) => f32(f32(a) * f32(b));

// These are observations of the fixed 2022-10-30 artifact, not modern mob data.
// Numeric function names refer to Binaryen's original client.wat numbering.
export const MOB_TOOLTIP_CONTRACT = {
  wasmSha256: SHA256,
  callPath: ['$22', '$63', 'table[record+100](rarity)', 'vtable+16(output,mob,record)'],
  renderPath: {
    caller: '$1002',
    enqueue: '$104',
    queueAddress: 4345240,
    vectorArgument: 'record + 120 + 12 * u8(uiObject+149)',
    uiMobId: 148,
    uiRarity: 149,
    dropPanelToggle: 152,
    opacity: 156,
  },
  layout: {
    registry: { base: 909552, stride: 216, firstId: 1, lastId: 35 },
    name: 0,
    descriptionCount: { offset: 4, type: 'u8' },
    descriptionPointers: 8,
    constructorTableSlot: 100,
    tooltipVectors: { offset: 120, rarityStride: 12, count: 0, capacity: 4, pointer: 8 },
    row: { stride: 28, fragmentCount: 0, fragmentCapacity: 4, fragmentPointer: 8 },
    fragment: { stride: 160, string: 132, rgb: 144 },
    string: { size: 12, longFlag: 11, longPointer: 0, longLength: 4, shortLength: 11 },
    mobObject: { id: 4, rarity: 5 },
    vtable: { deletingDestructor: 4, baseHealth: 8, baseDamage: 12, tooltip: 16 },
  },
  multipliers: { healthAddress: 53184, damageAddress: 53216, type: 'f32[6]' },
  functions: {
    headerAndDescriptions: '$337',
    standard: '$288',
    rockHealthRange: '$1577',
    cactusHealthRange: '$1581',
    antHoleAndBurrowConditions: '$1607',
    hornetMissiles: '$1590',
    scorpion: '$1602',
    poisonFormatter: '$440',
    jellyfish: '$1707',
    leech: '$1805',
    numberFormatter: '$56',
    snprintf: '$33',
  },
  formulas: {
    health: 'f32(baseHealth * healthMultiplier[rarity]); no integer rounding',
    damage: 'f32(baseDamage * damageMultiplier[rarity]); no integer rounding',
    rockMaxHealth: 'f32(baseHealth * f32(healthMultiplier + healthMultiplier))',
    cactusMaxHealth: 'f32(f32(baseHealth * 1.5) * healthMultiplier)',
    missileHealth: 'f32(10 * healthMultiplier)',
    missileDamage: 'f32(10 * damageMultiplier)',
    poisonTotal: 'f32(50 * damageMultiplier)',
    poisonPerSecond: 'f32(15 * damageMultiplier)',
    lightning: 'f32(7 * damageMultiplier)',
    bounces: 'rarity > 4 ? 10 : rarity + 1',
    lifesteal: 'f32(7 * damageMultiplier); absolute amount, no percent sign in tooltip',
  },
  formatting: {
    function: '$56',
    below1000: 'Integral f32: snprintf %.0f; otherwise %.1f, stripping trailing zeroes and dot.',
    thousands: '1000 <= value < 1000000: snprintf %.1fk using f64(value) * 0.001.',
    millions: 'value >= 1000000: snprintf %.1fm using f64(value) * 0.000001.',
    rounding:
      'Use original $56/$33, including ties-to-even formatting (1250 -> 1.2k). Do not use $23 or Math.round.',
    healthRange: '%s~%s, each endpoint independently formatted by $56',
    poison: '$440: rate === f32(15) omits rate; otherwise %s (%s/s).',
  },
  conditions: [
    '$337 always emits name, rarity, separator and every registry description, in order.',
    '$1607: id 9 (Ant Hole) uses $288 only for rarity < 2; otherwise $337 only.',
    '$1607: id 24 (Fire Ant Burrow) always uses $337 only.',
    'Hornet adds Missile health and Missile damage; Scorpion adds Poison.',
    'Jellyfish adds Lightning and Bounces; both Leech IDs add Lifesteal.',
    'Centipede IDs 13/15/17 and Leech ID 35 have their own six complete tooltips despite gallery parent IDs.',
    'No tooltip displays a summon count, segment count, speed, regeneration, defense or XP field.',
  ],
  boundaries: [
    'These are client tooltip values, not verification of server collision, damage timing or award logic.',
    'XP is absent from all 210 complete tooltips. Server XP awards and rarity XP multipliers remain unknown.',
    'Registry +24/+28 are retained as raw fields. $90 reads +24 when selecting mobs against a wave budget; neither is a health/damage tooltip input.',
    'Segment tooltips must not be multiplied by a guessed segment count. Server segment count and shared-health mechanics are not established by these tooltips.',
    'Ant Hole and Fire Ant Burrow reveal no summoned mob count or stats in the tooltip. Hidden battle values remain null.',
    'record+192+4*rarity points to the separate gallery drop panel, not an additional tooltip row; tooltip-drops.mjs records every displayed percentage and recovers its calculation from raw coefficients.',
    'Health ranges establish displayed endpoints, not the server probability distribution between them.',
    'Descriptions and duplicate names are preserved verbatim; no modern Wiki or archive/tree data is used.',
  ],
};

/**
 * Re-run the original tooltip builders in an in-memory research copy. The
 * original bytes are hash-checked and never rewritten. All 210 displayed row
 * vectors are read verbatim; calculated raw values are checked against them
 * with the original number formatter, rather than parsing abbreviated text.
 *
 * Usage: readMobTooltips(jsSource, originalWasmBytes, bootstrap.transport).
 * A probe may be passed as an optional first argument to match readCatalog.
 */
export function readMobTooltips(probeOrJs, jsOrWasm, wasmOrTransport, transportArgument) {
  const hasProbe = typeof probeOrJs !== 'string' && !Buffer.isBuffer(probeOrJs);
  const js = hasProbe ? jsOrWasm : probeOrJs;
  const wasm = hasProbe ? wasmOrTransport : jsOrWasm;
  const transport = hasProbe ? transportArgument : wasmOrTransport;
  assert.equal(createHash('sha256').update(wasm).digest('hex'), SHA256, 'Wrong client artifact');
  const module = binaryen.readBinary(wasm);
  const slots = new Map();
  let instrumented;
  try {
    for (let i = 0; i < module.getNumElementSegments(); i++) {
      const segment = binaryen.getElementSegmentInfo(module.getElementSegmentByIndex(i));
      const start = binaryen.getExpressionInfo(segment.offset).value;
      segment.data.forEach((name, j) => slots.set(start + j, '$' + name));
    }
    module.addFunctionExport('22', 'w0MobGalleryRecord');
    module.addFunctionExport('56', 'w0MobTooltipNumber');
    instrumented = module.emitBinary();
  } finally {
    module.dispose();
  }
  const { instance } = probeGlue(js.toString(), instrumented, transport);
  const {
    Jf: memory,
    bg: table,
    w0MobGalleryRecord: record,
    w0MobTooltipNumber: format,
  } = instance.exports;
  const heap = () => Buffer.from(memory.buffer);
  const u32 = (address) => heap().readUInt32LE(address);
  const u8 = (address) => heap().readUInt8(address);
  const float = (address) => heap().readFloatLE(address);
  const cString = (address) => {
    const bytes = heap();
    assert.ok(address > 0 && address < bytes.length);
    const end = bytes.indexOf(0, address);
    assert.ok(end >= address);
    return bytes.toString('utf8', address, end);
  };
  const cppString = (address) => {
    const long = Boolean(u8(address + 11) & 128);
    const data = long ? u32(address) : address;
    const length = long ? u32(address + 4) : u8(address + 11);
    assert.ok(length < 16384 && data + length <= heap().length);
    return { address, data, length, long, text: heap().toString('utf8', data, data + length) };
  };
  const rowsAt = (vector) => {
    const count = u32(vector),
      capacity = u32(vector + 4),
      pointer = u32(vector + 8);
    assert.ok(count <= capacity && count <= 32);
    return {
      vector,
      count,
      capacity,
      pointer,
      rows: Array.from({ length: count }, (_, index) => {
        const address = pointer + 28 * index;
        const fragmentCount = u32(address),
          fragmentPointer = u32(address + 8);
        assert.ok(fragmentCount <= u32(address + 4) && fragmentCount <= 25);
        const fragments = Array.from({ length: fragmentCount }, (_, j) => {
          const fragmentAddress = fragmentPointer + 160 * j;
          return {
            address: fragmentAddress,
            string: cppString(fragmentAddress + 132),
            rgb: u32(fragmentAddress + 144) & 0xffffff,
          };
        });
        return { index, address, text: fragments.map((x) => x.string.text).join(''), fragments };
      }),
    };
  };
  assert.equal(record(0), 0);
  assert.equal(record(36), 0);
  const healthMultipliers = RARITIES.map((_, r) => float(53184 + 4 * r));
  const damageMultipliers = RARITIES.map((_, r) => float(53216 + 4 * r));
  assert.deepEqual(healthMultipliers, [1, f32(1.6), 2.5, 4, 25, 50]);
  assert.deepEqual(damageMultipliers, [1, f32(1.1), f32(1.3), f32(1.6), 2, 2.5]);
  const formatted = (value) => cString(format(value));
  let checkedFields = 0;
  const entries = Array.from({ length: 35 }, (_, i) => {
    const id = i + 1,
      address = record(id);
    assert.equal(address, 909552 + 216 * id);
    const descriptionCount = u8(address + 4);
    const descriptions = Array.from({ length: descriptionCount }, (_, j) => ({
      address: u32(address + 8 + 4 * j),
      text: cString(u32(address + 8 + 4 * j)),
    }));
    const constructorSlot = u32(address + 100);
    const rarities = RARITIES.map((rarityName, rarity) => {
      const tooltip = rowsAt(address + 120 + 12 * rarity);
      const lines = tooltip.rows.map((row) => row.text);
      assert.equal(lines[0], cString(u32(address)));
      assert.equal(lines[1], rarityName);
      assert.deepEqual(
        lines.slice(3, 3 + descriptionCount),
        descriptions.map((d) => d.text),
      );
      const object = table.get(constructorSlot)(rarity);
      const vtable = u32(object);
      let result;
      try {
        assert.equal(u8(object + 4), id);
        assert.equal(u8(object + 5), rarity);
        const baseHealthSlot = u32(vtable + 8),
          baseDamageSlot = u32(vtable + 12);
        const baseHealth = table.get(baseHealthSlot)(object);
        const baseDamage = table.get(baseDamageSlot)(object);
        const h = healthMultipliers[rarity],
          d = damageMultipliers[rarity];
        const definitions = new Map();
        const add = (key, label, value, fn, unit = 'absolute') => {
          definitions.set(label, { key, label, value, function: fn, unit });
        };
        const health = mul(baseHealth, h);
        const healthMax =
          id === 1 ? mul(baseHealth, f32(h + h)) : id === 2 ? mul(mul(baseHealth, 1.5), h) : health;
        definitions.set('Health', {
          key: 'health',
          label: 'Health',
          min: health,
          max: healthMax,
          value: healthMax === health ? health : null,
          function: id === 1 ? '$1577' : id === 2 ? '$1581' : '$288',
          unit: 'absolute',
        });
        add('damage', 'Damage', mul(baseDamage, d), '$288');
        if (id === 11) {
          add('missileHealth', 'Missile health', mul(10, h), '$1590');
          add('missileDamage', 'Missile damage', mul(10, d), '$1590');
        }
        if (id === 22) {
          add('poison', 'Poison', mul(50, d), '$1602 -> $440');
          Object.assign(definitions.get('Poison'), {
            perSecond: mul(15, d),
            perSecondDisplayed: mul(15, d) !== f32(15),
          });
        }
        if (id === 31) {
          add('lightning', 'Lightning', mul(7, d), '$1707');
          add('bounces', 'Bounces', rarity > 4 ? 10 : rarity + 1, '$1707', 'count');
        }
        if (id === 34 || id === 35) {
          add('lifesteal', 'Lifesteal', mul(7, d), '$1805');
        }
        const fields = lines
          .slice(3 + descriptionCount)
          .filter(Boolean)
          .map((line) => {
            const colon = line.indexOf(': ');
            assert.ok(colon > 0, `Unknown numeric row: ${id}/${rarity}: ${line}`);
            const label = line.slice(0, colon),
              display = line.slice(colon + 2);
            const definition = definitions.get(label);
            assert.ok(definition, `Unknown field: ${label}`);
            let expected =
              definition.min === undefined
                ? formatted(definition.value)
                : definition.min === definition.max
                  ? formatted(definition.min)
                  : formatted(definition.min) + '~' + formatted(definition.max);
            if (definition.perSecondDisplayed) {
              expected += ` (${formatted(definition.perSecond)}/s)`;
            }
            assert.equal(display, expected, `${id}/${rarity} ${label} raw/display mismatch`);
            checkedFields++;
            return { ...definition, display, line };
          });
        const hidden = id === 24 || (id === 9 && rarity >= 2);
        assert.equal(fields.length, hidden ? 0 : definitions.size);
        result = {
          rarity,
          name: rarityName,
          lines,
          tooltip,
          fields,
          stats: Object.fromEntries(
            fields.map(({ key, value, min, max }) => [
              key,
              min === undefined ? value : (value ?? { min, max }),
            ]),
          ),
          health: fields.find((field) => field.key === 'health') ?? null,
          damage: fields.find((field) => field.key === 'damage') ?? null,
          xp: {
            displayed: false,
            value: null,
            reason: 'No XP row in original tooltip; server award unknown.',
          },
          battleFieldsHidden: hidden,
          constructor: {
            slot: constructorSlot,
            function: slots.get(constructorSlot),
            vtable,
            baseHealth: {
              value: baseHealth,
              slot: baseHealthSlot,
              function: slots.get(baseHealthSlot),
            },
            baseDamage: {
              value: baseDamage,
              slot: baseDamageSlot,
              function: slots.get(baseDamageSlot),
            },
            tooltip: { slot: u32(vtable + 16), function: slots.get(u32(vtable + 16)) },
          },
          galleryDropPanelAddress: u32(address + 192 + 4 * rarity),
        };
      } finally {
        table.get(u32(vtable + 4))(object);
      }
      return result;
    });
    const dropCount = u8(address + 32);
    const linkedCount = u8(address + 118);
    return {
      id,
      address,
      name: cString(u32(address)),
      descriptions,
      rawF32At24: float(address + 24),
      rawF32At28: float(address + 28),
      metadata: {
        rawByte108: u8(address + 108),
        dropInheritanceId: u8(address + 109) || null,
        rawI32At112: heap().readInt32LE(address + 112),
        rawByte116: u8(address + 116),
        galleryParentId: u8(address + 117) || null,
        linkedIds: Array.from({ length: linkedCount }, (_, j) => u8(address + 119 + j)),
        linkedIdsMeaning: 'Client registry links; not a live segment count or summon count.',
      },
      rawDropCoefficients: Array.from({ length: dropCount }, (_, j) => ({
        petalId: u8(address + 36 + 8 * j),
        coefficient: float(address + 40 + 8 * j),
      })),
      rarities,
    };
  });
  return {
    schemaVersion: 1,
    scope: '2022-10-30 original client mob tooltips',
    wasmSha256: SHA256,
    researchCopy: true,
    contract: MOB_TOOLTIP_CONTRACT,
    multipliers: { health: healthMultipliers, damage: damageMultipliers },
    mobCount: entries.length,
    recordCount: entries.reduce((sum, entry) => sum + entry.rarities.length, 0),
    checkedNumericFields: checkedFields,
    entries,
  };
}

// Standalone evidence command; importing this module has no file-writing effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    assert.ok(i < 0 || args[i + 1], `Missing value for ${name}`);
    return i < 0 ? fallback : args[i + 1];
  };
  const snapshot = option('--snapshot', path.join(root, 'wave-reference/20221030'));
  const transport = JSON.parse(
    readFileSync(path.join(root, 'wave/data/wire/20221030/bootstrap.json')),
  ).transport;
  const data = readMobTooltips(
    readFileSync(path.join(snapshot, 'client.js'), 'utf8'),
    readFileSync(path.join(snapshot, 'client.wasm')),
    transport,
  );
  const output = JSON.stringify(data, null, 2) + '\n';
  const destination = option('--output', null);
  if (destination) {
    writeFileSync(destination, output);
  } else {
    process.stdout.write(output);
  }
  process.stderr.write(
    `Mob tooltips: ${data.mobCount} mobs, ${data.recordCount} rarity records, ${data.checkedNumericFields} numeric fields verified against original formatter.\n`,
  );
}
