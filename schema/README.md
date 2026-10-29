# Schema

`schema/` is the single source of truth for byte layouts, protocol messages and
game catalogs. Code in `engine/src` and `client/src` must not contain raw offsets;
it uses generated accessors from `engine/include/engine/schema/generated.hpp` and
`client/src/schema/generated.ts`.

| Path | Purpose |
| --- | --- |
| `protocol.yaml` | worker messages, input commands, output packets, snapshot/event framing and the packet XOR key |
| `layout/*.yaml` | World, EntitySlot, EntityDefinition, PetalDefinition, ComponentPool, QuadTreeNode, OutputQueue globals |
| `catalogs/*.json` | petals, entity definitions, spawn rules, strings, drops, mob gallery |
| `generated/contracts.json` | machine-readable struct sizes/offsets/globals and compiled protocol |

`protocol.yaml:output.snapshot.fieldComponents` records the field -> component
projection: species field 2 -> constructor 491 +8, kind field 26 -> 491 +9,
health field 53 -> 458 +8 and maximum field 55 -> 458 +12. Field 26 is a
documented domain extension; the catalog species id remains field 2.

The 256-byte packet XOR key is product protocol data. `transport.json` records it,
and `tools/gen-contracts.mjs` emits it to both the C++ and TypeScript accessors.

## Regenerate and check

```sh
npm run schema:generate        # YAML + catalogs -> C++ / TS / Markdown
ctest --test-dir build/engine -R engine_schema_contracts
npm run gen:client-petals      # schema/catalogs/petals.json -> client/src/schema/petals.ts
npm run gen:mob-gallery        # schema/catalogs/client-gallery.json -> client/src/schema/mob-gallery.ts
npm run gen:menu-content       # CHANGELOG.md -> client/src/schema/menu-content.ts
```

`generated/contracts.json` is committed so a fresh native build does not need
Node. The original-layout probe and its frozen record are archived; the active
native schema test compares YAML with the compiler only.

Every protocol/layout field carries a `confidence` value:

- `high`: directly observed and cross-checked;
- `medium`: strongly inferred from control flow with at least one probe;
- `low`: hypothesis; do not use in production code until confirmed.

Unknown struct fields are represented as `_padding_0x...` in generated structs.
Do not invent names for them.

Historical source tables, WAT offsets and the original layout probe recipe live
under [`../archive/`](../archive/README.md).
