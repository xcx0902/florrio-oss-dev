/** Recovered client two-stage closure invokers (16 originals).
 * Each original materialises two temporary type-erased callables in a 32-byte
 * frame and invokes them in order: the first receives a scratch slot, the second
 * receives the caller argument. The first parameter is dead (overwritten by the
 * frame pointer).
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  1317, 1321, 1334, 1336, 1371, 1372, 1373, 3362,
  3367, 3380, 3381, 3416, 3417, 3418, 3481, 3482,
]);

const FIRST_CALL = Object.freeze({ parameters: ['i32', 'i32'], results: [] });
const SECOND_CALL = Object.freeze({ parameters: ['i32', 'i32'], results: [] });

export function createClosurePairInvokerHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  hooks[1317] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 42212, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 42236, argument);
    frames.close(frame, 32);
  };
  hooks[1321] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 42092, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 42140, argument);
    frames.close(frame, 32);
  };
  hooks[1334] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 41636, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 41768, argument);
    frames.close(frame, 32);
  };
  hooks[1336] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 41492, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 41624, argument);
    frames.close(frame, 32);
  };
  hooks[1371] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 40664, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 40964, argument);
    frames.close(frame, 32);
  };
  hooks[1372] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 40340, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 40652, argument);
    frames.close(frame, 32);
  };
  hooks[1373] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 40016, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 40328, argument);
    frames.close(frame, 32);
  };
  hooks[3362] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 68492, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 68516, argument);
    frames.close(frame, 32);
  };
  hooks[3367] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 68372, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 68420, argument);
    frames.close(frame, 32);
  };
  hooks[3380] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 67916, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 68048, argument);
    frames.close(frame, 32);
  };
  hooks[3381] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 67772, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 67904, argument);
    frames.close(frame, 32);
  };
  hooks[3416] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 66944, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 67244, argument);
    frames.close(frame, 32);
  };
  hooks[3417] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 66620, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 66932, argument);
    frames.close(frame, 32);
  };
  hooks[3418] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 66296, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 66608, argument);
    frames.close(frame, 32);
  };
  hooks[3481] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 63704, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 64496, argument);
    frames.close(frame, 32);
  };
  hooks[3482] = (_dead, argument) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 62900, frame + 16);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 63692, argument);
    frames.close(frame, 32);
  };
  return Object.freeze(hooks);
}
