# Schema contract coverage

This document bounds the structural sign-off for goal §13.1. It does not claim
that every domain helper reproduces an original C++ object or that a schema
hypothesis becomes oracle evidence when its generated assertions compile.

## Enforced build and regression paths

- `engine/src/schema/contracts.cpp` includes `engine/schema/generated.hpp` in
  `engine_core` through `engine/CMakeLists.txt`. Its generated size/offset
  assertions are therefore compiler checks, rather than dormant header text.
- The same translation unit is in the explicit source list in
  `tools/build-engine-wasm.mjs`. A subsequent normal WASM build compiles the
  same assertions. Adding a file only to CMake would not cover that publisher.
- Native CMake builds `engine_schema_contracts_tests`. Test selectors are
  derived from the current layout YAML; the executable reports actual
  `sizeof`, `offsetof`, member width/type, standard-layout/trivial-copy traits,
  alignment and global constants. Expected numeric layout values are **not**
  embedded in these selectors.
- CTest `engine_schema_contracts` compares that compiler report with current
  YAML. A stale generated header cannot pass merely because its assertions
  agree with its own declarations. All declared layouts, including spatial,
  are checked for schema/compiler consistency. Global checks cover addresses;
  the generated address constants do not encode global payload types/counts.
- The same test decodes saved original catalog bytes at compiler-observed
  offsets: 39 petal definitions, 23 entity definitions and 20 spawn rules. It
  checks table bases, record strides/counts, recorded scalar fields, component
  pairs and region IDs. It also checks the saved World base/entity-array
  geometry. The saved probe is tied to the SHA-256 of the frozen server WASM.
  This reuses existing evidence; it does not run or rewrite the oracle/probe.
- CTest `engine_schema_contracts_checker` exercises rejection of stale sizes,
  offsets, widths/types, missing/extra/duplicate members and global addresses.
  It also checks that a packed view does not promote low-confidence evidence.
- Existing `npm run test:engine` and the main verification runner invoke CTest,
  so both native regressions participate in the existing acceptance path.

The native gate requires Node and the repository's installed `yaml` dependency
in addition to the C++20 compiler. It writes its selector include only into the
CMake build directory. Both tests otherwise read repository inputs without
regenerating contracts, reports or frozen fixtures.

For a focused native check (no WASM publication or full acceptance run):

```sh
cmake -S engine -B /tmp/florr-schema-native-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/florr-schema-native-build --target engine_schema_contracts_tests -j2
ctest --test-dir /tmp/florr-schema-native-build -R '^engine_schema_contracts' --output-on-failure
```

## Evidence boundary by layout

All ten current generated layout types have compiler/schema checks. The
evidence column below is deliberately narrower than that compiler coverage.
Source anchors are the `source.evidence` entries of the corresponding YAML.

| Layout | Source confidence and evidence covered here | Remaining boundary |
| --- | --- | --- |
| `PetalDefinition` | `petal.yaml`, high overall; saved original bytes for all 39 records, including selected medium-confidence raw fields | Numeric byte agreement does not independently name fields 40/41/44 or prove every factory's behavior. Pointer targets/unused description slots are not fully re-decoded from an original memory image. |
| `EntityDefinition` | `entity-definition.yaml`, high; saved original bytes for all 23 records, component-pair members and recorded scalar values | `typeId` is checked against the probe's raw `field100`; the label does not establish an original semantic type ID. Padding/unused slots are not assigned invented meanings. |
| `SpawnRule` | `common.yaml`, high document confidence; saved original bytes for all 20 records | Padding and runtime spawn selection are outside this layout test. |
| `ComponentPair` | `common.yaml`; nested slot/flags bytes from the original entity catalog | The other six bytes are retained as padding, not reverse-engineered fields. |
| `Vector`, `CacheEntry` | `common.yaml`; initialization/serializer evidence in its source references; sizes/declared fields compile | No new heap-vector or serialization-cache memory probe is performed here. Internal padding/names are not additional oracle findings. |
| `EntitySlot` | `entity.yaml`, medium overall; initialization evidence identifies the 496-byte stride, world pointer and handle. The saved probe checks the entity-array geometry and count of world-pointer-bearing slots | No full 496-byte live-record equality, all component payloads or object lifetime/allocator layout is claimed. The runtime domain `Entity` is a separate representation. |
| `World` | `world.yaml`, medium overall; saved initialization evidence checks base, entity-array offset/stride and 16,384 slots | The complete object size, all revision/cache/component offsets and every field value are schema/compiler consistency checks, not a new whole-World oracle comparison. |
| `ComponentPool` | `components.yaml`, medium overall; recovered pool manager evidence supports listed fields and chunk mechanics | Component-ID-to-stride mapping is explicitly incomplete. No new pool allocation/layout oracle is provided by this gate. |
| `QuadTreeNode` | `spatial.yaml`, **low**, explicitly states its field order is a hypothesis unconfirmed by a layout probe | Its 48-byte size, child offsets and vector placement are checked only as the current hypothesis. This is **not oracle-verified spatial memory layout**, and is not the domain `QuadTree::Node` ABI. |

`session.yaml` is a globals schema rather than an eleventh struct. Its nine
generated address constants are compared with YAML; three catalog table bases
also agree with the saved original probe. This does not newly verify all
output-queue payloads, RNG memory or session/configuration state.

The generated structs are currently packed byte views. YAML's declared
original allocation alignment and the compiler view's `alignof` are reported
separately; this gate does not claim that packed host objects reproduce
original allocation alignment. All schema pointer fields remain 32-bit values,
not host pointers. The generated declaration's own confidence comments may
omit inherited document confidence; YAML and the evidence boundary above are
authoritative for this coverage statement.

## Runtime domain representations

The contract translation unit additionally compiles scalar/handle-width and
entity-capacity checks: domain `f32` is binary32-sized, `EntityHandle` matches
the schema's 32-bit handle word, and the entity/revision/cache arrays match the
domain handle index capacity. IEEE-754 float/double and eight-bit bytes are
explicit prerequisites. It also includes the existing fixed-size checks for
`HitMessage` (4124 bytes) and `SimulationFrame` (1152 bytes).

Those two size checks do not establish full original object identity:
`HitMessage` adjusts payload storage for native/wasm vptr width and does not
claim the original polymorphic ABI; `SimulationFrame` retains scratch storage
whose complete original contents/roles remain open. Domain `World`, `Entity`,
component stores, orbit/AI/effect records, vectors, queues and tree nodes use
ordinary C++ containers and semantic fields. They are not raw overlays of
archived memory, and no `sizeof(domain object) == sizeof(original object)`
claim is made for those helpers. Their behavior belongs to their existing
simulation/protocol regression suites, not to this schema layout gate.

## Sign-off statement

The signable scope is: **the declared critical byte-layout contracts now enter
both native and WASM compilation; the native acceptance path checks current
YAML against compiler-observed layouts and reuses bounded, hash-identified
original catalog/initialization evidence.** It is not a sign-off that every
auxiliary struct mirrors original memory, that all schema fields are
independently oracle-probed, or that `spatial.yaml` is confirmed. Spatial
layout, incomplete pool mappings, full object/heap layouts, unspecified field
semantics and original allocation alignment remain outside that claim.
