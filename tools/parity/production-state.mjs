/** Read decoded production state using the same loadout rules as the UI.
 * World petals may be corpses or absent during recharge; field60 is authoritative.
 * Explicit arguments also allow regressions against the actual client helpers.
 */
export function readProductionState(florr = window.__florr, loadout = window.__productionLoadout) {
  const all = [...florr.world.all()];
  const entity = all.find(item => (item.kind ?? item.typeId) === 1);
  const player = entity ? { handle: entity.handle, x: entity.x, y: entity.y, health: entity.health,
    maxHealth: entity.maxHealth, healthKnown: entity.healthKnown, maxHealthKnown: entity.maxHealthKnown,
    level: entity.level, flags: entity.flags, receivedAt: entity.receivedAt } : null;
  const authoritativeSlots = entity ? loadout.playerLoadoutSlots(entity, 16) : undefined;
  const slots = authoritativeSlots ?? loadout.loadoutSlots(all, 16);
  return { time: performance.now(), ui: florr.ui, count: florr.world.count,
    liveMobs: all.filter(item => (item.kind ?? item.typeId) === 2 && item.health > 0).length,
    sequence: florr.world.lastSequence, serverTime: florr.world.lastServerTime, player, slots,
    slotsSource: authoritativeSlots === undefined ? 'petal-fallback' : 'player-field60',
    camera: florr.getCamera(), cameraManual: florr.camera.manual === true,
    invalidEntities: all.filter(item => ![item.x, item.y, item.angle, item.health, item.maxHealth].every(Number.isFinite)).length,
    chat: [...florr.world.chat], events: [...florr.world.lastEvents] };
}
