import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import binaryen from 'binaryen';
import { probeGlue } from './glue.mjs';
import { dropContract, readDropPanel, readDropRates } from './tooltip-drops.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rarities = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Add observation hooks only to an in-memory research copy. The original
// formatter still runs, with unchanged arguments and return value.
function researchModule(wasm) {
  const module = binaryen.readBinary(wasm);
  try {
    module.setFeatures(
      module.getFeatures() | binaryen.Features.MutableGlobals | binaryen.Features.BulkMemoryOpt,
    );
    const info = binaryen.getFunctionInfo(module.getFunction('56'));
    module.addFunction('tooltipOriginalNumber', info.params, info.results, info.vars, info.body);
    module.removeFunction('56');
    module.addGlobal('tooltipNumberBuffer', binaryen.i32, true, module.i32.const(0));
    module.addGlobal('tooltipNumberCount', binaryen.i32, true, module.i32.const(0));
    const address = () =>
      module.i32.add(
        module.global.get('tooltipNumberBuffer', binaryen.i32),
        module.i32.mul(
          module.global.get('tooltipNumberCount', binaryen.i32),
          module.i32.const(264),
        ),
      );
    module.addFunction(
      '56',
      binaryen.f32,
      binaryen.i32,
      [binaryen.i32],
      module.block(
        null,
        [
          module.local.set(
            1,
            module.call('tooltipOriginalNumber', [module.local.get(0, binaryen.f32)], binaryen.i32),
          ),
          module.if(
            module.i32.and(
              module.i32.ne(
                module.global.get('tooltipNumberBuffer', binaryen.i32),
                module.i32.const(0),
              ),
              module.i32.lt_u(
                module.global.get('tooltipNumberCount', binaryen.i32),
                module.i32.const(128),
              ),
            ),
            module.block(null, [
              module.f32.store(0, 4, address(), module.local.get(0, binaryen.f32)),
              module.i32.store(
                4,
                4,
                address(),
                module.call('9', [module.local.get(1, binaryen.i32)], binaryen.i32),
              ),
              module.memory.copy(
                module.i32.add(address(), module.i32.const(8)),
                module.local.get(1, binaryen.i32),
                module.i32.const(256),
              ),
              module.global.set(
                'tooltipNumberCount',
                module.i32.add(
                  module.global.get('tooltipNumberCount', binaryen.i32),
                  module.i32.const(1),
                ),
              ),
            ]),
          ),
          module.local.get(1, binaryen.i32),
        ],
        binaryen.i32,
      ),
    );
    module.addGlobalExport('tooltipNumberBuffer', 'tooltipNumberBuffer');
    module.addGlobalExport('tooltipNumberCount', 'tooltipNumberCount');
    module.addFunctionExport('22', 'tooltipMobRecord');
    module.addFunctionExport('25', 'tooltipDestroyRow');
    module.addFunctionExport('33', 'tooltipFormat');
    module.addFunctionExport('13', 'tooltipPow');
    assert.ok(module.validate(), 'research module must validate');
    return { bytes: module.emitBinary(), wat: module.emitText() };
  } finally {
    module.dispose();
  }
}

function readUi(exports, output, { destroy = true, widgets = false } = {}) {
  const heap = Buffer.from(exports.Jf.buffer);
  const u32 = (p) => heap.readUInt32LE(p);
  const rows = u32(output);
  const data = u32(output + 8);
  assert.ok(rows < 100, 'bounded tooltip row count');
  const lines = [];
  for (let row = 0; row < rows; ++row) {
    const p = data + row * 28;
    const count = u32(p);
    const parts = u32(p + 8);
    assert.ok(count < 100, 'bounded tooltip fragment count');
    let line = '';
    for (let i = 0; i < count; ++i) {
      const part = parts + i * 160;
      if (widgets && heap[part] !== 1) {
        line += `[widget:${heap[part]}]`;
        continue;
      }
      assert.equal(heap[part], 1, 'unexpected non-text tooltip fragment');
      const string = part + 132;
      const shortLength = heap.readInt8(string + 11);
      const start = shortLength < 0 ? u32(string) : string;
      const length = shortLength < 0 ? u32(string + 4) : shortLength;
      line += heap.toString('utf8', start, start + length);
    }
    lines.push(line);
  }
  if (destroy) {
    for (let row = 0; row < rows; ++row) {
      exports.tooltipDestroyRow(data + row * 28);
    }
    exports.Mf(data);
  }
  return lines;
}

