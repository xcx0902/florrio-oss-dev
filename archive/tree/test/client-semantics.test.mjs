import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLIENT_MEMORY, accumulateMouseWheel, requestDisconnect, shouldConfirmBrowserQuit } from '../source/semantic/client-behavior.mjs';
import { extractClientCatalogs } from '../source/semantic/extract-client-catalogs.mjs';

const artifact = new Uint8Array(await readFile(new URL('../web/client.wasm', import.meta.url)));
const module = new WebAssembly.Module(artifact);
function loadClient() {
  const imports = {};
  for (const item of WebAssembly.Module.imports(module)) {
    assert.equal(item.kind, 'function');
    (imports[item.module] ??= {})[item.name] = () => 0;
  }
  // These routines require neither constructors, browser access nor timers.
  return new WebAssembly.Instance(module, imports).exports;
}

test('readable wheel accumulation matches original Rf with IEEE-754 edge cases', () => {
  const wasm = loadClient(), memory = wasm.Mf, view = new DataView(memory.buffer);
  for (const start of [0, -0, 1, -1, Number.MAX_VALUE, Number.MIN_VALUE, Infinity, -Infinity, NaN]) {
    for (const delta of [0, -0, 1, -1, 0.1, 1e-300, Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
      view.setFloat64(CLIENT_MEMORY.wheelDelta, start, true);
      wasm.Rf(delta);
      const expected = view.getFloat64(CLIENT_MEMORY.wheelDelta, true);
      view.setFloat64(CLIENT_MEMORY.wheelDelta, start, true);
      accumulateMouseWheel(memory, delta);
      assert.ok(Object.is(view.getFloat64(CLIENT_MEMORY.wheelDelta, true), expected));
    }
  }
});

test('readable disconnect request matches original Xf without touching adjacent bytes', () => {
  const wasm = loadClient(), bytes = new Uint8Array(wasm.Mf.buffer);
  const start = CLIENT_MEMORY.disconnectRequested - 8, end = start + 17;
  for (const previous of [0, 1, 127, 255]) {
    bytes.fill(previous, start, end);
    wasm.Xf();
    const expected = bytes.slice(start, end);
    bytes.fill(previous, start, end);
    requestDisconnect(wasm.Mf);
    assert.deepEqual(bytes.slice(start, end), expected);
  }
});

test('readable quit confirmation matches original Uf for absent and present callbacks', () => {
  const wasm = loadClient(), view = new DataView(wasm.Mf.buffer);
  view.setUint32(CLIENT_MEMORY.quitConfirmationCallback, 0, true);
  assert.equal(shouldConfirmBrowserQuit(wasm.Mf, wasm.eg), wasm.Uf());
  // A minimal independent WASM function f(i32)->i32 returns its argument.
  const identity = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
    0,97,115,109,1,0,0,0, 1,6,1,96,1,127,1,127, 3,2,1,0,
    7,5,1,1,102,0,0, 10,6,1,4,0,32,0,11,
  ]))).exports.f;
  const callback = 9000000, vtable = callback + 64;
  const tableSlot = wasm.eg.length - 1;
  wasm.eg.set(tableSlot, identity);
  view.setUint32(CLIENT_MEMORY.quitConfirmationCallback, callback, true);
  view.setUint32(callback, vtable, true);
  view.setUint32(vtable + 24, tableSlot, true);
  assert.equal(wasm.Uf(), callback);
  assert.equal(shouldConfirmBrowserQuit(wasm.Mf, wasm.eg), callback);
});

test('client catalogs reproduce all records from original constructors and lazy entity initializer', async () => {
  const saved = JSON.parse(await readFile(new URL('../source/semantic/client-catalogs.json', import.meta.url), 'utf8'));
  assert.deepEqual(await extractClientCatalogs(), saved);
  assert.equal(saved.petalDefinitions.length, 39);
  assert.equal(saved.entityDefinitions.length, 23);
});
