/** Recovered client static string-table initializers (originals 1840,1841,1842,
 * 1856,1857,1858).
 *
 * Each initializer guards a nested table cleanup, constructs every string entry
 * through 396 or 397, publishes the table pointer and returns it.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const tables = {
  1840: {
    outer: 7945984,
    inner: 7947112,
    start: 7947088,
    end: 7947112,
    ctor: 396,
    slot: 7945980,
    entries: [
      [7947088, 21650],
      [7947100, 21647],
    ],
  },
  1841: {
    outer: 7945968,
    inner: 7946768,
    start: 7946480,
    end: 7946768,
    ctor: 396,
    slot: 7945964,
    entries: [
      [7946480, 5438],
      [7946492, 5429],
      [7946504, 15078],
      [7946516, 13900],
      [7946528, 6143],
      [7946540, 16253],
      [7946552, 5576],
      [7946564, 8030],
      [7946576, 12799],
      [7946588, 12782],
      [7946600, 12790],
      [7946612, 12809],
      [7946624, 13389],
      [7946636, 19417],
      [7946648, 12833],
      [7946660, 11753],
      [7946672, 6143],
      [7946684, 13067],
      [7946696, 13859],
      [7946708, 15100],
      [7946720, 12837],
      [7946732, 8874],
      [7946744, 6599],
      [7946756, 19254],
    ],
  },
  1842: {
    outer: 7945952,
    inner: 7946296,
    start: 7946128,
    end: 7946296,
    ctor: 396,
    slot: 7945948,
    entries: [
      [7946128, 6122],
      [7946140, 6129],
      [7946152, 6095],
      [7946164, 6103],
      [7946176, 6086],
      [7946188, 6136],
      [7946200, 6113],
      [7946212, 13063],
      [7946224, 13312],
      [7946236, 15933],
      [7946248, 18633],
      [7946260, 7818],
      [7946272, 14613],
      [7946284, 9505],
    ],
  },
  1856: {
    outer: 7945992,
    inner: 7947144,
    start: 7947120,
    end: 7947144,
    ctor: 397,
    slot: 7945988,
    entries: [
      [7947120, 131360],
      [7947132, 131372],
    ],
  },
  1857: {
    outer: 7945976,
    inner: 7947072,
    start: 7946784,
    end: 7947072,
    ctor: 397,
    slot: 7945972,
    entries: [
      [7946784, 130840],
      [7946796, 130872],
      [7946808, 130908],
      [7946820, 130932],
      [7946832, 130956],
      [7946844, 130972],
      [7946856, 130992],
      [7946868, 131012],
      [7946880, 131040],
      [7946892, 131080],
      [7946904, 131112],
      [7946916, 131148],
      [7946928, 131184],
      [7946940, 131200],
      [7946952, 131216],
      [7946964, 131232],
      [7946976, 130956],
      [7946988, 131248],
      [7947000, 131264],
      [7947012, 131280],
      [7947024, 131296],
      [7947036, 131312],
      [7947048, 131328],
      [7947060, 131344],
    ],
  },
  1858: {
    outer: 7945960,
    inner: 7946472,
    start: 7946304,
    end: 7946472,
    ctor: 397,
    slot: 7945956,
    entries: [
      [7946304, 130500],
      [7946316, 130528],
      [7946328, 130556],
      [7946340, 130588],
      [7946352, 130628],
      [7946364, 130664],
      [7946376, 130692],
      [7946388, 130728],
      [7946400, 130744],
      [7946412, 130760],
      [7946424, 130776],
      [7946436, 130792],
      [7946448, 130808],
      [7946460, 130824],
    ],
  },
};

export const functionIds = Object.freeze(Object.keys(tables).map(Number));

export function createStaticTableInitializerHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const hooks = {};
  for (const [id, table] of Object.entries(tables)) {
    hooks[id] = () => {
      const memory = memoryView();
      if ((memory.getUint8(table.outer) & 1) === 0 && runtime.call(369, table.outer) !== 0) {
        if ((memory.getUint8(table.inner) & 1) === 0 && runtime.call(369, table.inner) !== 0) {
          for (let cursor = table.start; cursor < table.end; cursor += 12) runtime.call(389, cursor);
          runtime.call(370, table.inner);
        }
        for (const [address, text] of table.entries) runtime.call(table.ctor, address, text);
        memory.setUint32(table.slot, table.start, true);
        runtime.call(370, table.outer);
      }
      return memory.getUint32(table.slot, true);
    };
  }
  return Object.freeze(hooks);
}
