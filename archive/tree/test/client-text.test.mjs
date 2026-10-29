import test, { after } from "node:test";

import assert from "node:assert/strict";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { createTextHooks, functionIds } from "../source/game/client/text.mjs";

let oracleComparisons=0;
after(()=>console.log(`Text oracle comparisons: ${oracleComparisons}`));

async function oracle() {
  let runtime, clock = 1234.56789, ready = 1, measured = 123.456789, throwAt = 0, mutation, nextContext = 20;
  let sizes = new Map([ [ 7, [ 1280, 800 ] ] ]);
  const events = [];
  function host(code, signature, pointer) {
    const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; type = bytes[signature++]; cursor++) {
      const isDouble = type < 105;
      if (isDouble && cursor & 1) cursor++;
      args.push(isDouble ? view.getFloat64((cursor++ >> 1) * 8, true) : view.getInt32(cursor * 4, true));
    }
    const text = [ 138505, 138365, 138434 ].includes(code) ? Buffer.from(bytes.slice(args[1] >>> 0, args[1] + args[2] >>> 0)).toString("hex") : undefined;
    events.push({
      code: code,
      pointer: pointer,
      args: args,
      text: text,
      bytes: Buffer.from(bytes.slice(pointer, cursor * 4)).toString("hex")
    });
    if (throwAt === events.length) throw new Error("text host failure");
    mutation?.(code, view, args);
    switch (code) {
     case 141250:
      return 1;

     case 141314:
      return clock;

     case 150328:
      return args[0] % args[1];

     case 139312:
      return ready;

     case 138505:
      return measured;

     case 135144:
      return 0;

     case 135298:
     case 135607:
      {
        const id = nextContext++;
        sizes.set(id, [ args[0], args[1] ]);
        return id;
      }

     case 136473:
      sizes.set(args[0], [ args[1], args[2] ]);
      return 0;

     case 136554:
      {
        const size = sizes.get(args[0]) ?? [ 1, 1 ];
        view.setUint32(args[1] >>> 0, size[0], true);
        view.setUint32(args[2] >>> 0, size[1], true);
        return 0;
      }

     default:
      return 0;
    }
  }
  runtime = await loadOriginal("client", {
    functionIds: [ ...functionIds, 362, 363, 366, 368, 369, 370, 371, 372, 398, 632, 634 ],
    imports: {
      a: {
        a: host,
        c: host
      }
    }
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createTextHooks(runtime);
  const word = (a, v) => view.setUint32(a, v, true), float = (a, v) => view.setFloat32(a, v, true), double = (a, v) => view.setFloat64(a, v, true);
  const allocate = size => {
    const pointer = runtime.call(368, size);
    bytes.fill(0, pointer, pointer + size);
    return pointer;
  };
  function makeString(text) {
    const encoded = Buffer.from(text), source = allocate(encoded.length + 1), string = allocate(12);
    bytes.set(encoded, source);
    runtime.call(561, string, source, encoded.length);
    return string;
  }
  function renderer() {
    const r = allocate(104), color = allocate(4);
    word(color, 4279246896);
    runtime.call(818, r, color);
    word(r + 96, 7);
    return r;
  }
  function label(text = "Hello") {
    const l = allocate(160), color = allocate(4);
    word(color, 4294967295);
    runtime.call(818, l + 8, color);
    word(l, 1);
    float(l + 112, 1);
    float(l + 144, .1);
    float(l + 148, 32);
    bytes.set([ 245, 194, 21, 12, 34, 56 ], l + 136);
    const string = makeString(text);
    const source = view.getUint32(string, true), tag = bytes[string + 11];
    runtime.call(561, l + 124, tag & 128 ? source : string, tag & 128 ? view.getUint32(string + 4, true) : tag);
    return l;
  }
  const capture = () => ({
    memory: Buffer.from(bytes),
    stack: runtime.stackPointer.value,
    sizes: structuredClone(sizes),
    nextContext: nextContext
  });
  const restore = s => {
    bytes.set(s.memory);
    runtime.stackPointer.value = s.stack;
    sizes = structuredClone(s.sizes);
    nextContext = s.nextContext;
  };
  function compare(id, args, name) {
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
    assert.equal(actual, expected, `${name}: return`);
    assert.deepEqual(actualError, expectedError, `${name}: exception`);
    assert.deepEqual(events, expectedEvents, `${name}: host calls and live arguments`);
    assert.deepEqual(sizes, after.sizes, `${name}: canvas dimensions`);
    assert.equal(nextContext, after.nextContext, `${name}: canvas allocations`);
    assert.equal(runtime.stackPointer.value, after.stack, `${name}: stack`);
    if (!bytes.equals(after.memory)) {
      const differences = [];
      for (let i = 0; i < bytes.length && differences.length < 24; i++) if (bytes[i] !== after.memory[i]) differences.push({
        at: i,
        native: after.memory[i],
        recovered: bytes[i]
      });
      assert.fail(`${name}: memory ${JSON.stringify(differences)}`);
    }
    return {
      error: expectedError,
      events: expectedEvents,
      result: expected
    };
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
    makeString: makeString,
    renderer: renderer,
    label: label,
    capture: capture,
    restore: restore,
    compare: compare,
    configure(options = {}) {
      clock = options.clock ?? 1234.56789;
      ready = options.ready ?? 1;
      measured = Object.hasOwn(options, "measured") ? options.measured : 123.456789;
      throwAt = options.throwAt ?? 0;
      mutation = options.mutation;
    }
  };
}

test("text renderer initialization and canvas clearing retain packed fields, cached identity and list services", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, allocate: allocate, renderer: renderer, capture: capture, restore: restore, compare: compare} = o, r = renderer(), color = allocate(4), initial = capture();
  for (const bits of [ 0, 4294967295, 4279383126, 1065353216 ]) {
    restore(initial);
    word(color, bits);
    compare(818, [ r, color ], `initialize color${bits}`);
  }
  for (const context of [ -1, 7 ]) for (const cached of [ false, true ]) for (const dirty of [ 0, 1 ]) {
    restore(initial);
    word(r + 96, context);
    bytes[r + 48] = dirty;
    if (!cached) bytes.fill(0, r + 24, r + 48);
    assert.equal(compare(496, [ r ], `clear context${context},cached${cached},dirty${dirty}`).error, undefined);
  }
}));

