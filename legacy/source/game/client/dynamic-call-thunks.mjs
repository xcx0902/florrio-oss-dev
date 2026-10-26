/** Recovered client dynamic-call thunks (originals 1758,1759,4329).
 *
 * These repack split 64-bit arguments and forward through the indirect table.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([1756, 1757, 1758, 1759, 1760, 1762, 4329]);

export function createDynamicCallThunkHooks(runtime) {
  function pack(low, high) {
    return (BigInt(low >>> 0) | (BigInt(high >>> 0) << 32n)) & 0xffffffffffffffffn;
  }

  function split(value) {
    runtime.call(37, Number((value >> 32n) & 0xffffffffn));
    return Number(BigInt.asIntN(32, value & 0xffffffffn));
  }

  return Object.freeze({
    1756(tableIndex, a, b, c, d, e, low1, high1, low2, high2) {
      return runtime.indirect(
        {parameters: ['i32', 'i32', 'i32', 'i32', 'i32', 'i64', 'i64'], results: ['i32']},
        tableIndex >>> 0, a, b, c, d, e, pack(low1, high1), pack(low2, high2));
    },
    1757(tableIndex, a, b, c, d, low1, high1, low2, high2) {
      return runtime.indirect(
        {parameters: ['i32', 'i32', 'i32', 'i32', 'i64', 'i64'], results: ['i32']},
        tableIndex >>> 0, a, b, c, d, pack(low1, high1), pack(low2, high2));
    },
    1760(tableIndex, value) {
      const result = runtime.indirect({parameters: ['i32'], results: ['i64']}, tableIndex >>> 0, value);
      return split(result);
    },
    1762(tableIndex, first, low, high, tail) {
      const result = runtime.indirect(
        {parameters: ['i32', 'i64', 'i32'], results: ['i64']},
        tableIndex >>> 0, first, pack(low, high), tail);
      return split(result);
    },
    1758(tableIndex, a, b, c, d, low, high) {
      const value = (BigInt(low >>> 0) | (BigInt(high >>> 0) << 32n)) & 0xffffffffffffffffn;
      return runtime.indirect(
        {parameters: ['i32', 'i32', 'i32', 'i32', 'i64'], results: ['i32']},
        tableIndex >>> 0, a, b, c, d, value);
    },
    1759(tableIndex, a, b, c, low, high, tail) {
      const value = (BigInt(low >>> 0) | (BigInt(high >>> 0) << 32n)) & 0xffffffffffffffffn;
      runtime.indirect(
        {parameters: ['i32', 'i32', 'i32', 'i64', 'i32'], results: []},
        tableIndex >>> 0, a, b, c, value, tail);
    },
    4329(unused, tableIndex, first) {
      runtime.indirect({parameters: ['i32'], results: []}, tableIndex >>> 0, first);
    },
  });
}
