/** Complete update/render body for client function763, recovered in named phases.
 * Shared memory offsets retain the published ABI. Independent drawing, math,
 * text and spatial services remain explicit dependencies of this module.
 * Artifact: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
const f32 = Math.fround;

export const functionIds = Object.freeze([ 763 ]);

export const dependencyIds = Object.freeze([ 369, 371, 0, 382, 362, 1, 1013, 1014, 2, 363, 366, 372, 375, 392, 403, 407, 409, 410, 421, 426, 427, 431, 521, 547, 554, 556, 562, 576, 587, 588, 591, 610, 672, 760, 761, 802, 368, 370 ]);

export function createRenderFrameHooks(runtime) {
  const free = (...args) => runtime.call(362, ...args);
  const copyMemory = (...args) => runtime.call(363, ...args);
  const compareMemory = (...args) => runtime.call(366, ...args);
  const malloc = (...args) => runtime.call(368, ...args);
  const acquireGuard = (...args) => runtime.call(369, ...args);
  const releaseGuard = (...args) => runtime.call(370, ...args);
  const allocateOrAbort = (...args) => runtime.call(371, ...args);
  const readClock = (...args) => runtime.call(372, ...args);
  const powF64 = (...args) => runtime.call(375, ...args);
  const fillMemory = (...args) => runtime.call(382, ...args);
  const drawTextLabel = (...args) => runtime.call(392, ...args);
  const cosF64 = (...args) => runtime.call(403, ...args);
  const sinF64 = (...args) => runtime.call(407, ...args);
  const updateWorldTransform = (...args) => runtime.call(409, ...args);
  const fillRectangle = (...args) => runtime.call(410, ...args);
  const useTouchControls = (...args) => runtime.call(421, ...args);
  const initializeSceneUi = (...args) => runtime.call(426, ...args);
  const cosF32 = (...args) => runtime.call(427, ...args);
  const sinF32 = (...args) => runtime.call(431, ...args);
  const initializeSettings = (...args) => runtime.call(521, ...args);
  const destroySpatialChildren = (...args) => runtime.call(547, ...args);
  const elapsedFromOrigin = (...args) => runtime.call(554, ...args);
  const prepareTextLabel = (...args) => runtime.call(556, ...args);
  const appendPathLine = (...args) => runtime.call(562, ...args);
  const sortDrawOrder = (...args) => runtime.call(576, ...args);
  const drawPetalIcon = (...args) => runtime.call(587, ...args);
  const arenaBandBoundary = (...args) => runtime.call(588, ...args);
  const nextPrime = (...args) => runtime.call(591, ...args);
  const compactSpatialTree = (...args) => runtime.call(610, ...args);
  const updateVisualBounds = (...args) => runtime.call(672, ...args);
  const drawEntity = (...args) => runtime.call(760, ...args);
  const atan2F64 = (...args) => runtime.call(761, ...args);
  const atan2F32 = (...args) => runtime.call(802, ...args);
  const decodeSnapshotEvent = (...args) => runtime.call(1013, ...args);
  const insertSpatialCollider = (...args) => runtime.call(1014, ...args);
  const canvasSaveAbi = argumentPointer => +runtime.host("a", "a", 136300, 31967, argumentPointer) | 0;
  const canvasRestoreAbi = argumentPointer => +runtime.host("a", "a", 136329, 31967, argumentPointer) | 0;
  const canvasSetGlobalAlphaAbi = argumentPointer => +runtime.host("a", "a", 137728, 93028, argumentPointer) | 0;
  const canvasSetLineCapRoundAbi = argumentPointer => +runtime.host("a", "a", 138730, 31967, argumentPointer) | 0;
  const canvasSetLineJoinRoundAbi = argumentPointer => +runtime.host("a", "a", 138811, 31967, argumentPointer) | 0;
  const canvasSetLineWidthAbi = argumentPointer => +runtime.host("a", "a", 138111, 93028, argumentPointer) | 0;
  const canvasBeginPathAbi = argumentPointer => +runtime.host("a", "a", 136878, 31967, argumentPointer) | 0;
  const canvasSetTransformAbi = argumentPointer => +runtime.host("a", "a", 136414, 32144, argumentPointer) | 0;
  const canvasMoveToAbi = argumentPointer => +runtime.host("a", "a", 137806, 32166, argumentPointer) | 0;
  const canvasSetStrokeRgbAbi = argumentPointer => +runtime.host("a", "a", 137456, 32170, argumentPointer) | 0;
  const canvasStrokeAbi = argumentPointer => +runtime.host("a", "a", 136732, 31967, argumentPointer) | 0;
  const canvasLineToAbi = argumentPointer => +runtime.host("a", "a", 137843, 32166, argumentPointer) | 0;
  const canvasSetGlobalAlphaDuplicateAbi = argumentPointer => +runtime.host("a", "a", 137767, 93028, argumentPointer) | 0;
  const canvasRectAbi = argumentPointer => +runtime.host("a", "a", 136946, 32160, argumentPointer) | 0;
  const isMobileUserAgentAbi = argumentPointer => +runtime.host("a", "a", 133733, 31967, argumentPointer) | 0;
  const canvasSetFillRgbAbi = argumentPointer => +runtime.host("a", "a", 137186, 32170, argumentPointer) | 0;
  const floatingPointRemainderAbi = argumentPointer => +runtime.host("a", "c", 150328, 33144, argumentPointer);
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
  function rotateLeft(value, count) {
    return value << count | value >>> (-count & 31);
  }
  function divideUnsigned(a, b) {
    if (!(b >>> 0)) throw new WebAssembly.RuntimeError("divide by zero");
    return Math.trunc((a >>> 0) / (b >>> 0)) | 0;
  }
  function remainderUnsigned(a, b) {
    if (!(b >>> 0)) throw new WebAssembly.RuntimeError("divide by zero");
    return (a >>> 0) % (b >>> 0) | 0;
  }
  function truncateInteger(value, unsigned) {
    const integer = Math.trunc(value);
    if (!Number.isFinite(integer) || integer < (unsigned ? 0 : -2147483648) || integer >= (unsigned ? 4294967296 : 2147483648)) throw new WebAssembly.RuntimeError("integer overflow");
    return integer | 0;
  }
  // All arguments are evaluated before selection, as in the original WASM.
    const selectValue = (first, second, condition) => condition ? first : second;
  function popcount(value) {
    value -= value >>> 1 & 1431655765;
    value = (value & 858993459) + (value >>> 2 & 858993459);
    return Math.imul(value + (value >>> 4) & 252645135, 16843009) >>> 24;
  }
  /** Update controls, scene interpolation and all world render passes (func763). */  function updateAndRender(game, callerRenderer, elapsedMilliseconds, width, height) {
    game |= 0;
    callerRenderer |= 0;
    elapsedMilliseconds = +elapsedMilliseconds;
    width |= 0;
    height |= 0;
    const [frame] = captureFrameClock();
    saveOuterDrawingState(frame, callerRenderer);
    queuePlayerInput(frame, game, elapsedMilliseconds);
    invalidateTransformCaches(game);
    writeI32(frame, height, 48);
    writeI32(frame, width, 44);
    writeI32(frame, callerRenderer, 40);
    writeF64(frame, elapsedMilliseconds, 32);
    const scratch = runtime.stackPointer.value - 2848 | 0;
    runtime.stackPointer.value = scratch;
    const renderer = readI32(frame, 40);
    writeI32(scratch, readI32(renderer, 96), 2608);
    canvasSaveAbi(scratch + 2608 | 0);
    // Preserve the eight 64-bit words in their original write order. Shared
    // linear memory and stack scratch are part of the differential contract.
        writeI64(scratch + 2744 | 0, readI64(renderer, 56));
    writeI64(scratch + 2736 | 0, readI64(renderer, 48));
    writeI64(scratch + 2728 | 0, readI64(renderer, 40));
    writeI64(scratch + 2720 | 0, readI64(renderer, 32));
    writeI64(scratch + 2712 | 0, readI64(renderer, 24));
    writeI64(scratch + 2704 | 0, readI64(renderer, 16));
    writeI64(scratch + 2696 | 0, readI64(renderer, 8));
    writeI64(scratch, readI64(renderer), 2688);
    const camera = game + 2152 | 0;
    writeI32(camera, readI32(frame, 44), 16);
    writeI32(camera, readI32(frame, 48), 20);
    clearEntitySpatialHash(camera);
    const state = camera - 2144 | 0;
    populateEntitySpatialHash(camera, state);
    refreshVisualBounds(state);
    rebuildVisualSpatialTree(state);
    const [viewportWidthF32, heightScale, pixelsPerWorld, viewportWidthF64] = updateCamera(scratch, camera, state, frame);
    drawArenaBands(renderer, scratch, camera, state, frame, viewportWidthF32, heightScale, pixelsPerWorld, viewportWidthF64);
    const [savedRenderer] = drawWorldGrid(renderer, scratch, camera);
    drawSceneEntities(renderer, scratch, camera, state, frame);
    writeI64(renderer, readI64(savedRenderer));
    writeI64(renderer, readI64(savedRenderer, 56), 56);
    writeI64(renderer, readI64(savedRenderer, 48), 48);
    writeI64(renderer, readI64(savedRenderer, 40), 40);
    writeI64(renderer, readI64(savedRenderer, 32), 32);
    writeI64(renderer, readI64(savedRenderer, 24), 24);
    writeI64(renderer, readI64(savedRenderer, 16), 16);
    writeI64(renderer, readI64(savedRenderer, 8), 8);
    writeI32(scratch, readI32(renderer, 96));
    canvasRestoreAbi(scratch);
    runtime.stackPointer.value = scratch + 2848 | 0;
    restoreOuterDrawingState(frame, callerRenderer);
    restoreFrameClock(frame);
  }
  /** Save the drawing state and map world coordinates through the camera. Original WAT 138303–138634. */  function setSceneDrawTransform(renderer, scratch, camera, frame) {
    let valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, matrixTx = 0, matrixTy = 0, scaledMatrixC = 0, scaledMatrixA = 0, scaledMatrixB = 0, value = 0, amount = 0, count = 0;
    writeI32(scratch, readI32(renderer, 96), 1840);
    const savedBits3 = canvasSaveAbi(scratch + 1840 | 0) | 0;
    void savedBits3;
    writeI64(scratch + 2676 | 0, readI64(renderer, 56));
    writeI64(scratch + 2668 | 0, readI64(renderer, 48));
    writeI64(scratch + 2660 | 0, readI64(renderer, 40));
    writeI64(scratch + 2652 | 0, readI64(renderer, 32));
    writeI64(scratch + 2644 | 0, readI64(renderer, 24));
    writeI64(scratch + 2636 | 0, readI64(renderer, 16));
    writeI64(scratch + 2628 | 0, readI64(renderer, 8));
    writeI64(scratch, readI64(renderer), 2620);
    count = readI32(camera, 16);
    value = readI32(camera, 20);
    const savedRenderer = renderer;
    matrixD = readF32(renderer);
    const savedMatrixD = matrixD;
    matrixC = readF32(renderer, 8);
    const resultOfF32 = f32(savedMatrixD + f32(matrixC * 0));
    sizeF32 = readF32(renderer, 16);
    amountF32 = f32(sizeF32 * 0);
    scaledMatrixA = f32(resultOfF32 + amountF32);
    writeF32(savedRenderer, scaledMatrixA);
    const savedRenderer2 = renderer;
    matrixB = readF32(renderer, 4);
    const savedMatrixB = matrixB;
    matrixA = readF32(renderer, 12);
    const resultOfF322 = f32(savedMatrixB + f32(matrixA * 0));
    scaleF32 = readF32(renderer, 20);
    valueF32 = f32(scaleF32 * 0);
    scaledMatrixB = f32(resultOfF322 + valueF32);
    writeF32(savedRenderer2, scaledMatrixB, 4);
    const savedRenderer3 = renderer;
    scaledMatrixC = f32(f32(matrixC + f32(matrixD * 0)) + amountF32);
    writeF32(savedRenderer3, scaledMatrixC, 8);
    const savedRenderer4 = renderer;
    matrixTy = f32(f32(matrixA + f32(matrixB * 0)) + valueF32);
    writeF32(savedRenderer4, matrixTy, 12);
    const savedRenderer5 = renderer;
    const savedSizeF32 = sizeF32;
    const savedMatrixD2 = matrixD;
    amountF32 = f32((count | 0) * .5);
    const resultOfF323 = f32(savedMatrixD2 * amountF32);
    const savedMatrixC = matrixC;
    valueF32 = f32((value | 0) * .5);
    matrixTx = f32(savedSizeF32 + f32(resultOfF323 + f32(savedMatrixC * valueF32)));
    writeF32(savedRenderer5, matrixTx, 16);
    const savedRenderer6 = renderer;
    scaleF32 = f32(scaleF32 + f32(f32(matrixB * amountF32) + f32(matrixA * valueF32)));
    writeF32(savedRenderer6, scaleF32, 20);
    amountF32 = readF32(camera, 12);
    count = readI32(camera, 16);
    value = readI32(camera, 20);
    const savedRenderer7 = renderer;
    const savedScaleF32 = scaleF32;
    valueF32 = f32(scaledMatrixB * 0);
    const savedValueF32 = valueF32;
    matrixB = f32(matrixTy * 0);
    matrixD = f32(savedScaleF32 + f32(savedValueF32 + matrixB));
    writeF32(savedRenderer7, matrixD, 20);
    const savedRenderer8 = renderer;
    const savedMatrixTx = matrixTx;
    matrixA = f32(scaledMatrixA * 0);
    const savedMatrixA = matrixA;
    sizeF32 = f32(scaledMatrixC * 0);
    matrixC = f32(savedMatrixTx + f32(savedMatrixA + sizeF32));
    writeF32(savedRenderer8, matrixC, 16);
    const savedRenderer9 = renderer;
    scaleF32 = f32(scaleF32 * 0);
    const savedScaleF322 = scaleF32;
    const savedValueF322 = valueF32;
    const savedMatrixTy = matrixTy;
    const savedAmountF32 = amountF32;
    amountF32 = f32(f32(value | 0) * .0009259259095415473);
    const savedAmountF322 = amountF32;
    valueF32 = f32(f32(count | 0) * .0005208333604969084);
    amountF32 = f32(savedAmountF32 * selectValue(savedAmountF322, valueF32, +(valueF32 < amountF32)));
    matrixTy = f32(savedScaleF322 + f32(savedValueF322 + f32(savedMatrixTy * amountF32)));
    writeF32(savedRenderer9, matrixTy, 12);
    const savedRenderer10 = renderer;
    valueF32 = f32(matrixTx * 0);
    matrixTx = f32(valueF32 + f32(matrixA + f32(scaledMatrixC * amountF32)));
    writeF32(savedRenderer10, matrixTx, 8);
    const savedRenderer11 = renderer;
    matrixB = f32(scaleF32 + f32(matrixB + f32(scaledMatrixB * amountF32)));
    writeF32(savedRenderer11, matrixB, 4);
    const savedRenderer12 = renderer;
    matrixA = f32(valueF32 + f32(sizeF32 + f32(scaledMatrixA * amountF32)));
    writeF32(savedRenderer12, matrixA);
    scaleF32 = readF32(camera, 8);
    sizeF32 = readF32(camera, 4);
    writeU8(renderer, 1, 48);
    const savedRenderer13 = renderer;
    const resultOfF324 = f32(f32(matrixB * 0) + matrixTy);
    amountF32 = f32(matrixD * 0);
    writeF32(savedRenderer13, f32(resultOfF324 + amountF32), 12);
    const savedRenderer14 = renderer;
    valueF32 = f32(matrixC * 0);
    writeF32(savedRenderer14, f32(valueF32 + f32(matrixTx + f32(matrixA * 0))), 8);
    writeF32(renderer, f32(f32(matrixB + f32(matrixTy * 0)) + amountF32), 4);
    writeF32(renderer, f32(valueF32 + f32(matrixA + f32(matrixTx * 0))));
    const savedRenderer15 = renderer;
    const savedMatrixD3 = matrixD;
    const savedMatrixTy2 = matrixTy;
    valueF32 = -scaleF32;
    writeF32(savedRenderer15, f32(savedMatrixD3 + f32(f32(savedMatrixTy2 * valueF32) - f32(sizeF32 * matrixB))), 20);
    writeF32(renderer, f32(matrixC + f32(f32(matrixTx * valueF32) - f32(matrixA * sizeF32))), 16);
    amount = readF64(frame, 32);
    return [ amount ];
  }
  /** Animate and draw the pointer marker for the local player. Original WAT 138635–139552. */  function updatePointerMarker(renderer, scratch, camera, state, amount) {
    let valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, valueF64 = 0, amountF64 = 0, scaleF64 = 0, stepF64 = 0, value = 0, count = 0, length = 0;
    updatePointerMarkerDone: {
      if (readU8(151560) & 1) {
        break updatePointerMarkerDone;
      }
      const resultOfAcquireGuard = acquireGuard(151560);
      if (+(resultOfAcquireGuard === 0)) {
        break updatePointerMarkerDone;
      }
      initializeSettings();
      releaseGuard(151560);
    }
    updatePointerMarkerDone2: {
      if (+(readU8(151504) === 0)) {
        break updatePointerMarkerDone2;
      }
      updatePointerMarkerDone3: {
        if (readU8(151560) & 1) {
          break updatePointerMarkerDone3;
        }
        const resultOfAcquireGuard2 = acquireGuard(151560);
        if (+(resultOfAcquireGuard2 === 0)) {
          break updatePointerMarkerDone3;
        }
        initializeSettings();
        releaseGuard(151560);
      }
      if (readU8(151516)) {
        break updatePointerMarkerDone2;
      }
      const resultOfUseTouchControls = useTouchControls();
      if (resultOfUseTouchControls) {
        break updatePointerMarkerDone2;
      }
      if (+(readI32(state, 256) === 0)) {
        break updatePointerMarkerDone2;
      }
      count = readI32(readI32(state, 264));
      if (+(count === 0)) {
        break updatePointerMarkerDone2;
      }
      valueF32 = f32(amount);
      let selectedValue1;
      updatePointerMarkerDone4: {
        value = readI32(count, 144);
        if (+(value === 0)) {
          amountF32 = readF32(441308);
          selectedValue1 = 0;
          break updatePointerMarkerDone4;
        }
        length = readI32(value, 120);
        if (+(readU8(length, 144) === 0)) {
          updateWorldTransform(length);
          value = readI32(count, 144);
        }
        amount = readF64(length, 152);
        writeF64(7938560, readF64(length, 160));
        writeF64(7938552, amount);
        amountF32 = readF32(441308);
        if (+(value === 0)) {
          selectedValue1 = 0;
          break updatePointerMarkerDone4;
        }
        void 0;
        selectedValue1 = selectValue(1, 0, +(readF32(readI32(value, 116), 8) > 0));
      }
      amountF64 = selectedValue1;
      scaleF64 = valueF32;
      valueF64 = amountF32;
      let selectedValue2;
      if (+(Math.abs(valueF64 - amountF64) < 1e-7)) {
        selectedValue2 = amountF64;
      } else {
        const resultOfPowF64 = powF64(.7, scaleF64 * .06);
        amount = 1 - resultOfPowF64;
        selectedValue2 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (amountF64 - valueF64) + valueF64;
      }
      writeF32(441308, f32(selectedValue2));
      amountF64 = readF32(441312);
      const savedAmountF64 = amountF64;
      const storedF32 = readF32(camera, 4);
      const resultOfF325 = f32(readI32(163824) | 0);
      count = readI32(camera, 16);
      const resultOfF326 = f32(resultOfF325 + (count | 0) * -.5);
      const storedF322 = readF32(camera, 12);
      value = readI32(camera, 20);
      amountF32 = f32(f32(value | 0) * .0009259259095415473);
      const savedAmountF323 = amountF32;
      valueF32 = f32(f32(count | 0) * .0005208333604969084);
      valueF32 = f32(storedF322 * selectValue(savedAmountF323, valueF32, +(valueF32 < amountF32)));
      valueF64 = f32(storedF32 + f32(resultOfF326 / valueF32));
      let selectedValue3;
      if (+(Math.abs(savedAmountF64 - valueF64) < 1e-7)) {
        selectedValue3 = valueF64;
      } else {
        const resultOfPowF642 = powF64(.6, scaleF64 * .06);
        amount = 1 - resultOfPowF642;
        selectedValue3 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (valueF64 - amountF64) + amountF64;
      }
      writeF32(441312, f32(selectedValue3));
      amountF64 = readF32(441316);
      const savedAmountF642 = amountF64;
      valueF64 = f32(readF32(camera, 8) + f32(f32(f32(readI32(163828) | 0) + (value | 0) * -.5) / valueF32));
      let selectedValue4;
      if (+(Math.abs(savedAmountF642 - valueF64) < 1e-7)) {
        selectedValue4 = valueF64;
      } else {
        const resultOfPowF643 = powF64(.6, scaleF64 * .06);
        amount = 1 - resultOfPowF643;
        selectedValue4 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (valueF64 - amountF64) + amountF64;
      }
      writeF32(441316, f32(selectedValue4));
      writeI32(scratch, readI32(renderer, 96), 1824);
      const savedBits4 = canvasSaveAbi(scratch + 1824 | 0) | 0;
      void savedBits4;
      writeI64(scratch + 2836 | 0, readI64(renderer, 56));
      writeI64(scratch + 2828 | 0, readI64(renderer, 48));
      writeI64(scratch + 2820 | 0, readI64(renderer, 40));
      writeI64(scratch + 2812 | 0, readI64(renderer, 32));
      writeI64(scratch + 2804 | 0, readI64(renderer, 24));
      writeI64(scratch + 2796 | 0, readI64(renderer, 16));
      writeI64(scratch + 2788 | 0, readI64(renderer, 8));
      writeI64(scratch, readI64(renderer), 2780);
      const savedRenderer16 = renderer;
      amount = readF64(renderer, 56) * (readF32(441308) * .2);
      amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
      writeF64(savedRenderer16, amount, 56);
      value = readI32(renderer, 96);
      writeF64(scratch, amount, 1816);
      writeI32(scratch, value, 1808);
      const savedBits5 = canvasSetGlobalAlphaAbi(scratch + 1808 | 0) | 0;
      void savedBits5;
      if (+(readU8(renderer, 49) !== 1)) {
        writeU8(renderer, 1, 49);
        writeI32(scratch, readI32(renderer, 96), 1792);
        const savedBits6 = canvasSetLineCapRoundAbi(scratch + 1792 | 0) | 0;
        void savedBits6;
      }
      if (readU8(renderer, 50)) {
        writeU8(renderer, 0, 50);
        writeI32(scratch, readI32(renderer, 96), 1776);
        const savedBits7 = canvasSetLineJoinRoundAbi(scratch + 1776 | 0) | 0;
        void savedBits7;
      }
      value = readI32(renderer, 96);
      writeI64(scratch, 4626322717216342016n, 1768);
      writeI32(scratch, value, 1760);
      const savedBits8 = canvasSetLineWidthAbi(scratch + 1760 | 0) | 0;
      void savedBits8;
      writeI32(scratch, readI32(renderer, 96), 1744);
      const savedBits9 = canvasBeginPathAbi(scratch + 1744 | 0) | 0;
      void savedBits9;
      const savedScratch2 = scratch;
      valueF32 = readF32(441308);
      amount = selectValue(0, Math.min(valueF32, 1), +(valueF32 < 0));
      matrixD = f32(amount * readF32(441316));
      writeF32(savedScratch2, matrixD, 2764);
      const savedScratch3 = scratch;
      matrixC = f32(amount * readF32(441312));
      writeF32(savedScratch3, matrixC, 2760);
      stepF64 = matrixD;
      const savedStepF64 = stepF64;
      scaleF64 = readF64(7938560);
      const savedDifference = savedStepF64 - scaleF64;
      amountF64 = matrixC;
      const savedAmountF643 = amountF64;
      amount = readF64(7938552);
      const resultOfAtan2F64 = atan2F64(savedDifference, savedAmountF643 - amount);
      valueF64 = resultOfAtan2F64;
      const savedRenderer17 = renderer;
      amount = amount - amountF64;
      const savedProduct = amount * amount;
      amount = scaleF64 - stepF64;
      amount = f32(Math.sqrt(savedProduct + amount * amount)) * .02 + -2;
      amount = selectValue(0, Math.min(amount, 1), +(amount < 0)) * readF64(renderer, 56);
      amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
      writeF64(savedRenderer17, amount, 56);
      value = readI32(renderer, 96);
      writeF64(scratch, amount, 1736);
      writeI32(scratch, value, 1728);
      const savedBits10 = canvasSetGlobalAlphaAbi(scratch + 1728 | 0) | 0;
      void savedBits10;
      matrixB = f32(valueF64);
      const resultOfSinF32 = sinF32(matrixB);
      valueF32 = resultOfSinF32;
      valueF64 = readF64(7938560) + f32(valueF32 * 50);
      const resultOfCosF32 = cosF32(matrixB);
      valueF32 = resultOfCosF32;
      amount = readF64(7938552) + f32(valueF32 * 50);
      updatePointerMarkerDone5: {
        if (+(readU8(renderer, 48) === 0)) {
          break updatePointerMarkerDone5;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory = compareMemory(renderer + 24 | 0, renderer, 24);
        if (+(resultOfCompareMemory === 0)) {
          break updatePointerMarkerDone5;
        }
        writeI64(renderer, readI64(renderer), 24);
        writeI64(renderer, readI64(renderer, 16), 40);
        writeI64(renderer, readI64(renderer, 8), 32);
        matrixA = readF32(renderer, 8);
        sizeF32 = readF32(renderer, 16);
        scaleF32 = readF32(renderer);
        value = readI32(renderer, 96);
        amountF32 = readF32(renderer, 4);
        valueF32 = readF32(renderer, 12);
        writeF64(scratch + 1712 | 0, readF32(renderer, 20));
        writeF64(scratch + 1704 | 0, sizeF32);
        writeF64(scratch + 1696 | 0, valueF32);
        writeF64(scratch + 1688 | 0, matrixA);
        writeF64(scratch + 1680 | 0, amountF32);
        writeI32(scratch, value, 1664);
        writeF64(scratch, scaleF32, 1672);
        const savedBits11 = canvasSetTransformAbi(scratch + 1664 | 0) | 0;
        void savedBits11;
      }
      count = scratch + 2780 | 0;
      value = readI32(renderer, 96);
      writeF64(scratch + 1648 | 0, valueF64);
      writeF64(scratch, amount, 1640);
      writeI32(scratch, value, 1632);
      const savedBits12 = canvasMoveToAbi(scratch + 1632 | 0) | 0;
      void savedBits12;
      appendPathLine(renderer, scratch + 2760 | 0);
      const savedScratch4 = scratch;
      amount = matrixB;
      amountF32 = f32(amount + 2.5132741228718345);
      const resultOfSinF322 = sinF32(amountF32);
      const resultOfF327 = f32(resultOfSinF322 * 50);
      valueF32 = readF32(441308);
      writeF32(savedScratch4, f32(f32(resultOfF327 * valueF32) + matrixD), 2756);
      const savedScratch5 = scratch;
      const savedValueF323 = valueF32;
      const resultOfCosF322 = cosF32(amountF32);
      writeF32(savedScratch5, f32(f32(savedValueF323 * f32(resultOfCosF322 * 50)) + matrixC), 2752);
      appendPathLine(renderer, scratch + 2752 | 0);
      appendPathLine(renderer, scratch + 2760 | 0);
      const savedScratch6 = scratch;
      amountF32 = f32(amount + -2.5132741228718345);
      const resultOfSinF323 = sinF32(amountF32);
      const resultOfF328 = f32(resultOfSinF323 * 50);
      valueF32 = readF32(441308);
      writeF32(savedScratch6, f32(f32(resultOfF328 * valueF32) + matrixD), 2756);
      const savedScratch7 = scratch;
      const savedValueF324 = valueF32;
      const resultOfCosF323 = cosF32(amountF32);
      writeF32(savedScratch7, f32(f32(savedValueF324 * f32(resultOfCosF323 * 50)) + matrixC), 2752);
      appendPathLine(renderer, scratch + 2752 | 0);
      value = readU8(renderer, 69);
      writeI32(scratch, readI32(renderer, 96), 1616);
      const savedScratch8 = scratch;
      value = selectValue(50, 51, value);
      writeI32(savedScratch8, value, 1628);
      writeI32(scratch, value, 1624);
      writeI32(scratch, value, 1620);
      const savedBits13 = canvasSetStrokeRgbAbi(scratch + 1616 | 0) | 0;
      void savedBits13;
      updatePointerMarkerDone6: {
        if (+(readU8(renderer, 48) === 0)) {
          break updatePointerMarkerDone6;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory2 = compareMemory(renderer + 24 | 0, renderer, 24);
        if (+(resultOfCompareMemory2 === 0)) {
          break updatePointerMarkerDone6;
        }
        writeI64(renderer, readI64(renderer), 24);
        writeI64(renderer, readI64(renderer, 16), 40);
        writeI64(renderer, readI64(renderer, 8), 32);
        matrixA = readF32(renderer, 8);
        sizeF32 = readF32(renderer, 16);
        scaleF32 = readF32(renderer);
        value = readI32(renderer, 96);
        amountF32 = readF32(renderer, 4);
        valueF32 = readF32(renderer, 12);
        writeF64(scratch + 1600 | 0, readF32(renderer, 20));
        writeF64(scratch + 1592 | 0, sizeF32);
        writeF64(scratch + 1584 | 0, valueF32);
        writeF64(scratch + 1576 | 0, matrixA);
        writeF64(scratch + 1568 | 0, amountF32);
        writeI32(scratch, value, 1552);
        writeF64(scratch, scaleF32, 1560);
        const savedBits14 = canvasSetTransformAbi(scratch + 1552 | 0) | 0;
        void savedBits14;
      }
      writeI32(scratch, readI32(renderer, 96), 1536);
      const savedBits15 = canvasStrokeAbi(scratch + 1536 | 0) | 0;
      void savedBits15;
      writeI64(renderer, readI64(count, 56), 56);
      writeI64(renderer, readI64(count, 48), 48);
      writeI64(renderer, readI64(count, 40), 40);
      writeI64(renderer, readI64(count, 32), 32);
      writeI64(renderer, readI64(count, 24), 24);
      writeI64(renderer, readI64(count, 16), 16);
      writeI64(renderer, readI64(count, 8), 8);
      writeI64(renderer, readI64(count));
      writeI32(scratch, readI32(renderer, 96), 1520);
      const savedBits16 = canvasRestoreAbi(scratch + 1520 | 0) | 0;
      void savedBits16;
    }
  }
  /** Draw entities in the background component group. Original WAT 139553–139655. */  function drawBackgroundEntities(renderer, scratch, camera, state, frame) {
    let count = 0, transformVector = 0, smallestVector = 0, transformCount = 0, entity = 0;
    const savedBits17 = state + 536 | 0;
    transformVector = state + 1276 | 0;
    const savedTransformVector = transformVector;
    transformCount = readI32(state, 1276);
    smallestVector = selectValue(savedBits17, savedTransformVector, +(transformCount >>> 0 > readI32(state, 536) >>> 0));
    count = readI32(smallestVector);
    if (count) {
      transformCount = 0;
      drawBackgroundEntitiesLoop: while (true) {
        entity = readI32(readI32(readI32(smallestVector, 8) + (transformCount << 2) | 0));
        writeI32(scratch, 0, 2776);
        writeU8(scratch, 0, 2780);
        writeU16(scratch, 4104, 2777);
        writeI32(scratch, readI32(entity, 45), 2760);
        writeU8(scratch, readU8(entity, 49), 2764);
        writeU8(scratch, 0, 2760);
        writeU8(scratch, 0, 2764);
        writeU8(scratch, 0, 2763);
        writeU8(scratch, readU8(scratch, 2761) & 8, 2761);
        writeU8(scratch, readU8(scratch, 2762) & 16, 2762);
        const resultOfCompareMemory3 = compareMemory(scratch + 2760 | 0, scratch + 2776 | 0, 5);
        if (+(resultOfCompareMemory3 === 0)) {
          drawEntity(camera, renderer, readI32(readI32(entity, 92)), f32(readF64(frame, 32)));
          count = readI32(smallestVector);
        }
        transformCount = transformCount + 1 | 0;
        if (+(transformCount >>> 0 < count >>> 0)) {
          continue drawBackgroundEntitiesLoop;
        }
        break;
      }
      transformCount = readI32(transformVector);
    }
    return [ transformVector, transformCount ];
  }
  /** Interpolate current and trailing health values, then draw health bars. Original WAT 139656–141386. */  function drawHealthBars(renderer, scratch, state, frame, transformVector, transformCount) {
    let entry = 0, entityIndex = 0, healthVector = 0, cachedTransform = 0, savedDrawingState = 0, smallestVector = 0, valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, savedAlpha = 0, elapsedMilliseconds = 0, smoothing = 0, healthRatio = 0, component = 0, amount = 0, healthCount = 0;
    savedDrawingState = scratch + 2780 | 0;
    healthVector = state + 1788 | 0;
    const savedHealthVector = healthVector;
    const savedTransformVector2 = transformVector;
    const savedTransformCount = transformCount;
    healthCount = readI32(state, 1788);
    smallestVector = selectValue(savedHealthVector, savedTransformVector2, +(savedTransformCount >>> 0 > healthCount >>> 0));
    entry = readI32(smallestVector);
    if (entry) {
      cachedTransform = renderer + 24 | 0;
      entityIndex = 0;
      drawHealthBarsLoop: while (true) {
        component = readI32(readI32(readI32(smallestVector, 8) + (entityIndex << 2) | 0));
        writeI32(scratch, 0, 2776);
        writeU8(scratch, 0, 2780);
        writeU16(scratch, 8208, 2778);
        writeI32(scratch, readI32(component, 45), 2760);
        writeU8(scratch, readU8(component, 49), 2764);
        writeU16(scratch, 0, 2760);
        writeU8(scratch, 0, 2764);
        writeU8(scratch, readU8(scratch, 2762) & 16, 2762);
        writeU8(scratch, readU8(scratch, 2763) & 32, 2763);
        const resultOfCompareMemory4 = compareMemory(scratch + 2760 | 0, scratch + 2776 | 0, 5);
        if (+(resultOfCompareMemory4 === 0)) {
          healthCount = readI32(component, 152);
          component = readI32(component, 120);
          writeI32(scratch, readI32(renderer, 96), 1504);
          const savedBits18 = canvasSaveAbi(scratch + 1504 | 0) | 0;
          void savedBits18;
          writeI64(savedDrawingState, readI64(renderer, 56), 56);
          writeI64(savedDrawingState, readI64(renderer, 48), 48);
          writeI64(savedDrawingState, readI64(renderer, 40), 40);
          writeI64(savedDrawingState, readI64(renderer, 32), 32);
          writeI64(savedDrawingState, readI64(cachedTransform), 24);
          writeI64(savedDrawingState, readI64(renderer, 16), 16);
          writeI64(savedDrawingState, readI64(renderer, 8), 8);
          writeI64(savedDrawingState, readI64(renderer));
          if (+(readU8(component, 144) === 0)) {
            updateWorldTransform(component);
          }
          savedAlpha = readF64(component, 152);
          amount = readF64(component, 160);
          writeU8(renderer, 1, 48);
          const savedRenderer18 = renderer;
          matrixD = readF32(renderer, 4);
          const resultOfF329 = f32(matrixD * 0);
          matrixC = readF32(renderer, 12);
          const resultOfF3210 = f32(resultOfF329 + matrixC);
          sizeF32 = readF32(renderer, 20);
          amountF32 = f32(sizeF32 * 0);
          writeF32(savedRenderer18, f32(resultOfF3210 + amountF32), 12);
          const savedRenderer19 = renderer;
          matrixB = readF32(renderer);
          const resultOfF3211 = f32(matrixB * 0);
          matrixA = readF32(renderer, 8);
          const resultOfF3212 = f32(resultOfF3211 + matrixA);
          scaleF32 = readF32(renderer, 16);
          valueF32 = f32(scaleF32 * 0);
          writeF32(savedRenderer19, f32(resultOfF3212 + valueF32), 8);
          writeF32(renderer, f32(f32(matrixD + f32(matrixC * 0)) + amountF32), 4);
          writeF32(renderer, f32(f32(matrixB + f32(matrixA * 0)) + valueF32));
          const savedRenderer20 = renderer;
          const savedSizeF322 = sizeF32;
          const savedMatrixD4 = matrixD;
          amountF32 = f32(savedAlpha);
          const resultOfF3213 = f32(savedMatrixD4 * amountF32);
          const savedMatrixC2 = matrixC;
          valueF32 = f32(amount);
          writeF32(savedRenderer20, f32(savedSizeF322 + f32(resultOfF3213 + f32(savedMatrixC2 * valueF32))), 20);
          writeF32(renderer, f32(scaleF32 + f32(f32(matrixB * amountF32) + f32(matrixA * valueF32))), 16);
          component = readI32(healthCount);
          transformCount = readI32(component, 116);
          if (transformCount) {
            component = readU8(readI32(component, 136), 16);
            smoothing = selectValue(1, .2, component);
            elapsedMilliseconds = f32(readF64(frame, 32));
            amountF32 = f32(readF32(transformCount, 8) / readF32(transformCount, 12));
            healthRatio = amountF32;
            amount = healthRatio;
            const savedHealthCount = healthCount;
            savedAlpha = readF32(healthCount, 800);
            let selectedValue5;
            if (+(Math.abs(savedAlpha - healthRatio) < 1e-7)) {
              selectedValue5 = amount;
            } else {
              const savedDifference2 = healthRatio - savedAlpha;
              const resultOfPowF644 = powF64(1 - smoothing, elapsedMilliseconds * .06);
              amount = 1 - resultOfPowF644;
              selectedValue5 = savedDifference2 * selectValue(0, Math.min(amount, 1), +(amount < 0)) + savedAlpha;
            }
            valueF32 = f32(selectedValue5);
            writeF32(savedHealthCount, valueF32, 800);
            if (selectValue(1, +(f32(valueF32 - amountF32) < .001), component)) {
              const savedHealthCount2 = healthCount;
              savedAlpha = readF32(healthCount, 796);
              let selectedValue6;
              if (+(Math.abs(savedAlpha - healthRatio) < 1e-7)) {
                selectedValue6 = healthRatio;
              } else {
                const resultOfPowF645 = powF64(selectValue(0, .9, component), elapsedMilliseconds * .06);
                amount = 1 - resultOfPowF645;
                selectedValue6 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (healthRatio - savedAlpha) + savedAlpha;
              }
              writeF32(savedHealthCount2, f32(selectedValue6), 796);
            }
            const savedHealthCount3 = healthCount;
            savedAlpha = (+(amountF32 < 1) & +(readF32(transformCount, 8) > 0)) >>> 0;
            const savedSavedAlpha = savedAlpha;
            const savedSmoothing = smoothing;
            const savedSavedAlpha2 = savedAlpha;
            amount = readF32(healthCount, 792);
            valueF32 = f32(selectValue(savedSavedAlpha, savedSmoothing * (savedSavedAlpha2 - amount) + amount, +(Math.abs(amount - savedAlpha) < 1e-7)));
            writeF32(savedHealthCount3, valueF32, 792);
            const savedRenderer21 = renderer;
            amount = readF64(renderer, 56) * valueF32;
            amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
            writeF64(savedRenderer21, amount, 56);
            component = readI32(renderer, 96);
            writeF64(scratch, amount, 1496);
            writeI32(scratch, component, 1488);
            const savedBits19 = canvasSetGlobalAlphaAbi(scratch + 1488 | 0) | 0;
            void savedBits19;
            if (+(readU8(renderer, 49) !== 1)) {
              writeU8(renderer, 1, 49);
              writeI32(scratch, readI32(renderer, 96), 1472);
              const savedBits20 = canvasSetLineCapRoundAbi(scratch + 1472 | 0) | 0;
              void savedBits20;
            }
            component = readI32(renderer, 96);
            writeI64(scratch, 4621819117588971520n, 1464);
            writeI32(scratch, component, 1456);
            const savedBits21 = canvasSetLineWidthAbi(scratch + 1456 | 0) | 0;
            void savedBits21;
            writeI32(scratch, readI32(renderer, 96), 1440);
            const savedBits22 = canvasBeginPathAbi(scratch + 1440 | 0) | 0;
            void savedBits22;
            drawHealthBarsDone: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory5 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory5 === 0)) {
                break drawHealthBarsDone;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch + 1424 | 0, readF32(renderer, 20));
              writeF64(scratch + 1416 | 0, sizeF32);
              writeF64(scratch + 1408 | 0, valueF32);
              writeF64(scratch + 1400 | 0, matrixA);
              writeF64(scratch + 1392 | 0, amountF32);
              writeI32(scratch, component, 1376);
              writeF64(scratch, scaleF32, 1384);
              const savedBits23 = canvasSetTransformAbi(scratch + 1376 | 0) | 0;
              void savedBits23;
            }
            component = readI32(renderer, 96);
            writeI64(scratch + 1360 | 0, 4632233691727265792n);
            writeI64(scratch, -4593249407452839936n, 1352);
            writeI32(scratch, component, 1344);
            const savedBits24 = canvasMoveToAbi(scratch + 1344 | 0) | 0;
            void savedBits24;
            drawHealthBarsDone2: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone2;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory6 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory6 === 0)) {
                break drawHealthBarsDone2;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch + 1328 | 0, readF32(renderer, 20));
              writeF64(scratch + 1320 | 0, sizeF32);
              writeF64(scratch + 1312 | 0, valueF32);
              writeF64(scratch + 1304 | 0, matrixA);
              writeF64(scratch + 1296 | 0, amountF32);
              writeI32(scratch, component, 1280);
              writeF64(scratch, scaleF32, 1288);
              const savedBits25 = canvasSetTransformAbi(scratch + 1280 | 0) | 0;
              void savedBits25;
            }
            component = readI32(renderer, 96);
            writeI64(scratch + 1264 | 0, 4632233691727265792n);
            writeI64(scratch, 4630122629401935872n, 1256);
            writeI32(scratch, component, 1248);
            const savedBits26 = canvasLineToAbi(scratch + 1248 | 0) | 0;
            void savedBits26;
            component = readU8(renderer, 69);
            writeI32(scratch, readI32(renderer, 96), 1232);
            const savedScratch9 = scratch;
            component = selectValue(50, 51, component);
            writeI32(savedScratch9, component, 1244);
            writeI32(scratch, component, 1240);
            writeI32(scratch, component, 1236);
            const savedBits27 = canvasSetStrokeRgbAbi(scratch + 1232 | 0) | 0;
            void savedBits27;
            drawHealthBarsDone3: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone3;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory7 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory7 === 0)) {
                break drawHealthBarsDone3;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch + 1216 | 0, readF32(renderer, 20));
              writeF64(scratch + 1208 | 0, sizeF32);
              writeF64(scratch + 1200 | 0, valueF32);
              writeF64(scratch + 1192 | 0, matrixA);
              writeF64(scratch + 1184 | 0, amountF32);
              writeI32(scratch, component, 1168);
              writeF64(scratch, scaleF32, 1176);
              const savedBits28 = canvasSetTransformAbi(scratch + 1168 | 0) | 0;
              void savedBits28;
            }
            writeI32(scratch, readI32(renderer, 96), 1152);
            const savedBits29 = canvasStrokeAbi(scratch + 1152 | 0) | 0;
            void savedBits29;
            const savedRenderer22 = renderer;
            savedAlpha = readF64(renderer, 56);
            const savedSavedAlpha3 = savedAlpha;
            amount = readF32(healthCount, 796) * 30;
            amount = savedSavedAlpha3 * selectValue(0, Math.min(amount, 1), +(amount < 0));
            amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
            writeF64(savedRenderer22, amount, 56);
            component = readI32(renderer, 96);
            writeF64(scratch, amount, 1144);
            writeI32(scratch, component, 1136);
            const savedBits30 = canvasSetGlobalAlphaAbi(scratch + 1136 | 0) | 0;
            void savedBits30;
            component = readI32(renderer, 96);
            writeI64(scratch, 4618441417868443648n, 1128);
            writeI32(scratch, component, 1120);
            const savedBits31 = canvasSetLineWidthAbi(scratch + 1120 | 0) | 0;
            void savedBits31;
            writeI32(scratch, readI32(renderer, 96), 1104);
            const savedBits32 = canvasBeginPathAbi(scratch + 1104 | 0) | 0;
            void savedBits32;
            drawHealthBarsDone4: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone4;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory8 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory8 === 0)) {
                break drawHealthBarsDone4;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch + 1088 | 0, readF32(renderer, 20));
              writeF64(scratch + 1080 | 0, sizeF32);
              writeF64(scratch + 1072 | 0, valueF32);
              writeF64(scratch + 1064 | 0, matrixA);
              writeF64(scratch + 1056 | 0, amountF32);
              writeI32(scratch, component, 1040);
              writeF64(scratch, scaleF32, 1048);
              const savedBits33 = canvasSetTransformAbi(scratch + 1040 | 0) | 0;
              void savedBits33;
            }
            component = readI32(renderer, 96);
            writeI64(scratch + 1024 | 0, 4632233691727265792n);
            writeI64(scratch, -4593249407452839936n, 1016);
            writeI32(scratch, component, 1008);
            const savedBits34 = canvasMoveToAbi(scratch + 1008 | 0) | 0;
            void savedBits34;
            amount = f32(f32(readF32(healthCount, 796) * 70) + -35);
            drawHealthBarsDone5: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone5;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory9 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory9 === 0)) {
                break drawHealthBarsDone5;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch, readF32(renderer, 20), 992);
              writeF64(scratch, sizeF32, 984);
              writeF64(scratch, valueF32, 976);
              writeF64(scratch, matrixA, 968);
              writeF64(scratch, amountF32, 960);
              writeI32(scratch, component, 944);
              writeF64(scratch, scaleF32, 952);
              const savedBits35 = canvasSetTransformAbi(scratch + 944 | 0) | 0;
              void savedBits35;
            }
            component = readI32(renderer, 96);
            writeI64(scratch, 4632233691727265792n, 928);
            writeF64(scratch, amount, 920);
            writeI32(scratch, component, 912);
            const savedBits36 = canvasLineToAbi(scratch + 912 | 0) | 0;
            void savedBits36;
            transformCount = readU8(renderer, 69);
            writeI32(scratch, readI32(renderer, 96), 896);
            const savedScratch10 = scratch;
            component = selectValue(87, 52, transformCount);
            writeI32(savedScratch10, component, 908);
            writeI32(scratch, component, 904);
            writeI32(scratch, selectValue(87, 221, transformCount), 900);
            const savedBits37 = canvasSetStrokeRgbAbi(scratch + 896 | 0) | 0;
            void savedBits37;
            drawHealthBarsDone6: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone6;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory10 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory10 === 0)) {
                break drawHealthBarsDone6;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch, readF32(renderer, 20), 880);
              writeF64(scratch, sizeF32, 872);
              writeF64(scratch, valueF32, 864);
              writeF64(scratch, matrixA, 856);
              writeF64(scratch, amountF32, 848);
              writeI32(scratch, component, 832);
              writeF64(scratch, scaleF32, 840);
              const savedBits38 = canvasSetTransformAbi(scratch + 832 | 0) | 0;
              void savedBits38;
            }
            writeI32(scratch, readI32(renderer, 96), 816);
            const savedBits39 = canvasStrokeAbi(scratch + 816 | 0) | 0;
            void savedBits39;
            const savedRenderer23 = renderer;
            amount = selectValue(0, Math.min(savedAlpha, 1), +(savedAlpha < 0));
            writeF64(savedRenderer23, amount, 56);
            component = readI32(renderer, 96);
            writeF64(scratch, amount, 808);
            writeI32(scratch, component, 800);
            const savedBits40 = canvasSetGlobalAlphaDuplicateAbi(scratch + 800 | 0) | 0;
            void savedBits40;
            const savedRenderer24 = renderer;
            savedAlpha = readF64(renderer, 56);
            const savedSavedAlpha4 = savedAlpha;
            amount = readF32(healthCount, 800) * 30;
            amount = savedSavedAlpha4 * selectValue(0, Math.min(amount, 1), +(amount < 0));
            amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
            writeF64(savedRenderer24, amount, 56);
            component = readI32(renderer, 96);
            writeF64(scratch, amount, 792);
            writeI32(scratch, component, 784);
            const savedBits41 = canvasSetGlobalAlphaAbi(scratch + 784 | 0) | 0;
            void savedBits41;
            component = readI32(renderer, 96);
            writeI64(scratch, 4619567317775286272n, 776);
            writeI32(scratch, component, 768);
            const savedBits42 = canvasSetLineWidthAbi(scratch + 768 | 0) | 0;
            void savedBits42;
            writeI32(scratch, readI32(renderer, 96), 752);
            const savedBits43 = canvasBeginPathAbi(scratch + 752 | 0) | 0;
            void savedBits43;
            drawHealthBarsDone7: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone7;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory11 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory11 === 0)) {
                break drawHealthBarsDone7;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch, readF32(renderer, 20), 736);
              writeF64(scratch, sizeF32, 728);
              writeF64(scratch, valueF32, 720);
              writeF64(scratch, matrixA, 712);
              writeF64(scratch, amountF32, 704);
              writeI32(scratch, component, 688);
              writeF64(scratch, scaleF32, 696);
              const savedBits44 = canvasSetTransformAbi(scratch + 688 | 0) | 0;
              void savedBits44;
            }
            component = readI32(renderer, 96);
            writeI64(scratch, 4632233691727265792n, 672);
            writeI64(scratch, -4593249407452839936n, 664);
            writeI32(scratch, component, 656);
            const savedBits45 = canvasMoveToAbi(scratch + 656 | 0) | 0;
            void savedBits45;
            amount = f32(f32(readF32(healthCount, 800) * 70) + -35);
            drawHealthBarsDone8: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone8;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory12 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory12 === 0)) {
                break drawHealthBarsDone8;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch, readF32(renderer, 20), 640);
              writeF64(scratch, sizeF32, 632);
              writeF64(scratch, valueF32, 624);
              writeF64(scratch, matrixA, 616);
              writeF64(scratch, amountF32, 608);
              writeI32(scratch, component, 592);
              writeF64(scratch, scaleF32, 600);
              const savedBits46 = canvasSetTransformAbi(scratch + 592 | 0) | 0;
              void savedBits46;
            }
            component = readI32(renderer, 96);
            writeI64(scratch, 4632233691727265792n, 576);
            writeF64(scratch, amount, 568);
            writeI32(scratch, component, 560);
            const savedBits47 = canvasLineToAbi(scratch + 560 | 0) | 0;
            void savedBits47;
            component = readU8(renderer, 69);
            writeI32(scratch, readI32(renderer, 96), 544);
            writeI32(scratch, selectValue(186, 52, component), 556);
            writeI32(scratch, selectValue(186, 221, component), 552);
            writeI32(scratch, selectValue(186, 117, component), 548);
            const savedBits48 = canvasSetStrokeRgbAbi(scratch + 544 | 0) | 0;
            void savedBits48;
            drawHealthBarsDone9: {
              if (+(readU8(renderer, 48) === 0)) {
                break drawHealthBarsDone9;
              }
              writeU8(renderer, 0, 48);
              const resultOfCompareMemory13 = compareMemory(cachedTransform, renderer, 24);
              if (+(resultOfCompareMemory13 === 0)) {
                break drawHealthBarsDone9;
              }
              writeI64(cachedTransform, readI64(renderer));
              writeI64(cachedTransform, readI64(renderer, 16), 16);
              writeI64(cachedTransform, readI64(renderer, 8), 8);
              matrixA = readF32(renderer, 8);
              sizeF32 = readF32(renderer, 16);
              scaleF32 = readF32(renderer);
              component = readI32(renderer, 96);
              amountF32 = readF32(renderer, 4);
              valueF32 = readF32(renderer, 12);
              writeF64(scratch, readF32(renderer, 20), 528);
              writeF64(scratch, sizeF32, 520);
              writeF64(scratch, valueF32, 512);
              writeF64(scratch, matrixA, 504);
              writeF64(scratch, amountF32, 496);
              writeI32(scratch, component, 480);
              writeF64(scratch, scaleF32, 488);
              const savedBits49 = canvasSetTransformAbi(scratch + 480 | 0) | 0;
              void savedBits49;
            }
            writeI32(scratch, readI32(renderer, 96), 464);
            const savedBits50 = canvasStrokeAbi(scratch + 464 | 0) | 0;
            void savedBits50;
            const savedRenderer25 = renderer;
            amount = selectValue(0, Math.min(savedAlpha, 1), +(savedAlpha < 0));
            writeF64(savedRenderer25, amount, 56);
            component = readI32(renderer, 96);
            writeF64(scratch, amount, 456);
            writeI32(scratch, component, 448);
            const savedBits51 = canvasSetGlobalAlphaDuplicateAbi(scratch + 448 | 0) | 0;
            void savedBits51;
          }
          writeI64(renderer, readI64(savedDrawingState));
          writeI64(renderer, readI64(savedDrawingState, 56), 56);
          writeI64(renderer, readI64(savedDrawingState, 48), 48);
          writeI64(renderer, readI64(savedDrawingState, 40), 40);
          writeI64(renderer, readI64(savedDrawingState, 32), 32);
          writeI64(cachedTransform, readI64(savedDrawingState, 24));
          writeI64(renderer, readI64(savedDrawingState, 16), 16);
          writeI64(renderer, readI64(savedDrawingState, 8), 8);
          writeI32(scratch, readI32(renderer, 96), 432);
          const savedBits52 = canvasRestoreAbi(scratch + 432 | 0) | 0;
          void savedBits52;
          entry = readI32(smallestVector);
        }
        entityIndex = entityIndex + 1 | 0;
        if (+(entityIndex >>> 0 < entry >>> 0)) {
          continue drawHealthBarsLoop;
        }
        break;
      }
      healthCount = readI32(healthVector);
      transformCount = readI32(transformVector);
    }
    return [ healthVector, savedDrawingState, transformCount, healthCount ];
  }
  /** Draw interpolated entity-name labels, excluding the local player. Original WAT 141387–141803. */  function drawEntityNames(renderer, scratch, healthVector, localHandle, state, savedDrawingState, frame, transformVector, nameVector, entityIndex) {
    let label = 0, valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, valueF64 = 0, amountF64 = 0, entity = 0, amount = 0;
    const savedBits53 = state + 1188 | 0;
    const savedHealthVector2 = healthVector;
    const savedTransformVector3 = transformVector;
    entity = +(nameVector >>> 0 > entityIndex >>> 0);
    nameVector = selectValue(savedBits53, selectValue(savedHealthVector2, savedTransformVector3, entity), +(readI32(state, 1188) >>> 0 < selectValue(entityIndex, nameVector, entity) >>> 0));
    label = readI32(nameVector);
    if (label) {
      entityIndex = 0;
      drawEntityNamesLoop: while (true) {
        entity = readI32(readI32(readI32(nameVector, 8) + (entityIndex << 2) | 0));
        writeI32(scratch, 0, 2776);
        writeU8(scratch, 0, 2780);
        writeU16(scratch, 8212, 2778);
        writeI32(scratch, readI32(entity, 45), 2760);
        writeU8(scratch, readU8(entity, 49), 2764);
        writeU16(scratch, 0, 2760);
        writeU8(scratch, 0, 2764);
        writeU8(scratch, readU8(scratch, 2762) & 20, 2762);
        writeU8(scratch, readU8(scratch, 2763) & 32, 2763);
        drawEntityNamesDone: {
          const resultOfCompareMemory14 = compareMemory(scratch + 2760 | 0, scratch + 2776 | 0, 5);
          if (resultOfCompareMemory14) {
            break drawEntityNamesDone;
          }
          if (+(readI32(readI32(entity, 152)) === readI32(localHandle, 144))) {
            break drawEntityNamesDone;
          }
          label = readI32(entity, 112);
          entity = readI32(entity, 120);
          writeI32(scratch, readI32(renderer, 96), 416);
          const savedBits54 = canvasSaveAbi(scratch + 416 | 0) | 0;
          void savedBits54;
          writeI64(savedDrawingState, readI64(renderer, 56), 56);
          writeI64(savedDrawingState, readI64(renderer, 48), 48);
          writeI64(savedDrawingState, readI64(renderer, 40), 40);
          writeI64(savedDrawingState, readI64(renderer, 32), 32);
          writeI64(savedDrawingState, readI64(renderer, 24), 24);
          writeI64(savedDrawingState, readI64(renderer, 16), 16);
          writeI64(savedDrawingState, readI64(renderer, 8), 8);
          writeI64(savedDrawingState, readI64(renderer));
          if (+(readU8(entity, 144) === 0)) {
            updateWorldTransform(entity);
          }
          valueF64 = readF64(entity, 152);
          amount = readF64(entity, 160);
          writeU8(renderer, 1, 48);
          const savedRenderer26 = renderer;
          matrixD = readF32(renderer, 4);
          const resultOfF3214 = f32(matrixD * 0);
          matrixC = readF32(renderer, 12);
          const resultOfF3215 = f32(resultOfF3214 + matrixC);
          sizeF32 = readF32(renderer, 20);
          amountF32 = f32(sizeF32 * 0);
          writeF32(savedRenderer26, f32(resultOfF3215 + amountF32), 12);
          const savedRenderer27 = renderer;
          matrixB = readF32(renderer);
          const resultOfF3216 = f32(matrixB * 0);
          matrixA = readF32(renderer, 8);
          const resultOfF3217 = f32(resultOfF3216 + matrixA);
          scaleF32 = readF32(renderer, 16);
          valueF32 = f32(scaleF32 * 0);
          writeF32(savedRenderer27, f32(resultOfF3217 + valueF32), 8);
          writeF32(renderer, f32(f32(matrixD + f32(matrixC * 0)) + amountF32), 4);
          writeF32(renderer, f32(f32(matrixB + f32(matrixA * 0)) + valueF32));
          const savedRenderer28 = renderer;
          const savedSizeF323 = sizeF32;
          const savedMatrixD5 = matrixD;
          amountF32 = f32(valueF64);
          const resultOfF3218 = f32(savedMatrixD5 * amountF32);
          const savedMatrixC3 = matrixC;
          valueF32 = f32(amount);
          writeF32(savedRenderer28, f32(savedSizeF323 + f32(resultOfF3218 + f32(savedMatrixC3 * valueF32))), 20);
          writeF32(renderer, f32(scaleF32 + f32(f32(matrixB * amountF32) + f32(matrixA * valueF32))), 16);
          const savedLabel = label;
          amountF64 = readF32(label, 176);
          const savedAmountF644 = amountF64;
          valueF64 = selectValue(1, 0, +(readF32(readI32(readI32(label), 116), 8) > 0));
          let selectedValue7;
          if (+(Math.abs(savedAmountF644 - valueF64) < 1e-7)) {
            selectedValue7 = valueF64;
          } else {
            const resultOfPowF646 = powF64(.7, f32(readF64(frame, 32)) * .06);
            amount = 1 - resultOfPowF646;
            selectedValue7 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (valueF64 - amountF64) + amountF64;
          }
          valueF32 = f32(selectedValue7);
          writeF32(savedLabel, valueF32, 176);
          amount = valueF32;
          if (+(amount > .001)) {
            const savedRenderer29 = renderer;
            valueF64 = readF64(renderer, 56);
            amount = valueF64 * amount;
            amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
            writeF64(savedRenderer29, amount, 56);
            entity = readI32(renderer, 96);
            writeF64(scratch, amount, 408);
            writeI32(scratch, entity, 400);
            const savedBits55 = canvasSetGlobalAlphaAbi(scratch + 400 | 0) | 0;
            void savedBits55;
            entity = label + 24 | 0;
            prepareTextLabel(entity, label + 8 | 0);
            drawTextLabel(entity, renderer, 0, -45, 1);
            const savedRenderer30 = renderer;
            amount = selectValue(0, Math.min(valueF64, 1), +(valueF64 < 0));
            writeF64(savedRenderer30, amount, 56);
            entity = readI32(renderer, 96);
            writeF64(scratch, amount, 392);
            writeI32(scratch, entity, 384);
            const savedBits56 = canvasSetGlobalAlphaDuplicateAbi(scratch + 384 | 0) | 0;
            void savedBits56;
          }
          writeI64(renderer, readI64(savedDrawingState));
          writeI64(renderer, readI64(savedDrawingState, 56), 56);
          writeI64(renderer, readI64(savedDrawingState, 48), 48);
          writeI64(renderer, readI64(savedDrawingState, 40), 40);
          writeI64(renderer, readI64(savedDrawingState, 32), 32);
          writeI64(renderer, readI64(savedDrawingState, 24), 24);
          writeI64(renderer, readI64(savedDrawingState, 16), 16);
          writeI64(renderer, readI64(savedDrawingState, 8), 8);
          writeI32(scratch, readI32(renderer, 96), 368);
          const savedBits57 = canvasRestoreAbi(scratch + 368 | 0) | 0;
          void savedBits57;
          label = readI32(nameVector);
        }
        entityIndex = entityIndex + 1 | 0;
        if (+(entityIndex >>> 0 < label >>> 0)) {
          continue drawEntityNamesLoop;
        }
        break;
      }
    }
  }
  /** Animate the visuals created by snapshot event14. Original WAT 141804–143079. */  function drawEvent14Effects(renderer, scratch, frame) {
    let effect = 0, index = 0, effectSlot = 0, count = 0, cachedTransform = 0, savedDrawingState = 0, smallestVector = 0, valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, matrixTx = 0, matrixTy = 0, scaledMatrixC = 0, scaledMatrixD = 0, elapsedF32 = 0, scaledMatrixB = 0, projectionA = 0, projectionB = 0, valueF64 = 0, amountF64 = 0, entity = 0, amount = 0, effectIndex = 0, target = 0;
    drawEvent14EffectsDone: {
      if (readU8(7931360) & 1) {
        break drawEvent14EffectsDone;
      }
      const resultOfAcquireGuard3 = acquireGuard(7931360);
      if (+(resultOfAcquireGuard3 === 0)) {
        break drawEvent14EffectsDone;
      }
      initializeSceneUi();
      releaseGuard(7931360);
    }
    effect = readI32(selectValue(7931292, 4420, readU8(7931352)));
    const savedBits58 = effect + 36 | 0;
    const savedBits59 = effect + 1452 | 0;
    const savedBits60 = effect + 1276 | 0;
    target = readI32(effect, 1276);
    const savedTarget = target;
    effectIndex = readI32(effect, 1452);
    entity = +(savedTarget >>> 0 > effectIndex >>> 0);
    smallestVector = selectValue(savedBits58, selectValue(savedBits59, savedBits60, entity), +(readI32(effect, 36) >>> 0 < selectValue(effectIndex, target, entity) >>> 0));
    count = readI32(smallestVector);
    if (count) {
      cachedTransform = scratch + 2780 | 0;
      elapsedF32 = f32(readF64(frame, 32));
      const resultOfPowF647 = powF64(.8, elapsedF32 * .06);
      amount = 1 - resultOfPowF647;
      amountF64 = selectValue(0, Math.min(amount, 1), +(amount < 0));
      savedDrawingState = renderer + 24 | 0;
      index = scratch + 2784 | 0;
      effectIndex = 0;
      drawEvent14EffectsLoop: while (true) {
        target = readI32(readI32(readI32(smallestVector, 8) + (effectIndex << 2) | 0));
        writeI32(scratch, 69632, 2777);
        writeU8(scratch, 1, 2776);
        const savedScratch11 = scratch;
        entity = readI32(target, 45);
        writeI32(savedScratch11, entity, 2760);
        writeU8(scratch, readU8(target, 49), 2764);
        writeU8(scratch, entity & 1, 2760);
        writeU8(scratch, 0, 2761);
        writeU8(scratch, 0, 2764);
        writeU8(scratch, readU8(scratch, 2762) & 16, 2762);
        writeU8(scratch, readU8(scratch, 2763) & 1, 2763);
        drawEvent14EffectsDone2: {
          const resultOfCompareMemory15 = compareMemory(scratch + 2760 | 0, scratch + 2776 | 0, 5);
          if (resultOfCompareMemory15) {
            break drawEvent14EffectsDone2;
          }
          effectSlot = readI32(target, 52);
          if (readU8(effectSlot, 72)) {
            break drawEvent14EffectsDone2;
          }
          count = readI32(target, 120);
          entity = readI32(effectSlot, 68);
          if (+(entity === 0)) {
            const resultOfAllocateOrAbort = allocateOrAbort(192);
            entity = resultOfAllocateOrAbort;
            const resultOfFillMemory = fillMemory(entity, 0, 192);
            effect = resultOfFillMemory;
            writeI64(effect, 0n, 104);
            writeU16(effect, 1, 84);
            writeI32(effect, 1167867904, 80);
            writeI64(effect, 4607182418800017408n, 72);
            writeU8(effect, 2, 66);
            writeU16(effect - -64 | 0, 1);
            writeI64(effect, 0n, 56);
            writeI64(effect, 4575657221408423936n, 48);
            writeI64(effect, 1065353216n, 40);
            writeI64(effect, 0n, 32);
            writeI64(effect, 4575657221408423936n, 24);
            writeI64(effect, 1065353216n, 16);
            writeU8(effect, 1, 8);
            writeI64(effect, 0n, 88);
            writeU8(effect, 0, 96);
            writeI32(effect, -1, 112);
            writeU8(effect, 0, 124);
            writeU8(effect, 0, 128);
            writeU8(effect, 0, 143);
            writeI32(effect, 0, 120);
            writeI32(effect, 0, 184);
            writeI64(effect, 0n, 176);
            writeI64(effect, 4719772410523796111n, 152);
            writeU16(effect, 0, 148);
            writeI32(effect, 16777215, 144);
            writeU8(effect, 0, 132);
            writeI64(effect, 0n, 160);
            writeU8(effect, 0, 168);
            target = readI32(effectSlot, 68);
            writeI32(effectSlot, effect, 68);
            if (target) {
              decodeSnapshotEvent(target);
              entity = readI32(effectSlot, 68);
            }
            if (+((readU8(readI32(effectSlot), 44) & 1) === 0)) {
              writeF32(entity, selectValue(0, 1, readU8(effectSlot, 9) & 1), 160);
            }
            readClock(scratch + 2776 | 0);
            writeI64(entity, readI64(index), 176);
            writeI64(entity, readI64(scratch, 2776), 168);
            effect = readI32(7948176);
            target = divideUnsigned(effect, 44488);
            effect = Math.imul(Math.imul(target, -44488) + effect | 0, 48271);
            const savedEffect = effect;
            target = Math.imul(target, 3399);
            target = selectValue(2147483647, 0, +(savedEffect >>> 0 < target >>> 0)) + (effect - target | 0) | 0;
            writeI32(7948176, target);
            writeF32(entity, f32(f32(f32((target - 1 | 0) >>> 0) * 9313225884932663e-26) + -.10000000149011612), 164);
          }
          writeI32(scratch, readI32(renderer, 96), 352);
          const savedBits61 = canvasSaveAbi(scratch + 352 | 0) | 0;
          void savedBits61;
          writeI64(cachedTransform, readI64(renderer, 56), 56);
          writeI64(cachedTransform, readI64(renderer, 48), 48);
          writeI64(cachedTransform, readI64(renderer, 40), 40);
          writeI64(cachedTransform, readI64(renderer, 32), 32);
          writeI64(cachedTransform, readI64(savedDrawingState), 24);
          writeI64(cachedTransform, readI64(renderer, 16), 16);
          writeI64(cachedTransform, readI64(renderer, 8), 8);
          writeI64(cachedTransform, readI64(renderer));
          const savedEntity = entity;
          valueF64 = selectValue(0, 1, readU8(effectSlot, 9) & 1);
          const savedValueF64 = valueF64;
          const savedAmountF645 = amountF64;
          const savedValueF642 = valueF64;
          amount = readF32(entity, 160);
          writeF32(savedEntity, f32(selectValue(savedValueF64, savedAmountF645 * (savedValueF642 - amount) + amount, +(Math.abs(amount - valueF64) < 1e-7))), 160);
          if (+(readU8(count, 144) === 0)) {
            updateWorldTransform(count);
          }
          valueF64 = readF64(count, 152);
          amount = readF64(count, 160);
          writeU8(renderer, 1, 48);
          const savedRenderer31 = renderer;
          matrixD = readF32(renderer, 4);
          const resultOfF3219 = f32(matrixD * 0);
          matrixC = readF32(renderer, 12);
          const resultOfF3220 = f32(resultOfF3219 + matrixC);
          sizeF32 = readF32(renderer, 20);
          amountF32 = f32(sizeF32 * 0);
          writeF32(savedRenderer31, f32(resultOfF3220 + amountF32), 12);
          const savedRenderer32 = renderer;
          matrixB = readF32(renderer);
          const resultOfF3221 = f32(matrixB * 0);
          matrixA = readF32(renderer, 8);
          const resultOfF3222 = f32(resultOfF3221 + matrixA);
          scaleF32 = readF32(renderer, 16);
          valueF32 = f32(scaleF32 * 0);
          writeF32(savedRenderer32, f32(resultOfF3222 + valueF32), 8);
          writeF32(renderer, f32(f32(matrixD + f32(matrixC * 0)) + amountF32), 4);
          writeF32(renderer, f32(f32(matrixB + f32(matrixA * 0)) + valueF32));
          const savedRenderer33 = renderer;
          const savedSizeF324 = sizeF32;
          const savedMatrixD6 = matrixD;
          amountF32 = f32(valueF64);
          const resultOfF3223 = f32(savedMatrixD6 * amountF32);
          const savedMatrixC4 = matrixC;
          valueF32 = f32(amount);
          writeF32(savedRenderer33, f32(savedSizeF324 + f32(resultOfF3223 + f32(savedMatrixC4 * valueF32))), 20);
          writeF32(renderer, f32(scaleF32 + f32(f32(matrixB * amountF32) + f32(matrixA * valueF32))), 16);
          const savedRenderer34 = renderer;
          amount = readF64(renderer, 56) * f32(Math.sqrt(readF32(entity, 160)));
          amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
          writeF64(savedRenderer34, amount, 56);
          target = readI32(renderer, 96);
          writeF64(scratch, amount, 344);
          writeI32(scratch, target, 336);
          const savedBits62 = canvasSetGlobalAlphaAbi(scratch + 336 | 0) | 0;
          void savedBits62;
          scaledMatrixC = readF32(entity, 160);
          writeU8(renderer, 1, 48);
          const savedRenderer35 = renderer;
          matrixTy = readF32(renderer, 20);
          const savedMatrixTy3 = matrixTy;
          matrixTx = readF32(renderer, 4);
          matrixD = f32(matrixTx * 0);
          const savedMatrixD7 = matrixD;
          amountF32 = readF32(renderer, 12);
          matrixC = f32(amountF32 * 0);
          writeF32(savedRenderer35, f32(savedMatrixTy3 + f32(savedMatrixD7 + matrixC)), 20);
          const savedRenderer36 = renderer;
          matrixB = readF32(renderer, 16);
          const savedMatrixB2 = matrixB;
          matrixA = readF32(renderer);
          sizeF32 = f32(matrixA * 0);
          const savedSizeF325 = sizeF32;
          valueF32 = readF32(renderer, 8);
          scaleF32 = f32(valueF32 * 0);
          writeF32(savedRenderer36, f32(savedMatrixB2 + f32(savedSizeF325 + scaleF32)), 16);
          const savedRenderer37 = renderer;
          const resultOfF3224 = f32(matrixD + f32(scaledMatrixC * amountF32));
          amountF32 = f32(matrixTy * 0);
          writeF32(savedRenderer37, f32(resultOfF3224 + amountF32), 12);
          const savedRenderer38 = renderer;
          const resultOfF3225 = f32(sizeF32 + f32(scaledMatrixC * valueF32));
          valueF32 = f32(matrixB * 0);
          writeF32(savedRenderer38, f32(resultOfF3225 + valueF32), 8);
          writeF32(renderer, f32(f32(f32(scaledMatrixC * matrixTx) + matrixC) + amountF32), 4);
          writeF32(renderer, f32(f32(f32(scaledMatrixC * matrixA) + scaleF32) + valueF32));
          readClock(scratch + 2760 | 0);
          matrixC = readF32(renderer, 4);
          let selectedValue8;
          drawEvent14EffectsDone3: {
            if (+(readU8(scratch, 2760) === 0)) {
              selectedValue8 = Infinity;
              break drawEvent14EffectsDone3;
            }
            void Infinity;
            if (+(readU8(entity, 168) === 0)) {
              selectedValue8 = -Infinity;
              break drawEvent14EffectsDone3;
            }
            void -Infinity;
            selectedValue8 = (readF64(scratch, 2768) - readF64(entity, 176)) * .01;
          }
          const resultOfSinF64 = sinF64(selectedValue8);
          amount = resultOfSinF64;
          matrixB = readF32(renderer, 16);
          scaledMatrixD = readF32(renderer, 8);
          matrixA = readF32(renderer);
          const savedRenderer39 = renderer;
          sizeF32 = readF32(renderer, 20);
          const savedSizeF326 = sizeF32;
          scaleF32 = f32(matrixC * 0);
          const savedScaleF323 = scaleF32;
          amountF32 = readF32(renderer, 12);
          valueF32 = f32(amountF32 * 0);
          scaledMatrixB = f32(savedSizeF326 + f32(savedScaleF323 + valueF32));
          const savedScaledMatrixB = scaledMatrixB;
          const savedMatrixC5 = matrixC;
          projectionA = f32(amount * .03 + 1);
          const resultOfF3226 = f32(f32(savedMatrixC5 * projectionA) + valueF32);
          valueF32 = f32(sizeF32 * 0);
          scaledMatrixC = f32(resultOfF3226 + valueF32);
          matrixTy = f32(scaledMatrixC * 0);
          const savedMatrixTy4 = matrixTy;
          matrixTx = f32(f32(scaleF32 + f32(amountF32 * projectionA)) + valueF32);
          matrixD = f32(matrixTx * 0);
          projectionB = f32(savedScaledMatrixB + f32(savedMatrixTy4 + matrixD));
          writeF32(savedRenderer39, projectionB, 20);
          const savedRenderer40 = renderer;
          const savedMatrixB3 = matrixB;
          scaleF32 = f32(matrixA * 0);
          const savedScaleF324 = scaleF32;
          amountF32 = f32(scaledMatrixD * 0);
          matrixC = f32(savedMatrixB3 + f32(savedScaleF324 + amountF32));
          const savedMatrixC6 = matrixC;
          valueF32 = f32(matrixB * 0);
          matrixB = f32(valueF32 + f32(amountF32 + f32(matrixA * projectionA)));
          matrixA = f32(matrixB * 0);
          const savedMatrixA2 = matrixA;
          sizeF32 = f32(valueF32 + f32(scaleF32 + f32(scaledMatrixD * projectionA)));
          scaleF32 = f32(sizeF32 * 0);
          scaledMatrixD = f32(savedMatrixC6 + f32(savedMatrixA2 + scaleF32));
          writeF32(savedRenderer40, scaledMatrixD, 16);
          const savedRenderer41 = renderer;
          const resultOfF3227 = f32(matrixTy + f32(matrixTx * .7142857313156128));
          amountF32 = f32(scaledMatrixB * 0);
          matrixTy = f32(resultOfF3227 + amountF32);
          writeF32(savedRenderer41, matrixTy, 12);
          const savedRenderer42 = renderer;
          valueF32 = f32(matrixC * 0);
          matrixTx = f32(valueF32 + f32(matrixA + f32(sizeF32 * .7142857313156128)));
          writeF32(savedRenderer42, matrixTx, 8);
          const savedRenderer43 = renderer;
          matrixC = f32(f32(f32(scaledMatrixC * .7142857313156128) + matrixD) + amountF32);
          writeF32(savedRenderer43, matrixC, 4);
          const savedRenderer44 = renderer;
          matrixA = f32(valueF32 + f32(f32(matrixB * .7142857313156128) + scaleF32));
          writeF32(savedRenderer44, matrixA);
          amountF32 = readF32(entity, 164);
          valueF32 = readF32(entity, 160);
          writeU8(renderer, 1, 48);
          writeF32(renderer, f32(projectionB + f32(f32(matrixC + matrixTy) * 0)), 20);
          writeF32(renderer, f32(scaledMatrixD + f32(f32(matrixA + matrixTx) * 0)), 16);
          valueF64 = valueF32 * 12.566370614359172 + amountF32;
          const resultOfSinF642 = sinF64(valueF64);
          amount = resultOfSinF642;
          const savedRenderer45 = renderer;
          amountF32 = f32(projectionB * 0);
          const savedAmountF324 = amountF32;
          const savedMatrixTy5 = matrixTy;
          const resultOfCosF64 = cosF64(valueF64);
          sizeF32 = f32(resultOfCosF64);
          const resultOfF3228 = f32(savedMatrixTy5 * sizeF32);
          const savedMatrixC7 = matrixC;
          scaleF32 = f32(amount);
          writeF32(savedRenderer45, f32(savedAmountF324 + f32(resultOfF3228 - f32(savedMatrixC7 * scaleF32))), 12);
          const savedRenderer46 = renderer;
          valueF32 = f32(scaledMatrixD * 0);
          writeF32(savedRenderer46, f32(valueF32 + f32(f32(matrixTx * sizeF32) - f32(matrixA * scaleF32))), 8);
          writeF32(renderer, f32(amountF32 + f32(f32(matrixC * sizeF32) + f32(matrixTy * scaleF32))), 4);
          writeF32(renderer, f32(valueF32 + f32(f32(matrixA * sizeF32) + f32(matrixTx * scaleF32))));
          valueF64 = readF64(renderer, 56);
          if (readU8(renderer, 50)) {
            writeU8(renderer, 0, 50);
            writeI32(scratch, readI32(renderer, 96), 320);
            const savedBits63 = canvasSetLineJoinRoundAbi(scratch + 320 | 0) | 0;
            void savedBits63;
          }
          target = readI32(renderer, 96);
          writeI64(scratch, 4618253767883969877n, 312);
          writeI32(scratch, target, 304);
          const savedBits64 = canvasSetLineWidthAbi(scratch + 304 | 0) | 0;
          void savedBits64;
          writeI32(scratch, readI32(renderer, 96), 288);
          const savedBits65 = canvasBeginPathAbi(scratch + 288 | 0) | 0;
          void savedBits65;
          drawEvent14EffectsDone4: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawEvent14EffectsDone4;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory16 = compareMemory(savedDrawingState, renderer, 24);
            if (+(resultOfCompareMemory16 === 0)) {
              break drawEvent14EffectsDone4;
            }
            writeI64(savedDrawingState, readI64(renderer));
            writeI64(savedDrawingState, readI64(renderer, 16), 16);
            writeI64(savedDrawingState, readI64(renderer, 8), 8);
            matrixA = readF32(renderer, 8);
            sizeF32 = readF32(renderer, 16);
            scaleF32 = readF32(renderer);
            target = readI32(renderer, 96);
            amountF32 = readF32(renderer, 4);
            valueF32 = readF32(renderer, 12);
            writeF64(scratch, readF32(renderer, 20), 272);
            writeF64(scratch, sizeF32, 264);
            writeF64(scratch, valueF32, 256);
            writeF64(scratch, matrixA, 248);
            writeF64(scratch, amountF32, 240);
            writeI32(scratch, target, 224);
            writeF64(scratch, scaleF32, 232);
            const savedBits66 = canvasSetTransformAbi(scratch + 224 | 0) | 0;
            void savedBits66;
          }
          target = readI32(renderer, 96);
          writeI64(scratch, 4634766966517661696n, 208);
          writeI64(scratch, 4634766966517661696n, 200);
          writeI64(scratch, -4593108669964484608n, 192);
          writeI64(scratch, -4593108669964484608n, 184);
          writeI32(scratch, target, 176);
          const savedBits67 = canvasRectAbi(scratch + 176 | 0) | 0;
          void savedBits67;
          target = readI32(renderer, 96);
          writeI32(scratch, 0, 172);
          writeI64(scratch, 0n, 164);
          writeI32(scratch, target, 160);
          const savedBits68 = canvasSetStrokeRgbAbi(scratch + 160 | 0) | 0;
          void savedBits68;
          const savedRenderer47 = renderer;
          amount = readF64(renderer, 56) * .2;
          amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
          writeF64(savedRenderer47, amount, 56);
          target = readI32(renderer, 96);
          writeF64(scratch, amount, 152);
          writeI32(scratch, target, 144);
          const savedBits69 = canvasSetGlobalAlphaAbi(scratch + 144 | 0) | 0;
          void savedBits69;
          drawEvent14EffectsDone5: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawEvent14EffectsDone5;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory17 = compareMemory(savedDrawingState, renderer, 24);
            if (+(resultOfCompareMemory17 === 0)) {
              break drawEvent14EffectsDone5;
            }
            writeI64(savedDrawingState, readI64(renderer));
            writeI64(savedDrawingState, readI64(renderer, 16), 16);
            writeI64(savedDrawingState, readI64(renderer, 8), 8);
            matrixA = readF32(renderer, 8);
            sizeF32 = readF32(renderer, 16);
            scaleF32 = readF32(renderer);
            target = readI32(renderer, 96);
            amountF32 = readF32(renderer, 4);
            valueF32 = readF32(renderer, 12);
            writeF64(scratch, readF32(renderer, 20), 128);
            writeF64(scratch, sizeF32, 120);
            writeF64(scratch, valueF32, 112);
            writeF64(scratch, matrixA, 104);
            writeF64(scratch, amountF32, 96);
            writeI32(scratch, target, 80);
            writeF64(scratch, scaleF32, 88);
            const savedBits70 = canvasSetTransformAbi(scratch + 80 | 0) | 0;
            void savedBits70;
          }
          writeI32(scratch, readI32(renderer, 96), 64);
          const savedBits71 = canvasStrokeAbi(scratch - -64 | 0) | 0;
          void savedBits71;
          const savedRenderer48 = renderer;
          amount = selectValue(0, Math.min(valueF64, 1), +(valueF64 < 0));
          writeF64(savedRenderer48, amount, 56);
          target = readI32(renderer, 96);
          writeF64(scratch, amount, 56);
          writeI32(scratch, target, 48);
          const savedBits72 = canvasSetGlobalAlphaDuplicateAbi(scratch + 48 | 0) | 0;
          void savedBits72;
          drawPetalIcon(renderer, elapsedF32, readU8(effectSlot, 8), 70, entity, entity + 184 | 0, 0, 0);
          writeI64(renderer, readI64(cachedTransform, 56), 56);
          writeI64(renderer, readI64(cachedTransform, 48), 48);
          writeI64(renderer, readI64(cachedTransform, 40), 40);
          writeI64(renderer, readI64(cachedTransform, 32), 32);
          writeI64(savedDrawingState, readI64(cachedTransform, 24));
          writeI64(renderer, readI64(cachedTransform, 16), 16);
          writeI64(renderer, readI64(cachedTransform, 8), 8);
          writeI64(renderer, readI64(cachedTransform));
          writeI32(scratch, readI32(renderer, 96), 32);
          const savedBits73 = canvasRestoreAbi(scratch + 32 | 0) | 0;
          void savedBits73;
          count = readI32(smallestVector);
        }
        effectIndex = effectIndex + 1 | 0;
        if (+(effectIndex >>> 0 < count >>> 0)) {
          continue drawEvent14EffectsLoop;
        }
        break;
      }
    }
  }
  /** Collect visible drawable entities, sort their draw order, and render them. Original WAT 143080–143343. */  function drawSortedEntities(renderer, scratch, camera, state, frame, transformVector) {
    let drawStorage = 0, entityIndex = 0, drawable = 0, requiredCount = 0, drawCount = 0, drawCapacity = 0, drawEnd = 0, drawCountValue = 0;
    entityIndex = 0;
    drawSortedEntitiesDone: {
      if (readU8(441280) & 1) {
        break drawSortedEntitiesDone;
      }
      const resultOfAcquireGuard4 = acquireGuard(441280);
      if (+(resultOfAcquireGuard4 === 0)) {
        break drawSortedEntitiesDone;
      }
      writeI64(441268, 0n);
      writeI32(441276, 0);
      releaseGuard(441280);
    }
    transformVector = selectValue(state + 1452 | 0, transformVector, +(readI32(state, 1276) >>> 0 > readI32(state, 1452) >>> 0));
    drawEnd = readI32(transformVector);
    if (drawEnd) {
      drawSortedEntitiesLoop: while (true) {
        drawCapacity = readI32(readI32(readI32(transformVector, 8) + (entityIndex << 2) | 0));
        writeI32(scratch, 0, 2776);
        writeU8(scratch, 0, 2780);
        writeU16(scratch, 272, 2778);
        writeI32(scratch, readI32(drawCapacity, 45), 2760);
        writeU8(scratch, readU8(drawCapacity, 49), 2764);
        writeU16(scratch, 0, 2760);
        writeU8(scratch, 0, 2764);
        writeU8(scratch, readU8(scratch, 2762) & 16, 2762);
        writeU8(scratch, readU8(scratch, 2763) & 1, 2763);
        drawSortedEntitiesDone2: {
          const resultOfCompareMemory18 = compareMemory(scratch + 2760 | 0, scratch + 2776 | 0, 5);
          if (resultOfCompareMemory18) {
            break drawSortedEntitiesDone2;
          }
          drawable = readI32(readI32(drawCapacity, 136));
          drawCapacity = readU8(drawable, 46);
          if ((drawCapacity >>> 6 | 0) & +(readI32(drawable, 176) !== 0)) {
            break drawSortedEntitiesDone2;
          }
          if (drawCapacity & 8) {
            break drawSortedEntitiesDone2;
          }
          drawSortedEntitiesDone3: {
            drawCapacity = readI32(441272);
            const savedDrawCapacity = drawCapacity;
            drawCount = readI32(441268);
            requiredCount = drawCount + 1 | 0;
            if (+(savedDrawCapacity >>> 0 >= requiredCount >>> 0)) {
              drawStorage = readI32(441276);
              break drawSortedEntitiesDone3;
            }
            drawEnd = selectValue(drawCapacity << 1, 1024, drawCapacity);
            drawSortedEntitiesLoop2: while (true) {
              drawCapacity = drawEnd;
              drawEnd = drawCapacity << 1;
              if (+(drawCapacity >>> 0 < requiredCount >>> 0)) {
                continue drawSortedEntitiesLoop2;
              }
              break;
            }
            drawCountValue = readI32(441276);
            const resultOfMalloc = malloc(drawCapacity << 2);
            drawStorage = resultOfMalloc;
            const resultOfCopyMemory = copyMemory(drawStorage, drawCountValue, drawCount << 2);
            drawEnd = resultOfCopyMemory;
            free(drawCountValue);
            writeI32(441276, drawEnd);
            writeI32(441272, drawCapacity);
            drawEnd = readI32(transformVector);
          }
          writeI32(drawStorage + (drawCount << 2) | 0, drawable);
          writeI32(441268, requiredCount);
        }
        entityIndex = entityIndex + 1 | 0;
        if (+(entityIndex >>> 0 < drawEnd >>> 0)) {
          continue drawSortedEntitiesLoop;
        }
        break;
      }
    }
    drawEnd = readI32(441276);
    const savedDrawEnd = drawEnd;
    drawCountValue = readI32(441268);
    drawCapacity = savedDrawEnd + (drawCountValue << 2) | 0;
    drawSortedEntitiesDone4: {
      if (+((drawCountValue | 0) <= 128)) {
        sortDrawOrder(drawEnd, drawCapacity, drawCountValue, 0, 0);
        break drawSortedEntitiesDone4;
      }
      const savedDrawEnd2 = drawEnd;
      const savedDrawCapacity2 = drawCapacity;
      const savedDrawCountValue = drawCountValue;
      drawEnd = selectValue(drawCountValue, 536870911, +((drawCountValue | 0) < 536870911));
      const resultOfAllocateOrAbort2 = allocateOrAbort(drawEnd << 2);
      drawCapacity = resultOfAllocateOrAbort2;
      sortDrawOrder(savedDrawEnd2, savedDrawCapacity2, savedDrawCountValue, drawCapacity, drawEnd);
      free(drawCapacity);
    }
    drawEnd = readI32(441268);
    if (drawEnd) {
      drawCapacity = readI32(441276);
      drawEnd = drawCapacity + (drawEnd << 2) | 0;
      drawSortedEntitiesLoop3: while (true) {
        drawEntity(camera, renderer, readI32(drawCapacity), f32(readF64(frame, 32)));
        drawCapacity = drawCapacity + 4 | 0;
        if (+(drawCapacity !== drawEnd)) {
          continue drawSortedEntitiesLoop3;
        }
        break;
      }
    }
    writeI32(441268, 0);
  }
  /** Run the world entity layers for an active local player. Original WAT 138288–143390. */  function drawSceneEntities(renderer, scratch, camera, state, frame) {
    let healthVector = 0, localHandle = 0, savedDrawingState = 0, transformVector = 0, value = 0, amount = 0, transformCount = 0, healthCount = 0;
    drawSceneEntitiesDone: {
      if (+(readI32(state, 256) === 0)) {
        break drawSceneEntitiesDone;
      }
      localHandle = readI32(readI32(state, 264));
      if (+(localHandle === 0)) {
        break drawSceneEntitiesDone;
      }
      if (+(readU8(state, 1) === 0)) {
        break drawSceneEntitiesDone;
      }
      [amount] = setSceneDrawTransform(renderer, scratch, camera, frame);
      updatePointerMarker(renderer, scratch, camera, state, amount);
      [transformVector, transformCount] = drawBackgroundEntities(renderer, scratch, camera, state, frame);
      [healthVector, savedDrawingState, transformCount, healthCount] = drawHealthBars(renderer, scratch, state, frame, transformVector, transformCount);
      drawEntityNames(renderer, scratch, healthVector, localHandle, state, savedDrawingState, frame, transformVector, transformCount, healthCount);
      drawEvent14Effects(renderer, scratch, frame);
      drawSortedEntities(renderer, scratch, camera, state, frame, transformVector);
      const savedRenderer49 = renderer;
      value = scratch + 2620 | 0;
      writeI64(savedRenderer49, readI64(value, 56), 56);
      writeI64(renderer, readI64(value, 48), 48);
      writeI64(renderer, readI64(value, 40), 40);
      writeI64(renderer, readI64(value, 32), 32);
      writeI64(renderer, readI64(value, 24), 24);
      writeI64(renderer, readI64(value, 16), 16);
      writeI64(renderer, readI64(value, 8), 8);
      writeI64(renderer, readI64(value));
      writeI32(scratch, readI32(renderer, 96), 16);
      const savedBits74 = canvasRestoreAbi(scratch + 16 | 0) | 0;
      void savedBits74;
    }
  }
  /** Temporarily publish this frame clock while preserving the previous clock. Original WAT 132683–132747. */  function captureFrameClock() {
    let frame = 0;
    frame = runtime.stackPointer.value - 144 | 0;
    runtime.stackPointer.value = frame;
    readClock(frame + 56 | 0);
    captureFrameClockDone: {
      if (readU8(7922328) & 1) {
        break captureFrameClockDone;
      }
      const resultOfAcquireGuard5 = acquireGuard(7922328);
      if (+(resultOfAcquireGuard5 === 0)) {
        break captureFrameClockDone;
      }
      writeI64(7922320, 0n);
      writeU8(7922312, 0);
      releaseGuard(7922328);
    }
    writeI64(frame, readI64(7922320), 136);
    writeI64(frame, readI64(7922312), 128);
    captureFrameClockDone2: {
      if (readU8(7922328) & 1) {
        break captureFrameClockDone2;
      }
      const resultOfAcquireGuard6 = acquireGuard(7922328);
      if (+(resultOfAcquireGuard6 === 0)) {
        break captureFrameClockDone2;
      }
      writeI64(7922320, 0n);
      writeU8(7922312, 0);
      releaseGuard(7922328);
    }
    writeI64(7922312, readI64(frame, 56));
    writeI64(7922320, readI64(frame - -64 | 0));
    return [ frame ];
  }
  /** Preserve the caller drawing state when a renderer is supplied. Original WAT 132748–132793. */  function saveOuterDrawingState(frame, callerRenderer) {
    if (callerRenderer) {
      writeI32(frame, readI32(callerRenderer, 96), 16);
      const savedBits75 = canvasSaveAbi(frame + 16 | 0) | 0;
      void savedBits75;
      writeI64(frame, readI64(callerRenderer, 56), 116);
      writeI64(frame, readI64(callerRenderer, 48), 108);
      writeI64(frame, readI64(callerRenderer, 40), 100);
      writeI64(frame, readI64(callerRenderer, 32), 92);
      writeI64(frame, readI64(callerRenderer, 24), 84);
      writeI64(frame, readI64(callerRenderer, 16), 76);
      writeI64(frame, readI64(callerRenderer, 8), 68);
      writeI64(frame, readI64(callerRenderer), 60);
    }
  }
  /** Read keyboard or touch controls and queue reliable player-input records. Original WAT 132794–133972. */  function queuePlayerInput(frame, game, elapsedMilliseconds) {
    let recordIndex = 0, movementValue = 0, movementScale = 0, strength = 0;
    let state = 0, recordStorage = 0, controlValue = 0, payload = 0, sequence = 0, inputMask = 0, requiredCount = 0, sharedOwner = 0, oldStorage = 0, capacity = 0, recordCount = 0, reserved = 0, sceneActive = 0, record = 0, controlledEntity = 0, angleF32 = 0, matrixA = 0, matrixB = 0, pointerX = 0, pointerY = 0, direction = 0;
    queuePlayerInputDone: {
      if (+(readI32(game, 264) === 0)) {
        break queuePlayerInputDone;
      }
      state = game + 8 | 0;
      controlValue = readI32(readI32(state, 264));
      if (+(controlValue === 0)) {
        break queuePlayerInputDone;
      }
      sceneActive = readU8(state, 1);
      if (+(sceneActive === 0)) {
        break queuePlayerInputDone;
      }
      controlledEntity = readI32(controlValue, 144);
      let selectedValue9;
      queuePlayerInputDone2: {
        const resultOfUseTouchControls2 = useTouchControls();
        if (resultOfUseTouchControls2) {
          queuePlayerInputDone3: {
            if (readU8(7931360) & 1) {
              break queuePlayerInputDone3;
            }
            const resultOfAcquireGuard7 = acquireGuard(7931360);
            if (+(resultOfAcquireGuard7 === 0)) {
              break queuePlayerInputDone3;
            }
            initializeSceneUi();
            releaseGuard(7931360);
          }
          controlValue = readU8(selectValue(7931328, 4456, readU8(7931352)));
          queuePlayerInputDone4: {
            if (readU8(7931360) & 1) {
              break queuePlayerInputDone4;
            }
            const resultOfAcquireGuard8 = acquireGuard(7931360);
            if (+(resultOfAcquireGuard8 === 0)) {
              break queuePlayerInputDone4;
            }
            initializeSceneUi();
            releaseGuard(7931360);
          }
          const resultOfSelectValue = selectValue(controlValue | 2, controlValue, readU8(selectValue(7931329, 4457, readU8(7931352))));
          selectedValue9 = resultOfSelectValue;
          break queuePlayerInputDone2;
        }
        controlValue = readU8(163849) | readU8(163892);
        selectedValue9 = selectValue(selectValue(3, 2, controlValue), +(controlValue !== 0), readU8(164077) | (readU8(163850) | readU8(164073)));
      }
      controlValue = selectedValue9;
      inputMask = selectValue(controlValue | -2147483648, controlValue, readU8(163866));
      let selectedValue10;
      if (readU8(state, 2)) {
        controlValue = selectValue(inputMask | 1073741824, inputMask, readU8(163863));
        controlValue = selectValue(controlValue | 536870912, controlValue, readU8(163861));
        const savedBits76 = controlValue | 268435456;
        const savedControlValue = controlValue;
        controlValue = readU8(164388);
        inputMask = selectValue(savedBits76, savedControlValue, controlValue);
        selectedValue10 = +(controlValue !== 0);
      } else {
        selectedValue10 = 0;
      }
      reserved = selectedValue10;
      if (readU8(164372)) {
        const resultOfAllocateOrAbort3 = allocateOrAbort(4112);
        payload = resultOfAllocateOrAbort3;
        writeI64(payload, 0n);
        writeI64(payload, 0n, 8);
        writeU8(payload, 13, 16);
        writeI32(payload, 1, 4);
        const savedState = state;
        sequence = readI32(state, 2348);
        writeI32(savedState, sequence + 1 | 0, 2348);
        const resultOfAllocateOrAbort4 = allocateOrAbort(16);
        sharedOwner = resultOfAllocateOrAbort4;
        writeI64(sharedOwner, 0n, 4);
        writeI32(sharedOwner, payload, 12);
        writeI32(sharedOwner, 33124);
        queuePlayerInputDone5: {
          controlValue = readI32(state + 2340 | 0);
          const savedControlValue2 = controlValue;
          recordCount = readI32(state, 2336);
          requiredCount = recordCount + 1 | 0;
          if (+(savedControlValue2 >>> 0 >= requiredCount >>> 0)) {
            recordStorage = readI32(state + 2344 | 0);
            break queuePlayerInputDone5;
          }
          controlValue = selectValue(controlValue << 1, 256, controlValue);
          queuePlayerInputLoop: while (true) {
            capacity = controlValue;
            controlValue = capacity << 1;
            if (+(requiredCount >>> 0 > capacity >>> 0)) {
              continue queuePlayerInputLoop;
            }
            break;
          }
          oldStorage = readI32(state + 2344 | 0);
          const resultOfMalloc2 = malloc(capacity << 4);
          recordStorage = resultOfMalloc2;
          if (recordCount) {
            queuePlayerInputLoop2: while (true) {
              const savedRecordStorage = recordStorage;
              controlValue = recordIndex << 4;
              record = savedRecordStorage + controlValue | 0;
              const savedRecord = record;
              controlValue = controlValue + oldStorage | 0;
              writeI32(savedRecord, readI32(controlValue));
              writeI32(record, readI32(controlValue, 4), 4);
              writeI32(record, readI32(controlValue, 8), 8);
              writeI64(controlValue, 0n, 4);
              writeU8(record, readU8(controlValue, 12), 12);
              recordIndex = recordIndex + 1 | 0;
              if (+(recordIndex !== recordCount)) {
                continue queuePlayerInputLoop2;
              }
              break;
            }
          }
          free(oldStorage);
          writeI32(state, recordStorage, 2344);
          writeI32(state, capacity, 2340);
        }
        controlValue = recordStorage + (recordCount << 4) | 0;
        writeI32(controlValue, payload, 4);
        writeI32(controlValue, sequence);
        writeU8(controlValue, 1, 12);
        writeI32(controlValue, sharedOwner, 8);
        writeI32(state, requiredCount, 2336);
      }
      let selectedValue11;
      if (controlledEntity) {
        queuePlayerInputDone6: {
          controlValue = readI32(controlledEntity, 120);
          if (readU8(controlValue, 144)) {
            pointerX = readF64(controlValue, 152);
            break queuePlayerInputDone6;
          }
          updateWorldTransform(controlValue);
          pointerX = readF64(controlValue, 152);
          if (readU8(controlValue, 144)) {
            break queuePlayerInputDone6;
          }
          updateWorldTransform(controlValue);
        }
        pointerY = readF64(controlValue, 160);
        queuePlayerInputDone7: {
          const resultOfUseTouchControls3 = useTouchControls();
          if (resultOfUseTouchControls3) {
            queuePlayerInputDone8: {
              if (readU8(7931360) & 1) {
                break queuePlayerInputDone8;
              }
              const resultOfAcquireGuard9 = acquireGuard(7931360);
              if (+(resultOfAcquireGuard9 === 0)) {
                break queuePlayerInputDone8;
              }
              initializeSceneUi();
              releaseGuard(7931360);
            }
            movementValue = readF32(selectValue(7931324, 4452, readU8(7931352)));
            queuePlayerInputDone9: {
              if (readU8(7931360) & 1) {
                break queuePlayerInputDone9;
              }
              const resultOfAcquireGuard10 = acquireGuard(7931360);
              if (+(resultOfAcquireGuard10 === 0)) {
                break queuePlayerInputDone9;
              }
              initializeSceneUi();
              releaseGuard(7931360);
            }
            movementScale = f32(readF32(selectValue(7931320, 4448, readU8(7931352))) * 200);
            break queuePlayerInputDone7;
          }
          controlValue = state + 648 | 0;
          queuePlayerInputDone10: {
            if (readU8(151560) & 1) {
              break queuePlayerInputDone10;
            }
            const resultOfAcquireGuard11 = acquireGuard(151560);
            if (+(resultOfAcquireGuard11 === 0)) {
              break queuePlayerInputDone10;
            }
            initializeSettings();
            releaseGuard(151560);
          }
          capacity = selectValue(controlValue, 0, sceneActive);
          let selectedValue12;
          queuePlayerInputDone11: {
            if (readU8(151516)) {
              movementValue = selectValue(-1, 0, readU8(163852) | readU8(163928));
              angleF32 = selectValue(f32(movementValue + 1), movementValue, readU8(163855) | readU8(163927));
              pointerX = angleF32;
              const savedProduct2 = pointerX * pointerX;
              movementValue = selectValue(-1, 0, readU8(163874) | readU8(163930));
              movementValue = selectValue(f32(movementValue + 1), movementValue, readU8(163870) | readU8(163929));
              pointerX = movementValue;
              if (+(f32(Math.sqrt(savedProduct2 + pointerX * pointerX)) === 0)) {
                const storedF323 = readF32(game + 2032 | 0);
                selectedValue12 = storedF323;
                break queuePlayerInputDone11;
              }
              strength = 10;
              movementScale = 1e3;
              const resultOfAtan2F32 = atan2F32(movementValue, angleF32);
              selectedValue12 = resultOfAtan2F32;
              break queuePlayerInputDone11;
            }
            matrixB = f32(pointerX);
            const savedMatrixB4 = matrixB;
            const storedF324 = readF32(state + 2148 | 0);
            const resultOfF3229 = f32(readI32(163824) | 0);
            recordIndex = readI32(state + 2160 | 0);
            const resultOfF3230 = f32(resultOfF3229 - (recordIndex | 0) * .5);
            const storedF325 = readF32(state + 2156 | 0);
            controlValue = readI32(state + 2164 | 0);
            movementScale = f32(f32(controlValue | 0) * .0009259259095415473);
            const savedMovementScale = movementScale;
            movementValue = f32(f32(recordIndex | 0) * .0005208333604969084);
            movementValue = f32(storedF325 * selectValue(savedMovementScale, movementValue, +(movementValue < movementScale)));
            matrixA = f32(storedF324 + f32(resultOfF3230 / movementValue));
            pointerX = savedMatrixB4 - matrixA;
            const savedProduct3 = pointerX * pointerX;
            angleF32 = f32(pointerY);
            const savedAngleF32 = angleF32;
            movementValue = f32(readF32(state + 2152 | 0) + f32(f32(f32(readI32(163828) | 0) - (controlValue | 0) * .5) / movementValue));
            pointerX = savedAngleF32 - movementValue;
            movementScale = f32(Math.sqrt(savedProduct3 + pointerX * pointerX));
            strength = f32(movementScale * .009999999776482582);
            const resultOfAtan2F322 = atan2F32(f32(movementValue - angleF32), f32(matrixA - matrixB));
            selectedValue12 = resultOfAtan2F322;
          }
          movementValue = selectedValue12;
          controlValue = readU8(capacity, 248);
          const resultOfCosF324 = cosF32(movementValue);
          matrixB = resultOfCosF324;
          matrixA = readF32(game + 2056 | 0);
          strength = Math.min(strength, 1);
          const savedStrength = strength;
          const resultOfSinF324 = sinF32(movementValue);
          angleF32 = f32(savedStrength * resultOfSinF324);
          const savedGame = game;
          pointerY = matrixA;
          const savedPointerY = pointerY;
          const resultOfF3231 = f32(f32(strength * matrixB) * 5);
          controlValue = controlValue & 1;
          pointerX = selectValue(resultOfF3231, 0, controlValue);
          let selectedValue13;
          if (+(Math.abs(savedPointerY - pointerX) < 1e-7)) {
            selectedValue13 = pointerX;
          } else {
            const savedDifference3 = pointerX - pointerY;
            const resultOfPowF648 = powF64(.95, elapsedMilliseconds * .06);
            pointerX = 1 - resultOfPowF648;
            selectedValue13 = savedDifference3 * selectValue(0, Math.min(pointerX, 1), +(pointerX < 0)) + pointerY;
          }
          writeF32(savedGame, f32(selectedValue13), 2056);
          const savedGame2 = game;
          direction = readF32(game + 2060 | 0);
          const savedDirection = direction;
          pointerY = selectValue(f32(angleF32 * 5), 0, controlValue);
          let selectedValue14;
          if (+(Math.abs(savedDirection - pointerY) < 1e-7)) {
            selectedValue14 = pointerY;
          } else {
            const resultOfPowF649 = powF64(.95, elapsedMilliseconds * .06);
            pointerX = 1 - resultOfPowF649;
            selectedValue14 = selectValue(0, Math.min(pointerX, 1), +(pointerX < 0)) * (pointerY - direction) + direction;
          }
          writeF32(savedGame2, f32(selectedValue14), 2060);
        }
        queuePlayerInputDone12: {
          if (readU8(7931360) & 1) {
            break queuePlayerInputDone12;
          }
          const resultOfAcquireGuard12 = acquireGuard(7931360);
          if (+(resultOfAcquireGuard12 === 0)) {
            break queuePlayerInputDone12;
          }
          initializeSceneUi();
          releaseGuard(7931360);
        }
        const savedMask = inputMask & -4;
        const savedInputMask = inputMask;
        controlValue = readU8(selectValue(7931296, 4424, readU8(7931352)));
        inputMask = selectValue(savedMask, savedInputMask, controlValue);
        selectedValue11 = selectValue(0, movementScale, controlValue);
      } else {
        selectedValue11 = 0;
      }
      movementScale = selectedValue11;
      controlValue = game + 2024 | 0;
      queuePlayerInputDone13: {
        if (reserved) {
          break queuePlayerInputDone13;
        }
        queuePlayerInputDone14: {
          queuePlayerInputDone15: {
            if (+(inputMask !== readI32(game + 2028 | 0))) {
              break queuePlayerInputDone15;
            }
            if (+(movementValue !== readF32(game + 2032 | 0))) {
              break queuePlayerInputDone15;
            }
            if (+(movementScale === readF32(game + 2036 | 0))) {
              break queuePlayerInputDone14;
            }
          }
          if (+(readU8(game + 2040 | 0) === 0)) {
            break queuePlayerInputDone13;
          }
          readClock(frame + 32 | 0);
          if (+(readU8(frame, 32) === 0)) {
            break queuePlayerInputDone13;
          }
          if (+(readU8(game, 2040) === 0)) {
            break queuePlayerInputDone14;
          }
          if (+(readF64(frame, 40) - readF64(game + 2048 | 0) > 30)) {
            break queuePlayerInputDone13;
          }
        }
        if (+(readU8(controlValue) === 0)) {
          break queuePlayerInputDone;
        }
      }
      recordIndex = 0;
      writeU8(controlValue, 0);
      const resultOfAllocateOrAbort5 = allocateOrAbort(4112);
      recordCount = resultOfAllocateOrAbort5;
      writeI64(recordCount, 0n);
      writeI64(recordCount, 0n, 8);
      oldStorage = recordCount + 16 | 0;
      writeU8(oldStorage, 12);
      writeI32(recordCount, 1, 4);
      controlValue = inputMask;
      queuePlayerInputLoop3: while (true) {
        capacity = recordIndex;
        const savedBits77 = capacity + (frame + 32 | 0) | 0;
        const savedMask2 = controlValue & 127;
        sequence = +(controlValue >>> 0 > 127);
        writeU8(savedBits77, savedMask2 | sequence << 7);
        recordIndex = recordIndex + 1 | 0;
        controlValue = controlValue >>> 7 | 0;
        if (sequence) {
          continue queuePlayerInputLoop3;
        }
        break;
      }
      reserved = capacity + 2 | 0;
      recordStorage = 0;
      if (+(capacity >>> 0 >= 4095)) {
        controlValue = 4096;
        queuePlayerInputLoop4: while (true) {
          controlValue = controlValue << 1;
          if (+(controlValue >>> 0 < reserved >>> 0)) {
            continue queuePlayerInputLoop4;
          }
          break;
        }
        const resultOfMalloc3 = malloc(controlValue);
        recordStorage = resultOfMalloc3;
        writeU8(recordStorage, readU8(recordCount, 16));
        writeI32(recordCount, recordStorage, 12);
        writeI32(recordCount, controlValue, 8);
      }
      const resultOfCopyMemory2 = copyMemory(selectValue(recordStorage, oldStorage, recordStorage) + 1 | 0, frame + 32 | 0, recordIndex);
      void resultOfCopyMemory2;
      writeI32(recordCount, reserved, 4);
      if (readI32(recordCount)) {
        writeI32(recordCount, 0);
      }
      const storedI32 = readI32(recordCount, 8);
      recordStorage = readI32(recordCount, 12);
      controlValue = selectValue(storedI32, 4096, recordStorage);
      const savedControlValue3 = controlValue;
      sceneActive = capacity + 6 | 0;
      if (+(savedControlValue3 >>> 0 < sceneActive >>> 0)) {
        queuePlayerInputLoop5: while (true) {
          controlValue = controlValue << 1;
          if (+(controlValue >>> 0 < sceneActive >>> 0)) {
            continue queuePlayerInputLoop5;
          }
          break;
        }
        sequence = selectValue(recordStorage, oldStorage, recordStorage);
        const resultOfMalloc4 = malloc(controlValue);
        recordStorage = resultOfMalloc4;
        const resultOfCopyMemory3 = copyMemory(recordStorage, sequence, reserved);
        recordIndex = resultOfCopyMemory3;
        if (+(sequence !== oldStorage)) {
          free(sequence);
        }
        writeI32(recordCount, recordIndex, 12);
        writeI32(recordCount, controlValue, 8);
      }
      writeF32(selectValue(recordStorage, oldStorage, recordStorage) + reserved | 0, movementValue);
      writeI32(recordCount, sceneActive, 4);
      if (readI32(recordCount)) {
        writeI32(recordCount, 0);
      }
      const storedI322 = readI32(recordCount, 8);
      recordIndex = readI32(recordCount, 12);
      controlValue = selectValue(storedI322, 4096, recordIndex);
      const savedControlValue4 = controlValue;
      sequence = capacity + 10 | 0;
      if (+(savedControlValue4 >>> 0 < sequence >>> 0)) {
        queuePlayerInputLoop6: while (true) {
          controlValue = controlValue << 1;
          if (+(controlValue >>> 0 < sequence >>> 0)) {
            continue queuePlayerInputLoop6;
          }
          break;
        }
        reserved = selectValue(recordIndex, oldStorage, recordIndex);
        const resultOfMalloc5 = malloc(controlValue);
        recordIndex = resultOfMalloc5;
        const resultOfCopyMemory4 = copyMemory(recordIndex, reserved, sceneActive);
        capacity = resultOfCopyMemory4;
        if (+(oldStorage !== reserved)) {
          free(reserved);
        }
        writeI32(recordCount, capacity, 12);
        writeI32(recordCount, controlValue, 8);
      }
      writeF32(selectValue(recordIndex, oldStorage, recordIndex) + sceneActive | 0, movementScale);
      writeI32(recordCount, sequence, 4);
      const savedState2 = state;
      reserved = readI32(state, 2348);
      writeI32(savedState2, reserved + 1 | 0, 2348);
      const resultOfAllocateOrAbort6 = allocateOrAbort(16);
      record = resultOfAllocateOrAbort6;
      writeI64(record, 0n, 4);
      writeI32(record, recordCount, 12);
      writeI32(record, 33124);
      queuePlayerInputDone16: {
        controlValue = readI32(state + 2340 | 0);
        const savedControlValue5 = controlValue;
        controlledEntity = readI32(state, 2336);
        oldStorage = controlledEntity + 1 | 0;
        if (+(savedControlValue5 >>> 0 >= oldStorage >>> 0)) {
          controlValue = readI32(state + 2344 | 0);
          break queuePlayerInputDone16;
        }
        controlValue = selectValue(controlValue << 1, 256, controlValue);
        queuePlayerInputLoop7: while (true) {
          capacity = controlValue;
          controlValue = capacity << 1;
          if (+(oldStorage >>> 0 > capacity >>> 0)) {
            continue queuePlayerInputLoop7;
          }
          break;
        }
        sceneActive = readI32(state + 2344 | 0);
        const resultOfMalloc6 = malloc(capacity << 4);
        controlValue = resultOfMalloc6;
        if (controlledEntity) {
          recordIndex = 0;
          queuePlayerInputLoop8: while (true) {
            const savedControlValue6 = controlValue;
            sequence = recordIndex << 4;
            requiredCount = savedControlValue6 + sequence | 0;
            const savedRequiredCount = requiredCount;
            sequence = sequence + sceneActive | 0;
            writeI32(savedRequiredCount, readI32(sequence));
            writeI32(requiredCount, readI32(sequence, 4), 4);
            writeI32(requiredCount, readI32(sequence, 8), 8);
            writeI64(sequence, 0n, 4);
            writeU8(requiredCount, readU8(sequence, 12), 12);
            recordIndex = recordIndex + 1 | 0;
            if (+(recordIndex !== controlledEntity)) {
              continue queuePlayerInputLoop8;
            }
            break;
          }
        }
        free(sceneActive);
        writeI32(state, controlValue, 2344);
        writeI32(state, capacity, 2340);
      }
      controlValue = controlValue + (controlledEntity << 4) | 0;
      writeI32(controlValue, recordCount, 4);
      writeI32(controlValue, reserved);
      writeU8(controlValue, 1, 12);
      writeI32(controlValue, record, 8);
      writeF32(game + 2036 | 0, movementScale);
      writeF32(game + 2032 | 0, movementValue);
      writeI32(game + 2028 | 0, inputMask);
      writeI32(game + 2344 | 0, oldStorage);
      readClock(frame + 32 | 0);
      writeI64(game + 2048 | 0, readI64(frame, 40));
      writeI64(game + 2040 | 0, readI64(frame, 32));
    }
  }
  /** Invalidate cached world transforms before interpolation and drawing. Original WAT 133973–134069. */  function invalidateTransformCaches(game) {
    let index = 0, indexValue2 = 0, transforms = 0, remainder = 0, offset = 0;
    invalidateTransformCachesDone: {
      remainder = readI32(game + 1284 | 0);
      if (+(remainder === 0)) {
        break invalidateTransformCachesDone;
      }
      transforms = readI32(game + 1292 | 0);
      indexValue2 = remainder & 3;
      index = 0;
      if (+((remainder - 1 | 0) >>> 0 >= 3)) {
        remainder = remainder & -4;
        invalidateTransformCachesLoop: while (true) {
          const savedTransforms = transforms;
          offset = index << 2;
          writeU8(readI32(savedTransforms + offset | 0), 0, 144);
          writeU8(readI32(transforms + (offset | 4) | 0), 0, 144);
          writeU8(readI32(transforms + (offset | 8) | 0), 0, 144);
          writeU8(readI32(transforms + (offset | 12) | 0), 0, 144);
          index = index + 4 | 0;
          remainder = remainder - 4 | 0;
          if (remainder) {
            continue invalidateTransformCachesLoop;
          }
          break;
        }
      }
      if (+(indexValue2 === 0)) {
        break invalidateTransformCachesDone;
      }
      invalidateTransformCachesLoop2: while (true) {
        writeU8(readI32(transforms + (index << 2) | 0), 0, 144);
        index = index + 1 | 0;
        indexValue2 = indexValue2 - 1 | 0;
        if (indexValue2) {
          continue invalidateTransformCachesLoop2;
        }
        break;
      }
    }
  }
  /** Release the previous entity hash nodes while retaining bucket storage. Original WAT 134159–134273. */  function clearEntitySpatialHash(camera) {
    let count = 0, value = 0, countValue2 = 0, length = 0;
    if (readI32(camera, 88)) {
      value = readI32(camera, 84);
      if (value) {
        clearEntitySpatialHashLoop: while (true) {
          countValue2 = readI32(value);
          free(value);
          value = countValue2;
          if (value) {
            continue clearEntitySpatialHashLoop;
          }
          break;
        }
      }
      value = 0;
      writeI32(camera, 0, 84);
      clearEntitySpatialHashDone: {
        countValue2 = readI32(camera, 80);
        if (+(countValue2 === 0)) {
          break clearEntitySpatialHashDone;
        }
        length = countValue2 & 3;
        if (+((countValue2 - 1 | 0) >>> 0 >= 3)) {
          count = countValue2 & -4;
          clearEntitySpatialHashLoop2: while (true) {
            countValue2 = value << 2;
            writeI32(countValue2 + readI32(camera, 76) | 0, 0);
            writeI32(readI32(camera, 76) + (countValue2 | 4) | 0, 0);
            writeI32(readI32(camera, 76) + (countValue2 | 8) | 0, 0);
            writeI32(readI32(camera, 76) + (countValue2 | 12) | 0, 0);
            value = value + 4 | 0;
            count = count - 4 | 0;
            if (count) {
              continue clearEntitySpatialHashLoop2;
            }
            break;
          }
        }
        if (+(length === 0)) {
          break clearEntitySpatialHashDone;
        }
        clearEntitySpatialHashLoop3: while (true) {
          writeI32(readI32(camera, 76) + (value << 2) | 0, 0);
          value = value + 1 | 0;
          length = length - 1 | 0;
          if (length) {
            continue clearEntitySpatialHashLoop3;
          }
          break;
        }
      }
      writeI32(camera, 0, 88);
    }
  }
  /** Index eligible owned entities using the original integer hash and bucket policy. Original WAT 134280–135165. */  function populateEntitySpatialHash(camera, state) {
    let entityIndex = 0;
    let bucketCount = 0, hash = 0, entity = 0, entityId = 0, hashBits = 0, bucket = 0, node = 0, previousBucket = 0, bucketMask = 0, bucketPopcount = 0, primeShift = 0, valueF32 = 0, amountF32 = 0, storage = 0, bucketIndex = 0, entityCount = 0;
    entityCount = readI32(camera - 1508 | 0);
    if (entityCount) {
      hashBits = camera + 84 | 0;
      hash = 0;
      populateEntitySpatialHashLoop: while (true) {
        populateEntitySpatialHashDone: {
          bucketIndex = readI32(readI32(readI32(state, 644) + (entityIndex << 2) | 0));
          if (+((readU8(bucketIndex, 46) & 64) === 0)) {
            break populateEntitySpatialHashDone;
          }
          storage = readI32(bucketIndex, 176);
          if (+(storage === 0)) {
            break populateEntitySpatialHashDone;
          }
          const resultOfAllocateOrAbort7 = allocateOrAbort(16);
          node = resultOfAllocateOrAbort7;
          writeI32(node, 0);
          writeI64(node, BigInt.asIntN(64, BigInt(storage >>> 0) | BigInt.asIntN(64, BigInt(bucketIndex >>> 0) << (32n & 63n))), 8);
          const savedNode = node;
          storage = Math.imul(storage, 1540483477);
          storage = Math.imul((storage >>> 24 | 0) ^ storage, 1540483477) ^ 1866966612;
          storage = Math.imul((storage >>> 13 | 0) ^ storage, 1540483477);
          bucketPopcount = (storage >>> 15 | 0) ^ storage;
          writeI32(savedNode, bucketPopcount, 4);
          populateEntitySpatialHashDone2: {
            amountF32 = f32((hash + 1 | 0) >>> 0);
            const savedAmountF325 = amountF32;
            valueF32 = readF32(camera, 92);
            const savedValueF325 = valueF32;
            entityCount = readI32(camera, 80);
            if (+(selectValue(+(savedAmountF325 > f32(savedValueF325 * f32(entityCount >>> 0))), 1, entityCount) === 0)) {
              break populateEntitySpatialHashDone2;
            }
            bucketIndex = +((entityCount & (entityCount - 1 | 0)) !== 0) | +(entityCount >>> 0 < 3) | entityCount << 1;
            bucketCount = 2;
            populateEntitySpatialHashDone3: {
              let selectedValue15;
              populateEntitySpatialHashDone4: {
                valueF32 = f32(Math.ceil(f32(amountF32 / valueF32)));
                if (+(valueF32 < 4294967296) & +(valueF32 >= 0)) {
                  const resultOfTruncateInteger = truncateInteger(valueF32, true);
                  selectedValue15 = resultOfTruncateInteger;
                  break populateEntitySpatialHashDone4;
                }
                selectedValue15 = 0;
              }
              storage = selectedValue15;
              storage = selectValue(storage, bucketIndex, +(storage >>> 0 > bucketIndex >>> 0));
              if (+(storage === 1)) {
                break populateEntitySpatialHashDone3;
              }
              if (+((storage & (storage - 1 | 0)) === 0)) {
                bucketCount = storage;
                break populateEntitySpatialHashDone3;
              }
              const resultOfNextPrime = nextPrime(storage);
              bucketCount = resultOfNextPrime;
              entityCount = readI32(camera, 80);
            }
            populateEntitySpatialHashDone5: {
              if (+(entityCount >>> 0 >= bucketCount >>> 0)) {
                if (+(entityCount >>> 0 <= bucketCount >>> 0)) {
                  break populateEntitySpatialHashDone2;
                }
                storage = +(entityCount >>> 0 < 3);
                let selectedValue16;
                populateEntitySpatialHashDone6: {
                  valueF32 = f32(Math.ceil(f32(f32(readI32(camera, 88) >>> 0) / readF32(camera, 92))));
                  if (+(valueF32 < 4294967296) & +(valueF32 >= 0)) {
                    const resultOfTruncateInteger2 = truncateInteger(valueF32, true);
                    selectedValue16 = resultOfTruncateInteger2;
                    break populateEntitySpatialHashDone6;
                  }
                  selectedValue16 = 0;
                }
                bucketIndex = selectedValue16;
                const savedEntityCount = entityCount;
                let selectedValue17;
                populateEntitySpatialHashDone7: {
                  populateEntitySpatialHashDone8: {
                    if (storage) {
                      break populateEntitySpatialHashDone8;
                    }
                    if (+(popcount(entityCount) >>> 0 > 1)) {
                      break populateEntitySpatialHashDone8;
                    }
                    const resultOfSelectValue2 = selectValue(bucketIndex, 1 << (32 - Math.clz32(bucketIndex - 1 | 0) | 0), +(bucketIndex >>> 0 < 2));
                    selectedValue17 = resultOfSelectValue2;
                    break populateEntitySpatialHashDone7;
                  }
                  const resultOfNextPrime2 = nextPrime(bucketIndex);
                  selectedValue17 = resultOfNextPrime2;
                }
                storage = selectedValue17;
                bucketCount = selectValue(storage, bucketCount, +(storage >>> 0 > bucketCount >>> 0));
                if (+(savedEntityCount >>> 0 <= bucketCount >>> 0)) {
                  entityCount = readI32(camera, 80);
                  break populateEntitySpatialHashDone2;
                }
                if (+(bucketCount === 0)) {
                  break populateEntitySpatialHashDone5;
                }
              }
              if (+(bucketCount >>> 0 >= 1073741824)) {
                runtime.host("a", "b");
                throw new WebAssembly.RuntimeError("unreachable");
              }
              const resultOfAllocateOrAbort8 = allocateOrAbort(bucketCount << 2);
              storage = resultOfAllocateOrAbort8;
              bucketIndex = readI32(camera, 76);
              writeI32(camera, storage, 76);
              if (bucketIndex) {
                free(bucketIndex);
              }
              writeI32(camera, bucketCount, 80);
              entityCount = bucketCount & 3;
              storage = 0;
              previousBucket = bucketCount - 1 | 0;
              if (+(previousBucket >>> 0 >= 3)) {
                hash = bucketCount & -4;
                populateEntitySpatialHashLoop2: while (true) {
                  bucketIndex = storage << 2;
                  writeI32(bucketIndex + readI32(camera, 76) | 0, 0);
                  writeI32(readI32(camera, 76) + (bucketIndex | 4) | 0, 0);
                  writeI32(readI32(camera, 76) + (bucketIndex | 8) | 0, 0);
                  writeI32(readI32(camera, 76) + (bucketIndex | 12) | 0, 0);
                  storage = storage + 4 | 0;
                  hash = hash - 4 | 0;
                  if (hash) {
                    continue populateEntitySpatialHashLoop2;
                  }
                  break;
                }
              }
              if (entityCount) {
                populateEntitySpatialHashLoop3: while (true) {
                  writeI32(readI32(camera, 76) + (storage << 2) | 0, 0);
                  storage = storage + 1 | 0;
                  entityCount = entityCount - 1 | 0;
                  if (entityCount) {
                    continue populateEntitySpatialHashLoop3;
                  }
                  break;
                }
              }
              hash = readI32(camera, 84);
              if (+(hash === 0)) {
                entityCount = bucketCount;
                break populateEntitySpatialHashDone2;
              }
              entityId = readI32(hash, 4);
              populateEntitySpatialHashDone9: {
                bucketIndex = +(popcount(bucketCount) >>> 0 > 1);
                if (+(bucketIndex === 0)) {
                  entityId = entityId & previousBucket;
                  break populateEntitySpatialHashDone9;
                }
                if (+(bucketCount >>> 0 > entityId >>> 0)) {
                  break populateEntitySpatialHashDone9;
                }
                entityId = remainderUnsigned(entityId, bucketCount);
              }
              writeI32(readI32(camera, 76) + (entityId << 2) | 0, hashBits);
              storage = readI32(hash);
              if (+(storage === 0)) {
                entityCount = bucketCount;
                break populateEntitySpatialHashDone2;
              }
              if (+(bucketIndex === 0)) {
                populateEntitySpatialHashLoop4: while (true) {
                  populateEntitySpatialHashDone10: {
                    const savedEntityId = entityId;
                    entityCount = readI32(storage, 4) & previousBucket;
                    if (+(savedEntityId === entityCount)) {
                      hash = storage;
                      break populateEntitySpatialHashDone10;
                    }
                    bucketIndex = storage;
                    entity = entityCount << 2;
                    bucket = entity + readI32(camera, 76) | 0;
                    if (readI32(bucket)) {
                      populateEntitySpatialHashLoop5: while (true) {
                        populateEntitySpatialHashDone11: {
                          entityCount = bucketIndex;
                          bucketIndex = readI32(entityCount);
                          if (+(bucketIndex === 0)) {
                            bucketIndex = 0;
                            break populateEntitySpatialHashDone11;
                          }
                          if (+(readI32(storage, 8) === readI32(bucketIndex, 8))) {
                            continue populateEntitySpatialHashLoop5;
                          }
                        }
                        break;
                      }
                      writeI32(hash, bucketIndex);
                      writeI32(entityCount, readI32(readI32(readI32(camera, 76) + entity | 0)));
                      writeI32(readI32(readI32(camera, 76) + entity | 0), storage);
                      break populateEntitySpatialHashDone10;
                    }
                    writeI32(bucket, hash);
                    hash = storage;
                    entityId = entityCount;
                  }
                  storage = readI32(hash);
                  if (storage) {
                    continue populateEntitySpatialHashLoop4;
                  }
                  break;
                }
                entityCount = bucketCount;
                break populateEntitySpatialHashDone2;
              }
              populateEntitySpatialHashLoop6: while (true) {
                populateEntitySpatialHashDone12: {
                  let selectedValue18;
                  {
                    const savedBucketCount = bucketCount;
                    entityCount = readI32(storage, 4);
                    if (+(savedBucketCount >>> 0 <= entityCount >>> 0)) {
                      entityCount = remainderUnsigned(entityCount, bucketCount);
                    }
                    selectedValue18 = +(entityCount === entityId);
                  }
                  if (selectedValue18) {
                    hash = storage;
                    break populateEntitySpatialHashDone12;
                  }
                  bucketIndex = storage;
                  entity = entityCount << 2;
                  bucket = entity + readI32(camera, 76) | 0;
                  if (+(readI32(bucket) === 0)) {
                    writeI32(bucket, hash);
                    hash = storage;
                    entityId = entityCount;
                    break populateEntitySpatialHashDone12;
                  }
                  populateEntitySpatialHashLoop7: while (true) {
                    populateEntitySpatialHashDone13: {
                      entityCount = bucketIndex;
                      bucketIndex = readI32(entityCount);
                      if (+(bucketIndex === 0)) {
                        bucketIndex = 0;
                        break populateEntitySpatialHashDone13;
                      }
                      if (+(readI32(storage, 8) === readI32(bucketIndex, 8))) {
                        continue populateEntitySpatialHashLoop7;
                      }
                    }
                    break;
                  }
                  writeI32(hash, bucketIndex);
                  writeI32(entityCount, readI32(readI32(readI32(camera, 76) + entity | 0)));
                  writeI32(readI32(readI32(camera, 76) + entity | 0), storage);
                }
                storage = readI32(hash);
                if (storage) {
                  continue populateEntitySpatialHashLoop6;
                }
                break;
              }
              entityCount = bucketCount;
              break populateEntitySpatialHashDone2;
            }
            storage = readI32(camera, 76);
            writeI32(camera, 0, 76);
            if (storage) {
              free(storage);
            }
            entityCount = 0;
            writeI32(camera, 0, 80);
          }
          populateEntitySpatialHashDone14: {
            entity = readI32(camera, 76);
            const savedEntity2 = entity;
            let selectedValue19;
            populateEntitySpatialHashDone15: {
              const savedMask3 = (entityCount - 1 | 0) & bucketPopcount;
              primeShift = +(popcount(entityCount) >>> 0 > 1);
              if (+(primeShift === 0)) {
                selectedValue19 = savedMask3;
                break populateEntitySpatialHashDone15;
              }
              void savedMask3;
              const savedBucketPopcount = bucketPopcount;
              if (+(entityCount >>> 0 > bucketPopcount >>> 0)) {
                selectedValue19 = savedBucketPopcount;
                break populateEntitySpatialHashDone15;
              }
              void savedBucketPopcount;
              selectedValue19 = remainderUnsigned(bucketPopcount, entityCount);
            }
            bucketMask = selectedValue19;
            storage = readI32(savedEntity2 + (bucketMask << 2) | 0);
            if (+(storage === 0)) {
              entityId = 0;
              break populateEntitySpatialHashDone14;
            }
            previousBucket = readI32(node, 8);
            bucketIndex = 0;
            if (+(primeShift === 0)) {
              bucket = entityCount - 1 | 0;
              populateEntitySpatialHashLoop8: while (true) {
                entityId = storage;
                storage = readI32(entityId);
                if (+(storage === 0)) {
                  break populateEntitySpatialHashDone14;
                }
                bucketCount = readI32(storage, 4);
                if (+((bucketCount & bucket) !== bucketMask)) {
                  break populateEntitySpatialHashDone14;
                }
                hash = 0;
                if (+(bucketCount === bucketPopcount)) {
                  hash = +(readI32(storage, 8) === previousBucket);
                }
                bucketCount = bucketIndex & (hash ^ 1);
                bucketIndex = bucketIndex | hash;
                if (+(bucketCount === 0)) {
                  continue populateEntitySpatialHashLoop8;
                }
                break;
              }
              break populateEntitySpatialHashDone14;
            }
            populateEntitySpatialHashLoop9: while (true) {
              entityId = storage;
              storage = readI32(entityId);
              if (+(storage === 0)) {
                break populateEntitySpatialHashDone14;
              }
              hash = readI32(storage, 4);
              bucketCount = hash;
              let selectedValue20;
              if (+(entityCount >>> 0 <= hash >>> 0)) {
                selectedValue20 = remainderUnsigned(hash, entityCount);
              } else {
                selectedValue20 = bucketCount;
              }
              if (+(selectedValue20 !== bucketMask)) {
                break populateEntitySpatialHashDone14;
              }
              bucketCount = 0;
              if (+(hash === bucketPopcount)) {
                bucketCount = +(readI32(storage, 8) === previousBucket);
              }
              hash = bucketIndex & (bucketCount ^ 1);
              bucketIndex = bucketIndex | bucketCount;
              if (+(hash !== 1)) {
                continue populateEntitySpatialHashLoop9;
              }
              break;
            }
          }
          storage = readI32(node, 4);
          populateEntitySpatialHashDone16: {
            if (+(primeShift === 0)) {
              storage = (entityCount - 1 | 0) & storage;
              break populateEntitySpatialHashDone16;
            }
            if (+(storage >>> 0 < entityCount >>> 0)) {
              break populateEntitySpatialHashDone16;
            }
            storage = remainderUnsigned(storage, entityCount);
          }
          populateEntitySpatialHashDone17: {
            populateEntitySpatialHashDone18: {
              if (+(entityId === 0)) {
                writeI32(node, readI32(camera, 84));
                writeI32(camera, node, 84);
                writeI32(entity + (storage << 2) | 0, hashBits);
                storage = readI32(node);
                if (+(storage === 0)) {
                  break populateEntitySpatialHashDone17;
                }
                bucketIndex = readI32(storage, 4);
                if (+(primeShift === 0)) {
                  bucketIndex = bucketIndex & (entityCount - 1 | 0);
                  break populateEntitySpatialHashDone18;
                }
                if (+(bucketIndex >>> 0 < entityCount >>> 0)) {
                  break populateEntitySpatialHashDone18;
                }
                bucketIndex = remainderUnsigned(bucketIndex, entityCount);
                break populateEntitySpatialHashDone18;
              }
              writeI32(node, readI32(entityId));
              writeI32(entityId, node);
              bucketIndex = readI32(node);
              if (+(bucketIndex === 0)) {
                break populateEntitySpatialHashDone17;
              }
              bucketIndex = readI32(bucketIndex, 4);
              populateEntitySpatialHashDone19: {
                if (+(primeShift === 0)) {
                  bucketIndex = bucketIndex & (entityCount - 1 | 0);
                  break populateEntitySpatialHashDone19;
                }
                if (+(bucketIndex >>> 0 < entityCount >>> 0)) {
                  break populateEntitySpatialHashDone19;
                }
                bucketIndex = remainderUnsigned(bucketIndex, entityCount);
              }
              if (+(storage === bucketIndex)) {
                break populateEntitySpatialHashDone17;
              }
            }
            writeI32(readI32(camera, 76) + (bucketIndex << 2) | 0, node);
          }
          const savedCamera = camera;
          hash = readI32(camera, 88) + 1 | 0;
          writeI32(savedCamera, hash, 88);
          entityCount = readI32(state, 636);
        }
        entityIndex = entityIndex + 1 | 0;
        if (+(entityIndex >>> 0 < entityCount >>> 0)) {
          continue populateEntitySpatialHashLoop;
        }
        break;
      }
    }
  }
  /** Invalidate and refresh cached visual bounds for spatial components. Original WAT 135166–135287. */  function refreshVisualBounds(state) {
    let remainder = 0, offset = 0, count = 0, entries = 0, index = 0, batchIndex = 0;
    refreshVisualBoundsDone: {
      count = readI32(state + 1496 | 0);
      if (+(count === 0)) {
        break refreshVisualBoundsDone;
      }
      entries = readI32(state + 1504 | 0);
      remainder = count & 3;
      index = 0;
      batchIndex = 0;
      if (+((count - 1 | 0) >>> 0 >= 3)) {
        count = count & -4;
        refreshVisualBoundsLoop: while (true) {
          const savedEntries = entries;
          offset = batchIndex << 2;
          writeU8(readI32(savedEntries + offset | 0), 0, 36);
          writeU8(readI32(entries + (offset | 4) | 0), 0, 36);
          writeU8(readI32(entries + (offset | 8) | 0), 0, 36);
          writeU8(readI32(entries + (offset | 12) | 0), 0, 36);
          batchIndex = batchIndex + 4 | 0;
          count = count - 4 | 0;
          if (count) {
            continue refreshVisualBoundsLoop;
          }
          break;
        }
      }
      if (remainder) {
        refreshVisualBoundsLoop2: while (true) {
          writeU8(readI32(entries + (batchIndex << 2) | 0), 0, 36);
          batchIndex = batchIndex + 1 | 0;
          remainder = remainder - 1 | 0;
          if (remainder) {
            continue refreshVisualBoundsLoop2;
          }
          break;
        }
      }
      refreshVisualBoundsLoop3: while (true) {
        const resultOfUpdateVisualBounds = updateVisualBounds(readI32(entries + (index << 2) | 0));
        void resultOfUpdateVisualBounds;
        index = index + 1 | 0;
        if (+(index >>> 0 >= readI32(state, 1496) >>> 0)) {
          break refreshVisualBoundsDone;
        }
        entries = readI32(state, 1504);
        continue refreshVisualBoundsLoop3;
        break;
      }
      throw new WebAssembly.RuntimeError("unreachable");
    }
  }
  /** Create scene bounds, insert visual colliders, and update their spatial tree. Original WAT 135288–135586. */  function rebuildVisualSpatialTree(state) {
    let index = 0, collider = 0, tree = 0, oldChildren = 0, upperX = 0, lowerX = 0, upperY = 0, lowerY = 0, node = 0, parent = 0, children = 0;
    node = readU8(state, 1);
    if (node) {
      if (+(readU8(state + 2068 | 0) === 0)) {
        writeU8(state, 1, 2068);
        collider = state + 2104 | 0;
        node = selectValue(state + 648 | 0, 0, node);
        lowerY = f32(readF32(node, 340) * .5);
        upperY = f32(lowerY + 500);
        lowerX = f32(readF32(node, 252) * .5);
        upperX = f32(lowerX + 500);
        lowerY = f32(-500 - lowerY);
        lowerX = f32(-500 - lowerX);
        rebuildVisualSpatialTreeDone: {
          oldChildren = state + 2128 | 0;
          parent = readI32(oldChildren);
          if (+(parent === 0)) {
            break rebuildVisualSpatialTreeDone;
          }
          children = readI32(state + 2136 | 0);
          node = children;
          tree = parent << 2;
          index = tree - 4 | 0;
          parent = ((index >>> 2 | 0) + 1 | 0) & 7;
          if (parent) {
            node = children;
            rebuildVisualSpatialTreeLoop: while (true) {
              writeI32(readI32(node), 0, 56);
              node = node + 4 | 0;
              parent = parent - 1 | 0;
              if (parent) {
                continue rebuildVisualSpatialTreeLoop;
              }
              break;
            }
          }
          if (+(index >>> 0 < 28)) {
            break rebuildVisualSpatialTreeDone;
          }
          parent = children + tree | 0;
          rebuildVisualSpatialTreeLoop2: while (true) {
            writeI32(readI32(node), 0, 56);
            writeI32(readI32(node, 4), 0, 56);
            writeI32(readI32(node, 8), 0, 56);
            writeI32(readI32(node, 12), 0, 56);
            writeI32(readI32(node, 16), 0, 56);
            writeI32(readI32(node, 20), 0, 56);
            writeI32(readI32(node, 24), 0, 56);
            writeI32(readI32(node, 28), 0, 56);
            node = node + 32 | 0;
            if (+(node !== parent)) {
              continue rebuildVisualSpatialTreeLoop2;
            }
            break;
          }
        }
        destroySpatialChildren(collider);
        free(readI32(state, 2136));
        writeF32(state + 2124 | 0, f32(upperY - lowerY));
        writeF32(state + 2120 | 0, f32(upperX - lowerX));
        writeF32(state + 2116 | 0, lowerY);
        writeF32(state + 2112 | 0, lowerX);
        writeI32(state + 2108 | 0, 0);
        writeI32(state, state + 2072 | 0, 2104);
        writeI64(oldChildren, 0n, 8);
        writeI64(oldChildren, 0n);
      }
      if (readI32(state, 1496)) {
        tree = state + 2104 | 0;
        index = 0;
        rebuildVisualSpatialTreeLoop3: while (true) {
          collider = readI32(readI32(state, 1504) + (index << 2) | 0);
          const resultOfUpdateVisualBounds2 = updateVisualBounds(collider);
          void resultOfUpdateVisualBounds2;
          parent = tree;
          rebuildVisualSpatialTreeDone2: {
            node = readI32(collider, 56);
            if (+(node === 0)) {
              break rebuildVisualSpatialTreeDone2;
            }
            children = readI32(node, 4);
            if (+(children === 0)) {
              parent = node;
              break rebuildVisualSpatialTreeDone2;
            }
            lowerY = readF32(collider, 40);
            rebuildVisualSpatialTreeLoop4: while (true) {
              parent = node;
              node = children;
              rebuildVisualSpatialTreeDone3: {
                const savedLowerY = lowerY;
                upperY = readF32(parent, 8);
                if (+(savedLowerY < upperY)) {
                  break rebuildVisualSpatialTreeDone3;
                }
                lowerX = readF32(collider, 44);
                const savedLowerX = lowerX;
                upperX = readF32(parent, 12);
                if (+(savedLowerX < upperX)) {
                  break rebuildVisualSpatialTreeDone3;
                }
                if (+(f32(lowerY + readF32(collider, 48)) >= f32(upperY + readF32(parent, 16)))) {
                  break rebuildVisualSpatialTreeDone3;
                }
                if (+(+(f32(lowerX + readF32(collider, 52)) >= f32(upperX + readF32(parent, 20))) === 0)) {
                  break rebuildVisualSpatialTreeDone2;
                }
              }
              parent = node;
              children = readI32(node, 4);
              if (children) {
                continue rebuildVisualSpatialTreeLoop4;
              }
              break;
            }
          }
          insertSpatialCollider(parent, collider);
          index = index + 1 | 0;
          if (+(index >>> 0 < readI32(state, 1496) >>> 0)) {
            continue rebuildVisualSpatialTreeLoop3;
          }
          break;
        }
      }
      compactSpatialTree(state + 2104 | 0);
    }
  }
  /** Follow the local player and derive the viewport projection with original smoothing. Original WAT 135587–136183. */  function updateCamera(scratch, camera, state, frame) {
    let viewportWidthF32 = 0, widthScale = 0, heightScale = 0, pixelsPerWorld = 0, targetY = 0, shakeY = 0, playerY = 0, playerX = 0, elapsedF32 = 0, viewportWidthF64 = 0, amountF64 = 0, smoothing = 0, elapsedMilliseconds = 0, value = 0, amount = 0, count = 0, length = 0;
    updateCameraDone: {
      if (+(readI32(state, 256) === 0)) {
        break updateCameraDone;
      }
      length = readI32(readI32(state, 264));
      if (+(length === 0)) {
        break updateCameraDone;
      }
      amount = readF64(frame, 32);
      viewportWidthF32 = readF32(length, 136);
      updateCameraDone2: {
        updateCameraDone3: {
          if (readU8(165412) & 1) {
            break updateCameraDone3;
          }
          const resultOfAcquireGuard13 = acquireGuard(165412);
          if (+(resultOfAcquireGuard13 === 0)) {
            break updateCameraDone3;
          }
          writeI32(scratch, 0, 2592);
          const savedBits78 = isMobileUserAgentAbi(scratch + 2592 | 0) | 0;
          count = +(savedBits78 !== 0);
          writeU8(165408, count);
          releaseGuard(165412);
          break updateCameraDone2;
        }
        count = readU8(165408);
      }
      updateCameraDone4: {
        if (+((count & 255) === 0)) {
          break updateCameraDone4;
        }
        updateCameraDone5: {
          if (readU8(151560) & 1) {
            break updateCameraDone5;
          }
          const resultOfAcquireGuard14 = acquireGuard(151560);
          if (+(resultOfAcquireGuard14 === 0)) {
            break updateCameraDone5;
          }
          initializeSettings();
          releaseGuard(151560);
        }
        if (+(readU8(151528) === 0)) {
          break updateCameraDone4;
        }
        viewportWidthF32 = f32(viewportWidthF32 * 1.6);
      }
      count = 0;
      updateCameraDone6: {
        if (+(readI32(state, 256) === 0)) {
          break updateCameraDone6;
        }
        value = readI32(readI32(state, 264));
        if (+(value === 0)) {
          break updateCameraDone6;
        }
        count = +(readI32(value, 144) !== 0);
      }
      let selectedValue21;
      updateCameraDone7: {
        if (+(readU8(length, 24) === 0)) {
          const storedF326 = readF32(length, 16);
          selectedValue21 = storedF326;
          break updateCameraDone7;
        }
        readClock(scratch + 2776 | 0);
        let selectedValue22;
        updateCameraDone8: {
          if (+(readU8(scratch, 2776) === 0)) {
            selectedValue22 = Infinity;
            break updateCameraDone8;
          }
          void Infinity;
          if (+(readU8(length, 24) === 0)) {
            selectedValue22 = -Infinity;
            break updateCameraDone8;
          }
          void -Infinity;
          selectedValue22 = (readF64(scratch, 2784) - readF64(length, 32)) * .008333333333333333;
        }
        const resultOfMin = Math.min(Math.max(selectedValue22, 0), 1);
        const storedF327 = readF32(length, 16);
        widthScale = readF32(length, 20);
        selectedValue21 = f32(resultOfMin * f32(storedF327 - widthScale) + widthScale);
      }
      playerX = selectedValue21;
      let selectedValue23;
      updateCameraDone9: {
        if (+(readU8(length, 120) === 0)) {
          const storedF328 = readF32(length, 112);
          selectedValue23 = storedF328;
          break updateCameraDone9;
        }
        readClock(scratch + 2776 | 0);
        let selectedValue24;
        updateCameraDone10: {
          if (+(readU8(scratch, 2776) === 0)) {
            selectedValue24 = Infinity;
            break updateCameraDone10;
          }
          void Infinity;
          if (+(readU8(length, 120) === 0)) {
            selectedValue24 = -Infinity;
            break updateCameraDone10;
          }
          void -Infinity;
          selectedValue24 = (readF64(scratch, 2784) - readF64(length, 128)) * .008333333333333333;
        }
        const resultOfMin2 = Math.min(Math.max(selectedValue24, 0), 1);
        const storedF329 = readF32(length, 112);
        widthScale = readF32(length, 116);
        selectedValue23 = f32(resultOfMin2 * f32(storedF329 - widthScale) + widthScale);
      }
      playerY = selectedValue23;
      elapsedF32 = f32(amount);
      shakeY = readF32(state + 2052 | 0);
      targetY = readF32(state + 2048 | 0);
      const savedCamera2 = camera;
      let selectedValue25;
      updateCameraDone11: {
        if (+(count === 0)) {
          selectedValue25 = .20000000298023224;
          break updateCameraDone11;
        }
        void .20000000298023224;
        viewportWidthF64 = readF32(camera, 24);
        if (+(Math.abs(viewportWidthF64 + -1) < 1e-7)) {
          selectedValue25 = 1;
          break updateCameraDone11;
        }
        void 1;
        const resultOfPowF6410 = powF64(.95, elapsedF32 * .06);
        amount = 1 - resultOfPowF6410;
        selectedValue25 = f32(selectValue(0, Math.min(amount, 1), +(amount < 0)) * (1 - viewportWidthF64) + viewportWidthF64);
      }
      writeF32(savedCamera2, selectedValue25, 24);
      let selectedValue26;
      updateCameraDone12: {
        if (+(readU8(camera, 56) === 0)) {
          selectedValue26 = 0;
          break updateCameraDone12;
        }
        void 0;
        readClock(scratch + 2776 | 0);
        if (readU8(scratch, 2776)) {
          if (+(readU8(camera, 56) === 0)) {
            selectedValue26 = 1;
            break updateCameraDone12;
          }
          void 1;
          if (+(f32(readF64(scratch, 2784) - readF64(camera - -64 | 0)) < 200)) {
            selectedValue26 = 1;
            break updateCameraDone12;
          }
          void 1;
        }
        writeU8(camera, 0, 56);
        writeI64(camera - -64 | 0, 0n);
        selectedValue26 = 0;
      }
      amountF64 = selectedValue26;
      const savedCamera3 = camera;
      viewportWidthF64 = readF32(camera, 72);
      let selectedValue27;
      if (+(Math.abs(viewportWidthF64 - amountF64) < 1e-7)) {
        selectedValue27 = amountF64;
      } else {
        const resultOfPowF6411 = powF64(.8, elapsedF32 * .06);
        amount = 1 - resultOfPowF6411;
        selectedValue27 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (amountF64 - viewportWidthF64) + viewportWidthF64;
      }
      writeF32(savedCamera3, f32(selectedValue27), 72);
      readClock(scratch + 2776 | 0);
      const resultOfElapsedFromOrigin = elapsedFromOrigin(scratch + 2776 | 0);
      const resultOfSinF643 = sinF64(resultOfElapsedFromOrigin * .05);
      amount = resultOfSinF643;
      widthScale = readF32(camera, 72);
      readClock(scratch + 2776 | 0);
      const resultOfElapsedFromOrigin2 = elapsedFromOrigin(scratch + 2776 | 0);
      pixelsPerWorld = f32(resultOfElapsedFromOrigin2 * .01);
      const resultOfSinF325 = sinF32(pixelsPerWorld);
      widthScale = f32(amount * 5 * widthScale);
      heightScale = f32(resultOfSinF325 * widthScale);
      const resultOfF3232 = f32(playerX + targetY);
      const resultOfCosF325 = cosF32(pixelsPerWorld);
      widthScale = f32(resultOfF3232 + f32(resultOfCosF325 * widthScale));
      updateCameraDone13: {
        if (+(count === 0)) {
          break updateCameraDone13;
        }
        if (readU8(camera)) {
          break updateCameraDone13;
        }
        writeI32(camera, 1065353216, 24);
      }
      writeU8(camera, count);
      elapsedMilliseconds = elapsedF32;
      smoothing = readF32(camera, 24);
      const savedCamera4 = camera;
      viewportWidthF64 = readF32(camera, 4);
      const savedViewportWidthF64 = viewportWidthF64;
      amount = widthScale;
      let selectedValue28;
      if (+(Math.abs(savedViewportWidthF64 - amount) < 1e-7)) {
        selectedValue28 = amount;
      } else {
        const savedDifference4 = amount - viewportWidthF64;
        const resultOfPowF6412 = powF64(1 - smoothing, elapsedMilliseconds * .06);
        amount = 1 - resultOfPowF6412;
        selectedValue28 = savedDifference4 * selectValue(0, Math.min(amount, 1), +(amount < 0)) + viewportWidthF64;
      }
      writeF32(savedCamera4, f32(selectedValue28), 4);
      const savedCamera5 = camera;
      amountF64 = readF32(camera, 8);
      const savedAmountF646 = amountF64;
      viewportWidthF64 = f32(f32(playerY + shakeY) + heightScale);
      let selectedValue29;
      if (+(Math.abs(savedAmountF646 - viewportWidthF64) < 1e-7)) {
        selectedValue29 = viewportWidthF64;
      } else {
        const resultOfPowF6413 = powF64(1 - smoothing, elapsedMilliseconds * .06);
        amount = 1 - resultOfPowF6413;
        selectedValue29 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (viewportWidthF64 - amountF64) + amountF64;
      }
      writeF32(savedCamera5, f32(selectedValue29), 8);
      const savedCamera6 = camera;
      amountF64 = readF32(camera, 12);
      const savedAmountF647 = amountF64;
      viewportWidthF64 = viewportWidthF32;
      let selectedValue30;
      if (+(Math.abs(savedAmountF647 - viewportWidthF64) < 1e-7)) {
        selectedValue30 = viewportWidthF64;
      } else {
        const resultOfPowF6414 = powF64(.8, elapsedMilliseconds * .06);
        amount = 1 - resultOfPowF6414;
        selectedValue30 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (viewportWidthF64 - amountF64) + amountF64;
      }
      writeF32(savedCamera6, f32(selectedValue30), 12);
    }
    const savedCamera7 = camera;
    count = readI32(camera, 20);
    viewportWidthF32 = f32(count | 0);
    const savedViewportWidthF32 = viewportWidthF32;
    const storedF3210 = readF32(camera, 12);
    heightScale = f32(viewportWidthF32 * .0009259259095415473);
    const savedHeightScale = heightScale;
    value = readI32(camera, 16);
    viewportWidthF32 = f32(value | 0);
    widthScale = f32(viewportWidthF32 * .0005208333604969084);
    pixelsPerWorld = f32(storedF3210 * selectValue(savedHeightScale, widthScale, +(widthScale < heightScale)));
    writeF32(savedCamera7, f32(savedViewportWidthF32 / pixelsPerWorld), 40);
    writeF32(camera, f32(viewportWidthF32 / pixelsPerWorld), 36);
    writeF32(camera, f32(readF32(camera, 8) + f32(f32((count | 0) * -.5) / pixelsPerWorld)), 32);
    const savedCamera8 = camera;
    heightScale = readF32(camera, 4);
    const savedHeightScale2 = heightScale;
    viewportWidthF64 = value | 0;
    writeF32(savedCamera8, f32(savedHeightScale2 + f32(f32(viewportWidthF64 * -.5) / pixelsPerWorld)), 28);
    return [ viewportWidthF32, heightScale, pixelsPerWorld, viewportWidthF64 ];
  }
  /** Draw arena bands and the interpolated boundary overlay. Original WAT 136184–137341. */  function drawArenaBands(renderer, scratch, camera, state, frame, viewportWidthF32, heightScale, pixelsPerWorld, viewportWidthF64) {
    let entry = 0, sceneSettings = 0, amountF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, matrixTx = 0, matrixTy = 0, scaledMatrixC = 0, amountF64 = 0, scaleF64 = 0, stepF64 = 0, value = 0, amount = 0, count = 0, length = 0;
    drawArenaBandsDone: {
      if (+(readU8(state, 1) === 0)) {
        break drawArenaBandsDone;
      }
      amountF32 = readF32(state, 900);
      const resultOfF3233 = f32(amountF32 * .5);
      amount = f32(amountF32 * -.5);
      matrixA = f32(f32(f32((resultOfF3233 - amount) * .30000001192092896 + amount) - heightScale) * pixelsPerWorld);
      amount = viewportWidthF64 * .5;
      amountF32 = 0;
      drawArenaBandsLoop: while (true) {
        heightScale = viewportWidthF32;
        viewportWidthF32 = amountF32;
        const savedViewportWidthF322 = viewportWidthF32;
        amountF32 = heightScale;
        if (+(savedViewportWidthF322 > amountF32)) {
          continue drawArenaBandsLoop;
        }
        break;
      }
      value = readU8(renderer, 69);
      writeI32(scratch, readI32(renderer, 96), 2576);
      writeI32(scratch, selectValue(132, 97, value), 2588);
      writeI32(scratch, selectValue(132, 167, value), 2584);
      writeI32(scratch, selectValue(132, 30, value), 2580);
      const savedBits79 = canvasSetFillRgbAbi(scratch + 2576 | 0) | 0;
      void savedBits79;
      pixelsPerWorld = 0;
      const savedViewportWidthF323 = viewportWidthF32;
      const savedAmountF326 = amountF32;
      heightScale = f32(amount + matrixA);
      viewportWidthF32 = selectValue(savedViewportWidthF323, selectValue(savedAmountF326, heightScale, +(amountF32 < heightScale)), +(viewportWidthF32 > heightScale));
      if (+(viewportWidthF32 > 0)) {
        fillRectangle(renderer, 0, 0, viewportWidthF32, readI32(camera, 20) | 0);
      }
      viewportWidthF32 = readF32(state, 900);
      const resultOfF3234 = f32(viewportWidthF32 * .5);
      amountF64 = f32(viewportWidthF32 * -.5);
      amount = resultOfF3234 - amountF64;
      const resultOfF3235 = f32(amount * .30000001192092896 + amountF64);
      matrixC = readF32(camera, 4);
      const resultOfF3236 = f32(resultOfF3235 - matrixC);
      const storedF3211 = readF32(camera, 12);
      heightScale = f32(f32(readI32(camera, 20) | 0) * .0009259259095415473);
      const savedHeightScale3 = heightScale;
      value = readI32(camera, 16);
      viewportWidthF32 = f32(value | 0);
      amountF32 = f32(viewportWidthF32 * .0005208333604969084);
      matrixB = f32(storedF3211 * selectValue(savedHeightScale3, amountF32, +(amountF32 < heightScale)));
      matrixA = f32(resultOfF3236 * matrixB);
      viewportWidthF64 = (value | 0) * .5;
      amountF32 = viewportWidthF32;
      drawArenaBandsLoop2: while (true) {
        heightScale = amountF32;
        amountF32 = pixelsPerWorld;
        const savedAmountF327 = amountF32;
        pixelsPerWorld = heightScale;
        if (+(savedAmountF327 > pixelsPerWorld)) {
          continue drawArenaBandsLoop2;
        }
        break;
      }
      matrixD = f32(viewportWidthF64 + matrixA);
      amount = f32(f32(f32(amount * .6000000238418579 + amountF64) - matrixC) * matrixB);
      heightScale = 0;
      drawArenaBandsLoop3: while (true) {
        matrixA = viewportWidthF32;
        viewportWidthF32 = heightScale;
        const savedViewportWidthF324 = viewportWidthF32;
        heightScale = matrixA;
        if (+(savedViewportWidthF324 > heightScale)) {
          continue drawArenaBandsLoop3;
        }
        break;
      }
      value = readU8(renderer, 69);
      writeI32(scratch, readI32(renderer, 96), 2560);
      writeI32(scratch, selectValue(204, 124, value), 2572);
      writeI32(scratch, selectValue(204, 207, value), 2568);
      writeI32(scratch, selectValue(204, 222, value), 2564);
      const savedBits80 = canvasSetFillRgbAbi(scratch + 2560 | 0) | 0;
      void savedBits80;
      const savedViewportWidthF325 = viewportWidthF32;
      const savedHeightScale4 = heightScale;
      matrixA = f32(viewportWidthF64 + amount);
      viewportWidthF32 = selectValue(savedViewportWidthF325, selectValue(savedHeightScale4, matrixA, +(heightScale < matrixA)), +(viewportWidthF32 > matrixA));
      const savedViewportWidthF326 = viewportWidthF32;
      amountF32 = selectValue(amountF32, selectValue(pixelsPerWorld, matrixD, +(pixelsPerWorld < matrixD)), +(amountF32 > matrixD));
      if (+(savedViewportWidthF326 > amountF32)) {
        fillRectangle(renderer, amountF32, 0, f32(viewportWidthF32 - amountF32), readI32(camera, 20) | 0);
      }
      viewportWidthF32 = readF32(state, 900);
      const resultOfF3237 = f32(viewportWidthF32 * .5);
      amountF64 = f32(viewportWidthF32 * -.5);
      amount = resultOfF3237 - amountF64;
      const resultOfF3238 = f32(amount * .6000000238418579 + amountF64);
      matrixC = readF32(camera, 4);
      const resultOfF3239 = f32(resultOfF3238 - matrixC);
      const storedF3212 = readF32(camera, 12);
      heightScale = f32(f32(readI32(camera, 20) | 0) * .0009259259095415473);
      const savedHeightScale5 = heightScale;
      value = readI32(camera, 16);
      viewportWidthF32 = f32(value | 0);
      amountF32 = f32(viewportWidthF32 * .0005208333604969084);
      matrixB = f32(storedF3212 * selectValue(savedHeightScale5, amountF32, +(amountF32 < heightScale)));
      matrixA = f32(resultOfF3239 * matrixB);
      viewportWidthF64 = (value | 0) * .5;
      pixelsPerWorld = 0;
      amountF32 = viewportWidthF32;
      drawArenaBandsLoop4: while (true) {
        heightScale = amountF32;
        amountF32 = pixelsPerWorld;
        const savedAmountF328 = amountF32;
        pixelsPerWorld = heightScale;
        if (+(savedAmountF328 > pixelsPerWorld)) {
          continue drawArenaBandsLoop4;
        }
        break;
      }
      matrixD = f32(viewportWidthF64 + matrixA);
      amount = f32(f32(f32(amount * .8999999761581421 + amountF64) - matrixC) * matrixB);
      heightScale = 0;
      drawArenaBandsLoop5: while (true) {
        matrixA = viewportWidthF32;
        viewportWidthF32 = heightScale;
        const savedViewportWidthF327 = viewportWidthF32;
        heightScale = matrixA;
        if (+(savedViewportWidthF327 > heightScale)) {
          continue drawArenaBandsLoop5;
        }
        break;
      }
      value = readU8(renderer, 69);
      writeI32(scratch, readI32(renderer, 96), 2544);
      writeI32(scratch, selectValue(116, 85, value), 2556);
      writeI32(scratch, selectValue(116, 102, value), 2552);
      writeI32(scratch, selectValue(116, 176, value), 2548);
      const savedBits81 = canvasSetFillRgbAbi(scratch + 2544 | 0) | 0;
      void savedBits81;
      const savedViewportWidthF328 = viewportWidthF32;
      const savedHeightScale6 = heightScale;
      matrixA = f32(viewportWidthF64 + amount);
      viewportWidthF32 = selectValue(savedViewportWidthF328, selectValue(savedHeightScale6, matrixA, +(heightScale < matrixA)), +(viewportWidthF32 > matrixA));
      const savedViewportWidthF329 = viewportWidthF32;
      amountF32 = selectValue(amountF32, selectValue(pixelsPerWorld, matrixD, +(pixelsPerWorld < matrixD)), +(amountF32 > matrixD));
      if (+(savedViewportWidthF329 > amountF32)) {
        fillRectangle(renderer, amountF32, 0, f32(viewportWidthF32 - amountF32), readI32(camera, 20) | 0);
      }
      viewportWidthF32 = readF32(state, 900);
      const resultOfF3240 = f32(viewportWidthF32 * .5);
      amount = f32(viewportWidthF32 * -.5);
      const resultOfF3241 = f32(f32((resultOfF3240 - amount) * .8999999761581421 + amount) - readF32(camera, 4));
      const storedF3213 = readF32(camera, 12);
      amountF32 = f32(f32(readI32(camera, 20) | 0) * .0009259259095415473);
      const savedAmountF329 = amountF32;
      value = readI32(camera, 16);
      pixelsPerWorld = f32(value | 0);
      viewportWidthF32 = f32(pixelsPerWorld * .0005208333604969084);
      matrixA = f32(resultOfF3241 * f32(storedF3213 * selectValue(savedAmountF329, viewportWidthF32, +(viewportWidthF32 < amountF32))));
      amount = (value | 0) * .5;
      amountF32 = 0;
      viewportWidthF32 = pixelsPerWorld;
      drawArenaBandsLoop6: while (true) {
        heightScale = viewportWidthF32;
        viewportWidthF32 = amountF32;
        const savedViewportWidthF3210 = viewportWidthF32;
        amountF32 = heightScale;
        if (+(savedViewportWidthF3210 > amountF32)) {
          continue drawArenaBandsLoop6;
        }
        break;
      }
      value = readU8(renderer, 69);
      writeI32(scratch, readI32(renderer, 96), 2528);
      writeI32(scratch, selectValue(89, 86, value), 2540);
      writeI32(scratch, selectValue(89, 94, value), 2536);
      writeI32(scratch, selectValue(89, 77, value), 2532);
      const savedBits82 = canvasSetFillRgbAbi(scratch + 2528 | 0) | 0;
      void savedBits82;
      const savedPixelsPerWorld = pixelsPerWorld;
      const savedViewportWidthF3211 = viewportWidthF32;
      const savedAmountF3210 = amountF32;
      heightScale = f32(amount + matrixA);
      viewportWidthF32 = selectValue(savedViewportWidthF3211, selectValue(savedAmountF3210, heightScale, +(amountF32 < heightScale)), +(viewportWidthF32 > heightScale));
      if (+(savedPixelsPerWorld > viewportWidthF32)) {
        fillRectangle(renderer, viewportWidthF32, 0, f32(pixelsPerWorld - viewportWidthF32), readI32(camera, 20) | 0);
      }
      value = readU8(state, 1);
      if (+(value === 0)) {
        break drawArenaBandsDone;
      }
      if (+(readI32(state, 256) === 0)) {
        break drawArenaBandsDone;
      }
      count = readI32(readI32(state, 264));
      if (+(count === 0)) {
        break drawArenaBandsDone;
      }
      stepF64 = readF64(frame, 32);
      const resultOfF3242 = f32(readF32(441284) * 4);
      sceneSettings = selectValue(state + 648 | 0, 0, value);
      amountF32 = f32(readF32(sceneSettings, 252) * .5);
      matrixB = f32(f32(resultOfF3242 - amountF32) * .20000000298023224);
      writeF32(441284, matrixB);
      viewportWidthF32 = readF32(sceneSettings, 340);
      matrixA = f32(f32(amountF32 + f32(readF32(441292) * 4)) * .20000000298023224);
      writeF32(441292, matrixA);
      const resultOfF3243 = f32(readF32(441288) * 4);
      viewportWidthF32 = f32(viewportWidthF32 * .5);
      amountF32 = f32(f32(resultOfF3243 - viewportWidthF32) * .20000000298023224);
      writeF32(441288, amountF32);
      pixelsPerWorld = f32(f32(viewportWidthF32 + f32(readF32(441296) * 4)) * .20000000298023224);
      writeF32(441296, pixelsPerWorld);
      matrixTy = readF32(camera, 8);
      viewportWidthF32 = readF32(camera, 12);
      entry = readI32(camera, 16);
      length = readI32(camera, 20);
      matrixTx = readF32(camera, 4);
      writeI32(scratch, readI32(renderer, 96), 2512);
      const savedBits83 = canvasSaveAbi(scratch + 2512 | 0) | 0;
      void savedBits83;
      writeI64(scratch + 2836 | 0, readI64(renderer, 56));
      writeI64(scratch + 2828 | 0, readI64(renderer, 48));
      writeI64(scratch + 2820 | 0, readI64(renderer, 40));
      writeI64(scratch + 2812 | 0, readI64(renderer, 32));
      writeI64(scratch + 2804 | 0, readI64(renderer, 24));
      writeI64(scratch + 2796 | 0, readI64(renderer, 16));
      writeI64(scratch + 2788 | 0, readI64(renderer, 8));
      writeI64(scratch, readI64(renderer), 2780);
      const savedRenderer50 = renderer;
      amount = readF64(renderer, 56) * .1;
      amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
      writeF64(savedRenderer50, amount, 56);
      value = readI32(renderer, 96);
      writeF64(scratch, amount, 2504);
      writeI32(scratch, value, 2496);
      const savedBits84 = canvasSetGlobalAlphaAbi(scratch + 2496 | 0) | 0;
      void savedBits84;
      value = readI32(renderer, 96);
      writeI32(scratch, 0, 2492);
      writeI64(scratch, 0n, 2484);
      writeI32(scratch, value, 2480);
      const savedBits85 = canvasSetFillRgbAbi(scratch + 2480 | 0) | 0;
      void savedBits85;
      const savedRenderer51 = renderer;
      scaleF64 = (length | 0) * .5;
      const savedScaleF64 = scaleF64;
      const resultOfF3244 = f32(amountF32 - matrixTy);
      const savedViewportWidthF3212 = viewportWidthF32;
      matrixD = f32(length | 0);
      amountF32 = f32(matrixD * .0009259259095415473);
      const savedAmountF3211 = amountF32;
      matrixC = f32(entry | 0);
      viewportWidthF32 = f32(matrixC * .0005208333604969084);
      scaledMatrixC = f32(savedViewportWidthF3212 * selectValue(savedAmountF3211, viewportWidthF32, +(viewportWidthF32 < amountF32)));
      viewportWidthF32 = f32(savedScaleF64 + f32(resultOfF3244 * scaledMatrixC));
      heightScale = selectValue(viewportWidthF32, 0, +(viewportWidthF32 > 0));
      amountF64 = heightScale;
      const savedAmountF648 = amountF64;
      amount = (entry | 0) * .5;
      viewportWidthF32 = f32(amount + f32(f32(matrixB - matrixTx) * scaledMatrixC));
      amountF32 = selectValue(viewportWidthF32, 0, +(viewportWidthF32 > 0));
      viewportWidthF64 = amountF32;
      fillRectangle(savedRenderer51, 0, savedAmountF648, viewportWidthF64, f32(f32(readI32(camera, 20) | 0) - heightScale));
      const savedRenderer52 = renderer;
      viewportWidthF32 = f32(amount + f32(f32(matrixA - matrixTx) * scaledMatrixC));
      viewportWidthF32 = selectValue(viewportWidthF32, matrixC, +(viewportWidthF32 < matrixC));
      amount = viewportWidthF32;
      fillRectangle(savedRenderer52, 0, 0, amount, amountF64);
      const savedRenderer53 = renderer;
      const savedAmount = amount;
      const resultOfF3245 = f32(f32(readI32(camera, 16) | 0) - viewportWidthF32);
      viewportWidthF32 = f32(scaleF64 + f32(f32(pixelsPerWorld - matrixTy) * scaledMatrixC));
      viewportWidthF32 = selectValue(viewportWidthF32, matrixD, +(viewportWidthF32 < matrixD));
      amount = viewportWidthF32;
      fillRectangle(savedRenderer53, savedAmount, 0, resultOfF3245, amount);
      fillRectangle(renderer, viewportWidthF64, amount, f32(f32(readI32(camera, 16) | 0) - amountF32), f32(f32(readI32(camera, 20) | 0) - viewportWidthF32));
      drawArenaBandsDone2: {
        if (readU8(441304) & 1) {
          break drawArenaBandsDone2;
        }
        const resultOfAcquireGuard15 = acquireGuard(441304);
        if (+(resultOfAcquireGuard15 === 0)) {
          break drawArenaBandsDone2;
        }
        writeF32(441300, f32(readF32(sceneSettings, 252) * -.5));
        releaseGuard(441304);
      }
      heightScale = f32(readF32(sceneSettings, 252) * -.5);
      amountF32 = heightScale;
      value = readI32(count, 144);
      if (value) {
        value = readI32(value, 152);
        const resultOfArenaBandBoundary = arenaBandBoundary(readI32(readI32(value)) + 648 | 0, readU8(value, 168));
        viewportWidthF32 = resultOfArenaBandBoundary;
        amountF32 = selectValue(viewportWidthF32, heightScale, +(viewportWidthF32 > heightScale));
      }
      amountF64 = readF32(441300);
      const savedAmountF649 = amountF64;
      viewportWidthF64 = amountF32;
      let selectedValue31;
      if (+(Math.abs(savedAmountF649 - viewportWidthF64) < 1e-7)) {
        selectedValue31 = viewportWidthF64;
      } else {
        const resultOfPowF6415 = powF64(.8, f32(stepF64) * .06);
        amount = 1 - resultOfPowF6415;
        selectedValue31 = selectValue(0, Math.min(amount, 1), +(amount < 0)) * (viewportWidthF64 - amountF64) + amountF64;
      }
      matrixC = f32(selectedValue31);
      writeF32(441300, matrixC);
      const savedRenderer54 = renderer;
      count = readI32(camera, 16);
      viewportWidthF64 = (count | 0) * .5;
      const savedViewportWidthF642 = viewportWidthF64;
      const savedHeightScale7 = heightScale;
      matrixB = readF32(camera, 4);
      const resultOfF3246 = f32(savedHeightScale7 - matrixB);
      const storedF3214 = readF32(camera, 12);
      value = readI32(camera, 20);
      matrixD = f32(value | 0);
      amountF32 = f32(matrixD * .0009259259095415473);
      const savedAmountF3212 = amountF32;
      viewportWidthF32 = f32(f32(count | 0) * .0005208333604969084);
      matrixTx = f32(storedF3214 * selectValue(savedAmountF3212, viewportWidthF32, +(viewportWidthF32 < amountF32)));
      viewportWidthF32 = f32(savedViewportWidthF642 + f32(resultOfF3246 * matrixTx));
      matrixA = selectValue(viewportWidthF32, 0, +(viewportWidthF32 > 0));
      const savedMatrixA3 = matrixA;
      amount = (value | 0) * .5;
      const savedAmount2 = amount;
      pixelsPerWorld = readF32(sceneSettings, 340);
      const resultOfF3247 = f32(pixelsPerWorld * -.5);
      heightScale = readF32(camera, 8);
      viewportWidthF32 = f32(savedAmount2 + f32(f32(resultOfF3247 - heightScale) * matrixTx));
      amountF32 = selectValue(viewportWidthF32, 0, +(viewportWidthF32 > 0));
      const savedAmountF3213 = amountF32;
      viewportWidthF32 = f32(viewportWidthF64 + f32(f32(matrixC - matrixB) * matrixTx));
      const resultOfF3248 = f32(selectValue(viewportWidthF32, 0, +(viewportWidthF32 > 0)) - matrixA);
      viewportWidthF32 = f32(amount + f32(f32(f32(pixelsPerWorld * .5) - heightScale) * matrixTx));
      fillRectangle(savedRenderer54, savedMatrixA3, savedAmountF3213, resultOfF3248, f32(selectValue(viewportWidthF32, matrixD, +(viewportWidthF32 < matrixD)) - amountF32));
      const savedRenderer55 = renderer;
      value = scratch + 2780 | 0;
      writeI64(savedRenderer55, readI64(value, 56), 56);
      writeI64(renderer, readI64(value, 48), 48);
      writeI64(renderer, readI64(value, 40), 40);
      writeI64(renderer, readI64(value, 32), 32);
      writeI64(renderer, readI64(value, 24), 24);
      writeI64(renderer, readI64(value, 16), 16);
      writeI64(renderer, readI64(value, 8), 8);
      writeI64(renderer, readI64(value));
      writeI32(scratch, readI32(renderer, 96), 2464);
      const savedBits86 = canvasRestoreAbi(scratch + 2464 | 0) | 0;
      void savedBits86;
    }
  }
  /** Project and draw the half-pixel-aligned world grid. Original WAT 137342–138287. */  function drawWorldGrid(renderer, scratch, camera) {
    let entry = 0, index = 0, cachedTransform = 0, countPointer = 0, vector = 0, savedRenderer = 0, valueF32 = 0, amountF32 = 0, scaleF32 = 0, sizeF32 = 0, matrixA = 0, matrixB = 0, matrixC = 0, matrixD = 0, cellSize = 0, valueF64 = 0, gridStep = 0, value = 0, amount = 0, count = 0, length = 0;
    matrixB = readF32(camera, 8);
    matrixA = readF32(camera, 4);
    const savedScratch12 = scratch;
    const storedF3215 = readF32(camera, 12);
    count = readI32(camera, 20);
    sizeF32 = f32(count | 0);
    scaleF32 = f32(sizeF32 * .0009259259095415473);
    const savedScaleF325 = scaleF32;
    value = readI32(camera, 16);
    amountF32 = f32(value | 0);
    valueF32 = f32(amountF32 * .0005208333604969084);
    scaleF32 = f32(storedF3215 * selectValue(savedScaleF325, valueF32, +(valueF32 < scaleF32)));
    cellSize = f32(scaleF32 * 50);
    gridStep = cellSize;
    writeF64(savedScratch12, gridStep, 2456);
    writeF64(scratch, f32((value | 0) * .5 - f32(scaleF32 * matrixA)), 2448);
    const savedValue = +floatingPointRemainderAbi(scratch + 2448 | 0);
    amount = savedValue;
    writeF64(scratch, gridStep, 2440);
    writeF64(scratch, amount + gridStep, 2432);
    const savedValue2 = +floatingPointRemainderAbi(scratch + 2432 | 0);
    valueF64 = savedValue2;
    writeF64(scratch, gridStep, 2424);
    writeF64(scratch, f32((count | 0) * .5 - f32(scaleF32 * matrixB)), 2416);
    const savedValue3 = +floatingPointRemainderAbi(scratch + 2416 | 0);
    amount = savedValue3;
    writeF64(scratch, gridStep, 2408);
    writeF64(scratch, amount + gridStep, 2400);
    let selectedValue32;
    drawWorldGridDone: {
      valueF32 = f32(f32(cellSize + sizeF32) + 1);
      if (+(f32(Math.abs(valueF32)) < 2147483648)) {
        const resultOfTruncateInteger3 = truncateInteger(valueF32, false);
        selectedValue32 = resultOfTruncateInteger3;
        break drawWorldGridDone;
      }
      selectedValue32 = -2147483648;
    }
    vector = selectedValue32;
    value = +(cellSize >= 2);
    let selectedValue33;
    drawWorldGridDone2: {
      valueF32 = f32(f32(cellSize + amountF32) + 1);
      if (+(f32(Math.abs(valueF32)) < 2147483648)) {
        const resultOfTruncateInteger4 = truncateInteger(valueF32, false);
        selectedValue33 = resultOfTruncateInteger4;
        break drawWorldGridDone2;
      }
      selectedValue33 = -2147483648;
    }
    index = selectedValue33;
    const savedValue4 = +floatingPointRemainderAbi(scratch + 2400 | 0);
    amount = savedValue4;
    if (value) {
      valueF32 = f32(amount);
      writeI32(scratch, readI32(renderer, 96), 2384);
      const savedBits87 = canvasSaveAbi(scratch + 2384 | 0) | 0;
      void savedBits87;
      writeI64(scratch + 2836 | 0, readI64(renderer, 56));
      writeI64(scratch + 2828 | 0, readI64(renderer, 48));
      writeI64(scratch + 2820 | 0, readI64(renderer, 40));
      writeI64(scratch + 2812 | 0, readI64(renderer, 32));
      const savedBits88 = scratch + 2804 | 0;
      cachedTransform = renderer + 24 | 0;
      writeI64(savedBits88, readI64(cachedTransform));
      writeI64(scratch + 2796 | 0, readI64(renderer, 16));
      writeI64(scratch + 2788 | 0, readI64(renderer, 8));
      writeI64(scratch, readI64(renderer), 2780);
      value = readI32(renderer, 96);
      writeI32(scratch, 0, 2380);
      writeI64(scratch, 0n, 2372);
      writeI32(scratch, value, 2368);
      const savedBits89 = canvasSetStrokeRgbAbi(scratch + 2368 | 0) | 0;
      void savedBits89;
      const savedRenderer56 = renderer;
      amount = readF64(renderer, 56) * f32(scaleF32 * .10000000149011612);
      amount = selectValue(0, Math.min(amount, 1), +(amount < 0));
      writeF64(savedRenderer56, amount, 56);
      value = readI32(renderer, 96);
      writeF64(scratch, amount, 2360);
      writeI32(scratch, value, 2352);
      const savedBits90 = canvasSetGlobalAlphaAbi(scratch + 2352 | 0) | 0;
      void savedBits90;
      writeI32(scratch, readI32(renderer, 96), 2336);
      const savedBits91 = canvasBeginPathAbi(scratch + 2336 | 0) | 0;
      void savedBits91;
      amountF32 = f32(valueF64);
      const savedAmountF3214 = amountF32;
      matrixD = f32(index | 0);
      if (+(savedAmountF3214 < matrixD)) {
        amount = (vector | 0) + .5;
        countPointer = scratch + 2256 | 0;
        entry = scratch + 2224 | 0;
        length = scratch + 2216 | 0;
        count = scratch + 2208 | 0;
        drawWorldGridLoop: while (true) {
          valueF64 = amountF32 + .5;
          drawWorldGridDone3: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawWorldGridDone3;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory19 = compareMemory(cachedTransform, renderer, 24);
            if (+(resultOfCompareMemory19 === 0)) {
              break drawWorldGridDone3;
            }
            writeI64(cachedTransform, readI64(renderer));
            writeI64(cachedTransform, readI64(renderer, 16), 16);
            writeI64(cachedTransform, readI64(renderer, 8), 8);
            matrixC = readF32(renderer, 8);
            matrixB = readF32(renderer, 16);
            matrixA = readF32(renderer);
            value = readI32(renderer, 96);
            sizeF32 = readF32(renderer, 4);
            scaleF32 = readF32(renderer, 12);
            writeF64(scratch + 2320 | 0, readF32(renderer, 20));
            writeF64(scratch + 2312 | 0, matrixB);
            writeF64(scratch + 2304 | 0, scaleF32);
            writeF64(scratch + 2296 | 0, matrixC);
            writeF64(scratch + 2288 | 0, sizeF32);
            writeI32(scratch, value, 2272);
            writeF64(scratch, matrixA, 2280);
            const savedBits92 = canvasSetTransformAbi(scratch + 2272 | 0) | 0;
            void savedBits92;
          }
          value = readI32(renderer, 96);
          writeI64(countPointer, 4602678819172646912n);
          writeF64(scratch, valueF64, 2248);
          writeI32(scratch, value, 2240);
          const savedBits93 = canvasMoveToAbi(scratch + 2240 | 0) | 0;
          void savedBits93;
          drawWorldGridDone4: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawWorldGridDone4;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory20 = compareMemory(cachedTransform, renderer, 24);
            if (+(resultOfCompareMemory20 === 0)) {
              break drawWorldGridDone4;
            }
            writeI64(cachedTransform, readI64(renderer));
            writeI64(cachedTransform, readI64(renderer, 16), 16);
            writeI64(cachedTransform, readI64(renderer, 8), 8);
            matrixC = readF32(renderer, 8);
            matrixB = readF32(renderer, 16);
            matrixA = readF32(renderer);
            value = readI32(renderer, 96);
            sizeF32 = readF32(renderer, 4);
            scaleF32 = readF32(renderer, 12);
            writeF64(entry, readF32(renderer, 20));
            writeF64(length, matrixB);
            writeF64(count, scaleF32);
            writeF64(scratch + 2200 | 0, matrixC);
            writeF64(scratch + 2192 | 0, sizeF32);
            writeI32(scratch, value, 2176);
            writeF64(scratch, matrixA, 2184);
            const savedBits94 = canvasSetTransformAbi(scratch + 2176 | 0) | 0;
            void savedBits94;
          }
          value = readI32(renderer, 96);
          writeF64(scratch + 2160 | 0, amount);
          writeF64(scratch, valueF64, 2152);
          writeI32(scratch, value, 2144);
          const savedBits95 = canvasLineToAbi(scratch + 2144 | 0) | 0;
          void savedBits95;
          amountF32 = f32(cellSize + amountF32);
          if (+(amountF32 < matrixD)) {
            continue drawWorldGridLoop;
          }
          break;
        }
      }
      matrixC = f32(vector | 0);
      if (+(matrixC > valueF32)) {
        amount = (index | 0) + .5;
        countPointer = scratch + 2064 | 0;
        entry = scratch + 2032 | 0;
        length = scratch + 2024 | 0;
        count = scratch + 2016 | 0;
        drawWorldGridLoop2: while (true) {
          valueF64 = valueF32 + .5;
          drawWorldGridDone5: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawWorldGridDone5;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory21 = compareMemory(cachedTransform, renderer, 24);
            if (+(resultOfCompareMemory21 === 0)) {
              break drawWorldGridDone5;
            }
            writeI64(cachedTransform, readI64(renderer));
            writeI64(cachedTransform, readI64(renderer, 16), 16);
            writeI64(cachedTransform, readI64(renderer, 8), 8);
            matrixB = readF32(renderer, 8);
            matrixA = readF32(renderer, 16);
            sizeF32 = readF32(renderer);
            value = readI32(renderer, 96);
            scaleF32 = readF32(renderer, 4);
            amountF32 = readF32(renderer, 12);
            writeF64(scratch + 2128 | 0, readF32(renderer, 20));
            writeF64(scratch + 2120 | 0, matrixA);
            writeF64(scratch + 2112 | 0, amountF32);
            writeF64(scratch + 2104 | 0, matrixB);
            writeF64(scratch + 2096 | 0, scaleF32);
            writeI32(scratch, value, 2080);
            writeF64(scratch, sizeF32, 2088);
            const savedBits96 = canvasSetTransformAbi(scratch + 2080 | 0) | 0;
            void savedBits96;
          }
          value = readI32(renderer, 96);
          writeF64(countPointer, valueF64);
          writeI64(scratch, 4602678819172646912n, 2056);
          writeI32(scratch, value, 2048);
          const savedBits97 = canvasMoveToAbi(scratch + 2048 | 0) | 0;
          void savedBits97;
          drawWorldGridDone6: {
            if (+(readU8(renderer, 48) === 0)) {
              break drawWorldGridDone6;
            }
            writeU8(renderer, 0, 48);
            const resultOfCompareMemory22 = compareMemory(cachedTransform, renderer, 24);
            if (+(resultOfCompareMemory22 === 0)) {
              break drawWorldGridDone6;
            }
            writeI64(cachedTransform, readI64(renderer));
            writeI64(cachedTransform, readI64(renderer, 16), 16);
            writeI64(cachedTransform, readI64(renderer, 8), 8);
            matrixB = readF32(renderer, 8);
            matrixA = readF32(renderer, 16);
            sizeF32 = readF32(renderer);
            value = readI32(renderer, 96);
            scaleF32 = readF32(renderer, 4);
            amountF32 = readF32(renderer, 12);
            writeF64(entry, readF32(renderer, 20));
            writeF64(length, matrixA);
            writeF64(count, amountF32);
            writeF64(scratch + 2008 | 0, matrixB);
            writeF64(scratch + 2e3 | 0, scaleF32);
            writeI32(scratch, value, 1984);
            writeF64(scratch, sizeF32, 1992);
            const savedBits98 = canvasSetTransformAbi(scratch + 1984 | 0) | 0;
            void savedBits98;
          }
          value = readI32(renderer, 96);
          writeF64(scratch + 1968 | 0, valueF64);
          writeF64(scratch, amount, 1960);
          writeI32(scratch, value, 1952);
          const savedBits99 = canvasLineToAbi(scratch + 1952 | 0) | 0;
          void savedBits99;
          valueF32 = f32(cellSize + valueF32);
          if (+(valueF32 < matrixC)) {
            continue drawWorldGridLoop2;
          }
          break;
        }
      }
      count = scratch + 2780 | 0;
      drawWorldGridDone7: {
        if (+(readU8(renderer, 48) === 0)) {
          break drawWorldGridDone7;
        }
        writeU8(renderer, 0, 48);
        const resultOfCompareMemory23 = compareMemory(cachedTransform, renderer, 24);
        if (+(resultOfCompareMemory23 === 0)) {
          break drawWorldGridDone7;
        }
        writeI64(cachedTransform, readI64(renderer));
        writeI64(cachedTransform, readI64(renderer, 16), 16);
        writeI64(cachedTransform, readI64(renderer, 8), 8);
        matrixA = readF32(renderer, 8);
        sizeF32 = readF32(renderer, 16);
        scaleF32 = readF32(renderer);
        value = readI32(renderer, 96);
        amountF32 = readF32(renderer, 4);
        valueF32 = readF32(renderer, 12);
        writeF64(scratch + 1936 | 0, readF32(renderer, 20));
        writeF64(scratch + 1928 | 0, sizeF32);
        writeF64(scratch + 1920 | 0, valueF32);
        writeF64(scratch + 1912 | 0, matrixA);
        writeF64(scratch + 1904 | 0, amountF32);
        writeI32(scratch, value, 1888);
        writeF64(scratch, scaleF32, 1896);
        const savedBits100 = canvasSetTransformAbi(scratch + 1888 | 0) | 0;
        void savedBits100;
      }
      writeI32(scratch, readI32(renderer, 96), 1872);
      const savedBits101 = canvasStrokeAbi(scratch + 1872 | 0) | 0;
      void savedBits101;
      writeI64(renderer, readI64(count, 56), 56);
      writeI64(renderer, readI64(count, 48), 48);
      writeI64(renderer, readI64(count, 40), 40);
      writeI64(renderer, readI64(count, 32), 32);
      writeI64(renderer, readI64(count, 24), 24);
      writeI64(renderer, readI64(count, 16), 16);
      writeI64(renderer, readI64(count, 8), 8);
      writeI64(renderer, readI64(count));
      writeI32(scratch, readI32(renderer, 96), 1856);
      const savedBits102 = canvasRestoreAbi(scratch + 1856 | 0) | 0;
      void savedBits102;
    }
    savedRenderer = scratch + 2688 | 0;
    return [ savedRenderer ];
  }
  /** Restore the caller drawing state after the scene pass. Original WAT 143441–143484. */  function restoreOuterDrawingState(frame, callerRenderer) {
    if (callerRenderer) {
      writeI64(callerRenderer, readI64(frame, 60));
      writeI64(callerRenderer, readI64(frame, 116), 56);
      writeI64(callerRenderer, readI64(frame, 108), 48);
      writeI64(callerRenderer, readI64(frame, 100), 40);
      writeI64(callerRenderer, readI64(frame, 92), 32);
      writeI64(callerRenderer, readI64(frame, 84), 24);
      writeI64(callerRenderer, readI64(frame, 76), 16);
      writeI64(callerRenderer, readI64(frame, 68), 8);
      writeI32(frame, readI32(callerRenderer, 96));
      const savedBits103 = canvasRestoreAbi(frame) | 0;
      void savedBits103;
    }
  }
  /** Restore the preceding clock and release the outer frame scratch area. Original WAT 143485–143515. */  function restoreFrameClock(frame) {
    restoreFrameClockDone: {
      if (readU8(7922328) & 1) {
        break restoreFrameClockDone;
      }
      const resultOfAcquireGuard16 = acquireGuard(7922328);
      if (+(resultOfAcquireGuard16 === 0)) {
        break restoreFrameClockDone;
      }
      writeI64(7922320, 0n);
      writeU8(7922312, 0);
      releaseGuard(7922328);
    }
    writeI64(7922312, readI64(frame, 128));
    writeI64(7922320, readI64(frame, 136));
    runtime.stackPointer.value = frame + 144 | 0;
  }
  return {
    763: updateAndRender
  };
}
