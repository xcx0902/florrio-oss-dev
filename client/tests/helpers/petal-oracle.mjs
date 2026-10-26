/** Test-only bridge to the frozen catalogue's actual constructors/vtables.
 * ABI offsets stay here; production artwork is independent domain code. */
import { loadOriginal } from '../../../test/helpers/wasm-probe.mjs';
export async function createPetalOracle() {
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
    const pathMethod = { 141801:'moveTo',141835:'lineTo',141869:'arc',141918:'quadraticCurveTo',142027:'closePath' }[code];
    if (pathMethod) { paths.get(args[0]).push([pathMethod,...args.slice(1)]); return 0; }
    if (code === 136690 || code === 136763) calls.push([code === 136690 ? 'fillPath' : 'strokePath', paths.get(args[1])]);
    else calls.push([code, ...args.slice(1)]);
    return 0;
  }
  runtime = await loadOriginal('client', { functionIds: [368,391,818], imports: { a: { a:host,c:host } } });
  runtime.call(391, 1);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
  const alloc = size => { const p = runtime.call(368,size); bytes.fill(0,p,p+size); return p; };
  const renderer=alloc(128), color=alloc(4), params=alloc(32), entity=alloc(448);
  view.setInt32(color,-1,true);
  return {
    draw(type, { icon=false, handle=0x1234abcd, now=0, bind=true }={}) {
      runtime.call(818,renderer,color); bytes.fill(0,params,params+32);
      view.setFloat32(params+12,1,true); bytes[params+11]=+icon; clock=now;
      view.setUint32(entity+16,handle,true);
      const factory=view.getUint32(382064+type*52+48,true), object=runtime.table.get(factory)();
      const vtable=view.getUint32(object,true), draw=view.getUint32(vtable+32,true);
      if (bind) runtime.table.get(view.getUint32(vtable+28,true))(object,entity);
      calls=[];
      runtime.table.get(draw)(object,renderer,params);
      return { type, functionIndex:Number(runtime.table.get(draw).name), calls:structuredClone(calls) };
    }
  };
}
