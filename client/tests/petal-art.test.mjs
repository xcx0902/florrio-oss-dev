import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetalOracle } from './helpers/petal-oracle.mjs';
import { PETAL_INFO } from '../public/schema/petals.js';
import { drawPetalIcon, drawPetalInstance, drawDrop, rockPoints } from '../public/render/entity-art.js';

class Paints {
 constructor(){this.paints=[];this.ops=[];this.stack=[];this.state={fill:[0,0,0],stroke:[0,0,0],alpha:1,width:1};}
 save(){this.stack.push(structuredClone(this.state));}
 restore(){this.state=this.stack.pop();}
 setFillRgb(...c){this.state.fill=c;} setStrokeRgb(...c){this.state.stroke=c;}
 setGlobalAlpha(a){this.state.alpha=a;} getGlobalAlpha(){return this.state.alpha;}
 setLineWidth(w){this.state.width=w;} setLineJoin(){} setLineCap(){} setTransform(){} transform(){}
 getTransform(){return [1,0,0,1,0,0];}
 beginPath(){this.path=[];} closePath(){this.path.push(['closePath']);}
 moveTo(...a){this.path.push(['moveTo',...a]);} lineTo(...a){this.path.push(['lineTo',...a]);}
 quadraticCurveTo(...a){this.path.push(['quadraticCurveTo',...a]);} bezierCurveTo(...a){this.path.push(['bezierCurveTo',...a]);}
 arc(...a){this.path.push(['arc',...a]);} ellipse(...a){this.path.push(['ellipse',...a]);}
 rect(...a){this.path.push(['rect',...a]);}
 paint(op){this.paints.push({op,color:[...this.state[op==='fill'?'fill':'stroke']],alpha:this.state.alpha,
   ...(op==='stroke'?{width:this.state.width}:{}),path:structuredClone(this.path)});}
 fill(){this.paint('fill');} stroke(){this.paint('stroke');}
 fillRect(...a){this.ops.push(['fillRect',...a]);} strokeRect(...a){this.ops.push(['strokeRect',...a]);}
 setFont(){} fillText(){} strokeText(){} measureText(){return {width:30};}
}
function nativePaints(calls){
 const c=new Paints();
 const methods={136300:'save',136329:'restore',137186:'setFillRgb',137456:'setStrokeRgb',138111:'setLineWidth',137728:'setGlobalAlpha',137767:'setGlobalAlpha',136878:'beginPath',136912:'closePath',137806:'moveTo',137843:'lineTo',137880:'quadraticCurveTo',137935:'bezierCurveTo',137995:'arc',138047:'ellipse',136946:'rect',136661:'fill',136732:'stroke'};
 for(const [code,...args] of calls){
   if(code==='fillPath'||code==='strokePath'){c.path=args[0];c.paint(code==='fillPath'?'fill':'stroke');}
   else if(methods[code])c[methods[code]](...args);
 }
 return c.paints;
}
const styles=paints=>paints.map(({path,...paint})=>paint);
const oracle=await createPetalOracle();

test('all 38 catalogue icons use the actual WASM paint colours, opacity and multiplicity',()=>{
 for(let type=1;type<=38;type++){
  const c=new Paints();drawPetalIcon(c,type);
  const expected=nativePaints(oracle.draw(type,{icon:true}).calls);
  assert.deepEqual(styles(c.paints),Array.from({length:PETAL_INFO[type].instances},()=>styles(expected)).flat(),`petal ${type}`);
  assert.ok(c.paints.length,`petal ${type} has artwork`);
  assert.equal(c.stack.length,0,`petal ${type} restores its state`);
 }
});

test('world peas retain the original four-pea artwork and Twin/Triplet stay single instances',()=>{
 for(const type of [11,12,16,17,34]){
  const c=new Paints();drawPetalInstance(c,type);
  assert.deepEqual(styles(c.paints),styles(nativePaints(oracle.draw(type).calls)),`world petal ${type}`);
 }
});

test('irregular Rock and Salt paths derive from the native handle seed, with five and seven vertices',()=>{
 for(const handle of [1,0x1234abcd,0xffffffff])for(const [type,count,radius] of [[4,5,14],[36,7,12]]){
  const result=oracle.draw(type,{handle});
  const path=result.calls.find(x=>x[0]==='fillPath')[1].filter(x=>x[0]==='moveTo'||x[0]==='lineTo');
  const actual=rockPoints(handle,radius,count);
  assert.equal(path.length,count);
  path.forEach((p,i)=>p.slice(1).forEach((value,j)=>assert.ok(Math.abs(actual[i][j]-value)<1e-5,`petal ${type} handle ${handle}, point ${i}/${j}`)));
 }
});

test('distinct catalogue shapes keep the native path geometry instead of a circle fallback',()=>{
 for(const type of [5,7,9,10,13,15,18,20,21,22,23,25,26,28,29,31,32,37,38]){
  const c=new Paints();drawPetalIcon(c,type);
  const paths=c.paints.flatMap(p=>p.path),native=nativePaints(oracle.draw(type,{icon:true}).calls).flatMap(p=>p.path);
  for(const method of ['rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','ellipse']){
   const expected=native.filter(x=>x[0]===method),actual=paths.filter(x=>x[0]===method);
   // Closing a polygon may also draw its final edge explicitly. Compare the
   // native curve/control points and non-polygon primitives independently.
   if(method==='lineTo'||method==='moveTo')continue;
   assert.equal(actual.length,expected.length,`petal ${type} ${method} count`);
   expected.forEach((op,i)=>op.slice(1,method==='ellipse'?8:undefined).forEach((value,j)=>{
     if(typeof value==='number')assert.ok(Math.abs(actual[i][j+1]-value)<1e-4,`petal ${type} ${method} point ${i}/${j}`);
   }));
  }
 }
});

test('pickup card and its black rim grow with the native exponential fade',()=>{
 const early=new Paints();drawDrop(early,1,14,0);const late=new Paints();drawDrop(late,1,14,Infinity);
 assert.ok(early.paints.length>0&&late.paints.length>0);
 assert.equal(early.paints[0].alpha,0,'spawn starts transparent');
 assert.equal(late.paints[0].alpha,0.2,'black rim retains native opacity');
 assert.ok(late.paints.some(p=>p.alpha===1),'settled card and petal are opaque');
});

test('pickup cards keep the catalogue artwork inside the native square rim',()=>{
 const c=new Paints();drawDrop(c,7,14);
 assert.ok(c.ops.some(op=>op[0]==='fillRect'),'rarity card is filled');
 assert.ok(c.paints.some(p=>p.op==='stroke'&&p.color.every(channel=>channel===0)&&p.path.some(op=>op[0]==='rect'&&op[1]===-36)),'black outer rim');
 assert.ok(c.paints.some(p=>p.path.some(op=>op[0]==='lineTo')),'Stinger artwork is triangular');
 for(const type of [0,99]){const empty=new Paints();drawPetalInstance(empty,type);drawPetalIcon(empty,type);drawDrop(empty,type);assert.equal(empty.paints.length+empty.ops.length,0);}
});
