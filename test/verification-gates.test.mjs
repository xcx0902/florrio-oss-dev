import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTap } from '../tools/verification/tap.mjs';
import { compareEntities } from '../tools/parity/entity-state-diff.mjs';
import { completeCoverage, scenarioNames } from '../tools/verification-evidence.mjs';

const entity = { handle: 1, type: 1, kind: 2, x: 0, y: 1, angle: 0, radius: 10,
  health: 50, maxHealth: 100, vx: 0, vy: 0, ax: 0, ay: 0 };
const compare = (actual, original = entity) => compareEntities(new Map([[1, original]]), new Map([[1, actual]]));
test('strict entity gate rejects identity changes and every non-finite numeric field', () => {
  assert.equal(compare({ ...entity }).matched, true);
  for (const key of ['type', 'kind']) assert.equal(compare({ ...entity, [key]: 99 }).matched, false);
  for (const key of ['x', 'y', 'angle', 'radius', 'health', 'maxHealth', 'vx', 'vy', 'ax', 'ay']) {
    for (const value of [NaN, Infinity, -Infinity, undefined, '0']) {
      assert.equal(compare({ ...entity, [key]: value }).matched, false, `${key}=${value}`);
      assert.equal(compare(entity, { ...entity, [key]: value }).matched, false);
    }
  }
});
test('strict entity gate enforces handles, health, velocity and explicit ULP tolerance', () => {
  assert.equal(compareEntities(new Map(), new Map([[1, entity]])).matched, false);
  assert.equal(compareEntities(new Map([[1, entity]]), new Map()).matched, false);
  for (const key of ['health', 'maxHealth', 'vx', 'vy', 'ax', 'ay', 'angle', 'radius']) {
    assert.equal(compare({ ...entity, [key]: entity[key] + 0.01 }).matched, false, key);
  }
  assert.equal(compare({ ...entity, x: 16384.001953125 }, { ...entity, x: 16384 }).matched, true);
  assert.equal(compare({ ...entity, angle: Math.PI * 2 }).matched, true);
});
const valid = 'TAP version 13\nok 1 - example\n1..1\n# tests 1\n# pass 1\n# fail 0\n';
test('TAP parser accepts completed reports and refuses corrupt or incomplete greens', () => {
  assert.equal(parseTap(valid).status, 'pass');
  for (const text of [valid + valid, valid.replace('ok 1', 'not ok 1'),
    valid.replace('# fail 0', ''), valid.replace('1..1', '1..2'),
    valid.replace('ok 1', 'ok 2'), valid.replace('ok 1 - example', ''),
    valid.replace('# pass 1', '# pass 1\n# pass 1'), valid + 'Bail out! broken\n',
    valid.replace('# pass 1', '# pass 1\n# cancelled 1'),
    'TAP version 13\n1..0\n# pass 0\n# fail 0\n']) {
    assert.equal(parseTap(text).status, 'fail', text);
  }
});
test('coverage refuses partial, duplicate and substituted scene reports', () => {
  const rows = scenarioNames.map(name => ({ name }));
  assert.equal(completeCoverage(rows), true);
  assert.equal(completeCoverage(rows.slice(1)), false);
  assert.equal(completeCoverage([...rows.slice(1), rows[1]]), false);
  assert.equal(completeCoverage([...rows, rows[0]]), false);
});

import { compareCanvasFrames } from '../tools/parity/canvas-state-diff.mjs';
const canvas = ops => ({ frames: [{ ops }] });
test('Canvas gate checks color, alpha, line width, order, numeric arguments and save/restore', () => {
  const ops = [[0, 'save', []], [0, '=fillStyle', ['#fff']], [0, '=globalAlpha', [0.5]],
    [0, '=lineWidth', [2]], [0, 'arc', [10, 20, 5, 0, 6.28]], [0, 'restore', []]];
  assert.equal(compareCanvasFrames(canvas(ops), canvas(ops)).passed, true);
  for (const [index, arg] of [[1, '#000'], [2, 0.7], [3, 3], [4, 11]]) {
    const copy = structuredClone(ops); copy[index][2][0] = arg;
    assert.equal(compareCanvasFrames(canvas(ops), canvas(copy)).passed, false);
  }
  assert.equal(compareCanvasFrames(canvas(ops), canvas(ops.slice(1))).passed, false);
  assert.equal(compareCanvasFrames(canvas([]), canvas([])).passed, false);
  const invalid = structuredClone(ops); invalid[4][2][0] = NaN;
  assert.equal(compareCanvasFrames(canvas(invalid), canvas(invalid)).passed, false);
  const close = structuredClone(ops); close[4][2][0] += 1e-5;
  assert.equal(compareCanvasFrames(canvas(ops), canvas(close)).passed, true);
});
test('Canvas gate checks referenced Path2D content independently of recorder-local IDs', () => {
  const make = (id, x) => ({ ...canvas([[0, 'fill', [{ kind: 'path', id }]]]), paths: [{ id, ops: [['moveTo', x, 0]] }] });
  assert.equal(compareCanvasFrames(make(5, 1), make(99, 1)).passed, true);
  assert.equal(compareCanvasFrames(make(5, 1), make(99, 2)).passed, false);
});