test('conditional byte copying retains zero-length pointer behavior and overlapping copies',async()=>{
  const o=await oracle(),{bytes,allocate,capture,restore,compare}=o;
  const storage=allocate(256);for(let i=0;i<256;i++)bytes[storage+i]=i;
  const initial=capture();
  for(const displacement of [-1,0,1])for(const length of [0,1,3,4,15,32,65]){
    restore(initial);assert.equal(compare(472,[storage+80+displacement,storage+80,length],`copy ${displacement}/${length}`).error,undefined);
  }
  for(const destination of [-1,bytes.length+1])for(const source of [-1,bytes.length+1]){
    restore(initial);assert.equal(compare(472,[destination,source,0],'zero-length invalid pointers').error,undefined);
  }
  for(const args of [[-1,storage,1],[storage,-1,1],[storage,bytes.length-2,10],[bytes.length-2,storage,10]]){
    // Preserve native wraparound/no-op cases as well as native partial traps.
    restore(initial);compare(472,args,'byte-copy pointer boundary');
  }
});

test('string growth retains prefix insertion suffix, capacity rounding, and aliased insertions',async()=>{
  const o=await oracle(),{bytes,view,allocate,makeString,capture,restore,compare}=o;
  const strings=[0,4,10,11,15,16,31,32].map(length=>makeString('ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'.slice(0,length)));
  const source=allocate(128);for(let i=0;i<128;i++)bytes[source+i]=97+i%26;
  const initial=capture();
  for(const string of strings){
    const heap=bytes[string+11]&128,oldLength=heap?view.getUint32(string+4,true):bytes[string+11];
    const capacity=heap?(view.getUint32(string+8,true)&2147483647)-1:10;
    for(const prefix of [0,Math.floor(oldLength/2),oldLength])for(const removed of [0,oldLength-prefix])for(const inserted of [0,1,11]){
      restore(initial);
      const result=compare(636,[string,capacity,inserted+64,oldLength,prefix,removed,inserted,source],`replace ${oldLength}/${prefix}/${removed}/${inserted}`);
      assert.equal(result.error,undefined);
      const storage=view.getUint32(string,true),length=view.getUint32(string+4,true);
      assert.equal(length,oldLength-removed+inserted);assert.equal(bytes[storage+length],0);
    }
  }
  for(const string of strings.slice(0,3))for(const increment of [0,1,5,6,15,16,17,32,64]){
    restore(initial);const oldLength=bytes[string+11];
    assert.equal(compare(636,[string,10,increment,oldLength,0,oldLength,0,source],`capacity ${increment}`).error,undefined);
  }
  const string=strings.at(-1),capacity=(view.getUint32(string+8,true)&2147483647)-1;
  for(const offset of [0,1,8]){
    restore(initial);const storage=view.getUint32(string,true);
    assert.equal(compare(636,[string,capacity,32,32,4,8,10,storage+offset],`aliased insertion ${offset}`).error,undefined);
  }
});

