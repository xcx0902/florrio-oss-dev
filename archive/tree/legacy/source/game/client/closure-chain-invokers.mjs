/** Recovered client multi-stage closure chains (19 originals).
 *
 * Each original materialises a series of temporary type-erased callables in one
 * stack frame and invokes them in order.  Every callable receives its own slot
 * address as the second argument, so the adapter only forwards the caller
 * argument to the stage that consumes it.  Four shapes exist:
 *
 *   48-byte, 3 stages: f(frame+32, c), f(argument, c), f(frame+8,  c)
 *   48-byte, 3 stages: f(frame+32, c), f(frame+16,  c), f(argument, c)
 *   32-byte, 4 stages: f(frame+16, c) x2, f(argument, c), f(frame+8, c)
 *   48-byte, 3 stages: f(argument, c), f(frame+24,  c), f(frame+8,  c)
 *
 * The first parameter is dead: it is overwritten by the frame pointer.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  1315, 1320, 1327, 1333, 1338, 1370, 1403, 1433,
  2318, 3360, 3366, 3372, 3379, 3383, 3415, 3448,
  3480, 3531, 3937,
]);

const STAGE_SIGNATURE = Object.freeze({ parameters: ['i32', 'i32'], results: [] });

/** id -> { frame bytes, [[slot, descriptor, argument offset or null]] } */
const plans = Object.freeze({
  1320: { frame: 48, stages: [[40, 42152, 32], [24, 42200, null], [16, 42332, 8]] },
  1333: { frame: 48, stages: [[40, 41780, 32], [24, 41876, null], [16, 42464, 8]] },
  1433: { frame: 48, stages: [[40, 38228, 32], [24, 38816, null], [16, 43736, 8]] },
  3366: { frame: 48, stages: [[40, 68432, 32], [24, 68480, null], [16, 68612, 8]] },
  3379: { frame: 48, stages: [[40, 68060, 32], [24, 68156, null], [16, 68744, 8]] },
  3480: { frame: 48, stages: [[40, 64508, 32], [24, 65096, null], [16, 70016, 8]] },
  1315: { frame: 48, stages: [[40, 42260, 32], [24, 42272, 16], [8, 42284, null]] },
  1338: { frame: 48, stages: [[40, 40988, 32], [24, 41228, 16], [8, 41468, null]] },
  3360: { frame: 48, stages: [[40, 68540, 32], [24, 68552, 16], [8, 68564, null]] },
  3383: { frame: 48, stages: [[40, 67268, 32], [24, 67508, 16], [8, 67748, null]] },
  3531: { frame: 48, stages: [[40, 61004, 32], [24, 61940, 16], [8, 62876, null]] },
  1327: { frame: 32, stages: [[24, 41900, 16], [24, 41984, 16], [24, 42068, null], [16, 42380, 8]] },
  1403: { frame: 32, stages: [[24, 38840, 16], [24, 39416, 16], [24, 39992, null], [16, 43160, 8]] },
  3372: { frame: 32, stages: [[24, 68180, 16], [24, 68264, 16], [24, 68348, null], [16, 68660, 8]] },
  3448: { frame: 32, stages: [[24, 65120, 16], [24, 65696, 16], [24, 66272, null], [16, 69440, 8]] },
  1370: { frame: 48, stages: [[40, 40976, null], [32, 42560, 24], [16, 42860, 8]] },
  2318: { frame: 48, stages: [[40, 50588, null], [32, 52172, 24], [16, 52472, 8]] },
  3415: { frame: 48, stages: [[40, 67256, null], [32, 68840, 24], [16, 69140, 8]] },
  3937: { frame: 48, stages: [[40, 77816, null], [32, 79400, 24], [16, 79700, 8]] },
});

export { plans as stagePlans };

export function createClosureChainInvokerHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  for (const [id, plan] of Object.entries(plans)) {
    hooks[id] = (_dead, argument) => {
      const frame = frames.open(plan.frame);
      for (const [slot, descriptor, argumentOffset] of plan.stages) {
        const callable = (frame + slot) >>> 0;
        const value = argumentOffset === null ? argument : (frame + argumentOffset) >>> 0;
        frames.dispatch(STAGE_SIGNATURE, callable, descriptor, value, callable);
      }
      frames.close(frame, plan.frame);
    };
  }
  return Object.freeze(hooks);
}
