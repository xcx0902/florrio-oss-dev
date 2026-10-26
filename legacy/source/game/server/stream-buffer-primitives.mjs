/** Recovered sp_server streambuf primitives (original 41, 361, 365, 366).
 *
 * - 41 peeks one signed byte at +12 without advancing;
 * - 361 reads one 32-bit word from +12, advancing by four; at the end it calls
 *   the virtual underflow slot at vtable+40;
 * - 366 reads one byte from +12, advancing by one; at the end it calls the same
 *   virtual slot;
 * - 365 writes one byte at +24; when the put area is full it calls the virtual
 *   overflow slot at vtable+52 and returns that result.
 *
 * Virtual calls go through the original indirect table so signature checks and
 * traps stay identical.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([41, 361, 365, 366]);

export function createStreamBufferPrimitiveHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function underflow(memory, self) {
    const table = memory.getUint32(self, true);
    const slot = memory.getUint32(table + 40, true);
    return runtime.indirect({parameters: ['i32'], results: ['i32']}, slot, self);
  }

  return Object.freeze({
    41(handle) {
      const memory = memoryView();
      const address = memory.getUint32(handle >>> 0, true);
      const read = memory.getUint32(address + 12, true);
      if (read === memory.getUint32(address + 16, true)) {
        return (underflow(memory, address) << 24) >> 24;
      }
      return memory.getInt8(read);
    },
    361(self) {
      const memory = memoryView();
      const address = self >>> 0;
      const read = memory.getUint32(address + 12, true);
      if (read === memory.getUint32(address + 16, true)) return underflow(memory, address);
      memory.setUint32(address + 12, read + 4, true);
      return memory.getInt32(read, true);
    },
    365(self, value) {
      const memory = memoryView();
      const address = self >>> 0;
      const byte = value & 0xff;
      const put = memory.getUint32(address + 24, true);
      if (put === memory.getUint32(address + 28, true)) {
        const table = memory.getUint32(address, true);
        const slot = memory.getUint32(table + 52, true);
        return runtime.indirect({parameters: ['i32', 'i32'], results: ['i32']}, slot, address, byte);
      }
      memory.setUint8(put, byte);
      memory.setUint32(address + 24, put + 1, true);
      return byte;
    },
    366(self) {
      const memory = memoryView();
      const address = self >>> 0;
      const read = memory.getUint32(address + 12, true);
      if (read === memory.getUint32(address + 16, true)) return underflow(memory, address);
      memory.setUint32(address + 12, read + 1, true);
      return memory.getUint8(read);
    },
  });
}
