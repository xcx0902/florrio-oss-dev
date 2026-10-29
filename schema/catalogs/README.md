# Catalogs

Product catalog inputs. `tools/gen-contracts.mjs` compiles them into the C++
and TypeScript views; runtime code does not read these JSON files.

| File | Count | Contents |
| --- | ---: | --- |
| `petals.json` | 39 | petal names, descriptions, rarity, recharge and orbit constants |
| `entities.json` | 23 | entity definitions, component pairs, scale and spawn defaults |
| `spawn-rules.json` | 20 | weighted spawn bands and areas |
| `strings.json` | 99 | deduplicated names and descriptions |
| `petal-combat.json` | 39 | collision radius, contact damage, health and orbit profile |
| `drop-chances.json` | 23 | per-entity drop rows |
| `entity-spawn-defaults.json` | — | native spawn defaults |
| `client-gallery.json` | — | menu gallery rows |
| `report.json` | — | catalog counts and validation summary |

Validation:

- petal type ids are dense 0–38;
- entity type ids are dense 0–22;
- every spawn target exists;
- every drop petal type exists;
- string keys are unique and unique per catalog;
- every generated C++/TypeScript view matches the current JSON.

Regenerate and check:

```sh
npm run schema:generate
ctest --test-dir build/engine -R engine_schema_contracts
```

The original catalog extractor, layout probe and their decoded evidence are
archived. The active build reads only these product JSON files.
