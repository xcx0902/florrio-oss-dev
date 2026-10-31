/** Functional completion and performance budgets are separate evidence. */
export const rendererScenarios = ['moving-camera', 'visible-text-drops', 'gallery', 'death-transition'];
/** Ignore only boundary fragments; retain every complete measured step. */
export function completedSteps(requests) {
  const durations = [];
  let group = [], requestCount = 0;
  for (const request of requests) {
    if (request.func === 'step') {
      if (Number.isFinite(request.duration)) { durations.push(request.duration); requestCount++; }
      continue;
    }
    if (request.func === 'sp_server_flush') {
      if (group.some(r => r.func === 'sp_server_think') && [...group, request].every(r => Number.isFinite(r.duration))) {
        durations.push(request.at + request.duration - group[0].at);
        requestCount += group.length + 1;
      }
      group = [];
    } else group.push(request);
  }
  return { durations, requestCount, boundaryRequests: requests.length - requestCount };
}
export function rendererAcceptance(result, { frames, repeats }) {
  const expected = ['desktop', 'retina', 'touch'].flatMap(profile => rendererScenarios.map(scenario => `${profile}/${scenario}`));
  const keys = result.results.map(r => `${r.profile}/${r.scenario}`);
  const fullProfile = frames >= 600 && repeats >= 5 && keys.length === expected.length && expected.every(key => keys.includes(key));
  const completed = !result.errors.length && result.results.length > 0 && result.results.every(r =>
    r.runs.length === repeats && r.runs.every(s => s.frames === frames && s.drawFrames >= frames
      && s.totalEntities === 872 && s.cpu.length >= frames && s.intervals.length === frames));
  const primary = result.results.find(r => r.profile === 'desktop' && r.scenario === 'moving-camera');
  const budgetMet = !!primary && primary.runs.every(r => r.frameMs.p95 <= 20 && 1000 / r.frameMs.mean >= 55)
    && result.results.every(r => r.runs.every(s => s.renderCpuMs.p95 <= 8));
  return { completed, fullProfile, budgetMet, passed: completed && fullProfile && budgetMet };
}

export function integrationAcceptance(result, { frames, repeats }) {
  const completed = !result.errors.length && result.results.length > 0 && result.results.every(r => r.runs.length === repeats
    && r.runs.every(s => s.frames === frames && s.totalEntities > 0 && s.packets > 0 && s.decode.length > 0
      && s.stepRoundTripMs?.count > 0 && s.lifecycle.equipment && s.lifecycle.died && s.lifecycle.respawned));
  const fullProfile = frames >= 600 && repeats >= 5 && result.results.some(r => r.profile === 'desktop');
  const budgetMet = result.results.every(r => r.runs.every(s => s.renderCpuMs.p95 <= 8
    && s.decodeApplyMs?.p95 <= 2 && s.pendingMax <= 1
    && (s.lifecycle.pending === null || s.lifecycle.pending === 0)));
  return { completed, fullProfile, budgetMet, passed: completed && fullProfile && budgetMet };
}
