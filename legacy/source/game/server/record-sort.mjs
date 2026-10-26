/** Recovered sp_server insertion-sort-incomplete for 8-byte records (385).
 *
 * This is libc++'s `__insertion_sort_incomplete` specialized for records whose
 * comparison key is the f32 at +4. A record's byte tag at +0 travels with the
 * key; bytes +1..+3 are never touched. Small ranges use fixed networks, larger
 * ranges pre-sort the first three records and insertion-sort the rest, giving
 * up after eight exchanges and reporting whether the range was finished.
 *
 * Function 159 is reused for the four-record network; both were compiled from
 * the same libc++ sort instantiation.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

import {createFourRecordSortHook} from './four-record-sort.mjs';

export const functionIds = Object.freeze([385]);
const RECORD_SIZE = 8;
const EXCHANGE_LIMIT = 8;

export function createRecordSortHook(runtime) {
  const sortFour = createFourRecordSortHook(runtime)[159];

  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 385: sort [begin,end) records by key, returning completion. */
  function sortRecords(begin, end) {
    const view = dataView();
    const address = (record) => record >>> 0;
    const key = (record) => view.getFloat32(address(record) + 4, true);
    const setKey = (record, value) => view.setFloat32(address(record) + 4, value, true);
    const tag = (record) => view.getUint8(address(record));
    const setTag = (record, value) => view.setUint8(address(record), value);

    function swap(left, right) {
      const leftTag = tag(left);
      const leftKey = key(left);
      setTag(left, tag(right));
      setKey(left, key(right));
      setTag(right, leftTag);
      setKey(right, leftKey);
    }

    /** Insert the record at `index` into the already sorted prefix before it. */
    function insertRecord(base, index) {
      const record = base + index * RECORD_SIZE;
      const recordKey = key(record);
      const recordTag = tag(record);
      let position = index - 1;
      while (position >= 0) {
        const previous = base + position * RECORD_SIZE;
        if (!(key(previous) > recordKey)) break;
        setKey(previous + RECORD_SIZE, key(previous));
        setTag(previous + RECORD_SIZE, tag(previous));
        position--;
      }
      const destination = base + (position + 1) * RECORD_SIZE;
      setKey(destination, recordKey);
      setTag(destination, recordTag);
    }

    const count = ((end - begin) / RECORD_SIZE) | 0;
    if (count <= 1) return 1;
    if (count === 2) {
      if (key(begin + RECORD_SIZE) < key(begin)) swap(begin, begin + RECORD_SIZE);
      return 1;
    }
    if (count === 3) {
      insertRecord(begin, 1);
      insertRecord(begin, 2);
      return 1;
    }
    if (count === 4) {
      sortFour(begin, begin + RECORD_SIZE, begin + 2 * RECORD_SIZE, begin + 3 * RECORD_SIZE);
      return 1;
    }
    if (count === 5) {
      sortFour(begin, begin + RECORD_SIZE, begin + 2 * RECORD_SIZE, begin + 3 * RECORD_SIZE);
      insertRecord(begin, 4);
      return 1;
    }

    // Sort the first three records, then insertion-sort from the fourth.
    insertRecord(begin, 1);
    insertRecord(begin, 2);
    let exchanges = 0;
    let previous = begin + 2 * RECORD_SIZE;
    for (let index = 3; index < count; index++) {
      const record = begin + index * RECORD_SIZE;
      if (key(record) < key(previous)) {
        insertRecord(begin, index);
        if (++exchanges === EXCHANGE_LIMIT) {
          return index + 1 === count ? 1 : 0;
        }
      }
      previous = record;
    }
    return 1;
  }

  return Object.freeze({385: sortRecords});
}
