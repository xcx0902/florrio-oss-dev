import { sameEvidence, completeCoverage } from '../verification-evidence.mjs';

export function rowPassed(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const explicit = ['passed', 'match'].filter(key => key in row);
  if (explicit.some(key => row[key] !== true)) return false;
  const state = ['countMatch', 'handleMatch', 'entityMatch', 'playerMatch'];
  const statePresent = state.some(key => key in row);
  if (statePresent && !state.every(key => row[key] === true)) return false;
  if (row.checks !== undefined) {
    if (!row.checks || typeof row.checks !== 'object' || Array.isArray(row.checks)) return false;
    const checks = Object.values(row.checks ?? {});
    return checks.length > 0 && checks.every(check => check === true);
  }
  return explicit.length > 0 || statePresent;
}

export function reportStatus(value, current, { runId = current?.runId, expectedScenes = null, requireStrict = false } = {}) {
  if (value === null || value === undefined) return { status: 'missing', passed: false, coverage: false };
  if (typeof value !== 'object' || Array.isArray(value) || value.invalid === true)
    return { status: 'fail', passed: false, coverage: false };
  const coverage = expectedScenes === null || completeCoverage(value.scenarios, expectedScenes);
  if (!coverage) return { status: 'partial', passed: false, coverage };
  const fresh = typeof runId === 'string' && runId.length > 0
    && sameEvidence(value.evidence, current) && value.evidence?.runId === runId;
  if (!fresh) return { status: 'stale', passed: false, coverage };
  const rows = value.scenarios ?? value.fixtures;
  const rowsPass = rows === undefined || (Array.isArray(rows) && rows.length > 0 && rows.every(rowPassed));
  const passed = value.passed === true && rowsPass && value.reportOnly !== true
    && (!requireStrict || (value.strict === true && value.strictPassed !== false))
    && (!('strictPassed' in value) || value.strictPassed === true);
  return { status: passed ? 'pass' : 'fail', passed, coverage };
}
