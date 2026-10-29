/** Complete executable recovery of original client function1040.
 * Draws the entity component stored at offset132. Product identity is unproven.
 * The scratch layout, host ABI arguments, float32 operations and call order are
 * retained so native dependencies and callbacks see the same mutable state.
 * REA: ev_04342e4c580ccf87f0ef0dbcccd3cd9507572a0b364eac5298499dd7bc166c80.
 */
export const functionIds = Object.freeze([1040]);
export const dependencies = Object.freeze([372, 366, 395, 410]);
const f32 = Math.fround;
const canvasOperations = Object.freeze({
  lineWidth: 138111,
  lineJoinRound: 138811,
  lineCapRound: 138730,
  fillRgb: 137186,
  strokeRgb: 137456,
  beginPath: 136878,
  setTransform: 136414,
  moveTo: 137806,
  lineTo: 137843,
  closePath: 136912,
  ellipse: 138047,
  fill: 136661,
  save: 136300,
  clip: 136807,
  restore: 136329,
  stroke: 136732,
  quadraticCurveTo: 137880,
});

export function createComponent132RendererHooks(runtime) {
  const readClock = pointer => runtime.call(372, pointer);
  const compareMemory = (a, b, length) => runtime.call(366, a, b, length);
  const fillAndStrokeCurrentPath = renderer => runtime.call(395, renderer);
  const fillRectangle = (renderer, x, y, width, height) => runtime.call(410, renderer, x, y, width, height);
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

  // These are the game's typed emscripten_asm_const_int bridge signatures.
  function canvas(code, signature, argumentsPointer) {
    void (+runtime.host("a", "a", code, signature, argumentsPointer) | 0);
  }
  function contextCommand(renderer, scratch, offset, code) {
    writeI32(scratch, readI32(renderer, 96), offset);
    canvas(code, 31967, (scratch + offset) | 0);
  }
  function channel(value) {
    return value < 4294967296 && value >= 0 ? Math.trunc(value) | 0 : 0;
  }
  function grayscale(red, green, blue) {
    return channel(((red >>> 0) * .2126 + (green >>> 0) * .7152) + (blue >>> 0) * .0722);
  }
  function setColor(renderer, scratch, offset, code, red, green, blue) {
    if (readU8(renderer, 69)) red = green = blue = grayscale(red, green, blue);
    const context = readI32(renderer, 96);
    writeI32(scratch, blue, offset + 12);
    writeI32(scratch, green, offset + 8);
    writeI32(scratch, red, offset + 4);
    writeI32(scratch, context, offset);
    canvas(code, 32170, (scratch + offset) | 0);
  }

  /** Original expanded affine multiplication by scale(1.3,1.3).
   * Keeping the zero products preserves signed zero, infinity and NaN behavior.
   */
  function applyLocalScale(renderer) {
    writeU8(renderer, 1, 48);
    let translation = readF32(renderer, 16);
    let axis = readF32(renderer), zeroAxis = f32(axis * 0);
    let cross = readF32(renderer, 8), zeroCross = f32(cross * 0);
    writeF32(renderer, f32(translation + f32(zeroAxis + zeroCross)), 16);
    let scaledCross = f32(zeroAxis + f32(cross * 1.2999999523162842));
    translation = f32(translation * 0);
    writeF32(renderer, f32(scaledCross + translation), 8);
    writeF32(renderer, f32(f32(f32(axis * 1.2999999523162842) + zeroCross) + translation));
    translation = readF32(renderer, 20);
    axis = readF32(renderer, 4); zeroAxis = f32(axis * 0);
    cross = readF32(renderer, 12); zeroCross = f32(cross * 0);
    writeF32(renderer, f32(translation + f32(zeroAxis + zeroCross)), 20);
    scaledCross = f32(zeroAxis + f32(cross * 1.2999999523162842));
    translation = f32(translation * 0);
    writeF32(renderer, f32(scaledCross + translation), 12);
    writeF32(renderer, f32(f32(f32(axis * 1.2999999523162842) + zeroCross) + translation), 4);
  }
  function prepareLineStyle(renderer, scratch) {
    const context = readI32(renderer, 96);
    writeF64(scratch, 5, 1656); // lineWidth = 5
    writeI32(scratch, context, 1648);
    canvas(canvasOperations.lineWidth, 93028, (scratch + 1648) | 0);
    if (readU8(renderer, 50)) {
      writeU8(renderer, 0, 50);
      contextCommand(renderer, scratch, 1632, canvasOperations.lineJoinRound); // lineJoin = round
    }
    if (readU8(renderer, 49) !== 1) {
      writeU8(renderer, 1, 49);
      contextCommand(renderer, scratch, 1616, canvasOperations.lineCapRound); // lineCap = round
    }
  }

  /** A clock call can mutate the visual flag. Re-read it after each call.
   * An unset visual flag yields +Infinity, an unavailable clock -Infinity.
   */
  function readHitBlend(visual, scratch) {
    readClock((scratch + 1672) | 0);
    const active = readU8(visual, 56);
    let progress = Infinity;
    if (active) {
      progress = -Infinity;
      if (readU8(scratch, 1672)) {
        progress = (readF64((visual + 64) | 0) - readF64(scratch, 1680)) * .006666666666666667 + 1;
      }
    }
    const blend = f32(progress < 0 ? 0 : Math.min(progress, 1));
    return {active, blend};
  }
  function resolvePalette(component, scratch) {
    const owner = readI32(component);
    if (!owner) return {base:[51,51,51], fill:[255,211,99], outline:[211,173,70]};
    const visual = readI32(owner, 136);
    let continueFlag = 0, blend = 0, target = 0xff0000;
    if (readU8(visual, 56)) {
      const first = readHitBlend(visual, scratch); blend = first.blend;
      if (first.active) {
        const second = readHitBlend(visual, scratch); continueFlag = second.active;
        if (second.blend >= .9) target = 0xffffff;
      }
    }
    const darkRemainder = f32(51 - f32(blend * 51));
    const baseRed = channel(f32(f32(blend * 255) + darkRemainder));
    const baseBlue = channel(f32(darkRemainder + f32(blend * f32(target & 255))));
    const baseGreen = channel(f32(darkRemainder + f32(blend * f32(target >>> 8 & 255))));

    target = 0xff0000; blend = 0;
    let outlineContinues = 0;
    if (continueFlag) {
      const first = readHitBlend(visual, scratch); blend = first.blend;
      if (first.active) {
        const second = readHitBlend(visual, scratch); outlineContinues = second.active;
        if (second.blend >= .9) target = 0xffffff;
      }
    }
    const fillRemainder = f32(1 - blend);
    const fillBlue = channel(f32(f32(fillRemainder * 99) + f32(blend * f32(target & 255))));
    const fillGreen = channel(f32(f32(fillRemainder * 211) + f32(blend * f32(target >>> 8 & 255))));

    target = 0xff0000; blend = 0;
    if (outlineContinues) {
      const first = readHitBlend(visual, scratch); blend = first.blend;
      if (first.active && readHitBlend(visual, scratch).blend >= .9) target = 0xffffff;
    }
    const outlineRemainder = f32(1 - blend);
    const outlineRed = channel(f32(f32(blend * 255) + f32(outlineRemainder * 211)));
    const outlineBlue = channel(f32(f32(outlineRemainder * 70) + f32(blend * f32(target & 255))));
    const outlineGreen = channel(f32(f32(outlineRemainder * 173) + f32(blend * f32(target >>> 8 & 255))));
    return {base:[baseRed,baseGreen,baseBlue], fill:[255,fillGreen,fillBlue], outline:[outlineRed,outlineGreen,outlineBlue]};
  }

  /** Commit a changed affine matrix immediately before its path command.
   * The nonsequential copy/write order matches native observer-visible memory.
   */
  function synchronizeTransform(renderer, scratch, offset) {
    if (!readU8(renderer, 48)) return;
    writeU8(renderer, 0, 48);
    const cached = (renderer + 24) | 0;
    if (!compareMemory(cached, renderer, 24)) return;
    writeI64(cached, readI64(renderer));
    writeI64(cached, readI64(renderer, 16), 16);
    writeI64(cached, readI64(renderer, 8), 8);
    const crossX = readF32(renderer, 8), translationX = readF32(renderer, 16);
    const axisX = readF32(renderer), context = readI32(renderer, 96);
    const axisY = readF32(renderer, 4), crossY = readF32(renderer, 12);
    writeF64(scratch, readF32(renderer, 20), offset + 48);
    writeF64(scratch, translationX, offset + 40);
    writeF64(scratch, crossY, offset + 32);
    writeF64(scratch, crossX, offset + 24);
    writeF64(scratch, axisY, offset + 16);
    writeI32(scratch, context, offset);
    writeF64(scratch, axisX, offset + 8);
    canvas(canvasOperations.setTransform, 32144, (scratch + offset) | 0);
  }
  function pointCommand(renderer, scratch, offset, code, x, y) {
    const context = readI32(renderer, 96);
    writeF64(scratch, y, offset + 16);
    writeF64(scratch, x, offset + 8);
    writeI32(scratch, context, offset);
    canvas(code, 32166, (scratch + offset) | 0);
  }
  function quadraticCurve(renderer, scratch, offset, controlX, controlY, endX, endY) {
    const context = readI32(renderer, 96);
    writeF64(scratch, endY, offset + 32);
    writeF64(scratch, endX, offset + 24);
    writeF64(scratch, controlY, offset + 16);
    writeF64(scratch, controlX, offset + 8);
    writeI32(scratch, context, offset);
    canvas(canvasOperations.quadraticCurveTo, 32160, (scratch + offset) | 0);
  }
  function ellipse(renderer, scratch, offset) {
    const context = readI32(renderer, 96);
    writeI32(scratch, 0, offset + 64);
    writeF64(scratch, 6.283185307179586, offset + 56); // end angle = 2π
    writeF64(scratch, 0, offset + 48); // start angle
    writeF64(scratch, 0, offset + 40); // rotation
    writeF64(scratch, 20, offset + 32); // radiusY = 20
    writeF64(scratch, 30, offset + 24); // radiusX = 30
    writeF64(scratch, 0, offset + 16); // centerY
    writeF64(scratch, 0, offset + 8); // centerX
    writeI32(scratch, context, offset);
    canvas(canvasOperations.ellipse, 32191, (scratch + offset) | 0);
  }
  function drawTriangle(renderer, scratch) {
    contextCommand(renderer, scratch, 1568, canvasOperations.beginPath);
    synchronizeTransform(renderer, scratch, 1504);
    pointCommand(renderer, scratch, 1472, canvasOperations.moveTo, -47, 0);
    synchronizeTransform(renderer, scratch, 1408);
    pointCommand(renderer, scratch, 1376, canvasOperations.lineTo, -25, -6);
    synchronizeTransform(renderer, scratch, 1312);
    pointCommand(renderer, scratch, 1280, canvasOperations.lineTo, -25, 6);
    contextCommand(renderer, scratch, 1264, canvasOperations.closePath);
    fillAndStrokeCurrentPath(renderer);
  }
  function drawClippedEllipse(renderer, scratch, palette) {
    contextCommand(renderer, scratch, 1248, canvasOperations.beginPath);
    synchronizeTransform(renderer, scratch, 1184);
    ellipse(renderer, scratch, 1104);
    let [red, green, blue] = palette.fill;
    // This particular fill uses the original expression grouping for luminance.
    if (readU8(renderer, 69)) red = green = blue = channel((blue >>> 0) * .0722 + ((green >>> 0) * .7152 + 54.213));
    const context = readI32(renderer, 96);
    writeI32(scratch, blue, 1100); writeI32(scratch, green, 1096);
    writeI32(scratch, red, 1092); writeI32(scratch, context, 1088);
    canvas(canvasOperations.fillRgb, 32170, (scratch + 1088) | 0);
    contextCommand(renderer, scratch, 1072, canvasOperations.fill);
    contextCommand(renderer, scratch, 1056, canvasOperations.save);
    for (let offset = 56; offset >= 0; offset -= 8) writeI64(scratch, readI64(renderer, offset), 1676 + offset);
    contextCommand(renderer, scratch, 1040, canvasOperations.clip);
    setColor(renderer, scratch, 1024, canvasOperations.fillRgb, ...palette.base);
    fillRectangle(renderer, 10, -20, 10, 40);
    fillRectangle(renderer, -10, -20, 10, 40);
    fillRectangle(renderer, -30, -20, 10, 40);
    const saved = (scratch + 1676) | 0;
    for (let offset = 56; offset >= 0; offset -= 8) writeI64(renderer, readI64(saved, offset), offset);
    contextCommand(renderer, scratch, 1008, canvasOperations.restore);
  }
  function drawEllipseOutline(renderer, scratch, palette) {
    contextCommand(renderer, scratch, 992, canvasOperations.beginPath);
    synchronizeTransform(renderer, scratch, 928);
    ellipse(renderer, scratch, 848);
    let [red, green, blue] = palette.outline;
    if (readU8(renderer, 69)) red = green = blue = channel((blue >>> 0) * .0722 + ((green >>> 0) * .7152 + (red >>> 0) * .2126));
    const context = readI32(renderer, 96);
    writeI32(scratch, blue, 844); writeI32(scratch, green, 840);
    writeI32(scratch, red, 836); writeI32(scratch, context, 832);
    canvas(canvasOperations.strokeRgb, 32170, (scratch + 832) | 0);
    synchronizeTransform(renderer, scratch, 768);
    contextCommand(renderer, scratch, 752, canvasOperations.stroke);
  }
  function drawCurvedDetails(renderer, scratch) {
    const context = readI32(renderer, 96);
    writeF64(scratch, 3, 712); // lineWidth = 3
    writeI32(scratch, context, 704);
    canvas(canvasOperations.lineWidth, 93028, (scratch + 704) | 0);
    contextCommand(renderer, scratch, 688, canvasOperations.beginPath);
    synchronizeTransform(renderer, scratch, 624);
    pointCommand(renderer, scratch, 592, canvasOperations.moveTo, 25, -5);
    synchronizeTransform(renderer, scratch, 528);
    quadraticCurve(renderer, scratch, 480, 40, -10, 50, -15);
    synchronizeTransform(renderer, scratch, 416);
    quadraticCurve(renderer, scratch, 368, 40, -5, 25, -5);
    contextCommand(renderer, scratch, 352, canvasOperations.closePath);
    fillAndStrokeCurrentPath(renderer);
    contextCommand(renderer, scratch, 336, canvasOperations.beginPath);
    synchronizeTransform(renderer, scratch, 272);
    pointCommand(renderer, scratch, 240, canvasOperations.moveTo, 25, 5);
    synchronizeTransform(renderer, scratch, 176);
    quadraticCurve(renderer, scratch, 128, 40, 10, 50, 15);
    synchronizeTransform(renderer, scratch, 64);
    quadraticCurve(renderer, scratch, 16, 40, 5, 25, 5);
    contextCommand(renderer, scratch, 0, canvasOperations.closePath);
    fillAndStrokeCurrentPath(renderer);
  }
  function drawComponent132(component, renderer) {
    component |= 0; renderer |= 0;
    const scratch = (runtime.stackPointer.value - 1744) | 0;
    runtime.stackPointer.value = scratch;
    applyLocalScale(renderer);
    prepareLineStyle(renderer, scratch);
    const palette = resolvePalette(component, scratch);
    setColor(renderer, scratch, 1600, canvasOperations.fillRgb, ...palette.base);
    setColor(renderer, scratch, 1584, canvasOperations.strokeRgb, ...palette.base);
    drawTriangle(renderer, scratch);
    drawClippedEllipse(renderer, scratch, palette);
    drawEllipseOutline(renderer, scratch, palette);
    setColor(renderer, scratch, 736, canvasOperations.strokeRgb, ...palette.base);
    setColor(renderer, scratch, 720, canvasOperations.fillRgb, ...palette.base);
    drawCurvedDetails(renderer, scratch);
    runtime.stackPointer.value = (scratch + 1744) | 0;
  }
  return Object.freeze({1040: drawComponent132});
}
