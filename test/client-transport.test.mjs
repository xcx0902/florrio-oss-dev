import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import initWabt from 'wabt';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createClientTransportHooks, functionIds } from '../source/game/client/transport.mjs';

const wabt = await initWabt();
const dependencies = [362,363,364,368,371,378,382,459,469,589,799,3256,3364,3475];
async function callback(params, result, fn) {
  const source = `(module (import "x" "f" (func $f ${params.map(() => '(param i32)').join(' ')} ${result ? '(result i32)' : ''})) (export "f" (func $f)))`;
  const parsed = wabt.parseWat('callback.wat', source);
  try { return new WebAssembly.Instance(new WebAssembly.Module(parsed.toBinary({}).buffer), { x: { f: fn } }).exports.f; }
  finally { parsed.destroy(); }
}
async function scenario(recovered, setup, action, { imports = {}, intercept = {} } = {}) {
  const events = [], configured = typeof imports === 'function' ? imports(events) : imports;
  let runtime;
  const write = (fd, vectors, count, written) => {
    const view = new DataView(runtime.memory.buffer);
    let total=0; for(let i=0;i<count;i++) total+=view.getUint32(vectors+i*8+4,true);
    view.setUint32(written,total,true); return 0;
  };
  runtime = await loadOriginal('client', { functionIds: [...functionIds, ...dependencies], imports: {...configured,a:{Oa:write,...configured.a}} });
  let hooks;
  const originalCall = runtime.call.bind(runtime);
  const running = {
    get memory() { return runtime.memory; }, get table() { return runtime.table; },
    host: runtime.host.bind(runtime),
    call(id, ...args) {
      if (intercept[id]) return intercept[id](runtime, events, ...args);
      return recovered && hooks[id] ? hooks[id](...args) : originalCall(id, ...args);
    },
  };
  hooks = createClientTransportHooks(running);
  const data = {
    runtime, running, events,
    get bytes() { return new Uint8Array(runtime.memory.buffer); },
    get view() { return new DataView(runtime.memory.buffer); },
    malloc: size => runtime.call(368, size) >>> 0,
    set: (address, value) => new DataView(runtime.memory.buffer).setUint32(address, value, true),
    get: address => new DataView(runtime.memory.buffer).getUint32(address, true),
    nextSlot: runtime.table.length - 1,
    async attach(params, result, fn) {
      const slot = this.nextSlot--; runtime.table.set(slot, await callback(params, result, fn)); return slot;
    },
  };
  await setup(data);
  const stackBefore = runtime.stackPointer.value;
  let thrown;
  try { await action(data); } catch (error) { thrown = { name: error.constructor.name, message: error.message }; }
  return { events, thrown, stack: runtime.stackPointer.value - stackBefore, data };
}
async function compare(setup, action, options) {
  const original = await scenario(false, setup, action, options);
  const recovered = await scenario(true, setup, action, options);
  assert.deepEqual(recovered.events, original.events);
  assert.deepEqual(recovered.thrown, original.thrown);
  assert.equal(recovered.stack, original.stack);
  return { original, recovered };
}
const memoryHash = data => createHash('sha256').update(data.bytes).digest('hex');

async function transportFixture(data) {
  const { malloc, set, get, runtime, events } = data;
  data.transport = malloc(128); data.vtable = malloc(32); data.context = malloc(8); data.ackFlag = malloc(1);
  data.receiver = malloc(4); data.receiverVtable = malloc(28);
  set(data.transport, data.vtable); set(data.context, data.ackFlag); set(data.context + 4, data.transport);
  set(data.receiver, data.receiverVtable); set(data.transport + 48, data.receiver);
  set(data.vtable + 24, await data.attach([0,0,0], false, (self, buffer, type) => events.push(['header', self, type])));
  set(data.vtable + 16, await data.attach([0,0,0], false, (self, pointer, length) => events.push(['send', Array.from(data.bytes.slice(pointer, pointer + length))])));
  set(data.receiverVtable + 24, await data.attach([0,0,0], false, (self, pointerAddress, lengthAddress) => {
    const pointer = get(pointerAddress), length = get(lengthAddress);
    events.push(['receive', Array.from(data.bytes.slice(pointer, pointer + length))]);
  }));
  data.bytes[data.ackFlag] = 1;
}

