#!/usr/bin/env node
/**
 * Call the shipped collision resolver (original function 390) directly.
 *
 * The debug module is `source/wasm/sp_server.wat` with two extra exports
 * (`debug162`, `debug390`); assemble it with:
 *
 *   node_modules/.bin/wat2wasm /tmp/sp_server-debug.wat -o /tmp/sp_server-debug.wasm
 *
 * Usage:
 *   node tools/parity/probe-collision-390.mjs --a 1174093855 --b 1789739117
 *   node tools/parity/probe-collision-390.mjs --a ... --b ... --flag 1
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve('.');
const modulePath = path.resolve(option('--module', '/tmp/sp_server-debug.wasm'));
const handleA = Number(option('--a', '1174093855'));
const handleB = Number(option('--b', '1789739117'));
const scratchFlag = Number(option('--flag', '0'));
const doubleCall = args.includes('--double');
const seed0 = 0x6f6c6446;

const wasm = await readFile(modulePath);
let instance;
let memory = null;
let clock = 0;
let seed = seed0;
const imports = {
  a: {
    a: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
    b: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
    c: () => 0,
    d: () => 0,
    e: () => { throw new WebAssembly.RuntimeError('OOM'); },
    f: () => { throw new WebAssembly.RuntimeError('abort'); },
    g: () => 0,
    h: pointer => { new DataView(memory.buffer).setUint32(pointer >>> 0, 0, true); return 0; },
    i: (countPointer, sizePointer) => {
      const view = new DataView(memory.buffer);
      view.setUint32(countPointer >>> 0, 0, true);
      view.setUint32(sizePointer >>> 0, 0, true);
      return 0;
    },
    j: (descriptor, vectors, count, writtenPointer) => {
      const view = new DataView(memory.buffer);
      let total = 0;
      for (let index = 0; index < count; index++) total += view.getUint32(vectors + index * 8 + 4, true);
      view.setUint32(writtenPointer >>> 0, total >>> 0, true);
      return 0;
    },
    k: () => 0,
    l: () => {},
    m: (target, start, length) => { new Uint8Array(memory.buffer).copyWithin(target, start, start + length); },
    n: (pointer, length) => {
      const bytes = new Uint8Array(memory.buffer);
      for (let index = 0; index < length; index++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        bytes[pointer + index] = seed & 255;
      }
      return 0;
    },
  },
};
function asmConst(address, signaturePointer, argumentsPointer) {
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const values = [];
  let word = argumentsPointer >>> 2;
  let cursor = signaturePointer;
  let type;
  while ((type = bytes[cursor++])) {
    const isDouble = type < 105;
    if (isDouble && (word & 1)) word++;
    values.push(isDouble ? view.getFloat64(word * 4, true) : view.getInt32(word * 4, true));
    word += isDouble ? 2 : 1;
  }
  switch (address) {
    case 22600: return 0;
    case 22639: return 0;
    case 22791: return 1;
    case 22855: return values[0] ? clock : clock;
    case 22903: return values[0] % values[1];
    default: throw new Error(`unexpected host bridge ${address}`);
  }
}
({ instance } = await WebAssembly.instantiate(wasm, imports));
memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
instance.exports.p();
instance.exports.u(0, 0);

const view = () => new DataView(memory.buffer);
const u32 = pointer => view().getUint32(pointer >>> 0, true);
const f32 = pointer => view().getFloat32(pointer >>> 0, true);
const f64 = pointer => view().getFloat64(pointer >>> 0, true);
const u8 = pointer => view().getUint8(pointer >>> 0);

function entityTable() {
  const entities = new Map();
  const seen = new Set();
  let node = u32(25092);
  while (node && !seen.has(node)) {
    seen.add(node);
    const entity = node - 20;
    const transform = u32(entity + 168);
    if (transform) entities.set(u32(entity + 16), { entity, transform });
    node = u32(node + 8);
  }
  return entities;
}
const entities = entityTable();
const a = entities.get(handleA);
const b = entities.get(handleB);
if (!a || !b) throw new Error(`entity not found: ${!a ? handleA : handleB}`);

const read = entry => ({
  x: f32(entry.transform + 20),
  y: f32(entry.transform + 16),
  vx: f64(entry.transform + 40),
  vy: f64(entry.transform + 48),
  worldX: f64(entry.transform + 88),
  worldY: f64(entry.transform + 96),
  dirty: u8(entry.transform + 80),
  flags95: u8(entry.entity + 95),
  physics48: u8(u32(entry.entity + 188) + 48),
  physics50: u8(u32(entry.entity + 188) + 50),
  radius: f32(u32(entry.entity + 188) + 8),
  mass: f32(u32(entry.entity + 188) + 40),
});
const show = (label, value) => console.log(
  `${label}: pos ${value.x.toFixed(5)},${value.y.toFixed(5)} vel ${value.vx.toExponential(6)},${value.vy.toExponential(6)} ` +
  `world ${value.worldX.toFixed(4)},${value.worldY.toFixed(4)} dirty ${value.dirty} flags95 ${value.flags95} ` +
  `p48 ${value.physics48} p50 ${value.physics50} r ${value.radius} mass ${value.mass}`);

console.log(`A ${handleA} entity@${a.entity} transform@${a.transform}`);
console.log(`B ${handleB} entity@${b.entity} transform@${b.transform}`);
show('before A', read(a));
show('before B', read(b));

const setPosition = (transform, xOption, yOption) => {
  const x = option(xOption, null);
  const y = option(yOption, null);
  if (x !== null) new DataView(memory.buffer).setFloat32(transform + 20, Number(x), true);
  if (y !== null) new DataView(memory.buffer).setFloat32(transform + 16, Number(y), true);
};
setPosition(a.transform, '--ax', '--ay');
setPosition(b.transform, '--bx', '--by');
const setWorld = (transform, xOption, yOption) => {
  const x = option(xOption, null);
  const y = option(yOption, null);
  if (x !== null) new DataView(memory.buffer).setFloat64(transform + 88, Number(x), true);
  if (y !== null) new DataView(memory.buffer).setFloat64(transform + 96, Number(y), true);
};
setWorld(a.transform, '--awx', '--awy');
setWorld(b.transform, '--bwx', '--bwy');
const setRadius = (entity, radiusOption) => {
  const radius = option(radiusOption, null);
  if (radius !== null) new DataView(memory.buffer).setFloat32(u32(entity + 188) + 8, Number(radius), true);
};
setRadius(a.entity, '--ar');
setRadius(b.entity, '--br');
const setB48 = Number(option('--set-b48', '-1'));
if (setB48 >= 0) new Uint8Array(memory.buffer)[u32(b.entity + 188) + 48] = setB48;
const setA48 = Number(option('--set-a48', '-1'));
if (setA48 >= 0) new Uint8Array(memory.buffer)[u32(a.entity + 188) + 48] = setA48;
const setAvx = Number(option('--avx', '0'));
const setAvy = Number(option('--avy', '0'));
const setBvx = Number(option('--bvx', '0'));
const setBvy = Number(option('--bvy', '0'));
new DataView(memory.buffer).setFloat64(a.transform + 40, setAvx, true);
new DataView(memory.buffer).setFloat64(a.transform + 48, setAvy, true);
new DataView(memory.buffer).setFloat64(b.transform + 40, setBvx, true);
new DataView(memory.buffer).setFloat64(b.transform + 48, setBvy, true);
const scratch = instance.exports.q(64);
new Uint8Array(memory.buffer).fill(0, scratch, scratch + 64);
new DataView(memory.buffer).setUint8(scratch, scratchFlag);
const transformA = read(a);
const transformB = read(b);
const ax = transformA.vx + 0; // acceleration is zero at rest
const ay = transformA.vy + 0;
const bx = transformB.vx + 0;
const by = transformB.vy + 0;
instance.exports.debug390(scratch, a.entity, b.entity, bx, by, ax, ay);
show('after 390(A,B)', read(a));
show('after 390(A,B) B', read(b));
if (doubleCall) {
  instance.exports.debug390(scratch, b.entity, a.entity, ax, ay, bx, by);
  show('after 390(B,A) A', read(a));
  show('after 390(B,A) B', read(b));
}
