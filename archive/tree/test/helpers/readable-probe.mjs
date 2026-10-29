/** Execute the same transformed source and hook registry used by the game build. */
import fs from 'node:fs/promises';
import wabtFactory from 'wabt';
import { makeReadableWat } from '../../tools/lib/readable-wasm.mjs';
import { recoveredFunctionPlan, createRecoveredFunctions } from '../../source/runtime/registry.mjs';
import { createRuntimeContext } from '../../source/runtime/context.mjs';
const compiled = new Map();

export async function loadReadable(name, { imports = {}, construct = true, excludeFunctionIds = [] } = {}) {
  const plan = recoveredFunctionPlan(name).filter(entry => !excludeFunctionIds.includes(entry.id));
  const cacheKey = name + ':' + plan.map(entry => entry.id).join(',');
  if (!compiled.has(cacheKey)) {
    const wabt = await wabtFactory();
    const source = await fs.readFile(new URL(`../../source/wasm/${name}.wat`, import.meta.url), 'utf8');
    const inventory = JSON.parse(await fs.readFile(new URL(`../../reports/wasm/${name}-functions.json`, import.meta.url), 'utf8'));
    const text = makeReadableWat(source, inventory, plan).text;
    const parsed = wabt.parseWat(name + '.wat', text);
    parsed.resolveNames(); parsed.validate();
    compiled.set(cacheKey, new WebAssembly.Module(parsed.toBinary({}).buffer));
    parsed.destroy();
  }
  const module = compiled.get(cacheKey), importObject = {};
  for (const entry of WebAssembly.Module.imports(module)) (importObject[entry.module] ??= {})[entry.name] = () => 0;
  for (const [group, fields] of Object.entries(imports)) Object.assign(importObject[group] ??= {}, fields);
  const runtime = createRuntimeContext(importObject), calls = {};
  let hooks;
  importObject.readable = Object.fromEntries(plan.map(({ id }) => [`f${id}`, (...args) => {
    calls[id] = (calls[id] ?? 0) + 1;
    return hooks[id](...args);
  }]));
  const instance = new WebAssembly.Instance(module, importObject);
  runtime.attach(instance);
  hooks = createRecoveredFunctions(name, runtime);
  runtime.calls = calls;
  runtime.instance = instance;
  runtime.imports = importObject;
  if (construct) runtime.exports[name === 'sp_server' ? 'p' : 'Nf']();
  return runtime;
}
