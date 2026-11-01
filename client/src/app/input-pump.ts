import type { GameApp } from './game-app.js';

/** Samples intent independently of server publication or simulated ticks. */
export class InputPump {
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new AbortController();
  private suspended = false;
  constructor(private readonly app: GameApp) {
    if (!app.online) return;
    window.addEventListener('blur', this.neutral, { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.neutral(); else this.restore();
    }, { signal: this.listeners.signal });
    window.addEventListener('focus', this.restore, { signal: this.listeners.signal });
  }
  private neutral = (): void => {
    this.suspended = true;
    this.app.transport.sendInput({ buttons: 0, angle: 0, strength: 0 });
  };
  private restore = (): void => {
    this.suspended = false;
    this.app.network?.requestResync();
  };
  start(): void {
    if (this.timer !== undefined || this.app.disposed) return;
    this.timer = setInterval(this.sample, 50);
  }
  sample = (): void => {
    if (this.app.disposed || this.app.frozen) return;
    const session = this.app.session;
    if (this.app.input.keyboard.consumePressed('Enter')) {
      if (session.phase === 'menu') void session.startGame();
      else if (session.phase === 'error') session.returnToNetworkMenu();
      else if (session.dead) session.continueToMenu();
    }
    if (this.suspended || document.hidden || !session.localPlayer() || session.phase !== 'playing') return;
    this.app.transport.sendInput(this.app.input.intent());
  };
  stop(): void { clearInterval(this.timer); this.timer = undefined; }
  dispose(): void { this.stop(); this.listeners.abort(); }
}
