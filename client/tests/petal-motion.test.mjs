import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { getHudLayout } from '../public/render/hud.js';
import { createPetalMotion, advancePetalMotion, petalSlotAnchor, petalSnapTarget, PetalMotionState } from '../public/render/petal-motion.js';

async function originalMotion(layout) {
  const runtime = await loadOriginal('client', { functionIds: [368, 803, 407] });
  const alloc = size => runtime.call(368, size);
  const object = alloc(496), frame = alloc(36), roots = alloc(64), slots = alloc(136), sizes = alloc(68);
  const delta = alloc(4), renderer = alloc(128), scope = alloc(32), reference = alloc(176), dragged = alloc(16);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const put = (p, v) => view.setInt32(p, v, true), float = (p, v) => view.setFloat32(p, v, true);
  for (const [p, size] of [[object,496],[frame,36],[roots,64],[slots,136],[sizes,68],
    [renderer,128],[scope,32],[reference,176],[dragged,16]]) bytes.fill(0,p,p+size);
  [scope, roots, roots+4, roots+8, slots, sizes, delta, roots+32, roots+36]
    .forEach((p,i) => put(frame+i*4,p));
  put(roots,reference); put(roots+4,roots); put(roots+36,renderer);
  float(renderer,1); float(renderer+12,1); view.setFloat64(renderer+56,1,true);
  float(scope+12,1); float(scope+16,1);
  put(object+108,-1); put(object+464,-1); put(437396,dragged); bytes[437412]=0;
  float(object+4,1);
  view.setBigInt64(dragged,-1n,true); put(dragged+8,object);
  const anchor = petalSlotAnchor(layout,0);
  for (const offset of [12,452]) float(object+offset,anchor.x);
  for (const offset of [16,456]) float(object+offset,anchor.y);
  for (const offset of [8,460]) float(object+offset,anchor.size);
  for (let slot=0;slot<=16;slot++) {
    const a=petalSlotAnchor(layout,slot);
    float(slots+slot*8,a.x); float(slots+slot*8+4,a.y); float(sizes+slot*4,a.size);
    if (slot<16) bytes[reference+40+slot]=1;
  }
  const sample = (now,dt,x,y,dragging,selected,live=true) => {
    float(delta,dt); put(437388,+dragging); put(163824,x); put(163828,y); bytes[163849]=1;
    bytes[7922312]=1; view.setFloat64(7922320,now,true);
    bytes[437412]=+selected; put(437408,0);
    runtime.call(803,frame,object,+live);
    const value={};
    for (const [key,offset] of Object.entries({x:12,y:16,size:8,lift:32,snap:44,snapX:48,snapY:52,snapSize:56,keyboard:60,opacity:4}))
      value[key]=view.getFloat32(object+offset,true);
    value.angle=Math.fround(Math.max(value.keyboard,Math.fround(value.lift*Math.fround(1-value.snap)))
      *Math.fround(runtime.call(407,now*.01)*.1));
    return value;
  };
  sample.request = slot => {
    put(object+464,slot); bytes[object+472]=1; view.setFloat64(object+480,2000,true);
    const anchor=petalSlotAnchor(layout,slot);
    float(object+48,anchor.x);float(object+52,anchor.y);float(object+56,anchor.size);
  };
  return sample;
}

test('drag, sinusoidal wobble, circular snap and unsnap match every original func803 f32 store', async () => {
  const layout=getHudLayout(), native=await originalMotion(layout);
  const motion=createPetalMotion(0,0,layout), types=Array(13).fill(1);
  const storage=petalSlotAnchor(layout,6), equipped=petalSlotAnchor(layout,3);
  let now=0;
  const points=[[600,500],[1200,600],[storage.x,storage.y],[storage.x+40,storage.y],
    [equipped.x,equipped.y],[1100,500]];
  for (let index=0;index<240;index++) {
    const dt=[16,8,24,33.333,4.5,0,50][index%7]; now+=dt;
    const [x,y]=points[Math.floor(index/30)%points.length], selected=index>=140 && index<180, dragging=index<180;
    const expected=native(now,dt,x,y,dragging,selected);
    advancePetalMotion(motion,layout,types,now,dt,dragging,x,y,selected);
    for (const key of Object.keys(expected)) assert.equal(motion[key],expected[key],`${key} at frame ${index}`);
  }
});

