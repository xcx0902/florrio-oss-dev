/** Complete client f32 sine/cosine kernels and range reduction.
 * 486/487 are the shipped sin/cos minimax kernels, 427=cosf, 431=sinf and
 * 929=__rem_pio2f. Only the huge-argument large reduction 930 remains native.
 * Original client SHA: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([486,487,929,427,431]);
const f32 = Math.fround;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;
const THREE_HALF_PI = 4.71238898038469;
const TWO_PI = 6.283185307179586;

export function createClientTrigHooks(runtime) {
  const f32BitsView = new DataView(new ArrayBuffer(4));
  const f64BitsView = new DataView(new ArrayBuffer(8));
  function f32Bits(value) {
    f32BitsView.setFloat32(0,value,true);
    return f32BitsView.getUint32(0,true);
  }
  function f32FromBits(value) {
    f32BitsView.setUint32(0,value,true);
    return f32BitsView.getFloat32(0,true);
  }
  function f64Bits(value) {
    f64BitsView.setFloat64(0,value,true);
    return f64BitsView.getBigUint64(0,true);
  }
  function f64FromBits(value) {
    f64BitsView.setBigUint64(0,BigInt.asUintN(64,value),true);
    return f64BitsView.getFloat64(0,true);
  }
  function negF32(value) { return f32FromBits(f32Bits(value)^0x80000000); }
  function negF64(value) { return f64FromBits(f64Bits(value)^0x8000000000000000n); }
  /** Direct undefined reaches WASM as a canonical NaN, while an object whose
   * valueOf returns undefined keeps the ToNumber payload. */
  function toNumber(value) { return value===undefined?NaN:+value; }
  function demoteNaN(value) {
    const bits=f64Bits(value);
    const fraction=Number((bits>>29n)&0x7fffffn);
    return f32FromBits((Number(bits>>63n)<<31|0x7f800000|fraction|(fraction===0?0x400000:0))>>>0);
  }
  let buffer,view;
  function dataView() {
    if(buffer!==runtime.memory.buffer){buffer=runtime.memory.buffer;view=new DataView(buffer);}
    return view;
  }
  function writeF64(pointer,value) {
    const address=pointer>>>0;
    if(address+8>dataView().byteLength)throw new WebAssembly.RuntimeError('memory access out of bounds');
    dataView().setFloat64(address,value,true);
  }
  function readF64(pointer) {
    const address=pointer>>>0;
    if(address+8>dataView().byteLength)throw new WebAssembly.RuntimeError('memory access out of bounds');
    return dataView().getFloat64(address,true);
  }

  /** 486: cos kernel on a double reduced argument, demoted to f32. */
  function cosKernel(x) {
    x=toNumber(x);
    if(Number.isNaN(x))return demoteNaN(x);
    const square=x*x;
    const fourth=square*square;
    const first=square*-0.499999997251031+1;
    const second=fourth*0.04166662332373906;
    const sixth=square*fourth;
    const tail=square*2.439044879627741e-05-0.001388676377460993;
    return f32(first+second+sixth*tail);
  }

  /** 487: sin kernel on a double reduced argument, demoted to f32. */
  function sinKernel(x) {
    x=toNumber(x);
    if(Number.isNaN(x))return demoteNaN(x);
    const square=x*x;
    const cube=square*x;
    const fourth=square*square;
    const seventh=cube*fourth;
    const tail=square*2.718311493989822e-06-0.00019839334836096632;
    return f32(seventh*tail+(cube*(square*0.008333329385889463-0.16666666641626524)+x));
  }

  /** 929: float range reduction. Returns the quadrant and stores the remainder
   * at outPointer. Large inputs still use the retained native 930 reduction
   * with exactly this function's 16-byte frame and argument pointers. */
  function remPio2f(x,outPointer) {
    x=f32(toNumber(x));
    const raw=f32Bits(x),absolute=raw&0x7fffffff,negative=(raw&0x80000000)!==0;
    const saved=runtime.stackPointer.value,frame=(saved-16)|0;
    runtime.stackPointer.value=frame;
    if(absolute<=1305022426) {
      const value=x;
      const quotient=value*0.6366197723675814+6755399441055744-6755399441055744;
      const reduced=value+quotient*-1.5707963109016418+quotient*-1.5893254773528196e-08;
      writeF64(outPointer,reduced);
      runtime.stackPointer.value=saved;
      if(Math.abs(quotient)<2147483648)return Math.trunc(quotient)|0;
      return -2147483648;
    }
    if(absolute>=2139095040) {
      writeF64(outPointer,x-x);
      runtime.stackPointer.value=saved;
      return 0;
    }
    const exponent=(absolute>>>23)-150|0;
    const leading=f32FromBits((absolute-((exponent<<23)>>>0))>>>0);
    writeF64(frame+8,leading);
    const quadrant=runtime.call(930,frame+8,frame,exponent,1,0);
    const reduced=readF64(frame);
    if(negative) {
      writeF64(outPointer,negF64(reduced));
      runtime.stackPointer.value=saved;
      return (0-quadrant)|0;
    }
    writeF64(outPointer,reduced);
    runtime.stackPointer.value=saved;
    return quadrant|0;
  }

  /** 427: cosf. */
  function cosf(x) {
    x=f32(toNumber(x));
    const raw=f32Bits(x),absolute=raw&0x7fffffff,negative=(raw&0x80000000)!==0;
    const saved=runtime.stackPointer.value,frame=(saved-16)|0;
    runtime.stackPointer.value=frame;
    let result;
    if(absolute<=1061752794) {
      if(absolute<964689920)result=1;
      else result=cosKernel(x);
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute<=1081824209) {
      if(absolute>=1075235812) result=negF32(cosKernel(x+(negative?PI:-PI)));
      else if(negative) result=sinKernel(x+HALF_PI);
      else result=sinKernel(HALF_PI-x);
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute<=1088565717) {
      if(absolute>=1085271520) result=cosKernel(x+(negative?TWO_PI:-TWO_PI));
      else if(negative) result=sinKernel(-THREE_HALF_PI-x);
      else result=sinKernel(x-THREE_HALF_PI);
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute>2139095040){
      runtime.stackPointer.value=saved;
      return f32FromBits(raw|0x00400000);
    }
    if(absolute===2139095040) {
      runtime.stackPointer.value=saved;
      return f32FromBits(0x7fc00000);
    }
    const quadrant=remPio2f(x,frame+8)&3;
    const reduced=readF64(frame+8);
    if(quadrant===0)result=cosKernel(reduced);
    else if(quadrant===1)result=negF32(sinKernel(reduced));
    else if(quadrant===2)result=negF32(cosKernel(reduced));
    else result=sinKernel(reduced);
    runtime.stackPointer.value=saved;
    return result;
  }

  /** 431: sinf. */
  function sinf(x) {
    x=f32(toNumber(x));
    const raw=f32Bits(x),absolute=raw&0x7fffffff,negative=(raw&0x80000000)!==0;
    const saved=runtime.stackPointer.value,frame=(saved-16)|0;
    runtime.stackPointer.value=frame;
    let result;
    if(absolute<=1061752794) {
      if(absolute<964689920)result=x;
      else result=sinKernel(x);
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute<=1081824209) {
      if(absolute<=1075235811) {
        if(negative)result=negF32(cosKernel(x+HALF_PI));
        else result=cosKernel(x-HALF_PI);
      } else result=sinKernel(-(x+(negative?PI:-PI)));
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute<=1088565717) {
      if(absolute<=1085271519) {
        if(negative)result=cosKernel(x+THREE_HALF_PI);
        else result=negF32(cosKernel(x-THREE_HALF_PI));
      } else result=sinKernel(x+(negative?TWO_PI:-TWO_PI));
      runtime.stackPointer.value=saved;
      return result;
    }
    if(absolute>2139095040){
      runtime.stackPointer.value=saved;
      return f32FromBits(raw|0x00400000);
    }
    if(absolute===2139095040) {
      runtime.stackPointer.value=saved;
      return f32FromBits(0x7fc00000);
    }
    const quadrant=remPio2f(x,frame+8)&3;
    const reduced=readF64(frame+8);
    if(quadrant===0)result=sinKernel(reduced);
    else if(quadrant===1)result=cosKernel(reduced);
    else if(quadrant===2)result=negF32(sinKernel(reduced));
    else result=negF32(cosKernel(reduced));
    runtime.stackPointer.value=saved;
    return result;
  }
  return Object.freeze({486:cosKernel,487:sinKernel,929:remPio2f,427:cosf,431:sinf});
}
