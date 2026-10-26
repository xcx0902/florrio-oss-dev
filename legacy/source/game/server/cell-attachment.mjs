/** Recovered server cell attachment (4 originals).
 *
 * Each original attaches an entity to its grid cell and appends it to the
 * owner's entity list.  All four bodies are the same algorithm instantiated for
 * a different component layout, so the offsets are parameters:
 *
 *   1. set the entity's "attached" flag bit,
 *   2. clear the two occupant slots of the entity's cell,
 *   3. publish the owner's current entity id into the three per-cell arrays,
 *   4. append the new id to the owner's growable id vector,
 *   5. mirror the owner's current id into two entity fields,
 *   6. clear and publish the cell again (the cell index may have moved).
 *
 * WAT SHA-256 of the archived server module: see reports/wasm/sp_server.wat.
 */

export const functionIds = Object.freeze([209, 211, 278, 418]);

const FREE = 14;
const MEMCPY = 15;
const MALLOC = 16;

/** Grid geometry: cell index is the low 14 bits of the entity's field 16. */
const CELL_INDEX_MASK = 16383;
const CELL_OCCUPANT_STRIDE = 8;
const CELL_OCCUPANT_A = 264876;
const CELL_OCCUPANT_B = 264880;
const CELL_VALUE_STRIDE = 4;
const CELL_VALUES = [68268, 133804, 199340];

/** Owner field holding the current entity id. */
const OWNER_CURRENT_ID = 2140;
/** Entity field holding the grid index. */
const ENTITY_CELL_INDEX = 16;
/** First vector capacity when the vector has never grown. */
const INITIAL_CAPACITY = 1024;

/** id -> component layout. */
const layouts = Object.freeze({
  209: { flags: 93, mask: 2, size: 424, capacity: 428, data: 432, mirrorA: 328, mirrorB: 332 },
  211: { flags: 93, mask: 16, size: 556, capacity: 560, data: 564, mirrorA: 352, mirrorB: 356 },
  278: { flags: 92, mask: 16, size: 212, capacity: 216, data: 220, mirrorA: 288, mirrorB: 292 },
  418: { flags: 92, mask: 4, size: 124, capacity: 128, data: 132, mirrorA: 272, mirrorB: 276 },
});

export { layouts as componentLayouts };

export function createCellAttachmentHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function read(method, address) {
    try {
      return dataView()[method](address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function write(method, address, value) {
    try {
      dataView()[method](address >>> 0, value, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const readUint8 = address => read('getUint8', address);
  const readUint32 = address => read('getUint32', address);
  const writeUint8 = (address, value) => write('setUint8', address, value & 0xff);
  const writeUint32 = (address, value) => write('setUint32', address, value >>> 0);

  /** Owner pointer of an entity. */
  const ownerOf = entity => readUint32(entity);
  /** Cell index of an entity. */
  const cellIndex = entity => readUint32(entity + ENTITY_CELL_INDEX) & CELL_INDEX_MASK;

  /** Free one occupant record and clear its slot. */
  function clearOccupant(slot) {
    const occupant = readUint32(slot);
    writeUint32(slot, 0);
    if (occupant !== 0) {
      runtime.call(FREE, readUint32(occupant + 12));
      runtime.call(FREE, occupant);
    }
  }

  /** Clear both occupant records of the entity's cell. */
  function clearCell(entity) {
    const base = (ownerOf(entity) + cellIndex(entity) * CELL_OCCUPANT_STRIDE) >>> 0;
    clearOccupant(base + CELL_OCCUPANT_A);
    clearOccupant(base + CELL_OCCUPANT_B);
  }

  /** Publish the owner's current entity id into the three per-cell arrays. */
  function publishCellValue(entity) {
    const owner = ownerOf(entity);
    const cell = (owner + cellIndex(entity) * CELL_VALUE_STRIDE) >>> 0;
    const current = readUint32(owner + OWNER_CURRENT_ID);
    for (const offset of CELL_VALUES) writeUint32(cell + offset, current);
  }

  /** Append `value` to the owner's growable id vector. */
  function appendToOwnerVector(entity, value, layout) {
    const owner = ownerOf(entity);
    const size = readUint32(owner + layout.size);
    const capacity = readUint32(owner + layout.capacity);
    let data = readUint32(owner + layout.data);
    if (capacity < size + 1) {
      let grown = capacity === 0 ? INITIAL_CAPACITY : capacity * 2;
      while (grown < size + 1) grown *= 2;
      const storage = runtime.call(MALLOC, grown * 4);
      runtime.call(MEMCPY, storage, data, size * 4);
      runtime.call(FREE, data);
      writeUint32(owner + layout.data, storage);
      writeUint32(owner + layout.capacity, grown);
      data = storage;
    }
    writeUint32((data + size * 4) >>> 0, value);
    writeUint32(owner + layout.size, size + 1);
  }

  const hooks = {};
  for (const [id, layout] of Object.entries(layouts)) {
    hooks[id] = (entity, value) => {
      writeUint8(entity + layout.flags, readUint8(entity + layout.flags) | layout.mask);
      clearCell(entity);
      publishCellValue(entity);
      appendToOwnerVector(entity, value, layout);
      const current = readUint32(ownerOf(entity) + OWNER_CURRENT_ID);
      writeUint32(entity + layout.mirrorA, current);
      writeUint32(entity + layout.mirrorB, current);
      clearCell(entity);
      publishCellValue(entity);
    };
  }
  return Object.freeze(hooks);
}
