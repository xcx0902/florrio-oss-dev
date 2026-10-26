#!/usr/bin/env node
/**
 * Dump the original sp_server collider list and spatial tree.
 *
 * R06 needs the exact broad-phase order: the original resolves contacts by
 * iterating the collider vector (24400/24408) and querying the persistent
 * quadtree rooted at 24984. This probe prints both structures after init and
 * after a number of 50 ms ticks, so the C++ index can be checked against the
 * shipped one instead of guessed.
 *
 * Usage:
 *   node tools/parity/probe-colliders.mjs --ticks 3
 *   node tools/parity/probe-colliders.mjs --scenario garden-idle --ticks 3 --json
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve('.');
const scenarioName = option('--scenario', 'garden-idle');
const maxTicks = Number(option('--ticks', '2'));
const asJson = args.includes('--json');
const seed0 = 0x6f6c6446;
const fromHex = text => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

const golden = JSON.parse(await readFile(
  path.join(root, 'tests/parity/golden', scenarioName, 'server.json'), 'utf8'));
const sends = golden.messages
  .filter(message => message.funcName === 'sp_server_send' && message.dataHex)
  .map((message, index) => ({ at: message.at, order: index, bytes: fromHex(message.dataHex) }));

const wasm = await readFile(path.join(root, 'web/sp_server.wasm'));
let instance;
let memory = null;
let clock = 0;
let seed = seed0;
let outgoing = [];
const imports = {
  a: {
    a: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
    b: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
    c: (pointer, length) => respond(true, pointer, length),
    d: (pointer, length) => respond(false, pointer, length),
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
function respond(final, pointer, length) {
  const bytes = pointer ? new Uint8Array(memory.buffer).slice(pointer, pointer + length) : new Uint8Array(0);
  outgoing.push({ final, length: bytes.length });
}
({ instance } = await WebAssembly.instantiate(wasm, imports));
memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
instance.exports.p();
instance.exports.u(0, 0);
outgoing = [];

const view = () => new DataView(memory.buffer);
const u32 = pointer => view().getUint32(pointer >>> 0, true);
const f32 = pointer => view().getFloat32(pointer >>> 0, true);
const u8 = pointer => view().getUint8(pointer >>> 0);

function entityTable() {
  const entities = new Map();
  const seen = new Set();
  let node = u32(25092);
  while (node && !seen.has(node)) {
    seen.add(node);
    const entity = node - 20;
    const transform = u32(entity + 168);
    const health = u32(entity + 164);
    if (!transform && !health) { node = u32(node + 8); continue; }
    const physics = u32(entity + 188);
    entities.set(u32(entity + 16), {
      entity,
      handle: u32(entity + 16),
      type: u16(entity + 8),
      transform,
      physics,
    });
    node = u32(node + 8);
  }
  return entities;
}
const u16 = pointer => view().getUint16(pointer >>> 0, true);

function colliderList() {
  const count = u32(24400);
  const data = u32(24408);
  const list = [];
  for (let index = 0; index < count; index++) {
    const collider = u32(data + index * 4);
    const entity = u32(collider);
    list.push({
      index,
      collider,
      entity,
      handle: entity ? u32(entity + 16) : 0,
      type: entity ? u16(entity + 8) : 0,
      x: f32(collider + 20),
      y: f32(collider + 24),
      width: f32(collider + 28),
      height: f32(collider + 32),
      node: u32(collider + 36),
    });
  }
  return list;
}

function treeNodes() {
  const nodes = [];
  const seen = new Set();
  const walk = (pointer, depth, pathName) => {
    if (!pointer || seen.has(pointer)) return;
    seen.add(pointer);
    const node = {
      pointer,
      depth,
      path: pathName,
      x: f32(pointer + 8),
      y: f32(pointer + 12),
      width: f32(pointer + 16),
      height: f32(pointer + 20),
      count: u32(pointer + 24),
      capacity: u32(pointer + 28),
      bodies: u32(pointer + 32),
      children: u32(pointer + 36),
      handles: [],
    };
    for (let index = 0; index < node.count; index++) {
      const collider = u32(node.bodies + index * 4);
      const entity = u32(collider);
      node.handles.push(entity ? u32(entity + 16) : 0);
    }
    nodes.push(node);
    if (node.children) {
      for (const [index, name] of [[0, 'NW'], [1, 'NE'], [2, 'SW'], [3, 'SE']])
        walk(node.children + index * 40, depth + 1, pathName + name);
    }
  };
  walk(24984, 0, '');
  return nodes;
}

const rows = [];
const snapshot = label => {
  const entities = entityTable();
  const colliders = colliderList();
  const nodes = treeNodes();
  rows.push({ label, entities: entities.size, colliders, nodes });
};
snapshot('init');
let eventIndex = 0;
for (let tick = 1; tick <= maxTicks; tick++) {
  const at = tick * 50;
  while (eventIndex < sends.length && sends[eventIndex].at <= at) {
    const event = sends[eventIndex++];
    clock = event.at;
    const pointer = instance.exports.q(event.bytes.length);
    new Uint8Array(memory.buffer).set(event.bytes, pointer);
    instance.exports.w(pointer, event.bytes.length);
    instance.exports.r(pointer);
  }
  clock = at;
  instance.exports.v();
  outgoing = [];
  instance.exports.t(0, 0);
  snapshot(`tick ${tick}`);
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const row of rows) {
    console.log(`\n=== ${row.label}: ${row.entities} entities, ${row.colliders.length} colliders, ` +
      `${row.nodes.length} tree nodes ===`);
    console.log('collider order (first 24):');
    console.log(row.colliders.slice(0, 24).map(entry =>
      `${entry.index}:h${entry.handle}(t${entry.type})@${entry.node}`).join(' '));
    if (row.label === 'init') {
      console.log('root bodies:');
      for (const handle of row.nodes[0].handles) {
        const entry = row.colliders.find(candidate => candidate.handle === handle);
        console.log(`  h${handle} collider@${entry?.collider} bounds=(${entry?.x.toFixed(1)},${entry?.y.toFixed(1)},${entry?.width.toFixed(1)},${entry?.height.toFixed(1)}) entity@${entry?.entity}`);
      }
    }
    for (const node of row.nodes.slice(0, 12)) {
      console.log(`  node ${node.path || 'root'} @${node.pointer} depth=${node.depth} ` +
        `bounds=(${node.x.toFixed(1)},${node.y.toFixed(1)},${node.width.toFixed(1)},${node.height.toFixed(1)}) ` +
        `count=${node.count} bodies=[${node.handles.slice(0, 8).map(handle => {
          const entry = row.colliders.find(candidate => candidate.handle === handle);
          return entry ? `t${entry.type}:h${handle}` : `h${handle}`;
        }).join(',')}]`);
    }
  }
}

// Optional transform dump: --transform HANDLE (after the ticks above).
const transformHandle = Number(option('--transform', '0'));
if (transformHandle) {
  const entities = entityTable();
  const entry = entities.get(transformHandle);
  if (!entry) {
    console.log(`no entity ${transformHandle}`);
  } else {
    const transform = entry.transform;
    console.log(`\ntransform for ${transformHandle} @${transform}`);
    for (let offset = 0; offset < 128; offset += 8) {
      const f32a = f32(transform + offset);
      const f32b = f32(transform + offset + 4);
      const f64v = new DataView(memory.buffer).getFloat64(transform + offset, true);
      console.log(`  +${String(offset).padStart(3)}: f32 ${f32a.toFixed(4).padStart(12)} ${f32b.toFixed(4).padStart(12)}   f64 ${f64v.toFixed(6)}`);
    }
  }
}

// Optional pair-order query: --query-order HANDLE prints the pairs the shipped
// quadtree would evaluate for that handle at each snapshot.
const queryHandle = Number(option('--query-order', '0'));
if (queryHandle) {
  const low14 = handle => handle & 16383;
  for (const row of rows) {
    const byPointer = new Map(row.nodes.map(node => [node.pointer, node]));
    const colliders = new Map(row.colliders.map(entry => [entry.collider, entry]));
    const target = row.colliders.find(entry => entry.handle === queryHandle);
    if (!target) { console.log(`\n${row.label}: handle not a collider`); continue; }
    const pairs = [];
    const overlap = (a, b) =>
      !(a.x > b.x + b.width || a.x + a.width < b.x ||
        a.y > b.y + b.height || a.y + a.height < b.y);
    const visit = (node, query) => {
      if (!node) return;
      for (const bodyHandle of node.handles) {
        const body = row.colliders.find(entry => entry.handle === bodyHandle);
        if (!body) continue;
        if (low14(query.handle) >= low14(body.handle)) continue;
        if (!overlap(query, body)) continue;
        pairs.push(body.handle);
      }
      if (!node.children) return;
      const cx = node.x + node.width * 0.5;
      const cy = node.y + node.height * 0.5;
      const child = index => byPointer.get(node.children + index * 40);
      if (query.x < cx) {
        if (query.y < cy) visit(child(0), query);
        if (query.y + query.height >= cy) visit(child(2), query);
      }
      if (query.x + query.width >= cx) {
        if (query.y < cy) visit(child(1), query);
        if (query.y + query.height >= cy) visit(child(3), query);
      }
    };
    // Only pairs where the target is the lower-handle query are visible from
    // its own query; higher-handle partners query it instead. Print both sides
    // so the full order around the target is visible.
    visit(byPointer.get(24984), target);
    const incoming = [];
    for (const entry of row.colliders) {
      if (entry === target) continue;
      if (low14(entry.handle) >= low14(target.handle)) continue;
      if (!overlap(entry, target)) continue;
      incoming.push(entry.handle);
    }
    console.log(`\n${row.label} pairs for ${queryHandle} (outgoing ${pairs.length}, incoming ${incoming.length})`);
    console.log('  outgoing:', pairs.join(','));
    console.log('  incoming:', incoming.join(','));
  }
}

// Optional entity dump: --entity HANDLE.
const entityHandle = Number(option('--entity', '0'));
if (entityHandle) {
  const entry = entityTable().get(entityHandle);
  if (!entry) {
    console.log(`no entity ${entityHandle}`);
  } else {
    console.log(`\nentity ${entityHandle} @${entry.entity}`);
    for (let offset = 0; offset < 240; offset += 8) {
      const view32 = new DataView(memory.buffer);
      console.log(`  +${String(offset).padStart(3)}: ` +
        `${view32.getUint32(entry.entity + offset, true).toString(16).padStart(8, '0')} ` +
        `${view32.getUint32(entry.entity + offset + 4, true).toString(16).padStart(8, '0')}  ` +
        `f32 ${view32.getFloat32(entry.entity + offset, true).toFixed(3)} ${view32.getFloat32(entry.entity + offset + 4, true).toFixed(3)}`);
    }
  }
}

// Compare the shipped tree order with a fresh build using the same split rule.
const freshHandle = Number(option('--fresh-order', '0'));
const splitThreshold = Number(option('--split', '5'));
if (freshHandle) {
  const low14 = handle => handle & 16383;
  for (const row of rows) {
    const target = row.colliders.find(entry => entry.handle === freshHandle);
    if (!target) continue;
    const rootBounds = { x: -25500, y: -2500, width: 51000, height: 5000 };
    const nodes = [{ ...rootBounds, children: [-1, -1, -1, -1], items: [], depth: 0 }];
    const insert = (nodeIndex, entry) => {
      const node = nodes[nodeIndex];
      const box = { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
      if (node.children[0] < 0) {
        node.items.push(entry);
        if (node.items.length < splitThreshold || node.depth >= 8) return;
        const hw = node.width * 0.5, hh = node.height * 0.5;
        const mx = node.x + hw, my = node.y + hh;
        const xs = [node.x, mx, node.x, mx];
        const ys = [node.y, node.y, my, my];
        const first = nodes.length;
        for (let i = 0; i < 4; i++) nodes.push({ x: xs[i], y: ys[i], width: hw, height: hh, children: [-1, -1, -1, -1], items: [], depth: node.depth + 1 });
        for (let i = 0; i < 4; i++) node.children[i] = first + i;
        const old = node.items;
        node.items = [];
        for (const item of old) insert(nodeIndex, item);
        return;
      }
      const cx = node.x + node.width * 0.5, cy = node.y + node.height * 0.5;
      const child = cx > box.x + box.width ? (cy > box.y + box.height ? 0 : 2) : (cy > box.y + box.height ? 1 : 3);
      insert(node.children[child], entry);
    };
    for (const entry of row.colliders) insert(0, entry);
    const pairs = [];
    const overlap = (a, b) => !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
    const visit = (node, query) => {
      for (const body of node.items) {
        if (low14(query.handle) >= low14(body.handle)) continue;
        if (!overlap(query, body)) continue;
        pairs.push(body.handle);
      }
      if (node.children[0] < 0) return;
      const cx = node.x + node.width * 0.5, cy = node.y + node.height * 0.5;
      const child = i => nodes[node.children[i]];
      if (query.x < cx) { if (query.y < cy) visit(child(0), query); if (query.y + query.height >= cy) visit(child(2), query); }
      if (query.x + query.width >= cx) { if (query.y < cy) visit(child(1), query); if (query.y + query.height >= cy) visit(child(3), query); }
    };
    visit(nodes[0], target);
    console.log(`${row.label} fresh pairs for ${freshHandle}: ${pairs.join(',')} (nodes ${nodes.length})`);
  }
}
