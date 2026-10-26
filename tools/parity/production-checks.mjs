/** Acceptance rules for production-path recordings, separate from pixel parity. */
export const productionProfiles = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false },
  { name: 'retina', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, hasTouch: false },
  { name: 'touch', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' },
];

/** Observations only: a lower decoded health value for the same live player. */
export function productionDamageChecks({ samples, summary }) {
  const previous = new Map(), damaged = new Set();
  for (const { player } of samples) {
    if (!player || player.healthKnown !== true || player.maxHealthKnown !== true
      || !Number.isFinite(player.health) || !Number.isFinite(player.maxHealth)
      || player.maxHealth <= 0) continue;
    const before = previous.get(player.handle);
    if (before !== undefined && player.health < before) damaged.add(player.handle);
    previous.set(player.handle, player.health);
  }
  return {
    healthChanged: damaged.size > 0,
    hitEventDecoded: (summary.events[11] ?? 0) > 0 && summary.hitFlashObserved > 0
      && summary.hitClockSamples?.some(sample => damaged.has(sample.handle) && sample.hitAt === sample.at
        && Number.isFinite(sample.flash) && sample.flash > 0) === true,
  };
}

/** Deterministic steering from decoded positions, without modifying game state. */
export function damageContactInput({ player, camera }, mobs, viewport, previousHandle) {
  if (!player || ![player.x, player.y, camera.x, camera.y, camera.zoom].every(Number.isFinite)
    || camera.zoom <= 0) return null;
  const candidates = mobs.filter(entity => (entity.kind ?? entity.typeId) === 2 && entity.health > 0
    && [entity.handle, entity.x, entity.y, entity.health].every(Number.isFinite));
  candidates.sort((left, right) => Math.hypot(left.x - player.x, left.y - player.y)
    - Math.hypot(right.x - player.x, right.y - player.y) || left.handle - right.handle);
  const target = candidates.find(entity => entity.handle === previousHandle) ?? candidates[0];
  if (!target) return null;
  const dx = target.x - player.x, dy = target.y - player.y, distance = Math.hypot(dx, dy);
  return { target, distance,
    mouse: { x: Math.max(32, Math.min(viewport.width - 32, viewport.width / 2 + (target.x - camera.x) * camera.zoom)),
      y: Math.max(64, Math.min(viewport.height - 180, viewport.height / 2 + (target.y - camera.y) * camera.zoom)) },
    touch: { x: distance ? dx / distance : 0, y: distance ? dy / distance : 0 } };
}

export function requiredProductionChecks(name, profile) {
  const checks = ['actualWorker', 'noFixtureInjection', 'noErrors', 'renderedAtMultipleTimes',
    'framebuffer', 'finiteState', 'productionDecode', 'snapshotTransport', 'cameraFollows', 'started', 'menu'];
  const specific = { move: ['moved'], attack: ['attackBit'],
    equip: ['equipOpcode', 'discardOpcode', 'discardStateChanged', 'equipmentStateChanged'],
    damage: ['hitEventDecoded', 'healthChanged'], death: ['deathObserved', 'menuReturnObserved', 'restartObserved', 'restartOpcode'],
    spawn: ['populated'] };
  return [...checks, ...(specific[name] ?? []), ...(profile === 'touch' ? ['mobileUi'] : []),
    ...(name === 'move' && profile === 'touch' ? ['touchMoved'] : [])];
}

function livePlayerState(state) {
  return state?.ui.started === true && state.ui.dead === false
    && Number.isSafeInteger(state.player?.handle) && state.player.handle > 0
    && Number.isFinite(state.player.health) && state.player.health > 0;
}