test('string growth preserves failed allocation, length rejection, and partial writes on traps',async()=>{
  const o=await oracle(),{bytes,word,makeString,capture,restore,compare}=o;
  const string=makeString('short'),initial=capture();
  const cases=[[-1,10,1,0,0,0,0,0],[string,10,1,5,0,5,4,bytes.length-2],
    [string,10,0xffffffff,5,0,5,0,0],[string,2147483623,1,5,0,5,0,0],
    [string,2147483622,1,5,0,5,0,0]];
  for(const args of cases){restore(initial);assert.ok(compare(636,args,`growth trap ${args}`).error);}
  restore(initial);word(string,bytes.length-2);bytes[string+11]=128;
  assert.equal(compare(636,[string,15,32,5,4,0,0,0],'old-storage prefix trap').error?.[0],'RuntimeError');
});

test('left-aligned text retains vertical font snapshot, outlines, readiness, and host failures',async()=>{
  const o=await oracle(),{bytes,float,renderer,label,capture,restore,compare,configure}=o;
  const r=renderer(),labels=['','Flower','A longer flower name'].map(text=>label(text)),initial=capture();
  for(const ready of [0,1])for(const l of labels)for(const font of [0,-0,32,Infinity,NaN])for(const outline of [0,.1,NaN]){
    restore(initial);configure({ready});float(l+148,font);float(l+144,outline);
    assert.equal(compare(819,[l,r,45.25,-70.125],`left label ${ready}/${font}/${outline}`).error,undefined);
  }
  const l=labels[1];
  for(const trigger of [139312,138505]){
    restore(initial);configure({mutation(code,view){if(code===trigger)view.setFloat32(l+148,37,true);}});
    assert.equal(compare(819,[l,r,1,2],`font callback ${trigger}`).error,undefined);
  }
  for(const throwAt of [1,2,3,5]){restore(initial);configure({throwAt});compare(819,[l,r,1,2],`left host failure ${throwAt}`);}
  configure();
  for(const args of [[-1,r,1,2],[l,-1,1,2]]){restore(initial);assert.equal(compare(819,args,'left pointer trap').error?.[0],'RuntimeError');}
});

