import { MOTION } from '../schema/motion.js';
import type { GameApp } from './game-app.js';

/** Samples intent independently of server publication or simulated ticks. */
export class InputPump {
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new AbortController();
  private suspended = false;
  private eventTimer?: ReturnType<typeof setTimeout>;
  private eventAt?: number;
  private lastSentAt = -Infinity;
  private lastIntent = '';
  constructor(
    private readonly app: GameApp,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (!app.online) {
      return;
    }
    window.addEventListener('blur', this.neutral, { signal: this.listeners.signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.neutral();
        } else {
          this.restore();
        }
      },
      { signal: this.listeners.signal },
    );
    window.addEventListener('focus', this.restore, { signal: this.listeners.signal });
    for (const type of [
      'keydown',
      'keyup',
      'pointermove',
      'pointerdown',
      'pointerup',
      'touchmove',
      'touchend',
    ]) {
      window.addEventListener(type, this.inputEvent, {
        signal: this.listeners.signal,
        passive: true,
      });
    }
  }
  private inputEvent = (): void => {
    const at = this.now();
    queueMicrotask(() => {
      if (this.listeners.signal.aborted || this.suspended || this.app.session.phase !== 'playing') {
        return;
      }
      if (JSON.stringify(this.app.input.intent()) === this.lastIntent) {
        return;
      }
      this.eventAt ??= at;
      if (this.eventTimer === undefined) {
        this.eventTimer = setTimeout(
          () => {
            this.eventTimer = undefined;
            this.sample();
          },
          Math.max(0, Math.ceil(MOTION.inputEventMinMs - (this.now() - this.lastSentAt)) + 1),
        );
      }
    });
  };
  private neutral = (): void => {
    this.suspended = true;
    this.app.transport.sendInput({ buttons: 0, angle: 0, strength: 0 });
  };
  private restore = (): void => {
    this.suspended = false;
    this.app.network?.requestResync();
  };
  start(): void {
    if (this.timer !== undefined || this.app.disposed) {
      return;
    }
    this.timer = setInterval(this.sample, 50);
  }
  sample = (): void => {
    if (this.app.disposed || this.app.frozen) {
      return;
    }
    const session = this.app.session;
    if (this.app.input.keyboard.consumePressed('Enter')) {
      if (session.phase === 'menu') {
        void session.startGame();
      } else if (session.phase === 'error') {
        session.returnToNetworkMenu();
      } else if (session.dead) {
        session.continueToMenu();
      }
    }
    if (
      this.suspended ||
      document.hidden ||
      !session.localPlayer() ||
      session.phase !== 'playing'
    ) {
      return;
    }
    const intent = this.app.input.intent(),
      now = this.now();
    if (this.app.network && now - this.lastSentAt < MOTION.inputEventMinMs) {
      if (this.eventAt !== undefined && this.eventTimer === undefined) {
        this.eventTimer = setTimeout(
          () => {
            this.eventTimer = undefined;
            this.sample();
          },
          Math.ceil(MOTION.inputEventMinMs - (now - this.lastSentAt)) + 1,
        );
      }
      return;
    }
    if (this.app.network) {
      this.app.network.sendInput(intent, this.eventAt);
    } else {
      this.app.transport.sendInput(intent);
    }
    this.eventAt = undefined;
    this.lastSentAt = now;
    this.lastIntent = JSON.stringify(intent);
  };
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    clearTimeout(this.eventTimer);
    this.eventTimer = undefined;
    this.eventAt = undefined;
  }
  dispose(): void {
    this.stop();
    this.listeners.abort();
  }
}
