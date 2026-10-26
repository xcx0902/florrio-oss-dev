/**
 * Deterministic replacement for the sp_server Web Worker.
 *
 * The archived client talks to `new Worker("sp_server.js")`. Instead of
 * spawning a real worker (whose timers and clock are outside Playwright's
 * control), this module runs the original `sp_server.wasm` on the page thread
 * behind a small Worker-compatible facade. The page's virtual clock therefore
 * drives both the client rAF loop and the server's 50 ms tick, which makes a
 * replay repeatable.
 *
 * The facade implements the same four worker entry points as the archived
 * `sp_server.js` glue (`sp_server_init`, `sp_server_send`, `sp_server_think`,
 * `sp_server_flush`) and the same response envelopes
 * `{callbackId, finalResponse, data}`.
 */
export function installDeterministicServer(options = {}) {
  const NativeWorker = window.Worker;
  const serverUrl = options.serverUrl || 'sp_server.js';
  const wasmUrl = options.wasmUrl || serverUrl.replace(/\.js(?:$|\?)/, '.wasm');
  const seed0 = options.seed >>> 0 || 0x6f6c6446;

  // Deterministic entropy for both the page and the server facade.
  let entropy = seed0;
  const nextEntropy = () => {
    entropy ^= entropy << 13; entropy ^= entropy >>> 17; entropy ^= entropy << 5;
    return entropy >>> 0;
  };
  Math.random = () => nextEntropy() / 4294967296;
  if (globalThis.crypto && typeof crypto.getRandomValues === 'function') {
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value(array) {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let i = 0; i < bytes.length; i++) bytes[i] = nextEntropy() & 255;
        return array;
      },
    });
  }

  const trace = { messages: [], responses: [], ticks: [], clock: [] };
  let worker = null;
  function fnv(bytes) {
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }

  class ServerWorker {
    constructor(url) {
      this.url = String(url);
      this.onmessage = null;
      this.onerror = null;
      this._queue = [];
      this._ready = false;
      this._callbackId = -1;
      this._memory = null;
      this._exports = null;
      this._seed = seed0;
      this._tickTimer = 0;
      this._trace = trace;
      worker = this;
      this._load();
    }

    _load() {
      fetch(wasmUrl).then(r => {
        if (!r.ok) throw new Error(`cannot load ${wasmUrl}: ${r.status}`);
        return r.arrayBuffer();
      }).then(bytes => WebAssembly.instantiate(bytes, this._imports()))
        .then(({ instance }) => {
          this._exports = instance.exports;
          this._memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
          this._exports.p(); // ___wasm_call_ctors
          this._ready = true;
          this._pump();
        })
        .catch(error => {
          this._error(error);
        });
    }

    _view() { return new DataView(this._memory.buffer); }
    _bytes() { return new Uint8Array(this._memory.buffer); }

    _asmConst(address, signaturePointer, argumentsPointer) {
      const bytes = this._bytes();
      const view = this._view();
      const args = [];
      let word = argumentsPointer >>> 2;
      let type;
      let cursor = signaturePointer;
      while ((type = bytes[cursor++])) {
        const isDouble = type < 105;
        if (isDouble && (word & 1)) word++;
        args.push(isDouble ? view.getFloat64(word * 4, true) : view.getInt32(word * 4, true));
        word += isDouble ? 2 : 1;
      }
      switch (address) {
        case 22600: // setInterval(sp_server_think, ms)
          this._tickTimer = setInterval(() => this._think(), args[0]);
          trace.ticks.push({ at: performance.now(), interval: args[0] });
          return 0;
        case 22639: return 0; // websocket event queue: none in local mode
        case 22791: return 1; // performance.now available
        case 22855: return args[0] ? performance.now() : Date.now();
        case 22903: return args[0] % args[1];
        default: throw new Error(`unexpected host bridge ${address}`);
      }
    }

    _respond(final, pointer, length) {
      const bytes = pointer ? this._bytes().slice(pointer, pointer + length) : new Uint8Array(0);
      const message = { callbackId: this._callbackId, finalResponse: final, data: bytes.length ? bytes : 0 };
      trace.responses.push({ callbackId: this._callbackId, finalResponse: final, length: bytes.length, hash: fnv(bytes), at: performance.now(),
        // Keep the first snapshot bytes so the driver can locate the client's
        // snapshot state (R03 diagnostics).
        dataHex: !final && !trace.firstDataHex && bytes.length <= 131072
          ? Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('') : null });
      if (!final && !trace.firstDataHex && bytes.length <= 131072)
        trace.firstDataHex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      this._post(message);
    }

    _imports() {
      return {
        a: {
          a: (address, signature, args) => this._asmConst(address, signature, args),
          b: (address, signature, args) => this._asmConst(address, signature, args),
          c: (pointer, length) => this._respond(true, pointer, length),
          d: (pointer, length) => this._respond(false, pointer, length),
          e: () => { throw new WebAssembly.RuntimeError('OOM'); },
          f: () => { throw new WebAssembly.RuntimeError('abort'); },
          g: () => 0,
          h: (pointer, offset) => { // argv strings; the local server has none
            const view = this._view();
            view.setUint32(pointer >>> 0, 0, true);
            return 0;
          },
          i: (countPointer, sizePointer) => {
            const view = this._view();
            view.setUint32(countPointer >>> 0, 0, true);
            view.setUint32(sizePointer >>> 0, 0, true);
            return 0;
          },
          j: (descriptor, vectors, count, writtenPointer) => {
            const view = this._view();
            let total = 0;
            for (let index = 0; index < count; index++) total += view.getUint32(vectors + index * 8 + 4, true);
            view.setUint32(writtenPointer >>> 0, total >>> 0, true);
            return 0;
          },
          k: () => 0,
          l: () => {},
          m: (target, start, length) => { this._bytes().copyWithin(target, start, start + length); },
          n: (pointer, length) => {
            const bytes = this._bytes();
            for (let index = 0; index < length; index++) {
              this._seed ^= this._seed << 13; this._seed ^= this._seed >>> 17; this._seed ^= this._seed << 5;
              bytes[pointer + index] = this._seed & 255;
            }
            return 0;
          },
        },
      };
    }

    _post(message) {
      if (typeof this.onmessage === 'function') this.onmessage({ data: message });
    }

    _error(error) {
      if (typeof this.onerror === 'function') this.onerror({ message: String(error), error });
      else console.error(error);
    }

    _think() {
      if (!this._ready) return;
      const at = performance.now();
      this._exports.v(); // sp_server_think
      trace.ticks.push({ at, think: true });
    }

    _handle(message) {
      const name = message && message.funcName;
      this._callbackId = message && Number.isInteger(message.callbackId) ? message.callbackId : -1;
      const incoming = message?.data
        ? (message.data instanceof ArrayBuffer ? new Uint8Array(message.data)
          : new Uint8Array(message.data.buffer, message.data.byteOffset, message.data.byteLength))
        : new Uint8Array(0);
      trace.messages.push({
        funcName: name, callbackId: this._callbackId, length: incoming.length, hash: fnv(incoming), at: performance.now(),
        dataHex: incoming.length && incoming.length <= 8192 ? Array.from(incoming, byte => byte.toString(16).padStart(2, '0')).join('') : null,
      });
      let pointer = 0;
      let length = 0;
      if (message?.data) {
        const bytes = message.data instanceof ArrayBuffer ? new Uint8Array(message.data)
          : new Uint8Array(message.data.buffer, message.data.byteOffset, message.data.byteLength);
        length = bytes.length;
        pointer = this._exports.q(length); // malloc
        this._bytes().set(bytes, pointer);
      }
      switch (name) {
        case 'sp_server_init': this._exports.u(pointer, length); break;
        case 'sp_server_send': this._exports.w(pointer, length); break;
        case 'sp_server_think': this._exports.v(pointer, length); break;
        case 'sp_server_flush': this._exports.t(pointer, length); break;
        default: throw new Error(`invalid worker function to call: ${name}`);
      }
      if (pointer) this._exports.r(pointer); // free
    }

    _pump() {
      if (!this._ready) return;
      while (this._queue.length) {
        const message = this._queue.shift();
        try { this._handle(message); } catch (error) { this._error(error); }
      }
    }

    postMessage(message) {
      this._queue.push(message);
      this._pump();
    }

    terminate() {
      if (this._tickTimer) clearInterval(this._tickTimer);
      this._tickTimer = 0;
      this._queue.length = 0;
    }
  }

  const WorkerFacade = function (url, workerOptions) {
    if (!String(url).includes('sp_server.js')) return new NativeWorker(url, workerOptions);
    return new ServerWorker(url);
  };
  WorkerFacade.prototype = NativeWorker.prototype;
  window.Worker = WorkerFacade;
  window.__parityServer = {
    trace,
    get worker() { return worker; },
    get ready() { return Boolean(worker && worker._ready); },
    state() {
      if (!worker || !worker._memory) return null;
      return { bytes: worker._memory.buffer.byteLength, tickTimer: worker._tickTimer };
    },
    memoryHash() {
      if (!worker || !worker._memory) return null;
      return fnv(new Uint8Array(worker._memory.buffer));
    },
    exportTrace() {
      return {
        messages: trace.messages,
        responses: trace.responses,
        ticks: trace.ticks,
        firstDataHex: trace.firstDataHex || null,
        memoryBytes: worker?._memory?.buffer.byteLength ?? 0,
      };
    },
  };
}