function numbers(exports) {
  const heap = Buffer.from(exports.Jf.buffer);
  const base = exports.tooltipNumberBuffer.value;
  const count = exports.tooltipNumberCount.value;
  assert.ok(
    count < 128,
    `bounded formatter observation count: ${count}, ${exports.tooltipNumberBuffer.value}`,
  );
  return Array.from({ length: count }, (_, i) => {
    const p = base + i * 264;
    assert.ok(heap.readUInt32LE(p + 4) < 256, 'bounded original formatter text');
    return {
      value: heap.readFloatLE(p),
      display: heap.toString('utf8', p + 8, p + 8 + heap.readUInt32LE(p + 4)),
    };
  });
}

function fields(lines, observed) {
  const labels = new Set([
    'Damage',
    'Health',
    'Heal',
    'Poison',
    'Flower Health',
    'Rotation speed',
    'Duration',
    'Contents',
    'Extra vision',
    'Radius',
    'Mob Heal',
    'Damage Reflection',
    'Pickup range',
    'Bounces',
    'Knockback',
    '% Damage',
    'Limit',
    'Shield',
    'Body Damage',
    'Period',
    'Damage Healed',
    'Missile health',
    'Missile damage',
    'Lightning',
    'Lifesteal',
  ]);
  for (const line of lines) {
    if (/: [+-]?\d/.test(line)) {
      assert.ok(
        labels.has(line.slice(0, line.indexOf(':'))),
        `unrecorded numeric tooltip field: ${line}`,
      );
    }
  }
  return lines
    .filter((line) => labels.has(line.slice(0, line.indexOf(':'))))
    .map((line) => {
      const split = line.indexOf(':');
      const label = line.slice(0, split).trim();
      const display = line.slice(split + 1).trim();
      const unsigned = display.replace(/^\+/, '');
      const matches = observed.filter(
        (n) =>
          unsigned === n.display ||
          unsigned.startsWith(`${n.display} `) ||
          unsigned === `${n.display}/s` ||
          unsigned === `${n.display}s` ||
          unsigned === `${n.display}%`,
      );
      const distinct = [...new Set(matches.map((n) => n.value))];
      const literal =
        label === 'Bounces' || label === '% Damage' || (lines[0] === 'Web' && label === 'Duration');
      const rate = display.match(/\(([^()]+)\/s\)$/);
      const rateValues = rate
        ? [...new Set(observed.filter((n) => n.display === rate[1]).map((n) => n.value))]
        : [];
      if (rate) {
        assert.equal(rateValues.length, 1, 'unambiguous poison rate');
      }
      // Never turn a shortened value (e.g. 1.2k) back into an alleged exact stat.
      const numeric = display.match(/^([+-]?[0-9]+(?:\.[0-9]+)?)(%|\/s| seconds|s| rad\/s)?$/);
      return {
        label,
        display,
        ...(rate ? { perSecond: rateValues[0] } : {}),
        ...(display.includes('~')
          ? {
              range: display.split('~').map((text) => {
                const values = [
                  ...new Set(observed.filter((n) => n.display === text).map((n) => n.value)),
                ];
                assert.equal(values.length, 1, 'unambiguous exact range endpoint');
                return values[0];
              }),
            }
          : {}),
        value:
          !literal && distinct.length === 1 ? distinct[0] : numeric ? Number(numeric[1]) : null,
        valueSource:
          !literal && distinct.length === 1
            ? '$56 argument (f32)'
            : numeric
              ? 'literal tooltip text'
              : 'see formatter observations / compound text',
      };
    });
}