test('live client ACK encoder matches partial, maximal and truncated two-varint packets', async () => {
  const packets = [[], [0], [1], [1,0], [1,0,0], [1,127,128,1], [1,255,255,255,255,15,255,255,255,255,15],
    ...Array.from({length: 10}, (_, n) => [1, ...Array(n).fill(255)]),
    [1,128,0,128,0], [1,255,255,255,255,255,255,255,255,255,255], [9,1,2,3]];
  for (const packet of packets) {
    const { original, recovered } = await compare(async data => {
      await transportFixture(data); data.packet = data.malloc(Math.max(1, packet.length)); data.bytes.set(packet, data.packet);
    }, data => data.running.call(1118, data.context, data.packet, packet.length));
    assert.ok(!original.thrown);
    // Compare all active transport and packet bytes. Freed stack-only scratch is not application state.
    assert.deepEqual(recovered.data.bytes.slice(recovered.data.transport, recovered.data.packet + packet.length),
      original.data.bytes.slice(original.data.transport, original.data.packet + packet.length));
  }
});

function literalFrame(payload) {
  const extra = [];
  if (payload.length >= 15) {
    let length = payload.length - 15;
    while (length >= 255) { extra.push(255); length -= 255; }
    extra.push(length);
  }
  return [2, payload.length & 255, payload.length >>> 8 & 255, 0,0, Math.min(payload.length,15) << 4, ...extra, ...payload];
}

test('live recursive decoder matches original raw, empty, literal, nested and malformed blocks', async () => {
  const cases = [[], [0], [1,0,0], [2], [2,0], [2,0,0,0,0,0], [2,1,0,0,0,0],
    literalFrame([0,8,9]), literalFrame([1,128,1,255,1]),
    literalFrame(Array.from({length: 300}, (_, i) => i % 251)),
    literalFrame(literalFrame([0,4,5,6])),
    [2,8,0,0,0,0x40,0,1,2,3,1,0,0], // invalid final match / missing final literals
    [2,8,0,0,0,0xf0,255,0],
    [2,20,0,0,0,0x10,9,255,255,0,0,0,0,0,0,0,0,0,0],
  ];
  for (const packet of cases) {
    const { original } = await compare(async data => {
      await transportFixture(data); data.packet = data.malloc(Math.max(1, packet.length)); data.bytes.set(packet, data.packet);
    }, data => data.running.call(1119, data.packet, packet.length, data.context));
    assert.ok(!original.thrown, `case ${packet.slice(0, 10)}`);
  }
});

test('LZ4 match distances 1 through 16 and long/near-end copies match original decoded callback bytes', async () => {
  for (let distance = 0; distance <= 16; distance++) {
    for (const matchLength of [4,8,12,17,18,19,40,270]) {
      const prefix = Array.from({length: Math.max(distance, 8)}, (_, i) => i === 0 ? 0 : i);
      const suffix = [90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105];
      const literals = prefix.length >= 15 ? [0xf0 | Math.min(matchLength - 4,15), prefix.length - 15] : [(prefix.length << 4) | Math.min(matchLength - 4,15)];
      const extensions = [];
      if (matchLength >= 19) { let n = matchLength - 19; while (n >= 255) { extensions.push(255); n -= 255; } extensions.push(n); }
      const tail = [0xf0, suffix.length - 15, ...suffix];
      const payload = [...literals, ...prefix, distance,0, ...extensions, ...tail];
      const decoded = prefix.length + matchLength + suffix.length;
      const packet = [2,decoded & 255,decoded >>> 8,0,0,...payload];
      const { original } = await compare(async data => {
        await transportFixture(data); data.packet = data.malloc(packet.length); data.bytes.set(packet, data.packet);
      }, data => data.running.call(1119, data.packet, packet.length, data.context));
      assert.ok(original.events.some(e => e[0] === 'receive'), `distance=${distance}, length=${matchLength}`);
    }
  }
});

