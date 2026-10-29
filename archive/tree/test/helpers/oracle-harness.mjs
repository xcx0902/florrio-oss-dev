/** Fast oracle comparison for recovered functions.
 *
 * Each case runs the original machine function and the recovered hook in two
 * fresh, identically initialised instances, then compares result bits, trap
 * kind, stack-pointer restoration and a SHA-256 of memory.  The C++ stack window
 * below the entry stack pointer is excluded: recovered hooks keep their locals
 * in JS and do not reproduce spill slots, which carry no program state.
 *
 * This replaces whole-suite runs for incremental recovery: one case costs two
 * instantiations plus two 64 MiB hashes (~70 ms) instead of a full test pass.
 */
import { createHash } from 'node:crypto';
import { loadOriginal } from './wasm-probe.mjs';

export const STACK_WINDOW = 1 << 16;

export function hashMemory(runtime, stackWindow = STACK_WINDOW) {
  const bytes = new Uint8Array(runtime.memory.buffer);
  const entry = runtime.entryStackPointer >>> 0;
  const start = Math.max(0, entry - stackWindow);
  const hash = createHash('sha256');
  hash.update(bytes.subarray(0, start));
  hash.update(bytes.subarray(Math.min(entry, bytes.length)));
  return hash.digest('hex');
}

export function trapKind(error) {
  if (!error) return null;
  const message = String(error.message ?? error);
  if (message.includes('unreachable')) return 'unreachable';
  if (message.includes('out of bounds')) return 'out-of-bounds';
  if (message.includes('indirect call')) return 'indirect-call';
  if (message.includes('null function') || message.includes('uninitialized')) return 'null-function';
  if (message.includes('integer overflow')) return 'integer-overflow';
  if (message.includes('invalid conversion')) return 'invalid-conversion';
  return `other:${error.constructor?.name ?? typeof error}:${message.slice(0, 60)}`;
}

function resultBits(value) {
  if (typeof value === 'bigint') return `i64:${value}`;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (Object.is(value, -0)) return 'f:-0';
    if (Number.isInteger(value)) return `n:${value}`;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    return `f:${view.getBigUint64(0, true).toString(16)}`;
  }
  return `v:${String(value)}`;
}

async function runOnce(runtime, invoke, prepare, stackWindow = STACK_WINDOW) {
  if (prepare) prepare(runtime);
  runtime.entryStackPointer = runtime.stackPointer.value >>> 0;
  const before = hashMemory(runtime, stackWindow);
  let result;
  let error = null;
  try {
    result = invoke(runtime);
  } catch (caught) {
    error = caught;
  }
  return {
    result,
    error,
    kind: trapKind(error),
    memory: hashMemory(runtime, stackWindow),
    before,
    stackPointer: runtime.stackPointer.value >>> 0,
    entryStackPointer: runtime.entryStackPointer,
  };
}

/** Compare a batch of calls. `cases` entries: {id, args, prepare?, label?}. */
export async function compareCases({ module, functionIds, factory, cases, imports, stackWindow = STACK_WINDOW }) {
  const failures = [];
  let comparisons = 0;
  for (const entry of cases) {
    const options = { functionIds, imports, construct: false };
    const oracle = await loadOriginal(module, options);
    const subject = await loadOriginal(module, options);
    const hooks = factory(subject);
    const hook = hooks[entry.id];
    if (typeof hook !== 'function') throw new Error(`No recovered hook for ${entry.id}`);
    const expected = await runOnce(oracle, runtime => runtime.call(entry.id, ...(entry.argsOf ? entry.argsOf(runtime) : entry.args)), entry.prepare, stackWindow);
    const actual = await runOnce(subject, runtime => hook(...(entry.argsOf ? entry.argsOf(runtime) : entry.args)), entry.prepare, stackWindow);
    const label = entry.label ?? `${entry.id}(${entry.args.join(', ')})`;
    if (expected.before !== actual.before) failures.push(`${label}: fixture mismatch before call`);
    if (expected.kind !== actual.kind) {
      failures.push(`${label}: trap ${actual.kind} != ${expected.kind}`);
    } else if (expected.kind === null) {
      if (resultBits(actual.result) !== resultBits(expected.result)) {
        failures.push(`${label}: result ${resultBits(actual.result)} != ${resultBits(expected.result)}`);
      }
      if (actual.memory !== expected.memory) {
        failures.push(`${label}: memory differs`);
      }
    } else if (actual.memory !== expected.memory) {
      failures.push(`${label}: memory differs on trapping call`);
    }
    if (actual.stackPointer !== expected.stackPointer) {
      failures.push(`${label}: stack pointer ${actual.stackPointer} != ${expected.stackPointer}`);
    }
    comparisons++;
  }
  return { comparisons, failures };
}
