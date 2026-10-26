/** The complete spServerThink tick, recovered from the retained server artifact.
 * Scalar memory fields share the original C++ layout while named phases below
 * retain gameplay, allocator, scratch writes and packet order. No instruction
 * decoder or original function 654 is called by this implementation.
 */
const f32 = Math.fround;

export const functionIds = Object.freeze([ 654 ]);

export function createSimulationTickHooks(runtime) {
  let buffer, view;
  function access(base, offset, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    const pointer = (base >>> 0) + offset;
    if (pointer + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return pointer;
  }
  const readU8 = (p, offset = 0) => {
    const address = access(p, offset, 1);
    return view.getUint8(address);
  };
  const readI8 = (p, offset = 0) => {
    const address = access(p, offset, 1);
    return view.getInt8(address);
  };
  const readU16 = (p, offset = 0) => {
    const address = access(p, offset, 2);
    return view.getUint16(address, true);
  };
  const readI32 = (p, offset = 0) => {
    const address = access(p, offset, 4);
    return view.getInt32(address, true);
  };
  const readI64 = (p, offset = 0) => {
    const address = access(p, offset, 8);
    return view.getBigInt64(address, true);
  };
  const readI64Word = (p, offset = 0) => {
    const address = access(p, offset, 4);
    return BigInt(view.getUint32(address, true));
  };
  const readF32 = (p, offset = 0) => {
    const address = access(p, offset, 4);
    return view.getFloat32(address, true);
  };
  const readF64 = (p, offset = 0) => {
    const address = access(p, offset, 8);
    return view.getFloat64(address, true);
  };
  const writeU8 = (p, value, offset = 0) => {
    const address = access(p, offset, 1);
    view.setUint8(address, value);
  };
  const writeU16 = (p, value, offset = 0) => {
    const address = access(p, offset, 2);
    view.setUint16(address, value, true);
  };
  const writeI32 = (p, value, offset = 0) => {
    const address = access(p, offset, 4);
    view.setInt32(address, value, true);
  };
  const writeI64 = (p, value, offset = 0) => {
    const address = access(p, offset, 8);
    view.setBigInt64(address, BigInt.asIntN(64, value), true);
  };
  const writeF32 = (p, value, offset = 0) => {
    const address = access(p, offset, 4);
    view.setFloat32(address, value, true);
  };
  const writeF64 = (p, value, offset = 0) => {
    const address = access(p, offset, 8);
    view.setFloat64(address, value, true);
  };
  const bitView = new DataView(new ArrayBuffer(8));
  function doubleBits(value) {
    bitView.setFloat64(0, value, true);
    return bitView.getBigInt64(0, true);
  }
  function rotateLeft(value, count) {
    return value << count | value >>> (-count & 31);
  }
  function divideUnsigned(a, b) {
    if (!(b >>> 0)) throw new WebAssembly.RuntimeError("divide by zero");
    return Math.trunc((a >>> 0) / (b >>> 0)) | 0;
  }
  function divideSigned(a, b) {
    a |= 0;
    b |= 0;
    if (!b) throw new WebAssembly.RuntimeError("divide by zero");
    if (a === -2147483648 && b === -1) throw new WebAssembly.RuntimeError("integer overflow");
    return Math.trunc(a / b) | 0;
  }
  function remainderUnsigned(a, b) {
    if (!(b >>> 0)) throw new WebAssembly.RuntimeError("divide by zero");
    return (a >>> 0) % (b >>> 0) | 0;
  }
  function truncateInteger(value, unsigned) {
    const integer = Math.trunc(value);
    if (!Number.isFinite(integer) || integer < (unsigned ? 0 : -2147483648) || integer >= (unsigned ? 4294967296 : 2147483648)) throw new WebAssembly.RuntimeError("integer overflow");
    return integer | 0;
  }
  // Dependencies use the same typed shared-memory boundary as every recovered module.
  const createEquippedPetal = (...args) => runtime.call(397, ...args);
  const free = (...args) => runtime.call(14, ...args);
  const randomIntegerRange = (...args) => runtime.call(102, ...args);
  const serializeEntityReference = (...args) => runtime.call(105, ...args);
  const setEquippedPetalType = (...args) => runtime.call(125, ...args);
  const destroySpatialChildren = (...args) => runtime.call(127, ...args);
  const refreshPetalConfiguration = (...args) => runtime.call(145, ...args);
  const sinF64 = (...args) => runtime.call(149, ...args);
  const releaseDeferredSlot = (...args) => runtime.call(150, ...args);
  const queryCollisionPairs = (...args) => runtime.call(162, ...args);
  const compactSpatialTree = (...args) => runtime.call(163, ...args);
  const atan2F64 = (...args) => runtime.call(164, ...args);
  const computeCollisionBounds = (...args) => runtime.call(167, ...args);
  const targetEligible = (...args) => runtime.call(168, ...args);
  const cosF64 = (...args) => runtime.call(169, ...args);
  const updateWorldTransform = (...args) => runtime.call(17, ...args);
  const setOwnerReference = (...args) => runtime.call(170, ...args);
  const setCurrentHealth = (...args) => runtime.call(18, ...args);
  const partitionPendingMessages = (...args) => runtime.call(189, ...args);
  const mergeKnownEntityRecords = (...args) => runtime.call(190, ...args);
  const mergeRevisionRecords = (...args) => runtime.call(191, ...args);
  const queryVisibleEntities = (...args) => runtime.call(192, ...args);
  const queryAreaEffectTargets = (...args) => runtime.call(193, ...args);
  const sortEntityPointers = (...args) => runtime.call(194, ...args);
  const setEffectFlags = (...args) => runtime.call(195, ...args);
  const alertNearby = (...args) => runtime.call(196, ...args);
  const findTarget = (...args) => runtime.call(197, ...args);
  const findPickupRecipient = (...args) => runtime.call(198, ...args);
  const partitionBroadcastMessages = (...args) => runtime.call(199, ...args);
  const assignStringBytes = (...args) => runtime.call(204, ...args);
  const initializeLongString = (...args) => runtime.call(214, ...args);
  const addExperience = (...args) => runtime.call(215, ...args);
  const healEntity = (...args) => runtime.call(216, ...args);
  const sortEntityHandles = (...args) => runtime.call(254, ...args);
  const sortRankedEntityPointers = (...args) => runtime.call(255, ...args);
  const setWorldFlags = (...args) => runtime.call(256, ...args);
  const experienceLevelFactor = (...args) => runtime.call(262, ...args);
  const insertSpatialCollider = (...args) => runtime.call(264, ...args);
  const assignStringStorage = (...args) => runtime.call(268, ...args);
  const replaceAreaEffect = (...args) => runtime.call(271, ...args);
  const invalidateDescendant = (...args) => runtime.call(34, ...args);
  const releaseMessageControlBlock = (...args) => runtime.call(35, ...args);
  const writeComponentPresence = (...args) => runtime.call(393, ...args);
  const countChangedComponents = (...args) => runtime.call(394, ...args);
  const setPlayerViewY = (...args) => runtime.call(395, ...args);
  const setPlayerViewX = (...args) => runtime.call(396, ...args);
  const growHandleVector = (...args) => runtime.call(398, ...args);
  const setFamilyFlags = (...args) => runtime.call(399, ...args);
  const replenishPopulation = (...args) => runtime.call(400, ...args);
  const constrainLinkedEntity = (...args) => runtime.call(401, ...args);
  const setPickupFlags = (...args) => runtime.call(402, ...args);
  const markArenaCount = (...args) => runtime.call(403, ...args);
  const removeEntity = (...args) => runtime.call(404, ...args);
  const eraseMessages = (...args) => runtime.call(406, ...args);
  const changedStringSlot = (...args) => runtime.call(407, ...args);
  const elapsedFromOrigin = (...args) => runtime.call(408, ...args);
  const abortInvalidSimulationState = (...args) => runtime.call(42, ...args);
  const attachOwnershipComponent = (...args) => runtime.call(428, ...args);
  const damage = (...args) => runtime.call(43, ...args);
  const setLocalX = (...args) => runtime.call(44, ...args);
  const setLocalY = (...args) => runtime.call(47, ...args);
  const cosF32 = (...args) => runtime.call(77, ...args);
  const sinF32 = (...args) => runtime.call(78, ...args);
  const minimumLevelZoneX = (...args) => runtime.call(84, ...args);
  const setLocalAngle = (...args) => runtime.call(94, ...args);
  const powF64 = (...args) => runtime.call(95, ...args);
  const malloc = (...args) => runtime.call(16, ...args);
  const memcmp = (...args) => runtime.call(57, ...args);
  const memcpy = (...args) => runtime.call(15, ...args);
  const memset = (...args) => runtime.call(29, ...args);
  const operatorNewOrAbort = (...args) => runtime.call(20, ...args);
  const readClock = (...args) => runtime.call(21, ...args);
  const spawnEntity = (...args) => runtime.call(144, ...args);
  /** Advance the world once, then enqueue its visible-entity snapshot. */
  function spServerThink() {
    const tickFrame = runtime.stackPointer.value - 48 | 0;
    runtime.stackPointer.value = tickFrame;
    if (readU8(8545776) && readU8(8545512) <= 16) {
      readClock(tickFrame + 8);
      let elapsedMilliseconds = 50;
      if (readU8(8545496)) elapsedMilliseconds = readU8(tickFrame, 8) ? readF64(tickFrame, 16) - readF64(8545504) : Infinity;
      writeI64(8545496, readI64(tickFrame, 8));
      writeI64(8545504, readI64(tickFrame, 16));
      writeF64(tickFrame, elapsedMilliseconds, 40);
      writeF64(tickFrame, elapsedMilliseconds, 32);
      writeF64(tickFrame, Math.min(f32(elapsedMilliseconds), 100), 24);
      const simulationFrame = runtime.stackPointer.value - 1152 | 0;
      runtime.stackPointer.value = simulationFrame;
      updateWorldStatus(0, simulationFrame, tickFrame);
      let [phaseCursor] = updateMatchCountdown(simulationFrame, 0, tickFrame);
      advanceTimedEntitiesAndAi(phaseCursor, simulationFrame, 0, tickFrame);
      const [stepMilliseconds] = applyActiveDamageEffects(simulationFrame, tickFrame);
      updateAreaEffectTargets(simulationFrame);
      [phaseCursor] = updateEquippedPetals(simulationFrame, stepMilliseconds);
      updatePetalOrbits(phaseCursor, simulationFrame, stepMilliseconds);
      applyPlayerControls(simulationFrame, stepMilliseconds);
      integrateMovement(simulationFrame, tickFrame);
      updateCollisionBounds();
      rebuildSpatialTree();
      resolveEntityCollisions(simulationFrame);
      publishPlayerCoordinates(simulationFrame);
      queueBroadcastEvents(tickFrame);
      const [visibleInline, baselineRevision, packetFrame, knownStart, packet, pendingCountPointer, packetInlineStorage, pendingEntriesPointer, knownRecordsPointer, usesLocalConnection, headerBytes] = beginSnapshot();
      const [knownCountPointer] = mergeVisibilityChanges(visibleInline, packetFrame, knownStart, pendingCountPointer, pendingEntriesPointer, knownRecordsPointer, usesLocalConnection);
      const [entitySearchCursor, visibleCount, knownLength, recordInlineStorage] = beginEntityRecords(baselineRevision, packetFrame, pendingCountPointer, pendingEntriesPointer, knownCountPointer);
      const [lastSearchCursor] = encodeVisibleEntities(entitySearchCursor, visibleCount, visibleInline, baselineRevision, packetFrame, knownLength, recordInlineStorage, knownRecordsPointer, knownCountPointer, usesLocalConnection);
      finishSnapshotAndRemoveEntities(lastSearchCursor, baselineRevision, packetFrame, knownLength, packet, recordInlineStorage, packetInlineStorage, knownRecordsPointer, knownCountPointer, usesLocalConnection, headerBytes);
    }
    runtime.stackPointer.value = tickFrame + 48 | 0;
  }
  /** Publish lobby status using the same field comparison buffers as setters. */
  function updateWorldStatus(hasFirstPlayer, scratch, tickFrame) {
    if (!readU8(24837)) return;
    let player = readI32(24936);
    player = player ? readI32(player, 120) : 0;
    player = player ? readI32(player, 100) : 0;
    if (player) {
      const nameComponent = readI32(player, 160), source = nameComponent + 8;
      writeI32(scratch, 24456, 208);
      writeI32(scratch, 0, 212);
      const oldTag = readI8(24467), oldLong = oldTag < 0;
      const oldLength = oldLong ? readI32(24460) >>> 0 : oldTag & 255;
      const sourceTag = readI8(source, 11), sourceLong = sourceTag < 0;
      const sourceLength = sourceLong ? readI32(nameComponent, 12) >>> 0 : sourceTag & 255;
      const sourceBytes = sourceLong ? readI32(source) : source;
      let same = oldLength === sourceLength;
      if (same && oldLength) same = memcmp(oldLong ? readI32(24456) : 24456, sourceBytes, oldLength) === 0;
      if (!same) {
        const destination = changedStringSlot(scratch + 208);
        if (destination !== source) {
          if (readI8(destination, 11) >= 0) {
            if (sourceTag >= 0) {
              writeI64(destination, readI64(source));
              writeI32(destination, readI32(source, 8), 8);
            } else initializeLongString(destination, readI32(nameComponent, 8), readI32(nameComponent, 12));
          } else assignStringStorage(destination, sourceBytes, sourceLength);
        }
      }
      hasFirstPlayer = 1;
    }
    let players = 0, cursor = readI32(25092);
    while (cursor) {
      players++;
      cursor = readI32(cursor, 8);
    }
    readClock(scratch + 208);
    compareStatusNumber(24448, elapsedFromOrigin(scratch + 208), "double", 24524);
    compareStatusNumber(24472, readF64(tickFrame, 24), "float", 24532);
    compareStatusNumber(24504, hasFirstPlayer, "integer", 24544, scratch);
    compareStatusNumber(24508, players, "integer", 24548, scratch);
    compareStatusNumber(24440, readI32(24400), "integer", 24520, scratch);
    compareStatusNumber(24512, readI32(23228), "integer", 24552, scratch);
  }
  function resetFieldComparison() {
    free(readI32(8551052));
    writeI64(8551048, 0n);
    writeI64(8551040, 0n);
    free(readI32(8555164));
    writeI64(8555160, 0n);
    writeI64(8555152, 0n);
  }
  function writeScratchVarUint(destination, value) {
    let length = 0;
    do {
      const more = value >>> 0 > 127;
      writeU8(destination + length++, value & 127 | more << 7);
      value >>>= 7;
    } while (value);
    return length;
  }
  function invalidateSnapshotEntity(entity) {
    for (const offset of [ 264876, 264880 ]) {
      const address = readI32(entity) + ((readI32(entity, 16) & 16383) << 3) + offset;
      const packet = readI32(address);
      writeI32(address, 0);
      if (packet) {
        free(readI32(packet, 12));
        free(packet);
      }
    }
    const world = readI32(entity), index = readI32(entity, 16) & 16383, epoch = readI32(world, 2140);
    writeI32(world + (index << 2) + 68268, epoch);
    writeI32(world + (index << 2) + 133804, epoch);
  }
  function markWorldStatus(revisionAddress) {
    const entity = readI32(24416);
    if (!entity) return;
    writeI32(entity, readI32(readI32(entity), 2140), 464);
    writeI32(entity, readI32(readI32(entity), 2140), 468);
    invalidateSnapshotEntity(entity);
    writeI32(revisionAddress, readI32(readI32(readI32(24416)), 2140));
  }
  function compareStatusNumber(address, incoming, encoding, revision, scratch = 0) {
    const previous = encoding === "double" ? readF64(address) : encoding === "float" ? readF32(address) : readI32(address);
    if (incoming === previous) return;
    resetFieldComparison();
    let beforeLength, afterLength;
    if (encoding === "double") {
      writeF64(8551056, previous);
      beforeLength = 8;
      writeF64(address, incoming);
      writeF64(8555168, incoming);
      afterLength = 8;
    } else if (encoding === "float") {
      writeF32(8551056, previous);
      beforeLength = 4;
      writeF32(address, incoming);
      writeF32(8555168, f32(incoming));
      afterLength = 4;
    } else {
      beforeLength = writeScratchVarUint(scratch + 208, previous);
      memcpy(8551056, scratch + 208, beforeLength);
      writeI32(address, incoming);
      afterLength = writeScratchVarUint(scratch + 208, incoming);
      memcpy(8555168, scratch + 208, afterLength);
    }
    writeI32(8551044, beforeLength);
    writeI32(8555156, afterLength);
    if (beforeLength !== afterLength || memcmp(8551056, 8555168, beforeLength)) markWorldStatus(revision);
  }
  /** Count remaining participants and advance the arena countdown and match flags. */  function updateMatchCountdown(scratch, vector, tickFrame) {
    // Original WAT 141193–142390.
    let value = 0, count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, entity = 0, end = 0, node = 0, valueF32 = 0, scaleF32 = 0, amountF32 = 0;
    count = 0;
    updateMatchCountdownDone: {
      if (+(readU8(23801) !== 1)) {
        break updateMatchCountdownDone;
      }
      if (readU8(24839)) {
        value = readI32(23184);
        if (value) {
          cursor = readI32(23192);
          entry = value & 3;
          updateMatchCountdownDone2: {
            if (+((value - 1 | 0) >>> 0 < 3)) {
              length = 0;
              capacity = 0;
              break updateMatchCountdownDone2;
            }
            length = 0;
            offset = 0;
            capacity = value & -4;
            vector = capacity;
            do {
              const savedLength = length;
              const savedCursor = cursor;
              value = offset << 2;
              length = (((savedLength + +(readI32(readI32(savedCursor + value | 0), 100) !== 0) | 0) + +(readI32(readI32(cursor + (value | 4) | 0), 100) !== 0) | 0) + +(readI32(readI32(cursor + (value | 8) | 0), 100) !== 0) | 0) + +(readI32(readI32(cursor + (value | 12) | 0), 100) !== 0) | 0;
              offset = offset + 4 | 0;
              vector = vector - 4 | 0;
            } while (vector);
          }
          if (entry) {
            do {
              length = length + +(readI32(readI32(cursor + (capacity << 2) | 0), 100) !== 0) | 0;
              capacity = capacity + 1 | 0;
              entry = entry - 1 | 0;
            } while (entry);
          }
          if (+(length >>> 0 > 1)) {
            break updateMatchCountdownDone;
          }
        }
        writeI32(scratch, readU8(23800) | 2, 208);
        setWorldFlags(scratch + 208 | 0);
        break updateMatchCountdownDone;
      }
      if (readU8(23252)) {
        amountF32 = readF32(23248);
        const savedAmountF32 = amountF32;
        valueF32 = f32(amountF32 - readF64(tickFrame, 24));
        scaleF32 = +(valueF32 > 0.0) ? valueF32 : 0.0;
        let selectedValue2;
        if (+(savedAmountF32 !== scaleF32)) {
          free(readI32(8551052));
          writeI64(8551048, 0n);
          writeI64(8551040, 0n);
          free(readI32(8555164));
          writeI64(8555160, 0n);
          writeI64(8555152, 0n);
          valueF32 = readF32(23248);
          if (readI32(8551040)) {
            writeI32(8551040, 0);
          }
          const storedI32 = readI32(8551048);
          cursor = readI32(8551052);
          value = cursor ? storedI32 : 4096;
          const savedValue = value;
          offset = readI32(8551044);
          capacity = offset + 4 | 0;
          if (+(savedValue >>> 0 < capacity >>> 0)) {
            [value, cursor, end, length] = growBeforeComparisonWriter(value, capacity, cursor, offset);
          }
          writeF32((cursor ? cursor : 8551056) + offset | 0, valueF32);
          writeF32(23248, scaleF32);
          writeI32(8551044, capacity);
          if (readI32(8555152)) {
            writeI32(8555152, 0);
          }
          const storedI322 = readI32(8555160);
          cursor = readI32(8555164);
          value = cursor ? storedI322 : 4096;
          const savedValue2 = value;
          capacity = readI32(8555156);
          end = capacity + 4 | 0;
          if (+(savedValue2 >>> 0 < end >>> 0)) {
            [value, cursor, offset, length] = growAfterComparisonWriter(value, end, cursor, capacity);
          }
          writeF32((cursor ? cursor : 8555168) + capacity | 0, scaleF32);
          writeI32(8555156, end);
          updateMatchCountdownDone3: {
            updateMatchCountdownDone4: {
              if (+(readI32(8551044) !== end)) {
                break updateMatchCountdownDone4;
              }
              if (+(end === 0)) {
                break updateMatchCountdownDone3;
              }
              value = readI32(8551052);
              capacity = value ? value : 8551056;
              const storedU8 = readU8(capacity);
              value = readI32(8555164);
              length = value ? value : 8555168;
              if (+(storedU8 !== readU8(length))) {
                break updateMatchCountdownDone4;
              }
              cursor = 1;
              do {
                value = cursor;
                if (+(value === end)) {
                  break updateMatchCountdownDone3;
                }
                cursor = value + 1 | 0;
              } while (+(readU8(value + capacity | 0) === readU8(value + length | 0)));
              if (+(value >>> 0 >= end >>> 0)) {
                break updateMatchCountdownDone3;
              }
            }
            markArenaCount();
          }
          selectedValue2 = readF32(23248);
        } else {
          selectedValue2 = amountF32;
        }
        if (+(+(selectedValue2 <= 0.0) === 0)) {
          break updateMatchCountdownDone;
        }
        value = 0;
        writeU8(24839, 1);
        updateMatchCountdownDone5: {
          cursor = readU8(23800);
          if (cursor & 1) {
            break updateMatchCountdownDone5;
          }
          writeI32(scratch, cursor | 1, 208);
          setWorldFlags(scratch + 208 | 0);
          length = 0;
          if (+(readI32(24692) === 0)) {
            break updateMatchCountdownDone5;
          }
          do {
            refreshPetalConfiguration(readI32(readI32(24700) + (length << 2) | 0));
            length = length + 1 | 0;
          } while (+(length >>> 0 < readI32(24692) >>> 0));
        }
        capacity = readI32(23184);
        if (+(capacity === 0)) {
          break updateMatchCountdownDone;
        }
        length = readI32(23192);
        do {
          updateMatchCountdownDone6: {
            cursor = readI32(length + (value << 2) | 0);
            if (readI32(cursor, 100)) {
              break updateMatchCountdownDone6;
            }
            if (readI32(cursor, 172)) {
              break updateMatchCountdownDone6;
            }
            if (readU8(418936)) {
              break updateMatchCountdownDone6;
            }
            if (readU8(418937)) {
              break updateMatchCountdownDone6;
            }
            writeI32(418940, 9);
            writeU8(418937, 1);
          }
          value = value + 1 | 0;
        } while (+(value !== capacity));
        break updateMatchCountdownDone;
      }
      cursor = readI32(23184);
      if (+(cursor === 0)) {
        break updateMatchCountdownDone;
      }
      entity = readI32(23192);
      length = 0;
      updateMatchCountdownDone7: {
        if (+(cursor !== 1)) {
          end = cursor & 1;
          value = 0;
          vector = cursor & -2;
          capacity = vector;
          do {
            const savedEntity = entity;
            offset = value << 2;
            cursor = readI32(savedEntity + offset | 0);
            if (readI32(cursor, 100)) {
              length = length + +(readI32(cursor, 172) === 0) | 0;
            }
            cursor = readI32(entity + (offset | 4) | 0);
            if (readI32(cursor, 100)) {
              length = length + +(readI32(cursor, 172) === 0) | 0;
            }
            value = value + 2 | 0;
            capacity = capacity - 2 | 0;
          } while (capacity);
          if (+(end === 0)) {
            break updateMatchCountdownDone7;
          }
        }
        value = readI32(entity + (vector << 2) | 0);
        if (+(readI32(value, 100) === 0)) {
          break updateMatchCountdownDone7;
        }
        length = length + +(readI32(value, 172) === 0) | 0;
      }
      if (+(length >>> 0 < 15)) {
        break updateMatchCountdownDone;
      }
      updateMatchCountdownDone8: {
        if (+(readF32(23248) === 10000.0)) {
          break updateMatchCountdownDone8;
        }
        free(readI32(8551052));
        writeI64(8551048, 0n);
        writeI64(8551040, 0n);
        free(readI32(8555164));
        writeI64(8555160, 0n);
        writeI64(8555152, 0n);
        valueF32 = readF32(23248);
        if (readI32(8551040)) {
          writeI32(8551040, 0);
        }
        const storedI323 = readI32(8551048);
        cursor = readI32(8551052);
        value = cursor ? storedI323 : 4096;
        const savedValue3 = value;
        offset = readI32(8551044);
        capacity = offset + 4 | 0;
        if (+(savedValue3 >>> 0 < capacity >>> 0)) {
          [value, cursor, end, length] = growBeforeComparisonWriter(value, capacity, cursor, offset);
        }
        writeF32((cursor ? cursor : 8551056) + offset | 0, valueF32);
        writeI32(23248, 1176256512);
        writeI32(8551044, capacity);
        if (readI32(8555152)) {
          writeI32(8555152, 0);
        }
        const storedI324 = readI32(8555160);
        cursor = readI32(8555164);
        value = cursor ? storedI324 : 4096;
        const savedValue4 = value;
        capacity = readI32(8555156);
        end = capacity + 4 | 0;
        if (+(savedValue4 >>> 0 < end >>> 0)) {
          [value, cursor, offset, length] = growAfterComparisonWriter(value, end, cursor, capacity);
        }
        writeI32((cursor ? cursor : 8555168) + capacity | 0, 1176256512);
        writeI32(8555156, end);
        updateMatchCountdownDone9: {
          if (+(readI32(8551044) !== end)) {
            break updateMatchCountdownDone9;
          }
          if (+(end === 0)) {
            break updateMatchCountdownDone8;
          }
          value = readI32(8551052);
          capacity = value ? value : 8551056;
          const storedU82 = readU8(capacity);
          value = readI32(8555164);
          length = value ? value : 8555168;
          if (+(storedU82 !== readU8(length))) {
            break updateMatchCountdownDone9;
          }
          cursor = 1;
          do {
            value = cursor;
            if (+(value === end)) {
              break updateMatchCountdownDone8;
            }
            cursor = value + 1 | 0;
          } while (+(readU8(value + capacity | 0) === readU8(value + length | 0)));
          if (+(value >>> 0 >= end >>> 0)) {
            break updateMatchCountdownDone8;
          }
        }
        markArenaCount();
      }
      if (+(readU8(23252) === 1)) {
        break updateMatchCountdownDone;
      }
      free(readI32(8551052));
      writeI64(8551048, 0n);
      writeI64(8551040, 0n);
      free(readI32(8555164));
      writeI64(8555160, 0n);
      writeI64(8555152, 0n);
      entity = readU8(23252);
      updateMatchCountdownDone10: {
        cursor = readI32(8551040);
        if (+(cursor === 0)) {
          cursor = 1;
          const storedI325 = readI32(8551048);
          offset = readI32(8551052);
          value = offset ? storedI325 : 4096;
          const savedValue5 = value;
          end = readI32(8551044);
          capacity = end + 1 | 0;
          if (+(savedValue5 >>> 0 < capacity >>> 0)) {
            [value, offset, node, length] = growBeforeComparisonWriter(value, capacity, offset, end);
          }
          writeU8((offset ? offset : 8551056) + end | 0, entity);
          writeI32(8551044, capacity);
          break updateMatchCountdownDone10;
        }
        const storedI326 = readI32(8551044);
        value = readI32(8551052);
        value = (storedI326 + (value ? value : 8551056) | 0) - 1 | 0;
        writeU8(value, readU8(value) | entity << cursor);
        value = readI32(8551040) + 1 | 0;
        cursor = +(value === 8) ? 0 : value;
      }
      writeU8(23252, 1);
      writeI32(8551040, cursor);
      let selectedValue3;
      updateMatchCountdownDone11: {
        cursor = readI32(8555152);
        if (+(cursor === 0)) {
          const storedI327 = readI32(8555160);
          cursor = readI32(8555164);
          value = cursor ? storedI327 : 4096;
          const savedValue6 = value;
          offset = readI32(8555156);
          length = offset + 1 | 0;
          if (+(savedValue6 >>> 0 < length >>> 0)) {
            [value, cursor, end, capacity] = growAfterComparisonWriter(value, length, cursor, offset);
          }
          writeU8((cursor ? cursor : 8555168) + offset | 0, 1);
          writeI32(8555156, length);
          selectedValue3 = 1;
          break updateMatchCountdownDone11;
        }
        const storedI328 = readI32(8555156);
        value = readI32(8555164);
        value = (storedI328 + (value ? value : 8555168) | 0) - 1 | 0;
        writeU8(value, readU8(value) | 1 << cursor);
        length = readI32(8555156);
        value = readI32(8555152) + 1 | 0;
        selectedValue3 = +(value === 8) ? 0 : value;
      }
      writeI32(8555152, selectedValue3);
      updateMatchCountdownDone12: {
        if (+(readI32(8551044) !== length)) {
          break updateMatchCountdownDone12;
        }
        if (+(length === 0)) {
          break updateMatchCountdownDone;
        }
        value = readI32(8551052);
        offset = value ? value : 8551056;
        const storedU83 = readU8(offset);
        value = readI32(8555164);
        capacity = value ? value : 8555168;
        if (+(storedU83 !== readU8(capacity))) {
          break updateMatchCountdownDone12;
        }
        cursor = 1;
        do {
          value = cursor;
          if (+(value === length)) {
            break updateMatchCountdownDone;
          }
          cursor = value + 1 | 0;
        } while (+(readU8(value + offset | 0) === readU8(value + capacity | 0)));
        if (+(value >>> 0 >= length >>> 0)) {
          break updateMatchCountdownDone;
        }
      }
      length = readI32(23240);
      if (+(length === 0)) {
        break updateMatchCountdownDone;
      }
      const savedLength2 = length;
      value = readI32(length);
      writeI32(savedLength2, readI32(value, 2140), 312);
      writeI32(length, readI32(value, 2140), 316);
      value = (value + ((readI32(length, 16) & 16383) << 3) | 0) + 264876 | 0;
      cursor = readI32(value);
      writeI32(value, 0);
      if (cursor) {
        free(readI32(cursor, 12));
        free(cursor);
      }
      value = (readI32(length) + ((readI32(length, 16) & 16383) << 3) | 0) + 264880 | 0;
      cursor = readI32(value);
      writeI32(value, 0);
      if (cursor) {
        free(readI32(cursor, 12));
        free(cursor);
      }
      cursor = readI32(length);
      const savedBits = (cursor + ((readI32(length, 16) & 16383) << 2) | 0) + 68268 | 0;
      value = readI32(cursor, 2140);
      writeI32(savedBits, value);
      writeI32((cursor + ((readI32(length, 16) & 16383) << 2) | 0) + 133804 | 0, value);
      writeI32(23260, readI32(readI32(readI32(23240)), 2140));
    }
    return [ count ];
  }
  /** Execute deferred callbacks, expiry/regen and pickups; replenish and steer AI; refresh ranked players. */  function advanceTimedEntitiesAndAi(count, scratch, flag, tickFrame) {
    // Original WAT 142391–149102.
    let value = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, required = 0, entity = 0, end = 0, field = 0, componentData = 0, node = 0, vector = 0, valueF32 = 0, scaleF32 = 0, amountF32 = 0, stepF32 = 0, radiusF32 = 0, valueF64 = 0, amountF64 = 0, targetY = 0, positionX = 0, angle = 0, rate = 0;
    advanceTimedEntitiesAndAiDone: {
      advanceTimedEntitiesAndAiDone2: {
        advanceTimedEntitiesAndAiDone3: {
          if (+(readI32(24848) !== readI32(24844))) {
            do {
              readClock(scratch + 208 | 0);
              value = readI32(24844);
              const savedValue7 = value;
              cursor = count << 2;
              capacity = readI32(savedValue7 + cursor | 0);
              length = readU8(capacity, 24);
              advanceTimedEntitiesAndAiDone4: {
                advanceTimedEntitiesAndAiDone5: {
                  if (readU8(scratch, 208)) {
                    if (+(length === 0)) {
                      break advanceTimedEntitiesAndAiDone5;
                    }
                    if (+(+(readF64(scratch, 216) < readF64(capacity, 32)) === 0)) {
                      break advanceTimedEntitiesAndAiDone5;
                    }
                    break advanceTimedEntitiesAndAiDone4;
                  }
                  if (length) {
                    break advanceTimedEntitiesAndAiDone4;
                  }
                }
                value = readI32(capacity, 16);
                if (+(value === 0)) {
                  break advanceTimedEntitiesAndAiDone3;
                }
                runtime.indirect({
                  parameters: [ "i32" ],
                  results: []
                }, readI32(readI32(value), 24), value);
                value = readI32(24844) + cursor | 0;
                cursor = readI32(value);
                const savedValue8 = value;
                value = readI32(24848) - 4 | 0;
                writeI32(savedValue8, readI32(value));
                writeI32(value, cursor);
                writeI32(24848, releaseDeferredSlot(readI32(24848) - 4 | 0));
                count = count - 1 | 0;
                value = readI32(24844);
              }
              count = count + 1 | 0;
            } while (+(count >>> 0 < (readI32(24848) - value | 0) >> 2 >>> 0));
          }
          if (readI32(24136)) {
            value = 0;
            do {
              advanceTimedEntitiesAndAiDone6: {
                cursor = readI32(readI32(24144) + (value << 2) | 0);
                scaleF32 = readF32(cursor, 8);
                if (+(+(scaleF32 > 0.0) === 0)) {
                  break advanceTimedEntitiesAndAiDone6;
                }
                valueF32 = readF32(cursor, 24);
                if (+(+(valueF32 > 0.0) === 0)) {
                  break advanceTimedEntitiesAndAiDone6;
                }
                valueF32 = f32(valueF32 - readF64(tickFrame, 24));
                if (+(valueF32 <= 0.0)) {
                  writeI32(cursor, 0, 24);
                  writeU16(scratch, 1, 208);
                  damage(cursor, 0, scaleF32, scratch + 208 | 0);
                  break advanceTimedEntitiesAndAiDone6;
                }
                writeF32(cursor, valueF32, 24);
              }
              advanceTimedEntitiesAndAiDone7: {
                if (+(readU8(cursor, 32) === 0)) {
                  break advanceTimedEntitiesAndAiDone7;
                }
                readClock(scratch + 208 | 0);
                count = readU8(cursor, 40);
                advanceTimedEntitiesAndAiDone8: {
                  if (readU8(scratch, 208)) {
                    if (+(count === 0)) {
                      break advanceTimedEntitiesAndAiDone8;
                    }
                    if (+(+(readF64(scratch, 216) < readF64(cursor, 48)) === 0)) {
                      break advanceTimedEntitiesAndAiDone8;
                    }
                    break advanceTimedEntitiesAndAiDone7;
                  }
                  if (count) {
                    break advanceTimedEntitiesAndAiDone7;
                  }
                }
                cursor = readI32(cursor);
                if (readI32(cursor, 32)) {
                  break advanceTimedEntitiesAndAiDone7;
                }
                capacity = readI32(cursor);
                writeI32(capacity, readI32(capacity, 2172) + 1 | 0, 2172);
                count = readI32(capacity + 2176 | 0);
                length = readI32(capacity + 2180 | 0);
                writeI32(cursor, 0, 40);
                writeI32(cursor, length, 36);
                writeI32(cursor, capacity + 2172 | 0, 32);
                cursor = cursor + 32 | 0;
                if (+(count === 0)) {
                  writeI32(capacity, cursor, 2176);
                }
                if (length) {
                  writeI32(length, cursor, 8);
                }
                writeI32(capacity, cursor, 2180);
              }
              value = value + 1 | 0;
            } while (+(value >>> 0 < readI32(24136) >>> 0));
          }
          valueF64 = powF64(0.8, readF64(tickFrame, 24) * 0.06);
          if (readI32(22964)) {
            valueF64 = 1.0 - valueF64;
            positionX = +(valueF64 < 0.0) ? 0.0 : Math.min(valueF64, 1.0);
            length = 0;
            do {
              required = readI32(readI32(22972) + (length << 2) | 0);
              readClock(scratch + 208 | 0);
              advanceTimedEntitiesAndAiDone9: {
                if (readU8(required, 24)) {
                  if (+(readF64(required, 32) > readF64(scratch, 216) + 2000.0)) {
                    break advanceTimedEntitiesAndAiDone9;
                  }
                }
                writeI32(scratch, readU8(required, 9) | 1, 208);
                setPickupFlags(required + 9 | 0, scratch + 208 | 0);
              }
              readClock(scratch + 208 | 0);
              value = readU8(required, 24);
              advanceTimedEntitiesAndAiDone10: {
                advanceTimedEntitiesAndAiDone11: {
                  advanceTimedEntitiesAndAiDone12: {
                    if (readU8(scratch, 208)) {
                      if (+(value === 0)) {
                        break advanceTimedEntitiesAndAiDone11;
                      }
                      if (+(readF64(scratch, 216) < readF64(required, 32))) {
                        break advanceTimedEntitiesAndAiDone12;
                      }
                      break advanceTimedEntitiesAndAiDone11;
                    }
                    if (+(value === 0)) {
                      break advanceTimedEntitiesAndAiDone11;
                    }
                  }
                  value = readI32(required);
                  break advanceTimedEntitiesAndAiDone10;
                }
                value = readI32(required);
                if (readI32(value, 32)) {
                  break advanceTimedEntitiesAndAiDone10;
                }
                offset = readI32(value);
                writeI32(offset, readI32(offset, 2172) + 1 | 0, 2172);
                count = readI32(offset + 2176 | 0);
                capacity = readI32(offset + 2180 | 0);
                writeI32(value, 0, 40);
                writeI32(value, capacity, 36);
                writeI32(value, offset + 2172 | 0, 32);
                cursor = value + 32 | 0;
                if (+(count === 0)) {
                  writeI32(offset, cursor, 2176);
                }
                if (capacity) {
                  writeI32(capacity, cursor, 8);
                }
                writeI32(offset, cursor, 2180);
              }
              writeI32(scratch, readI32(value, 168), 1032);
              advanceTimedEntitiesAndAiDone13: {
                if (readU8(required, 9) & 1) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                readClock(scratch + 208 | 0);
                value = readU8(required, 24);
                advanceTimedEntitiesAndAiDone14: {
                  if (readU8(scratch, 208)) {
                    if (+(value === 0)) {
                      break advanceTimedEntitiesAndAiDone13;
                    }
                    if (+(readF64(scratch, 216) < readF64(required, 32))) {
                      break advanceTimedEntitiesAndAiDone14;
                    }
                    break advanceTimedEntitiesAndAiDone13;
                  }
                  if (+(value === 0)) {
                    break advanceTimedEntitiesAndAiDone13;
                  }
                }
                readClock(scratch + 1056 | 0);
                if (+(readU8(scratch, 1056) === 0)) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                if (+(readF64(scratch, 1064) < readF64(required, 48) + 500.0)) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                writeI32(scratch, 0, 1052);
                value = readI32(scratch, 1032);
                scaleF32 = readF32(value, 20);
                valueF32 = readF32(value, 16);
                writeI32(scratch, scratch + 1136 | 0, 1064);
                writeI32(scratch, scratch + 1052 | 0, 1060);
                writeI32(scratch, scratch + 1032 | 0, 1056);
                writeI64(scratch, 4831236501386559488n, 216);
                writeF32(scratch, f32(valueF32 + -70.0), 212);
                writeF32(scratch, f32(scaleF32 + -70.0), 208);
                findPickupRecipient(24984, scratch + 208 | 0, scratch + 1056 | 0);
                value = readI32(scratch, 1052);
                if (+(value === 0)) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                let selectedValue4;
                advanceTimedEntitiesAndAiDone15: {
                  count = readU8(value, 148);
                  if (+(count >>> 0 < 15)) {
                    selectedValue4 = 13;
                    break advanceTimedEntitiesAndAiDone15;
                  }
                  if (+(count >>> 0 < 30)) {
                    selectedValue4 = 14;
                    break advanceTimedEntitiesAndAiDone15;
                  }
                  selectedValue4 = +(count >>> 0 < 45) ? 15 : 16;
                }
                cursor = selectedValue4;
                count = readU8(required, 8);
                advanceTimedEntitiesAndAiDone16: {
                  const savedValue9 = value;
                  let selectedValue5;
                  advanceTimedEntitiesAndAiDone17: {
                    if (+(readU8(value, 20) === 0)) {
                      selectedValue5 = 0;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 21) === 0)) {
                      selectedValue5 = 1;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 22) === 0)) {
                      selectedValue5 = 2;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 23) === 0)) {
                      selectedValue5 = 3;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 24) === 0)) {
                      selectedValue5 = 4;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 25) === 0)) {
                      selectedValue5 = 5;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 26) === 0)) {
                      selectedValue5 = 6;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 27) === 0)) {
                      selectedValue5 = 7;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 28) === 0)) {
                      selectedValue5 = 8;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 29) === 0)) {
                      selectedValue5 = 9;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 30) === 0)) {
                      selectedValue5 = 10;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 31) === 0)) {
                      selectedValue5 = 11;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(readU8(value, 32) === 0)) {
                      selectedValue5 = 12;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    offset = -1;
                    if (+(cursor === 13)) {
                      break advanceTimedEntitiesAndAiDone16;
                    }
                    if (+(readU8(value, 33) === 0)) {
                      selectedValue5 = 13;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(cursor === 14)) {
                      break advanceTimedEntitiesAndAiDone16;
                    }
                    if (+(readU8(value, 34) === 0)) {
                      selectedValue5 = 14;
                      break advanceTimedEntitiesAndAiDone17;
                    }
                    if (+(cursor === 15)) {
                      break advanceTimedEntitiesAndAiDone16;
                    }
                    if (readU8(value, 35)) {
                      break advanceTimedEntitiesAndAiDone16;
                    }
                    selectedValue5 = 15;
                  }
                  offset = selectedValue5;
                  setEquippedPetalType(savedValue9, offset, count);
                  value = readI32(scratch, 1052);
                }
                cursor = readI32(value);
                if (+(cursor !== readI32(required, 56))) {
                  count = readI32(required, 60);
                  const savedCount = count;
                  value = required - -64 | 0;
                  writeI32(savedCount, readI32(value), 8);
                  writeI32(readI32(value), count, 4);
                  const savedValue10 = value;
                  capacity = required + 56 | 0;
                  writeI32(savedValue10, capacity);
                  writeI32(required, 0, 56);
                  const savedRequired = required;
                  let selectedValue6;
                  advanceTimedEntitiesAndAiDone18: {
                    if (+(cursor === 0)) {
                      writeI32(capacity, 0);
                      selectedValue6 = capacity;
                      break advanceTimedEntitiesAndAiDone18;
                    }
                    writeI32(capacity, readI32(cursor, 4));
                    const savedValue11 = value;
                    value = cursor + 12 | 0;
                    count = readI32(value);
                    writeI32(savedValue11, count);
                    writeI32(count, capacity, 4);
                    selectedValue6 = cursor + 4 | 0;
                  }
                  writeI32(savedRequired, selectedValue6, 60);
                  writeI32(value, capacity);
                }
                readClock(scratch + 208 | 0);
                valueF64 = readF64(scratch, 216);
                writeU8(required, 1, 24);
                writeF64(required, valueF64 + 2000.0, 32);
                writeI32(scratch, readU8(required, 9) | 1, 208);
                setPickupFlags(required + 9 | 0, scratch + 208 | 0);
                value = readI32(readI32(scratch, 1052));
                if (+(value === 0)) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                advanceTimedEntitiesAndAiLoop: while (true) {
                  if (+((readU8(value, 92) & 32) === 0)) {
                    const storedI329 = readI32(value, 236);
                    cursor = readU8(value, 93);
                    count = storedI329 & cursor << 25 >> 31;
                    let selectedValue7;
                    if (count) {
                      selectedValue7 = count;
                    } else {
                      if (+((cursor & 64) === 0)) {
                        break advanceTimedEntitiesAndAiDone13;
                      }
                      selectedValue7 = readI32(value, 224);
                    }
                    value = selectedValue7;
                    if (value) {
                      continue advanceTimedEntitiesAndAiLoop;
                    }
                    break advanceTimedEntitiesAndAiDone13;
                  }
                  break;
                }
                count = readI32(value, 120);
                if (+(count === 0)) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                value = readI32(required);
                let selectedValue8;
                if (value) {
                  selectedValue8 = readI32(value, 16);
                } else {
                  selectedValue8 = 0;
                }
                value = selectedValue8;
                entry = operatorNewOrAbort(4124);
                writeI64(entry, 0n, 12);
                writeI64(entry, 0n, 4);
                writeI32(entry, 5184);
                writeI32(entry, 5, 16);
                writeI64(entry, 0n, 20);
                writeU8(entry, 14, 28);
                writeI32(entry, rotateLeft(value, 18), 29);
                value = readU8(418936);
                writeU8(entry, offset, 33);
                writeI32(entry, 6, 16);
                advanceTimedEntitiesAndAiDone19: {
                  if (readI32(count, 172)) {
                    break advanceTimedEntitiesAndAiDone19;
                  }
                  if (value) {
                    break advanceTimedEntitiesAndAiDone19;
                  }
                  capacity = entry + 12 | 0;
                  cursor = readI32(25068);
                  writeI32(entry, readI32(entry, 4) + 1 | 0, 4);
                  advanceTimedEntitiesAndAiDone20: {
                    value = readI32(418916);
                    const savedValue12 = value;
                    componentData = readI32(418912);
                    entity = componentData + 1 | 0;
                    if (+(savedValue12 >>> 0 >= entity >>> 0)) {
                      vector = readI32(418920);
                      break advanceTimedEntitiesAndAiDone20;
                    }
                    value = value ? value << 1 : 256;
                    do {
                      count = value;
                      value = count << 1;
                    } while (+(count >>> 0 < entity >>> 0));
                    offset = 0;
                    end = readI32(418920);
                    vector = malloc(count << 4);
                    if (componentData) {
                      do {
                        const savedVector = vector;
                        value = offset << 4;
                        node = savedVector + value | 0;
                        const savedNode = node;
                        value = value + end | 0;
                        writeI32(savedNode, readI32(value));
                        writeI32(node, readI32(value, 4), 4);
                        writeI32(node, readI32(value, 8), 8);
                        writeI64(value, 0n, 4);
                        writeU8(node, readU8(value, 12), 12);
                        offset = offset + 1 | 0;
                      } while (+(offset !== componentData));
                    }
                    free(end);
                    writeI32(418920, vector);
                    writeI32(418916, count);
                  }
                  value = vector + (componentData << 4) | 0;
                  writeI32(value, capacity, 4);
                  writeI32(value, cursor);
                  writeU8(value, 1, 12);
                  writeI32(value, entry, 8);
                  writeI32(418912, entity);
                }
                const savedEntry = entry;
                value = readI32(entry, 4);
                writeI32(savedEntry, value - 1 | 0, 4);
                if (value) {
                  break advanceTimedEntitiesAndAiDone13;
                }
                runtime.indirect({
                  parameters: [ "i32" ],
                  results: []
                }, readI32(readI32(entry), 8), entry);
                releaseMessageControlBlock(entry);
              }
              advanceTimedEntitiesAndAiDone21: {
                value = readI32(required, 56);
                if (+(value === 0)) {
                  break advanceTimedEntitiesAndAiDone21;
                }
                count = readI32(value, 168);
                if (+(count === 0)) {
                  break advanceTimedEntitiesAndAiDone21;
                }
                cursor = readI32(scratch, 1032);
                amountF64 = readF32(cursor, 20);
                value = 1;
                capacity = cursor;
                if (+(readU8(count, 80) === 0)) {
                  updateWorldTransform(count);
                  capacity = readI32(scratch, 1032);
                  value = readU8(count, 80);
                }
                valueF64 = readF64(count, 88);
                amountF64 = +(Math.abs(amountF64 - valueF64) < 1e-07) ? valueF64 : positionX * (valueF64 - amountF64) + amountF64;
                rate = readF32(capacity, 16);
                if (+((value & 255) === 0)) {
                  updateWorldTransform(count);
                }
                const savedScratch = scratch;
                valueF64 = readF64(count, 96);
                valueF64 = +(Math.abs(rate - valueF64) < 1e-07) ? valueF64 : positionX * (valueF64 - rate) + rate;
                writeF64(savedScratch, valueF64, 1056);
                writeF64(scratch, amountF64, 208);
                if (+(BigInt.asIntN(64, doubleBits(amountF64) & 9218868437227405312n) === 9218868437227405312n)) {
                  break advanceTimedEntitiesAndAiDone21;
                }
                if (+(BigInt.asIntN(64, doubleBits(valueF64) & 9218868437227405312n) === 9218868437227405312n)) {
                  break advanceTimedEntitiesAndAiDone21;
                }
                advanceTimedEntitiesAndAiDone22: {
                  if (+(readU8(cursor, 80) === 0)) {
                    break advanceTimedEntitiesAndAiDone22;
                  }
                  writeU8(cursor, 0, 80);
                  count = readI32(readI32(cursor), 84);
                  if (+(count === 0)) {
                    break advanceTimedEntitiesAndAiDone22;
                  }
                  do {
                    value = readI32(count, 8);
                    invalidateDescendant(count);
                    count = value;
                  } while (count);
                }
                setLocalX(cursor + 20 | 0, scratch + 208 | 0);
                setLocalY(cursor + 16 | 0, scratch + 1056 | 0);
              }
              length = length + 1 | 0;
            } while (+(length >>> 0 < readI32(22964) >>> 0));
          }
          length = 0;
          value = +(readI32(24180) >>> 0 > readI32(24824) >>> 0);
          end = (value ? 3826 : 3182) + 20998 | 0;
          cursor = readI32(end);
          if (cursor) {
            offset = (value ? 3834 : 3190) + 20998 | 0;
            do {
              count = readI32(readI32(readI32(offset) + (length << 2) | 0));
              writeI32(scratch, 1048576, 208);
              writeU8(scratch, 1, 212);
              writeI32(scratch, readI32(count, 92), 1056);
              const savedScratch2 = scratch;
              value = readU8(count, 96);
              writeU8(savedScratch2, value, 1060);
              writeU16(scratch, 0, 1056);
              writeU8(scratch, 0, 1059);
              writeU8(scratch, value & 1, 1060);
              writeU8(scratch, readU8(scratch, 1058) & 16, 1058);
              advanceTimedEntitiesAndAiDone23: {
                const resultOfMemcmp = memcmp(scratch + 1056 | 0, scratch + 208 | 0, 5);
                if (resultOfMemcmp) {
                  break advanceTimedEntitiesAndAiDone23;
                }
                count = readI32(count, 212);
                if (readI32(count, 4)) {
                  break advanceTimedEntitiesAndAiDone23;
                }
                capacity = readI32(count, 16);
                if (+(capacity === 0)) {
                  break advanceTimedEntitiesAndAiDone23;
                }
                value = readI32(count, 24);
                count = value ? value : count + 28 | 0;
                cursor = count + Math.imul(capacity, 12) | 0;
                do {
                  value = readI32(count);
                  if (value) {
                    constrainLinkedEntity(value);
                  }
                  count = count + 12 | 0;
                } while (+(count !== cursor));
                cursor = readI32(end);
              }
              length = length + 1 | 0;
            } while (+(length >>> 0 < cursor >>> 0));
          }
          advanceTimedEntitiesAndAiDone24: {
            value = readU8(23800);
            if (value & 1) {
              break advanceTimedEntitiesAndAiDone24;
            }
            if (+(readU8(23801) === 1)) {
              if (+(readU8(24839) === 0)) {
                break advanceTimedEntitiesAndAiDone24;
              }
            }
            writeI32(scratch, value | 1, 208);
            setWorldFlags(scratch + 208 | 0);
            count = 0;
            if (+(readI32(24692) === 0)) {
              break advanceTimedEntitiesAndAiDone24;
            }
            do {
              refreshPetalConfiguration(readI32(readI32(24700) + (count << 2) | 0));
              count = count + 1 | 0;
            } while (+(count >>> 0 < readI32(24692) >>> 0));
          }
          advanceTimedEntitiesAndAiDone25: {
            if (+((readU8(23800) & 1) === 0)) {
              break advanceTimedEntitiesAndAiDone25;
            }
            valueF64 = readF64(23896);
            const savedValueF64 = valueF64;
            amountF64 = valueF64 + readF64(tickFrame, 24);
            if (+(savedValueF64 === amountF64)) {
              break advanceTimedEntitiesAndAiDone25;
            }
            free(readI32(8551052));
            writeI64(8551048, 0n);
            writeI64(8551040, 0n);
            free(readI32(8555164));
            writeI64(8555160, 0n);
            writeI64(8555152, 0n);
            valueF64 = readF64(23896);
            if (readI32(8551040)) {
              writeI32(8551040, 0);
            }
            const storedI3210 = readI32(8551048);
            length = readI32(8551052);
            count = length ? storedI3210 : 4096;
            const savedCount2 = count;
            capacity = readI32(8551044);
            cursor = capacity + 4 | 0;
            if (+(savedCount2 >>> 0 < cursor >>> 0)) {
              [count, length, offset, value] = growBeforeComparisonWriter(count, cursor, length, capacity);
            }
            writeF32((length ? length : 8551056) + capacity | 0, f32(valueF64));
            writeF64(23896, amountF64);
            writeI32(8551044, cursor);
            if (readI32(8555152)) {
              writeI32(8555152, 0);
            }
            const storedI3211 = readI32(8555160);
            length = readI32(8555164);
            count = length ? storedI3211 : 4096;
            const savedCount3 = count;
            cursor = readI32(8555156);
            offset = cursor + 4 | 0;
            if (+(savedCount3 >>> 0 < offset >>> 0)) {
              [count, length, capacity, value] = growAfterComparisonWriter(count, offset, length, cursor);
            }
            writeF32((length ? length : 8555168) + cursor | 0, f32(amountF64));
            writeI32(8555156, offset);
            advanceTimedEntitiesAndAiDone26: {
              if (+(readI32(8551044) !== offset)) {
                break advanceTimedEntitiesAndAiDone26;
              }
              if (+(offset === 0)) {
                break advanceTimedEntitiesAndAiDone25;
              }
              value = readI32(8551052);
              cursor = value ? value : 8551056;
              const storedU84 = readU8(cursor);
              value = readI32(8555164);
              count = value ? value : 8555168;
              if (+(storedU84 !== readU8(count))) {
                break advanceTimedEntitiesAndAiDone26;
              }
              length = 1;
              do {
                value = length;
                if (+(value === offset)) {
                  break advanceTimedEntitiesAndAiDone25;
                }
                length = value + 1 | 0;
              } while (+(readU8(value + cursor | 0) === readU8(value + count | 0)));
              if (+(value >>> 0 >= offset >>> 0)) {
                break advanceTimedEntitiesAndAiDone25;
              }
            }
            cursor = readI32(23552);
            if (+(cursor === 0)) {
              break advanceTimedEntitiesAndAiDone25;
            }
            const savedCursor2 = cursor;
            value = readI32(cursor);
            writeI32(savedCursor2, readI32(value, 2140), 376);
            writeI32(cursor, readI32(value, 2140), 380);
            value = (value + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264876 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            value = (readI32(cursor) + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264880 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            count = readI32(cursor);
            const savedBits2 = (count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 68268 | 0;
            value = readI32(count, 2140);
            writeI32(savedBits2, value);
            writeI32((count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 133804 | 0, value);
            writeI32(23944, readI32(readI32(readI32(23552)), 2140));
          }
          replenishPopulation();
          vector = 0;
          advanceTimedEntitiesAndAiDone27: {
            if (+((readU8(23800) & 1) === 0)) {
              break advanceTimedEntitiesAndAiDone27;
            }
            capacity = readI32(23008);
            if (capacity) {
              cursor = 0;
              do {
                componentData = readI32(readI32(23016) + (cursor << 2) | 0);
                length = readI32(componentData);
                node = readI32(length);
                valueF64 = readF64(tickFrame, 24);
                const savedScratch3 = scratch;
                count = readI32(length, 168);
                writeI32(savedScratch3, count, 1032);
                advanceTimedEntitiesAndAiDone28: {
                  value = readI32(length, 164);
                  if (value) {
                    if (+(readF32(value, 8) <= 0.0)) {
                      break advanceTimedEntitiesAndAiDone28;
                    }
                  }
                  advanceTimedEntitiesAndAiDone29: {
                    value = readI32(length, 212);
                    if (+(value === 0)) {
                      break advanceTimedEntitiesAndAiDone29;
                    }
                    value = readI32(value, 4);
                    if (+(value === 0)) {
                      break advanceTimedEntitiesAndAiDone29;
                    }
                    length = readI32(value, 104);
                    if (+(length === 0)) {
                      break advanceTimedEntitiesAndAiDone28;
                    }
                    if (+(length === componentData)) {
                      break advanceTimedEntitiesAndAiDone28;
                    }
                    value = readI32(componentData, 156);
                    writeI32(value, readI32(componentData, 160), 8);
                    writeI32(readI32(componentData, 160), value, 4);
                    const savedComponentData = componentData;
                    count = componentData + 152 | 0;
                    writeI32(savedComponentData, count, 160);
                    writeI32(componentData, 0, 152);
                    writeI32(componentData, readI32(length, 152), 152);
                    const savedComponentData2 = componentData;
                    value = readI32(length, 160);
                    writeI32(savedComponentData2, value, 160);
                    writeI32(value, count, 4);
                    writeI32(componentData, length + 152 | 0, 156);
                    writeI32(length, count, 160);
                    break advanceTimedEntitiesAndAiDone28;
                  }
                  const savedComponentData3 = componentData;
                  const storedF32 = readF32(componentData, 56);
                  stepF32 = f32(valueF64);
                  writeF32(savedComponentData3, Math.max(f32(storedF32 - stepF32), 0.0), 56);
                  capacity = readI32(componentData, 152);
                  const savedScratch4 = scratch;
                  const storedF322 = readF32(readI32(length), 876);
                  const resultOfF32 = f32(readF32(componentData, 104) + -0.5);
                  offset = readI32(componentData, 164);
                  writeF32(savedScratch4, f32(storedF322 * (offset ? -0.5 : resultOfF32)), 1052);
                  length = componentData + 152 | 0;
                  advanceTimedEntitiesAndAiDone30: {
                    advanceTimedEntitiesAndAiDone31: {
                      advanceTimedEntitiesAndAiDone32: {
                        advanceTimedEntitiesAndAiDone33: {
                          advanceTimedEntitiesAndAiDone34: {
                            if (+(capacity === 0)) {
                              break advanceTimedEntitiesAndAiDone34;
                            }
                            const resultOfTargetEligible = targetEligible(componentData, capacity);
                            if (resultOfTargetEligible) {
                              break advanceTimedEntitiesAndAiDone33;
                            }
                            if (+(readI32(componentData, 152) === 0)) {
                              break advanceTimedEntitiesAndAiDone34;
                            }
                            value = readI32(componentData, 156);
                            writeI32(value, readI32(componentData, 160), 8);
                            writeI32(readI32(componentData, 160), value, 4);
                            writeI32(componentData, length, 160);
                            writeI32(componentData, length, 156);
                            writeI32(componentData, 0, 152);
                          }
                          if (+(readU8(componentData, 108) === 0)) {
                            break advanceTimedEntitiesAndAiDone32;
                          }
                          writeI32(scratch, 0, 1048);
                          writeI32(scratch, scratch + 1048 | 0, 200);
                          value = readI32(readI32(componentData));
                          if (+(readU8(count, 80) === 0)) {
                            updateWorldTransform(count);
                          }
                          scaleF32 = readF32(componentData, 120);
                          amountF64 = readF64(count, 88);
                          valueF64 = readF64(count, 96);
                          writeI32(scratch, componentData, 216);
                          writeI32(scratch, scratch + 1136 | 0, 228);
                          writeI32(scratch, scratch + 1048 | 0, 224);
                          writeI32(scratch, scratch + 200 | 0, 220);
                          writeI32(scratch, scratch + 1032 | 0, 212);
                          writeI32(scratch, scratch + 1052 | 0, 208);
                          const savedScratch5 = scratch;
                          valueF32 = f32(scaleF32 + scaleF32);
                          writeF32(savedScratch5, valueF32, 1068);
                          writeF32(scratch, valueF32, 1064);
                          const savedScratch6 = scratch;
                          const savedValueF642 = valueF64;
                          valueF64 = scaleF32;
                          writeF32(savedScratch6, f32(savedValueF642 - valueF64), 1060);
                          writeF32(scratch, f32(amountF64 - valueF64), 1056);
                          findTarget(value + 2056 | 0, scratch + 1056 | 0, scratch + 208 | 0);
                          capacity = readI32(scratch, 1048);
                          if (+(capacity === 0)) {
                            break advanceTimedEntitiesAndAiDone32;
                          }
                          if (+(capacity !== readI32(componentData, 152))) {
                            value = readI32(componentData, 156);
                            writeI32(value, readI32(componentData, 160), 8);
                            writeI32(readI32(componentData, 160), value, 4);
                            writeI32(componentData, length, 160);
                            writeI32(componentData, 0, 152);
                            writeI32(componentData, readI32(capacity, 4), 152);
                            const savedComponentData4 = componentData;
                            value = readI32(capacity, 12);
                            writeI32(savedComponentData4, value, 160);
                            writeI32(value, length, 4);
                            writeI32(componentData, capacity + 4 | 0, 156);
                            writeI32(capacity, length, 12);
                          }
                          const savedComponentData5 = componentData;
                          scaleF32 = Math.min(readF32(componentData, 148), 500.0);
                          const savedScaleF32 = scaleF32;
                          valueF32 = readF32(componentData, 56);
                          writeF32(savedComponentData5, +(valueF32 < scaleF32) ? savedScaleF32 : valueF32, 56);
                        }
                        writeI32(scratch, readU8(componentData, 8) | 1, 208);
                        setFamilyFlags(componentData + 8 | 0, scratch + 208 | 0);
                        count = readI32(capacity, 168);
                        if (+(readU8(componentData, 110) === 0)) {
                          amountF64 = 0.0;
                          targetY = 0.0;
                          break advanceTimedEntitiesAndAiDone31;
                        }
                        value = readI32(scratch, 1032);
                        if (+(readU8(value, 80) === 0)) {
                          updateWorldTransform(value);
                        }
                        positionX = readF64(value, 96);
                        valueF64 = readF64(value, 88);
                        length = 1;
                        offset = 1;
                        if (+(readU8(count, 80) === 0)) {
                          updateWorldTransform(count);
                          offset = readU8(count, 80);
                        }
                        const savedValueF643 = valueF64;
                        amountF64 = readF64(count, 88);
                        valueF64 = savedValueF643 - amountF64;
                        const savedProduct = valueF64 * valueF64;
                        const savedPositionX = positionX;
                        targetY = readF64(count, 96);
                        valueF64 = savedPositionX - targetY;
                        valueF64 = Math.sqrt(savedProduct + valueF64 * valueF64) / readF32(componentData, 112);
                        if (+((offset & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                          length = readU8(count, 80);
                        }
                        angle = targetY + valueF64 * (readF64(count, 48) + readF64(count, 64));
                        rate = amountF64 + valueF64 * (readF64(count, 40) + readF64(count, 56));
                        if (+((length & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                        }
                        value = readI32(scratch, 1032);
                        if (+(readU8(value, 80) === 0)) {
                          updateWorldTransform(value);
                        }
                        positionX = readF64(value, 96);
                        valueF64 = readF64(value, 88);
                        length = 1;
                        offset = 1;
                        if (+(readU8(count, 80) === 0)) {
                          updateWorldTransform(count);
                          offset = readU8(count, 80);
                        }
                        scaleF32 = f32(angle - targetY);
                        valueF32 = f32(rate - amountF64);
                        const savedValueF644 = valueF64;
                        amountF64 = readF64(count, 88);
                        valueF64 = savedValueF644 - (amountF64 + valueF32);
                        const savedProduct2 = valueF64 * valueF64;
                        const savedPositionX2 = positionX;
                        targetY = readF64(count, 96);
                        valueF64 = savedPositionX2 - (targetY + scaleF32);
                        valueF64 = Math.sqrt(savedProduct2 + valueF64 * valueF64) / readF32(componentData, 112);
                        if (+((offset & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                          length = readU8(count, 80);
                        }
                        angle = targetY + valueF64 * (readF64(count, 48) + readF64(count, 64));
                        rate = amountF64 + valueF64 * (readF64(count, 40) + readF64(count, 56));
                        if (+((length & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                        }
                        value = readI32(scratch, 1032);
                        if (+(readU8(value, 80) === 0)) {
                          updateWorldTransform(value);
                        }
                        positionX = readF64(value, 96);
                        valueF64 = readF64(value, 88);
                        length = 1;
                        offset = 1;
                        if (+(readU8(count, 80) === 0)) {
                          updateWorldTransform(count);
                          offset = readU8(count, 80);
                        }
                        scaleF32 = f32(angle - targetY);
                        valueF32 = f32(rate - amountF64);
                        const savedValueF645 = valueF64;
                        amountF64 = readF64(count, 88);
                        valueF64 = savedValueF645 - (amountF64 + valueF32);
                        const savedProduct3 = valueF64 * valueF64;
                        const savedPositionX3 = positionX;
                        targetY = readF64(count, 96);
                        valueF64 = savedPositionX3 - (targetY + scaleF32);
                        valueF64 = Math.sqrt(savedProduct3 + valueF64 * valueF64) / readF32(componentData, 112);
                        if (+((offset & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                          length = readU8(count, 80);
                        }
                        positionX = targetY + valueF64 * (readF64(count, 48) + readF64(count, 64));
                        valueF64 = amountF64 + valueF64 * (readF64(count, 40) + readF64(count, 56));
                        if (+((length & 255) === 0)) {
                          updateWorldTransform(count);
                          targetY = readF64(count, 96);
                          amountF64 = readF64(count, 88);
                        }
                        targetY = f32(positionX - targetY);
                        amountF64 = f32(valueF64 - amountF64);
                        break advanceTimedEntitiesAndAiDone31;
                      }
                      writeI32(scratch, readU8(componentData, 8) & 254, 208);
                      setFamilyFlags(componentData + 8 | 0, scratch + 208 | 0);
                      radiusF32 = readF32(readI32(readI32(componentData), 188), 8);
                      value = readI32(scratch, 1032);
                      if (+(readU8(value, 80) === 0)) {
                        updateWorldTransform(value);
                      }
                      angle = readF64(value, 96);
                      rate = readF64(value, 88);
                      advanceTimedEntitiesAndAiDone35: {
                        if (+(offset === 0)) {
                          break advanceTimedEntitiesAndAiDone35;
                        }
                        advanceTimedEntitiesAndAiDone36: {
                          if (readU8(componentData, 184)) {
                            value = readI32(offset, 168);
                            if (+(readU8(value, 80) === 0)) {
                              updateWorldTransform(value);
                            }
                            valueF64 = readF32(componentData, 176) - readF64(value, 88);
                            const savedProduct4 = valueF64 * valueF64;
                            valueF64 = readF32(componentData, 180) - readF64(value, 96);
                            const savedSum = savedProduct4 + valueF64 * valueF64;
                            amountF64 = readF32(componentData, 136);
                            if (+(savedSum > amountF64 * amountF64)) {
                              break advanceTimedEntitiesAndAiDone36;
                            }
                            if (readU8(componentData, 184)) {
                              break advanceTimedEntitiesAndAiDone35;
                            }
                          }
                          value = readI32(scratch, 1032);
                          if (+(readU8(value, 80) === 0)) {
                            updateWorldTransform(value);
                          }
                          amountF64 = readF64(value, 96);
                          valueF64 = readF64(value, 88);
                          value = readI32(offset, 168);
                          if (+(readU8(value, 80) === 0)) {
                            updateWorldTransform(value);
                          }
                          valueF64 = valueF64 - readF64(value, 88);
                          const savedProduct5 = valueF64 * valueF64;
                          valueF64 = amountF64 - readF64(value, 96);
                          const savedSum2 = savedProduct5 + valueF64 * valueF64;
                          amountF64 = readF32(componentData, 136);
                          if (+(+(savedSum2 > amountF64 * amountF64) === 0)) {
                            break advanceTimedEntitiesAndAiDone35;
                          }
                        }
                        count = readI32(8573024);
                        value = divideUnsigned(count, 44488);
                        count = Math.imul(Math.imul(value, -44488) + count | 0, 48271);
                        const savedCount4 = count;
                        value = Math.imul(value, 3399);
                        length = (+(savedCount4 >>> 0 < value >>> 0) ? 2147483647 : 0) + (count - value | 0) | 0;
                        value = divideUnsigned(length, 44488);
                        count = Math.imul(Math.imul(value, -44488) + length | 0, 48271);
                        const savedCount5 = count;
                        value = Math.imul(value, 3399);
                        value = (+(savedCount5 >>> 0 < value >>> 0) ? 2147483647 : 0) + (count - value | 0) | 0;
                        writeI32(8573024, value);
                        amountF32 = f32(f32(f32((length - 1 | 0) >>> 0) * 4.656612873077393e-10) * f32(amountF64 * 0.9));
                        const savedAmountF322 = amountF32;
                        valueF32 = f32(f32((value - 1 | 0) >>> 0) * 2.925836239953128e-09);
                        const resultOfSinF32 = sinF32(valueF32);
                        scaleF32 = f32(savedAmountF322 * resultOfSinF32);
                        const savedAmountF323 = amountF32;
                        const resultOfCosF32 = cosF32(valueF32);
                        valueF32 = f32(savedAmountF323 * resultOfCosF32);
                        value = readI32(offset, 168);
                        if (+(readU8(value, 80) === 0)) {
                          updateWorldTransform(value);
                        }
                        valueF64 = readF64(value, 88);
                        writeF32(componentData, f32(readF64(value, 96) + scaleF32), 180);
                        writeF32(componentData, f32(valueF64 + valueF32), 176);
                        if (readU8(componentData, 184)) {
                          break advanceTimedEntitiesAndAiDone35;
                        }
                        writeU8(componentData, 1, 184);
                      }
                      let selectedValue9;
                      advanceTimedEntitiesAndAiDone37: {
                        advanceTimedEntitiesAndAiDone38: {
                          advanceTimedEntitiesAndAiDone39: {
                            length = readU8(componentData, 184);
                            if (length) {
                              scaleF32 = readF32(scratch, 1052);
                              break advanceTimedEntitiesAndAiDone39;
                            }
                            value = readI32(scratch, 1032);
                            if (+(readU8(value, 80) === 0)) {
                              updateWorldTransform(value);
                            }
                            const storedF64 = readF64(value, 88);
                            scaleF32 = readF32(scratch, 1052);
                            if (+(storedF64 < scaleF32)) {
                              writeF32(componentData, f32(angle), 180);
                              writeF32(componentData, f32(scaleF32 + 100.0), 176);
                              length = readU8(componentData, 184);
                              if (length) {
                                break advanceTimedEntitiesAndAiDone39;
                              }
                              length = 1;
                              writeU8(componentData, 1, 184);
                              break advanceTimedEntitiesAndAiDone39;
                            }
                            length = readU8(componentData, 184);
                            if (+(length === 0)) {
                              break advanceTimedEntitiesAndAiDone38;
                            }
                          }
                          const savedRadiusF32 = radiusF32;
                          const savedScaleF322 = scaleF32;
                          amountF32 = readF32(node, 876);
                          valueF32 = f32(amountF32 * -0.5);
                          valueF64 = f32(savedRadiusF32 + (+(valueF32 < scaleF32) ? savedScaleF322 : valueF32));
                          amountF64 = f32(f32(amountF32 * 0.5) - radiusF32);
                          valueF32 = readF32(componentData, 176);
                          advanceTimedEntitiesAndAiLoop2: while (true) {
                            positionX = amountF64;
                            amountF64 = valueF64;
                            const savedAmountF64 = amountF64;
                            valueF64 = positionX;
                            if (+(savedAmountF64 > valueF64)) {
                              continue advanceTimedEntitiesAndAiLoop2;
                            }
                            break;
                          }
                          const savedComponentData6 = componentData;
                          const savedAmountF642 = amountF64;
                          const savedValueF646 = valueF64;
                          positionX = valueF32;
                          scaleF32 = f32(+(amountF64 > positionX) ? savedAmountF642 : +(valueF64 < positionX) ? savedValueF646 : positionX);
                          writeF32(savedComponentData6, scaleF32, 176);
                          amountF32 = readF32(componentData, 180);
                          valueF32 = f32(readF32(node, 964) * 0.5);
                          amountF64 = f32(valueF32 - radiusF32);
                          valueF64 = f32(radiusF32 - valueF32);
                          advanceTimedEntitiesAndAiLoop3: while (true) {
                            positionX = amountF64;
                            amountF64 = valueF64;
                            const savedAmountF643 = amountF64;
                            valueF64 = positionX;
                            if (+(savedAmountF643 > valueF64)) {
                              continue advanceTimedEntitiesAndAiLoop3;
                            }
                            break;
                          }
                          const savedComponentData7 = componentData;
                          const savedAmountF644 = amountF64;
                          const savedValueF647 = valueF64;
                          positionX = amountF32;
                          amountF32 = f32(+(amountF64 > positionX) ? savedAmountF644 : +(valueF64 < positionX) ? savedValueF647 : positionX);
                          writeF32(savedComponentData7, amountF32, 180);
                          value = readI32(scratch, 1032);
                          if (+(readU8(value, 80) === 0)) {
                            updateWorldTransform(value);
                            amountF32 = readF32(componentData, 180);
                            scaleF32 = readF32(componentData, 176);
                            length = readU8(componentData, 184);
                          }
                          valueF64 = readF64(value, 88) - scaleF32;
                          const savedProduct6 = valueF64 * valueF64;
                          valueF64 = readF64(value, 96) - amountF32;
                          if (+(savedProduct6 + valueF64 * valueF64 < 2500.0)) {
                            if (+((length & 255) === 0)) {
                              break advanceTimedEntitiesAndAiDone38;
                            }
                            writeU8(componentData, 0, 184);
                            break advanceTimedEntitiesAndAiDone38;
                          }
                          if (+((length & 255) === 0)) {
                            break advanceTimedEntitiesAndAiDone38;
                          }
                          length = componentData + 116 | 0;
                          selectedValue9 = 1;
                          break advanceTimedEntitiesAndAiDone37;
                        }
                        length = componentData + 72 | 0;
                        selectedValue9 = 0;
                      }
                      value = selectedValue9;
                      amountF32 = readF32(length);
                      entity = readI32(readI32(componentData), 192);
                      if (entity) {
                        advanceTimedEntitiesAndAiDone40: {
                          count = readI32(entity, 16);
                          if (+(count === 0)) {
                            scaleF32 = 1.0;
                            break advanceTimedEntitiesAndAiDone40;
                          }
                          scaleF32 = 1.0;
                          end = readI32(entity, 24);
                          value = end;
                          offset = count << 2;
                          capacity = offset - 4 | 0;
                          length = ((capacity >>> 2 | 0) + 1 | 0) & 3;
                          if (length) {
                            do {
                              const savedScaleF323 = scaleF32;
                              count = readI32(value);
                              const resultOfIndirect = runtime.indirect({
                                parameters: [ "i32" ],
                                results: [ "f32" ]
                              }, readI32(readI32(count), 20), count);
                              scaleF32 = f32(savedScaleF323 * resultOfIndirect);
                              value = value + 4 | 0;
                              length = length - 1 | 0;
                            } while (length);
                          }
                          if (+(capacity >>> 0 <= 11)) {
                            break advanceTimedEntitiesAndAiDone40;
                          }
                          length = offset + end | 0;
                          [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                        }
                        advanceTimedEntitiesAndAiDone41: {
                          count = readI32(entity, 28);
                          if (+(count === 0)) {
                            break advanceTimedEntitiesAndAiDone41;
                          }
                          end = readI32(entity, 36);
                          value = end;
                          offset = count << 2;
                          capacity = offset - 4 | 0;
                          length = ((capacity >>> 2 | 0) + 1 | 0) & 3;
                          if (length) {
                            do {
                              const savedScaleF324 = scaleF32;
                              count = readI32(value);
                              const resultOfIndirect2 = runtime.indirect({
                                parameters: [ "i32" ],
                                results: [ "f32" ]
                              }, readI32(readI32(count), 20), count);
                              scaleF32 = f32(savedScaleF324 * resultOfIndirect2);
                              value = value + 4 | 0;
                              length = length - 1 | 0;
                            } while (length);
                          }
                          if (+(capacity >>> 0 < 12)) {
                            break advanceTimedEntitiesAndAiDone41;
                          }
                          length = offset + end | 0;
                          [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                        }
                        amountF32 = f32(amountF32 * scaleF32);
                        value = readU8(componentData, 184);
                      }
                      valueF32 = readF32(componentData, 60);
                      scaleF32 = readU8(componentData, 48) ? valueF32 : -valueF32;
                      advanceTimedEntitiesAndAiDone42: {
                        if (value & 255) {
                          break advanceTimedEntitiesAndAiDone42;
                        }
                        if (+(readU8(componentData, 76) === 0)) {
                          break advanceTimedEntitiesAndAiDone42;
                        }
                        valueF64 = readF32(componentData, 80);
                        readClock(scratch + 208 | 0);
                        const savedAmountF324 = amountF32;
                        let selectedValue10;
                        advanceTimedEntitiesAndAiDone43: {
                          if (+(readU8(scratch, 208) === 0)) {
                            selectedValue10 = Infinity;
                            break advanceTimedEntitiesAndAiDone43;
                          }
                          if (+(readU8(componentData, 16) === 0)) {
                            selectedValue10 = -Infinity;
                            break advanceTimedEntitiesAndAiDone43;
                          }
                          void -Infinity;
                          selectedValue10 = readF64(scratch, 216) - readF64(componentData, 24);
                        }
                        const resultOfCosF64 = cosF64(selectedValue10 * valueF64);
                        const resultOfPowF64 = powF64(0.5 - resultOfCosF64 * 0.5, readF32(componentData, 84));
                        valueF32 = f32(resultOfPowF64);
                        amountF32 = f32(savedAmountF324 * valueF32);
                        scaleF32 = f32(scaleF32 * valueF32);
                      }
                      advanceTimedEntitiesAndAiDone44: {
                        if (+(readU8(componentData, 32) === 0)) {
                          break advanceTimedEntitiesAndAiDone44;
                        }
                        advanceTimedEntitiesAndAiLoop4: while (true) {
                          readClock(scratch + 208 | 0);
                          value = readU8(componentData, 32);
                          advanceTimedEntitiesAndAiDone45: {
                            if (readU8(scratch, 208)) {
                              if (+(value === 0)) {
                                break advanceTimedEntitiesAndAiDone45;
                              }
                              if (+(+(readF64(scratch, 216) < readF64(componentData, 40)) === 0)) {
                                break advanceTimedEntitiesAndAiDone45;
                              }
                              break advanceTimedEntitiesAndAiDone44;
                            }
                            if (value) {
                              break advanceTimedEntitiesAndAiDone44;
                            }
                          }
                          writeU8(componentData, 1, 32);
                          writeF64(componentData, readF64(componentData, 40) + readF32(componentData, 100), 40);
                          count = readI32(8573024);
                          value = divideUnsigned(count, 44488);
                          count = Math.imul(Math.imul(value, -44488) + count | 0, 48271);
                          const savedCount6 = count;
                          value = Math.imul(value, 3399);
                          value = (+(savedCount6 >>> 0 < value >>> 0) ? 2147483647 : 0) + (count - value | 0) | 0;
                          writeI32(8573024, value);
                          writeF32(componentData, f32(f32((value - 1 | 0) >>> 0) * 2.925836239953128e-09), 52);
                          continue advanceTimedEntitiesAndAiLoop4;
                          break;
                        }
                        throw new WebAssembly.RuntimeError("unreachable");
                      }
                      const savedComponentData8 = componentData;
                      valueF32 = f32(f32(scaleF32 * stepF32) * 0.001 + readF32(componentData, 52));
                      writeF32(savedComponentData8, valueF32, 52);
                      writeI64(scratch, 4618760256179416344n, 152);
                      writeF64(scratch, valueF32, 144);
                      const savedComponentData9 = componentData;
                      const hostResult = runtime.host("a", "a", 22903, 6924, scratch + 144 | 0);
                      valueF64 = hostResult;
                      valueF64 = +(valueF64 < -3.141592653589793) ? valueF64 + 6.283185307179586 : valueF64;
                      scaleF32 = f32(+(valueF64 > 3.141592653589793) ? valueF64 + -6.283185307179586 : valueF64);
                      writeF32(savedComponentData9, scaleF32, 52);
                      advanceTimedEntitiesAndAiDone46: {
                        if (+(+(rate < f32(f32(radiusF32 + f32(readF32(node, 876) * -0.5)) + 10.0)) === 0)) {
                          break advanceTimedEntitiesAndAiDone46;
                        }
                        valueF64 = scaleF32;
                        if (+((+(valueF64 > 1.5707963267948966) ? 1 : +(valueF64 < -1.5707963267948966)) === 0)) {
                          break advanceTimedEntitiesAndAiDone46;
                        }
                        writeI64(scratch, 4618760256179416344n, 136);
                        writeF64(scratch, 3.141592653589793 - valueF64, 128);
                        const savedComponentData10 = componentData;
                        const hostResult2 = runtime.host("a", "a", 22903, 6924, scratch + 128 | 0);
                        valueF64 = hostResult2;
                        valueF64 = +(valueF64 < -3.141592653589793) ? valueF64 + 6.283185307179586 : valueF64;
                        scaleF32 = f32(+(valueF64 > 3.141592653589793) ? valueF64 + -6.283185307179586 : valueF64);
                        writeF32(savedComponentData10, scaleF32, 52);
                      }
                      advanceTimedEntitiesAndAiDone47: {
                        if (+(+(angle < f32(f32(radiusF32 + f32(readF32(node, 964) * -0.5)) + 10.0)) === 0)) {
                          break advanceTimedEntitiesAndAiDone47;
                        }
                        if (+(+(scaleF32 < 0.0) === 0)) {
                          break advanceTimedEntitiesAndAiDone47;
                        }
                        writeI64(scratch, 4618760256179416344n, 120);
                        writeF64(scratch, -scaleF32, 112);
                        const savedComponentData11 = componentData;
                        const hostResult3 = runtime.host("a", "a", 22903, 6924, scratch + 112 | 0);
                        valueF64 = hostResult3;
                        valueF64 = +(valueF64 < -3.141592653589793) ? valueF64 + 6.283185307179586 : valueF64;
                        scaleF32 = f32(+(valueF64 > 3.141592653589793) ? valueF64 + -6.283185307179586 : valueF64);
                        writeF32(savedComponentData11, scaleF32, 52);
                      }
                      advanceTimedEntitiesAndAiDone48: {
                        if (+(+(rate > f32(f32(f32(readF32(node, 876) * 0.5) - radiusF32) + -10.0)) === 0)) {
                          break advanceTimedEntitiesAndAiDone48;
                        }
                        valueF64 = scaleF32;
                        if (+(+(valueF64 > -1.5707963267948966) === 0)) {
                          break advanceTimedEntitiesAndAiDone48;
                        }
                        if (+(+(valueF64 < 1.5707963267948966) === 0)) {
                          break advanceTimedEntitiesAndAiDone48;
                        }
                        writeI64(scratch, 4618760256179416344n, 104);
                        writeF64(scratch, 3.141592653589793 - valueF64, 96);
                        const savedComponentData12 = componentData;
                        const hostResult4 = runtime.host("a", "a", 22903, 6924, scratch + 96 | 0);
                        valueF64 = hostResult4;
                        valueF64 = +(valueF64 < -3.141592653589793) ? valueF64 + 6.283185307179586 : valueF64;
                        scaleF32 = f32(+(valueF64 > 3.141592653589793) ? valueF64 + -6.283185307179586 : valueF64);
                        writeF32(savedComponentData12, scaleF32, 52);
                      }
                      advanceTimedEntitiesAndAiDone49: {
                        if (+(+(angle > f32(f32(f32(readF32(node, 964) * 0.5) - radiusF32) + -10.0)) === 0)) {
                          break advanceTimedEntitiesAndAiDone49;
                        }
                        if (+(+(scaleF32 > 0.0) === 0)) {
                          break advanceTimedEntitiesAndAiDone49;
                        }
                        writeI64(scratch, 4618760256179416344n, 88);
                        writeF64(scratch, -scaleF32, 80);
                        const savedComponentData13 = componentData;
                        const hostResult5 = runtime.host("a", "a", 22903, 6924, scratch + 80 | 0);
                        valueF64 = hostResult5;
                        valueF64 = +(valueF64 < -3.141592653589793) ? valueF64 + 6.283185307179586 : valueF64;
                        scaleF32 = f32(+(valueF64 > 3.141592653589793) ? valueF64 + -6.283185307179586 : valueF64);
                        writeF32(savedComponentData13, scaleF32, 52);
                      }
                      if (readU8(componentData, 88)) {
                        amountF64 = readF32(componentData, 92);
                        valueF64 = readF32(componentData, 96);
                        readClock(scratch + 208 | 0);
                        let selectedValue11;
                        advanceTimedEntitiesAndAiDone50: {
                          if (+(readU8(scratch, 208) === 0)) {
                            selectedValue11 = Infinity;
                            break advanceTimedEntitiesAndAiDone50;
                          }
                          if (+(readU8(componentData, 16) === 0)) {
                            selectedValue11 = -Infinity;
                            break advanceTimedEntitiesAndAiDone50;
                          }
                          void -Infinity;
                          selectedValue11 = readF64(scratch, 216) - readF64(componentData, 24);
                        }
                        const resultOfSinF64 = sinF64(selectedValue11 * amountF64);
                        scaleF32 = f32(resultOfSinF64 * valueF64 + scaleF32);
                      }
                      if (readU8(componentData, 184)) {
                        value = readI32(scratch, 1032);
                        if (+(readU8(value, 80) === 0)) {
                          updateWorldTransform(value);
                        }
                        scaleF32 = f32(atan2F64(readF32(componentData, 180) - readF64(value, 96), readF32(componentData, 176) - readF64(value, 88)));
                      }
                      capacity = readI32(scratch, 1032);
                      advanceTimedEntitiesAndAiDone51: {
                        if (readU8(componentData - -64 | 0)) {
                          advanceTimedEntitiesAndAiDone52: {
                            if (+(readU8(capacity, 80) === 0)) {
                              break advanceTimedEntitiesAndAiDone52;
                            }
                            writeU8(capacity, 0, 80);
                            count = readI32(readI32(capacity), 84);
                            if (+(count === 0)) {
                              break advanceTimedEntitiesAndAiDone52;
                            }
                            do {
                              value = readI32(count, 8);
                              invalidateDescendant(count);
                              count = value;
                            } while (count);
                          }
                          writeI64(scratch, 4618760256179416344n, 72);
                          writeF64(scratch, scaleF32, 64);
                          const savedScratch7 = scratch;
                          const hostResult6 = runtime.host("a", "a", 22903, 6924, scratch - -64 | 0);
                          writeF64(savedScratch7, hostResult6, 208);
                          setLocalAngle(capacity + 8 | 0, scratch + 208 | 0);
                          break advanceTimedEntitiesAndAiDone51;
                        }
                        valueF32 = f32(f32(readF32(componentData, 68) * stepF32) * 0.001);
                        if (+(Math.abs(valueF32) < 1.1920928955078125e-07)) {
                          break advanceTimedEntitiesAndAiDone51;
                        }
                        length = capacity + 8 | 0;
                        valueF32 = f32(readF64(capacity, 8) + valueF32);
                        advanceTimedEntitiesAndAiDone53: {
                          if (+(readU8(capacity, 80) === 0)) {
                            break advanceTimedEntitiesAndAiDone53;
                          }
                          writeU8(capacity, 0, 80);
                          count = readI32(readI32(capacity), 84);
                          if (+(count === 0)) {
                            break advanceTimedEntitiesAndAiDone53;
                          }
                          do {
                            value = readI32(count, 8);
                            invalidateDescendant(count);
                            count = value;
                          } while (count);
                        }
                        writeI64(scratch, 4618760256179416344n, 56);
                        writeF64(scratch, valueF32, 48);
                        const savedScratch8 = scratch;
                        const hostResult7 = runtime.host("a", "a", 22903, 6924, scratch + 48 | 0);
                        writeF64(savedScratch8, hostResult7, 208);
                        setLocalAngle(length, scratch + 208 | 0);
                      }
                      valueF32 = cosF32(scaleF32);
                      value = readI32(scratch, 1032);
                      const savedValue13 = value;
                      const storedF642 = readF64(value, 40);
                      const savedValueF32 = valueF32;
                      amountF32 = f32(f32(amountF32 * stepF32) * 0.001);
                      writeF64(savedValue13, storedF642 + f32(savedValueF32 * amountF32), 40);
                      valueF32 = sinF32(scaleF32);
                      writeF64(value, readF64(value, 48) + f32(valueF32 * amountF32), 48);
                      break advanceTimedEntitiesAndAiDone30;
                    }
                    value = readI32(scratch, 1032);
                    if (+(readU8(value, 80) === 0)) {
                      updateWorldTransform(value);
                    }
                    valueF64 = readF64(value, 96);
                    positionX = readF64(value, 88);
                    if (+(readU8(count, 80) === 0)) {
                      updateWorldTransform(count);
                    }
                    valueF64 = valueF64 - (readF64(count, 96) + targetY);
                    angle = valueF64 * valueF64;
                    valueF64 = positionX - (readF64(count, 88) + amountF64);
                    rate = valueF64 * valueF64;
                    value = readI32(scratch, 1032);
                    if (+(readU8(value, 80) === 0)) {
                      updateWorldTransform(value);
                    }
                    positionX = readF64(value, 96);
                    valueF64 = readF64(value, 88);
                    if (+(readU8(count, 80) === 0)) {
                      updateWorldTransform(count);
                    }
                    amountF32 = f32(atan2F64(readF64(count, 96) + targetY - positionX, readF64(count, 88) + amountF64 - valueF64));
                    length = readI32(scratch, 1032);
                    value = readU8(length, 80);
                    advanceTimedEntitiesAndAiDone54: {
                      advanceTimedEntitiesAndAiDone55: {
                        const savedSum3 = rate + angle;
                        valueF64 = readF32(componentData, 128);
                        if (+(savedSum3 < valueF64 * valueF64)) {
                          advanceTimedEntitiesAndAiDone56: {
                            if (+(value === 0)) {
                              break advanceTimedEntitiesAndAiDone56;
                            }
                            writeU8(length, 0, 80);
                            value = readI32(readI32(length), 84);
                            if (+(value === 0)) {
                              break advanceTimedEntitiesAndAiDone56;
                            }
                            do {
                              count = readI32(value, 8);
                              invalidateDescendant(value);
                              value = count;
                            } while (value);
                          }
                          writeI64(scratch, 4618760256179416344n, 168);
                          const savedScratch9 = scratch;
                          valueF64 = amountF32;
                          writeF64(savedScratch9, valueF64, 160);
                          const savedScratch10 = scratch;
                          const hostResult8 = runtime.host("a", "a", 22903, 6924, scratch + 160 | 0);
                          writeF64(savedScratch10, hostResult8, 208);
                          setLocalAngle(length + 8 | 0, scratch + 208 | 0);
                          valueF32 = readF32(componentData, 132);
                          amountF32 = f32(valueF64 + 1.5707963267948966);
                          const resultOfSinF322 = sinF32(amountF32);
                          scaleF32 = f32(f32(valueF32 * stepF32) * 0.001);
                          valueF32 = f32(resultOfSinF322 * scaleF32);
                          const resultOfCosF322 = cosF32(amountF32);
                          amountF32 = f32(resultOfCosF322 * scaleF32);
                          node = readI32(readI32(componentData), 192);
                          if (+(node === 0)) {
                            break advanceTimedEntitiesAndAiDone54;
                          }
                          count = readI32(node, 16);
                          if (+(count === 0)) {
                            scaleF32 = 1.0;
                            break advanceTimedEntitiesAndAiDone55;
                          }
                          scaleF32 = 1.0;
                          entity = readI32(node, 24);
                          value = entity;
                          end = count << 2;
                          offset = end - 4 | 0;
                          length = ((offset >>> 2 | 0) + 1 | 0) & 3;
                          if (length) {
                            do {
                              const savedScaleF325 = scaleF32;
                              count = readI32(value);
                              const resultOfIndirect3 = runtime.indirect({
                                parameters: [ "i32" ],
                                results: [ "f32" ]
                              }, readI32(readI32(count), 20), count);
                              scaleF32 = f32(savedScaleF325 * resultOfIndirect3);
                              value = value + 4 | 0;
                              length = length - 1 | 0;
                            } while (length);
                          }
                          if (+(offset >>> 0 <= 11)) {
                            break advanceTimedEntitiesAndAiDone55;
                          }
                          length = entity + end | 0;
                          [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                          break advanceTimedEntitiesAndAiDone55;
                        }
                        advanceTimedEntitiesAndAiDone57: {
                          if (+(value === 0)) {
                            break advanceTimedEntitiesAndAiDone57;
                          }
                          writeU8(length, 0, 80);
                          value = readI32(readI32(length), 84);
                          if (+(value === 0)) {
                            break advanceTimedEntitiesAndAiDone57;
                          }
                          do {
                            count = readI32(value, 8);
                            invalidateDescendant(value);
                            value = count;
                          } while (value);
                        }
                        writeI64(scratch, 4618760256179416344n, 184);
                        writeF64(scratch, amountF32, 176);
                        const savedScratch11 = scratch;
                        const hostResult9 = runtime.host("a", "a", 22903, 6924, scratch + 176 | 0);
                        writeF64(savedScratch11, hostResult9, 208);
                        setLocalAngle(length + 8 | 0, scratch + 208 | 0);
                        valueF32 = readF32(componentData, 116);
                        const resultOfSinF323 = sinF32(amountF32);
                        scaleF32 = f32(f32(valueF32 * stepF32) * 0.001);
                        valueF32 = f32(resultOfSinF323 * scaleF32);
                        const resultOfCosF323 = cosF32(amountF32);
                        amountF32 = f32(resultOfCosF323 * scaleF32);
                        node = readI32(readI32(componentData), 192);
                        if (+(node === 0)) {
                          break advanceTimedEntitiesAndAiDone54;
                        }
                        advanceTimedEntitiesAndAiDone58: {
                          count = readI32(node, 16);
                          if (+(count === 0)) {
                            scaleF32 = 1.0;
                            break advanceTimedEntitiesAndAiDone58;
                          }
                          scaleF32 = 1.0;
                          entity = readI32(node, 24);
                          value = entity;
                          end = count << 2;
                          offset = end - 4 | 0;
                          length = ((offset >>> 2 | 0) + 1 | 0) & 3;
                          if (length) {
                            do {
                              const savedScaleF326 = scaleF32;
                              count = readI32(value);
                              const resultOfIndirect4 = runtime.indirect({
                                parameters: [ "i32" ],
                                results: [ "f32" ]
                              }, readI32(readI32(count), 20), count);
                              scaleF32 = f32(savedScaleF326 * resultOfIndirect4);
                              value = value + 4 | 0;
                              length = length - 1 | 0;
                            } while (length);
                          }
                          if (+(offset >>> 0 <= 11)) {
                            break advanceTimedEntitiesAndAiDone58;
                          }
                          length = entity + end | 0;
                          [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                        }
                        advanceTimedEntitiesAndAiDone59: {
                          count = readI32(node, 28);
                          if (+(count === 0)) {
                            break advanceTimedEntitiesAndAiDone59;
                          }
                          entity = readI32(node, 36);
                          value = entity;
                          end = count << 2;
                          offset = end - 4 | 0;
                          length = ((offset >>> 2 | 0) + 1 | 0) & 3;
                          if (length) {
                            do {
                              const savedScaleF327 = scaleF32;
                              count = readI32(value);
                              const resultOfIndirect5 = runtime.indirect({
                                parameters: [ "i32" ],
                                results: [ "f32" ]
                              }, readI32(readI32(count), 20), count);
                              scaleF32 = f32(savedScaleF327 * resultOfIndirect5);
                              value = value + 4 | 0;
                              length = length - 1 | 0;
                            } while (length);
                          }
                          if (+(offset >>> 0 < 12)) {
                            break advanceTimedEntitiesAndAiDone59;
                          }
                          length = entity + end | 0;
                          [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                        }
                        valueF32 = f32(valueF32 * scaleF32);
                        amountF32 = f32(amountF32 * scaleF32);
                        break advanceTimedEntitiesAndAiDone54;
                      }
                      advanceTimedEntitiesAndAiDone60: {
                        count = readI32(node, 28);
                        if (+(count === 0)) {
                          break advanceTimedEntitiesAndAiDone60;
                        }
                        entity = readI32(node, 36);
                        value = entity;
                        end = count << 2;
                        offset = end - 4 | 0;
                        length = ((offset >>> 2 | 0) + 1 | 0) & 3;
                        if (length) {
                          do {
                            const savedScaleF328 = scaleF32;
                            count = readI32(value);
                            const resultOfIndirect6 = runtime.indirect({
                              parameters: [ "i32" ],
                              results: [ "f32" ]
                            }, readI32(readI32(count), 20), count);
                            scaleF32 = f32(savedScaleF328 * resultOfIndirect6);
                            value = value + 4 | 0;
                            length = length - 1 | 0;
                          } while (length);
                        }
                        if (+(offset >>> 0 < 12)) {
                          break advanceTimedEntitiesAndAiDone60;
                        }
                        length = entity + end | 0;
                        [scaleF32, value, count] = multiplyBehaviorModifiers(scaleF32, value, length);
                      }
                      valueF32 = f32(valueF32 * scaleF32);
                      amountF32 = f32(amountF32 * scaleF32);
                    }
                    value = readI32(scratch, 1032);
                    writeF64(value, readF64(value, 40) + amountF32, 40);
                    writeF64(value, readF64(value, 48) + valueF32, 48);
                    value = readI32(componentData, 144);
                    if (+(value === 0)) {
                      break advanceTimedEntitiesAndAiDone30;
                    }
                    valueF32 = readF32(componentData, 56);
                    if (+(+(valueF32 <= 0.0) === 0)) {
                      break advanceTimedEntitiesAndAiDone30;
                    }
                    writeF32(componentData, f32(valueF32 + readF32(componentData, 148)), 56);
                    runtime.indirect({
                      parameters: [ "i32", "i32" ],
                      results: []
                    }, value, readI32(componentData), capacity);
                  }
                  capacity = readI32(23008);
                }
                cursor = cursor + 1 | 0;
              } while (+(cursor >>> 0 < capacity >>> 0));
            }
            count = readI32(23396);
            if (count) {
              do {
                offset = readI32(readI32(23404) + (flag << 2) | 0);
                value = readI32(offset, 8);
                if (+(value >>> 0 <= 32)) {
                  count = readI32(offset);
                  cursor = readI32(count, 164);
                  scaleF32 = f32(readF32(cursor, 8) / readF32(cursor, 12));
                  advanceTimedEntitiesAndAiLoop5: while (true) {
                    const savedScaleF329 = scaleF32;
                    value = value << 3;
                    if (+(+(savedScaleF329 > readF32(value + 4848 | 0)) === 0)) {
                      value = readU8(value + 4852 | 0) + 7 | 0;
                      cursor = readI32(count, 168);
                      let selectedValue12;
                      if (readU8(cursor, 80)) {
                        selectedValue12 = count;
                      } else {
                        updateWorldTransform(cursor);
                        selectedValue12 = readI32(offset);
                      }
                      end = spawnEntity(readI32(selectedValue12) + 1936 | 0, value & 255, readF64(cursor, 88), readF64(cursor, 96), -1);
                      count = readI32(8573024);
                      value = divideUnsigned(count, 44488);
                      count = Math.imul(Math.imul(value, -44488) + count | 0, 48271);
                      const savedCount7 = count;
                      value = Math.imul(value, 3399);
                      value = (+(savedCount7 >>> 0 < value >>> 0) ? 2147483647 : 0) + (count - value | 0) | 0;
                      writeI32(8573024, value);
                      const savedScratch12 = scratch;
                      length = readI32(offset);
                      writeI32(savedScratch12, length, 208);
                      amountF32 = f32(f32((value - 1 | 0) >>> 0) * 2.925836239953128e-09);
                      advanceTimedEntitiesAndAiDone61: {
                        if (+(length === 0)) {
                          count = readI32(end, 44);
                          if (count) {
                            writeI32(count, readI32(count) - 1 | 0);
                            cursor = readI32(end, 52);
                            advanceTimedEntitiesAndAiDone62: {
                              value = readI32(end, 48);
                              if (value) {
                                writeI32(value, cursor, 8);
                                cursor = readI32(end, 52);
                                break advanceTimedEntitiesAndAiDone62;
                              }
                              writeI32(count, cursor, 4);
                            }
                            writeI32(cursor ? cursor + 4 | 0 : count + 8 | 0, value);
                            writeI32(end, 0, 52);
                            writeI64(end, 0n, 44);
                          }
                          if (+((readU8(end, 93) & 64) === 0)) {
                            break advanceTimedEntitiesAndAiDone61;
                          }
                          setOwnerReference(end + 236 | 0, scratch + 208 | 0);
                          break advanceTimedEntitiesAndAiDone61;
                        }
                        if (+((readU8(end, 93) & 64) === 0)) {
                          cursor = end + 216 | 0;
                          writeI32(cursor, end);
                          count = readI32(readI32(end), 2140);
                          writeI64(end, 0n, 248);
                          const savedEnd = end;
                          value = end + 236 | 0;
                          writeI32(savedEnd, value, 244);
                          writeI32(end, value, 240);
                          writeI32(end, 0, 236);
                          const savedEnd2 = end;
                          value = end + 224 | 0;
                          writeI32(savedEnd2, value, 232);
                          writeI32(end, value, 228);
                          writeI32(end, 0, 224);
                          writeI32(end, count, 220);
                          attachOwnershipComponent(end, cursor);
                        }
                        setOwnerReference(end + 236 | 0, scratch + 208 | 0);
                        count = readI32(end, 44);
                        if (count) {
                          writeI32(count, readI32(count) - 1 | 0);
                          capacity = readI32(end, 52);
                          advanceTimedEntitiesAndAiDone63: {
                            value = readI32(end, 48);
                            if (value) {
                              writeI32(value, capacity, 8);
                              capacity = readI32(end, 52);
                              break advanceTimedEntitiesAndAiDone63;
                            }
                            writeI32(count, capacity, 4);
                          }
                          writeI32(capacity ? capacity + 4 | 0 : count + 8 | 0, value);
                        }
                        count = end + 44 | 0;
                        writeI32(length, readI32(length, 68) + 1 | 0, 68);
                        writeI32(end, length + 68 | 0, 44);
                        value = readI32(length, 76);
                        writeI32(end, 0, 52);
                        writeI32(end, value, 48);
                        if (+(readI32(length, 72) === 0)) {
                          writeI32(length, count, 72);
                        }
                        if (value) {
                          writeI32(value, count, 8);
                        }
                        writeI32(length, count, 76);
                      }
                      valueF32 = cosF32(amountF32);
                      value = readI32(end, 168);
                      writeF64(value, readF64(value, 40) + f32(valueF32 * 0.25), 40);
                      valueF32 = sinF32(amountF32);
                      writeF64(value, readF64(value, 48) + f32(valueF32 * 0.25), 48);
                      count = readI32(offset);
                      const savedCount8 = count;
                      capacity = readI32(end, 104);
                      if (+(savedCount8 !== readI32(capacity, 164))) {
                        value = readI32(capacity, 168);
                        const savedValue14 = value;
                        cursor = capacity + 172 | 0;
                        writeI32(savedValue14, readI32(cursor), 8);
                        writeI32(readI32(capacity, 172), value, 4);
                        const savedCapacity = capacity;
                        length = capacity + 164 | 0;
                        writeI32(savedCapacity, length, 172);
                        writeI32(capacity, 0, 164);
                        const savedCapacity2 = capacity;
                        let selectedValue13;
                        advanceTimedEntitiesAndAiDone64: {
                          if (+(count === 0)) {
                            writeI32(length, 0);
                            selectedValue13 = length;
                            break advanceTimedEntitiesAndAiDone64;
                          }
                          writeI32(length, readI32(count, 4));
                          const savedCapacity3 = capacity;
                          cursor = count + 12 | 0;
                          value = readI32(cursor);
                          writeI32(savedCapacity3, value, 172);
                          writeI32(value, length, 4);
                          selectedValue13 = count + 4 | 0;
                        }
                        writeI32(savedCapacity2, selectedValue13, 168);
                        writeI32(cursor, length);
                      }
                      const savedOffset = offset;
                      value = readI32(offset, 8) + 1 | 0;
                      writeI32(savedOffset, value, 8);
                      if (+(value >>> 0 < 33)) {
                        continue advanceTimedEntitiesAndAiLoop5;
                      }
                    }
                    break;
                  }
                  count = readI32(23396);
                }
                flag = flag + 1 | 0;
              } while (+(flag >>> 0 < count >>> 0));
            }
            advanceTimedEntitiesAndAiDone65: {
              if (+(readU8(24896) === 0)) {
                break advanceTimedEntitiesAndAiDone65;
              }
              readClock(scratch + 208 | 0);
              value = readU8(24896);
              if (readU8(scratch, 208)) {
                if (+(value === 0)) {
                  break advanceTimedEntitiesAndAiDone65;
                }
                if (+(+(readF64(scratch, 216) < readF64(24904)) === 0)) {
                  break advanceTimedEntitiesAndAiDone65;
                }
                break advanceTimedEntitiesAndAiDone27;
              }
              if (value) {
                break advanceTimedEntitiesAndAiDone27;
              }
            }
            readClock(scratch + 208 | 0);
            writeU8(24896, 1);
            writeF64(24904, readF64(scratch, 216) + 1000.0);
            value = readI32(25032);
            if (+(value === 0)) {
              break advanceTimedEntitiesAndAiDone27;
            }
            const savedScratch13 = scratch;
            value = readI32(readI32(value, 120), 100);
            writeI32(savedScratch13, value, 1056);
            if (+(value === 0)) {
              break advanceTimedEntitiesAndAiDone27;
            }
            if (+(readU8(readI32(value, 200), 148) >>> 0 < 60)) {
              break advanceTimedEntitiesAndAiDone27;
            }
            value = readI32(value, 168);
            if (+(readU8(value, 80) === 0)) {
              updateWorldTransform(value);
            }
            amountF64 = readF64(value, 88);
            valueF64 = readF64(value, 96);
            writeI32(scratch, scratch + 1056 | 0, 1136);
            writeI64(scratch, 4988721750892838912n, 216);
            writeF32(scratch, f32(valueF64 + -1500.0), 212);
            writeF32(scratch, f32(amountF64 + -1500.0), 208);
            alertNearby(24984, scratch + 208 | 0, scratch + 1136 | 0);
          }
          if (readI32(23184)) {
            do {
              advanceTimedEntitiesAndAiDone66: {
                value = readI32(readI32(23192) + (vector << 2) | 0);
                if (readI32(value, 172)) {
                  break advanceTimedEntitiesAndAiDone66;
                }
                writeF32(value, Math.max(f32(readF32(value, 288) - readF64(tickFrame, 24)), 0.0), 288);
                if (readI32(value, 100)) {
                  advanceTimedEntitiesAndAiDone67: {
                    if (+(readU8(value, 8) >>> 0 <= 1)) {
                      if (+(readU8(value, 96) === 0)) {
                        break advanceTimedEntitiesAndAiDone67;
                      }
                    }
                    readClock(scratch + 208 | 0);
                    value = readI32(value, 172) << 4;
                    writeF64(value + 24928 | 0, readF64(scratch, 216) + 600000.0);
                    writeU8(value + 24920 | 0, 1);
                    break advanceTimedEntitiesAndAiDone66;
                  }
                  readClock(scratch + 208 | 0);
                  value = readI32(value, 172) << 4;
                  writeF64(value + 24928 | 0, readF64(scratch, 216) + 120000.0);
                  writeU8(value + 24920 | 0, 1);
                  break advanceTimedEntitiesAndAiDone66;
                }
                readClock(scratch + 208 | 0);
                cursor = readU8(scratch, 208);
                advanceTimedEntitiesAndAiDone68: {
                  count = readI32(value, 172);
                  value = count << 4;
                  if (readU8(value + 24920 | 0)) {
                    if (+(cursor === 0)) {
                      break advanceTimedEntitiesAndAiDone66;
                    }
                    if (+(readF64(value + 24928 | 0) < readF64(scratch, 216))) {
                      break advanceTimedEntitiesAndAiDone68;
                    }
                    break advanceTimedEntitiesAndAiDone66;
                  }
                  if (+(cursor === 0)) {
                    break advanceTimedEntitiesAndAiDone66;
                  }
                }
                if (+(count === 0) & +(readU8(24837) !== 0)) {
                  break advanceTimedEntitiesAndAiDone66;
                }
                if (count) {
                  break advanceTimedEntitiesAndAiDone66;
                }
                if (readU8(418936)) {
                  break advanceTimedEntitiesAndAiDone66;
                }
                if (readU8(418937)) {
                  break advanceTimedEntitiesAndAiDone66;
                }
                writeI32(418940, 7);
                writeU8(418937, 1);
              }
              vector = vector + 1 | 0;
            } while (+(vector >>> 0 < readI32(23184) >>> 0));
          }
          count = 0;
          length = readI32(23184);
          if (length) {
            cursor = readI32(23192);
            do {
              advanceTimedEntitiesAndAiDone69: {
                value = readI32(cursor + (count << 2) | 0);
                if (readI32(value, 100)) {
                  break advanceTimedEntitiesAndAiDone69;
                }
                if (+(readI32(value, 172) === 0)) {
                  break advanceTimedEntitiesAndAiDone69;
                }
                capacity = readI32(value);
                if (readI32(capacity, 32)) {
                  break advanceTimedEntitiesAndAiDone69;
                }
                end = readI32(capacity);
                writeI32(end, readI32(end, 2172) + 1 | 0, 2172);
                value = readI32(end + 2176 | 0);
                offset = readI32(end + 2180 | 0);
                writeI32(capacity, 0, 40);
                writeI32(capacity, offset, 36);
                writeI32(capacity, end + 2172 | 0, 32);
                capacity = capacity + 32 | 0;
                if (+(value === 0)) {
                  writeI32(end, capacity, 2176);
                }
                if (offset) {
                  writeI32(offset, capacity, 8);
                }
                writeI32(end, capacity, 2180);
              }
              count = count + 1 | 0;
            } while (+(count !== length));
          }
          advanceTimedEntitiesAndAiDone70: {
            if (+(readU8(25048) === 0)) {
              break advanceTimedEntitiesAndAiDone70;
            }
            readClock(scratch + 208 | 0);
            value = readU8(25048);
            if (readU8(scratch, 208)) {
              if (+(value === 0)) {
                break advanceTimedEntitiesAndAiDone70;
              }
              if (+(+(readF64(scratch, 216) < readF64(25056)) === 0)) {
                break advanceTimedEntitiesAndAiDone70;
              }
              break advanceTimedEntitiesAndAiDone;
            }
            if (value) {
              break advanceTimedEntitiesAndAiDone;
            }
          }
          readClock(scratch + 208 | 0);
          writeU8(25048, 1);
          writeF64(25056, readF64(scratch, 216) + 250.0);
          writeI32(scratch, 0, 216);
          writeI64(scratch, 0n, 208);
          let selectedValue14;
          advanceTimedEntitiesAndAiDone71: {
            flag = readI32(23184);
            if (+(flag === 0)) {
              offset = 0;
              selectedValue14 = 0;
              break advanceTimedEntitiesAndAiDone71;
            }
            count = readI32(23192);
            node = scratch + 220 | 0;
            offset = 0;
            cursor = 0;
            do {
              end = readI32(count + (cursor << 2) | 0);
              if (readI32(end, 100)) {
                const storedI3212 = readI32(scratch, 212);
                capacity = readI32(scratch, 216);
                count = capacity ? storedI3212 : 200;
                const savedCount9 = count;
                length = offset + 1 | 0;
                if (+(savedCount9 >>> 0 < length >>> 0)) {
                  do {
                    value = count;
                    count = value << 1;
                  } while (+(count >>> 0 < length >>> 0));
                  entity = capacity ? capacity : node;
                  capacity = malloc(value << 3);
                  value = memcpy(capacity, entity, offset << 2);
                  if (+(entity !== node)) {
                    free(entity);
                    flag = readI32(23184);
                  }
                  writeI32(scratch, value, 216);
                  writeI32(scratch, count, 212);
                }
                writeI32((offset << 2) + (capacity ? capacity : node) | 0, end);
                writeI32(scratch, length, 208);
                offset = length;
                count = readI32(23192);
              }
              cursor = cursor + 1 | 0;
            } while (+(cursor >>> 0 < flag >>> 0));
            selectedValue14 = readI32(scratch, 216);
          }
          value = selectedValue14;
          const savedValue15 = value;
          componentData = scratch + 220 | 0;
          value = value ? savedValue15 : componentData;
          sortRankedEntityPointers(value, value + (offset << 2) | 0);
          advanceTimedEntitiesAndAiDone72: {
            value = readI32(scratch, 208);
            required = +(value >>> 0 < 10) ? value : 10;
            if (+(required === readU8(23904))) {
              break advanceTimedEntitiesAndAiDone72;
            }
            free(readI32(8551052));
            writeI64(8551048, 0n);
            writeI64(8551040, 0n);
            free(readI32(8555164));
            writeI64(8555160, 0n);
            writeI64(8555152, 0n);
            cursor = readU8(23904);
            if (readI32(8551040)) {
              writeI32(8551040, 0);
            }
            const storedI3213 = readI32(8551048);
            length = readI32(8551052);
            count = length ? storedI3213 : 4096;
            const savedCount10 = count;
            offset = readI32(8551044);
            capacity = offset + 1 | 0;
            if (+(savedCount10 >>> 0 < capacity >>> 0)) {
              [count, length, end, value] = growBeforeComparisonWriter(count, capacity, length, offset);
            }
            writeU8((length ? length : 8551056) + offset | 0, cursor);
            writeU8(23904, required);
            writeI32(8551044, capacity);
            if (readI32(8555152)) {
              writeI32(8555152, 0);
            }
            const storedI3214 = readI32(8555160);
            length = readI32(8555164);
            count = length ? storedI3214 : 4096;
            const savedCount11 = count;
            cursor = readI32(8555156);
            offset = cursor + 1 | 0;
            if (+(savedCount11 >>> 0 < offset >>> 0)) {
              [count, length, capacity, value] = growAfterComparisonWriter(count, offset, length, cursor);
            }
            writeU8((length ? length : 8555168) + cursor | 0, required);
            writeI32(8555156, offset);
            advanceTimedEntitiesAndAiDone73: {
              if (+(readI32(8551044) !== offset)) {
                break advanceTimedEntitiesAndAiDone73;
              }
              if (+(offset === 0)) {
                break advanceTimedEntitiesAndAiDone72;
              }
              value = readI32(8551052);
              cursor = value ? value : 8551056;
              const storedU85 = readU8(cursor);
              value = readI32(8555164);
              count = value ? value : 8555168;
              if (+(storedU85 !== readU8(count))) {
                break advanceTimedEntitiesAndAiDone73;
              }
              length = 1;
              do {
                value = length;
                if (+(value === offset)) {
                  break advanceTimedEntitiesAndAiDone72;
                }
                length = value + 1 | 0;
              } while (+(readU8(value + cursor | 0) === readU8(value + count | 0)));
              if (+(value >>> 0 >= offset >>> 0)) {
                break advanceTimedEntitiesAndAiDone72;
              }
            }
            cursor = readI32(23552);
            if (+(cursor === 0)) {
              break advanceTimedEntitiesAndAiDone72;
            }
            const savedCursor3 = cursor;
            value = readI32(cursor);
            writeI32(savedCursor3, readI32(value, 2140), 376);
            writeI32(cursor, readI32(value, 2140), 380);
            value = (value + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264876 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            value = (readI32(cursor) + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264880 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            count = readI32(cursor);
            const savedBits3 = (count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 68268 | 0;
            value = readI32(count, 2140);
            writeI32(savedBits3, value);
            writeI32((count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 133804 | 0, value);
            writeI32(23948, readI32(readI32(readI32(23552)), 2140));
          }
          if (+(required === 0)) {
            break advanceTimedEntitiesAndAiDone2;
          }
          length = 0;
          do {
            scaleF32 = 0.0;
            field = length << 2;
            const savedField = field;
            value = readI32(scratch, 216);
            count = readI32(savedField + (value ? value : componentData) | 0);
            value = readI32(count, 100);
            if (value) {
              scaleF32 = readF32(readI32(value, 200), 16);
            }
            entry = readI32(value, 160);
            end = readU8(entry, 19);
            vector = +((end << 24 >> 24 | 0) < 0);
            offset = readI32(entry, 12);
            capacity = readI32(entry, 8);
            cursor = field + 23812 | 0;
            value = readI32(cursor);
            node = readI32(count);
            const savedValue16 = value;
            let selectedValue15;
            advanceTimedEntitiesAndAiDone74: {
              if (+(scaleF32 < 4294967296.0) & +(scaleF32 >= 0.0)) {
                selectedValue15 = truncateInteger(scaleF32, true);
                break advanceTimedEntitiesAndAiDone74;
              }
              selectedValue15 = 0;
            }
            count = selectedValue15;
            if (+(savedValue16 !== count)) {
              flag = readI32(23552);
              if (flag) {
                const savedFlag = flag;
                value = readI32(flag);
                writeI32(savedFlag, readI32(value, 2140), 376);
                writeI32(flag, readI32(value, 2140), 380);
                value = (value + ((readI32(flag, 16) & 16383) << 3) | 0) + 264876 | 0;
                entity = readI32(value);
                writeI32(value, 0);
                if (entity) {
                  free(readI32(entity, 12));
                  free(entity);
                }
                value = (readI32(flag) + ((readI32(flag, 16) & 16383) << 3) | 0) + 264880 | 0;
                entity = readI32(value);
                writeI32(value, 0);
                if (entity) {
                  free(readI32(entity, 12));
                  free(entity);
                }
                entity = readI32(flag);
                const savedBits4 = (entity + ((readI32(flag, 16) & 16383) << 2) | 0) + 68268 | 0;
                value = readI32(entity, 2140);
                writeI32(savedBits4, value);
                writeI32((entity + ((readI32(flag, 16) & 16383) << 2) | 0) + 133804 | 0, value);
                value = readI32(readI32(readI32(23552)), 2140);
                writeI32(23936, value);
                writeI32(field + 23852 | 0, value);
              }
              writeI32(cursor, count);
            }
            capacity = vector ? capacity : entry + 8 | 0;
            value = Math.imul(length, 12);
            entity = value + 23640 | 0;
            advanceTimedEntitiesAndAiDone75: {
              const storedI3215 = readI32(value + 23644 | 0);
              value = readU8(value + 23651 | 0);
              const savedValue17 = value;
              value = +((value << 24 >> 24 | 0) < 0);
              cursor = value ? storedI3215 : savedValue17;
              const savedCursor4 = cursor;
              count = vector ? offset : end;
              if (+(savedCursor4 === count)) {
                if (+(cursor === 0)) {
                  break advanceTimedEntitiesAndAiDone75;
                }
                const resultOfMemcmp2 = memcmp(value ? readI32(entity) : entity, capacity, cursor);
                if (+(resultOfMemcmp2 === 0)) {
                  break advanceTimedEntitiesAndAiDone75;
                }
              }
              offset = readI32(23552);
              if (offset) {
                const savedOffset2 = offset;
                value = readI32(offset);
                writeI32(savedOffset2, readI32(value, 2140), 376);
                writeI32(offset, readI32(value, 2140), 380);
                value = (value + ((readI32(offset, 16) & 16383) << 3) | 0) + 264876 | 0;
                cursor = readI32(value);
                writeI32(value, 0);
                if (cursor) {
                  free(readI32(cursor, 12));
                  free(cursor);
                }
                value = (readI32(offset) + ((readI32(offset, 16) & 16383) << 3) | 0) + 264880 | 0;
                cursor = readI32(value);
                writeI32(value, 0);
                if (cursor) {
                  free(readI32(cursor, 12));
                  free(cursor);
                }
                cursor = readI32(offset);
                const savedBits5 = (cursor + ((readI32(offset, 16) & 16383) << 2) | 0) + 68268 | 0;
                value = readI32(cursor, 2140);
                writeI32(savedBits5, value);
                writeI32((cursor + ((readI32(offset, 16) & 16383) << 2) | 0) + 133804 | 0, value);
                value = readI32(readI32(readI32(23552)), 2140);
                writeI32(23916, value);
                writeI32(field + 23760 | 0, value);
              }
              assignStringBytes(entity, capacity, count);
            }
            count = readI32(node, 16);
            const savedCount12 = count;
            value = field + 23560 | 0;
            if (+(savedCount12 !== readI32(value))) {
              const savedValue18 = value;
              cursor = readI32(23552);
              let selectedValue16;
              if (cursor) {
                const savedCursor5 = cursor;
                value = readI32(cursor);
                writeI32(savedCursor5, readI32(value, 2140), 376);
                writeI32(cursor, readI32(value, 2140), 380);
                value = (value + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264876 | 0;
                count = readI32(value);
                writeI32(value, 0);
                if (count) {
                  free(readI32(count, 12));
                  free(count);
                }
                value = (readI32(cursor) + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264880 | 0;
                count = readI32(value);
                writeI32(value, 0);
                if (count) {
                  free(readI32(count, 12));
                  free(count);
                }
                count = readI32(cursor);
                const savedBits6 = (count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 68268 | 0;
                value = readI32(count, 2140);
                writeI32(savedBits6, value);
                writeI32((count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 133804 | 0, value);
                value = readI32(readI32(readI32(23552)), 2140);
                writeI32(23912, value);
                writeI32(field + 23600 | 0, value);
                selectedValue16 = readI32(node, 16);
              } else {
                selectedValue16 = count;
              }
              writeI32(savedValue18, selectedValue16);
            }
            length = length + 1 | 0;
          } while (+(length !== required));
          break advanceTimedEntitiesAndAiDone2;
        }
        abortInvalidSimulationState();
        throw new WebAssembly.RuntimeError("unreachable");
      }
      length = 0;
      advanceTimedEntitiesAndAiDone76: {
        count = readI32(scratch, 208);
        let selectedValue17;
        if (+(count !== readI32(23908))) {
          free(readI32(8551052));
          writeI64(8551048, 0n);
          writeI64(8551040, 0n);
          free(readI32(8555164));
          writeI64(8555160, 0n);
          writeI64(8555152, 0n);
          value = readI32(23908);
          do {
            const savedBits7 = (scratch + 1056 | 0) + length | 0;
            const savedMask = value & 127;
            cursor = +(value >>> 0 > 127);
            writeU8(savedBits7, savedMask | cursor << 7);
            length = length + 1 | 0;
            value = value >>> 7 | 0;
          } while (cursor);
          if (readI32(8551040)) {
            writeI32(8551040, 0);
          }
          const storedI3216 = readI32(8551048);
          capacity = readI32(8551052);
          value = capacity ? storedI3216 : 4096;
          const savedValue19 = value;
          end = readI32(8551044);
          offset = end + length | 0;
          if (+(savedValue19 >>> 0 < offset >>> 0)) {
            [value, capacity, entity, cursor] = growBeforeComparisonWriter(value, offset, capacity, end);
          }
          memcpy((capacity ? capacity : 8551056) + end | 0, scratch + 1056 | 0, length);
          value = 0;
          writeI32(8551044, offset);
          writeI32(23908, count);
          do {
            const savedBits8 = (scratch + 1056 | 0) + value | 0;
            const savedMask2 = count & 127;
            cursor = +(count >>> 0 > 127);
            writeU8(savedBits8, savedMask2 | cursor << 7);
            value = value + 1 | 0;
            count = count >>> 7 | 0;
          } while (cursor);
          if (readI32(8555152)) {
            writeI32(8555152, 0);
          }
          const storedI3217 = readI32(8555160);
          cursor = readI32(8555164);
          count = cursor ? storedI3217 : 4096;
          const savedCount13 = count;
          capacity = readI32(8555156);
          end = capacity + value | 0;
          if (+(savedCount13 >>> 0 < end >>> 0)) {
            [count, cursor, offset, length] = growAfterComparisonWriter(count, end, cursor, capacity);
          }
          memcpy((cursor ? cursor : 8555168) + capacity | 0, scratch + 1056 | 0, value);
          writeI32(8555156, end);
          advanceTimedEntitiesAndAiDone77: {
            advanceTimedEntitiesAndAiDone78: {
              if (+(readI32(8551044) !== end)) {
                break advanceTimedEntitiesAndAiDone78;
              }
              if (+(end === 0)) {
                break advanceTimedEntitiesAndAiDone77;
              }
              value = readI32(8551052);
              length = value ? value : 8551056;
              const storedU86 = readU8(length);
              value = readI32(8555164);
              cursor = value ? value : 8555168;
              if (+(storedU86 !== readU8(cursor))) {
                break advanceTimedEntitiesAndAiDone78;
              }
              value = 1;
              do {
                count = value;
                if (+(count === end)) {
                  break advanceTimedEntitiesAndAiDone77;
                }
                value = count + 1 | 0;
              } while (+(readU8(count + length | 0) === readU8(count + cursor | 0)));
              if (+(count >>> 0 >= end >>> 0)) {
                break advanceTimedEntitiesAndAiDone77;
              }
            }
            cursor = readI32(23552);
            if (+(cursor === 0)) {
              break advanceTimedEntitiesAndAiDone77;
            }
            const savedCursor6 = cursor;
            value = readI32(cursor);
            writeI32(savedCursor6, readI32(value, 2140), 376);
            writeI32(cursor, readI32(value, 2140), 380);
            value = (value + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264876 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            value = (readI32(cursor) + ((readI32(cursor, 16) & 16383) << 3) | 0) + 264880 | 0;
            count = readI32(value);
            writeI32(value, 0);
            if (count) {
              free(readI32(count, 12));
              free(count);
            }
            count = readI32(cursor);
            const savedBits9 = (count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 68268 | 0;
            value = readI32(count, 2140);
            writeI32(savedBits9, value);
            writeI32((count + ((readI32(cursor, 16) & 16383) << 2) | 0) + 133804 | 0, value);
            writeI32(23952, readI32(readI32(readI32(23552)), 2140));
          }
          selectedValue17 = readI32(scratch, 208);
        } else {
          selectedValue17 = count;
        }
        if (+(selectedValue17 === 0)) {
          if (+(readI32(25032) === 0)) {
            break advanceTimedEntitiesAndAiDone76;
          }
          value = readI32(25036);
          writeI32(value, readI32(25040), 8);
          writeI32(readI32(25040), value, 4);
          writeI32(25040, 25032);
          writeI32(25036, 25032);
          writeI32(25032, 0);
          break advanceTimedEntitiesAndAiDone76;
        }
        value = readI32(scratch, 216);
        count = readI32(readI32(value ? value : componentData));
        if (+(count === readI32(25032))) {
          break advanceTimedEntitiesAndAiDone76;
        }
        value = readI32(25036);
        writeI32(value, readI32(25040), 8);
        writeI32(readI32(25040), value, 4);
        value = 25032;
        writeI32(25040, 25032);
        writeI32(25032, 0);
        advanceTimedEntitiesAndAiDone79: {
          if (+(count === 0)) {
            writeI32(25032, 0);
            length = 25040;
            break advanceTimedEntitiesAndAiDone79;
          }
          writeI32(25032, readI32(count, 4));
          length = count + 12 | 0;
          value = readI32(length);
          writeI32(25040, value);
          writeI32(value, 25032, 4);
          value = count + 4 | 0;
        }
        writeI32(25036, value);
        writeI32(length, 25032);
      }
      free(readI32(scratch, 216));
    }
  }
  /** Compact expired effect objects, take the strongest active damage and publish effect flags. */  function applyActiveDamageEffects(scratch, tickFrame) {
    // Original WAT 149103–149648.
    let value = 0, count = 0, length = 0, cursor = 0, effects = 0, capacity = 0, effectIndex = 0, amount = 0, maximumDamage = 0, stepF32 = 0, stepMilliseconds = 0;
    stepMilliseconds = readF64(tickFrame, 24);
    if (readI32(24604)) {
      stepF32 = f32(stepMilliseconds);
      effectIndex = 0;
      do {
        effects = readI32(readI32(24612) + (effectIndex << 2) | 0);
        length = readI32(effects, 24);
        const savedLength3 = length;
        value = readI32(effects, 16);
        cursor = savedLength3 + (value << 2) | 0;
        let selectedValue18;
        if (value) {
          applyActiveDamageEffectsLoop: while (true) {
            applyActiveDamageEffectsDone: {
              applyActiveDamageEffectsDone2: {
                value = readI32(length);
                const resultOfIndirect7 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "f32" ]
                }, readI32(readI32(value), 8), value);
                if (+(resultOfIndirect7 > 0.0)) {
                  length = length + 4 | 0;
                  break applyActiveDamageEffectsDone2;
                }
                cursor = cursor - 4 | 0;
                if (+(cursor === length)) {
                  cursor = length;
                  break applyActiveDamageEffectsDone;
                }
                value = readI32(cursor);
                writeI32(cursor, 0);
                count = readI32(length);
                writeI32(length, value);
                if (+(count === 0)) {
                  break applyActiveDamageEffectsDone2;
                }
                runtime.indirect({
                  parameters: [ "i32" ],
                  results: []
                }, readI32(readI32(count), 4), count);
              }
              if (+(length !== cursor)) {
                continue applyActiveDamageEffectsLoop;
              }
            }
            break;
          }
          length = readI32(effects, 24);
          selectedValue18 = readI32(effects, 16);
        } else {
          selectedValue18 = 0;
        }
        value = (selectedValue18 << 2) + length | 0;
        const savedValue20 = value;
        count = cursor;
        if (+(savedValue20 !== count)) {
          do {
            capacity = readI32(count);
            writeI32(count, 0);
            if (capacity) {
              runtime.indirect({
                parameters: [ "i32" ],
                results: []
              }, readI32(readI32(capacity), 4), capacity);
            }
            count = count + 4 | 0;
          } while (+(count !== value));
        }
        const savedEffects = effects;
        value = cursor - length | 0;
        cursor = value >> 2;
        writeI32(savedEffects, cursor, 16);
        applyActiveDamageEffectsDone3: {
          capacity = readI32(readI32(effects), 164);
          if (+(capacity === 0)) {
            break applyActiveDamageEffectsDone3;
          }
          maximumDamage = 0.0;
          count = 0;
          if (value) {
            value = readI32(effects, 24);
            length = value + (cursor << 2) | 0;
            do {
              const savedBits10 = scratch + 208 | 0;
              cursor = readI32(value);
              runtime.indirect({
                parameters: [ "i32", "i32" ],
                results: []
              }, readI32(readI32(cursor), 28), savedBits10, cursor);
              const storedF323 = readF32(scratch, 208);
              const savedStepF32 = stepF32;
              cursor = readI32(value);
              amount = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(cursor), 8), cursor);
              amount = f32(storedF323 * (+(amount > stepF32) ? savedStepF32 : amount));
              const savedAmount = amount;
              const savedMaximumDamage = maximumDamage;
              cursor = +(amount > maximumDamage);
              maximumDamage = cursor ? savedAmount : savedMaximumDamage;
              count = cursor ? readI32(scratch, 212) : count;
              value = value + 4 | 0;
            } while (+(value !== length));
          }
          cursor = readI32(effects, 28);
          if (cursor) {
            value = readI32(effects, 36);
            length = value + (cursor << 2) | 0;
            do {
              const savedBits11 = scratch + 208 | 0;
              cursor = readI32(value);
              runtime.indirect({
                parameters: [ "i32", "i32" ],
                results: []
              }, readI32(readI32(cursor), 28), savedBits11, cursor);
              const storedF324 = readF32(scratch, 208);
              const savedStepF322 = stepF32;
              cursor = readI32(value);
              amount = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(cursor), 8), cursor);
              amount = f32(storedF324 * (+(amount > stepF32) ? savedStepF322 : amount));
              const savedAmount2 = amount;
              const savedMaximumDamage2 = maximumDamage;
              cursor = +(amount > maximumDamage);
              maximumDamage = cursor ? savedAmount2 : savedMaximumDamage2;
              count = cursor ? readI32(scratch, 212) : count;
              value = value + 4 | 0;
            } while (+(value !== length));
          }
          value = effects + 8 | 0;
          amount = f32(maximumDamage * 0.0010000000474974513);
          if (+(amount > 0.0)) {
            writeI32(scratch, readU8(effects, 8) | 1, 208);
            setEffectFlags(value, scratch + 208 | 0);
            writeU16(scratch, 0, 1056);
            applyActiveDamageEffectsDone4: {
              applyActiveDamageEffectsDone5: {
                if (+(readU8(effects, 40) === 0)) {
                  break applyActiveDamageEffectsDone5;
                }
                readClock(scratch + 208 | 0);
                if (+(readU8(scratch, 208) === 0)) {
                  break applyActiveDamageEffectsDone5;
                }
                if (readU8(effects, 40)) {
                  if (+(+(readF64(scratch, 216) - readF64(effects, 48) < 600.0) === 0)) {
                    break applyActiveDamageEffectsDone5;
                  }
                }
                writeU8(scratch, 1, 1056);
                break applyActiveDamageEffectsDone4;
              }
              readClock(scratch + 208 | 0);
              writeI64(effects, readI64(scratch, 216), 48);
              writeI64(effects, readI64(scratch, 208), 40);
            }
            damage(capacity, count, amount, scratch + 1056 | 0);
            break applyActiveDamageEffectsDone3;
          }
          writeI32(scratch, readU8(value) & 254, 208);
          setEffectFlags(value, scratch + 208 | 0);
        }
        applyActiveDamageEffectsDone6: {
          applyActiveDamageEffectsDone7: {
            applyActiveDamageEffectsDone8: {
              value = readI32(effects, 16);
              if (value) {
                count = readI32(effects, 24);
                cursor = count + (value << 2) | 0;
                do {
                  value = readI32(count);
                  const resultOfIndirect8 = runtime.indirect({
                    parameters: [ "i32" ],
                    results: [ "i32" ]
                  }, readI32(readI32(value), 16), value);
                  if (resultOfIndirect8) {
                    break applyActiveDamageEffectsDone8;
                  }
                  count = count + 4 | 0;
                } while (+(count !== cursor));
              }
              value = readI32(effects, 28);
              if (+(value === 0)) {
                break applyActiveDamageEffectsDone7;
              }
              count = readI32(effects, 36);
              cursor = count + (value << 2) | 0;
              applyActiveDamageEffectsLoop2: while (true) {
                value = readI32(count);
                const resultOfIndirect9 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "i32" ]
                }, readI32(readI32(value), 16), value);
                if (resultOfIndirect9) {
                  break applyActiveDamageEffectsDone8;
                }
                const savedCursor7 = cursor;
                count = count + 4 | 0;
                if (+(savedCursor7 !== count)) {
                  continue applyActiveDamageEffectsLoop2;
                }
                break;
              }
              break applyActiveDamageEffectsDone7;
            }
            writeI32(scratch, readU8(effects, 8) | 2, 208);
            break applyActiveDamageEffectsDone6;
          }
          writeI32(scratch, readU8(effects, 8) & 253, 208);
        }
        setEffectFlags(effects + 8 | 0, scratch + 208 | 0);
        applyActiveDamageEffectsDone9: {
          applyActiveDamageEffectsDone10: {
            applyActiveDamageEffectsDone11: {
              value = readI32(effects, 16);
              if (value) {
                count = readI32(effects, 24);
                cursor = count + (value << 2) | 0;
                do {
                  value = readI32(count);
                  const resultOfIndirect10 = runtime.indirect({
                    parameters: [ "i32" ],
                    results: [ "i32" ]
                  }, readI32(readI32(value), 12), value);
                  if (resultOfIndirect10) {
                    break applyActiveDamageEffectsDone11;
                  }
                  count = count + 4 | 0;
                } while (+(count !== cursor));
              }
              value = readI32(effects, 28);
              if (+(value === 0)) {
                break applyActiveDamageEffectsDone10;
              }
              count = readI32(effects, 36);
              cursor = count + (value << 2) | 0;
              applyActiveDamageEffectsLoop3: while (true) {
                value = readI32(count);
                const resultOfIndirect11 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "i32" ]
                }, readI32(readI32(value), 12), value);
                if (resultOfIndirect11) {
                  break applyActiveDamageEffectsDone11;
                }
                const savedCursor8 = cursor;
                count = count + 4 | 0;
                if (+(savedCursor8 !== count)) {
                  continue applyActiveDamageEffectsLoop3;
                }
                break;
              }
              break applyActiveDamageEffectsDone10;
            }
            writeI32(scratch, readU8(effects, 8) | 4, 208);
            break applyActiveDamageEffectsDone9;
          }
          writeI32(scratch, readU8(effects, 8) & 251, 208);
        }
        setEffectFlags(effects + 8 | 0, scratch + 208 | 0);
        effectIndex = effectIndex + 1 | 0;
      } while (+(effectIndex >>> 0 < readI32(24604) >>> 0));
    }
    return [ stepMilliseconds ];
  }
  /** Refresh area payload lifetimes and maintain intrusive target handles from spatial queries. */  function updateAreaEffectTargets(scratch) {
    // Original WAT 149649–150794.
    let value = 0, count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, contextScratch = 0, entity = 0, end = 0, area = 0, targetScratch = 0, areaIndex = 0, flag = 0, vector = 0, valueF32 = 0, scaleF32 = 0, valueF64 = 0, amountF64 = 0;
    if (readI32(24780)) {
      targetScratch = scratch + 1068 | 0;
      contextScratch = scratch + 220 | 0;
      areaIndex = 0;
      do {
        updateAreaEffectTargetsDone: {
          area = readI32(readI32(24788) + (areaIndex << 2) | 0);
          value = readI32(area, 8);
          if (+(value === 0)) {
            break updateAreaEffectTargetsDone;
          }
          const resultOfIndirect12 = runtime.indirect({
            parameters: [ "i32" ],
            results: [ "f32" ]
          }, readI32(readI32(value), 8), value);
          if (+(+(resultOfIndirect12 < 0.0) === 0)) {
            break updateAreaEffectTargetsDone;
          }
          valueF32 = readF32(area, 4);
          writeI32(scratch, 0, 208);
          replaceAreaEffect(area, valueF32, scratch + 208 | 0);
          value = readI32(scratch, 208);
          if (+(value === 0)) {
            break updateAreaEffectTargetsDone;
          }
          runtime.indirect({
            parameters: [ "i32" ],
            results: []
          }, readI32(readI32(value), 4), value);
        }
        capacity = readI32(area, 24);
        count = capacity;
        const savedCapacity4 = capacity;
        length = readI32(area, 16);
        cursor = savedCapacity4 + Math.imul(length, 12) | 0;
        value = cursor;
        updateAreaEffectTargetsDone2: {
          if (+(length === 0)) {
            break updateAreaEffectTargetsDone2;
          }
          updateAreaEffectTargetsLoop: while (true) {
            updateAreaEffectTargetsDone3: {
              updateAreaEffectTargetsDone4: {
                if (readI32(count)) {
                  count = count + 12 | 0;
                  break updateAreaEffectTargetsDone4;
                }
                length = value - 12 | 0;
                if (+(length === count)) {
                  value = count;
                  break updateAreaEffectTargetsDone3;
                }
                offset = readI32(count, 4);
                writeI32(offset, readI32(count, 8), 8);
                writeI32(readI32(count, 8), offset, 4);
                writeI32(count, 0);
                writeI32(count, count, 8);
                writeI32(count, count, 4);
                end = value - 8 | 0;
                offset = readI32(end);
                writeI32(count, readI32(length));
                updateAreaEffectTargetsDone5: {
                  if (+(length === offset)) {
                    writeI32(count, count, 8);
                    writeI32(count, count, 4);
                    writeI32(length, 0);
                    writeI32(end, length);
                    value = value - 4 | 0;
                    break updateAreaEffectTargetsDone5;
                  }
                  writeI32(count, offset, 4);
                  const savedCount14 = count;
                  value = value - 4 | 0;
                  writeI32(savedCount14, readI32(value), 8);
                  writeI32(readI32(end), count, 8);
                  writeI32(readI32(value), count, 4);
                  writeI32(length, 0);
                  writeI32(end, length);
                }
                writeI32(value, length);
                value = length;
              }
              if (+(value !== count)) {
                continue updateAreaEffectTargetsLoop;
              }
            }
            break;
          }
          const savedCursor9 = cursor;
          count = value;
          if (+(savedCursor9 === count)) {
            break updateAreaEffectTargetsDone2;
          }
          do {
            length = readI32(count, 4);
            writeI32(length, readI32(count, 8), 8);
            writeI32(readI32(count, 8), length, 4);
            count = count + 12 | 0;
          } while (+(count !== cursor));
          cursor = value;
        }
        const savedArea = area;
        cursor = cursor - capacity | 0;
        value = divideSigned(cursor, 12);
        writeI32(savedArea, value, 16);
        if (readI32(area, 8)) {
          count = 0;
          writeI32(scratch, 0, 216);
          writeI64(scratch, 0n, 208);
          updateAreaEffectTargetsDone6: {
            if (+(cursor === 0)) {
              cursor = 0;
              break updateAreaEffectTargetsDone6;
            }
            end = capacity + Math.imul(value, 12) | 0;
            cursor = 0;
            value = 0;
            let selectedValue19;
            updateAreaEffectTargetsLoop2: while (true) {
              offset = readI32(capacity);
              const savedValue21 = value;
              count = cursor ? count : 16;
              if (+(savedValue21 >>> 0 >= count >>> 0)) {
                do {
                  length = count;
                  count = length << 1;
                } while (+(count >>> 0 <= value >>> 0));
                entity = cursor ? cursor : contextScratch;
                cursor = malloc(length << 3);
                length = memcpy(cursor, entity, value << 2);
                if (+(contextScratch !== entity)) {
                  free(entity);
                }
                writeI32(scratch, length, 216);
                writeI32(scratch, count, 212);
              }
              writeI32((value << 2) + (cursor ? cursor : contextScratch) | 0, offset);
              const savedScratch14 = scratch;
              value = value + 1 | 0;
              writeI32(savedScratch14, value, 208);
              cursor = readI32(scratch, 216);
              const savedEnd3 = end;
              capacity = capacity + 12 | 0;
              let selectedValue20;
              if (+(savedEnd3 === capacity)) {
                selectedValue20 = value;
              } else {
                count = readI32(scratch, 212);
                continue updateAreaEffectTargetsLoop2;
              }
              selectedValue19 = selectedValue20;
              break;
            }
            count = selectedValue19;
          }
          value = cursor ? cursor : contextScratch;
          sortEntityPointers(value, value + (count << 2) | 0);
          writeI32(scratch, 0, 1064);
          writeI64(scratch, 0n, 1056);
          const savedScratch15 = scratch;
          count = readI32(area);
          writeI32(savedScratch15, count, 1052);
          let selectedValue21;
          updateAreaEffectTargetsDone7: {
            value = readI32(count, 164);
            if (value) {
              length = 0;
              if (+(readF32(value, 8) <= 0.0)) {
                selectedValue21 = 0;
                break updateAreaEffectTargetsDone7;
              }
            }
            const savedScratch16 = scratch;
            cursor = readI32(count, 168);
            writeI32(savedScratch16, cursor, 1048);
            value = readI32(count);
            if (+(readU8(cursor, 80) === 0)) {
              updateWorldTransform(cursor);
            }
            amountF64 = readF64(cursor, 88);
            valueF64 = readF64(cursor, 96);
            scaleF32 = readF32(area, 4);
            writeI32(scratch, area, 1036);
            writeI32(scratch, scratch + 1056 | 0, 1044);
            writeI32(scratch, scratch + 1052 | 0, 1040);
            writeI32(scratch, scratch + 1048 | 0, 1032);
            const savedScratch17 = scratch;
            valueF32 = f32(scaleF32 + scaleF32);
            writeF32(savedScratch17, valueF32, 1148);
            writeF32(scratch, valueF32, 1144);
            writeF32(scratch, f32(f32(valueF64) - scaleF32), 1140);
            writeF32(scratch, f32(f32(amountF64) - scaleF32), 1136);
            queryAreaEffectTargets(value + 2056 | 0, scratch + 1136 | 0, scratch + 1032 | 0);
            length = readI32(scratch, 1056);
            selectedValue21 = readI32(scratch, 1064);
          }
          value = selectedValue21;
          value = value ? value : targetScratch;
          sortEntityPointers(value, value + (length << 2) | 0);
          vector = readI32(scratch, 216);
          cursor = vector ? vector : contextScratch;
          updateAreaEffectTargetsDone8: {
            updateAreaEffectTargetsDone9: {
              updateAreaEffectTargetsDone10: {
                flag = readI32(scratch, 1056);
                if (+(flag === 0)) {
                  break updateAreaEffectTargetsDone10;
                }
                value = readI32(scratch, 1064);
                count = value ? value : targetScratch;
                capacity = count;
                if (+(readI32(scratch, 208) === 0)) {
                  break updateAreaEffectTargetsDone9;
                }
                do {
                  updateAreaEffectTargetsDone11: {
                    count = readI32(capacity);
                    const savedCount15 = count;
                    value = readI32(cursor);
                    if (+(savedCount15 >>> 0 < value >>> 0)) {
                      offset = readI32(area, 8);
                      updateAreaEffectTargetsDone12: {
                        entry = readI32(count, 192);
                        value = readI32(entry, 32);
                        const savedValue22 = value;
                        vector = readI32(entry, 28);
                        entity = vector + 1 | 0;
                        if (+(savedValue22 >>> 0 >= entity >>> 0)) {
                          value = readI32(entry, 36);
                          break updateAreaEffectTargetsDone12;
                        }
                        value = value ? value << 1 : 1024;
                        do {
                          count = value;
                          value = count << 1;
                        } while (+(count >>> 0 < entity >>> 0));
                        end = readI32(entry, 36);
                        value = malloc(count << 2);
                        length = memcpy(value, end, vector << 2);
                        free(end);
                        writeI32(entry, length, 36);
                        writeI32(entry, count, 32);
                        flag = readI32(scratch, 1056);
                      }
                      capacity = capacity + 4 | 0;
                      writeI32(value + (vector << 2) | 0, offset);
                      writeI32(entry, entity, 28);
                      break updateAreaEffectTargetsDone11;
                    }
                    if (+(value === count)) {
                      cursor = cursor + 4 | 0;
                      capacity = capacity + 4 | 0;
                      break updateAreaEffectTargetsDone11;
                    }
                    end = readI32(value, 192);
                    count = readI32(end, 36);
                    const savedCount16 = count;
                    offset = readI32(end, 28);
                    value = savedCount16 + (offset << 2) | 0;
                    updateAreaEffectTargetsDone13: {
                      updateAreaEffectTargetsDone14: {
                        updateAreaEffectTargetsDone15: {
                          if (+(offset === 0)) {
                            break updateAreaEffectTargetsDone15;
                          }
                          length = readI32(area, 8);
                          do {
                            if (+(readI32(count) === length)) {
                              break updateAreaEffectTargetsDone15;
                            }
                            count = count + 4 | 0;
                          } while (+(count !== value));
                          length = value - 4 | 0;
                          count = value;
                          break updateAreaEffectTargetsDone14;
                        }
                        const savedCount17 = count;
                        length = value - 4 | 0;
                        if (+(savedCount17 === length)) {
                          break updateAreaEffectTargetsDone13;
                        }
                      }
                      writeI32(count, readI32(length));
                    }
                    cursor = cursor + 4 | 0;
                    writeI32(end, offset - 1 | 0, 28);
                  }
                  vector = readI32(scratch, 216);
                  const savedCapacity5 = capacity;
                  value = readI32(scratch, 1064);
                  count = value ? value : targetScratch;
                  if (+(savedCapacity5 === (count + (flag << 2) | 0))) {
                    break updateAreaEffectTargetsDone10;
                  }
                } while (+(((readI32(scratch, 208) << 2) + (vector ? vector : contextScratch) | 0) !== cursor));
                break updateAreaEffectTargetsDone9;
              }
              const savedCursor10 = cursor;
              capacity = readI32(scratch, 208) << 2;
              if (+(savedCursor10 === (capacity + (vector ? vector : contextScratch) | 0))) {
                break updateAreaEffectTargetsDone8;
              }
              do {
                end = readI32(readI32(cursor), 192);
                count = readI32(end, 36);
                const savedCount18 = count;
                offset = readI32(end, 28);
                value = savedCount18 + (offset << 2) | 0;
                cursor = cursor + 4 | 0;
                updateAreaEffectTargetsDone16: {
                  updateAreaEffectTargetsDone17: {
                    updateAreaEffectTargetsDone18: {
                      if (+(offset === 0)) {
                        break updateAreaEffectTargetsDone18;
                      }
                      length = readI32(area, 8);
                      do {
                        if (+(readI32(count) === length)) {
                          break updateAreaEffectTargetsDone18;
                        }
                        count = count + 4 | 0;
                      } while (+(count !== value));
                      length = value - 4 | 0;
                      count = value;
                      break updateAreaEffectTargetsDone17;
                    }
                    const savedCount19 = count;
                    length = value - 4 | 0;
                    if (+(savedCount19 === length)) {
                      break updateAreaEffectTargetsDone16;
                    }
                  }
                  writeI32(count, readI32(length));
                  vector = readI32(scratch, 216);
                }
                writeI32(end, offset - 1 | 0, 28);
              } while (+(((vector ? vector : contextScratch) + capacity | 0) !== cursor));
              break updateAreaEffectTargetsDone8;
            }
            if (+(capacity === (count + (flag << 2) | 0))) {
              break updateAreaEffectTargetsDone8;
            }
            updateAreaEffectTargetsLoop3: while (true) {
              value = readI32(capacity);
              capacity = capacity + 4 | 0;
              length = readI32(area, 8);
              updateAreaEffectTargetsDone19: {
                vector = readI32(value, 192);
                value = readI32(vector, 32);
                const savedValue23 = value;
                entity = readI32(vector, 28);
                end = entity + 1 | 0;
                if (+(savedValue23 >>> 0 >= end >>> 0)) {
                  value = readI32(vector, 36);
                  break updateAreaEffectTargetsDone19;
                }
                value = value ? value << 1 : 1024;
                do {
                  count = value;
                  value = count << 1;
                } while (+(count >>> 0 < end >>> 0));
                offset = readI32(vector, 36);
                value = malloc(count << 2);
                cursor = memcpy(value, offset, entity << 2);
                free(offset);
                writeI32(vector, cursor, 36);
                writeI32(vector, count, 32);
                flag = readI32(scratch, 1056);
              }
              writeI32(value + (entity << 2) | 0, length);
              writeI32(vector, end, 28);
              const savedCapacity6 = capacity;
              const savedOffset3 = flag << 2;
              value = readI32(scratch, 1064);
              if (+(savedCapacity6 !== (savedOffset3 + (value ? value : targetScratch) | 0))) {
                continue updateAreaEffectTargetsLoop3;
              }
              break;
            }
          }
          cursor = readI32(area, 24);
          updateAreaEffectTargetsDone20: {
            value = readI32(area, 16);
            if (+(value === 0)) {
              break updateAreaEffectTargetsDone20;
            }
            count = cursor;
            offset = Math.imul(value, 12);
            capacity = offset - 12 | 0;
            value = (divideUnsigned(capacity, 12) + 1 | 0) & 3;
            if (value) {
              do {
                length = readI32(count, 4);
                writeI32(length, readI32(count, 8), 8);
                writeI32(readI32(count, 8), length, 4);
                count = count + 12 | 0;
                value = value - 1 | 0;
              } while (value);
            }
            if (+(capacity >>> 0 < 36)) {
              break updateAreaEffectTargetsDone20;
            }
            length = cursor + offset | 0;
            do {
              value = readI32(count, 4);
              writeI32(value, readI32(count, 8), 8);
              writeI32(readI32(count, 8), value, 4);
              value = readI32(count, 16);
              writeI32(value, readI32(count, 20), 8);
              writeI32(readI32(count, 20), value, 4);
              value = readI32(count, 28);
              writeI32(value, readI32(count, 32), 8);
              writeI32(readI32(count, 32), value, 4);
              value = readI32(count, 40);
              writeI32(value, readI32(count, 44), 8);
              writeI32(readI32(count, 44), value, 4);
              count = count + 48 | 0;
            } while (+(count !== length));
          }
          free(cursor);
          writeI64(area, 0n, 16);
          writeI32(area, 0, 24);
          let selectedValue22;
          updateAreaEffectTargetsDone21: {
            value = readI32(scratch, 1056);
            if (value) {
              offset = area + 16 | 0;
              growHandleVector(offset, value);
              count = readI32(scratch, 1064);
              const savedCount20 = count;
              value = readI32(scratch, 1056);
              if (+(value === 0)) {
                selectedValue22 = savedCount20;
                break updateAreaEffectTargetsDone21;
              }
              capacity = count ? count : targetScratch;
              length = capacity + (value << 2) | 0;
              count = readI32(offset);
              do {
                end = readI32(capacity);
                value = count + 1 | 0;
                if (+(value >>> 0 > readI32(area, 20) >>> 0)) {
                  growHandleVector(offset, value);
                }
                entity = readI32(area, 24) + Math.imul(count, 12) | 0;
                writeI32(entity, 0);
                writeI32(entity, entity, 8);
                cursor = entity + 8 | 0;
                const savedEntity2 = entity;
                let selectedValue23;
                updateAreaEffectTargetsDone22: {
                  if (+(end === 0)) {
                    writeI32(entity, 0);
                    selectedValue23 = entity;
                    break updateAreaEffectTargetsDone22;
                  }
                  writeI32(entity, readI32(end, 4));
                  const savedEntity3 = entity;
                  cursor = end + 12 | 0;
                  count = readI32(cursor);
                  writeI32(savedEntity3, count, 8);
                  writeI32(count, entity, 4);
                  selectedValue23 = end + 4 | 0;
                }
                writeI32(savedEntity2, selectedValue23, 4);
                writeI32(cursor, entity);
                writeI32(offset, value);
                count = value;
                capacity = capacity + 4 | 0;
              } while (+(capacity !== length));
            }
            selectedValue22 = readI32(scratch, 1064);
          }
          free(selectedValue22);
          free(readI32(scratch, 216));
        }
        areaIndex = areaIndex + 1 | 0;
      } while (+(areaIndex >>> 0 < readI32(24780) >>> 0));
    }
  }
  /** Choose the smallest component vector and update occupied petal slots, healing and owner state. */  function updateEquippedPetals(scratch, stepMilliseconds) {
    // Original WAT 150795–152687.
    let value = 0, count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, required = 0, entity = 0, end = 0, petalSlots = 0, playerState = 0, entityIndex = 0, flag = 0, componentMask = 0, smallestComponents = 0, amount = 0, scaleF32 = 0, amountF32 = 0, stepF32 = 0, valueF64 = 0, amountF64 = 0;
    cursor = readI32(24692);
    const savedCursor11 = cursor;
    count = readI32(24180);
    value = +(savedCursor11 >>> 0 > count >>> 0);
    smallestComponents = +(readI32(24136) >>> 0 < (value ? count : cursor) >>> 0) ? 24136 : value ? 24180 : 24692;
    if (readI32(smallestComponents)) {
      amountF64 = stepMilliseconds * 0.1;
      stepF32 = f32(stepMilliseconds);
      entityIndex = 0;
      do {
        value = readI32(readI32(readI32(smallestComponents, 8) + (entityIndex << 2) | 0));
        writeI32(scratch, 0, 208);
        writeU8(scratch, 0, 212);
        writeU16(scratch, 8216, 210);
        writeI32(scratch, readI32(value, 92), 1056);
        writeU8(scratch, readU8(value, 96), 1060);
        writeU16(scratch, 0, 1056);
        writeU8(scratch, 0, 1060);
        writeU8(scratch, readU8(scratch, 1058) & 24, 1058);
        writeU8(scratch, readU8(scratch, 1059) & 32, 1059);
        updateEquippedPetalsDone: {
          const resultOfMemcmp3 = memcmp(scratch + 1056 | 0, scratch + 208 | 0, 5);
          if (resultOfMemcmp3) {
            break updateEquippedPetalsDone;
          }
          petalSlots = readI32(value, 164);
          playerState = readI32(value, 168);
          componentMask = readI32(value, 200);
          offset = readI32(componentMask);
          entity = readI32(offset, 192);
          value = readI32(offset, 168);
          if (+(readU8(value, 80) === 0)) {
            updateWorldTransform(value);
            offset = readI32(componentMask);
          }
          updateEquippedPetalsDone2: {
            const storedF643 = readF64(value, 88);
            flag = readI32(offset);
            const savedBits12 = flag + 624 | 0;
            capacity = readU8(componentMask, 148);
            const resultOfMinimumPetalOrbitX = minimumLevelZoneX(savedBits12, capacity);
            if (+(storedF643 < resultOfMinimumPetalOrbitX)) {
              entry = 0;
              if (+(readF32(componentMask, 288) >= (+(readU8(flag, 873) === 1) ? 5000.0 : 45000.0))) {
                break updateEquippedPetalsDone2;
              }
            }
            count = 0;
            entry = 0;
            let selectedValue24;
            updateEquippedPetalsDone3: {
              if (+(capacity >>> 0 < 15)) {
                selectedValue24 = 5;
                break updateEquippedPetalsDone3;
              }
              if (+(capacity >>> 0 < 30)) {
                selectedValue24 = 6;
                break updateEquippedPetalsDone3;
              }
              selectedValue24 = +(capacity >>> 0 < 45) ? 7 : 8;
            }
            length = selectedValue24;
            end = length & 14;
            value = end;
            do {
              if (+(readU8(componentMask + Math.imul(count, 3) | 0, 584) === 0)) {
                entry = entry + +(readU8(count + componentMask | 0, 20) === 14) | 0;
              }
              const savedComponentMask = componentMask;
              cursor = count | 1;
              if (+(readU8(savedComponentMask + Math.imul(cursor, 3) | 0, 584) === 0)) {
                entry = entry + +(readU8(cursor + componentMask | 0, 20) === 14) | 0;
              }
              count = count + 2 | 0;
              value = value - 2 | 0;
            } while (value);
            if (+((length & 1) === 0)) {
              break updateEquippedPetalsDone2;
            }
            if (readU8(componentMask + Math.imul(end, 3) | 0, 584)) {
              break updateEquippedPetalsDone2;
            }
            entry = entry + +(readU8(end + componentMask | 0, 20) === 14) | 0;
          }
          value = readI32(offset, 168);
          if (+(readU8(value, 80) === 0)) {
            updateWorldTransform(value);
            flag = readI32(readI32(componentMask));
            capacity = readU8(componentMask, 148);
          }
          let selectedValue25;
          updateEquippedPetalsDone4: {
            const storedF644 = readF64(value, 88);
            const resultOfMinimumPetalOrbitX2 = minimumLevelZoneX(flag + 624 | 0, capacity);
            if (+(storedF644 < resultOfMinimumPetalOrbitX2)) {
              if (+(readF32(componentMask, 288) >= (+(readU8(flag, 873) === 1) ? 5000.0 : 45000.0))) {
                selectedValue25 = 0;
                break updateEquippedPetalsDone4;
              }
            }
            count = 0;
            cursor = 0;
            let selectedValue26;
            updateEquippedPetalsDone5: {
              if (+(capacity >>> 0 < 15)) {
                selectedValue26 = 5;
                break updateEquippedPetalsDone5;
              }
              if (+(capacity >>> 0 < 30)) {
                selectedValue26 = 6;
                break updateEquippedPetalsDone5;
              }
              selectedValue26 = +(capacity >>> 0 < 45) ? 7 : 8;
            }
            value = selectedValue26;
            offset = value & 12;
            capacity = offset;
            do {
              const savedCursor12 = cursor;
              length = componentMask + 20 | 0;
              cursor = (((savedCursor12 + +(readU8(length + count | 0) === 28) | 0) + +(readU8(length + (count | 1) | 0) === 28) | 0) + +(readU8(length + (count | 2) | 0) === 28) | 0) + +(readU8(length + (count | 3) | 0) === 28) | 0;
              count = count + 4 | 0;
              capacity = capacity - 4 | 0;
            } while (capacity);
            count = value & 3;
            if (count) {
              do {
                cursor = cursor + +(readU8(offset + componentMask | 0, 20) === 28) | 0;
                offset = offset + 1 | 0;
                count = count - 1 | 0;
              } while (count);
            }
            selectedValue25 = remainderUnsigned(cursor, 9);
          }
          end = (selectedValue25 << 2) + 1024 | 0;
          updateEquippedPetalsDone6: {
            value = readI32(entity, 16);
            if (+(value === 0)) {
              scaleF32 = 1.0;
              break updateEquippedPetalsDone6;
            }
            scaleF32 = 1.0;
            offset = readI32(entity, 24);
            count = offset;
            capacity = value << 2;
            length = capacity - 4 | 0;
            value = ((length >>> 2 | 0) + 1 | 0) & 3;
            if (value) {
              do {
                const savedScaleF3210 = scaleF32;
                cursor = readI32(count);
                const resultOfIndirect13 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "f32" ]
                }, readI32(readI32(cursor), 24), cursor);
                scaleF32 = f32(savedScaleF3210 * resultOfIndirect13);
                count = count + 4 | 0;
                value = value - 1 | 0;
              } while (value);
            }
            if (+(length >>> 0 <= 11)) {
              break updateEquippedPetalsDone6;
            }
            cursor = offset + capacity | 0;
            do {
              const savedScaleF3211 = scaleF32;
              value = readI32(count);
              const resultOfIndirect14 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF322 = f32(savedScaleF3211 * resultOfIndirect14);
              value = readI32(count, 4);
              const resultOfIndirect15 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF323 = f32(resultOfF322 * resultOfIndirect15);
              value = readI32(count, 8);
              const resultOfIndirect16 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF324 = f32(resultOfF323 * resultOfIndirect16);
              value = readI32(count, 12);
              const resultOfIndirect17 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              scaleF32 = f32(resultOfF324 * resultOfIndirect17);
              count = count + 16 | 0;
            } while (+(count !== cursor));
          }
          amount = readF32(end);
          updateEquippedPetalsDone7: {
            value = readI32(entity, 28);
            if (+(value === 0)) {
              break updateEquippedPetalsDone7;
            }
            offset = readI32(entity, 36);
            count = offset;
            capacity = value << 2;
            length = capacity - 4 | 0;
            value = ((length >>> 2 | 0) + 1 | 0) & 3;
            if (value) {
              do {
                const savedScaleF3212 = scaleF32;
                cursor = readI32(count);
                const resultOfIndirect18 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "f32" ]
                }, readI32(readI32(cursor), 24), cursor);
                scaleF32 = f32(savedScaleF3212 * resultOfIndirect18);
                count = count + 4 | 0;
                value = value - 1 | 0;
              } while (value);
            }
            if (+(length >>> 0 < 12)) {
              break updateEquippedPetalsDone7;
            }
            cursor = offset + capacity | 0;
            do {
              const savedScaleF3213 = scaleF32;
              value = readI32(count);
              const resultOfIndirect19 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF325 = f32(savedScaleF3213 * resultOfIndirect19);
              value = readI32(count, 4);
              const resultOfIndirect20 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF326 = f32(resultOfF325 * resultOfIndirect20);
              value = readI32(count, 8);
              const resultOfIndirect21 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              const resultOfF327 = f32(resultOfF326 * resultOfIndirect21);
              value = readI32(count, 12);
              const resultOfIndirect22 = runtime.indirect({
                parameters: [ "i32" ],
                results: [ "f32" ]
              }, readI32(readI32(value), 24), value);
              scaleF32 = f32(resultOfF327 * resultOfIndirect22);
              count = count + 16 | 0;
            } while (+(count !== cursor));
          }
          writeF32(componentMask, f32(((entry >>> 0) * 0.8 + 2.5) * amount * scaleF32 * stepMilliseconds * 0.001 + readF32(componentMask, 284)), 284);
          count = readI32(componentMask);
          if (+(+(readF32(readI32(count, 164), 8) <= 0.0) === 0)) {
            value = readI32(count, 168);
            if (+(readU8(value, 80) === 0)) {
              updateWorldTransform(value);
              count = readI32(componentMask);
            }
            let selectedValue27;
            updateEquippedPetalsDone8: {
              const storedF645 = readF64(value, 88);
              value = readI32(count);
              const resultOfMinimumPetalOrbitX3 = minimumLevelZoneX(value + 624 | 0, readU8(componentMask, 148));
              if (+(storedF645 < resultOfMinimumPetalOrbitX3)) {
                if (+(readF32(componentMask, 288) >= (+(readU8(value, 873) === 1) ? 5000.0 : 45000.0))) {
                  selectedValue27 = 0;
                  break updateEquippedPetalsDone8;
                }
              }
              selectedValue27 = 1;
            }
            entity = selectedValue27;
            writeI64(scratch, -1n, 216);
            writeI64(scratch, -1n, 208);
            capacity = 0;
            do {
              length = capacity + componentMask | 0;
              entry = (scratch + 208 | 0) + (capacity << 1) | 0;
              count = 0;
              do {
                updateEquippedPetalsDone9: {
                  updateEquippedPetalsDone10: {
                    required = (componentMask + Math.imul(capacity, 36) | 0) + Math.imul(count, 12) | 0;
                    end = required;
                    offset = end + 296 | 0;
                    value = readI32(offset);
                    if (+(value === 0)) {
                      break updateEquippedPetalsDone10;
                    }
                    cursor = readI32(value, 164);
                    if (+(cursor === 0)) {
                      break updateEquippedPetalsDone9;
                    }
                    updateEquippedPetalsDone11: {
                      amount = readF32(cursor, 8);
                      value = +(amount > 0.0);
                      if (+((value & (entity ^ -1)) === 0)) {
                        if (+(value === 0)) {
                          break updateEquippedPetalsDone11;
                        }
                        break updateEquippedPetalsDone9;
                      }
                      writeU16(scratch, 1, 1056);
                      damage(cursor, 0, amount, scratch + 1056 | 0);
                      if (+(readI32(end, 296) === 0)) {
                        break updateEquippedPetalsDone10;
                      }
                    }
                    value = readI32(required, 300);
                    writeI32(value, readI32(required, 304), 8);
                    writeI32(readI32(required, 304), value, 4);
                    writeI32(end, 0, 296);
                    writeI32(required, offset, 304);
                    writeI32(required, offset, 300);
                  }
                  cursor = readU8(length, 20);
                  value = +(((cursor - 1 | 0) & 255) >>> 0 > 37);
                  if (value) {
                    break updateEquippedPetalsDone9;
                  }
                  let selectedValue28;
                  updateEquippedPetalsDone12: {
                    offset = readU8(componentMask, 148);
                    if (+(offset >>> 0 < 15)) {
                      selectedValue28 = 5;
                      break updateEquippedPetalsDone12;
                    }
                    if (+(offset >>> 0 < 30)) {
                      selectedValue28 = 6;
                      break updateEquippedPetalsDone12;
                    }
                    selectedValue28 = +(offset >>> 0 < 45) ? 7 : 8;
                  }
                  if (+(selectedValue28 >>> 0 <= capacity >>> 0)) {
                    break updateEquippedPetalsDone9;
                  }
                  const savedCount21 = count;
                  cursor = value ? 0 : Math.imul(cursor, 52) + 8545792 | 0;
                  if (+(savedCount21 >>> 0 >= readI32(cursor, 32) >>> 0)) {
                    break updateEquippedPetalsDone9;
                  }
                  if (readU8(cursor, 40)) {
                    writeI32((componentMask + Math.imul(capacity, 12) | 0) + (count << 2) | 0, 0, 608);
                    writeU16(entry, 65535);
                    break updateEquippedPetalsDone9;
                  }
                  value = cursor + 28 | 0;
                  if (readU8((componentMask + Math.imul(capacity, 3) | 0) + count | 0, 584)) {
                    amount = readF32(cursor, 28);
                    writeI32(scratch, 1159479296, 1136);
                    writeF32(scratch, amount, 1056);
                    value = +(amount < 2500.0) ? scratch + 1136 | 0 : scratch + 1056 | 0;
                  }
                  cursor = (componentMask + Math.imul(capacity, 12) | 0) + (count << 2) | 0;
                  const savedCursor13 = cursor;
                  scaleF32 = readF32(value);
                  const savedScaleF3214 = scaleF32;
                  amount = f32(readF32(cursor, 608) + stepF32);
                  amount = +(amount > scaleF32) ? savedScaleF3214 : amount;
                  writeF32(savedCursor13, amount, 608);
                  if (+(entity === 0)) {
                    writeU16(entry, 0);
                    break updateEquippedPetalsDone9;
                  }
                  if (+(amount >= scaleF32)) {
                    createEquippedPetal(componentMask, capacity, count);
                    break updateEquippedPetalsDone9;
                  }
                  const savedEntry2 = entry;
                  let selectedValue29;
                  updateEquippedPetalsDone13: {
                    amount = f32(f32(amount * 65535.0) / scaleF32);
                    if (+(Math.abs(amount) < 2147483648.0)) {
                      selectedValue29 = truncateInteger(amount, false);
                      break updateEquippedPetalsDone13;
                    }
                    selectedValue29 = -2147483648;
                  }
                  value = selectedValue29;
                  value = +((value | 0) < 65535) ? value : 65535;
                  cursor = +((value | 0) > 0) ? value : 0;
                  const savedCursor14 = cursor;
                  value = readU16(entry);
                  writeU16(savedEntry2, +(value >>> 0 > cursor >>> 0) ? savedCursor14 : value);
                }
                count = count + 1 | 0;
              } while (+(count !== 3));
              capacity = capacity + 1 | 0;
            } while (+(capacity !== 8));
            count = 0;
            do {
              const savedComponentMask2 = componentMask;
              value = count << 1;
              length = savedComponentMask2 + value | 0;
              const storedU16 = readU16(length, 100);
              cursor = readU16((scratch + 208 | 0) + value | 0);
              if (+(storedU16 !== cursor)) {
                offset = readI32(componentMask);
                if (offset) {
                  const savedOffset4 = offset;
                  value = readI32(offset);
                  writeI32(savedOffset4, readI32(value, 2140), 492);
                  value = (value + ((readI32(offset, 16) & 16383) << 3) | 0) + 264880 | 0;
                  capacity = readI32(value);
                  writeI32(value, 0);
                  if (capacity) {
                    free(readI32(capacity, 12));
                    free(capacity);
                  }
                  value = readI32(offset);
                  writeI32((value + ((readI32(offset, 16) & 16383) << 2) | 0) + 133804 | 0, readI32(value, 2140));
                  const savedComponentMask3 = componentMask;
                  value = readI32(readI32(readI32(componentMask)), 2140);
                  writeI32(savedComponentMask3, value, 176);
                  writeI32(componentMask + (count << 2) | 0, value, 116);
                }
                writeU16(length, cursor, 100);
              }
              count = count + 1 | 0;
            } while (+(count !== 8));
          }
          refreshPetalConfiguration(componentMask);
          if (+(readU8(playerState, 80) === 0)) {
            updateWorldTransform(playerState);
          }
          value = readI32(readI32(componentMask));
          scaleF32 = +(readU8(value, 873) === 1) ? 5000.0 : 45000.0;
          valueF64 = readF32(componentMask, 288);
          amount = 0.0;
          updateEquippedPetalsDone14: {
            const storedF646 = readF64(playerState, 88);
            const resultOfMinimumPetalOrbitX4 = minimumLevelZoneX(value + 624 | 0, readU8(componentMask, 148));
            if (+(storedF646 < resultOfMinimumPetalOrbitX4)) {
              updateEquippedPetalsLoop: while (true) {
                amountF32 = scaleF32;
                scaleF32 = amount;
                const savedScaleF3215 = scaleF32;
                amount = amountF32;
                if (+(savedScaleF3215 > amount)) {
                  continue updateEquippedPetalsLoop;
                }
                break;
              }
              const savedComponentMask4 = componentMask;
              const savedScaleF3216 = scaleF32;
              const savedAmount3 = amount;
              amountF32 = f32(stepMilliseconds + valueF64);
              amount = +(scaleF32 > amountF32) ? savedScaleF3216 : +(amount < amountF32) ? savedAmount3 : amountF32;
              writeF32(savedComponentMask4, amount, 288);
              break updateEquippedPetalsDone14;
            }
            updateEquippedPetalsLoop2: while (true) {
              amountF32 = scaleF32;
              scaleF32 = amount;
              const savedScaleF3217 = scaleF32;
              amount = amountF32;
              if (+(savedScaleF3217 > amount)) {
                continue updateEquippedPetalsLoop2;
              }
              break;
            }
            const savedComponentMask5 = componentMask;
            const savedScaleF3218 = scaleF32;
            const savedAmount4 = amount;
            amountF32 = f32(valueF64 - amountF64);
            amount = +(scaleF32 > amountF32) ? savedScaleF3218 : +(amount < amountF32) ? savedAmount4 : amountF32;
            writeF32(savedComponentMask5, amount, 288);
          }
          const savedScratch18 = scratch;
          let selectedValue30;
          updateEquippedPetalsDone15: {
            amount = f32(f32(amount * 255.0) / (+(readU8(value, 873) === 1) ? 5000.0 : 45000.0));
            amount = +(amount < 0.0) ? 0.0 : Math.min(amount, 255.0);
            if (+(amount < 4294967296.0) & +(amount >= 0.0)) {
              selectedValue30 = truncateInteger(amount, true);
              break updateEquippedPetalsDone15;
            }
            selectedValue30 = 0;
          }
          writeU8(savedScratch18, selectedValue30, 208);
          updateEquippedPetalsDone16: {
            offset = componentMask + 149 | 0;
            if (+(readU8(offset) === readU8(scratch, 208))) {
              break updateEquippedPetalsDone16;
            }
            free(readI32(8551052));
            writeI64(8551048, 0n);
            writeI64(8551040, 0n);
            free(readI32(8555164));
            writeI64(8555160, 0n);
            writeI64(8555152, 0n);
            count = readU8(offset);
            if (readI32(8551040)) {
              writeI32(8551040, 0);
            }
            const storedI3218 = readI32(8551048);
            end = readI32(8551052);
            entity = end ? storedI3218 : 4096;
            const savedEntity4 = entity;
            length = readI32(8551044);
            cursor = length + 1 | 0;
            if (+(savedEntity4 >>> 0 < cursor >>> 0)) {
              [entity, end, capacity, value] = growBeforeComparisonWriter(entity, cursor, end, length);
            }
            writeU8((end ? end : 8551056) + length | 0, count);
            writeI32(8551044, cursor);
            const savedOffset5 = offset;
            cursor = readU8(scratch, 208);
            writeU8(savedOffset5, cursor);
            if (readI32(8555152)) {
              writeI32(8555152, 0);
            }
            const storedI3219 = readI32(8555160);
            count = readI32(8555164);
            entity = count ? storedI3219 : 4096;
            const savedEntity5 = entity;
            length = readI32(8555156);
            end = length + 1 | 0;
            if (+(savedEntity5 >>> 0 < end >>> 0)) {
              [entity, count, capacity, value] = growAfterComparisonWriter(entity, end, count, length);
            }
            writeU8((count ? count : 8555168) + length | 0, cursor);
            writeI32(8555156, end);
            updateEquippedPetalsDone17: {
              if (+(readI32(8551044) !== end)) {
                break updateEquippedPetalsDone17;
              }
              if (+(end === 0)) {
                break updateEquippedPetalsDone16;
              }
              value = readI32(8551052);
              length = value ? value : 8551056;
              const storedU87 = readU8(length);
              value = readI32(8555164);
              cursor = value ? value : 8555168;
              if (+(storedU87 !== readU8(cursor))) {
                break updateEquippedPetalsDone17;
              }
              count = 1;
              do {
                value = count;
                if (+(value === end)) {
                  break updateEquippedPetalsDone16;
                }
                count = value + 1 | 0;
              } while (+(readU8(value + length | 0) === readU8(value + cursor | 0)));
              if (+(value >>> 0 >= end >>> 0)) {
                break updateEquippedPetalsDone16;
              }
            }
            count = offset - 149 | 0;
            length = readI32(count);
            if (+(length === 0)) {
              break updateEquippedPetalsDone16;
            }
            const savedLength4 = length;
            value = readI32(length);
            writeI32(savedLength4, readI32(value, 2140), 492);
            value = (value + ((readI32(length, 16) & 16383) << 3) | 0) + 264880 | 0;
            cursor = readI32(value);
            writeI32(value, 0);
            if (cursor) {
              free(readI32(cursor, 12));
              free(cursor);
            }
            value = readI32(length);
            writeI32((value + ((readI32(length, 16) & 16383) << 2) | 0) + 133804 | 0, readI32(value, 2140));
            writeI32(count, readI32(readI32(readI32(count)), 2140), 184);
          }
          offset = 0;
          capacity = readI32(componentMask);
          count = capacity;
          updateEquippedPetalsDone18: {
            if (+(capacity === 0)) {
              break updateEquippedPetalsDone18;
            }
            do {
              if (readU8(count, 92) & 32) {
                offset = readI32(count, 120);
                break updateEquippedPetalsDone18;
              }
              const storedI3220 = readI32(count, 236);
              cursor = readU8(count, 93);
              value = storedI3220 & cursor << 25 >> 31;
              let selectedValue31;
              if (value) {
                selectedValue31 = value;
              } else {
                if (+((cursor & 64) === 0)) {
                  break updateEquippedPetalsDone18;
                }
                selectedValue31 = readI32(count, 224);
              }
              count = selectedValue31;
            } while (count);
          }
          amount = readF32(petalSlots, 8);
          if (+(+(amount > 0.0) === 0)) {
            break updateEquippedPetalsDone;
          }
          updateEquippedPetalsDone19: {
            updateEquippedPetalsDone20: {
              if (offset) {
                value = readI32(capacity, 168);
                if (+(readU8(value, 80) === 0)) {
                  updateWorldTransform(value);
                  capacity = readI32(componentMask);
                }
                const storedF647 = readF64(value, 88);
                value = readI32(capacity);
                const savedBits13 = value + 624 | 0;
                count = readU8(componentMask, 148);
                const resultOfMinimumPetalOrbitX5 = minimumLevelZoneX(savedBits13, count);
                if (+(storedF647 < resultOfMinimumPetalOrbitX5)) {
                  if (+(readF32(componentMask, 288) >= (+(readU8(value, 873) === 1) ? 5000.0 : 45000.0))) {
                    break updateEquippedPetalsDone20;
                  }
                }
                valueF64 = stepMilliseconds * readF32(petalSlots, 12);
                cursor = readI32(capacity, 168);
                if (+(readU8(cursor, 80) === 0)) {
                  updateWorldTransform(cursor);
                  count = readU8(componentMask, 148);
                  value = readI32(readI32(componentMask));
                }
                valueF64 = valueF64 * 4.166666666666667e-06;
                updateEquippedPetalsDone21: {
                  const storedF648 = readF64(cursor, 88);
                  const resultOfMinimumPetalOrbitX6 = minimumLevelZoneX(value + 624 | 0, count);
                  if (+(storedF648 < resultOfMinimumPetalOrbitX6)) {
                    cursor = 0;
                    if (+(readF32(componentMask, 288) >= (+(readU8(value, 873) === 1) ? 5000.0 : 45000.0))) {
                      break updateEquippedPetalsDone21;
                    }
                  }
                  let selectedValue32;
                  updateEquippedPetalsDone22: {
                    if (+(count >>> 0 < 15)) {
                      selectedValue32 = 5;
                      break updateEquippedPetalsDone22;
                    }
                    if (+(count >>> 0 < 30)) {
                      selectedValue32 = 6;
                      break updateEquippedPetalsDone22;
                    }
                    selectedValue32 = +(count >>> 0 < 45) ? 7 : 8;
                  }
                  offset = selectedValue32;
                  count = 0;
                  cursor = 0;
                  capacity = offset & 14;
                  value = capacity;
                  do {
                    if (+(readU8(componentMask + Math.imul(count, 3) | 0, 584) === 0)) {
                      cursor = cursor + +(readU8(count + componentMask | 0, 20) === 32) | 0;
                    }
                    const savedComponentMask6 = componentMask;
                    length = count | 1;
                    if (+(readU8(savedComponentMask6 + Math.imul(length, 3) | 0, 584) === 0)) {
                      cursor = cursor + +(readU8(length + componentMask | 0, 20) === 32) | 0;
                    }
                    count = count + 2 | 0;
                    value = value - 2 | 0;
                  } while (value);
                  if (+((offset & 1) === 0)) {
                    break updateEquippedPetalsDone21;
                  }
                  if (readU8(componentMask + Math.imul(capacity, 3) | 0, 584)) {
                    break updateEquippedPetalsDone21;
                  }
                  cursor = cursor + +(readU8(capacity + componentMask | 0, 20) === 32) | 0;
                }
                healEntity(petalSlots, f32(valueF64 + stepMilliseconds * (cursor >>> 0) * 0.001));
                if (+(readU8(23801) !== 1)) {
                  break updateEquippedPetalsDone;
                }
                capacity = readI32(componentMask);
                break updateEquippedPetalsDone19;
              }
              writeU16(scratch, 1, 208);
              const savedPetalSlots = petalSlots;
              let selectedValue33;
              if (+(readU8(componentMask, 148) >>> 0 >= 8)) {
                selectedValue33 = f32(stepMilliseconds * readF32(petalSlots, 12) * 1.6666666666666667e-05);
              } else {
                selectedValue33 = amount;
              }
              damage(savedPetalSlots, 0, selectedValue33, scratch + 208 | 0);
              if (+(readU8(23801) !== 1)) {
                break updateEquippedPetalsDone;
              }
              if (readU8(23800) & 1) {
                break updateEquippedPetalsDone;
              }
              writeU16(scratch, 0, 208);
              damage(petalSlots, 0, readF32(petalSlots, 8), scratch + 208 | 0);
              break updateEquippedPetalsDone;
            }
            if (+(readU8(23801) !== 1)) {
              break updateEquippedPetalsDone;
            }
          }
          value = readI32(capacity, 168);
          if (+(readU8(value, 80) === 0)) {
            updateWorldTransform(value);
            capacity = readI32(componentMask);
          }
          const storedF649 = readF64(value, 88);
          value = readI32(capacity);
          const resultOfMinimumPetalOrbitX7 = minimumLevelZoneX(value + 624 | 0, readU8(componentMask, 148));
          if (+(+(storedF649 < resultOfMinimumPetalOrbitX7) === 0)) {
            break updateEquippedPetalsDone;
          }
          if (+(+(readF32(componentMask, 288) >= (+(readU8(value, 873) === 1) ? 5000.0 : 45000.0)) === 0)) {
            break updateEquippedPetalsDone;
          }
          writeU16(scratch, 1, 208);
          damage(petalSlots, 0, f32(stepMilliseconds * readF32(petalSlots, 12) * 6.666666666666667e-05), scratch + 208 | 0);
        }
        entityIndex = entityIndex + 1 | 0;
      } while (+(entityIndex >>> 0 < readI32(smallestComponents) >>> 0));
      count = readI32(24180);
    }
    return [ count ];
  }
  /** Apply orbit behavior callbacks and accelerate each petal toward its computed target. */  function updatePetalOrbits(count, scratch, stepMilliseconds) {
    // Original WAT 152688–153139.
    let petalIndex = 0, componentEntriesPointer = 0, petalCount = 0, entity = 0, componentCountPointer = 0, petal = 0, ownerPosition = 0, petalPosition = 0, valueF32 = 0, scaleF32 = 0, valueF64 = 0, amountF64 = 0, targetY = 0, positionX = 0, angle = 0, orbitalAcceleration = 0, damping = 0;
    petalIndex = +(count >>> 0 > readI32(23228) >>> 0);
    componentCountPointer = (petalIndex ? 2284 : 3236) + 20944 | 0;
    petalCount = readI32(componentCountPointer);
    if (petalCount) {
      orbitalAcceleration = stepMilliseconds * 0.007;
      scaleF32 = f32(stepMilliseconds);
      componentEntriesPointer = (petalIndex ? 2292 : 3244) + 20944 | 0;
      petalIndex = 0;
      do {
        entity = readI32(readI32(readI32(componentEntriesPointer) + (petalIndex << 2) | 0));
        writeI32(scratch, 4096, 209);
        writeU8(scratch, 64, 208);
        const savedScratch19 = scratch;
        count = readI32(entity, 92);
        writeI32(savedScratch19, count, 1056);
        writeU8(scratch, readU8(entity, 96), 1060);
        writeU8(scratch, count & 64, 1056);
        writeU8(scratch, 0, 1057);
        writeU8(scratch, 0, 1060);
        writeU8(scratch, 0, 1059);
        writeU8(scratch, readU8(scratch, 1058) & 16, 1058);
        updatePetalOrbitsDone: {
          const resultOfMemcmp4 = memcmp(scratch + 1056 | 0, scratch + 208 | 0, 5);
          if (resultOfMemcmp4) {
            break updatePetalOrbitsDone;
          }
          petalPosition = readI32(entity, 168);
          count = readI32(petalPosition);
          ownerPosition = readI32(count, 164);
          valueF32 = readF32(ownerPosition, 8);
          if (+(valueF32 <= 0.0)) {
            break updatePetalOrbitsDone;
          }
          petal = readI32(entity, 124);
          writeU16(scratch, 1, 1136);
          updatePetalOrbitsDone2: {
            updatePetalOrbitsDone3: {
              if (readU8(count, 93) & 64) {
                entity = readI32(count, 236);
                if (entity) {
                  break updatePetalOrbitsDone3;
                }
              }
              damage(ownerPosition, 0, valueF32, scratch + 1136 | 0);
              break updatePetalOrbitsDone2;
            }
            updatePetalOrbitsDone4: {
              count = readI32(entity, 164);
              if (+(count === 0)) {
                break updatePetalOrbitsDone4;
              }
              if (+(+(readF32(count, 8) <= 0.0) === 0)) {
                break updatePetalOrbitsDone4;
              }
              damage(ownerPosition, 0, valueF32, scratch + 1136 | 0);
              break updatePetalOrbitsDone2;
            }
            petalCount = readI32(entity, 200);
            if (+(petalCount === 0)) {
              damage(ownerPosition, 0, valueF32, scratch + 1136 | 0);
              break updatePetalOrbitsDone2;
            }
            ownerPosition = readI32(entity, 168);
            writeF32(scratch, scaleF32, 216);
            writeI32(scratch, 0, 212);
            const savedScratch20 = scratch;
            count = readI32(petal);
            writeI32(savedScratch20, count, 208);
            updatePetalOrbitsDone5: {
              if (+((readU8(count, 93) & 64) === 0)) {
                break updatePetalOrbitsDone5;
              }
              count = readI32(count, 236);
              if (+(count === 0)) {
                break updatePetalOrbitsDone5;
              }
              writeI32(scratch, readI32(count, 200), 212);
            }
            const savedBits14 = scratch + 1056 | 0;
            count = readI32(petal, 20);
            runtime.indirect({
              parameters: [ "i32", "i32", "i32" ],
              results: []
            }, readI32(readI32(count), 12), savedBits14, count, scratch + 208 | 0);
            if (readU8(scratch, 1060)) {
              break updatePetalOrbitsDone2;
            }
            count = readU8(petal, 8);
            entity = +(((count - 1 | 0) & 255) >>> 0 > 37) ? 0 : Math.imul(count, 52) + 8545792 | 0;
            const savedProduct7 = (readU8(petal, 18) >>> 0) * 6.283185307179586;
            count = readU8(petalCount, 292);
            angle = savedProduct7 / ((+(count >>> 0 > 1) ? count : 1) | 0) + readF32(petalCount, 284);
            valueF32 = readF32(scratch, 1056);
            if (+(readU8(ownerPosition, 80) === 0)) {
              updateWorldTransform(ownerPosition);
            }
            positionX = readF64(ownerPosition, 88);
            valueF64 = readF64(ownerPosition, 96);
            writeI64(scratch, 4618760256179416344n, 40);
            writeF64(scratch, angle, 32);
            const savedValueF648 = valueF64;
            const hostResult10 = runtime.host("a", "a", 22903, 6924, scratch + 32 | 0);
            amountF64 = hostResult10;
            const resultOfSinF642 = sinF64(amountF64);
            valueF64 = valueF32;
            targetY = savedValueF648 + resultOfSinF642 * valueF64;
            const savedPositionX4 = positionX;
            const resultOfCosF642 = cosF64(amountF64);
            valueF64 = savedPositionX4 + resultOfCosF642 * valueF64;
            if (readU8(entity, 41)) {
              valueF32 = readF32(entity, 44);
              petalCount = readI32(entity, 32);
              count = readU8(petal, 17);
              writeI64(scratch, 4618760256179416344n, 24);
              writeF64(scratch, angle * 1.1 + (count >>> 0) * 6.283185307179586 / (petalCount >>> 0), 16);
              const savedTargetY = targetY;
              const hostResult11 = runtime.host("a", "a", 22903, 6924, scratch + 16 | 0);
              positionX = hostResult11;
              const resultOfSinF643 = sinF64(positionX);
              amountF64 = valueF32;
              targetY = savedTargetY + resultOfSinF643 * amountF64;
              const savedValueF649 = valueF64;
              const resultOfCosF643 = cosF64(positionX);
              valueF64 = savedValueF649 + resultOfCosF643 * amountF64;
            }
            count = 1;
            if (+(readU8(petalPosition, 80) === 0)) {
              updateWorldTransform(petalPosition);
              count = readU8(petalPosition, 80);
            }
            const savedPetalPosition = petalPosition;
            const savedOrbitalAcceleration = orbitalAcceleration;
            angle = valueF64 - readF64(petalPosition, 88);
            const savedProduct8 = angle * angle;
            damping = targetY - readF64(petalPosition, 96);
            positionX = savedProduct8 + damping * damping;
            valueF32 = f32(positionX * 0.0011111111111111111);
            amountF64 = savedOrbitalAcceleration * (+(valueF32 < 0.009999999776482582) ? 0.009999999776482582 : Math.min(valueF32, 2.0));
            const savedAmountF645 = amountF64;
            let selectedValue34;
            updatePetalOrbitsDone6: {
              let selectedValue35;
              if (count & 255) {
                selectedValue35 = positionX;
              } else {
                updateWorldTransform(petalPosition);
                angle = valueF64 - readF64(petalPosition, 88);
                const savedProduct9 = angle * angle;
                damping = targetY - readF64(petalPosition, 96);
                selectedValue35 = savedProduct9 + damping * damping;
              }
              valueF64 = Math.sqrt(selectedValue35);
              if (+(valueF64 < 2.220446049250313e-16)) {
                damping = 0.0;
                selectedValue34 = 1.0;
                break updatePetalOrbitsDone6;
              }
              damping = damping / valueF64;
              selectedValue34 = angle / valueF64;
            }
            writeF64(savedPetalPosition, savedAmountF645 * selectedValue34 + readF64(petalPosition, 40), 40);
            writeF64(petalPosition, amountF64 * damping + readF64(petalPosition, 48), 48);
          }
          petalCount = readI32(componentCountPointer);
        }
        petalIndex = petalIndex + 1 | 0;
      } while (+(petalIndex >>> 0 < petalCount >>> 0));
    }
  }
  /** Apply movement, self-damage and experience controls with behavior speed modifiers. */  function applyPlayerControls(scratch, stepMilliseconds) {
    // Original WAT 153140–153590.
    let value = 0, count = 0, length = 0, playerIndex = 0, offset = 0, capacity = 0, player = 0, entity = 0, end = 0, progression = 0, node = 0, position = 0, valueF32 = 0, acceleration = 0, direction = 0, speed = 0;
    playerIndex = 0;
    applyPlayerControlsDone: {
      if (+((readU8(23800) & 1) === 0)) {
        break applyPlayerControlsDone;
      }
      count = readI32(23184);
      if (+(count === 0)) {
        break applyPlayerControlsDone;
      }
      do {
        applyPlayerControlsDone2: {
          player = readI32(readI32(23192) + (playerIndex << 2) | 0);
          progression = readI32(player, 100);
          if (+(progression === 0)) {
            break applyPlayerControlsDone2;
          }
          applyPlayerControlsDone3: {
            value = readI32(progression, 164);
            if (+(value === 0)) {
              break applyPlayerControlsDone3;
            }
            valueF32 = readF32(value, 8);
            if (+(valueF32 <= 0.0)) {
              break applyPlayerControlsDone2;
            }
            if (+((readU8(23800) & 2) === 0)) {
              if (+((+(readI32(player, 172) === 0) & +(readU8(24837) !== 0)) === 0)) {
                break applyPlayerControlsDone3;
              }
            }
            if (+((readI32(player, 276) | 0) > -1)) {
              break applyPlayerControlsDone3;
            }
            writeU16(scratch, 0, 208);
            damage(value, 0, valueF32, scratch + 208 | 0);
          }
          position = readI32(progression, 168);
          applyPlayerControlsDone4: {
            entity = readI32(progression, 200);
            node = readI32(readI32(entity), 192);
            value = readI32(node, 16);
            if (+(value === 0)) {
              acceleration = 1.0;
              break applyPlayerControlsDone4;
            }
            acceleration = 1.0;
            end = readI32(node, 24);
            count = end;
            offset = value << 2;
            capacity = offset - 4 | 0;
            value = ((capacity >>> 2 | 0) + 1 | 0) & 3;
            if (value) {
              do {
                const savedAcceleration = acceleration;
                length = readI32(count);
                const resultOfIndirect23 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "f32" ]
                }, readI32(readI32(length), 20), length);
                acceleration = f32(savedAcceleration * resultOfIndirect23);
                count = count + 4 | 0;
                value = value - 1 | 0;
              } while (value);
            }
            if (+(capacity >>> 0 <= 11)) {
              break applyPlayerControlsDone4;
            }
            length = offset + end | 0;
            [acceleration, count, value] = multiplyBehaviorModifiers(acceleration, count, length);
          }
          applyPlayerControlsDone5: {
            value = readI32(node, 28);
            if (+(value === 0)) {
              break applyPlayerControlsDone5;
            }
            end = readI32(node, 36);
            count = end;
            offset = value << 2;
            capacity = offset - 4 | 0;
            value = ((capacity >>> 2 | 0) + 1 | 0) & 3;
            if (value) {
              do {
                const savedAcceleration2 = acceleration;
                length = readI32(count);
                const resultOfIndirect24 = runtime.indirect({
                  parameters: [ "i32" ],
                  results: [ "f32" ]
                }, readI32(readI32(length), 20), length);
                acceleration = f32(savedAcceleration2 * resultOfIndirect24);
                count = count + 4 | 0;
                value = value - 1 | 0;
              } while (value);
            }
            if (+(capacity >>> 0 < 12)) {
              break applyPlayerControlsDone5;
            }
            length = offset + end | 0;
            [acceleration, count, value] = multiplyBehaviorModifiers(acceleration, count, length);
          }
          acceleration = f32(stepMilliseconds * f32(acceleration * 2.5) * 0.001);
          applyPlayerControlsDone6: {
            if (readI32(player, 172)) {
              break applyPlayerControlsDone6;
            }
            if (+(readU8(24837) === 0)) {
              break applyPlayerControlsDone6;
            }
            value = readI32(player, 276);
            let selectedValue36;
            if (value & 1073741824) {
              const savedEntity6 = entity;
              const savedStepMilliseconds = stepMilliseconds;
              value = readU8(entity, 148);
              const resultOfExperienceLevelFactor = experienceLevelFactor(value - 1 | 0);
              addExperience(savedEntity6, f32(savedStepMilliseconds * f32(Math.floor(resultOfExperienceLevelFactor * (value >>> 0)) + 3.0) * 0.01));
              selectedValue36 = readI32(player, 276);
            } else {
              selectedValue36 = value;
            }
            if (+((selectedValue36 & 536870912) === 0)) {
              break applyPlayerControlsDone6;
            }
            valueF32 = readF32(player, 284);
            if (+(valueF32 > 200.0)) {
              const resultOfPowF642 = powF64(f32(valueF32 * 0.004999999888241291), 1.4);
              acceleration = f32(resultOfPowF642 * acceleration);
            }
            const savedScratch21 = scratch;
            value = readI32(progression, 164);
            valueF32 = readF32(value, 12);
            writeF32(savedScratch21, valueF32, 208);
            if (+(readF32(value, 8) <= 0.0)) {
              break applyPlayerControlsDone6;
            }
            direction = valueF32;
            if (+(direction < 0.0)) {
              writeI32(scratch, 0, 208);
              direction = 0.0;
            }
            writeF32(scratch, valueF32, 1056);
            setCurrentHealth(value + 8 | 0, +(valueF32 < direction) ? scratch + 1056 | 0 : scratch + 208 | 0);
          }
          speed = readF32(player, 284);
          direction = readF32(player, 280);
          valueF32 = cosF32(direction);
          const savedPosition = position;
          const storedF6410 = readF64(position, 40);
          const savedValueF322 = valueF32;
          acceleration = +(speed < 200.0) ? f32(acceleration * f32(speed * 0.004999999888241291)) : acceleration;
          writeF64(savedPosition, storedF6410 + f32(savedValueF322 * acceleration), 40);
          valueF32 = sinF32(direction);
          writeF64(position, readF64(position, 48) + f32(valueF32 * acceleration), 48);
          count = readI32(23184);
        }
        playerIndex = playerIndex + 1 | 0;
      } while (+(playerIndex >>> 0 < count >>> 0));
    }
  }
  /** Integrate angular/linear velocity, damping and arena bounds while retaining f32/f64 boundaries. */  function integrateMovement(scratch, tickFrame) {
    // Original WAT 153591–154068.
    let value = 0, entity = 0, xField = 0, positionIndex = 0, position = 0, yField = 0, angularStep = 0, radius = 0, valueF64 = 0, stepMilliseconds = 0, targetY = 0, positionX = 0, dragDisplacement = 0, rate = 0, damping = 0;
    stepMilliseconds = readF64(tickFrame, 24);
    damping = powF64(0.992, stepMilliseconds);
    positionIndex = 0;
    if (readI32(24180)) {
      dragDisplacement = 124.99999999999989 - damping * 124.99999999999989;
      do {
        position = readI32(readI32(24188) + (positionIndex << 2) | 0);
        writeU8(position, 0, 80);
        angularStep = f32(stepMilliseconds * 0.001 * f32(readF64(position, 72)));
        if (+(+(Math.abs(angularStep) < 1.1920928955078125e-07) === 0)) {
          valueF64 = readF64(position, 8);
          writeI64(scratch, 4618760256179416344n, 8);
          writeF64(scratch, f32(valueF64 + angularStep));
          const savedScratch22 = scratch;
          const hostResult12 = runtime.host("a", "a", 22903, 6924, scratch);
          writeF64(savedScratch22, hostResult12, 208);
          setLocalAngle(position + 8 | 0, scratch + 208 | 0);
          stepMilliseconds = readF64(tickFrame, 24);
        }
        angularStep = readF32(position, 20);
        targetY = readF64(position, 40);
        rate = readF64(position, 56);
        const savedScratch23 = scratch;
        const savedDragDisplacement = dragDisplacement;
        valueF64 = readF64(position, 48);
        positionX = savedDragDisplacement * valueF64 + stepMilliseconds * readF64(position, 64) + readF32(position, 16);
        writeF64(savedScratch23, positionX, 1056);
        const savedScratch24 = scratch;
        stepMilliseconds = dragDisplacement * targetY + stepMilliseconds * rate + angularStep;
        writeF64(savedScratch24, stepMilliseconds, 208);
        yField = position + 16 | 0;
        xField = position + 20 | 0;
        integrateMovementDone: {
          if (+(BigInt.asIntN(64, doubleBits(stepMilliseconds) & 9218868437227405312n) === 9218868437227405312n)) {
            break integrateMovementDone;
          }
          if (+(BigInt.asIntN(64, doubleBits(positionX) & 9218868437227405312n) === 9218868437227405312n)) {
            break integrateMovementDone;
          }
          integrateMovementDone2: {
            if (+(readU8(position, 80) === 0)) {
              break integrateMovementDone2;
            }
            writeU8(position, 0, 80);
            value = readI32(readI32(position), 84);
            if (+(value === 0)) {
              break integrateMovementDone2;
            }
            do {
              entity = readI32(value, 8);
              invalidateDescendant(value);
              value = entity;
            } while (value);
          }
          setLocalX(xField, scratch + 208 | 0);
          setLocalY(yField, scratch + 1056 | 0);
          valueF64 = readF64(position, 48);
          targetY = readF64(position, 40);
        }
        const savedPosition2 = position;
        stepMilliseconds = damping * valueF64;
        writeF64(savedPosition2, stepMilliseconds, 48);
        const savedPosition3 = position;
        valueF64 = damping * targetY;
        writeF64(savedPosition3, valueF64, 40);
        if (+(Math.abs(valueF64) < 2.220446049250313e-16)) {
          writeI64(position, 0n, 40);
        }
        if (+(Math.abs(stepMilliseconds) < 2.220446049250313e-16)) {
          writeI64(position, 0n, 48);
        }
        integrateMovementDone3: {
          entity = readI32(position);
          if (readU8(entity, 93) & 64) {
            if (readI32(entity, 224)) {
              break integrateMovementDone3;
            }
          }
          if (readU8(position, 36)) {
            break integrateMovementDone3;
          }
          const resultOfF328 = f32(readF32(23804) * -0.5);
          value = readI32(entity, 188);
          let selectedValue37;
          if (value) {
            selectedValue37 = -readF32(value, 8);
          } else {
            selectedValue37 = 0.0;
          }
          radius = selectedValue37;
          angularStep = f32(resultOfF328 - radius);
          if (+(angularStep > readF32(position, 20))) {
            const savedScratch25 = scratch;
            valueF64 = angularStep;
            writeF64(savedScratch25, valueF64, 208);
            if (+(BigInt.asIntN(64, doubleBits(valueF64) & 9218868437227405312n) !== 9218868437227405312n)) {
              integrateMovementDone4: {
                if (+(readU8(position, 80) === 0)) {
                  break integrateMovementDone4;
                }
                writeU8(position, 0, 80);
                value = readI32(entity, 84);
                if (+(value === 0)) {
                  break integrateMovementDone4;
                }
                do {
                  entity = readI32(value, 8);
                  invalidateDescendant(value);
                  value = entity;
                } while (value);
              }
              setLocalX(xField, scratch + 208 | 0);
            }
            writeI64(position, 0n, 40);
          }
          angularStep = f32(f32(readF32(23892) * -0.5) - radius);
          if (+(angularStep > readF32(position, 16))) {
            const savedScratch26 = scratch;
            valueF64 = angularStep;
            writeF64(savedScratch26, valueF64, 208);
            if (+(BigInt.asIntN(64, doubleBits(valueF64) & 9218868437227405312n) !== 9218868437227405312n)) {
              integrateMovementDone5: {
                if (+(readU8(position, 80) === 0)) {
                  break integrateMovementDone5;
                }
                writeU8(position, 0, 80);
                value = readI32(readI32(position), 84);
                if (+(value === 0)) {
                  break integrateMovementDone5;
                }
                do {
                  entity = readI32(value, 8);
                  invalidateDescendant(value);
                  value = entity;
                } while (value);
              }
              setLocalY(yField, scratch + 208 | 0);
            }
            writeI64(position, 0n, 48);
          }
          angularStep = f32(radius + f32(readF32(23804) * 0.5));
          if (+(angularStep < readF32(position, 20))) {
            const savedScratch27 = scratch;
            valueF64 = angularStep;
            writeF64(savedScratch27, valueF64, 208);
            if (+(BigInt.asIntN(64, doubleBits(valueF64) & 9218868437227405312n) !== 9218868437227405312n)) {
              integrateMovementDone6: {
                if (+(readU8(position, 80) === 0)) {
                  break integrateMovementDone6;
                }
                writeU8(position, 0, 80);
                value = readI32(readI32(position), 84);
                if (+(value === 0)) {
                  break integrateMovementDone6;
                }
                do {
                  entity = readI32(value, 8);
                  invalidateDescendant(value);
                  value = entity;
                } while (value);
              }
              setLocalX(xField, scratch + 208 | 0);
            }
            writeI64(position, 0n, 40);
          }
          angularStep = f32(radius + f32(readF32(23892) * 0.5));
          if (+(+(angularStep < readF32(position, 16)) === 0)) {
            break integrateMovementDone3;
          }
          const savedScratch28 = scratch;
          valueF64 = angularStep;
          writeF64(savedScratch28, valueF64, 208);
          if (+(BigInt.asIntN(64, doubleBits(valueF64) & 9218868437227405312n) !== 9218868437227405312n)) {
            integrateMovementDone7: {
              if (+(readU8(position, 80) === 0)) {
                break integrateMovementDone7;
              }
              writeU8(position, 0, 80);
              value = readI32(readI32(position), 84);
              if (+(value === 0)) {
                break integrateMovementDone7;
              }
              do {
                entity = readI32(value, 8);
                invalidateDescendant(value);
                value = entity;
              } while (value);
            }
            setLocalY(yField, scratch + 208 | 0);
          }
          writeI64(position, 0n, 48);
        }
        stepMilliseconds = readF64(tickFrame, 24);
        positionIndex = positionIndex + 1 | 0;
      } while (+(positionIndex >>> 0 < readI32(24180) >>> 0));
    }
  }
  /** Invalidate collider bounds, then compute each active collider box. */  function updateCollisionBounds() {
    // Original WAT 154069–154192.
    let count = 0, entries = 0, index = 0, remainder = 0, batchCount = 0;
    index = 0;
    updateCollisionBoundsDone: {
      count = readI32(24400);
      if (+(count === 0)) {
        break updateCollisionBoundsDone;
      }
      entries = readI32(24408);
      remainder = count & 3;
      if (+((count - 1 | 0) >>> 0 >= 3)) {
        batchCount = count & -4;
        do {
          const savedEntries = entries;
          count = index << 2;
          writeU8(readI32(savedEntries + count | 0), 0, 16);
          writeU8(readI32(entries + (count | 4) | 0), 0, 16);
          writeU8(readI32(entries + (count | 8) | 0), 0, 16);
          writeU8(readI32(entries + (count | 12) | 0), 0, 16);
          index = index + 4 | 0;
          batchCount = batchCount - 4 | 0;
        } while (batchCount);
      }
      updateCollisionBoundsDone2: {
        if (+(remainder === 0)) {
          count = 0;
          break updateCollisionBoundsDone2;
        }
        do {
          count = 0;
          writeU8(readI32(entries + (index << 2) | 0), 0, 16);
          index = index + 1 | 0;
          remainder = remainder - 1 | 0;
        } while (remainder);
      }
      updateCollisionBoundsLoop: while (true) {
        computeCollisionBounds(readI32(entries + (count << 2) | 0));
        count = count + 1 | 0;
        if (+(count >>> 0 >= readI32(24400) >>> 0)) {
          break updateCollisionBoundsDone;
        }
        entries = readI32(24408);
        continue updateCollisionBoundsLoop;
        break;
      }
      throw new WebAssembly.RuntimeError("unreachable");
    }
  }
  /** Rebuild arena bounds when required and relocate colliders before compacting the quadtree. */  function rebuildSpatialTree() {
    // Original WAT 154193–154456.
    let tree = 0, parent = 0, next = 0, colliderIndex = 0, capacity = 0, lowerY = 0, lowerX = 0, upperX = 0, upperY = 0;
    if (readU8(22929)) {
      if (+(readU8(24948) === 0)) {
        writeU8(24948, 1);
        upperY = f32(readF32(23892) * 0.5);
        upperX = f32(upperY + 500.0);
        lowerX = f32(readF32(23804) * 0.5);
        lowerY = f32(lowerX + 500.0);
        upperY = f32(-500.0 - upperY);
        lowerX = f32(-500.0 - lowerX);
        rebuildSpatialTreeDone: {
          tree = readI32(25008);
          if (+(tree === 0)) {
            break rebuildSpatialTreeDone;
          }
          colliderIndex = readI32(25016);
          parent = colliderIndex;
          capacity = tree << 2;
          next = capacity - 4 | 0;
          tree = ((next >>> 2 | 0) + 1 | 0) & 7;
          if (tree) {
            parent = colliderIndex;
            do {
              writeI32(readI32(parent), 0, 36);
              parent = parent + 4 | 0;
              tree = tree - 1 | 0;
            } while (tree);
          }
          if (+(next >>> 0 < 28)) {
            break rebuildSpatialTreeDone;
          }
          tree = colliderIndex + capacity | 0;
          do {
            writeI32(readI32(parent), 0, 36);
            writeI32(readI32(parent, 4), 0, 36);
            writeI32(readI32(parent, 8), 0, 36);
            writeI32(readI32(parent, 12), 0, 36);
            writeI32(readI32(parent, 16), 0, 36);
            writeI32(readI32(parent, 20), 0, 36);
            writeI32(readI32(parent, 24), 0, 36);
            writeI32(readI32(parent, 28), 0, 36);
            parent = parent + 32 | 0;
          } while (+(parent !== tree));
        }
        destroySpatialChildren(24984);
        free(readI32(25016));
        writeI64(25008, 0n);
        writeF32(25004, f32(upperX - upperY));
        writeF32(25000, f32(lowerY - lowerX));
        writeF32(24996, upperY);
        writeF32(24992, lowerX);
        writeI32(24984, 24952);
        writeI64(25016, 0n);
        writeI32(24988, 0);
      }
      capacity = 0;
      if (readI32(24400)) {
        do {
          colliderIndex = readI32(readI32(24408) + (capacity << 2) | 0);
          computeCollisionBounds(colliderIndex);
          rebuildSpatialTreeDone2: {
            parent = readI32(colliderIndex, 36);
            if (+(parent === 0)) {
              tree = 24984;
              break rebuildSpatialTreeDone2;
            }
            next = readI32(parent, 4);
            if (+(next === 0)) {
              tree = parent;
              break rebuildSpatialTreeDone2;
            }
            upperY = readF32(colliderIndex, 20);
            do {
              tree = parent;
              parent = next;
              rebuildSpatialTreeDone3: {
                const savedUpperY = upperY;
                upperX = readF32(tree, 8);
                if (+(savedUpperY < upperX)) {
                  break rebuildSpatialTreeDone3;
                }
                lowerX = readF32(colliderIndex, 24);
                const savedLowerX = lowerX;
                lowerY = readF32(tree, 12);
                if (+(savedLowerX < lowerY)) {
                  break rebuildSpatialTreeDone3;
                }
                if (+(f32(upperY + readF32(colliderIndex, 28)) >= f32(upperX + readF32(tree, 16)))) {
                  break rebuildSpatialTreeDone3;
                }
                if (+(+(f32(lowerX + readF32(colliderIndex, 32)) >= f32(lowerY + readF32(tree, 20))) === 0)) {
                  break rebuildSpatialTreeDone2;
                }
              }
              tree = parent;
              next = readI32(tree, 4);
            } while (next);
          }
          insertSpatialCollider(tree, colliderIndex);
          capacity = capacity + 1 | 0;
        } while (+(capacity >>> 0 < readI32(24400) >>> 0));
      }
      compactSpatialTree(24984);
    }
  }
  /** Query eligible collider pairs in entity order and resolve them through shared combat services. */  function resolveEntityCollisions(scratch) {
    // Original WAT 154457–154553.
    let entity = 0, colliderIndex = 0, collider = 0, count = 0, entries = 0, packedValue = 0n, otherPackedValue = 0n;
    count = readI32(24400);
    if (count) {
      entries = readI32(24408);
      colliderIndex = 0;
      do {
        const savedScratch29 = scratch;
        collider = readI32(entries + (colliderIndex << 2) | 0);
        writeI32(savedScratch29, collider, 1136);
        resolveEntityCollisionsDone: {
          if (readU8(collider, 49)) {
            break resolveEntityCollisionsDone;
          }
          const savedScratch30 = scratch;
          entity = readI32(collider);
          writeI32(savedScratch30, entity, 1032);
          if (readU8(entity, 93) & 64) {
            if (readI32(entity, 224)) {
              break resolveEntityCollisionsDone;
            }
          }
          entity = readI32(entity, 164);
          if (entity) {
            if (+(readF32(entity, 8) <= 0.0)) {
              break resolveEntityCollisionsDone;
            }
          }
          otherPackedValue = readI64(collider, 28);
          packedValue = readI64(collider, 20);
          writeI32(scratch, 24840, 1064);
          writeI32(scratch, scratch + 1136 | 0, 1060);
          writeI32(scratch, scratch + 1032 | 0, 1056);
          writeI64(scratch, otherPackedValue, 216);
          writeI64(scratch, packedValue, 208);
          queryCollisionPairs(24984, scratch + 208 | 0, scratch + 1056 | 0);
          entries = readI32(24408);
          count = readI32(24400);
        }
        colliderIndex = colliderIndex + 1 | 0;
      } while (+(colliderIndex >>> 0 < count >>> 0));
    }
  }
  /** Publish body or spectator transform coordinates and release the simulation scratch frame. */  function publishPlayerCoordinates(scratch) {
    // Original WAT 154554–154690.
    let position = 0, playerIndex = 0, player = 0, y = 0, x = 0;
    playerIndex = 0;
    if (readI32(23184)) {
      do {
        publishPlayerCoordinatesDone: {
          player = readI32(readI32(23192) + (playerIndex << 2) | 0);
          position = readI32(player, 100);
          if (position) {
            publishPlayerCoordinatesDone2: {
              position = readI32(position, 168);
              if (readU8(position, 80)) {
                x = readF64(position, 88);
                break publishPlayerCoordinatesDone2;
              }
              updateWorldTransform(position);
              x = readF64(position, 88);
              if (readU8(position, 80)) {
                break publishPlayerCoordinatesDone2;
              }
              updateWorldTransform(position);
            }
            y = readF64(position, 96);
            writeF32(scratch, f32(x), 208);
            writeF32(scratch, f32(y), 1056);
            setPlayerViewX(player + 12 | 0, scratch + 208 | 0);
            setPlayerViewY(player + 88 | 0, scratch + 1056 | 0);
            break publishPlayerCoordinatesDone;
          }
          position = readI32(player, 156);
          if (+(position === 0)) {
            break publishPlayerCoordinatesDone;
          }
          position = readI32(position, 168);
          if (+(position === 0)) {
            break publishPlayerCoordinatesDone;
          }
          publishPlayerCoordinatesDone3: {
            if (readU8(position, 80)) {
              x = readF64(position, 88);
              break publishPlayerCoordinatesDone3;
            }
            updateWorldTransform(position);
            x = readF64(position, 88);
            if (readU8(position, 80)) {
              break publishPlayerCoordinatesDone3;
            }
            updateWorldTransform(position);
          }
          y = readF64(position, 96);
          writeF32(scratch, f32(x), 208);
          writeF32(scratch, f32(y), 1056);
          setPlayerViewX(player + 12 | 0, scratch + 208 | 0);
          setPlayerViewY(player + 88 | 0, scratch + 1056 | 0);
        }
        playerIndex = playerIndex + 1 | 0;
      } while (+(playerIndex >>> 0 < readI32(23184) >>> 0));
    }
    runtime.stackPointer.value = scratch + 1152 | 0;
  }
  /** Serialize pending broadcast events, compact consumed references and enqueue the event packet. */  function queueBroadcastEvents(tickFrame) {
    // Original WAT 154691–155341.
    let value = 0, count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, entity = 0, end = 0, componentData = 0, node = 0, vector = 0;
    queueBroadcastEventsDone: {
      if (readI32(8545488)) {
        break queueBroadcastEventsDone;
      }
      if (readU8(418936)) {
        break queueBroadcastEventsDone;
      }
      capacity = readI32(418924);
      if (+(capacity === 0)) {
        break queueBroadcastEventsDone;
      }
      end = readI32(418976);
      length = readI32(418932);
      count = length;
      cursor = capacity;
      do {
        const savedCount22 = count;
        const savedCount23 = count;
        offset = cursor >>> 1 | 0;
        value = savedCount23 + (offset << 4) | 0;
        const savedBits15 = value + 16 | 0;
        value = +(readI32(value) >>> 0 > end >>> 0);
        count = value ? savedCount22 : savedBits15;
        cursor = value ? offset : cursor + (offset ^ -1) | 0;
      } while (cursor);
      const savedCount24 = count;
      cursor = length + (capacity << 4) | 0;
      if (+(savedCount24 === cursor)) {
        break queueBroadcastEventsDone;
      }
      componentData = operatorNewOrAbort(4112);
      writeI64(componentData, 0n);
      writeI64(componentData, 0n, 8);
      vector = componentData + 16 | 0;
      writeU8(vector, 5);
      writeI32(componentData, 1, 4);
      value = length;
      do {
        const savedValue24 = value;
        const savedValue25 = value;
        offset = capacity >>> 1 | 0;
        value = savedValue25 + (offset << 4) | 0;
        const savedBits16 = value + 16 | 0;
        count = +(readI32(value) >>> 0 > end >>> 0);
        value = count ? savedValue24 : savedBits16;
        capacity = count ? offset : capacity + (offset ^ -1) | 0;
      } while (capacity);
      entry = 1;
      queueBroadcastEventsDone2: {
        if (+(value === cursor)) {
          count = 1;
          value = cursor;
          break queueBroadcastEventsDone2;
        }
        queueBroadcastEventsLoop: while (true) {
          cursor = readI32(value);
          const savedCursor15 = cursor;
          count = readI32(418980);
          writeI32(418980, +(count >>> 0 < cursor >>> 0) ? savedCursor15 : count);
          count = readU8(value, 12) ? cursor : 0;
          cursor = 0;
          [cursor, count, length] = writeTickVarUint(tickFrame, cursor, count);
          if (readI32(componentData)) {
            writeI32(componentData, 0);
          }
          const storedI3221 = readI32(componentData, 8);
          capacity = readI32(componentData, 12);
          count = capacity ? storedI3221 : 4096;
          const savedCount25 = count;
          node = cursor + entry | 0;
          if (+(savedCount25 >>> 0 < node >>> 0)) {
            [count, capacity, offset, length] = growByteWriter(count, node, capacity, vector, entry, componentData);
          }
          memcpy((capacity ? capacity : vector) + entry | 0, tickFrame + 24 | 0, cursor);
          writeI32(componentData, node, 4);
          end = readI32(value, 4);
          offset = readI32(end, 12);
          capacity = readI32(end, 4);
          if (readI32(componentData)) {
            writeI32(componentData, 0);
          }
          const storedI3222 = readI32(componentData, 8);
          cursor = readI32(componentData, 12);
          count = cursor ? storedI3222 : 4096;
          const savedCount26 = count;
          entry = capacity + node | 0;
          if (+(savedCount26 >>> 0 < entry >>> 0)) {
            [count, cursor, entity, length] = growByteWriter(count, entry, cursor, vector, node, componentData);
          }
          memcpy((cursor ? cursor : vector) + node | 0, offset ? offset : end + 16 | 0, capacity);
          writeI32(componentData, entry, 4);
          value = value + 16 | 0;
          const savedValue26 = value;
          length = readI32(418932);
          const savedLength5 = length;
          count = readI32(418924);
          if (+(savedValue26 !== (savedLength5 + (count << 4) | 0))) {
            continue queueBroadcastEventsLoop;
          }
          break;
        }
      }
      queueBroadcastEventsDone3: {
        if (+(count === 0)) {
          break queueBroadcastEventsDone3;
        }
        queueBroadcastEventsDone4: {
          do {
            if (+(readU8(length, 12) === 0)) {
              do {
                const savedLength6 = length;
                count = value - 16 | 0;
                if (+(savedLength6 === count)) {
                  break queueBroadcastEventsDone3;
                }
                cursor = value - 4 | 0;
                value = count;
              } while (+(readU8(cursor) === 0));
              count = value - length | 0;
              cursor = (count >> 4) + 1 | 0;
              if (+((count | 0) > 32)) {
                break queueBroadcastEventsDone4;
              }
              length = partitionBroadcastMessages(length, value, cursor, 0, 0);
              break queueBroadcastEventsDone3;
            }
            length = length + 16 | 0;
          } while (+(length !== value));
          length = value;
          break queueBroadcastEventsDone3;
        }
        const savedLength7 = length;
        const savedValue27 = value;
        const savedCursor16 = cursor;
        count = +((cursor | 0) < 134217727) ? cursor : 134217727;
        value = operatorNewOrAbort(count << 4);
        length = partitionBroadcastMessages(savedLength7, savedValue27, savedCursor16, value, count);
        free(value);
      }
      const savedLength8 = length;
      capacity = readI32(418932);
      cursor = capacity + (readI32(418924) << 4) | 0;
      if (+(savedLength8 !== cursor)) {
        count = length;
        do {
          queueBroadcastEventsDone5: {
            offset = readI32(count, 8);
            if (+(offset === 0)) {
              break queueBroadcastEventsDone5;
            }
            const savedOffset6 = offset;
            value = readI32(offset, 4);
            writeI32(savedOffset6, value - 1 | 0, 4);
            if (value) {
              break queueBroadcastEventsDone5;
            }
            runtime.indirect({
              parameters: [ "i32" ],
              results: []
            }, readI32(readI32(offset), 8), offset);
            releaseMessageControlBlock(offset);
          }
          count = count + 16 | 0;
        } while (+(count !== cursor));
      }
      count = (length - capacity | 0) >> 4;
      writeI32(418924, count);
      value = readI32(componentData, 4);
      cursor = value - 1 | 0;
      if (cursor) {
        count = 0;
        queueBroadcastEventsDone6: {
          if (+(value !== 2)) {
            capacity = cursor & 1;
            cursor = cursor & -2;
            do {
              value = readI32(componentData, 12);
              value = (value ? value : vector) + count | 0;
              writeU8(value, readU8(value, 1) ^ readU8((count & 254) + 4576 | 0), 1);
              length = count | 1;
              const savedLength9 = length;
              value = readI32(componentData, 12);
              value = savedLength9 + (value ? value : vector) | 0;
              writeU8(value, readU8(value, 1) ^ readU8((length & 255) + 4576 | 0), 1);
              count = count + 2 | 0;
              cursor = cursor - 2 | 0;
            } while (cursor);
            if (+(capacity === 0)) {
              break queueBroadcastEventsDone6;
            }
          }
          value = readI32(componentData, 12);
          value = (value ? value : vector) + count | 0;
          writeU8(value, readU8(value, 1) ^ readU8((count & 255) + 4576 | 0), 1);
        }
        count = readI32(418924);
      }
      capacity = readI32(8545488) ? 0 : readI32(418980);
      writeI32(418976, capacity);
      value = readI32(418932);
      cursor = value;
      if (count) {
        cursor = value;
        do {
          const savedCursor17 = cursor;
          const savedCursor18 = cursor;
          offset = count >>> 1 | 0;
          cursor = savedCursor18 + (offset << 4) | 0;
          const savedBits17 = cursor + 16 | 0;
          length = +(readI32(cursor) >>> 0 > capacity >>> 0);
          cursor = length ? savedCursor17 : savedBits17;
          count = length ? offset : count + (offset ^ -1) | 0;
        } while (count);
      }
      eraseMessages(418924, value, cursor);
      value = readU8(8545512);
      writeI32((value << 2) + 8545516 | 0, componentData);
      writeU8(8545512, value + 1 | 0);
    }
  }
  /** Allocate the snapshot packet, encode revisions and collect the viewer visibility set. */  function beginSnapshot() {
    // Original WAT 155342–156212.
    let value = 0, phaseCursor = 0, length = 0, visibleCount = 0, offset = 0, hasFirstPlayer = 0, entry = 0, sharedScratch = 0, viewer = 0, end = 0, baselineRevision = 0, packetFrame = 0, visibleVector = 0, knownStart = 0, packet = 0, pendingCountPointer = 0, packetInlineStorage = 0, pendingEntriesPointer = 0, knownRecordsPointer = 0, usesLocalConnection = 0, headerBytes = 0, valueF32 = 0, scaleF32 = 0, amountF32 = 0, stepF32 = 0;
    packet = operatorNewOrAbort(4112);
    writeI64(packet, 0n);
    writeI64(packet, 0n, 8);
    writeU8(packet, 1, 16);
    writeI32(packet, 1, 4);
    phaseCursor = 0;
    knownStart = 0;
    packetFrame = runtime.stackPointer.value - 5232 | 0;
    runtime.stackPointer.value = packetFrame;
    offset = readI32(8545488) | readU8(418936);
    baselineRevision = readI32(offset ? 4 : 418884);
    value = readI32(25068);
    [phaseCursor, value, visibleCount] = writeTickVarUint(packetFrame, phaseCursor, value);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3223 = readI32(packet, 8);
    length = readI32(packet, 12);
    value = length ? storedI3223 : 4096;
    const savedValue28 = value;
    end = readI32(packet, 4);
    headerBytes = end + phaseCursor | 0;
    if (+(savedValue28 >>> 0 < headerBytes >>> 0)) {
      [value, length, hasFirstPlayer, viewer, visibleCount] = growEmbeddedByteWriter(value, headerBytes, length, packet, end);
    }
    const savedLength10 = length;
    packetInlineStorage = packet + 16 | 0;
    memcpy((length ? savedLength10 : packetInlineStorage) + end | 0, packetFrame + 24 | 0, phaseCursor);
    writeI32(packet, headerBytes, 4);
    usesLocalConnection = +(offset === 0);
    value = readI32(usesLocalConnection ? 418968 : 88);
    phaseCursor = 0;
    [phaseCursor, value, visibleCount] = writeTickVarUint(packetFrame, phaseCursor, value);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3224 = readI32(packet, 8);
    offset = readI32(packet, 12);
    value = offset ? storedI3224 : 4096;
    const savedValue29 = value;
    length = phaseCursor + headerBytes | 0;
    if (+(savedValue29 >>> 0 < length >>> 0)) {
      [value, offset, hasFirstPlayer, visibleCount] = growByteWriter(value, length, offset, packetInlineStorage, headerBytes, packet);
    }
    memcpy((offset ? offset : packetInlineStorage) + headerBytes | 0, packetFrame + 24 | 0, phaseCursor);
    writeI32(packet, length, 4);
    writeI32(packetFrame, 0, 4144);
    writeI64(packetFrame, 0n, 4136);
    memset(packetFrame + 24 | 0, 0, 2048);
    const savedPacketFrame = packetFrame;
    value = readI32(418880);
    writeI32(savedPacketFrame, value, 5176);
    phaseCursor = readU8(value + 24837 | 0);
    writeI32(packetFrame, packetFrame + 24 | 0, 5184);
    writeI32(packetFrame, packetFrame + 4136 | 0, 5180);
    length = 0;
    beginSnapshotDone: {
      if (+(phaseCursor === 0)) {
        break beginSnapshotDone;
      }
      phaseCursor = 0;
      visibleCount = readI32(24416);
      if (visibleCount) {
        phaseCursor = readI32(visibleCount, 16);
      }
      offset = (packetFrame + 24 | 0) + ((phaseCursor >>> 3 | 0) & 2047) | 0;
      hasFirstPlayer = readU8(offset);
      const savedHasFirstPlayer = hasFirstPlayer;
      visibleCount = 1 << (phaseCursor & 7);
      if (savedHasFirstPlayer & visibleCount) {
        break beginSnapshotDone;
      }
      writeU8(offset, visibleCount | hasFirstPlayer);
      writeI32(packetFrame, 1, 4136);
      writeI32(packetFrame, phaseCursor, 4148);
      length = 1;
    }
    phaseCursor = packetFrame + 24 | 0;
    beginSnapshotDone2: {
      if (+(readU8(23801) !== 1)) {
        break beginSnapshotDone2;
      }
      offset = 0;
      visibleCount = readI32(23240);
      if (visibleCount) {
        offset = readI32(visibleCount, 16);
      }
      end = (packetFrame + 24 | 0) + ((offset >>> 3 | 0) & 2047) | 0;
      hasFirstPlayer = readU8(end);
      const savedHasFirstPlayer2 = hasFirstPlayer;
      visibleCount = 1 << (offset & 7);
      if (savedHasFirstPlayer2 & visibleCount) {
        break beginSnapshotDone2;
      }
      writeU8(end, visibleCount | hasFirstPlayer);
      writeI32(packetFrame + 4136 | 0 | length << 2, offset, 12);
      writeI32(packetFrame, length + 1 | 0, 4136);
      phaseCursor = readI32(packetFrame, 5184);
      value = readI32(packetFrame, 5176);
    }
    const savedPhaseCursor = phaseCursor;
    offset = readI32(Math.imul(value, 12) + 24936 | 0);
    hasFirstPlayer = readI32(offset, 16);
    length = savedPhaseCursor + ((hasFirstPlayer >>> 3 | 0) & 2047) | 0;
    visibleCount = readU8(length);
    const savedVisibleCount = visibleCount;
    phaseCursor = 1 << (hasFirstPlayer & 7);
    if (+((savedVisibleCount & phaseCursor) === 0)) {
      writeU8(length, phaseCursor | visibleCount);
      visibleVector = readI32(packetFrame, 5180);
      const storedI3225 = readI32(visibleVector, 4);
      visibleCount = readI32(visibleVector, 8);
      value = visibleCount ? storedI3225 : 256;
      const savedValue30 = value;
      end = readI32(visibleVector);
      hasFirstPlayer = end + 1 | 0;
      if (+(savedValue30 >>> 0 < hasFirstPlayer >>> 0)) {
        do {
          phaseCursor = value;
          value = phaseCursor << 1;
        } while (+(value >>> 0 < hasFirstPlayer >>> 0));
        const savedVisibleCount2 = visibleCount;
        length = visibleVector + 12 | 0;
        viewer = visibleCount ? savedVisibleCount2 : length;
        visibleCount = malloc(phaseCursor << 3);
        phaseCursor = memcpy(visibleCount, viewer, end << 2);
        if (+(length !== viewer)) {
          free(viewer);
        }
        writeI32(visibleVector, phaseCursor, 8);
        writeI32(visibleVector, value, 4);
      }
      writeI32((end << 2) + (visibleCount ? visibleCount : visibleVector + 12 | 0) | 0, readI32(offset, 16));
      writeI32(visibleVector, hasFirstPlayer);
      value = readI32(packetFrame, 5176);
    }
    visibleCount = 0;
    let selectedValue38;
    beginSnapshotDone3: {
      if (value) {
        selectedValue38 = 0;
        break beginSnapshotDone3;
      }
      value = readI32(24936);
      if (+(value === 0)) {
        selectedValue38 = 0;
        break beginSnapshotDone3;
      }
      selectedValue38 = readI32(value, 120);
    }
    viewer = selectedValue38;
    let selectedValue39;
    {
      value = readI32(23552);
      if (value) {
        visibleCount = readI32(value, 16);
      }
      length = readI32(packetFrame, 5184) + ((visibleCount >>> 3 | 0) & 2047) | 0;
      phaseCursor = readU8(length);
      const savedPhaseCursor2 = phaseCursor;
      value = 1 << (visibleCount & 7);
      selectedValue39 = +((savedPhaseCursor2 & value) === 0);
    }
    if (selectedValue39) {
      writeU8(length, value | phaseCursor);
      visibleVector = readI32(packetFrame, 5180);
      const storedI3226 = readI32(visibleVector, 4);
      entry = readI32(visibleVector, 8);
      value = entry ? storedI3226 : 256;
      const savedValue31 = value;
      offset = readI32(visibleVector);
      hasFirstPlayer = offset + 1 | 0;
      if (+(savedValue31 >>> 0 < hasFirstPlayer >>> 0)) {
        do {
          phaseCursor = value;
          value = phaseCursor << 1;
        } while (+(value >>> 0 < hasFirstPlayer >>> 0));
        const savedEntry3 = entry;
        length = visibleVector + 12 | 0;
        end = entry ? savedEntry3 : length;
        entry = malloc(phaseCursor << 3);
        phaseCursor = memcpy(entry, end, offset << 2);
        if (+(length !== end)) {
          free(end);
        }
        writeI32(visibleVector, phaseCursor, 8);
        writeI32(visibleVector, value, 4);
      }
      writeI32((offset << 2) + (entry ? entry : visibleVector + 12 | 0) | 0, visibleCount);
      writeI32(visibleVector, hasFirstPlayer);
    }
    beginSnapshotDone4: {
      value = readI32(viewer, 100);
      if (+(value === 0)) {
        break beginSnapshotDone4;
      }
      writeU8(readI32(packetFrame, 5176) + 25066 | 0, 1);
      const storedI3227 = readI32(packetFrame, 5184);
      offset = readI32(value, 16);
      visibleCount = storedI3227 + ((offset >>> 3 | 0) & 2047) | 0;
      phaseCursor = readU8(visibleCount);
      const savedPhaseCursor3 = phaseCursor;
      value = 1 << (offset & 7);
      if (savedPhaseCursor3 & value) {
        break beginSnapshotDone4;
      }
      writeU8(visibleCount, value | phaseCursor);
      visibleVector = readI32(packetFrame, 5180);
      const storedI3228 = readI32(visibleVector, 4);
      entry = readI32(visibleVector, 8);
      value = entry ? storedI3228 : 256;
      const savedValue32 = value;
      hasFirstPlayer = readI32(visibleVector);
      length = hasFirstPlayer + 1 | 0;
      if (+(savedValue32 >>> 0 < length >>> 0)) {
        do {
          phaseCursor = value;
          value = phaseCursor << 1;
        } while (+(value >>> 0 < length >>> 0));
        const savedEntry4 = entry;
        visibleCount = visibleVector + 12 | 0;
        end = entry ? savedEntry4 : visibleCount;
        entry = malloc(phaseCursor << 3);
        phaseCursor = memcpy(entry, end, hasFirstPlayer << 2);
        if (+(visibleCount !== end)) {
          free(end);
        }
        writeI32(visibleVector, phaseCursor, 8);
        writeI32(visibleVector, value, 4);
      }
      writeI32((hasFirstPlayer << 2) + (entry ? entry : visibleVector + 12 | 0) | 0, offset);
      writeI32(visibleVector, length);
    }
    if (readU8(readI32(packetFrame, 5176) + 25066 | 0)) {
      const savedPacketFrame2 = packetFrame;
      valueF32 = readF32(viewer, 92);
      stepF32 = f32(f32(1080.0 / valueF32) + 200.0);
      writeF32(savedPacketFrame2, stepF32, 5212);
      const savedPacketFrame3 = packetFrame;
      amountF32 = f32(f32(1920.0 / valueF32) + 200.0);
      writeF32(savedPacketFrame3, amountF32, 5208);
      const savedPacketFrame4 = packetFrame;
      scaleF32 = f32(f32(amountF32 * -0.5) + readF32(viewer, 12));
      writeF32(savedPacketFrame4, scaleF32, 5200);
      const savedPacketFrame5 = packetFrame;
      valueF32 = f32(f32(stepF32 * -0.5) + readF32(viewer, 88));
      writeF32(savedPacketFrame5, valueF32, 5204);
      writeI32(packetFrame, packetFrame + 5176 | 0, 5196);
      writeI32(packetFrame, packetFrame + 5200 | 0, 5192);
      writeF32(packetFrame, stepF32, 5228);
      writeF32(packetFrame, amountF32, 5224);
      writeF32(packetFrame, valueF32, 5220);
      writeF32(packetFrame, scaleF32, 5216);
      queryVisibleEntities(24984, packetFrame + 5216 | 0, packetFrame + 5192 | 0);
    }
    value = readI32(packetFrame, 4144);
    const savedValue33 = value;
    sharedScratch = packetFrame + 4148 | 0;
    value = value ? savedValue33 : sharedScratch;
    sortEntityHandles(value, value + (readI32(packetFrame, 4136) << 2) | 0);
    writeI64(packetFrame, 0n, 32);
    writeI64(packetFrame, 0n, 24);
    pendingEntriesPointer = usesLocalConnection ? 418908 : 28;
    pendingCountPointer = usesLocalConnection ? 418900 : 20;
    knownRecordsPointer = usesLocalConnection ? 418896 : 16;
    return [ sharedScratch, baselineRevision, packetFrame, knownStart, packet, pendingCountPointer, packetInlineStorage, pendingEntriesPointer, knownRecordsPointer, usesLocalConnection, headerBytes ];
  }
  /** Merge sorted visibility with retained entity history and preserve removal/revision ordering. */  function mergeVisibilityChanges(sharedScratch, packetFrame, knownStart, pendingCountPointer, pendingEntriesPointer, knownRecordsPointer, usesLocalConnection) {
    // Original WAT 156213–157215.
    let value = 0, phaseCursor = 0, length = 0, visibleCount = 0, offset = 0, hasFirstPlayer = 0, entry = 0, required = 0, visibleEnd = 0, end = 0, pendingCapacityPointer = 0, node = 0, spawnCursor = 0, revision = 0, knownLength = 0, knownCountPointer = 0, packedValue = 0n, otherPackedValue = 0n;
    mergeVisibilityChangesDone: {
      knownCountPointer = usesLocalConnection ? 418888 : 8;
      length = readI32(knownCountPointer);
      if (+(length === 0)) {
        break mergeVisibilityChangesDone;
      }
      pendingCapacityPointer = usesLocalConnection ? 418904 : 24;
      revision = readI32(pendingCountPointer);
      hasFirstPlayer = readI32(knownRecordsPointer);
      mergeVisibilityChangesDone2: {
        mergeVisibilityChangesDone3: {
          phaseCursor = readI32(packetFrame, 4136);
          if (phaseCursor) {
            value = readI32(packetFrame, 4144);
            knownLength = value ? value : sharedScratch;
            visibleEnd = knownLength + (phaseCursor << 2) | 0;
            offset = hasFirstPlayer;
            do {
              mergeVisibilityChangesDone4: {
                required = readI32(hasFirstPlayer);
                visibleCount = required >>> 14 | 0;
                const savedVisibleCount3 = visibleCount;
                value = readI32(knownLength);
                phaseCursor = value >>> 14 | 0;
                const savedValue34 = +(savedVisibleCount3 >>> 0 < phaseCursor >>> 0);
                node = required & 16383;
                const savedNode2 = node;
                end = value & 16383;
                const savedValue35 = +(savedNode2 >>> 0 < end >>> 0);
                value = +(end === node);
                if (+((value ? savedValue34 : savedValue35) === 1)) {
                  packedValue = readI64Word(25068);
                  mergeVisibilityChangesDone5: {
                    value = readI32(pendingCapacityPointer);
                    const savedValue36 = value;
                    node = readI32(pendingCountPointer);
                    offset = node + 1 | 0;
                    if (+(savedValue36 >>> 0 >= offset >>> 0)) {
                      length = readI32(pendingEntriesPointer);
                      break mergeVisibilityChangesDone5;
                    }
                    value = value ? value << 1 : 512;
                    do {
                      phaseCursor = value;
                      value = phaseCursor << 1;
                    } while (+(phaseCursor >>> 0 < offset >>> 0));
                    spawnCursor = readI32(pendingEntriesPointer);
                    length = malloc(phaseCursor << 3);
                    mergeVisibilityChangesDone6: {
                      if (+(node === 0)) {
                        break mergeVisibilityChangesDone6;
                      }
                      entry = node & 3;
                      value = 0;
                      if (+((node - 1 | 0) >>> 0 >= 3)) {
                        knownStart = node & -4;
                        do {
                          const savedLength11 = length;
                          end = value << 3;
                          writeI64(savedLength11 + end | 0, readI64(end + spawnCursor | 0));
                          const savedLength12 = length;
                          visibleCount = end | 8;
                          writeI64(savedLength12 + visibleCount | 0, readI64(visibleCount + spawnCursor | 0));
                          const savedLength13 = length;
                          visibleCount = end | 16;
                          writeI64(savedLength13 + visibleCount | 0, readI64(visibleCount + spawnCursor | 0));
                          const savedLength14 = length;
                          visibleCount = end | 24;
                          writeI64(savedLength14 + visibleCount | 0, readI64(visibleCount + spawnCursor | 0));
                          value = value + 4 | 0;
                          knownStart = knownStart - 4 | 0;
                        } while (knownStart);
                      }
                      if (+(entry === 0)) {
                        break mergeVisibilityChangesDone6;
                      }
                      do {
                        const savedLength15 = length;
                        visibleCount = value << 3;
                        writeI64(savedLength15 + visibleCount | 0, readI64(visibleCount + spawnCursor | 0));
                        value = value + 1 | 0;
                        entry = entry - 1 | 0;
                      } while (entry);
                    }
                    free(spawnCursor);
                    writeI32(pendingCapacityPointer, phaseCursor);
                    writeI32(pendingEntriesPointer, length);
                  }
                  const savedLength16 = length;
                  visibleCount = node << 3;
                  writeI64(savedLength16 + visibleCount | 0, BigInt.asIntN(64, BigInt.asIntN(64, BigInt(required >>> 0) << (32n & 63n)) | packedValue));
                  writeI32(pendingCountPointer, offset);
                  mergeVisibilityChangesDone7: {
                    end = readI32(pendingEntriesPointer);
                    const savedBits18 = end + (offset << 3) | 0;
                    entry = end + (revision << 3) | 0;
                    value = savedBits18 - entry | 0;
                    if (+((value | 0) < 9)) {
                      break mergeVisibilityChangesDone7;
                    }
                    const savedEntry5 = entry;
                    phaseCursor = ((value >>> 3 | 0) - 2 | 0) >>> 1 | 0;
                    length = savedEntry5 + (phaseCursor << 3) | 0;
                    offset = readI32(length);
                    const savedOffset7 = offset;
                    value = visibleCount + end | 0;
                    if (+(savedOffset7 >>> 0 >= readI32(value) >>> 0)) {
                      break mergeVisibilityChangesDone7;
                    }
                    packedValue = readI64(value);
                    end = Number(BigInt.asIntN(32, BigInt.asUintN(64, packedValue) >> (32n & 63n)));
                    node = Number(BigInt.asIntN(32, packedValue));
                    mergeVisibilityChangesLoop: while (true) {
                      mergeVisibilityChangesDone8: {
                        writeI32(value, offset);
                        const savedValue37 = value;
                        visibleCount = length;
                        writeI32(savedValue37, readI32(visibleCount, 4), 4);
                        if (+(phaseCursor === 0)) {
                          break mergeVisibilityChangesDone8;
                        }
                        value = visibleCount;
                        const savedEntry6 = entry;
                        phaseCursor = divideSigned(phaseCursor - 1 | 0, 2);
                        length = savedEntry6 + (phaseCursor << 3) | 0;
                        offset = readI32(length);
                        if (+(offset >>> 0 < node >>> 0)) {
                          continue mergeVisibilityChangesLoop;
                        }
                      }
                      break;
                    }
                    writeI32(visibleCount, end, 4);
                    writeI32(visibleCount, node);
                  }
                  const savedKnownCountPointer = knownCountPointer;
                  value = hasFirstPlayer;
                  phaseCursor = value + 8 | 0;
                  const savedPhaseCursor4 = phaseCursor;
                  offset = readI32(knownRecordsPointer);
                  const savedOffset8 = offset;
                  length = readI32(knownCountPointer);
                  visibleCount = savedOffset8 + (length << 3) | 0;
                  let selectedValue40;
                  if (+(savedPhaseCursor4 !== visibleCount)) {
                    do {
                      writeI32(value, readI32(phaseCursor));
                      writeI32(value, readI32(value, 12), 4);
                      value = phaseCursor;
                      phaseCursor = value + 8 | 0;
                    } while (+(phaseCursor !== visibleCount));
                    offset = readI32(knownRecordsPointer);
                    selectedValue40 = readI32(knownCountPointer);
                  } else {
                    selectedValue40 = length;
                  }
                  length = selectedValue40 - 1 | 0;
                  writeI32(savedKnownCountPointer, length);
                  knownStart = 1;
                  const savedHasFirstPlayer3 = hasFirstPlayer;
                  spawnCursor = offset + (length << 3) | 0;
                  if (+(savedHasFirstPlayer3 !== spawnCursor)) {
                    break mergeVisibilityChangesDone4;
                  }
                  break mergeVisibilityChangesDone2;
                }
                hasFirstPlayer = (value ? +(phaseCursor >>> 0 < visibleCount >>> 0) : +(end >>> 0 < node >>> 0)) ? hasFirstPlayer : hasFirstPlayer + 8 | 0;
                const savedHasFirstPlayer4 = hasFirstPlayer;
                spawnCursor = offset + (length << 3) | 0;
                if (+(savedHasFirstPlayer4 !== spawnCursor)) {
                  knownLength = knownLength + 4 | 0;
                  break mergeVisibilityChangesDone4;
                }
                if (+((knownStart & 1) === 0)) {
                  break mergeVisibilityChangesDone;
                }
                break mergeVisibilityChangesDone2;
              }
            } while (+(visibleEnd !== knownLength));
            if (+(hasFirstPlayer !== spawnCursor)) {
              break mergeVisibilityChangesDone3;
            }
            writeI32(knownCountPointer, (spawnCursor - offset | 0) >> 3);
            if (knownStart & 1) {
              break mergeVisibilityChangesDone2;
            }
            break mergeVisibilityChangesDone;
          }
          spawnCursor = hasFirstPlayer + (length << 3) | 0;
        }
        visibleCount = hasFirstPlayer;
        do {
          otherPackedValue = readI64Word(visibleCount);
          packedValue = readI64Word(25068);
          mergeVisibilityChangesDone9: {
            value = readI32(pendingCapacityPointer);
            const savedValue38 = value;
            visibleEnd = readI32(pendingCountPointer);
            node = visibleEnd + 1 | 0;
            if (+(savedValue38 >>> 0 >= node >>> 0)) {
              length = readI32(pendingEntriesPointer);
              break mergeVisibilityChangesDone9;
            }
            value = value ? value << 1 : 512;
            do {
              phaseCursor = value;
              value = phaseCursor << 1;
            } while (+(phaseCursor >>> 0 < node >>> 0));
            knownLength = readI32(pendingEntriesPointer);
            length = malloc(phaseCursor << 3);
            mergeVisibilityChangesDone10: {
              if (+(visibleEnd === 0)) {
                break mergeVisibilityChangesDone10;
              }
              entry = visibleEnd & 3;
              value = 0;
              if (+((visibleEnd - 1 | 0) >>> 0 >= 3)) {
                knownStart = visibleEnd & -4;
                do {
                  const savedLength17 = length;
                  end = value << 3;
                  writeI64(savedLength17 + end | 0, readI64(end + knownLength | 0));
                  const savedLength18 = length;
                  offset = end | 8;
                  writeI64(savedLength18 + offset | 0, readI64(offset + knownLength | 0));
                  const savedLength19 = length;
                  offset = end | 16;
                  writeI64(savedLength19 + offset | 0, readI64(offset + knownLength | 0));
                  const savedLength20 = length;
                  offset = end | 24;
                  writeI64(savedLength20 + offset | 0, readI64(offset + knownLength | 0));
                  value = value + 4 | 0;
                  knownStart = knownStart - 4 | 0;
                } while (knownStart);
              }
              if (+(entry === 0)) {
                break mergeVisibilityChangesDone10;
              }
              do {
                const savedLength21 = length;
                offset = value << 3;
                writeI64(savedLength21 + offset | 0, readI64(offset + knownLength | 0));
                value = value + 1 | 0;
                entry = entry - 1 | 0;
              } while (entry);
            }
            free(knownLength);
            writeI32(pendingCapacityPointer, phaseCursor);
            writeI32(pendingEntriesPointer, length);
          }
          const savedLength22 = length;
          end = visibleEnd << 3;
          writeI64(savedLength22 + end | 0, BigInt.asIntN(64, BigInt.asIntN(64, otherPackedValue << (32n & 63n)) | packedValue));
          writeI32(pendingCountPointer, node);
          mergeVisibilityChangesDone11: {
            visibleEnd = readI32(pendingEntriesPointer);
            const savedBits19 = visibleEnd + (node << 3) | 0;
            knownLength = visibleEnd + (revision << 3) | 0;
            value = savedBits19 - knownLength | 0;
            if (+((value | 0) < 9)) {
              break mergeVisibilityChangesDone11;
            }
            const savedKnownLength = knownLength;
            phaseCursor = ((value >>> 3 | 0) - 2 | 0) >>> 1 | 0;
            length = savedKnownLength + (phaseCursor << 3) | 0;
            offset = readI32(length);
            const savedOffset9 = offset;
            value = visibleEnd + end | 0;
            if (+(savedOffset9 >>> 0 >= readI32(value) >>> 0)) {
              break mergeVisibilityChangesDone11;
            }
            packedValue = readI64(value);
            visibleEnd = Number(BigInt.asIntN(32, BigInt.asUintN(64, packedValue) >> (32n & 63n)));
            node = Number(BigInt.asIntN(32, packedValue));
            mergeVisibilityChangesLoop2: while (true) {
              mergeVisibilityChangesDone12: {
                writeI32(value, offset);
                const savedValue39 = value;
                end = length;
                writeI32(savedValue39, readI32(end, 4), 4);
                if (+(phaseCursor === 0)) {
                  break mergeVisibilityChangesDone12;
                }
                value = end;
                const savedKnownLength2 = knownLength;
                phaseCursor = divideSigned(phaseCursor - 1 | 0, 2);
                length = savedKnownLength2 + (phaseCursor << 3) | 0;
                offset = readI32(length);
                if (+(offset >>> 0 < node >>> 0)) {
                  continue mergeVisibilityChangesLoop2;
                }
              }
              break;
            }
            writeI32(end, visibleEnd, 4);
            writeI32(end, node);
          }
          visibleCount = visibleCount + 8 | 0;
        } while (+(visibleCount !== spawnCursor));
        writeI32(knownCountPointer, (hasFirstPlayer - readI32(knownRecordsPointer) | 0) >> 3);
      }
      value = readI32(pendingEntriesPointer);
      const savedValue40 = value;
      phaseCursor = readI32(pendingCountPointer);
      visibleCount = savedValue40 + (phaseCursor << 3) | 0;
      const savedVisibleCount4 = visibleCount;
      const savedValue41 = value;
      pendingCapacityPointer = revision << 3;
      node = savedValue41 + pendingCapacityPointer | 0;
      length = savedVisibleCount4 - node | 0;
      if (+((length | 0) >= 9)) {
        knownStart = node + 16 | 0;
        visibleEnd = node + 8 | 0;
        knownLength = length >>> 3 | 0;
        mergeVisibilityChangesLoop3: while (true) {
          mergeVisibilityChangesDone13: {
            value = readI32(node);
            const savedNode3 = node;
            visibleCount = visibleCount - 8 | 0;
            writeI32(savedNode3, readI32(visibleCount));
            writeI32(visibleCount, value);
            value = readI32(node, 4);
            writeI32(node, readI32(visibleCount, 4), 4);
            writeI32(visibleCount, value, 4);
            if (+(knownLength === 2)) {
              break mergeVisibilityChangesDone13;
            }
            phaseCursor = 1;
            value = visibleEnd;
            if (+(knownLength !== 3)) {
              const savedKnownStart = knownStart;
              const savedVisibleEnd = visibleEnd;
              phaseCursor = +(readI32(visibleEnd) >>> 0 < readI32(knownStart) >>> 0);
              value = phaseCursor ? savedKnownStart : savedVisibleEnd;
              phaseCursor = phaseCursor ? 2 : 1;
            }
            end = knownLength - 1 | 0;
            offset = readI32(value);
            if (+(offset >>> 0 >= readI32(node) >>> 0)) {
              required = (knownLength - 3 | 0) >>> 1 | 0;
              packedValue = readI64(node);
              entry = Number(BigInt.asIntN(32, BigInt.asUintN(64, packedValue) >> (32n & 63n)));
              spawnCursor = Number(BigInt.asIntN(32, packedValue));
              length = node;
              mergeVisibilityChangesLoop4: while (true) {
                mergeVisibilityChangesDone14: {
                  writeI32(length, offset);
                  const savedLength23 = length;
                  hasFirstPlayer = value;
                  writeI32(savedLength23, readI32(hasFirstPlayer, 4), 4);
                  if (+((phaseCursor | 0) > (required | 0))) {
                    break mergeVisibilityChangesDone14;
                  }
                  const savedNode4 = node;
                  length = phaseCursor << 1;
                  phaseCursor = length | 1;
                  value = savedNode4 + (phaseCursor << 3) | 0;
                  const savedEnd4 = end;
                  offset = length + 2 | 0;
                  if (+((savedEnd4 | 0) > (offset | 0))) {
                    const savedBits20 = value + 8 | 0;
                    const savedValue42 = value;
                    length = +(readI32(value) >>> 0 < readI32(value, 8) >>> 0);
                    value = length ? savedBits20 : savedValue42;
                    phaseCursor = length ? offset : phaseCursor;
                  }
                  length = hasFirstPlayer;
                  offset = readI32(value);
                  if (+(offset >>> 0 >= spawnCursor >>> 0)) {
                    continue mergeVisibilityChangesLoop4;
                  }
                }
                break;
              }
              writeI32(hasFirstPlayer, entry, 4);
              writeI32(hasFirstPlayer, spawnCursor);
            }
            value = +((knownLength | 0) > 2);
            knownLength = end;
            if (value) {
              continue mergeVisibilityChangesLoop3;
            }
          }
          break;
        }
        phaseCursor = readI32(pendingCountPointer);
        value = readI32(pendingEntriesPointer);
      }
      length = value + (phaseCursor << 3) | 0;
      const savedLength24 = length;
      visibleCount = value + pendingCapacityPointer | 0;
      hasFirstPlayer = (savedLength24 - visibleCount | 0) >> 3;
      phaseCursor = +((hasFirstPlayer | 0) < (revision | 0)) ? hasFirstPlayer : revision;
      if (+((phaseCursor | 0) <= 0)) {
        mergeRevisionRecords(value, visibleCount, length, revision, hasFirstPlayer, 0, 0);
        break mergeVisibilityChangesDone;
      }
      const savedValue43 = value;
      const savedVisibleCount5 = visibleCount;
      const savedLength25 = length;
      const savedRevision = revision;
      const savedHasFirstPlayer5 = hasFirstPlayer;
      phaseCursor = +((phaseCursor | 0) < 268435455) ? phaseCursor : 268435455;
      value = operatorNewOrAbort(phaseCursor << 3);
      mergeRevisionRecords(savedValue43, savedVisibleCount5, savedLength25, savedRevision, savedHasFirstPlayer5, value, phaseCursor);
      free(value);
    }
    return [ knownCountPointer ];
  }
  /** Encode removal handles and random padding before entity update records. */  function beginEntityRecords(baselineRevision, packetFrame, pendingCountPointer, pendingEntriesPointer, knownCountPointer) {
    // Original WAT 157216–157789.
    let value = 0, phaseCursor = 0, length = 0, visibleCount = 0, offset = 0, hasFirstPlayer = 0, entity = 0, end = 0, node = 0, knownLength = 0, recordInlineStorage = 0;
    length = readI32(pendingEntriesPointer);
    const savedLength26 = length;
    value = readI32(pendingCountPointer);
    visibleCount = savedLength26 + (value << 3) | 0;
    if (value) {
      do {
        const savedLength27 = length;
        const savedLength28 = length;
        hasFirstPlayer = value >>> 1 | 0;
        phaseCursor = savedLength28 + (hasFirstPlayer << 3) | 0;
        const savedBits21 = phaseCursor + 8 | 0;
        phaseCursor = +(readI32(phaseCursor) >>> 0 > baselineRevision >>> 0);
        length = phaseCursor ? savedLength27 : savedBits21;
        value = phaseCursor ? hasFirstPlayer : value + (hasFirstPlayer ^ -1) | 0;
      } while (value);
    }
    value = (visibleCount - length | 0) >> 3;
    phaseCursor = 0;
    [phaseCursor, value, visibleCount] = writePacketVarUint(packetFrame, phaseCursor, value);
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3229 = readI32(packetFrame, 32);
    visibleCount = readI32(packetFrame, 36);
    value = visibleCount ? storedI3229 : 4096;
    const savedValue44 = value;
    entity = readI32(packetFrame, 28);
    end = entity + phaseCursor | 0;
    if (+(savedValue44 >>> 0 < end >>> 0)) {
      do {
        value = value << 1;
      } while (+(value >>> 0 < end >>> 0));
      const savedVisibleCount6 = visibleCount;
      offset = packetFrame + 40 | 0;
      node = visibleCount ? savedVisibleCount6 : offset;
      visibleCount = malloc(value);
      hasFirstPlayer = memcpy(visibleCount, node, entity);
      if (+(offset !== node)) {
        free(node);
      }
      writeI32(packetFrame, hasFirstPlayer, 36);
      writeI32(packetFrame, value, 32);
    }
    const savedVisibleCount7 = visibleCount;
    recordInlineStorage = packetFrame + 40 | 0;
    memcpy((visibleCount ? savedVisibleCount7 : recordInlineStorage) + entity | 0, packetFrame + 5216 | 0, phaseCursor);
    writeI32(packetFrame, end, 28);
    writeI64(packetFrame, 1095216660480n, 5216);
    visibleCount = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3230 = readI32(packetFrame, 32);
    offset = readI32(packetFrame, 36);
    value = offset ? storedI3230 : 4096;
    const savedValue45 = value;
    end = readI32(packetFrame, 28);
    hasFirstPlayer = end + 1 | 0;
    if (+(savedValue45 >>> 0 < hasFirstPlayer >>> 0)) {
      [value, offset, entity, phaseCursor] = growSnapshotRecordWriter(value, hasFirstPlayer, offset, recordInlineStorage, end, packetFrame);
    }
    writeU8((offset ? offset : recordInlineStorage) + end | 0, visibleCount);
    writeI32(packetFrame, hasFirstPlayer, 28);
    writeI64(packetFrame, 1095216660480n, 5216);
    offset = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3231 = readI32(packetFrame, 32);
    phaseCursor = readI32(packetFrame, 36);
    value = phaseCursor ? storedI3231 : 4096;
    const savedValue46 = value;
    end = readI32(packetFrame, 28);
    visibleCount = end + 1 | 0;
    if (+(savedValue46 >>> 0 < visibleCount >>> 0)) {
      [value, phaseCursor, entity, hasFirstPlayer] = growSnapshotRecordWriter(value, visibleCount, phaseCursor, recordInlineStorage, end, packetFrame);
    }
    writeU8((phaseCursor ? phaseCursor : recordInlineStorage) + end | 0, offset);
    writeI32(packetFrame, visibleCount, 28);
    if (+((readI32(pendingEntriesPointer) + (readI32(pendingCountPointer) << 3) | 0) !== length)) {
      do {
        if (readI32(packetFrame, 24)) {
          writeI32(packetFrame, 0, 24);
        }
        end = readI32(length, 4);
        const storedI3232 = readI32(packetFrame, 32);
        offset = readI32(packetFrame, 36);
        value = offset ? storedI3232 : 4096;
        const savedValue47 = value;
        phaseCursor = visibleCount + 4 | 0;
        if (+(savedValue47 >>> 0 < phaseCursor >>> 0)) {
          [value, offset, entity, hasFirstPlayer] = growSnapshotRecordWriter(value, phaseCursor, offset, recordInlineStorage, visibleCount, packetFrame);
        }
        writeI32((offset ? offset : recordInlineStorage) + visibleCount | 0, rotateLeft(end, 18));
        writeI32(packetFrame, phaseCursor, 28);
        visibleCount = phaseCursor;
        length = length + 8 | 0;
      } while (+(length !== (readI32(pendingEntriesPointer) + (readI32(pendingCountPointer) << 3) | 0)));
    }
    writeI64(packetFrame, 1095216660480n, 5216);
    visibleCount = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3233 = readI32(packetFrame, 32);
    length = readI32(packetFrame, 36);
    value = length ? storedI3233 : 4096;
    const savedValue48 = value;
    offset = readI32(packetFrame, 28);
    hasFirstPlayer = offset + 1 | 0;
    if (+(savedValue48 >>> 0 < hasFirstPlayer >>> 0)) {
      [value, length, end, phaseCursor] = growSnapshotRecordWriter(value, hasFirstPlayer, length, recordInlineStorage, offset, packetFrame);
    }
    writeU8((length ? length : recordInlineStorage) + offset | 0, visibleCount);
    writeI32(packetFrame, hasFirstPlayer, 28);
    writeI64(packetFrame, 1095216660480n, 5216);
    visibleCount = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3234 = readI32(packetFrame, 32);
    length = readI32(packetFrame, 36);
    value = length ? storedI3234 : 4096;
    const savedValue49 = value;
    offset = readI32(packetFrame, 28);
    hasFirstPlayer = offset + 1 | 0;
    if (+(savedValue49 >>> 0 < hasFirstPlayer >>> 0)) {
      [value, length, end, phaseCursor] = growSnapshotRecordWriter(value, hasFirstPlayer, length, recordInlineStorage, offset, packetFrame);
    }
    writeU8((length ? length : recordInlineStorage) + offset | 0, visibleCount);
    writeI32(packetFrame, hasFirstPlayer, 28);
    knownLength = readI32(knownCountPointer);
    phaseCursor = knownLength;
    visibleCount = readI32(packetFrame, 4136);
    return [ phaseCursor, visibleCount, knownLength, recordInlineStorage ];
  }
  /** Find retained versions, choose per-entity deltas or full cached payloads, and update visibility history. */  function encodeVisibleEntities(phaseCursor, visibleCount, sharedScratch, baselineRevision, packetFrame, knownLength, recordInlineStorage, knownRecordsPointer, knownCountPointer, usesLocalConnection) {
    // Original WAT 157790–179730.
    let value = 0, length = 0, recordWriter = 0, entityIndex = 0, hasFirstPlayer = 0, entityId = 0, required = 0, entity = 0, knownEnd = 0, ownershipFlags = 0, knownEntry = 0, spawnCursor = 0, knownStart = 0, wireFlags = 0, entityOffset = 0, visibleCursor = 0, knownCapacityPointer = 0, knownByteLength = 0, visibleEnd = 0, packedValue = 0n, otherPackedValue = 0n;
    if (visibleCount) {
      knownCapacityPointer = usesLocalConnection ? 418892 : 12;
      value = readI32(packetFrame, 4144);
      visibleCursor = value ? value : sharedScratch;
      visibleEnd = visibleCursor + (visibleCount << 2) | 0;
      knownByteLength = knownLength << 3;
      do {
        value = readI32(knownRecordsPointer);
        knownEnd = value + knownByteLength | 0;
        entityId = readI32(visibleCursor);
        entityIndex = entityId & 16383;
        if (knownLength) {
          length = entityId >>> 14 | 0;
          phaseCursor = knownLength;
          do {
            const savedValue50 = value;
            hasFirstPlayer = phaseCursor >>> 1 | 0;
            visibleCount = savedValue50 + (hasFirstPlayer << 3) | 0;
            const savedBits22 = visibleCount + 8 | 0;
            const savedValue51 = value;
            value = readI32(visibleCount);
            const savedValue52 = +((value >>> 14 | 0) >>> 0 < length >>> 0);
            value = value & 16383;
            visibleCount = +(value === entityIndex) ? savedValue52 : +(value >>> 0 < entityIndex >>> 0);
            value = visibleCount ? savedBits22 : savedValue51;
            phaseCursor = visibleCount ? phaseCursor + (hasFirstPlayer ^ -1) | 0 : hasFirstPlayer;
          } while (phaseCursor);
        }
        knownEntry = knownEnd;
        if (+(knownEntry !== value)) {
          knownEntry = +(readI32(value) === entityId) ? value : knownEnd;
        }
        entityOffset = Math.imul(entityIndex, 496);
        entity = entityOffset + 419020 | 0;
        value = entity;
        let selectedValue41;
        encodeVisibleEntitiesDone: {
          encodeVisibleEntitiesDone2: {
            encodeVisibleEntitiesDone3: {
              encodeVisibleEntitiesLoop: while (true) {
                if (+((readU8(value, 92) & 32) === 0)) {
                  const storedI3235 = readI32(value, 236);
                  visibleCount = readU8(value, 93);
                  phaseCursor = storedI3235 & visibleCount << 25 >> 31;
                  let selectedValue42;
                  if (phaseCursor) {
                    selectedValue42 = phaseCursor;
                  } else {
                    if (+((visibleCount & 64) === 0)) {
                      break encodeVisibleEntitiesDone3;
                    }
                    selectedValue42 = readI32(value, 224);
                  }
                  value = selectedValue42;
                  if (value) {
                    continue encodeVisibleEntitiesLoop;
                  }
                  break encodeVisibleEntitiesDone3;
                }
                break;
              }
              value = readI32(value, 120);
              if (value) {
                break encodeVisibleEntitiesDone2;
              }
            }
            value = 0;
            selectedValue41 = 0;
            break encodeVisibleEntitiesDone;
          }
          value = +(readI32(value, 172) === readI32(8545488));
          selectedValue41 = value << 6;
        }
        ownershipFlags = selectedValue41;
        encodeVisibleEntitiesDone4: {
          encodeVisibleEntitiesDone5: {
            encodeVisibleEntitiesDone6: {
              spawnCursor = +(knownEnd === knownEntry);
              if (spawnCursor) {
                break encodeVisibleEntitiesDone6;
              }
              if (+(baselineRevision >>> 0 < readI32(knownEntry, 4) >>> 0)) {
                break encodeVisibleEntitiesDone6;
              }
              phaseCursor = entityIndex << 2;
              if (+(readI32(value ? phaseCursor + 156732 | 0 : phaseCursor + 91196 | 0) >>> 0 <= baselineRevision >>> 0)) {
                break encodeVisibleEntitiesDone4;
              }
              hasFirstPlayer = 2;
              if (+(baselineRevision >>> 0 < readI32((readI32(entity) + ((readI32(entityOffset + 419036 | 0) & 16383) << 2) | 0) + 199340 | 0) >>> 0)) {
                hasFirstPlayer = +((countChangedComponents(entity, baselineRevision, 0, ownershipFlags) + 1 | 0) >>> 0 > 4);
              }
              if (readI32(packetFrame, 24)) {
                writeI32(packetFrame, 0, 24);
              }
              const storedI3236 = readI32(packetFrame, 32);
              entityIndex = readI32(packetFrame, 36);
              value = entityIndex ? storedI3236 : 4096;
              const savedValue53 = value;
              length = readI32(packetFrame, 28);
              required = length + 4 | 0;
              if (+(savedValue53 >>> 0 < required >>> 0)) {
                [value, entityIndex, visibleCount, phaseCursor] = growSnapshotRecordWriter(value, required, entityIndex, recordInlineStorage, length, packetFrame);
              }
              writeI32((entityIndex ? entityIndex : recordInlineStorage) + length | 0, rotateLeft(entityId, 18));
              writeI32(packetFrame, required, 28);
              if (readI32(packetFrame, 24)) {
                writeI32(packetFrame, 0, 24);
              }
              const storedI3237 = readI32(packetFrame, 32);
              entityIndex = readI32(packetFrame, 36);
              value = entityIndex ? storedI3237 : 4096;
              const savedValue54 = value;
              visibleCount = length + 5 | 0;
              if (+(savedValue54 >>> 0 < visibleCount >>> 0)) {
                [value, entityIndex, length, phaseCursor] = growSnapshotRecordWriter(value, visibleCount, entityIndex, recordInlineStorage, required, packetFrame);
              }
              const savedBits23 = (entityIndex ? entityIndex : recordInlineStorage) + required | 0;
              value = hasFirstPlayer | ownershipFlags;
              writeU8(savedBits23, value ^ 54);
              writeI32(packetFrame, visibleCount, 28);
              recordWriter = packetFrame + 24 | 0;
              writeEntityDelta(value, recordWriter, entity, baselineRevision);
              break encodeVisibleEntitiesDone5;
            }
            const savedBits24 = ownershipFlags | 9;
            value = ownershipFlags | 8;
            const savedValue55 = value;
            const resultOfCountChangedComponents = countChangedComponents(entity, baselineRevision, 1, value);
            wireFlags = +((resultOfCountChangedComponents + 1 | 0) >>> 0 > 4) ? savedBits24 : savedValue55;
            sharedScratch = ((wireFlags >>> 4 | 0) & 4 | entityIndex << 3) + 287804 | 0;
            let selectedValue43;
            if (readI32(sharedScratch)) {
              selectedValue43 = entityIndex;
            } else {
              buildFullEntityCache(sharedScratch, entity, packetFrame, wireFlags, entityOffset);
              entityId = readI32(visibleCursor);
              selectedValue43 = entityId & 16383;
            }
            value = readI32((selectedValue43 << 2) + 25660 | 0);
            encodeVisibleEntitiesDone7: {
              encodeVisibleEntitiesDone8: {
                if (+(spawnCursor === 0)) {
                  if (+(readI32(knownEntry, 4) >>> 0 <= value >>> 0)) {
                    break encodeVisibleEntitiesDone8;
                  }
                }
                if (+(readI32(25068) >>> 0 > (value + 1 | 0) >>> 0)) {
                  break encodeVisibleEntitiesDone7;
                }
              }
              wireFlags = wireFlags | -128;
            }
            if (readI32(packetFrame, 24)) {
              writeI32(packetFrame, 0, 24);
            }
            const storedI3238 = readI32(packetFrame, 32);
            phaseCursor = readI32(packetFrame, 36);
            value = phaseCursor ? storedI3238 : 4096;
            const savedValue56 = value;
            hasFirstPlayer = readI32(packetFrame, 28);
            entity = hasFirstPlayer + 4 | 0;
            if (+(savedValue56 >>> 0 < entity >>> 0)) {
              [value, phaseCursor, length, visibleCount] = growSnapshotRecordWriter(value, entity, phaseCursor, recordInlineStorage, hasFirstPlayer, packetFrame);
            }
            writeI32((phaseCursor ? phaseCursor : recordInlineStorage) + hasFirstPlayer | 0, rotateLeft(entityId, 18));
            writeI32(packetFrame, entity, 28);
            if (readI32(packetFrame, 24)) {
              writeI32(packetFrame, 0, 24);
            }
            const storedI3239 = readI32(packetFrame, 32);
            entityIndex = readI32(packetFrame, 36);
            value = entityIndex ? storedI3239 : 4096;
            const savedValue57 = value;
            required = hasFirstPlayer + 5 | 0;
            if (+(savedValue57 >>> 0 < required >>> 0)) {
              [value, entityIndex, visibleCount, phaseCursor] = growSnapshotRecordWriter(value, required, entityIndex, recordInlineStorage, entity, packetFrame);
            }
            writeU8((entityIndex ? entityIndex : recordInlineStorage) + entity | 0, wireFlags ^ 54);
            writeI32(packetFrame, required, 28);
            entity = readI32(sharedScratch);
            hasFirstPlayer = readI32(entity, 12);
            length = readI32(entity, 4);
            if (readI32(packetFrame, 24)) {
              writeI32(packetFrame, 0, 24);
            }
            const storedI3240 = readI32(packetFrame, 32);
            entityIndex = readI32(packetFrame, 36);
            value = entityIndex ? storedI3240 : 4096;
            const savedValue58 = value;
            visibleCount = length + required | 0;
            if (+(savedValue58 >>> 0 < visibleCount >>> 0)) {
              [value, entityIndex, entityId, phaseCursor] = growSnapshotRecordWriter(value, visibleCount, entityIndex, recordInlineStorage, required, packetFrame);
            }
            memcpy((entityIndex ? entityIndex : recordInlineStorage) + required | 0, hasFirstPlayer ? hasFirstPlayer : entity + 16 | 0, length);
            writeI32(packetFrame, visibleCount, 28);
          }
          if (+(knownEnd !== knownEntry)) {
            break encodeVisibleEntitiesDone4;
          }
          otherPackedValue = readI64Word(visibleCursor);
          packedValue = readI64Word(25068);
          encodeVisibleEntitiesDone9: {
            value = readI32(knownCapacityPointer);
            const savedValue59 = value;
            knownEnd = readI32(knownCountPointer);
            hasFirstPlayer = knownEnd + 1 | 0;
            if (+(savedValue59 >>> 0 >= hasFirstPlayer >>> 0)) {
              length = readI32(knownRecordsPointer);
              break encodeVisibleEntitiesDone9;
            }
            value = value ? value << 1 : 512;
            do {
              phaseCursor = value;
              value = phaseCursor << 1;
            } while (+(phaseCursor >>> 0 < hasFirstPlayer >>> 0));
            entity = readI32(knownRecordsPointer);
            length = malloc(phaseCursor << 3);
            encodeVisibleEntitiesDone10: {
              if (+(knownEnd === 0)) {
                break encodeVisibleEntitiesDone10;
              }
              entityId = knownEnd & 3;
              value = 0;
              if (+((knownEnd - 1 | 0) >>> 0 >= 3)) {
                knownStart = knownEnd & -4;
                do {
                  const savedLength29 = length;
                  entityIndex = value << 3;
                  writeI64(savedLength29 + entityIndex | 0, readI64(entityIndex + entity | 0));
                  const savedLength30 = length;
                  visibleCount = entityIndex | 8;
                  writeI64(savedLength30 + visibleCount | 0, readI64(visibleCount + entity | 0));
                  const savedLength31 = length;
                  visibleCount = entityIndex | 16;
                  writeI64(savedLength31 + visibleCount | 0, readI64(visibleCount + entity | 0));
                  const savedLength32 = length;
                  visibleCount = entityIndex | 24;
                  writeI64(savedLength32 + visibleCount | 0, readI64(visibleCount + entity | 0));
                  value = value + 4 | 0;
                  knownStart = knownStart - 4 | 0;
                } while (knownStart);
              }
              if (+(entityId === 0)) {
                break encodeVisibleEntitiesDone10;
              }
              do {
                const savedLength33 = length;
                visibleCount = value << 3;
                writeI64(savedLength33 + visibleCount | 0, readI64(visibleCount + entity | 0));
                value = value + 1 | 0;
                entityId = entityId - 1 | 0;
              } while (entityId);
            }
            free(entity);
            writeI32(knownCapacityPointer, phaseCursor);
            writeI32(knownRecordsPointer, length);
          }
          const savedLength34 = length;
          phaseCursor = knownEnd << 3;
          writeI64(savedLength34 + phaseCursor | 0, BigInt.asIntN(64, BigInt.asIntN(64, packedValue << (32n & 63n)) | otherPackedValue));
          writeI32(knownCountPointer, hasFirstPlayer);
          visibleCount = readI32(knownRecordsPointer);
          const savedBits25 = visibleCount + (hasFirstPlayer << 3) | 0;
          required = visibleCount + knownByteLength | 0;
          value = savedBits25 - required | 0;
          if (+((value | 0) < 9)) {
            break encodeVisibleEntitiesDone4;
          }
          const savedRequired2 = required;
          length = ((value >>> 3 | 0) - 2 | 0) >>> 1 | 0;
          entityIndex = savedRequired2 + (length << 3) | 0;
          value = readI32(entityIndex);
          const savedBits26 = value >>> 14 | 0;
          phaseCursor = phaseCursor + visibleCount | 0;
          visibleCount = readI32(phaseCursor);
          const savedValue60 = +(savedBits26 >>> 0 < (visibleCount >>> 14 | 0) >>> 0);
          hasFirstPlayer = value & 16383;
          const savedHasFirstPlayer6 = hasFirstPlayer;
          visibleCount = visibleCount & 16383;
          if (+((+(visibleCount === hasFirstPlayer) ? savedValue60 : +(savedHasFirstPlayer6 >>> 0 < visibleCount >>> 0)) !== 1)) {
            break encodeVisibleEntitiesDone4;
          }
          packedValue = readI64(phaseCursor);
          entityId = Number(BigInt.asIntN(32, packedValue));
          entity = entityId >>> 14 | 0;
          knownEntry = entityId & 16383;
          knownEnd = Number(BigInt.asIntN(32, BigInt.asUintN(64, packedValue) >> (32n & 63n)));
          encodeVisibleEntitiesLoop2: while (true) {
            encodeVisibleEntitiesDone11: {
              writeI32(phaseCursor, value);
              const savedPhaseCursor5 = phaseCursor;
              visibleCount = entityIndex;
              writeI32(savedPhaseCursor5, readI32(visibleCount, 4), 4);
              if (+(length === 0)) {
                break encodeVisibleEntitiesDone11;
              }
              phaseCursor = visibleCount;
              const savedRequired3 = required;
              length = divideSigned(length - 1 | 0, 2);
              entityIndex = savedRequired3 + (length << 3) | 0;
              value = readI32(entityIndex);
              const savedValue61 = +((value >>> 14 | 0) >>> 0 < entity >>> 0);
              hasFirstPlayer = value & 16383;
              if (+(hasFirstPlayer === knownEntry) ? savedValue61 : +(hasFirstPlayer >>> 0 < knownEntry >>> 0)) {
                continue encodeVisibleEntitiesLoop2;
              }
            }
            break;
          }
          writeI32(visibleCount, knownEnd, 4);
          writeI32(visibleCount, entityId);
        }
        visibleCursor = visibleCursor + 4 | 0;
      } while (+(visibleCursor !== visibleEnd));
      phaseCursor = readI32(knownCountPointer);
    }
    return [ phaseCursor ];
  }
  /** Merge and encode final event streams, XOR the payload, enqueue it and remove deferred entities. */  function finishSnapshotAndRemoveEntities(phaseCursor, baselineRevision, packetFrame, knownLength, packet, recordInlineStorage, packetInlineStorage, knownRecordsPointer, knownCountPointer, usesLocalConnection, headerBytes) {
    // Original WAT 179731–181362.
    let value = 0, length = 0, visibleCount = 0, offset = 0, hasFirstPlayer = 0, connectionIsLocal = 0, required = 0, sharedScratch = 0, entity = 0, end = 0, field = 0, node = 0, spawnCursor = 0, knownStart = 0, revision = 0, pendingCountPointer = 0, pendingEntriesPointer = 0, packedValue = 0n;
    value = readI32(knownRecordsPointer);
    hasFirstPlayer = value + (phaseCursor << 3) | 0;
    const savedHasFirstPlayer7 = hasFirstPlayer;
    const savedValue62 = value;
    sharedScratch = knownLength << 3;
    connectionIsLocal = savedValue62 + sharedScratch | 0;
    visibleCount = savedHasFirstPlayer7 - connectionIsLocal | 0;
    if (+((visibleCount | 0) >= 9)) {
      pendingEntriesPointer = connectionIsLocal + 16 | 0;
      node = connectionIsLocal + 8 | 0;
      visibleCount = visibleCount >>> 3 | 0;
      finishSnapshotAndRemoveEntitiesLoop: while (true) {
        finishSnapshotAndRemoveEntitiesDone: {
          value = readI32(connectionIsLocal);
          const savedConnectionIsLocal = connectionIsLocal;
          hasFirstPlayer = hasFirstPlayer - 8 | 0;
          writeI32(savedConnectionIsLocal, readI32(hasFirstPlayer));
          writeI32(hasFirstPlayer, value);
          value = readI32(connectionIsLocal, 4);
          writeI32(connectionIsLocal, readI32(hasFirstPlayer, 4), 4);
          writeI32(hasFirstPlayer, value, 4);
          if (+(visibleCount === 2)) {
            break finishSnapshotAndRemoveEntitiesDone;
          }
          phaseCursor = 1;
          value = node;
          if (+(visibleCount !== 3)) {
            const savedPendingEntriesPointer = pendingEntriesPointer;
            const savedNode5 = node;
            phaseCursor = readI32(node);
            const savedBits27 = phaseCursor >>> 14 | 0;
            value = readI32(pendingEntriesPointer);
            const savedValue63 = +(savedBits27 >>> 0 < (value >>> 14 | 0) >>> 0);
            phaseCursor = phaseCursor & 16383;
            const savedPhaseCursor6 = phaseCursor;
            value = value & 16383;
            phaseCursor = +(value === phaseCursor) ? savedValue63 : +(savedPhaseCursor6 >>> 0 < value >>> 0);
            value = phaseCursor ? savedPendingEntriesPointer : savedNode5;
            phaseCursor = phaseCursor ? 2 : 1;
          }
          entity = visibleCount - 1 | 0;
          length = readI32(value);
          const savedBits28 = length >>> 14 | 0;
          offset = readI32(connectionIsLocal);
          const savedValue64 = +(savedBits28 >>> 0 < (offset >>> 14 | 0) >>> 0);
          end = length & 16383;
          const savedEnd5 = end;
          offset = offset & 16383;
          if (+((+(offset === end) ? savedValue64 : +(savedEnd5 >>> 0 < offset >>> 0)) === 0)) {
            knownStart = (visibleCount - 3 | 0) >>> 1 | 0;
            packedValue = readI64(connectionIsLocal);
            pendingCountPointer = Number(BigInt.asIntN(32, packedValue));
            spawnCursor = pendingCountPointer >>> 14 | 0;
            revision = pendingCountPointer & 16383;
            field = Number(BigInt.asIntN(32, BigInt.asUintN(64, packedValue) >> (32n & 63n)));
            offset = connectionIsLocal;
            finishSnapshotAndRemoveEntitiesLoop2: while (true) {
              finishSnapshotAndRemoveEntitiesDone2: {
                writeI32(offset, length);
                const savedOffset10 = offset;
                end = value;
                writeI32(savedOffset10, readI32(end, 4), 4);
                if (+((phaseCursor | 0) > (knownStart | 0))) {
                  break finishSnapshotAndRemoveEntitiesDone2;
                }
                const savedConnectionIsLocal2 = connectionIsLocal;
                length = phaseCursor << 1;
                phaseCursor = length | 1;
                value = savedConnectionIsLocal2 + (phaseCursor << 3) | 0;
                const savedEntity7 = entity;
                offset = length + 2 | 0;
                if (+((savedEntity7 | 0) > (offset | 0))) {
                  const savedBits29 = value + 8 | 0;
                  const savedValue65 = value;
                  length = readI32(value);
                  const savedBits30 = length >>> 14 | 0;
                  value = readI32(value, 8);
                  const savedValue66 = +(savedBits30 >>> 0 < (value >>> 14 | 0) >>> 0);
                  length = length & 16383;
                  const savedLength35 = length;
                  value = value & 16383;
                  length = +(value === length) ? savedValue66 : +(savedLength35 >>> 0 < value >>> 0);
                  value = length ? savedBits29 : savedValue65;
                  phaseCursor = length ? offset : phaseCursor;
                }
                offset = end;
                length = readI32(value);
                const savedValue67 = +((length >>> 14 | 0) >>> 0 < spawnCursor >>> 0);
                required = length & 16383;
                if (+((+(required === revision) ? savedValue67 : +(required >>> 0 < revision >>> 0)) !== 1)) {
                  continue finishSnapshotAndRemoveEntitiesLoop2;
                }
              }
              break;
            }
            writeI32(end, field, 4);
            writeI32(end, pendingCountPointer);
          }
          value = +((visibleCount | 0) > 2);
          visibleCount = entity;
          if (value) {
            continue finishSnapshotAndRemoveEntitiesLoop;
          }
        }
        break;
      }
      phaseCursor = readI32(knownCountPointer);
      value = readI32(knownRecordsPointer);
    }
    finishSnapshotAndRemoveEntitiesDone3: {
      length = value + (phaseCursor << 3) | 0;
      const savedLength36 = length;
      visibleCount = value + sharedScratch | 0;
      hasFirstPlayer = (savedLength36 - visibleCount | 0) >> 3;
      phaseCursor = +((hasFirstPlayer | 0) < (knownLength | 0)) ? hasFirstPlayer : knownLength;
      if (+((phaseCursor | 0) <= 0)) {
        mergeKnownEntityRecords(value, visibleCount, length, knownLength, hasFirstPlayer, 0, 0);
        break finishSnapshotAndRemoveEntitiesDone3;
      }
      const savedValue68 = value;
      const savedVisibleCount8 = visibleCount;
      const savedLength37 = length;
      const savedKnownLength3 = knownLength;
      const savedHasFirstPlayer8 = hasFirstPlayer;
      phaseCursor = +((phaseCursor | 0) < 268435455) ? phaseCursor : 268435455;
      value = operatorNewOrAbort(phaseCursor << 3);
      mergeKnownEntityRecords(savedValue68, savedVisibleCount8, savedLength37, savedKnownLength3, savedHasFirstPlayer8, value, phaseCursor);
      free(value);
    }
    if (readI32(packetFrame, 24)) {
      writeI32(packetFrame, 0, 24);
    }
    const storedI3241 = readI32(packetFrame, 32);
    length = readI32(packetFrame, 36);
    phaseCursor = length ? storedI3241 : 4096;
    const savedPhaseCursor7 = phaseCursor;
    hasFirstPlayer = readI32(packetFrame, 28);
    value = hasFirstPlayer + 4 | 0;
    if (+(savedPhaseCursor7 >>> 0 < value >>> 0)) {
      [phaseCursor, length, offset, visibleCount] = growSnapshotRecordWriter(phaseCursor, value, length, recordInlineStorage, hasFirstPlayer, packetFrame);
    }
    phaseCursor = 0;
    writeI32((length ? length : recordInlineStorage) + hasFirstPlayer | 0, 0);
    writeI32(packetFrame, value, 28);
    [phaseCursor, value, visibleCount] = writePacketVarUint(packetFrame, phaseCursor, value);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3242 = readI32(packet, 8);
    offset = readI32(packet, 12);
    value = offset ? storedI3242 : 4096;
    const savedValue69 = value;
    length = readI32(packet, 4);
    entity = length + phaseCursor | 0;
    if (+(savedValue69 >>> 0 < entity >>> 0)) {
      [value, offset, hasFirstPlayer, visibleCount] = growByteWriter(value, entity, offset, packetInlineStorage, length, packet);
    }
    memcpy((offset ? offset : packetInlineStorage) + length | 0, packetFrame + 5216 | 0, phaseCursor);
    writeI32(packet, entity, 4);
    hasFirstPlayer = readI32(packetFrame, 28);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    length = readI32(packetFrame, 36);
    const storedI3243 = readI32(packet, 8);
    offset = readI32(packet, 12);
    value = offset ? storedI3243 : 4096;
    const savedValue70 = value;
    visibleCount = hasFirstPlayer + entity | 0;
    if (+(savedValue70 >>> 0 < visibleCount >>> 0)) {
      [value, offset, end, phaseCursor] = growByteWriter(value, visibleCount, offset, packetInlineStorage, entity, packet);
    }
    memcpy((offset ? offset : packetInlineStorage) + entity | 0, length ? length : recordInlineStorage, hasFirstPlayer);
    writeI32(packet, visibleCount, 4);
    writeI64(packetFrame, 1095216660480n, 5216);
    length = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3244 = readI32(packet, 8);
    phaseCursor = readI32(packet, 12);
    value = phaseCursor ? storedI3244 : 4096;
    const savedValue71 = value;
    hasFirstPlayer = readI32(packet, 4);
    offset = hasFirstPlayer + 1 | 0;
    if (+(savedValue71 >>> 0 < offset >>> 0)) {
      [value, phaseCursor, end, visibleCount] = growByteWriter(value, offset, phaseCursor, packetInlineStorage, hasFirstPlayer, packet);
    }
    writeU8((phaseCursor ? phaseCursor : packetInlineStorage) + hasFirstPlayer | 0, length);
    writeI32(packet, offset, 4);
    node = usesLocalConnection ? 418920 : 40;
    value = readI32(node);
    visibleCount = value;
    required = usesLocalConnection ? 418912 : 32;
    connectionIsLocal = readI32(required);
    if (connectionIsLocal) {
      visibleCount = value;
      phaseCursor = connectionIsLocal;
      do {
        const savedVisibleCount9 = visibleCount;
        const savedVisibleCount10 = visibleCount;
        hasFirstPlayer = phaseCursor >>> 1 | 0;
        visibleCount = savedVisibleCount10 + (hasFirstPlayer << 4) | 0;
        const savedBits31 = visibleCount + 16 | 0;
        length = +(readI32(visibleCount) >>> 0 > baselineRevision >>> 0);
        visibleCount = length ? savedVisibleCount9 : savedBits31;
        phaseCursor = length ? hasFirstPlayer : phaseCursor + (hasFirstPlayer ^ -1) | 0;
      } while (phaseCursor);
    }
    if (+((value + (connectionIsLocal << 4) | 0) !== visibleCount)) {
      finishSnapshotAndRemoveEntitiesLoop3: while (true) {
        value = 1;
        if (readU8(visibleCount, 12)) {
          value = readI32(visibleCount) + 1 | 0;
        }
        phaseCursor = 0;
        [phaseCursor, value, length] = writePacketVarUint(packetFrame, phaseCursor, value);
        if (readI32(packet)) {
          writeI32(packet, 0);
        }
        const storedI3245 = readI32(packet, 8);
        hasFirstPlayer = readI32(packet, 12);
        value = hasFirstPlayer ? storedI3245 : 4096;
        const savedValue72 = value;
        baselineRevision = phaseCursor + offset | 0;
        if (+(savedValue72 >>> 0 < baselineRevision >>> 0)) {
          [value, hasFirstPlayer, end, length] = growByteWriter(value, baselineRevision, hasFirstPlayer, packetInlineStorage, offset, packet);
        }
        memcpy((hasFirstPlayer ? hasFirstPlayer : packetInlineStorage) + offset | 0, packetFrame + 5216 | 0, phaseCursor);
        writeI32(packet, baselineRevision, 4);
        entity = readI32(visibleCount, 4);
        end = readI32(entity, 12);
        hasFirstPlayer = readI32(entity, 4);
        if (readI32(packet)) {
          writeI32(packet, 0);
        }
        const storedI3246 = readI32(packet, 8);
        phaseCursor = readI32(packet, 12);
        value = phaseCursor ? storedI3246 : 4096;
        const savedValue73 = value;
        offset = hasFirstPlayer + baselineRevision | 0;
        if (+(savedValue73 >>> 0 < offset >>> 0)) {
          [value, phaseCursor, knownLength, length] = growByteWriter(value, offset, phaseCursor, packetInlineStorage, baselineRevision, packet);
        }
        memcpy((phaseCursor ? phaseCursor : packetInlineStorage) + baselineRevision | 0, end ? end : entity + 16 | 0, hasFirstPlayer);
        writeI32(packet, offset, 4);
        visibleCount = visibleCount + 16 | 0;
        const savedVisibleCount11 = visibleCount;
        value = readI32(node);
        const savedValue74 = value;
        connectionIsLocal = readI32(required);
        if (+(savedVisibleCount11 !== (savedValue74 + (connectionIsLocal << 4) | 0))) {
          continue finishSnapshotAndRemoveEntitiesLoop3;
        }
        break;
      }
    }
    finishSnapshotAndRemoveEntitiesDone4: {
      if (+(connectionIsLocal === 0)) {
        break finishSnapshotAndRemoveEntitiesDone4;
      }
      finishSnapshotAndRemoveEntitiesDone5: {
        do {
          if (+(readU8(value, 12) === 0)) {
            do {
              const savedValue75 = value;
              phaseCursor = visibleCount - 16 | 0;
              if (+(savedValue75 === phaseCursor)) {
                break finishSnapshotAndRemoveEntitiesDone4;
              }
              length = visibleCount - 4 | 0;
              visibleCount = phaseCursor;
            } while (+(readU8(length) === 0));
            phaseCursor = visibleCount - value | 0;
            length = (phaseCursor >> 4) + 1 | 0;
            if (+((phaseCursor | 0) > 32)) {
              break finishSnapshotAndRemoveEntitiesDone5;
            }
            value = partitionPendingMessages(value, visibleCount, length, 0, 0);
            break finishSnapshotAndRemoveEntitiesDone4;
          }
          value = value + 16 | 0;
        } while (+(value !== visibleCount));
        value = visibleCount;
        break finishSnapshotAndRemoveEntitiesDone4;
      }
      const savedValue76 = value;
      const savedVisibleCount12 = visibleCount;
      const savedLength38 = length;
      value = +((length | 0) < 134217727) ? length : 134217727;
      phaseCursor = operatorNewOrAbort(value << 4);
      value = partitionPendingMessages(savedValue76, savedVisibleCount12, savedLength38, phaseCursor, value);
      free(phaseCursor);
    }
    const savedValue77 = value;
    hasFirstPlayer = readI32(node);
    length = hasFirstPlayer + (readI32(required) << 4) | 0;
    if (+(savedValue77 !== length)) {
      phaseCursor = value;
      do {
        finishSnapshotAndRemoveEntitiesDone6: {
          offset = readI32(phaseCursor, 8);
          if (+(offset === 0)) {
            break finishSnapshotAndRemoveEntitiesDone6;
          }
          const savedOffset11 = offset;
          visibleCount = readI32(offset, 4);
          writeI32(savedOffset11, visibleCount - 1 | 0, 4);
          if (visibleCount) {
            break finishSnapshotAndRemoveEntitiesDone6;
          }
          runtime.indirect({
            parameters: [ "i32" ],
            results: []
          }, readI32(readI32(offset), 8), offset);
          releaseMessageControlBlock(offset);
        }
        phaseCursor = phaseCursor + 16 | 0;
      } while (+(phaseCursor !== length));
    }
    writeI32(required, (value - hasFirstPlayer | 0) >> 4);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3247 = readI32(packet, 8);
    length = readI32(packet, 12);
    value = length ? storedI3247 : 4096;
    const savedValue78 = value;
    hasFirstPlayer = readI32(packet, 4);
    visibleCount = hasFirstPlayer + 1 | 0;
    if (+(savedValue78 >>> 0 < visibleCount >>> 0)) {
      [value, length, offset, phaseCursor] = growByteWriter(value, visibleCount, length, packetInlineStorage, hasFirstPlayer, packet);
    }
    writeU8((length ? length : packetInlineStorage) + hasFirstPlayer | 0, 0);
    writeI32(packet, visibleCount, 4);
    writeI64(packetFrame, 1095216660480n, 5216);
    visibleCount = randomIntegerRange(packetFrame + 5216 | 0);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3248 = readI32(packet, 8);
    length = readI32(packet, 12);
    value = length ? storedI3248 : 4096;
    const savedValue79 = value;
    end = readI32(packet, 4);
    entity = end + 1 | 0;
    if (+(savedValue79 >>> 0 < entity >>> 0)) {
      [value, length, hasFirstPlayer, phaseCursor] = growByteWriter(value, entity, length, packetInlineStorage, end, packet);
    }
    writeU8((length ? length : packetInlineStorage) + end | 0, visibleCount);
    writeI32(packet, entity, 4);
    if (readI32(packet)) {
      writeI32(packet, 0);
    }
    const storedI3249 = readI32(packet, 8);
    offset = readI32(packet, 12);
    value = offset ? storedI3249 : 4096;
    const savedValue80 = value;
    length = end + 2 | 0;
    if (+(savedValue80 >>> 0 < length >>> 0)) {
      [value, offset, visibleCount, phaseCursor] = growByteWriter(value, length, offset, packetInlineStorage, entity, packet);
    }
    value = 0;
    writeU8((offset ? offset : packetInlineStorage) + entity | 0, 0);
    writeI32(packet, length, 4);
    visibleCount = length - headerBytes | 0;
    if (visibleCount) {
      do {
        phaseCursor = readI32(packet, 12);
        phaseCursor = ((phaseCursor ? phaseCursor : packetInlineStorage) + headerBytes | 0) + value | 0;
        writeU8(phaseCursor, readU8(phaseCursor) ^ readU8((value & 255) + 4576 | 0));
        value = value + 1 | 0;
      } while (+(value !== visibleCount));
    }
    free(readI32(packetFrame, 36));
    free(readI32(packetFrame, 4144));
    runtime.stackPointer.value = packetFrame + 5232 | 0;
    value = readU8(8545512);
    writeI32((value << 2) + 8545516 | 0, packet);
    writeU8(8545512, value + 1 | 0);
    visibleCount = readI32(25068) + 1 | 0;
    writeI32(25068, visibleCount);
    phaseCursor = readI32(25104);
    if (phaseCursor) {
      do {
        removeEntity(phaseCursor - 32 | 0);
        phaseCursor = readI32(25104);
      } while (phaseCursor);
      visibleCount = readI32(25068);
    }
    baselineRevision = visibleCount - 1 | 0;
    const savedBaselineRevision = baselineRevision;
    phaseCursor = readI32(8545488) | readU8(418936);
    value = phaseCursor ? 4 : 418884;
    if (+(savedBaselineRevision >>> 0 <= readI32(value) >>> 0)) {
      return;
    }
    if (+(visibleCount === 0)) {
      return;
    }
    writeI32(value, baselineRevision);
    connectionIsLocal = +(phaseCursor === 0);
    offset = connectionIsLocal ? 418908 : 28;
    value = readI32(offset);
    const savedValue81 = value;
    knownLength = connectionIsLocal ? 418900 : 20;
    hasFirstPlayer = readI32(knownLength);
    entity = savedValue81 + (hasFirstPlayer << 3) | 0;
    phaseCursor = value;
    if (hasFirstPlayer) {
      visibleCount = hasFirstPlayer;
      do {
        const savedPhaseCursor8 = phaseCursor;
        const savedPhaseCursor9 = phaseCursor;
        end = visibleCount >>> 1 | 0;
        phaseCursor = savedPhaseCursor9 + (end << 3) | 0;
        const savedBits32 = phaseCursor + 8 | 0;
        length = +(readI32(phaseCursor) >>> 0 > baselineRevision >>> 0);
        phaseCursor = length ? savedPhaseCursor8 : savedBits32;
        visibleCount = length ? end : visibleCount + (end ^ -1) | 0;
      } while (visibleCount);
    }
    finishSnapshotAndRemoveEntitiesDone7: {
      if (+(phaseCursor === entity)) {
        free(value);
        writeI32(offset, 0);
        writeI32(knownLength, 0);
        writeI32(connectionIsLocal ? 418904 : 24, 0);
        break finishSnapshotAndRemoveEntitiesDone7;
      }
      end = (phaseCursor - value | 0) >> 3;
      finishSnapshotAndRemoveEntitiesDone8: {
        if (+(value === phaseCursor)) {
          break finishSnapshotAndRemoveEntitiesDone8;
        }
        node = entity - phaseCursor | 0;
        if (+(node === 0)) {
          break finishSnapshotAndRemoveEntitiesDone8;
        }
        visibleCount = 0;
        finishSnapshotAndRemoveEntitiesDone9: {
          if (+(node !== 8)) {
            hasFirstPlayer = node >> 3 & -2;
            do {
              const savedValue82 = value;
              entity = visibleCount << 3;
              offset = savedValue82 + entity | 0;
              const savedOffset12 = offset;
              length = phaseCursor + entity | 0;
              writeI32(savedOffset12, readI32(length));
              writeI32(offset, readI32(length, 4), 4);
              const savedValue83 = value;
              length = entity | 8;
              offset = savedValue83 + length | 0;
              const savedOffset13 = offset;
              length = phaseCursor + length | 0;
              writeI32(savedOffset13, readI32(length));
              writeI32(offset, readI32(length, 4), 4);
              visibleCount = visibleCount + 2 | 0;
              hasFirstPlayer = hasFirstPlayer - 2 | 0;
            } while (hasFirstPlayer);
            if (+((node & 8) === 0)) {
              break finishSnapshotAndRemoveEntitiesDone9;
            }
          }
          const savedValue84 = value;
          length = visibleCount << 3;
          visibleCount = savedValue84 + length | 0;
          const savedVisibleCount13 = visibleCount;
          value = phaseCursor + length | 0;
          writeI32(savedVisibleCount13, readI32(value));
          writeI32(visibleCount, readI32(value, 4), 4);
        }
        hasFirstPlayer = readI32(knownLength);
      }
      writeI32(knownLength, hasFirstPlayer - end | 0);
    }
    value = readI32(connectionIsLocal ? 418920 : 40);
    phaseCursor = value;
    hasFirstPlayer = connectionIsLocal ? 418912 : 32;
    visibleCount = readI32(hasFirstPlayer);
    if (visibleCount) {
      phaseCursor = value;
      do {
        const savedPhaseCursor10 = phaseCursor;
        const savedPhaseCursor11 = phaseCursor;
        offset = visibleCount >>> 1 | 0;
        phaseCursor = savedPhaseCursor11 + (offset << 4) | 0;
        const savedBits33 = phaseCursor + 16 | 0;
        length = +(readI32(phaseCursor) >>> 0 > baselineRevision >>> 0);
        phaseCursor = length ? savedPhaseCursor10 : savedBits33;
        visibleCount = length ? offset : visibleCount + (offset ^ -1) | 0;
      } while (visibleCount);
    }
    eraseMessages(hasFirstPlayer, value, phaseCursor);
  }
  /** Encode all62 protocol field slots in original order; each block checks its component mask and field revision. */  function writeEntityDelta(value, recordWriter, entity, baselineRevision) {
    // Original WAT 158162–173810.
    let count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, component = 0, required = 0, fieldLength = 0, scratch = 0, storage = 0, field = 0, fieldScratch = 0, flag = 0, componentMask = 0, revision = 0, parentFlag = 0, pendingCount = 0, hasField = 0, previousLength = 0, inlineStorage = 0, existingLength = 0, pendingEntries = 0, entityOffset = 0, nextRevision = 0, includeField = 0, fieldBits = 0, includeOwner = 0, componentRevision = 0, flagsLow = 0, flagsHigh = 0, flagsMid = 0, includeComponent = 0, flagsOwnership = 0, presenceBit = 0, ownerMask = 0, lastComponentRevision = 0, stateRevision = 0, transformRevision = 0, otherRevision = 0, valueF32 = 0, valueF64 = 0;
    fieldScratch = runtime.stackPointer.value - 32 | 0;
    runtime.stackPointer.value = fieldScratch;
    if (+((value & 2) === 0)) {
      writeComponentPresence(entity, baselineRevision, 0, recordWriter, value);
    }
    flagsHigh = readU8(entity, 95);
    presenceBit = flagsHigh & 32;
    const savedBits34 = presenceBit >>> 5 | 0;
    const savedEntity8 = entity;
    ownerMask = value & 64;
    value = savedEntity8 + (ownerMask >>> 4 | 0) | 0;
    lastComponentRevision = readI32(value, 488);
    includeComponent = savedBits34 & +(lastComponentRevision >>> 0 > baselineRevision >>> 0);
    componentRevision = readI32(value, 472);
    entry = readI32(value, 464);
    flag = readI32(value, 456);
    stateRevision = readI32(value, 448);
    flagsMid = readU8(entity, 94);
    transformRevision = readI32(value, 424);
    field = readI32(value, 416);
    otherRevision = readI32(value, 408);
    component = readI32(value, 400);
    flagsOwnership = readI8(entity, 93);
    offset = +((flagsOwnership | 0) < 0);
    capacity = +(readI32(value, 376) >>> 0 > baselineRevision >>> 0);
    previousLength = readI32(value, 368);
    entityOffset = readI32(value, 360);
    nextRevision = readI32(value, 328);
    pendingEntries = readI32(value, 312);
    pendingCount = readI32(value, 304);
    revision = readI32(value, 288);
    scratch = readI32(value, 264);
    componentMask = readI32(value, 256);
    let selectedValue44;
    writeEntityDeltaDone: {
      flagsLow = readI8(entity, 92);
      fieldBits = (flagsLow >>> 5 | 0) & +(readI32(value, 296) >>> 0 > baselineRevision >>> 0);
      if (+(fieldBits === 0)) {
        selectedValue44 = 0;
        break writeEntityDeltaDone;
      }
      length = readI32(entity, 120);
      if (+(readI32(length, 112) >>> 0 <= baselineRevision >>> 0)) {
        selectedValue44 = 0;
        break writeEntityDeltaDone;
      }
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3250 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3250 : 4096;
      const savedValue85 = value;
      existingLength = readI32(recordWriter, 4);
      inlineStorage = existingLength + 1 | 0;
      if (+(savedValue85 >>> 0 < inlineStorage >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, inlineStorage, storage, recordWriter, existingLength);
      }
      const savedStorage = storage;
      hasField = recordWriter + 16 | 0;
      writeU8((storage ? savedStorage : hasField) + existingLength | 0, 0);
      writeI32(recordWriter, inlineStorage, 4);
      cursor = readU8(length, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3251 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI3251 : 4096;
      const savedValue86 = value;
      length = existingLength + 2 | 0;
      if (+(savedValue86 >>> 0 < length >>> 0)) {
        [value, parentFlag, required, count] = growByteWriter(value, length, parentFlag, hasField, inlineStorage, recordWriter);
      }
      writeU8((parentFlag ? parentFlag : hasField) + inlineStorage | 0, cursor);
      writeI32(recordWriter, length, 4);
      selectedValue44 = 1;
    }
    value = selectedValue44;
    required = flagsHigh >>> 2 | 0;
    entry = +(entry >>> 0 > baselineRevision >>> 0);
    includeOwner = offset & capacity;
    // Protocol slot 2: progression byte.
        writeEntityDeltaDone2: {
      if (+(includeComponent === 0)) {
        break writeEntityDeltaDone2;
      }
      offset = readI32(entity, 200);
      if (+(readI32(offset, 152) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone2;
      }
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      capacity = 2 - value | 0;
      const storedI3252 = readI32(recordWriter, 8);
      length = readI32(recordWriter, 12);
      value = length ? storedI3252 : 4096;
      const savedValue87 = value;
      existingLength = readI32(recordWriter, 4);
      inlineStorage = existingLength + 1 | 0;
      if (+(savedValue87 >>> 0 < inlineStorage >>> 0)) {
        [value, length, cursor, hasField, count] = growEmbeddedByteWriter(value, inlineStorage, length, recordWriter, existingLength);
      }
      const savedLength39 = length;
      hasField = recordWriter + 16 | 0;
      writeU8((length ? savedLength39 : hasField) + existingLength | 0, capacity ^ 1);
      writeI32(recordWriter, inlineStorage, 4);
      cursor = readU8(offset, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      value = 2;
      const storedI3253 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      length = storage ? storedI3253 : 4096;
      const savedLength40 = length;
      capacity = existingLength + 2 | 0;
      if (+(savedLength40 >>> 0 < capacity >>> 0)) {
        [length, storage, offset, count] = growByteWriter(length, capacity, storage, hasField, inlineStorage, recordWriter);
      }
      writeU8((storage ? storage : hasField) + inlineStorage | 0, cursor);
      writeI32(recordWriter, capacity, 4);
    }
    includeField = entry & required;
    // Protocol slot 3: world string.
        writeEntityDeltaDone3: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone3;
      }
      entry = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(entry, 360) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone3;
      }
      value = (3 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3254 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3254 : 4096;
      const savedValue88 = value;
      capacity = readI32(recordWriter, 4);
      fieldLength = capacity + length | 0;
      if (+(savedValue88 >>> 0 < fieldLength >>> 0)) {
        [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
      }
      const savedCapacity7 = capacity;
      const savedStorage2 = storage;
      existingLength = recordWriter + 16 | 0;
      memcpy(savedCapacity7 + (storage ? savedStorage2 : existingLength) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, fieldLength, 4);
      value = 0;
      length = 0;
      do {
        cursor = value + 1 | 0;
        const savedBaselineRevision2 = baselineRevision;
        offset = entry + (value << 2) | 0;
        if (+(savedBaselineRevision2 >>> 0 < readI32(offset, 48) >>> 0)) {
          value = (cursor - length | 0) ^ 1;
          length = 0;
          [length, value, count] = writeTickVarUint(fieldScratch, length, value);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI3255 = readI32(recordWriter, 8);
          count = readI32(recordWriter, 12);
          value = count ? storedI3255 : 4096;
          const savedValue89 = value;
          hasField = length + fieldLength | 0;
          if (+(savedValue89 >>> 0 < hasField >>> 0)) {
            [value, count, required, capacity] = growByteWriter(value, hasField, count, existingLength, fieldLength, recordWriter);
          }
          memcpy((count ? count : existingLength) + fieldLength | 0, fieldScratch + 24 | 0, length);
          writeI32(recordWriter, hasField, 4);
          capacity = readI32(offset, 8);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI3256 = readI32(recordWriter, 8);
          length = readI32(recordWriter, 12);
          value = length ? storedI3256 : 4096;
          const savedValue90 = value;
          fieldLength = hasField + 4 | 0;
          if (+(savedValue90 >>> 0 < fieldLength >>> 0)) {
            [value, length, offset, count] = growByteWriter(value, fieldLength, length, existingLength, hasField, recordWriter);
          }
          writeI32((length ? length : existingLength) + hasField | 0, rotateLeft(capacity, 18));
          writeI32(recordWriter, fieldLength, 4);
          length = cursor;
        }
        value = cursor;
      } while (+(value !== 10));
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3257 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3257 : 4096;
      const savedValue91 = value;
      cursor = fieldLength + 1 | 0;
      if (+(savedValue91 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, existingLength, fieldLength, recordWriter);
      }
      writeU8((storage ? storage : existingLength) + fieldLength | 0, 1);
      writeI32(recordWriter, cursor, 4);
      value = 3;
    }
    entry = flagsHigh >>> 1 | 0;
    offset = +(baselineRevision >>> 0 < flag >>> 0);
    // Protocol slot 4: component4 payload.
        writeEntityDeltaDone4: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone4;
      }
      existingLength = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(existingLength, 100) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone4;
      }
      value = (4 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3258 = readI32(recordWriter, 8);
      capacity = readI32(recordWriter, 12);
      value = capacity ? storedI3258 : 4096;
      const savedValue92 = value;
      required = readI32(recordWriter, 4);
      storage = required + length | 0;
      if (+(savedValue92 >>> 0 < storage >>> 0)) {
        [value, capacity, cursor, flag, count] = growEmbeddedByteWriter(value, storage, capacity, recordWriter, required);
      }
      const savedRequired4 = required;
      const savedCapacity8 = capacity;
      inlineStorage = recordWriter + 16 | 0;
      memcpy(savedRequired4 + (capacity ? savedCapacity8 : inlineStorage) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, storage, 4);
      if (+(baselineRevision >>> 0 < readI32(existingLength, 20) >>> 0)) {
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3259 = readI32(recordWriter, 8);
        capacity = readI32(recordWriter, 12);
        value = capacity ? storedI3259 : 4096;
        const savedValue93 = value;
        hasField = storage + 1 | 0;
        if (+(savedValue93 >>> 0 < hasField >>> 0)) {
          [value, capacity, cursor, count] = growByteWriter(value, hasField, capacity, inlineStorage, storage, recordWriter);
        }
        writeU8((capacity ? capacity : inlineStorage) + storage | 0, 0);
        writeI32(recordWriter, hasField, 4);
        const storedI3260 = readI32(existingLength, 12);
        value = readU8(existingLength, 19);
        const savedValue94 = value;
        capacity = value << 24 >> 24;
        required = (+((capacity | 0) < 0) ? storedI3260 : savedValue94) + 1 | 0;
        length = readI32(existingLength, 8);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3261 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI3261 : 4096;
        const savedValue95 = value;
        storage = required + hasField | 0;
        if (+(savedValue95 >>> 0 < storage >>> 0)) {
          [value, count, flag, cursor] = growByteWriter(value, storage, count, inlineStorage, hasField, recordWriter);
        }
        memcpy((count ? count : inlineStorage) + hasField | 0, +((capacity | 0) < 0) ? length : existingLength + 8 | 0, required);
        writeI32(recordWriter, storage, 4);
      }
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3262 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI3262 : 4096;
      const savedValue96 = value;
      length = storage + 1 | 0;
      if (+(savedValue96 >>> 0 < length >>> 0)) {
        [value, count, capacity, cursor] = growByteWriter(value, length, count, inlineStorage, storage, recordWriter);
      }
      writeU8((count ? count : inlineStorage) + storage | 0, 1);
      writeI32(recordWriter, length, 4);
      value = 4;
    }
    flag = flagsMid >>> 4 | 0;
    field = +(field >>> 0 > baselineRevision >>> 0);
    required = offset & entry;
    // Protocol slot 6: player fields5–6.
        writeEntityDeltaDone5: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone5;
      }
      const savedBaselineRevision3 = baselineRevision;
      fieldLength = readI32(entity, 120);
      if (+(savedBaselineRevision3 >>> 0 < readI32(fieldLength, 116) >>> 0)) {
        value = (5 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3263 = readI32(recordWriter, 8);
        capacity = readI32(recordWriter, 12);
        value = capacity ? storedI3263 : 4096;
        const savedValue97 = value;
        offset = readI32(recordWriter, 4);
        hasField = offset + length | 0;
        if (+(savedValue97 >>> 0 < hasField >>> 0)) {
          [value, capacity, cursor, entry, count] = growEmbeddedByteWriter(value, hasField, capacity, recordWriter, offset);
        }
        const savedOffset14 = offset;
        const savedCapacity9 = capacity;
        offset = recordWriter + 16 | 0;
        memcpy(savedOffset14 + (capacity ? savedCapacity9 : offset) | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, hasField, 4);
        valueF32 = readF32(fieldLength, 12);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3264 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI3264 : 4096;
        const savedValue98 = value;
        cursor = hasField + 4 | 0;
        if (+(savedValue98 >>> 0 < cursor >>> 0)) {
          [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, hasField, recordWriter);
        }
        writeF32((fieldLength ? fieldLength : offset) + hasField | 0, valueF32);
        writeI32(recordWriter, cursor, 4);
        fieldLength = readI32(entity, 120);
        value = 5;
      }
      if (+(readI32(fieldLength, 120) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone5;
      }
      value = (6 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3265 = readI32(recordWriter, 8);
      capacity = readI32(recordWriter, 12);
      value = capacity ? storedI3265 : 4096;
      const savedValue99 = value;
      offset = readI32(recordWriter, 4);
      inlineStorage = offset + length | 0;
      if (+(savedValue99 >>> 0 < inlineStorage >>> 0)) {
        [value, capacity, cursor, entry, count] = growEmbeddedByteWriter(value, inlineStorage, capacity, recordWriter, offset);
      }
      const savedCapacity10 = capacity;
      existingLength = recordWriter + 16 | 0;
      memcpy((capacity ? savedCapacity10 : existingLength) + offset | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, inlineStorage, 4);
      const storedI3266 = readI32(fieldLength, 20);
      value = readU8(fieldLength, 27);
      const savedValue100 = value;
      capacity = value << 24 >> 24;
      entry = (+((capacity | 0) < 0) ? storedI3266 : savedValue100) + 1 | 0;
      length = readI32(fieldLength, 16);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      cursor = fieldLength + 16 | 0;
      const storedI3267 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3267 : 4096;
      const savedValue101 = value;
      offset = entry + inlineStorage | 0;
      if (+(savedValue101 >>> 0 < offset >>> 0)) {
        [value, fieldLength, hasField, count] = growByteWriter(value, offset, fieldLength, existingLength, inlineStorage, recordWriter);
      }
      memcpy((fieldLength ? fieldLength : existingLength) + inlineStorage | 0, +((capacity | 0) < 0) ? length : cursor, entry);
      writeI32(recordWriter, offset, 4);
      value = 6;
    }
    entry = flagsLow >>> 4 | 0;
    offset = +(baselineRevision >>> 0 < revision >>> 0);
    hasField = field & flag;
    // Protocol slot 7: collision radius.
        writeEntityDeltaDone6: {
      if (+(required === 0)) {
        break writeEntityDeltaDone6;
      }
      capacity = readI32(entity, 188);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone6;
      }
      value = (7 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3268 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3268 : 4096;
      const savedValue102 = value;
      required = readI32(recordWriter, 4);
      flag = required + length | 0;
      if (+(savedValue102 >>> 0 < flag >>> 0)) {
        [value, storage, cursor, field, count] = growEmbeddedByteWriter(value, flag, storage, recordWriter, required);
      }
      const savedRequired5 = required;
      const savedStorage3 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedRequired5 + (storage ? savedStorage3 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      valueF32 = readF32(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3269 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3269 : 4096;
      const savedValue103 = value;
      cursor = flag + 4 | 0;
      if (+(savedValue103 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, required, flag, recordWriter);
      }
      writeF32((storage ? storage : required) + flag | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 7;
    }
    required = offset & entry;
    // Protocol slot 8: transform angle.
        writeEntityDeltaDone7: {
      if (+(hasField === 0)) {
        break writeEntityDeltaDone7;
      }
      capacity = readI32(entity, 168);
      if (+(readI32(capacity, 24) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone7;
      }
      value = (8 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3270 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3270 : 4096;
      const savedValue104 = value;
      entry = readI32(recordWriter, 4);
      offset = entry + length | 0;
      if (+(savedValue104 >>> 0 < offset >>> 0)) {
        [value, storage, cursor, field, count] = growEmbeddedByteWriter(value, offset, storage, recordWriter, entry);
      }
      const savedEntry7 = entry;
      const savedStorage4 = storage;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry7 + (storage ? savedStorage4 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, offset, 4);
      valueF64 = readF64(capacity, 8);
      writeI64(fieldScratch, 4618760256179416344n, 8);
      writeF64(fieldScratch, valueF64);
      valueF64 = runtime.host("a", "a", 22903, 6924, fieldScratch);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3271 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3271 : 4096;
      const savedValue105 = value;
      length = readI32(recordWriter, 4);
      cursor = length + 2 | 0;
      if (+(savedValue105 >>> 0 < cursor >>> 0)) {
        [value, storage, capacity, count] = growByteWriter(value, cursor, storage, entry, length, recordWriter);
      }
      const savedBits35 = (storage ? storage : entry) + length | 0;
      let selectedValue45;
      writeEntityDeltaDone8: {
        valueF64 = (+(valueF64 < 0.0) ? valueF64 + 6.283185307179586 : valueF64) * 10430.219195527361;
        if (+(valueF64 < 4294967296.0) & +(valueF64 >= 0.0)) {
          selectedValue45 = truncateInteger(valueF64, true);
          break writeEntityDeltaDone8;
        }
        selectedValue45 = 0;
      }
      writeU16(savedBits35, selectedValue45);
      writeI32(recordWriter, cursor, 4);
      value = 8;
    }
    entry = +((flagsLow | 0) < 0);
    offset = +(baselineRevision >>> 0 < pendingEntries >>> 0);
    // Protocol slot 9: render byte.
        writeEntityDeltaDone9: {
      if (+(required === 0)) {
        break writeEntityDeltaDone9;
      }
      capacity = readI32(entity, 116);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone9;
      }
      value = (9 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3272 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3272 : 4096;
      const savedValue106 = value;
      required = readI32(recordWriter, 4);
      flag = required + length | 0;
      if (+(savedValue106 >>> 0 < flag >>> 0)) {
        [value, fieldLength, cursor, field, count] = growEmbeddedByteWriter(value, flag, fieldLength, recordWriter, required);
      }
      const savedRequired6 = required;
      const savedFieldLength = fieldLength;
      required = recordWriter + 16 | 0;
      memcpy(savedRequired6 + (fieldLength ? savedFieldLength : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3273 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3273 : 4096;
      const savedValue107 = value;
      length = flag + 1 | 0;
      if (+(savedValue107 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriter(value, length, fieldLength, required, flag, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : required) + flag | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 9;
    }
    field = flagsHigh >>> 3 | 0;
    required = +(baselineRevision >>> 0 < componentRevision >>> 0);
    pendingEntries = offset & entry;
    // Protocol slot 12: world fields10–12.
        writeEntityDeltaDone10: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone10;
      }
      const savedBaselineRevision4 = baselineRevision;
      storage = readI32(entity);
      const savedBits36 = storage + 624 | 0;
      length = readI8(entity, 93);
      revision = savedBits36 & length >> 31;
      if (+(savedBaselineRevision4 >>> 0 < readI32(revision, 364) >>> 0)) {
        value = (10 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3274 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI3274 : 4096;
        const savedValue108 = value;
        capacity = readI32(recordWriter, 4);
        fieldLength = capacity + length | 0;
        if (+(savedValue108 >>> 0 < fieldLength >>> 0)) {
          [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
        }
        const savedCapacity11 = capacity;
        const savedStorage5 = storage;
        inlineStorage = recordWriter + 16 | 0;
        memcpy(savedCapacity11 + (storage ? savedStorage5 : inlineStorage) | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, fieldLength, 4);
        count = 0;
        value = 0;
        do {
          cursor = count + 1 | 0;
          if (+(baselineRevision >>> 0 < readI32(revision + (count << 2) | 0, 208) >>> 0)) {
            value = (cursor - value | 0) ^ 1;
            length = 0;
            [length, value, capacity] = writeTickVarUint(fieldScratch, length, value);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI3275 = readI32(recordWriter, 8);
            parentFlag = readI32(recordWriter, 12);
            value = parentFlag ? storedI3275 : 4096;
            const savedValue109 = value;
            existingLength = length + fieldLength | 0;
            if (+(savedValue109 >>> 0 < existingLength >>> 0)) {
              [value, parentFlag, offset, capacity] = growByteWriter(value, existingLength, parentFlag, inlineStorage, fieldLength, recordWriter);
            }
            memcpy((parentFlag ? parentFlag : inlineStorage) + fieldLength | 0, fieldScratch + 24 | 0, length);
            writeI32(recordWriter, existingLength, 4);
            count = revision + Math.imul(count, 12) | 0;
            const storedI3276 = readI32(count, 92);
            value = readU8(count, 99);
            const savedValue110 = value;
            entry = +((value << 24 >> 24 | 0) < 0);
            flag = (entry ? storedI3276 : savedValue110) + 1 | 0;
            offset = count + 88 | 0;
            capacity = readI32(offset);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI3277 = readI32(recordWriter, 8);
            length = readI32(recordWriter, 12);
            value = length ? storedI3277 : 4096;
            const savedValue111 = value;
            fieldLength = flag + existingLength | 0;
            if (+(savedValue111 >>> 0 < fieldLength >>> 0)) {
              [value, length, componentRevision, count] = growByteWriterReverseRelease(value, fieldLength, length, inlineStorage, existingLength, recordWriter);
            }
            memcpy((length ? length : inlineStorage) + existingLength | 0, entry ? capacity : offset, flag);
            writeI32(recordWriter, fieldLength, 4);
            value = cursor;
          }
          count = cursor;
        } while (+(count !== 10));
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3278 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI3278 : 4096;
        const savedValue112 = value;
        cursor = fieldLength + 1 | 0;
        if (+(savedValue112 >>> 0 < cursor >>> 0)) {
          [value, storage, length, count] = growByteWriter(value, cursor, storage, inlineStorage, fieldLength, recordWriter);
        }
        writeU8((storage ? storage : inlineStorage) + fieldLength | 0, 1);
        writeI32(recordWriter, cursor, 4);
        storage = readI32(entity);
        length = readU8(entity, 93);
        value = 10;
      }
      const savedBaselineRevision5 = baselineRevision;
      capacity = (storage + 624 | 0) & length << 24 >> 31;
      if (+(savedBaselineRevision5 >>> 0 < readI32(capacity, 368) >>> 0)) {
        value = (11 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3279 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI3279 : 4096;
        const savedValue113 = value;
        offset = readI32(recordWriter, 4);
        flag = offset + length | 0;
        if (+(savedValue113 >>> 0 < flag >>> 0)) {
          [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, flag, fieldLength, recordWriter, offset);
        }
        const savedOffset15 = offset;
        const savedFieldLength2 = fieldLength;
        offset = recordWriter + 16 | 0;
        memcpy(savedOffset15 + (fieldLength ? savedFieldLength2 : offset) | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, flag, 4);
        cursor = readU8(capacity, 248);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3280 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI3280 : 4096;
        const savedValue114 = value;
        length = flag + 1 | 0;
        if (+(savedValue114 >>> 0 < length >>> 0)) {
          [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, flag, recordWriter);
        }
        writeU8((fieldLength ? fieldLength : offset) + flag | 0, cursor);
        writeI32(recordWriter, length, 4);
        storage = readI32(entity);
        length = readU8(entity, 93);
        value = 11;
      }
      capacity = (storage + 624 | 0) & length << 24 >> 31;
      if (+(readI32(capacity, 372) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone10;
      }
      value = (12 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3281 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3281 : 4096;
      const savedValue115 = value;
      offset = readI32(recordWriter, 4);
      flag = offset + length | 0;
      if (+(savedValue115 >>> 0 < flag >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, flag, fieldLength, recordWriter, offset);
      }
      const savedOffset16 = offset;
      const savedFieldLength3 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset16 + (fieldLength ? savedFieldLength3 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      cursor = readU8(capacity, 249);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3282 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3282 : 4096;
      const savedValue116 = value;
      length = flag + 1 | 0;
      if (+(savedValue116 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, flag, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + flag | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 12;
    }
    offset = required & field;
    // Protocol slot 13: arena scalar.
        writeEntityDeltaDone11: {
      if (+(pendingEntries === 0)) {
        break writeEntityDeltaDone11;
      }
      capacity = (readI32(entity) + 312 | 0) & readI8(entity, 92) >> 31;
      if (+(readI32(capacity, 16) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone11;
      }
      value = (13 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3283 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3283 : 4096;
      const savedValue117 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue117 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, entry);
      }
      const savedEntry8 = entry;
      const savedStorage6 = storage;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry8 + (storage ? savedStorage6 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3284 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3284 : 4096;
      const savedValue118 = value;
      cursor = field + 4 | 0;
      if (+(savedValue118 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, entry, field, recordWriter);
      }
      writeF32((storage ? storage : entry) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 13;
    }
    // Protocol slot 14: effect flags.
        writeEntityDeltaDone12: {
      if (+(offset === 0)) {
        break writeEntityDeltaDone12;
      }
      capacity = readI32(entity, 192);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone12;
      }
      value = (14 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3285 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3285 : 4096;
      const savedValue119 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue119 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset17 = offset;
      const savedFieldLength4 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset17 + (fieldLength ? savedFieldLength4 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3286 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3286 : 4096;
      const savedValue120 = value;
      length = required + 1 | 0;
      if (+(savedValue120 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 14;
    }
    entry = flagsOwnership >>> 1 | 0;
    offset = +(baselineRevision >>> 0 < nextRevision >>> 0);
    // Protocol slot 15: world flags.
        writeEntityDeltaDone13: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone13;
      }
      capacity = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(capacity, 104) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone13;
      }
      value = (15 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3287 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3287 : 4096;
      const savedValue121 = value;
      required = readI32(recordWriter, 4);
      flag = required + length | 0;
      if (+(savedValue121 >>> 0 < flag >>> 0)) {
        [value, storage, cursor, field, count] = growEmbeddedByteWriter(value, flag, storage, recordWriter, required);
      }
      const savedRequired7 = required;
      const savedStorage7 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedRequired7 + (storage ? savedStorage7 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      value = readI32(capacity, 24);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3288 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI3288 : 4096;
      const savedValue122 = value;
      cursor = length + flag | 0;
      if (+(savedValue122 >>> 0 < cursor >>> 0)) {
        [value, parentFlag, capacity, count] = growByteWriter(value, cursor, parentFlag, required, flag, recordWriter);
      }
      memcpy((parentFlag ? parentFlag : required) + flag | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, cursor, 4);
      value = 15;
    }
    offset = offset & entry;
    // Protocol slot 16: player scalar.
        writeEntityDeltaDone14: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone14;
      }
      entry = readI32(entity, 120);
      if (+(readI32(entry, 124) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone14;
      }
      value = (16 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3289 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3289 : 4096;
      const savedValue123 = value;
      capacity = readI32(recordWriter, 4);
      fieldLength = capacity + length | 0;
      if (+(savedValue123 >>> 0 < fieldLength >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
      }
      const savedCapacity12 = capacity;
      const savedStorage8 = storage;
      flag = recordWriter + 16 | 0;
      memcpy(savedCapacity12 + (storage ? savedStorage8 : flag) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, fieldLength, 4);
      count = 0;
      value = 0;
      do {
        cursor = count + 1 | 0;
        if (+(baselineRevision >>> 0 < readI32(entry + (count << 2) | 0, 40) >>> 0)) {
          value = (cursor - value | 0) ^ 1;
          length = 0;
          [length, value, capacity] = writeTickVarUint(fieldScratch, length, value);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI3290 = readI32(recordWriter, 8);
          parentFlag = readI32(recordWriter, 12);
          value = parentFlag ? storedI3290 : 4096;
          const savedValue124 = value;
          field = length + fieldLength | 0;
          if (+(savedValue124 >>> 0 < field >>> 0)) {
            [value, parentFlag, required, capacity] = growByteWriter(value, field, parentFlag, flag, fieldLength, recordWriter);
          }
          memcpy((parentFlag ? parentFlag : flag) + fieldLength | 0, fieldScratch + 24 | 0, length);
          writeI32(recordWriter, field, 4);
          capacity = readU8(count + entry | 0, 28);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI3291 = readI32(recordWriter, 8);
          length = readI32(recordWriter, 12);
          value = length ? storedI3291 : 4096;
          const savedValue125 = value;
          fieldLength = field + 1 | 0;
          if (+(savedValue125 >>> 0 < fieldLength >>> 0)) {
            [value, length, required, count] = growByteWriter(value, fieldLength, length, flag, field, recordWriter);
          }
          writeU8((length ? length : flag) + field | 0, capacity);
          writeI32(recordWriter, fieldLength, 4);
          value = cursor;
        }
        count = cursor;
      } while (+(count !== 10));
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3292 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3292 : 4096;
      const savedValue126 = value;
      cursor = fieldLength + 1 | 0;
      if (+(savedValue126 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, flag, fieldLength, recordWriter);
      }
      writeU8((storage ? storage : flag) + fieldLength | 0, 1);
      writeI32(recordWriter, cursor, 4);
      value = 16;
    }
    // Protocol slot 17: component17 byte.
        writeEntityDeltaDone15: {
      if (+(offset === 0)) {
        break writeEntityDeltaDone15;
      }
      capacity = readI32(entity, 132);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone15;
      }
      value = (17 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3293 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3293 : 4096;
      const savedValue127 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue127 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset18 = offset;
      const savedFieldLength5 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset18 + (fieldLength ? savedFieldLength5 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3294 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3294 : 4096;
      const savedValue128 = value;
      length = required + 1 | 0;
      if (+(savedValue128 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 17;
    }
    // Protocol slot 18: world scalar.
        writeEntityDeltaDone16: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone16;
      }
      capacity = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(capacity, 108) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone16;
      }
      value = (18 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3295 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3295 : 4096;
      const savedValue129 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue129 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset19 = offset;
      const savedFieldLength6 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset19 + (fieldLength ? savedFieldLength6 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      valueF64 = readF64(capacity, 32);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3296 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI3296 : 4096;
      const savedValue130 = value;
      cursor = required + 8 | 0;
      if (+(savedValue130 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, required, recordWriter);
      }
      writeF64((fieldLength ? fieldLength : offset) + required | 0, valueF64);
      writeI32(recordWriter, cursor, 4);
      value = 18;
    }
    entry = +(baselineRevision >>> 0 < componentMask >>> 0);
    // Protocol slot 19: world scalar.
        writeEntityDeltaDone17: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone17;
      }
      capacity = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(capacity, 376) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone17;
      }
      value = (19 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3297 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3297 : 4096;
      const savedValue131 = value;
      offset = readI32(recordWriter, 4);
      field = offset + length | 0;
      if (+(savedValue131 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, offset);
      }
      const savedOffset20 = offset;
      const savedStorage9 = storage;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset20 + (storage ? savedStorage9 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(capacity, 252);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI3298 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI3298 : 4096;
      const savedValue132 = value;
      cursor = field + 4 | 0;
      if (+(savedValue132 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, offset, field, recordWriter);
      }
      writeF32((storage ? storage : offset) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 19;
    }
    offset = flagsOwnership >>> 6 | 0;
    capacity = +(baselineRevision >>> 0 < previousLength >>> 0);
    revision = entry & flagsLow;
    // Protocol slot 21: player fields20–21.
        writeEntityDeltaDone18: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone18;
      }
      const savedBaselineRevision6 = baselineRevision;
      fieldLength = readI32(entity, 120);
      if (+(savedBaselineRevision6 >>> 0 < readI32(fieldLength, 128) >>> 0)) {
        value = (20 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI3299 = readI32(recordWriter, 8);
        parentFlag = readI32(recordWriter, 12);
        value = parentFlag ? storedI3299 : 4096;
        const savedValue133 = value;
        entry = readI32(recordWriter, 4);
        field = entry + length | 0;
        if (+(savedValue133 >>> 0 < field >>> 0)) {
          [value, parentFlag, cursor, required, count] = growEmbeddedByteWriter(value, field, parentFlag, recordWriter, entry);
        }
        const savedParentFlag = parentFlag;
        required = recordWriter + 16 | 0;
        memcpy((parentFlag ? savedParentFlag : required) + entry | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, field, 4);
        cursor = readU8(fieldLength, 80);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32100 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32100 : 4096;
        const savedValue134 = value;
        length = field + 1 | 0;
        if (+(savedValue134 >>> 0 < length >>> 0)) {
          [value, fieldLength, entry, count] = growByteWriter(value, length, fieldLength, required, field, recordWriter);
        }
        writeU8((fieldLength ? fieldLength : required) + field | 0, cursor);
        writeI32(recordWriter, length, 4);
        fieldLength = readI32(entity, 120);
        value = 20;
      }
      if (+(readI32(fieldLength, 132) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone18;
      }
      value = (21 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32101 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI32101 : 4096;
      const savedValue135 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue135 >>> 0 < field >>> 0)) {
        [value, parentFlag, cursor, required, count] = growEmbeddedByteWriter(value, field, parentFlag, recordWriter, entry);
      }
      const savedEntry9 = entry;
      const savedParentFlag2 = parentFlag;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry9 + (parentFlag ? savedParentFlag2 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(fieldLength, 84);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32102 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32102 : 4096;
      const savedValue136 = value;
      cursor = field + 4 | 0;
      if (+(savedValue136 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, entry, field, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : entry) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 21;
    }
    componentMask = offset & capacity;
    // Protocol slot 22: player body byte.
        writeEntityDeltaDone19: {
      if (+(revision === 0)) {
        break writeEntityDeltaDone19;
      }
      capacity = readI32(entity, 100);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone19;
      }
      value = (22 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32103 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32103 : 4096;
      const savedValue137 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue137 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset21 = offset;
      const savedFieldLength7 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset21 + (fieldLength ? savedFieldLength7 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32104 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32104 : 4096;
      const savedValue138 = value;
      length = required + 1 | 0;
      if (+(savedValue138 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 22;
    }
    // Protocol slot 23: world payload.
        writeEntityDeltaDone20: {
      if (+(componentMask === 0)) {
        break writeEntityDeltaDone20;
      }
      capacity = (entity + 216 | 0) & readU8(entity, 93) << 25 >> 31;
      if (+(readI32(capacity, 32) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone20;
      }
      value = (23 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32105 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32105 : 4096;
      const savedValue139 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue139 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset22 = offset;
      const savedFieldLength8 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy(savedOffset22 + (fieldLength ? savedFieldLength8 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      writeEntityDeltaDone21: {
        value = readI32(capacity, 8);
        if (value) {
          cursor = readI32(value, 16);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI32106 = readI32(recordWriter, 8);
          fieldLength = readI32(recordWriter, 12);
          value = fieldLength ? storedI32106 : 4096;
          const savedValue140 = value;
          length = required + 4 | 0;
          if (+(savedValue140 >>> 0 < length >>> 0)) {
            [value, fieldLength, capacity, count] = growByteWriter(value, length, fieldLength, entry, required, recordWriter);
          }
          storage = rotateLeft(cursor, 18);
          break writeEntityDeltaDone21;
        }
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        storage = 0;
        const storedI32107 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32107 : 4096;
        const savedValue141 = value;
        length = required + 4 | 0;
        if (+(savedValue141 >>> 0 >= length >>> 0)) {
          break writeEntityDeltaDone21;
        }
        do {
          value = value << 1;
        } while (+(value >>> 0 < length >>> 0));
        cursor = fieldLength ? fieldLength : entry;
        fieldLength = malloc(value);
        count = memcpy(fieldLength, cursor, required);
        if (+(cursor !== entry)) {
          free(cursor);
        }
        writeI32(recordWriter, count, 12);
        writeI32(recordWriter, value, 8);
      }
      writeI32((fieldLength ? fieldLength : entry) + required | 0, storage);
      writeI32(recordWriter, length, 4);
      value = 23;
    }
    // Protocol slot 24: player scalar.
        writeEntityDeltaDone22: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone22;
      }
      capacity = readI32(entity, 120);
      if (+(readI32(capacity, 136) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone22;
      }
      value = (24 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32108 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32108 : 4096;
      const savedValue142 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue142 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset23 = offset;
      const savedFieldLength9 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset23 + (fieldLength ? savedFieldLength9 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      valueF32 = readF32(capacity, 88);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32109 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32109 : 4096;
      const savedValue143 = value;
      cursor = required + 4 | 0;
      if (+(savedValue143 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, required, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : offset) + required | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 24;
    }
    // Protocol slot 25: world payload.
        writeEntityDeltaDone23: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone23;
      }
      required = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(required, 112) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone23;
      }
      value = (25 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32110 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32110 : 4096;
      const savedValue144 = value;
      offset = readI32(recordWriter, 4);
      storage = offset + length | 0;
      if (+(savedValue144 >>> 0 < storage >>> 0)) {
        [value, count, capacity, entry, cursor] = growEmbeddedByteWriter(value, storage, count, recordWriter, offset);
      }
      const savedCount27 = count;
      field = recordWriter + 16 | 0;
      memcpy((count ? savedCount27 : field) + offset | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, storage, 4);
      if (+(baselineRevision >>> 0 < readI32(required, 52) >>> 0)) {
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32111 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI32111 : 4096;
        const savedValue145 = value;
        entry = storage + 1 | 0;
        if (+(savedValue145 >>> 0 < entry >>> 0)) {
          [value, count, length, cursor] = growByteWriter(value, entry, count, field, storage, recordWriter);
        }
        writeU8((count ? count : field) + storage | 0, 0);
        writeI32(recordWriter, entry, 4);
        const storedI32112 = readI32(required, 44);
        value = readU8(required, 51);
        const savedValue146 = value;
        length = value << 24 >> 24;
        capacity = (+((length | 0) < 0) ? storedI32112 : savedValue146) + 1 | 0;
        cursor = readI32(required, 40);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32113 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32113 : 4096;
        const savedValue147 = value;
        storage = capacity + entry | 0;
        if (+(savedValue147 >>> 0 < storage >>> 0)) {
          [value, fieldLength, offset, count] = growByteWriter(value, storage, fieldLength, field, entry, recordWriter);
        }
        memcpy((fieldLength ? fieldLength : field) + entry | 0, +((length | 0) < 0) ? cursor : required + 40 | 0, capacity);
        writeI32(recordWriter, storage, 4);
      }
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32114 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32114 : 4096;
      const savedValue148 = value;
      cursor = storage + 1 | 0;
      if (+(savedValue148 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, field, storage, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : field) + storage | 0, 1);
      writeI32(recordWriter, cursor, 4);
      value = 25;
    }
    // Protocol slot 26: progression scalar.
        writeEntityDeltaDone24: {
      if (+(includeComponent === 0)) {
        break writeEntityDeltaDone24;
      }
      capacity = readI32(entity, 200);
      if (+(readI32(capacity, 156) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone24;
      }
      value = (26 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32115 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32115 : 4096;
      const savedValue149 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue149 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset24 = offset;
      const savedFieldLength10 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset24 + (fieldLength ? savedFieldLength10 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 9);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32116 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32116 : 4096;
      const savedValue150 = value;
      length = required + 1 | 0;
      if (+(savedValue150 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 26;
    }
    required = flagsMid >>> 5 | 0;
    entry = +(baselineRevision >>> 0 < transformRevision >>> 0);
    // Protocol slot 27: component4 scalar.
        writeEntityDeltaDone25: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone25;
      }
      offset = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(offset, 116) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone25;
      }
      value = (27 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32117 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32117 : 4096;
      const savedValue151 = value;
      field = readI32(recordWriter, 4);
      nextRevision = field + length | 0;
      if (+(savedValue151 >>> 0 < nextRevision >>> 0)) {
        [value, count, capacity, flag, cursor] = growEmbeddedByteWriter(value, nextRevision, count, recordWriter, field);
      }
      const savedField2 = field;
      const savedCount28 = count;
      field = recordWriter + 16 | 0;
      memcpy(savedField2 + (count ? savedCount28 : field) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, nextRevision, 4);
      valueF32 = readF32(offset, 56);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32118 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32118 : 4096;
      const savedValue152 = value;
      length = nextRevision + 4 | 0;
      if (+(savedValue152 >>> 0 < length >>> 0)) {
        [value, count, capacity, cursor] = growByteWriter(value, length, count, field, nextRevision, recordWriter);
      }
      writeF32((count ? count : field) + nextRevision | 0, valueF32);
      writeI32(recordWriter, length, 4);
      value = 27;
    }
    flag = entry & required;
    // Protocol slot 28: transform coordinate.
        writeEntityDeltaDone26: {
      if (+(hasField === 0)) {
        break writeEntityDeltaDone26;
      }
      capacity = readI32(entity, 168);
      if (+(readI32(capacity, 28) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone26;
      }
      value = (28 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32119 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32119 : 4096;
      const savedValue153 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue153 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset25 = offset;
      const savedFieldLength11 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset25 + (fieldLength ? savedFieldLength11 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      valueF32 = readF32(capacity, 16);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32120 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32120 : 4096;
      const savedValue154 = value;
      cursor = required + 4 | 0;
      if (+(savedValue154 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, required, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : offset) + required | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 28;
    }
    // Protocol slot 29: link reference.
        writeEntityDeltaDone27: {
      if (+(flag === 0)) {
        break writeEntityDeltaDone27;
      }
      capacity = readI32(entity, 172);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone27;
      }
      value = (29 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32121 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32121 : 4096;
      const savedValue155 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue155 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedFieldLength12 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy((fieldLength ? savedFieldLength12 : entry) + offset | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      capacity = readU8(capacity, 8);
      writeEntityDeltaDone28: {
        count = readI32(recordWriter);
        if (+(count === 0)) {
          storage = 1;
          const storedI32122 = readI32(recordWriter, 8);
          count = readI32(recordWriter, 12);
          value = count ? storedI32122 : 4096;
          const savedValue156 = value;
          length = required + 1 | 0;
          if (+(savedValue156 >>> 0 < length >>> 0)) {
            [value, count, offset, cursor] = growByteWriter(value, length, count, entry, required, recordWriter);
          }
          writeU8((count ? count : entry) + required | 0, capacity);
          writeI32(recordWriter, length, 4);
          break writeEntityDeltaDone28;
        }
        value = readI32(recordWriter, 12);
        value = ((value ? value : entry) + required | 0) - 1 | 0;
        writeU8(value, readU8(value) | capacity << count);
        value = readI32(recordWriter) + 1 | 0;
        storage = +(value === 8) ? 0 : value;
      }
      writeI32(recordWriter, storage);
      value = 29;
    }
    // Protocol slot 30: world reference.
        writeEntityDeltaDone29: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone29;
      }
      capacity = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(capacity, 380) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone29;
      }
      value = (30 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32123 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32123 : 4096;
      const savedValue157 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue157 >>> 0 < required >>> 0)) {
        [value, storage, cursor, entry, count] = growEmbeddedByteWriter(value, required, storage, recordWriter, offset);
      }
      const savedOffset26 = offset;
      const savedStorage10 = storage;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset26 + (storage ? savedStorage10 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      value = readI32(capacity, 256);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32124 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32124 : 4096;
      const savedValue158 = value;
      cursor = length + required | 0;
      if (+(savedValue158 >>> 0 < cursor >>> 0)) {
        [value, storage, capacity, count] = growByteWriterReverseRelease(value, cursor, storage, offset, required, recordWriter);
      }
      memcpy((storage ? storage : offset) + required | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, cursor, 4);
      value = 30;
    }
    // Protocol slot 31: progression scalar.
        writeEntityDeltaDone30: {
      if (+(includeComponent === 0)) {
        break writeEntityDeltaDone30;
      }
      capacity = readI32(entity, 200);
      if (+(readI32(capacity, 160) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone30;
      }
      value = (31 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32125 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32125 : 4096;
      const savedValue159 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue159 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset27 = offset;
      const savedFieldLength13 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset27 + (fieldLength ? savedFieldLength13 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 10);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32126 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32126 : 4096;
      const savedValue160 = value;
      length = required + 1 | 0;
      if (+(savedValue160 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 31;
    }
    // Protocol slot 32: player scalar.
        writeEntityDeltaDone31: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone31;
      }
      capacity = readI32(entity, 120);
      if (+(readI32(capacity, 140) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone31;
      }
      value = (32 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32127 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32127 : 4096;
      const savedValue161 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue161 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset28 = offset;
      const savedFieldLength14 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset28 + (fieldLength ? savedFieldLength14 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      valueF32 = readF32(capacity, 92);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32128 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32128 : 4096;
      const savedValue162 = value;
      cursor = required + 4 | 0;
      if (+(savedValue162 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, required, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : offset) + required | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 32;
    }
    // Protocol slot 33: world payload.
        writeEntityDeltaDone32: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone32;
      }
      offset = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(offset, 120) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone32;
      }
      value = (33 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32129 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32129 : 4096;
      const savedValue163 = value;
      capacity = readI32(recordWriter, 4);
      required = capacity + length | 0;
      if (+(savedValue163 >>> 0 < required >>> 0)) {
        [value, storage, cursor, entry, count] = growEmbeddedByteWriter(value, required, storage, recordWriter, capacity);
      }
      const savedCapacity13 = capacity;
      const savedStorage11 = storage;
      field = recordWriter + 16 | 0;
      memcpy(savedCapacity13 + (storage ? savedStorage11 : field) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      value = readI32(recordWriter);
      writeEntityDeltaDone33: {
        if (+(readI32(offset - -64 | 0) >>> 0 <= baselineRevision >>> 0)) {
          break writeEntityDeltaDone33;
        }
        if (value) {
          writeI32(recordWriter, 0);
        }
        const storedI32130 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32130 : 4096;
        const savedValue164 = value;
        entry = required + 1 | 0;
        if (+(savedValue164 >>> 0 < entry >>> 0)) {
          [value, storage, cursor, count] = growByteWriter(value, entry, storage, field, required, recordWriter);
        }
        writeU8((storage ? storage : field) + required | 0, 0);
        writeI32(recordWriter, entry, 4);
        capacity = readU8(offset, 60);
        count = readI32(recordWriter);
        if (+(count === 0)) {
          const storedI32131 = readI32(recordWriter, 8);
          count = readI32(recordWriter, 12);
          value = count ? storedI32131 : 4096;
          const savedValue165 = value;
          length = required + 2 | 0;
          if (+(savedValue165 >>> 0 < length >>> 0)) {
            [value, count, offset, cursor] = growByteWriter(value, length, count, field, entry, recordWriter);
          }
          writeU8((count ? count : field) + entry | 0, capacity);
          writeI32(recordWriter, length, 4);
          value = 1;
          writeI32(recordWriter, 1);
          break writeEntityDeltaDone33;
        }
        value = readI32(recordWriter, 12);
        value = (value ? value : field) + required | 0;
        writeU8(value, readU8(value) | capacity << count);
        const savedRecordWriter = recordWriter;
        value = readI32(recordWriter) + 1 | 0;
        value = +(value === 8) ? 0 : value;
        writeI32(savedRecordWriter, value);
      }
      if (value) {
        writeI32(recordWriter, 0);
      }
      const storedI32132 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32132 : 4096;
      const savedValue166 = value;
      length = readI32(recordWriter, 4);
      cursor = length + 1 | 0;
      if (+(savedValue166 >>> 0 < cursor >>> 0)) {
        [value, storage, capacity, count] = growByteWriter(value, cursor, storage, field, length, recordWriter);
      }
      writeU8((storage ? storage : field) + length | 0, 1);
      writeI32(recordWriter, cursor, 4);
      value = 33;
    }
    required = flagsLow >>> 1 | 0;
    entry = +(scratch >>> 0 > baselineRevision >>> 0);
    // Protocol slot 34: player scalar.
        writeEntityDeltaDone34: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone34;
      }
      offset = readI32(entity, 120);
      if (+(readI32(offset, 144) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone34;
      }
      value = (34 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32133 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32133 : 4096;
      const savedValue167 = value;
      field = readI32(recordWriter, 4);
      nextRevision = field + length | 0;
      if (+(savedValue167 >>> 0 < nextRevision >>> 0)) {
        [value, count, capacity, scratch, cursor] = growEmbeddedByteWriter(value, nextRevision, count, recordWriter, field);
      }
      const savedField3 = field;
      const savedCount29 = count;
      field = recordWriter + 16 | 0;
      memcpy(savedField3 + (count ? savedCount29 : field) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, nextRevision, 4);
      length = readU8(offset, 96);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32134 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32134 : 4096;
      const savedValue168 = value;
      capacity = nextRevision + 1 | 0;
      if (+(savedValue168 >>> 0 < capacity >>> 0)) {
        [value, count, offset, cursor] = growByteWriter(value, capacity, count, field, nextRevision, recordWriter);
      }
      writeU8((count ? count : field) + nextRevision | 0, length);
      writeI32(recordWriter, capacity, 4);
      value = 34;
    }
    entry = entry & required;
    // Protocol slot 35: world payload.
        writeEntityDeltaDone35: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone35;
      }
      required = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(required, 124) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone35;
      }
      value = (35 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32135 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32135 : 4096;
      const savedValue169 = value;
      offset = readI32(recordWriter, 4);
      storage = offset + length | 0;
      if (+(savedValue169 >>> 0 < storage >>> 0)) {
        [value, count, capacity, field, cursor] = growEmbeddedByteWriter(value, storage, count, recordWriter, offset);
      }
      const savedOffset29 = offset;
      const savedCount30 = count;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset29 + (count ? savedCount30 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, storage, 4);
      if (+(baselineRevision >>> 0 < readI32(required, 80) >>> 0)) {
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32136 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI32136 : 4096;
        const savedValue170 = value;
        capacity = storage + 1 | 0;
        if (+(savedValue170 >>> 0 < capacity >>> 0)) {
          [value, count, length, cursor] = growByteWriter(value, capacity, count, offset, storage, recordWriter);
        }
        writeU8((count ? count : offset) + storage | 0, 0);
        writeI32(recordWriter, capacity, 4);
        valueF64 = readF64(required, 72);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32137 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI32137 : 4096;
        const savedValue171 = value;
        storage = storage + 9 | 0;
        if (+(savedValue171 >>> 0 < storage >>> 0)) {
          [value, count, length, cursor] = growByteWriter(value, storage, count, offset, capacity, recordWriter);
        }
        writeF64((count ? count : offset) + capacity | 0, valueF64);
        writeI32(recordWriter, storage, 4);
      }
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32138 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32138 : 4096;
      const savedValue172 = value;
      length = storage + 1 | 0;
      if (+(savedValue172 >>> 0 < length >>> 0)) {
        [value, count, capacity, cursor] = growByteWriterReverseRelease(value, length, count, offset, storage, recordWriter);
      }
      writeU8((count ? count : offset) + storage | 0, 1);
      writeI32(recordWriter, length, 4);
      value = 35;
    }
    offset = +(baselineRevision >>> 0 < stateRevision >>> 0);
    // Protocol slot 36: component36 byte.
        writeEntityDeltaDone36: {
      if (+(entry === 0)) {
        break writeEntityDeltaDone36;
      }
      capacity = readI32(entity, 104);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone36;
      }
      value = (36 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32139 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32139 : 4096;
      const savedValue173 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue173 >>> 0 < field >>> 0)) {
        [value, fieldLength, cursor, required, count] = growEmbeddedByteWriter(value, field, fieldLength, recordWriter, entry);
      }
      const savedEntry10 = entry;
      const savedFieldLength15 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry10 + (fieldLength ? savedFieldLength15 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32140 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32140 : 4096;
      const savedValue174 = value;
      length = field + 1 | 0;
      if (+(savedValue174 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriter(value, length, fieldLength, entry, field, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : entry) + field | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 36;
    }
    offset = offset & flagsHigh;
    // Protocol slot 37: world reference.
        writeEntityDeltaDone37: {
      if (+(pendingEntries === 0)) {
        break writeEntityDeltaDone37;
      }
      capacity = (readI32(entity) + 312 | 0) & readI8(entity, 92) >> 31;
      if (+(readI32(capacity, 20) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone37;
      }
      value = (37 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32141 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32141 : 4096;
      const savedValue175 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue175 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, entry);
      }
      const savedEntry11 = entry;
      const savedStorage12 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedEntry11 + (storage ? savedStorage12 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      capacity = readU8(capacity, 12);
      writeEntityDeltaDone38: {
        count = readI32(recordWriter);
        if (+(count === 0)) {
          count = 1;
          const storedI32142 = readI32(recordWriter, 8);
          parentFlag = readI32(recordWriter, 12);
          value = parentFlag ? storedI32142 : 4096;
          const savedValue176 = value;
          length = field + 1 | 0;
          if (+(savedValue176 >>> 0 < length >>> 0)) {
            [value, parentFlag, entry, cursor] = growByteWriter(value, length, parentFlag, required, field, recordWriter);
          }
          writeU8((parentFlag ? parentFlag : required) + field | 0, capacity);
          writeI32(recordWriter, length, 4);
          break writeEntityDeltaDone38;
        }
        value = readI32(recordWriter, 12);
        value = ((value ? value : required) + field | 0) - 1 | 0;
        writeU8(value, readU8(value) | capacity << count);
        value = readI32(recordWriter) + 1 | 0;
        count = +(value === 8) ? 0 : value;
      }
      writeI32(recordWriter, count);
      value = 37;
    }
    // Protocol slot 38: component38 byte.
        writeEntityDeltaDone39: {
      if (+(offset === 0)) {
        break writeEntityDeltaDone39;
      }
      capacity = readI32(entity, 184);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone39;
      }
      value = (38 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32143 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32143 : 4096;
      const savedValue177 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue177 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset30 = offset;
      const savedFieldLength16 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset30 + (fieldLength ? savedFieldLength16 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32144 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32144 : 4096;
      const savedValue178 = value;
      length = required + 1 | 0;
      if (+(savedValue178 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 38;
    }
    // Protocol slot 39: world payload.
        writeEntityDeltaDone40: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone40;
      }
      offset = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(offset, 384) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone40;
      }
      value = (39 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32145 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32145 : 4096;
      const savedValue179 = value;
      capacity = readI32(recordWriter, 4);
      fieldLength = capacity + length | 0;
      if (+(savedValue179 >>> 0 < fieldLength >>> 0)) {
        [value, storage, cursor, entry, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
      }
      const savedCapacity14 = capacity;
      const savedStorage13 = storage;
      field = recordWriter + 16 | 0;
      memcpy(savedCapacity14 + (storage ? savedStorage13 : field) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, fieldLength, 4);
      value = 0;
      length = 0;
      do {
        count = value + 1 | 0;
        const savedBaselineRevision7 = baselineRevision;
        capacity = offset + (value << 2) | 0;
        if (+(savedBaselineRevision7 >>> 0 < readI32(capacity, 300) >>> 0)) {
          value = (count - length | 0) ^ 1;
          length = 0;
          [length, value, cursor] = writeTickVarUint(fieldScratch, length, value);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI32146 = readI32(recordWriter, 8);
          storage = readI32(recordWriter, 12);
          value = storage ? storedI32146 : 4096;
          const savedValue180 = value;
          required = length + fieldLength | 0;
          if (+(savedValue180 >>> 0 < required >>> 0)) {
            [value, storage, entry, cursor] = growByteWriter(value, required, storage, field, fieldLength, recordWriter);
          }
          memcpy((storage ? storage : field) + fieldLength | 0, fieldScratch + 24 | 0, length);
          writeI32(recordWriter, required, 4);
          value = readI32(capacity, 260);
          length = 0;
          [length, value, cursor] = writeTickVarUint(fieldScratch, length, value);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI32147 = readI32(recordWriter, 8);
          storage = readI32(recordWriter, 12);
          value = storage ? storedI32147 : 4096;
          const savedValue181 = value;
          fieldLength = length + required | 0;
          if (+(savedValue181 >>> 0 < fieldLength >>> 0)) {
            [value, storage, capacity, cursor] = growByteWriter(value, fieldLength, storage, field, required, recordWriter);
          }
          memcpy((storage ? storage : field) + required | 0, fieldScratch + 24 | 0, length);
          writeI32(recordWriter, fieldLength, 4);
          length = count;
        }
        value = count;
      } while (+(value !== 10));
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32148 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32148 : 4096;
      const savedValue182 = value;
      cursor = fieldLength + 1 | 0;
      if (+(savedValue182 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, field, fieldLength, recordWriter);
      }
      writeU8((storage ? storage : field) + fieldLength | 0, 1);
      writeI32(recordWriter, cursor, 4);
      value = 39;
    }
    // Protocol slot 40: link payload.
        writeEntityDeltaDone41: {
      if (+(flag === 0)) {
        break writeEntityDeltaDone41;
      }
      capacity = readI32(entity, 172);
      if (+(readI32(capacity, 16) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone41;
      }
      value = (40 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32149 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32149 : 4096;
      const savedValue183 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue183 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedFieldLength17 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy((fieldLength ? savedFieldLength17 : entry) + offset | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      capacity = readU8(capacity, 9);
      writeEntityDeltaDone42: {
        count = readI32(recordWriter);
        if (+(count === 0)) {
          storage = 1;
          const storedI32150 = readI32(recordWriter, 8);
          count = readI32(recordWriter, 12);
          value = count ? storedI32150 : 4096;
          const savedValue184 = value;
          length = required + 1 | 0;
          if (+(savedValue184 >>> 0 < length >>> 0)) {
            [value, count, offset, cursor] = growByteWriter(value, length, count, entry, required, recordWriter);
          }
          writeU8((count ? count : entry) + required | 0, capacity);
          writeI32(recordWriter, length, 4);
          break writeEntityDeltaDone42;
        }
        value = readI32(recordWriter, 12);
        value = ((value ? value : entry) + required | 0) - 1 | 0;
        writeU8(value, readU8(value) | capacity << count);
        value = readI32(recordWriter) + 1 | 0;
        storage = +(value === 8) ? 0 : value;
      }
      writeI32(recordWriter, storage);
      value = 40;
    }
    entry = flagsOwnership >>> 5 | 0;
    offset = +(baselineRevision >>> 0 < entityOffset >>> 0);
    // Protocol slot 41: world reference.
        writeEntityDeltaDone43: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone43;
      }
      capacity = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(capacity, 128) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone43;
      }
      value = (41 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32151 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32151 : 4096;
      const savedValue185 = value;
      required = readI32(recordWriter, 4);
      flag = required + length | 0;
      if (+(savedValue185 >>> 0 < flag >>> 0)) {
        [value, storage, cursor, field, count] = growEmbeddedByteWriter(value, flag, storage, recordWriter, required);
      }
      const savedRequired8 = required;
      const savedStorage14 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedRequired8 + (storage ? savedStorage14 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      value = readI32(capacity, 88);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32152 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI32152 : 4096;
      const savedValue186 = value;
      cursor = length + flag | 0;
      if (+(savedValue186 >>> 0 < cursor >>> 0)) {
        [value, parentFlag, capacity, count] = growByteWriter(value, cursor, parentFlag, required, flag, recordWriter);
      }
      memcpy((parentFlag ? parentFlag : required) + flag | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, cursor, 4);
      value = 41;
    }
    offset = offset & entry;
    // Protocol slot 42: world scalar.
        writeEntityDeltaDone44: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone44;
      }
      capacity = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(capacity, 388) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone44;
      }
      value = (42 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32153 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32153 : 4096;
      const savedValue187 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue187 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, entry);
      }
      const savedEntry12 = entry;
      const savedStorage15 = storage;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry12 + (storage ? savedStorage15 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(capacity, 340);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32154 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32154 : 4096;
      const savedValue188 = value;
      cursor = field + 4 | 0;
      if (+(savedValue188 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, entry, field, recordWriter);
      }
      writeF32((storage ? storage : entry) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 42;
    }
    // Protocol slot 43: species byte.
        writeEntityDeltaDone45: {
      if (+(offset === 0)) {
        break writeEntityDeltaDone45;
      }
      capacity = readI32(entity, 148);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone45;
      }
      value = (43 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32155 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32155 : 4096;
      const savedValue189 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue189 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset31 = offset;
      const savedFieldLength18 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset31 + (fieldLength ? savedFieldLength18 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32156 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32156 : 4096;
      const savedValue190 = value;
      length = required + 1 | 0;
      if (+(savedValue190 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 43;
    }
    // Protocol slot 44: world reference.
        writeEntityDeltaDone46: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone46;
      }
      capacity = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(capacity, 132) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone46;
      }
      value = (44 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32157 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32157 : 4096;
      const savedValue191 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue191 >>> 0 < required >>> 0)) {
        [value, storage, cursor, entry, count] = growEmbeddedByteWriter(value, required, storage, recordWriter, offset);
      }
      const savedOffset32 = offset;
      const savedStorage16 = storage;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset32 + (storage ? savedStorage16 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      value = readI32(capacity, 92);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32158 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32158 : 4096;
      const savedValue192 = value;
      cursor = length + required | 0;
      if (+(savedValue192 >>> 0 < cursor >>> 0)) {
        [value, storage, capacity, count] = growByteWriterReverseRelease(value, cursor, storage, offset, required, recordWriter);
      }
      memcpy((storage ? storage : offset) + required | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, cursor, 4);
      value = 44;
    }
    required = flagsMid >>> 2 | 0;
    entry = +(component >>> 0 > baselineRevision >>> 0);
    // Protocol slot 46: transform fields45–46.
        writeEntityDeltaDone47: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone47;
      }
      const savedBaselineRevision8 = baselineRevision;
      storage = readI32(entity);
      const savedBits37 = storage + 624 | 0;
      length = readI8(entity, 93);
      offset = savedBits37 & length >> 31;
      if (+(savedBaselineRevision8 >>> 0 < readI32(offset, 392) >>> 0)) {
        value = (45 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32159 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI32159 : 4096;
        const savedValue193 = value;
        field = readI32(recordWriter, 4);
        scratch = field + length | 0;
        if (+(savedValue193 >>> 0 < scratch >>> 0)) {
          [value, count, capacity, flag, cursor] = growEmbeddedByteWriter(value, scratch, count, recordWriter, field);
        }
        const savedField4 = field;
        const savedCount31 = count;
        field = recordWriter + 16 | 0;
        memcpy(savedField4 + (count ? savedCount31 : field) | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, scratch, 4);
        valueF64 = readF64(offset, 344);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32160 = readI32(recordWriter, 8);
        count = readI32(recordWriter, 12);
        value = count ? storedI32160 : 4096;
        const savedValue194 = value;
        length = scratch + 4 | 0;
        if (+(savedValue194 >>> 0 < length >>> 0)) {
          [value, count, capacity, cursor] = growByteWriter(value, length, count, field, scratch, recordWriter);
        }
        writeF32((count ? count : field) + scratch | 0, f32(valueF64));
        writeI32(recordWriter, length, 4);
        storage = readI32(entity);
        length = readU8(entity, 93);
        value = 45;
      }
      offset = (storage + 624 | 0) & length << 24 >> 31;
      if (+(readI32(offset, 396) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone47;
      }
      value = (46 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32161 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32161 : 4096;
      const savedValue195 = value;
      field = readI32(recordWriter, 4);
      scratch = field + length | 0;
      if (+(savedValue195 >>> 0 < scratch >>> 0)) {
        [value, count, capacity, flag, cursor] = growEmbeddedByteWriter(value, scratch, count, recordWriter, field);
      }
      const savedField5 = field;
      const savedCount32 = count;
      field = recordWriter + 16 | 0;
      memcpy(savedField5 + (count ? savedCount32 : field) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, scratch, 4);
      length = readU8(offset, 352);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32162 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32162 : 4096;
      const savedValue196 = value;
      capacity = scratch + 1 | 0;
      if (+(savedValue196 >>> 0 < capacity >>> 0)) {
        [value, count, offset, cursor] = growByteWriter(value, capacity, count, field, scratch, recordWriter);
      }
      writeU8((count ? count : field) + scratch | 0, length);
      writeI32(recordWriter, capacity, 4);
      value = 46;
    }
    entry = entry & required;
    // Protocol slot 47: player scalar.
        writeEntityDeltaDone48: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone48;
      }
      capacity = readI32(entity, 120);
      if (+(readI32(capacity, 148) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone48;
      }
      value = (47 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32163 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32163 : 4096;
      const savedValue197 = value;
      offset = readI32(recordWriter, 4);
      field = offset + length | 0;
      if (+(savedValue197 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, offset);
      }
      const savedOffset33 = offset;
      const savedStorage17 = storage;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset33 + (storage ? savedStorage17 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      cursor = readU8(capacity, 97);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32164 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32164 : 4096;
      const savedValue198 = value;
      length = field + 1 | 0;
      if (+(savedValue198 >>> 0 < length >>> 0)) {
        [value, storage, capacity, count] = growByteWriterReverseRelease(value, length, storage, offset, field, recordWriter);
      }
      writeU8((storage ? storage : offset) + field | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 47;
    }
    offset = flagsLow >>> 6 | 0;
    capacity = +(baselineRevision >>> 0 < pendingCount >>> 0);
    // Protocol slot 48: name payload.
        writeEntityDeltaDone49: {
      if (+(entry === 0)) {
        break writeEntityDeltaDone49;
      }
      scratch = readI32(entity, 160);
      if (+(readI32(scratch, 20) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone49;
      }
      value = (48 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32165 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI32165 : 4096;
      const savedValue199 = value;
      entry = readI32(recordWriter, 4);
      pendingCount = entry + length | 0;
      if (+(savedValue199 >>> 0 < pendingCount >>> 0)) {
        [value, parentFlag, cursor, required, count] = growEmbeddedByteWriter(value, pendingCount, parentFlag, recordWriter, entry);
      }
      const savedParentFlag3 = parentFlag;
      flag = recordWriter + 16 | 0;
      memcpy((parentFlag ? savedParentFlag3 : flag) + entry | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, pendingCount, 4);
      const storedI32166 = readI32(scratch, 12);
      value = readU8(scratch, 19);
      const savedValue200 = value;
      length = value << 24 >> 24;
      required = (+((length | 0) < 0) ? storedI32166 : savedValue200) + 1 | 0;
      cursor = readI32(scratch, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32167 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32167 : 4096;
      const savedValue201 = value;
      entry = required + pendingCount | 0;
      if (+(savedValue201 >>> 0 < entry >>> 0)) {
        [value, fieldLength, field, count] = growByteWriter(value, entry, fieldLength, flag, pendingCount, recordWriter);
      }
      memcpy((fieldLength ? fieldLength : flag) + pendingCount | 0, +((length | 0) < 0) ? cursor : scratch + 8 | 0, required);
      writeI32(recordWriter, entry, 4);
      value = 48;
    }
    offset = offset & capacity;
    // Protocol slot 49: transform coordinate.
        writeEntityDeltaDone50: {
      if (+(hasField === 0)) {
        break writeEntityDeltaDone50;
      }
      capacity = readI32(entity, 168);
      if (+(readI32(capacity, 32) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone50;
      }
      value = (49 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32168 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32168 : 4096;
      const savedValue202 = value;
      entry = readI32(recordWriter, 4);
      field = entry + length | 0;
      if (+(savedValue202 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, entry);
      }
      const savedEntry13 = entry;
      const savedStorage18 = storage;
      entry = recordWriter + 16 | 0;
      memcpy(savedEntry13 + (storage ? savedStorage18 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(capacity, 20);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32169 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32169 : 4096;
      const savedValue203 = value;
      cursor = field + 4 | 0;
      if (+(savedValue203 >>> 0 < cursor >>> 0)) {
        [value, storage, length, count] = growByteWriter(value, cursor, storage, entry, field, recordWriter);
      }
      writeF32((storage ? storage : entry) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 49;
    }
    // Protocol slot 50: petal byte.
        writeEntityDeltaDone51: {
      if (+(offset === 0)) {
        break writeEntityDeltaDone51;
      }
      capacity = readI32(entity, 124);
      if (+(readI32(capacity, 12) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone51;
      }
      value = (50 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32170 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32170 : 4096;
      const savedValue204 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue204 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset34 = offset;
      const savedFieldLength19 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset34 + (fieldLength ? savedFieldLength19 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      cursor = readU8(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32171 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32171 : 4096;
      const savedValue205 = value;
      length = required + 1 | 0;
      if (+(savedValue205 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, required, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + required | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 50;
    }
    entry = flagsMid >>> 3 | 0;
    offset = +(baselineRevision >>> 0 < otherRevision >>> 0);
    // Protocol slot 51: world reference.
        writeEntityDeltaDone52: {
      if (+(includeField === 0)) {
        break writeEntityDeltaDone52;
      }
      capacity = (readI32(entity) + 1488 | 0) & readU8(entity, 95) << 29 >> 31;
      if (+(readI32(capacity, 136) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone52;
      }
      value = (51 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32172 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32172 : 4096;
      const savedValue206 = value;
      required = readI32(recordWriter, 4);
      flag = required + length | 0;
      if (+(savedValue206 >>> 0 < flag >>> 0)) {
        [value, storage, cursor, field, count] = growEmbeddedByteWriter(value, flag, storage, recordWriter, required);
      }
      const savedRequired9 = required;
      const savedStorage19 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedRequired9 + (storage ? savedStorage19 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, flag, 4);
      value = readI32(capacity, 96);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32173 = readI32(recordWriter, 8);
      parentFlag = readI32(recordWriter, 12);
      value = parentFlag ? storedI32173 : 4096;
      const savedValue207 = value;
      cursor = length + flag | 0;
      if (+(savedValue207 >>> 0 < cursor >>> 0)) {
        [value, parentFlag, capacity, count] = growByteWriter(value, cursor, parentFlag, required, flag, recordWriter);
      }
      memcpy((parentFlag ? parentFlag : required) + flag | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, cursor, 4);
      value = 51;
    }
    entry = offset & entry;
    // Protocol slot 52: world reference.
        writeEntityDeltaDone53: {
      if (+(includeOwner === 0)) {
        break writeEntityDeltaDone53;
      }
      capacity = (readI32(entity) + 624 | 0) & readI8(entity, 93) >> 31;
      if (+(readI32(capacity, 400) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone53;
      }
      value = (52 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32174 = readI32(recordWriter, 8);
      storage = readI32(recordWriter, 12);
      value = storage ? storedI32174 : 4096;
      const savedValue208 = value;
      offset = readI32(recordWriter, 4);
      field = offset + length | 0;
      if (+(savedValue208 >>> 0 < field >>> 0)) {
        [value, storage, cursor, required, count] = growEmbeddedByteWriter(value, field, storage, recordWriter, offset);
      }
      const savedOffset35 = offset;
      const savedStorage20 = storage;
      required = recordWriter + 16 | 0;
      memcpy(savedOffset35 + (storage ? savedStorage20 : required) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      value = readI32(capacity, 356);
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32175 = readI32(recordWriter, 8);
      count = readI32(recordWriter, 12);
      value = count ? storedI32175 : 4096;
      const savedValue209 = value;
      capacity = length + field | 0;
      if (+(savedValue209 >>> 0 < capacity >>> 0)) {
        [value, count, offset, cursor] = growByteWriter(value, capacity, count, required, field, recordWriter);
      }
      memcpy((count ? count : required) + field | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, capacity, 4);
      value = 52;
    }
    // Protocol slot 53: current health.
        writeEntityDeltaDone54: {
      if (+(entry === 0)) {
        break writeEntityDeltaDone54;
      }
      capacity = readI32(entity, 164);
      if (+(readI32(capacity, 16) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone54;
      }
      value = (53 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32176 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32176 : 4096;
      const savedValue210 = value;
      offset = readI32(recordWriter, 4);
      field = offset + length | 0;
      if (+(savedValue210 >>> 0 < field >>> 0)) {
        [value, fieldLength, cursor, required, count] = growEmbeddedByteWriter(value, field, fieldLength, recordWriter, offset);
      }
      const savedOffset36 = offset;
      const savedFieldLength20 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset36 + (fieldLength ? savedFieldLength20 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      valueF32 = readF32(capacity, 8);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32177 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32177 : 4096;
      const savedValue211 = value;
      cursor = field + 4 | 0;
      if (+(savedValue211 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, field, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : offset) + field | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 53;
    }
    // Protocol slot 54: body byte.
        writeEntityDeltaDone55: {
      if (+(revision === 0)) {
        break writeEntityDeltaDone55;
      }
      capacity = readI32(entity, 100);
      if (+(readI32(capacity, 16) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone55;
      }
      value = (54 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32178 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32178 : 4096;
      const savedValue212 = value;
      offset = readI32(recordWriter, 4);
      field = offset + length | 0;
      if (+(savedValue212 >>> 0 < field >>> 0)) {
        [value, fieldLength, cursor, required, count] = growEmbeddedByteWriter(value, field, fieldLength, recordWriter, offset);
      }
      const savedOffset37 = offset;
      const savedFieldLength21 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset37 + (fieldLength ? savedFieldLength21 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, field, 4);
      cursor = readU8(capacity, 9);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32179 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32179 : 4096;
      const savedValue213 = value;
      length = field + 1 | 0;
      if (+(savedValue213 >>> 0 < length >>> 0)) {
        [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, field, recordWriter);
      }
      writeU8((fieldLength ? fieldLength : offset) + field | 0, cursor);
      writeI32(recordWriter, length, 4);
      value = 54;
    }
    // Protocol slot 55: maximum health.
        writeEntityDeltaDone56: {
      if (+(entry === 0)) {
        break writeEntityDeltaDone56;
      }
      capacity = readI32(entity, 164);
      if (+(readI32(capacity, 20) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone56;
      }
      value = (55 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32180 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32180 : 4096;
      const savedValue214 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue214 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset38 = offset;
      const savedFieldLength22 = fieldLength;
      offset = recordWriter + 16 | 0;
      memcpy(savedOffset38 + (fieldLength ? savedFieldLength22 : offset) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      valueF32 = readF32(capacity, 12);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32181 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32181 : 4096;
      const savedValue215 = value;
      cursor = required + 4 | 0;
      if (+(savedValue215 >>> 0 < cursor >>> 0)) {
        [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, offset, required, recordWriter);
      }
      writeF32((fieldLength ? fieldLength : offset) + required | 0, valueF32);
      writeI32(recordWriter, cursor, 4);
      value = 55;
    }
    // Protocol slot 56: player payload.
        writeEntityDeltaDone57: {
      if (+(fieldBits === 0)) {
        break writeEntityDeltaDone57;
      }
      capacity = readI32(entity, 120);
      if (+(readI32(capacity, 152) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone57;
      }
      value = (56 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32182 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32182 : 4096;
      const savedValue216 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue216 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset39 = offset;
      const savedFieldLength23 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy(savedOffset39 + (fieldLength ? savedFieldLength23 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      writeEntityDeltaDone58: {
        value = readI32(capacity, 100);
        if (value) {
          cursor = readI32(value, 16);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI32183 = readI32(recordWriter, 8);
          fieldLength = readI32(recordWriter, 12);
          value = fieldLength ? storedI32183 : 4096;
          const savedValue217 = value;
          length = required + 4 | 0;
          if (+(savedValue217 >>> 0 < length >>> 0)) {
            [value, fieldLength, capacity, count] = growByteWriter(value, length, fieldLength, entry, required, recordWriter);
          }
          storage = rotateLeft(cursor, 18);
          break writeEntityDeltaDone58;
        }
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        storage = 0;
        const storedI32184 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32184 : 4096;
        const savedValue218 = value;
        length = required + 4 | 0;
        if (+(savedValue218 >>> 0 >= length >>> 0)) {
          break writeEntityDeltaDone58;
        }
        do {
          value = value << 1;
        } while (+(value >>> 0 < length >>> 0));
        cursor = fieldLength ? fieldLength : entry;
        fieldLength = malloc(value);
        count = memcpy(fieldLength, cursor, required);
        if (+(cursor !== entry)) {
          free(cursor);
        }
        writeI32(recordWriter, count, 12);
        writeI32(recordWriter, value, 8);
      }
      writeI32((fieldLength ? fieldLength : entry) + required | 0, storage);
      writeI32(recordWriter, length, 4);
      value = 56;
    }
    // Protocol slot 57: world payload.
        writeEntityDeltaDone59: {
      if (+(componentMask === 0)) {
        break writeEntityDeltaDone59;
      }
      capacity = (entity + 216 | 0) & readU8(entity, 93) << 25 >> 31;
      if (+(readI32(capacity, 36) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone59;
      }
      value = (57 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32185 = readI32(recordWriter, 8);
      fieldLength = readI32(recordWriter, 12);
      value = fieldLength ? storedI32185 : 4096;
      const savedValue219 = value;
      offset = readI32(recordWriter, 4);
      required = offset + length | 0;
      if (+(savedValue219 >>> 0 < required >>> 0)) {
        [value, fieldLength, cursor, entry, count] = growEmbeddedByteWriter(value, required, fieldLength, recordWriter, offset);
      }
      const savedOffset40 = offset;
      const savedFieldLength24 = fieldLength;
      entry = recordWriter + 16 | 0;
      memcpy(savedOffset40 + (fieldLength ? savedFieldLength24 : entry) | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, required, 4);
      writeEntityDeltaDone60: {
        value = readI32(capacity, 20);
        if (value) {
          cursor = readI32(value, 16);
          if (readI32(recordWriter)) {
            writeI32(recordWriter, 0);
          }
          const storedI32186 = readI32(recordWriter, 8);
          fieldLength = readI32(recordWriter, 12);
          value = fieldLength ? storedI32186 : 4096;
          const savedValue220 = value;
          length = required + 4 | 0;
          if (+(savedValue220 >>> 0 < length >>> 0)) {
            [value, fieldLength, capacity, count] = growByteWriter(value, length, fieldLength, entry, required, recordWriter);
          }
          storage = rotateLeft(cursor, 18);
          break writeEntityDeltaDone60;
        }
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        storage = 0;
        const storedI32187 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32187 : 4096;
        const savedValue221 = value;
        length = required + 4 | 0;
        if (+(savedValue221 >>> 0 >= length >>> 0)) {
          break writeEntityDeltaDone60;
        }
        do {
          value = value << 1;
        } while (+(value >>> 0 < length >>> 0));
        cursor = fieldLength ? fieldLength : entry;
        fieldLength = malloc(value);
        count = memcpy(fieldLength, cursor, required);
        if (+(cursor !== entry)) {
          free(cursor);
        }
        writeI32(recordWriter, count, 12);
        writeI32(recordWriter, value, 8);
      }
      writeI32((fieldLength ? fieldLength : entry) + required | 0, storage);
      writeI32(recordWriter, length, 4);
      value = 57;
    }
    // Protocol slot 62: progression fields58–62.
        writeEntityDeltaDone61: {
      if (+(presenceBit === 0)) {
        break writeEntityDeltaDone61;
      }
      if (+(baselineRevision >>> 0 >= lastComponentRevision >>> 0)) {
        break writeEntityDeltaDone61;
      }
      if (+(ownerMask === 0)) {
        break writeEntityDeltaDone61;
      }
      const savedBaselineRevision9 = baselineRevision;
      parentFlag = readI32(entity, 200);
      if (+(savedBaselineRevision9 >>> 0 < readI32(parentFlag, 164) >>> 0)) {
        value = (58 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32188 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32188 : 4096;
        const savedValue222 = value;
        capacity = readI32(recordWriter, 4);
        entry = capacity + length | 0;
        if (+(savedValue222 >>> 0 < entry >>> 0)) {
          [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, entry, storage, recordWriter, capacity);
        }
        const savedStorage21 = storage;
        offset = recordWriter + 16 | 0;
        memcpy((storage ? savedStorage21 : offset) + capacity | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, entry, 4);
        value = readU16(parentFlag, 12);
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32189 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32189 : 4096;
        const savedValue223 = value;
        cursor = length + entry | 0;
        if (+(savedValue223 >>> 0 < cursor >>> 0)) {
          [value, storage, capacity, count] = growByteWriterReverseRelease(value, cursor, storage, offset, entry, recordWriter);
        }
        memcpy((storage ? storage : offset) + entry | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, cursor, 4);
        parentFlag = readI32(entity, 200);
        value = 58;
      }
      if (+(baselineRevision >>> 0 < readI32(parentFlag, 168) >>> 0)) {
        value = (59 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32190 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32190 : 4096;
        const savedValue224 = value;
        capacity = readI32(recordWriter, 4);
        entry = capacity + length | 0;
        if (+(savedValue224 >>> 0 < entry >>> 0)) {
          [value, fieldLength, cursor, offset, count] = growEmbeddedByteWriter(value, entry, fieldLength, recordWriter, capacity);
        }
        const savedCapacity15 = capacity;
        const savedFieldLength25 = fieldLength;
        capacity = recordWriter + 16 | 0;
        memcpy(savedCapacity15 + (fieldLength ? savedFieldLength25 : capacity) | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, entry, 4);
        valueF32 = readF32(parentFlag, 16);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32191 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32191 : 4096;
        const savedValue225 = value;
        cursor = entry + 4 | 0;
        if (+(savedValue225 >>> 0 < cursor >>> 0)) {
          [value, fieldLength, length, count] = growByteWriter(value, cursor, fieldLength, capacity, entry, recordWriter);
        }
        writeF32((fieldLength ? fieldLength : capacity) + entry | 0, valueF32);
        writeI32(recordWriter, cursor, 4);
        parentFlag = readI32(entity, 200);
        value = 59;
      }
      if (+(baselineRevision >>> 0 < readI32(parentFlag, 172) >>> 0)) {
        value = (60 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32192 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32192 : 4096;
        const savedValue226 = value;
        capacity = readI32(recordWriter, 4);
        fieldLength = capacity + length | 0;
        if (+(savedValue226 >>> 0 < fieldLength >>> 0)) {
          [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
        }
        const savedStorage22 = storage;
        field = recordWriter + 16 | 0;
        memcpy((storage ? savedStorage22 : field) + capacity | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, fieldLength, 4);
        count = 0;
        value = 0;
        do {
          cursor = count + 1 | 0;
          if (+(baselineRevision >>> 0 < readI32(parentFlag + (count << 2) | 0, 36) >>> 0)) {
            value = (cursor - value | 0) ^ 1;
            length = 0;
            [length, value, capacity] = writeTickVarUint(fieldScratch, length, value);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI32193 = readI32(recordWriter, 8);
            capacity = readI32(recordWriter, 12);
            value = capacity ? storedI32193 : 4096;
            const savedValue227 = value;
            required = length + fieldLength | 0;
            if (+(savedValue227 >>> 0 < required >>> 0)) {
              [value, capacity, entry, offset] = growByteWriter(value, required, capacity, field, fieldLength, recordWriter);
            }
            memcpy((capacity ? capacity : field) + fieldLength | 0, fieldScratch + 24 | 0, length);
            writeI32(recordWriter, required, 4);
            capacity = readU8(count + parentFlag | 0, 20);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI32194 = readI32(recordWriter, 8);
            length = readI32(recordWriter, 12);
            value = length ? storedI32194 : 4096;
            const savedValue228 = value;
            fieldLength = required + 1 | 0;
            if (+(savedValue228 >>> 0 < fieldLength >>> 0)) {
              [value, length, offset, count] = growByteWriter(value, fieldLength, length, field, required, recordWriter);
            }
            writeU8((length ? length : field) + required | 0, capacity);
            writeI32(recordWriter, fieldLength, 4);
            value = cursor;
          }
          count = cursor;
        } while (+(count !== 16));
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32195 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32195 : 4096;
        const savedValue229 = value;
        cursor = fieldLength + 1 | 0;
        if (+(savedValue229 >>> 0 < cursor >>> 0)) {
          [value, storage, length, count] = growByteWriter(value, cursor, storage, field, fieldLength, recordWriter);
        }
        writeU8((storage ? storage : field) + fieldLength | 0, 1);
        writeI32(recordWriter, cursor, 4);
        parentFlag = readI32(entity, 200);
        value = 60;
      }
      if (+(baselineRevision >>> 0 < readI32(parentFlag, 176) >>> 0)) {
        value = (61 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32196 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32196 : 4096;
        const savedValue230 = value;
        capacity = readI32(recordWriter, 4);
        fieldLength = capacity + length | 0;
        if (+(savedValue230 >>> 0 < fieldLength >>> 0)) {
          [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, fieldLength, storage, recordWriter, capacity);
        }
        const savedStorage23 = storage;
        required = recordWriter + 16 | 0;
        memcpy((storage ? savedStorage23 : required) + capacity | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, fieldLength, 4);
        capacity = 0;
        value = 0;
        do {
          count = capacity + 1 | 0;
          if (+(baselineRevision >>> 0 < readI32(parentFlag + (capacity << 2) | 0, 116) >>> 0)) {
            value = (count - value | 0) ^ 1;
            length = 0;
            [length, value, cursor] = writeTickVarUint(fieldScratch, length, value);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI32197 = readI32(recordWriter, 8);
            storage = readI32(recordWriter, 12);
            value = storage ? storedI32197 : 4096;
            const savedValue231 = value;
            entry = length + fieldLength | 0;
            if (+(savedValue231 >>> 0 < entry >>> 0)) {
              [value, storage, offset, cursor] = growByteWriter(value, entry, storage, required, fieldLength, recordWriter);
            }
            memcpy((storage ? storage : required) + fieldLength | 0, fieldScratch + 24 | 0, length);
            writeI32(recordWriter, entry, 4);
            value = readU16(parentFlag + (capacity << 1) | 0, 100);
            length = 0;
            [length, value, cursor] = writeTickVarUint(fieldScratch, length, value);
            if (readI32(recordWriter)) {
              writeI32(recordWriter, 0);
            }
            const storedI32198 = readI32(recordWriter, 8);
            storage = readI32(recordWriter, 12);
            value = storage ? storedI32198 : 4096;
            const savedValue232 = value;
            fieldLength = length + entry | 0;
            if (+(savedValue232 >>> 0 < fieldLength >>> 0)) {
              [value, storage, capacity, cursor] = growByteWriter(value, fieldLength, storage, required, entry, recordWriter);
            }
            memcpy((storage ? storage : required) + entry | 0, fieldScratch + 24 | 0, length);
            writeI32(recordWriter, fieldLength, 4);
            value = count;
          }
          capacity = count;
        } while (+(capacity !== 8));
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32199 = readI32(recordWriter, 8);
        storage = readI32(recordWriter, 12);
        value = storage ? storedI32199 : 4096;
        const savedValue233 = value;
        cursor = fieldLength + 1 | 0;
        if (+(savedValue233 >>> 0 < cursor >>> 0)) {
          [value, storage, length, count] = growByteWriter(value, cursor, storage, required, fieldLength, recordWriter);
        }
        writeU8((storage ? storage : required) + fieldLength | 0, 1);
        writeI32(recordWriter, cursor, 4);
        parentFlag = readI32(entity, 200);
        value = 61;
      }
      if (+(baselineRevision >>> 0 < readI32(parentFlag, 180) >>> 0)) {
        value = (62 - value | 0) ^ 1;
        length = 0;
        [length, value, count] = writeTickVarUint(fieldScratch, length, value);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32200 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32200 : 4096;
        const savedValue234 = value;
        capacity = readI32(recordWriter, 4);
        entry = capacity + length | 0;
        if (+(savedValue234 >>> 0 < entry >>> 0)) {
          [value, fieldLength, cursor, offset, count] = growEmbeddedByteWriter(value, entry, fieldLength, recordWriter, capacity);
        }
        const savedFieldLength26 = fieldLength;
        offset = recordWriter + 16 | 0;
        memcpy((fieldLength ? savedFieldLength26 : offset) + capacity | 0, fieldScratch + 24 | 0, length);
        writeI32(recordWriter, entry, 4);
        cursor = readU8(parentFlag, 148);
        if (readI32(recordWriter)) {
          writeI32(recordWriter, 0);
        }
        const storedI32201 = readI32(recordWriter, 8);
        fieldLength = readI32(recordWriter, 12);
        value = fieldLength ? storedI32201 : 4096;
        const savedValue235 = value;
        length = entry + 1 | 0;
        if (+(savedValue235 >>> 0 < length >>> 0)) {
          [value, fieldLength, capacity, count] = growByteWriterReverseRelease(value, length, fieldLength, offset, entry, recordWriter);
        }
        writeU8((fieldLength ? fieldLength : offset) + entry | 0, cursor);
        writeI32(recordWriter, length, 4);
        parentFlag = readI32(entity, 200);
        value = 62;
      }
      if (+(readI32(parentFlag, 184) >>> 0 <= baselineRevision >>> 0)) {
        break writeEntityDeltaDone61;
      }
      value = (63 - value | 0) ^ 1;
      length = 0;
      [length, value, count] = writeTickVarUint(fieldScratch, length, value);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32202 = readI32(recordWriter, 8);
      entry = readI32(recordWriter, 12);
      value = entry ? storedI32202 : 4096;
      const savedValue236 = value;
      capacity = readI32(recordWriter, 4);
      entity = capacity + length | 0;
      if (+(savedValue236 >>> 0 < entity >>> 0)) {
        [value, entry, cursor, offset, count] = growEmbeddedByteWriter(value, entity, entry, recordWriter, capacity);
      }
      const savedEntry14 = entry;
      offset = recordWriter + 16 | 0;
      memcpy((entry ? savedEntry14 : offset) + capacity | 0, fieldScratch + 24 | 0, length);
      writeI32(recordWriter, entity, 4);
      cursor = readU8(parentFlag, 149);
      if (readI32(recordWriter)) {
        writeI32(recordWriter, 0);
      }
      const storedI32203 = readI32(recordWriter, 8);
      entry = readI32(recordWriter, 12);
      value = entry ? storedI32203 : 4096;
      const savedValue237 = value;
      length = entity + 1 | 0;
      if (+(savedValue237 >>> 0 < length >>> 0)) {
        [value, entry, capacity, count] = growByteWriterReverseRelease(value, length, entry, offset, entity, recordWriter);
      }
      writeU8((entry ? entry : offset) + entity | 0, cursor);
      writeI32(recordWriter, length, 4);
    }
    if (readI32(recordWriter)) {
      writeI32(recordWriter, 0);
    }
    const storedI32204 = readI32(recordWriter, 8);
    storage = readI32(recordWriter, 12);
    value = storage ? storedI32204 : 4096;
    const savedValue238 = value;
    capacity = readI32(recordWriter, 4);
    length = capacity + 1 | 0;
    if (+(savedValue238 >>> 0 < length >>> 0)) {
      [value, storage, cursor, offset, count] = growEmbeddedByteWriter(value, length, storage, recordWriter, capacity);
    }
    writeU8((storage ? storage : recordWriter + 16 | 0) + capacity | 0, 1);
    writeI32(recordWriter, length, 4);
    runtime.stackPointer.value = fieldScratch + 32 | 0;
  }
  /** Build the full component payload cache selected by ownership and wire mode. */  function buildFullEntityCache(cacheSlot, entity, packetFrame, wireFlags, entityOffset) {
    // Original WAT 173846–179153.
    let value = 0, count = 0, length = 0, cursor = 0, offset = 0, capacity = 0, entry = 0, cachedWriter = 0, required = 0, field = 0, componentMask = 0, revision = 0, pendingCount = 0, previousLength = 0, nextRevision = 0, valueF32 = 0, valueF64 = 0, amountF64 = 0;
    cachedWriter = operatorNewOrAbort(4112);
    writeI64(cachedWriter, 0n);
    writeI64(cachedWriter, 0n, 8);
    writeI32(cacheSlot, cachedWriter);
    writeComponentPresence(entity, 0, 1, cachedWriter, wireFlags);
    offset = readI32(entityOffset + 419120 | 0);
    if (offset) {
      capacity = readU8(offset, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32205 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32205 : 4096;
      const savedValue239 = value;
      required = readI32(cachedWriter, 4);
      field = required + 1 | 0;
      if (+(savedValue239 >>> 0 < field >>> 0)) {
        [value, length, cursor, entry, count] = growEmbeddedByteWriter(value, field, length, cachedWriter, required);
      }
      const savedLength41 = length;
      entry = cachedWriter + 16 | 0;
      writeU8((length ? savedLength41 : entry) + required | 0, capacity);
      writeI32(cachedWriter, field, 4);
      length = readU8(offset, 9);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32206 = readI32(cachedWriter, 8);
      cursor = readI32(cachedWriter, 12);
      value = cursor ? storedI32206 : 4096;
      const savedValue240 = value;
      capacity = required + 2 | 0;
      if (+(savedValue240 >>> 0 < capacity >>> 0)) {
        [value, cursor, offset, count] = growByteWriter(value, capacity, cursor, entry, field, cachedWriter);
      }
      writeU8((cursor ? cursor : entry) + field | 0, length);
      writeI32(cachedWriter, capacity, 4);
    }
    value = readI32(entityOffset + 419124 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32207 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32207 : 4096;
      const savedValue241 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue241 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    value = readI32(entityOffset + 419136 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32208 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32208 : 4096;
      const savedValue242 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue242 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    componentMask = readI32(entityOffset + 419140 | 0);
    if (componentMask) {
      capacity = readU8(componentMask, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32209 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32209 : 4096;
      const savedValue243 = value;
      entry = readI32(cachedWriter, 4);
      required = entry + 1 | 0;
      if (+(savedValue243 >>> 0 < required >>> 0)) {
        [value, length, cursor, offset, count] = growEmbeddedByteWriter(value, required, length, cachedWriter, entry);
      }
      const savedLength42 = length;
      revision = cachedWriter + 16 | 0;
      writeU8((length ? savedLength42 : revision) + entry | 0, capacity);
      writeI32(cachedWriter, required, 4);
      valueF32 = readF32(componentMask, 12);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32210 = readI32(cachedWriter, 8);
      cursor = readI32(cachedWriter, 12);
      value = cursor ? storedI32210 : 4096;
      const savedValue244 = value;
      field = entry + 5 | 0;
      if (+(savedValue244 >>> 0 < field >>> 0)) {
        [value, cursor, length, count] = growByteWriter(value, field, cursor, revision, required, cachedWriter);
      }
      writeF32((cursor ? cursor : revision) + required | 0, valueF32);
      writeI32(cachedWriter, field, 4);
      const storedI32211 = readI32(componentMask, 20);
      value = readU8(componentMask, 27);
      const savedValue245 = value;
      entry = value << 24 >> 24;
      required = (+((entry | 0) < 0) ? storedI32211 : savedValue245) + 1 | 0;
      offset = readI32(componentMask, 16);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32212 = readI32(cachedWriter, 8);
      cursor = readI32(cachedWriter, 12);
      value = cursor ? storedI32212 : 4096;
      const savedValue246 = value;
      count = required + field | 0;
      if (+(savedValue246 >>> 0 < count >>> 0)) {
        [value, cursor, capacity, length] = growByteWriter(value, count, cursor, revision, field, cachedWriter);
      }
      capacity = 0;
      memcpy((cursor ? cursor : revision) + field | 0, +((entry | 0) < 0) ? offset : componentMask + 16 | 0, required);
      writeI32(cachedWriter, count, 4);
      do {
        cursor = count;
        entry = readU8(capacity + componentMask | 0, 28);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32213 = readI32(cachedWriter, 8);
        length = readI32(cachedWriter, 12);
        value = length ? storedI32213 : 4096;
        const savedValue247 = value;
        count = cursor + 1 | 0;
        if (+(savedValue247 >>> 0 < count >>> 0)) {
          [value, length, required, offset] = growByteWriter(value, count, length, revision, cursor, cachedWriter);
        }
        writeU8((length ? length : revision) + cursor | 0, entry);
        writeI32(cachedWriter, count, 4);
        capacity = capacity + 1 | 0;
      } while (+(capacity !== 10));
      offset = readU8(componentMask, 80);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32214 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32214 : 4096;
      const savedValue248 = value;
      required = cursor + 2 | 0;
      if (+(savedValue248 >>> 0 < required >>> 0)) {
        [value, capacity, entry, length] = growByteWriter(value, required, capacity, revision, count, cachedWriter);
      }
      writeU8((capacity ? capacity : revision) + count | 0, offset);
      writeI32(cachedWriter, required, 4);
      valueF32 = readF32(componentMask, 84);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32215 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32215 : 4096;
      const savedValue249 = value;
      entry = cursor + 6 | 0;
      if (+(savedValue249 >>> 0 < entry >>> 0)) {
        [value, capacity, length, count] = growByteWriter(value, entry, capacity, revision, required, cachedWriter);
      }
      writeF32((capacity ? capacity : revision) + required | 0, valueF32);
      writeI32(cachedWriter, entry, 4);
      valueF32 = readF32(componentMask, 88);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32216 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32216 : 4096;
      const savedValue250 = value;
      offset = cursor + 10 | 0;
      if (+(savedValue250 >>> 0 < offset >>> 0)) {
        [value, capacity, length, count] = growByteWriter(value, offset, capacity, revision, entry, cachedWriter);
      }
      writeF32((capacity ? capacity : revision) + entry | 0, valueF32);
      writeI32(cachedWriter, offset, 4);
      valueF32 = readF32(componentMask, 92);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32217 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32217 : 4096;
      const savedValue251 = value;
      required = cursor + 14 | 0;
      if (+(savedValue251 >>> 0 < required >>> 0)) {
        [value, capacity, length, count] = growByteWriter(value, required, capacity, revision, offset, cachedWriter);
      }
      writeF32((capacity ? capacity : revision) + offset | 0, valueF32);
      writeI32(cachedWriter, required, 4);
      length = readU8(componentMask, 96);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32218 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32218 : 4096;
      const savedValue252 = value;
      entry = cursor + 15 | 0;
      if (+(savedValue252 >>> 0 < entry >>> 0)) {
        [value, capacity, offset, count] = growByteWriter(value, entry, capacity, revision, required, cachedWriter);
      }
      writeU8((capacity ? capacity : revision) + required | 0, length);
      writeI32(cachedWriter, entry, 4);
      length = readU8(componentMask, 97);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32219 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32219 : 4096;
      const savedValue253 = value;
      cursor = cursor + 16 | 0;
      if (+(savedValue253 >>> 0 < cursor >>> 0)) {
        [value, capacity, offset, count] = growByteWriter(value, cursor, capacity, revision, entry, cachedWriter);
      }
      writeU8((capacity ? capacity : revision) + entry | 0, length);
      writeI32(cachedWriter, cursor, 4);
      serializeEntityReference(componentMask + 100 | 0, cachedWriter);
    }
    value = readI32(entityOffset + 419144 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32220 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32220 : 4096;
      const savedValue254 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue254 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    value = readI8(entityOffset + 419112 | 0);
    if (+((value | 0) <= -1)) {
      capacity = (readI32(entity) + 312 | 0) & value >> 31;
      valueF32 = readF32(capacity, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32221 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32221 : 4096;
      const savedValue255 = value;
      entry = readI32(cachedWriter, 4);
      field = entry + 4 | 0;
      if (+(savedValue255 >>> 0 < field >>> 0)) {
        [value, length, cursor, offset, count] = growEmbeddedByteWriter(value, field, length, cachedWriter, entry);
      }
      const savedLength43 = length;
      required = cachedWriter + 16 | 0;
      writeF32((length ? savedLength43 : required) + entry | 0, valueF32);
      writeI32(cachedWriter, field, 4);
      length = readU8(capacity, 12);
      const savedCachedWriter = cachedWriter;
      let selectedValue46;
      buildFullEntityCacheDone: {
        count = readI32(cachedWriter);
        if (+(count === 0)) {
          const storedI32222 = readI32(cachedWriter, 8);
          offset = readI32(cachedWriter, 12);
          value = offset ? storedI32222 : 4096;
          const savedValue256 = value;
          cursor = entry + 5 | 0;
          if (+(savedValue256 >>> 0 < cursor >>> 0)) {
            [value, offset, capacity, count] = growByteWriter(value, cursor, offset, required, field, cachedWriter);
          }
          writeU8((offset ? offset : required) + field | 0, length);
          writeI32(cachedWriter, cursor, 4);
          selectedValue46 = 1;
          break buildFullEntityCacheDone;
        }
        const savedField6 = field;
        value = readI32(cachedWriter, 12);
        value = (savedField6 + (value ? value : required) | 0) - 1 | 0;
        writeU8(value, readU8(value) | length << count);
        value = readI32(cachedWriter) + 1 | 0;
        selectedValue46 = +(value === 8) ? 0 : value;
      }
      writeI32(savedCachedWriter, selectedValue46);
    }
    value = readI32(entityOffset + 419152 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32223 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32223 : 4096;
      const savedValue257 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue257 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    value = readI32(entityOffset + 419168 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32224 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32224 : 4096;
      const savedValue258 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue258 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    count = entityOffset + 419113 | 0;
    value = readU8(count);
    let selectedValue47;
    if (value & 64) {
      value = (entityOffset + 419236 | 0) & value << 25 >> 31;
      serializeEntityReference(value + 8 | 0, cachedWriter);
      serializeEntityReference(value + 20 | 0, cachedWriter);
      selectedValue47 = readU8(count);
    } else {
      selectedValue47 = value;
    }
    if (+((selectedValue47 << 24 >> 24 | 0) <= -1)) {
      previousLength = cachedWriter + 16 | 0;
      nextRevision = readI32(entity);
      pendingCount = nextRevision + 624 | 0;
      capacity = 0;
      do {
        offset = readI32(pendingCount + (capacity << 2) | 0, 8);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32225 = readI32(cachedWriter, 8);
        length = readI32(cachedWriter, 12);
        value = length ? storedI32225 : 4096;
        const savedValue259 = value;
        entry = readI32(cachedWriter, 4);
        count = entry + 4 | 0;
        if (+(savedValue259 >>> 0 < count >>> 0)) {
          [value, length, required, cursor] = growCachedComponentWriter(value, count, length, previousLength, entry, cachedWriter);
        }
        writeI32((length ? length : previousLength) + entry | 0, rotateLeft(offset, 18));
        writeI32(cachedWriter, count, 4);
        capacity = capacity + 1 | 0;
      } while (+(capacity !== 10));
      offset = 0;
      do {
        cursor = pendingCount + Math.imul(offset, 12) | 0;
        const storedI32226 = readI32(cursor, 92);
        value = readU8(cursor, 99);
        const savedValue260 = value;
        field = +((value << 24 >> 24 | 0) < 0);
        componentMask = (field ? storedI32226 : savedValue260) + 1 | 0;
        required = cursor + 88 | 0;
        entry = readI32(required);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32227 = readI32(cachedWriter, 8);
        capacity = readI32(cachedWriter, 12);
        value = capacity ? storedI32227 : 4096;
        const savedValue261 = value;
        cursor = count + componentMask | 0;
        if (+(savedValue261 >>> 0 < cursor >>> 0)) {
          [value, capacity, revision, length] = growCachedComponentWriter(value, cursor, capacity, previousLength, count, cachedWriter);
        }
        memcpy((capacity ? capacity : previousLength) + count | 0, field ? entry : required, componentMask);
        writeI32(cachedWriter, cursor, 4);
        count = cursor;
        offset = offset + 1 | 0;
      } while (+(offset !== 10));
      length = readU8(nextRevision, 872);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32228 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32228 : 4096;
      const savedValue262 = value;
      required = cursor + 1 | 0;
      if (+(savedValue262 >>> 0 < required >>> 0)) {
        [value, capacity, offset, count] = growCachedComponentWriter(value, required, capacity, previousLength, cursor, cachedWriter);
      }
      writeU8((capacity ? capacity : previousLength) + cursor | 0, length);
      writeI32(cachedWriter, required, 4);
      length = readU8(nextRevision, 873);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32229 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32229 : 4096;
      const savedValue263 = value;
      entry = cursor + 2 | 0;
      if (+(savedValue263 >>> 0 < entry >>> 0)) {
        [value, capacity, offset, count] = growCachedComponentWriter(value, entry, capacity, previousLength, required, cachedWriter);
      }
      writeU8((capacity ? capacity : previousLength) + required | 0, length);
      writeI32(cachedWriter, entry, 4);
      valueF32 = readF32(nextRevision, 876);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32230 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32230 : 4096;
      const savedValue264 = value;
      required = cursor + 6 | 0;
      if (+(savedValue264 >>> 0 < required >>> 0)) {
        [value, count, length, cursor] = growCachedComponentWriter(value, required, count, previousLength, entry, cachedWriter);
      }
      writeF32((count ? count : previousLength) + entry | 0, valueF32);
      writeI32(cachedWriter, required, 4);
      value = readI32(nextRevision, 880);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32231 = readI32(cachedWriter, 8);
      offset = readI32(cachedWriter, 12);
      value = offset ? storedI32231 : 4096;
      const savedValue265 = value;
      length = count + required | 0;
      if (+(savedValue265 >>> 0 < length >>> 0)) {
        [value, offset, capacity, cursor] = growCachedComponentWriter(value, length, offset, previousLength, required, cachedWriter);
      }
      memcpy((offset ? offset : previousLength) + required | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, length, 4);
      offset = 0;
      do {
        value = readI32(pendingCount + (offset << 2) | 0, 260);
        count = 0;
        [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32232 = readI32(cachedWriter, 8);
        capacity = readI32(cachedWriter, 12);
        value = capacity ? storedI32232 : 4096;
        const savedValue266 = value;
        cursor = length;
        length = cursor + count | 0;
        if (+(savedValue266 >>> 0 < length >>> 0)) {
          [value, capacity, required, entry] = growCachedComponentWriter(value, length, capacity, previousLength, cursor, cachedWriter);
        }
        memcpy((capacity ? capacity : previousLength) + cursor | 0, packetFrame + 5216 | 0, count);
        writeI32(cachedWriter, length, 4);
        offset = offset + 1 | 0;
      } while (+(offset !== 10));
      valueF32 = readF32(nextRevision, 964);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32233 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32233 : 4096;
      const savedValue267 = value;
      entry = length + 4 | 0;
      if (+(savedValue267 >>> 0 < entry >>> 0)) {
        [value, capacity, cursor, count] = growCachedComponentWriter(value, entry, capacity, previousLength, length, cachedWriter);
      }
      writeF32((capacity ? capacity : previousLength) + length | 0, valueF32);
      writeI32(cachedWriter, entry, 4);
      valueF64 = readF64(nextRevision, 968);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32234 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32234 : 4096;
      const savedValue268 = value;
      offset = length + 8 | 0;
      if (+(savedValue268 >>> 0 < offset >>> 0)) {
        [value, capacity, cursor, count] = growCachedComponentWriter(value, offset, capacity, previousLength, entry, cachedWriter);
      }
      writeF32((capacity ? capacity : previousLength) + entry | 0, f32(valueF64));
      writeI32(cachedWriter, offset, 4);
      capacity = readU8(nextRevision, 976);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32235 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32235 : 4096;
      const savedValue269 = value;
      entry = length + 9 | 0;
      if (+(savedValue269 >>> 0 < entry >>> 0)) {
        [value, count, length, cursor] = growCachedComponentWriter(value, entry, count, previousLength, offset, cachedWriter);
      }
      writeU8((count ? count : previousLength) + offset | 0, capacity);
      writeI32(cachedWriter, entry, 4);
      value = readI32(nextRevision, 980);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32236 = readI32(cachedWriter, 8);
      offset = readI32(cachedWriter, 12);
      value = offset ? storedI32236 : 4096;
      const savedValue270 = value;
      length = count + entry | 0;
      if (+(savedValue270 >>> 0 < length >>> 0)) {
        [value, offset, capacity, cursor] = growCachedComponentWriter(value, length, offset, previousLength, entry, cachedWriter);
      }
      memcpy((offset ? offset : previousLength) + entry | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, length, 4);
    }
    revision = readI32(entityOffset + 419180 | 0);
    if (revision) {
      const storedI32237 = readI32(revision, 12);
      value = readU8(revision, 19);
      const savedValue271 = value;
      offset = +((value << 24 >> 24 | 0) < 0);
      field = (offset ? storedI32237 : savedValue271) + 1 | 0;
      capacity = readI32(revision, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32238 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32238 : 4096;
      const savedValue272 = value;
      required = readI32(cachedWriter, 4);
      entry = required + field | 0;
      if (+(savedValue272 >>> 0 < entry >>> 0)) {
        [value, length, cursor, componentMask, count] = growEmbeddedByteWriter(value, entry, length, cachedWriter, required);
      }
      memcpy((length ? length : cachedWriter + 16 | 0) + required | 0, offset ? capacity : revision + 8 | 0, field);
      writeI32(cachedWriter, entry, 4);
    }
    capacity = readI32(entityOffset + 419184 | 0);
    if (capacity) {
      valueF32 = readF32(capacity, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32239 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32239 : 4096;
      const savedValue273 = value;
      entry = readI32(cachedWriter, 4);
      required = entry + 4 | 0;
      if (+(savedValue273 >>> 0 < required >>> 0)) {
        [value, length, cursor, offset, count] = growEmbeddedByteWriter(value, required, length, cachedWriter, entry);
      }
      const savedLength44 = length;
      offset = cachedWriter + 16 | 0;
      writeF32((length ? savedLength44 : offset) + entry | 0, valueF32);
      writeI32(cachedWriter, required, 4);
      valueF32 = readF32(capacity, 12);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32240 = readI32(cachedWriter, 8);
      cursor = readI32(cachedWriter, 12);
      value = cursor ? storedI32240 : 4096;
      const savedValue274 = value;
      length = entry + 8 | 0;
      if (+(savedValue274 >>> 0 < length >>> 0)) {
        [value, cursor, capacity, count] = growByteWriterReverseRelease(value, length, cursor, offset, required, cachedWriter);
      }
      writeF32((cursor ? cursor : offset) + required | 0, valueF32);
      writeI32(cachedWriter, length, 4);
    }
    entry = readI32(entityOffset + 419188 | 0);
    if (entry) {
      valueF64 = readF64(entry, 8);
      writeI64(packetFrame, 4618760256179416344n, 8);
      writeF64(packetFrame, valueF64);
      valueF64 = runtime.host("a", "a", 22903, 6924, packetFrame);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32241 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32241 : 4096;
      const savedValue275 = value;
      componentMask = readI32(cachedWriter, 4);
      field = componentMask + 2 | 0;
      if (+(savedValue275 >>> 0 < field >>> 0)) {
        [value, length, cursor, capacity, count] = growEmbeddedByteWriter(value, field, length, cachedWriter, componentMask);
      }
      const savedLength45 = length;
      revision = cachedWriter + 16 | 0;
      const savedBits38 = (length ? savedLength45 : revision) + componentMask | 0;
      let selectedValue48;
      buildFullEntityCacheDone2: {
        valueF64 = (+(valueF64 < 0.0) ? valueF64 + 6.283185307179586 : valueF64) * 10430.219195527361;
        if (+(valueF64 < 4294967296.0) & +(valueF64 >= 0.0)) {
          selectedValue48 = truncateInteger(valueF64, true);
          break buildFullEntityCacheDone2;
        }
        selectedValue48 = 0;
      }
      writeU16(savedBits38, selectedValue48);
      writeI32(cachedWriter, field, 4);
      valueF32 = readF32(entry, 16);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32242 = readI32(cachedWriter, 8);
      offset = readI32(cachedWriter, 12);
      value = offset ? storedI32242 : 4096;
      const savedValue276 = value;
      required = componentMask + 6 | 0;
      if (+(savedValue276 >>> 0 < required >>> 0)) {
        [value, offset, cursor, count] = growByteWriter(value, required, offset, revision, field, cachedWriter);
      }
      writeF32((offset ? offset : revision) + field | 0, valueF32);
      writeI32(cachedWriter, required, 4);
      valueF32 = readF32(entry, 20);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32243 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32243 : 4096;
      const savedValue277 = value;
      cursor = componentMask + 10 | 0;
      if (+(savedValue277 >>> 0 < cursor >>> 0)) {
        [value, capacity, length, count] = growByteWriter(value, cursor, capacity, revision, required, cachedWriter);
      }
      writeF32((capacity ? capacity : revision) + required | 0, valueF32);
      writeI32(cachedWriter, cursor, 4);
    }
    field = readI32(entityOffset + 419192 | 0);
    if (field) {
      entry = readU8(field, 8);
      const savedCachedWriter2 = cachedWriter;
      let selectedValue49;
      buildFullEntityCacheDone3: {
        buildFullEntityCacheDone4: {
          buildFullEntityCacheDone5: {
            count = readI32(cachedWriter);
            if (+(count === 0)) {
              const storedI32244 = readI32(cachedWriter, 8);
              capacity = readI32(cachedWriter, 12);
              value = capacity ? storedI32244 : 4096;
              const savedValue278 = value;
              offset = readI32(cachedWriter, 4);
              count = offset + 1 | 0;
              if (+(savedValue278 >>> 0 < count >>> 0)) {
                [value, capacity, length, required, cursor] = growEmbeddedByteWriter(value, count, capacity, cachedWriter, offset);
              }
              writeU8((capacity ? capacity : cachedWriter + 16 | 0) + offset | 0, entry);
              value = 1;
              writeI32(cachedWriter, 1);
              writeI32(cachedWriter, count, 4);
              length = readU8(field, 9);
              break buildFullEntityCacheDone5;
            }
            const storedI32245 = readI32(cachedWriter, 4);
            value = readI32(cachedWriter, 12);
            const savedValue279 = value;
            required = cachedWriter + 16 | 0;
            value = (storedI32245 + (value ? savedValue279 : required) | 0) - 1 | 0;
            writeU8(value, readU8(value) | entry << count);
            value = readI32(cachedWriter) + 1 | 0;
            if (+(value === 8)) {
              writeI32(cachedWriter, 0);
              length = readU8(field, 9);
              break buildFullEntityCacheDone4;
            }
            writeI32(cachedWriter, value);
            length = readU8(field, 9);
            if (+(value === 0)) {
              break buildFullEntityCacheDone4;
            }
            count = readI32(cachedWriter, 4);
          }
          const savedCount33 = count;
          cursor = readI32(cachedWriter, 12);
          count = (savedCount33 + (cursor ? cursor : cachedWriter + 16 | 0) | 0) - 1 | 0;
          writeU8(count, readU8(count) | (length & 255) << value);
          value = readI32(cachedWriter) + 1 | 0;
          selectedValue49 = +(value === 8) ? 0 : value;
          break buildFullEntityCacheDone3;
        }
        const storedI32246 = readI32(cachedWriter, 8);
        cursor = readI32(cachedWriter, 12);
        value = cursor ? storedI32246 : 4096;
        const savedValue280 = value;
        offset = readI32(cachedWriter, 4);
        capacity = offset + 1 | 0;
        if (+(savedValue280 >>> 0 < capacity >>> 0)) {
          [value, cursor, entry, count] = growByteWriter(value, capacity, cursor, required, offset, cachedWriter);
        }
        writeU8((cursor ? cursor : required) + offset | 0, length);
        writeI32(cachedWriter, capacity, 4);
        selectedValue49 = 1;
      }
      writeI32(savedCachedWriter2, selectedValue49);
    }
    value = readI32(entityOffset + 419204 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32247 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32247 : 4096;
      const savedValue281 = value;
      entry = readI32(cachedWriter, 4);
      offset = entry + 1 | 0;
      if (+(savedValue281 >>> 0 < offset >>> 0)) {
        [value, length, cursor, required, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entry);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entry | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    value = readI32(entityOffset + 419208 | 0);
    if (value) {
      valueF32 = readF32(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32248 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32248 : 4096;
      const savedValue282 = value;
      offset = readI32(cachedWriter, 4);
      capacity = offset + 4 | 0;
      if (+(savedValue282 >>> 0 < capacity >>> 0)) {
        [value, length, cursor, entry, count] = growEmbeddedByteWriter(value, capacity, length, cachedWriter, offset);
      }
      writeF32((length ? length : cachedWriter + 16 | 0) + offset | 0, valueF32);
      writeI32(cachedWriter, capacity, 4);
    }
    if (readU8(entityOffset + 419115 | 0) & 4) {
      revision = readI32(entity);
      const storedI32249 = readI32(revision + 1500 | 0);
      value = readU8(revision + 1507 | 0);
      const savedValue283 = value;
      entity = value << 24 >> 24;
      required = (+((entity | 0) < 0) ? storedI32249 : savedValue283) + 1 | 0;
      offset = revision + 1496 | 0;
      capacity = readI32(offset);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32250 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32250 : 4096;
      const savedValue284 = value;
      entry = readI32(cachedWriter, 4);
      componentMask = entry + required | 0;
      if (+(savedValue284 >>> 0 < componentMask >>> 0)) {
        [value, length, cursor, field, count] = growEmbeddedByteWriter(value, componentMask, length, cachedWriter, entry);
      }
      count = 0;
      const savedEntry15 = entry;
      const savedLength46 = length;
      pendingCount = cachedWriter + 16 | 0;
      memcpy(savedEntry15 + (length ? savedLength46 : pendingCount) | 0, +((entity | 0) < 0) ? capacity : offset, required);
      writeI32(cachedWriter, componentMask, 4);
      value = readI32(revision + 1512 | 0);
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32251 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32251 : 4096;
      const savedValue285 = value;
      offset = count + componentMask | 0;
      if (+(savedValue285 >>> 0 < offset >>> 0)) {
        [value, capacity, length, cursor] = growByteWriter(value, offset, capacity, pendingCount, componentMask, cachedWriter);
      }
      memcpy((capacity ? capacity : pendingCount) + componentMask | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, offset, 4);
      valueF64 = readF64(revision + 1520 | 0);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32252 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32252 : 4096;
      const savedValue286 = value;
      required = offset + 8 | 0;
      if (+(savedValue286 >>> 0 < required >>> 0)) {
        [value, count, length, cursor] = growByteWriter(value, required, count, pendingCount, offset, cachedWriter);
      }
      writeF64((count ? count : pendingCount) + offset | 0, valueF64);
      writeI32(cachedWriter, required, 4);
      const storedI32253 = readI32(revision + 1532 | 0);
      value = readU8(revision + 1539 | 0);
      const savedValue287 = value;
      offset = +((value << 24 >> 24 | 0) < 0);
      entity = (offset ? storedI32253 : savedValue287) + 1 | 0;
      capacity = revision + 1528 | 0;
      cursor = readI32(capacity);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32254 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32254 : 4096;
      const savedValue288 = value;
      field = required + entity | 0;
      if (+(savedValue288 >>> 0 < field >>> 0)) {
        [value, length, entry, count] = growByteWriter(value, field, length, pendingCount, required, cachedWriter);
      }
      memcpy((length ? length : pendingCount) + required | 0, offset ? cursor : capacity, entity);
      writeI32(cachedWriter, field, 4);
      valueF32 = readF32(revision + 1544 | 0);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32255 = readI32(cachedWriter, 8);
      cursor = readI32(cachedWriter, 12);
      value = cursor ? storedI32255 : 4096;
      const savedValue289 = value;
      entity = field + 4 | 0;
      if (+(savedValue289 >>> 0 < entity >>> 0)) {
        [value, cursor, length, count] = growByteWriter(value, entity, cursor, pendingCount, field, cachedWriter);
      }
      writeF32((cursor ? cursor : pendingCount) + field | 0, valueF32);
      writeI32(cachedWriter, entity, 4);
      length = readU8(revision + 1548 | 0);
      buildFullEntityCacheDone6: {
        buildFullEntityCacheDone7: {
          count = readI32(cachedWriter);
          if (+(count === 0)) {
            const storedI32256 = readI32(cachedWriter, 8);
            capacity = readI32(cachedWriter, 12);
            value = capacity ? storedI32256 : 4096;
            const savedValue290 = value;
            cursor = field + 5 | 0;
            if (+(savedValue290 >>> 0 < cursor >>> 0)) {
              [value, capacity, offset, count] = growByteWriter(value, cursor, capacity, pendingCount, entity, cachedWriter);
            }
            writeU8((capacity ? capacity : pendingCount) + entity | 0, length);
            writeI32(cachedWriter, 1);
            writeI32(cachedWriter, cursor, 4);
            amountF64 = readF64(revision + 1560 | 0);
            break buildFullEntityCacheDone7;
          }
          value = readI32(cachedWriter, 12);
          value = ((value ? value : pendingCount) + entity | 0) - 1 | 0;
          writeU8(value, readU8(value) | length << count);
          value = readI32(cachedWriter) + 1 | 0;
          if (+(value === 8)) {
            writeI32(cachedWriter, 0);
            amountF64 = readF64(revision + 1560 | 0);
            break buildFullEntityCacheDone6;
          }
          writeI32(cachedWriter, value);
          amountF64 = readF64(revision + 1560 | 0);
          if (+(value === 0)) {
            break buildFullEntityCacheDone6;
          }
        }
        writeI32(cachedWriter, 0);
      }
      const storedI32257 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32257 : 4096;
      const savedValue291 = value;
      length = readI32(cachedWriter, 4);
      entity = length + 8 | 0;
      if (+(savedValue291 >>> 0 < entity >>> 0)) {
        [value, count, capacity, cursor] = growByteWriter(value, entity, count, pendingCount, length, cachedWriter);
      }
      writeF64((count ? count : pendingCount) + length | 0, amountF64);
      writeI32(cachedWriter, entity, 4);
      value = readI32(revision + 1576 | 0);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32258 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32258 : 4096;
      const savedValue292 = value;
      offset = count + entity | 0;
      if (+(savedValue292 >>> 0 < offset >>> 0)) {
        [value, length, capacity, cursor] = growByteWriter(value, offset, length, pendingCount, entity, cachedWriter);
      }
      memcpy((length ? length : pendingCount) + entity | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, offset, 4);
      value = readI32(revision + 1580 | 0);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32259 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32259 : 4096;
      const savedValue293 = value;
      entity = count + offset | 0;
      if (+(savedValue293 >>> 0 < entity >>> 0)) {
        [value, length, capacity, cursor] = growByteWriter(value, entity, length, pendingCount, offset, cachedWriter);
      }
      memcpy((length ? length : pendingCount) + offset | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, entity, 4);
      value = readI32(revision + 1584 | 0);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32260 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      value = capacity ? storedI32260 : 4096;
      const savedValue294 = value;
      length = count + entity | 0;
      if (+(savedValue294 >>> 0 < length >>> 0)) {
        [value, capacity, offset, cursor] = growByteWriter(value, length, capacity, pendingCount, entity, cachedWriter);
      }
      memcpy((capacity ? capacity : pendingCount) + entity | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, length, 4);
    }
    value = readI32(entityOffset + 419212 | 0);
    if (value) {
      capacity = readU8(value, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32261 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32261 : 4096;
      const savedValue295 = value;
      entity = readI32(cachedWriter, 4);
      offset = entity + 1 | 0;
      if (+(savedValue295 >>> 0 < offset >>> 0)) {
        [value, length, cursor, entry, count] = growEmbeddedByteWriter(value, offset, length, cachedWriter, entity);
      }
      writeU8((length ? length : cachedWriter + 16 | 0) + entity | 0, capacity);
      writeI32(cachedWriter, offset, 4);
    }
    buildFullEntityCacheDone8: {
      field = readI32(entityOffset + 419220 | 0);
      if (+(field === 0)) {
        break buildFullEntityCacheDone8;
      }
      capacity = readU8(field, 8);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32262 = readI32(cachedWriter, 8);
      length = readI32(cachedWriter, 12);
      value = length ? storedI32262 : 4096;
      const savedValue296 = value;
      required = readI32(cachedWriter, 4);
      entity = required + 1 | 0;
      if (+(savedValue296 >>> 0 < entity >>> 0)) {
        [value, length, cursor, offset, count] = growEmbeddedByteWriter(value, entity, length, cachedWriter, required);
      }
      const savedLength47 = length;
      revision = cachedWriter + 16 | 0;
      writeU8((length ? savedLength47 : revision) + required | 0, capacity);
      writeI32(cachedWriter, entity, 4);
      cursor = readU8(field, 9);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32263 = readI32(cachedWriter, 8);
      entry = readI32(cachedWriter, 12);
      value = entry ? storedI32263 : 4096;
      const savedValue297 = value;
      offset = required + 2 | 0;
      if (+(savedValue297 >>> 0 < offset >>> 0)) {
        [value, entry, length, count] = growByteWriter(value, offset, entry, revision, entity, cachedWriter);
      }
      writeU8((entry ? entry : revision) + entity | 0, cursor);
      writeI32(cachedWriter, offset, 4);
      length = readU8(field, 10);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32264 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32264 : 4096;
      const savedValue298 = value;
      entity = required + 3 | 0;
      if (+(savedValue298 >>> 0 < entity >>> 0)) {
        [value, count, capacity, cursor] = growByteWriter(value, entity, count, revision, offset, cachedWriter);
      }
      writeU8((count ? count : revision) + offset | 0, length);
      writeI32(cachedWriter, entity, 4);
      if (+((wireFlags & 64) === 0)) {
        break buildFullEntityCacheDone8;
      }
      value = readU16(field, 12);
      count = 0;
      [count, value, cursor] = writePacketVarUint(packetFrame, count, value);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32265 = readI32(cachedWriter, 8);
      entry = readI32(cachedWriter, 12);
      value = entry ? storedI32265 : 4096;
      const savedValue299 = value;
      offset = count + entity | 0;
      if (+(savedValue299 >>> 0 < offset >>> 0)) {
        [value, entry, length, cursor] = growByteWriter(value, offset, entry, revision, entity, cachedWriter);
      }
      memcpy((entry ? entry : revision) + entity | 0, packetFrame + 5216 | 0, count);
      writeI32(cachedWriter, offset, 4);
      valueF32 = readF32(field, 16);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32266 = readI32(cachedWriter, 8);
      count = readI32(cachedWriter, 12);
      value = count ? storedI32266 : 4096;
      const savedValue300 = value;
      capacity = offset + 4 | 0;
      if (+(savedValue300 >>> 0 < capacity >>> 0)) {
        [value, count, length, cursor] = growByteWriter(value, capacity, count, revision, offset, cachedWriter);
      }
      writeF32((count ? count : revision) + offset | 0, valueF32);
      writeI32(cachedWriter, capacity, 4);
      componentMask = 0;
      do {
        offset = readU8(field + componentMask | 0, 20);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32267 = readI32(cachedWriter, 8);
        length = readI32(cachedWriter, 12);
        count = length ? storedI32267 : 4096;
        const savedCount34 = count;
        value = capacity + 1 | 0;
        if (+(savedCount34 >>> 0 < value >>> 0)) {
          [count, length, entity, cursor] = growByteWriter(count, value, length, revision, capacity, cachedWriter);
        }
        writeU8((length ? length : revision) + capacity | 0, offset);
        writeI32(cachedWriter, value, 4);
        entry = 0;
        capacity = value;
        componentMask = componentMask + 1 | 0;
      } while (+(componentMask !== 16));
      do {
        cursor = value;
        value = readU16(field + (entry << 1) | 0, 100);
        count = 0;
        [count, value, length] = writePacketVarUint(packetFrame, count, value);
        if (readI32(cachedWriter)) {
          writeI32(cachedWriter, 0);
        }
        const storedI32268 = readI32(cachedWriter, 8);
        capacity = readI32(cachedWriter, 12);
        length = capacity ? storedI32268 : 4096;
        const savedLength48 = length;
        value = count + cursor | 0;
        if (+(savedLength48 >>> 0 < value >>> 0)) {
          [length, capacity, entity, offset] = growByteWriter(length, value, capacity, revision, cursor, cachedWriter);
        }
        memcpy((capacity ? capacity : revision) + cursor | 0, packetFrame + 5216 | 0, count);
        writeI32(cachedWriter, value, 4);
        entry = entry + 1 | 0;
      } while (+(entry !== 8));
      length = readU8(field, 148);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32269 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      count = capacity ? storedI32269 : 4096;
      const savedCount35 = count;
      entity = value + 1 | 0;
      if (+(savedCount35 >>> 0 < entity >>> 0)) {
        [count, capacity, offset, cursor] = growByteWriter(count, entity, capacity, revision, value, cachedWriter);
      }
      writeU8((capacity ? capacity : revision) + value | 0, length);
      writeI32(cachedWriter, entity, 4);
      cursor = readU8(field, 149);
      if (readI32(cachedWriter)) {
        writeI32(cachedWriter, 0);
      }
      const storedI32270 = readI32(cachedWriter, 8);
      capacity = readI32(cachedWriter, 12);
      count = capacity ? storedI32270 : 4096;
      const savedCount36 = count;
      length = value + 2 | 0;
      if (+(savedCount36 >>> 0 < length >>> 0)) {
        [count, capacity, offset, value] = growByteWriter(count, length, capacity, revision, entity, cachedWriter);
      }
      writeU8((capacity ? capacity : revision) + entity | 0, cursor);
      writeI32(cachedWriter, length, 4);
    }
  }
  /** Grow a byte buffer with already known inline storage and live prefix. */  function growByteWriter(capacity, required, pointer, inlineStorage, length, writer) {
    do {
      capacity <<= 1;
    } while (capacity >>> 0 < required >>> 0);
    const previous = pointer || inlineStorage;
    pointer = malloc(capacity);
    const copied = memcpy(pointer, previous, length);
    if (previous !== inlineStorage) free(previous);
    writeI32(writer, copied, 12);
    writeI32(writer, capacity, 8);
    return [ capacity, pointer, previous, copied ];
  }
  function growEmbeddedByteWriter(capacity, required, pointer, writer, length) {
    const inlineStorage = writer + 16 | 0;
    const [nextCapacity, nextPointer, previous, copied] = growByteWriter(capacity, required, pointer, inlineStorage, length, writer);
    return [ nextCapacity, nextPointer, inlineStorage, previous, copied ];
  }
  const growByteWriterReverseRelease = growByteWriter;
  function growBeforeComparisonWriter(capacity, required, pointer, length) {
    return growByteWriter(capacity, required, pointer, 8551056, length, 8551040);
  }
  function growAfterComparisonWriter(capacity, required, pointer, length) {
    return growByteWriter(capacity, required, pointer, 8555168, length, 8555152);
  }
  function growSnapshotRecordWriter(capacity, required, pointer, inlineStorage, length, frame) {
    return growByteWriter(capacity, required, pointer, inlineStorage, length, frame + 24 | 0);
  }
  function growCachedComponentWriter(capacity, required, pointer, inlineStorage, length, writer) {
    do {
      capacity <<= 1;
    } while (capacity >>> 0 < required >>> 0);
    const previous = pointer || inlineStorage;
    pointer = malloc(capacity);
    const copied = memcpy(pointer, previous, length);
    if (previous !== inlineStorage) free(previous);
    writeI32(writer, capacity, 8);
    writeI32(writer, copied, 12);
    return [ capacity, pointer, previous, copied ];
  }
  /** Preserve the original unrolled, left-to-right f32 modifier multiplication. */  function multiplyBehaviorModifiers(product, cursor, end) {
    let behavior;
    do {
      for (let offset = 0; offset < 16; offset += 4) {
        behavior = readI32(cursor, offset);
        const factor = runtime.indirect({
          parameters: [ "i32" ],
          results: [ "f32" ]
        }, readI32(readI32(behavior), 20), behavior);
        product = f32(product * factor);
      }
      cursor = cursor + 16 | 0;
    } while (cursor !== end);
    return [ product, cursor, behavior ];
  }
  function writeVarUintAt(scratch, length, value, offset) {
    let continuation;
    do {
      continuation = +(value >>> 0 > 127);
      writeU8((scratch + offset | 0) + length | 0, value & 127 | continuation << 7);
      length = length + 1 | 0;
      value >>>= 7;
    } while (continuation);
    return [ length, value, continuation ];
  }
  function writeTickVarUint(scratch, length, value) {
    return writeVarUintAt(scratch, length, value, 24);
  }
  function writePacketVarUint(scratch, length, value) {
    return writeVarUintAt(scratch, length, value, 5216);
  }
  function writeComparisonVarUint(scratch, length, value) {
    return writeVarUintAt(scratch, length, value, 208);
  }
  return Object.freeze({
    654: spServerThink
  });
}
