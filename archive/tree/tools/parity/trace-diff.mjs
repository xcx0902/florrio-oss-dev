/** Structural diff for Canvas2D parity traces. */
export function diffTraces(expected, actual, options = {}) {
  const tolerance = options.tolerance ?? 1e-4;
  const maxReports = options.maxReports ?? 20;
  const issues = [];
  const report = (path, message) => {
    if (issues.length < maxReports) issues.push({ path, message });
  };
  if (!expected || !actual) {
    report('$', 'missing trace');
    return { equal: false, issues };
  }
  if (expected.digest !== actual.digest) report('digest', `${expected.digest} != ${actual.digest}`);
  if (expected.totalOps !== actual.totalOps) report('totalOps', `${expected.totalOps} != ${actual.totalOps}`);
  const expectedFrames = expected.frameDigests ?? [];
  const actualFrames = actual.frameDigests ?? [];
  if (expectedFrames.length !== actualFrames.length) report('frameDigests.length', `${expectedFrames.length} != ${actualFrames.length}`);
  for (let i = 0; i < Math.min(expectedFrames.length, actualFrames.length); i++) {
    const a = expectedFrames[i], b = actualFrames[i];
    if (a.frame !== b.frame) report(`frameDigests[${i}].frame`, `${a.frame} != ${b.frame}`);
    if (a.digest !== b.digest) report(`frameDigests[${i}].digest`, `${a.digest} != ${b.digest}`);
    if (a.ops !== b.ops) report(`frameDigests[${i}].ops`, `${a.ops} != ${b.ops}`);
    if (Math.abs((a.time ?? 0) - (b.time ?? 0)) > tolerance) report(`frameDigests[${i}].time`, `${a.time} != ${b.time}`);
  }
  const expectedFramesData = expected.frames ?? [];
  const actualFramesData = actual.frames ?? [];
  if (expectedFramesData.length !== actualFramesData.length) report('frames.length', `${expectedFramesData.length} != ${actualFramesData.length}`);
  for (let f = 0; f < Math.min(expectedFramesData.length, actualFramesData.length); f++) {
    const left = expectedFramesData[f]?.ops ?? [];
    const right = actualFramesData[f]?.ops ?? [];
    if (left.length !== right.length) report(`frames[${f}].ops.length`, `${left.length} != ${right.length}`);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const a = left[i], b = right[i];
      if (a?.[0] !== b?.[0]) report(`frames[${f}].ops[${i}][0]`, `${a?.[0]} != ${b?.[0]}`);
      if (a?.[1] !== b?.[1]) report(`frames[${f}].ops[${i}][1]`, `${a?.[1]} != ${b?.[1]}`);
      compareValue(a?.[2], b?.[2], `frames[${f}].ops[${i}][2]`, tolerance, report);
    }
  }
  if (JSON.stringify(expected.contexts) !== JSON.stringify(actual.contexts)) report('contexts', 'context list differs');
  return { equal: issues.length === 0, issues };
}

function compareValue(left, right, path, tolerance, report) {
  if (typeof left === 'number' && typeof right === 'number') {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      if (String(left) !== String(right)) report(path, `${left} != ${right}`);
      return;
    }
    if (Math.abs(left - right) > tolerance) report(path, `${left} != ${right}`);
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) report(path + '.length', `${left.length} != ${right.length}`);
    for (let i = 0; i < Math.min(left.length, right.length); i++) compareValue(left[i], right[i], `${path}[${i}]`, tolerance, report);
    return;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) compareValue(left[key], right[key], `${path}.${key}`, tolerance, report);
    return;
  }
  if (left !== right) report(path, `${JSON.stringify(left)} != ${JSON.stringify(right)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile } = await import('node:fs/promises');
  const [expectedFile, actualFile] = process.argv.slice(2).filter(value => !value.startsWith('--'));
  const toleranceIndex = process.argv.indexOf('--tolerance');
  const tolerance = toleranceIndex >= 0 ? Number(process.argv[toleranceIndex + 1]) : 1e-4;
  if (!expectedFile || !actualFile) {
    console.error('usage: node tools/parity/trace-diff.mjs <expected.json> <actual.json> [--tolerance 1e-4]');
    process.exit(2);
  }
  const expected = JSON.parse(await readFile(expectedFile, 'utf8'));
  const actual = JSON.parse(await readFile(actualFile, 'utf8'));
  const result = diffTraces(expected, actual, { tolerance });
  console.log(JSON.stringify(result, null, 2));
  if (!result.equal) process.exitCode = 1;
}
