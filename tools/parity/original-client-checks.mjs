export const requiredOriginalClientChecks = name => [
  'clientProbe', 'noConsoleErrors', 'noWorkerErrors', 'dataPackets', 'packetDecodes',
  'entities', 'inputSent', 'worldEntities', 'playerPresent', 'worldMetadata', 'localController', 'validBindings', 'gameRendered', 'menu',
  ...(name === 'death' ? ['lifecycleMovement', 'lifecycleAttack', 'lifecycleDefend',
    'deathObserved', 'restartObserved', 'sequenceBoundary'] : []),
];

export function originalClientChecks(record) {
  const { scenario, samples, lifecycle, worker, decode, probe, consoleErrors, canvas } = record;
  const game = scenario !== 'boot-menu';
  const alive = sample => sample?.worldReady === true && sample.controllerCount === 1
    && sample.controlledBodyValid === true && sample.controlLinkValid === true && sample.player?.health > 0
    && [sample.player.x, sample.player.y, sample.player.health, sample.player.maxHealth].every(Number.isFinite);
  const checks = {
    clientProbe: probe.found === true,
    noConsoleErrors: consoleErrors.length === 0,
    noWorkerErrors: worker.errors.length === 0,
    dataPackets: worker.dataPackets > 0,
    packetDecodes: decode.ok === true && samples.some(sample => sample.sequence >= decode.sequence),
    entities: samples.some(sample => sample.activeCount >= 2),
    inputSent: !game || (worker.sent.sp_server_send ?? 0) > 1,
    worldEntities: samples.every(sample => Number.isSafeInteger(sample.activeCount) && sample.activeCount >= 2),
    playerPresent: !game || samples.some(alive),
    worldMetadata: samples.every(sample => sample.worldReady && sample.arenaWidth === 50000 && sample.arenaHeight === 4000),
    localController: samples.every(sample => sample.controllerCount === 1 && sample.controller?.scale > 0),
    validBindings: samples.every(sample => ['bound', 'unbound'].includes(sample.binding)),
    gameRendered: !game || alive(canvas.gamePaint?.state) && canvas.gamePaint.state.mainWorldAlpha >= 0.0001
      && Number.isSafeInteger(canvas.gamePaint.frame) && canvas.gamePaint.frame >= 0
      && Number.isFinite(canvas.gamePaint.time) && canvas.gamePaint.time >= 0
      && canvas.gamePaint.stateFrame === canvas.gamePaint.frame && canvas.gamePaint.stateTime === canvas.gamePaint.time
      && canvas.gamePaint.ops > 0 && canvas.gamePaint.paintOps > 0 && typeof canvas.gamePaint.digest === 'string',
    menu: game || samples.every(sample => sample.binding === 'unbound' && sample.player === null
      && Number.isFinite(sample.mainWorldAlpha) && sample.mainWorldAlpha < 0.0001),
  };
  if (scenario === 'death') {
    const { beforeMove, afterMove, attacking, defending, beforeDeath, corpse, dead, restarted } = lifecycle ?? {};
    checks.lifecycleMovement = alive(beforeMove) && alive(afterMove)
      && Math.hypot(afterMove.player.x - beforeMove.player.x, afterMove.player.y - beforeMove.player.y) > 10;
    checks.lifecycleAttack = alive(attacking) && (attacking.inputButtons & 1) !== 0
      && Number.isFinite(afterMove?.player?.petalDistance) && Number.isFinite(attacking.player.petalDistance)
      && attacking.player.petalDistance > afterMove.player.petalDistance + 10;
    checks.lifecycleDefend = alive(defending) && (defending.inputButtons & 2) !== 0
      && Number.isFinite(afterMove?.player?.petalDistance) && Number.isFinite(defending.player.petalDistance)
      && defending.player.petalDistance < afterMove.player.petalDistance - 10;
    checks.deathObserved = alive(beforeDeath) && corpse?.player?.handle === beforeDeath.player.handle
      && Number.isFinite(corpse.player.health) && corpse.player.health <= 0 && (corpse.player.visualFlags & 1) !== 0
      && dead?.worldReady === true && dead.binding === 'unbound' && dead.controllerCount === 1 && dead.player === null;
    checks.restartObserved = alive(restarted) && beforeDeath?.player?.handle !== restarted.player.handle;
    checks.sequenceBoundary = samples.some(sample => Number.isSafeInteger(sample.sequence) && sample.sequence >= 128);
  }
  return checks;
}
