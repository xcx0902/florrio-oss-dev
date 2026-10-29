# Schema

`schema/` is the single source of truth for byte layouts, protocol messages and
game catalogs. Code in `engine/src` and `client/src` must not contain raw offsets;
it uses generated accessors from `engine/include/engine/schema/generated.hpp` and
`client/src/schema/generated.ts`.

| Path | Purpose |
| --- | --- |
| `protocol.yaml` | worker messages, input commands, output packets, snapshot/event framing |
| `layout/*.yaml` | World, EntitySlot, EntityDefinition, PetalDefinition, ComponentPool, QuadTreeNode, OutputQueue globals |
| `catalogs/*.json` | 39 petals, 23 entity definitions, 20 spawn rules, 99 strings |
| `generated/contracts.json` | machine-readable struct sizes/offsets/globals |
| `generated/layout-probe.json` | decoded original-server tables and mismatch report |

`protocol.yaml:output.snapshot.fieldComponents` records the recovered
field -> component/offset projection: species field 2 -> constructor 491 +8,
kind field 26 -> 491 +9, health field 53 -> 458 +8 and maximum field 55 ->
458 +12. Field 26 is a documented transitional domain extension; the original
species id remains field 2.

## Regenerate

```sh
node tools/split-catalogs.mjs      # source/semantic/server-catalogs.json -> catalogs/*.json
node tools/gen-contracts.mjs       # YAML -> C++ / TS / Markdown
node tools/layout-probe.mjs        # original wasm -> generated/layout-probe.json
```

`layout-probe` must report zero mismatches for petals, entities and spawn rules
before a layout change is accepted.

## Confidence

Every field has a `confidence` value:

- `high`: directly observed in the original wasm or recovered source, and
  cross-checked by a probe or oracle test;
- `medium`: strongly inferred from control flow, with at least one probe;
- `low`: hypothesis; do not use in production code until confirmed.

Unknown fields are represented as `_padding_0x...` in generated structs. Do not
invent names for them.
