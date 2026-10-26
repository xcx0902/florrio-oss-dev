/** Recovered client single-stage closure invokers returning i32 (11 originals).
 * Each original installs one type-erased callable in a 16-byte frame, invokes it
 * with the caller argument and returns its i32 result.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  2884, 2888, 2894, 2900, 2909, 2946, 2976, 4550,
  4556, 4561, 4569,
]);

const SECOND_CALL = Object.freeze({ parameters: ['i32', 'i32'], results: ['i32'] });

export function createClosureSingleResultInvokerHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  hooks[2884] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58964, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2888] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58904, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2894] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58736, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2900] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58544, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2909] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58136, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2946] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 56660, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[2976] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 55484, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[4550] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 37304, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[4556] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 37136, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[4561] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 36944, argument);
    frames.close(frame, 16);
    return result;
  };
  hooks[4569] = (_dead, argument) => {
    const frame = frames.open(16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 36536, argument);
    frames.close(frame, 16);
    return result;
  };
  return Object.freeze(hooks);
}