test("label content updates retain short and heap strings, equality, alias and dirty caches", (async () => {
  const o = await oracle(), {bytes: bytes, label: label, makeString: makeString, capture: capture, restore: restore, compare: compare} = o;
  const values = [ "", "a", "0123456789", "01234567890", "The flower has a longer name", "花瓣🌼" ];
  const labels = values.map((v => label(v))), strings = values.map((v => makeString(v))), initial = capture();
  for (let from = 0; from < values.length; from++) for (let to = 0; to < values.length; to++) for (const cached of [ 0, 1 ]) {
    restore(initial);
    bytes[labels[from] + 120] = cached;
    assert.equal(compare(556, [ labels[from], strings[to] ], `${values[from]} -> ${values[to]},cached${cached}`).error, undefined);
  }
  for (const l of labels) {
    restore(initial);
    compare(556, [ l, l + 124 ], "self string");
  }
}));

test("text string storage preserves allocation thresholds and overlapping copies", (async () => {
  const o = await oracle(), {bytes: bytes, allocate: allocate, makeString: makeString, capture: capture, restore: restore, compare: compare} = o, source = allocate(200), empty = makeString(""), heap = makeString("long enough for heap allocation"), initial = capture();
  for (const id of [ 561, 590 ]) for (const length of [ 0, 1, 9, 10, 11, 15, 16, 31, 32, 65 ]) {
    restore(initial);
    for (let i = 0; i < 180; i++) bytes[source + i] = 65 + i % 26;
    assert.equal(compare(id, [ id === 561 ? empty : heap, source, length ], `assign${id} length${length}`).error, undefined);
  }
  for (const length of [ 0, 1, 5, 10 ]) {
    restore(initial);
    compare(561, [ empty, empty + 1, length ], `overlap inline${length}`);
  }
}));

test("text measurement preserves cold and warm width caches and exact Canvas measurement result", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, allocate: allocate, renderer: renderer, label: label, capture: capture, restore: restore, compare: compare, configure: configure} = o, l = label("Measured label"), r = renderer(), slice = allocate(8), initial = capture();
  word(slice, l + 124);
  word(slice + 4, 5);
  for (const cached of [ 0, 1 ]) for (const size of [ 0, -0, 32, Infinity, NaN ]) for (const measured of [ 0, 137.625, Infinity, NaN ]) {
    restore(initial);
    bytes[l + 120] = cached;
    float(l + 148, size);
    configure({
      measured: measured
    });
    assert.equal(compare(385, [ l ], `measure cached${cached},size${size},width${measured}`).error, undefined);
  }
  for (const dirty of [ 0, 1 ]) {
    restore(initial);
    bytes[r + 48] = dirty;
    word(slice, l + 124);
    word(slice + 4, 5);
    configure({
      measured: 215.125
    });
    assert.equal(compare(817, [ r, slice ], `measure slice dirty${dirty}`).error, undefined);
  }
}));

test("text raster caches honor font readiness, scale thresholds, outlines and grayscale colors", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, renderer: renderer, label: label, capture: capture, restore: restore, compare: compare, configure: configure} = o, l = label("A flower 🌼"), r = renderer(), initial = capture();
  for (const ready of [ 0, 1 ]) for (const dirty of [ 0, 1 ]) for (const grayscale of [ 0, 1 ]) for (const outline of [ 0, .1, 1 ]) for (const scale of [ .2, 1, 3 ]) {
    restore(initial);
    configure({
      ready: ready
    });
    bytes[l] = dirty;
    bytes[l + 77] = grayscale;
    float(l + 144, outline);
    word(l + 104, 7);
    float(l + 112, 2);
    float(r, scale);
    float(r + 12, scale);
    const result = compare(444, [ l, r ], `ready${ready},dirty${dirty},gray${grayscale},outline${outline},scale${scale}`);
    assert.equal(result.error, undefined);
  }
}));