test('LZ4 end-of-output overlap copies match original when only five trailing literals remain', async () => {
  for (const distance of [1,2,3,4,7,8,16]) {
    for(const suffixLength of [5,7,8,11,12]) {
      const prefix=Array.from({length:16},(_,i)=>i), matchLength=40;
      const suffix=Array.from({length:suffixLength},(_,i)=>90+i);
      const block=[0xff,1,...prefix,distance,0,matchLength-19,suffixLength<<4,...suffix];
      const decoded=prefix.length+matchLength+suffix.length;
      const packet=[2,decoded,0,0,0,...block];
      const {original,recovered}=await compare(async data=>{
        await transportFixture(data);data.packet=data.malloc(packet.length);data.bytes.set(packet,data.packet);
      },data=>data.running.call(1119,data.packet,packet.length,data.context));
      assert.ok(original.events.some(event=>event[0]==='receive'));
      assert.equal(memoryHash(recovered.data),memoryHash(original.data));
    }
  }
});

test('recovered receiveTransportPacket builds original stack context and follows decoder/ACK path', async () => {
  await compare(async data => {
    await transportFixture(data); data.packet = data.malloc(3); data.bytes.set([1,6,7], data.packet);
  }, data => data.running.call(702, data.transport, data.packet, 3, 1));
});

test('decoder preserves heap, freed allocations and scratch bytes for successful and rejected blocks', async () => {
  for (const packet of [literalFrame([0,1,2,3,4,5]), [2,10,0,0,0,0x20,0,8,1,0,0,0,0,0,0,0,0], [2,0,0,0,0,0]]) {
    const { original, recovered } = await compare(async data => {
      await transportFixture(data); data.packet = data.malloc(packet.length); data.bytes.set(packet, data.packet);
    }, data => data.running.call(1119, data.packet, packet.length, data.context));
    assert.equal(memoryHash(recovered.data),memoryHash(original.data));
  }
});

test('decoder retains original out-of-bounds traps and un-restored stack on failure', async () => {
  for (const [fromEnd,length] of [[0,1], [1,5], [3,10]]) {
    const { original } = await compare(async data => {
      await transportFixture(data);
      data.bytes.fill(2,data.bytes.length-3,data.bytes.length);
    }, data => data.running.call(1119,fromEnd ? data.bytes.length-fromEnd : 0xffffffff,length,data.context));
    assert.equal(original.thrown.name,'RuntimeError');
    assert.equal(original.stack,-16);
  }
});

test('one-time multiplayer and single-player transport initialization matches complete original memory', async () => {
  for (const local of [0,1]) {
    const { original, recovered } = await compare(data => { data.bytes[441368]=local; }, data => {
      data.running.call(1096); data.running.call(1096);
    }, { imports: events => ({a:{ Me: path => { events.push(['worker',path]); return 21; }, o: (...args) => events.push(['workerCall',...args]) }}) });
    assert.ok(!original.thrown);
    assert.equal(memoryHash(recovered.data),memoryHash(original.data));
    assert.equal(original.events.length,local ? 2 : 0);
  }
});

async function webRTCFixture(data, id, bucketCount, state) {
  const { malloc,set,get,events } = data;
  data.channel = malloc(128); data.channelVtable = malloc(28);
  set(data.channel,data.channelVtable); set(data.channel+104,state);
  set(data.channelVtable + 20,await data.attach([0,0],false,(self,error) => {
    events.push(['shutdown',error]);
    if (data.shutdownClearsState) set(self+104,0);
  }));
  for (const [offset,name] of [[24,'open'],[72,'error'],[96,'close']]) {
    const callback = malloc(4), vtable = malloc(28); set(callback,vtable); set(data.channel+offset,callback);
    set(vtable+24,await data.attach([0],false,()=>events.push([name])));
  }
  const buckets = malloc(bucketCount*4), before = malloc(4), node = malloc(16);
  data.bytes.fill(0,buckets,buckets+bucketCount*4);
  const bucket = (id>>>0)%bucketCount;
  set(7910228,buckets); set(7910232,bucketCount); set(buckets+bucket*4,before); set(before,node);
  set(node,0); set(node+4,id); set(node+8,id); set(node+12,data.channel);
  data.buckets=buckets; data.hashNode=node;
}

