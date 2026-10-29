/** Minimal recording 2D context used by product rendering tests.
 *
 * It records path commands, paint state and style setters without depending on
 * a browser canvas or on any archived rendering probe. */
/** Paint recorder retains the CTM and stroke state that older colour-only
 * tests omitted. It can replay recorded command traces and domain art. */
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
