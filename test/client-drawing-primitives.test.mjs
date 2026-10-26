import test, {after} from "node:test";

import assert from "node:assert/strict";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { createDrawingPrimitiveHooks, functionIds } from "../source/game/client/drawing-primitives.mjs";

let oracleComparisons=0;
after(()=>console.log(`Drawing primitive oracle comparisons: ${oracleComparisons}`));

async function oracle() {
  let runtime, throwAt = 0, mutation;
  const events = [];
  function host(code, signature, pointer) {
    const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer), args = [];
    let cursor = pointer >> 2;
    for (let type; type = bytes[signature++]; cursor++) {
      const isDouble = type < 105;
      if (isDouble && cursor & 1) cursor++;
      args.push(isDouble ? view.getFloat64((cursor++ >> 1) * 8, true) : view.getInt32(cursor * 4, true));
    }
    events.push({
      code: code,
      pointer: pointer,
      args: args,
      bytes: Buffer.from(bytes.slice(pointer, cursor * 4)).toString("hex")
    });
    if (throwAt === events.length) throw new Error("canvas failure");
    mutation?.(code, view);
    return undefined;
  }
  runtime = await loadOriginal("client", {
    functionIds: [ ...functionIds, 366, 368, 372 ],
    imports: {
      a: {
        a: host
      }
    }
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createDrawingPrimitiveHooks(runtime);
  const word = (a, v) => view.setUint32(a, v, true), float = (a, v) => view.setFloat32(a, v, true), double = (a, v) => view.setFloat64(a, v, true);
  const allocate = size => {
    const p = runtime.call(368, size);
    bytes.fill(0, p, p + size);
    return p;
  };
  const capture = () => ({
    memory: Buffer.from(bytes),
    stack: runtime.stackPointer.value
  });
  const restore = s => {
    bytes.set(s.memory);
    runtime.stackPointer.value = s.stack;
  };
  function compare(id, args, label) {
    oracleComparisons++;
    const before = capture();
    events.length = 0;
    let expected, actual, expectedError, actualError;
    try {
      expected = runtime.call(id, ...args);
    } catch (e) {
      expectedError = [ e.constructor.name, e.message ];
    }
    const after = capture(), expectedEvents = structuredClone(events);
    restore(before);
    events.length = 0;
    try {
      actual = hooks[id](...args);
    } catch (e) {
      actualError = [ e.constructor.name, e.message ];
    }
    assert.deepEqual(actualError, expectedError, `${label}: trap`);
    assert.equal(actual, expected, `${label}: result`);
    assert.deepEqual(events, expectedEvents, `${label}: Canvas calls and live arguments`);
    assert.equal(runtime.stackPointer.value, after.stack, `${label}: stack`);
    if (!bytes.equals(after.memory)) {
      const differences = [];
      for (let i = 0; i < bytes.length && differences.length < 20; i++) if (bytes[i] !== after.memory[i]) differences.push({
        at: i,
        native: after.memory[i],
        recovered: bytes[i]
      });
      assert.fail(`${label}: memory ${JSON.stringify(differences)}`);
    }
    return {
      error: expectedError,
      events: expectedEvents
    };
  }
  function matrix(renderer, values, cached = false) {
    values.forEach(((v, i) => {
      float(renderer + i * 4, v);
      float(renderer + 24 + i * 4, cached ? v : 0);
    }));
    word(renderer + 96, 17);
  }
  return {
    runtime: runtime,
    hooks: hooks,
    bytes: bytes,
    view: view,
    word: word,
    float: float,
    double: double,
    allocate: allocate,
    capture: capture,
    restore: restore,
    compare: compare,
    matrix: matrix,
    configure(throws = 0, callback) {
      throwAt = throws;
      mutation = callback;
    }
  };
}

const matrices = [ [ 1, 0, 0, 1, 0, 0 ], [ 0, -0, -0, 0, -0, 0 ], [ .125, -.25, 1.234567, 3.456789, -55.125, 9.75 ], [ 1e30, 1e-30, -1e15, -1e-15, 1e10, -1e10 ], [ Infinity, 0, 0, 1, 3, 5 ], [ 1, NaN, 0, 1, 0, -0 ] ];

test("client rectangle drawing retains exact affine f32 composition, cached matrix and restore order", (async () => {
  const o = await oracle(), {bytes: bytes, allocate: allocate, matrix: matrix, capture: capture, restore: restore, compare: compare} = o, renderer = allocate(128), initial = capture();
  const rectangles = [ [ 12.125, -3.5, 44.75, 22.5 ], [ 0, -0, -0, 0 ], [ -100, 80, -60, -40 ], [ 1e20, -1e20, 1e-20, 1e20 ], [ Infinity, 0, 1, 1 ], [ 0, 0, Infinity, NaN ] ];
  for (const transform of matrices) for (const rectangle of rectangles) for (const cached of [ false, true ]) for (const dirty of [ 0, 1 ]) {
    restore(initial);
    matrix(renderer, transform, cached);
    bytes[renderer + 48] = dirty;
    assert.equal(compare(410, [ renderer, ...rectangle ], `matrix=${transform},rect=${rectangle},cached=${cached},dirty=${dirty}`).error, undefined);
  }
}));

test("client path lines capture coordinates before synchronizing the dirty transform", (async () => {
  const o = await oracle(), {bytes: bytes, float: float, allocate: allocate, matrix: matrix, capture: capture, restore: restore, compare: compare} = o, renderer = allocate(128), point = allocate(8), initial = capture();
  for (const transform of matrices) for (const coordinate of [ 0, -0, 1.234567890123, Infinity, NaN ]) for (const cached of [ false, true ]) for (const dirty of [ 0, 1 ]) {
    restore(initial);
    matrix(renderer, transform, cached);
    bytes[renderer + 48] = dirty;
    float(point, coordinate);
    float(point + 4, -coordinate);
    assert.equal(compare(562, [ renderer, point ], `matrix=${transform},point=${coordinate},cached=${cached},dirty=${dirty}`).error, undefined);
  }
}));

test("client f32 rounding matches exponent boundaries, half ties and deterministic raw float patterns", (async () => {
  const {runtime: runtime, hooks: hooks, bytes: bytes, capture: capture} = await oracle(), scratch = new DataView(new ArrayBuffer(4)), values = [];
  for (let exponent = 0; exponent < 256; exponent++) for (const mantissa of [ 0, 1, 4194303, 4194304, 8388607 ]) for (const sign of [ 0, 2147483648 ]) {
    scratch.setUint32(0, (sign | exponent << 23 | mantissa) >>> 0, true);
    values.push(scratch.getFloat32(0, true));
  }
  let seed = 1136208497;
  for (let i = 0; i < 4096; i++) {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    scratch.setUint32(0, seed, true);
    values.push(scratch.getFloat32(0, true));
  }
  for (const value of [ -2.5, -1.5, -.5, .5, 1.5, 2.5, 8388607.5 ]) values.push(value);
  const before = capture();
  for (const value of values) assert.equal(hooks[631](value), runtime.call(631, value), `round ${value}`);
  assert.equal(values.length, 6663);
  assert.ok(bytes.equals(before.memory), "pure rounding retains all memory");
  assert.equal(runtime.stackPointer.value, before.stack);
}));

test("client arena bands match signed level thresholds, moving boundaries and exact widened constants", (async () => {
  const {runtime: runtime, hooks: hooks, bytes: bytes, view: view, float: float, double: double, allocate: allocate, capture: capture, restore: restore} = await oracle(), settings = allocate(360), initial = capture();
  const cases = [];
  for (const mode of [ 0, 1, 2, 255 ]) for (const level of [ -2147483648, -1, 0, 14, 15, 29, 30, 44, 45, 255, 2147483647 ]) for (const extent of [ 0, -0, 1e3, 1e10, Infinity, NaN ]) for (const time of [ -1, 0, 9e4, 45e4, 9e5, Infinity, NaN ]) cases.push({
    mode: mode,
    level: level,
    extent: extent,
    time: time
  });
  function run(call) {
    const results = [];
    for (const c of cases) {
      bytes[settings + 249] = c.mode;
      float(settings + 252, c.extent);
      double(settings + 344, c.time);
      results.push(call(settings, c.level));
    }
    return results;
  }
  const expected = run(((...args) => runtime.call(588, ...args))), after = capture();
  restore(initial);
  const actual = run(hooks[588]);
  assert.deepEqual(actual, expected);
  assert.equal(cases.length, 1848);
  assert.ok(bytes.equals(after.memory), "complete memory after the boundary batch");
  assert.equal(runtime.stackPointer.value, after.stack);
}));

test("client drawing keeps host failures, coordinate aliases and partial writes at memory traps", (async () => {
  const o = await oracle(), {runtime: runtime, bytes: bytes, float: float, allocate: allocate, matrix: matrix, capture: capture, restore: restore, compare: compare, configure: configure} = o, renderer = allocate(128), point = allocate(8), initial = capture();
  for (const id of [ 410, 562 ]) for (const throws of [ 1, 2 ]) {
    restore(initial);
    matrix(renderer, [ 1, 0, 0, 1, 10, 20 ]);
    bytes[renderer + 48] = 1;
    configure(throws);
    compare(id, id === 410 ? [ renderer, 1, 2, 3, 4 ] : [ renderer, point ], `host failure ${id}/${throws}`);
  }
  configure();
  for (const args of [ [ 410, [ -1, 1, 2, 3, 4 ] ], [ 410, [ bytes.length - 16, 1, 2, 3, 4 ] ], [ 562, [ renderer, bytes.length - 4 ] ], [ 562, [ bytes.length - 40, point ] ], [ 588, [ -1, 15 ] ] ]) {
    restore(initial);
    compare(args[0], args[1], `invalid ${args[0]}/${args[1]}`);
  }
  for (const offset of [ 0, 4, 16, 24, 40, 48 ]) {
    restore(initial);
    matrix(renderer, [ 1, .25, .5, 1, -4, 8 ]);
    bytes[renderer + 48] = 1;
    compare(562, [ renderer, renderer + offset ], `point aliases matrix ${offset}`);
  }
  for (const code of [ 136414, 137843, 137096 ]) {
    restore(initial);
    matrix(renderer, [ 1, 0, 0, 1, 10, 20 ]);
    bytes[renderer + 48] = 1;
    configure(0, ((address, view) => {
      if (address === code) view.setUint32(renderer + 96, 99, true);
    }));
    compare(code === 137843 ? 562 : 410, code === 137843 ? [ renderer, point ] : [ renderer, 1, 2, 3, 4 ], `host context mutation ${code}`);
  }
  configure();
  for (const id of [ 410, 562 ]) {
    restore(initial);
    compare(id, id === 410 ? [ runtime.stackPointer.value - 80, 1, 2, 3, 4 ] : [ renderer, runtime.stackPointer.value - 80 ], `stack alias ${id}`);
  }
}));

test('client path fill/stroke and stored-path stroke retain dirty cache, missing path and host mutation order',async()=>{
  const o=await oracle(),{runtime,bytes,word,float,allocate,matrix,capture,restore,compare,configure}=o;
  const renderer=allocate(128),path=allocate(4),initial=capture();
  for(const transform of matrices)for(const cached of [false,true])for(const dirty of [0,1]){
    restore(initial);matrix(renderer,transform,cached);bytes[renderer+48]=dirty;
    assert.equal(compare(395,[renderer],`fill/stroke ${transform}/${cached}/${dirty}`).error,undefined);
    for(const handle of [-1,12]){
      restore(initial);matrix(renderer,transform,cached);bytes[renderer+48]=dirty;word(path,handle);
      assert.equal(compare(455,[renderer,path],`stored path ${handle}/${transform}/${cached}/${dirty}`).error,undefined);
    }
  }
  for(const id of [395,455])for(const trigger of id===395?[136661,136414,136732]:[136414,136763]){
    restore(initial);matrix(renderer,[1,.25,.5,1,10,20]);bytes[renderer+48]=1;word(path,12);
    configure(0,(code,view)=>{
      if(code!==trigger)return;
      view.setUint32(renderer+96,99,true);view.setFloat32(renderer+8,3.125,true);view.setUint32(path,27,true);
    });
    const result=compare(id,id===395?[renderer]:[renderer,path],`path callback ${id}/${trigger}`);
    assert.equal(result.error,undefined);assert.ok(result.events.some(event=>event.code===trigger));
  }
  configure();restore(initial);word(path,-1);
  assert.equal(compare(455,[-1,path],'missing path skips invalid renderer').error,undefined);
});

test('client image region drawing retains source crop, exact affine state and source timestamp',async()=>{
  const o=await oracle(),{bytes,word,allocate,matrix,capture,restore,compare}=o;
  const renderer=allocate(128),source=allocate(128),initial=capture();
  const regions=[[120,80,12.125,-3.5,44.75,22.5],[0,-0,0,-0,-0,0],[-1,-2,-100,80,-60,-40],[Infinity,NaN,Infinity,0,Infinity,NaN]];
  for(const transform of matrices)for(const region of regions)for(const cached of [false,true])for(const context of [-1,17]){
    restore(initial);matrix(renderer,transform,cached);bytes[renderer+48]=1;word(source+96,context);
    assert.equal(compare(1131,[renderer,source,...region],`region ${transform}/${region}/${cached}/${context}`).error,undefined);
  }
  restore(initial);word(source+96,-1);
  assert.equal(compare(1131,[-1,source,120,120,0,0,120,120],'missing source skips invalid renderer').error,undefined);
});

test('client path and region helpers preserve host exceptions, memory traps, context callbacks and scratch aliases',async()=>{
  const o=await oracle(),{runtime,bytes,word,allocate,matrix,capture,restore,compare,configure}=o;
  const renderer=allocate(128),source=allocate(128),path=allocate(4),initial=capture();
  const args=id=>id===395?[renderer]:id===455?[renderer,path]:[renderer,source,120,80,1,2,3,4];
  function setup(){matrix(renderer,[1,.25,.5,1,10,20]);bytes[renderer+48]=1;word(source+96,23);word(path,12);}
  for(const id of [395,455,1131])for(const throws of [1,2,3,5]){
    restore(initial);setup();configure(throws);compare(id,args(id),`helper failure ${id}/${throws}`);
  }
  configure();
  for(const [id,arguments_]of [[395,[-1]],[395,[bytes.length-40]],[455,[renderer,-1]],[455,[-1,path]],[1131,[renderer,-1,1,2,3,4,5,6]],[1131,[-1,source,1,2,3,4,5,6]]]){
    restore(initial);setup();assert.equal(compare(id,arguments_,`helper pointer ${id}`).error?.[0],'RuntimeError');
  }
  for(const trigger of [136414,138280]){
    restore(initial);setup();configure(0,(code,view)=>{
      if(code!==trigger)return;view.setUint32(renderer+96,99,true);view.setUint32(source+96,77,true);
    });
    const result=compare(1131,args(1131),`region context callback ${trigger}`);assert.equal(result.error,undefined);assert.ok(result.events.some(event=>event.code===trigger));
  }
  configure();
  for(const [id,arguments_]of [[455,[renderer,renderer]],[1131,[renderer,renderer,120,80,1,2,3,4]],
    [395,[runtime.stackPointer.value-80]],[455,[runtime.stackPointer.value-80,path]],
    [1131,[runtime.stackPointer.value-120,source,120,80,1,2,3,4]],
    [1131,[renderer,runtime.stackPointer.value-80,120,80,1,2,3,4]]]){
    restore(initial);setup();compare(id,arguments_,`helper alias ${id}`);
  }
});
