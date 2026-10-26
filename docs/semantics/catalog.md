# Catalog semantics

## Inputs

- Original artifact: `web/sp_server.wasm`, SHA-256
  `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d`.
- Extracted data: `source/semantic/server-catalogs.json`.
- Cross-check: `source/semantic/client-catalogs.json`.

## Petals

39 records, 52 bytes each, base 8,545,792.

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

Names are not unique (`Rose` appears at 6/15/24, `Cactus` at 13/21/33,
`Basic` at 1/35). Type id is the identity; name is display data.

## Entity definitions

23 records, 116 bytes each, base 8,548,368. Slot 22 is built but unreachable
because the lookup rejects slot > 21.

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

`petalTypeIds` is the low u32 of each component pair at +36 + i*8.

## Spawn rules

20 records, 16 bytes each, base 8,547,824.

| Offset | Field | Type | Confidence |
| ---: | --- | --- | --- |
| 0 | weight | f32 | high |
| 4 | region count | u8 | high |
| 5 | region ids | u8[8] | high |
| 13 | entity type id | u8 | high |
| 14 | padding | u8[2] | high |

## Verification

```sh
node tools/split-catalogs.mjs
node tools/layout-probe.mjs
```

`layout-probe` decodes the pristine instance (`p()` + lazy initializer 103) and
compares every field, every description and every `bytesHex` with the split
catalogs. Current result: 39/39 petals, 23/23 entities, 20/20 spawn rules,
0 mismatches.

## Edge cases

- Duplicate display names are preserved; do not collapse by name.
- Slot 22 (Spider) exists but is unreachable through the original lookup.
- Unknown offsets keep offset names (`field44`, `field108`, …), not invented
  product names.


## Drop table

`engine/include/engine/catalog/drop_table.hpp` mirrors each entity
definition's `petalTypeIds` (23 rows). The finalized mutable probabilities are
derived by `tools/derive-drop-chances.mjs` into
`schema/catalogs/drop-chances.json` and generated as
`engine/include/engine/catalog/drop_chances.hpp`. The derivation is verified
against the original initializer: all 102 entries match exactly. See
`docs/semantics/loot.md` for the algorithm.

## Petal combat

`tools/derive-petal-combat.mjs` resolves each petal's slot-2 initializer and
writes `schema/catalogs/petal-combat.json` (collision radius, damage, health,
orbit profile, attack/defend radii). `tools/gen-contracts.mjs` emits the C++
view. See `docs/semantics/petals.md`.


## Petal defaults

`engine/include/engine/catalog/petal_defaults.hpp` mirrors all 39 petal
catalog rows (type id, radius, recharge, instances per slot, header flags).
It is data only; petal behavior remains in the petal domain.
