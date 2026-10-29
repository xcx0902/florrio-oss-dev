/** Persistent, read-only original-WASM rendering probe. Original instructions,
 * fixtures and the existing petal oracle are never changed by this helper. */
import { loadOriginal } from '../../../test/helpers/wasm-probe.mjs';

export async function createRenderingOracle(seed = 1) {
  let runtime, calls = [], clock = 0, nextPath = 1;
  const paths = new Map();
  function host(code, signature, pointer) {
    if (!runtime) return 0;
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; (type = bytes[signature++]); cursor++) {
      if (type < 105) { if (cursor & 1) cursor++; args.push(view.getFloat64((cursor++ >> 1) * 8, true)); }
      else args.push(view.getInt32(cursor * 4, true));
    }
    if (code === 141250) return 1;
    if (code === 141314) return clock;
    if (code === 150328) return args[0] % args[1];
    if (code === 141620) { const id = nextPath++; paths.set(id, []); return id; }
    const method = { 141801: 'moveTo', 141835: 'lineTo', 141869: 'arc',
      141918: 'quadraticCurveTo', 142027: 'closePath' }[code];
    if (method) { paths.get(args[0]).push([method, ...args.slice(1)]); return 0; }
    if (code === 136690 || code === 136763) calls.push([code === 136690 ? 'fillPath' : 'strokePath', structuredClone(paths.get(args[1]))]);
    else calls.push([code, ...args.slice(1)]);
    return 0;
  }
  runtime = await loadOriginal('client', { functionIds: [368, 391, 760, 818, 427, 431],
    imports: { a: { a: host, c: host } } });
  runtime.call(391, 1);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
  const alloc = size => { const p = runtime.call(368, size); bytes.fill(0, p, p + size); return p; };
  const uint = (p, value) => view.setUint32(p, value, true);
  const float = (p, value) => view.setFloat32(p, value, true);
  const double = (p, value) => view.setFloat64(p, value, true);
  uint(7948176, seed);
  const renderer = alloc(128), color = alloc(4), params = alloc(32), entity = alloc(448);
  uint(color, 0xffffffff);
  const prepare = ({ now = 0, delta = 0, icon = false, flash = 0, x = 0, y = 0,
    matrix = [1, 0, 0, 1, 0, 0], alpha = 1 } = {}) => {
    runtime.call(818, renderer, color);
    matrix.forEach((value, index) => float(renderer + index * 4, value));
    bytes[renderer + 48] = 1;
    double(renderer + 56, alpha);
    bytes.fill(0, params, params + 32);
    float(params, delta); float(params + 4, flash);
    bytes.set(flash >= 0.9 ? [255, 255, 255] : [255, 0, 0], params + 8);
    bytes[params + 11] = +icon;
    float(params + 12, x); float(params + 16, y);
    clock = now;
    // The real clock cache is frame-owned. Invalidate it between probe frames.
    bytes[7922312] = 0;
    calls = [];
  };
  return {
    petal(type, { bind = true } = {}) {
      const factory = view.getUint32(382064 + type * 52 + 48, true);
      const object = runtime.table.get(factory)(), vtable = view.getUint32(object, true);
      if (bind) runtime.table.get(view.getUint32(vtable + 28, true))(object, entity);
      const draw = runtime.table.get(view.getUint32(vtable + 32, true));
      return { functionIndex: Number(draw.name), phase: view.getFloat32(object + 4, true),
        frame(options = {}) { prepare(options); draw(object, renderer, params); return structuredClone(calls); },
        state() { return Array.from(bytes.slice(object, object + (type === 35 ? 652 : 8))); } };
    },
    /** Native760 dispatch, with only the selected component installed. */
    component(offset, { variant = 0 } = {}) {
      const state = alloc(4096), transform = alloc(176), visual = alloc(80), component = alloc(32);
      const link = alloc(4), owner = alloc(176);
      uint(state + 264, link); uint(link, owner);
      uint(entity, state); uint(entity + 120, transform); uint(transform, entity);
      uint(entity + 136, visual); uint(entity + offset, component); uint(component, entity);
      bytes[component + 8] = variant; bytes[transform + 144] = 1;
      return { get progress() { return view.getFloat32(component + 8, true); }, frame(options = {}) {
        prepare(options);
        float(transform + 64, options.x ?? 0); float(transform + 40, options.y ?? 0);
        double(transform + 8, options.angle ?? 0);
        double(transform + 152, options.x ?? 0); double(transform + 160, options.y ?? 0);
        bytes[visual + 16] = +(options.immediate ?? true);
        bytes[entity + 44] = +(options.arrival ?? false);
        bytes[visual + 56] = +(options.flash > 0);
        double(visual + 64, clock - (1 - (options.flash ?? 0)) * 150);
        runtime.call(760, state + 2144, renderer, entity, options.delta ?? 0);
        return structuredClone(calls);
      } };
    },
    get randomState() { return view.getUint32(7948176, true); },
    sin: angle => runtime.call(431, angle), cos: angle => runtime.call(427, angle),
  };
}

