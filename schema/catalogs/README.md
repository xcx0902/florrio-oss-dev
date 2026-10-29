# Catalogs

Product catalog inputs, compiled by `tools/generate.mjs` into C++ and TypeScript
views. Runtime code never parses these files directly.

| File | Count | Owns |
| --- | ---: | --- |
| `petals.json` | 39 | identity, names/descriptions, rarity, recharge, instances, label font size and orbit flags |
| `petal-combat.json` | 39 | draw radius, collision radius, damage, health, orbit profile/function |
| `entities.json` | 23 | identity, scale, droppable petal ids, drop alias and weight, component draw count |
| `spawn-rules.json` | 20 | weighted spawn bands |
| `entity-spawn-defaults.json` | 19 | fixed spawn defaults; dynamic species keep their domain formulas |
| `strings.json` | 99 | deduplicated names and descriptions |
| `drop-rules.json` | 1 | unequal band areas, petal drop mass, summoned children and convergence thresholds |
| `gallery-overrides.json` | — | only reasoned display differences from derived runtime drops |

`drop-chances.json` is a generated output, not an input. Rarity/recharge/
instance counts are joined from `petals.json`; they are not duplicated in
`petal-combat.json`. `petals.ts` uses the definition label size for UI labels and
the collision radius for world collision; a legitimate zero is preserved.

Validation (all performed before writing):

- petal ids are dense 0–38, entity ids dense 0–22;
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
