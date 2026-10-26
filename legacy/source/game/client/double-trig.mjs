/** Complete client f64 sine/cosine kernels, quadrants and ldlibm-style
 * argument reduction. 593/594 are the shipped minimax kernels, 403=cos,
 * 407=sin and 931=__ieee754_rem_pio2. The huge-argument 930 reduction remains
 * native and is called with the original frame layout.
 * Original client SHA: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([593,594,931,403,407]);

/** Exact hexadecimal-binary64 literal (all constants here are normal). */
function hexFloat(text) {
  const negative=text.startsWith('-');
  const body=negative?text.slice(1):text;
  const [mantissa,exponentText]=body.split('p');
  const [whole,fraction='']=mantissa.split('.');
  const digits=whole+fraction;
  const exponent=Number(exponentText)-4*fraction.length;
  const value=Number(BigInt(digits))*2**exponent;
  return negative?-value:value;
}

const C1=hexFloat('0x1.a01a019cb159p-16');
const C2=hexFloat('-0x1.6c16c16c15177p-10');
const C3=hexFloat('0x1.555555555554cp-5');
const C4=hexFloat('-0x1.8fae9be8838d4p-37');
const C5=hexFloat('0x1.1ee9ebdb4b1c4p-29');
const C6=hexFloat('-0x1.27e4f809c52adp-22');
const S1=hexFloat('0x1.5d93a5acfd57cp-33');
const S2=hexFloat('-0x1.ae5e68a2b9cebp-26');
const S3=hexFloat('0x1.71de357b1fe7dp-19');
const S4=hexFloat('-0x1.a01a019c161d5p-13');
const S5=hexFloat('0x1.111111110f8a6p-7');
const SIN_TAIL=hexFloat('-0x1.5555555555549p-3');
const SIN_TAIL_ODD=hexFloat('0x1.5555555555549p-3');
const PIO2_1=hexFloat('0x1.921fb544p+0');
const PIO2_1T=hexFloat('0x1.0b4611a626331p-34');
const PI_1=hexFloat('0x1.921fb544p+1');
const PI_1T=hexFloat('0x1.0b4611a626331p-33');
const TWOPI_1=hexFloat('0x1.921fb544p+2');
const TWOPI_1T=hexFloat('0x1.0b4611a626331p-32');
const PIO2_2=hexFloat('0x1.2d97c7f3p+2');
const PIO2_2T=hexFloat('0x1.90e91a79394cap-33');
const INVPIO2=hexFloat('0x1.45f306dc9c883p-1');
const PIO2_2A=hexFloat('0x1.0b4611a6p-34');
const PIO2_3=hexFloat('0x1.3198a2e037073p-69');
const PIO2_3T=hexFloat('0x1.3198a2ep-69');
const PIO2_4=hexFloat('0x1.b839a252049c1p-104');
const MAGIC=6755399441055744;
const TWO24=16777216;

