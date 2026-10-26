/**
 * Production worker shim for the C++ engine.
 *
 * The engine is compiled to `server.wasm` with the C ABI in
 * engine/include/engine/abi.h. This shim mirrors the original sp_server.js
 * message envelope so the archived client and the new TypeScript client can
 * both talk to it.
 *
 * The original worker owns its simulation clock: its host import 22600 runs
 * sp_server_think every 50 ms. The shim mirrors that with a worker-local timer
 * unless it was loaded with ?manual=1, which lets parity drivers advance the
 * engine on the virtual clock instead.
 */
let modulePromise = null;
let wasmMemory = null;
let tickTimer = null;
const parameters = new URL(self.location.href).searchParams;
const manualTick = parameters.has('manual');
const originalMode = parameters.has('original');


const wasi = {
  fd_close: () => 0,
  fd_seek: () => 0,
  fd_write: (descriptor, vectors, count, written) => {
    if (!wasmMemory) return 0;
    const view = new DataView(wasmMemory.buffer);
    let total = 0;
    for (let index = 0; index < count; index++) total += view.getUint32(vectors + index * 8 + 4, true);
    view.setUint32(written >>> 0, total >>> 0, true);
    return 0;
  },
};

async function instantiate() {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const response = await fetch('server.wasm');
    if (!response.ok) throw new Error(`cannot load server.wasm: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: { emscripten_notify_memory_growth: () => {} },
      wasi_snapshot_preview1: wasi,
    });
    wasmMemory = instance.exports.memory;
    return instance.exports;
  })();
  return modulePromise;
}

function startTicking(exports) {
  if (manualTick || tickTimer !== null) return;
  tickTimer = setInterval(() => {
    try {
      exports.sp_server_think();
    } catch (error) {
      self.postMessage({ callbackId: -1, finalResponse: true, data: 0, error: String(error) });
    }
  }, 50);
}

function postOutput(exports, callbackId) {
  const count = exports.sp_server_output_count();
  let posted = 0;
  for (let index = 0; index < count; index++) {
    const address = exports.sp_server_output_data(index);
    const size = exports.sp_server_output_size(index);
    if (!address || !size) continue;
    const copy = new Uint8Array(exports.memory.buffer, address, size).slice();
    self.postMessage({ callbackId, finalResponse: false, data: copy }, [copy.buffer]);
    posted += 1;
  }
  return posted;
}

self.onmessage = async event => {
  const { funcName, callbackId, data } = event.data ?? {};
  try {
  const exports = await instantiate();
  let pointer = 0;
  let length = 0;
  if (data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    length = bytes.length;
    pointer = exports.malloc(length);
    new Uint8Array(exports.memory.buffer).set(bytes, pointer);
  }
  switch (funcName) {
    case 'sp_server_init':
      exports.sp_server_init();
      startTicking(exports);
      break;
    case 'sp_server_send': exports.sp_server_send(pointer, length); break;
    case 'sp_server_think': exports.sp_server_think(); break;
    case 'sp_server_flush':
      if (originalMode) exports.sp_server_flush_original();
      else exports.sp_server_flush();
      break;
    default: throw new Error(`invalid worker function to call: ${funcName}`);
  }
  if (pointer) exports.free(pointer);
  if (funcName === 'sp_server_flush') postOutput(exports, callbackId);
  self.postMessage({ callbackId, finalResponse: true, data: 0 });
  } catch (error) {
    self.postMessage({ callbackId, finalResponse: true, data: 0, error: String(error) });
  }
};
