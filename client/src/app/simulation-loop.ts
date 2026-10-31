import type { GameApp } from '../app/game-app.js';
export class SimulationLoop {
  private timer: ReturnType<typeof setInterval> | undefined;
  start(): void {
    if (this.app.disposed || this.timer !== undefined) return;
    this.timer = setInterval(() => { void this.tickServer(); }, 50);
  }
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
  completedServerTicks: number;
  ticking: boolean;
  constructor(readonly app: GameApp) {
    this.completedServerTicks = 0;
    this.ticking = false;
  }
  tickServer = async (): Promise<void> => {
    if (this.app.disposed || this.app.frozen || this.ticking)
      return;
    this.ticking = true;
    let generation = this.app.session.generation;
    try {
      const player = this.app.session.localPlayer();
      const enter = this.app.input.keyboard.consumePressed('Enter');
      if (!this.app.session.started && enter) {
        await this.app.session.startGame();
      }
      else if (this.app.session.started && this.app.session.enteredWorld && player === null && enter) {
        this.app.session.continueToMenu();
      }
      // Spawn has two gates: the one-second corpse and a 2500ms
      // cooldown measured from the last successful spawn. This manual worker
      // advances exactly 50ms per completed think(), so even a stalled tab sends
      // one request at the engine's deadline. Retain it until a healthy body arrives.
      generation = this.app.session.generation;
      if (this.app.session.started && this.app.session.pendingSpawn !== undefined && this.app.session.spawnSentTick === undefined
        && this.completedServerTicks >= this.app.session.nextSpawnTick
        && ![...this.app.world.all()].some(entity => entity.kind === 1)) {
        await this.app.server.send(this.app.session.pendingRestart ? this.app.inputEncoder.restart() : this.app.inputEncoder.spawn(this.app.session.pendingSpawn));
        if (this.app.disposed || generation !== this.app.session.generation)
          return;
        this.app.session.spawnSentTick = this.completedServerTicks;
      }
      if (this.app.session.started && player !== null) {
        const { buttons, angle, strength } = this.app.input.intent();
        await this.app.server.send(this.app.inputEncoder.input(buttons, angle, strength));
      }
      if (this.app.disposed || generation !== this.app.session.generation)
        return;
      await this.app.server.think();
      if (this.app.disposed)
        return;
      this.completedServerTicks += 1;
      if (this.app.disposed || generation !== this.app.session.generation)
        return;
      await this.app.server.requestStream('sp_server_flush', undefined, packet => {
        if (this.app.disposed || generation !== this.app.session.generation)
          return;
        if (!this.app.session.applyPacket(packet, performance.now()))
          throw new Error('invalid server snapshot');
      });
      if (this.app.disposed || generation !== this.app.session.generation)
        return;
      if (this.app.session.started && this.app.session.localPlayer() !== null) {
        if (this.app.session.pendingSpawn !== undefined) {
          this.app.session.nextSpawnTick = (this.app.session.spawnSentTick ?? this.completedServerTicks) + 50;
          this.app.session.pendingSpawn = undefined;
          this.app.session.pendingRestart = false;
          this.app.session.spawnSentTick = undefined;
        }
        this.app.session.status = '';
      }
      else if (this.app.session.started) {
        this.app.session.status = 'Waiting for the garden…';
      }
    }
    catch (error) {
      if (!this.app.disposed && generation === this.app.session.generation)
        this.app.session.fail(error);
    }
    finally {
      this.ticking = false;
    }
  };
}