test('WebRTC hash lookup, open and error/close transitions retain callback behavior', async () => {
  for (const bucketCount of [1,4,7]) {
    for (const state of [0,1,2,3]) {
      for (const error of [0,1]) {
        const { original, recovered } = await compare(async data => {
          await webRTCFixture(data,23,bucketCount,state);
        },data=>{
          data.running.call(3191,23);
          data.running.call(3234,23,error);
          data.running.call(3234,23,error);
          data.running.call(3191,999); // absent bucket/key
        });
        assert.ok(!original.thrown);
        assert.equal(recovered.data.get(recovered.data.channel+104),original.data.get(original.data.channel+104));
      }
    }
  }
  await compare(async data=>{
    await webRTCFixture(data,0xfffffffe,7,1); data.shutdownClearsState=true;
  },data=>{ data.running.call(3191,-2); data.running.call(3234,-2,1); });
});

test('WebRTC message preprocessing calls actual transform and feeds original transport receiver', async () => {
  const { original, recovered } = await compare(async data=>{
    await transportFixture(data); await webRTCFixture(data,12,4,2);
    data.set(data.channel+48,data.receiver);
    data.packet=data.malloc(16); data.bytes.set([11,14,75,16,19,22,25,28,31,34,37,40,43,46,49,52],data.packet);
  },data=>data.running.call(3223,12,data.packet,16));
  assert.ok(!original.thrown);
  assert.ok(original.events.some(event=>event[0]==='receive'));
  assert.deepEqual(recovered.data.bytes.slice(recovered.data.packet,recovered.data.packet+16),original.data.bytes.slice(original.data.packet,original.data.packet+16));
  assert.equal(memoryHash(recovered.data),memoryHash(original.data));
});

test('forced server strings and backend clipboard storage match original with repeated updates', async () => {
  for (const text of ['', 'local', 'this-server-id-is-long-enough-to-use-heap-storage']) {
    const { original, recovered } = await compare(data=>{
      data.packet=data.malloc(128); data.bytes.fill(0,data.packet,data.packet+128);
      data.bytes.set(new TextEncoder().encode(text),data.packet);
      data.backend=data.malloc(400); data.bytes.fill(0,data.backend,data.backend+400); data.set(7944488,data.backend);
    },data=>{
      data.running.call(3331,data.packet);
      data.running.call(3299,data.packet);
      data.running.call(3299,data.packet);
      data.running.call(3299,0);
    });
    assert.ok(!original.thrown);
    assert.equal(memoryHash(recovered.data),memoryHash(original.data));
  }
});

test('clipboard forwards direct backend callback and reports absent backend through original logging', async () => {
  await compare(async data=>{
    data.backend=data.malloc(400); data.bytes.fill(0,data.backend,data.backend+400); data.set(7944488,data.backend);
    data.set(data.backend+268,await data.attach([0,0],true,(self,pointer)=>{data.events.push(['clipboard',self,pointer]);return -1;}));
  },data=>{ data.running.call(3299,0); data.running.call(3299,123); });
  await compare(data=>data.set(7944488,0),data=>data.running.call(3299,0));
});

