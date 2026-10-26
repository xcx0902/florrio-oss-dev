import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('original client probe retains client memory when the server instantiates later', async () => {
  const client = { exports: { Mf: new WebAssembly.Memory({ initial: 1 }) } };
  const server = { exports: { o: new WebAssembly.Memory({ initial: 1 }) } };
  const fakeWasm = { Memory: WebAssembly.Memory, instantiate: async value => ({ instance: value }) };
  const context = vm.createContext({ window: {}, WebAssembly: fakeWasm, DataView, Uint8Array, Math });
  const source = await readFile(new URL('../tools/parity/client-wasm.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace('export function ', 'function ') + '\ninstallClientWasmProbe();', context);
  await fakeWasm.instantiate(client);
  assert.equal(context.window.__clientWasm.memory, client.exports.Mf);
  await fakeWasm.instantiate(server);
  assert.equal(context.window.__clientWasm.memory, client.exports.Mf);
  assert.equal(context.window.__clientWasm.instance, client);
});
