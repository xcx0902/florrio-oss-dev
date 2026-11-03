import { MOTION as M } from '../schema/motion.js';
import { LIMITS, type Input, type Snapshot } from '../schema/multiplayer.js';
import { stepMotion, type MotionState, type MotionIntent } from './player-motion.js';
import type { NetworkClock } from './network-clock.js';
interface Pending {
  input: Input;
  eventAt?: number;
}
export class LocalPrediction {
  enabled = true;
  private history: Pending[] = [];
  private authority?: Snapshot;
  private offset = { x: 0, y: 0, at: 0 };
  private blocked = false;
  private outsideAt?: number;
  private eventAt?: number;
  private lastPresented?: { x: number; y: number };
  private revision = 0;
  private cache?: { now: number; revision: number; enabled: boolean; state: MotionState };
  readonly metrics = {
    corrections: 0,
    snaps: 0,
    resyncs: 0,
    error: 0,
    maxError: 0,
    correctionDistance: 0,
    replayDepth: 0,
    frameMs: 0,
    maxFrameMs: 0,
    responses: [] as number[],
  };
  constructor(private readonly resync: () => void = () => {}) {}
  reset(): void {
    this.revision++;
    this.cache = undefined;
    this.history = [];
    this.authority = undefined;
    this.offset = { x: 0, y: 0, at: 0 };
    this.blocked = false;
    this.outsideAt = undefined;
    this.eventAt = undefined;
    this.lastPresented = undefined;
  }
  input(input: Input, eventAt?: number): void {
    if (
      !this.enabled ||
      this.blocked ||
      !this.authority ||
      input.lifeEpoch !== this.authority.selfState.lifeEpoch
    ) {
      return;
    }
    if (this.history.length >= M.historyLimit) {
      this.stop();
      return;
    }
    this.revision++;
    this.history.push({ input, eventAt });
    if (eventAt !== undefined) {
      this.eventAt ??= eventAt;
    }
  }
  private stop(): void {
    if (this.blocked) {
      return;
    }
    this.revision++;
    this.cache = undefined;
    this.metrics.replayDepth = 0;
    this.blocked = true;
    this.history = [];
    this.offset = { x: 0, y: 0, at: 0 };
    this.metrics.resyncs++;
    this.resync();
  }
  reconcile(snapshot: Snapshot, now: number, clock: NetworkClock): void {
    const old = this.authority;
    const changed =
      !old ||
      snapshot.full ||
      old.controlledHandle !== snapshot.controlledHandle ||
      old.selfState.lifeEpoch !== snapshot.selfState.lifeEpoch ||
      snapshot.selfState.life !== 1 ||
      !snapshot.controlledHandle;
    const before = changed ? undefined : this.display(now, clock);
    if (changed) {
      this.reset();
    }
    this.revision++;
    this.authority = snapshot;
    this.history = this.history.filter(
      ({ input }) =>
        input.inputSeq > snapshot.lastAppliedInputSeq &&
        input.lifeEpoch === snapshot.selfState.lifeEpoch,
    );
    if (!this.enabled || !before || changed) {
      return;
    }
    const after = this.logical(now, clock);
    const dx = before.x - after.x,
      dy = before.y - after.y,
      error = Math.hypot(dx, dy);
    this.metrics.error = error;
    this.metrics.maxError = Math.max(this.metrics.maxError, error);
    if (error > 0.001) {
      this.metrics.corrections++;
      this.metrics.correctionDistance += error;
    }
    if (error > snapshot.selfState.radius) {
      this.history = [];
      this.revision++;
      this.cache = undefined;
      this.offset = { x: 0, y: 0, at: now };
      this.metrics.snaps++;
    } else {
      this.offset = { x: dx, y: dy, at: now };
    }
  }
  private logical(now: number, clock: NetworkClock): MotionState {
    const s = this.authority!,
      self = s.selfState;
    let state = { x: self.positionX, y: self.positionY, vx: self.velocityX, vy: self.velocityY };
    if (!this.enabled || this.blocked || self.life !== 1 || !s.controlledHandle) {
      return state;
    }
    const desired = Math.max(s.serverTick, clock.estimate(now) / LIMITS.tickMs);
    if (desired - s.serverTick > M.replayTicks) {
      this.outsideAt ??= now;
      if (now - this.outsideAt > M.resyncAfterMs) {
        this.stop();
        return state;
      }
    } else {
      this.outsideAt = undefined;
    }
    const end = Math.min(Math.ceil(desired), s.serverTick + M.replayTicks);
    let input: MotionIntent = { angle: self.angle, strength: self.strength, buttons: self.buttons },
      expires = self.inputExpiresTick;
    // Coalescing and a reused seq each advance time once, never once per packet.
    const timeline = new Map<number, Input>();
    for (const pending of this.history) {
      const phase = Math.max(s.serverTick, pending.input.targetTick);
      const previous = timeline.get(phase);
      if (!previous || pending.input.inputSeq > previous.inputSeq) {
        timeline.set(phase, pending.input);
      }
    }
    for (let phase = s.serverTick; phase < end; phase++) {
      const next = timeline.get(phase);
      if (next) {
        input = next;
        expires = phase + LIMITS.inputTtlTicks;
      }
      if (phase >= expires) {
        input = { angle: 0, strength: 0, buttons: 0 };
      }
      const previous = state;
      state = stepMotion(state, input, self);
      // Physics always advances by a full tick. Only its presentation blends
      // the neighbouring states, so the body and camera move on every frame.
      if (phase + 1 > desired) {
        const t = desired - phase;
        state = {
          x: previous.x + (state.x - previous.x) * t,
          y: previous.y + (state.y - previous.y) * t,
          vx: previous.vx + (state.vx - previous.vx) * t,
          vy: previous.vy + (state.vy - previous.vy) * t,
        };
      }
    }
    this.metrics.replayDepth = end - s.serverTick;
    return state;
  }
  display(now: number, clock: NetworkClock): MotionState | undefined {
    if (!this.authority) {
      return;
    }
    if (
      this.cache?.now === now &&
      this.cache.revision === this.revision &&
      this.cache.enabled === this.enabled
    ) {
      return this.cache.state;
    }
    const started = performance.now(),
      state = this.logical(now, clock);
    const t = Math.max(0, 1 - (now - this.offset.at) / M.correctionMs);
    const result = { ...state, x: state.x + this.offset.x * t, y: state.y + this.offset.y * t };
    this.metrics.frameMs = performance.now() - started;
    this.metrics.maxFrameMs = Math.max(this.metrics.maxFrameMs, this.metrics.frameMs);
    this.cache = { now, revision: this.revision, enabled: this.enabled, state: result };
    return result;
  }
  /** Called only after the actual render pass, using the drawn body position. */
  presented(now: number, position: { x: number; y: number }): void {
    if (
      this.eventAt !== undefined &&
      this.lastPresented &&
      Math.hypot(position.x - this.lastPresented.x, position.y - this.lastPresented.y) > 0.001
    ) {
      this.metrics.responses.push(Math.max(0, now - this.eventAt));
      if (this.metrics.responses.length > M.historyLimit) {
        this.metrics.responses.shift();
      }
      this.eventAt = undefined;
    }
    this.lastPresented = { ...position };
  }
  get depth(): number {
    return this.history.length;
  }
  get suspended(): boolean {
    return this.blocked;
  }
  get active(): boolean {
    return (
      this.enabled &&
      !this.blocked &&
      this.authority?.selfState.life === 1 &&
      !!this.authority?.controlledHandle
    );
  }
}
