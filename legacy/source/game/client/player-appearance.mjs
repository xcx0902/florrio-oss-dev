/** Complete direct source recovery of original client WASM function 1100.
 * Artifact c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 * Retains the shared 2624-byte scratch frame and exact floating-point operations.
 */
export const functionIds = Object.freeze([ 1100 ]);

const f32 = Math.fround;

export function createPlayerAppearanceHooks(runtime) {
  const compareMemory = (...args) => runtime.call(366, ...args);
  const roundF64 = (...args) => runtime.call(373, ...args);
  const powF64 = (...args) => runtime.call(375, ...args);
  const fillAndStrokeCurrentPath = (...args) => runtime.call(395, ...args);
  const drawEye = (...args) => runtime.call(690, ...args);
  const canvasSetLineCapRoundAbi = argumentPointer => +runtime.host("a", "a", 138730, 31967, argumentPointer);
  const canvasSetLineWidthAbi = argumentPointer => +runtime.host("a", "a", 138111, 93028, argumentPointer);
  const canvasSetFillRgbAbi = argumentPointer => +runtime.host("a", "a", 137186, 32170, argumentPointer);
  const canvasSetStrokeRgbAbi = argumentPointer => +runtime.host("a", "a", 137456, 32170, argumentPointer);
  const canvasBeginPathAbi = argumentPointer => +runtime.host("a", "a", 136878, 31967, argumentPointer);
  const canvasSetTransformAbi = argumentPointer => +runtime.host("a", "a", 136414, 32144, argumentPointer);
  const canvasMoveToAbi = argumentPointer => +runtime.host("a", "a", 137806, 32166, argumentPointer);
  const canvasQuadraticCurveToAbi = argumentPointer => +runtime.host("a", "a", 137880, 32160, argumentPointer);
  const canvasClosePathAbi = argumentPointer => +runtime.host("a", "a", 136912, 31967, argumentPointer);
  const canvasArcAbi = argumentPointer => +runtime.host("a", "a", 137995, 32183, argumentPointer);
  const canvasSaveAbi = argumentPointer => +runtime.host("a", "a", 136300, 31967, argumentPointer);
  const canvasSetLineJoinRoundAbi = argumentPointer => +runtime.host("a", "a", 138811, 31967, argumentPointer);
  const canvasRestoreAbi = argumentPointer => +runtime.host("a", "a", 136329, 31967, argumentPointer);
  const canvasLineToAbi = argumentPointer => +runtime.host("a", "a", 137843, 32166, argumentPointer);
  const canvasClipAbi = argumentPointer => +runtime.host("a", "a", 136807, 31967, argumentPointer);
  const canvasStrokeAbi = argumentPointer => +runtime.host("a", "a", 136732, 31967, argumentPointer);
  let buffer, view;
  function access(base, offset, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    const pointer = (base >>> 0) + offset;
    if (pointer + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return pointer;
  }
  const readU8 = (p, offset = 0) => {
    const address = access(p, offset, 1);
    return view.getUint8(address);
  };
  const readI32 = (p, offset = 0) => {
    const address = access(p, offset, 4);
    return view.getInt32(address, true);
  };
  const readI64 = (p, offset = 0) => {
    const address = access(p, offset, 8);
    return view.getBigInt64(address, true);
  };
  const readF32 = (p, offset = 0) => {
    const address = access(p, offset, 4);
    return view.getFloat32(address, true);
  };
  const readF64 = (p, offset = 0) => {
    const address = access(p, offset, 8);
    return view.getFloat64(address, true);
  };
  const writeU8 = (p, value, offset = 0) => {
    const address = access(p, offset, 1);
    view.setUint8(address, value);
  };
  const writeU16 = (p, value, offset = 0) => {
    const address = access(p, offset, 2);
    view.setUint16(address, value, true);
  };
  const writeI32 = (p, value, offset = 0) => {
    const address = access(p, offset, 4);
    view.setInt32(address, value, true);
  };
  const writeI64 = (p, value, offset = 0) => {
    const address = access(p, offset, 8);
    view.setBigInt64(address, BigInt.asIntN(64, value), true);
  };
  const writeF32 = (p, value, offset = 0) => {
    const address = access(p, offset, 4);
    view.setFloat32(address, value, true);
  };
  const writeF64 = (p, value, offset = 0) => {
    const address = access(p, offset, 8);
    view.setFloat64(address, value, true);
  };
  function truncateInteger(value, unsigned) {
    const integer = Math.trunc(value);
    if (!Number.isFinite(integer) || integer < (unsigned ? 0 : -2147483648) || integer >= (unsigned ? 4294967296 : 2147483648)) throw new WebAssembly.RuntimeError("integer overflow");
    return integer | 0;
  }
  // All arguments are evaluated before selection, as in the original WASM.
    const selectValue = (first, second, condition) => condition ? first : second
  // appearanceState: mouth curve +16, eye expression +20, attack +24, defend +28.
  // parameters: expression/decoration flags +0, death +1, attack +2, defend +3,
  // extra action flag +4, flash RGB +5/+6/+7, flash amount +8, model +16.
  // The remaining eye parameter at +12 is read by dependency drawEye (690).
  ;
  function drawPlayerAppearance(renderer, elapsedMilliseconds, appearanceState, parameters) {
    renderer |= 0;
    elapsedMilliseconds = f32(elapsedMilliseconds);
    appearanceState |= 0;
    parameters |= 0;
    const scratch = runtime.stackPointer.value - 2624 | 0;
    runtime.stackPointer.value = scratch;
    writeI32(scratch, renderer, 2620);
    writeF32(scratch, elapsedMilliseconds, 2616);
    const [defendAmount, attackAmount] = updateAttackAndDefendAmounts(elapsedMilliseconds, appearanceState, parameters);
    const [green, blue, red, model] = blendBodyColors(scratch, defendAmount, attackAmount, parameters);
    const [redF64, blueF64, greenF64] = setBodyFill(scratch, green, blue, red, renderer);
    setBodyStroke(scratch, redF64, blueF64, greenF64, renderer, parameters);
    drawBody(scratch, model, renderer);
    drawFlagFourDecoration(scratch, renderer, parameters);
    prepareEyeContext(scratch, appearanceState, parameters);
    const [savedState] = saveFaceDrawingState(scratch, renderer);
    const [eyeAmount] = updateEyeExpression(scratch, appearanceState, parameters);
    drawEyes(scratch, model, eyeAmount, appearanceState);
    restoreFaceDrawingState(scratch, savedState, renderer);
    translateMouth(scratch);
    drawAlternateModelMouth(scratch, model);
    updateMouthCurve(scratch, appearanceState, parameters);
    drawMouth(scratch, appearanceState);
    // The original leaves its scratch frame allocated when any call traps.
    runtime.stackPointer.value = scratch + 2624 | 0;
  }
  /** Smooth attack and defend flags into the persistent appearance state. Original WAT 420319–420407. */
  function updateAttackAndDefendAmounts(elapsedOrAttackAmount, appearanceState, parameters) {
    let defendAmount = 0, target = 0, elapsedOrBlendFraction = 0, currentAmount = 0, blendFraction = 0;
    elapsedOrBlendFraction = elapsedOrAttackAmount;
    const savedAppearanceState = appearanceState;
    currentAmount = readF32(appearanceState, 24);
    const savedCurrentAmount = currentAmount;
    target = selectValue(1, 0, readU8(parameters, 2));
    let selectedValue1;
    if (+(Math.abs(savedCurrentAmount - target) < 1e-7)) {
      selectedValue1 = target;
    } else {
      const resultOfPowF64 = powF64(.8, elapsedOrBlendFraction * .06);
      blendFraction = 1 - resultOfPowF64;
      selectedValue1 = selectValue(0, Math.min(blendFraction, 1), +(blendFraction < 0)) * (target - currentAmount) + currentAmount;
    }
    elapsedOrAttackAmount = f32(selectedValue1);
    writeF32(savedAppearanceState, elapsedOrAttackAmount, 24);
    const savedAppearanceState2 = appearanceState;
    currentAmount = readF32(appearanceState, 28);
    const savedCurrentAmount2 = currentAmount;
    target = selectValue(1, 0, readU8(parameters, 3));
    let selectedValue2;
    if (+(Math.abs(savedCurrentAmount2 - target) < 1e-7)) {
      selectedValue2 = target;
    } else {
      const resultOfPowF642 = powF64(.8, elapsedOrBlendFraction * .06);
      elapsedOrBlendFraction = 1 - resultOfPowF642;
      selectedValue2 = selectValue(0, Math.min(elapsedOrBlendFraction, 1), +(elapsedOrBlendFraction < 0)) * (target - currentAmount) + currentAmount;
    }
    defendAmount = f32(selectedValue2);
    writeF32(savedAppearanceState2, defendAmount, 28);
    return [ defendAmount, elapsedOrAttackAmount ];
  }
  /** Blend default, action and flash colors, retaining guarded unsigned conversion. Original WAT 420408–420557. */
  function blendBodyColors(scratch, defendAmountOrWhite, attackAmountOrRedChannel, parameters) {
    let green = 0, blue = 0, red = 0, model = 0, flashInverse = 0, flashAmount = 0, attackInverse = 0, defendInverse = 0, mixedChannel = 0;
    writeU8(scratch, readU8(parameters, 1), 2615);
    green = readU8(parameters, 6);
    blue = readU8(parameters, 7);
    model = readI32(parameters, 16);
    red = readU8(parameters, 5);
    flashAmount = readF32(parameters, 8);
    writeU8(scratch, 34, 2610);
    writeU16(scratch, 8738, 2608);
    let selectedValue3;
    blendBodyColorsDone: {
      const resultOfF32 = f32(flashAmount * f32(blue >>> 0));
      flashInverse = f32(1 - flashAmount);
      const savedFlashInverse = flashInverse;
      const resultOfF322 = f32(attackAmountOrRedChannel * 219);
      attackInverse = f32(1 - attackAmountOrRedChannel);
      const savedAttackInverse = attackInverse;
      defendInverse = f32(defendAmountOrWhite * .3);
      defendAmountOrWhite = f32(defendInverse * 255);
      const savedDefendAmountOrWhite = defendAmountOrWhite;
      defendInverse = f32(1 - defendInverse);
      mixedChannel = f32(resultOfF32 + f32(savedFlashInverse * f32(Math.trunc(f32(resultOfF322 + f32(savedAttackInverse * f32(Math.trunc(f32(savedDefendAmountOrWhite + f32(defendInverse * 99))))))))));
      if (+(mixedChannel < 4294967296) & +(mixedChannel >= 0)) {
        const resultOfTruncateInteger = truncateInteger(mixedChannel, true);
        selectedValue3 = resultOfTruncateInteger;
        break blendBodyColorsDone;
      }
      selectedValue3 = 0;
    }
    blue = selectedValue3;
    let selectedValue4;
    blendBodyColorsDone2: {
      mixedChannel = f32(f32(flashAmount * f32(green >>> 0)) + f32(flashInverse * f32(Math.trunc(f32(f32(attackAmountOrRedChannel * 118) + f32(attackInverse * f32(Math.trunc(f32(defendAmountOrWhite + f32(defendInverse * 231))))))))));
      if (+(mixedChannel < 4294967296) & +(mixedChannel >= 0)) {
        const resultOfTruncateInteger2 = truncateInteger(mixedChannel, true);
        selectedValue4 = resultOfTruncateInteger2;
        break blendBodyColorsDone2;
      }
      selectedValue4 = 0;
    }
    green = selectedValue4;
    let selectedValue5;
    blendBodyColorsDone3: {
      attackAmountOrRedChannel = f32(f32(flashAmount * f32(red >>> 0)) + f32(flashInverse * f32(Math.trunc(f32(f32(attackAmountOrRedChannel * 206) + f32(attackInverse * f32(Math.trunc(f32(defendAmountOrWhite + f32(defendInverse * 255))))))))));
      if (+(attackAmountOrRedChannel < 4294967296) & +(attackAmountOrRedChannel >= 0)) {
        const resultOfTruncateInteger3 = truncateInteger(attackAmountOrRedChannel, true);
        selectedValue5 = resultOfTruncateInteger3;
        break blendBodyColorsDone3;
      }
      selectedValue5 = 0;
    }
    red = selectedValue5;
    return [ green, blue, red, model ];
  }
  /** Select rounded line caps, body line width, fill color and optional grayscale. Original WAT 420558–420665. */
  function setBodyFill(scratch, green, blue, red, renderer) {
    let canvasHandle = 0, redF64 = 0, blueF64 = 0, greenF64 = 0, luminance = 0;
    if (+(readU8(renderer, 49) !== 1)) {
      writeU8(renderer, 1, 49);
      writeI32(scratch, readI32(renderer, 96), 2480);
      const savedBits = canvasSetLineCapRoundAbi(scratch + 2480 | 0) | 0;
      void savedBits;
    }
    canvasHandle = readI32(renderer, 96);
    writeI64(scratch, 4613937818241073152n, 2472);
    writeI32(scratch, canvasHandle, 2464);
    const savedBits2 = canvasSetLineWidthAbi(scratch + 2464 | 0) | 0;
    void savedBits2;
    redF64 = red >>> 0;
    setBodyFillDone: {
      if (+(readU8(renderer, 69) === 0)) {
        blueF64 = blue >>> 0;
        greenF64 = green >>> 0;
        break setBodyFillDone;
      }
      let selectedValue6;
      setBodyFillDone2: {
        blueF64 = blue >>> 0;
        const savedProduct = blueF64 * .0722;
        const savedProduct2 = redF64 * .2126;
        greenF64 = green >>> 0;
        luminance = savedProduct + (savedProduct2 + greenF64 * .7152);
        if (+(luminance < 4294967296) & +(luminance >= 0)) {
          const resultOfTruncateInteger4 = truncateInteger(luminance, true);
          selectedValue6 = resultOfTruncateInteger4;
          break setBodyFillDone2;
        }
        selectedValue6 = 0;
      }
      blue = selectedValue6;
      green = blue;
      red = green;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blue, 2460);
    writeI32(scratch, green, 2456);
    writeI32(scratch, red, 2452);
    writeI32(scratch, canvasHandle, 2448);
    const savedBits3 = canvasSetFillRgbAbi(scratch + 2448 | 0) | 0;
    void savedBits3;
    return [ redF64, blueF64, greenF64 ];
  }
  /** Compute the shaded outline and optional grayscale color. Original WAT 420666–420884. */
  function setBodyStroke(scratch, redF64, blueF64, greenF64, renderer, parameters) {
    let green = 0, blue = 0, red = 0, canvasHandle = 0, mixedChannel = 0, flashInverse = 0, flashAmountOrRedChannel = 0;
    let selectedValue7;
    setBodyStrokeDone: {
      flashAmountOrRedChannel = readF32(parameters, 8);
      flashInverse = f32(1 - flashAmountOrRedChannel);
      const savedFlashInverse2 = flashInverse;
      let selectedValue8;
      setBodyStrokeDone2: {
        blueF64 = Math.sqrt(blueF64 * .00392156862745098) * .8999999985098839;
        const resultOfRoundF64 = roundF64(blueF64 * blueF64 * 255);
        blueF64 = resultOfRoundF64;
        if (+(blueF64 < 4294967296) & +(blueF64 >= 0)) {
          const resultOfTruncateInteger5 = truncateInteger(blueF64, true);
          selectedValue8 = resultOfTruncateInteger5;
          break setBodyStrokeDone2;
        }
        selectedValue8 = 0;
      }
      mixedChannel = f32(f32(savedFlashInverse2 * f32(selectedValue8 >>> 0)) + f32(flashAmountOrRedChannel * f32(readU8(parameters, 7) >>> 0)));
      if (+(mixedChannel < 4294967296) & +(mixedChannel >= 0)) {
        const resultOfTruncateInteger6 = truncateInteger(mixedChannel, true);
        selectedValue7 = resultOfTruncateInteger6;
        break setBodyStrokeDone;
      }
      selectedValue7 = 0;
    }
    blue = selectedValue7;
    let selectedValue9;
    setBodyStrokeDone3: {
      const savedFlashInverse3 = flashInverse;
      let selectedValue10;
      setBodyStrokeDone4: {
        blueF64 = Math.sqrt(greenF64 * .00392156862745098) * .8999999985098839;
        const resultOfRoundF642 = roundF64(blueF64 * blueF64 * 255);
        blueF64 = resultOfRoundF642;
        if (+(blueF64 < 4294967296) & +(blueF64 >= 0)) {
          const resultOfTruncateInteger7 = truncateInteger(blueF64, true);
          selectedValue10 = resultOfTruncateInteger7;
          break setBodyStrokeDone4;
        }
        selectedValue10 = 0;
      }
      mixedChannel = f32(f32(savedFlashInverse3 * f32(selectedValue10 >>> 0)) + f32(flashAmountOrRedChannel * f32(readU8(parameters, 6) >>> 0)));
      if (+(mixedChannel < 4294967296) & +(mixedChannel >= 0)) {
        const resultOfTruncateInteger8 = truncateInteger(mixedChannel, true);
        selectedValue9 = resultOfTruncateInteger8;
        break setBodyStrokeDone3;
      }
      selectedValue9 = 0;
    }
    green = selectedValue9;
    let selectedValue11;
    setBodyStrokeDone5: {
      const savedFlashInverse4 = flashInverse;
      let selectedValue12;
      setBodyStrokeDone6: {
        redF64 = Math.sqrt(redF64 * .00392156862745098) * .8999999985098839;
        const resultOfRoundF643 = roundF64(redF64 * redF64 * 255);
        redF64 = resultOfRoundF643;
        if (+(redF64 < 4294967296) & +(redF64 >= 0)) {
          const resultOfTruncateInteger9 = truncateInteger(redF64, true);
          selectedValue12 = resultOfTruncateInteger9;
          break setBodyStrokeDone6;
        }
        selectedValue12 = 0;
      }
      flashAmountOrRedChannel = f32(f32(savedFlashInverse4 * f32(selectedValue12 >>> 0)) + f32(flashAmountOrRedChannel * f32(readU8(parameters, 5) >>> 0)));
      if (+(flashAmountOrRedChannel < 4294967296) & +(flashAmountOrRedChannel >= 0)) {
        const resultOfTruncateInteger10 = truncateInteger(flashAmountOrRedChannel, true);
        selectedValue11 = resultOfTruncateInteger10;
        break setBodyStrokeDone5;
      }
      selectedValue11 = 0;
    }
    red = selectedValue11;
    if (readU8(renderer, 69)) {
      let selectedValue13;
      setBodyStrokeDone7: {
        redF64 = (red >>> 0) * .2126 + (green >>> 0) * .7152 + (blue >>> 0) * .0722;
        if (+(redF64 < 4294967296) & +(redF64 >= 0)) {
          const resultOfTruncateInteger11 = truncateInteger(redF64, true);
          selectedValue13 = resultOfTruncateInteger11;
          break setBodyStrokeDone7;
        }
        selectedValue13 = 0;
      }
      blue = selectedValue13;
      green = blue;
      red = green;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blue, 2444);
    writeI32(scratch, green, 2440);
    writeI32(scratch, red, 2436);
    writeI32(scratch, canvasHandle, 2432);
    const savedBits4 = canvasSetStrokeRgbAbi(scratch + 2432 | 0) | 0;
    void savedBits4;
  }
  /** Draw the alternate model path or circular body, then fill and stroke it. Original WAT 420885–421679. */
  function drawBody(scratch, model, renderer) {
    let canvasHandle = 0, matrixTx = 0, matrixD = 0, matrixA = 0, matrixB = 0, matrixC = 0;
    writeI32(scratch, readI32(renderer, 96), 2416);
    const savedBits5 = canvasBeginPathAbi(scratch + 2416 | 0) | 0;
    void savedBits5;
    canvasHandle = readU8(renderer, 48);
    drawBodyDone: {
      if (+(model === 1)) {
        drawBodyDone2: {
          if (+(canvasHandle === 0)) {
            break drawBodyDone2;
          }
          writeU8(renderer, 0, 48);
          const resultOfCompareMemory = compareMemory(renderer + 24 | 0, renderer, 24);
          if (+(resultOfCompareMemory === 0)) {
            break drawBodyDone2;
          }
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer + 16 | 0), 40);
          writeI64(renderer, readI64(renderer + 8 | 0), 32);
          matrixC = readF32(renderer, 8);
          matrixD = readF32(renderer, 12);
          matrixTx = readF32(renderer, 16);
          matrixA = readF32(renderer);
          canvasHandle = readI32(renderer, 96);
          matrixB = readF32(renderer, 4);
          writeF64(scratch + 2272 | 0, readF32(renderer, 20));
          writeF64(scratch + 2264 | 0, matrixTx);
          writeF64(scratch + 2256 | 0, matrixD);
          writeF64(scratch + 2248 | 0, matrixC);
          writeF64(scratch + 2240 | 0, matrixB);
          writeI32(scratch, canvasHandle, 2224);
          writeF64(scratch, matrixA, 2232);
          const savedBits6 = canvasSetTransformAbi(scratch + 2224 | 0) | 0;
          void savedBits6;
        }
        canvasHandle = readI32(renderer, 96);
        writeI64(scratch + 2208 | 0, 0n);
        writeI64(scratch, 4627730092099895296n, 2200);
        writeI32(scratch, canvasHandle, 2192);
        const savedBits7 = canvasMoveToAbi(scratch + 2192 | 0) | 0;
        void savedBits7;
        drawBodyDone3: {
          if (+(readU8(renderer, 48) === 0)) {
            break drawBodyDone3;
          }
          writeU8(renderer, 0, 48);
          const resultOfCompareMemory2 = compareMemory(renderer + 24 | 0, renderer, 24);
          if (+(resultOfCompareMemory2 === 0)) {
            break drawBodyDone3;
          }
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer + 16 | 0), 40);
          writeI64(renderer, readI64(renderer + 8 | 0), 32);
          matrixC = readF32(renderer, 8);
          matrixD = readF32(renderer, 12);
          matrixTx = readF32(renderer, 16);
          matrixA = readF32(renderer);
          canvasHandle = readI32(renderer, 96);
          matrixB = readF32(renderer, 4);
          writeF64(scratch + 2176 | 0, readF32(renderer, 20));
          writeF64(scratch + 2168 | 0, matrixTx);
          writeF64(scratch + 2160 | 0, matrixD);
          writeF64(scratch + 2152 | 0, matrixC);
          writeF64(scratch + 2144 | 0, matrixB);
          writeI32(scratch, canvasHandle, 2128);
          writeF64(scratch, matrixA, 2136);
          const savedBits8 = canvasSetTransformAbi(scratch + 2128 | 0) | 0;
          void savedBits8;
        }
        canvasHandle = readI32(renderer, 96);
        writeI64(scratch + 2112 | 0, 4627730092099895296n);
        writeI64(scratch + 2104 | 0, 0n);
        writeI64(scratch + 2096 | 0, 4630122629401935872n);
        writeI64(scratch, 4624633867356078080n, 2088);
        writeI32(scratch, canvasHandle, 2080);
        const savedBits9 = canvasQuadraticCurveToAbi(scratch + 2080 | 0) | 0;
        void savedBits9;
        drawBodyDone4: {
          if (+(readU8(renderer, 48) === 0)) {
            break drawBodyDone4;
          }
          writeU8(renderer, 0, 48);
          const resultOfCompareMemory3 = compareMemory(renderer + 24 | 0, renderer, 24);
          if (+(resultOfCompareMemory3 === 0)) {
            break drawBodyDone4;
          }
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer + 16 | 0), 40);
          writeI64(renderer, readI64(renderer + 8 | 0), 32);
          matrixC = readF32(renderer, 8);
          matrixD = readF32(renderer, 12);
          matrixTx = readF32(renderer, 16);
          matrixA = readF32(renderer);
          canvasHandle = readI32(renderer, 96);
          matrixB = readF32(renderer, 4);
          writeF64(scratch + 2064 | 0, readF32(renderer, 20));
          writeF64(scratch + 2056 | 0, matrixTx);
          writeF64(scratch + 2048 | 0, matrixD);
          writeF64(scratch + 2040 | 0, matrixC);
          writeF64(scratch + 2032 | 0, matrixB);
          writeI32(scratch, canvasHandle, 2016);
          writeF64(scratch, matrixA, 2024);
          const savedBits10 = canvasSetTransformAbi(scratch + 2016 | 0) | 0;
          void savedBits10;
        }
        canvasHandle = readI32(renderer, 96);
        writeI64(scratch + 2e3 | 0, 0n);
        writeI64(scratch + 1992 | 0, -4595641944754880512n);
        writeI64(scratch + 1984 | 0, 4624633867356078080n);
        writeI64(scratch, -4595641944754880512n, 1976);
        writeI32(scratch, canvasHandle, 1968);
        const savedBits11 = canvasQuadraticCurveToAbi(scratch + 1968 | 0) | 0;
        void savedBits11;
        drawBodyDone5: {
          if (+(readU8(renderer, 48) === 0)) {
            break drawBodyDone5;
          }
          writeU8(renderer, 0, 48);
          const resultOfCompareMemory4 = compareMemory(renderer + 24 | 0, renderer, 24);
          if (+(resultOfCompareMemory4 === 0)) {
            break drawBodyDone5;
          }
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer + 16 | 0), 40);
          writeI64(renderer, readI64(renderer + 8 | 0), 32);
          matrixC = readF32(renderer, 8);
          matrixD = readF32(renderer, 12);
          matrixTx = readF32(renderer, 16);
          matrixA = readF32(renderer);
          canvasHandle = readI32(renderer, 96);
          matrixB = readF32(renderer, 4);
          writeF64(scratch + 1952 | 0, readF32(renderer, 20));
          writeF64(scratch + 1944 | 0, matrixTx);
          writeF64(scratch + 1936 | 0, matrixD);
          writeF64(scratch + 1928 | 0, matrixC);
          writeF64(scratch + 1920 | 0, matrixB);
          writeI32(scratch, canvasHandle, 1904);
          writeF64(scratch, matrixA, 1912);
          const savedBits12 = canvasSetTransformAbi(scratch + 1904 | 0) | 0;
          void savedBits12;
        }
        canvasHandle = readI32(renderer, 96);
        writeI64(scratch + 1888 | 0, -4595641944754880512n);
        writeI64(scratch + 1880 | 0, 0n);
        writeI64(scratch + 1872 | 0, -4593249407452839936n);
        writeI64(scratch, -4595641944754880512n, 1864);
        writeI32(scratch, canvasHandle, 1856);
        const savedBits13 = canvasQuadraticCurveToAbi(scratch + 1856 | 0) | 0;
        void savedBits13;
        drawBodyDone6: {
          if (+(readU8(renderer, 48) === 0)) {
            break drawBodyDone6;
          }
          writeU8(renderer, 0, 48);
          const resultOfCompareMemory5 = compareMemory(renderer + 24 | 0, renderer, 24);
          if (+(resultOfCompareMemory5 === 0)) {
            break drawBodyDone6;
          }
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer + 16 | 0), 40);
          writeI64(renderer, readI64(renderer + 8 | 0), 32);
          matrixC = readF32(renderer, 8);
          matrixD = readF32(renderer, 12);
          matrixTx = readF32(renderer, 16);
          matrixA = readF32(renderer);
          canvasHandle = readI32(renderer, 96);
          matrixB = readF32(renderer, 4);
          writeF64(scratch + 1840 | 0, readF32(renderer, 20));
          writeF64(scratch + 1832 | 0, matrixTx);
          writeF64(scratch + 1824 | 0, matrixD);
          writeF64(scratch + 1816 | 0, matrixC);
          writeF64(scratch + 1808 | 0, matrixB);
          writeI32(scratch, canvasHandle, 1792);
          writeF64(scratch, matrixA, 1800);
          const savedBits14 = canvasSetTransformAbi(scratch + 1792 | 0) | 0;
          void savedBits14;
        }
        canvasHandle = readI32(renderer, 96);
        writeI64(scratch + 1776 | 0, 0n);
        writeI64(scratch + 1768 | 0, 4627730092099895296n);
        writeI64(scratch + 1760 | 0, -4595641944754880512n);
        writeI64(scratch, 4625759767262920704n, 1752);
        writeI32(scratch, canvasHandle, 1744);
        const savedBits15 = canvasQuadraticCurveToAbi(scratch + 1744 | 0) | 0;
        void savedBits15;
        writeI32(scratch, readI32(renderer, 96), 1728);
        const savedBits16 = canvasClosePathAbi(scratch + 1728 | 0) | 0;
        void savedBits16;
        break drawBodyDone;
      }
      drawBodyDone7: {
        if (+(canvasHandle === 0)) {
          break drawBodyDone7;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory6 = compareMemory(renderer + 24 | 0, renderer, 24);
        if (+(resultOfCompareMemory6 === 0)) {
          break drawBodyDone7;
        }
        writeI64(renderer, readI64(renderer), 24);
        writeI64(renderer, readI64(renderer + 16 | 0), 40);
        writeI64(renderer, readI64(renderer + 8 | 0), 32);
        matrixC = readF32(renderer, 8);
        matrixD = readF32(renderer, 12);
        matrixTx = readF32(renderer, 16);
        matrixA = readF32(renderer);
        canvasHandle = readI32(renderer, 96);
        matrixB = readF32(renderer, 4);
        writeF64(scratch + 2400 | 0, readF32(renderer, 20));
        writeF64(scratch + 2392 | 0, matrixTx);
        writeF64(scratch + 2384 | 0, matrixD);
        writeF64(scratch + 2376 | 0, matrixC);
        writeF64(scratch + 2368 | 0, matrixB);
        writeI32(scratch, canvasHandle, 2352);
        writeF64(scratch, matrixA, 2360);
        const savedBits17 = canvasSetTransformAbi(scratch + 2352 | 0) | 0;
        void savedBits17;
      }
      canvasHandle = readI32(renderer, 96);
      writeI32(scratch + 2336 | 0, 0);
      writeI64(scratch + 2328 | 0, 4618760256179416344n);
      writeI64(scratch + 2320 | 0, 0n);
      writeI64(scratch + 2312 | 0, 4627730092099895296n);
      writeI64(scratch + 2304 | 0, 0n);
      writeI64(scratch, 0n, 2296);
      writeI32(scratch, canvasHandle, 2288);
      const savedBits18 = canvasArcAbi(scratch + 2288 | 0) | 0;
      void savedBits18;
    }
    fillAndStrokeCurrentPath(renderer);
  }
  /** Draw the decoration selected by appearance flag mask 4 and restore the drawing state. Original WAT 421680–422945. */
  function drawFlagFourDecoration(scratch, renderer, parameters) {
    let greenOrCanvasHandle = 0, blue = 0, savedState = 0, savedGreen = 0, savedBlue = 0, red = 0, canvasHandle = 0, matrixValueOrMixedChannel = 0, matrixValueOrChannelBase = 0, matrixValueOrZero = 0, zeroProduct = 0, zeroProductB = 0, luminance = 0, matrixCOrFlashAmountOrRed = 0;
    if (readU8(parameters) & 4) {
      writeI32(scratch, readI32(renderer, 96), 1712);
      const savedBits19 = canvasSaveAbi(scratch + 1712 | 0) | 0;
      void savedBits19;
      writeI64(scratch + 2600 | 0, readI64(renderer, 56));
      writeI64(scratch + 2592 | 0, readI64(renderer + 48 | 0));
      writeI64(scratch + 2584 | 0, readI64(renderer, 40));
      writeI64(scratch + 2576 | 0, readI64(renderer, 32));
      writeI64(scratch + 2568 | 0, readI64(renderer, 24));
      writeI64(scratch + 2560 | 0, readI64(renderer + 16 | 0));
      writeI64(scratch + 2552 | 0, readI64(renderer + 8 | 0));
      writeI64(scratch, readI64(renderer), 2544);
      writeU8(renderer, 1, 48);
      const savedRenderer = renderer;
      matrixValueOrMixedChannel = readF32(renderer);
      const savedMatrixValueOrMixedChannel = matrixValueOrMixedChannel;
      matrixCOrFlashAmountOrRed = readF32(renderer, 8);
      const resultOfF323 = f32(savedMatrixValueOrMixedChannel + f32(matrixCOrFlashAmountOrRed * 0));
      matrixValueOrZero = readF32(renderer, 16);
      zeroProduct = f32(matrixValueOrZero * 0);
      matrixValueOrChannelBase = f32(resultOfF323 + zeroProduct);
      const resultOfF324 = f32(matrixValueOrChannelBase * 6123234262925839e-32);
      zeroProductB = f32(matrixValueOrMixedChannel * 0);
      matrixValueOrMixedChannel = f32(f32(zeroProductB + matrixCOrFlashAmountOrRed) + zeroProduct);
      const resultOfF325 = f32(resultOfF324 - matrixValueOrMixedChannel);
      matrixCOrFlashAmountOrRed = f32(matrixValueOrZero + f32(zeroProductB + f32(matrixCOrFlashAmountOrRed * 6)));
      matrixValueOrZero = f32(matrixCOrFlashAmountOrRed * 0);
      writeF32(savedRenderer, f32(resultOfF325 + matrixValueOrZero));
      writeF32(renderer, f32(f32(matrixValueOrChannelBase + f32(matrixValueOrMixedChannel * 6123234262925839e-32)) + matrixValueOrZero), 8);
      writeF32(renderer, f32(matrixCOrFlashAmountOrRed + f32(f32(matrixValueOrChannelBase + matrixValueOrMixedChannel) * 0)), 16);
      const savedRenderer2 = renderer;
      matrixValueOrMixedChannel = readF32(renderer, 4);
      const savedMatrixValueOrMixedChannel2 = matrixValueOrMixedChannel;
      matrixCOrFlashAmountOrRed = readF32(renderer + 12 | 0);
      const resultOfF326 = f32(savedMatrixValueOrMixedChannel2 + f32(matrixCOrFlashAmountOrRed * 0));
      matrixValueOrZero = readF32(renderer + 20 | 0);
      zeroProduct = f32(matrixValueOrZero * 0);
      matrixValueOrChannelBase = f32(resultOfF326 + zeroProduct);
      const resultOfF327 = f32(matrixValueOrChannelBase * 6123234262925839e-32);
      zeroProductB = f32(matrixValueOrMixedChannel * 0);
      matrixValueOrMixedChannel = f32(f32(zeroProductB + matrixCOrFlashAmountOrRed) + zeroProduct);
      const resultOfF328 = f32(resultOfF327 - matrixValueOrMixedChannel);
      matrixCOrFlashAmountOrRed = f32(matrixValueOrZero + f32(zeroProductB + f32(matrixCOrFlashAmountOrRed * 6)));
      matrixValueOrZero = f32(matrixCOrFlashAmountOrRed * 0);
      writeF32(savedRenderer2, f32(resultOfF328 + matrixValueOrZero), 4);
      writeF32(renderer, f32(f32(matrixValueOrChannelBase + f32(matrixValueOrMixedChannel * 6123234262925839e-32)) + matrixValueOrZero), 12);
      writeF32(renderer, f32(matrixCOrFlashAmountOrRed + f32(f32(matrixValueOrChannelBase + matrixValueOrMixedChannel) * 0)), 20);
      if (readU8(renderer, 50)) {
        writeU8(renderer, 0, 50);
        writeI32(scratch, readI32(renderer, 96), 1696);
        const savedBits20 = canvasSetLineJoinRoundAbi(scratch + 1696 | 0) | 0;
        void savedBits20;
      }
      if (+(readU8(renderer, 49) !== 1)) {
        writeU8(renderer, 1, 49);
        writeI32(scratch, readI32(renderer, 96), 1680);
        const savedBits21 = canvasSetLineCapRoundAbi(scratch + 1680 | 0) | 0;
        void savedBits21;
      }
      let selectedValue14;
      drawFlagFourDecorationDone: {
        matrixCOrFlashAmountOrRed = readF32(parameters, 8);
        matrixValueOrChannelBase = f32(51 - f32(matrixCOrFlashAmountOrRed * 51));
        matrixValueOrMixedChannel = f32(matrixValueOrChannelBase + f32(matrixCOrFlashAmountOrRed * f32(readU8(parameters, 7) >>> 0)));
        if (+(matrixValueOrMixedChannel < 4294967296) & +(matrixValueOrMixedChannel >= 0)) {
          const resultOfTruncateInteger12 = truncateInteger(matrixValueOrMixedChannel, true);
          selectedValue14 = resultOfTruncateInteger12;
          break drawFlagFourDecorationDone;
        }
        selectedValue14 = 0;
      }
      blue = selectedValue14;
      savedBlue = blue;
      let selectedValue15;
      drawFlagFourDecorationDone2: {
        matrixValueOrMixedChannel = f32(matrixValueOrChannelBase + f32(matrixCOrFlashAmountOrRed * f32(readU8(parameters, 6) >>> 0)));
        if (+(matrixValueOrMixedChannel < 4294967296) & +(matrixValueOrMixedChannel >= 0)) {
          const resultOfTruncateInteger13 = truncateInteger(matrixValueOrMixedChannel, true);
          selectedValue15 = resultOfTruncateInteger13;
          break drawFlagFourDecorationDone2;
        }
        selectedValue15 = 0;
      }
      greenOrCanvasHandle = selectedValue15;
      savedGreen = greenOrCanvasHandle;
      let selectedValue16;
      drawFlagFourDecorationDone3: {
        matrixCOrFlashAmountOrRed = f32(matrixValueOrChannelBase + f32(matrixCOrFlashAmountOrRed * f32(readU8(parameters, 5) >>> 0)));
        if (+(matrixCOrFlashAmountOrRed < 4294967296) & +(matrixCOrFlashAmountOrRed >= 0)) {
          const resultOfTruncateInteger14 = truncateInteger(matrixCOrFlashAmountOrRed, true);
          selectedValue16 = resultOfTruncateInteger14;
          break drawFlagFourDecorationDone3;
        }
        selectedValue16 = 0;
      }
      savedState = selectedValue16;
      red = savedState;
      if (readU8(renderer, 69)) {
        let selectedValue17;
        drawFlagFourDecorationDone4: {
          luminance = (savedState >>> 0) * .2126 + (greenOrCanvasHandle >>> 0) * .7152 + (blue >>> 0) * .0722;
          if (+(luminance < 4294967296) & +(luminance >= 0)) {
            const resultOfTruncateInteger15 = truncateInteger(luminance, true);
            selectedValue17 = resultOfTruncateInteger15;
            break drawFlagFourDecorationDone4;
          }
          selectedValue17 = 0;
        }
        savedBlue = selectedValue17;
        savedGreen = savedBlue;
        red = savedGreen;
      }
      canvasHandle = readI32(renderer, 96);
      writeI32(scratch, savedBlue, 1676);
      writeI32(scratch, savedGreen, 1672);
      writeI32(scratch, red, 1668);
      writeI32(scratch, canvasHandle, 1664);
      const savedBits22 = canvasSetStrokeRgbAbi(scratch + 1664 | 0) | 0;
      void savedBits22;
      if (readU8(renderer, 69)) {
        let selectedValue18;
        drawFlagFourDecorationDone5: {
          luminance = (savedState >>> 0) * .2126 + (greenOrCanvasHandle >>> 0) * .7152 + (blue >>> 0) * .0722;
          if (+(luminance < 4294967296) & +(luminance >= 0)) {
            const resultOfTruncateInteger16 = truncateInteger(luminance, true);
            selectedValue18 = resultOfTruncateInteger16;
            break drawFlagFourDecorationDone5;
          }
          selectedValue18 = 0;
        }
        blue = selectedValue18;
        greenOrCanvasHandle = blue;
        savedState = greenOrCanvasHandle;
      }
      savedGreen = readI32(renderer, 96);
      writeI32(scratch, blue, 1660);
      writeI32(scratch, greenOrCanvasHandle, 1656);
      writeI32(scratch, savedState, 1652);
      writeI32(scratch, savedGreen, 1648);
      const savedBits23 = canvasSetFillRgbAbi(scratch + 1648 | 0) | 0;
      void savedBits23;
      greenOrCanvasHandle = readI32(renderer, 96);
      writeI64(scratch, 4613937818241073152n, 1640);
      writeI32(scratch, greenOrCanvasHandle, 1632);
      const savedBits24 = canvasSetLineWidthAbi(scratch + 1632 | 0) | 0;
      void savedBits24;
      writeI32(scratch, readI32(renderer, 96), 1616);
      const savedBits25 = canvasBeginPathAbi(scratch + 1616 | 0) | 0;
      void savedBits25;
      greenOrCanvasHandle = renderer + 24 | 0;
      drawFlagFourDecorationDone6: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone6;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory7 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory7 === 0)) {
          break drawFlagFourDecorationDone6;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        blue = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1600 | 0, readF32(renderer, 20));
        writeF64(scratch + 1592 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1584 | 0, zeroProduct);
        writeF64(scratch + 1576 | 0, matrixCOrFlashAmountOrRed);
        writeF64(scratch + 1568 | 0, matrixValueOrZero);
        writeI32(scratch, blue, 1552);
        writeF64(scratch, matrixValueOrMixedChannel, 1560);
        const savedBits26 = canvasSetTransformAbi(scratch + 1552 | 0) | 0;
        void savedBits26;
      }
      blue = readI32(renderer, 96);
      writeI64(scratch + 1536 | 0, -4606056518893174784n);
      writeI64(scratch, 4627730092099895296n, 1528);
      writeI32(scratch, blue, 1520);
      const savedBits27 = canvasMoveToAbi(scratch + 1520 | 0) | 0;
      void savedBits27;
      drawFlagFourDecorationDone7: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone7;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory8 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory8 === 0)) {
          break drawFlagFourDecorationDone7;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        blue = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1504 | 0, readF32(renderer, 20));
        writeF64(scratch + 1496 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1488 | 0, zeroProduct);
        writeF64(scratch + 1480 | 0, matrixCOrFlashAmountOrRed);
        writeF64(scratch + 1472 | 0, matrixValueOrZero);
        writeI32(scratch, blue, 1456);
        writeF64(scratch, matrixValueOrMixedChannel, 1464);
        const savedBits28 = canvasSetTransformAbi(scratch + 1456 | 0) | 0;
        void savedBits28;
      }
      blue = readI32(renderer, 96);
      writeI64(scratch + 1440 | 0, -4598738169498697728n);
      writeI64(scratch + 1432 | 0, 4632233691727265792n);
      writeI64(scratch + 1424 | 0, -4601552919265804288n);
      writeI64(scratch, 4630826316843712512n, 1416);
      writeI32(scratch, blue, 1408);
      const savedBits29 = canvasQuadraticCurveToAbi(scratch + 1408 | 0) | 0;
      void savedBits29;
      drawFlagFourDecorationDone8: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone8;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory9 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory9 === 0)) {
          break drawFlagFourDecorationDone8;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        blue = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1392 | 0, readF32(renderer, 20));
        writeF64(scratch + 1384 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1376 | 0, zeroProduct);
        writeF64(scratch + 1368 | 0, matrixCOrFlashAmountOrRed);
        writeF64(scratch + 1360 | 0, matrixValueOrZero);
        writeI32(scratch, blue, 1344);
        writeF64(scratch, matrixValueOrMixedChannel, 1352);
        const savedBits30 = canvasSetTransformAbi(scratch + 1344 | 0) | 0;
        void savedBits30;
      }
      blue = readI32(renderer, 96);
      writeI64(scratch + 1328 | 0, -4606056518893174784n);
      writeI64(scratch + 1320 | 0, 4627730092099895296n);
      writeI64(scratch + 1312 | 0, -4606056518893174784n);
      writeI64(scratch, 4630826316843712512n, 1304);
      writeI32(scratch, blue, 1296);
      const savedBits31 = canvasQuadraticCurveToAbi(scratch + 1296 | 0) | 0;
      void savedBits31;
      writeI32(scratch, readI32(renderer, 96), 1280);
      const savedBits32 = canvasClosePathAbi(scratch + 1280 | 0) | 0;
      void savedBits32;
      fillAndStrokeCurrentPath(renderer);
      writeI32(scratch, readI32(renderer, 96), 1264);
      const savedBits33 = canvasBeginPathAbi(scratch + 1264 | 0) | 0;
      void savedBits33;
      drawFlagFourDecorationDone9: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone9;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory10 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory10 === 0)) {
          break drawFlagFourDecorationDone9;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        blue = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1248 | 0, readF32(renderer, 20));
        writeF64(scratch + 1240 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1232 | 0, zeroProduct);
        writeF64(scratch + 1224 | 0, matrixCOrFlashAmountOrRed);
        writeF64(scratch + 1216 | 0, matrixValueOrZero);
        writeI32(scratch, blue, 1200);
        writeF64(scratch, matrixValueOrMixedChannel, 1208);
        const savedBits34 = canvasSetTransformAbi(scratch + 1200 | 0) | 0;
        void savedBits34;
      }
      blue = readI32(renderer, 96);
      writeI64(scratch + 1184 | 0, 4617315517961601024n);
      writeI64(scratch, 4627730092099895296n, 1176);
      writeI32(scratch, blue, 1168);
      const savedBits35 = canvasMoveToAbi(scratch + 1168 | 0) | 0;
      void savedBits35;
      drawFlagFourDecorationDone10: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone10;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory11 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory11 === 0)) {
          break drawFlagFourDecorationDone10;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        blue = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1152 | 0, readF32(renderer, 20));
        writeF64(scratch + 1144 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1136 | 0, zeroProduct);
        writeF64(scratch + 1128 | 0, matrixCOrFlashAmountOrRed);
        writeF64(scratch + 1120 | 0, matrixValueOrZero);
        writeI32(scratch, blue, 1104);
        writeF64(scratch, matrixValueOrMixedChannel, 1112);
        const savedBits36 = canvasSetTransformAbi(scratch + 1104 | 0) | 0;
        void savedBits36;
      }
      blue = scratch + 2544 | 0;
      savedState = readI32(renderer, 96);
      writeI64(scratch + 1088 | 0, 4624633867356078080n);
      writeI64(scratch + 1080 | 0, 4632233691727265792n);
      writeI64(scratch + 1072 | 0, 4621819117588971520n);
      writeI64(scratch, 4630826316843712512n, 1064);
      writeI32(scratch, savedState, 1056);
      const savedBits37 = canvasQuadraticCurveToAbi(scratch + 1056 | 0) | 0;
      void savedBits37;
      drawFlagFourDecorationDone11: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawFlagFourDecorationDone11;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory12 = compareMemory(greenOrCanvasHandle, renderer, 24);
        if (+(resultOfCompareMemory12 === 0)) {
          break drawFlagFourDecorationDone11;
        }
        writeI64(greenOrCanvasHandle, readI64(renderer));
        writeI64(greenOrCanvasHandle, readI64(renderer + 16 | 0), 16);
        writeI64(greenOrCanvasHandle, readI64(renderer + 8 | 0), 8);
        matrixCOrFlashAmountOrRed = readF32(renderer, 8);
        matrixValueOrChannelBase = readF32(renderer, 16);
        matrixValueOrMixedChannel = readF32(renderer);
        greenOrCanvasHandle = readI32(renderer, 96);
        matrixValueOrZero = readF32(renderer, 4);
        zeroProduct = readF32(renderer, 12);
        writeF64(scratch + 1040 | 0, readF32(renderer, 20));
        writeF64(scratch + 1032 | 0, matrixValueOrChannelBase);
        writeF64(scratch + 1024 | 0, zeroProduct);
        writeF64(scratch, matrixCOrFlashAmountOrRed, 1016);
        writeF64(scratch, matrixValueOrZero, 1008);
        writeI32(scratch, greenOrCanvasHandle, 992);
        writeF64(scratch, matrixValueOrMixedChannel, 1e3);
        const savedBits38 = canvasSetTransformAbi(scratch + 992 | 0) | 0;
        void savedBits38;
      }
      greenOrCanvasHandle = readI32(renderer, 96);
      writeI64(scratch, 4617315517961601024n, 976);
      writeI64(scratch, 4627730092099895296n, 968);
      writeI64(scratch, 4617315517961601024n, 960);
      writeI64(scratch, 4630826316843712512n, 952);
      writeI32(scratch, greenOrCanvasHandle, 944);
      const savedBits39 = canvasQuadraticCurveToAbi(scratch + 944 | 0) | 0;
      void savedBits39;
      writeI32(scratch, readI32(renderer, 96), 928);
      const savedBits40 = canvasClosePathAbi(scratch + 928 | 0) | 0;
      void savedBits40;
      fillAndStrokeCurrentPath(renderer);
      writeI64(renderer, readI64(blue, 56), 56);
      writeI64(renderer, readI64(blue, 48), 48);
      writeI64(renderer, readI64(blue, 40), 40);
      writeI64(renderer, readI64(blue, 32), 32);
      writeI64(renderer, readI64(blue, 24), 24);
      writeI64(renderer, readI64(blue, 16), 16);
      writeI64(renderer, readI64(blue, 8), 8);
      writeI64(renderer, readI64(blue));
      writeI32(scratch, readI32(renderer, 96), 912);
      const savedBits41 = canvasRestoreAbi(scratch + 912 | 0) | 0;
      void savedBits41;
    }
  }
  /** Store original pointers used by the eye renderer. Original WAT 422946–422971. */
  function prepareEyeContext(scratch, appearanceState, parameters) {
    writeI32(scratch, appearanceState, 2524);
    writeI32(scratch, scratch + 2616 | 0, 2532);
    writeI32(scratch, scratch + 2608 | 0, 2520);
    writeI32(scratch, scratch + 2615 | 0, 2516);
    writeI32(scratch, scratch + 2620 | 0, 2512);
    writeI32(scratch, parameters, 2528);
  }
  /** Save the canvas and the 64-byte software drawing state. Original WAT 422972–423032. */
  function saveFaceDrawingState(scratch, renderer) {
    let savedState = 0;
    writeI32(scratch, readI32(renderer, 96), 896);
    const savedBits42 = canvasSaveAbi(scratch + 896 | 0) | 0;
    void savedBits42;
    writeI64(scratch + 2600 | 0, readI64(renderer, 56));
    writeI64(scratch + 2592 | 0, readI64(renderer, 48));
    writeI64(scratch + 2584 | 0, readI64(renderer, 40));
    writeI64(scratch + 2576 | 0, readI64(renderer, 32));
    writeI64(scratch + 2568 | 0, readI64(renderer, 24));
    writeI64(scratch + 2560 | 0, readI64(renderer, 16));
    writeI64(scratch + 2552 | 0, readI64(renderer, 8));
    writeI64(scratch, readI64(renderer), 2544);
    savedState = scratch + 2544 | 0;
    return [ savedState ];
  }
  /** Smooth the first expression flag unless attack, defend, death or the extra action flag suppresses it. Original WAT 423033–423158. */
  function updateEyeExpression(scratch, appearanceState, parameters) {
    let blendFraction = 0, currentAmount = 0, eyeAmount = 0;
    const savedAppearanceState3 = appearanceState;
    let selectedValue19;
    updateEyeExpressionDone: {
      updateEyeExpressionDone2: {
        updateEyeExpressionDone3: {
          if (readU8(parameters, 2)) {
            break updateEyeExpressionDone3;
          }
          if (readU8(scratch, 2615)) {
            break updateEyeExpressionDone3;
          }
          if (readU8(parameters, 3)) {
            break updateEyeExpressionDone3;
          }
          if (+(readU8(parameters, 4) === 0)) {
            break updateEyeExpressionDone2;
          }
        }
        currentAmount = readF32(appearanceState, 20);
        if (+(Math.abs(currentAmount) < 1e-7)) {
          selectedValue19 = 0;
          break updateEyeExpressionDone;
        }
        void 0;
        const savedCurrentAmount3 = currentAmount;
        const resultOfPowF643 = powF64(.8, readF32(scratch, 2616) * .06);
        blendFraction = 1 - resultOfPowF643;
        const savedDifference = savedCurrentAmount3 - selectValue(0, Math.min(blendFraction, 1), +(blendFraction < 0)) * currentAmount;
        selectedValue19 = savedDifference;
        break updateEyeExpressionDone;
      }
      currentAmount = readF32(appearanceState, 20);
      if (readU8(parameters) & 1) {
        if (+(Math.abs(currentAmount + -1) < 1e-7)) {
          selectedValue19 = 1;
          break updateEyeExpressionDone;
        }
        void 1;
        const savedDifference2 = 1 - currentAmount;
        const resultOfPowF644 = powF64(.6, readF32(scratch, 2616) * .06);
        blendFraction = 1 - resultOfPowF644;
        const savedSum = savedDifference2 * selectValue(0, Math.min(blendFraction, 1), +(blendFraction < 0)) + currentAmount;
        selectedValue19 = savedSum;
        break updateEyeExpressionDone;
      }
      if (+(Math.abs(currentAmount) < 1e-7)) {
        selectedValue19 = 0;
        break updateEyeExpressionDone;
      }
      void 0;
      const savedCurrentAmount4 = currentAmount;
      const resultOfPowF645 = powF64(.8, readF32(scratch, 2616) * .06);
      blendFraction = 1 - resultOfPowF645;
      selectedValue19 = savedCurrentAmount4 - selectValue(0, Math.min(blendFraction, 1), +(blendFraction < 0)) * currentAmount;
    }
    eyeAmount = f32(selectedValue19);
    writeF32(savedAppearanceState3, eyeAmount, 20);
    return [ eyeAmount ];
  }
  /** Draw the polygonal expression or place each eye through the original eye renderer. Original WAT 423159–424165. */
  function drawEyes(scratch, model, eyeAmountOrMatrixC, appearanceState) {
    let rendererOrCanvasHandle = 0, rendererOrCanvasHandleB = 0, savedMatrixRow = 0, matrixOwner = 0, savedTranslation = 0, matrixTx = 0, matrixD = 0, matrixA = 0, matrixB = 0, matrixTy = 0, zeroProduct = 0, eyeCornerY = 0;
    drawEyesDone: {
      drawEyesDone2: {
        drawEyesDone3: {
          if (+(+(eyeAmountOrMatrixC < 1e-4) === 0)) {
            if (+(model === 1)) {
              break drawEyesDone3;
            }
            writeI32(scratch, readI32(readI32(scratch, 2620), 96), 880);
            const savedBits43 = canvasBeginPathAbi(scratch + 880 | 0) | 0;
            void savedBits43;
            drawEyesDone4: {
              rendererOrCanvasHandle = readI32(scratch, 2620);
              if (+(readU8(rendererOrCanvasHandle, 48) === 0)) {
                break drawEyesDone4;
              }
              writeU8(rendererOrCanvasHandle, 0, 48);
              const resultOfCompareMemory13 = compareMemory(rendererOrCanvasHandle + 24 | 0, rendererOrCanvasHandle, 24);
              if (+(resultOfCompareMemory13 === 0)) {
                break drawEyesDone4;
              }
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle), 24);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 16), 40);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 8), 32);
              eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 8);
              matrixD = readF32(rendererOrCanvasHandle, 12);
              matrixTx = readF32(rendererOrCanvasHandle, 16);
              matrixA = readF32(rendererOrCanvasHandle);
              rendererOrCanvasHandleB = readI32(rendererOrCanvasHandle, 96);
              matrixB = readF32(rendererOrCanvasHandle, 4);
              writeF64(scratch, readF32(rendererOrCanvasHandle, 20), 864);
              writeF64(scratch, matrixTx, 856);
              writeF64(scratch, matrixD, 848);
              writeF64(scratch, eyeAmountOrMatrixC, 840);
              writeF64(scratch, matrixB, 832);
              writeI32(scratch, rendererOrCanvasHandleB, 816);
              writeF64(scratch, matrixA, 824);
              const savedBits44 = canvasSetTransformAbi(scratch + 816 | 0) | 0;
              void savedBits44;
            }
            rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
            writeI64(scratch, -4599301119452119040n, 800);
            writeI64(scratch, -4599301119452119040n, 792);
            writeI32(scratch, rendererOrCanvasHandle, 784);
            const savedBits45 = canvasMoveToAbi(scratch + 784 | 0) | 0;
            void savedBits45;
            eyeCornerY = f32(f32(readF32(appearanceState, 20) * 9) + -14);
            drawEyesDone5: {
              rendererOrCanvasHandle = readI32(scratch, 2620);
              if (+(readU8(rendererOrCanvasHandle, 48) === 0)) {
                break drawEyesDone5;
              }
              writeU8(rendererOrCanvasHandle, 0, 48);
              const resultOfCompareMemory14 = compareMemory(rendererOrCanvasHandle + 24 | 0, rendererOrCanvasHandle, 24);
              if (+(resultOfCompareMemory14 === 0)) {
                break drawEyesDone5;
              }
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle), 24);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 16), 40);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 8), 32);
              eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 8);
              matrixD = readF32(rendererOrCanvasHandle, 12);
              matrixTx = readF32(rendererOrCanvasHandle, 16);
              matrixA = readF32(rendererOrCanvasHandle);
              rendererOrCanvasHandleB = readI32(rendererOrCanvasHandle, 96);
              matrixB = readF32(rendererOrCanvasHandle, 4);
              writeF64(scratch, readF32(rendererOrCanvasHandle, 20), 768);
              writeF64(scratch, matrixTx, 760);
              writeF64(scratch, matrixD, 752);
              writeF64(scratch, eyeAmountOrMatrixC, 744);
              writeF64(scratch, matrixB, 736);
              writeI32(scratch, rendererOrCanvasHandleB, 720);
              writeF64(scratch, matrixA, 728);
              const savedBits46 = canvasSetTransformAbi(scratch + 720 | 0) | 0;
              void savedBits46;
            }
            rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
            writeF64(scratch, eyeCornerY, 704);
            writeI64(scratch, 0n, 696);
            writeI32(scratch, rendererOrCanvasHandle, 688);
            const savedBits47 = canvasLineToAbi(scratch + 688 | 0) | 0;
            void savedBits47;
            drawEyesDone6: {
              rendererOrCanvasHandle = readI32(scratch, 2620);
              if (+(readU8(rendererOrCanvasHandle, 48) === 0)) {
                break drawEyesDone6;
              }
              writeU8(rendererOrCanvasHandle, 0, 48);
              const resultOfCompareMemory15 = compareMemory(rendererOrCanvasHandle + 24 | 0, rendererOrCanvasHandle, 24);
              if (+(resultOfCompareMemory15 === 0)) {
                break drawEyesDone6;
              }
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle), 24);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 16), 40);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 8), 32);
              eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 8);
              matrixD = readF32(rendererOrCanvasHandle, 12);
              matrixTx = readF32(rendererOrCanvasHandle, 16);
              matrixA = readF32(rendererOrCanvasHandle);
              rendererOrCanvasHandleB = readI32(rendererOrCanvasHandle, 96);
              matrixB = readF32(rendererOrCanvasHandle, 4);
              writeF64(scratch, readF32(rendererOrCanvasHandle, 20), 672);
              writeF64(scratch, matrixTx, 664);
              writeF64(scratch, matrixD, 656);
              writeF64(scratch, eyeAmountOrMatrixC, 648);
              writeF64(scratch, matrixB, 640);
              writeI32(scratch, rendererOrCanvasHandleB, 624);
              writeF64(scratch, matrixA, 632);
              const savedBits48 = canvasSetTransformAbi(scratch + 624 | 0) | 0;
              void savedBits48;
            }
            rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
            writeI64(scratch, -4599301119452119040n, 608);
            writeI64(scratch, 4624070917402656768n, 600);
            writeI32(scratch, rendererOrCanvasHandle, 592);
            const savedBits49 = canvasLineToAbi(scratch + 592 | 0) | 0;
            void savedBits49;
            drawEyesDone7: {
              rendererOrCanvasHandle = readI32(scratch, 2620);
              if (+(readU8(rendererOrCanvasHandle, 48) === 0)) {
                break drawEyesDone7;
              }
              writeU8(rendererOrCanvasHandle, 0, 48);
              const resultOfCompareMemory16 = compareMemory(rendererOrCanvasHandle + 24 | 0, rendererOrCanvasHandle, 24);
              if (+(resultOfCompareMemory16 === 0)) {
                break drawEyesDone7;
              }
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle), 24);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 16), 40);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 8), 32);
              eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 8);
              matrixD = readF32(rendererOrCanvasHandle, 12);
              matrixTx = readF32(rendererOrCanvasHandle, 16);
              matrixA = readF32(rendererOrCanvasHandle);
              rendererOrCanvasHandleB = readI32(rendererOrCanvasHandle, 96);
              matrixB = readF32(rendererOrCanvasHandle, 4);
              writeF64(scratch, readF32(rendererOrCanvasHandle, 20), 576);
              writeF64(scratch, matrixTx, 568);
              writeF64(scratch, matrixD, 560);
              writeF64(scratch, eyeAmountOrMatrixC, 552);
              writeF64(scratch, matrixB, 544);
              writeI32(scratch, rendererOrCanvasHandleB, 528);
              writeF64(scratch, matrixA, 536);
              const savedBits50 = canvasSetTransformAbi(scratch + 528 | 0) | 0;
              void savedBits50;
            }
            rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
            writeI64(scratch, 4618441417868443648n, 512);
            writeI64(scratch, 4624070917402656768n, 504);
            writeI32(scratch, rendererOrCanvasHandle, 496);
            const savedBits51 = canvasLineToAbi(scratch + 496 | 0) | 0;
            void savedBits51;
            drawEyesDone8: {
              rendererOrCanvasHandle = readI32(scratch, 2620);
              if (+(readU8(rendererOrCanvasHandle, 48) === 0)) {
                break drawEyesDone8;
              }
              writeU8(rendererOrCanvasHandle, 0, 48);
              const resultOfCompareMemory17 = compareMemory(rendererOrCanvasHandle + 24 | 0, rendererOrCanvasHandle, 24);
              if (+(resultOfCompareMemory17 === 0)) {
                break drawEyesDone8;
              }
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle), 24);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 16), 40);
              writeI64(rendererOrCanvasHandle, readI64(rendererOrCanvasHandle, 8), 32);
              eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 8);
              matrixD = readF32(rendererOrCanvasHandle, 12);
              matrixTx = readF32(rendererOrCanvasHandle, 16);
              matrixA = readF32(rendererOrCanvasHandle);
              rendererOrCanvasHandleB = readI32(rendererOrCanvasHandle, 96);
              matrixB = readF32(rendererOrCanvasHandle, 4);
              writeF64(scratch, readF32(rendererOrCanvasHandle, 20), 480);
              writeF64(scratch, matrixTx, 472);
              writeF64(scratch, matrixD, 464);
              writeF64(scratch, eyeAmountOrMatrixC, 456);
              writeF64(scratch, matrixB, 448);
              writeI32(scratch, rendererOrCanvasHandleB, 432);
              writeF64(scratch, matrixA, 440);
              const savedBits52 = canvasSetTransformAbi(scratch + 432 | 0) | 0;
              void savedBits52;
            }
            rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
            writeI64(scratch, 4618441417868443648n, 416);
            writeI64(scratch, -4599301119452119040n, 408);
            writeI32(scratch, rendererOrCanvasHandle, 400);
            const savedBits53 = canvasLineToAbi(scratch + 400 | 0) | 0;
            void savedBits53;
            writeI32(scratch, readI32(readI32(scratch, 2620), 96), 384);
            const savedBits54 = canvasClosePathAbi(scratch + 384 | 0) | 0;
            void savedBits54;
            writeI32(scratch, readI32(readI32(scratch, 2620), 96), 368);
            const savedBits55 = canvasClipAbi(scratch + 368 | 0) | 0;
            void savedBits55;
            break drawEyesDone2;
          }
          writeI32(appearanceState, 0, 20);
          if (+(model !== 1)) {
            break drawEyesDone2;
          }
        }
        savedMatrixRow = scratch + 2496 | 0;
        const savedSavedMatrixRow = savedMatrixRow;
        rendererOrCanvasHandle = readI32(scratch, 2620);
        matrixOwner = rendererOrCanvasHandle;
        writeI64(savedSavedMatrixRow, readI64(matrixOwner + 8 | 0));
        savedTranslation = scratch + 2504 | 0;
        writeI64(savedTranslation, readI64(rendererOrCanvasHandle, 16));
        writeI64(scratch, readI64(rendererOrCanvasHandle), 2488);
        writeU8(rendererOrCanvasHandle, 1, 48);
        const savedRendererOrCanvasHandle = rendererOrCanvasHandle;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle);
        const savedEyeAmountOrMatrixC = eyeAmountOrMatrixC;
        matrixD = readF32(matrixOwner, 8);
        const resultOfF329 = f32(savedEyeAmountOrMatrixC + f32(matrixD * 0));
        matrixB = readF32(rendererOrCanvasHandle, 16);
        matrixTy = f32(matrixB * 0);
        writeF32(savedRendererOrCanvasHandle, f32(resultOfF329 + matrixTy));
        const savedRendererOrCanvasHandle2 = rendererOrCanvasHandle;
        zeroProduct = readF32(rendererOrCanvasHandle, 20);
        const savedZeroProduct = zeroProduct;
        matrixTx = readF32(rendererOrCanvasHandle, 4);
        const savedMatrixTx = matrixTx;
        matrixA = readF32(rendererOrCanvasHandle, 12);
        writeF32(savedRendererOrCanvasHandle2, f32(savedZeroProduct - f32(f32(savedMatrixTx + matrixA) * 10)), 20);
        const savedRendererOrCanvasHandle3 = rendererOrCanvasHandle;
        const resultOfF3210 = f32(matrixA + f32(matrixTx * 0));
        zeroProduct = f32(zeroProduct * 0);
        writeF32(savedRendererOrCanvasHandle3, f32(resultOfF3210 + zeroProduct), 12);
        writeF32(rendererOrCanvasHandle, f32(f32(matrixTx + f32(matrixA * 0)) + zeroProduct), 4);
        writeF32(rendererOrCanvasHandle, f32(matrixB - f32(f32(eyeAmountOrMatrixC + matrixD) * 10)), 16);
        writeF32(matrixOwner, f32(f32(matrixD + f32(eyeAmountOrMatrixC * 0)) + matrixTy), 8);
        rendererOrCanvasHandleB = readI32(scratch, 2620);
        writeU8(rendererOrCanvasHandleB, 1, 48);
        const savedRendererOrCanvasHandleB = rendererOrCanvasHandleB;
        matrixTx = readF32(rendererOrCanvasHandleB, 16);
        const savedMatrixTx2 = matrixTx;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandleB);
        const savedEyeAmountOrMatrixC2 = eyeAmountOrMatrixC;
        matrixD = readF32(rendererOrCanvasHandleB, 8);
        writeF32(savedRendererOrCanvasHandleB, f32(savedMatrixTx2 + f32(f32(savedEyeAmountOrMatrixC2 + matrixD) * 0)), 16);
        const savedRendererOrCanvasHandleB2 = rendererOrCanvasHandleB;
        const resultOfF3211 = f32(f32(matrixD * -.9980267286300659) - f32(eyeAmountOrMatrixC * .06279052048921585));
        matrixTx = f32(matrixTx * 0);
        writeF32(savedRendererOrCanvasHandleB2, f32(resultOfF3211 + matrixTx), 8);
        writeF32(rendererOrCanvasHandleB, f32(f32(f32(matrixD * .06279052048921585) + f32(eyeAmountOrMatrixC * -.9980267286300659)) + matrixTx));
        const savedRendererOrCanvasHandleB3 = rendererOrCanvasHandleB;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandleB, 12);
        const resultOfF3212 = f32(eyeAmountOrMatrixC * -.9980267286300659);
        matrixD = readF32(rendererOrCanvasHandleB, 4);
        const resultOfF3213 = f32(resultOfF3212 - f32(matrixD * .06279052048921585));
        matrixTx = readF32(rendererOrCanvasHandleB, 20);
        matrixA = f32(matrixTx * 0);
        writeF32(savedRendererOrCanvasHandleB3, f32(resultOfF3213 + matrixA), 12);
        writeF32(rendererOrCanvasHandleB, f32(f32(f32(eyeAmountOrMatrixC * .06279052048921585) + f32(matrixD * -.9980267286300659)) + matrixA), 4);
        writeF32(rendererOrCanvasHandleB, f32(matrixTx + f32(f32(matrixD + eyeAmountOrMatrixC) * 0)), 20);
        drawEye(scratch + 2512 | 0, 0, 0, 0);
        writeI64(rendererOrCanvasHandle, readI64(savedTranslation), 16);
        writeI64(matrixOwner, readI64(savedMatrixRow), 8);
        writeI64(rendererOrCanvasHandle, readI64(scratch, 2488));
        writeU8(rendererOrCanvasHandle, 1, 48);
        const savedSavedTranslation = savedTranslation;
        rendererOrCanvasHandle = readI32(scratch, 2620);
        matrixOwner = rendererOrCanvasHandle;
        writeI64(savedSavedTranslation, readI64(matrixOwner + 16 | 0));
        writeI64(savedMatrixRow, readI64(rendererOrCanvasHandle, 8));
        writeI64(scratch, readI64(rendererOrCanvasHandle), 2488);
        writeU8(rendererOrCanvasHandle, 1, 48);
        const savedRendererOrCanvasHandle4 = rendererOrCanvasHandle;
        matrixB = readF32(rendererOrCanvasHandle, 20);
        const savedMatrixB = matrixB;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandle, 4);
        const resultOfF3214 = f32(eyeAmountOrMatrixC * 10);
        matrixD = readF32(rendererOrCanvasHandle, 12);
        writeF32(savedRendererOrCanvasHandle4, f32(savedMatrixB + f32(resultOfF3214 + f32(matrixD * 8))), 20);
        const savedMatrixOwner = matrixOwner;
        matrixTy = readF32(matrixOwner, 16);
        const savedMatrixTy = matrixTy;
        matrixTx = readF32(rendererOrCanvasHandle);
        const resultOfF3215 = f32(matrixTx * 10);
        matrixA = readF32(rendererOrCanvasHandle, 8);
        writeF32(savedMatrixOwner, f32(savedMatrixTy + f32(resultOfF3215 + f32(matrixA * 8))), 16);
        const savedRendererOrCanvasHandle5 = rendererOrCanvasHandle;
        const resultOfF3216 = f32(matrixD + f32(eyeAmountOrMatrixC * 0));
        matrixB = f32(matrixB * 0);
        writeF32(savedRendererOrCanvasHandle5, f32(resultOfF3216 + matrixB), 12);
        const savedRendererOrCanvasHandle6 = rendererOrCanvasHandle;
        const resultOfF3217 = f32(matrixA + f32(matrixTx * 0));
        matrixTy = f32(matrixTy * 0);
        writeF32(savedRendererOrCanvasHandle6, f32(resultOfF3217 + matrixTy), 8);
        writeF32(rendererOrCanvasHandle, f32(f32(eyeAmountOrMatrixC + f32(matrixD * 0)) + matrixB), 4);
        writeF32(rendererOrCanvasHandle, f32(f32(matrixTx + f32(matrixA * 0)) + matrixTy));
        rendererOrCanvasHandleB = readI32(scratch, 2620);
        writeU8(rendererOrCanvasHandleB, 1, 48);
        const savedRendererOrCanvasHandleB4 = rendererOrCanvasHandleB;
        matrixTx = readF32(rendererOrCanvasHandleB, 16);
        const savedMatrixTx3 = matrixTx;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandleB);
        const savedEyeAmountOrMatrixC3 = eyeAmountOrMatrixC;
        matrixD = readF32(rendererOrCanvasHandleB, 8);
        writeF32(savedRendererOrCanvasHandleB4, f32(savedMatrixTx3 + f32(f32(savedEyeAmountOrMatrixC3 + matrixD) * 0)), 16);
        const savedRendererOrCanvasHandleB5 = rendererOrCanvasHandleB;
        const resultOfF3218 = f32(f32(matrixD * .995561957359314) + f32(eyeAmountOrMatrixC * .09410831332206726));
        matrixTx = f32(matrixTx * 0);
        writeF32(savedRendererOrCanvasHandleB5, f32(resultOfF3218 + matrixTx), 8);
        writeF32(rendererOrCanvasHandleB, f32(f32(f32(eyeAmountOrMatrixC * .995561957359314) - f32(matrixD * .09410831332206726)) + matrixTx));
        const savedRendererOrCanvasHandleB6 = rendererOrCanvasHandleB;
        matrixTx = readF32(rendererOrCanvasHandleB, 20);
        const savedMatrixTx4 = matrixTx;
        eyeAmountOrMatrixC = readF32(rendererOrCanvasHandleB, 4);
        const savedEyeAmountOrMatrixC4 = eyeAmountOrMatrixC;
        matrixD = readF32(rendererOrCanvasHandleB, 12);
        writeF32(savedRendererOrCanvasHandleB6, f32(savedMatrixTx4 + f32(f32(savedEyeAmountOrMatrixC4 + matrixD) * 0)), 20);
        const savedRendererOrCanvasHandleB7 = rendererOrCanvasHandleB;
        const resultOfF3219 = f32(f32(matrixD * .995561957359314) + f32(eyeAmountOrMatrixC * .09410831332206726));
        matrixTx = f32(matrixTx * 0);
        writeF32(savedRendererOrCanvasHandleB7, f32(resultOfF3219 + matrixTx), 12);
        writeF32(rendererOrCanvasHandleB, f32(f32(f32(eyeAmountOrMatrixC * .995561957359314) - f32(matrixD * .09410831332206726)) + matrixTx), 4);
        drawEye(scratch + 2512 | 0, 0, 0, 1);
        writeI64(matrixOwner, readI64(savedTranslation), 16);
        writeI64(rendererOrCanvasHandle, readI64(savedMatrixRow), 8);
        writeI64(rendererOrCanvasHandle, readI64(scratch, 2488));
        writeU8(rendererOrCanvasHandle, 1, 48);
        break drawEyesDone;
      }
      drawEye(scratch + 2512 | 0, -7, -5, 0);
      drawEye(scratch + 2512 | 0, 7, -5, 1);
    }
  }
  /** Restore the face drawing state and canvas. Original WAT 424166–424208. */
  function restoreFaceDrawingState(scratch, savedState, renderer) {
    writeI64(renderer, readI64(savedState));
    writeI64(renderer, readI64(savedState, 56), 56);
    writeI64(renderer, readI64(savedState, 48), 48);
    writeI64(renderer, readI64(savedState, 40), 40);
    writeI64(renderer, readI64(savedState, 32), 32);
    writeI64(renderer, readI64(savedState, 24), 24);
    writeI64(renderer, readI64(savedState, 16), 16);
    writeI64(renderer, readI64(savedState, 8), 8);
    writeI32(scratch, readI32(renderer, 96), 352);
    const savedBits56 = canvasRestoreAbi(scratch + 352 | 0) | 0;
    void savedBits56;
  }
  /** Translate the mouth origin by ten units, retaining all expanded f32 affine products. Original WAT 424209–424287. */
  function translateMouth(scratch) {
    let matrixTx = 0, matrixD = 0, matrixA = 0, zeroProductA = 0, matrixB = 0, zeroProductB = 0, matrixTy = 0, zeroProductC = 0, renderer = 0, matrixC = 0;
    renderer = readI32(scratch, 2620);
    writeU8(renderer, 1, 48);
    const savedRenderer3 = renderer;
    matrixTx = readF32(renderer, 16);
    const savedMatrixTx5 = matrixTx;
    matrixA = readF32(renderer);
    zeroProductA = f32(matrixA * 0);
    const savedZeroProductA = zeroProductA;
    matrixC = readF32(renderer, 8);
    writeF32(savedRenderer3, f32(savedMatrixTx5 + f32(savedZeroProductA + f32(matrixC * 10))), 16);
    const savedRenderer4 = renderer;
    matrixB = readF32(renderer, 4);
    zeroProductB = f32(matrixB * 0);
    const savedZeroProductB = zeroProductB;
    matrixD = readF32(renderer, 12);
    const resultOfF3220 = f32(savedZeroProductB + matrixD);
    matrixTy = readF32(renderer, 20);
    zeroProductC = f32(matrixTy * 0);
    writeF32(savedRenderer4, f32(resultOfF3220 + zeroProductC), 12);
    const savedRenderer5 = renderer;
    const resultOfF3221 = f32(zeroProductA + matrixC);
    matrixTx = f32(matrixTx * 0);
    writeF32(savedRenderer5, f32(resultOfF3221 + matrixTx), 8);
    writeF32(renderer, f32(f32(matrixA + f32(matrixC * 0)) + matrixTx));
    writeF32(renderer, f32(matrixTy + f32(zeroProductB + f32(matrixD * 10))), 20);
    writeF32(renderer, f32(f32(matrixB + f32(matrixD * 0)) + zeroProductC), 4);
  }
  /** Draw the mouth geometry selected by appearance model one. Original WAT 424288–424458. */
  function drawAlternateModelMouth(scratch, model) {
    let matrixBOrZero = 0, matrixCOrD = 0, matrixD = 0, matrixTxOrZero = 0, matrixTy = 0, zeroProduct = 0, renderer = 0, matrixC = 0;
    if (+(model === 1)) {
      renderer = readI32(scratch, 2620);
      writeU8(renderer, 1, 48);
      const savedRenderer6 = renderer;
      matrixTxOrZero = readF32(renderer, 16);
      const savedMatrixTxOrZero = matrixTxOrZero;
      matrixC = readF32(renderer);
      const resultOfF3222 = f32(matrixC * -8);
      matrixCOrD = readF32(renderer, 8);
      writeF32(savedRenderer6, f32(savedMatrixTxOrZero + f32(resultOfF3222 - f32(matrixCOrD * 3))), 16);
      const savedRenderer7 = renderer;
      matrixBOrZero = readF32(renderer, 4);
      const resultOfF3223 = f32(matrixBOrZero * 0);
      matrixD = readF32(renderer, 12);
      const resultOfF3224 = f32(resultOfF3223 + matrixD);
      matrixTy = readF32(renderer, 20);
      zeroProduct = f32(matrixTy * 0);
      writeF32(savedRenderer7, f32(resultOfF3224 + zeroProduct), 12);
      const savedRenderer8 = renderer;
      const resultOfF3225 = f32(matrixCOrD + f32(matrixC * 0));
      matrixTxOrZero = f32(matrixTxOrZero * 0);
      writeF32(savedRenderer8, f32(resultOfF3225 + matrixTxOrZero), 8);
      writeF32(renderer, f32(f32(matrixC + f32(matrixCOrD * 0)) + matrixTxOrZero));
      writeF32(renderer, f32(matrixTy + f32(f32(matrixBOrZero * -8) - f32(matrixD * 3))), 20);
      writeF32(renderer, f32(f32(matrixBOrZero + f32(matrixD * 0)) + zeroProduct), 4);
      renderer = readI32(scratch, 2620);
      writeU8(renderer, 1, 48);
      const savedRenderer9 = renderer;
      matrixBOrZero = readF32(renderer, 16);
      const savedMatrixBOrZero = matrixBOrZero;
      matrixC = readF32(renderer);
      const savedMatrixC = matrixC;
      matrixCOrD = readF32(renderer, 8);
      writeF32(savedRenderer9, f32(savedMatrixBOrZero + f32(f32(savedMatrixC + matrixCOrD) * 0)), 16);
      const savedRenderer10 = renderer;
      const resultOfF3226 = f32(f32(matrixCOrD * .80901700258255) - f32(matrixC * .5877852439880371));
      matrixBOrZero = f32(matrixBOrZero * 0);
      writeF32(savedRenderer10, f32(resultOfF3226 + matrixBOrZero), 8);
      writeF32(renderer, f32(f32(f32(matrixC * .80901700258255) + f32(matrixCOrD * .5877852439880371)) + matrixBOrZero));
      const savedRenderer11 = renderer;
      matrixBOrZero = readF32(renderer, 20);
      const savedMatrixBOrZero2 = matrixBOrZero;
      matrixC = readF32(renderer, 4);
      const savedMatrixC2 = matrixC;
      matrixCOrD = readF32(renderer, 12);
      writeF32(savedRenderer11, f32(savedMatrixBOrZero2 + f32(f32(savedMatrixC2 + matrixCOrD) * 0)), 20);
      const savedRenderer12 = renderer;
      const resultOfF3227 = f32(f32(matrixCOrD * .80901700258255) - f32(matrixC * .5877852439880371));
      matrixBOrZero = f32(matrixBOrZero * 0);
      writeF32(savedRenderer12, f32(resultOfF3227 + matrixBOrZero), 12);
      writeF32(renderer, f32(f32(f32(matrixC * .80901700258255) + f32(matrixCOrD * .5877852439880371)) + matrixBOrZero), 4);
    }
  }
  /** Smooth the persistent mouth curve from the expression and death flags. Original WAT 424459–424526. */
  function updateMouthCurve(scratch, appearanceState, parameters) {
    let targetOrBlendFraction = 0, currentCurve = 0, expressionFlags = 0;
    targetOrBlendFraction = -5;
    updateMouthCurveDone: {
      if (readU8(parameters, 2)) {
        break updateMouthCurveDone;
      }
      if (readU8(scratch, 2615)) {
        break updateMouthCurveDone;
      }
      if (readU8(parameters, 3)) {
        break updateMouthCurveDone;
      }
      if (readU8(parameters, 4)) {
        break updateMouthCurveDone;
      }
      expressionFlags = readU8(parameters);
      if (expressionFlags & 1) {
        break updateMouthCurveDone;
      }
      targetOrBlendFraction = selectValue(-3, 5, expressionFlags & 2);
    }
    const savedAppearanceState4 = appearanceState;
    currentCurve = readF32(appearanceState, 16);
    let selectedValue20;
    if (+(Math.abs(currentCurve - targetOrBlendFraction) < 1e-7)) {
      selectedValue20 = targetOrBlendFraction;
    } else {
      const savedDifference3 = targetOrBlendFraction - currentCurve;
      const resultOfPowF646 = powF64(.6, readF32(scratch, 2616) * .06);
      targetOrBlendFraction = 1 - resultOfPowF646;
      selectedValue20 = savedDifference3 * selectValue(0, Math.min(targetOrBlendFraction, 1), +(targetOrBlendFraction < 0)) + currentCurve;
    }
    writeF32(savedAppearanceState4, f32(selectedValue20), 16);
  }
  /** Draw the mouth quadratic curve with grayscale outline and exact transform synchronization. Original WAT 424527–424972. */
  function drawMouth(scratch, appearanceState) {
    let rendererOrCanvasHandle = 0, matrixTx = 0, matrixD = 0, matrixA = 0, matrixB = 0, curveControlY = 0, rendererOrBlueOrCanvasHandle = 0, matrixC = 0, canvasHandleOrGreen = 0;
    writeI32(scratch, readI32(readI32(scratch, 2620), 96), 336);
    const savedBits57 = canvasBeginPathAbi(scratch + 336 | 0) | 0;
    void savedBits57;
    drawMouthDone: {
      rendererOrBlueOrCanvasHandle = readI32(scratch, 2620);
      if (+(readU8(rendererOrBlueOrCanvasHandle, 48) === 0)) {
        break drawMouthDone;
      }
      writeU8(rendererOrBlueOrCanvasHandle, 0, 48);
      const resultOfCompareMemory18 = compareMemory(rendererOrBlueOrCanvasHandle + 24 | 0, rendererOrBlueOrCanvasHandle, 24);
      if (+(resultOfCompareMemory18 === 0)) {
        break drawMouthDone;
      }
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle), 24);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle, 16), 40);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle, 8), 32);
      matrixC = readF32(rendererOrBlueOrCanvasHandle, 8);
      matrixD = readF32(rendererOrBlueOrCanvasHandle, 12);
      matrixTx = readF32(rendererOrBlueOrCanvasHandle, 16);
      matrixA = readF32(rendererOrBlueOrCanvasHandle);
      canvasHandleOrGreen = readI32(rendererOrBlueOrCanvasHandle, 96);
      matrixB = readF32(rendererOrBlueOrCanvasHandle, 4);
      writeF64(scratch, readF32(rendererOrBlueOrCanvasHandle, 20), 320);
      writeF64(scratch, matrixTx, 312);
      writeF64(scratch, matrixD, 304);
      writeF64(scratch, matrixC, 296);
      writeF64(scratch, matrixB, 288);
      writeI32(scratch, canvasHandleOrGreen, 272);
      writeF64(scratch, matrixA, 280);
      const savedBits58 = canvasSetTransformAbi(scratch + 272 | 0) | 0;
      void savedBits58;
    }
    rendererOrBlueOrCanvasHandle = readI32(rendererOrBlueOrCanvasHandle, 96);
    writeI64(scratch, 0n, 256);
    writeI64(scratch, -4604930618986332160n, 248);
    writeI32(scratch, rendererOrBlueOrCanvasHandle, 240);
    const savedBits59 = canvasMoveToAbi(scratch + 240 | 0) | 0;
    void savedBits59;
    curveControlY = readF32(appearanceState, 16);
    drawMouthDone2: {
      rendererOrBlueOrCanvasHandle = readI32(scratch, 2620);
      if (+(readU8(rendererOrBlueOrCanvasHandle, 48) === 0)) {
        break drawMouthDone2;
      }
      writeU8(rendererOrBlueOrCanvasHandle, 0, 48);
      const resultOfCompareMemory19 = compareMemory(rendererOrBlueOrCanvasHandle + 24 | 0, rendererOrBlueOrCanvasHandle, 24);
      if (+(resultOfCompareMemory19 === 0)) {
        break drawMouthDone2;
      }
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle), 24);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle, 16), 40);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle, 8), 32);
      matrixC = readF32(rendererOrBlueOrCanvasHandle, 8);
      matrixD = readF32(rendererOrBlueOrCanvasHandle, 12);
      matrixTx = readF32(rendererOrBlueOrCanvasHandle, 16);
      matrixA = readF32(rendererOrBlueOrCanvasHandle);
      appearanceState = readI32(rendererOrBlueOrCanvasHandle, 96);
      matrixB = readF32(rendererOrBlueOrCanvasHandle, 4);
      writeF64(scratch, readF32(rendererOrBlueOrCanvasHandle, 20), 224);
      writeF64(scratch, matrixTx, 216);
      writeF64(scratch, matrixD, 208);
      writeF64(scratch, matrixC, 200);
      writeF64(scratch, matrixB, 192);
      writeI32(scratch, appearanceState, 176);
      writeF64(scratch, matrixA, 184);
      const savedBits60 = canvasSetTransformAbi(scratch + 176 | 0) | 0;
      void savedBits60;
    }
    rendererOrBlueOrCanvasHandle = readI32(rendererOrBlueOrCanvasHandle, 96);
    writeI64(scratch, 0n, 160);
    writeI64(scratch, 4618441417868443648n, 152);
    writeF64(scratch, curveControlY, 144);
    writeI64(scratch, 0n, 136);
    writeI32(scratch, rendererOrBlueOrCanvasHandle, 128);
    const savedBits61 = canvasQuadraticCurveToAbi(scratch + 128 | 0) | 0;
    void savedBits61;
    rendererOrBlueOrCanvasHandle = readU8(scratch, 2610);
    canvasHandleOrGreen = readU8(scratch, 2609);
    appearanceState = readU8(scratch, 2608);
    rendererOrCanvasHandle = readI32(scratch, 2620);
    if (readU8(rendererOrCanvasHandle, 69)) {
      let selectedValue21;
      drawMouthDone3: {
        curveControlY = ((appearanceState & 255) >>> 0) * .2126 + ((canvasHandleOrGreen & 255) >>> 0) * .7152 + ((rendererOrBlueOrCanvasHandle & 255) >>> 0) * .0722;
        if (+(curveControlY < 4294967296) & +(curveControlY >= 0)) {
          const resultOfTruncateInteger17 = truncateInteger(curveControlY, true);
          selectedValue21 = resultOfTruncateInteger17;
          break drawMouthDone3;
        }
        selectedValue21 = 0;
      }
      rendererOrBlueOrCanvasHandle = selectedValue21;
      canvasHandleOrGreen = rendererOrBlueOrCanvasHandle;
      appearanceState = canvasHandleOrGreen;
    }
    rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
    writeI32(scratch, rendererOrBlueOrCanvasHandle & 255, 124);
    writeI32(scratch, canvasHandleOrGreen & 255, 120);
    writeI32(scratch, appearanceState & 255, 116);
    writeI32(scratch, rendererOrCanvasHandle, 112);
    const savedBits62 = canvasSetStrokeRgbAbi(scratch + 112 | 0) | 0;
    void savedBits62;
    writeI32(scratch, readI32(readI32(scratch, 2620), 96), 96);
    writeI64(scratch, 4609434218613702656n, 104);
    const savedBits63 = canvasSetLineWidthAbi(scratch + 96 | 0) | 0;
    void savedBits63;
    rendererOrBlueOrCanvasHandle = readI32(scratch, 2620);
    if (+(readU8(rendererOrBlueOrCanvasHandle, 49) !== 1)) {
      writeU8(rendererOrBlueOrCanvasHandle, 1, 49);
      writeI32(scratch, readI32(rendererOrBlueOrCanvasHandle, 96), 80);
      const savedBits64 = canvasSetLineCapRoundAbi(scratch + 80 | 0) | 0;
      void savedBits64;
      rendererOrBlueOrCanvasHandle = readI32(scratch, 2620);
    }
    drawMouthDone4: {
      if (+(readU8(rendererOrBlueOrCanvasHandle, 48) === 0)) {
        break drawMouthDone4;
      }
      writeU8(rendererOrBlueOrCanvasHandle, 0, 48);
      const resultOfCompareMemory20 = compareMemory(rendererOrBlueOrCanvasHandle + 24 | 0, rendererOrBlueOrCanvasHandle, 24);
      if (+(resultOfCompareMemory20 === 0)) {
        break drawMouthDone4;
      }
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle), 24);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle + 16 | 0), 40);
      writeI64(rendererOrBlueOrCanvasHandle, readI64(rendererOrBlueOrCanvasHandle + 8 | 0), 32);
      matrixC = readF32(rendererOrBlueOrCanvasHandle, 8);
      matrixD = readF32(rendererOrBlueOrCanvasHandle, 12);
      matrixTx = readF32(rendererOrBlueOrCanvasHandle, 16);
      matrixA = readF32(rendererOrBlueOrCanvasHandle);
      appearanceState = readI32(rendererOrBlueOrCanvasHandle, 96);
      matrixB = readF32(rendererOrBlueOrCanvasHandle, 4);
      writeF64(scratch - -64 | 0, readF32(rendererOrBlueOrCanvasHandle, 20));
      writeF64(scratch, matrixTx, 56);
      writeF64(scratch, matrixD, 48);
      writeF64(scratch, matrixC, 40);
      writeF64(scratch, matrixB, 32);
      writeI32(scratch, appearanceState, 16);
      writeF64(scratch, matrixA, 24);
      const savedBits65 = canvasSetTransformAbi(scratch + 16 | 0) | 0;
      void savedBits65;
    }
    writeI32(scratch, readI32(rendererOrBlueOrCanvasHandle, 96));
    const savedBits66 = canvasStrokeAbi(scratch) | 0;
    void savedBits66;
  }
  return Object.freeze({
    1100: drawPlayerAppearance
  });
}