test('Canvas gate compares earlier frames and rejects truncated three-frame recordings', () => {
  const trace = { frames: [0, 1, 2].map(index => ({ time: index * 16, ops: [[0, 'fillRect', [index, 0, 10, 10]]] })) };
  const options = { requiredFrames: 3 };
  assert.equal(compareCanvasFrames(trace, structuredClone(trace), options).passed, true);
  for (const index of [0, 1, 2]) {
    const copy = structuredClone(trace); copy.frames[index].ops[0][2][0] += 1;
    const result = compareCanvasFrames(trace, copy, options);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(issue => issue.path.startsWith(`frames[${index}]`)));
  }
  assert.equal(compareCanvasFrames(trace, { frames: trace.frames.slice(1) }, options).passed, false);
  assert.equal(compareCanvasFrames(canvas([[0, 'fillRect', [1]]]), canvas([[0, 'fillRect', [1]]]), options).passed, false);
  const missing = canvas([[0, 'fill', [{ kind: 'path', id: 1 }]]]);
  assert.equal(compareCanvasFrames(missing, missing).passed, false);
  assert.equal(compareCanvasFrames(canvas([null]), canvas([null])).passed, false);
});

import { reportStatus } from '../tools/verification/report-status.mjs';
test('ledger rejects stale versions, mixed runs, incomplete scenes and false summaries', () => {
  const evidence = { runId: 'one', source: { sha256: 'a'.repeat(64) }, client: { sha256: 'b'.repeat(64) }, oracle: { sha256: 'c'.repeat(64) } };
  const good = { evidence, passed: true, strict: true, strictPassed: true, scenarios: scenarioNames.map(name => ({ name, passed: true })) };
  const options = { runId: 'one', expectedScenes: scenarioNames, requireStrict: true };
  assert.equal(reportStatus(good, evidence, options).status, 'pass');
  assert.equal(reportStatus({ ...good, scenarios: good.scenarios.slice(1) }, evidence, options).status, 'partial');
  assert.equal(reportStatus(good, evidence, { ...options, runId: 'two' }).status, 'stale');
  assert.equal(reportStatus(good, { ...evidence, source: { sha256: 'new' } }, options).status, 'stale');
  assert.equal(reportStatus({ ...good, strictPassed: false }, evidence, options).status, 'fail');
  assert.equal(reportStatus({ ...good, strict: false }, evidence, options).status, 'fail');
  assert.equal(reportStatus({ ...good, reportOnly: true }, evidence, options).status, 'fail');
  assert.equal(reportStatus({ ...good, scenarios: good.scenarios.map((row, i) => ({ ...row, passed: i !== 0 })) }, evidence, options).status, 'fail');
  assert.equal(reportStatus(null, evidence, options).status, 'missing');
  assert.equal(reportStatus({ ...good, evidence: {} }, {}, options).status, 'stale');
  assert.equal(reportStatus(good, evidence, { ...options, runId: null }).status, 'stale');
  for (const row of [{ checks: {} }, { checks: { protocol: 'true' } }, { passed: true, match: false }]) {
    assert.equal(reportStatus({ ...good, scenarios: scenarioNames.map(name => ({ name, ...row })) }, evidence, options).status, 'fail');
  }
});

import { originalEntityIdentity } from '../tools/parity/original-entity-identity.mjs';
test('original identity adapter reads original components independently of the candidate', () => {
  const view = new DataView(new ArrayBuffer(4096));
  const entity = 100, component = 500;
  for (const [slot, type, kind] of [[200, 0, 1], [124, 12, 3], [148, 14, 2], [100, 6, 4]]) {
    new Uint8Array(view.buffer).fill(0);
    view.setUint32(entity + slot, component, true); view.setUint8(component + 8, type);
    assert.deepEqual(originalEntityIdentity(view, entity), { type, kind });
  }
  new Uint8Array(view.buffer).fill(0);
  view.setUint32(entity + 156, component, true);
  view.setUint32(entity + 236, 1000, true);
  view.setUint32(1000 + 148, 1500, true); view.setUint8(1508, 14);
  assert.deepEqual(originalEntityIdentity(view, entity), { type: 14, kind: 5 });
  new Uint8Array(view.buffer).fill(0);
  assert.deepEqual(originalEntityIdentity(view, entity), { type: -1, kind: -1 });
});