export function productionChecks(record) {
  const { name, summary, checkpoints, actions } = record;
  const final = checkpoints.find(item => item.label === 'scenario-final')?.state;
  const game = name !== 'boot-menu';
  const checks = {
    actualWorker: summary.workers.length === 1 && summary.workers[0].includes('server-worker.js')
      && !summary.workers[0].includes('original'),
    noFixtureInjection: summary.forbiddenCalls.length === 0,
    noErrors: record.errors.length === 0 && summary.workerErrors.length === 0
      && !checkpoints.some(item => /unavailable|error/i.test(item.state.ui.status))
      && !record.samples.some(item => /unavailable|error/i.test(item.ui.status)),
    renderedAtMultipleTimes: checkpoints.length >= 3 && new Set(checkpoints.map(item => item.canvasDigest)).size > 1,
    framebuffer: checkpoints.every(item => item.framebuffer.width === record.profile.viewport.width * record.profile.deviceScaleFactor
      && item.framebuffer.height === record.profile.viewport.height * record.profile.deviceScaleFactor),
    finiteState: checkpoints.every(item => Object.values(item.state.camera).every(Number.isFinite)
      && item.state.invalidEntities === 0),
    productionDecode: summary.applies.partial > 0 && summary.applies.full === 0,
    snapshotTransport: summary.responsePackets > 0 && summary.completedThinks > 0,
    cameraFollows: !game || (checkpoints.some(item => item.state.player)
      && checkpoints.every(item => item.state.cameraManual === false)
      && new Set(record.samples.filter(item => item.player).map(item => `${item.camera.x},${item.camera.y}`)).size > 1),
    started: !game || (summary.opcodes[6] ?? 0) > 0 && checkpoints.some(item => livePlayerState(item.state)),
    menu: game || (final !== undefined && (summary.opcodes[4] ?? 0) === 0 && (summary.opcodes[6] ?? 0) === 0
      && [...checkpoints.map(item => item.state), ...record.samples].every(state =>
        state.ui.started === false && state.ui.dead === false && state.player === null)),
  };
  if (record.profile.hasTouch) checks.mobileUi = record.environment?.mobileUiFromUserAgent === true
    && record.environment?.maxTouchPoints > 0 && record.environment?.innerWidth === record.profile.viewport.width;
  if (name === 'move') {
    checks.moved = actions.some(item => item.name === 'movement' && Number.isFinite(item.distance) && item.distance > 10);
    if (record.profile.hasTouch) checks.touchMoved = actions.some(item => item.name === 'touch-movement'
      && item.trusted === true && Number.isFinite(item.deltaY) && item.deltaY < -10
      && Number.isFinite(item.distance) && item.distance > 10);
  }
  if (name === 'attack') checks.attackBit = summary.buttons.some(buttons => (buttons & 1) !== 0);
  if (name === 'equip') {
    checks.equipOpcode = (summary.opcodes[10] ?? 0) > 0;
    checks.discardOpcode = (summary.opcodes[8] ?? 0) > 0;
    checks.discardStateChanged = actions.some(item => item.name === 'discard'
      && item.beforeSlots[item.slot] > 0 && item.afterSlots[item.slot] === 0);
    checks.equipmentStateChanged = actions.some(item => item.name === 'equip'
      && item.beforeSlots[item.source] > 0 && item.beforeSlots[item.target] === 0
      && item.afterSlots[item.source] === 0 && item.afterSlots[item.target] === item.beforeSlots[item.source]);
  }
  if (name === 'damage') {
    Object.assign(checks, productionDamageChecks(record));
  }
  if (name === 'death') {
    const deathIndex = checkpoints.findIndex(item => item.state.ui.dead === true && item.state.player === null);
    const menuIndex = checkpoints.findIndex((item, index) => index > deathIndex && item.label === 'menu-return'
      && item.state.player === null && item.state.ui.started === false && item.state.ui.dead === false);
    const before = checkpoints.slice(0, Math.max(0, deathIndex)).map(item => item.state)
      .filter(livePlayerState).at(-1) ?? record.samples.find(state => livePlayerState(state)
        && Number.isFinite(state.time) && state.time < checkpoints[deathIndex]?.state.time);
    checks.deathObserved = deathIndex >= 0;
    checks.menuReturnObserved = checks.deathObserved && menuIndex > deathIndex;
    checks.restartObserved = checks.menuReturnObserved && before !== undefined
      && actions.some(item => item.name === 'restart' && item.restored === true)
      && checkpoints.some((item, index) => index > menuIndex && item.label === 'restart-observed'
        && livePlayerState(item.state) && item.state.player.handle !== before.player.handle);
    checks.restartOpcode = (summary.opcodes[6] ?? 0) >= 2;
  }
  if (name === 'spawn') checks.populated = checkpoints.some(({ state, population }) =>
    population?.source === 'live-worker-wasm' && Number.isSafeInteger(population.count) && population.count >= 800
      && Number.isSafeInteger(population.mobs) && population.mobs > 0 && population.mobs <= population.count
      && state.player?.health > 0 && population.player === state.player.handle
      && Number.isSafeInteger(state.count) && state.count > 1 && state.count < population.count
      && Number.isSafeInteger(state.liveMobs) && state.liveMobs > 0 && state.liveMobs < state.count);
  return checks;
}
