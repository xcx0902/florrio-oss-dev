/** Complete executable source recovery of client1038 and1039.
 * Component64 has eight animated quadratic strokes and a filled circle;
 * component80 draws a filled rectangle. Product identities remain unproven.
 * Float32 boundaries, scratch writes and synchronous host observations retain
 * the original behavior (REA ev_04342e4c580ccf87f0ef0dbcccd3cd9507572a0b364eac5298499dd7bc166c80).
 */
export const functionIds = Object.freeze([1038,1039]);
export const dependencies = Object.freeze([366,372,373,375,395,409,427,431]);
const f32 = Math.fround;
const operations = Object.freeze({lineWidth:138111,lineJoinRound:138811,lineCapRound:138730,
  fillRgb:137186,strokeRgb:137456,beginPath:136878,setTransform:136414,moveTo:137806,
  quadraticCurveTo:137880,stroke:136732,arc:137995,rect:136946});
export function createComponents6480RendererHooks(runtime) {
  const readClock = output => runtime.call(372,output);
  const roundF64 = value => runtime.call(373,value);
  const powF64 = (value, exponent) => runtime.call(375,value,exponent);
  const compareMemory = (left,right,count) => runtime.call(366,left,right,count);
  const fillAndStrokeCurrentPath = renderer => runtime.call(395,renderer);
  const updateWorldTransform = transform => runtime.call(409,transform);
  const cosF32 = angle => runtime.call(427,angle);
  const sinF32 = angle => runtime.call(431,angle);
  let buffer, view;
  function address(base, offset, size) {
    if (buffer !== runtime.memory.buffer) { buffer = runtime.memory.buffer; view = new DataView(buffer); }
    const pointer = (base >>> 0) + offset;
    if (pointer + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return pointer;
  }
  function readU8(base, offset = 0) {
    const pointer = address(base, offset, 1);
    return view.getUint8(pointer);
  }
  function readI32(base, offset = 0) {
    const pointer = address(base, offset, 4);
    return view.getInt32(pointer, true);
  }
  function readI64(base, offset = 0) {
    const pointer = address(base, offset, 8);
    return view.getBigInt64(pointer, true);
  }
  function readF32(base, offset = 0) {
    const pointer = address(base, offset, 4);
    return view.getFloat32(pointer, true);
  }
  function readF64(base, offset = 0) {
    const pointer = address(base, offset, 8);
    return view.getFloat64(pointer, true);
  }
  function writeU8(base, value, offset = 0) {
    const pointer = address(base, offset, 1);
    view.setUint8(pointer, value);
  }
  function writeI32(base, value, offset = 0) {
    const pointer = address(base, offset, 4);
    view.setInt32(pointer, value, true);
  }
  function writeI64(base, value, offset = 0) {
    const pointer = address(base, offset, 8);
    view.setBigInt64(pointer, BigInt.asIntN(64, value), true);
  }
  function writeF32(base, value, offset = 0) {
    const pointer = address(base, offset, 4);
    view.setFloat32(pointer, value, true);
  }
  function writeF64(base, value, offset = 0) {
    const pointer = address(base, offset, 8);
    view.setFloat64(pointer, value, true);
  }


  function canvas(code, signature, argumentPointer) {
    void ((+runtime.host('a','a',code,signature,argumentPointer)) | 0);
  }
  function contextCommand(renderer,scratch,offset,code) {
    writeI32(scratch,readI32(renderer,96),offset);
    canvas(code,31967,(scratch+offset)|0);
  }
  function rgb(renderer,scratch,offset,code,red,green,blue) {
    const context=readI32(renderer,96);
    writeI32(scratch,blue,offset+12);writeI32(scratch,green,offset+8);
    writeI32(scratch,red,offset+4);writeI32(scratch,context,offset);
    canvas(code,32170,(scratch+offset)|0);
  }
  const channel = value => value < 4294967296 && value >= 0 ? Math.trunc(value)|0 : 0;
  function lineStyle(renderer,scratch,widthOffset,width,joinOffset,capOffset) {
    const context=readI32(renderer,96);
    writeF64(scratch,width,widthOffset+8);writeI32(scratch,context,widthOffset);
    canvas(operations.lineWidth,93028,(scratch+widthOffset)|0);
    if(readU8(renderer,50)) {
      writeU8(renderer,0,50);contextCommand(renderer,scratch,joinOffset,operations.lineJoinRound);
    }
    if(capOffset !== undefined && readU8(renderer,49)!==1) {
      writeU8(renderer,1,49);contextCommand(renderer,scratch,capOffset,operations.lineCapRound);
    }
  }
  /** Preserve the visual flag read after each clock call, including +/−infinity
   * sentinels and the float32 threshold used to select red or white flashes. */
  function hitSample(visual,scratch,offset) {
    readClock((scratch+offset)|0);
    const active=readU8(visual,56);
    let amount=Infinity;
    if(active) {
      amount=-Infinity;
      if(readU8(scratch,offset)) amount=(readF64((visual+64)|0)-readF64(scratch,offset+8))*.006666666666666667+1;
    }
    return {active,blend:f32(amount<0?0:Math.min(amount,1))};
  }
  function resolveHitColor(component,scratch,clockOffset,baseRed,baseGreen,baseBlue,blendRed) {
    const owner=readI32(component);
    if(!owner)return [baseRed,baseGreen,baseBlue];
    const visual=readI32(owner,136);
    let blend=0,target=0xff0000;
    if(readU8(visual,56)) {
      const sample=hitSample(visual,scratch,clockOffset);blend=sample.blend;
      if(sample.active && hitSample(visual,scratch,clockOffset).blend>=.9)target=0xffffff;
    }
    const remainder=f32(1-blend);
    const red=blendRed?channel(f32(f32(blend*255)+f32(remainder*baseRed))):baseRed;
    const blue=channel(f32(f32(remainder*baseBlue)+f32(blend*f32(target&255))));
    const green=channel(f32(f32(remainder*baseGreen)+f32(blend*f32(target>>>8&255))));
    return [red,green,blue];
  }
  function shade(value) {
    const root=Math.sqrt(value*.00392156862745098)*.8999999985098839;
    return channel(roundF64((root*root)*255));
  }

  /** Both variants retain native cache-copy and argument write order. The
   * rectangle variant reads its second column earlier, as its original body did. */
  function synchronizeTransform(renderer,scratch,offset,rectangle=false) {
    if(!readU8(renderer,48))return;
    writeU8(renderer,0,48);
    const cached=(renderer+24)|0;
    if(!compareMemory(cached,renderer,24))return;
    writeI64(cached,readI64(renderer));writeI64(cached,readI64(renderer,16),16);
    writeI64(cached,readI64(renderer,8),8);
    const crossX=readF32(renderer,8);
    let crossY,translationX,axisX,context,axisY;
    if(rectangle) {
      crossY=readF32(renderer,12);translationX=readF32(renderer,16);
      axisX=readF32(renderer);context=readI32(renderer,96);axisY=readF32(renderer,4);
    } else {
      translationX=readF32(renderer,16);axisX=readF32(renderer);context=readI32(renderer,96);
      axisY=readF32(renderer,4);crossY=readF32(renderer,12);
    }
    writeF64(scratch,readF32(renderer,20),offset+48);writeF64(scratch,translationX,offset+40);
    writeF64(scratch,crossY,offset+32);writeF64(scratch,crossX,offset+24);
    writeF64(scratch,axisY,offset+16);writeI32(scratch,context,offset);writeF64(scratch,axisX,offset+8);
    canvas(operations.setTransform,32144,(scratch+offset)|0);
  }

  /** Move the animation phase according to smoothed world displacement. */
  function updateComponent64Motion(component,elapsed) {
    const owner=readI32(component);
    if(!(elapsed>0 && owner))return readF64(component,8);
    const transform=readI32(owner,120);
    if(!readU8(transform,144))updateWorldTransform(transform);
    const worldY=readF64(transform,160),worldX=readF64(transform,152);
    let speed;
    if(readU8(component,24)) {
      const previous=readF32(component,28);
      const differenceX=readF32(component,16)-worldX;
      const differenceY=readF32(component,20)-worldY;
      const measured=Math.sqrt(differenceX*differenceX+differenceY*differenceY)/elapsed;
      if(Math.abs(previous-measured)<1e-7)speed=f32(measured);
      else {
        const blend=1-powF64(.6,elapsed*.06);
        speed=f32((blend<0?0:Math.min(blend,1))*(measured-previous)+previous);
      }
      writeF32(component,speed,28);
    } else {
      writeU8(component,1,24);speed=readF32(component,28);
    }
    writeF32(component,f32(worldY),20);writeF32(component,f32(worldX),16);
    const phase=readF64(component,8)+f32(f32(speed*4)*elapsed);
    writeF64(component,phase,8);return phase;
  }
  function drawComponent64Strokes(renderer,scratch,phase) {
    const gray=readU8(renderer,69);
    writeI32(scratch,readI32(renderer,96),480);
    const color=gray?50:51;
    writeI32(scratch,color,492);writeI32(scratch,color,488);writeI32(scratch,color,484);
    canvas(operations.strokeRgb,32170,(scratch+480)|0);
    const wavePhase=f32(phase*.015);
    for(const side of [-1,1])for(let index=0;index<4;index++) {
      contextCommand(renderer,scratch,464,operations.beginPath);
      const baseAngle=index*.6+(-.9);
      const cosine=cosF32(f32(wavePhase+f32((side+index)*1.5707963267948966)));
      const wave=f32(.5-cosine*.5);
      let angle=f32(baseAngle+f32((wave+wave)+(-1))*.2);
      if(side===-1)angle=f32(-3.141592653589793-angle);
      const endX=f32(sinF32(angle)*35),endY=f32(cosF32(angle)*35);
      synchronizeTransform(renderer,scratch,400);
      const context=readI32(renderer,96);
      writeF64(scratch,0,384);writeF64(scratch,0,376);writeI32(scratch,context,368);
      canvas(operations.moveTo,32166,(scratch+368)|0);
      const controlY=endY*.5,controlX=endX*.8;
      synchronizeTransform(renderer,scratch,304);
      const curveContext=readI32(renderer,96);
      writeF64(scratch,endY,288);writeF64(scratch,endX,280);
      writeF64(scratch,controlY,272);writeF64(scratch,controlX,264);writeI32(scratch,curveContext,256);
      canvas(operations.quadraticCurveTo,32160,(scratch+256)|0);
      synchronizeTransform(renderer,scratch,192);
      contextCommand(renderer,scratch,176,operations.stroke);
    }
  }
  function drawComponent64Circle(component,renderer,scratch) {
    const [red,green,blue]=resolveHitColor(component,scratch,544,79,65,46,true);
    let fillRed=red,fillGreen=green,fillBlue=blue;
    if(readU8(renderer,69))fillRed=fillGreen=fillBlue=channel(blue*.0722+(green*.7152+red*.2126));
    rgb(renderer,scratch,160,operations.fillRgb,fillRed,fillGreen,fillBlue);
    let strokeBlue=shade(blue),strokeGreen=shade(green),strokeRed=shade(red);
    if(readU8(renderer,69))strokeRed=strokeGreen=strokeBlue=channel(strokeBlue*.0722+(strokeGreen*.7152+strokeRed*.2126));
    rgb(renderer,scratch,144,operations.strokeRgb,strokeRed,strokeGreen,strokeBlue);
    contextCommand(renderer,scratch,128,operations.beginPath);
    synchronizeTransform(renderer,scratch,64);
    const context=readI32(renderer,96);
    writeI32(scratch,0,48);writeF64(scratch,6.283185307179586,40);
    writeF64(scratch,0,32);writeF64(scratch,15,24);writeF64(scratch,0,16);writeF64(scratch,0,8);
    writeI32(scratch,context);canvas(operations.arc,32183,scratch);
    fillAndStrokeCurrentPath(renderer);
  }
  function drawComponent64(component,renderer,elapsed) {
    component|=0;renderer|=0;elapsed=f32(elapsed);
    const scratch=(runtime.stackPointer.value-560)|0;runtime.stackPointer.value=scratch;
    lineStyle(renderer,scratch,528,5,512,496);
    const phase=updateComponent64Motion(component,elapsed);
    drawComponent64Strokes(renderer,scratch,phase);
    drawComponent64Circle(component,renderer,scratch);
    runtime.stackPointer.value=(scratch+560)|0;
  }
  function drawComponent80(component,renderer) {
    component|=0;renderer|=0;
    const scratch=(runtime.stackPointer.value-208)|0;runtime.stackPointer.value=scratch;
    const [,green,blue]=resolveHitColor(component,scratch,192,255,232,105,false);
    lineStyle(renderer,scratch,176,5.249999910593033,160);
    let fillRed=255,fillGreen=green,fillBlue=blue;
    if(readU8(renderer,69))fillRed=fillGreen=fillBlue=channel((green*.7152+54.213)+blue*.0722);
    rgb(renderer,scratch,144,operations.fillRgb,fillRed,fillGreen,fillBlue);
    let strokeBlue=shade(blue),strokeGreen=shade(green),strokeRed=207;
    if(readU8(renderer,69))strokeRed=strokeGreen=strokeBlue=channel((strokeGreen*.7152+44.0082)+strokeBlue*.0722);
    rgb(renderer,scratch,128,operations.strokeRgb,strokeRed,strokeGreen,strokeBlue);
    contextCommand(renderer,scratch,112,operations.beginPath);
    synchronizeTransform(renderer,scratch,48,true);
    const context=readI32(renderer,96);
    writeF64(scratch,49.497474670410156,32);writeF64(scratch,49.497474670410156,24);
    writeF64(scratch,-24.748737335205078,16);writeF64(scratch,-24.748737335205078,8);
    writeI32(scratch,context);canvas(operations.rect,32160,scratch);
    fillAndStrokeCurrentPath(renderer);
    runtime.stackPointer.value=(scratch+208)|0;
  }
  return Object.freeze({1038:drawComponent64,1039:drawComponent80});
}
