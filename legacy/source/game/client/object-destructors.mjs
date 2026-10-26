/** Recovered client object destructor slots (17 originals).
 *
 * Every slot runs one destructor helper on the record, discards its result and
 * then releases the record through the client free bridge (362).
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const destructors = {
  673: [729, false],
  726: [646, true],
  843: [715, true],
  906: [728, true],
  1130: [377, true],
  1228: [377, true],
  1778: [832, true],
  1787: [833, true],
  1809: [839, true],
  1822: [841, true],
  1827: [842, true],
  1950: [727, true],
  1971: [611, true],
  1972: [729, true],
  2371: [490, true],
  2379: [1005, true],
  2487: [675, true],
};

export const functionIds = Object.freeze(Object.keys(destructors).map(Number));

export function createObjectDestructorHooks(runtime) {
  const hooks = {};
  for (const [id, [destructor, release]] of Object.entries(destructors)) {
    hooks[id] = record => {
      runtime.call(destructor, record);
      if (release) runtime.call(362, record);
    };
  }
  return Object.freeze(hooks);
}
