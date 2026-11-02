import { MOTION as M } from '../schema/motion.js';
import { LIMITS, type Pong } from '../schema/multiplayer.js';
interface Sample { rtt: number; offset: number; monotonicOffset: number }
/** Simulation time is separate from both wall clocks. Rebinding starts a new
 * estimate; an overloaded server's skipped wall time never becomes extra dt. */
export class NetworkClock {
  private samples: Sample[] = [];
  private offset = 0;
  private last = 0;
  private lastAt = 0;
  private displayDelay: number = M.initialDelayMs;
  private anchorAt = 0;
  private lastServerMonotonic = -1;
  private arrivalJitter = 0;
  private previousReceipt?: { at: number; tick: number };
  rttMs = 0;
  rejectedSamples = 0;
  reset(tick = 0, at = 0): void {
    this.samples = []; this.offset = tick * LIMITS.tickMs - at; this.last = tick * LIMITS.tickMs;
    this.lastAt = at; this.displayDelay = M.initialDelayMs;
    this.anchorAt = at; this.lastServerMonotonic = -1; this.arrivalJitter = 0; this.previousReceipt = undefined;
    this.rttMs = 0; this.rejectedSamples = 0;
  }
  observeSnapshot(tick: number, at: number): void {
    this.estimate(at);
    const previous = this.previousReceipt;
    if (previous && tick > previous.tick) {
      const jitter = Math.abs((at - previous.at) - (tick - previous.tick) * LIMITS.tickMs);
      this.arrivalJitter += (Math.min(M.maxDelayMs, jitter) - this.arrivalJitter) * .1;
    }
    this.previousReceipt = { tick, at };
    // Every snapshot reanchors simulation progress, including after server overload.
    const measured = tick * LIMITS.tickMs + this.rttMs * .5 - at;
    this.offset = this.samples.length ? this.offset * .8 + measured * .2 : measured;
    // The first baseline arrives before a playable network world exists.
    if (!previous) this.last = Math.max(this.last, tick * LIMITS.tickMs + this.rttMs * .5);
    this.anchorAt = at;
  }
  sample(pong: Pong, sentAt: number, receivedAt: number): boolean {
    const rtt = receivedAt - sentAt;
    if (![sentAt, receivedAt, pong.monotonicMs, pong.serverMonotonicMs, pong.serverTimeMs].every(Number.isFinite)
      || pong.monotonicMs !== sentAt || rtt < 0 || rtt > M.maxRttMs
      || pong.serverMonotonicMs < this.lastServerMonotonic
      || Math.abs(pong.serverTimeMs - pong.serverTick * LIMITS.tickMs) > LIMITS.tickMs) { this.rejectedSamples++; return false; }
    const midpoint = (sentAt + receivedAt) * .5;
    const sample = { rtt, offset: pong.serverTimeMs - midpoint, monotonicOffset: pong.serverMonotonicMs - midpoint };
    const previous = this.samples.at(-1);
    if (previous && Math.abs(sample.monotonicOffset - previous.monotonicOffset) > M.maxDelayMs + rtt) { this.rejectedSamples++; return false; }
    this.lastServerMonotonic = pong.serverMonotonicMs;
    this.estimate(receivedAt);
    this.samples.push(sample); if (this.samples.length > M.clockSamples) this.samples.shift();
    // Prefer the lower-RTT half, which is less biased by reliable-stream stalls.
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.ceil(this.samples.length / 2));
    this.rttMs = best.reduce((sum, s) => sum + s.rtt, 0) / best.length;
    this.offset = best.reduce((sum, s) => sum + s.offset, 0) / best.length;
    this.anchorAt = receivedAt;
    return true;
  }
  estimate(at: number): number {
    // Bound stalls until another authoritative receipt reanchors the estimate.
    const elapsed = Math.max(0, Math.min(at, this.anchorAt + M.maxRttMs) - this.lastAt);
    if (elapsed > 0) {
      const target = Math.min(at, this.anchorAt + M.maxRttMs) + this.offset;
      const normal = this.last + elapsed;
      // Receipts change the target offset, never the time of an already drawn
      // frame. Correct phase at at most 10% of elapsed time instead of jumping
      // forward or freezing for a quantised Pong / jittered snapshot.
      const slew = (error: number): number => Math.max(-elapsed * .1, Math.min(elapsed * .1, error));
      this.last = Math.max(this.last, Math.min(normal + slew(target - normal), target + M.maxDelayMs));
      this.displayDelay += slew(this.targetDelayMs - this.displayDelay);
    }
    this.lastAt = Math.max(this.lastAt, at);
    return this.last;
  }
  targetTick(at: number): number { return Math.min(LIMITS.counterDrainAt - 1, Math.floor(this.estimate(at) / LIMITS.tickMs)); }
  private get targetDelayMs(): number {
    const rtts = this.samples.map(s => s.rtt), spread = rtts.length ? Math.max(...rtts) - Math.min(...rtts) : 0;
    return Math.max(M.minDelayMs, Math.min(M.maxDelayMs, M.initialDelayMs + this.arrivalJitter * 2 + spread * .5));
  }
  get delayMs(): number { return this.displayDelay; }
  get sampleCount(): number { return this.samples.length; }
  get monotonicOffsetMs(): number { return this.samples.length ? this.samples.reduce((n, s) => n + s.monotonicOffset, 0) / this.samples.length : 0; }
}
