/** Recovered client two-argument closure invokers (9 originals).
 * Each original materialises two type-erased callables in a 32-byte frame; the
 * first receives a scratch slot and the second argument, the second receives the
 * first and second arguments.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

import { createClosureFrames } from '../../runtime/closure-frames.mjs';

export const functionIds = Object.freeze([
  4334, 4338, 4350, 4351, 4385, 4386, 4387, 4447,
  4448,
]);

const FIRST_CALL = Object.freeze({ parameters: ['i32', 'i32', 'i32'], results: [] });
const SECOND_CALL = Object.freeze({ parameters: ['i32', 'i32', 'i32'], results: [] });

export function createClosureTwoArgumentInvokerHooks(runtime) {
  const frames = createClosureFrames(runtime);
  const hooks = {};
  hooks[4334] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 87704, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 87728, argument, second);
    frames.close(frame, 32);
  };
  hooks[4338] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 87584, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 87632, argument, second);
    frames.close(frame, 32);
  };
  hooks[4350] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 87128, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 87260, argument, second);
    frames.close(frame, 32);
  };
  hooks[4351] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 86984, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 87116, argument, second);
    frames.close(frame, 32);
  };
  hooks[4385] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 86156, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 86456, argument, second);
    frames.close(frame, 32);
  };
  hooks[4386] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 85832, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 86144, argument, second);
    frames.close(frame, 32);
  };
  hooks[4387] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 85508, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 85820, argument, second);
    frames.close(frame, 32);
  };
  hooks[4447] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 82916, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 83708, argument, second);
    frames.close(frame, 32);
  };
  hooks[4448] = (_dead, argument, second) => {
    const frame = frames.open(32);
    const firstClosure = frame + 24;
    frames.invoke(FIRST_CALL, firstClosure, 82112, frame + 16, second);
    const secondClosure = frame + 8;
    frames.invoke(SECOND_CALL, secondClosure, 82904, argument, second);
    frames.close(frame, 32);
  };
  return Object.freeze(hooks);
}
