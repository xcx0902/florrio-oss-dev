/** Product worker: current C ABI, automatic 50ms clock or explicit manual ticks. */
let modulePromise = null;
let wasmMemory = null;
let tickTimer = null;
const parameters = new URL(self.location.href).searchParams;
const manualTick = parameters.has('manual');


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
  try {
  if (data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    length = bytes.length;
    pointer = exports.malloc(length);
    if (length && !pointer) throw new Error('Worker input allocation failed');
    new Uint8Array(exports.memory.buffer).set(bytes, pointer);
  }
  switch (funcName) {
    case 'sp_server_init':
      exports.sp_server_init();
      startTicking(exports);
      break;
    case 'sp_server_send': exports.sp_server_send(pointer, length); break;
    case 'sp_server_think': exports.sp_server_think(); break;
    case 'sp_server_flush': exports.sp_server_flush(); break;
    case 'sp_server_debug_spawn_mob': {
      const view = new DataView(exports.memory.buffer, pointer, length);
      exports.sp_server_debug_spawn_mob(view.getUint16(0, true),
        view.getFloat32(2, true), view.getFloat32(6, true));
      break;
    }
    case 'sp_server_debug_set_loadout_slot': {
      const view = new Uint8Array(exports.memory.buffer, pointer, length);
      exports.sp_server_debug_set_loadout_slot(view[0], view[1] | (view[2] << 8));
      break;
    }
    case 'sp_server_debug_set_player_position': {
      if (!exports.sp_server_player_valid()) throw new Error('no controlled flower');
      const view = new DataView(exports.memory.buffer, pointer, length);
      const handle = exports.sp_server_player_handle();
      if (!exports.sp_server_debug_set_entity_field(handle, 0, view.getFloat32(0, true))
          || !exports.sp_server_debug_set_entity_field(handle, 1, view.getFloat32(4, true)))
        throw new Error('teleport target rejected');
      // A teleport should land exactly on the requested point, not keep the
      // velocity accumulated before the jump.
      exports.sp_server_debug_set_entity_field(handle, 2, 0);
      exports.sp_server_debug_set_entity_field(handle, 3, 0);
      break;
    }
    default: throw new Error(`invalid worker function to call: ${funcName}`);
  }
  } finally { if (pointer) exports.free(pointer); }
  if (funcName === 'sp_server_flush') postOutput(exports, callbackId);
  self.postMessage({ callbackId, finalResponse: true, data: 0 });
  } catch (error) {
    self.postMessage({ callbackId, finalResponse: true, data: 0, error: String(error) });
  }
};
