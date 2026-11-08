import assert from 'node:assert/strict';

// $63 creates these cached widgets. $1002 selects registry+192+4*rarity
// when the original gallery's drop-panel toggle is enabled.
export function readDropPanel(e, registry, rarity) {
  const heap = Buffer.from(e.Jf.buffer);
  const u32 = (p) => heap.readUInt32LE(p);
  const panel = u32(registry + 192 + rarity * 4);
  assert.ok(panel > 0, 'original drop panel exists');
  const groups = heap[panel + 16];
  assert.ok(groups <= 8, 'bounded drop panel groups');
  const result = [];
  for (let row = 0; row < groups; row++) {
    const group = panel + 24 + row * 4168;
    const count = heap[group];
    assert.ok(count <= 6, 'bounded drop panel rarities');
    for (let column = 0; column < count; column++) {
      const child = group + 8 + column * 648;
      const text = child + 500;
      const lengthFlag = heap.readInt8(text + 11);
      const start = lengthFlag < 0 ? u32(text) : text;
      const length = lengthFlag < 0 ? u32(text + 4) : lengthFlag;
      const display = heap.toString('utf8', start, start + length);
      assert.match(display, /^\d+(\.\d+)?%$/, 'original percentage label');
      result.push({ row, column, petalId: heap[child + 24], rarity: heap[child + 25], display });
    }
  }
  return result;
}

export function dropContract(e) {
  const heap = Buffer.from(e.Jf.buffer);
  return {
    builder: '$63',
    renderer: '$1002',
    pow: '$13',
    format: '$33',
    thresholdsAddress: 54040,
    thresholds: Array.from({ length: 5 }, (_, r) => heap.readDoubleLE(54040 + r * 8)),
    denominatorsAddress: 54080,
    denominators: Array.from({ length: 6 }, (_, r) => heap.readDoubleLE(54080 + r * 8)),
    formula:
      'effectiveMobRarity=max(1,mobRarity); lower=petalRarity>effectiveMobRarity ? 1 : thresholds[petalRarity]??1; upper=petalRarity<effectiveMobRarity && petalRarity<4 ? thresholds[petalRarity+1] : 1; probability=pow(1-coefficient+upper*coefficient,30000/denominators[mobRarity])-pow(1-coefficient+lower*coefficient,30000/denominators[mobRarity])',
    hiddenProbabilityBelow: 0.0001,
    minimumPetalRarity: 'u8(829709 + 24*petalId)',
    percent:
      'f64(f32(f32(probability)*100)); original %.5f/%.4f/%.3f/%.2f/%.1f%% formatter branches',
    scope:
      'Observed original gallery drop percentages and recovered client calculation, not historical server RNG, allocation or independent-roll verification. Probabilities for separate petal kinds must not be normalized into one exclusive distribution.',
  };
}

export function readDropRates(e, alloc, registry, mobRarity, contract) {
  const heap = Buffer.from(e.Jf.buffer);
  const panel = readDropPanel(e, registry, mobRarity);
  const candidates = [];
  const args = alloc(8);
  const output = alloc(32);
  try {
    const effective = Math.max(1, mobRarity);
    for (let i = 0; i < heap[registry + 32]; i++) {
      const petalId = heap[registry + 36 + 8 * i];
      const coefficient = heap.readFloatLE(registry + 40 + 8 * i);
      const minimumRarity = heap[829709 + 24 * petalId];
      for (let rarity = 0; rarity < 6; rarity++) {
        const observed = panel.find((d) => d.petalId === petalId && d.rarity === rarity);
        if (rarity < minimumRarity) {
          assert.equal(observed, undefined, 'unavailable rarity cannot appear in drop panel');
          candidates.push({
            petalId,
            rarity,
            probability: null,
            displayed: false,
            reason: 'below-minimum-petal-rarity',
          });
          continue;
        }
        const lower = rarity > effective ? 1 : (contract.thresholds[rarity] ?? 1);
        const upper = rarity < effective && rarity < 4 ? contract.thresholds[rarity + 1] : 1;
        const exponent = 30000 / contract.denominators[mobRarity];
        // Preserve the exact evaluation order in $63, using original Wasm pow.
        const none = 1 - coefficient;
        const probability =
          e.tooltipPow(upper * coefficient + none, exponent) -
          e.tooltipPow(lower * coefficient + none, exponent);
        assert.ok(probability >= 0 && probability <= 1, 'bounded original drop calculation');
        const displayed = probability >= contract.hiddenProbabilityBelow;
        assert.equal(Boolean(observed), displayed, 'drop panel coverage / hiding rule');
        const percent = Math.fround(Math.fround(probability) * 100);
        let display = null;
        if (displayed) {
          const format =
            percent < 0.0001
              ? 52118
              : percent < 0.001
                ? 52125
                : percent < 0.01
                  ? 52132
                  : percent < 0.1
                    ? 52139
                    : 52146;
          Buffer.from(e.Jf.buffer).writeDoubleLE(percent, args);
          e.tooltipFormat(output, 32, format, args);
          const current = Buffer.from(e.Jf.buffer);
          display = current.toString('utf8', output, current.indexOf(0, output));
          assert.equal(
            display,
            observed.display,
            'recovered probability matches original cached panel',
          );
        }
        candidates.push({
          petalId,
          rarity,
          probability,
          percent,
          display,
          displayed,
          ...(displayed
            ? {}
            : { reason: probability === 0 ? 'zero-probability' : 'below-panel-threshold' }),
        });
      }
    }
    assert.equal(
      candidates.filter((d) => d.displayed).length,
      panel.length,
      'every original drop entry recorded',
    );
    return { panel, candidates };
  } finally {
    e.Mf(args);
    e.Mf(output);
  }
}
