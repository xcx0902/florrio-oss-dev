/** Compare every supplied frame; recorder resource IDs are local identities. */
export function compareCanvasFrames(expected, actual, options = {}) {
  const tolerance = options.tolerance ?? 1e-4;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('invalid canvas tolerance');
  const requiredFrames = options.requiredFrames ?? null;
  if (requiredFrames !== null && (!Number.isSafeInteger(requiredFrames) || requiredFrames <= 0))
    throw new Error('invalid required frame count');
  let issueCount = 0;
  const issues = [];
  const report = (path, left, right) => {
    issueCount++;
    if (issues.length < (options.maxReports ?? 20)) issues.push({ path, expected: left, actual: right });
  };
  function canonical(trace) {
    if (!Array.isArray(trace?.frames) || !trace.frames.length) return null;
    const resourceIds = new Map(), contextIds = new Map();
    const idFor = (kind, id) => {
      if (!resourceIds.has(kind)) resourceIds.set(kind, new Map());
      const ids = resourceIds.get(kind);
      if (!ids.has(id)) ids.set(id, ids.size);
      return ids.get(id);
    };
    function value(input, visiting = new Set()) {
      if (Array.isArray(input)) return input.map(item => value(item, visiting));
      if (!input || typeof input !== 'object') return input;
      const result = {};
      for (const [key, item] of Object.entries(input)) {
        result[key] = key === 'id' && input.kind ? idFor(input.kind, item) : value(item, visiting);
      }
      const collection = { path: 'paths', gradient: 'gradients', image: 'images' }[input.kind];
      if (collection) {
        const key = `${input.kind}:${input.id}`;
        if (visiting.has(key)) { report('resource.cycle', key, 'recursive definition'); return { kind: input.kind, recursive: true }; }
        const definitions = Array.isArray(trace[collection]) ? trace[collection].filter(item => item?.id === input.id) : [];
        const definition = definitions[0];
        if (definitions.length !== 1) {
          report('resource.definition', key, definitions.length ? 'duplicate' : 'missing');
          result.definition = { missing: true };
        }
        else {
          const nested = new Set([...visiting, key]);
          result.definition = value(Object.fromEntries(Object.entries(definition).filter(([key]) => key !== 'id')), nested);
        }
      }
      return result;
    }
    return trace.frames.map((frame, index) => {
      if (!frame || !Array.isArray(frame.ops) || !frame.ops.length) {
        report(`frames[${index}]`, 'nonempty commands', 'missing/empty'); return null;
      }
      return frame.ops.map((op, opIndex) => {
        if (!Array.isArray(op) || op.length !== 3 || !Number.isSafeInteger(op[0]) || op[0] < 0
          || typeof op[1] !== 'string' || !op[1] || !Array.isArray(op[2])) {
          report(`frames[${index}].ops[${opIndex}]`, 'command tuple', 'malformed'); return null;
        }
        const id = op[0];
        if (!contextIds.has(id)) contextIds.set(id, contextIds.size);
        return [contextIds.get(id), op[1], value(op[2])];
      });
    });
  }
  const left = canonical(expected), right = canonical(actual);
  function compare(a, b, location) {
    if (typeof a === 'number' && typeof b === 'number') {
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > tolerance) report(location, a, b);
    } else if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) report(`${location}.length`, a.length, b.length);
      for (let i = 0; i < Math.min(a.length, b.length); i++) compare(a[i], b[i], `${location}[${i}]`);
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], `${location}.${key}`);
    } else if (a !== b) report(location, a, b);
  }
  if (!left || !right) report('frames', left ? 'present' : 'missing/empty', right ? 'present' : 'missing/empty');
  else compare(left, right, 'frames');
  if (requiredFrames !== null && (left?.length !== requiredFrames || right?.length !== requiredFrames))
    report('frames.required', requiredFrames, { expected: left?.length ?? 0, actual: right?.length ?? 0 });
  const opCount = frames => frames?.reduce((sum, ops) => sum + (ops?.length ?? 0), 0) ?? 0;
  return { passed: issueCount === 0, issueCount, issues,
    expectedFrames: left?.length ?? 0, actualFrames: right?.length ?? 0,
    comparedFrames: Math.min(left?.length ?? 0, right?.length ?? 0),
    expectedOps: opCount(left), actualOps: opCount(right) };
}
