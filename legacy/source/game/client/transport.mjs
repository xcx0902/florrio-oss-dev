/** Recovered client transport and browser state routines.
 * Function numbers refer to client.wasm SHA-256 c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 * The remaining allocator, string and callback implementations are invoked through runtime.call.
 * Scratch storage uses the original WASM stack, including its behavior on exceptions.
 */

const u32 = value => value >>> 0;
const plus = (left, right) => (left + right) >>> 0;
export const functionIds = Object.freeze([702,1096,1118,1119,3191,3223,3234,3299,3310,3331,3342,3353,3375,3386]);
const indirectModules = new Map();
const indirectInstances = new WeakMap();
function checkedIndirect(table, argumentCount, returnsInt, index, ...args) {
  // A native call_indirect trampoline preserves null-table and signature traps.
  // Calling table.get(index) directly from JS would silently skip its type check.
  const key = `${argumentCount}:${returnsInt}`;
  if (!indirectModules.has(key)) {
    const params = Array(argumentCount).fill(0x7f);
    const result = returnsInt ? [1, 0x7f] : [0];
    const types = [2, 0x60, argumentCount, ...params, ...result,
      0x60, argumentCount + 1, 0x7f, ...params, ...result];
    const body = [0];
    for (let i = 1; i <= argumentCount; i++) body.push(0x20, i);
    body.push(0x20, 0, 0x11, 0, 0, 0x0b);
    indirectModules.set(key, new WebAssembly.Module(new Uint8Array([
      0,97,115,109,1,0,0,0, 1,types.length,...types,
      2,9,1,1,97,1,116,1,0x70,0,0, 3,2,1,1,
      7,5,1,1,102,0,0, 10,body.length + 2,1,body.length,...body,
    ])));
  }
  let instances = indirectInstances.get(table);
  if (!instances) indirectInstances.set(table, instances = new Map());
  if (!instances.has(key)) instances.set(key, new WebAssembly.Instance(indirectModules.get(key), { a: { t: table } }).exports.f);
  return instances.get(key)(index, ...args);
}