/** Paint recorder retains the CTM and stroke state that older colour-only
 * tests omitted. It can replay both original asm-const traces and domain art. */
export class RenderingCanvas {
  constructor() {
    this.paints = []; this.path = []; this.stack = [];
    this.state = { matrix: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0],
      alpha: 1, width: 1, join: 'miter', cap: 'butt' };
  }
  save() { this.stack.push(structuredClone(this.state)); }
  restore() { this.state = this.stack.pop(); }
  setTransform(...matrix) { this.state.matrix = matrix; }
  getTransform() { return [...this.state.matrix]; }
  transform(a, b, c, d, e, y) {
    const [ma, mb, mc, md, me, mf] = this.state.matrix, f = Math.fround;
    this.setTransform(f(f(ma*a)+f(mc*b)), f(f(mb*a)+f(md*b)), f(f(ma*c)+f(mc*d)),
      f(f(mb*c)+f(md*d)), f(me+f(f(ma*e)+f(mc*y))), f(mf+f(f(mb*e)+f(md*y))));
  }
  setFillRgb(...color) { this.state.fill = color; } setStrokeRgb(...color) { this.state.stroke = color; }
  setGlobalAlpha(value) { this.state.alpha = value; } getGlobalAlpha() { return this.state.alpha; }
  setLineWidth(value) { this.state.width = value; } setLineJoin(value) { this.state.join = value; }
  setLineCap(value) { this.state.cap = value; }
  beginPath() { this.path = []; }
  closePath() { this.path.push(['closePath']); }
  moveTo(...args) { this.path.push(['moveTo', ...args]); } lineTo(...args) { this.path.push(['lineTo', ...args]); }
  quadraticCurveTo(...args) { this.path.push(['quadraticCurveTo', ...args]); }
  bezierCurveTo(...args) { this.path.push(['bezierCurveTo', ...args]); }
  arc(...args) { this.path.push(['arc', ...args.slice(0, 5), !!args[5]]); }
  ellipse(...args) { this.path.push(['ellipse', ...args.slice(0, 7), !!args[7]]); }
  rect(...args) { this.path.push(['rect', ...args]); }
  fill() { this.paints.push({ op: 'fill', ...structuredClone(this.state), path: structuredClone(this.path) }); }
  stroke() { this.paints.push({ op: 'stroke', ...structuredClone(this.state), path: structuredClone(this.path) }); }
  fillRect(...args) { this.beginPath(); this.rect(...args); this.fill(); }
  strokeRect(...args) { this.beginPath(); this.rect(...args); this.stroke(); }
  clip() {} setGlobalCompositeOperation() {} setFont() {} fillText() {} strokeText() {}
  measureText() { return { width: 0 }; } drawImage() {}
  replay(calls) {
    const methods = { 136300:'save', 136329:'restore', 136414:'setTransform', 137186:'setFillRgb',
      137456:'setStrokeRgb', 137728:'setGlobalAlpha', 137767:'setGlobalAlpha', 138111:'setLineWidth',
      136878:'beginPath', 136912:'closePath', 137806:'moveTo', 137843:'lineTo', 137880:'quadraticCurveTo',
      137935:'bezierCurveTo', 137995:'arc', 138047:'ellipse', 136946:'rect', 136661:'fill', 136732:'stroke' };
    for (const [code, ...args] of calls) {
      if (code === 138811) this.setLineJoin('round');
      else if (code === 138730) this.setLineCap('round');
      else if (code === 'fillPath' || code === 'strokePath') { this.path = args[0]; this[code === 'fillPath' ? 'fill' : 'stroke'](); }
      else if (methods[code]) this[methods[code]](...args);
    }
    return this.paints;
  }
}
