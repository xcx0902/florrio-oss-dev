# Addendum: 02/03 continuation archive

This append-only archive records the files retired while completing goals 02
and 03 after the early `01-archive` step (`08e6b5b`). It does **not** modify
`archive/tree/` or `archive/inventory.json`; those remain the byte-for-byte
record of the original migration.

## Why this addendum exists

`01-archive-and-disable` was executed before the remaining product regressions
and schema work were finished. Some original-layout inputs, probes and duplicate
hand-written catalog tables therefore stayed active. This addendum retires them
only after their product replacements and tests exist:

- original memory layouts and their generated C++/TS views;
- the CMake schema probe and its checker test;
- the monolithic generator that emitted both layouts and product catalogs;
- the hand-written `petal_defaults.hpp` and `drop_table.hpp` duplicates;
- the redundant `client-gallery.json` and stale `report.json`;
- the independent catalog/menu generator entry points.

## Inventory

[`inventory.json`](inventory.json) lists each moved file with its original
path, archive path, byte size and SHA-256. Every entry has `origin: moved`;
nothing here is a build, test, generation, runtime or delivery input.

## Product replacement map

| Retired input | Product replacement |
| --- | --- |
| `schema/layout/*.yaml`, `engine/include/engine/schema/generated.hpp`, `client/src/schema/generated.ts` | `schema/protocol.yaml`, `schema/generated/protocol-contracts.json`, `engine/src/core/contracts.cpp` |
| `schema/generated/contracts.json` | `schema/generated/protocol-contracts.json` |
| `tools/check-schema-layouts.mjs`, `tools/gen-contracts.mjs` | `npm run schema:check`, `tools/generate.mjs`, `tools/schema/*` |
| `engine/tests/unit/test_schema_contracts*` | `tests/unit/protocol-contracts.test.mjs`, `tests/unit/schema-generation.test.mjs` |
| `engine/include/engine/catalog/petal_defaults.hpp` | `Catalog::petals()` / generated `PetalCatalogEntry` |
| `engine/include/engine/catalog/drop_table.hpp` | `Catalog::drop_table()` from derived `drop-chances.json` |
| `schema/catalogs/client-gallery.json` | derived drop chances plus `schema/catalogs/gallery-overrides.json` |
| `tools/gen-client-petals.mjs`, `tools/gen-mob-gallery.mjs`, `tools/gen-menu-content.mjs` | `tools/generate.mjs` and `tools/schema/*` |

## Known migration-map correction

The original `archive/migration-map.json` names
`schema/content/changelog.json` as the menu replacement. No such file was or is
created. The implemented single human source is `CHANGELOG.md`, and its derived
product output is `client/src/schema/menu-content.ts`. This addendum is the
recorded correction; do not add a second menu content source.
