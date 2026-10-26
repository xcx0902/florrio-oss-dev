/** Recovered server entry point and packet-output queue, on the live game path. */
import { main, flushServerOutput } from '../../semantic/server-behavior.mjs';
export const functionIds = [289, 657];
export function createServerOutputHooks(runtime) {
  return {
    289: main,
    657: () => flushServerOutput(runtime.memory, {
      free: pointer => runtime.call(14, pointer),
      respondIntermediate: (pointer, length) => runtime.host('a', 'd', pointer, length),
      respondFinal: (pointer, length) => runtime.host('a', 'c', pointer, length),
    }),
  };
}
