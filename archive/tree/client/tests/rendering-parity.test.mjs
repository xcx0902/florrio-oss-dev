import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderingOracle, RenderingCanvas } from './helpers/rendering-oracle.mjs';
import { drawPetalIcon, drawPetalInstance, drawHornetMissile, drawLaunchedPea, drawGroundWeb } from '../public/render/entity-art.js';
import { createArtRandom, createUniqueTrail, drawUniqueTrail } from '../public/render/petal-effects.js';
import { drawWorld } from '../public/render/world.js';
import { WorldState } from '../public/state/world.js';
import { CameraState } from '../public/state/camera.js';

function near(actual, expected, label = '', epsilon = 0.00003) {
  if (typeof expected === 'number') assert.ok(Math.abs(actual-expected) <= epsilon, `${label}: ${actual} != ${expected}`);
  else if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${label} length`);
    expected.forEach((value,index) => near(actual[index],value,`${label}/${index}`,epsilon));
  } else assert.deepEqual(actual,expected,label);
}
const paints = (calls) => new RenderingCanvas().replay(calls);
const circles = records => records.filter(p=>p.op==='fill' && p.path[0]?.[0]==='arc').map(p=>{
  const [,x,y,radius]=p.path[0], [a,b,c,d,e,f]=p.matrix;
  return [a*x+c*y+e,b*x+d*y+f,radius,p.fill,p.alpha];
});

test('Missile and Antennae preserve the actual native round joins, curves and matrices', async () => {
  for (const type of [10,25]) {
    const oracle=await createRenderingOracle(), expected=paints(oracle.petal(type).frame({icon:true}));
    const context=new RenderingCanvas(); drawPetalIcon(context,type);
    assert.equal(context.paints.length,expected.length);
    context.paints.forEach((paint,index)=>{
      const native=expected[index];
      near(paint.path,native.path,`${type} path`); near(paint.matrix,native.matrix,`${type} CTM`);
      assert.equal(paint.join,native.join); assert.equal(paint.width,native.width);
    });
  }
});

test('all Peas icons match original circle centres, radii, paint order and colours', async () => {
  for (const type of [11,12,34]) {
    const oracle=await createRenderingOracle(); const context=new RenderingCanvas(); drawPetalIcon(context,type);
    near(circles(context.paints),circles(paints(oracle.petal(type).frame({icon:true}))),`type ${type}`);
  }
});

test('persistent Peas rotation follows the original frame delta and random initial phase', async () => {
  for (const type of [11,12,34]) {
    const oracle=await createRenderingOracle(73), native=oracle.petal(type);
    let phase=native.phase;
    for (const delta of [0,16,8,33.333,200,0,4.5]) {
      phase=Math.fround(phase+Math.fround(delta)*0.001);
      const context=new RenderingCanvas(); drawPetalInstance(context,type,undefined,0,type,phase);
      near(circles(context.paints),circles(paints(native.frame({delta}))),`type ${type}, dt ${delta}`);
    }
  }
});

test('Hornet missile geometry and outward tip match native760 at arbitrary angles and hit flashes', async () => {
  const oracle=await createRenderingOracle(), native=oracle.component(108);
  for (const angle of [0,0.5,Math.PI,-2.3]) for (const flash of [0,0.5,1]) {
    const c=new RenderingCanvas(), f=Math.fround;
    c.setTransform(f(Math.cos(angle)),f(Math.sin(angle)),f(-Math.sin(angle)),f(Math.cos(angle)),0,0);
    drawHornetMissile(c,flash);
    const expected=paints(native.frame({angle,flash}));
    near(c.paints.map(p=>[p.path,p.matrix,p.fill,p.stroke,p.width,p.join,p.cap]),
      expected.map(p=>[p.path,p.matrix,p.fill,p.stroke,p.width,p.join,p.cap]),`angle ${angle}, hit ${flash}`);
  }
});

test('launched Peas use the original single circle component, including Legendary size', async () => {
  for (const [type,variant] of [[11,0],[12,1],[34,3]]) {
    const oracle=await createRenderingOracle(), native=oracle.component(68,{variant});
    for (const flash of [0,0.25,0.5,0.9,1]) {
    const context=new RenderingCanvas(); drawLaunchedPea(context,type,flash);
    const visible = p=>[p.path,p.op==='fill'?p.fill:p.stroke,p.op==='stroke'?p.width:0,p.op];
    near(context.paints.map(visible),paints(native.frame({flash})).map(visible),`type ${type}, hit ${flash}`);
    }
  }
});

test('ground Web path matches the frozen thirteen-spoke, five-ring component', async () => {
  const oracle=await createRenderingOracle(), calls=oracle.component(92).frame({delta:16});
  const native=calls.find(call=>call[0]==='strokePath')[1];
  const context=new RenderingCanvas(); drawGroundWeb(context);
  near(context.paints[0].path,native,'Web path');
  assert.equal(context.paints[0].alpha,0.5); assert.equal(context.paints[0].width,3);
  assert.equal(context.paints[0].path.filter(op=>op[0]==='quadraticCurveTo').length,65);
  assert.equal(context.paints[0].path.filter(op=>op[0]==='lineTo').length,13);
});

test('Unique Basic particles reproduce native emission, world trails, opacity and retirement over frames', async () => {
  const oracle=await createRenderingOracle(83), native=oracle.petal(35), state=createUniqueTrail(), random=createArtRandom(83);
  let now=0;
  for (let frame=0; frame<240; frame++) {
    const delta=[16,8,33.333,0,50,4.5][frame%6]; now+=delta;
    const x=Math.fround(Math.sin(frame*.03)*70), y=Math.fround(frame*.4);
    const context=new RenderingCanvas(); drawUniqueTrail(context,state,delta,x,y,random);
    const expected=circles(paints(native.frame({delta,x,y,now}))).filter(circle=>circle[2]===3);
    near(circles(context.paints),expected,`trail frame ${frame}`,0.0001);
  }
});

function worldPaint(kind,species,radius,byteFields={},componentMask=0) {
  const world=new WorldState(), camera=new CameraState(), context=new RenderingCanvas();
  camera.setCamera(0,0,1);
  world.apply({sequence:1,serverTime:0,events:[],entities:[{handle:1,typeId:kind,kind,speciesId:species,
    x:0,y:0,angle:.7,radius,health:5,maxHealth:5,flags:0,byteFields,componentMask}]},0);
  drawWorld(context,world,camera,0); return context.paints;
}
test('world dispatch keeps split Peas single, Webs spoked and Hornet art independent of collider radius',()=>{
  const equipped=worldPaint(3,11,7,{11:0},1<<6), split=worldPaint(3,11,7,{9:0},1<<4);
  assert.equal(circles(equipped).length,4); assert.equal(circles(split).length,1);
  for (const radius of [8,14,50]) {
    const hornet=worldPaint(5,14,radius).filter(p=>p.path[0]?.[0]==='moveTo' && p.path[0][1]===11);
    assert.equal(hornet.length,2);
    near(Math.hypot(hornet[0].matrix[0],hornet[0].matrix[1]),1.3,'fixed hornet scale');
  }
  const web=worldPaint(5,29,50,{},1<<11).find(p=>p.path.filter(op=>op[0]==='quadraticCurveTo').length===65);
  assert.ok(web,'ground Web draws its own path');
  assert.equal(circles(worldPaint(3,5,10)).length,0,'Square has no invented orbiting particles');
});

test('native component flags override Peas catalogue colour and radius',()=>{
  const pea=circles(worldPaint(3,11,50,{9:3},1<<4));
  assert.equal(pea.length,1); assert.equal(pea[0][2],10);
  assert.deepEqual(pea[0][3],[206,118,219]);
});

test('native Web arrival flag distinguishes a new web from one already in view', async()=>{
  for (const arrival of [false,true]) {
    const oracle=await createRenderingOracle(), native=oracle.component(92);
    const world=new WorldState(), camera=new CameraState(); camera.setCamera(0,0,1);
    world.apply({sequence:1,serverTime:0,events:[],entities:[{handle:1,typeId:5,kind:5,speciesId:29,
      x:0,y:0,angle:0,radius:50,health:5,maxHealth:5,flags:arrival?129:1,componentMask:1<<11}]},0);
    let now=0;
    for (const delta of [0,16,8,33.333,200]) {
      now+=delta;
      native.frame({delta:now===0?16:delta,arrival,immediate:now===0});
      const context=new RenderingCanvas(); drawWorld(context,world,camera,now);
      const web=context.paints.find(p=>p.path.filter(op=>op[0]==='quadraticCurveTo').length===65);
      near(web.alpha,native.progress*.5,`web arrival=${arrival} at ${now}`);
      near(web.matrix[0],native.progress,`web scale arrival=${arrival} at ${now}`);
    }
  }
});