export function readTooltips(js, wasm, fixture) {
  const research = researchModule(wasm);
  const { instance, alloc } = probeGlue(js, research.bytes, fixture);
  const e = instance.exports;
  const table = e.bg;
  // $22 also builds cached gallery/drop widgets; initialize them before
  // observing one tooltip so their formatter calls cannot contaminate it.
  e.tooltipMobRecord(1);
  const drops = dropContract(e);
  e.tooltipNumberBuffer.value = alloc(128 * 264);
  const input = alloc(8);
  const output = alloc(12);
  const timerArgs = alloc(16);
  const timerOutput = alloc(64);
  const heap = () => Buffer.from(e.Jf.buffer);
  const u32 = (p) => heap().readUInt32LE(p);
  const f32 = (p) => heap().readFloatLE(p);
  const string = (p) => heap().toString('utf8', p, heap().indexOf(0, p));
  const element = research.wat.match(/^ \(elem .*$/m)[0];
  const functions = [...element.matchAll(/\$(\d+)/g)].slice(1).map((m) => `$${m[1]}`);
  const functionForSlot = (slot) => functions[slot - 1];
  const petals = Array.from({ length: 45 }, (_, index) => {
    const id = index + 1;
    const registry = 829696 + 24 * id;
    const constructorSlot = u32(registry + 20);
    const name = string(u32(registry));
    const variants = rarities.map((rarityName, rarity) => {
      heap().writeUInt16LE(id | (rarity << 8), input);
      const record = table.get(constructorSlot)(input);
      const vtable = u32(record);
      e.tooltipNumberCount.value = 0;
      table.get(u32(vtable + 12))(output, record);
      const observed = numbers(e);
      const lines = readUi(e, output);
      assert.equal(lines[0], string(u32(registry + 4)), 'long name / constructor identity');
      assert.equal(lines[1], rarityName, 'petal rarity');
      const reloadMs = table.get(u32(vtable + 28))(record);
      const activationMs = table.get(u32(vtable + 32))(record);
      heap().writeDoubleLE(reloadMs / 1000, timerArgs);
      heap().writeDoubleLE(activationMs / 1000, timerArgs + 8);
      e.tooltipFormat(timerOutput, 64, activationMs > 0 ? 25928 : 25936, timerArgs);
      const result = {
        rarity,
        name: rarityName,
        vtable,
        tooltipFunction: functionForSlot(u32(vtable + 12)),
        reloadFunction: functionForSlot(u32(vtable + 28)),
        activationFunction: functionForSlot(u32(vtable + 32)),
        reloadSeconds: reloadMs / 1000,
        activationSeconds: activationMs / 1000,
        cooldownDisplay: string(timerOutput),
        orbitCount: table.get(u32(vtable + 40))(record),
        lines,
        fields: fields(lines, observed),
        formatterObservations: observed,
      };
      // Antennae / Third Eye use a smaller non-body base class; reading common
      // f32 offsets there would read allocator bytes, not numerical properties.
      if (id !== 17 && id !== 43) {
        result.body = {
          radius: f32(record + 8),
          damage: f32(record + 12),
          health: f32(record + 16),
          attackDistance: f32(record + 20),
          defendDistance: f32(record + 24),
        };
      }
      table.get(u32(vtable + 4))(record);
      return result;
    });
    return {
      id,
      name,
      constructorSlot,
      constructorFunction: functionForSlot(constructorSlot),
      variants,
    };
  });
  const mobs = Array.from({ length: 35 }, (_, index) => {
    const id = index + 1;
    const registry = e.tooltipMobRecord(id);
    assert.equal(registry, 909552 + 216 * id);
    const constructorSlot = u32(registry + 100);
    const name = string(u32(registry));
    const descriptions = Array.from({ length: u32(registry + 4) }, (_, i) =>
      string(u32(registry + 8 + i * 4)),
    );
    const loot = Array.from({ length: heap().readUInt8(registry + 32) }, (_, i) => ({
      petalId: heap().readUInt8(registry + 36 + i * 8),
      coefficient: f32(registry + 40 + i * 8),
    }));
    const variants = rarities.map((rarityName, rarity) => {
      const record = table.get(constructorSlot)(rarity);
      const vtable = u32(record);
      e.tooltipNumberCount.value = 0;
      table.get(u32(vtable + 16))(output, record, registry);
      const observed = numbers(e);
      const lines = readUi(e, output);
      assert.equal(lines[0], name, 'mob tooltip identity');
      assert.equal(lines[1], rarityName, 'mob rarity');
      const result = {
        rarity,
        name: rarityName,
        vtable,
        tooltipFunction: functionForSlot(u32(vtable + 16)),
        lines,
        fields: fields(lines, observed),
        formatterObservations: observed,
        baseHealth: table.get(u32(vtable + 8))(record),
        baseDamage: table.get(u32(vtable + 12))(record),
        healthMultiplier: f32(53184 + rarity * 4),
        damageMultiplier: f32(53216 + rarity * 4),
        galleryLines: readUi(e, registry + 120 + rarity * 12, { destroy: false, widgets: true }),
        drops: readDropRates(e, alloc, registry, rarity, drops),
      };
      table.get(u32(vtable + 4))(record);
      return result;
    });
    return {
      id,
      name,
      constructorSlot,
      constructorFunction: functionForSlot(constructorSlot),
      descriptions,
      loot,
      dropInheritanceId: heap().readUInt8(registry + 109),
      galleryParentId: heap().readUInt8(registry + 117),
      variants,
    };
  });
  e.Mf(input);
  e.Mf(output);
  e.Mf(timerArgs);
  e.Mf(timerOutput);
  e.Mf(e.tooltipNumberBuffer.value);
  return { dropMethod: drops, petals, mobs };
}

// Independent semantic check against the unmodified original bytes. These
// short-lived VM allocations are retained because its row destructor is private.
function verifyOriginal(js, wasm, fixture, report) {
  const { instance, alloc } = probeGlue(js, wasm, fixture);
  const e = instance.exports;
  const heap = () => Buffer.from(e.Jf.buffer);
  const u32 = (p) => heap().readUInt32LE(p);
  const input = alloc(8);
  const output = alloc(12);
  for (const petal of report.petals) {
    assert.equal(u32(829696 + 24 * petal.id + 20), petal.constructorSlot);
    for (const variant of petal.variants) {
      heap().writeUInt16LE(petal.id | (variant.rarity << 8), input);
      const record = e.bg.get(petal.constructorSlot)(input);
      const vtable = u32(record);
      e.bg.get(u32(vtable + 12))(output, record);
      assert.deepEqual(
        readUi(e, output, { destroy: false }),
        variant.lines,
        `original petal ${petal.id}/${variant.rarity}`,
      );
      assert.equal(e.bg.get(u32(vtable + 28))(record) / 1000, variant.reloadSeconds);
      assert.equal(e.bg.get(u32(vtable + 32))(record) / 1000, variant.activationSeconds);
      assert.equal(e.bg.get(u32(vtable + 40))(record), variant.orbitCount);
      if (variant.body) {
        for (const [index, key] of [
          'radius',
          'damage',
          'health',
          'attackDistance',
          'defendDistance',
        ].entries()) {
          assert.equal(heap().readFloatLE(record + 8 + index * 4), variant.body[key]);
        }
      }
      e.bg.get(u32(vtable + 4))(record);
    }
  }
  // Egg's original tooltip initializes the original cached mob gallery via $22.
  for (const mob of report.mobs) {
    const registry = 909552 + 216 * mob.id;
    assert.equal(u32(registry + 100), mob.constructorSlot);
    for (const variant of mob.variants) {
      const record = e.bg.get(mob.constructorSlot)(variant.rarity);
      const vtable = u32(record);
      e.bg.get(u32(vtable + 16))(output, record, registry);
      assert.deepEqual(
        readUi(e, output, { destroy: false }),
        variant.lines,
        `original mob ${mob.id}/${variant.rarity}`,
      );
      assert.deepEqual(
        readUi(e, registry + 120 + variant.rarity * 12, { destroy: false, widgets: true }),
        variant.galleryLines,
      );
      assert.equal(e.bg.get(u32(vtable + 8))(record), variant.baseHealth);
      assert.equal(e.bg.get(u32(vtable + 12))(record), variant.baseDamage);
      assert.deepEqual(
        readDropPanel(e, registry, variant.rarity),
        variant.drops.panel,
        `original drop panel ${mob.id}/${variant.rarity}`,
      );
      e.bg.get(u32(vtable + 4))(record);
    }
  }
  console.log(
    '480 tooltips, 210 drop panels, gallery entries, cooldowns and body getters match unmodified original Wasm',
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      snapshot: { type: 'string' },
      output: {
        type: 'string',
        default: path.join(root, 'data/catalogs/20221030/client-tooltips.json'),
      },
      check: { type: 'boolean', default: false },
    },
  });
  assert.ok(values.snapshot, '--snapshot is required');
  const manifest = JSON.parse(await readFile(path.join(root, 'web/resources-20221030.json')));
  const inputs = await Promise.all(
    manifest.snapshot.map(async (entry) => {
      const bytes = await readFile(path.join(values.snapshot, entry.file));
      assert.equal(bytes.length, entry.bytes, `${entry.file} byte count`);
      assert.equal(digest(bytes), entry.sha256, `${entry.file} SHA-256`);
      return { ...entry, bytes };
    }),
  );
  const fixture = JSON.parse(await readFile(path.join(root, 'data/wire/20221030/bootstrap.json')));
  const report = {
    schemaVersion: 1,
    cutoffUtc: manifest.cutoffUtc,
    buildHash: manifest.buildHash,
    snapshot: inputs.map(({ file, bytes }) => ({
      file,
      bytes: bytes.length,
      sha256: digest(bytes),
    })),
    method:
      'Original Wasm constructors and virtual tooltip builders executed in a network-disabled Node VM; in-memory research copy exports $22/$25 and observes original $56 inputs. No historical server execution is claimed.',
    ...readTooltips(
      inputs.find((i) => i.file === 'client.js').bytes.toString('utf8'),
      inputs.find((i) => i.file === 'client.wasm').bytes,
      fixture.transport,
    ),
  };
  const text = JSON.stringify(report, null, 2) + '\n';
  if (values.check) {
    assert.deepEqual(
      JSON.parse(await readFile(values.output, 'utf8')),
      report,
      'tooltip evidence drift',
    );
    verifyOriginal(
      inputs.find((i) => i.file === 'client.js').bytes.toString('utf8'),
      inputs.find((i) => i.file === 'client.wasm').bytes,
      fixture.transport,
      report,
    );
    const { readMobTooltips } = await import('./mob-tooltips.mjs');
    const independent = readMobTooltips(
      inputs.find((i) => i.file === 'client.js').bytes.toString('utf8'),
      inputs.find((i) => i.file === 'client.wasm').bytes,
      fixture.transport,
    );
    for (const mob of independent.entries) {
      for (const variant of mob.rarities) {
        const actual = report.mobs[mob.id - 1].variants[variant.rarity];
        assert.deepEqual(actual.lines, variant.lines);
        for (const field of variant.fields) {
          const observed = actual.fields.find((f) => f.label === field.label);
          assert.equal(
            observed.value,
            field.value,
            `independent numeric check ${mob.id}/${variant.rarity}/${field.label}`,
          );
          if (observed.range) {
            assert.deepEqual(observed.range, [field.min, field.max]);
          }
          if (field.perSecondDisplayed) {
            assert.equal(observed.perSecond, field.perSecond);
          }
        }
      }
    }
    console.log(
      `${independent.checkedNumericFields} mob numeric fields match independently recovered formulas`,
    );
  } else {
    await writeFile(values.output, text);
  }
  console.log(
    `${report.petals.length} petals × 6; ${report.mobs.length} mobs × 6; original tooltip extraction ${values.check ? 'verified' : 'saved'}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
