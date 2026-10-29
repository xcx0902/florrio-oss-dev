# Catalog semantics

## Inputs

- `schema/catalogs/petals.json` — 39 petal records.
- `schema/catalogs/entities.json` — 23 entity definitions and drop type ids.
- `schema/catalogs/spawn-rules.json` — 20 spawn rules.
- `schema/catalogs/petal-combat.json` — derived combat stats.
- `schema/catalogs/drop-chances.json` — finalized per-entity drop probabilities.

`tools/gen-contracts.mjs` turns these into the C++/TS views. The JSON files are
the source; generated headers must not be hand-edited. Historical extraction
recipes and probe transcripts are in `archive/`.

## Petals

39 records of 52 bytes.

| Offset | Field | Type | Confidence |
| ---: | --- | --- | --- |
| 0 | name pointer | u32 | high |
| 4 | description count | u32 | high |
| 8 | description pointers | u32[4] | high |
| 24 | rarity index | u32 | high |
| 28 | recharge milliseconds | f32 | high |
| 32 | instances per slot | u32 | high |
| 36 | radius | f32 | high |
| 40 | flag40 | u8 | medium |
| 41 | flag41 | u8 | medium |
| 44 | field44 | f32 | medium |
| 48 | factory table index | u32 | high |

Names are not unique (`Rose` at 6/15/24, `Cactus` at 13/21/33, `Basic` at 1/35).
Type id is the identity; name is display data.

## Entity definitions

23 records of 116 bytes.

| Offset | Field | Type | Confidence |
| ---: | --- | --- | --- |
| 0 | name pointer | u32 | high |
| 4 | description count | u32 | high |
| 8 | description pointers | u32[4] | high |
| 24 | rarity | u32 | high |
| 28 | scale | f32 | high |
| 32 | component-pair count | u8 | high |
| 36 | component pairs | 8 × {u8 slot, u8 flags} | high |
| 100 | type id | u32 | high |
| 104 | zero | u32 | high |
| 108 | field108 | u8 | high |
| 109 | field109 | u8 | high |
| 110 | field110 | u8 | high |
| 112 | secondary scale | f32 | high |

`petalTypeIds` is the low u32 of each component pair at `36 + i*8`.

## Spawn rules

20 records of 16 bytes.

| Offset | Field | Type | Confidence |
| ---: | --- | --- | --- |
| 0 | weight | f32 | high |
| 4 | region count | u8 | high |
| 5 | region ids | u8[8] | high |
| 13 | entity type id | u8 | high |
| 14 | padding | u8[2] | high |

## Verification

```sh
npm run schema:generate
ctest --test-dir build/engine -R engine_schema_contracts
```

The original-layout probe and its frozen record are archived. The active native
test checks YAML against the current compiler; it does not read the archived
binary or its decoded bytes.

## Edge cases

- Duplicate display names are preserved; do not collapse by name.
- Slot 22 (Spider) exists in the table but the catalog lookup rejects slot > 21.
- Unknown offsets keep offset names (`field44`, `field108`, …), not invented
  product names.

## Drop table

`engine/include/engine/catalog/drop_table.hpp` mirrors each entity definition's
`petalTypeIds` (23 rows). The finalized probabilities are in
`schema/catalogs/drop-chances.json` and generated as
`engine/include/engine/catalog/drop_chances.hpp`. The runtime reads the table;
the historical derivation tool is archived. See [loot.md](loot.md) for the
selection algorithm.

## Petal combat

`schema/catalogs/petal-combat.json` holds each petal's collision radius, damage,
health, orbit profile and attack/defend radii. `tools/gen-contracts.mjs` emits
the C++ view. See [petals.md](petals.md) for the behavior.

## Petal defaults

`engine/include/engine/catalog/petal_defaults.hpp` mirrors all 39 petal catalog
rows (type id, radius, recharge, instances per slot, header flags). It is data
only; petal behavior remains in the petal domain.
