/** Instantiate an in-progress high-level reconstruction, with shared WASM memory.
 * The generated module has forwarding bodies only for the recovered functions;
 * their old instructions are absent from this build, so hooks cannot be bypassed.
 */
import { createRuntimeContext } from './context.mjs';
import { recoveredFunctionPlan, createRecoveredFunctions } from './registry.mjs';

export async function installReadableModule(moduleName, imports, config, baseURL, receiveInstance) {
  const context = createRuntimeContext(imports);
  const plan = recoveredFunctionPlan(moduleName);
  const stats = { module: moduleName, installed: plan.map(entry => entry.id), calls: {} };
  globalThis.__florrReadable = stats;
  let hooks;
  imports.readable = Object.fromEntries(plan.map(({ id }) => [`f${id}`, (...args) => {
    stats.calls[id] = (stats.calls[id] ?? 0) + 1;
    return hooks[id](...args);
  }]));
  const filename = `${moduleName}.wasm`;
  const url = config.locateFile ? config.locateFile(filename, baseURL) : new URL(filename, baseURL).href;
  const binary = config.wasmBinary ?? await fetch(url, { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
    return response.arrayBuffer();
  });
  const { instance } = await WebAssembly.instantiate(binary, imports);
  context.attach(instance);
  hooks = createRecoveredFunctions(moduleName, context);
  receiveInstance(instance);
  return instance;
}
