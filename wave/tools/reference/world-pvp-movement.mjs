#!/usr/bin/env node
// Read movement settings from the pinned original World PvP server, never its rebuild.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withAdditionalExports } from '../../../archive/tree/tools/lib/wasm-binary.mjs';

const root = new URL('../../../', import.meta.url);
const source = 'archive/tree/legacy/upstream/sp_server.wasm';
const sha256 = '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d';
const initializers = {
  spider: 697,
  shiny_ladybug: 698,
  dark_ladybug: 699,
  square: 700,
  evil_centipede_segment: 701,
  evil_centipede: 702,
  centipede_segment: 703,
  centipede: 704,
  hornet: 705,
  massive_beetle: 706,
  beetle: 707,
  ant_hole: 708,
  queen_ant: 709,
  soldier_ant: 710,
  worker_ant: 711,
  baby_ant: 712,
  bee: 713,
  massive_ladybug: 714,
  ladybug: 715,
  cactus: 716,
  boulder: 717,
  rock: 718,
};
const bytes = await fs.readFile(new URL(source, root));
assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
const indices = [144, ...Object.values(initializers)];
const module = new WebAssembly.Module(
  withAdditionalExports(bytes, [
    ...indices.map((index) => ({ name: `probe${index}`, index })),
    { name: 'stackPointer', kind: 3, index: 0 },
  ]),
);
let instance;
const imports = {};
for (const entry of WebAssembly.Module.imports(module)) {
  assert.equal(entry.kind, 'function');
  (imports[entry.module] ??= {})[entry.name] = () => 0;
}
const view = () => new DataView(instance.exports.o.buffer);
imports.a.i = (count, size) => {
  view().setUint32(count, 0, true);
  view().setUint32(size, 0, true);
  return 0;
};
imports.a.j = (_fd, vectors, count, written) => {
  let length = 0;
  for (let i = 0; i < count; i++) length += view().getUint32(vectors + i * 8 + 4, true);
  view().setUint32(written, length, true);
  return 0;
};
instance = new WebAssembly.Instance(module, imports);
const ex = instance.exports;
ex.p();
ex.u(0, 0);
const entity = ex.probe144(22928 + 1936, 1, 0, 0, -1);
const snapshot = new Uint8Array(ex.o.buffer).slice();
const stack = ex.stackPointer.value;
const mobs = {};
for (const [kind, index] of Object.entries(initializers)) {
  new Uint8Array(ex.o.buffer).set(snapshot);
  ex.stackPointer.value = stack;
  ex[`probe${index}`](entity);
  const ai = view().getUint32(entity + 104, true);
  mobs[kind] = {
    initializer: index,
    ai: ai
      ? {
          idle: view().getFloat32(ai + 72, true),
          chase: view().getFloat32(ai + 116, true),
          strafe: view().getFloat32(ai + 132, true),
          waveEnabled: Boolean(view().getUint8(ai + 76)),
          waveFrequencyPerMs: view().getFloat32(ai + 80, true),
          wavePower: view().getFloat32(ai + 84, true),
        }
      : null,
  };
}
const result = {
  source,
  sha256,
  player: {
    coefficient: 2.5,
    evidence:
      'sp_server.wat: spServerThink, player control impulse (f32 2.5 * modifiers * dt * 0.001)',
  },
  defaultProfile: 'square',
  antWaveFrequencyRangePerMs: [0.0018, 0.0022],
  antWaveEvidence:
    'function_208: (0.9 + random * 9.313225746154786e-11) * 0.002; random is in [1, 2147483646]',
  note: 'Square copies the generic 92-byte AI settings without speed overrides. Coefficients are f32 impulses, not world units per second. The common integration cancels in mob/player ratios.',
  mobs,
};
const output = new URL('wave/data/catalogs/20221030/world-pvp-movement.json', root);
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(await fs.readFile(output, 'utf8'), json);
else await fs.writeFile(output, json);
console.log(`${fileURLToPath(output)}: ${Object.keys(mobs).length} original initializers verified`);
