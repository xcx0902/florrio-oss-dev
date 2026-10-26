/** Recovered sp_server global flag reset (original 696).
 *
 * Clears the one-byte activity flags for every registered effect family.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([696]);

const flagAddresses = Object.freeze([
  0x827a0c,
  0x827a28,
  0x8279b4,
  0x827998,
  0x827940,
  0x827924,
  0x8278cc,
  0x8278b0,
  0x827858,
  0x82783c,
  0x8277e4,
  0x8277c8,
  0x827770,
  0x827754,
  0x8276fc,
  0x8276e0,
  0x827688,
  0x82766c,
  0x827614,
  0x8275a0,
  0x8275f8,
  0x827584,
  0x82752c,
  0x827510,
  0x8274b8,
  0x82749c,
  0x827444,
  0x827428,
  0x8273d0,
  0x8273b4,
  0x82735c,
  0x827340,
  0x8272e8,
  0x8272cc,
  0x827274,
  0x827258,
  0x827200,
  0x8271e4,
  0x82718c,
  0x827170,
  0x827118,
  0x8270fc,
  0x8270a4,
  0x827088,
  0x827030,
  0x827014,
]);

export function createGlobalFlagResetHook(runtime) {
  return Object.freeze({
    696() {
      const memory = new Uint8Array(runtime.memory.buffer);
      for (const address of flagAddresses) memory[address] = 0;
    },
  });
}