export function createClientDoubleTrigHooks(runtime) {
  const f64BitsView=new DataView(new ArrayBuffer(8));
  function f64Bits(value) {
    f64BitsView.setFloat64(0,value,true);
    return f64BitsView.getBigUint64(0,true);
  }
  function f64FromBits(value) {
    f64BitsView.setBigUint64(0,BigInt.asUintN(64,value),true);
    return f64BitsView.getFloat64(0,true);
  }
  function negF64(value) { return f64FromBits(f64Bits(value)^0x8000000000000000n); }
  function exponentOf(value) { return Number((f64Bits(value)>>52n)&2047n); }
  function toNumber(value) { return value===undefined?NaN:+value; }
  let buffer,view;
  function dataView() {
    if(buffer!==runtime.memory.buffer){buffer=runtime.memory.buffer;view=new DataView(buffer);}
    return view;
  }
  function bounds(address) {
    if(address+8>dataView().byteLength)throw new WebAssembly.RuntimeError('memory access out of bounds');
  }
  function readF64(pointer) {
    const address=pointer>>>0;
    bounds(address);
    return dataView().getFloat64(address,true);
  }
  function writeF64(pointer,value) {
    const address=pointer>>>0;
    bounds(address);
    dataView().setFloat64(address,value,true);
  }
  /** i32.trunc_f64_s with the guard emitted by clang: out-of-range and NaN
   * become INT_MIN instead of trapping. */
  function truncI32(value) {
    return Math.abs(value)<2147483648?Math.trunc(value)|0:-2147483648;
  }

  /** 593: kernel cosine for a reduced double and its low tail. */
  function kernelCos(x,y) {
    const z=x*x;
    const half=z*0.5;
    const nearOne=1-half;
    const compensated=(1-nearOne)-half;
    const square=z*z;
    const polynomial=z*(z*(z*(z*C1+C2)+C3)+square*square*(z*(z*C4+C5)+C6));
    return nearOne+(compensated+(polynomial-x*y));
  }

  /** 594: kernel sine for a reduced double, low tail and odd/even flag. */
  function kernelSin(x,y,odd) {
    const z=x*x;
    const cubeZ=z*z*z;
    const polynomial=cubeZ*(z*S1+S2)+(z*(z*S3+S4)+S5);
    const cube=x*z;
    if(odd===0)return cube*(z*polynomial+SIN_TAIL)+x;
    return x-(z*(y*0.5-cube*polynomial)-y+cube*SIN_TAIL_ODD);
  }

  /** 931: split the argument into a quadrant and a two-double remainder.
   * The 48-byte frame, the 24-bit huge-argument chunks and their zero count
   * follow the shipped function exactly. */
  function remPio2(x,outPointer) {
    const saved=runtime.stackPointer.value,frame=saved-48;
    runtime.stackPointer.value=frame;
    const done=value=>{runtime.stackPointer.value=saved;return value;};
    const bits=f64Bits(x);
    const high=Number(bits>>32n)|0;
    const absolute=high&0x7fffffff;
    let quadrant;
    if(absolute<=1074752122) {
      if((high&0xfffff)===598523)return medium();
      if(absolute<=1073928572) {
        if((bits&0x8000000000000000n)===0n) {
          const highPart=x+-PIO2_1;
          const lowPart=highPart+-PIO2_1T;
          writeF64(outPointer,lowPart);
          writeF64(outPointer+8,highPart-lowPart+-PIO2_1T);
          return done(1);
        }
        const highPart=x+PIO2_1;
        const lowPart=highPart+PIO2_1T;
        writeF64(outPointer,lowPart);
        writeF64(outPointer+8,highPart-lowPart+PIO2_1T);
        return done(-1);
      }
      if((bits&0x8000000000000000n)===0n) {
        const highPart=x+-PI_1;
        const lowPart=highPart+-PI_1T;
        writeF64(outPointer,lowPart);
        writeF64(outPointer+8,highPart-lowPart+-PI_1T);
        return done(2);
      }
      const highPart=x+PI_1;
      const lowPart=highPart+PI_1T;
      writeF64(outPointer,lowPart);
      writeF64(outPointer+8,highPart-lowPart+PI_1T);
      return done(-2);
    }
    if(absolute<=1075594811) {
      if(absolute<=1075183036) {
        if(absolute===1074977148)return medium();
        if((bits&0x8000000000000000n)===0n) {
          const highPart=x+-PIO2_2;
          const lowPart=highPart+-PIO2_2T;
          writeF64(outPointer,lowPart);
          writeF64(outPointer+8,highPart-lowPart+-PIO2_2T);
          return done(3);
        }
        const highPart=x+PIO2_2;
        const lowPart=highPart+PIO2_2T;
        writeF64(outPointer,lowPart);
        writeF64(outPointer+8,highPart-lowPart+PIO2_2T);
        return done(-3);
      }
      if(absolute===1075388923)return medium();
      if((bits&0x8000000000000000n)===0n) {
        const highPart=x+-TWOPI_1;
        const lowPart=highPart+-TWOPI_1T;
        writeF64(outPointer,lowPart);
        writeF64(outPointer+8,highPart-lowPart+-TWOPI_1T);
        return done(4);
      }
      const highPart=x+TWOPI_1;
      const lowPart=highPart+TWOPI_1T;
      writeF64(outPointer,lowPart);
      writeF64(outPointer+8,highPart-lowPart+TWOPI_1T);
      return done(-4);
    }
    if(absolute<=1094263290)return medium();
    if(absolute>=2146435072) {
      const result=x-x;
      writeF64(outPointer,result);
      writeF64(outPointer+8,result);
      return done(0);
    }
    const exponent=absolute>>>20;
    let scaled=f64FromBits((bits&0x000fffffffffffffn)|0x4160000000000000n);
    let part=truncI32(scaled);
    writeF64(frame+16,part);
    scaled=(scaled-part)*TWO24;
    part=truncI32(scaled);
    writeF64(frame+24,part);
    scaled=(scaled-part)*TWO24;
    writeF64(frame+32,scaled);
    let count;
    if(scaled!==0)count=3;
    else if(readF64(frame+24)!==0)count=2;
    else count=1;
    quadrant=runtime.call(930,frame+16,frame,(absolute>>>20)-1046,count,1);
    const first=readF64(frame),second=readF64(frame+8);
    if((bits&0x8000000000000000n)!==0n) {
      writeF64(outPointer,negF64(first));
      writeF64(outPointer+8,negF64(second));
      return done((0-quadrant)|0);
    }
    writeF64(outPointer,first);
    writeF64(outPointer+8,second);
    return done(quadrant|0);

    function medium() {
      const quotient=x*INVPIO2+MAGIC-MAGIC;
      const first=x+quotient*-PIO2_1;
      let tail=quotient*PIO2_1T;
      let reduced=first-tail;
      writeF64(outPointer,reduced);
      const exponent=absolute>>>20;
      if(exponent-exponentOf(reduced)>=17) {
        const secondPart=quotient*PIO2_2A;
        const middle=first-secondPart;
        const thirdPart=quotient*PIO2_3;
        let correction=thirdPart-((first-middle)-secondPart);
        reduced=middle-correction;
        writeF64(outPointer,reduced);
        if(exponent-exponentOf(reduced)>=50) {
          const lastPart=quotient*PIO2_3T;
          const lastMiddle=middle-lastPart;
          const fourthPart=quotient*PIO2_4;
          correction=fourthPart-((middle-lastMiddle)-lastPart);
          reduced=lastMiddle-correction;
          writeF64(outPointer,reduced);
          writeF64(outPointer+8,lastMiddle-reduced-correction);
        } else {
          writeF64(outPointer+8,middle-reduced-correction);
        }
        return done(truncI32(quotient));
      }
      writeF64(outPointer+8,first-reduced-tail);
      return done(truncI32(quotient));
    }
  }

  /** 403: cosine on a double. */
  function cosDouble(input) {
    const x=toNumber(input);
    const saved=runtime.stackPointer.value,frame=saved-16;
    runtime.stackPointer.value=frame;
    const absolute=(Number(f64Bits(x)>>32n)|0)&0x7fffffff;
    let result;
    if(absolute<=1072243195) {
      if(absolute<1044816030)result=1;
      else result=kernelCos(x,0);
    } else if(absolute>=2146435072) {
      result=x-x;
    } else {
      const quadrant=remPio2(x,frame)&3;
      const first=readF64(frame),second=readF64(frame+8);
      if(quadrant===0)result=kernelCos(first,second);
      else if(quadrant===1)result=negF64(kernelSin(first,second,1));
      else if(quadrant===2)result=negF64(kernelCos(first,second));
      else result=kernelSin(first,second,1);
    }
    runtime.stackPointer.value=saved;
    return result;
  }

  /** 407: sine on a double. */
  function sinDouble(input) {
    const x=toNumber(input);
    const saved=runtime.stackPointer.value,frame=saved-16;
    runtime.stackPointer.value=frame;
    const absolute=(Number(f64Bits(x)>>32n)|0)&0x7fffffff;
    let result;
    if(absolute<=1072243195) {
      if(absolute<1045430272)result=x;
      else result=kernelSin(x,0,0);
    } else if(absolute>=2146435072) {
      result=x-x;
    } else {
      const quadrant=remPio2(x,frame)&3;
      const first=readF64(frame),second=readF64(frame+8);
      if(quadrant===0)result=kernelSin(first,second,1);
      else if(quadrant===1)result=kernelCos(first,second);
      else if(quadrant===2)result=negF64(kernelSin(first,second,1));
      else result=negF64(kernelCos(first,second));
    }
    runtime.stackPointer.value=saved;
    return result;
  }

  function kernelCosParam(x,y) { return kernelCos(toNumber(x),toNumber(y)); }
  function kernelSinParam(x,y,odd) { return kernelSin(toNumber(x),toNumber(y),odd|0); }
  function remPio2Param(x,outPointer) { return remPio2(toNumber(x),outPointer|0); }

  return Object.freeze({593:kernelCosParam,594:kernelSinParam,931:remPio2Param,403:cosDouble,407:sinDouble});
}
