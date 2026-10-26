/** Recover the f32 camera projection from immutable Canvas grid commands.
 * An absolute anchor selects the 50-world-unit cell only; it cannot shift the
 * measured grid phase. Pixel centroids and per-scene entity offsets are not
 * projection evidence. See recovered render-frame/drawWorldGrid. */
const f32 = Math.fround;
const mod = (value, step) => (value % step + step) % step;

export function gridPhase(centre, extent, zoom) {
  const step = f32(50 * f32(zoom));
  return f32(mod(f32(extent * 0.5 - f32(f32(zoom) * f32(centre))), step)) + 0.5;
}

function recoverAxis(observed, extent, zoom, anchor) {
  const step = f32(50 * zoom);
  const phase = mod((extent * 0.5 - observed + 0.5) / zoom, 50);
  const estimate = phase + 50 * Math.round((anchor - phase) / 50);
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, estimate, true);
  const bits = view.getUint32(0, true);
  let best = null;
  // Search a small f32 neighbourhood around the algebraic inverse. The
  // original multiplies and subtracts in f32, so double inversion is lossy.
  for (let offset = -256; offset <= 256; offset++) {
    view.setUint32(0, (bits + offset) >>> 0, true);
    const candidate = view.getFloat32(0, true);
    if (!Number.isFinite(candidate)) continue;
    const error = Math.abs(gridPhase(candidate, extent, zoom) - observed);
    const distance = Math.abs(candidate - estimate);
    if (best === null || error < best.error - 1e-9
      || (Math.abs(error - best.error) < 1e-9 && distance < best.distance))
      best = { value: candidate, error, distance };
  }
  if (best === null || best.error > 1e-4)
    throw new Error(`cannot recover f32 camera phase ${observed}, step ${step}: ${JSON.stringify(best)}`);
  return best.value;
}

export function recoverCameraProjection(frame, anchor, width = 1280, height = 720) {
  const ops = frame.ops;
  const alpha = ops.findIndex(op => op[1] === '=globalAlpha' && Math.abs(op[2][0] - 0.06) < 1e-3);
  if (alpha < 0) return null;
  const lines = ops.slice(alpha + 1).filter(op => op[1] === 'moveTo');
  const vertical = lines.filter(op => op[2][1] === 0.5);
  const horizontal = lines.find(op => op[2][0] === 0.5 && op[2][1] !== 0.5);
  if (vertical.length < 2 || horizontal === undefined) throw new Error('incomplete grid projection evidence');
  const zoom = f32((vertical[1][2][0] - vertical[0][2][0]) / 50);
  return { x: recoverAxis(vertical[0][2][0], width, zoom, anchor.x),
    y: recoverAxis(horizontal[2][1], height, zoom, anchor.y), zoom,
    captureTime: frame.time, entityOffsetX: 0, entityOffsetY: 0,
    source: 'immutable-grid-f32-inversion' };
}
