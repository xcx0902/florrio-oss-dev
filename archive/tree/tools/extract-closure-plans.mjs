#!/usr/bin/env node
/** Extract closure-invoker call plans from WAT bodies.
 *
 * Recognises the std::function invocation idiom used by the client build:
 * a frame allocation, one or more `descriptor -> slot` stores, and one
 * `call_indirect` per closure with a small set of forwarded arguments.
 * Prints JSON; it does not modify the repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2).map(Number);
const moduleName = ids.length && ids[0] > 5000 ? 'client' : (process.env.WAT_MODULE ?? 'client');

function bodyEnd(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === '(' && source[index + 1] === ';') {
      const close = source.indexOf(';)', index + 2);
      index = close === -1 ? source.length : close + 1;
      continue;
    }
    if (char === ';' && source[index + 1] === ';') {
      const close = source.indexOf('\n', index + 2);
      index = close === -1 ? source.length : close;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return index;
  }
  return -1;
}

async function bodyOf(name, id) {
  const source = await fs.readFile(path.join(root, `source/wasm/${name}.wat`), 'utf8');
  const marker = `(func $function_${id} `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${id}`);
  return source.slice(source.indexOf('\n', start), bodyEnd(source, start) + 1);
}

const instructions = text => text
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('(local') && !line.startsWith(';;'));

const isParam = token => /^local\.get \$p\d+$/.test(token);
const isLocal = token => /^local\.get \$l\d+$/.test(token);
const constOf = token => /^i32\.const (-?\d+)$/.exec(token)?.[1];

function parsePlan(id, text) {
  const ops = instructions(text);
  const plan = { id, frame: null, calls: [], result: false, trailing: [] };
  let cursor = 0;
  // prologue: global.get $stack_pointer, i32.const N, i32.sub, local.tee $p0, global.set $stack_pointer
  if (ops[0] === 'global.get $stack_pointer' && ops[2] === 'i32.sub') {
    plan.frame = Number(constOf(ops[1]));
    cursor = 5;
  }
  const slots = new Map(); // local name -> frame offset
  const descriptors = new Map(); // frame offset -> descriptor address
  let pendingDescriptor = null;
  while (cursor < ops.length) {
    const op = ops[cursor];
    // descriptor store: local.get $p0; i32.const D; i32.store offset=O
    if (isParam(op) && constOf(ops[cursor + 1]) !== undefined && /^i32\.store/.test(ops[cursor + 2])) {
      const offset = Number(/offset=(-?\d+)/.exec(ops[cursor + 2])?.[1] ?? 0);
      pendingDescriptor = { offset, descriptor: Number(constOf(ops[cursor + 1])) };
      descriptors.set(offset, Number(constOf(ops[cursor + 1])));
      cursor += 3;
      continue;
    }
    // slot address: local.get $p0; i32.const O; i32.add; local.tee $lX
    if (isParam(op) && constOf(ops[cursor + 1]) !== undefined && ops[cursor + 2] === 'i32.add' && /^local\.tee/.test(ops[cursor + 3] ?? '')) {
      const offset = Number(constOf(ops[cursor + 1]));
      slots.set(ops[cursor + 3].split(' ')[1], offset);
      cursor += 4;
      continue;
    }
    // call: args... local.get $lX; i32.load; i32.load offset=K; call_indirect (type $tN)
    if (/^call_indirect/.test(op)) {
      throw new Error(`${id}: call_indirect without slot marker at ${cursor}`);
    }
    if (isLocal(op) && ops[cursor + 1] === 'i32.load' && /^i32\.load( offset=-?\d+)?$/.test(ops[cursor + 2] ?? '') && /^call_indirect/.test(ops[cursor + 3] ?? '')) {
      const local = op.split(' ')[1];
      const indexOffset = Number(/offset=(-?\d+)/.exec(ops[cursor + 2])?.[1] ?? 0);
      const type = /\(type \$(\w+)\)/.exec(ops[cursor + 3])?.[1];
      // Walk backwards to collect the argument expressions pushed since the slot address.
      const args = [];
      let back = cursor - 1;
      while (back >= 0 && !(isParam(ops[back]) && constOf(ops[back + 1]) !== undefined && /^i32\.add/.test(ops[back + 2] ?? '') && /^local\.tee/.test(ops[back + 3] ?? ''))) {
        back--;
      }
      const slot = slots.get(local) ?? null;
      plan.calls.push({ slot, descriptor: descriptors.get(slot) ?? null, local, indexOffset, type, argTokens: ops.slice(back + 4, cursor) });
      cursor += 4;
      continue;
    }
    if (ops[cursor] === 'return') {
      plan.explicitReturn = true;
      cursor++;
      continue;
    }
    plan.trailing.push(op);
    cursor++;
  }
  return plan;
}

const plans = [];
for (const id of ids) {
  const text = await bodyOf(moduleName, id);
  try {
    plans.push(parsePlan(id, text));
  } catch (error) {
    plans.push({ id, error: String(error.message) });
  }
}
console.log(JSON.stringify(plans, null, 1));
