/** Recovered sp_server static string-table destructors (501-504, 506, 508, 511).
 *
 * Each function either destroys one libc++ std::string at a fixed static
 * address or walks a contiguous 12-byte string array downward. The walk uses
 * the destructor's return value as the next cursor, exactly like the original
 * loop. All work is delegated to original 19 `destroyLibcppString` (native in
 * this reconstruction).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([501, 502, 503, 504, 506, 508, 511]);

/** String ranges: [exclusiveTop, inclusiveBottom], walked downward by 12. */
export const stringTables = Object.freeze({
  501: Object.freeze([8571128, 8570960]),
  502: Object.freeze([8571600, 8571312]),
  503: Object.freeze([8571944, 8571920]),
});

/** Single static strings destroyed by the remaining functions. */
export const singleStrings = Object.freeze({
  504: 8570860,
  506: 8570828,
  508: 8570924,
  511: 8570892,
});

export function createStringTableDestructionHook(runtime) {
  function destroyTable([top, bottom]) {
    let cursor = top;
    do {
      cursor = runtime.call(19, cursor - 12);
    } while (cursor !== bottom);
  }

  function destroySingle(address) {
    runtime.call(19, address);
  }

  return Object.freeze({
    501: () => destroyTable(stringTables[501]),
    502: () => destroyTable(stringTables[502]),
    503: () => destroyTable(stringTables[503]),
    504: () => destroySingle(singleStrings[504]),
    506: () => destroySingle(singleStrings[506]),
    508: () => destroySingle(singleStrings[508]),
    511: () => destroySingle(singleStrings[511]),
  });
}
