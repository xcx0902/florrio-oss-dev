/** Recovered client two-stage closure invokers returning i32 (14 originals).
 * Same two-slot adapter as the void pair invokers, but the second closure returns
 * the i32 the adapter forwards to its caller.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  2889, 2893, 2906, 2908, 2943, 2944, 2945, 4551,
  4555, 4567, 4568, 4601, 4602, 4603,
]);

const FIRST_CALL = Object.freeze({ parameters: ['i32', 'i32'], results: [] });
const SECOND_CALL = Object.freeze({ parameters: ['i32', 'i32'], results: ['i32'] });

export function createClosurePairResultInvokerHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  hooks[2889] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 58868, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58892, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2893] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 58748, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58796, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2906] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 58292, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58424, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2908] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 58148, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 58280, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2943] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 57320, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 57620, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2944] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 56996, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 57308, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[2945] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 56672, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 56984, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4551] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 37268, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 37292, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4555] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 37148, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 37196, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4567] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 36692, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 36824, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4568] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 36548, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 36680, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4601] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 35720, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 36020, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4602] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 35396, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 35708, argument);
    frames.close(frame, 32);
    return result;
  };
  hooks[4603] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 35072, frame + 16);
    const secondClosure = frame + 8;
    const result = frames.invoke(SECOND_CALL, secondClosure, 35384, argument);
    frames.close(frame, 32);
    return result;
  };
  return Object.freeze(hooks);
}
