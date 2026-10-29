/** Complete direct source recovery of client component renderer 1044.
 * Component identity remains its entity slot (+148), pending stronger evidence.
 * Original client SHA-256: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([1044]);
const f32 = Math.fround;
// Store the original double bits directly: these ABI records are also visible
// to host callbacks and to renderers whose state aliases the scratch frame.
const F64_BITS = Object.freeze({
  MINUS_NINE: -4602115869219225600n, // -9.0
  MINUS_TWENTY_FIVE: -4595641944754880512n, // -25.0
  MINUS_THIRTY_SEVEN: -4592967932476129280n, // -37.0
  ZERO: 0n, // 0.0
  THREE: 4613937818241073152n, // 3.0
  FIVE: 4617315517961601024n, // 5.0
  TWO_PI: 4618760256179416344n, // 6.283185307179586
  NINE: 4621256167635550208n, // 9.0
  TWENTY: 4626322717216342016n, // 20.0
  TWENTY_FIVE: 4627730092099895296n, // 25.0
  THIRTY: 4629137466983448576n, // 30.0
  THIRTY_FIVE: 4630122629401935872n, // 35.0
  FORTY: 4630826316843712512n, // 40.0
});
export function createComponent148RendererHooks(runtime) {
  const compareMemory = (...args) => runtime.call(366, ...args);
  const readClock = (...args) => runtime.call(372, ...args);
  const roundF64 = (...args) => runtime.call(373, ...args);
  const fillAndStrokeCurrentPath = (...args) => runtime.call(395, ...args);
  const fillRectangle = (...args) => runtime.call(410, ...args);
  const canvasSetLineWidthAbi = argumentPointer => +runtime.host('a', 'a', 138111, 93028, argumentPointer);
  const canvasSetLineJoinRoundAbi = argumentPointer => +runtime.host('a', 'a', 138811, 31967, argumentPointer);
  const canvasSetLineCapRoundAbi = argumentPointer => +runtime.host('a', 'a', 138730, 31967, argumentPointer);
  const canvasSetFillRgbAbi = argumentPointer => +runtime.host('a', 'a', 137186, 32170, argumentPointer);
  const canvasSetStrokeRgbAbi = argumentPointer => +runtime.host('a', 'a', 137456, 32170, argumentPointer);
  const canvasBeginPathAbi = argumentPointer => +runtime.host('a', 'a', 136878, 31967, argumentPointer);
  const canvasSetTransformAbi = argumentPointer => +runtime.host('a', 'a', 136414, 32144, argumentPointer);
  const canvasMoveToAbi = argumentPointer => +runtime.host('a', 'a', 137806, 32166, argumentPointer);
  const canvasLineToAbi = argumentPointer => +runtime.host('a', 'a', 137843, 32166, argumentPointer);
  const canvasClosePathAbi = argumentPointer => +runtime.host('a', 'a', 136912, 31967, argumentPointer);
  const canvasEllipseAbi = argumentPointer => +runtime.host('a', 'a', 138047, 32191, argumentPointer);
  const canvasFillAbi = argumentPointer => +runtime.host('a', 'a', 136661, 31967, argumentPointer);
  const canvasSaveAbi = argumentPointer => +runtime.host('a', 'a', 136300, 31967, argumentPointer);
  const canvasClipAbi = argumentPointer => +runtime.host('a', 'a', 136807, 31967, argumentPointer);
  const canvasRestoreAbi = argumentPointer => +runtime.host('a', 'a', 136329, 31967, argumentPointer);
  const canvasStrokeAbi = argumentPointer => +runtime.host('a', 'a', 136732, 31967, argumentPointer);
  const canvasQuadraticCurveToAbi = argumentPointer => +runtime.host('a', 'a', 137880, 32160, argumentPointer);
  const canvasArcAbi = argumentPointer => +runtime.host('a', 'a', 137995, 32183, argumentPointer);
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
  const selectValue = (first, second, condition) => condition ? first : second;
  // The 1504-byte scratch layout is part of the ABI. Its bytes and the stack
  // pointer are deliberately retained when a Canvas host callback throws.
  function drawComponent148(component, renderer) {
    component |= 0;
    renderer |= 0;
    const scratch = (runtime.stackPointer.value - 1504) | 0;
    runtime.stackPointer.value = scratch;
    configureLineStyle(scratch, renderer);
    const colors = resolveComponentColors(scratch, component);
    const { darkBlueF64, darkGreenF64 } = applyDarkFillAndOutline(
      scratch, colors.darkRed, colors.darkGreen, colors.darkBlue,
      colors.darkRedF64, renderer
    );
    drawTriangle(scratch, renderer);
    drawFilledEllipse(scratch, colors.lightGreen, colors.lightBlue, renderer);
    drawClippedStripes(scratch, colors.darkRed, colors.darkGreen, colors.darkBlue,
      colors.darkRedF64, darkBlueF64, darkGreenF64, renderer);
    strokeEllipse(scratch, colors.outlineRed, colors.outlineBlue, colors.outlineGreen, renderer);
    applyCurveColors(scratch, colors.darkRed, colors.darkGreen, colors.darkBlue,
      colors.darkRedF64, darkBlueF64, darkGreenF64, renderer);
    drawSideCurvesAndEndpoints(scratch, renderer);
    runtime.stackPointer.value = (scratch + 1504) | 0;
  }

  /** Set line width, round joins and round caps. Original WAT 288668–288721. */
  function configureLineStyle(scratch, renderer) {
    let canvasHandle = 0;
    canvasHandle = readI32(renderer, 96);
    writeI64(scratch, F64_BITS.FIVE, 1416);
    writeI32(scratch, canvasHandle, 1408);
    const savedBits = (canvasSetLineWidthAbi(((scratch + 1408) | 0)) | 0);
    void savedBits;
    if (readU8(renderer, 50)) {
      writeU8(renderer, 0, 50);
      writeI32(scratch, readI32(renderer, 96), 1392);
      const savedBits2 = (canvasSetLineJoinRoundAbi(((scratch + 1392) | 0)) | 0);
      void savedBits2;
    }
    if (+(readU8(renderer, 49) !== 1)) {
      writeU8(renderer, 1, 49);
      writeI32(scratch, readI32(renderer, 96), 1376);
      const savedBits3 = (canvasSetLineCapRoundAbi(((scratch + 1376) | 0)) | 0);
      void savedBits3;
    }
  }

  /** Resolve the three palettes and their independently sampled hit flashes. Original WAT 288722–289259. */
  // Each clock sample can run host code. Preserve all six conditional samples
  // and the validity reads between them instead of caching a single flash value.
  function resolveComponentColors(scratch, lightBlueOrFlashColor) {
    let outlineRedOrFlashValid = 0, outlineGreenOrFlashValid = 0, flashFraction = 0;
    let entityOrFlashValid = 0, visual = 0, darkRed = 0, redChannel = 0, darkGreen = 0, darkBlue = 0, outlineBlue = 0, lightGreen = 0, blendedChannel = 0, baseWeight = 0, flashAmountOrDarkRedF64 = 0;
    let selectedChannelOrFlash1;
    resolveComponentColorsDone: {
      entityOrFlashValid = readI32(lightBlueOrFlashColor);
      if (+(entityOrFlashValid === 0)) {
        outlineRedOrFlashValid = 211;
        outlineBlue = 70;
        darkRed = 51;
        lightBlueOrFlashColor = 99;
        lightGreen = 231;
        darkGreen = 51;
        darkBlue = 51;
        selectedChannelOrFlash1 = 189; break resolveComponentColorsDone;
      }
      lightBlueOrFlashColor = 16711680;
      resolveComponentColorsDone2: {
        visual = readI32(entityOrFlashValid, 136);
        if (+(readU8(visual, 56) === 0)) {
          break resolveComponentColorsDone2;
        }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash2;
        resolveComponentColorsDone3: {
          entityOrFlashValid = readU8(visual, 56);
          if (+(entityOrFlashValid === 0)) { selectedChannelOrFlash2 = Infinity; break resolveComponentColorsDone3; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash2 = -Infinity; break resolveComponentColorsDone3; }
          selectedChannelOrFlash2 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash2;
        flashFraction = f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0)));
        if (+(entityOrFlashValid === 0)) { break resolveComponentColorsDone2; }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash3;
        resolveComponentColorsDone4: {
          outlineRedOrFlashValid = readU8(visual, 56);
          if (+(outlineRedOrFlashValid === 0)) { selectedChannelOrFlash3 = Infinity; break resolveComponentColorsDone4; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash3 = -Infinity; break resolveComponentColorsDone4; }
          selectedChannelOrFlash3 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash3;
        lightBlueOrFlashColor = selectValue(16777215, 16711680, +(f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0))) >= 0.9));
      }
      let selectedChannelOrFlash4;
      resolveComponentColorsDone5: {
        const resultOfF32 = f32((flashFraction * 255.0));
        baseWeight = f32((51.0 - f32((flashFraction * 51.0))));
        blendedChannel = f32((resultOfF32 + baseWeight));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash4 = resultOfTruncateInteger; break resolveComponentColorsDone5;
        }
        selectedChannelOrFlash4 = 0;
      }
      darkRed = selectedChannelOrFlash4;
      let selectedChannelOrFlash5;
      resolveComponentColorsDone6: {
        blendedChannel = f32((baseWeight + f32((flashFraction * f32(((lightBlueOrFlashColor & 255) >>> 0))))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger2 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash5 = resultOfTruncateInteger2; break resolveComponentColorsDone6;
        }
        selectedChannelOrFlash5 = 0;
      }
      darkBlue = selectedChannelOrFlash5;
      let selectedChannelOrFlash6;
      resolveComponentColorsDone7: {
        flashFraction = f32((baseWeight + f32((flashFraction * f32(((((lightBlueOrFlashColor >>> 8) | 0) & 255) >>> 0))))));
        if ((+(flashFraction < 4294967296.0) & +(flashFraction >= 0.0))) {
          const resultOfTruncateInteger3 = truncateInteger(flashFraction, true);
          selectedChannelOrFlash6 = resultOfTruncateInteger3; break resolveComponentColorsDone7;
        }
        selectedChannelOrFlash6 = 0;
      }
      darkGreen = selectedChannelOrFlash6;
      entityOrFlashValid = 16711680;
      resolveComponentColorsDone8: {
        if (+(outlineRedOrFlashValid === 0)) {
          flashFraction = 0.0;
          break resolveComponentColorsDone8;
        }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash7;
        resolveComponentColorsDone9: {
          lightBlueOrFlashColor = readU8(visual, 56);
          if (+(lightBlueOrFlashColor === 0)) { selectedChannelOrFlash7 = Infinity; break resolveComponentColorsDone9; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash7 = -Infinity; break resolveComponentColorsDone9; }
          selectedChannelOrFlash7 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash7;
        flashFraction = f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0)));
        if (+(lightBlueOrFlashColor === 0)) { break resolveComponentColorsDone8; }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash8;
        resolveComponentColorsDone10: {
          outlineGreenOrFlashValid = readU8(visual, 56);
          if (+(outlineGreenOrFlashValid === 0)) { selectedChannelOrFlash8 = Infinity; break resolveComponentColorsDone10; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash8 = -Infinity; break resolveComponentColorsDone10; }
          selectedChannelOrFlash8 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash8;
        entityOrFlashValid = selectValue(16777215, 16711680, +(f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0))) >= 0.9));
      }
      let selectedChannelOrFlash9;
      resolveComponentColorsDone11: {
        blendedChannel = f32((1.0 - flashFraction));
        baseWeight = f32((f32((blendedChannel * 99.0)) + f32((flashFraction * f32(((entityOrFlashValid & 255) >>> 0))))));
        if ((+(baseWeight < 4294967296.0) & +(baseWeight >= 0.0))) {
          const resultOfTruncateInteger4 = truncateInteger(baseWeight, true);
          selectedChannelOrFlash9 = resultOfTruncateInteger4; break resolveComponentColorsDone11;
        }
        selectedChannelOrFlash9 = 0;
      }
      lightBlueOrFlashColor = selectedChannelOrFlash9;
      let selectedChannelOrFlash10;
      resolveComponentColorsDone12: {
        flashFraction = f32((f32((blendedChannel * 231.0)) + f32((flashFraction * f32(((((entityOrFlashValid >>> 8) | 0) & 255) >>> 0))))));
        if ((+(flashFraction < 4294967296.0) & +(flashFraction >= 0.0))) {
          const resultOfTruncateInteger5 = truncateInteger(flashFraction, true);
          selectedChannelOrFlash10 = resultOfTruncateInteger5; break resolveComponentColorsDone12;
        }
        selectedChannelOrFlash10 = 0;
      }
      lightGreen = selectedChannelOrFlash10;
      entityOrFlashValid = 16711680;
      resolveComponentColorsDone13: {
        if (+(outlineGreenOrFlashValid === 0)) {
          flashFraction = 0.0;
          break resolveComponentColorsDone13;
        }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash11;
        resolveComponentColorsDone14: {
          redChannel = readU8(visual, 56);
          if (+(redChannel === 0)) { selectedChannelOrFlash11 = Infinity; break resolveComponentColorsDone14; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash11 = -Infinity; break resolveComponentColorsDone14; }
          selectedChannelOrFlash11 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash11;
        flashFraction = f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0)));
        if (+(redChannel === 0)) { break resolveComponentColorsDone13; }
        readClock(((scratch + 1432) | 0));
        let selectedChannelOrFlash12;
        resolveComponentColorsDone15: {
          if (+(readU8(visual, 56) === 0)) { selectedChannelOrFlash12 = Infinity; break resolveComponentColorsDone15; }
          if (+(readU8(scratch, 1432) === 0)) { selectedChannelOrFlash12 = -Infinity; break resolveComponentColorsDone15; }
          selectedChannelOrFlash12 = (((readF64(((visual - -64) | 0)) - readF64(scratch, 1440)) * 0.006666666666666667) + 1.0);
        }
        flashAmountOrDarkRedF64 = selectedChannelOrFlash12;
        entityOrFlashValid = selectValue(16777215, 16711680, +(f32(selectValue(0.0, Math.min(flashAmountOrDarkRedF64, 1.0), +(flashAmountOrDarkRedF64 < 0.0))) >= 0.9));
      }
      let selectedChannelOrFlash13;
      resolveComponentColorsDone16: {
        const resultOfF322 = f32((flashFraction * 255.0));
        baseWeight = f32((1.0 - flashFraction));
        blendedChannel = f32((resultOfF322 + f32((baseWeight * 211.0))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger6 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash13 = resultOfTruncateInteger6; break resolveComponentColorsDone16;
        }
        selectedChannelOrFlash13 = 0;
      }
      outlineRedOrFlashValid = selectedChannelOrFlash13;
      let selectedChannelOrFlash14;
      resolveComponentColorsDone17: {
        blendedChannel = f32((f32((baseWeight * 70.0)) + f32((flashFraction * f32(((entityOrFlashValid & 255) >>> 0))))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger7 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash14 = resultOfTruncateInteger7; break resolveComponentColorsDone17;
        }
        selectedChannelOrFlash14 = 0;
      }
      outlineBlue = selectedChannelOrFlash14;
      flashFraction = f32((f32((baseWeight * 189.0)) + f32((flashFraction * f32(((((entityOrFlashValid >>> 8) | 0) & 255) >>> 0))))));
      if ((+(flashFraction < 4294967296.0) & +(flashFraction >= 0.0))) {
        const resultOfTruncateInteger8 = truncateInteger(flashFraction, true);
        selectedChannelOrFlash1 = resultOfTruncateInteger8; break resolveComponentColorsDone;
      }
      selectedChannelOrFlash1 = 0;
    }
    outlineGreenOrFlashValid = selectedChannelOrFlash1;
    flashAmountOrDarkRedF64 = (darkRed >>> 0);
    return {darkRed, outlineRed: outlineRedOrFlashValid, darkGreen, darkBlue, outlineBlue,
      outlineGreen: outlineGreenOrFlashValid, lightGreen, darkRedF64: flashAmountOrDarkRedF64,
      lightBlue: lightBlueOrFlashColor};
  }

  /** Set the dark fill and its shaded stroke, preserving optional grayscale conversion. Original WAT 289260–289475. */
  function applyDarkFillAndOutline(scratch, darkRed, darkGreen, darkBlue, darkRedF64, renderer) {
    let blueChannel = 0, greenChannel = 0, redChannel = 0, canvasHandle = 0, luminanceOrShadedChannel = 0, darkBlueF64 = 0, darkGreenF64 = 0;
    let selectedChannelOrFlash15;
    applyDarkFillAndOutlineDone: {
      if (+(readU8(renderer, 69) === 0)) {
        darkBlueF64 = (darkBlue >>> 0);
        darkGreenF64 = (darkGreen >>> 0);
        blueChannel = darkBlue;
        greenChannel = darkGreen;
        const savedDarkRed = darkRed;
        selectedChannelOrFlash15 = savedDarkRed; break applyDarkFillAndOutlineDone;
      }
      let selectedChannelOrFlash16;
      applyDarkFillAndOutlineDone2: {
        const savedProduct = (darkRedF64 * 0.2126);
        darkGreenF64 = (darkGreen >>> 0);
        const savedSum = (savedProduct + (darkGreenF64 * 0.7152));
        darkBlueF64 = (darkBlue >>> 0);
        luminanceOrShadedChannel = (savedSum + (darkBlueF64 * 0.0722));
        if ((+(luminanceOrShadedChannel < 4294967296.0) & +(luminanceOrShadedChannel >= 0.0))) {
          const resultOfTruncateInteger9 = truncateInteger(luminanceOrShadedChannel, true);
          selectedChannelOrFlash16 = resultOfTruncateInteger9; break applyDarkFillAndOutlineDone2;
        }
        selectedChannelOrFlash16 = 0;
      }
      blueChannel = selectedChannelOrFlash16;
      greenChannel = blueChannel;
      selectedChannelOrFlash15 = greenChannel;
    }
    redChannel = selectedChannelOrFlash15;
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 1372);
    writeI32(scratch, greenChannel, 1368);
    writeI32(scratch, redChannel, 1364);
    writeI32(scratch, canvasHandle, 1360);
    const savedBits4 = (canvasSetFillRgbAbi(((scratch + 1360) | 0)) | 0);
    void savedBits4;
    let selectedChannelOrFlash17;
    applyDarkFillAndOutlineDone3: {
      luminanceOrShadedChannel = (Math.sqrt((darkBlueF64 * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF64 = roundF64(((luminanceOrShadedChannel * luminanceOrShadedChannel) * 255.0));
      luminanceOrShadedChannel = resultOfRoundF64;
      if ((+(luminanceOrShadedChannel < 4294967296.0) & +(luminanceOrShadedChannel >= 0.0))) {
        const resultOfTruncateInteger10 = truncateInteger(luminanceOrShadedChannel, true);
        selectedChannelOrFlash17 = resultOfTruncateInteger10; break applyDarkFillAndOutlineDone3;
      }
      selectedChannelOrFlash17 = 0;
    }
    blueChannel = selectedChannelOrFlash17;
    let selectedChannelOrFlash18;
    applyDarkFillAndOutlineDone4: {
      luminanceOrShadedChannel = (Math.sqrt((darkGreenF64 * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF642 = roundF64(((luminanceOrShadedChannel * luminanceOrShadedChannel) * 255.0));
      luminanceOrShadedChannel = resultOfRoundF642;
      if ((+(luminanceOrShadedChannel < 4294967296.0) & +(luminanceOrShadedChannel >= 0.0))) {
        const resultOfTruncateInteger11 = truncateInteger(luminanceOrShadedChannel, true);
        selectedChannelOrFlash18 = resultOfTruncateInteger11; break applyDarkFillAndOutlineDone4;
      }
      selectedChannelOrFlash18 = 0;
    }
    greenChannel = selectedChannelOrFlash18;
    let selectedChannelOrFlash19;
    applyDarkFillAndOutlineDone5: {
      luminanceOrShadedChannel = (Math.sqrt((darkRedF64 * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF643 = roundF64(((luminanceOrShadedChannel * luminanceOrShadedChannel) * 255.0));
      luminanceOrShadedChannel = resultOfRoundF643;
      if ((+(luminanceOrShadedChannel < 4294967296.0) & +(luminanceOrShadedChannel >= 0.0))) {
        const resultOfTruncateInteger12 = truncateInteger(luminanceOrShadedChannel, true);
        selectedChannelOrFlash19 = resultOfTruncateInteger12; break applyDarkFillAndOutlineDone5;
      }
      selectedChannelOrFlash19 = 0;
    }
    redChannel = selectedChannelOrFlash19;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash20;
      applyDarkFillAndOutlineDone6: {
        luminanceOrShadedChannel = ((((redChannel >>> 0) * 0.2126) + ((greenChannel >>> 0) * 0.7152)) + ((blueChannel >>> 0) * 0.0722));
        if ((+(luminanceOrShadedChannel < 4294967296.0) & +(luminanceOrShadedChannel >= 0.0))) {
          const resultOfTruncateInteger13 = truncateInteger(luminanceOrShadedChannel, true);
          selectedChannelOrFlash20 = resultOfTruncateInteger13; break applyDarkFillAndOutlineDone6;
        }
        selectedChannelOrFlash20 = 0;
      }
      blueChannel = selectedChannelOrFlash20;
      greenChannel = blueChannel;
      redChannel = greenChannel;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 1356);
    writeI32(scratch, greenChannel, 1352);
    writeI32(scratch, redChannel, 1348);
    writeI32(scratch, canvasHandle, 1344);
    const savedBits5 = (canvasSetStrokeRgbAbi(((scratch + 1344) | 0)) | 0);
    void savedBits5;
    return {darkBlueF64, darkGreenF64};
  }

  /** Build and fill/stroke the triangular path. Original WAT 289476–289838. */
  function drawTriangle(scratch, renderer) {
    let canvasHandle = 0, matrixC = 0, matrixA = 0, matrixTx = 0, matrixB = 0, matrixD = 0;
    writeI32(scratch, readI32(renderer, 96), 1328);
    const savedBits6 = (canvasBeginPathAbi(((scratch + 1328) | 0)) | 0);
    void savedBits6;
    drawTriangleDone: {
      if (+(readU8(renderer, 48) === 0)) { break drawTriangleDone; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory === 0)) { break drawTriangleDone; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      canvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(((scratch + 1312) | 0), readF32(renderer, 20));
      writeF64(((scratch + 1304) | 0), matrixA);
      writeF64(((scratch + 1296) | 0), matrixTx);
      writeF64(((scratch + 1288) | 0), matrixC);
      writeF64(((scratch + 1280) | 0), matrixD);
      writeI32(scratch, canvasHandle, 1264);
      writeF64(scratch, matrixB, 1272);
      const savedBits7 = (canvasSetTransformAbi(((scratch + 1264) | 0)) | 0);
      void savedBits7;
    }
    canvasHandle = readI32(renderer, 96);
    writeI64(((scratch + 1248) | 0), F64_BITS.ZERO);
    writeI64(scratch, F64_BITS.MINUS_THIRTY_SEVEN, 1240);
    writeI32(scratch, canvasHandle, 1232);
    const savedBits8 = (canvasMoveToAbi(((scratch + 1232) | 0)) | 0);
    void savedBits8;
    drawTriangleDone2: {
      if (+(readU8(renderer, 48) === 0)) { break drawTriangleDone2; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory2 = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory2 === 0)) { break drawTriangleDone2; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      canvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(((scratch + 1216) | 0), readF32(renderer, 20));
      writeF64(((scratch + 1208) | 0), matrixA);
      writeF64(((scratch + 1200) | 0), matrixTx);
      writeF64(((scratch + 1192) | 0), matrixC);
      writeF64(((scratch + 1184) | 0), matrixD);
      writeI32(scratch, canvasHandle, 1168);
      writeF64(scratch, matrixB, 1176);
      const savedBits9 = (canvasSetTransformAbi(((scratch + 1168) | 0)) | 0);
      void savedBits9;
    }
    canvasHandle = readI32(renderer, 96);
    writeI64(((scratch + 1152) | 0), F64_BITS.MINUS_NINE);
    writeI64(scratch, F64_BITS.MINUS_TWENTY_FIVE, 1144);
    writeI32(scratch, canvasHandle, 1136);
    const savedBits10 = (canvasLineToAbi(((scratch + 1136) | 0)) | 0);
    void savedBits10;
    drawTriangleDone3: {
      if (+(readU8(renderer, 48) === 0)) { break drawTriangleDone3; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory3 = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory3 === 0)) { break drawTriangleDone3; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      canvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(((scratch + 1120) | 0), readF32(renderer, 20));
      writeF64(((scratch + 1112) | 0), matrixA);
      writeF64(((scratch + 1104) | 0), matrixTx);
      writeF64(((scratch + 1096) | 0), matrixC);
      writeF64(((scratch + 1088) | 0), matrixD);
      writeI32(scratch, canvasHandle, 1072);
      writeF64(scratch, matrixB, 1080);
      const savedBits11 = (canvasSetTransformAbi(((scratch + 1072) | 0)) | 0);
      void savedBits11;
    }
    canvasHandle = readI32(renderer, 96);
    writeI64(((scratch + 1056) | 0), F64_BITS.NINE);
    writeI64(scratch, F64_BITS.MINUS_TWENTY_FIVE, 1048);
    writeI32(scratch, canvasHandle, 1040);
    const savedBits12 = (canvasLineToAbi(((scratch + 1040) | 0)) | 0);
    void savedBits12;
    writeI32(scratch, readI32(renderer, 96), 1024);
    const savedBits13 = (canvasClosePathAbi(((scratch + 1024) | 0)) | 0);
    void savedBits13;
    fillAndStrokeCurrentPath(renderer);
  }

  /** Build the ellipse and apply its light fill. Original WAT 289839–290036. */
  function drawFilledEllipse(scratch, lightGreen, lightBlue, renderer) {
    let redChannelOrCanvasHandle = 0, canvasHandle = 0, matrixC = 0, matrixA = 0, matrixTx = 0, matrixB = 0, matrixD = 0, grayChannel = 0;
    writeI32(scratch, readI32(renderer, 96), 1008);
    const savedBits14 = (canvasBeginPathAbi(((scratch + 1008) | 0)) | 0);
    void savedBits14;
    drawFilledEllipseDone: {
      if (+(readU8(renderer, 48) === 0)) { break drawFilledEllipseDone; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory4 = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory4 === 0)) { break drawFilledEllipseDone; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      redChannelOrCanvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(scratch, readF32(renderer, 20), 992);
      writeF64(scratch, matrixA, 984);
      writeF64(scratch, matrixTx, 976);
      writeF64(scratch, matrixC, 968);
      writeF64(scratch, matrixD, 960);
      writeI32(scratch, redChannelOrCanvasHandle, 944);
      writeF64(scratch, matrixB, 952);
      const savedBits15 = (canvasSetTransformAbi(((scratch + 944) | 0)) | 0);
      void savedBits15;
    }
    redChannelOrCanvasHandle = readI32(renderer, 96);
    writeI32(scratch, 0, 928);
    writeI64(scratch, F64_BITS.TWO_PI, 920);
    writeI64(scratch, F64_BITS.ZERO, 912);
    writeI64(scratch, F64_BITS.ZERO, 904);
    writeI64(scratch, F64_BITS.TWENTY, 896);
    writeI64(scratch, F64_BITS.THIRTY, 888);
    writeI64(scratch, F64_BITS.ZERO, 880);
    writeI64(scratch, F64_BITS.ZERO, 872);
    writeI32(scratch, redChannelOrCanvasHandle, 864);
    const savedBits16 = (canvasEllipseAbi(((scratch + 864) | 0)) | 0);
    void savedBits16;
    let selectedChannelOrFlash21;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash22;
      drawFilledEllipseDone2: {
        grayChannel = ((((lightGreen >>> 0) * 0.7152) + 54.213) + ((lightBlue >>> 0) * 0.0722));
        if ((+(grayChannel < 4294967296.0) & +(grayChannel >= 0.0))) {
          const resultOfTruncateInteger14 = truncateInteger(grayChannel, true);
          selectedChannelOrFlash22 = resultOfTruncateInteger14; break drawFilledEllipseDone2;
        }
        selectedChannelOrFlash22 = 0;
      }
      lightBlue = selectedChannelOrFlash22;
      lightGreen = lightBlue;
      selectedChannelOrFlash21 = lightGreen;
    } else {
      selectedChannelOrFlash21 = 255;
    }
    redChannelOrCanvasHandle = selectedChannelOrFlash21;
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, lightBlue, 860);
    writeI32(scratch, lightGreen, 856);
    writeI32(scratch, redChannelOrCanvasHandle, 852);
    writeI32(scratch, canvasHandle, 848);
    const savedBits17 = (canvasSetFillRgbAbi(((scratch + 848) | 0)) | 0);
    void savedBits17;
    writeI32(scratch, readI32(renderer, 96), 832);
    const savedBits18 = (canvasFillAbi(((scratch + 832) | 0)) | 0);
    void savedBits18;
  }

  /** Save the drawing state, clip the ellipse, draw three bars and restore state. Original WAT 290037–290229. */
  function drawClippedStripes(scratch, darkRed, darkGreen, darkBlue, darkRedF64, darkBlueF64, darkGreenF64, renderer) {
    let blueChannel = 0, greenChannel = 0, redChannel = 0, grayChannel = 0, canvasHandleOrSavedState = 0;
    writeI32(scratch, readI32(renderer, 96), 816);
    const savedBits19 = (canvasSaveAbi(((scratch + 816) | 0)) | 0);
    void savedBits19;
    writeI64(((scratch + 1492) | 0), readI64(renderer, 56));
    writeI64(((scratch + 1484) | 0), readI64(renderer, 48));
    writeI64(((scratch + 1476) | 0), readI64(renderer, 40));
    writeI64(((scratch + 1468) | 0), readI64(renderer, 32));
    writeI64(((scratch + 1460) | 0), readI64(renderer, 24));
    writeI64(((scratch + 1452) | 0), readI64(renderer, 16));
    writeI64(((scratch + 1444) | 0), readI64(renderer, 8));
    writeI64(scratch, readI64(renderer), 1436);
    writeI32(scratch, readI32(renderer, 96), 800);
    const savedBits20 = (canvasClipAbi(((scratch + 800) | 0)) | 0);
    void savedBits20;
    blueChannel = darkBlue;
    greenChannel = darkGreen;
    redChannel = darkRed;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash23;
      drawClippedStripesDone: {
        grayChannel = (((darkRedF64 * 0.2126) + (darkGreenF64 * 0.7152)) + (darkBlueF64 * 0.0722));
        if ((+(grayChannel < 4294967296.0) & +(grayChannel >= 0.0))) {
          const resultOfTruncateInteger15 = truncateInteger(grayChannel, true);
          selectedChannelOrFlash23 = resultOfTruncateInteger15; break drawClippedStripesDone;
        }
        selectedChannelOrFlash23 = 0;
      }
      blueChannel = selectedChannelOrFlash23;
      greenChannel = blueChannel;
      redChannel = greenChannel;
    }
    canvasHandleOrSavedState = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 796);
    writeI32(scratch, greenChannel, 792);
    writeI32(scratch, redChannel, 788);
    writeI32(scratch, canvasHandleOrSavedState, 784);
    const savedBits21 = (canvasSetFillRgbAbi(((scratch + 784) | 0)) | 0);
    void savedBits21;
    fillRectangle(renderer, 10.0, -20.0, 10.0, 40.0);
    fillRectangle(renderer, -10.0, -20.0, 10.0, 40.0);
    fillRectangle(renderer, -30.0, -20.0, 10.0, 40.0);
    const savedRenderer = renderer;
    canvasHandleOrSavedState = ((scratch + 1436) | 0);
    writeI64(savedRenderer, readI64(canvasHandleOrSavedState, 56), 56);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 48), 48);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 40), 40);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 32), 32);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 24), 24);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 16), 16);
    writeI64(renderer, readI64(canvasHandleOrSavedState, 8), 8);
    writeI64(renderer, readI64(canvasHandleOrSavedState));
    writeI32(scratch, readI32(renderer, 96), 768);
    const savedBits22 = (canvasRestoreAbi(((scratch + 768) | 0)) | 0);
    void savedBits22;
  }

  /** Rebuild and stroke the ellipse with its separate palette. Original WAT 290230–290510. */
  function strokeEllipse(scratch, outlineRed, outlineBlue, outlineGreen, renderer) {
    let matrixC = 0, matrixA = 0, matrixTx = 0, matrixB = 0, matrixD = 0, grayChannel = 0, canvasHandle = 0;
    writeI32(scratch, readI32(renderer, 96), 752);
    const savedBits23 = (canvasBeginPathAbi(((scratch + 752) | 0)) | 0);
    void savedBits23;
    strokeEllipseDone: {
      if (+(readU8(renderer, 48) === 0)) { break strokeEllipseDone; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory5 = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory5 === 0)) { break strokeEllipseDone; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      canvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(scratch, readF32(renderer, 20), 736);
      writeF64(scratch, matrixA, 728);
      writeF64(scratch, matrixTx, 720);
      writeF64(scratch, matrixC, 712);
      writeF64(scratch, matrixD, 704);
      writeI32(scratch, canvasHandle, 688);
      writeF64(scratch, matrixB, 696);
      const savedBits24 = (canvasSetTransformAbi(((scratch + 688) | 0)) | 0);
      void savedBits24;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, 0, 672);
    writeI64(scratch, F64_BITS.TWO_PI, 664);
    writeI64(scratch, F64_BITS.ZERO, 656);
    writeI64(scratch, F64_BITS.ZERO, 648);
    writeI64(scratch, F64_BITS.TWENTY, 640);
    writeI64(scratch, F64_BITS.THIRTY, 632);
    writeI64(scratch, F64_BITS.ZERO, 624);
    writeI64(scratch, F64_BITS.ZERO, 616);
    writeI32(scratch, canvasHandle, 608);
    const savedBits25 = (canvasEllipseAbi(((scratch + 608) | 0)) | 0);
    void savedBits25;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash24;
      strokeEllipseDone2: {
        grayChannel = (((outlineBlue >>> 0) * 0.0722) + (((outlineGreen >>> 0) * 0.7152) + ((outlineRed >>> 0) * 0.2126)));
        if ((+(grayChannel < 4294967296.0) & +(grayChannel >= 0.0))) {
          const resultOfTruncateInteger16 = truncateInteger(grayChannel, true);
          selectedChannelOrFlash24 = resultOfTruncateInteger16; break strokeEllipseDone2;
        }
        selectedChannelOrFlash24 = 0;
      }
      outlineBlue = selectedChannelOrFlash24;
      outlineGreen = outlineBlue;
      outlineRed = outlineGreen;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, outlineBlue, 604);
    writeI32(scratch, outlineGreen, 600);
    writeI32(scratch, outlineRed, 596);
    writeI32(scratch, canvasHandle, 592);
    const savedBits26 = (canvasSetStrokeRgbAbi(((scratch + 592) | 0)) | 0);
    void savedBits26;
    strokeEllipseDone3: {
      if (+(readU8(renderer, 48) === 0)) { break strokeEllipseDone3; }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory6 = compareMemory(((renderer + 24) | 0), renderer, 24);
      if (+(resultOfCompareMemory6 === 0)) { break strokeEllipseDone3; }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 12);
      matrixA = readF32(renderer, 16);
      matrixB = readF32(renderer);
      canvasHandle = readI32(renderer, 96);
      matrixD = readF32(renderer, 4);
      writeF64(scratch, readF32(renderer, 20), 576);
      writeF64(scratch, matrixA, 568);
      writeF64(scratch, matrixTx, 560);
      writeF64(scratch, matrixC, 552);
      writeF64(scratch, matrixD, 544);
      writeI32(scratch, canvasHandle, 528);
      writeF64(scratch, matrixB, 536);
      const savedBits27 = (canvasSetTransformAbi(((scratch + 528) | 0)) | 0);
      void savedBits27;
    }
    writeI32(scratch, readI32(renderer, 96), 512);
    const savedBits28 = (canvasStrokeAbi(((scratch + 512) | 0)) | 0);
    void savedBits28;
  }

  /** Set the curve and endpoint colors, then use a 3-unit stroke. Original WAT 290511–290642. */
  function applyCurveColors(scratch, darkRed, darkGreen, darkBlue, darkRedF64, darkBlueF64, darkGreenF64, renderer) {
    let redChannel = 0, greenChannel = 0, grayChannel = 0, blueChannel = 0, canvasHandle = 0;
    blueChannel = darkBlue;
    greenChannel = darkGreen;
    redChannel = darkRed;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash25;
      applyCurveColorsDone: {
        grayChannel = (((darkRedF64 * 0.2126) + (darkGreenF64 * 0.7152)) + (darkBlueF64 * 0.0722));
        if ((+(grayChannel < 4294967296.0) & +(grayChannel >= 0.0))) {
          const resultOfTruncateInteger17 = truncateInteger(grayChannel, true);
          selectedChannelOrFlash25 = resultOfTruncateInteger17; break applyCurveColorsDone;
        }
        selectedChannelOrFlash25 = 0;
      }
      blueChannel = selectedChannelOrFlash25;
      greenChannel = blueChannel;
      redChannel = greenChannel;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 508);
    writeI32(scratch, greenChannel, 504);
    writeI32(scratch, redChannel, 500);
    writeI32(scratch, canvasHandle, 496);
    const savedBits29 = (canvasSetStrokeRgbAbi(((scratch + 496) | 0)) | 0);
    void savedBits29;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash26;
      applyCurveColorsDone2: {
        darkRedF64 = (((darkRedF64 * 0.2126) + (darkGreenF64 * 0.7152)) + (darkBlueF64 * 0.0722));
        if ((+(darkRedF64 < 4294967296.0) & +(darkRedF64 >= 0.0))) {
          const resultOfTruncateInteger18 = truncateInteger(darkRedF64, true);
          selectedChannelOrFlash26 = resultOfTruncateInteger18; break applyCurveColorsDone2;
        }
        selectedChannelOrFlash26 = 0;
      }
      darkBlue = selectedChannelOrFlash26;
      darkGreen = darkBlue;
      darkRed = darkGreen;
    }
    blueChannel = readI32(renderer, 96);
    writeI32(scratch, darkBlue, 492);
    writeI32(scratch, darkGreen, 488);
    writeI32(scratch, darkRed, 484);
    writeI32(scratch, blueChannel, 480);
    const savedBits30 = (canvasSetFillRgbAbi(((scratch + 480) | 0)) | 0);
    void savedBits30;
    blueChannel = readI32(renderer, 96);
    writeI64(scratch, F64_BITS.THREE, 472);
    writeI32(scratch, blueChannel, 464);
    const savedBits31 = (canvasSetLineWidthAbi(((scratch + 464) | 0)) | 0);
    void savedBits31;
  }

  /** Draw one side curve and endpoint at each sign. Original WAT 290643–291110. */
  function drawSideCurvesAndEndpoints(scratch, renderer) {
    let canvasHandle = 0, curveY = 0, endpointY = 0;
    let matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, matrixTx = 0;
    const transformCache = (renderer + 24) | 0;
    let nextSide = -1;
    const arcDirectionPointer = (scratch + 64) | 0;
    drawSideCurvesAndEndpointsLoop: while (true) {
      writeI32(scratch, readI32(renderer, 96), 448);
      const savedBits32 = (canvasBeginPathAbi(((scratch + 448) | 0)) | 0);
      void savedBits32;
      const side = nextSide;
      curveY = (Math.imul(side, 5) | 0);
      syncMoveTransform: {
        if (+(readU8(renderer, 48) === 0)) { break syncMoveTransform; }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory7 = compareMemory(transformCache, renderer, 24);
        if (+(resultOfCompareMemory7 === 0)) { break syncMoveTransform; }
        writeI64(transformCache, readI64(renderer));
        writeI64(transformCache, readI64(renderer, 16), 16);
        writeI64(transformCache, readI64(renderer, 8), 8);
        matrixC = readF32(renderer, 8);
        matrixTx = readF32(renderer, 16);
        matrixA = readF32(renderer);
        canvasHandle = readI32(renderer, 96);
        matrixB = readF32(renderer, 4);
        matrixD = readF32(renderer, 12);
        writeF64(scratch, readF32(renderer, 20), 432);
        writeF64(scratch, matrixTx, 424);
        writeF64(scratch, matrixD, 416);
        writeF64(scratch, matrixC, 408);
        writeF64(scratch, matrixB, 400);
        writeI32(scratch, canvasHandle, 384);
        writeF64(scratch, matrixA, 392);
        const savedBits33 = (canvasSetTransformAbi(((scratch + 384) | 0)) | 0);
        void savedBits33;
      }
      canvasHandle = readI32(renderer, 96);
      writeF64(scratch, curveY, 368);
      writeI64(scratch, F64_BITS.TWENTY_FIVE, 360);
      writeI32(scratch, canvasHandle, 352);
      const savedBits34 = (canvasMoveToAbi(((scratch + 352) | 0)) | 0);
      void savedBits34;
      endpointY = (Math.imul(side, 15) | 0);
      syncCurveTransform: {
        if (+(readU8(renderer, 48) === 0)) { break syncCurveTransform; }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory8 = compareMemory(transformCache, renderer, 24);
        if (+(resultOfCompareMemory8 === 0)) { break syncCurveTransform; }
        writeI64(transformCache, readI64(renderer));
        writeI64(transformCache, readI64(renderer, 16), 16);
        writeI64(transformCache, readI64(renderer, 8), 8);
        matrixC = readF32(renderer, 8);
        matrixTx = readF32(renderer, 16);
        matrixA = readF32(renderer);
        canvasHandle = readI32(renderer, 96);
        matrixB = readF32(renderer, 4);
        matrixD = readF32(renderer, 12);
        writeF64(scratch, readF32(renderer, 20), 336);
        writeF64(scratch, matrixTx, 328);
        writeF64(scratch, matrixD, 320);
        writeF64(scratch, matrixC, 312);
        writeF64(scratch, matrixB, 304);
        writeI32(scratch, canvasHandle, 288);
        writeF64(scratch, matrixA, 296);
        const savedBits35 = (canvasSetTransformAbi(((scratch + 288) | 0)) | 0);
        void savedBits35;
      }
      canvasHandle = readI32(renderer, 96);
      writeF64(scratch, endpointY, 272);
      writeI64(scratch, F64_BITS.FORTY, 264);
      writeF64(scratch, curveY, 256);
      writeI64(scratch, F64_BITS.THIRTY_FIVE, 248);
      writeI32(scratch, canvasHandle, 240);
      const savedBits36 = (canvasQuadraticCurveToAbi(((scratch + 240) | 0)) | 0);
      void savedBits36;
      syncStrokeTransform: {
        if (+(readU8(renderer, 48) === 0)) { break syncStrokeTransform; }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory9 = compareMemory(transformCache, renderer, 24);
        if (+(resultOfCompareMemory9 === 0)) { break syncStrokeTransform; }
        writeI64(transformCache, readI64(renderer));
        writeI64(transformCache, readI64(renderer, 16), 16);
        writeI64(transformCache, readI64(renderer, 8), 8);
        matrixC = readF32(renderer, 8);
        matrixTx = readF32(renderer, 16);
        matrixA = readF32(renderer);
        canvasHandle = readI32(renderer, 96);
        matrixB = readF32(renderer, 4);
        matrixD = readF32(renderer, 12);
        writeF64(scratch, readF32(renderer, 20), 224);
        writeF64(scratch, matrixTx, 216);
        writeF64(scratch, matrixD, 208);
        writeF64(scratch, matrixC, 200);
        writeF64(scratch, matrixB, 192);
        writeI32(scratch, canvasHandle, 176);
        writeF64(scratch, matrixA, 184);
        const savedBits37 = (canvasSetTransformAbi(((scratch + 176) | 0)) | 0);
        void savedBits37;
      }
      writeI32(scratch, readI32(renderer, 96), 160);
      const savedBits38 = (canvasStrokeAbi(((scratch + 160) | 0)) | 0);
      void savedBits38;
      writeI32(scratch, readI32(renderer, 96), 144);
      const savedBits39 = (canvasBeginPathAbi(((scratch + 144) | 0)) | 0);
      void savedBits39;
      syncEndpointTransform: {
        if (+(readU8(renderer, 48) === 0)) { break syncEndpointTransform; }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory10 = compareMemory(transformCache, renderer, 24);
        if (+(resultOfCompareMemory10 === 0)) { break syncEndpointTransform; }
        writeI64(transformCache, readI64(renderer));
        writeI64(transformCache, readI64(renderer, 16), 16);
        writeI64(transformCache, readI64(renderer, 8), 8);
        matrixC = readF32(renderer, 8);
        matrixTx = readF32(renderer, 16);
        matrixA = readF32(renderer);
        canvasHandle = readI32(renderer, 96);
        matrixB = readF32(renderer, 4);
        matrixD = readF32(renderer, 12);
        writeF64(scratch, readF32(renderer, 20), 128);
        writeF64(scratch, matrixTx, 120);
        writeF64(scratch, matrixD, 112);
        writeF64(scratch, matrixC, 104);
        writeF64(scratch, matrixB, 96);
        writeI32(scratch, canvasHandle, 80);
        writeF64(scratch, matrixA, 88);
        const savedBits40 = (canvasSetTransformAbi(((scratch + 80) | 0)) | 0);
        void savedBits40;
      }
      canvasHandle = readI32(renderer, 96);
      writeI32(arcDirectionPointer, 0);
      writeI64(scratch, F64_BITS.TWO_PI, 56);
      writeI64(scratch, F64_BITS.ZERO, 48);
      writeI64(scratch, F64_BITS.FIVE, 40);
      writeF64(scratch, endpointY, 32);
      writeI64(scratch, F64_BITS.FORTY, 24);
      writeI32(scratch, canvasHandle, 16);
      const savedBits41 = (canvasArcAbi(((scratch + 16) | 0)) | 0);
      void savedBits41;
      writeI32(scratch, readI32(renderer, 96));
      const savedBits42 = (canvasFillAbi(scratch) | 0);
      void savedBits42;
      nextSide = ((side + 2) | 0);
      if (+((side | 0) < 0)) { continue drawSideCurvesAndEndpointsLoop; }
      break;
    }
  }

  return Object.freeze({1044: drawComponent148});
}
