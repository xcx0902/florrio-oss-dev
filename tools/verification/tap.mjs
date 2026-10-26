/** Strict, completed TAP 13 as emitted by node:test and the native test runner. */
export function parseTap(text) {
  const lines = String(text).trimEnd().split(/\r?\n/);
  const issues = [];
  const summaries = new Map();
  const scopes = new Map([[0, { results: [], plans: [] }]]);
  const results = [];
  let diagnostic = null, suites = 0, previousResult = null;
  const finish = (indent, scope) => {
    if (scope.plans.length !== 1) issues.push(`expected one TAP plan at indent ${indent}`);
    const plan = scope.plans[0]?.total;
    if (!Number.isSafeInteger(plan) || plan <= 0 || scope.results.length !== plan)
      issues.push('incomplete or empty result list');
    scope.results.forEach((result, index) => {
      if (result.number !== index + 1) issues.push('duplicate or out-of-order test number');
    });
    const planLine = scope.plans[0]?.line;
    if (scope.results.length && planLine > scope.results[0].line && planLine < scope.results.at(-1).line)
      issues.push('trailing plan precedes results');
  };
  const closeChildren = indent => {
    for (const [depth, scope] of [...scopes].sort(([a], [b]) => b - a)) {
      if (depth > indent) { finish(depth, scope); scopes.delete(depth); }
    }
  };
  if (lines[0] !== 'TAP version 13' || lines.filter(line => /^TAP version /.test(line)).length !== 1)
    issues.push('expected one initial TAP version 13 header');
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:not ok|Bail out!)(?:\s|$)/i.test(line)) issues.push('TAP contains a failure or bailout');
    if (diagnostic !== null) {
      if (line === `${diagnostic}...`) diagnostic = null;
      else if (/^\s+type: ['"]?suite['"]?\s*$/.test(line)) suites++;
      continue;
    }
    const yaml = line.match(/^( +)---\s*$/);
    if (yaml) {
      if (!previousResult || previousResult.line !== index - 1 || yaml[1].length !== previousResult.indent + 2)
        issues.push('TAP diagnostic is not attached to a result');
      diagnostic = yaml[1]; continue;
    }
    const result = line.match(/^( *)(not ok|ok) (\d+)(?:\s.*)?$/);
    const plan = line.match(/^( *)1\.\.(\d+)\s*$/);
    if (result || plan) {
      const indent = (result ?? plan)[1].length;
      closeChildren(indent);
      if (!scopes.has(indent)) scopes.set(indent, { results: [], plans: [] });
      const scope = scopes.get(indent);
      if (result) {
        const row = { number: Number(result[3]), line: index, indent };
        previousResult = row;
        scope.results.push(row); results.push(row);
        if (/\s#\s*(?:skip|todo)\b/i.test(line)) issues.push('skipped/todo tests do not establish full coverage');
      } else scope.plans.push({ total: Number(plan[2]), line: index });
      continue;
    }
    const summary = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/);
    if (summary) {
      if (summaries.has(summary[1])) issues.push(`duplicate ${summary[1]} summary`);
      summaries.set(summary[1], { value: Number(summary[2]), line: index });
      continue;
    }
    if (/^# (?:tests|suites|pass|fail|cancelled|skipped|todo)(?:\s|$)/.test(line)) issues.push('malformed TAP summary');
    if (index && line && !/^\s*#/.test(line)) issues.push('unexpected or malformed TAP output');
  }
  if (diagnostic !== null) issues.push('unterminated TAP diagnostic');
  closeChildren(0);
  finish(0, scopes.get(0));
  const count = key => summaries.get(key)?.value ?? null;
  const total = count('tests') ?? scopes.get(0).plans[0]?.total ?? null;
  if (count('pass') === null || count('fail') === null) issues.push('missing pass/fail summary');
  if (count('fail') !== 0 || (count('cancelled') ?? 0) !== 0) issues.push('failed/cancelled tests');
  if ((count('skipped') ?? 0) !== 0 || (count('todo') ?? 0) !== 0) issues.push('skipped/todo tests do not establish full coverage');
  if (count('pass') + (count('fail') ?? 0) + (count('cancelled') ?? 0) + (count('skipped') ?? 0) + (count('todo') ?? 0) !== total
    || total !== results.length - suites || (count('suites') ?? 0) !== suites)
    issues.push('summary counts do not match observed results');
  for (const summary of summaries.values()) {
    if (!Number.isSafeInteger(summary.value) || summary.line < (results.at(-1)?.line ?? Infinity))
      issues.push('invalid or premature summary');
  }
  return { status: issues.length ? 'fail' : 'pass', total, passed: count('pass'), failed: count('fail'), issues: [...new Set(issues)] };
}
