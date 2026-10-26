/** Complete source recovery of original client entity renderer760.
 * The driver below exposes viewport culling, local interpolation, visual effects,
 * owner-child recursion, discovery tracking and ordered component dispatch.
 * Numeric component slots are preserved where their product identity is unproven.
 * Retained evaluation snapshots and expanded affine products preserve f32 rounding,
 * memory write order, signed zero and the original stack state on exceptions.
 * Artifact: c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const functionIds = Object.freeze([ 760 ]);

const f32 = Math.fround;

export function createEntityRendererHooks(runtime) {
  // Explicit dependencies retain their own implementation and table identity.
  const free = (...args) => runtime.call(362, ...args);
  const compareMemory = (...args) => runtime.call(366, ...args);
  const acquireGuard = (...args) => runtime.call(369, ...args);
  const releaseGuard = (...args) => runtime.call(370, ...args);
  const readClock = (...args) => runtime.call(372, ...args);
  const roundF64 = (...args) => runtime.call(373, ...args);
  const powF64 = (...args) => runtime.call(375, ...args);
  const getEntityDefinition = (...args) => runtime.call(391, ...args);
  const fillAndStrokeCurrentPath = (...args) => runtime.call(395, ...args);
  const cosF64 = (...args) => runtime.call(403, ...args);
  const sinF64 = (...args) => runtime.call(407, ...args);
  const updateWorldTransform = (...args) => runtime.call(409, ...args);
  const formatDiscoveryKey = (...args) => runtime.call(412, ...args);
  const cosF32 = (...args) => runtime.call(427, ...args);
  const sinF32 = (...args) => runtime.call(431, ...args);
  const strokeStoredPath = (...args) => runtime.call(455, ...args);
  const clearCanvas = (...args) => runtime.call(496, ...args);
  const storeDiscoveryRecord = (...args) => runtime.call(557, ...args)
  // Component suffixes are entity-pointer offsets, not claimed feature names.
  ;
  const drawComponent124 = (...args) => runtime.call(614, ...args);
  const drawComponent84 = (...args) => runtime.call(615, ...args);
  const drawComponent96 = (...args) => runtime.call(616, ...args);
  const resizeCanvas = (...args) => runtime.call(634, ...args);
  const updateVisualBounds = (...args) => runtime.call(672, ...args);
  const interpolateAngle = (...args) => runtime.call(705, ...args);
  const drawComponent104 = (...args) => runtime.call(782, ...args);
  const drawComponent60 = (...args) => runtime.call(785, ...args);
  const initializeDiscoveredCatalog = (...args) => runtime.call(787, ...args);
  const drawComponent64 = (...args) => runtime.call(1038, ...args);
  const drawComponent80 = (...args) => runtime.call(1039, ...args);
  const drawComponent132 = (...args) => runtime.call(1040, ...args);
  const drawComponent88 = (...args) => runtime.call(1043, ...args);
  const drawComponent148 = (...args) => runtime.call(1044, ...args);
  const drawComponent128 = (...args) => runtime.call(1045, ...args);
  const getEntityDisplayName = (...args) => runtime.call(1048, ...args);
  const drawPlayerAppearance = (...args) => runtime.call(1100, ...args);
  const drawCachedImageRegion = (...args) => runtime.call(1131, ...args);
  const canvasSetLineWidthAbi = argumentPointer => +runtime.host("a", "a", 138111, 93028, argumentPointer);
  const canvasSetLineJoinRoundAbi = argumentPointer => +runtime.host("a", "a", 138811, 31967, argumentPointer);
  const canvasSetLineCapRoundAbi = argumentPointer => +runtime.host("a", "a", 138730, 31967, argumentPointer);
  const canvasSetFillRgbAbi = argumentPointer => +runtime.host("a", "a", 137186, 32170, argumentPointer);
  const canvasSetStrokeRgbAbi = argumentPointer => +runtime.host("a", "a", 137456, 32170, argumentPointer);
  const canvasBeginPathAbi = argumentPointer => +runtime.host("a", "a", 136878, 31967, argumentPointer);
  const canvasSetTransformAbi = argumentPointer => +runtime.host("a", "a", 136414, 32144, argumentPointer);
  const canvasMoveToAbi = argumentPointer => +runtime.host("a", "a", 137806, 32166, argumentPointer);
  const canvasLineToAbi = argumentPointer => +runtime.host("a", "a", 137843, 32166, argumentPointer);
  const canvasClosePathAbi = argumentPointer => +runtime.host("a", "a", 136912, 31967, argumentPointer);
  const canvasArcAbi = argumentPointer => +runtime.host("a", "a", 137995, 32183, argumentPointer);
  const canvasFillAbi = argumentPointer => +runtime.host("a", "a", 136661, 31967, argumentPointer);
  const canvasStrokeAbi = argumentPointer => +runtime.host("a", "a", 136732, 31967, argumentPointer);
  const pathCreateAbi = argumentPointer => +runtime.host("a", "a", 141620, 31967, argumentPointer);
  const pathMoveToAbi = argumentPointer => +runtime.host("a", "a", 141801, 32166, argumentPointer);
  const pathQuadraticCurveToAbi = argumentPointer => +runtime.host("a", "a", 141918, 32160, argumentPointer);
  const pathCloseAbi = argumentPointer => +runtime.host("a", "a", 142027, 31967, argumentPointer);
  const pathLineToAbi = argumentPointer => +runtime.host("a", "a", 141835, 32166, argumentPointer);
  const canvasSaveAbi = argumentPointer => +runtime.host("a", "a", 136300, 31967, argumentPointer);
  const canvasRestoreAbi = argumentPointer => +runtime.host("a", "a", 136329, 31967, argumentPointer);
  const canvasSetGlobalAlphaAbi = argumentPointer => +runtime.host("a", "a", 137728, 93028, argumentPointer);
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
  const readI8 = (p, offset = 0) => {
    const address = access(p, offset, 1);
    return view.getInt8(address);
  };
  // Keep vtable lookup before argument loads: a factory/host callback can mutate
  // the component or its cached instance. Runtime checks the exact WASM types.
  function constructCatalogPetal(type) {
    const entry = (type - 1 & 255) > 37 ? 0 : Math.imul(type, 52) + 382064 | 0;
    return runtime.indirect({
      parameters: [],
      results: [ "i32" ]
    }, readI32(entry, 48));
  }
  function destroyPetalRenderer(instance) {
    runtime.indirect({
      parameters: [ "i32" ],
      results: []
    }, readI32(readI32(instance), 4), instance);
  }
  function bindPetalRenderer(vtableOwner, instance, component) {
    runtime.indirect({
      parameters: [ "i32", "i32" ],
      results: []
    }, readI32(readI32(vtableOwner), 28), instance, readI32(component));
  }
  function renderPetalInstance(vtableOwner, instance, renderer, parameters) {
    runtime.indirect({
      parameters: [ "i32", "i32", "i32" ],
      results: []
    }, readI32(readI32(vtableOwner), 32), instance, renderer, parameters);
  }
  // camera = client state + 2144. Its owner index is at +76/+80; the
  // local-player handle is reached through state +256/+264.
  function drawEntity(camera, renderer, entity, elapsedMilliseconds) {
    camera |= 0;
    renderer |= 0;
    entity |= 0;
    elapsedMilliseconds = f32(elapsedMilliseconds);
    let scratch = 0, transform = 0, localEntityHandle = 0, visual = 0;
    scratch = runtime.stackPointer.value - 928 | 0;
    runtime.stackPointer.value = scratch;
    let controlledHandleValue;
    if (readI32(camera - 1888 | 0)) {
      controlledHandleValue = readI32(readI32(camera - 1880 | 0));
    } else {
      controlledHandleValue = 0;
    }
    localEntityHandle = controlledHandleValue;
    drawEntityDone: {
      if (isOutsideViewport(camera, entity)) break drawEntityDone;
      visual = beginEntityDraw(scratch, renderer, entity);
      transform = applyEntityLocalTransform(scratch, visual, renderer, entity);
      applyVisualFade(scratch, visual, renderer);
      drawOwnedChildren(camera, renderer, entity, elapsedMilliseconds);
      trackNearbyEntityDiscovery(scratch, transform, localEntityHandle, entity);
      drawRenderComponent(scratch, renderer, entity, elapsedMilliseconds);
      restoreEntityDrawingState(scratch, visual, renderer);
    }
    runtime.stackPointer.value = scratch + 928 | 0;
  }
  /** Draw the triangle component and its hit-flash colors. Original WAT 128970–129733. */
  function drawTriangleComponent(scratch, componentOrCanvasHandle, renderer) {
    let flashColorOrGreen = 0, fillBlue = 0, fillRedOrCanvasHandle = 0, fillGreen = 0, canvasHandle = 0, flashFraction = 0, matrixBOrChannelBase = 0, flashOrMatrixA = 0, matrixTx = 0, matrixC = 0, matrixB = 0, scaledMatrixD = 0, matrixTxSaved = 0, scaledMatrixB = 0, matrixTy = 0, visualOrBlue = 0, channelOrMatrixD = 0;
    visualOrBlue = readI32(readI32(componentOrCanvasHandle), 136);
    writeU8(renderer, 1, 48);
    const savedRenderer = renderer;
    matrixTy = readF32(renderer, 20);
    const savedMatrixTy = matrixTy;
    matrixB = readF32(renderer, 4);
    scaledMatrixB = f32(matrixB * 0);
    const savedScaledMatrixB = scaledMatrixB;
    matrixBOrChannelBase = readF32(renderer, 12);
    scaledMatrixD = f32(matrixBOrChannelBase * 0);
    writeF32(savedRenderer, f32(savedMatrixTy + f32(savedScaledMatrixB + scaledMatrixD)), 20);
    const savedRenderer2 = renderer;
    matrixTxSaved = readF32(renderer, 16);
    const savedMatrixTxSaved = matrixTxSaved;
    matrixC = readF32(renderer);
    matrixTx = f32(matrixC * 0);
    const savedMatrixTx = matrixTx;
    channelOrMatrixD = readF32(renderer, 8);
    flashOrMatrixA = f32(channelOrMatrixD * 0);
    writeF32(savedRenderer2, f32(savedMatrixTxSaved + f32(savedMatrixTx + flashOrMatrixA)), 16);
    const savedRenderer3 = renderer;
    const resultOfF32 = f32(scaledMatrixB + f32(matrixBOrChannelBase * 1.2999999523162842));
    matrixBOrChannelBase = f32(matrixTy * 0);
    writeF32(savedRenderer3, f32(resultOfF32 + matrixBOrChannelBase), 12);
    const savedRenderer4 = renderer;
    const resultOfF322 = f32(matrixTx + f32(channelOrMatrixD * 1.2999999523162842));
    channelOrMatrixD = f32(matrixTxSaved * 0);
    writeF32(savedRenderer4, f32(resultOfF322 + channelOrMatrixD), 8);
    writeF32(renderer, f32(f32(f32(matrixB * 1.2999999523162842) + scaledMatrixD) + matrixBOrChannelBase), 4);
    writeF32(renderer, f32(f32(f32(matrixC * 1.2999999523162842) + flashOrMatrixA) + channelOrMatrixD));
    componentOrCanvasHandle = readI32(renderer, 96);
    writeI64(scratch, 4617315517961601024n, 696);
    writeI32(scratch, componentOrCanvasHandle, 688);
    const savedBits = canvasSetLineWidthAbi(scratch + 688 | 0) | 0;
    void savedBits;
    if (readU8(renderer, 50)) {
      writeU8(renderer, 0, 50);
      writeI32(scratch, readI32(renderer, 96), 672);
      const savedBits2 = canvasSetLineJoinRoundAbi(scratch + 672 | 0) | 0;
      void savedBits2;
    }
    if (+(readU8(renderer, 49) !== 1)) {
      writeU8(renderer, 1, 49);
      writeI32(scratch, readI32(renderer, 96), 656);
      const savedBits3 = canvasSetLineCapRoundAbi(scratch + 656 | 0) | 0;
      void savedBits3;
    }
    flashColorOrGreen = 16711680;
    drawTriangleComponentDone: {
      if (+(readU8(visualOrBlue, 56) === 0)) {
        flashOrMatrixA = 0;
        break drawTriangleComponentDone;
      }
      readClock(scratch + 848 | 0);
      let triangleFlashRatio;
      drawTriangleComponentDone2: {
        componentOrCanvasHandle = readU8(visualOrBlue, 56);
        if (+(componentOrCanvasHandle === 0)) {
          triangleFlashRatio = Infinity;
          break drawTriangleComponentDone2;
        }
        if (+(readU8(scratch, 848) === 0)) {
          triangleFlashRatio = -Infinity;
          break drawTriangleComponentDone2;
        }
        triangleFlashRatio = (readF64(visualOrBlue - -64 | 0) - readF64(scratch, 856)) * .006666666666666667 + 1;
      }
      flashFraction = triangleFlashRatio;
      flashOrMatrixA = f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0)));
      if (+(componentOrCanvasHandle === 0)) {
        break drawTriangleComponentDone;
      }
      readClock(scratch + 848 | 0);
      let triangleColorRatio;
      drawTriangleComponentDone3: {
        if (+(readU8(visualOrBlue, 56) === 0)) {
          triangleColorRatio = Infinity;
          break drawTriangleComponentDone3;
        }
        if (+(readU8(scratch, 848) === 0)) {
          triangleColorRatio = -Infinity;
          break drawTriangleComponentDone3;
        }
        triangleColorRatio = (readF64(visualOrBlue - -64 | 0) - readF64(scratch, 856)) * .006666666666666667 + 1;
      }
      flashFraction = triangleColorRatio;
      flashColorOrGreen = selectValue(16777215, 16711680, +(f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0))) >= .9));
    }
    let triangleRed;
    drawTriangleComponentDone4: {
      const resultOfF323 = f32(flashOrMatrixA * 255);
      matrixBOrChannelBase = f32(51 - f32(flashOrMatrixA * 51));
      channelOrMatrixD = f32(resultOfF323 + matrixBOrChannelBase);
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger = truncateInteger(channelOrMatrixD, true);
        triangleRed = resultOfTruncateInteger;
        break drawTriangleComponentDone4;
      }
      triangleRed = 0;
    }
    componentOrCanvasHandle = triangleRed;
    let triangleBlue;
    drawTriangleComponentDone5: {
      channelOrMatrixD = f32(matrixBOrChannelBase + f32(flashOrMatrixA * f32((flashColorOrGreen & 255) >>> 0)));
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger2 = truncateInteger(channelOrMatrixD, true);
        triangleBlue = resultOfTruncateInteger2;
        break drawTriangleComponentDone5;
      }
      triangleBlue = 0;
    }
    visualOrBlue = triangleBlue;
    fillBlue = visualOrBlue;
    let triangleGreen;
    drawTriangleComponentDone6: {
      channelOrMatrixD = f32(matrixBOrChannelBase + f32(flashOrMatrixA * f32(((flashColorOrGreen >>> 8 | 0) & 255) >>> 0)));
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger3 = truncateInteger(channelOrMatrixD, true);
        triangleGreen = resultOfTruncateInteger3;
        break drawTriangleComponentDone6;
      }
      triangleGreen = 0;
    }
    flashColorOrGreen = triangleGreen;
    fillGreen = flashColorOrGreen;
    fillRedOrCanvasHandle = componentOrCanvasHandle;
    if (readU8(renderer, 69)) {
      let triangleFillLuminance;
      drawTriangleComponentDone7: {
        flashFraction = (visualOrBlue >>> 0) * .0722 + ((componentOrCanvasHandle >>> 0) * .2126 + (flashColorOrGreen >>> 0) * .7152);
        if (+(flashFraction < 4294967296) & +(flashFraction >= 0)) {
          const resultOfTruncateInteger4 = truncateInteger(flashFraction, true);
          triangleFillLuminance = resultOfTruncateInteger4;
          break drawTriangleComponentDone7;
        }
        triangleFillLuminance = 0;
      }
      fillBlue = triangleFillLuminance;
      fillGreen = fillBlue;
      fillRedOrCanvasHandle = fillGreen;
    }
    canvasHandle = readI32(renderer, 96);
    writeI32(scratch, fillBlue, 652);
    writeI32(scratch, fillGreen, 648);
    writeI32(scratch, fillRedOrCanvasHandle, 644);
    writeI32(scratch, canvasHandle, 640);
    const savedBits4 = canvasSetFillRgbAbi(scratch + 640 | 0) | 0;
    void savedBits4;
    if (readU8(renderer, 69)) {
      let triangleStrokeLuminance;
      drawTriangleComponentDone8: {
        flashFraction = (visualOrBlue >>> 0) * .0722 + ((componentOrCanvasHandle >>> 0) * .2126 + (flashColorOrGreen >>> 0) * .7152);
        if (+(flashFraction < 4294967296) & +(flashFraction >= 0)) {
          const resultOfTruncateInteger5 = truncateInteger(flashFraction, true);
          triangleStrokeLuminance = resultOfTruncateInteger5;
          break drawTriangleComponentDone8;
        }
        triangleStrokeLuminance = 0;
      }
      visualOrBlue = triangleStrokeLuminance;
      flashColorOrGreen = visualOrBlue;
      componentOrCanvasHandle = flashColorOrGreen;
    }
    fillRedOrCanvasHandle = readI32(renderer, 96);
    writeI32(scratch, visualOrBlue, 636);
    writeI32(scratch, flashColorOrGreen, 632);
    writeI32(scratch, componentOrCanvasHandle, 628);
    writeI32(scratch, fillRedOrCanvasHandle, 624);
    const savedBits5 = canvasSetStrokeRgbAbi(scratch + 624 | 0) | 0;
    void savedBits5;
    writeI32(scratch, readI32(renderer, 96), 608);
    const savedBits6 = canvasBeginPathAbi(scratch + 608 | 0) | 0;
    void savedBits6;
    drawTriangleComponentDone9: {
      if (+(readU8(renderer, 48) === 0)) {
        break drawTriangleComponentDone9;
      }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory = compareMemory(renderer + 24 | 0, renderer, 24);
      if (+(resultOfCompareMemory === 0)) {
        break drawTriangleComponentDone9;
      }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 16);
      flashOrMatrixA = readF32(renderer);
      componentOrCanvasHandle = readI32(renderer, 96);
      matrixBOrChannelBase = readF32(renderer, 4);
      channelOrMatrixD = readF32(renderer, 12);
      writeF64(scratch, readF32(renderer, 20), 592);
      writeF64(scratch, matrixTx, 584);
      writeF64(scratch, channelOrMatrixD, 576);
      writeF64(scratch, matrixC, 568);
      writeF64(scratch, matrixBOrChannelBase, 560);
      writeI32(scratch, componentOrCanvasHandle, 544);
      writeF64(scratch, flashOrMatrixA, 552);
      const savedBits7 = canvasSetTransformAbi(scratch + 544 | 0) | 0;
      void savedBits7;
    }
    componentOrCanvasHandle = readI32(renderer, 96);
    writeI64(scratch, 0n, 528);
    writeI64(scratch, 4622382067542392832n, 520);
    writeI32(scratch, componentOrCanvasHandle, 512);
    const savedBits8 = canvasMoveToAbi(scratch + 512 | 0) | 0;
    void savedBits8;
    drawTriangleComponentDone10: {
      if (+(readU8(renderer, 48) === 0)) {
        break drawTriangleComponentDone10;
      }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory2 = compareMemory(renderer + 24 | 0, renderer, 24);
      if (+(resultOfCompareMemory2 === 0)) {
        break drawTriangleComponentDone10;
      }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 16);
      flashOrMatrixA = readF32(renderer);
      componentOrCanvasHandle = readI32(renderer, 96);
      matrixBOrChannelBase = readF32(renderer, 4);
      channelOrMatrixD = readF32(renderer, 12);
      writeF64(scratch, readF32(renderer, 20), 496);
      writeF64(scratch, matrixTx, 488);
      writeF64(scratch, channelOrMatrixD, 480);
      writeF64(scratch, matrixC, 472);
      writeF64(scratch, matrixBOrChannelBase, 464);
      writeI32(scratch, componentOrCanvasHandle, 448);
      writeF64(scratch, flashOrMatrixA, 456);
      const savedBits9 = canvasSetTransformAbi(scratch + 448 | 0) | 0;
      void savedBits9;
    }
    componentOrCanvasHandle = readI32(renderer, 96);
    writeI64(scratch, -4604930618986332160n, 432);
    writeI64(scratch, -4600989969312382976n, 424);
    writeI32(scratch, componentOrCanvasHandle, 416);
    const savedBits10 = canvasLineToAbi(scratch + 416 | 0) | 0;
    void savedBits10;
    drawTriangleComponentDone11: {
      if (+(readU8(renderer, 48) === 0)) {
        break drawTriangleComponentDone11;
      }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory3 = compareMemory(renderer + 24 | 0, renderer, 24);
      if (+(resultOfCompareMemory3 === 0)) {
        break drawTriangleComponentDone11;
      }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 16);
      flashOrMatrixA = readF32(renderer);
      componentOrCanvasHandle = readI32(renderer, 96);
      matrixBOrChannelBase = readF32(renderer, 4);
      channelOrMatrixD = readF32(renderer, 12);
      writeF64(scratch, readF32(renderer, 20), 400);
      writeF64(scratch, matrixTx, 392);
      writeF64(scratch, channelOrMatrixD, 384);
      writeF64(scratch, matrixC, 376);
      writeF64(scratch, matrixBOrChannelBase, 368);
      writeI32(scratch, componentOrCanvasHandle, 352);
      writeF64(scratch, flashOrMatrixA, 360);
      const savedBits11 = canvasSetTransformAbi(scratch + 352 | 0) | 0;
      void savedBits11;
    }
    componentOrCanvasHandle = readI32(renderer, 96);
    writeI64(scratch, 4618441417868443648n, 336);
    writeI64(scratch, -4600989969312382976n, 328);
    writeI32(scratch, componentOrCanvasHandle, 320);
    const savedBits12 = canvasLineToAbi(scratch + 320 | 0) | 0;
    void savedBits12;
    writeI32(scratch, readI32(renderer, 96), 304);
    const savedBits13 = canvasClosePathAbi(scratch + 304 | 0) | 0;
    void savedBits13;
    fillAndStrokeCurrentPath(renderer);
  }
  /** Draw the circle component with its fill and shaded outline. Original WAT 129740–130412. */
  function drawCircleComponent(scratch, circleComponent, renderer) {
    let visualOrRed = 0, flashColorOrGreen = 0, baseColorOrCanvasHandle = 0, channelOrRadius = 0, greenF64 = 0, redF64 = 0, blueF64 = 0, baseWeightOrMatrixB = 0, flashOrMatrixA = 0, matrixTx = 0, matrixC = 0, greenOrCanvasHandle = 0, blueOrBaseRed = 0, channelOrMatrixD = 0;
    baseColorOrCanvasHandle = selectValue(13530843, 9093717, readU8(circleComponent, 8) & 1);
    blueOrBaseRed = baseColorOrCanvasHandle >>> 16 | 0;
    flashColorOrGreen = 16711680;
    drawCircleComponentDone: {
      visualOrRed = readI32(readI32(circleComponent), 136);
      if (+(readU8(visualOrRed, 56) === 0)) {
        flashOrMatrixA = 0;
        break drawCircleComponentDone;
      }
      readClock(scratch + 848 | 0);
      let circleFlashRatio;
      drawCircleComponentDone2: {
        greenOrCanvasHandle = readU8(visualOrRed, 56);
        if (+(greenOrCanvasHandle === 0)) {
          circleFlashRatio = Infinity;
          break drawCircleComponentDone2;
        }
        if (+(readU8(scratch, 848) === 0)) {
          circleFlashRatio = -Infinity;
          break drawCircleComponentDone2;
        }
        circleFlashRatio = (readF64(visualOrRed - -64 | 0) - readF64(scratch, 856)) * .006666666666666667 + 1;
      }
      channelOrRadius = circleFlashRatio;
      flashOrMatrixA = f32(selectValue(0, Math.min(channelOrRadius, 1), +(channelOrRadius < 0)));
      if (+(greenOrCanvasHandle === 0)) {
        break drawCircleComponentDone;
      }
      readClock(scratch + 848 | 0);
      let circleColorRatio;
      drawCircleComponentDone3: {
        if (+(readU8(visualOrRed, 56) === 0)) {
          circleColorRatio = Infinity;
          break drawCircleComponentDone3;
        }
        if (+(readU8(scratch, 848) === 0)) {
          circleColorRatio = -Infinity;
          break drawCircleComponentDone3;
        }
        circleColorRatio = (readF64(visualOrRed - -64 | 0) - readF64(scratch, 856)) * .006666666666666667 + 1;
      }
      channelOrRadius = circleColorRatio;
      flashColorOrGreen = selectValue(16777215, 16711680, +(f32(selectValue(0, Math.min(channelOrRadius, 1), +(channelOrRadius < 0))) >= .9));
    }
    writeI32(scratch, readI32(renderer, 96), 288);
    const savedBits14 = canvasBeginPathAbi(scratch + 288 | 0) | 0;
    void savedBits14;
    let circleRed;
    drawCircleComponentDone4: {
      const resultOfF324 = f32(flashOrMatrixA * 255);
      baseWeightOrMatrixB = f32(1 - flashOrMatrixA);
      channelOrMatrixD = f32(resultOfF324 + f32(baseWeightOrMatrixB * f32(blueOrBaseRed >>> 0)));
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger6 = truncateInteger(channelOrMatrixD, true);
        circleRed = resultOfTruncateInteger6;
        break drawCircleComponentDone4;
      }
      circleRed = 0;
    }
    visualOrRed = circleRed;
    greenOrCanvasHandle = baseColorOrCanvasHandle >>> 8 | 0;
    let circleBlue;
    drawCircleComponentDone5: {
      channelOrMatrixD = f32(f32(baseWeightOrMatrixB * f32((baseColorOrCanvasHandle & 255) >>> 0)) + f32(flashOrMatrixA * f32((flashColorOrGreen & 255) >>> 0)));
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger7 = truncateInteger(channelOrMatrixD, true);
        circleBlue = resultOfTruncateInteger7;
        break drawCircleComponentDone5;
      }
      circleBlue = 0;
    }
    blueOrBaseRed = circleBlue;
    let circleGreen;
    drawCircleComponentDone6: {
      channelOrMatrixD = f32(f32(baseWeightOrMatrixB * f32((greenOrCanvasHandle & 255) >>> 0)) + f32(flashOrMatrixA * f32(((flashColorOrGreen >>> 8 | 0) & 255) >>> 0)));
      if (+(channelOrMatrixD < 4294967296) & +(channelOrMatrixD >= 0)) {
        const resultOfTruncateInteger8 = truncateInteger(channelOrMatrixD, true);
        circleGreen = resultOfTruncateInteger8;
        break drawCircleComponentDone6;
      }
      circleGreen = 0;
    }
    flashColorOrGreen = circleGreen;
    channelOrRadius = selectValue(10, 7, readU8(circleComponent, 8) & 2);
    drawCircleComponentDone7: {
      if (+(readU8(renderer, 48) === 0)) {
        break drawCircleComponentDone7;
      }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory4 = compareMemory(renderer + 24 | 0, renderer, 24);
      if (+(resultOfCompareMemory4 === 0)) {
        break drawCircleComponentDone7;
      }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 16);
      flashOrMatrixA = readF32(renderer);
      greenOrCanvasHandle = readI32(renderer, 96);
      baseWeightOrMatrixB = readF32(renderer, 4);
      channelOrMatrixD = readF32(renderer, 12);
      writeF64(scratch, readF32(renderer, 20), 272);
      writeF64(scratch, matrixTx, 264);
      writeF64(scratch, channelOrMatrixD, 256);
      writeF64(scratch, matrixC, 248);
      writeF64(scratch, baseWeightOrMatrixB, 240);
      writeI32(scratch, greenOrCanvasHandle, 224);
      writeF64(scratch, flashOrMatrixA, 232);
      const savedBits15 = canvasSetTransformAbi(scratch + 224 | 0) | 0;
      void savedBits15;
    }
    greenOrCanvasHandle = readI32(renderer, 96);
    writeI32(scratch, 0, 208);
    writeI64(scratch, 4618760256179416344n, 200);
    writeI64(scratch, 0n, 192);
    writeF64(scratch, channelOrRadius, 184);
    writeI64(scratch, 0n, 176);
    writeI64(scratch, 0n, 168);
    writeI32(scratch, greenOrCanvasHandle, 160);
    const savedBits16 = canvasArcAbi(scratch + 160 | 0) | 0;
    void savedBits16;
    redF64 = visualOrRed >>> 0;
    drawCircleComponentDone8: {
      if (+(readU8(renderer, 69) === 0)) {
        blueF64 = blueOrBaseRed >>> 0;
        greenF64 = flashColorOrGreen >>> 0;
        break drawCircleComponentDone8;
      }
      let circleFillLuminance;
      drawCircleComponentDone9: {
        blueF64 = blueOrBaseRed >>> 0;
        const savedProduct = blueF64 * .0722;
        const savedProduct2 = redF64 * .2126;
        greenF64 = flashColorOrGreen >>> 0;
        channelOrRadius = savedProduct + (savedProduct2 + greenF64 * .7152);
        if (+(channelOrRadius < 4294967296) & +(channelOrRadius >= 0)) {
          const resultOfTruncateInteger9 = truncateInteger(channelOrRadius, true);
          circleFillLuminance = resultOfTruncateInteger9;
          break drawCircleComponentDone9;
        }
        circleFillLuminance = 0;
      }
      blueOrBaseRed = circleFillLuminance;
      flashColorOrGreen = blueOrBaseRed;
      visualOrRed = flashColorOrGreen;
    }
    greenOrCanvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueOrBaseRed, 156);
    writeI32(scratch, flashColorOrGreen, 152);
    writeI32(scratch, visualOrRed, 148);
    writeI32(scratch, greenOrCanvasHandle, 144);
    const savedBits17 = canvasSetFillRgbAbi(scratch + 144 | 0) | 0;
    void savedBits17;
    writeI32(scratch, readI32(renderer, 96), 128);
    const savedBits18 = canvasFillAbi(scratch + 128 | 0) | 0;
    void savedBits18;
    let outlineBlue;
    drawCircleComponentDone10: {
      channelOrRadius = Math.sqrt(blueF64 * .00392156862745098) * .8999999985098839;
      const resultOfRoundF64 = roundF64(channelOrRadius * channelOrRadius * 255);
      channelOrRadius = resultOfRoundF64;
      if (+(channelOrRadius < 4294967296) & +(channelOrRadius >= 0)) {
        const resultOfTruncateInteger10 = truncateInteger(channelOrRadius, true);
        outlineBlue = resultOfTruncateInteger10;
        break drawCircleComponentDone10;
      }
      outlineBlue = 0;
    }
    blueOrBaseRed = outlineBlue;
    let outlineGreen;
    drawCircleComponentDone11: {
      channelOrRadius = Math.sqrt(greenF64 * .00392156862745098) * .8999999985098839;
      const resultOfRoundF642 = roundF64(channelOrRadius * channelOrRadius * 255);
      channelOrRadius = resultOfRoundF642;
      if (+(channelOrRadius < 4294967296) & +(channelOrRadius >= 0)) {
        const resultOfTruncateInteger11 = truncateInteger(channelOrRadius, true);
        outlineGreen = resultOfTruncateInteger11;
        break drawCircleComponentDone11;
      }
      outlineGreen = 0;
    }
    greenOrCanvasHandle = outlineGreen;
    let outlineRed;
    drawCircleComponentDone12: {
      channelOrRadius = Math.sqrt(redF64 * .00392156862745098) * .8999999985098839;
      const resultOfRoundF643 = roundF64(channelOrRadius * channelOrRadius * 255);
      channelOrRadius = resultOfRoundF643;
      if (+(channelOrRadius < 4294967296) & +(channelOrRadius >= 0)) {
        const resultOfTruncateInteger12 = truncateInteger(channelOrRadius, true);
        outlineRed = resultOfTruncateInteger12;
        break drawCircleComponentDone12;
      }
      outlineRed = 0;
    }
    visualOrRed = outlineRed;
    if (readU8(renderer, 69)) {
      let outlineLuminance;
      drawCircleComponentDone13: {
        channelOrRadius = (blueOrBaseRed >>> 0) * .0722 + ((visualOrRed >>> 0) * .2126 + (greenOrCanvasHandle >>> 0) * .7152);
        if (+(channelOrRadius < 4294967296) & +(channelOrRadius >= 0)) {
          const resultOfTruncateInteger13 = truncateInteger(channelOrRadius, true);
          outlineLuminance = resultOfTruncateInteger13;
          break drawCircleComponentDone13;
        }
        outlineLuminance = 0;
      }
      blueOrBaseRed = outlineLuminance;
      greenOrCanvasHandle = blueOrBaseRed;
      visualOrRed = greenOrCanvasHandle;
    }
    baseColorOrCanvasHandle = readI32(renderer, 96);
    writeI32(scratch, blueOrBaseRed, 124);
    writeI32(scratch, greenOrCanvasHandle, 120);
    writeI32(scratch, visualOrRed, 116);
    writeI32(scratch, baseColorOrCanvasHandle, 112);
    const savedBits19 = canvasSetStrokeRgbAbi(scratch + 112 | 0) | 0;
    void savedBits19;
    greenOrCanvasHandle = readI32(renderer, 96);
    writeI64(scratch, 4613937818241073152n, 104);
    writeI32(scratch, greenOrCanvasHandle, 96);
    const savedBits20 = canvasSetLineWidthAbi(scratch + 96 | 0) | 0;
    void savedBits20;
    drawCircleComponentDone14: {
      if (+(readU8(renderer, 48) === 0)) {
        break drawCircleComponentDone14;
      }
      writeU8(renderer, 0, 48);
      const resultOfCompareMemory5 = compareMemory(renderer + 24 | 0, renderer, 24);
      if (+(resultOfCompareMemory5 === 0)) {
        break drawCircleComponentDone14;
      }
      writeI64(renderer, readI64(renderer), 24);
      writeI64(renderer, readI64(renderer, 16), 40);
      writeI64(renderer, readI64(renderer, 8), 32);
      matrixC = readF32(renderer, 8);
      matrixTx = readF32(renderer, 16);
      flashOrMatrixA = readF32(renderer);
      greenOrCanvasHandle = readI32(renderer, 96);
      baseWeightOrMatrixB = readF32(renderer, 4);
      channelOrMatrixD = readF32(renderer, 12);
      writeF64(scratch, readF32(renderer, 20), 80);
      writeF64(scratch, matrixTx, 72);
      writeF64(scratch - -64 | 0, channelOrMatrixD);
      writeF64(scratch, matrixC, 56);
      writeF64(scratch, baseWeightOrMatrixB, 48);
      writeI32(scratch, greenOrCanvasHandle, 32);
      writeF64(scratch, flashOrMatrixA, 40);
      const savedBits21 = canvasSetTransformAbi(scratch + 32 | 0) | 0;
      void savedBits21;
    }
    writeI32(scratch, readI32(renderer, 96), 16);
    const savedBits22 = canvasStrokeAbi(scratch + 16 | 0) | 0;
    void savedBits22;
  }
  /** Build player appearance parameters and dispatch its renderer. Original WAT 130419–130607. */
  function drawPlayerComponent(scratch, playerComponent, renderer, elapsedMilliseconds) {
    let visual = 0, flashFraction = 0, flashAmount = 0, healthOrFlagsOrFlashColor = 0, inputOrTimestampValid = 0;
    healthOrFlagsOrFlashColor = readI32(playerComponent);
    visual = readI32(healthOrFlagsOrFlashColor, 136);
    inputOrTimestampValid = readI32(healthOrFlagsOrFlashColor, 144);
    healthOrFlagsOrFlashColor = readI32(healthOrFlagsOrFlashColor, 116);
    writeI32(scratch, 0, 864);
    writeI64(scratch, 0n, 856);
    writeI64(scratch, 0n, 848);
    writeU8(scratch, readU8(playerComponent, 10), 848);
    flashAmount = 0;
    writeU8(scratch, +(readF32(healthOrFlagsOrFlashColor, 8) <= 0), 849);
    const savedScratch = scratch;
    healthOrFlagsOrFlashColor = readU8(inputOrTimestampValid, 8);
    writeU8(savedScratch, healthOrFlagsOrFlashColor & 1, 850);
    writeU8(scratch, (healthOrFlagsOrFlashColor >>> 2 | 0) & 1, 852);
    writeU8(scratch, (healthOrFlagsOrFlashColor >>> 1 | 0) & 1, 851);
    drawPlayerComponentDone: {
      if (readU8(visual, 56)) {
        readClock(scratch + 912 | 0);
        let playerFlashRatio;
        drawPlayerComponentDone2: {
          inputOrTimestampValid = readU8(visual, 56);
          if (+(inputOrTimestampValid === 0)) {
            playerFlashRatio = Infinity;
            break drawPlayerComponentDone2;
          }
          if (+(readU8(scratch, 912) === 0)) {
            playerFlashRatio = -Infinity;
            break drawPlayerComponentDone2;
          }
          playerFlashRatio = (readF64(visual - -64 | 0) - readF64(scratch, 920)) * .006666666666666667 + 1;
        }
        flashFraction = playerFlashRatio;
        writeU8(scratch, 255, 853);
        const savedScratch2 = scratch;
        healthOrFlagsOrFlashColor = selectValue(16777215, 16711680, +(f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0))) >= .9));
        writeU8(savedScratch2, healthOrFlagsOrFlashColor, 855);
        writeU8(scratch, healthOrFlagsOrFlashColor >>> 8 | 0, 854);
        if (+(inputOrTimestampValid === 0)) {
          break drawPlayerComponentDone;
        }
        readClock(scratch + 912 | 0);
        let playerColorRatio;
        drawPlayerComponentDone3: {
          if (+(readU8(visual, 56) === 0)) {
            playerColorRatio = Infinity;
            break drawPlayerComponentDone3;
          }
          if (+(readU8(scratch, 912) === 0)) {
            playerColorRatio = -Infinity;
            break drawPlayerComponentDone3;
          }
          playerColorRatio = (readF64(visual - -64 | 0) - readF64(scratch, 920)) * .006666666666666667 + 1;
        }
        flashFraction = playerColorRatio;
        flashAmount = f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0)));
        break drawPlayerComponentDone;
      }
      writeU8(scratch, 0, 855);
      writeU16(scratch, 255, 853);
    }
    writeF32(scratch, flashAmount, 856);
    writeF32(scratch, f32((readU8(playerComponent, 8) >>> 0) * .024639942381096416), 860);
    writeI32(scratch, readU8(playerComponent, 9), 864);
    drawPlayerAppearance(renderer, elapsedMilliseconds, playerComponent + 760 | 0, scratch + 848 | 0);
  }
  /** Create, bind and draw the catalog petal through its original virtual table. Original WAT 130614–130861. */
  function drawPetalComponent(petalComponent, renderer, elapsedOrFlashAmount) {
    let petalRenderer = 0, transform = 0, visual = 0, petalScratch = 0, flashFraction = 0, entityOrTypeOrOldRenderer = 0, timestampValid = 0;
    petalScratch = runtime.stackPointer.value - 48 | 0;
    runtime.stackPointer.value = petalScratch;
    entityOrTypeOrOldRenderer = readI32(petalComponent);
    transform = readI32(entityOrTypeOrOldRenderer, 120);
    visual = readI32(entityOrTypeOrOldRenderer, 136);
    writeI32(petalScratch, 0, 15);
    writeI32(petalScratch, 0, 12);
    writeI64(petalScratch, 0n, 20);
    writeU8(petalScratch, 1, 19);
    writeF32(petalScratch, elapsedOrFlashAmount, 8);
    let petalFlashAmount;
    drawPetalComponentDone: {
      drawPetalComponentDone2: {
        if (readU8(visual, 56)) {
          readClock(petalScratch + 32 | 0);
          const savedPetalScratch = petalScratch;
          let petalColorRatio;
          drawPetalComponentDone3: {
            timestampValid = readU8(visual, 56);
            if (+(timestampValid === 0)) {
              petalColorRatio = Infinity;
              break drawPetalComponentDone3;
            }
            if (+(readU8(petalScratch, 32) === 0)) {
              petalColorRatio = -Infinity;
              break drawPetalComponentDone3;
            }
            petalColorRatio = (readF64(visual - -64 | 0) - readF64(petalScratch, 40)) * .006666666666666667 + 1;
          }
          flashFraction = petalColorRatio;
          entityOrTypeOrOldRenderer = selectValue(16777215, 16711680, +(f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0))) >= .9));
          writeU8(savedPetalScratch, entityOrTypeOrOldRenderer, 18);
          writeU8(petalScratch, entityOrTypeOrOldRenderer >>> 8 | 0, 17);
          writeU8(petalScratch, 255, 16);
          if (+(timestampValid === 0)) {
            break drawPetalComponentDone2;
          }
          readClock(petalScratch + 32 | 0);
          let petalFlashRatio;
          drawPetalComponentDone4: {
            if (+(readU8(visual, 56) === 0)) {
              petalFlashRatio = Infinity;
              break drawPetalComponentDone4;
            }
            if (+(readU8(petalScratch, 32) === 0)) {
              petalFlashRatio = -Infinity;
              break drawPetalComponentDone4;
            }
            petalFlashRatio = (readF64(visual - -64 | 0) - readF64(petalScratch, 40)) * .006666666666666667 + 1;
          }
          flashFraction = petalFlashRatio;
          const resultOfF325 = f32(selectValue(0, Math.min(flashFraction, 1), +(flashFraction < 0)));
          petalFlashAmount = resultOfF325;
          break drawPetalComponentDone;
        }
        writeU8(petalScratch, 0, 18);
        writeU16(petalScratch, 255, 16);
      }
      petalFlashAmount = 0;
    }
    elapsedOrFlashAmount = petalFlashAmount;
    writeU8(petalScratch, 0, 19);
    writeF32(petalScratch, elapsedOrFlashAmount, 12);
    drawPetalComponentDone5: {
      if (readU8(transform, 144)) {
        writeF32(petalScratch, f32(readF64(transform, 152)), 20);
        break drawPetalComponentDone5;
      }
      updateWorldTransform(transform);
      entityOrTypeOrOldRenderer = readU8(transform, 144);
      writeF32(petalScratch, f32(readF64(transform, 152)), 20);
      if (entityOrTypeOrOldRenderer) {
        break drawPetalComponentDone5;
      }
      updateWorldTransform(transform);
    }
    writeF32(petalScratch, f32(readF64(transform, 160)), 24);
    let cachedPetalInstance;
    {
      petalRenderer = readI32(petalComponent, 20);
      if (+(petalRenderer === 0)) {
        entityOrTypeOrOldRenderer = readU8(petalComponent, 8);
        const resultOfIndirect = constructCatalogPetal(entityOrTypeOrOldRenderer);
        petalRenderer = resultOfIndirect;
        entityOrTypeOrOldRenderer = readI32(petalComponent, 20);
        writeI32(petalComponent, petalRenderer, 20);
        let boundPetalInstance;
        {
          if (entityOrTypeOrOldRenderer) {
            destroyPetalRenderer(entityOrTypeOrOldRenderer);
            petalRenderer = readI32(petalComponent, 20);
          }
          boundPetalInstance = petalRenderer;
        }
        bindPetalRenderer(petalRenderer, boundPetalInstance, petalComponent);
        petalRenderer = readI32(petalComponent, 20);
      }
      cachedPetalInstance = petalRenderer;
    }
    renderPetalInstance(petalRenderer, cachedPetalInstance, renderer, petalScratch + 8 | 0);
    runtime.stackPointer.value = petalScratch + 48 | 0;
  }
  /** Build and cache the spoked effect path, then draw its fading image. Original WAT 130868–131784. */
  function drawSpokedEffectComponent(effectComponent, renderer, elapsedOrAngleOrMatrixValue) {
    let effectScratch = 0, pathScratch = 0, amountF64 = 0, fadeAmount = 0, cosineOrMatrixB = 0, sineOrMatrixC = 0, sineOrMatrixProduct = 0, cosineSumOrMatrixValue = 0, cachedMatrixD = 0, pathRadiusOrMatrixProduct = 0, sineSumOrMatrixTx = 0, cachedMatrixA = 0, cachedMatrixTy = 0, effectScaleOrCachedMatrixB = 0, rasterScale = 0, radiusOrCanvasHandleOrSize = 0, pathHandleOrSegmentIndex = 0;
    effectScratch = runtime.stackPointer.value - 176 | 0;
    runtime.stackPointer.value = effectScratch;
    drawSpokedEffectComponentDone: {
      drawSpokedEffectComponentDone2: {
        radiusOrCanvasHandleOrSize = readI32(effectComponent);
        if (+(readU8(readI32(radiusOrCanvasHandleOrSize, 136), 16) === 0)) {
          break drawSpokedEffectComponentDone2;
        }
        if (readU8(radiusOrCanvasHandleOrSize, 44) & 1) {
          break drawSpokedEffectComponentDone2;
        }
        writeI32(effectComponent, 1065353216, 8);
        break drawSpokedEffectComponentDone;
      }
      const savedEffectComponent = effectComponent;
      fadeAmount = readF32(effectComponent, 8);
      let effectFade;
      if (+(Math.abs(fadeAmount + -1) < 1e-7)) {
        effectFade = 1;
      } else {
        const resultOfPowF64 = powF64(.7, elapsedOrAngleOrMatrixValue * .06);
        amountF64 = 1 - resultOfPowF64;
        effectFade = f32(selectValue(0, Math.min(amountF64, 1), +(amountF64 < 0)) * (1 - fadeAmount) + fadeAmount);
      }
      writeF32(savedEffectComponent, effectFade, 8);
    }
    drawSpokedEffectComponentDone3: {
      if (readU8(386804) & 1) {
        break drawSpokedEffectComponentDone3;
      }
      const resultOfAcquireGuard = acquireGuard(386804);
      if (+(resultOfAcquireGuard === 0)) {
        break drawSpokedEffectComponentDone3;
      }
      pathScratch = runtime.stackPointer.value - 192 | 0;
      runtime.stackPointer.value = pathScratch;
      writeI32(386800, -1);
      pathHandleOrSegmentIndex = -1;
      radiusOrCanvasHandleOrSize = 10;
      drawSpokedEffectComponentLoop: while (true) {
        pathRadiusOrMatrixProduct = f32(radiusOrCanvasHandleOrSize | 0);
        amountF64 = pathRadiusOrMatrixProduct;
        if (+(pathHandleOrSegmentIndex === -1)) {
          writeI32(pathScratch, 0, 176);
          const savedBits23 = pathCreateAbi(pathScratch + 176 | 0) | 0;
          pathHandleOrSegmentIndex = savedBits23;
          writeI32(386800, pathHandleOrSegmentIndex);
        }
        writeI64(pathScratch, 0n, 160);
        writeF64(pathScratch, amountF64, 152);
        writeI32(pathScratch, pathHandleOrSegmentIndex, 144);
        const savedBits24 = pathMoveToAbi(pathScratch + 144 | 0) | 0;
        void savedBits24;
        pathHandleOrSegmentIndex = 0;
        drawSpokedEffectComponentLoop2: while (true) {
          cosineOrMatrixB = f32((pathHandleOrSegmentIndex | 0) * .48332194670612205);
          const resultOfSinF32 = sinF32(cosineOrMatrixB);
          const resultOfF326 = f32(resultOfSinF32 * pathRadiusOrMatrixProduct);
          pathHandleOrSegmentIndex = pathHandleOrSegmentIndex + 1 | 0;
          elapsedOrAngleOrMatrixValue = f32((pathHandleOrSegmentIndex | 0) * .48332194670612205);
          const resultOfSinF322 = sinF32(elapsedOrAngleOrMatrixValue);
          sineOrMatrixProduct = f32(resultOfSinF322 * pathRadiusOrMatrixProduct);
          sineSumOrMatrixTx = f32(resultOfF326 + sineOrMatrixProduct);
          sineOrMatrixC = f32(sineSumOrMatrixTx * .5);
          const resultOfCosF32 = cosF32(cosineOrMatrixB);
          const resultOfF327 = f32(resultOfCosF32 * pathRadiusOrMatrixProduct);
          const resultOfCosF322 = cosF32(elapsedOrAngleOrMatrixValue);
          cosineOrMatrixB = f32(resultOfCosF322 * pathRadiusOrMatrixProduct);
          cosineSumOrMatrixValue = f32(resultOfF327 + cosineOrMatrixB);
          elapsedOrAngleOrMatrixValue = f32(cosineSumOrMatrixValue * .5);
          writeF64(pathScratch, cosineOrMatrixB, 120);
          writeF64(pathScratch, sineOrMatrixProduct, 128);
          const savedPathScratch = pathScratch;
          const savedSineOrMatrixC = sineOrMatrixC;
          let normalizedSine;
          drawSpokedEffectComponentDone4: {
            amountF64 = cosineSumOrMatrixValue;
            const savedProduct3 = amountF64 * amountF64;
            amountF64 = sineSumOrMatrixTx;
            sineOrMatrixC = f32(Math.sqrt(savedProduct3 + amountF64 * amountF64));
            if (+(sineOrMatrixC < 1.1920928955078125e-7)) {
              cosineOrMatrixB = 1;
              normalizedSine = 0;
              break drawSpokedEffectComponentDone4;
            }
            cosineOrMatrixB = f32(cosineSumOrMatrixValue / sineOrMatrixC);
            normalizedSine = f32(sineSumOrMatrixTx / sineOrMatrixC);
          }
          writeF64(savedPathScratch, f32(savedSineOrMatrixC - f32(normalizedSine * 5)), 112);
          writeI32(pathScratch, readI32(386800), 96);
          writeF64(pathScratch, f32(elapsedOrAngleOrMatrixValue - f32(cosineOrMatrixB * 5)), 104);
          const savedBits25 = pathQuadraticCurveToAbi(pathScratch + 96 | 0) | 0;
          void savedBits25;
          if (+(pathHandleOrSegmentIndex !== 13)) {
            continue drawSpokedEffectComponentLoop2;
          }
          break;
        }
        pathHandleOrSegmentIndex = 0;
        writeI32(pathScratch, readI32(386800), 80);
        const savedBits26 = pathCloseAbi(pathScratch + 80 | 0) | 0;
        void savedBits26;
        if (+(radiusOrCanvasHandleOrSize >>> 0 > 40)) {
          drawSpokedEffectComponentLoop3: while (true) {
            radiusOrCanvasHandleOrSize = readI32(386800);
            if (+(radiusOrCanvasHandleOrSize === -1)) {
              writeI32(pathScratch, 0, 64);
              const savedBits27 = pathCreateAbi(pathScratch - -64 | 0) | 0;
              radiusOrCanvasHandleOrSize = savedBits27;
              writeI32(386800, radiusOrCanvasHandleOrSize);
            }
            writeI64(pathScratch, 0n, 48);
            writeI64(pathScratch, 0n, 40);
            writeI32(pathScratch, radiusOrCanvasHandleOrSize, 32);
            const savedBits28 = pathMoveToAbi(pathScratch + 32 | 0) | 0;
            void savedBits28;
            const savedPathScratch2 = pathScratch;
            elapsedOrAngleOrMatrixValue = f32((pathHandleOrSegmentIndex | 0) * .48332194670612205);
            const resultOfSinF323 = sinF32(elapsedOrAngleOrMatrixValue);
            writeF64(savedPathScratch2, f32(resultOfSinF323 * 55), 16);
            writeI32(pathScratch, readI32(386800));
            const savedPathScratch3 = pathScratch;
            const resultOfCosF323 = cosF32(elapsedOrAngleOrMatrixValue);
            writeF64(savedPathScratch3, f32(resultOfCosF323 * 55), 8);
            const savedBits29 = pathLineToAbi(pathScratch) | 0;
            void savedBits29;
            pathHandleOrSegmentIndex = pathHandleOrSegmentIndex + 1 | 0;
            if (+(pathHandleOrSegmentIndex !== 13)) {
              continue drawSpokedEffectComponentLoop3;
            }
            break;
          }
          runtime.stackPointer.value = pathScratch + 192 | 0;
        } else {
          radiusOrCanvasHandleOrSize = radiusOrCanvasHandleOrSize + 10 | 0;
          pathHandleOrSegmentIndex = readI32(386800);
          continue drawSpokedEffectComponentLoop;
        }
        break;
      }
      releaseGuard(386804);
    }
    drawSpokedEffectComponentDone5: {
      if (readU8(386920) & 1) {
        break drawSpokedEffectComponentDone5;
      }
      const resultOfAcquireGuard2 = acquireGuard(386920);
      if (+(resultOfAcquireGuard2 === 0)) {
        break drawSpokedEffectComponentDone5;
      }
      writeI64(386904, 0n);
      writeU16(386884, 1);
      writeI32(386880, -1082130432);
      writeI64(386872, 4607182418800017408n);
      writeU8(386866, 2);
      writeU16(386864, 1);
      writeI64(386856, 0n);
      writeI64(386848, 4575657221408423936n);
      writeI64(386840, 1065353216n);
      writeI64(386832, 0n);
      writeI64(386824, 4575657221408423936n);
      writeI64(386816, 1065353216n);
      writeI64(386888, 0n);
      writeI32(386912, -1);
      writeU8(386808, 0);
      writeU8(386896, 0);
      releaseGuard(386920);
    }
    let rasterSize;
    drawSpokedEffectComponentDone6: {
      sineOrMatrixC = readF32(renderer, 8);
      sineOrMatrixProduct = f32(Math.abs(sineOrMatrixC));
      const savedSineOrMatrixProduct = sineOrMatrixProduct;
      cosineOrMatrixB = readF32(renderer, 4);
      elapsedOrAngleOrMatrixValue = f32(Math.abs(cosineOrMatrixB));
      cosineSumOrMatrixValue = selectValue(savedSineOrMatrixProduct, elapsedOrAngleOrMatrixValue, +(elapsedOrAngleOrMatrixValue < sineOrMatrixProduct));
      const savedCosineSumOrMatrixValue = cosineSumOrMatrixValue;
      cachedMatrixD = readF32(renderer, 12);
      sineOrMatrixProduct = f32(Math.abs(cachedMatrixD));
      const savedSineOrMatrixProduct2 = sineOrMatrixProduct;
      cachedMatrixA = readF32(renderer);
      elapsedOrAngleOrMatrixValue = f32(Math.abs(cachedMatrixA));
      elapsedOrAngleOrMatrixValue = selectValue(savedSineOrMatrixProduct2, elapsedOrAngleOrMatrixValue, +(elapsedOrAngleOrMatrixValue < sineOrMatrixProduct));
      rasterScale = selectValue(savedCosineSumOrMatrixValue, elapsedOrAngleOrMatrixValue, +(elapsedOrAngleOrMatrixValue < cosineSumOrMatrixValue));
      elapsedOrAngleOrMatrixValue = f32(Math.ceil(f32(rasterScale * 120)));
      if (+(f32(Math.abs(elapsedOrAngleOrMatrixValue)) < 2147483648)) {
        const resultOfTruncateInteger14 = truncateInteger(elapsedOrAngleOrMatrixValue, false);
        rasterSize = resultOfTruncateInteger14;
        break drawSpokedEffectComponentDone6;
      }
      rasterSize = -2147483648;
    }
    radiusOrCanvasHandleOrSize = rasterSize;
    drawSpokedEffectComponentDone7: {
      if (readU8(386808)) {
        if (+(readI32(386812) === radiusOrCanvasHandleOrSize)) {
          break drawSpokedEffectComponentDone7;
        }
      }
      writeI32(386812, radiusOrCanvasHandleOrSize);
      writeU8(386808, 1);
      resizeCanvas(386816, radiusOrCanvasHandleOrSize, radiusOrCanvasHandleOrSize);
      clearCanvas(386816);
      writeI32(effectScratch, readI32(386912), 96);
      const savedBits30 = canvasSaveAbi(effectScratch + 96 | 0) | 0;
      void savedBits30;
      writeI64(effectScratch, readI64(386872), 168);
      writeI64(effectScratch, readI64(386864), 160);
      writeI64(effectScratch, readI64(386856), 152);
      writeI64(effectScratch, readI64(386848), 144);
      writeI64(effectScratch, readI64(386840), 136);
      writeI64(effectScratch, readI64(386832), 128);
      writeI64(effectScratch, readI64(386824), 120);
      writeI64(effectScratch, readI64(386816), 112);
      cachedMatrixA = readF32(386816);
      writeU8(386864, 1);
      cosineSumOrMatrixValue = readF32(386836);
      const savedCosineSumOrMatrixValue2 = cosineSumOrMatrixValue;
      sineOrMatrixProduct = readF32(386820);
      sineOrMatrixC = f32(sineOrMatrixProduct * 0);
      const savedSineOrMatrixC2 = sineOrMatrixC;
      cosineOrMatrixB = readF32(386828);
      elapsedOrAngleOrMatrixValue = f32(cosineOrMatrixB * 0);
      cachedMatrixTy = f32(savedCosineSumOrMatrixValue2 + f32(savedSineOrMatrixC2 + elapsedOrAngleOrMatrixValue));
      pathRadiusOrMatrixProduct = f32(cachedMatrixTy * 0);
      const savedPathRadiusOrMatrixProduct = pathRadiusOrMatrixProduct;
      const resultOfF328 = f32(f32(rasterScale * sineOrMatrixProduct) + elapsedOrAngleOrMatrixValue);
      elapsedOrAngleOrMatrixValue = f32(cosineSumOrMatrixValue * 0);
      effectScaleOrCachedMatrixB = f32(resultOfF328 + elapsedOrAngleOrMatrixValue);
      const savedEffectScaleOrCachedMatrixB = effectScaleOrCachedMatrixB;
      cachedMatrixD = f32(f32(sineOrMatrixC + f32(rasterScale * cosineOrMatrixB)) + elapsedOrAngleOrMatrixValue);
      writeF32(386820, f32(savedPathRadiusOrMatrixProduct + f32(savedEffectScaleOrCachedMatrixB + f32(cachedMatrixD * 0))));
      sineSumOrMatrixTx = readF32(386832);
      const savedSineSumOrMatrixTx = sineSumOrMatrixTx;
      cosineSumOrMatrixValue = f32(cachedMatrixA * 0);
      const savedCosineSumOrMatrixValue3 = cosineSumOrMatrixValue;
      elapsedOrAngleOrMatrixValue = readF32(386824);
      sineOrMatrixProduct = f32(elapsedOrAngleOrMatrixValue * 0);
      sineOrMatrixC = f32(savedSineSumOrMatrixTx + f32(savedCosineSumOrMatrixValue3 + sineOrMatrixProduct));
      cosineOrMatrixB = f32(sineOrMatrixC * 0);
      const savedCosineOrMatrixB = cosineOrMatrixB;
      const resultOfF329 = f32(cosineSumOrMatrixValue + f32(rasterScale * elapsedOrAngleOrMatrixValue));
      elapsedOrAngleOrMatrixValue = f32(sineSumOrMatrixTx * 0);
      cosineSumOrMatrixValue = f32(resultOfF329 + elapsedOrAngleOrMatrixValue);
      const savedCosineSumOrMatrixValue4 = cosineSumOrMatrixValue;
      elapsedOrAngleOrMatrixValue = f32(f32(f32(rasterScale * cachedMatrixA) + sineOrMatrixProduct) + elapsedOrAngleOrMatrixValue);
      writeF32(386824, f32(savedCosineOrMatrixB + f32(savedCosineSumOrMatrixValue4 + f32(elapsedOrAngleOrMatrixValue * 0))));
      writeF32(386828, f32(pathRadiusOrMatrixProduct + f32(cachedMatrixD + f32(effectScaleOrCachedMatrixB * 0))));
      writeF32(386832, f32(sineOrMatrixC + f32(f32(elapsedOrAngleOrMatrixValue + cosineSumOrMatrixValue) * 60)));
      writeF32(386836, f32(cachedMatrixTy + f32(f32(effectScaleOrCachedMatrixB + cachedMatrixD) * 60)));
      writeF32(386816, f32(cosineOrMatrixB + f32(elapsedOrAngleOrMatrixValue + f32(cosineSumOrMatrixValue * 0))));
      writeI64(effectScratch, 4613937818241073152n, 88);
      writeI32(effectScratch, readI32(386912), 80);
      const savedBits31 = canvasSetLineWidthAbi(effectScratch + 80 | 0) | 0;
      void savedBits31;
      if (readU8(386866)) {
        writeU8(386866, 0);
        writeI32(effectScratch, readI32(386912), 64);
        const savedBits32 = canvasSetLineJoinRoundAbi(effectScratch - -64 | 0) | 0;
        void savedBits32;
      }
      if (+(readU8(386865) !== 1)) {
        writeU8(386865, 1);
        writeI32(effectScratch, readI32(386912), 48);
        const savedBits33 = canvasSetLineCapRoundAbi(effectScratch + 48 | 0) | 0;
        void savedBits33;
      }
      writeI32(effectScratch, readI32(386912), 32);
      const savedEffectScratch = effectScratch;
      radiusOrCanvasHandleOrSize = selectValue(254, 255, readU8(386885));
      writeI32(savedEffectScratch, radiusOrCanvasHandleOrSize, 36);
      writeI32(effectScratch, radiusOrCanvasHandleOrSize, 40);
      writeI32(effectScratch, radiusOrCanvasHandleOrSize, 44);
      const savedBits34 = canvasSetStrokeRgbAbi(effectScratch + 32 | 0) | 0;
      void savedBits34;
      strokeStoredPath(386816, 386800);
      writeI64(386872, readI64(effectScratch, 168));
      writeI64(386864, readI64(effectScratch, 160));
      writeI64(386856, readI64(effectScratch, 152));
      writeI64(386848, readI64(effectScratch, 144));
      writeI64(386840, readI64(effectScratch, 136));
      writeI64(386832, readI64(effectScratch, 128));
      writeI64(386824, readI64(effectScratch, 120));
      writeI64(386816, readI64(effectScratch, 112));
      writeI32(effectScratch, readI32(386912), 16);
      const savedBits35 = canvasRestoreAbi(effectScratch + 16 | 0) | 0;
      void savedBits35;
      cachedMatrixD = readF32(renderer, 12);
      cosineOrMatrixB = readF32(renderer, 4);
      sineOrMatrixC = readF32(renderer, 8);
      cachedMatrixA = readF32(renderer);
    }
    effectScaleOrCachedMatrixB = readF32(effectComponent, 8);
    writeU8(renderer, 1, 48);
    const savedRenderer5 = renderer;
    cachedMatrixTy = readF32(renderer, 20);
    const savedCachedMatrixTy = cachedMatrixTy;
    sineOrMatrixProduct = f32(cosineOrMatrixB * 0);
    const savedSineOrMatrixProduct3 = sineOrMatrixProduct;
    pathRadiusOrMatrixProduct = f32(cachedMatrixD * 0);
    writeF32(savedRenderer5, f32(savedCachedMatrixTy + f32(savedSineOrMatrixProduct3 + pathRadiusOrMatrixProduct)), 20);
    const savedRenderer6 = renderer;
    sineSumOrMatrixTx = readF32(renderer, 16);
    const savedSineSumOrMatrixTx2 = sineSumOrMatrixTx;
    elapsedOrAngleOrMatrixValue = f32(cachedMatrixA * 0);
    const savedElapsedOrAngleOrMatrixValue = elapsedOrAngleOrMatrixValue;
    cosineSumOrMatrixValue = f32(sineOrMatrixC * 0);
    writeF32(savedRenderer6, f32(savedSineSumOrMatrixTx2 + f32(savedElapsedOrAngleOrMatrixValue + cosineSumOrMatrixValue)), 16);
    const savedRenderer7 = renderer;
    const resultOfF3210 = f32(sineOrMatrixProduct + f32(effectScaleOrCachedMatrixB * cachedMatrixD));
    sineOrMatrixProduct = f32(cachedMatrixTy * 0);
    writeF32(savedRenderer7, f32(resultOfF3210 + sineOrMatrixProduct), 12);
    const savedRenderer8 = renderer;
    const resultOfF3211 = f32(elapsedOrAngleOrMatrixValue + f32(effectScaleOrCachedMatrixB * sineOrMatrixC));
    elapsedOrAngleOrMatrixValue = f32(sineSumOrMatrixTx * 0);
    writeF32(savedRenderer8, f32(resultOfF3211 + elapsedOrAngleOrMatrixValue), 8);
    writeF32(renderer, f32(f32(f32(effectScaleOrCachedMatrixB * cosineOrMatrixB) + pathRadiusOrMatrixProduct) + sineOrMatrixProduct), 4);
    writeF32(renderer, f32(f32(f32(effectScaleOrCachedMatrixB * cachedMatrixA) + cosineSumOrMatrixValue) + elapsedOrAngleOrMatrixValue));
    const savedRenderer9 = renderer;
    amountF64 = readF64(renderer, 56) * (readF32(effectComponent, 8) * .5);
    amountF64 = selectValue(0, Math.min(amountF64, 1), +(amountF64 < 0));
    writeF64(savedRenderer9, amountF64, 56);
    radiusOrCanvasHandleOrSize = readI32(renderer, 96);
    writeF64(effectScratch, amountF64, 8);
    writeI32(effectScratch, radiusOrCanvasHandleOrSize);
    const savedBits36 = canvasSetGlobalAlphaAbi(effectScratch) | 0;
    void savedBits36;
    const savedRenderer10 = renderer;
    amountF64 = readI32(386812) | 0;
    drawCachedImageRegion(savedRenderer10, 386816, amountF64, amountF64, -60, -60, 120, 120);
    runtime.stackPointer.value = effectScratch + 176 | 0;
  }
  /** Dispatch the first present render component in original priority order. Original WAT 128965–131908. */
  function drawRenderComponent(scratch, renderer, entity, elapsedMilliseconds) {
    let playerComponent = 0, effectComponent = 0, componentPointer = 0, component = 0;
    drawRenderComponentDone: {
      component = readI32(entity, 108);
      if (component) {
        drawTriangleComponent(scratch, component, renderer);
        break drawRenderComponentDone;
      }
      componentPointer = readI32(entity, 68);
      if (componentPointer) {
        drawCircleComponent(scratch, componentPointer, renderer);
        break drawRenderComponentDone;
      }
      playerComponent = readI32(entity, 152);
      if (playerComponent) {
        drawPlayerComponent(scratch, playerComponent, renderer, elapsedMilliseconds);
        break drawRenderComponentDone;
      }
      componentPointer = readI32(entity, 76);
      if (componentPointer) {
        drawPetalComponent(componentPointer, renderer, elapsedMilliseconds);
        break drawRenderComponentDone;
      }
      effectComponent = readI32(entity, 92);
      if (effectComponent) {
        drawSpokedEffectComponent(effectComponent, renderer, elapsedMilliseconds);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 84);
      if (component) {
        drawComponent84(component, renderer, elapsedMilliseconds, -1);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 88);
      if (component) {
        drawComponent88(component, renderer);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 148);
      if (component) {
        drawComponent148(component, renderer);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 104);
      if (component) {
        drawComponent104(component, renderer, elapsedMilliseconds);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 128);
      if (component) {
        drawComponent128(component, renderer);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 124);
      if (component) {
        writeU16(scratch, 0, 752);
        writeU16(scratch, 0, 744);
        writeU16(scratch, 0, 14);
        writeU16(scratch, 0, 12);
        drawComponent124(component, renderer, scratch + 14 | 0, scratch + 12 | 0);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 132);
      if (component) {
        drawComponent132(component, renderer);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 96);
      if (component) {
        drawComponent96(component, renderer, -1);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 60);
      if (component) {
        drawComponent60(component, renderer);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 64);
      if (component) {
        drawComponent64(component, renderer, elapsedMilliseconds);
        break drawRenderComponentDone;
      }
      component = readI32(entity, 80);
      if (+(component === 0)) {
        break drawRenderComponentDone;
      }
      drawComponent80(component, renderer);
    }
  }
  /** Update visual bounds and test the expanded viewport. Original WAT 127938–127989. */
  function isOutsideViewport(camera, entity) {
    let bounds = 0, boundsOrigin = 0, viewportLower = 0;
    bounds = readI32(entity, 140);
    if (bounds) {
      const resultOfUpdateVisualBounds = updateVisualBounds(bounds);
      bounds = resultOfUpdateVisualBounds;
      viewportLower = f32(readF32(camera, 28) + -100);
      const savedViewportLower = viewportLower;
      boundsOrigin = readF32(bounds);
      if (+(savedViewportLower > f32(boundsOrigin + readF32(bounds, 8)))) {
        return true;
      }
      if (+(f32(viewportLower + f32(readF32(camera, 36) + 200)) < boundsOrigin)) {
        return true;
      }
      viewportLower = f32(readF32(camera, 32) + -100);
      const savedViewportLower2 = viewportLower;
      boundsOrigin = readF32(bounds, 4);
      if (+(savedViewportLower2 > f32(boundsOrigin + readF32(bounds, 12)))) {
        return true;
      }
      if (+(f32(viewportLower + f32(readF32(camera, 40) + 200)) < boundsOrigin)) {
        return true;
      }
    }
    return false;
  }
  /** Save the drawing state, read the frame clock and retain the visual update timestamp. Original WAT 127990–128050. */
  function beginEntityDraw(scratch, renderer, entity) {
    let visual = 0;
    writeI32(scratch, readI32(renderer, 96), 736);
    const savedBits37 = canvasSaveAbi(scratch + 736 | 0) | 0;
    void savedBits37;
    writeI64(scratch, readI64(renderer, 56), 840);
    writeI64(scratch, readI64(renderer, 48), 832);
    writeI64(scratch, readI64(renderer, 40), 824);
    writeI64(scratch, readI64(renderer, 32), 816);
    writeI64(scratch, readI64(renderer, 24), 808);
    writeI64(scratch, readI64(renderer, 16), 800);
    writeI64(scratch, readI64(renderer, 8), 792);
    writeI64(scratch, readI64(renderer), 784);
    readClock(scratch + 760 | 0);
    visual = readI32(entity, 136);
    if (readU8(visual, 16)) {
      writeI64(visual, readI64(scratch, 760), 24);
      writeI64(visual, readI64(scratch, 768), 32);
    }
    return visual;
  }
  /** Interpolate local position, constrain the player and compose translation and rotation. Original WAT 128051–128450. */
  function applyEntityLocalTransform(scratch, visual, renderer, entity) {
    let transformOwner = 0, state = 0, controlledEntity = 0, transform = 0, angle = 0, matrixTxOrClampValue = 0, matrixTyOrClampLower = 0, matrixCOrClampUpper = 0, matrixAOrCameraOffset = 0, localYOrCosine = 0, matrixC = 0, matrixB = 0, localX = 0, matrixAOrSine = 0;
    let interpolatedX;
    applyEntityLocalTransformDone: {
      transform = readI32(entity, 120);
      if (+(readU8(transform, 72) === 0)) {
        const storedF32 = readF32(transform, 64);
        interpolatedX = storedF32;
        break applyEntityLocalTransformDone;
      }
      readClock(scratch + 848 | 0);
      let xInterpolationFraction;
      applyEntityLocalTransformDone2: {
        if (+(readU8(scratch, 848) === 0)) {
          xInterpolationFraction = Infinity;
          break applyEntityLocalTransformDone2;
        }
        if (+(readU8(transform, 72) === 0)) {
          xInterpolationFraction = -Infinity;
          break applyEntityLocalTransformDone2;
        }
        xInterpolationFraction = (readF64(scratch, 856) - readF64(transform, 80)) * .008333333333333333;
      }
      const resultOfMin = Math.min(Math.max(xInterpolationFraction, 0), 1);
      const storedF322 = readF32(transform, 64);
      matrixTxOrClampValue = readF32(transform, 68);
      interpolatedX = f32(resultOfMin * f32(storedF322 - matrixTxOrClampValue) + matrixTxOrClampValue);
    }
    localX = interpolatedX;
    transformOwner = readI32(transform);
    const savedTransformOwner = transformOwner;
    state = readI32(transformOwner);
    controlledEntity = readI32(readI32(readI32(state, 264)), 144);
    if (+(savedTransformOwner === controlledEntity)) {
      matrixCOrClampUpper = f32(readF32(state, 900) * .5);
      const savedMatrixCOrClampUpper = matrixCOrClampUpper;
      matrixTxOrClampValue = readF32(readI32(transformOwner, 140), 8);
      matrixTyOrClampLower = f32(savedMatrixCOrClampUpper - matrixTxOrClampValue);
      matrixTxOrClampValue = f32(matrixTxOrClampValue - matrixCOrClampUpper);
      matrixAOrCameraOffset = readF32(state + 2048 | 0);
      applyEntityLocalTransformLoop: while (true) {
        matrixCOrClampUpper = matrixTyOrClampLower;
        matrixTyOrClampLower = matrixTxOrClampValue;
        const savedMatrixTyOrClampLower = matrixTyOrClampLower;
        matrixTxOrClampValue = matrixCOrClampUpper;
        if (+(savedMatrixTyOrClampLower > matrixTxOrClampValue)) {
          continue applyEntityLocalTransformLoop;
        }
        break;
      }
      const savedMatrixTyOrClampLower2 = matrixTyOrClampLower;
      const savedMatrixTxOrClampValue = matrixTxOrClampValue;
      matrixCOrClampUpper = f32(localX + matrixAOrCameraOffset);
      localX = selectValue(savedMatrixTyOrClampLower2, selectValue(savedMatrixTxOrClampValue, matrixCOrClampUpper, +(matrixTxOrClampValue < matrixCOrClampUpper)), +(matrixTyOrClampLower > matrixCOrClampUpper));
    }
    let interpolatedY;
    applyEntityLocalTransformDone3: {
      if (+(readU8(transform, 48) === 0)) {
        const storedF323 = readF32(transform, 40);
        interpolatedY = storedF323;
        break applyEntityLocalTransformDone3;
      }
      readClock(scratch + 848 | 0);
      transformOwner = readI32(transform);
      state = readI32(transformOwner);
      controlledEntity = readI32(readI32(readI32(state, 264)), 144);
      let yInterpolationFraction;
      applyEntityLocalTransformDone4: {
        if (+(readU8(scratch, 848) === 0)) {
          yInterpolationFraction = Infinity;
          break applyEntityLocalTransformDone4;
        }
        if (+(readU8(transform, 48) === 0)) {
          yInterpolationFraction = -Infinity;
          break applyEntityLocalTransformDone4;
        }
        yInterpolationFraction = (readF64(scratch, 856) - readF64(transform, 56)) * .008333333333333333;
      }
      const resultOfMin2 = Math.min(Math.max(yInterpolationFraction, 0), 1);
      const storedF324 = readF32(transform, 40);
      matrixTxOrClampValue = readF32(transform, 44);
      interpolatedY = f32(resultOfMin2 * f32(storedF324 - matrixTxOrClampValue) + matrixTxOrClampValue);
    }
    localYOrCosine = interpolatedY;
    if (+(transformOwner === controlledEntity)) {
      matrixCOrClampUpper = f32(readF32(state, 988) * .5);
      const savedMatrixCOrClampUpper2 = matrixCOrClampUpper;
      matrixTxOrClampValue = readF32(readI32(controlledEntity, 140), 8);
      matrixTyOrClampLower = f32(savedMatrixCOrClampUpper2 - matrixTxOrClampValue);
      matrixTxOrClampValue = f32(matrixTxOrClampValue - matrixCOrClampUpper);
      matrixAOrCameraOffset = readF32(state + 2052 | 0);
      applyEntityLocalTransformLoop2: while (true) {
        matrixCOrClampUpper = matrixTyOrClampLower;
        matrixTyOrClampLower = matrixTxOrClampValue;
        const savedMatrixTyOrClampLower3 = matrixTyOrClampLower;
        matrixTxOrClampValue = matrixCOrClampUpper;
        if (+(savedMatrixTyOrClampLower3 > matrixTxOrClampValue)) {
          continue applyEntityLocalTransformLoop2;
        }
        break;
      }
      const savedMatrixTyOrClampLower4 = matrixTyOrClampLower;
      const savedMatrixTxOrClampValue2 = matrixTxOrClampValue;
      matrixCOrClampUpper = f32(localYOrCosine + matrixAOrCameraOffset);
      localYOrCosine = selectValue(savedMatrixTyOrClampLower4, selectValue(savedMatrixTxOrClampValue2, matrixCOrClampUpper, +(matrixTxOrClampValue < matrixCOrClampUpper)), +(matrixTyOrClampLower > matrixCOrClampUpper));
    }
    writeU8(renderer, 1, 48);
    const savedRenderer11 = renderer;
    matrixTxOrClampValue = readF32(renderer, 16);
    const savedMatrixTxOrClampValue3 = matrixTxOrClampValue;
    const savedLocalX = localX;
    matrixAOrSine = readF32(renderer);
    const resultOfF3212 = f32(savedLocalX * matrixAOrSine);
    const savedLocalYOrCosine = localYOrCosine;
    matrixC = readF32(renderer, 8);
    writeF32(savedRenderer11, f32(savedMatrixTxOrClampValue3 + f32(resultOfF3212 + f32(savedLocalYOrCosine * matrixC))), 16);
    const savedRenderer12 = renderer;
    matrixB = readF32(renderer, 4);
    const resultOfF3213 = f32(matrixB * 0);
    matrixAOrCameraOffset = readF32(renderer, 12);
    const resultOfF3214 = f32(resultOfF3213 + matrixAOrCameraOffset);
    matrixCOrClampUpper = readF32(renderer, 20);
    matrixTyOrClampLower = f32(matrixCOrClampUpper * 0);
    writeF32(savedRenderer12, f32(resultOfF3214 + matrixTyOrClampLower), 12);
    const savedRenderer13 = renderer;
    const resultOfF3215 = f32(matrixC + f32(matrixAOrSine * 0));
    matrixTxOrClampValue = f32(matrixTxOrClampValue * 0);
    writeF32(savedRenderer13, f32(resultOfF3215 + matrixTxOrClampValue), 8);
    writeF32(renderer, f32(f32(matrixAOrSine + f32(matrixC * 0)) + matrixTxOrClampValue));
    writeF32(renderer, f32(matrixCOrClampUpper + f32(f32(localX * matrixB) + f32(localYOrCosine * matrixAOrCameraOffset))), 20);
    writeF32(renderer, f32(f32(matrixB + f32(matrixAOrCameraOffset * 0)) + matrixTyOrClampLower), 4);
    const resultOfInterpolateAngle = interpolateAngle(transform + 8 | 0);
    angle = resultOfInterpolateAngle;
    writeU8(renderer, 1, 48);
    const savedRenderer14 = renderer;
    matrixTyOrClampLower = readF32(renderer, 20);
    const savedMatrixTyOrClampLower5 = matrixTyOrClampLower;
    matrixC = readF32(renderer, 4);
    const savedMatrixC = matrixC;
    matrixB = readF32(renderer, 12);
    writeF32(savedRenderer14, f32(savedMatrixTyOrClampLower5 + f32(f32(savedMatrixC + matrixB) * 0)), 20);
    const savedRenderer15 = renderer;
    matrixTxOrClampValue = readF32(renderer, 16);
    const savedMatrixTxOrClampValue4 = matrixTxOrClampValue;
    matrixAOrCameraOffset = readF32(renderer);
    const savedMatrixAOrCameraOffset = matrixAOrCameraOffset;
    matrixCOrClampUpper = readF32(renderer, 8);
    writeF32(savedRenderer15, f32(savedMatrixTxOrClampValue4 + f32(f32(savedMatrixAOrCameraOffset + matrixCOrClampUpper) * 0)), 16);
    const savedRenderer16 = renderer;
    const savedMatrixB = matrixB;
    const resultOfCosF64 = cosF64(angle);
    localYOrCosine = f32(resultOfCosF64);
    const resultOfF3216 = f32(savedMatrixB * localYOrCosine);
    const savedMatrixC2 = matrixC;
    const resultOfSinF64 = sinF64(angle);
    matrixAOrSine = f32(resultOfSinF64);
    const resultOfF3217 = f32(resultOfF3216 - f32(savedMatrixC2 * matrixAOrSine));
    matrixTyOrClampLower = f32(matrixTyOrClampLower * 0);
    writeF32(savedRenderer16, f32(resultOfF3217 + matrixTyOrClampLower), 12);
    const savedRenderer17 = renderer;
    const resultOfF3218 = f32(f32(matrixCOrClampUpper * localYOrCosine) - f32(matrixAOrCameraOffset * matrixAOrSine));
    matrixTxOrClampValue = f32(matrixTxOrClampValue * 0);
    writeF32(savedRenderer17, f32(resultOfF3218 + matrixTxOrClampValue), 8);
    writeF32(renderer, f32(f32(f32(matrixC * localYOrCosine) + f32(matrixB * matrixAOrSine)) + matrixTyOrClampLower), 4);
    writeF32(renderer, f32(f32(f32(matrixAOrCameraOffset * localYOrCosine) + f32(matrixCOrClampUpper * matrixAOrSine)) + matrixTxOrClampValue));
    return transform;
  }
  /** Apply the flag-controlled visual fade and scale animation. Original WAT 128451–128631. */
  function applyVisualFade(scratch, visual, renderer) {
    let canvasHandle = 0, elapsedOrAlpha = 0, matrixC = 0, matrixD = 0, scaledMatrixC = 0, scaledMatrixA = 0, expandedScaleOrMatrixProduct = 0, matrixTx = 0, matrixA = 0, matrixTy = 0, scaledMatrixD = 0, matrixB = 0, fadeProgress = 0;
    if (readU8(visual, 8) & 1) {
      applyVisualFadeDone: {
        if (readU8(visual, 40)) {
          break applyVisualFadeDone;
        }
        if (readU8(visual, 16)) {
          elapsedOrAlpha = readF64(scratch, 768);
          writeU8(visual, 1, 40);
          writeF64(visual, elapsedOrAlpha + -150, 48);
          break applyVisualFadeDone;
        }
        writeI64(visual, readI64(scratch, 760), 40);
        writeI64(visual, readI64(scratch, 768), 48);
      }
      const savedRenderer18 = renderer;
      const storedF64 = readF64(renderer, 56);
      let fadeElapsed;
      applyVisualFadeDone2: {
        if (+(readU8(scratch, 760) === 0)) {
          fadeElapsed = Infinity;
          break applyVisualFadeDone2;
        }
        if (+(readU8(visual, 40) === 0)) {
          fadeElapsed = -Infinity;
          break applyVisualFadeDone2;
        }
        fadeElapsed = readF64(scratch, 768) - readF64(visual, 48);
      }
      elapsedOrAlpha = fadeElapsed * .006666666666666667;
      fadeProgress = f32(selectValue(0, Math.min(elapsedOrAlpha, 1), +(elapsedOrAlpha < 0)));
      elapsedOrAlpha = storedF64 * (1 - fadeProgress);
      elapsedOrAlpha = selectValue(0, Math.min(elapsedOrAlpha, 1), +(elapsedOrAlpha < 0));
      writeF64(savedRenderer18, elapsedOrAlpha, 56);
      canvasHandle = readI32(renderer, 96);
      writeF64(scratch, elapsedOrAlpha, 728);
      writeI32(scratch, canvasHandle, 720);
      const savedBits38 = canvasSetGlobalAlphaAbi(scratch + 720 | 0) | 0;
      void savedBits38;
      writeU8(renderer, 1, 48);
      const savedRenderer19 = renderer;
      matrixTy = readF32(renderer, 20);
      const savedMatrixTy2 = matrixTy;
      matrixB = readF32(renderer, 4);
      expandedScaleOrMatrixProduct = f32(matrixB * 0);
      const savedExpandedScaleOrMatrixProduct = expandedScaleOrMatrixProduct;
      matrixD = readF32(renderer, 12);
      scaledMatrixD = f32(matrixD * 0);
      writeF32(savedRenderer19, f32(savedMatrixTy2 + f32(savedExpandedScaleOrMatrixProduct + scaledMatrixD)), 20);
      const savedRenderer20 = renderer;
      matrixTx = readF32(renderer, 16);
      const savedMatrixTx2 = matrixTx;
      matrixA = readF32(renderer);
      scaledMatrixA = f32(matrixA * 0);
      const savedScaledMatrixA = scaledMatrixA;
      matrixC = readF32(renderer, 8);
      scaledMatrixC = f32(matrixC * 0);
      writeF32(savedRenderer20, f32(savedMatrixTx2 + f32(savedScaledMatrixA + scaledMatrixC)), 16);
      const savedRenderer21 = renderer;
      const savedExpandedScaleOrMatrixProduct2 = expandedScaleOrMatrixProduct;
      const savedMatrixD = matrixD;
      expandedScaleOrMatrixProduct = f32(fadeProgress + 1);
      const resultOfF3219 = f32(savedExpandedScaleOrMatrixProduct2 + f32(savedMatrixD * expandedScaleOrMatrixProduct));
      matrixD = f32(matrixTy * 0);
      writeF32(savedRenderer21, f32(resultOfF3219 + matrixD), 12);
      const savedRenderer22 = renderer;
      const resultOfF3220 = f32(scaledMatrixA + f32(expandedScaleOrMatrixProduct * matrixC));
      matrixC = f32(matrixTx * 0);
      writeF32(savedRenderer22, f32(resultOfF3220 + matrixC), 8);
      writeF32(renderer, f32(f32(f32(expandedScaleOrMatrixProduct * matrixB) + scaledMatrixD) + matrixD), 4);
      writeF32(renderer, f32(f32(f32(matrixA * expandedScaleOrMatrixProduct) + scaledMatrixC) + matrixC));
    }
  }
  /** Find the owner range in the entity hash and recursively draw its children. Original WAT 128632–128812. */
  function drawOwnedChildren(camera, renderer, entity, elapsedMilliseconds) {
    let node = 0, bucketPopcountOrRangeEnd = 0, nodeHash = 0, bucketIndex = 0, bucketCount = 0, ownerHash = 0;
    drawOwnedChildrenDone: {
      bucketCount = readI32(camera, 80);
      if (+(bucketCount === 0)) {
        break drawOwnedChildrenDone;
      }
      const storedI32 = readI32(camera, 76);
      let ownerBucket;
      drawOwnedChildrenDone2: {
        nodeHash = Math.imul(entity, 1540483477);
        nodeHash = Math.imul((nodeHash >>> 24 | 0) ^ nodeHash, 1540483477) ^ 1866966612;
        nodeHash = Math.imul((nodeHash >>> 13 | 0) ^ nodeHash, 1540483477);
        ownerHash = (nodeHash >>> 15 | 0) ^ nodeHash;
        const savedMask = ownerHash & (bucketCount - 1 | 0);
        bucketPopcountOrRangeEnd = popcount(bucketCount);
        if (+(bucketPopcountOrRangeEnd >>> 0 <= 1)) {
          ownerBucket = savedMask;
          break drawOwnedChildrenDone2;
        }
        void savedMask;
        const savedOwnerHash = ownerHash;
        if (+(bucketCount >>> 0 > ownerHash >>> 0)) {
          ownerBucket = savedOwnerHash;
          break drawOwnedChildrenDone2;
        }
        void savedOwnerHash;
        ownerBucket = remainderUnsigned(ownerHash, bucketCount);
      }
      bucketIndex = ownerBucket;
      nodeHash = readI32(storedI32 + (bucketIndex << 2) | 0);
      if (+(nodeHash === 0)) {
        break drawOwnedChildrenDone;
      }
      node = readI32(nodeHash);
      if (+(node === 0)) {
        break drawOwnedChildrenDone;
      }
      drawOwnedChildrenDone3: {
        if (+(bucketPopcountOrRangeEnd >>> 0 <= 1)) {
          bucketPopcountOrRangeEnd = bucketCount - 1 | 0;
          drawOwnedChildrenLoop: while (true) {
            drawOwnedChildrenDone4: {
              const savedOwnerHash2 = ownerHash;
              nodeHash = readI32(node, 4);
              if (+(savedOwnerHash2 !== nodeHash)) {
                if (+((bucketPopcountOrRangeEnd & nodeHash) === bucketIndex)) {
                  break drawOwnedChildrenDone4;
                }
                break drawOwnedChildrenDone;
              }
              if (+(readI32(node, 8) === entity)) {
                break drawOwnedChildrenDone3;
              }
            }
            node = readI32(node);
            if (node) {
              continue drawOwnedChildrenLoop;
            }
            break;
          }
          break drawOwnedChildrenDone;
        }
        drawOwnedChildrenLoop2: while (true) {
          drawOwnedChildrenDone5: {
            const savedOwnerHash3 = ownerHash;
            nodeHash = readI32(node, 4);
            if (+(savedOwnerHash3 !== nodeHash)) {
              let nodeBucket;
              if (+(nodeHash >>> 0 >= bucketCount >>> 0)) {
                nodeBucket = remainderUnsigned(nodeHash, bucketCount);
              } else {
                nodeBucket = nodeHash;
              }
              if (+(nodeBucket === bucketIndex)) {
                break drawOwnedChildrenDone5;
              }
              break drawOwnedChildrenDone;
            }
            if (+(readI32(node, 8) === entity)) {
              break drawOwnedChildrenDone3;
            }
          }
          node = readI32(node);
          if (node) {
            continue drawOwnedChildrenLoop2;
          }
          break;
        }
        break drawOwnedChildrenDone;
      }
      bucketPopcountOrRangeEnd = node;
      drawOwnedChildrenLoop3: while (true) {
        drawOwnedChildrenDone6: {
          bucketPopcountOrRangeEnd = readI32(bucketPopcountOrRangeEnd);
          if (+(bucketPopcountOrRangeEnd === 0)) {
            bucketPopcountOrRangeEnd = 0;
            break drawOwnedChildrenDone6;
          }
          if (+(readI32(bucketPopcountOrRangeEnd, 8) === entity)) {
            continue drawOwnedChildrenLoop3;
          }
        }
        break;
      }
      if (+(node === bucketPopcountOrRangeEnd)) {
        break drawOwnedChildrenDone;
      }
      drawOwnedChildrenLoop4: while (true) {
        drawEntity(camera, renderer, readI32(node, 12), elapsedMilliseconds);
        node = readI32(node);
        if (+(node !== bucketPopcountOrRangeEnd)) {
          continue drawOwnedChildrenLoop4;
        }
        break;
      }
    }
  }
  /** Record a newly encountered nearby entity type using its resolved catalog identity. Original WAT 128813–128964. */
  function trackNearbyEntityDiscovery(scratch, transform, localEntityHandle, entity) {
    let type = 0, discoveryByteAddress = 0, discoveryByte = 0, distanceX = 0, distanceY = 0, controlledTransformOrDefinition = 0;
    trackNearbyEntityDiscoveryDone: {
      controlledTransformOrDefinition = readI32(localEntityHandle, 144);
      if (+(controlledTransformOrDefinition === 0)) {
        break trackNearbyEntityDiscoveryDone;
      }
      if (+(+(readF32(readI32(controlledTransformOrDefinition, 116), 8) > 0) === 0)) {
        break trackNearbyEntityDiscoveryDone;
      }
      controlledTransformOrDefinition = readI32(controlledTransformOrDefinition, 120);
      if (+(readU8(controlledTransformOrDefinition, 144) === 0)) {
        updateWorldTransform(controlledTransformOrDefinition);
      }
      distanceY = readF64(controlledTransformOrDefinition, 160);
      distanceX = readF64(controlledTransformOrDefinition, 152);
      if (+(readU8(transform, 144) === 0)) {
        updateWorldTransform(transform);
      }
      distanceX = distanceX - readF64(transform, 152);
      const savedProduct4 = distanceX * distanceX;
      distanceX = distanceY - readF64(transform, 160);
      if (+(+(savedProduct4 + distanceX * distanceX < 81e4) === 0)) {
        break trackNearbyEntityDiscoveryDone;
      }
      controlledTransformOrDefinition = readI32(entity, 100);
      if (+(controlledTransformOrDefinition === 0)) {
        break trackNearbyEntityDiscoveryDone;
      }
      type = readU8(controlledTransformOrDefinition, 8);
      const resultOfGetEntityDefinition = getEntityDefinition(type);
      controlledTransformOrDefinition = resultOfGetEntityDefinition;
      if (controlledTransformOrDefinition) {
        controlledTransformOrDefinition = readU8(controlledTransformOrDefinition, 110);
        type = selectValue(controlledTransformOrDefinition, type, controlledTransformOrDefinition);
      }
      trackNearbyEntityDiscoveryDone2: {
        if (readU8(7784948) & 1) {
          break trackNearbyEntityDiscoveryDone2;
        }
        const resultOfAcquireGuard3 = acquireGuard(7784948);
        if (+(resultOfAcquireGuard3 === 0)) {
          break trackNearbyEntityDiscoveryDone2;
        }
        initializeDiscoveredCatalog();
        releaseGuard(7784948);
      }
      if (+(type === 0)) {
        break trackNearbyEntityDiscoveryDone;
      }
      discoveryByteAddress = (type >>> 3 | 0) + 7784944 | 0;
      discoveryByte = readU8(discoveryByteAddress);
      const savedDiscoveryByte = discoveryByte;
      controlledTransformOrDefinition = 1 << (type & 7);
      if (savedDiscoveryByte & controlledTransformOrDefinition) {
        break trackNearbyEntityDiscoveryDone;
      }
      writeU8(discoveryByteAddress, controlledTransformOrDefinition | discoveryByte);
      writeI32(scratch, type, 704);
      const resultOfFormatDiscoveryKey = formatDiscoveryKey(scratch + 848 | 0, 64, 18725, scratch + 704 | 0);
      void resultOfFormatDiscoveryKey;
      getEntityDisplayName(scratch + 912 | 0, type);
      storeDiscoveryRecord(scratch + 848 | 0, selectValue(readI32(scratch, 912), scratch + 912 | 0, +((readI8(scratch, 923) | 0) < 0)));
      if (+((readI8(scratch, 923) | 0) > -1)) {
        break trackNearbyEntityDiscoveryDone;
      }
      free(readI32(scratch, 912));
    }
  }
  /** Clear the visual update flag and restore the caller drawing state. Original WAT 131909–131953. */
  function restoreEntityDrawingState(scratch, visual, renderer) {
    writeU8(visual, 0, 16);
    writeI64(renderer, readI64(scratch, 840), 56);
    writeI64(renderer, readI64(scratch, 832), 48);
    writeI64(renderer, readI64(scratch, 824), 40);
    writeI64(renderer, readI64(scratch, 816), 32);
    writeI64(renderer, readI64(scratch, 808), 24);
    writeI64(renderer, readI64(scratch, 800), 16);
    writeI64(renderer, readI64(scratch, 792), 8);
    writeI64(renderer, readI64(scratch, 784));
    writeI32(scratch, readI32(renderer, 96));
    const savedBits39 = canvasRestoreAbi(scratch) | 0;
    void savedBits39;
  }
  return Object.freeze({
    760: drawEntity
  });
}
