/** Canvas2D surface used by the renderer. Mirrors the original bridge surface
 * in goal.md §3.4; style setters use explicit RGB where the original did. */
export interface Canvas2DContext {
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** Snapshot of the logical matrix, including pending unflushed changes. */
  getTransform?(): readonly [number, number, number, number, number, number];
  transform?(a: number, b: number, c: number, d: number, e: number, f: number): void;
  createPath?(): Path2D;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw?: boolean): void;
  fill(path?: Path2D): void;
  stroke(path?: Path2D): void;
  clip(path?: Path2D): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setFillRgb(r: number, g: number, b: number): void;
  setStrokeRgb(r: number, g: number, b: number): void;
  setGlobalAlpha(alpha: number): void;
  setGlobalCompositeOperation?(operation: GlobalCompositeOperation): void;
  setLineWidth(width: number): void;
  setLineCap(cap: CanvasLineCap): void;
  setLineJoin(join: CanvasLineJoin): void;
  setMiterLimit?(limit: number): void;
  getGlobalAlpha?(): number;
  setFont(font: string): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: CanvasImageSource, ...args: number[]): void;
}

export function wrapContext(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): Canvas2DContext {
  const color = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(value => (value & 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  type Matrix = [number, number, number, number, number, number];
  const current = (): Matrix => {
    const m = context.getTransform();
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  };
  let matrix = current();
  const stack: Matrix[] = [];
  // The recovered renderer keeps a logical f32 matrix and flushes its cache
  // at coordinate/path-resource operations, after intervening style setters.
  const flush = (): void => {
    const native = current();
    if (matrix.some((value, index) => value !== native[index])) context.setTransform(...matrix);
  };
  return {
    save: () => { stack.push([...matrix]); context.save(); },
    restore: () => { context.restore(); matrix = stack.pop() ?? matrix; },
    setTransform: (a, b, c, d, e, f) => { matrix = [a, b, c, d, e, f]; },
    getTransform: () => [...matrix] as Matrix,
    transform: (a, b, c, d, e, offsetY) => {
      const [ma, mb, mc, md, me, mf] = matrix, f = Math.fround;
      matrix = [f(f(ma * a) + f(mc * b)), f(f(mb * a) + f(md * b)),
        f(f(ma * c) + f(mc * d)), f(f(mb * c) + f(md * d)),
        f(me + f(f(ma * e) + f(mc * offsetY))),
        f(mf + f(f(mb * e) + f(md * offsetY)))];
    },
    createPath: () => new Path2D(),
    beginPath: () => context.beginPath(),
    closePath: () => context.closePath(),
    rect: (x, y, w, h) => { flush(); context.rect(x, y, w, h); },
    moveTo: (x, y) => { flush(); context.moveTo(x, y); },
    lineTo: (x, y) => { flush(); context.lineTo(x, y); },
    quadraticCurveTo: (cx, cy, x, y) => { flush(); context.quadraticCurveTo(cx, cy, x, y); },
    bezierCurveTo: (c1x, c1y, c2x, c2y, x, y) => { flush(); context.bezierCurveTo(c1x, c1y, c2x, c2y, x, y); },
    arc: (x, y, r, start, end, ccw) => { flush(); context.arc(x, y, r, start, end, ccw ?? false); },
    ellipse: (x, y, rx, ry, rotation, start, end, ccw) => { flush(); context.ellipse(x, y, rx, ry, rotation, start, end, ccw ?? false); },
    fill: path => { flush(); path === undefined ? context.fill() : context.fill(path); },
    stroke: path => { flush(); path === undefined ? context.stroke() : context.stroke(path); },
    clip: path => { flush(); path === undefined ? context.clip() : context.clip(path); },
    fillRect: (x, y, w, h) => { flush(); context.fillRect(x, y, w, h); },
    strokeRect: (x, y, w, h) => { flush(); context.strokeRect(x, y, w, h); },
    clearRect: (x, y, w, h) => { flush(); context.clearRect(x, y, w, h); },
    setFillRgb: (r, g, b) => { context.fillStyle = color(r, g, b); },
    setStrokeRgb: (r, g, b) => { context.strokeStyle = color(r, g, b); },
    setGlobalAlpha: alpha => { context.globalAlpha = alpha; },
    setGlobalCompositeOperation: operation => { context.globalCompositeOperation = operation; },
    setLineWidth: width => { context.lineWidth = width; },
    setLineCap: cap => { context.lineCap = cap; },
    setLineJoin: join => { context.lineJoin = join; },
    setMiterLimit: limit => { context.miterLimit = limit; },
    getGlobalAlpha: () => context.globalAlpha,
    setFont: font => { context.font = font; },
    fillText: (text, x, y) => { flush(); context.fillText(text, x, y); },
    strokeText: (text, x, y) => { flush(); context.strokeText(text, x, y); },
    measureText: text => context.measureText(text),
    drawImage: (image, ...args) => { flush(); (context.drawImage as unknown as (image: CanvasImageSource, ...values: number[]) => void)(image, ...args); },
  };
}
