import assert from 'node:assert/strict';
import vm from 'node:vm';

export function checkDispatch(wat, source) {
  // For Binaryen 132, these are module "a" imports "a", "c", and "d".
  const imports = [...wat.matchAll(/^ \(import "a" "[acd]" \(func (\$fimport\$\d+)/gm)].map(
    (match) => match[1].replaceAll('$', '\\$'),
  );
  assert.equal(imports.length, 3);
  const calls = [
    ...wat.matchAll(
      new RegExp(`\\(call (?:${imports.join('|')})\\s+\\(i32\\.const (\\d+)\\)`, 'g'),
    ),
  ];
  const ids = [...new Set(calls.map((match) => Number(match[1])))].sort((a, b) => a - b);
  const start = source.indexOf('Kb={');
  const end = source.indexOf('var Nc', start);
  assert.ok(start >= 0 && end > start, 'Original glue table markers missing');
  const keys = new Set(
    [...source.slice(start, end).matchAll(/(?:\{|,)(\d+):/g)].map((match) => Number(match[1])),
  );
  assert.equal(ids.length, 148);
  assert.deepEqual(
    ids.filter((id) => !keys.has(id)),
    [],
    'Dispatch key missing from JS glue',
  );
  return { count: ids.length, calls: calls.length, ids };
}

export function probeGlue(js, wasm, fixture) {
  const module = new WebAssembly.Module(wasm);
  const sent = [];
  const dispatches = [];
  let instance;
  let dispatch;
  const endpoint = 'ws://127.0.0.1/fixture';
  const noNetwork = () => {
    throw new Error('Network disabled in the transport probe');
  };
  const box = {
    console,
    WebAssembly,
    URL,
    TextDecoder,
    TextEncoder,
    performance,
    Date,
    crypto: { getRandomValues: (bytes) => bytes.fill(1) },
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    fetch: noNetwork,
    XMLHttpRequest: noNetwork,
    WebSocket: class {
      constructor(url) {
        assert.equal(url, endpoint);
        this.url = url;
        this.readyState = 1;
      }
      send(bytes) {
        sent.push(Buffer.from(bytes).toString('hex'));
      }
    },
    location: new URL('http://127.0.0.1/'),
    document: {
      currentScript: { src: 'http://127.0.0.1/client.js' },
      querySelector: () => null,
      addEventListener() {},
    },
    addEventListener() {},
    Module: {
      noInitialRun: true,
      instantiateWasm(imports, done) {
        const original = imports.a.a;
        dispatch = (...args) => {
          dispatches.push(args[0]);
          return original(...args);
        };
        imports.a.a = dispatch;
        instance = new WebAssembly.Instance(module, imports);
        done(instance);
        return instance.exports;
      },
    },
  };
  box.self = box;
  box.window = box;
  box.top = box;
  vm.runInNewContext(js, box, { filename: 'client.js', timeout: 2000 });
  const { Jf: memory, bg: table } = instance.exports;
  const heap = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const alloc = (size) => box.Module._malloc(size);
  const write32 = (address, value) => view.setUint32(address, value, true);

  const url = alloc(64);
  const args = alloc(16);
  const socket = alloc(256);
  const packet = alloc(16);
  const message = alloc(16);
  const fields = alloc(16);
  heap.set(Buffer.from(endpoint + '\0'), url);
  write32(args, url);
  // Signature "i", then object offset consumed by the Wasm send adapter.
  const slot = dispatch(142848, 53035, args);
  assert.equal(slot, 0);
  write32(socket + 128, slot);
  heap.set(Buffer.from(fixture.hex, 'hex'), packet);
  write32(message, socket);
  write32(message + 4, fields);
  write32(message + 8, fields + 4);
  write32(fields, packet);
  write32(fields + 4, fixture.length);
  table.get(3750)(0, message);
  assert.deepEqual(dispatches, [142848, 143871]);
  assert.deepEqual(sent, [fixture.hex]);

  return {
    transport: { ...fixture, slot, dispatches, observedHex: sent[0] },
    instance,
    alloc,
  };
}
