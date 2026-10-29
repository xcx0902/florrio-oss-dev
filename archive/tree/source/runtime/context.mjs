/** Shared boundary while original machine functions are replaced incrementally.
 * Function ids refer to the retained artifact's original index space, never the
 * new module's shifted import indices. Memory and the C++ stack stay shared.
 */
import { typedIndirectCall } from './indirect.mjs';
export function createRuntimeContext(imports) {
  let instance;
  return {
    attach(value) { instance = value; },
    get exports() { return instance.exports; },
    get memory() { return instance.exports.__readable_memory; },
    get table() { return instance.exports.__readable_table; },
    get stackPointer() { return instance.exports.__stack_pointer; },
    call(id, ...args) {
      const fn = instance.exports[`__fn${id}`];
      if (typeof fn !== 'function') throw new Error(`Missing original function ${id}`);
      return fn(...args);
    },
    host(module, field, ...args) { return imports[module][field](...args); },
    indirect(signature, tableIndex, ...args) { return typedIndirectCall(this.table, signature, tableIndex, ...args); },
  };
}
