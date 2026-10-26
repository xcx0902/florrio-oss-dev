/** Recovered sp_server locale facet getters (original 61, 62, 134, 136, 313, 314,
 * 319, 320).
 *
 * Each forwards the locale object and a fixed facet name address to the facet
 * lookup 92.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([61, 62, 134, 136, 313, 314, 319, 320]);

const facetAddresses = Object.freeze({
  61: 8570716,
  62: 8570724,
  134: 8570772,
  136: 8570764,
  313: 8570616,
  314: 8570624,
  319: 8570600,
  320: 8570608,
});

export function createLocaleFacetGetterHooks(runtime) {
  const hooks = {};
  for (const [id, address] of Object.entries(facetAddresses)) {
    hooks[id] = (locale) => runtime.call(92, locale, address);
  }
  return Object.freeze(hooks);
}
