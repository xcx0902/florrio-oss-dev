/** Minimal bounded binary reader for analysis-only export additions. */
export function readUleb(bytes, cursor) {
  let result = 0, shift = 0, byte;
  do {
    if (cursor.offset >= bytes.length || shift >= 35) throw new Error('Invalid u32 LEB');
    byte = bytes[cursor.offset++];
    result |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return result >>> 0;
}
export function uleb(value) {
  const out = [];
  do { const byte = value & 127; value >>>= 7; out.push(byte | (value ? 128 : 0)); } while (value);
  return Uint8Array.from(out);
}
export function withAdditionalExports(input, entries) {
  const output = [input.subarray(0, 8)], cursor = { offset: 8 };
  const encodeEntry = entry => {
    const name = new TextEncoder().encode(entry.name);
    return Buffer.concat([uleb(name.length), name, Uint8Array.of(entry.kind ?? 0), uleb(entry.index)]);
  };
  let found = false;
  while (cursor.offset < input.length) {
    const id = input[cursor.offset++], length = readUleb(input, cursor);
    const end = cursor.offset + length;
    if (end > input.length) throw new Error('Truncated section');
    let body = input.subarray(cursor.offset, end);
    if (id === 7) {
      const exportCursor = { offset: 0 }, count = readUleb(body, exportCursor);
      body = Buffer.concat([uleb(count + entries.length), body.subarray(exportCursor.offset), ...entries.map(encodeEntry)]);
      found = true;
    }
    output.push(Uint8Array.of(id), uleb(body.length), body);
    cursor.offset = end;
  }
  if (!found) throw new Error('Export section missing');
  return Buffer.concat(output);
}