import { assessReport } from '../tools/verification/gates.mjs';
import { sameEvidence } from '../tools/verification-evidence.mjs';
import { requiredProductionChecks, productionChecks, productionProfiles, damageContactInput, productionDamageChecks } from '../tools/parity/production-checks.mjs';
const identity = { runId: 'fixture', source: { sha256: 'a'.repeat(64) }, client: { sha256: 'b'.repeat(64) }, oracle: { sha256: 'c'.repeat(64) } };
test('absent/malformed hashes can never establish a matching version', () => {
  assert.equal(sameEvidence({}, {}), false);
  assert.equal(sameEvidence({ source: {}, client: {}, oracle: {} }, { source: {}, client: {}, oracle: {} }), false);
  assert.equal(sameEvidence(identity, identity), true);
});

test('TAP rejects fabricated totals, directives, trailing junk and unfinished nested tests', () => {
  for (const text of [valid.replace('# tests 1\n# pass 1', '# tests 99\n# pass 99'),
    valid.replace('example', 'example # SKIP'), valid + 'crashed after summary\n',
    valid.replace('TAP version 13', 'TAP version 14'), valid.replace('ok 1', 'ok nope'),
    valid.replace('ok 1 - example', '    ok 1 - child\nok 1 - example'),
    valid.replace('ok 1 - example', 'ok 1 - example\n  ---\n  error: truncated')]) assert.equal(parseTap(text).status, 'fail', text);
  const suite = 'TAP version 13\n# Subtest: suite\n    ok 1 - child\n    1..1\nok 1 - suite\n  ---\n  type: \'suite\'\n  ...\n1..1\n# tests 1\n# suites 1\n# pass 1\n# fail 0\n';
  assert.equal(parseTap(suite).status, 'pass');
});

test('production ledger requires all 24 recordings on the accepted delivery hashes', () => {
  const delivery = { manifestSha256: 'd'.repeat(64), wasmSha256: 'e'.repeat(64), sha256: 'f'.repeat(64) };
  const report = { kind: 'production-integration', equivalence: false, passed: true, integrationPassed: true,
    stable: true, changedDuringRun: false, sourceMatchesDelivery: true, target: { sha256: delivery.sha256 },
    completeCoverage: true, generatedAt: new Date().toISOString(), evidence: identity, root: 'dist-next',
    rootManifestSha256: delivery.manifestSha256, rootWasmSha256: delivery.wasmSha256,
    scenarios: scenarioNames.map(name => ({ name, passed: true, profiles: ['desktop', 'retina', 'touch'].map(profile => ({
      profile, passed: true, errors: [], checks: Object.fromEntries(requiredProductionChecks(name, profile).map(key => [key, true])),
    })) })) };
  const options = { runId: identity.runId, delivery };
  assert.equal(assessReport('production', report, identity, options).status, 'pass');
  const bad = [];
  let copy = structuredClone(report); copy.scenarios[0].profiles.pop(); bad.push(copy);
  copy = structuredClone(report); copy.scenarios[0].profiles[1].profile = 'desktop'; bad.push(copy);
  copy = structuredClone(report); copy.scenarios[0].profiles[0].checks.actualWorker = false; bad.push(copy);
  copy = structuredClone(report); copy.scenarios[0].profiles[0].checks = {}; bad.push(copy);
  copy = structuredClone(report); delete copy.scenarios[2].profiles[2].checks.touchMoved; bad.push(copy);
  copy = structuredClone(report); copy.scenarios[0].profiles[0].errors = ['worker failed']; bad.push(copy);
  bad.push({ ...report, root: 'client/public' }, { ...report, rootManifestSha256: 'f'.repeat(64) }, { ...report, changedDuringRun: true },
    { ...report, stable: false }, { ...report, sourceMatchesDelivery: false }, { ...report, target: { sha256: 'a'.repeat(64) } },
    { ...report, reportOnly: true });
  for (const value of bad) assert.equal(assessReport('production', value, identity, options).passed, false);
});

