/** Human-written, instruction-grounded portions of sp_server.wasm.
 * These are selected recovered functions, not a replacement for its complete game simulation.
 * Numeric addresses belong to SHA-256 75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d.
 */
export const SERVER_MEMORY = Object.freeze({
  initialized: 8545776,
  outputCount: 8545512,
  outputPointers: 8545516,
  xorKey: 4576,
});

/** Original func289, export s / _main. */
export function main() { return 0; }

/** XOR stage at the start of func655, export w / _sp_server_send.
 * Operates in place and repeats the 256-byte key. It is its own inverse when
 * packet storage does not overlap the key. Packet parsing follows this stage in WASM.
 */
export function xorServerPacketInPlace(memory, pointer, length) {
  const bytes = new Uint8Array(memory.buffer);
  for (let index = 0; index < length; index++) {
    bytes[pointer + index] ^= bytes[SERVER_MEMORY.xorKey + (index & 255)];
  }
}

/** Original func657, export t / _sp_server_flush.
 * Its two parameters are unused. Keep synchronous import callback behavior.
 * `free` is the module's allocator deallocation function, not JS garbage collection.
 */
export function flushServerOutput(memory, { free, respondIntermediate, respondFinal }) {
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const uint = address => view.getUint32(address, true);
  const setUint = (address, value) => view.setUint32(address, value, true);
  if (!bytes[SERVER_MEMORY.initialized]) return;

  let end = SERVER_MEMORY.outputPointers + (bytes[SERVER_MEMORY.outputCount] << 2);
  for (let slot = SERVER_MEMORY.outputPointers; slot !== end; slot += 4) {
    const packet = uint(slot);
    const heapPayload = uint(packet + 12);
    respondIntermediate(heapPayload || packet + 16, uint(packet + 4));
  }
  respondFinal(0, 0);

  end = SERVER_MEMORY.outputPointers + (bytes[SERVER_MEMORY.outputCount] << 2);
  for (let slot = SERVER_MEMORY.outputPointers; slot !== end; slot += 4) {
    const packet = uint(slot);
    setUint(slot, 0);
    if (packet) {
      free(uint(packet + 12));
      free(packet);
    }
  }
  bytes[SERVER_MEMORY.outputCount] = 0;
}

const ORBIT_PROFILES = Object.freeze({
  basic: { attack: 130, defend: 40 },
  fast: { attack: 145, defend: 40 },
  heavy: { attack: 120, defend: 50 },
  rock: { attack: 110, defend: 55 },
});

/** Recovered vtable slot 3 for funcs119,413,661,663.
 * output layout: { radius: f32, consumed: u8 }; context+4 is an owner pointer;
 * owner's +10 is its input bit mask. Bit 0 wins over bit 1 when both are set.
 * Default radius is 65 (the original IEEE-754 constant 1115815936).
 */
function writeOrbitState(memory, outputPointer, contextPointer, profile) {
  const view = new DataView(memory.buffer);
  view.setFloat32(outputPointer, 65, true);
  view.setUint8(outputPointer + 4, 0);
  const owner = view.getUint32(contextPointer + 4, true);
  if (!owner) return;
  const inputs = view.getUint8(owner + 10);
  if (inputs & 1) view.setFloat32(outputPointer, profile.attack, true);
  else if (inputs & 2) view.setFloat32(outputPointer, profile.defend, true);
}
export function basicPetalOrbit(memory, outputPointer, unusedBehavior, contextPointer) {
  writeOrbitState(memory, outputPointer, contextPointer, ORBIT_PROFILES.basic);
}
export function fastPetalOrbit(memory, outputPointer, unusedBehavior, contextPointer) {
  writeOrbitState(memory, outputPointer, contextPointer, ORBIT_PROFILES.fast);
}
export function heavyPetalOrbit(memory, outputPointer, unusedBehavior, contextPointer) {
  writeOrbitState(memory, outputPointer, contextPointer, ORBIT_PROFILES.heavy);
}
export function rockPetalOrbit(memory, outputPointer, unusedBehavior, contextPointer) {
  writeOrbitState(memory, outputPointer, contextPointer, ORBIT_PROFILES.rock);
}
