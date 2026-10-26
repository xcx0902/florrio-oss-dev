#!/usr/bin/env node
/**
 * Build the C++20 engine to a standalone wasm module.
 *
 * Emscripten's Homebrew cache is outside the writable workspace, so the build
 * uses a local cache (`.emcache/`, gitignored). The resulting module exports
 * the C ABI in engine/include/engine/abi.h plus malloc/free and memory.
 */
import path from 'node:path';
import { engineInputs } from './lib/build-inputs.mjs';
import { mkdir, readFile, open, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';

const root = path.resolve('.');
await assertVerificationOwner(root);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  if (position >= 0 && (!args[position + 1] || args[position + 1].startsWith('--'))) throw new Error(`${name} requires a value`);
  return position < 0 ? fallback : args[position + 1];
};
const output = path.resolve(option('--output', 'client/public/server.wasm'));
const cache = path.resolve(option('--cache', '.emcache'));
const compiler = process.env.EMXX || 'em++';
const expectedVersion = (await readFile(path.join(root, '.emscripten-version'), 'utf8')).trim();
const versionProbe = spawnSync(compiler, ['--version'], { encoding: 'utf8' });
if (versionProbe.status !== 0) throw new Error(`Cannot run ${compiler}: ${versionProbe.error?.message ?? versionProbe.stderr}`);
const compilerVersion = versionProbe.stdout.split('\n')[0];
const actualVersion = compilerVersion.match(/\b(\d+\.\d+\.\d+)(?:-git)?(?:\s|$)/)?.[1];
if (actualVersion !== expectedVersion) throw new Error(`Emscripten ${expectedVersion} is required by .emscripten-version; got ${compilerVersion}`);
const inputs = await engineInputs(root);
await mkdir(cache, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
const staging = path.join(path.dirname(output), `.engine-${randomUUID()}.wasm`);
const lock = await open(output + '.lock', 'wx');
try {

const sources = [
  'engine/src/schema/contracts.cpp',
  'engine/src/sim/tick.cpp',
  'engine/src/sim/movement.cpp',
  'engine/src/sim/bounds.cpp',
  'engine/src/sim/spawn.cpp',
  'engine/src/sim/collision.cpp',
  'engine/src/sim/collision_filter.cpp',
  'engine/src/sim/combat.cpp',
  'engine/src/sim/effects.cpp',
  'engine/src/sim/ai.cpp',
  'engine/src/sim/loot.cpp',
  'engine/src/sim/progression.cpp',
  'engine/src/sim/damage.cpp',
  'engine/src/sim/petal_effects.cpp',
  'engine/src/sim/petals.cpp',
  'engine/src/sim/player.cpp',
  'engine/src/sim/player_loadout.cpp',
  'engine/src/sim/spatial.cpp',
  'engine/src/sim/quadtree.cpp',
  'engine/src/sim/species_attacks.cpp',
  'engine/src/net/input.cpp',
  'engine/src/net/snapshot.cpp',
  'engine/src/net/snapshot_header.cpp',
  'engine/src/net/original_snapshot.cpp',
  'engine/src/net/worker_api.cpp',
  'engine/src/wasm/abi.cpp',
];
const command = [
  compiler,
  '-std=c++20', '-O2', '-I', 'engine/include',
  '-ffp-contract=off', '-fno-fast-math', '-fno-exceptions', '-fno-rtti',
  '-sSTANDALONE_WASM=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sINITIAL_MEMORY=67108864',
  '-sERROR_ON_UNDEFINED_SYMBOLS=1',
  '-sEXPORTED_FUNCTIONS=_sp_server_debug_entity_owner,_sp_server_debug_set_entity_field,_sp_server_debug_fire_attack,_malloc,_free,_sp_server_init,_sp_server_send,_sp_server_think,_sp_server_flush,_sp_server_flush_original,_sp_server_entity_count,_sp_server_output_count,_sp_server_output_data,_sp_server_output_size,_sp_server_state_digest,_sp_server_state_count,_sp_server_state_sum_x,_sp_server_state_sum_y,_sp_server_state_sum_health,_sp_server_state_min_x,_sp_server_state_max_x,_sp_server_state_min_y,_sp_server_state_max_y,_sp_server_state_record_size,_sp_server_state_dump,_sp_server_player_handle,_sp_server_player_valid,_sp_server_player_x,_sp_server_player_y,_sp_server_player_health,_sp_server_debug_ai_targets,_sp_server_debug_player_nearby,_sp_server_debug_death_count,_sp_server_debug_last_death_type,_sp_server_debug_last_death_kind,_sp_server_debug_last_death_attacker_kind,_sp_server_debug_last_death_attacker_type,_sp_server_debug_last_death_x,_sp_server_debug_last_death_y,_sp_server_debug_last_death_tick,_sp_server_debug_petal_count,_sp_server_debug_kind_count,_sp_server_debug_drop_type,_sp_server_debug_mob_x,_sp_server_debug_mob_y,_sp_server_debug_mob_vx,_sp_server_debug_mob_angle,_sp_server_debug_mob_ai_angle,_sp_server_debug_mob_vy,_sp_server_debug_entity_field,_sp_server_debug_entity_loot,_sp_server_debug_set_contact_target,_sp_server_debug_set_contact_order,_sp_server_debug_record_all_contacts,_sp_server_debug_contact_count,_sp_server_debug_contact_field,_sp_server_debug_linked_roots,_sp_server_debug_linked_segments,_sp_server_debug_last_damage,_sp_server_debug_mob_count,_sp_server_debug_player_vx,_sp_server_debug_player_ax,_sp_server_debug_player_strength,_sp_server_debug_player_angle,_sp_server_debug_rng,_sp_server_debug_rng_draws,_sp_server_debug_ai_timer_handle,_sp_server_debug_ai_timer_fires,_sp_server_debug_phase_count,_sp_server_debug_phase_draw,_sp_server_debug_player_vy,_sp_server_debug_petal_x,_sp_server_debug_petal_y,_sp_server_debug_petal_angle',
  '-Wl,--no-entry',
  ...sources,
  '-o', staging,
];
const result = spawnSync(command[0], command.slice(1), {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, EM_CACHE: cache },
});
if (result.status !== 0) {
  console.error(`engine wasm build failed with status ${result.status}`);
  throw new Error(`engine wasm compiler failed: ${result.error?.message ?? result.status ?? result.signal}`);
}
const after = await engineInputs(root);
if (inputs.sha256 !== after.sha256) throw new Error('C++ inputs changed during compilation; old wasm was retained');
const bytes = await readFile(staging);
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
const exports = WebAssembly.Module.exports(module);
const report = {
  runId: process.env.VERIFY_RUN_ID ?? null,
  output: path.relative(root, output),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  imports,
  exports: exports.map(entry => entry.name),
  emcc: compiler,
  compilerVersion,
  inputs,
  generatedAt: new Date().toISOString(),
  cache: path.relative(root, cache),
};
await rename(staging, output);
await atomicJson(output + '.build.json', report);
console.log(JSON.stringify(report, null, 2));
if (!existsSync(output)) process.exitCode = 1;
} finally {
  await rm(staging, { force: true });
  await lock.close(); await rm(output + '.lock', { force: true });
}
