/** Complete direct source recovery of original client WASM function 690.
 * Artifact c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 * Retains the shared 1360-byte scratch frame and exact floating-point operations.
 */
export const functionIds = Object.freeze([ 690 ]);

const f32 = Math.fround;

export function createEyeRendererHooks(runtime) {
  const compareMemory = (...args) => runtime.call(366, ...args);
  const powF64 = (...args) => runtime.call(375, ...args);
  const cosF32 = (...args) => runtime.call(427, ...args);
  const sinF32 = (...args) => runtime.call(431, ...args);
  // WASM converts each ignored i32 import result with ToNumber before returning.
  // Unary + preserves that conversion, including BigInt/Symbol/object failures.
  const canvasSetLineWidthAbi = argumentPointer => +runtime.host("a", "a", 138111, 93028, argumentPointer);
  const canvasSetStrokeRgbAbi = argumentPointer => +runtime.host("a", "a", 137456, 32170, argumentPointer);
  const canvasBeginPathAbi = argumentPointer => +runtime.host("a", "a", 136878, 31967, argumentPointer);
  const canvasSetTransformAbi = argumentPointer => +runtime.host("a", "a", 136414, 32144, argumentPointer);
  const canvasMoveToAbi = argumentPointer => +runtime.host("a", "a", 137806, 32166, argumentPointer);
  const canvasLineToAbi = argumentPointer => +runtime.host("a", "a", 137843, 32166, argumentPointer);
  const canvasStrokeAbi = argumentPointer => +runtime.host("a", "a", 136732, 31967, argumentPointer);
  const canvasArcAbi = argumentPointer => +runtime.host("a", "a", 137995, 32183, argumentPointer);
  const canvasSetFillRgbAbi = argumentPointer => +runtime.host("a", "a", 137186, 32170, argumentPointer);
  const canvasFillAbi = argumentPointer => +runtime.host("a", "a", 136661, 31967, argumentPointer);
  const canvasSaveAbi = argumentPointer => +runtime.host("a", "a", 136300, 31967, argumentPointer);
  const canvasClipAbi = argumentPointer => +runtime.host("a", "a", 136807, 31967, argumentPointer);
  const canvasRestoreAbi = argumentPointer => +runtime.host("a", "a", 136329, 31967, argumentPointer);
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
  // eyeContext stores six pointers: renderer slot +0, cached death byte +4,
  // RGB color +8, persistent pupil directions +12, appearance parameters +16,
  // and frame delta +20. Each eye occupies two f32 values at index * 8.
  function drawEye(eyeContext, centerX, centerY, eyeIndex) {
    eyeContext |= 0;
    centerX = f32(centerX);
    centerY = f32(centerY);
    eyeIndex |= 0;
    const scratch = runtime.stackPointer.value - 1360 | 0;
    runtime.stackPointer.value = scratch;
    const [renderer, originalRenderer] = saveTransformAndTranslate(scratch, eyeContext, centerX, centerY);
    drawEyeContents(scratch, renderer, eyeContext, eyeIndex);
    restoreOriginalTransform(scratch, originalRenderer);
    // A throwing callback or dependency leaves the original scratch frame live.
    runtime.stackPointer.value = scratch + 1360 | 0;
  }
  /** Draw both diagonal strokes for a dead eye. Original WAT 103705–104462. */
  function drawDeadEye(scratch, greenOrCanvasHandle, contextOrRenderer) {
    let blue = 0, rendererOrCanvasHandle = 0, matrixTx = 0, matrixB = 0, matrixA = 0, luminance = 0, matrixC = 0, matrixD = 0, redOrRendererOrCanvasHandle = 0;
    redOrRendererOrCanvasHandle = readI32(greenOrCanvasHandle, 96);
    writeI64(scratch, 4613937818241073152n, 1256);
    writeI32(scratch, redOrRendererOrCanvasHandle, 1248);
    const savedBits = canvasSetLineWidthAbi(scratch + 1248 | 0) | 0;
    void savedBits;
    redOrRendererOrCanvasHandle = readI32(contextOrRenderer, 8);
    blue = readU8(redOrRendererOrCanvasHandle, 2);
    greenOrCanvasHandle = readU8(redOrRendererOrCanvasHandle, 1);
    redOrRendererOrCanvasHandle = readU8(redOrRendererOrCanvasHandle);
    rendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
    if (readU8(rendererOrCanvasHandle, 69)) {
      let selectedValue1;
      drawDeadEyeDone: {
        luminance = ((redOrRendererOrCanvasHandle & 255) >>> 0) * .2126 + ((greenOrCanvasHandle & 255) >>> 0) * .7152 + ((blue & 255) >>> 0) * .0722;
        if (+(luminance < 4294967296) & +(luminance >= 0)) {
          const resultOfTruncateInteger = truncateInteger(luminance, true);
          selectedValue1 = resultOfTruncateInteger;
          break drawDeadEyeDone;
        }
        selectedValue1 = 0;
      }
      blue = selectedValue1;
      greenOrCanvasHandle = blue;
      redOrRendererOrCanvasHandle = greenOrCanvasHandle;
    }
    rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
    writeI32(scratch, blue & 255, 1244);
    writeI32(scratch, greenOrCanvasHandle & 255, 1240);
    writeI32(scratch, redOrRendererOrCanvasHandle & 255, 1236);
    writeI32(scratch, rendererOrCanvasHandle, 1232);
    const savedBits2 = canvasSetStrokeRgbAbi(scratch + 1232 | 0) | 0;
    void savedBits2;
    writeI32(scratch, readI32(readI32(readI32(contextOrRenderer)), 96), 1216);
    const savedBits3 = canvasBeginPathAbi(scratch + 1216 | 0) | 0;
    void savedBits3;
    drawDeadEyeDone2: {
      redOrRendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
      if (+(readU8(redOrRendererOrCanvasHandle, 48) === 0)) {
        break drawDeadEyeDone2;
      }
      writeU8(redOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory = compareMemory(redOrRendererOrCanvasHandle + 24 | 0, redOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory === 0)) {
        break drawDeadEyeDone2;
      }
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle), 24);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 16), 40);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(redOrRendererOrCanvasHandle, 8);
      matrixD = readF32(redOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(redOrRendererOrCanvasHandle, 16);
      matrixA = readF32(redOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
      matrixB = readF32(redOrRendererOrCanvasHandle, 4);
      writeF64(scratch + 1200 | 0, readF32(redOrRendererOrCanvasHandle, 20));
      writeF64(scratch + 1192 | 0, matrixTx);
      writeF64(scratch + 1184 | 0, matrixD);
      writeF64(scratch + 1176 | 0, matrixC);
      writeF64(scratch + 1168 | 0, matrixB);
      writeI32(scratch, greenOrCanvasHandle, 1152);
      writeF64(scratch, matrixA, 1160);
      const savedBits4 = canvasSetTransformAbi(scratch + 1152 | 0) | 0;
      void savedBits4;
    }
    redOrRendererOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
    writeI64(scratch + 1136 | 0, -4607182418800017408n);
    writeI64(scratch, -4607182418800017408n, 1128);
    writeI32(scratch, redOrRendererOrCanvasHandle, 1120);
    const savedBits5 = canvasMoveToAbi(scratch + 1120 | 0) | 0;
    void savedBits5;
    drawDeadEyeDone3: {
      redOrRendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
      if (+(readU8(redOrRendererOrCanvasHandle, 48) === 0)) {
        break drawDeadEyeDone3;
      }
      writeU8(redOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory2 = compareMemory(redOrRendererOrCanvasHandle + 24 | 0, redOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory2 === 0)) {
        break drawDeadEyeDone3;
      }
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle), 24);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 16), 40);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(redOrRendererOrCanvasHandle, 8);
      matrixD = readF32(redOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(redOrRendererOrCanvasHandle, 16);
      matrixA = readF32(redOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
      matrixB = readF32(redOrRendererOrCanvasHandle, 4);
      writeF64(scratch + 1104 | 0, readF32(redOrRendererOrCanvasHandle, 20));
      writeF64(scratch + 1096 | 0, matrixTx);
      writeF64(scratch + 1088 | 0, matrixD);
      writeF64(scratch + 1080 | 0, matrixC);
      writeF64(scratch + 1072 | 0, matrixB);
      writeI32(scratch, greenOrCanvasHandle, 1056);
      writeF64(scratch, matrixA, 1064);
      const savedBits6 = canvasSetTransformAbi(scratch + 1056 | 0) | 0;
      void savedBits6;
    }
    redOrRendererOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
    writeI64(scratch + 1040 | 0, 4616189618054758400n);
    writeI64(scratch, 4616189618054758400n, 1032);
    writeI32(scratch, redOrRendererOrCanvasHandle, 1024);
    const savedBits7 = canvasLineToAbi(scratch + 1024 | 0) | 0;
    void savedBits7;
    drawDeadEyeDone4: {
      redOrRendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
      if (+(readU8(redOrRendererOrCanvasHandle, 48) === 0)) {
        break drawDeadEyeDone4;
      }
      writeU8(redOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory3 = compareMemory(redOrRendererOrCanvasHandle + 24 | 0, redOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory3 === 0)) {
        break drawDeadEyeDone4;
      }
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle), 24);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 16), 40);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(redOrRendererOrCanvasHandle, 8);
      matrixD = readF32(redOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(redOrRendererOrCanvasHandle, 16);
      matrixA = readF32(redOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
      matrixB = readF32(redOrRendererOrCanvasHandle, 4);
      writeF64(scratch, readF32(redOrRendererOrCanvasHandle, 20), 1008);
      writeF64(scratch, matrixTx, 1e3);
      writeF64(scratch, matrixD, 992);
      writeF64(scratch, matrixC, 984);
      writeF64(scratch, matrixB, 976);
      writeI32(scratch, greenOrCanvasHandle, 960);
      writeF64(scratch, matrixA, 968);
      const savedBits8 = canvasSetTransformAbi(scratch + 960 | 0) | 0;
      void savedBits8;
    }
    writeI32(scratch, readI32(redOrRendererOrCanvasHandle, 96), 944);
    const savedBits9 = canvasStrokeAbi(scratch + 944 | 0) | 0;
    void savedBits9;
    writeI32(scratch, readI32(readI32(readI32(contextOrRenderer)), 96), 928);
    const savedBits10 = canvasBeginPathAbi(scratch + 928 | 0) | 0;
    void savedBits10;
    drawDeadEyeDone5: {
      redOrRendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
      if (+(readU8(redOrRendererOrCanvasHandle, 48) === 0)) {
        break drawDeadEyeDone5;
      }
      writeU8(redOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory4 = compareMemory(redOrRendererOrCanvasHandle + 24 | 0, redOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory4 === 0)) {
        break drawDeadEyeDone5;
      }
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle), 24);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 16), 40);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(redOrRendererOrCanvasHandle, 8);
      matrixD = readF32(redOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(redOrRendererOrCanvasHandle, 16);
      matrixA = readF32(redOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
      matrixB = readF32(redOrRendererOrCanvasHandle, 4);
      writeF64(scratch, readF32(redOrRendererOrCanvasHandle, 20), 912);
      writeF64(scratch, matrixTx, 904);
      writeF64(scratch, matrixD, 896);
      writeF64(scratch, matrixC, 888);
      writeF64(scratch, matrixB, 880);
      writeI32(scratch, greenOrCanvasHandle, 864);
      writeF64(scratch, matrixA, 872);
      const savedBits11 = canvasSetTransformAbi(scratch + 864 | 0) | 0;
      void savedBits11;
    }
    redOrRendererOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
    writeI64(scratch, -4607182418800017408n, 848);
    writeI64(scratch, 4616189618054758400n, 840);
    writeI32(scratch, redOrRendererOrCanvasHandle, 832);
    const savedBits12 = canvasMoveToAbi(scratch + 832 | 0) | 0;
    void savedBits12;
    drawDeadEyeDone6: {
      redOrRendererOrCanvasHandle = readI32(readI32(contextOrRenderer));
      if (+(readU8(redOrRendererOrCanvasHandle, 48) === 0)) {
        break drawDeadEyeDone6;
      }
      writeU8(redOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory5 = compareMemory(redOrRendererOrCanvasHandle + 24 | 0, redOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory5 === 0)) {
        break drawDeadEyeDone6;
      }
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle), 24);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 16), 40);
      writeI64(redOrRendererOrCanvasHandle, readI64(redOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(redOrRendererOrCanvasHandle, 8);
      matrixD = readF32(redOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(redOrRendererOrCanvasHandle, 16);
      matrixA = readF32(redOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
      matrixB = readF32(redOrRendererOrCanvasHandle, 4);
      writeF64(scratch, readF32(redOrRendererOrCanvasHandle, 20), 816);
      writeF64(scratch, matrixTx, 808);
      writeF64(scratch, matrixD, 800);
      writeF64(scratch, matrixC, 792);
      writeF64(scratch, matrixB, 784);
      writeI32(scratch, greenOrCanvasHandle, 768);
      writeF64(scratch, matrixA, 776);
      const savedBits13 = canvasSetTransformAbi(scratch + 768 | 0) | 0;
      void savedBits13;
    }
    redOrRendererOrCanvasHandle = readI32(redOrRendererOrCanvasHandle, 96);
    writeI64(scratch, 4616189618054758400n, 752);
    writeI64(scratch, -4607182418800017408n, 744);
    writeI32(scratch, redOrRendererOrCanvasHandle, 736);
    const savedBits14 = canvasLineToAbi(scratch + 736 | 0) | 0;
    void savedBits14;
    drawDeadEyeDone7: {
      contextOrRenderer = readI32(readI32(contextOrRenderer));
      if (+(readU8(contextOrRenderer, 48) === 0)) {
        break drawDeadEyeDone7;
      }
      writeU8(contextOrRenderer, 0, 48);
      const resultOfCompareMemory6 = compareMemory(contextOrRenderer + 24 | 0, contextOrRenderer, 24);
      if (+(resultOfCompareMemory6 === 0)) {
        break drawDeadEyeDone7;
      }
      writeI64(contextOrRenderer, readI64(contextOrRenderer), 24);
      writeI64(contextOrRenderer, readI64(contextOrRenderer, 16), 40);
      writeI64(contextOrRenderer, readI64(contextOrRenderer, 8), 32);
      matrixC = readF32(contextOrRenderer, 8);
      matrixD = readF32(contextOrRenderer, 12);
      matrixTx = readF32(contextOrRenderer, 16);
      matrixA = readF32(contextOrRenderer);
      redOrRendererOrCanvasHandle = readI32(contextOrRenderer, 96);
      matrixB = readF32(contextOrRenderer, 4);
      writeF64(scratch, readF32(contextOrRenderer, 20), 720);
      writeF64(scratch, matrixTx, 712);
      writeF64(scratch, matrixD, 704);
      writeF64(scratch, matrixC, 696);
      writeF64(scratch, matrixB, 688);
      writeI32(scratch, redOrRendererOrCanvasHandle, 672);
      writeF64(scratch, matrixA, 680);
      const savedBits15 = canvasSetTransformAbi(scratch + 672 | 0) | 0;
      void savedBits15;
    }
    writeI32(scratch, readI32(contextOrRenderer, 96), 656);
    const savedBits16 = canvasStrokeAbi(scratch + 656 | 0) | 0;
    void savedBits16;
  }
  /** Expand the vertical eye scale, draw its circular path and fill the eye color. Original WAT 104465–104769. */
  function drawEyeWhite(scratch, rendererOrGreenOrCanvasHandle, eyeContext) {
    let blueOrCanvasHandle = 0, redOrColor = 0, rendererOrCanvasHandle = 0, matrixAOrTx = 0, matrixBOrZero = 0, matrixDOrA = 0, luminance = 0, matrixCOrZero = 0, translationOrMatrixD = 0;
    writeU8(rendererOrGreenOrCanvasHandle, 1, 48);
    const savedRendererOrGreenOrCanvasHandle = rendererOrGreenOrCanvasHandle;
    translationOrMatrixD = readF32(rendererOrGreenOrCanvasHandle, 16);
    const savedTranslationOrMatrixD = translationOrMatrixD;
    matrixAOrTx = readF32(rendererOrGreenOrCanvasHandle);
    matrixDOrA = f32(matrixAOrTx * 0);
    const savedMatrixDOrA = matrixDOrA;
    matrixCOrZero = readF32(rendererOrGreenOrCanvasHandle, 8);
    matrixBOrZero = f32(matrixCOrZero * 0);
    writeF32(savedRendererOrGreenOrCanvasHandle, f32(savedTranslationOrMatrixD + f32(savedMatrixDOrA + matrixBOrZero)), 16);
    const savedRendererOrGreenOrCanvasHandle2 = rendererOrGreenOrCanvasHandle;
    const resultOfF32 = f32(matrixDOrA + f32(matrixCOrZero + matrixCOrZero));
    matrixCOrZero = f32(translationOrMatrixD * 0);
    writeF32(savedRendererOrGreenOrCanvasHandle2, f32(resultOfF32 + matrixCOrZero), 8);
    writeF32(rendererOrGreenOrCanvasHandle, f32(f32(matrixAOrTx + matrixBOrZero) + matrixCOrZero));
    const savedRendererOrGreenOrCanvasHandle3 = rendererOrGreenOrCanvasHandle;
    translationOrMatrixD = readF32(rendererOrGreenOrCanvasHandle, 20);
    const savedTranslationOrMatrixD2 = translationOrMatrixD;
    matrixAOrTx = readF32(rendererOrGreenOrCanvasHandle, 4);
    matrixDOrA = f32(matrixAOrTx * 0);
    const savedMatrixDOrA2 = matrixDOrA;
    matrixCOrZero = readF32(rendererOrGreenOrCanvasHandle, 12);
    matrixBOrZero = f32(matrixCOrZero * 0);
    writeF32(savedRendererOrGreenOrCanvasHandle3, f32(savedTranslationOrMatrixD2 + f32(savedMatrixDOrA2 + matrixBOrZero)), 20);
    const savedRendererOrGreenOrCanvasHandle4 = rendererOrGreenOrCanvasHandle;
    const resultOfF322 = f32(matrixDOrA + f32(matrixCOrZero + matrixCOrZero));
    matrixCOrZero = f32(translationOrMatrixD * 0);
    writeF32(savedRendererOrGreenOrCanvasHandle4, f32(resultOfF322 + matrixCOrZero), 12);
    writeF32(rendererOrGreenOrCanvasHandle, f32(f32(matrixAOrTx + matrixBOrZero) + matrixCOrZero), 4);
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 640);
    const savedBits17 = canvasBeginPathAbi(scratch + 640 | 0) | 0;
    void savedBits17;
    drawEyeWhiteDone: {
      rendererOrGreenOrCanvasHandle = readI32(readI32(eyeContext));
      if (+(readU8(rendererOrGreenOrCanvasHandle, 48) === 0)) {
        break drawEyeWhiteDone;
      }
      writeU8(rendererOrGreenOrCanvasHandle, 0, 48);
      const resultOfCompareMemory7 = compareMemory(rendererOrGreenOrCanvasHandle + 24 | 0, rendererOrGreenOrCanvasHandle, 24);
      if (+(resultOfCompareMemory7 === 0)) {
        break drawEyeWhiteDone;
      }
      writeI64(rendererOrGreenOrCanvasHandle, readI64(rendererOrGreenOrCanvasHandle), 24);
      writeI64(rendererOrGreenOrCanvasHandle, readI64(rendererOrGreenOrCanvasHandle, 16), 40);
      writeI64(rendererOrGreenOrCanvasHandle, readI64(rendererOrGreenOrCanvasHandle, 8), 32);
      matrixCOrZero = readF32(rendererOrGreenOrCanvasHandle, 8);
      translationOrMatrixD = readF32(rendererOrGreenOrCanvasHandle, 12);
      matrixAOrTx = readF32(rendererOrGreenOrCanvasHandle, 16);
      matrixDOrA = readF32(rendererOrGreenOrCanvasHandle);
      blueOrCanvasHandle = readI32(rendererOrGreenOrCanvasHandle, 96);
      matrixBOrZero = readF32(rendererOrGreenOrCanvasHandle, 4);
      writeF64(scratch, readF32(rendererOrGreenOrCanvasHandle, 20), 624);
      writeF64(scratch, matrixAOrTx, 616);
      writeF64(scratch, translationOrMatrixD, 608);
      writeF64(scratch, matrixCOrZero, 600);
      writeF64(scratch, matrixBOrZero, 592);
      writeI32(scratch, blueOrCanvasHandle, 576);
      writeF64(scratch, matrixDOrA, 584);
      const savedBits18 = canvasSetTransformAbi(scratch + 576 | 0) | 0;
      void savedBits18;
    }
    rendererOrGreenOrCanvasHandle = readI32(rendererOrGreenOrCanvasHandle, 96);
    writeI32(scratch, 0, 560);
    writeI64(scratch, 4618760256179416344n, 552);
    writeI64(scratch, 0n, 544);
    writeI64(scratch, 4613937818241073152n, 536);
    writeI64(scratch, 0n, 528);
    writeI64(scratch, 0n, 520);
    writeI32(scratch, rendererOrGreenOrCanvasHandle, 512);
    const savedBits19 = canvasArcAbi(scratch + 512 | 0) | 0;
    void savedBits19;
    redOrColor = readI32(eyeContext, 8);
    blueOrCanvasHandle = readU8(redOrColor, 2);
    rendererOrGreenOrCanvasHandle = readU8(redOrColor, 1);
    redOrColor = readU8(redOrColor);
    rendererOrCanvasHandle = readI32(readI32(eyeContext));
    if (readU8(rendererOrCanvasHandle, 69)) {
      let selectedValue2;
      drawEyeWhiteDone2: {
        luminance = ((redOrColor & 255) >>> 0) * .2126 + ((rendererOrGreenOrCanvasHandle & 255) >>> 0) * .7152 + ((blueOrCanvasHandle & 255) >>> 0) * .0722;
        if (+(luminance < 4294967296) & +(luminance >= 0)) {
          const resultOfTruncateInteger2 = truncateInteger(luminance, true);
          selectedValue2 = resultOfTruncateInteger2;
          break drawEyeWhiteDone2;
        }
        selectedValue2 = 0;
      }
      blueOrCanvasHandle = selectedValue2;
      rendererOrGreenOrCanvasHandle = blueOrCanvasHandle;
      redOrColor = rendererOrGreenOrCanvasHandle;
    }
    rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
    writeI32(scratch, blueOrCanvasHandle & 255, 508);
    writeI32(scratch, rendererOrGreenOrCanvasHandle & 255, 504);
    writeI32(scratch, redOrColor & 255, 500);
    writeI32(scratch, rendererOrCanvasHandle, 496);
    const savedBits20 = canvasSetFillRgbAbi(scratch + 496 | 0) | 0;
    void savedBits20;
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 480);
    const savedBits21 = canvasFillAbi(scratch + 480 | 0) | 0;
    void savedBits21;
  }
  /** Save the canvas and 64-byte software state, then clip to the eye path. Original WAT 104770–104842. */
  function beginPupilClip(scratch, eyeContext) {
    let savedRenderer = 0;
    const savedScratch = scratch;
    savedRenderer = readI32(readI32(eyeContext));
    writeI32(savedScratch, readI32(savedRenderer, 96), 464);
    const savedBits22 = canvasSaveAbi(scratch + 464 | 0) | 0;
    void savedBits22;
    writeI64(scratch + 1328 | 0, readI64(savedRenderer, 56));
    writeI64(scratch + 1320 | 0, readI64(savedRenderer, 48));
    writeI64(scratch + 1312 | 0, readI64(savedRenderer, 40));
    writeI64(scratch + 1304 | 0, readI64(savedRenderer, 32));
    writeI64(scratch + 1296 | 0, readI64(savedRenderer, 24));
    writeI64(scratch + 1288 | 0, readI64(savedRenderer, 16));
    writeI64(scratch + 1280 | 0, readI64(savedRenderer, 8));
    writeI64(scratch, readI64(savedRenderer), 1272);
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 448);
    const savedBits23 = canvasClipAbi(scratch + 448 | 0) | 0;
    void savedBits23;
    return [ savedRenderer ];
  }
  /** Scale the pupil coordinate system with the original expanded f32 products. Original WAT 104843–104924. */
  function scalePupilTransform(eyeContext) {
    let renderer = 0, zeroProductA = 0, zeroProductB = 0, matrixCOrD = 0, translationOrZero = 0, matrixAOrB = 0;
    renderer = readI32(readI32(eyeContext));
    writeU8(renderer, 1, 48);
    const savedRenderer = renderer;
    translationOrZero = readF32(renderer, 16);
    const savedTranslationOrZero = translationOrZero;
    matrixAOrB = readF32(renderer);
    zeroProductA = f32(matrixAOrB * 0);
    const savedZeroProductA = zeroProductA;
    matrixCOrD = readF32(renderer, 8);
    zeroProductB = f32(matrixCOrD * 0);
    writeF32(savedRenderer, f32(savedTranslationOrZero + f32(savedZeroProductA + zeroProductB)), 16);
    const savedRenderer2 = renderer;
    const resultOfF323 = f32(zeroProductA + f32(matrixCOrD * .5));
    translationOrZero = f32(translationOrZero * 0);
    writeF32(savedRenderer2, f32(resultOfF323 + translationOrZero), 8);
    writeF32(renderer, f32(f32(matrixAOrB + zeroProductB) + translationOrZero));
    const savedRenderer3 = renderer;
    translationOrZero = readF32(renderer, 20);
    const savedTranslationOrZero2 = translationOrZero;
    matrixAOrB = readF32(renderer, 4);
    zeroProductA = f32(matrixAOrB * 0);
    const savedZeroProductA2 = zeroProductA;
    matrixCOrD = readF32(renderer, 12);
    zeroProductB = f32(matrixCOrD * 0);
    writeF32(savedRenderer3, f32(savedTranslationOrZero2 + f32(savedZeroProductA2 + zeroProductB)), 20);
    const savedRenderer4 = renderer;
    const resultOfF324 = f32(zeroProductA + f32(matrixCOrD * .5));
    translationOrZero = f32(translationOrZero * 0);
    writeF32(savedRenderer4, f32(resultOfF324 + translationOrZero), 12);
    writeF32(renderer, f32(f32(matrixAOrB + zeroProductB) + translationOrZero), 4);
  }
  /** Smooth the selected eye gaze toward the cosine and sine of the eye angle. Original WAT 104925–105039. */
  function updatePupilDirection(scratch, eyeContext, eyeIndexOrDirectionY) {
    let stateOrDeltaOrSavedState = 0, eyeOffsetOrDirectionX = 0, targetX = 0, targetOrBlendFraction = 0, currentValue = 0, previousXOrTargetY = 0, eyeAngle = 0;
    stateOrDeltaOrSavedState = readI32(eyeContext, 12);
    const savedStateOrDeltaOrSavedState = stateOrDeltaOrSavedState;
    eyeOffsetOrDirectionX = eyeIndexOrDirectionY << 3;
    eyeIndexOrDirectionY = savedStateOrDeltaOrSavedState + (eyeOffsetOrDirectionX | 4) | 0;
    eyeOffsetOrDirectionX = stateOrDeltaOrSavedState + eyeOffsetOrDirectionX | 0;
    previousXOrTargetY = readF32(eyeOffsetOrDirectionX);
    eyeAngle = readF32(readI32(eyeContext, 16), 12);
    const resultOfCosF32 = cosF32(eyeAngle);
    targetX = resultOfCosF32;
    stateOrDeltaOrSavedState = readI32(eyeContext, 20);
    const savedEyeOffsetOrDirectionX = eyeOffsetOrDirectionX;
    currentValue = previousXOrTargetY;
    const savedCurrentValue = currentValue;
    targetOrBlendFraction = targetX;
    let selectedValue3;
    if (+(Math.abs(savedCurrentValue - targetOrBlendFraction) < 1e-7)) {
      selectedValue3 = targetOrBlendFraction;
    } else {
      const savedDifference = targetOrBlendFraction - currentValue;
      const resultOfPowF64 = powF64(.8, readF32(stateOrDeltaOrSavedState) * .06);
      targetOrBlendFraction = 1 - resultOfPowF64;
      selectedValue3 = savedDifference * selectValue(0, Math.min(targetOrBlendFraction, 1), +(targetOrBlendFraction < 0)) + currentValue;
    }
    writeF32(savedEyeOffsetOrDirectionX, f32(selectedValue3));
    const resultOfSinF32 = sinF32(eyeAngle);
    previousXOrTargetY = resultOfSinF32;
    currentValue = readF32(eyeIndexOrDirectionY);
    const savedCurrentValue2 = currentValue;
    targetOrBlendFraction = previousXOrTargetY;
    if (+(+(Math.abs(savedCurrentValue2 - targetOrBlendFraction) < 1e-7) === 0)) {
      const savedDifference2 = targetOrBlendFraction - currentValue;
      const resultOfPowF642 = powF64(.8, readF32(stateOrDeltaOrSavedState) * .06);
      targetOrBlendFraction = 1 - resultOfPowF642;
      targetOrBlendFraction = savedDifference2 * selectValue(0, Math.min(targetOrBlendFraction, 1), +(targetOrBlendFraction < 0)) + currentValue;
    }
    stateOrDeltaOrSavedState = scratch + 1272 | 0;
    writeF32(eyeIndexOrDirectionY, f32(targetOrBlendFraction));
    return [ stateOrDeltaOrSavedState, eyeOffsetOrDirectionX, eyeIndexOrDirectionY ];
  }
  /** Draw the pupil at its smoothed gaze and fill it with the original light color. Original WAT 105040–105215. */
  function drawPupil(scratch, directionXOrCanvasHandle, eyeContext, directionYOrRendererOrCanvasHandle) {
    let matrixTx = 0, matrixB = 0, matrixA = 0, pupilY = 0, pupilX = 0, matrixC = 0, matrixD = 0;
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 432);
    const savedBits24 = canvasBeginPathAbi(scratch + 432 | 0) | 0;
    void savedBits24;
    pupilY = readF32(directionYOrRendererOrCanvasHandle) * 4;
    pupilX = readF32(directionXOrCanvasHandle);
    pupilX = pupilX + pupilX;
    drawPupilDone: {
      directionYOrRendererOrCanvasHandle = readI32(readI32(eyeContext));
      if (+(readU8(directionYOrRendererOrCanvasHandle, 48) === 0)) {
        break drawPupilDone;
      }
      writeU8(directionYOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory8 = compareMemory(directionYOrRendererOrCanvasHandle + 24 | 0, directionYOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory8 === 0)) {
        break drawPupilDone;
      }
      writeI64(directionYOrRendererOrCanvasHandle, readI64(directionYOrRendererOrCanvasHandle), 24);
      writeI64(directionYOrRendererOrCanvasHandle, readI64(directionYOrRendererOrCanvasHandle, 16), 40);
      writeI64(directionYOrRendererOrCanvasHandle, readI64(directionYOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(directionYOrRendererOrCanvasHandle, 8);
      matrixD = readF32(directionYOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(directionYOrRendererOrCanvasHandle, 16);
      matrixA = readF32(directionYOrRendererOrCanvasHandle);
      directionXOrCanvasHandle = readI32(directionYOrRendererOrCanvasHandle, 96);
      matrixB = readF32(directionYOrRendererOrCanvasHandle, 4);
      writeF64(scratch, readF32(directionYOrRendererOrCanvasHandle, 20), 416);
      writeF64(scratch, matrixTx, 408);
      writeF64(scratch, matrixD, 400);
      writeF64(scratch, matrixC, 392);
      writeF64(scratch, matrixB, 384);
      writeI32(scratch, directionXOrCanvasHandle, 368);
      writeF64(scratch, matrixA, 376);
      const savedBits25 = canvasSetTransformAbi(scratch + 368 | 0) | 0;
      void savedBits25;
    }
    directionYOrRendererOrCanvasHandle = readI32(directionYOrRendererOrCanvasHandle, 96);
    writeI32(scratch, 0, 352);
    writeI64(scratch, 4618760256179416344n, 344);
    writeI64(scratch, 0n, 336);
    writeI64(scratch, 4613937818241073152n, 328);
    writeF64(scratch, pupilY, 320);
    writeF64(scratch, pupilX, 312);
    writeI32(scratch, directionYOrRendererOrCanvasHandle, 304);
    const savedBits26 = canvasArcAbi(scratch + 304 | 0) | 0;
    void savedBits26;
    directionYOrRendererOrCanvasHandle = readI32(readI32(readI32(eyeContext)), 96);
    writeI32(scratch, 238, 300);
    writeI64(scratch, 1022202216686n, 292);
    writeI32(scratch, directionYOrRendererOrCanvasHandle, 288);
    const savedBits27 = canvasSetFillRgbAbi(scratch + 288 | 0) | 0;
    void savedBits27;
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 272);
    const savedBits28 = canvasFillAbi(scratch + 272 | 0) | 0;
    void savedBits28;
  }
  /** Restore the saved software drawing state and canvas after the clipped pupil. Original WAT 105216–105258. */
  function restorePupilState(scratch, savedRenderer, savedState) {
    writeI64(savedRenderer, readI64(savedState, 56), 56);
    writeI64(savedRenderer, readI64(savedState, 48), 48);
    writeI64(savedRenderer, readI64(savedState, 40), 40);
    writeI64(savedRenderer, readI64(savedState, 32), 32);
    writeI64(savedRenderer, readI64(savedState, 24), 24);
    writeI64(savedRenderer, readI64(savedState, 16), 16);
    writeI64(savedRenderer, readI64(savedState, 8), 8);
    writeI64(savedRenderer, readI64(savedState));
    writeI32(scratch, readI32(savedRenderer, 96), 256);
    const savedBits29 = canvasRestoreAbi(scratch + 256 | 0) | 0;
    void savedBits29;
  }
  /** Rebuild the eye arc, choose its color and grayscale, then draw the thin outline. Original WAT 105259–105585. */
  function drawEyeOutline(scratch, eyeContext) {
    let greenOrCanvasHandle = 0, blue = 0, rendererOrCanvasHandle = 0, matrixTx = 0, matrixB = 0, matrixA = 0, luminance = 0, matrixC = 0, matrixD = 0, blueOrRendererOrCanvasHandle = 0;
    writeI32(scratch, readI32(readI32(readI32(eyeContext)), 96), 240);
    const savedBits30 = canvasBeginPathAbi(scratch + 240 | 0) | 0;
    void savedBits30;
    drawEyeOutlineDone: {
      blueOrRendererOrCanvasHandle = readI32(readI32(eyeContext));
      if (+(readU8(blueOrRendererOrCanvasHandle, 48) === 0)) {
        break drawEyeOutlineDone;
      }
      writeU8(blueOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory9 = compareMemory(blueOrRendererOrCanvasHandle + 24 | 0, blueOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory9 === 0)) {
        break drawEyeOutlineDone;
      }
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle), 24);
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle, 16), 40);
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(blueOrRendererOrCanvasHandle, 8);
      matrixD = readF32(blueOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(blueOrRendererOrCanvasHandle, 16);
      matrixA = readF32(blueOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(blueOrRendererOrCanvasHandle, 96);
      matrixB = readF32(blueOrRendererOrCanvasHandle, 4);
      writeF64(scratch, readF32(blueOrRendererOrCanvasHandle, 20), 224);
      writeF64(scratch, matrixTx, 216);
      writeF64(scratch, matrixD, 208);
      writeF64(scratch, matrixC, 200);
      writeF64(scratch, matrixB, 192);
      writeI32(scratch, greenOrCanvasHandle, 176);
      writeF64(scratch, matrixA, 184);
      const savedBits31 = canvasSetTransformAbi(scratch + 176 | 0) | 0;
      void savedBits31;
    }
    blueOrRendererOrCanvasHandle = readI32(blueOrRendererOrCanvasHandle, 96);
    writeI32(scratch, 0, 160);
    writeI64(scratch, 4618760256179416344n, 152);
    writeI64(scratch, 0n, 144);
    writeI64(scratch, 4613937818241073152n, 136);
    writeI64(scratch, 0n, 128);
    writeI64(scratch, 0n, 120);
    writeI32(scratch, blueOrRendererOrCanvasHandle, 112);
    const savedBits32 = canvasArcAbi(scratch + 112 | 0) | 0;
    void savedBits32;
    blueOrRendererOrCanvasHandle = readI32(eyeContext, 8);
    blue = readU8(blueOrRendererOrCanvasHandle, 2);
    greenOrCanvasHandle = readU8(blueOrRendererOrCanvasHandle, 1);
    blueOrRendererOrCanvasHandle = readU8(blueOrRendererOrCanvasHandle);
    rendererOrCanvasHandle = readI32(readI32(eyeContext));
    if (readU8(rendererOrCanvasHandle, 69)) {
      let selectedValue4;
      drawEyeOutlineDone2: {
        luminance = ((blueOrRendererOrCanvasHandle & 255) >>> 0) * .2126 + ((greenOrCanvasHandle & 255) >>> 0) * .7152 + ((blue & 255) >>> 0) * .0722;
        if (+(luminance < 4294967296) & +(luminance >= 0)) {
          const resultOfTruncateInteger3 = truncateInteger(luminance, true);
          selectedValue4 = resultOfTruncateInteger3;
          break drawEyeOutlineDone2;
        }
        selectedValue4 = 0;
      }
      blue = selectedValue4;
      greenOrCanvasHandle = blue;
      blueOrRendererOrCanvasHandle = greenOrCanvasHandle;
    }
    rendererOrCanvasHandle = readI32(rendererOrCanvasHandle, 96);
    writeI32(scratch, blue & 255, 108);
    writeI32(scratch, greenOrCanvasHandle & 255, 104);
    writeI32(scratch, blueOrRendererOrCanvasHandle & 255, 100);
    writeI32(scratch, rendererOrCanvasHandle, 96);
    const savedBits33 = canvasSetStrokeRgbAbi(scratch + 96 | 0) | 0;
    void savedBits33;
    blueOrRendererOrCanvasHandle = readI32(readI32(readI32(eyeContext)), 96);
    writeI64(scratch, 4602678819172646912n, 88);
    writeI32(scratch, blueOrRendererOrCanvasHandle, 80);
    const savedBits34 = canvasSetLineWidthAbi(scratch + 80 | 0) | 0;
    void savedBits34;
    drawEyeOutlineDone3: {
      blueOrRendererOrCanvasHandle = readI32(readI32(eyeContext));
      if (+(readU8(blueOrRendererOrCanvasHandle, 48) === 0)) {
        break drawEyeOutlineDone3;
      }
      writeU8(blueOrRendererOrCanvasHandle, 0, 48);
      const resultOfCompareMemory10 = compareMemory(blueOrRendererOrCanvasHandle + 24 | 0, blueOrRendererOrCanvasHandle, 24);
      if (+(resultOfCompareMemory10 === 0)) {
        break drawEyeOutlineDone3;
      }
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle), 24);
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle, 16), 40);
      writeI64(blueOrRendererOrCanvasHandle, readI64(blueOrRendererOrCanvasHandle, 8), 32);
      matrixC = readF32(blueOrRendererOrCanvasHandle, 8);
      matrixD = readF32(blueOrRendererOrCanvasHandle, 12);
      matrixTx = readF32(blueOrRendererOrCanvasHandle, 16);
      matrixA = readF32(blueOrRendererOrCanvasHandle);
      greenOrCanvasHandle = readI32(blueOrRendererOrCanvasHandle, 96);
      matrixB = readF32(blueOrRendererOrCanvasHandle, 4);
      writeF64(scratch - -64 | 0, readF32(blueOrRendererOrCanvasHandle, 20));
      writeF64(scratch, matrixTx, 56);
      writeF64(scratch, matrixD, 48);
      writeF64(scratch, matrixC, 40);
      writeF64(scratch, matrixB, 32);
      writeI32(scratch, greenOrCanvasHandle, 16);
      writeF64(scratch, matrixA, 24);
      const savedBits35 = canvasSetTransformAbi(scratch + 16 | 0) | 0;
      void savedBits35;
    }
    writeI32(scratch, readI32(blueOrRendererOrCanvasHandle, 96));
    const savedBits36 = canvasStrokeAbi(scratch) | 0;
    void savedBits36;
  }
  /** Apply the final half scale before restoring the outer affine state. Original WAT 105586–105667. */
  function finishEyeScale(contextOrRenderer) {
    let zeroProductA = 0, zeroProductB = 0, matrixCOrD = 0, translationOrZero = 0, matrixAOrB = 0;
    contextOrRenderer = readI32(readI32(contextOrRenderer));
    writeU8(contextOrRenderer, 1, 48);
    const savedContextOrRenderer = contextOrRenderer;
    translationOrZero = readF32(contextOrRenderer, 16);
    const savedTranslationOrZero3 = translationOrZero;
    matrixAOrB = readF32(contextOrRenderer);
    zeroProductA = f32(matrixAOrB * 0);
    const savedZeroProductA3 = zeroProductA;
    matrixCOrD = readF32(contextOrRenderer, 8);
    zeroProductB = f32(matrixCOrD * 0);
    writeF32(savedContextOrRenderer, f32(savedTranslationOrZero3 + f32(savedZeroProductA3 + zeroProductB)), 16);
    const savedContextOrRenderer2 = contextOrRenderer;
    const resultOfF325 = f32(zeroProductA + f32(matrixCOrD * .5));
    translationOrZero = f32(translationOrZero * 0);
    writeF32(savedContextOrRenderer2, f32(resultOfF325 + translationOrZero), 8);
    writeF32(contextOrRenderer, f32(f32(matrixAOrB + zeroProductB) + translationOrZero));
    const savedContextOrRenderer3 = contextOrRenderer;
    translationOrZero = readF32(contextOrRenderer, 20);
    const savedTranslationOrZero4 = translationOrZero;
    matrixAOrB = readF32(contextOrRenderer, 4);
    zeroProductA = f32(matrixAOrB * 0);
    const savedZeroProductA4 = zeroProductA;
    matrixCOrD = readF32(contextOrRenderer, 12);
    zeroProductB = f32(matrixCOrD * 0);
    writeF32(savedContextOrRenderer3, f32(savedTranslationOrZero4 + f32(savedZeroProductA4 + zeroProductB)), 20);
    const savedContextOrRenderer4 = contextOrRenderer;
    const resultOfF326 = f32(zeroProductA + f32(matrixCOrD * .5));
    translationOrZero = f32(translationOrZero * 0);
    writeF32(savedContextOrRenderer4, f32(resultOfF326 + translationOrZero), 12);
    writeF32(contextOrRenderer, f32(f32(matrixAOrB + zeroProductB) + translationOrZero), 4);
  }
  /** Choose the dead-eye branch or draw the complete clipped pupil and outlined eye. Original WAT 103700–105668. */
  function drawEyeContents(scratch, renderer, eyeContext, eyeIndex) {
    let savedState = 0, directionX = 0;
    drawEyeContentsDone: {
      if (readU8(readI32(eyeContext, 4))) {
        drawDeadEye(scratch, renderer, eyeContext);
        break drawEyeContentsDone;
      }
      drawEyeWhite(scratch, renderer, eyeContext);
      [renderer] = beginPupilClip(scratch, eyeContext);
      scalePupilTransform(eyeContext);
      [savedState, directionX, eyeIndex] = updatePupilDirection(scratch, eyeContext, eyeIndex);
      drawPupil(scratch, directionX, eyeContext, eyeIndex);
      restorePupilState(scratch, renderer, savedState);
      drawEyeOutline(scratch, eyeContext);
      finishEyeScale(eyeContext);
    }
  }
  /** Save the original affine matrix and translate to the requested eye center. Original WAT 103595–103699. */
  function saveTransformAndTranslate(scratch, eyeContext, centerX, centerY) {
    let renderer = 0, originalRenderer = 0, matrixAOrB = 0, translationOrZero = 0, matrixCOrD = 0, zeroProduct = 0;
    const savedBits37 = scratch + 1352 | 0;
    originalRenderer = readI32(readI32(eyeContext));
    renderer = originalRenderer;
    writeI64(savedBits37, readI64(renderer + 16 | 0));
    writeI64(scratch + 1344 | 0, readI64(originalRenderer, 8));
    writeI64(scratch, readI64(originalRenderer), 1336);
    writeU8(originalRenderer, 1, 48);
    const savedRenderer5 = renderer;
    translationOrZero = readF32(renderer, 16);
    const savedTranslationOrZero5 = translationOrZero;
    matrixAOrB = readF32(originalRenderer);
    const resultOfF327 = f32(matrixAOrB * centerX);
    matrixCOrD = readF32(originalRenderer, 8);
    writeF32(savedRenderer5, f32(savedTranslationOrZero5 + f32(resultOfF327 + f32(matrixCOrD * centerY))), 16);
    const savedOriginalRenderer = originalRenderer;
    const resultOfF328 = f32(matrixCOrD + f32(matrixAOrB * 0));
    translationOrZero = f32(translationOrZero * 0);
    writeF32(savedOriginalRenderer, f32(resultOfF328 + translationOrZero), 8);
    writeF32(originalRenderer, f32(f32(matrixAOrB + f32(matrixCOrD * 0)) + translationOrZero));
    const savedOriginalRenderer2 = originalRenderer;
    matrixAOrB = readF32(originalRenderer, 4);
    const savedMatrixAOrB = matrixAOrB;
    matrixCOrD = readF32(originalRenderer, 12);
    const resultOfF329 = f32(savedMatrixAOrB + f32(matrixCOrD * 0));
    translationOrZero = readF32(originalRenderer, 20);
    zeroProduct = f32(translationOrZero * 0);
    writeF32(savedOriginalRenderer2, f32(resultOfF329 + zeroProduct), 4);
    writeF32(originalRenderer, f32(f32(matrixCOrD + f32(matrixAOrB * 0)) + zeroProduct), 12);
    writeF32(originalRenderer, f32(translationOrZero + f32(f32(matrixAOrB * centerX) + f32(matrixCOrD * centerY))), 20);
    renderer = readI32(readI32(eyeContext));
    return [ renderer, originalRenderer ];
  }
  /** Restore the original matrix in its original write order and mark it dirty. Original WAT 105669–105687. */
  function restoreOriginalTransform(scratch, originalRenderer) {
    writeI64(originalRenderer, readI64(scratch, 1336));
    writeI64(originalRenderer, readI64(scratch + 1352 | 0), 16);
    writeI64(originalRenderer, readI64(scratch + 1344 | 0), 8);
    writeU8(originalRenderer, 1, 48);
  }
  return Object.freeze({
    690: drawEye
  });
}
