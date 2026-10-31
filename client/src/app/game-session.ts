import { playerLoadoutSlots, loadoutSlots } from '../state/snapshot-projection.js';
import { DeathLifecycle } from '../state/death.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../state/field-types.js';
import { SnapshotDecoder, type DenseGroupPlan } from '../state/snapshot.js';
import { type EntityState } from '../state/world.js';
import type { GameApp } from '../app/game-app.js';
export type GamePhase = 'menu' | 'joining' | 'playing' | 'dying' | 'dead' | 'returning' | 'error';
export interface SessionFrameView {
  readonly menuFrame: boolean;
  readonly player: { readonly entity: EntityState; readonly kind: number } | null;
  readonly deathProgress: number;
}
export class GameSession {
  deathLifecycle: DeathLifecycle;
  densePlans: readonly DenseGroupPlan[];
  decoder: SnapshotDecoder;
  serverInitialized: boolean;
  pendingSpawn: string | undefined;
  pendingRestart: boolean;
  nextSpawnTick: number;
  spawnSentTick: number | undefined;
  phase: GamePhase = 'menu';
  generation = 0;
  private ready: Promise<void> | undefined;
  get started(): boolean { return this.phase !== 'menu' && this.phase !== 'returning'; }
  get enteredWorld(): boolean { return this.phase === 'playing' || this.phase === 'dying' || this.phase === 'dead'; }
  get dead(): boolean { return this.phase === 'dying' || this.phase === 'dead'; }
  enterJoining(): void { this.phase = 'joining'; }
  enterPlaying(): void { this.phase = 'playing'; this.status = ''; this.deathAt = undefined; }
  enterDead(now = performance.now()): void {
    if (!this.dead) this.phase = 'dying';
    this.deathAt ??= now;
  }
  enterMenu(): void { this.phase = 'menu'; }
  fail(error: unknown): void {
    this.phase = 'error';
    this.status = error instanceof Error ? error.message : String(error);
    this.app.simulation.stop();
  }
  invalidate(): void {
    this.generation++;
    this.pendingSpawn = undefined;
    this.spawnSentTick = undefined;
    this.pendingRestart = false;
  }
  deathAt: number | undefined;
  menuRespawn: {
    level: number;
    items: readonly number[];
  } | undefined;
  lastDeathMetadata: {
    killerName: string;
    keptCount: number;
    keptItems: readonly number[];
    score: number;
    deathLevel: number;
    respawnLevel: number;
  };
  lastSlots: number[];
  lastLevel: number;
  status: string;
  constructor(readonly app: GameApp) {
    this.deathLifecycle = new DeathLifecycle();
    this.densePlans = DENSE_GROUPS.map(group => ({
      offset: group.offset,
      specs: DENSE_GROUP_SPECS[group.offset] ?? [],
    }));
    this.decoder = new SnapshotDecoder(this.densePlans);
    this.serverInitialized = false;
    this.pendingRestart = false;
    this.nextSpawnTick = 0;
    this.lastDeathMetadata = { killerName: '', keptCount: 0, keptItems: [] as readonly number[], score: 0, deathLevel: 0, respawnLevel: 1 };
    this.lastSlots = [1, 1, 1, 1, 1];
    this.lastLevel = 1;
    this.status = 'Connecting…';
  }
  applyPacket = (packet: Uint8Array, at: number): boolean => {
    const snapshot = this.decoder.decode(packet);
    if (snapshot === null)
      return false;
    const player = this.localPlayer();
    if (player)
      this.app.renderer.petalTransfers.receive(snapshot.events ?? [], this.app.world, this.app.camera, at, {
        width: this.app.camera.viewportWidth, height: this.app.camera.viewportHeight,
        level: player.entity.level ?? 1, mobile: this.app.mobileUi, pixelRatio: this.app.camera.pixelRatio,
      });
    this.app.world.applyDeltaSnapshot(snapshot, at);
    this.deathLifecycle.observe(this.app.world);
    return true;
  };
  localPlayer = (): {
    entity: EntityState;
    kind: number;
  } | null => {
    const entity = this.app.world.healthyPlayer();
    return entity ? { entity, kind: entity.kind ?? entity.typeId } : null;
  };
  startGame = async (): Promise<void> => {
    if (this.started)
      return;
    this.invalidate();
    const generation = this.generation;
    this.app.renderer.menuInputAnimation.requestSpawn();
    this.enterJoining();
    this.resetForJoin();
    this.status = 'Entering the garden…';
    try {
      await this.ensureServer();
      if (this.app.disposed || generation !== this.generation)
        return;
      this.pendingSpawn = this.app.menuControls.name.value.trim();
      this.pendingRestart = false;
    }
    catch (error) {
      if (!this.app.disposed && generation === this.generation)
        this.fail(error);
    }
  };
  restartGame = async (): Promise<void> => {
    if (this.app.disposed || this.phase === 'joining')
      return;
    this.invalidate();
    this.app.renderer.menuInputAnimation.requestSpawn();
    this.enterJoining();
    this.menuRespawn = undefined;
    this.app.menuControls.setRespawn(undefined);
    this.status = 'Respawning…';
    this.pendingSpawn = this.app.menuControls.name.value.trim();
    this.pendingRestart = true;
  };
  continueToMenu = (): void => {
    this.invalidate();
    this.phase = 'returning';
    // Preserve the final death frame for the closing iris. The menu is rendered
    // underneath it and remains visible outside the shrinking circle.
    if (!this.app.transitions.exitCanvas)
      this.app.transitions.exitCanvas = document.createElement('canvas');
    this.app.transitions.exitCanvas.width = this.app.canvas.width;
    this.app.transitions.exitCanvas.height = this.app.canvas.height;
    this.app.transitions.exitCanvas.getContext('2d')?.drawImage(this.app.canvas, 0, 0);
    this.app.transitions.exitAt = performance.now();
    this.app.transitions.exitFrame = 0;
    // The menu always carries the respawn line after a death, even
    // when no petal survived ("with:" is part of the native format string).
    this.menuRespawn = { level: this.lastDeathMetadata.respawnLevel || this.lastLevel,
      items: [...this.lastDeathMetadata.keptItems] };
    this.app.menuControls.setRespawn(this.menuRespawn.items);
    this.deathAt = undefined;
    this.app.loadout.inventoryOpen = this.app.input.movementDisabled = false;
    this.app.loadout.dragSlot = this.app.loadout.dragInventorySlot = undefined;
    this.app.renderer.petalMotion.reset();
    this.app.renderer.hintExpand = 0;
    this.app.renderer.keyboardHint = 0;
    this.app.renderer.keyboardHighlightReady = false;
    this.app.renderer.keyboardHighlightAlpha = 0;
    this.app.transitions.entryAt = undefined;
    this.app.transitions.entryCanvas = undefined;
    this.app.loadout.keyboardSlot = undefined;
    this.pendingSpawn = undefined;
    this.pendingRestart = false;
    this.app.input.pointer.reset();
    this.app.input.keyboard.clearPressed();
    this.status = '';
    this.app.menuControls.show(true);
    this.app.menuControls.name.focus({ preventScroll: true });
  };
  private resetForJoin(): void {
    this.deathLifecycle.reset();
    this.app.loadout.inventoryOpen = false;
    this.app.menuControls.open(undefined);
    this.app.menuControls.show(false);
    this.app.input.pointer.reset();
    this.app.input.keyboard.clearPressed();
    this.app.renderer.hudState.reset();
    this.app.renderer.petalTransfers.reset();
    this.app.renderer.movementHelper.reset();
    this.app.renderer.helperPlayer = undefined;
    this.app.transitions.entryAt = undefined;
    this.app.transitions.entryCanvas = undefined;
    this.app.transitions.exitAt = undefined;
    this.app.transitions.exitCanvas = undefined;
    this.app.transitions.exitFrame = 0;
    this.menuRespawn = undefined;
    this.app.menuControls.setRespawn(undefined);
    this.app.renderer.hintExpand = 0;
    this.app.renderer.keyboardHint = 0;
    this.app.renderer.keyboardHighlightReady = false;
    this.app.renderer.keyboardHighlightAlpha = 0;
    this.app.loadout.dragSlot = this.app.loadout.dragInventorySlot = undefined;
    this.app.renderer.petalMotion.reset();
  }
  submit(packet: Uint8Array): void {
    const generation = this.generation;
    void this.app.server.send(packet).catch(error => {
      if (!this.app.disposed && generation === this.generation) this.fail(error);
    });
  }
  confirmHealthy(): void {
    if (this.phase !== 'error' && this.localPlayer()) this.enterPlaying();
  }
  prepareFrame(now: number, delta: number): SessionFrameView {
    // Keep the first received player in one final menu frame before entering
    // the garden; phase mutation belongs to the session, not to drawing.
    const menuFrame = !this.enteredWorld;
    const player = this.localPlayer();
    const deathProgress = this.advancePresentation(now, delta);
    if (player !== null) this.confirmHealthy();
    return { menuFrame, player, deathProgress };
  }
  rememberLoadout(slots: readonly number[], level: number): void { this.lastSlots = [...slots]; this.lastLevel = level; }
  advancePresentation(now: number, delta: number): number {
    if (this.phase === 'returning' && this.app.transitions.exitAt === undefined)
      this.enterMenu();
    this.deathLifecycle.observe(this.app.world);
    const retained = this.deathLifecycle.snapshot;
    if (this.deathLifecycle.dead && retained) {
      this.lastDeathMetadata = retained.metadata;
      this.rememberLoadout(retained.slots, retained.level);
      if (this.started && this.enteredWorld)
        this.enterDead(now);
    }
    else if (!this.dead)
      this.lastDeathMetadata = this.app.world.deathMetadata();
    const player = this.app.world.healthyPlayer();
    if (player)
      this.rememberLoadout(playerLoadoutSlots(player) ?? loadoutSlots(this.app.world.all(), 16), player.level ?? 1);
    const progress = this.deathLifecycle.advance(delta);
    if (this.phase === 'dying' && progress >= .999)
      this.phase = 'dead';
    return progress;
  }
  ensureServer = async (): Promise<void> => {
    if (this.app.disposed)
      throw new Error('Application disposed');
    this.ready ??= this.app.server.init().then(() => { if (!this.app.disposed)
      this.serverInitialized = true; }).catch(error => { this.ready = undefined; throw error; });
    await this.ready;
  };
}