test('snap excludes equal petal types and source; lower-row attraction uses the full circular radius', () => {
  const layout=getHudLayout(), types=[1,1,1,1,1,6,0,0,0,0,0,0,0];
  const anchor=petalSlotAnchor(layout,6);
  assert.equal(petalSnapTarget(layout,types,0,1,anchor.x,anchor.y+40),6);
  assert.equal(petalSnapTarget(layout,types,0,1,anchor.x,anchor.y+50),undefined);
  const same=petalSlotAnchor(layout,1);
  assert.equal(petalSnapTarget(layout,types,0,1,same.x,same.y),undefined);
});

test('requested discard follows native803 position, shrink and opacity on every retirement frame', async () => {
  const layout=getHudLayout(), native=await originalMotion(layout), motion=createPetalMotion(0,0,layout), types=Array(13).fill(1);
  const anchor=petalSlotAnchor(layout,16);
  native.request(16);motion.requestedSlot=16;motion.requestedUntil=2000;
  motion.snapX=anchor.x;motion.snapY=anchor.y;motion.snapSize=anchor.size;
  let now=0;
  for(let index=0;index<70;index++) {
    const dt=[16,8,24,33.333,4.5,0,50][index%7];now+=dt;
    const live=index<4;motion.retired=!live;
    const expected=native(now,dt,0,0,false,false,live);
    advancePetalMotion(motion,layout,types,now,dt,false,0,0);
    for(const key of Object.keys(expected)) assert.equal(motion[key],expected[key],`${key} at retirement frame ${index}`);
  }
});

test('authoritative slot swap keeps both visual identities and animates them into their destinations', () => {
  const layout=getHudLayout(), state=new PetalMotionState(), types=[1,1,1,1,1,6,0,0,0,0,0,0,0];
  let visuals=state.update(layout,types,0,16,0,0), rose=visuals.find(v=>v.slot===5), basic=visuals[0];
  assert.equal(state.begin(0),true);
  state.update(layout,types,16,16,500,400);
  state.release(5);
  visuals=state.update(layout,[6,1,1,1,1,1,0,0,0,0,0,0,0],32,16,500,400);
  assert.equal(visuals.find(v=>v.slot===0),rose);
  assert.equal(visuals.find(v=>v.slot===5),basic);
  assert.ok(rose.y<petalSlotAnchor(layout,5).y && rose.y>petalSlotAnchor(layout,0).y);
  assert.ok(basic.y>petalSlotAnchor(layout,0).y && basic.y<petalSlotAnchor(layout,5).y);
  state.reset(); assert.equal(state.begin(0),false);
});

test('keyboard swap retains both identities while awaiting the server and throughout the exchange', () => {
  const layout = getHudLayout(), state = new PetalMotionState(), types = [1, 0, 0, 0, 0, 6];
  const before = state.update(layout, types, 0, 16, 0, 0), basic = before[0], rose = before[1];
  state.request(5, 0, layout);
  for (let now = 16; now <= 96; now += 16) {
    const pending = state.update(layout, types, now, 16, 0, 0, 5);
    assert.equal(pending[0], basic); assert.equal(pending[1], rose);
    assert.ok(!pending.some(v => v.retired));
  }
  const after = state.update(layout, [6, 0, 0, 0, 0, 1], 112, 16, 0, 0, 5);
  assert.equal(after.find(v => v.slot === 0), rose);
  assert.equal(after.find(v => v.slot === 5), basic);
  assert.ok(rose.y > petalSlotAnchor(layout, 0).y);
});

test('drag paints last and discard retains its visual while native opacity and size ease to zero', () => {
  const layout = getHudLayout(), state = new PetalMotionState(), types = [1, 6, 0, 0, 0, 2];
  state.update(layout, types, 0, 16, 0, 0); state.begin(0);
  let values = state.update(layout, types, 16, 16, 900, 600);
  assert.equal(values.at(-1).type, 1, 'earlier slots overlay later slots during a drag');
  const discarded = values.at(-1); state.release(16, layout);
  values = state.update(layout, [0, 6, 0, 0, 0, 2], 32, 16, 0, 0);
  assert.ok(values.includes(discarded)); assert.equal(discarded.retired, true);
  const step = 1 - Math.pow(.8, Math.fround(16) * .06);
  assert.equal(discarded.opacity, Math.fround(1 - step));
  for (let now = 48; now <= 1200; now += 16) values = state.update(layout, [0, 6, 0, 0, 0, 2], now, 16, 0, 0);
  assert.ok(!values.includes(discarded));
});
