import { Matrix } from '../hud/layout.js';
import { f } from '../hud/math.js';
import type { Canvas2DContext } from './context.js';

export interface HudContext extends Canvas2DContext {
  getTransform(): readonly [number, number, number, number, number, number];
  setGlobalCompositeOperation(operation: GlobalCompositeOperation): void;
  stroke(path?: Path2D): void;
}

/** The native renderer keeps a logical f32 matrix and flushes only before an
 * operation that consumes it. Text blits restore that logical matrix without
 * emitting a native save/restore pair for every label (text.mjs func443).
 */
export function hudRenderer(native: Canvas2DContext): HudContext {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  // The caller's native matrix can still be the world pass's cached matrix.
  let flushed: Matrix = [NaN, NaN, NaN, NaN, NaN, NaN];
  const states: { matrix: Matrix; flushed: Matrix }[] = [];
  const flush = (): void => {
    if (matrix.some((value, index) => value !== flushed[index])) {
      native.setTransform(...matrix);
      flushed = matrix;
    }
  };
  const context: HudContext = {
    save() { native.save(); states.push({ matrix, flushed }); },
    restore() {
      native.restore();
      const state = states.pop();
      if (state) { matrix = state.matrix; flushed = state.flushed; }
    },
    setTransform(a, b, c, d, e, g) { matrix = [f(a), f(b), f(c), f(d), f(e), f(g)]; },
    transform(a, b, c, d, x, y) {
      const [ma, mb, mc, md, mx, my] = matrix;
      matrix = [f(f(ma * a) + f(mc * b)), f(f(mb * a) + f(md * b)),
        f(f(ma * c) + f(mc * d)), f(f(mb * c) + f(md * d)),
        f(mx + f(f(ma * x) + f(mc * y))), f(my + f(f(mb * x) + f(md * y)))];
    },
    getTransform() { return matrix; },
    beginPath: () => native.beginPath(), closePath: () => native.closePath(),
    rect: (...args) => { flush(); native.rect(...args); },
    moveTo: (...args) => { flush(); native.moveTo(...args); },
    lineTo: (...args) => { flush(); native.lineTo(...args); },
    quadraticCurveTo: (...args) => { flush(); native.quadraticCurveTo(...args); },
    bezierCurveTo: (...args) => { flush(); native.bezierCurveTo(...args); },
    arc: (...args) => { flush(); native.arc(...args); },
    ellipse: (...args) => { flush(); native.ellipse(...args); },
    fill: path => { flush(); native.fill(path); },
    stroke: path => { flush(); (native as HudContext).stroke(path); },
    clip: () => { flush(); native.clip(); },
    fillRect: (...args) => { flush(); native.fillRect(...args); },
    strokeRect: (...args) => { flush(); native.strokeRect(...args); },
    clearRect: (...args) => { flush(); native.clearRect(...args); },
    setFillRgb: (...args) => native.setFillRgb(...args),
    setStrokeRgb: (...args) => native.setStrokeRgb(...args),
    setGlobalAlpha: alpha => native.setGlobalAlpha(alpha),
    setLineWidth: width => native.setLineWidth(width),
    setLineJoin: join => native.setLineJoin(join),
    setLineCap: cap => native.setLineCap(cap),
    setFont: font => native.setFont(font),
    fillText: (...args) => { flush(); native.fillText(...args); },
    strokeText: (...args) => { flush(); native.strokeText(...args); },
    measureText: text => native.measureText(text),
    drawImage: (image, ...args) => { flush(); native.drawImage(image, ...args); },
    setGlobalCompositeOperation(operation) {
      const setter = (native as Partial<HudContext>).setGlobalCompositeOperation;
      if (typeof setter === 'function') setter.call(native, operation);
    },
  };
  return context;
}