test('production touch movement is an observed requirement and malformed row booleans fail closed', () => {
  const record = { name: 'move', profile: { hasTouch: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
    summary: { workers: [], forbiddenCalls: [], workerErrors: [], applies: {}, buttons: [], opcodes: {} },
    errors: [], checkpoints: [], samples: [], actions: [{ name: 'movement', distance: 40 }] };
  assert.equal(productionChecks(record).touchMoved, false);
  record.actions.push({ name: 'touch-movement', distance: Infinity });
  assert.equal(productionChecks(record).touchMoved, false);
  record.actions.push({ name: 'touch-movement', distance: 40 });
  assert.equal(productionChecks(record).touchMoved, false);
  record.actions.push({ name: 'touch-movement', distance: 40, deltaY: -35, trusted: true });
  assert.equal(productionChecks(record).touchMoved, true);
  assert.equal(productionChecks(record).mobileUi, false);
  record.environment = { mobileUiFromUserAgent: true, maxTouchPoints: 1, innerWidth: 390 };
  assert.equal(productionChecks(record).mobileUi, true);
  record.environment.innerWidth = 980;
  assert.equal(productionChecks(record).mobileUi, false);
  const touch = productionProfiles.find(profile => profile.name === 'touch');
  assert.equal(touch.isMobile, true);
  assert.match(touch.userAgent, /Android.*Mobile/);
  assert.ok(requiredProductionChecks('boot-menu', 'touch').includes('mobileUi'));
  for (const value of [true, 1, 'passed', [], { invalid: true }]) assert.equal(reportStatus(value, identity).passed, false);
  for (const checks of [[true], 'true', null]) {
    assert.equal(reportStatus({ passed: true, evidence: identity, fixtures: [{ passed: true, checks }] }, identity).passed, false);
  }
});

function productionLifecycleRecord(name = 'death') {
  const player = handle => ({ handle, health: 100, maxHealth: 100 });
  const state = (time, body, started, dead) => ({ time, player: body,
    ui: { started, dead, status: '' }, camera: { x: time, y: 0, zoom: 1 },
    cameraManual: false, invalidEntities: 0, count: body ? 12 : 0 });
  const states = [
    ['boot', state(0, null, false, false)],
    ['scenario-final', state(100, player(77), true, false)],
    ...(name === 'death' ? [
      ['death-observed', state(200, null, true, true)],
      ['menu-return', state(300, null, false, false)],
      ['restart-observed', state(400, player(88), true, false)],
    ] : []),
    ['later-animation', state(500, player(name === 'death' ? 88 : 77), true, false)],
  ];
  return { name, profile: productionProfiles.find(profile => profile.name === 'desktop'),
    summary: { workers: ['server-worker.js?manual=1'], forbiddenCalls: [], workerErrors: [],
      applies: { partial: 10, full: 0 }, responsePackets: 10, completedThinks: 10,
      buttons: [], opcodes: { 6: name === 'death' ? 2 : 1 } },
    errors: [], checkpoints: states.map(([label, state], index) => ({ label, state,
      canvasDigest: String(index), framebuffer: { width: 1280, height: 720 } })),
    samples: states.map(([, state]) => structuredClone(state)),
    actions: name === 'death' ? [{ name: 'menu-return', key: 'Enter', returned: true },
      { name: 'restart', key: 'Enter', beforeHandle: 77, afterHandle: 88, restored: true }] : [] };
}

test('production start requires opcode6 plus an actually live player, never a legacy opcode4 or UI flag', () => {
  const valid = productionLifecycleRecord('garden-idle');
  assert.ok(Object.values(productionChecks(valid)).every(value => value === true));
  const oldRestart = structuredClone(valid);
  oldRestart.summary.opcodes = { 4: 2 };
  assert.equal(productionChecks(oldRestart).started, false,
    'even a healthy player checkpoint cannot make old opcode4 count as menu Enter spawn');
  for (const body of [null, { handle: 77 }, { handle: 77, health: 0 },
    { handle: 77, health: -1 }, { handle: 77, health: NaN }, { handle: 77, health: Infinity },
    { health: 100 }, { handle: NaN, health: 100 }]) {
    const record = structuredClone(valid);
    for (const checkpoint of record.checkpoints) if (checkpoint.state.ui.started) checkpoint.state.player = body;
    assert.equal(productionChecks(record).started, false, JSON.stringify(body));
  }
  for (const ui of [{ started: false }, { dead: true }]) {
    const record = structuredClone(valid);
    for (const checkpoint of record.checkpoints) Object.assign(checkpoint.state.ui, ui);
    assert.equal(productionChecks(record).started, false, JSON.stringify(ui));
  }
});

test('production death requires an ordered menu-return checkpoint before a genuinely new live handle', () => {
  const valid = productionLifecycleRecord();
  assert.ok(Object.values(productionChecks(valid)).every(value => value === true));
  for (const profile of productionProfiles)
    assert.ok(requiredProductionChecks('death', profile.name).includes('menuReturnObserved'));

  const missingMenu = structuredClone(valid);
  missingMenu.checkpoints = missingMenu.checkpoints.filter(checkpoint => checkpoint.label !== 'menu-return');
  assert.equal(productionChecks(missingMenu).menuReturnObserved, false,
    'claimed menu/restart action booleans cannot replace the observed checkpoint');
  assert.equal(productionChecks(missingMenu).restartObserved, false);
  for (const patch of [{ player: { handle: 77, health: 0 } },
    { ui: { started: true, dead: false, status: '' } }, { ui: { started: false, dead: true, status: '' } }]) {
    const record = structuredClone(valid);
    Object.assign(record.checkpoints.find(checkpoint => checkpoint.label === 'menu-return').state, patch);
    assert.equal(productionChecks(record).menuReturnObserved, false, JSON.stringify(patch));
    assert.equal(productionChecks(record).restartObserved, false);
  }
  for (const order of [
    ['boot', 'menu-return', 'scenario-final', 'death-observed', 'restart-observed', 'later-animation'],
    ['boot', 'scenario-final', 'death-observed', 'restart-observed', 'menu-return', 'later-animation'],
  ]) {
    const record = structuredClone(valid);
    record.checkpoints.sort((left, right) => order.indexOf(left.label) - order.indexOf(right.label));
    assert.equal(productionChecks(record).restartObserved, false, 'menu and restart checkpoints must follow death in order');
  }

  const sameHandle = structuredClone(valid);
  for (const checkpoint of sameHandle.checkpoints) if (checkpoint.state.player) checkpoint.state.player.handle = 77;
  for (const sample of sameHandle.samples) if (sample.player) sample.player.handle = 77;
  assert.equal(productionChecks(sameHandle).restartObserved, false,
    'restored:true and a claimed afterHandle cannot disguise the unchanged observed player handle');
  const deadRestart = structuredClone(valid);
  deadRestart.checkpoints.find(checkpoint => checkpoint.label === 'restart-observed').state.player.health = 0;
  assert.equal(productionChecks(deadRestart).restartObserved, false,
    'a later live checkpoint cannot rescue a dead body at restart-observed');
  const noRestartAction = structuredClone(valid);
  noRestartAction.actions.find(action => action.name === 'restart').restored = false;
  assert.equal(productionChecks(noRestartAction).restartObserved, false);
});

test('production death counts two opcode6 spawns and rejects legacy opcode4 restart evidence', () => {
  const valid = productionLifecycleRecord();
  assert.equal(productionChecks(valid).restartOpcode, true);
  for (const opcodes of [{ 4: 2 }, { 4: 20, 6: 1 }, { 6: 1 }, {}]) {
    const record = structuredClone(valid);
    record.summary.opcodes = opcodes;
    assert.equal(productionChecks(record).restartOpcode, false, JSON.stringify(opcodes));
  }
  const noDeath = structuredClone(valid);
  noDeath.checkpoints = noDeath.checkpoints.filter(checkpoint => checkpoint.label !== 'death-observed');
  assert.equal(productionChecks(noDeath).deathObserved, false);
  assert.equal(productionChecks(noDeath).menuReturnObserved, false);
  assert.equal(productionChecks(noDeath).restartObserved, false);
});

test('production menu stays unstarted and alive throughout, even with world mob snapshots', () => {
  const state = { ui: { started: false, dead: false, status: '' }, player: null,
    count: 870, camera: { x: 0, y: 0 }, invalidEntities: 0 };
  const record = { name: 'boot-menu',
    profile: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    summary: { workers: [], forbiddenCalls: [], workerErrors: [], applies: {}, buttons: [], opcodes: {} },
    errors: [], checkpoints: [{ label: 'scenario-final', state,
      framebuffer: { width: 1280, height: 720 } }], samples: [structuredClone(state)], actions: [] };
  assert.equal(productionChecks(record).menu, true, 'mobs alone do not mean the player entered');
  record.samples[0].ui.dead = true;
  assert.equal(productionChecks(record).menu, false, 'a transient death cannot hide behind a valid final menu');
  record.samples[0].ui.dead = false;
  state.ui.dead = true;
  assert.equal(productionChecks(record).menu, false, 'a dead final menu is invalid');
  state.ui.dead = false;
  record.samples[0].ui.started = true;
  assert.equal(productionChecks(record).menu, false);
  record.samples[0].ui.started = false;
  record.samples[0].player = { handle: 1 };
  assert.equal(productionChecks(record).menu, false);
  record.samples[0].player = null;
  record.summary.opcodes[4] = 1;
  assert.equal(productionChecks(record).menu, false, 'a start command cannot be counted as an untouched menu');
  record.summary.opcodes[4] = 0;
  record.summary.opcodes[6] = 1;
  assert.equal(productionChecks(record).menu, false, 'opcode6 also invalidates an untouched menu without a decoded player');
  record.summary.opcodes[6] = 0;
  assert.equal(productionChecks(record).menu, true);
  record.checkpoints = [];
  assert.equal(productionChecks(record).menu, false, 'a missing final checkpoint fails closed');
});

test('production spawn observes full population in the real worker and live mobs in the peer snapshot', () => {
  const state = { ui: { started: true, dead: false, status: '' }, player: { handle: 77, health: 100 },
    count: 12, liveMobs: 6, camera: { x: 0, y: 0 }, invalidEntities: 0 };
  const checkpoint = { label: 'scenario-final', state, framebuffer: { width: 1280, height: 720 } };
  const record = { name: 'spawn', profile: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    summary: { workers: [], forbiddenCalls: [], workerErrors: [], applies: {}, buttons: [], opcodes: {} },
    errors: [], checkpoints: [checkpoint], samples: [], actions: [] };
  assert.equal(productionChecks(record).populated, false, 'a decoded count alone cannot prove world population');
  checkpoint.population = { source: 'live-worker-wasm', count: 872, mobs: 866, player: 77 };
  assert.equal(productionChecks(record).populated, true, 'the full-world budget is retained at its authoritative layer');
  for (const patch of [{ source: 'fixture' }, { count: 799 }, { count: NaN }, { mobs: 0 }, { mobs: 900 }, { player: 88 }]) {
    const before = checkpoint.population;
    checkpoint.population = { ...before, ...patch };
    assert.equal(productionChecks(record).populated, false, JSON.stringify(patch));
    checkpoint.population = before;
  }
  state.liveMobs = 0;
  assert.equal(productionChecks(record).populated, false, 'the live peer must actually receive nearby mobs');
  state.liveMobs = 6; state.count = 872;
  assert.equal(productionChecks(record).populated, false, 'broadcasting the entire world is not peer visibility');
});

test('production damage requires event 11 and its actual hit clock/flash, never event 14', () => {
  const player = { handle: 77, health: 100, maxHealth: 100, healthKnown: true, maxHealthKnown: true };
  const record = { name: 'damage', profile: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    summary: { workers: [], forbiddenCalls: [], workerErrors: [], applies: {}, buttons: [], opcodes: {},
      events: { 14: 4 }, visualEffectsObserved: 4 },
    errors: [], checkpoints: [], samples: [{ player, ui: { status: '' } },
      { player: { ...player, health: 90 }, ui: { status: '' } }], actions: [] };
  assert.equal(productionChecks(record).hitEventDecoded, false);
  record.summary.events[11] = 1;
  assert.equal(productionChecks(record).hitEventDecoded, false);
  record.summary.hitFlashObserved = 1;
  record.summary.hitClockSamples = [{ handle: 77, at: 100, hitAt: 99, flash: 1 }];
  assert.equal(productionChecks(record).hitEventDecoded, false);
  record.summary.hitClockSamples[0].hitAt = 100;
  record.summary.hitClockSamples[0].flash = NaN;
  assert.equal(productionChecks(record).hitEventDecoded, false);
  record.summary.hitClockSamples[0].flash = 1;
  assert.equal(productionChecks(record).hitEventDecoded, true);
  record.summary.hitClockSamples[0].handle = 88;
  assert.equal(productionChecks(record).hitEventDecoded, false, 'another entity flash is not a player hit');
  record.summary.hitClockSamples[0].handle = 77;
  record.samples[1].player.healthKnown = false;
  assert.equal(productionDamageChecks(record).healthChanged, false, 'unknown component defaults are not damage');
  record.samples = [{ player: { ...player, health: 90 } }, { player: { ...player, health: 90 } }];
  assert.equal(productionDamageChecks(record).healthChanged, false, 'a preexisting deficit is not an observed loss');
  record.samples[1].player.health = 80;
  assert.equal(productionDamageChecks(record).healthChanged, true);
  record.samples[1].player.handle = 88;
  assert.equal(productionDamageChecks(record).healthChanged, false, 'different player handles do not form a health delta');
});

test('damage navigation chooses a live decoded mob deterministically and only plans real input', () => {
  const state = { player: { x: 0, y: 0 }, camera: { x: 0, y: 0, zoom: 1 } };
  const mobs = [{ handle: 2, kind: 2, health: 10, x: 100, y: 0 },
    { handle: 1, kind: 2, health: 10, x: -100, y: 0 },
    { handle: 3, kind: 2, health: 0, x: 1, y: 0 },
    { handle: 4, kind: 3, health: 10, x: 1, y: 0 },
    { handle: 5, kind: 2, health: 10, x: NaN, y: 0 }];
  const before = structuredClone(mobs), viewport = { width: 1280, height: 720 };
  const input = damageContactInput(state, mobs, viewport);
  assert.equal(input.target.handle, 1);
  assert.deepEqual(input.mouse, { x: 540, y: 360 });
  assert.deepEqual(input.touch, { x: -1, y: 0 });
  assert.equal(damageContactInput(state, [...mobs].reverse(), viewport).target.handle, 1);
  assert.equal(damageContactInput(state, mobs, viewport, 2).target.handle, 2, 'retain a living target while pursuing');
  assert.deepEqual(mobs, before, 'steering must not mutate decoded state');
  assert.equal(damageContactInput({ ...state, player: null }, mobs, viewport), null);
  assert.equal(damageContactInput(state, [], viewport), null);
  assert.equal(damageContactInput({ ...state, camera: { x: 0, y: 0, zoom: 0 } }, mobs, viewport), null);
});

test('production equip requires decoded discard and an actual empty-slot transfer', () => {
  const record = { name: 'equip', profile: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    summary: { workers: [], forbiddenCalls: [], workerErrors: [], applies: {}, buttons: [], opcodes: { 8: 1, 10: 1 } },
    errors: [], checkpoints: [], samples: [], actions: [] };
  assert.equal(productionChecks(record).discardStateChanged, false);
  assert.equal(productionChecks(record).equipmentStateChanged, false);
  record.actions.push({ name: 'discard', slot: 2, beforeSlots: [1, 1, 1], afterSlots: [1, 1, 0] });
  assert.equal(productionChecks(record).discardStateChanged, true);
  record.actions.push({ name: 'equip', source: 0, target: 2, beforeSlots: [1, 1, 0], afterSlots: [1, 1, 1] });
  assert.equal(productionChecks(record).equipmentStateChanged, false);
  record.actions.at(-1).afterSlots = [0, 1, 1];
  assert.equal(productionChecks(record).equipmentStateChanged, true);
  record.samples.push({ ui: { status: 'Server error' } });
  assert.equal(productionChecks(record).noErrors, false);
});

test('TAP diagnostics cannot hide missing records or malformed summary fields', () => {
  for (const text of [valid.replace('# tests 1', '# tests banana'), valid.replace('# tests 1', '# tests 1.5'),
    valid + '  ---\n  hidden crash output\n  ...\n',
    valid.replace('ok 1 - example', 'ok 1 - example\n    ---\n    hidden\n    ...')]) {
    assert.equal(parseTap(text).status, 'fail', text);
  }
});

test('performance ledger requires observed work and all measured frame intervals', () => {
  const delivery = { manifestSha256: 'd'.repeat(64), wasmSha256: 'e'.repeat(64), sha256: 'f'.repeat(64) };
  const report = { evidence: identity, passed: true, generatedAt: new Date().toISOString(), root: 'dist-next',
    rootManifestSha256: delivery.manifestSha256, rootWasmSha256: delivery.wasmSha256,
    target: { sha256: delivery.sha256 }, stable: true, sourceMatchesDelivery: true,
    frames: 600, entities: 872, drawFrames: 600, errors: [], intervals: Array(600).fill(16),
    fps: 62.5, frameMs: { p95: 16, max: 16 } };
  const options = { runId: identity.runId, delivery };
  assert.equal(assessReport('performance', report, identity, options).passed, true);
  for (const patch of [{ entities: 0 }, { drawFrames: 599 }, { errors: ['failed'] }, { intervals: [] },
    { intervals: [...Array(599).fill(16), 51] }, { frameMs: { p95: -1, max: 16 } },
    { intervals: Array(600).fill(25) }, { fps: 100 },
    { sourceMatchesDelivery: false }, { target: { sha256: 'a'.repeat(64) } }]) {
    assert.equal(assessReport('performance', { ...report, ...patch }, identity, options).passed, false);
  }
});

test('original-engine gate requires real gameplay, lifecycle and accepted wasm identity', () => {
  const delivery = { wasmSha256: 'a'.repeat(64) };
  const report = { evidence: identity, generatedAt: new Date().toISOString(), passed: true,
    kind: 'original-client-integration', equivalence: false, engineRoot: 'dist-next', engineWasmSha256: delivery.wasmSha256,
    scenarios: scenarioNames.map(name => ({ name, passed: true,
      checks: Object.fromEntries(requiredOriginalClientChecks(name).map(key => [key, true])), probe: { found: true } })) };
  const options = { runId: identity.runId, delivery };
  assert.equal(assessReport('originalEngine', report, identity, options).passed, true);
  for (const row of report.scenarios) for (const key of requiredOriginalClientChecks(row.name)) {
    const copy = structuredClone(report); delete copy.scenarios.find(x => x.name === row.name).checks[key];
    assert.equal(assessReport('originalEngine', copy, identity, options).passed, false, `${row.name}/${key}`);
  }
  for (const probe of [undefined, {}, { found: false }, { found: 'true' }]) {
    const copy = structuredClone(report); copy.scenarios[0].probe = probe;
    assert.equal(assessReport('originalEngine', copy, identity, options).passed, false);
  }
  for (const patch of [{ reportOnly: true }, { kind: undefined }, { engineRoot: 'client/public' }, { engineWasmSha256: 'b'.repeat(64) }])
    assert.equal(assessReport('originalEngine', { ...report, ...patch }, identity, options).passed, false);
});

test('ledger enforces signed pixel/command budgets independently of producer booleans', () => {
  const base = { evidence: identity, generatedAt: new Date().toISOString(), passed: true };
  const visual = { ...base, thresholds: { maxRatio: 0.001, maxDelta: 8 }, scenarios: scenarioNames.map(name => ({ name, passed: true, ratio: 0, max: 0 })) };
  const options = { runId: identity.runId };
  assert.equal(assessReport('visual', visual, identity, options).passed, true);
  assert.equal(assessReport('visual', { ...visual, thresholds: { maxRatio: 0.1, maxDelta: 255 } }, identity, options).passed, false);
  const commands = { ...base, strict: true, tolerance: 1e-4, scenarios: scenarioNames.map(name => ({ name, passed: true,
    issueCount: 0, expectedFrames: 3, actualFrames: 3, comparedFrames: 3 })) };
  assert.equal(assessReport('renderCommands', commands, identity, options).passed, true);
  assert.equal(assessReport('renderCommands', { ...commands, tolerance: 0.01 }, identity, options).passed, false);
  assert.equal(assessReport('renderCommands', { ...commands, scenarios: commands.scenarios.slice(1) }, identity, options).passed, false);
  const truncated = structuredClone(commands); truncated.scenarios[0].comparedFrames = 1;
  assert.equal(assessReport('renderCommands', truncated, identity, options).passed, false);
  assert.equal(assessReport('hornet', { ...base, fixtures: [] }, identity, options).passed, false);
});

test('Hornet gate requires every current range, invalidation and cooldown boundary fixture', () => {
  const names = ['callback-facing-0', 'callback-facing-1.5707963267948966',
    'callback-facing-3.141592653589793', 'callback-facing-2.150125503540039',
    'gate-in-range', 'gate-retained-at-range', 'gate-retained-out-of-range',
    'gate-target-invalidated', 'gate-no-target', 'gate-cooldown',
    'gate-cooldown-one-ms-left', 'gate-cooldown-exact-expiry', 'lifetime', 'hit'];
  const report = { evidence: identity, generatedAt: new Date().toISOString(), passed: true,
    fixtures: names.map(name => ({ name, passed: true, checks: { compared: true } })) };
  const assess = value => assessReport('hornet', value, identity, { runId: identity.runId });
  assert.equal(assess(report).passed, true);
  for (const name of names) {
    assert.equal(assess({ ...report, fixtures: report.fixtures.filter(row => row.name !== name) }).passed, false, name);
    const failed = structuredClone(report);
    failed.fixtures.find(row => row.name === name).checks.compared = false;
    assert.equal(assess(failed).passed, false, name);
  }
  assert.equal(assess({ ...report, fixtures: [...report.fixtures, report.fixtures[0]] }).passed, false);
});

import { requiredOriginalClientChecks } from '../tools/parity/original-client-checks.mjs';
