/** Complete direct source bodies1045 (entity slot128) and481 (stored-path fill).
 * Client artifact SHA-256: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([481,1045]);
const f32 = Math.fround;
// Exact f64 ABI representations of the outline width and miter limit.
const F64_BITS = Object.freeze({SEVEN: 4619567317775286272n, TEN: 4621819117588971520n});
export function createComponent128RendererHooks(runtime) {
  const compareMemory = (...args) => runtime.call(366, ...args);
  const readClock = (...args) => runtime.call(372, ...args);
  const roundF64 = (...args) => runtime.call(373, ...args);
  const cosF32 = (...args) => runtime.call(427, ...args);
  const sinF32 = (...args) => runtime.call(431, ...args);
  const strokeStoredPath = (...args) => runtime.call(455, ...args);
  const pathCreateAbi = argumentPointer => runtime.host('a', 'a', 141620, 31967, argumentPointer);
  const pathMoveToAbi = argumentPointer => runtime.host('a', 'a', 141801, 32166, argumentPointer);
  const pathQuadraticCurveToAbi = argumentPointer => runtime.host('a', 'a', 141918, 32160, argumentPointer);
  const pathCloseAbi = argumentPointer => runtime.host('a', 'a', 142027, 31967, argumentPointer);
  const pathLineToAbi = argumentPointer => runtime.host('a', 'a', 141835, 32166, argumentPointer);
  const canvasSetLineWidthAbi = argumentPointer => runtime.host('a', 'a', 138111, 93028, argumentPointer);
  const canvasSetLineJoinMiterAbi = argumentPointer => runtime.host('a', 'a', 138852, 31967, argumentPointer);
  const canvasSetMiterLimitAbi = argumentPointer => runtime.host('a', 'a', 138893, 93028, argumentPointer);
  const canvasSetStrokeRgbAbi = argumentPointer => runtime.host('a', 'a', 137456, 32170, argumentPointer);
  const canvasSetLineJoinRoundAbi = argumentPointer => runtime.host('a', 'a', 138811, 31967, argumentPointer);
  const canvasSetFillRgbAbi = argumentPointer => runtime.host('a', 'a', 137186, 32170, argumentPointer);
  const canvasSetTransformAbi = argumentPointer => runtime.host('a', 'a', 136414, 32144, argumentPointer);
  const canvasFillPathAbi = argumentPointer => runtime.host('a', 'a', 136690, 32052, argumentPointer);
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
  // Keep the original scratch bytes visible to nested calls and Canvas hosts.
  // An exception leaves this frame allocated, exactly as the native body does.
  function drawComponent128(component, renderer) {
    component |= 0;
    renderer |= 0;
    const scratch = (runtime.stackPointer.value - 400) | 0;
    runtime.stackPointer.value = scratch;
    const {pointCount, radius} = resolveRadiusAndPointCount(component);
    const roundedPath = cacheRoundedPath(scratch, pointCount, radius, component);
    const insetPath = cacheInsetPath(scratch, pointCount, radius, component);
    const colors = resolveFlashColors(scratch, component);
    configureOutlineStyle(scratch, renderer);
    strokeInsetPath(scratch, insetPath, colors.darkBlueFraction,
      colors.darkGreenFraction, colors.darkRedFraction, renderer);
    restoreRoundJoin(scratch, renderer);
    const fill = setOuterFillColor(scratch, colors.outerBlue, colors.outerRed,
      colors.outerGreen, renderer);
    fillAndStrokeRoundedPath(scratch, roundedPath, fill.red, fill.blue, fill.green, renderer);
    runtime.stackPointer.value = (scratch + 400) | 0;
  }

  /** Read visual radius and derive the unsigned point count. Original WAT 291123–291154. */
  function resolveRadiusAndPointCount(component) {
    let entityOrPointCount = 0, pointCountF64 = 0, radius = 0;
    let selectedChannelOrFlash1;
    resolveRadiusAndPointCountDone: {
      entityOrPointCount = readI32(component);
      let selectedChannelOrFlash2;
      if (entityOrPointCount) {
        selectedChannelOrFlash2 = readF32(readI32(entityOrPointCount, 140), 8);
      } else {
        selectedChannelOrFlash2 = 50.0;
      }
      radius = selectedChannelOrFlash2;
      pointCountF64 = ((radius * 0.14285714285714285) + 3.0);
      if ((+(pointCountF64 < 4294967296.0) & +(pointCountF64 >= 0.0))) {
        const resultOfTruncateInteger = truncateInteger(pointCountF64, true);
        selectedChannelOrFlash1 = resultOfTruncateInteger; break resolveRadiusAndPointCountDone;
      }
      selectedChannelOrFlash1 = 0;
    }
    entityOrPointCount = selectedChannelOrFlash1;
    return {pointCount: entityOrPointCount, radius};
  }

  /** Build and close the rounded path once using its lazy handle. Original WAT 291155–291311. */
  function cacheRoundedPath(scratch, pointCount, radius, component) {
    let pointIndex = 0;
    let pathHandle = 0, roundedPathPointer = 0, stepRatio = 0, x = 0, y = 0;
    roundedPathPointer = ((component + 8) | 0);
    if (+(readU8(component, 12) === 0)) {
      writeU8(component, 1, 12);
      writeI32(component, -1, 8);
      stepRatio = (1.0 / (pointCount >>> 0));
      cacheRoundedPathLoop: while (true) {
        const savedRadius = radius;
        const angle = f32((((pointIndex >>> 0) * 6.283185307179586) * stepRatio));
        const resultOfSinF32 = sinF32(angle);
        y = f32((savedRadius * resultOfSinF32));
        const savedRadius2 = radius;
        const resultOfCosF32 = cosF32(angle);
        x = f32((savedRadius2 * resultOfCosF32));
        cacheRoundedPathDone: {
          if (+(pointIndex === 0)) {
            pathHandle = readI32(roundedPathPointer);
            if (+(pathHandle === -1)) {
              writeI32(scratch, 0, 320);
              const savedRoundedPathPointer = roundedPathPointer;
              const savedBits = (pathCreateAbi(((scratch + 320) | 0)) | 0);
              pathHandle = savedBits;
              writeI32(savedRoundedPathPointer, pathHandle);
            }
            writeF64(scratch, y, 304);
            writeI32(scratch, pathHandle, 288);
            writeF64(scratch, x, 296);
            const savedBits2 = (pathMoveToAbi(((scratch + 288) | 0)) | 0);
            void savedBits2;
            break cacheRoundedPathDone;
          }
          pathHandle = readI32(roundedPathPointer);
          writeF64(scratch, y, 368);
          writeF64(scratch, x, 360);
          const savedScratch = scratch;
          const savedY = y;
          const savedRadius3 = radius;
          const previousAngle = f32((((((pointIndex - 1) | 0) >>> 0) * 6.283185307179586) * stepRatio));
          const resultOfSinF322 = sinF32(previousAngle);
          writeF64(savedScratch, f32((f32((savedY + f32((savedRadius3 * resultOfSinF322)))) * 0.45)), 352);
          writeI32(scratch, pathHandle, 336);
          const savedScratch2 = scratch;
          const savedX = x;
          const savedRadius4 = radius;
          const resultOfCosF322 = cosF32(previousAngle);
          writeF64(savedScratch2, f32((f32((savedX + f32((savedRadius4 * resultOfCosF322)))) * 0.45)), 344);
          const savedBits3 = (pathQuadraticCurveToAbi(((scratch + 336) | 0)) | 0);
          void savedBits3;
        }
        pointIndex = ((pointIndex + 1) | 0);
        if (+((pointIndex >>> 0) <= (pointCount >>> 0))) { continue cacheRoundedPathLoop; }
        break;
      }
      writeI32(scratch, readI32(roundedPathPointer), 272);
      const savedBits4 = (pathCloseAbi(((scratch + 272) | 0)) | 0);
      void savedBits4;
    }
    return roundedPathPointer;
  }

  /** Build the alternating full-radius and inset path once. Original WAT 291312–291531. */
  function cacheInsetPath(scratch, pointCount, radius, component) {
    let pointIndex = 0, pathHandle = 0, insetPathPointer = 0, pointCountF64 = 0, y = 0, x = 0, nextAngle = 0, nextSine = 0;
    insetPathPointer = ((component + 16) | 0);
    if (+(readU8(component, 20) === 0)) {
      writeU8(component, 1, 20);
      writeI32(component, -1, 16);
      const savedScratch3 = scratch;
      let selectedChannelOrFlash3;
      if (pointCount) {
        writeI32(scratch, 0, 256);
        const savedInsetPathPointer = insetPathPointer;
        const savedBits5 = (pathCreateAbi(((scratch + 256) | 0)) | 0);
        pathHandle = savedBits5;
        writeI32(savedInsetPathPointer, pathHandle);
        const savedScratch4 = scratch;
        const savedRadius5 = radius;
        pointCountF64 = (pointCount >>> 0);
        const firstAngle = f32((0.0 / pointCountF64));
        const resultOfSinF323 = sinF32(firstAngle);
        y = f32((savedRadius5 * resultOfSinF323));
        writeF64(savedScratch4, y, 240);
        writeI32(scratch, pathHandle, 224);
        const savedScratch5 = scratch;
        const savedRadius6 = radius;
        const resultOfCosF323 = cosF32(firstAngle);
        x = f32((savedRadius6 * resultOfCosF323));
        writeF64(savedScratch5, x, 232);
        const savedBits6 = (pathMoveToAbi(((scratch + 224) | 0)) | 0);
        void savedBits6;
        nextAngle = f32((6.283185307179586 / pointCountF64));
        const resultOfSinF324 = sinF32(nextAngle);
        nextSine = resultOfSinF324;
        pathHandle = readI32(insetPathPointer);
        writeF64(scratch, f32((f32((y + f32((radius * nextSine)))) * 0.25)), 208);
        const savedScratch6 = scratch;
        const savedX = x;
        const savedRadius7 = radius;
        const resultOfCosF324 = cosF32(nextAngle);
        writeF64(savedScratch6, f32((f32((savedX + f32((savedRadius7 * resultOfCosF324)))) * 0.25)), 200);
        writeI32(scratch, pathHandle, 192);
        const savedBits7 = (pathLineToAbi(((scratch + 192) | 0)) | 0);
        void savedBits7;
        if (+(pointCount !== 1)) {
          const stepRatio = (1.0 / pointCountF64);
          pointIndex = 1;
          cacheInsetPathLoop: while (true) {
            const angle = f32((((pointIndex >>> 0) * 6.283185307179586) * stepRatio));
            const resultOfSinF325 = sinF32(angle);
            y = resultOfSinF325;
            pathHandle = readI32(insetPathPointer);
            const savedScratch7 = scratch;
            y = f32((radius * y));
            writeF64(savedScratch7, y, 176);
            writeI32(scratch, pathHandle, 160);
            const savedScratch8 = scratch;
            const savedRadius8 = radius;
            const resultOfCosF325 = cosF32(angle);
            x = f32((savedRadius8 * resultOfCosF325));
            writeF64(savedScratch8, x, 168);
            const savedBits8 = (pathLineToAbi(((scratch + 160) | 0)) | 0);
            void savedBits8;
            pointIndex = ((pointIndex + 1) | 0);
            nextAngle = f32((((pointIndex >>> 0) * 6.283185307179586) * stepRatio));
            const resultOfSinF326 = sinF32(nextAngle);
            nextSine = resultOfSinF326;
            pathHandle = readI32(insetPathPointer);
            writeF64(scratch, f32((f32((y + f32((radius * nextSine)))) * 0.25)), 144);
            const savedScratch9 = scratch;
            const savedX2 = x;
            const savedRadius9 = radius;
            const resultOfCosF326 = cosF32(nextAngle);
            writeF64(savedScratch9, f32((f32((savedX2 + f32((savedRadius9 * resultOfCosF326)))) * 0.25)), 136);
            writeI32(scratch, pathHandle, 128);
            const savedBits9 = (pathLineToAbi(((scratch + 128) | 0)) | 0);
            void savedBits9;
            if (+(pointIndex !== pointCount)) { continue cacheInsetPathLoop; }
            break;
          }
        }
        selectedChannelOrFlash3 = readI32(insetPathPointer);
      } else {
        selectedChannelOrFlash3 = -1;
      }
      writeI32(savedScratch3, selectedChannelOrFlash3, 112);
      const savedBits10 = (pathCloseAbi(((scratch + 112) | 0)) | 0);
      void savedBits10;
    }
    return insetPathPointer;
  }

  /** Resolve the two independently sampled flash palettes. Original WAT 291532–291929. */
  // Preserve each conditional clock sample and its intervening validity reads.
  function resolveFlashColors(scratch, outerGreenOrFlashInvalid) {
    let entityOrOuterBlue = 0, visualOrFlashColor = 0, flashValidOrDarkRed = 0, darkBlue = 0, outerRed = 0, darkGreen = 0, blueFractionOrFlashTime = 0, greenFraction = 0, redFraction = 0, flashFraction = 0, blendedChannel = 0, baseWeight = 0;
    let selectedChannelOrFlash4;
    resolveFlashColorsDone: {
      entityOrOuterBlue = readI32(outerGreenOrFlashInvalid);
      if (+(entityOrOuterBlue === 0)) {
        greenFraction = 0.2;
        entityOrOuterBlue = 82;
        outerRed = 50;
        redFraction = 0.2;
        blueFractionOrFlashTime = 0.2;
        selectedChannelOrFlash4 = 168; break resolveFlashColorsDone;
      }
      visualOrFlashColor = 16711680;
      outerGreenOrFlashInvalid = 1;
      resolveFlashColorsDone2: {
        entityOrOuterBlue = readI32(entityOrOuterBlue, 136);
        if (+(readU8(entityOrOuterBlue, 56) === 0)) {
          flashFraction = 0.0;
          break resolveFlashColorsDone2;
        }
        readClock(((scratch + 384) | 0));
        let selectedChannelOrFlash5;
        resolveFlashColorsDone3: {
          flashValidOrDarkRed = readU8(entityOrOuterBlue, 56);
          if (+(flashValidOrDarkRed === 0)) { selectedChannelOrFlash5 = Infinity; break resolveFlashColorsDone3; }
          if (+(readU8(scratch, 384) === 0)) { selectedChannelOrFlash5 = -Infinity; break resolveFlashColorsDone3; }
          selectedChannelOrFlash5 = (((readF64(((entityOrOuterBlue - -64) | 0)) - readF64(scratch, 392)) * 0.006666666666666667) + 1.0);
        }
        blueFractionOrFlashTime = selectedChannelOrFlash5;
        flashFraction = f32(selectValue(0.0, Math.min(blueFractionOrFlashTime, 1.0), +(blueFractionOrFlashTime < 0.0)));
        if (+(flashValidOrDarkRed === 0)) { break resolveFlashColorsDone2; }
        readClock(((scratch + 384) | 0));
        let selectedChannelOrFlash6;
        resolveFlashColorsDone4: {
          outerGreenOrFlashInvalid = readU8(entityOrOuterBlue, 56);
          if (+(outerGreenOrFlashInvalid === 0)) { selectedChannelOrFlash6 = Infinity; break resolveFlashColorsDone4; }
          if (+(readU8(scratch, 384) === 0)) { selectedChannelOrFlash6 = -Infinity; break resolveFlashColorsDone4; }
          selectedChannelOrFlash6 = (((readF64(((entityOrOuterBlue - -64) | 0)) - readF64(scratch, 392)) * 0.006666666666666667) + 1.0);
        }
        blueFractionOrFlashTime = selectedChannelOrFlash6;
        outerGreenOrFlashInvalid = +(outerGreenOrFlashInvalid === 0);
        visualOrFlashColor = selectValue(16777215, 16711680, +(f32(selectValue(0.0, Math.min(blueFractionOrFlashTime, 1.0), +(blueFractionOrFlashTime < 0.0))) >= 0.9));
      }
      let selectedChannelOrFlash7;
      resolveFlashColorsDone5: {
        const resultOfF32 = f32((flashFraction * 255.0));
        baseWeight = f32((51.0 - f32((flashFraction * 51.0))));
        blendedChannel = f32((resultOfF32 + baseWeight));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger2 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash7 = resultOfTruncateInteger2; break resolveFlashColorsDone5;
        }
        selectedChannelOrFlash7 = 0;
      }
      flashValidOrDarkRed = selectedChannelOrFlash7;
      let selectedChannelOrFlash8;
      resolveFlashColorsDone6: {
        blendedChannel = f32((baseWeight + f32((flashFraction * f32(((visualOrFlashColor & 255) >>> 0))))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger3 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash8 = resultOfTruncateInteger3; break resolveFlashColorsDone6;
        }
        selectedChannelOrFlash8 = 0;
      }
      darkBlue = selectedChannelOrFlash8;
      let selectedChannelOrFlash9;
      resolveFlashColorsDone7: {
        flashFraction = f32((baseWeight + f32((flashFraction * f32(((((visualOrFlashColor >>> 8) | 0) & 255) >>> 0))))));
        if ((+(flashFraction < 4294967296.0) & +(flashFraction >= 0.0))) {
          const resultOfTruncateInteger4 = truncateInteger(flashFraction, true);
          selectedChannelOrFlash9 = resultOfTruncateInteger4; break resolveFlashColorsDone7;
        }
        selectedChannelOrFlash9 = 0;
      }
      darkGreen = selectedChannelOrFlash9;
      visualOrFlashColor = 16711680;
      resolveFlashColorsDone8: {
        if (outerGreenOrFlashInvalid) {
          flashFraction = 0.0;
          break resolveFlashColorsDone8;
        }
        readClock(((scratch + 384) | 0));
        let selectedChannelOrFlash10;
        resolveFlashColorsDone9: {
          outerGreenOrFlashInvalid = readU8(entityOrOuterBlue, 56);
          if (+(outerGreenOrFlashInvalid === 0)) { selectedChannelOrFlash10 = Infinity; break resolveFlashColorsDone9; }
          if (+(readU8(scratch, 384) === 0)) { selectedChannelOrFlash10 = -Infinity; break resolveFlashColorsDone9; }
          selectedChannelOrFlash10 = (((readF64(((entityOrOuterBlue - -64) | 0)) - readF64(scratch, 392)) * 0.006666666666666667) + 1.0);
        }
        blueFractionOrFlashTime = selectedChannelOrFlash10;
        flashFraction = f32(selectValue(0.0, Math.min(blueFractionOrFlashTime, 1.0), +(blueFractionOrFlashTime < 0.0)));
        if (+(outerGreenOrFlashInvalid === 0)) { break resolveFlashColorsDone8; }
        readClock(((scratch + 384) | 0));
        let selectedChannelOrFlash11;
        resolveFlashColorsDone10: {
          if (+(readU8(entityOrOuterBlue, 56) === 0)) { selectedChannelOrFlash11 = Infinity; break resolveFlashColorsDone10; }
          if (+(readU8(scratch, 384) === 0)) { selectedChannelOrFlash11 = -Infinity; break resolveFlashColorsDone10; }
          selectedChannelOrFlash11 = (((readF64(((entityOrOuterBlue - -64) | 0)) - readF64(scratch, 392)) * 0.006666666666666667) + 1.0);
        }
        blueFractionOrFlashTime = selectedChannelOrFlash11;
        visualOrFlashColor = selectValue(16777215, 16711680, +(f32(selectValue(0.0, Math.min(blueFractionOrFlashTime, 1.0), +(blueFractionOrFlashTime < 0.0))) >= 0.9));
      }
      let selectedChannelOrFlash12;
      resolveFlashColorsDone11: {
        const resultOfF322 = f32((flashFraction * 255.0));
        baseWeight = f32((1.0 - flashFraction));
        blendedChannel = f32((resultOfF322 + f32((baseWeight * 50.0))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger5 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash12 = resultOfTruncateInteger5; break resolveFlashColorsDone11;
        }
        selectedChannelOrFlash12 = 0;
      }
      outerRed = selectedChannelOrFlash12;
      let selectedChannelOrFlash13;
      resolveFlashColorsDone12: {
        blendedChannel = f32((f32((baseWeight * 82.0)) + f32((flashFraction * f32(((visualOrFlashColor & 255) >>> 0))))));
        if ((+(blendedChannel < 4294967296.0) & +(blendedChannel >= 0.0))) {
          const resultOfTruncateInteger6 = truncateInteger(blendedChannel, true);
          selectedChannelOrFlash13 = resultOfTruncateInteger6; break resolveFlashColorsDone12;
        }
        selectedChannelOrFlash13 = 0;
      }
      entityOrOuterBlue = selectedChannelOrFlash13;
      blueFractionOrFlashTime = ((darkBlue >>> 0) * 0.00392156862745098);
      redFraction = ((darkGreen >>> 0) * 0.00392156862745098);
      greenFraction = ((flashValidOrDarkRed >>> 0) * 0.00392156862745098);
      let selectedChannelOrFlash14;
      resolveFlashColorsDone13: {
        flashFraction = f32((f32((baseWeight * 168.0)) + f32((flashFraction * f32(((((visualOrFlashColor >>> 8) | 0) & 255) >>> 0))))));
        if ((+(flashFraction < 4294967296.0) & +(flashFraction >= 0.0))) {
          const resultOfTruncateInteger7 = truncateInteger(flashFraction, true);
          selectedChannelOrFlash14 = resultOfTruncateInteger7; break resolveFlashColorsDone13;
        }
        selectedChannelOrFlash14 = 0;
      }
      selectedChannelOrFlash4 = selectedChannelOrFlash14;
    }
    outerGreenOrFlashInvalid = selectedChannelOrFlash4;
    return {outerBlue: entityOrOuterBlue, outerRed, outerGreen: outerGreenOrFlashInvalid,
      darkBlueFraction: blueFractionOrFlashTime, darkGreenFraction: greenFraction, darkRedFraction: redFraction};
  }

  /** Set stroke width, miter joins and miter limit. Original WAT 291930–291981. */
  function configureOutlineStyle(scratch, renderer) {
    let canvasHandle = 0;
    canvasHandle = readI32(renderer, 96);
    writeI64(scratch, F64_BITS.SEVEN, 104);
    writeI32(scratch, canvasHandle, 96);
    const savedBits11 = (canvasSetLineWidthAbi(((scratch + 96) | 0)) | 0);
    void savedBits11;
    if (+(readU8(renderer, 50) !== 2)) {
      writeU8(renderer, 2, 50);
      writeI32(scratch, readI32(renderer, 96), 80);
      const savedBits12 = (canvasSetLineJoinMiterAbi(((scratch + 80) | 0)) | 0);
      void savedBits12;
    }
    canvasHandle = readI32(renderer, 96);
    writeI64(scratch, F64_BITS.TEN, 72);
    writeI32(scratch, canvasHandle, 64);
    const savedBits13 = (canvasSetMiterLimitAbi(((scratch - -64) | 0)) | 0);
    void savedBits13;
  }

  /** Shade and optionally grayscale the dark palette, then stroke the inset path. Original WAT 291982–292120. */
  function strokeInsetPath(scratch, insetPathPointer, blueFractionOrShade, greenFraction, redFraction, renderer) {
    let blueChannel = 0, greenChannel = 0, redChannel = 0, canvasHandle = 0;
    let selectedChannelOrFlash15;
    strokeInsetPathDone: {
      blueFractionOrShade = (Math.sqrt(blueFractionOrShade) * 0.8999999985098839);
      const resultOfRoundF64 = roundF64(((blueFractionOrShade * blueFractionOrShade) * 255.0));
      blueFractionOrShade = resultOfRoundF64;
      if ((+(blueFractionOrShade < 4294967296.0) & +(blueFractionOrShade >= 0.0))) {
        const resultOfTruncateInteger8 = truncateInteger(blueFractionOrShade, true);
        selectedChannelOrFlash15 = resultOfTruncateInteger8; break strokeInsetPathDone;
      }
      selectedChannelOrFlash15 = 0;
    }
    blueChannel = selectedChannelOrFlash15;
    let selectedChannelOrFlash16;
    strokeInsetPathDone2: {
      blueFractionOrShade = (Math.sqrt(redFraction) * 0.8999999985098839);
      const resultOfRoundF642 = roundF64(((blueFractionOrShade * blueFractionOrShade) * 255.0));
      blueFractionOrShade = resultOfRoundF642;
      if ((+(blueFractionOrShade < 4294967296.0) & +(blueFractionOrShade >= 0.0))) {
        const resultOfTruncateInteger9 = truncateInteger(blueFractionOrShade, true);
        selectedChannelOrFlash16 = resultOfTruncateInteger9; break strokeInsetPathDone2;
      }
      selectedChannelOrFlash16 = 0;
    }
    greenChannel = selectedChannelOrFlash16;
    let selectedChannelOrFlash17;
    strokeInsetPathDone3: {
      blueFractionOrShade = (Math.sqrt(greenFraction) * 0.8999999985098839);
      const resultOfRoundF643 = roundF64(((blueFractionOrShade * blueFractionOrShade) * 255.0));
      blueFractionOrShade = resultOfRoundF643;
      if ((+(blueFractionOrShade < 4294967296.0) & +(blueFractionOrShade >= 0.0))) {
        const resultOfTruncateInteger10 = truncateInteger(blueFractionOrShade, true);
        selectedChannelOrFlash17 = resultOfTruncateInteger10; break strokeInsetPathDone3;
      }
      selectedChannelOrFlash17 = 0;
    }
    redChannel = selectedChannelOrFlash17;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash18;
      strokeInsetPathDone4: {
        blueFractionOrShade = ((((redChannel >>> 0) * 0.2126) + ((greenChannel >>> 0) * 0.7152)) + ((blueChannel >>> 0) * 0.0722));
        if ((+(blueFractionOrShade < 4294967296.0) & +(blueFractionOrShade >= 0.0))) {
          const resultOfTruncateInteger11 = truncateInteger(blueFractionOrShade, true);
          selectedChannelOrFlash18 = resultOfTruncateInteger11; break strokeInsetPathDone4;
        }
        selectedChannelOrFlash18 = 0;
      }
      blueChannel = selectedChannelOrFlash18;
      greenChannel = blueChannel;
      redChannel = greenChannel;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 60);
    writeI32(scratch, greenChannel, 56);
    writeI32(scratch, redChannel, 52);
    writeI32(scratch, canvasHandle, 48);
    const savedBits14 = (canvasSetStrokeRgbAbi(((scratch + 48) | 0)) | 0);
    void savedBits14;
    strokeStoredPath(renderer, insetPathPointer);
  }

  /** Return the renderer to round line joins. Original WAT 292121–292138. */
  function restoreRoundJoin(scratch, renderer) {
    if (readU8(renderer, 50)) {
      writeU8(renderer, 0, 50);
      writeI32(scratch, readI32(renderer, 96), 32);
      const savedBits15 = (canvasSetLineJoinRoundAbi(((scratch + 32) | 0)) | 0);
      void savedBits15;
    }
  }

  /** Publish the outer fill color, retaining grayscale channel snapshots. Original WAT 292139–292210. */
  function setOuterFillColor(scratch, outerBlue, outerRed, outerGreen, renderer) {
    let canvasHandle = 0, outerRedF64 = 0, outerBlueF64 = 0, outerGreenF64 = 0, grayscaleValue = 0;
    outerRedF64 = (outerRed >>> 0);
    setOuterFillColorDone: {
      if (+(readU8(renderer, 69) === 0)) {
        outerBlueF64 = (outerBlue >>> 0);
        outerGreenF64 = (outerGreen >>> 0);
        break setOuterFillColorDone;
      }
      let selectedChannelOrFlash19;
      setOuterFillColorDone2: {
        const savedProduct = (outerRedF64 * 0.2126);
        outerGreenF64 = (outerGreen >>> 0);
        const savedSum = (savedProduct + (outerGreenF64 * 0.7152));
        outerBlueF64 = (outerBlue >>> 0);
        grayscaleValue = (savedSum + (outerBlueF64 * 0.0722));
        if ((+(grayscaleValue < 4294967296.0) & +(grayscaleValue >= 0.0))) {
          const resultOfTruncateInteger12 = truncateInteger(grayscaleValue, true);
          selectedChannelOrFlash19 = resultOfTruncateInteger12; break setOuterFillColorDone2;
        }
        selectedChannelOrFlash19 = 0;
      }
      outerBlue = selectedChannelOrFlash19;
      outerGreen = outerBlue;
      outerRed = outerGreen;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, outerBlue, 28);
    writeI32(scratch, outerGreen, 24);
    writeI32(scratch, outerRed, 20);
    writeI32(scratch, canvasHandle, 16);
    const savedBits16 = (canvasSetFillRgbAbi(((scratch + 16) | 0)) | 0);
    void savedBits16;
    return {red: outerRedF64, blue: outerBlueF64, green: outerGreenF64};
  }

  /** Shade the outer stroke, fill and stroke the rounded path. Original WAT 292211–292356. */
  function fillAndStrokeRoundedPath(scratch, roundedPathPointer, outerRedF64OrShade, outerBlueF64, outerGreenF64, renderer) {
    let blueChannel = 0, greenChannel = 0, redChannel = 0, canvasHandle = 0;
    let selectedChannelOrFlash20;
    fillAndStrokeRoundedPathDone: {
      outerBlueF64 = (Math.sqrt((outerBlueF64 * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF644 = roundF64(((outerBlueF64 * outerBlueF64) * 255.0));
      outerBlueF64 = resultOfRoundF644;
      if ((+(outerBlueF64 < 4294967296.0) & +(outerBlueF64 >= 0.0))) {
        const resultOfTruncateInteger13 = truncateInteger(outerBlueF64, true);
        selectedChannelOrFlash20 = resultOfTruncateInteger13; break fillAndStrokeRoundedPathDone;
      }
      selectedChannelOrFlash20 = 0;
    }
    blueChannel = selectedChannelOrFlash20;
    let selectedChannelOrFlash21;
    fillAndStrokeRoundedPathDone2: {
      outerBlueF64 = (Math.sqrt((outerGreenF64 * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF645 = roundF64(((outerBlueF64 * outerBlueF64) * 255.0));
      outerBlueF64 = resultOfRoundF645;
      if ((+(outerBlueF64 < 4294967296.0) & +(outerBlueF64 >= 0.0))) {
        const resultOfTruncateInteger14 = truncateInteger(outerBlueF64, true);
        selectedChannelOrFlash21 = resultOfTruncateInteger14; break fillAndStrokeRoundedPathDone2;
      }
      selectedChannelOrFlash21 = 0;
    }
    greenChannel = selectedChannelOrFlash21;
    let selectedChannelOrFlash22;
    fillAndStrokeRoundedPathDone3: {
      outerRedF64OrShade = (Math.sqrt((outerRedF64OrShade * 0.00392156862745098)) * 0.8999999985098839);
      const resultOfRoundF646 = roundF64(((outerRedF64OrShade * outerRedF64OrShade) * 255.0));
      outerRedF64OrShade = resultOfRoundF646;
      if ((+(outerRedF64OrShade < 4294967296.0) & +(outerRedF64OrShade >= 0.0))) {
        const resultOfTruncateInteger15 = truncateInteger(outerRedF64OrShade, true);
        selectedChannelOrFlash22 = resultOfTruncateInteger15; break fillAndStrokeRoundedPathDone3;
      }
      selectedChannelOrFlash22 = 0;
    }
    redChannel = selectedChannelOrFlash22;
    if (readU8(renderer, 69)) {
      let selectedChannelOrFlash23;
      fillAndStrokeRoundedPathDone4: {
        outerRedF64OrShade = ((((redChannel >>> 0) * 0.2126) + ((greenChannel >>> 0) * 0.7152)) + ((blueChannel >>> 0) * 0.0722));
        if ((+(outerRedF64OrShade < 4294967296.0) & +(outerRedF64OrShade >= 0.0))) {
          const resultOfTruncateInteger16 = truncateInteger(outerRedF64OrShade, true);
          selectedChannelOrFlash23 = resultOfTruncateInteger16; break fillAndStrokeRoundedPathDone4;
        }
        selectedChannelOrFlash23 = 0;
      }
      blueChannel = selectedChannelOrFlash23;
      greenChannel = blueChannel;
      redChannel = greenChannel;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueChannel, 12);
    writeI32(scratch, greenChannel, 8);
    writeI32(scratch, redChannel, 4);
    writeI32(scratch, canvasHandle);
    const savedBits17 = (canvasSetStrokeRgbAbi(scratch) | 0);
    void savedBits17;
    fillStoredPath(renderer, roundedPathPointer);
    strokeStoredPath(renderer, roundedPathPointer);
  }

  /** Original481: fill an existing stored path after synchronizing the transform.
   * The missing-path sentinel skips renderer access. Reload the path handle only
   * after a changed-transform host call, since that callback may mutate it.
   */
  function fillStoredPath(renderer, pathPointer) {
    renderer |= 0; pathPointer |= 0;
    const scratch = (runtime.stackPointer.value - 80) | 0;
    runtime.stackPointer.value = scratch;
    let handle = readI32(pathPointer);
    if (handle !== -1) {
      if (readU8(renderer, 48)) {
        writeU8(renderer, 0, 48);
        if (compareMemory((renderer + 24) | 0, renderer, 24)) {
          writeI64(renderer, readI64(renderer), 24);
          writeI64(renderer, readI64(renderer, 16), 40);
          writeI64(renderer, readI64(renderer, 8), 32);
          const c = readF32(renderer, 8), d = readF32(renderer, 12), tx = readF32(renderer, 16);
          const a = readF32(renderer), context = readI32(renderer, 96), b = readF32(renderer, 4);
          writeF64((scratch + 64) | 0, readF32(renderer, 20));
          writeF64(scratch, tx, 56); writeF64(scratch, d, 48); writeF64(scratch, c, 40);
          writeF64(scratch, b, 32); writeI32(scratch, context, 16); writeF64(scratch, a, 24);
          canvasSetTransformAbi((scratch + 16) | 0) | 0;
          handle = readI32(pathPointer);
        }
      }
      const context = readI32(renderer, 96);
      writeI32(scratch, handle, 4); writeI32(scratch, context);
      canvasFillPathAbi(scratch) | 0;
    }
    runtime.stackPointer.value = (scratch + 80) | 0;
  }
  return Object.freeze({481: fillStoredPath, 1045: drawComponent128});
}