export function createClientTransportHooks(runtime) {
  const call = (id, ...args) => runtime.call(id, ...args);
  const host = (field, ...args) => runtime.host('a', field, ...args);
  function access(method, address, ...args) {
    try { return new DataView(runtime.memory.buffer)[method](address, ...args); }
    catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const byte = address => access('getUint8', address);
  const uint = address => access('getUint32', address, true);
  const short = address => access('getUint16', address, true);
  const float = address => access('getFloat32', address, true);
  const setByte = (address, value) => access('setUint8', address, value);
  const setUint = (address, value) => access('setUint32', address, value, true);
  const setLong = (address, value) => access('setBigUint64', address, BigInt.asUintN(64, value), true);
  const copyLong = (to, from) => setLong(to, access('getBigUint64', from, true));
  const invoke = (count, result, index, ...args) => checkedIndirect(runtime.table, count, result, index, ...args);
  const virtual = (object, slot, ...args) => invoke(args.length + 1, false, uint(uint(object) + slot * 4), object, ...args);
  const frame = size => ({ before: u32(call(3475)), pointer: u32(call(3256, size)) });
  const restore = stack => call(3364, stack.before);

  /** Func1119's block decoder. Explicit wide copies retain the original overcopy
   * and overlap semantics, not merely the nominal decompressed output bytes.
   * Error values are -(consumed + 1), exactly as in the original block routine.
   */
  function decodeBlock(input, inputEnd, output, outputLength) {
    if (!outputLength) return inputEnd - input === 1 && byte(input) === 0 ? 0 : -1;
    const outputEnd = plus(output, outputLength);
    const wideLimit = plus(outputEnd, -12), finalMatchLimit = plus(outputEnd, -5);
    const byteCopyLimit = plus(outputEnd, -7);
    const extensionLimit = plus(inputEnd, -5), literalLimit = plus(inputEnd, -8);
    const longLiteralLimit = plus(inputEnd, -15);
    const failure = position => (input - position - 1) | 0;
    let read = input, write = output;
    for (;;) {
      const token = byte(read);
      let literalRead = plus(read, 1), literalLength = token >>> 4;
      let errorPosition = literalRead;
      if (literalLength === 15) {
        let extension;
        do {
          errorPosition = plus(literalRead, 1);
          extension = byte(literalRead);
          literalLength = plus(literalLength, extension);
          literalRead = errorPosition;
        } while (extension === 255 && longLiteralLimit > literalRead);
        if (literalLength > u32(~write) || literalLength > u32(~literalRead)) return failure(errorPosition);
      }
      const literalEnd = plus(literalRead, literalLength);
      const matchStart = plus(write, literalLength);
      if (!(literalEnd <= literalLimit && wideLimit >= matchStart)) {
        if (literalEnd !== inputEnd || matchStart > outputEnd) return failure(literalRead);
        call(363, write, literalRead, literalLength);
        return (matchStart - output) | 0;
      }
      // The compiler emits at least one eight-byte copy, even for zero literals.
      let source = literalRead;
      do { copyLong(write, source); source = plus(source, 8); write = plus(write, 8); } while (write < matchStart);
      read = plus(literalEnd, 2);
      const distance = short(literalEnd);
      let matchRead = plus(matchStart, -distance);
      if (matchRead < output) return failure(read);
      setUint(matchStart, distance);
      let matchLength = token & 15;
      if (matchLength === 15) {
        let extension;
        do {
          errorPosition = plus(read, 1);
          if (errorPosition > extensionLimit) return failure(errorPosition);
          extension = byte(read);
          matchLength = plus(matchLength, extension);
          read = errorPosition;
        } while (extension === 255);
        if (matchLength > u32(~matchStart)) return failure(errorPosition);
      }
      matchLength = plus(matchLength, 4);
      write = plus(matchStart, matchLength);
      if (distance <= 7) {
        // These sequential bytes matter for distances 0,1,2,3.
        for (let i = 0; i < 4; i++) setByte(matchStart + i, byte(matchRead + i));
        matchRead = plus(matchRead, uint(5120 + distance * 4));
        setUint(matchStart + 4, uint(matchRead));
        matchRead = plus(matchRead, -uint(5152 + distance * 4));
      } else {
        copyLong(matchStart, matchRead);
        matchRead = plus(matchRead, 8);
      }
      let destination = plus(matchStart, 8);
      if (write > wideLimit) {
        if (write > finalMatchLimit) return failure(read);
        if (destination < byteCopyLimit) {
          let from = matchRead, to = destination;
          do { copyLong(to, from); from = plus(from, 8); to = plus(to, 8); } while (to < byteCopyLimit);
          matchRead = plus(matchRead, byteCopyLimit - destination);
          destination = byteCopyLimit;
        }
        while (destination < write) {
          setByte(destination, byte(matchRead));
          destination = plus(destination, 1); matchRead = plus(matchRead, 1);
        }
      } else {
        copyLong(destination, matchRead);
        if (matchLength >= 17) {
          destination = plus(destination, 8);
          do {
            copyLong(destination, plus(matchRead, 8));
            matchRead = plus(matchRead, 8); destination = plus(destination, 8);
          } while (destination < write);
        }
      }
    }
  }

  function decompressAndDeliverTransportPacket(pointer, length, context) {
    pointer = u32(pointer); length = u32(length); context = u32(context);
    const stack = frame(16);
    if (!length || byte(pointer) !== 2) {
      call(1118, context, pointer, length);
      restore(stack); return;
    }
    const headerLength = length >= 5 ? 5 : 1;
    const decodedLength = length >= 5 ? uint(pointer + 1) : 0;
    const output = u32(call(382, call(371, decodedLength), 0, decodedLength));
    const actualLength = decodeBlock(plus(pointer, headerLength), plus(pointer, length), output, decodedLength);
    if (u32(actualLength) !== decodedLength) {
      setUint(stack.pointer, decodedLength); setUint(stack.pointer + 4, actualLength);
      call(589, 18732, stack.pointer);
    } else call(1119, output, decodedLength, context);
    call(362, output);
    restore(stack);
  }

  /** The partial varint reader accepts exhausted and overlong input exactly as
   * the inlined original does. It intentionally does not impose a new validator.
   */
  function partialVarint(pointer, length, cursor) {
    let value = 0;
    for (let group = 0; group < 5 && cursor < length; group++) {
      const current = byte(plus(pointer, cursor)); cursor = plus(cursor, 1);
      value = (value | (current & 127) << (group * 7)) >>> 0;
      if (!(current & 128)) break;
    }
    return { value, cursor };
  }

  function acknowledgeAndDeliverTransportPacket(context, pointer, length) {
    context = u32(context); pointer = u32(pointer); length = u32(length);
    const stack = frame(4128), scratch = stack.pointer;
    const transport = uint(context + 4);
    if (byte(uint(context)) && length && byte(pointer) === 1) {
      const first = partialVarint(pointer, length, 1);
      const second = partialVarint(pointer, length, first.cursor);
      setLong(scratch + 16, 0n); setLong(scratch + 8, 0n);
      virtual(transport, 6, scratch + 8, 2);
      function appendVarint(value) {
        let count = 0;
        do {
          setByte(scratch + 4120 + count, (value & 127) | (value > 127 ? 128 : 0));
          count++; value >>>= 7;
        } while (value);
        if (uint(scratch + 8)) setUint(scratch + 8, 0);
        let payload = uint(scratch + 20);
        let capacity = payload ? uint(scratch + 16) : 4096;
        const previousSize = uint(scratch + 12), size = plus(previousSize, count);
        if (capacity < size) {
          do { capacity = (capacity << 1) >>> 0; } while (capacity < size);
          const previous = payload || scratch + 24;
          payload = u32(call(368, capacity));
          const copied = call(363, payload, previous, previousSize);
          if (previous !== scratch + 24) call(362, previous);
          setUint(scratch + 20, copied); setUint(scratch + 16, capacity);
        }
        call(363, plus(payload || scratch + 24, previousSize), scratch + 4120, count);
        setUint(scratch + 12, size);
      }
      appendVarint(first.value); appendVarint(second.value);
      virtual(transport, 4, uint(scratch + 20) || scratch + 24, uint(scratch + 12));
      call(362, uint(scratch + 20));
    }
    const callback = uint(transport + 48);
    if (callback) {
      setUint(scratch + 8, pointer); setUint(scratch + 4120, length);
      virtual(callback, 6, scratch + 8, scratch + 4120);
    }
    restore(stack);
  }

  function receiveTransportPacket(transport, pointer, length, acknowledge) {
    const stack = frame(16);
    setByte(stack.pointer + 15, acknowledge);
    setUint(stack.pointer + 4, transport); setUint(stack.pointer, stack.pointer + 15);
    call(1119, pointer, length, stack.pointer);
    restore(stack);
  }

  function findWebRTCChannel(id) {
    id = u32(id);
    const bucketCount = uint(7910232);
    if (!bucketCount) return 0;
    const powerOfTwo = (bucketCount & (bucketCount - 1)) === 0;
    const bucket = powerOfTwo ? (bucketCount - 1) & id : id < bucketCount ? id : id % bucketCount;
    let node = uint(plus(uint(7910228), bucket * 4));
    if (!node) return 0;
    node = uint(node);
    while (node) {
      const hash = uint(node + 4);
      if (hash === id && uint(node + 8) === id) return uint(node + 12);
      if (hash !== id) {
        const nodeBucket = powerOfTwo ? (bucketCount - 1) & hash : hash < bucketCount ? hash : hash % bucketCount;
        if (nodeBucket !== bucket) return 0;
      }
      node = uint(node);
    }
    return 0;
  }

  function handleWebRTCOpen(id) {
    const channel = findWebRTCChannel(id);
    if (channel && uint(channel + 104) === 1) {
      setUint(channel + 104, 2);
      const callback = uint(channel + 24); if (callback) virtual(callback, 6);
    }
  }

  function handleWebRTCMessage(id, pointer, length) {
    const stack = frame(32), scratch = stack.pointer;
    const channel = findWebRTCChannel(id);
    if (channel) {
      setLong(scratch + 16, -386158174715730690n);
      setByte(scratch + 12, 1); setUint(scratch + 4, length);
      setUint(scratch, pointer); setUint(scratch + 8, scratch + 16);
      setUint(scratch + 24, 82100);
      invoke(3, false, uint(82100), scratch + 24, 64, scratch);
      call(702, channel, pointer, length, 0);
    }
    restore(stack);
  }

  function handleWebRTCClosed(id, error) {
    const channel = findWebRTCChannel(id);
    if (!channel || !uint(channel + 104)) return;
    virtual(channel, 5, error ? 1 : 0);
    if (error) {
      if (!uint(channel + 104)) return;
      setUint(channel + 104, 0);
      const callback = uint(channel + 72); if (callback) virtual(callback, 6);
    }
    if (!uint(channel + 104)) return;
    setUint(channel + 104, 0);
    const callback = uint(channel + 96); if (callback) virtual(callback, 6);
  }

  function initializeGameTransportOnce() {
    if (byte(7784472)) return;
    setByte(7784472, 1);
    if (byte(441368)) {
      setUint(441400, 32952); call(799, 441408); setUint(441400, 32068);
      setUint(7784368, 0);
      const worker = u32(call(371, 20));
      setLong(worker + 4, 0n); setUint(worker, 34972); setUint(worker + 12, 0);
      const workerId = +host('Me', 10619) | 0; setUint(worker + 16, workerId);
      host('o', workerId, 8439, 0, 0, 0, 0);
      const previous = uint(7784368); setUint(7784368, worker);
      if (previous) virtual(previous, 3);
      return;
    }
    call(382, 441400, 0, 7343072);
    setUint(441400, 32952); call(799, 441408);
    setLong(7784464, 0n); setLong(7784448, 0n); setUint(441400, 32984);
    for (const address of [7784368,7784376,7784384,7784392,7784416,7784424]) setLong(address, 0n);
    for (const address of [7784456,7784440,7784408]) setByte(address, 0);
    setUint(7784404, 0); access('setUint16', 7784400, 0, true); setUint(7784432, 0);
  }

  function acceptClipboardText(pointer) {
    const backend = uint(7944488);
    if (!backend) { call(364, 7907, 0); return; }
    pointer = u32(pointer) || 125873;
    const callback = uint(backend + 268);
    if (callback) { invoke(2, true, callback, backend, pointer); return; }
    const previous = uint(backend + 324);
    if (previous) {
      invoke(1, false, uint(132088), previous);
      setUint(132092, uint(132092) - 1);
    }
    const length = u32(call(378, pointer)), bytesNeeded = plus(length, 1);
    const copy = invoke(1, true, uint(132076), bytesNeeded < length ? 1 : bytesNeeded);
    if (copy) { setUint(132092, uint(132092) + 1); call(363, copy, pointer, bytesNeeded); }
    setUint(backend + 324, copy);
  }

  function setForcedServerId(pointer) {
    const length = call(378, pointer);
    if (byte(439203) >= 128) { setByte(uint(439192), 0); setUint(439196, 0); }
    else { setByte(439203, 0); setByte(439192, 0); }
    call(459, 439180, pointer, length); setByte(439176, 0);
  }

  function pollWebSocketEvents() {
    const stack = frame(32), scratch = stack.pointer;
    setByte(441364, 0);
    let node = uint(441352);
    while (node) {
      const socket = uint(node + 8);
      for (;;) {
        setUint(scratch, uint(socket)); setUint(scratch + 8, scratch + 16); setUint(scratch + 4, scratch + 20);
        const event = +host('a', 140574, 32225, scratch) | 0;
        if (!event) break;
        const payload = uint(scratch + 20);
        if (event === 1) {
          const callback = uint(uint(node + 8) + 48);
          if (callback) {
            setUint(scratch + 28, payload); setUint(scratch + 24, uint(scratch + 16));
            virtual(callback, 6, scratch + 28, scratch + 24);
          }
        } else if (event === 2 || event === 3) {
          const callback = uint(uint(node + 8) + (event === 2 ? 24 : 72));
          if (callback) virtual(callback, 6);
        } else if (event === 4) {
          const callback = uint(uint(node + 8) + 96);
          if (callback) { virtual(callback, 6); call(362, uint(scratch + 20)); }
          else call(362, payload);
          break;
        }
        call(362, uint(scratch + 20));
        if (byte(441364)) break;
      }
      if (byte(441364)) { setByte(441364, 0); node = uint(441352); }
      else node = uint(node);
    }
    restore(stack);
  }

  function handleCanvasContextLost(contextId) {
    const stack = frame(48), scratch = stack.pointer;
    let renderer = uint(441324);
    if ((contextId | 0) === -1) {
      while (renderer) {
        const current = renderer; renderer = uint(current + 72);
        if ((uint(current + 96) | 0) === -1 && !(float(current + 64) >= 0)) {
          setUint(scratch, -1); call(469, 18834, scratch);
        }
      }
    } else {
      while (renderer) {
        const current = renderer; renderer = uint(current + 72);
        if (uint(current + 96) !== u32(contextId)) continue;
        if (float(current + 64) >= 0) {
          const previous = uint(current + 76);
          let next = renderer;
          if (previous) { setUint(previous + 72, renderer); next = uint(current + 72); }
          else if (uint(441324) === current) setUint(441324, renderer);
          if (next) setUint(next + 76, previous);
          setLong(current + 72, 0n); setUint(scratch + 32, contextId);
          void (+host('a', 136033, 31967, scratch + 32) | 0);
          setUint(current + 96, -1); setUint(441320, uint(441320) - 1);
        } else { setUint(scratch + 16, contextId); call(469, 18834, scratch + 16); }
      }
    }
    restore(stack);
  }

  function accumulateMouseWheel(delta) {
    access('setFloat64', 163840, access('getFloat64', 163840, true) + delta, true);
  }
  function requestDisconnect() { setByte(7784496, 1); }
  function shouldConfirmBrowserQuit() {
    const callback = uint(439168);
    return callback ? invoke(1, true, uint(uint(callback) + 24), callback) : 0;
  }

  return {
    702: receiveTransportPacket, 1096: initializeGameTransportOnce,
    1118: acknowledgeAndDeliverTransportPacket, 1119: decompressAndDeliverTransportPacket,
    3191: handleWebRTCOpen, 3223: handleWebRTCMessage, 3234: handleWebRTCClosed,
    3299: acceptClipboardText, 3310: accumulateMouseWheel, 3331: setForcedServerId,
    3342: requestDisconnect, 3353: pollWebSocketEvents, 3375: handleCanvasContextLost,
    3386: shouldConfirmBrowserQuit,
  };
}
