/** Same page entropy stream as installDeterministicServer, without replacing
 * Worker. This lets the production client keep its real C++ worker protocol. */
export function installDeterministicEntropy(options = {}) {
  let state = options.seed >>> 0 || 0x6f6c6446;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
  Math.random = () => next() / 4294967296;
  Object.defineProperty(crypto, 'getRandomValues', {
    configurable: true,
    value(array) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let index = 0; index < bytes.length; index++) bytes[index] = next() & 255;
      return array;
    },
  });
}
