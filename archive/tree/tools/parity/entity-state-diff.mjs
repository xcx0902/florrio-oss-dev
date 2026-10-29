/** Strict semantic entity comparison, independent of oracle replay/report writing. */
export function f32Ulp(value) {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude)) return NaN;
  return Math.max(2 ** -149, 2 ** (Math.floor(Math.log2(magnitude)) - 23));
}
export function compareEntities(original, candidate, options = {}) {
  const { tolerance = 1e-3, velocityTolerance = tolerance, ulpTolerance = 2 } = options;
  for (const [name, value] of Object.entries({ tolerance, velocityTolerance, ulpTolerance })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid ${name}`);
  }
  const fields = ['x', 'y', 'angle', 'radius', 'health', 'maxHealth', 'vx', 'vy', 'ax', 'ay'];
  const missing = [], extra = [], mismatched = [], mismatchedHandles = [];
  let maxPositionDelta = 0, maxHealthDelta = 0, maxAngleDelta = 0, maxRadiusDelta = 0;
  let maxVelocityDelta = 0, maxAccelerationDelta = 0, maxPositionExcess = 0;
  let positionWorst = null, velocityWorst = null;
  const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
  for (const [handle, value] of original) {
    const actual = candidate.get(handle);
    if (actual === undefined) { missing.push(handle); continue; }
    const invalid = fields.filter(field => !Number.isFinite(value[field]) || !Number.isFinite(actual[field]));
    const identityMatch = Number.isInteger(handle) && handle > 0 && handle <= 0xffffffff
      && Number.isInteger(value.type) && value.type >= 0 && value.type <= 0xffff
      && Number.isInteger(value.kind) && value.kind >= 1 && value.kind <= 5
      && value.type === actual.type && value.kind === actual.kind;
    const delta = field => invalid.includes(field) ? Infinity : Math.abs(value[field] - actual[field]);
    const dx = delta('x'), dy = delta('y'), dh = delta('health'), dm = delta('maxHealth');
    const da = invalid.includes('angle') ? Infinity : Math.abs(wrap(value.angle - actual.angle));
    const dr = delta('radius'), dvx = delta('vx'), dvy = delta('vy'), dax = delta('ax'), day = delta('ay');
    const positionDelta = Math.max(dx, dy), velocityDelta = Math.max(dvx, dvy);
    // Each axis has its own binary32 precision. A large x must not increase
    // the allowed error of a small y (or vice versa).
    const positionLimit = field => {
      const ulp = f32Ulp(Math.max(Math.abs(value[field]), Math.abs(actual[field])));
      return Number.isFinite(ulp) ? tolerance + ulpTolerance * ulp : 0;
    };
    const xLimit = positionLimit('x'), yLimit = positionLimit('y');
    maxPositionExcess = Math.max(maxPositionExcess, dx - xLimit, dy - yLimit);
    if (positionDelta > maxPositionDelta) {
      maxPositionDelta = positionDelta;
      positionWorst = { handle, type: actual.type, kind: actual.kind,
        original: { x: value.x, y: value.y }, candidate: { x: actual.x, y: actual.y }, dx, dy };
    }
    if (velocityDelta > maxVelocityDelta) {
      maxVelocityDelta = velocityDelta;
      velocityWorst = { handle, type: actual.type, kind: actual.kind, velocityDelta, original: value, candidate: actual };
    }
    maxHealthDelta = Math.max(maxHealthDelta, dh, dm);
    maxAngleDelta = Math.max(maxAngleDelta, da);
    maxRadiusDelta = Math.max(maxRadiusDelta, dr);
    maxAccelerationDelta = Math.max(maxAccelerationDelta, dax, day);
    if (!identityMatch || invalid.length || dx > xLimit || dy > yLimit || dh > tolerance || dm > tolerance
        || da > tolerance || dr > tolerance || velocityDelta > velocityTolerance || Math.max(dax, day) > velocityTolerance) {
      mismatchedHandles.push(handle);
      if (mismatched.length < 12) mismatched.push({ handle, type: actual.type, kind: actual.kind,
        identityMatch, invalid, xLimit, yLimit, dx, dy, dh, dm, da, dr, dvx, dvy, dax, day,
        original: value, candidate: actual });
    }
  }
  for (const handle of candidate.keys()) if (!original.has(handle)) extra.push(handle);
  return { exactHandles: !missing.length && !extra.length, missing, extra, mismatched,
    mismatchCount: mismatchedHandles.length, mismatchedHandles,
    missingSamples: missing.slice(0, 8).map(handle => ({ handle, ...original.get(handle) })),
    extraSamples: extra.slice(0, 8).map(handle => ({ handle, ...candidate.get(handle) })),
    maxPositionDelta, positionWorst, maxHealthDelta, maxAngleDelta, maxRadiusDelta,
    maxVelocityDelta, maxAccelerationDelta, velocityWorst, maxPositionExcess, ulpTolerance,
    matched: !missing.length && !extra.length && !mismatchedHandles.length };
}
