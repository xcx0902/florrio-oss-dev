/** Deterministic original or recovered server world for replay and diagnosis. */
import { loadOriginal } from './wasm-probe.mjs';
import { loadReadable } from './readable-probe.mjs';

export async function createServerWorld(readable, options = {}) {
  let runtime, clock = 1000, seed = 0x6f6c6446;
  const outgoing = [];
  const memory = () => new DataView(runtime.memory.buffer);
  function asmConstant(address, signature, argumentsPointer) {
    const bytes = new Uint8Array(runtime.memory.buffer), view = memory(), args = [];
    let word = argumentsPointer >>> 2, type;
    while ((type = bytes[signature++])) {
      const double = type < 105;
      if (double && (word & 1)) word++;
      args.push(double ? view.getFloat64(word * 4, true) : view.getInt32(word * 4, true));
      word += double ? 2 : 1;
    }
    switch (address) {
      case 22600: return 0; // scheduler observed but advanced explicitly by this replay
      case 22639: return 0; // no network socket events in local-worker mode
      case 22791: return 1;
      case 22855: return clock;
      case 22903: return args[0] % args[1];
      default: throw new Error(`Unexpected host bridge ${address}`);
    }
  }
  const imports = { a: {
    a: asmConstant, b: asmConstant,
    c: (pointer, length) => outgoing.push(['final', pointer, length]),
    d: (pointer, length) => outgoing.push(['data', Buffer.from(new Uint8Array(runtime.memory.buffer, pointer, length)).toString('hex')]),
    e: () => { throw new WebAssembly.RuntimeError('OOM'); },
    f: () => { throw new WebAssembly.RuntimeError('abort'); },
    i: (count, size) => { memory().setUint32(count, 0, true); memory().setUint32(size, 0, true); return 0; },
    j: (fd, vectors, count, written) => {
      let size = 0;
      for (let i = 0; i < count; i++) size += memory().getUint32(vectors + i * 8 + 4, true);
      memory().setUint32(written, size, true); return 0;
    },
    n: (pointer, length) => {
      const bytes = new Uint8Array(runtime.memory.buffer);
      for (let i = 0; i < length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        bytes[pointer + i] = seed & 255;
      }
      return 0;
    },
  } };
  runtime = readable ? await loadReadable('sp_server', { imports, construct: false, ...options })
    : await loadOriginal('sp_server', { imports, construct: false, functionIds: [14, 16, 654, 655, 656, 657, ...(options.functionIds ?? [])] });
  runtime.exports.p();
  runtime.call(656, 0, 0);
  return {
    runtime, outgoing,
    advance(milliseconds = 50) { clock += milliseconds; runtime.call(654); runtime.call(657, 0, 0); },
    capture() {
      return { memory: Buffer.from(new Uint8Array(runtime.memory.buffer)), stack: runtime.stackPointer.value,
        clock, seed, outgoing: structuredClone(outgoing) };
    },
    restore(saved) {
      new Uint8Array(runtime.memory.buffer).set(saved.memory); runtime.stackPointer.value = saved.stack;
      clock = saved.clock; seed = saved.seed; outgoing.splice(0, outgoing.length, ...structuredClone(saved.outgoing));
    },
    send(bytes) {
      const pointer = runtime.call(16, bytes.length);
      new Uint8Array(runtime.memory.buffer).set(bytes, pointer);
      runtime.call(655, pointer, bytes.length);
      runtime.call(14, pointer);
    },
  };
}