test("cached text canvases retain affine image draws, timestamps and centered label layout", (async () => {
  const o = await oracle(), {word: word, float: float, renderer: renderer, label: label, capture: capture, restore: restore, compare: compare, configure: configure} = o, l = label("Flower"), r = renderer(), initial = capture();
  for (const context of [ -1, 7 ]) for (const values of [ [ 1, 0, 0, 1, 0, 0 ], [ .2, .3, -.1, .7, 5, -9 ], [ Infinity, 0, 0, 1, 0, 0 ], [ 1, NaN, 0, 1, 0, 0 ] ]) {
    restore(initial);
    word(l + 104, context);
    values.forEach(((v, i) => float(r + i * 4, v)));
    assert.equal(compare(443, [ r, l + 8, 1.5, -2.25, 44.5, 22.75 ], `image context${context},matrix${values}`).error, undefined);
  }
  for (const ready of [ 0, 1 ]) for (const center of [ 0, 1 ]) for (const text of [ "", "flower", "A longer flower name" ]) {
    restore(initial);
    configure({
      ready: ready
    });
    const labelPointer = o.label(text);
    assert.equal(compare(392, [ labelPointer, r, 45.25, -70.125, center ], `draw text${text},center${center},ready${ready}`).error, undefined);
  }
}));

test("text rasterization retains exact scale thresholds and nonfinite font and outline values", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, renderer: renderer, label: label, capture: capture, restore: restore, compare: compare, configure: configure} = o, l = label("Threshold"), r = renderer(), initial = capture();
  for (const scale of [ .3999999761581421, .4000000059604645, 1.0000998973846436, 1.000100016593933, Infinity, NaN ]) {
    restore(initial);
    bytes[l] = 0;
    word(l + 104, 7);
    float(l + 112, 2);
    float(r, scale);
    float(r + 12, scale);
    configure();
    assert.equal(compare(444, [ l, r ], `scale threshold${scale}`).error, undefined);
  }
  for (const size of [ 0, -0, -1, Infinity, NaN ]) for (const outline of [ 0, -0, .1, -.1, Infinity, NaN ]) for (const measured of [ 0, Infinity, NaN ]) {
    restore(initial);
    float(l + 148, size);
    float(l + 144, outline);
    configure({
      measured: measured
    });
    assert.equal(compare(444, [ l, r ], `font${size},outline${outline},measure${measured}`).error, undefined);
  }
}));

test("text services preserve host failures, invalid pointers and partial scratch state", (async () => {
  const o = await oracle(), {runtime: runtime, bytes: bytes, word: word, float: float, allocate: allocate, renderer: renderer, label: label, capture: capture, restore: restore, compare: compare, configure: configure} = o, l = label("Flower name"), r = renderer(), source = allocate(40), initial = capture();
  for (const id of [ 385, 392, 443, 444, 496, 817 ]) for (const throwAt of [ 1, 2, 3, 5 ]) {
    restore(initial);
    configure({
      throwAt: throwAt
    });
    word(source, l + 124);
    word(source + 4, 5);
    const args = id === 385 ? [ l ] : id === 392 ? [ l, r, 1, 2, 1 ] : id === 443 ? [ r, l + 8, 1, 2, 3, 4 ] : id === 444 ? [ l, r ] : id === 496 ? [ r ] : [ r, source ];
    compare(id, args, `host failure${id}/${throwAt}`);
  }
  configure();
  for (const [id, args] of [ [ 385, [ -1 ] ], [ 392, [ bytes.length - 130, r, 1, 2, 1 ] ], [ 443, [ r, bytes.length - 90, 1, 2, 3, 4 ] ], [ 444, [ l, -1 ] ], [ 496, [ -1 ] ], [ 556, [ l, -1 ] ], [ 561, [ source, bytes.length - 2, 10 ] ], [ 590, [ l + 124, bytes.length - 2, 5 ] ], [ 817, [ r, -1 ] ], [ 818, [ r, -1 ] ] ]) {
    restore(initial);
    compare(id, args, `invalid${id}/${args}`);
  }
  for (const offset of [ 0, 8, 48 ]) {
    restore(initial);
    compare(818, [ r, r + offset ], `renderer/color alias${offset}`);
  }
}));

