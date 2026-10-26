/**
 * A small deterministic clock for parity replays.
 *
 * Playwright's clock still lets a few milliseconds of wall time leak into
 * `performance.now()` during navigation, which is enough to move animated
 * transforms by a fraction of a pixel. This module replaces the page's timers,
 * rAF and time sources with a virtual timeline that only moves when the driver
 * calls `__virtualClock.advance(ms)`.
 *
 * Frame cadence is fixed at 16 ms; timer callbacks run in (due time, id) order.
 * Microtasks are flushed between callbacks so promise continuations observe the
 * same virtual time they would in a browser event loop.
 */
export function installVirtualClock(options = {}) {
  const epoch = options.epoch ?? Date.UTC(2024, 0, 1, 0, 0, 0);
  const frameMs = options.frameMs ?? 16;
  const NativeDate = Date;
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  class VirtualDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) super(epoch + now);
      else super(...args);
    }
    static now() { return epoch + now; }
  }
  VirtualDate.parse = NativeDate.parse;
  VirtualDate.UTC = NativeDate.UTC;
  window.Date = VirtualDate;

  try {
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  } catch { performance.now = () => now; }
  try {
    Object.defineProperty(performance, 'timeOrigin', { configurable: true, value: epoch });
  } catch { /* read-only in some engines */ }

  function schedule(fn, delay, interval, args, raf) {
    const id = nextId++;
    const at = raf ? Math.ceil((now + 1) / frameMs) * frameMs : now + Math.max(0, delay);
    timers.set(id, { id, at, fn, args, interval, raf });
    return id;
  }
  function cancel(id) { timers.delete(id); }

  window.setTimeout = (fn, delay = 0, ...args) => schedule(fn, Number(delay) || 0, 0, args, false);
  window.setInterval = (fn, delay = 0, ...args) => schedule(fn, Number(delay) || 0, Math.max(1, Number(delay) || 1), args, false);
  window.clearTimeout = cancel;
  window.clearInterval = cancel;
  window.requestAnimationFrame = fn => schedule(fn, 0, 0, [], true);
  window.cancelAnimationFrame = cancel;

  function nextDue(limit) {
    let best = null;
    for (const timer of timers.values()) {
      if (timer.at > limit) continue;
      if (!best || timer.at < best.at || (timer.at === best.at && timer.raf && !best.raf) || (timer.at === best.at && timer.raf === best.raf && timer.id < best.id)) best = timer;
    }
    return best;
  }

  const clock = {
    get now() { return now; },
    get epoch() { return epoch; },
    get frameMs() { return frameMs; },
    get pending() { return timers.size; },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const timer = nextDue(target);
        if (!timer) break;
        now = timer.at;
        if (timer.interval) timer.at = now + timer.interval;
        else timers.delete(timer.id);
        try {
          if (timer.raf) timer.fn(now);
          else timer.fn(...timer.args);
        } catch (error) {
          console.error('[virtual-clock]', error);
        }
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
      return now;
    },
    async runFrames(count) {
      for (let i = 0; i < count; i++) await clock.advance(frameMs);
      return now;
    },
    reset() { now = 0; timers.clear(); },
  };
  Object.defineProperty(window, '__virtualClock', { configurable: true, value: clock });
  // Keep one real timer available for tooling that must escape the virtual timeline.
  Object.defineProperty(window, '__realSetTimeout', { configurable: true, value: nativeSetTimeout });
  Object.defineProperty(window, '__realClearTimeout', { configurable: true, value: nativeClearTimeout });
  return clock;
}
