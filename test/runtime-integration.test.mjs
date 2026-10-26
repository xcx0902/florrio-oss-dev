import test from 'node:test';
import assert from 'node:assert/strict';
import wabtFactory from 'wabt';
import { makeReadableWat, topLevelForms } from '../tools/lib/readable-wasm.mjs';
import { createRuntimeContext } from '../source/runtime/context.mjs';

const wabt = await wabtFactory();
test('migrated bodies execute high-level hooks with unchanged calls, table slots, imports and shared stack', async () => {
  const source = `(module
    (type $binary (func (param i32 i32) (result i32)))
    (import "a" "observe" (func $observe (type $binary)))
    (global $stack_pointer (mut i32) (i32.const 4096))
    (memory $linear_memory 1)
    (table $indirect_function_table 2 funcref)
    (func $sum (type $binary) (param $left i32) (param $right i32) (result i32)
      local.get $left local.get $right i32.add)
    (func $caller (type $binary) (param $left i32) (param $right i32) (result i32)
      local.get $left local.get $right call $sum)
    (elem (i32.const 0) $observe $sum)
    (export "result" (func $caller)))`;
  const inventory = [{ id: 0, name: 'observe' }, { id: 1, name: 'sum' }, { id: 2, name: 'caller' }];
  const recovered = makeReadableWat(source, inventory, [{ id: 1, source: 'readable-sum.mjs' }]);
  assert.equal(recovered.text.includes('i32.add'), false, 'old implementation must be absent, not a bypassable fallback');
  const module = wabt.parseWat('integration.wat', recovered.text);
  let calls = 0;
  const imports = { a: { observe: (a, b) => a - b }, readable: { f1: (a, b) => { calls++; return a + b; } } };
  const { instance } = await WebAssembly.instantiate(module.toBinary({}).buffer, imports);
  module.destroy();
  const runtime = createRuntimeContext(imports);
  runtime.attach(instance);
  assert.equal(instance.exports.result(123, 456), 579);
  assert.equal(runtime.call(2, 7, 8), 15);
  assert.equal(runtime.table.get(1)(19, 23), 42);
  assert.equal(calls, 3);
  assert.equal(runtime.call(0, 9, 2), 7);
  assert.equal(runtime.host('a', 'observe', 6, 2), 4);
  assert.equal(runtime.indirect({ parameters: ['i32', 'i32'], results: ['i32'] }, 1, 17, 25), 42);
  assert.throws(() => runtime.indirect({ parameters: ['i32'], results: ['i32'] }, 1, 17), WebAssembly.RuntimeError);
  assert.throws(() => runtime.indirect({ parameters: ['i32', 'i32'], results: ['i32'] }, 2, 17, 25), WebAssembly.RuntimeError);
  runtime.table.set(0, null);
  assert.throws(() => runtime.indirect({ parameters: ['i32', 'i32'], results: ['i32'] }, 0, 17, 25), WebAssembly.RuntimeError);
  runtime.stackPointer.value = 2048;
  assert.equal(instance.exports.__stack_pointer.value, 2048);
  new Uint8Array(runtime.memory.buffer)[11] = 37;
  assert.equal(new Uint8Array(instance.exports.__readable_memory.buffer)[11], 37);
});

test('WAT boundaries ignore escaped strings and nested comments', () => {
  const code = '(module (; outer (; nested ;) ;) (memory 1) (data (i32.const 0) "(func $fake \\\" )"))';
  assert.equal(topLevelForms(code).length, 2);
  assert.throws(() => topLevelForms('(module (memory 1)'), /Incomplete/);
});