test("canvas recreation removes head, middle and tail nodes before inserting the new context", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, renderer: renderer, capture: capture, restore: restore, compare: compare} = o, nodes = [ renderer(), renderer(), renderer() ], fresh = renderer(), initial = capture();
  function list() {
    word(441324, nodes[0]);
    word(441320, 3);
    nodes.forEach(((r, i) => {
      word(r + 72, nodes[i + 1] ?? 0);
      word(r + 76, nodes[i - 1] ?? 0);
      word(r + 96, 7 + i);
    }));
    bytes[441332] = 1;
    bytes[441333] = 1;
  }
  for (let index = 0; index < nodes.length; index++) for (const offscreen of [ 0, 1 ]) {
    restore(initial);
    list();
    bytes[441328] = offscreen;
    assert.equal(compare(632, [ nodes[index], 71, 39 ], `recreate list position${index},offscreen${offscreen}`).error, undefined);
    assert.equal(o.view.getUint32(441324, true), nodes[index], "recreated renderer becomes head");
  }
  for (const offscreen of [ 0, 1 ]) {
    restore(initial);
    list();
    bytes[441328] = offscreen;
    word(fresh + 96, -1);
    assert.equal(compare(632, [ fresh, 71, 39 ], `create fresh offscreen${offscreen}`).error, undefined);
    assert.equal(o.view.getUint32(fresh + 72, true), nodes[0]);
  }
}));

test("canvas defaults preserve callback mutations of matrix and line styles before later reads", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, renderer: renderer, capture: capture, restore: restore, compare: compare, configure: configure} = o, r = renderer(), initial = capture();
  restore(initial);
  compare(633, [ r ], "reset defaults");
  for (const trigger of [ 135960, 137767, 138111, 138893 ]) {
    restore(initial);
    configure({
      mutation(code, view) {
        if (code !== trigger) return;
        view.setFloat32(r, 2.25, true);
        view.setUint8(r + 48, 1);
        view.setUint8(r + 49, 1);
        view.setUint8(r + 50, 0);
      }
    });
    assert.equal(compare(633, [ r ], `mutate defaults after${trigger}`).error, undefined);
  }
  restore(initial);
  configure();
  compare(633, [ o.runtime.stackPointer.value - 80 ], "defaults overlap scratch");
}));

test("canvas resizing and allocation retain dimension clamping, host failures and partial list writes", (async () => {
  const o = await oracle(), {runtime: runtime, bytes: bytes, word: word, renderer: renderer, capture: capture, restore: restore, compare: compare, configure: configure} = o, r = renderer(), initial = capture();
  for (const context of [ -1, 7 ]) for (const dimensions of [ [ 1280, 800 ], [ 1, 1 ], [ 0, 0 ], [ -10, -20 ], [ 17, 23 ], [ 2147483647, 1 ] ]) {
    restore(initial);
    word(r + 96, context);
    assert.equal(compare(634, [ r, ...dimensions ], `resize context${context},${dimensions}`).error, undefined);
  }
  for (const id of [ 632, 633, 634 ]) for (const throwAt of [ 1, 2, 3, 4, 5, 6 ]) {
    restore(initial);
    configure({
      throwAt: throwAt
    });
    compare(id, id === 633 ? [ r ] : [ r, 45, 23 ], `context host failure${id}/${throwAt}`);
  }
  configure();
  for (const id of [ 632, 633, 634 ]) {
    restore(initial);
    compare(id, id === 633 ? [ -1 ] : [ -1, 45, 23 ], `context pointer trap${id}`);
  }
  for (const id of [ 632, 633, 634 ]) {
    restore(initial);
    compare(id, id === 633 ? [ runtime.stackPointer.value - 80 ] : [ runtime.stackPointer.value - 80, 45, 23 ], `context scratch alias${id}`);
  }
}));