test('WebSocket event polling retains message references, close boundaries and registry mutation restart', async () => {
  for (const mutate of [false,true]) {
    let current;
    const { original,recovered }=await compare(async data=>{
      current=data; data.queues=new Map();
      const nodes=[];
      for (const id of [11,12]) {
        const node=data.malloc(12),socket=data.malloc(108); nodes.push(node); data.bytes.fill(0,socket,socket+108);
        data.set(node+8,socket); data.set(socket,id);
        for (const [offset,name] of [[24,'open'],[48,'message'],[72,'error'],[96,'close']]) {
          const cb=data.malloc(4),vt=data.malloc(28); data.set(cb,vt); data.set(socket+offset,cb);
          data.set(vt+24,await data.attach(name==='message'?[0,0,0]:[0],false,(self,pointerAddress,lengthAddress)=>{
            data.events.push(name==='message'?[name,id,Array.from(data.bytes.slice(data.get(pointerAddress),data.get(pointerAddress)+data.get(lengthAddress)))]:[name,id]);
            if(mutate&&id===11&&name==='message') {data.set(441352,nodes[1]);data.bytes[441364]=1;}
          }));
        }
        const payload=data.malloc(3); data.bytes.set([id,2,3],payload);
        data.queues.set(id,[[2,0,0],[1,payload,3],[3,0,0],[4,0,0],[2,0,0]]);
      }
      data.set(nodes[0],nodes[1]); data.set(nodes[1],0); data.set(441352,nodes[0]);
    },data=>data.running.call(3353),{imports:{a:{a:(code,signature,args)=>{
      if(code!==140574)return 0;
      const id=current.get(args),queue=current.queues.get(id),event=queue.shift();
      if(!event)return 0;
      current.set(current.get(args+4),event[1]); current.set(current.get(args+8),event[2]); return event[0];
    }}}});
    assert.ok(!original.thrown);
    assert.equal(memoryHash(recovered.data),memoryHash(original.data));
    assert.ok(original.events.some(event=>event[0]==='message'));
    assert.equal(original.data.bytes[441364],0);
  }
});

test('canvas context invalidation retains linked list, regenerable caches and warning paths', async () => {
  for (const requested of [-1,7,8,999]) {
    let current;
    const {original,recovered}=await compare(data=>{
      current=data; data.renderers=[];
      for(const [context,scale] of [[7,1],[7,-1],[-1,-1],[8,NaN]]) {
        const renderer=data.malloc(104); data.bytes.fill(0,renderer,renderer+104); data.renderers.push(renderer);
        data.set(renderer+96,context); data.view.setFloat32(renderer+64,scale,true);
      }
      for(let index=0;index<data.renderers.length;index++) {
        data.set(data.renderers[index]+72,data.renderers[index+1]||0);
        data.set(data.renderers[index]+76,data.renderers[index-1]||0);
      }
      data.set(441324,data.renderers[0]);data.set(441320,data.renderers.length);
    },data=>data.running.call(3375,requested),{imports:{a:{a:(code,signature,args)=>{
      if(code===136033)current.events.push(['deleteContext',current.get(args)]);
      return 0;
    }}}});
    assert.ok(!original.thrown);
    assert.equal(memoryHash(recovered.data),memoryHash(original.data));
  }
});

test('wheel, disconnect and quit callback hooks execute and preserve native indirect signature traps', async () => {
  await compare(async data => {
    data.view.setFloat64(163840, -0, true);
    data.quit = data.malloc(4); data.quitVtable = data.malloc(28); data.set(data.quit, data.quitVtable);
    data.set(439168, data.quit);
    data.set(data.quitVtable + 24, await data.attach([0], true, self => self ^ 43));
  }, data => {
    data.running.call(3310, 0.125); data.running.call(3310, -0.25); data.running.call(3342);
    data.events.push(['wheel',data.view.getFloat64(163840,true)], ['disconnect',data.bytes[7784496]], ['quit',data.running.call(3386)]);
  });
  const { original } = await compare(async data => {
    data.quit = data.malloc(4); data.quitVtable = data.malloc(28); data.set(data.quit,data.quitVtable); data.set(439168,data.quit);
    data.set(data.quitVtable + 24, await data.attach([],false,() => {}));
  }, data => data.running.call(3386));
  assert.equal(original.thrown.name,'RuntimeError');
});
