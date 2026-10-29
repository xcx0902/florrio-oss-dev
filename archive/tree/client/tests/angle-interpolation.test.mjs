import test from 'node:test';
import assert from 'node:assert/strict';
import { lerpAngle } from '../public/state/interpolation.js';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

test('angle interpolation preserves original705 endpoint normalization and nearest winding', async () => {
  let runtime, now = 100;
  const host = (address, signature, pointer) => {
    if (address === 150328) {
      const view = new DataView(runtime.memory.buffer);
      return view.getFloat64(pointer, true) % view.getFloat64(pointer + 8, true);
    }
    return address === 141250 ? 1 : now;
  };
  runtime = await loadOriginal('client', { functionIds: [368, 705], imports: { a: { a: host, c: host } } });
  const angle = runtime.call(368, 32), view = new DataView(runtime.memory.buffer);
  view.setUint8(angle + 16, 1); view.setFloat64(angle + 24, 100, true);
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pairs = [[0, 2 * Math.PI], [Math.PI, -Math.PI], [6.1, 0.2], [0.2, 6.1],
    [-100 * Math.PI, 51 * Math.PI], ...Array.from({ length: 256 }, () => [(random() - 0.5) * 100, (random() - 0.5) * 100])];
  for (const [from, to] of pairs) for (const elapsed of [0, 16, 50, 60, 100, 120]) {
    now = 100 + elapsed;
    view.setFloat64(angle, to, true); view.setFloat64(angle + 8, from, true);
    assert.equal(lerpAngle(from, to, elapsed * (1 / 120)), runtime.call(705, angle), `${from} → ${to} at ${elapsed}`);
  }
});
