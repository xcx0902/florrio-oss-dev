# October 30, 2022 catalog and original tooltip evidence

`catalog.json` (`20221030-w3.2`) is the authoritative simulation input;
`server/catalog/generated.hpp` is its deterministic C++ projection. It implements
12 kinds of petals and 12 kinds of mobs across six rarities. The complete identity
registry has 46 petal rows (None plus 45 nonempty kinds) and 35 mob IDs.

- [Full tooltip inventory](../../../docs/client-tooltips-20221030.md): every original petal/mob ID, all six rarities, descriptions, all displayed stats, cooldowns, orbit counts and complete mob/petal rarity drop matrices.
- [client-tooltips.json](client-tooltips.json): 480 variants with verbatim lines, exact formatter f32 arguments, health ranges, displayed poison rates, constructor/virtual-function locators, cached gallery text, 210 drop panels, 782 percentage labels and 2160 calculated candidate combinations including hidden/unavailable outcomes.
- [client-tooltip-corrections.json](client-tooltip-corrections.json): 341 field changes from w3.1, retaining before/after values, including the four current drop probabilities.
- [Adopted behavior and uncertainty](../../../docs/catalog-20221030.md): implemented rules, remaining semantic gaps, APIs and tests.

The old W0 hand-written constructor slots were shifted; Basic's alleged 7/5 was
Light. The corrected probe reads registry `+20` and confirms Damage/Health through
the original tooltip. True Basic is 10/10. Old W0 reports remain unchanged audit
inputs; their misassigned constructor numbers are superseded by the full record.

Original build: `b632797f0ee487dd99df460b13bde6d7ce5c9773`.
Wasm SHA-256: `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0`.
No modern wiki or later schema/catalog numbers are imported.

```sh
node wave/tools/reference/tooltips.mjs --snapshot wave-reference/20221030 --check
python3 wave/tools/reference/tooltip-docs.py --check
python3 wave/tools/catalog/generate.py --check --self-test
python3 wave/tools/catalog/generate.py --check --verify-evidence \
  --evidence-root . --snapshot wave-reference/20221030
```

The tooltip check re-executes all constructors/builders and additionally compares
the 480 text records, 210 drop panels and getters with unmodified original Wasm. An independent
mob probe checks 442 displayed numeric fields against recovered formulas and the
original formatter. The fixed JS/Wasm are never rewritten. To regenerate evidence,
omit `--check`; to regenerate the Markdown inventory run `tooltip-docs.py`.
Changes to evidence require updating its pinned hashes and regenerating the catalog.

`evidence-inputs.json` is itself hash-pinned in the generator and pins the full
tooltip record. Ordinary checks need only this package, including
`client-tooltips.json`; no original Wasm, reports or wiki cache is needed. The
standalone source directory can have any name. `--self-test` rejects 30 malformed
catalogs and checks portability, stale output and evidence integrity.
Explicit `--verify-evidence` requires an evidence root, verifies all 17 original
source hashes and both snapshot files, and never silently skips a missing file.

Displayed stats and cooldown getters are observations; applying them in the
simulation is explicit adoption. `provenance.adoptedFields` enumerates those
fields. Peas/Grapes HP divided by four, Rock HP lower-bound selection and distance
conversion `/5` remain policies. Exact client drop calculations are adopted for
the four existing rules; the complete multi-petal tables are recorded for W3
expansion. The panels do not establish historical server RNG, roll independence
or allocation. XP, AI, attack timing, poison duration and the XP curve are not
established by tooltip. Honey's
current movement slow differs from the original rotation/attack-frequency text;
Leaf still integrates healing per tick. These gaps are recorded per row.

Only implemented effects are equippable in the simulation. The remaining 33
petals have complete numerical evidence but still need effects and fixtures.
None remains an empty slot. Inventory/reserve identities have separate app/store
policies. Craft display rates 60/40/20/10/3%, loss range 1–4 and slot unlocks at
15/30/45 retain their original evidence; server parity, equal loss weights,
`100*(level-1)^2` XP and drop selection/allocation remain reconstruction.
