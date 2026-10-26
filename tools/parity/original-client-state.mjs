/** Read-only archived-client lifecycle observation. These offsets belong to
 * the frozen oracle ABI, not to engine/client domain code. Constructor477
 * enables world rendering; constructor478 is the one local camera/controller.
 */
export function findOriginalClientState(probe) {
  if (!probe?.memory) return 0;
  const view = new DataView(probe.memory.buffer);
  const u = at => at > 0 && at + 4 <= view.byteLength ? view.getUint32(at, true) : 0;
  // The first packet can arrive one RAF before native1015 consumes it. A
  // sequence-like integer in an unrelated allocation is not a state address.
  // Require the world slot's self-pointer and the local controller's owner
  // slot to agree, as well as the actual ctor477/478 publications.
  for (let state = 4; state + 3500 < view.byteLength; state += 4) {
    const world = state + 2928;
    if (u(world) !== state || u(world + 16) < 16384 || (u(world + 16) & 16383) !== 0
      || view.getUint8(state + 1) !== 1 || u(state + 256) !== 1 || !u(state + 2276)) continue;
    const controller = u(u(state + 264)), owner = u(controller), packed = u(owner + 16);
    if (!controller || packed < 16384 || u(owner) !== state
      || owner !== state + 2928 + (packed & 16383) * 448 || u(owner + 72) !== controller) continue;
    return state;
  }
  return 0;
}

export function readOriginalClientState(probe, state) {
  if (!probe?.memory || !Number.isSafeInteger(state) || state <= 0) return null;
  const view = new DataView(probe.memory.buffer);
  const readable = (address, bytes) => Number.isSafeInteger(address) && address > 0 && address + bytes <= view.byteLength;
  const u32 = address => readable(address, 4) ? view.getUint32(address, true) : null;
  const byte = address => readable(address, 1) ? view.getUint8(address) : null;
  const f32 = address => readable(address, 4) ? view.getFloat32(address, true) : null;
  const count = u32(state + 256), entries = u32(state + 264);
  const controller = count === 1 && entries ? u32(entries) : null;
  const body = controller ? u32(controller + 144) : null;
  const handle = body ? u32(body + 16) : null;
  const bodyValid = !!body && Number.isSafeInteger(handle) && handle >= 16384
    && body === state + 2928 + (handle & 16383) * 448 && u32(body) === state;
  const transform = bodyValid ? u32(body + 120) : null;
  const health = bodyValid ? u32(body + 116) : null;
  const input = bodyValid ? u32(body + 144) : null;
  const player = bodyValid ? u32(body + 152) : null;
  const controlLinkValid = bodyValid && u32(body + 188) === u32(controller);
  const binding = controller && body === 0 ? 'unbound' : controlLinkValid ? 'bound' : 'invalid';
  const distances = [];
  if (bodyValid && transform) for (let index = 0; index < 16384; index++) {
    const entity = state + 2928 + index * 448;
    if (!readable(entity, 200)) break;
    const packed = u32(entity + 16), visual = u32(entity + 120), hp = u32(entity + 116);
    // Native original join: field23 (+176) is the spatial parent (zero for
    // equipped petals); field57 (+188) is attribution to the controlled body.
    if (!packed || (packed & 16383) !== index || !u32(entity + 76)
      || u32(entity + 188) !== body || !visual || !hp || f32(hp + 8) <= 0) continue;
    const values = [f32(visual + 64), f32(visual + 40), f32(transform + 64), f32(transform + 40)];
    if (!values.every(Number.isFinite)) continue;
    const distance = Math.hypot(values[0] - values[2], values[1] - values[3]);
    if (Number.isFinite(distance)) distances.push(distance);
  }
  distances.sort((a, b) => a - b);
  return { sequence: u32(state + 2276), activeCount: u32(state + 2296),
    worldReady: byte(state + 1) === 1,
    mainWorldAlpha: f32(7926696), controlLinkValid, binding,
    arenaWidth: f32(state + 900), arenaHeight: f32(state + 988), controllerCount: count,
    controller: controller ? { owner: u32(controller), scale: f32(controller + 136),
      cameraX: f32(controller + 16), cameraY: f32(controller + 112) } : null,
    player: bodyValid ? { handle, wireHandle: ((handle >>> 14) | (handle << 18)) >>> 0,
      x: transform ? f32(transform + 64) : null, y: transform ? f32(transform + 40) : null,
      health: health ? f32(health + 8) : null, maxHealth: health ? f32(health + 12) : null,
      effectFlags: input ? byte(input + 8) : null,
      visualFlags: u32(body + 136) ? byte(u32(body + 136) + 8) : null,
      petalDistance: distances.length ? distances[Math.floor(distances.length / 2)] : null,
      petalCount: distances.length,
      slots: player && readable(player + 40, 16) ? Array.from(new Uint8Array(view.buffer, player + 40, 16)) : null } : null,
    controlledBodyValid: bodyValid,
  };
}
