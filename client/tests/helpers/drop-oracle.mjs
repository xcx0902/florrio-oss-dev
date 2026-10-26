/** Original pickup pass in func763. The host stops immediately after the
 * marker's black rim, before unrelated icon/text caches. Instructions and
 * state stores run unmodified; each deliberate stop restores only stack and
 * caller renderer, as a completed enclosing draw would do. */
import { loadOriginal } from '../../../test/helpers/wasm-probe.mjs';

export async function createDropOracle({ fresh = true, randomSeed = 1 } = {}) {
  let runtime, now = 1000, renderer, component, armed = false, baseline, marker, alpha, width;
  const stop = new Error('pickup rim captured');
  function host(code, signature, pointer) {
    if (!runtime) return 0;
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; (type = bytes[signature++]); cursor++) {
      if (type < 105) { if (cursor & 1) cursor++; args.push(view.getFloat64((cursor++ >> 1) * 8, true)); }
      else args.push(view.getInt32(cursor * 4, true));
    }
    if (code === 141314) return now;
    if (code === 141250) return 1;
    if (code === 150328) return args[0] % args[1];
    if (code === 136300 && pointer - runtime.stackPointer.value === 352) {
      baseline = Array.from({ length: 6 }, (_, index) => view.getFloat32(renderer + index * 4, true));
    }
    if (code === 138111) width = args[1];
    if (code === 136946 && args[1] === -36) {
      armed = true;
      marker = { rect: args.slice(1), width,
        matrix: Array.from({ length: 6 }, (_, index) => view.getFloat32(renderer + index * 4, true)) };
    }
    if (armed && code === 137728) alpha = args[1];
    if (armed && code === 136732) throw stop;
    return 0;
  }
  runtime = await loadOriginal('client', { functionIds: [368, 1096, 369, 370, 426, 763, 818, 391], imports: { a: { a: host, c: host } } });
  runtime.call(1096); runtime.call(391, 1);
  const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer);
  const put = (address, value) => view.setInt32(address, value, true);
  const alloc = length => { const pointer = runtime.call(368, length); bytes.fill(0, pointer, pointer + length); return pointer; };
  const state = 441408;
  if (!(bytes[7931360] & 1) && runtime.call(369, 7931360)) { runtime.call(426); runtime.call(370, 7931360); }
  for (const address of [7931240, 7926872, 7931316, 7931312, 7931292, 7931340, 7931336, 7931332]) put(address, state);
  bytes[7931352] = 1;
  const entity = alloc(448), transform = alloc(176), visual = alloc(192), color = alloc(4);
  component = alloc(76); renderer = alloc(128); put(color, -1);
  for (const [offset, pointer] of [[36, component], [1276, transform], [1452, visual]]) {
    const entries = alloc(4); put(entries, pointer); put(state + offset, 1); put(state + offset + 8, entries); put(pointer, entity);
  }
  put(entity, state); put(entity + 52, component); put(entity + 120, transform); put(entity + 136, visual);
  bytes.set([1, 0, 16, 1, 0], entity + 45); bytes[entity + 44] = +fresh; bytes[component + 8] = 7;
  const control = alloc(176), controls = alloc(4);
  put(control + 144, entity); put(controls, control); put(state + 256, 1); put(state + 264, controls); bytes[state + 1] = 1;
  put(7948176, randomSeed);
  let first = true;
  return (delta, collected = false) => {
    if (!first) now += Math.max(1, delta); first = false;
    runtime.call(818, renderer, color); bytes[component + 9] = +collected; bytes[7922312] = 0;
    armed = false; baseline = marker = alpha = undefined;
    const stack = runtime.stackPointer.value;
    try { runtime.call(763, state - 8, renderer, delta, 1280, 720); }
    catch (error) { if (error !== stop) throw error; }
    finally { runtime.stackPointer.value = stack; }
    const object = view.getUint32(component + 68, true);
    return { now, baseline, marker, alpha,
      progress: view.getFloat32(object + 160, true), phase: view.getFloat32(object + 164, true),
      createdAt: view.getFloat64(object + 176, true) };
  };
}

/** func587 supplies the card inside the black pickup marker. */
export async function createDropCardOracle() {
  let runtime, calls = [];
  function host(code, signature, pointer) {
    if (!runtime) return 0;
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; (type = bytes[signature++]); cursor++) {
      if (type < 105) { if (cursor & 1) cursor++; args.push(view.getFloat64((cursor++ >> 1) * 8, true)); }
      else args.push(view.getInt32(cursor * 4, true));
    }
    if (code === 141250 || code === 141620) return 1;
    if (code === 141314) return 1000;
    if (code === 150328) return args[0] % args[1];
    calls.push([code, ...args.slice(1)]); return 0;
  }
  runtime = await loadOriginal('client', { functionIds: [368, 391, 587, 818], imports: { a: { a: host, c: host } } });
  runtime.call(391, 1);
  const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer);
  const alloc = length => { const p = runtime.call(368, length); bytes.fill(0, p, p + length); return p; };
  const renderer = alloc(128), label = alloc(184), reference = alloc(4), color = alloc(4); view.setInt32(color, -1, true);
  return (type, size = 70) => {
    runtime.call(818, renderer, color); bytes[label] = type; view.setInt32(reference, 0, true); calls = [];
    runtime.call(587, renderer, 16, type, size, label, reference, 0, 0);
    return calls;
  };
}
