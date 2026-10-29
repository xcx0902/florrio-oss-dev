/** Complete client375 power and511 binary exponent scaling.
 * The split log2/exp polynomial and staged overflow arithmetic retain the
 * shipped WASM's result bits; Math.pow has different special-value behavior.
 * Original client SHA: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([375,511]);
export function createClientMathHooks(runtime) {
  const bitsView = new DataView(new ArrayBuffer(8));
  function doubleBits(value) {
    bitsView.setFloat64(0,value,true);
    return bitsView.getBigInt64(0,true);
  }
  function doubleFromBits(bits) {
    bitsView.setBigInt64(0,BigInt.asIntN(64,bits),true);
    return bitsView.getFloat64(0,true);
  }
  const highWord = bits => Number(BigInt.asIntN(32,BigInt.asUintN(64,bits)>>32n));
  const lowWord = bits => Number(BigInt.asIntN(32,bits));
  const clearLowWord = value => doubleFromBits(doubleBits(value)&-4294967296n);
  const withHighWord = (value,high) => doubleFromBits((doubleBits(value)&4294967295n)|(BigInt(high>>>0)<<32n));
  let buffer,view;
  function readF64(pointer) {
    if(buffer!==runtime.memory.buffer){buffer=runtime.memory.buffer;view=new DataView(buffer);}
    const address=pointer>>>0;
    if(address+8>view.byteLength)throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view.getFloat64(address,true);
  }

  /** 0: noninteger, 1: odd integer, 2: even integer. Only negative bases need
   * this distinction. Large representable doubles have no odd unit bit. */
  function integerExponentClass(absoluteHigh,low) {
    if((absoluteHigh>>>0)>0x433fffff)return 2;
    if((absoluteHigh>>>0)<0x3ff00000)return 0;
    const biasedExponent=absoluteHigh>>>20;
    if((absoluteHigh>>>0)>=0x41300000) {
      const shift=1075-biasedExponent,integer=low>>>shift;
      return (integer<<shift)===low ? 2-(integer&1) : 0;
    }
    if(low)return 0;
    const shift=1043-biasedExponent,integer=absoluteHigh>>>shift;
    return (integer<<shift)===absoluteHigh ? 2-(integer&1) : 0;
  }

  /** Split log2(x) into a high part with its low word cleared and a correction.
   * The three table loads intentionally read live linear memory in native order. */
  function splitLog2(magnitude,absoluteHigh,largeExponent) {
    if(largeExponent) {
      const distance=magnitude+-1;
      const correction=distance*1.9259629911266175e-8+
        ((distance*distance)*(.5-distance*(distance*-.25+.3333333333333333)))*-1.4426950408889634;
      const linear=distance*1.4426950216293335;
      const high=clearLowWord(correction+linear);
      return [high,correction-(high-linear)];
    }
    const scaled=magnitude*9007199254740992;
    const subnormal=(absoluteHigh>>>0)<0x100000;
    const normalized=subnormal?scaled:magnitude;
    let normalizedHigh=subnormal?highWord(doubleBits(scaled)):absoluteHigh;
    const fractionHigh=normalizedHigh&0xfffff;
    let exponent=(normalizedHigh>>20)+(subnormal?-1076:-1023);
    normalizedHigh=fractionHigh|0x3ff00000;
    let interval=0;
    if((fractionHigh>>>0)>=235663) {
      if((fractionHigh>>>0)<767610)interval=1;
      else {normalizedHigh=fractionHigh|0x3fe00000;exponent=(exponent+1)|0;}
    }
    const tableOffset=interval<<3;
    const tableCorrection=readF64(tableOffset+131952);
    const center=readF64(tableOffset+131936);
    const reduced=withHighWord(normalized,normalizedHigh);
    const reciprocal=1/(center+reduced);
    const difference=reduced-center;
    const sumHigh=doubleFromBits(BigInt((((normalizedHigh>>>1)|0x20000000)+(interval<<18)+0x80000)>>>0)<<32n);
    const ratio=difference*reciprocal;
    const ratioHigh=clearLowWord(ratio);
    const ratioLow=reciprocal*((difference-sumHigh*ratioHigh)-((reduced-(sumHigh-center))*ratioHigh));
    const highSquare=ratioHigh*ratioHigh;
    const ratioSquare=ratio*ratio;
    const remainder=ratioLow*(ratio+ratioHigh)+(ratioSquare*ratioSquare)*
      (ratioSquare*(ratioSquare*(ratioSquare*(ratioSquare*(ratioSquare*.20697501780033842+
        .23066074577556175)+.272728123808534)+.33333332981837743)+.4285714285785502)+.5999999999999946);
    const polynomialHigh=clearLowWord((highSquare+3)+remainder);
    const polynomialLow=ratioLow*polynomialHigh+ratio*(remainder-((polynomialHigh+-3)-highSquare));
    const product=ratioHigh*polynomialHigh;
    const productHigh=clearLowWord(polynomialLow+product);
    const logCorrection=tableCorrection+((polynomialLow-(productHigh-product))*.9617966939259756+
      productHigh*-7.028461650952758e-9);
    const tableLog=readF64(tableOffset+131968);
    const logHigh=productHigh*.9617967009544373;
    const high=clearLowWord((tableLog+(logCorrection+logHigh))+exponent);
    return [high,logCorrection-(((high-exponent)-tableLog)-logHigh)];
  }

  /** Reconstruct exp2(high+low). The caller has checked overflow/underflow;
   * subnormal results use the independently recovered scaling helper. */
  function exponentiateSplit(high,low,sumBits) {
    let sumHigh=highWord(sumBits),integerExponent=0;
    const absoluteHigh=sumHigh&0x7fffffff;
    let remainderBits=sumBits;
    if((absoluteHigh>>>0)>=0x3fe00001) {
      sumHigh=((0x100000>>>((absoluteHigh>>>20)-1022))+sumHigh)|0;
      const fraction=(sumHigh&0xfffff)|0x100000;
      const biasedExponent=(sumHigh>>>20)&2047;
      integerExponent=fraction>>>(1043-biasedExponent);
      if(sumBits<0n)integerExponent=(-integerExponent)|0;
      const rounded=doubleFromBits(BigInt(((-1048576>>(biasedExponent-1023))&sumHigh)>>>0)<<32n);
      high=high-rounded;
      remainderBits=doubleBits(low+high);
    }
    const remainderHigh=doubleFromBits(remainderBits&-4294967296n);
    const logProduct=remainderHigh*.6931471824645996;
    const logCorrection=(low-(remainderHigh-high))*.6931471805599453+remainderHigh*-1.904654299957768e-9;
    const logarithm=logProduct+logCorrection;
    const square=logarithm*logarithm;
    const rational=logarithm-square*(square*(square*(square*(square*4.1381367970572385e-8+
      -1.6533902205465252e-6)+6.613756321437934e-5)+-.0027777777777015593)+.16666666666666602);
    const quotient=(logarithm*rational)/(rational+-2);
    const error=logCorrection-(logarithm-logProduct);
    const exponential=(logarithm-(quotient-(error+logarithm*error)))+1;
    const exponentialBits=doubleBits(exponential);
    const resultHigh=(highWord(exponentialBits)+(integerExponent<<20))|0;
    if(resultHigh<=0xfffff)return scaleBinaryExponent(exponential,integerExponent);
    return doubleFromBits((exponentialBits&4294967295n)|(BigInt(resultHigh>>>0)<<32n));
  }

  /** The WebAssembly JS boundary converts undefined to the canonical NaN.
   * Unary plus in JS yields V8's internal NaN payload instead, so normalize
   * only undefined; existing NaN arguments keep their exact payload. */
  function wasmF64(value) {
    return value === undefined ? NaN : +value;
  }

  function powF64(base,exponent) {
    base=wasmF64(base);exponent=wasmF64(exponent);
    const exponentBits=doubleBits(exponent),exponentHigh=highWord(exponentBits),exponentLow=lowWord(exponentBits);
    const absoluteExponentHigh=exponentHigh&0x7fffffff;
    if((absoluteExponentHigh|exponentLow)===0)return 1;
    const baseBits=doubleBits(base),baseHigh=highWord(baseBits),baseLow=lowWord(baseBits);
    if(baseHigh===0x3ff00000 && baseLow===0)return 1;
    const absoluteBaseHigh=baseHigh&0x7fffffff;
    if((absoluteBaseHigh>>>0)>0x7ff00000 || (absoluteBaseHigh===0x7ff00000 && baseLow!==0) ||
       (absoluteExponentHigh>>>0)>0x7ff00000 || (absoluteExponentHigh===0x7ff00000 && exponentLow!==0))return base+exponent;
    const integerClass=baseBits<0n?integerExponentClass(absoluteExponentHigh,exponentLow):0;
    if(exponentLow===0) {
      if(absoluteExponentHigh===0x7ff00000) {
        if(((absoluteBaseHigh-0x3ff00000)|baseLow)===0)return 1;
        if((absoluteBaseHigh>>>0)>=0x3ff00000)return exponentBits>=0n?exponent:0;
        return exponentBits>=0n?0:-exponent;
      }
      if(absoluteExponentHigh===0x3ff00000)return exponentBits>=0n?base:1/base;
      if(exponentHigh===0x40000000)return base*base;
      if(exponentHigh===0x3fe00000 && baseBits>=0n)return Math.sqrt(base);
    }
    const magnitude=Math.abs(base);
    if(baseLow===0 && (absoluteBaseHigh===0 || (baseHigh&0x3fffffff)===0x3ff00000)) {
      const result=exponentBits<0n?1/magnitude:magnitude;
      if(baseBits>=0n)return result;
      if((integerClass|(absoluteBaseHigh-0x3ff00000))===0) {const invalid=result-result;return invalid/invalid;}
      return integerClass===1?-result:result;
    }
    let sign=1;
    if(baseBits<0n) {
      if(integerClass===0) {const invalid=base-base;return invalid/invalid;}
      if(integerClass===1)sign=-1;
    }
    const largeExponent=(absoluteExponentHigh>>>0)>=1105199105;
    if(largeExponent) {
      if((absoluteExponentHigh>>>0)>=1139802113) {
        if((absoluteBaseHigh>>>0)<=1072693247)return exponentBits<0n?Infinity:0;
        return exponentHigh>0?Infinity:0;
      }
      if((absoluteBaseHigh>>>0)<=1072693246)return exponentBits<0n?(sign*1e300)*1e300:(sign*1e-300)*1e-300;
      if((absoluteBaseHigh>>>0)>=1072693249)return exponentHigh>0?(sign*1e300)*1e300:(sign*1e-300)*1e-300;
    }
    const [logHigh,logLow]=splitLog2(magnitude,absoluteBaseHigh,largeExponent);
    const exponentLeading=doubleFromBits(exponentBits&-4294967296n);
    const productHigh=logHigh*exponentLeading;
    const productLow=logLow*exponent+(exponent-exponentLeading)*logHigh;
    const product=productHigh+productLow,productBits=doubleBits(product);
    const productHighWord=highWord(productBits),productLowWord=lowWord(productBits);
    if(productHighWord>=1083179008) {
      if(((productHighWord-1083179008)|productLowWord)!==0 || productLow+8.008566259537294e-17>product-productHigh)
        return (sign*1e300)*1e300;
    } else if(((productHighWord&2147482624)>>>0)>=1083231232) {
      if(((productHighWord+1064252416)|productLowWord)!==0 || productLow<=product-productHigh)
        return (sign*1e-300)*1e-300;
    }
    return sign*exponentiateSplit(productHigh,productLow,productBits);
  }

  /** Staged multiplication retains underflow rounding and signed zero even
   * for exponents outside the range of a directly constructed power of two. */
  function scaleBinaryExponent(value,exponent) {
    value=wasmF64(value);exponent=(wasmF64(exponent))|0;
    if(exponent>=1024) {
      value=value*8.98846567431158e307;
      if(exponent<2047)exponent=(exponent-1023)|0;
      else {value=value*8.98846567431158e307;exponent=((exponent<3069?exponent:3069)-2046)|0;}
    } else if(exponent<=-1023) {
      value=value*2.2250738585072014e-308;
      if(exponent>-2045)exponent=(exponent+1022)|0;
      else {value=value*2.2250738585072014e-308;exponent=((exponent>-3066?exponent:-3066)+2044)|0;}
    }
    return value*doubleFromBits(BigInt(((exponent+1023)|0)>>>0)<<52n);
  }
  return Object.freeze({375:powF64,511:scaleBinaryExponent});
}
