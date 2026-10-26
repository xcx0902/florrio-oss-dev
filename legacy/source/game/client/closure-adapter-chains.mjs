/** Recovered client closure adapter chains (43 originals).
 *
 * These are the remaining `std::function` adapters emitted for different call
 * signatures.  Each one materialises temporary type-erased callables in a stack
 * frame and invokes them in order; every callable receives its own slot address
 * as the first argument, followed by the stage arguments.  Three signatures
 * appear:
 *
 *   $t0  (i32, i32) -> ()          callable plus one value
 *   $t1  (i32, i32, i32) -> ()     callable plus two values
 *   $t4  (i32, i32) -> i32         callable plus one value, returns a result
 *
 * A stage whose result is used returns the value of the last `$t4` stage; all
 * other stages only run for their side effects.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  1314, 2886, 2887, 2892, 2899, 2905, 2910, 2942,
  2975, 3005, 3359, 3529, 4330, 4331, 4332, 4333,
  4337, 4339, 4343, 4344, 4349, 4352, 4353, 4384,
  4388, 4415, 4416, 4446, 4548, 4549, 4554, 4560,
  4566, 4570, 4600,
]);

const SIGNATURES = Object.freeze({
  $t0: Object.freeze({ parameters: ['i32', 'i32'], results: [] }),
  $t1: Object.freeze({ parameters: ['i32', 'i32', 'i32'], results: [] }),
  $t4: Object.freeze({ parameters: ['i32', 'i32'], results: ['i32'] }),
});

/** id -> { frame, params, stages: [[slot, descriptor, signature, args]] } */
const plans = Object.freeze({
  1314: { frame: 32, params: 2, stages: [[24, 42296, '$t0', [null]], [16, 42320, '$t0', [8]]] },
  2886: { frame: 32, params: 2, stages: [[24, 58952, '$t4', [null]], [16, 58976, '$t0', [8]]] },
  2887: { frame: 48, params: 2, stages: [[40, 58916, '$t0', [32]], [24, 58928, '$t0', [16]], [8, 58940, '$t4', [null]]] },
  2892: { frame: 48, params: 2, stages: [[40, 58808, '$t0', [32]], [24, 58856, '$t4', [null]], [16, 58988, '$t0', [8]]] },
  2899: { frame: 32, params: 2, stages: [[24, 58556, '$t0', [16]], [24, 58640, '$t0', [16]], [24, 58724, '$t4', [null]], [16, 59036, '$t0', [8]]] },
  2905: { frame: 48, params: 2, stages: [[40, 58436, '$t0', [32]], [24, 58532, '$t4', [null]], [16, 59120, '$t0', [8]]] },
  2910: { frame: 48, params: 2, stages: [[40, 57644, '$t0', [32]], [24, 57884, '$t0', [16]], [8, 58124, '$t4', [null]]] },
  2942: { frame: 48, params: 2, stages: [[40, 57632, '$t4', [null]], [32, 59216, '$t0', [24]], [16, 59516, '$t0', [8]]] },
  2975: { frame: 32, params: 2, stages: [[24, 55496, '$t0', [16]], [24, 56072, '$t0', [16]], [24, 56648, '$t4', [null]], [16, 59816, '$t0', [8]]] },
  3005: { frame: 48, params: 2, stages: [[40, 54884, '$t0', [32]], [24, 55472, '$t4', [null]], [16, 60392, '$t0', [8]]] },
  3359: { frame: 32, params: 2, stages: [[24, 68576, '$t0', [null]], [16, 68600, '$t0', [8]]] },
  3529: { frame: 32, params: 2, stages: [[24, 62888, '$t0', [null]], [16, 70604, '$t0', [8]]] },
  4330: { frame: 16, params: 3, stages: [[8, 87800, '$t1', [null, 'second']]] },
  4331: { frame: 32, params: 3, stages: [[24, 87788, '$t1', [null, 'second']], [16, 87812, '$t1', [8, 'second']]] },
  4332: { frame: 48, params: 3, stages: [[40, 87752, '$t1', [32, 'second']], [24, 87764, '$t1', [16, 'second']], [8, 87776, '$t1', [null, 'second']]] },
  4333: { frame: 16, params: 3, stages: [[8, 87740, '$t1', [null, 'second']]] },
  4337: { frame: 48, params: 3, stages: [[40, 87644, '$t1', [32, 'second']], [24, 87692, '$t1', [null, 'second']], [16, 87824, '$t1', [8, 'second']]] },
  4339: { frame: 16, params: 3, stages: [[8, 87572, '$t1', [null, 'second']]] },
  4343: { frame: 32, params: 3, stages: [[24, 87392, '$t1', [16, 'second']], [24, 87476, '$t1', [16, 'second']], [24, 87560, '$t1', [null, 'second']], [16, 87872, '$t1', [8, 'second']]] },
  4344: { frame: 16, params: 3, stages: [[8, 87380, '$t1', [null, 'second']]] },
  4349: { frame: 48, params: 3, stages: [[40, 87272, '$t1', [32, 'second']], [24, 87368, '$t1', [null, 'second']], [16, 87956, '$t1', [8, 'second']]] },
  4352: { frame: 16, params: 3, stages: [[8, 86972, '$t1', [null, 'second']]] },
  4353: { frame: 48, params: 3, stages: [[40, 86480, '$t1', [32, 'second']], [24, 86720, '$t1', [16, 'second']], [8, 86960, '$t1', [null, 'second']]] },
  4384: { frame: 48, params: 3, stages: [[40, 86468, '$t1', [null, 'second']], [32, 88052, '$t1', [24, 'second']], [16, 88352, '$t1', [8, 'second']]] },
  4388: { frame: 16, params: 3, stages: [[8, 85496, '$t1', [null, 'second']]] },
  4415: { frame: 32, params: 3, stages: [[24, 84332, '$t1', [16, 'second']], [24, 84908, '$t1', [16, 'second']], [24, 85484, '$t1', [null, 'second']], [16, 88652, '$t1', [8, 'second']]] },
  4416: { frame: 16, params: 3, stages: [[8, 84320, '$t1', [null, 'second']]] },
  4446: { frame: 48, params: 3, stages: [[40, 83720, '$t1', [32, 'second']], [24, 84308, '$t1', [null, 'second']], [16, 89228, '$t1', [8, 'second']]] },
  4548: { frame: 32, params: 2, stages: [[24, 37352, '$t4', [null]], [16, 37376, '$t0', [8]]] },
  4549: { frame: 48, params: 2, stages: [[40, 37316, '$t0', [32]], [24, 37328, '$t0', [16]], [8, 37340, '$t4', [null]]] },
  4554: { frame: 48, params: 2, stages: [[40, 37208, '$t0', [32]], [24, 37256, '$t4', [null]], [16, 37388, '$t0', [8]]] },
  4560: { frame: 32, params: 2, stages: [[24, 36956, '$t0', [16]], [24, 37040, '$t0', [16]], [24, 37124, '$t4', [null]], [16, 37436, '$t0', [8]]] },
  4566: { frame: 48, params: 2, stages: [[40, 36836, '$t0', [32]], [24, 36932, '$t4', [null]], [16, 37520, '$t0', [8]]] },
  4570: { frame: 48, params: 2, stages: [[40, 36044, '$t0', [32]], [24, 36284, '$t0', [16]], [8, 36524, '$t4', [null]]] },
  4600: { frame: 48, params: 2, stages: [[40, 36032, '$t4', [null]], [32, 37616, '$t0', [24]], [16, 37916, '$t0', [8]]] },
});

export { plans as adapterPlans };

export function createClosureAdapterChainHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  function run(plan, argument, second) {
    const frame = frames.open(plan.frame);
    let result;
    for (const [slot, descriptor, signature, args] of plan.stages) {
      const callable = (frame + slot) >>> 0;
      const values = args.map(offset => (offset === null ? argument : offset === 'second' ? second : (frame + offset) >>> 0));
      const value = frames.dispatch(SIGNATURES[signature], callable, descriptor, callable, ...values);
      if (signature === '$t4') result = value;
    }
    frames.close(frame, plan.frame);
    return result;
  }
  for (const [id, plan] of Object.entries(plans)) {
    hooks[id] = plan.params === 3
      ? (_dead, argument, second) => run(plan, argument, second)
      : (_dead, argument) => run(plan, argument, 0);
  }
  return Object.freeze(hooks);
}
