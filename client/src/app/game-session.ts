import { DeathLifecycle } from '../state/death.js';
import { SNAPSHOT_EVENT } from '../schema/protocol.js';
import { EventKind } from '../schema/multiplayer.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../state/field-types.js';
import { SnapshotDecoder, type DenseGroupPlan } from '../state/snapshot.js';
import { type EntityState } from '../state/world.js';
import type { GameApp } from '../app/game-app.js';
import type { AppliedNetworkSnapshot } from '../net/multiplayer-snapshot.js';
import { CommandKind, MessageType, ResultCode, type Welcome } from '../schema/multiplayer.js';
import type { CommandIntent } from '../net/transport.js';
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
  private spawning = false;
  private networkIdentity?: Welcome;
  get started(): boolean {
    return this.phase !== 'menu' && this.phase !== 'returning';
  }
  get enteredWorld(): boolean {
    return this.phase === 'playing' || this.phase === 'dying' || this.phase === 'dead';
  }
  get dead(): boolean {
    return this.phase === 'dying' || this.phase === 'dead';
  }
  enterJoining(): void {
    this.phase = 'joining';
  }
  enterPlaying(): void {
    this.phase = 'playing';
    this.status = '';
    this.deathAt = undefined;
  }
  enterDead(now = performance.now()): void {
    if (!this.dead) {
      this.phase = 'dying';
    }
    this.deathAt ??= now;
  }
  enterMenu(): void {
    this.phase = 'menu';
  }
  fail(error: unknown): void {
    this.phase = 'error';
    this.status = error instanceof Error ? error.message : String(error);
    if (!this.app.online) {
      this.app.simulation.stop();
    }
  }
  invalidate(): void {
    this.generation++;
    this.app.simulation.clearCommands();
    this.pendingSpawn = undefined;
    this.spawnSentTick = undefined;
    this.pendingRestart = false;
  }
  deathAt: number | undefined;
  menuRespawn:
    | {
        level: number;
        items: readonly number[];
      }
    | undefined;
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
    this.densePlans = DENSE_GROUPS.map((group) => ({
      component: group.component,
      specs: DENSE_GROUP_SPECS[group.component],
    }));
    this.decoder = new SnapshotDecoder(this.densePlans);
    this.serverInitialized = false;
    this.pendingRestart = false;
    this.nextSpawnTick = 0;
    this.lastDeathMetadata = {
      killerName: '',
      keptCount: 0,
      keptItems: [] as readonly number[],
      score: 0,
      deathLevel: 0,
      respawnLevel: 1,
    };
    this.lastSlots = [1, 1, 1, 1, 1];
    this.lastLevel = 1;
    this.status = 'Connecting…';
    if (app.online) {
      if (app.network) {
        app.world.configureNetwork(app.network.clock, app.config.prediction !== false, () =>
          app.network?.requestResync(),
        );
        app.network.onInput((input, eventAt) => app.world.prediction.input(input, eventAt));
      }
      this.status = '';
      app.transport.onControl((message) => {
        if (message.type === MessageType.Welcome) {
          this.networkIdentity = message.value;
        }
        if (
          message.type === MessageType.Leaderboard &&
          this.networkIdentity &&
          message.value.roomEpoch.every(
            (byte, index) => byte === this.networkIdentity!.roomEpoch[index],
          )
        ) {
          app.world.applyLeaderboard(message.value);
        }
      });
      app.transport.onSnapshot((event) => {
        if (event.kind === 'network' && !app.disposed) {
          this.applyNetwork(event.value);
        }
      });
      app.transport.onClose(({ state, message }) => {
        if (state !== 'connected') {
          this.status = message;
          app.world.prediction.reset();
          app.world.snapshotBuffer.reset();
        }
        if (state === 'reconnecting' || state === 'error') {
          this.spawning = false;
        }
      });
    }
  }
  private applyNetwork(value: AppliedNetworkSnapshot): void {
    const welcome = this.networkIdentity;
    if (!welcome) {
      return;
    }
    const world = this.app.world;
    const previousLife = world.selfState?.lifeEpoch;
    const hadDeath = this.dead;
    const now = performance.now();
    // Pickup transfers need the old drop position before authoritative removal.
    const pickups = value.events
      .filter(
        (event) => event.kind === EventKind.Pickup && event.actorPlayerId === welcome.playerId,
      )
      .map((event) => ({
        opcode: SNAPSHOT_EVENT.Visual,
        handle: event.target,
        index: event.slot,
      }));
    if (value.snapshot.full || previousLife !== value.snapshot.selfState.lifeEpoch) {
      this.decoder = new SnapshotDecoder(this.densePlans);
      this.app.renderer.petalMotion.reset();
      this.app.renderer.petalTransfers.reset();
      this.app.renderer.playerTransform.invalidate();
      this.app.renderer.movementHelper.reset();
      this.app.renderer.helperPlayer = undefined;
      this.app.loadout.dragSlot = undefined;
      this.app.loadout.dragInventorySlot = undefined;
      this.app.input.pointer.reset();
      this.app.input.keyboard.clearPressed();
      if (previousLife !== value.snapshot.selfState.lifeEpoch) {
        this.deathLifecycle.reset();
        this.deathAt = undefined;
      }
    } else {
      this.app.renderer.petalTransfers.receive(pickups, world, this.app.camera, now, {
        width: this.app.camera.viewportWidth,
        height: this.app.camera.viewportHeight,
        level: world.selfState?.level ?? 1,
        mobile: this.app.mobileUi,
        pixelRatio: this.app.camera.pixelRatio,
      });
    }
    world.applyNetworkSnapshot(value, welcome.playerId, now);
    this.nextSpawnTick = value.snapshot.selfState.nextSpawnTick;
    this.deathLifecycle.observe(world);
    // Delayed snapshots from the previous dead life can arrive while a spawn
    // is pending. Keep joining until the new body reaches prepareFrame so its
    // final menu pass still captures the entry transition.
    if (this.deathLifecycle.dead && this.enteredWorld) {
      if (!hadDeath) {
        this.enterPlaying();
      }
      this.enterDead(now);
    }
    if (world.healthyPlayer() && this.phase !== 'menu' && this.phase !== 'returning') {
      // Joining is confirmed by prepareFrame, which retains the last menu
      // pass and captures it before starting the entry iris.
      this.spawning = false;
      if (this.phase !== 'joining') {
        this.enterPlaying();
      }
    }
  }
  applyPacket = (packet: Uint8Array, at: number): boolean => {
    const snapshot = this.decoder.decode(packet);
    if (snapshot === null) {
      return false;
    }
    const player = this.localPlayer();
    if (player) {
      this.app.renderer.petalTransfers.receive(
        snapshot.events ?? [],
        this.app.world,
        this.app.camera,
        at,
        {
          width: this.app.camera.viewportWidth,
          height: this.app.camera.viewportHeight,
          level: player.entity.level ?? 1,
          mobile: this.app.mobileUi,
          pixelRatio: this.app.camera.pixelRatio,
        },
      );
    }
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
    if (this.started) {
      return;
    }
    this.invalidate();
    const generation = this.generation;
    this.app.renderer.menuInputAnimation.requestSpawn();
    this.enterJoining();
    this.resetForJoin();
    this.status = 'Entering the garden…';
    try {
      await this.ensureServer();
      if (this.app.disposed || generation !== this.generation) {
        return;
      }
      if (this.app.online) {
        if (this.app.world.selfState?.life === 1) {
          return;
        }
        await this.spawnNetwork();
        return;
      }
      this.pendingSpawn = this.app.menuControls.name.value.trim();
      this.pendingRestart = false;
    } catch (error) {
      if (!this.app.disposed && generation === this.generation) {
        this.fail(error);
      }
    }
  };
  restartGame = async (): Promise<void> => {
    if (this.app.disposed || this.phase === 'joining') {
      return;
    }
    this.invalidate();
    this.app.renderer.menuInputAnimation.requestSpawn();
    this.enterJoining();
    this.menuRespawn = undefined;
    this.app.menuControls.setRespawn(undefined);
    this.status = 'Respawning…';
    if (this.app.online) {
      await this.spawnNetwork();
      return;
    }
    this.pendingSpawn = this.app.menuControls.name.value.trim();
    this.pendingRestart = true;
  };
  continueToMenu = (): void => {
    this.invalidate();
    this.phase = 'returning';
    // Preserve the final death frame for the closing iris. The menu is rendered
    // underneath it and remains visible outside the shrinking circle.
    if (!this.app.transitions.exitCanvas) {
      this.app.transitions.exitCanvas = document.createElement('canvas');
    }
    this.app.transitions.exitCanvas.width = this.app.canvas.width;
    this.app.transitions.exitCanvas.height = this.app.canvas.height;
    this.app.transitions.exitCanvas.getContext('2d')?.drawImage(this.app.canvas, 0, 0);
    this.app.transitions.exitAt = performance.now();
    this.app.transitions.exitFrame = 0;
    // The menu always carries the respawn line after a death, even
    // when no petal survived ("with:" is part of the native format string).
    this.menuRespawn = {
      level: this.lastDeathMetadata.respawnLevel || this.lastLevel,
      items: [...this.lastDeathMetadata.keptItems],
    };
    this.app.menuControls.setRespawn(this.menuRespawn.items);
    this.deathAt = undefined;
    this.app.loadout.inventoryOpen = false;
    this.app.input.movementDisabled = false;
    this.app.loadout.dragSlot = undefined;
    this.app.loadout.dragInventorySlot = undefined;
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
  returnToNetworkMenu(): void {
    this.invalidate();
    this.ready = undefined;
    this.spawning = false;
    this.app.transport.leave();
    this.networkIdentity = undefined;
    this.app.world.reset();
    this.deathLifecycle.reset();
    this.app.renderer.petalTransfers.reset();
    this.app.renderer.petalMotion.reset();
    this.app.menuControls.show(true);
    this.app.menuControls.name.focus({ preventScroll: true });
    this.phase = 'menu';
    this.status = '';
    this.app.connectionStatus.style.display = 'none';
  }
  private async spawnNetwork(): Promise<void> {
    if (this.spawning) {
      return;
    }
    this.spawning = true;
    const generation = this.generation;
    try {
      const result = await this.app.transport.sendCommand({
        kind: CommandKind.Spawn,
        text: this.app.menuControls.name.value.trim() || 'Anonymous',
      });
      if (this.app.disposed || generation !== this.generation) {
        return;
      }
      if (result.code !== ResultCode.Ok) {
        this.nextSpawnTick = result.nextSpawnTick ?? this.nextSpawnTick;
        this.status =
          result.code === ResultCode.Cooldown
            ? `Respawn available in ${Math.max(0, Math.ceil((this.nextSpawnTick - (this.app.network?.serverTick ?? 0)) / 20))}s`
            : `Spawn rejected: ${ResultCode[result.code]}`;
        this.phase = this.deathLifecycle.dead ? 'dead' : 'menu';
        this.notice(this.status);
      }
    } catch (error) {
      if (!this.app.disposed && this.app.transport.state === 'connected') {
        this.status = String(error instanceof Error ? error.message : error);
        this.notice(this.status);
        this.phase = this.deathLifecycle.dead ? 'dead' : 'menu';
      }
    } finally {
      this.spawning = false;
    }
  }
  private notice(message: string): void {
    this.app.connectionStatus.textContent = message;
    this.app.connectionStatus.style.display = message ? 'block' : 'none';
  }
  submitCommand(command: CommandIntent): void {
    if (!this.app.online) {
      throw new Error('Network command used offline');
    }
    const generation = this.generation;
    void this.app.transport
      .sendCommand(command)
      .then((result) => {
        if (this.app.disposed || generation !== this.generation) {
          return;
        }
        this.notice(
          result.code === ResultCode.Ok ? '' : `Command rejected: ${ResultCode[result.code]}`,
        );
      })
      .catch((error) => {
        if (!this.app.disposed && this.app.transport.state === 'connected') {
          this.notice(error instanceof Error ? error.message : String(error));
        }
      });
  }
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
    this.app.loadout.dragSlot = undefined;
    this.app.loadout.dragInventorySlot = undefined;
    this.app.renderer.petalMotion.reset();
  }
  submit(packet: Uint8Array): void {
    this.app.simulation.enqueue(packet);
  }
  confirmHealthy(): void {
    if (this.app.online && !this.enteredWorld && this.phase !== 'joining') {
      return;
    }
    if (this.phase !== 'error' && this.localPlayer()) {
      this.enterPlaying();
    }
  }
  prepareFrame(now: number, delta: number): SessionFrameView {
    // Keep the first received player in one final menu frame before entering
    // the garden; phase mutation belongs to the session, not to drawing.
    const menuFrame = !this.enteredWorld;
    const player = this.localPlayer();
    const deathProgress = this.advancePresentation(now, delta);
    if (player !== null) {
      this.confirmHealthy();
    }
    return { menuFrame, player, deathProgress };
  }
  rememberLoadout(slots: readonly number[], level: number): void {
    this.lastSlots = [...slots];
    this.lastLevel = level;
  }
  advancePresentation(now: number, delta: number): number {
    if (this.phase === 'returning' && this.app.transitions.exitAt === undefined) {
      this.enterMenu();
    }
    this.deathLifecycle.observe(this.app.world);
    const retained = this.deathLifecycle.snapshot;
    if (this.deathLifecycle.dead && retained) {
      this.lastDeathMetadata = retained.metadata;
      this.rememberLoadout(retained.slots, retained.level);
      if (this.started && this.enteredWorld) {
        this.enterDead(now);
      }
    } else if (!this.dead) {
      this.lastDeathMetadata = this.app.world.deathMetadata();
    }
    const player = this.app.world.healthyPlayer();
    if (player) {
      this.rememberLoadout(this.app.world.playerLoadout(), player.level ?? 1);
    }
    const progress = this.deathLifecycle.advance(delta);
    if (this.phase === 'dying' && progress >= 0.999) {
      this.phase = 'dead';
    }
    return progress;
  }
  ensureServer = async (): Promise<void> => {
    if (this.app.disposed) {
      throw new Error('Application disposed');
    }
    if (this.app.online) {
      await this.app.transport.connect(this.app.menuControls.name.value.trim() || 'Anonymous');
      this.serverInitialized = true;
      return;
    }
    this.ready ??= this.app.server
      .init()
      .then(() => {
        if (!this.app.disposed) {
          this.serverInitialized = true;
        }
      })
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    await this.ready;
  };
}
