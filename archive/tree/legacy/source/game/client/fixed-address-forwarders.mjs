/** Recovered client fixed-address forwarders (36 originals).
 *
 * Each lifecycle slot ignores its single argument and forwards one fixed data
 * address to a shared cleanup or lookup helper, discarding the helper result.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2547, 2548, 2554, 2555, 2565, 2566, 2575, 2577, 2580, 2582, 2587, 2592, 2596, 2603, 2610, 2629, 2651, 2653, 2680, 2681, 2687, 2688, 4068, 4071, 1831, 1834, 1836, 1838, 1847, 1849, 1851, 1854, 1817, 1818, 1824, 1825]);

export function createFixedAddressForwarderHooks(runtime) {
  return Object.freeze({
    // two-argument layout helpers
    1817(record) { runtime.call(552, record >>> 0, 16083); },
    1818(record) { runtime.call(552, record >>> 0, 15893); },
    1824(record) { runtime.call(564, record >>> 0, 126300); },
    1825(record) { runtime.call(564, record >>> 0, 126280); },
    // fixed-address calls into 377
    2547(_record) { runtime.call(377, 7937512); },
    2548(_record) { runtime.call(377, 7937288); },
    2554(_record) { runtime.call(377, 7936840); },
    2555(_record) { runtime.call(377, 7936616); },
    2565(_record) { runtime.call(377, 7938120); },
    2566(_record) { runtime.call(377, 7937896); },
    2575(_record) { runtime.call(377, 7918072); },
    2577(_record) { runtime.call(377, 7917688); },
    2580(_record) { runtime.call(377, 7917304); },
    2582(_record) { runtime.call(377, 7916920); },
    2587(_record) { runtime.call(377, 7919104); },
    2592(_record) { runtime.call(377, 7916536); },
    2596(_record) { runtime.call(377, 7916152); },
    2603(_record) { runtime.call(377, 7910256); },
    2610(_record) { runtime.call(377, 7937064); },
    2629(_record) { runtime.call(377, 158616); },
    2651(_record) { runtime.call(377, 157800); },
    2653(_record) { runtime.call(377, 157416); },
    2680(_record) { runtime.call(377, 7931592); },
    2681(_record) { runtime.call(377, 7931368); },
    2687(_record) { runtime.call(377, 7936392); },
    2688(_record) { runtime.call(377, 7936168); },
    4068(_record) { runtime.call(377, 151112); },
    4071(_record) { runtime.call(377, 150352); },
    // fixed-address calls into 381
    1831(_record) { runtime.call(381, 7946028); },
    1834(_record) { runtime.call(381, 7945996); },
    1836(_record) { runtime.call(381, 7946092); },
    1838(_record) { runtime.call(381, 7946060); },
    // fixed-address calls into 413
    1847(_record) { runtime.call(413, 7946044); },
    1849(_record) { runtime.call(413, 7946012); },
    1851(_record) { runtime.call(413, 7946108); },
    1854(_record) { runtime.call(413, 7946076); },
  });
}
