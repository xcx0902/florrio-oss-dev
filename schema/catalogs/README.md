# Catalogs

Product catalog inputs, compiled by `tools/generate.mjs` into C++ and TypeScript
views. Runtime code never parses these files directly.

| File                         | Count | Owns                                                                                       |
| ---------------------------- | ----: | ------------------------------------------------------------------------------------------ |
| `rarities.json`              |     8 | ordered rarity indexes, stable symbols and display names                                   |
| `petals.json`                |    39 | stable symbol, identity, descriptions, rarity, recharge, instances, label size/orbit flags |
| `petal-combat.json`          |    39 | draw/collision radius, damage, health, behavior + heal amount, orbit profile               |
| `entities.json`              |    23 | stable symbol, identity, scale, droppable petal ids, drop alias/weight, draw count         |
| `spawn-rules.json`           |    20 | weighted spawn bands                                                                       |
| `entity-spawn-defaults.json` |    19 | fixed spawn defaults; dynamic species keep their domain formulas                           |
| `strings.json`               |    99 | deduplicated names and descriptions                                                        |
| `drop-rules.json`            |     1 | unequal band areas, petal drop mass, summoned children and convergence thresholds          |
| `state-flags.json`           |     6 | shared entity/world/activity/expression/input/variant bit assignments                      |
| `loadout.json`               |     1 | slot/instance capacities, unlock tiers and rarity experience                               |
| `gallery-overrides.json`     |     — | only reasoned display differences from derived runtime drops                               |

`drop-chances.json` is a generated output, not an input. Rarity/recharge/
instance counts are joined from `petals.json`; they are not duplicated in
`petal-combat.json`. `ids.hpp`/`catalog-ids.ts` are the only C++/TypeScript
identity enums; `state_flag_bits.hpp`/`state-flags.ts` are the only copies of
the flag bits; `loadout_rules.hpp`/`loadout.ts` own slot capacities and unlock
tiers. Display-name changes do not change a `symbol`. `petals.ts` uses the definition label size for UI labels and
the collision radius for world collision; a legitimate zero is preserved.

Validation (all performed before writing):

- petal and entity type ids are unique `0..255` publishable keys (stored as
  uint16, serialized as one byte in snapshots/loadout); sparse ids are legal;
  ids above 255 are rejected until a protocol-width change;
- every petal/entity symbol is a non-empty PascalCase identifier, unique in its
  domain, and not a C++/TypeScript keyword (case-insensitive collisions are
  rejected);
- every petal/entity/drop/spawn/children reference exists;
- drop aliases are acyclic and do not name themselves;
- floats are finite and numeric thresholds are in range;
- every gallery override targets a real entity;
- every `CHANGELOG.md` release has notes and a valid date-like label.

```sh
npm run schema:generate
npm run schema:check
```

Old catalog extractors, layouts and decoded evidence are archived.
