# Semantics

Feature specifications for the C++/TS reconstruction. Each document describes
the product rule, its inputs, state, formulas, edge cases, randomness and
timing, then points to the relevant schema fields and tests.

Original function ids, WAT ranges, decompiler views and probe transcripts are
**not** part of these documents. They are preserved in the archived source
tables under [`../../archive/tree/docs/semantics/`](../../archive/tree/docs/semantics/)
for provenance.

## Documents

- [catalog.md](catalog.md) — petals, entity definitions, spawn rules and drop tables.
- [world.md](world.md) — world/entity/petal storage and runtime globals.
- [spawn.md](spawn.md) — spawn bands, weights, server RNG and weighted choice.
- [input.md](input.md) — packet XOR/varint framing and command layouts.
- [collision.md](collision.md) — spawn rect, physics AABB/radius, quadtree order, cached bounds and flag rules.
- [snapshot.md](snapshot.md) — sparse fields, dense component pointers, events 9/11/14 and health/kind projection.
- [player.md](player.md) — defaults, spawn bands, profile/level and loadout.
- [petals.md](petals.md) — combat stats, orbit profiles, recharge and pickup.
- [damage.md](damage.md) — contact damage and the death domain.
- [loot.md](loot.md) — drop chances, retention and pickup lifetimes.
- [ai.md](ai.md) — target eligibility, alert propagation, family profiles, pickup recipient, quadtree order, cached bounds and movement.
- [effects.md](effects.md) — poison, heal suppression, slow, special petal callbacks, shared payloads, area effects and deferred Peas launch.
- [attribution.md](attribution.md) — hit epoch/refcount, known gate, killer identity, death score/level, child recursion, pickup list and legendary dedup.
- [loadout.md](loadout.md) — active-slot restore, handle/pending/timer/epoch layout, slot type changes, equipped-petal creation and backpack pickup overflow.
- [broadcast.md](broadcast.md) — packet-cache invalidation, event opcodes and the chat queue.
- [tick.md](tick.md) — domain tick order and open phases.

## Writing rules

1. State the rule as implemented, not the history of how it was recovered.
2. Name schema fields rather than byte offsets where a generated accessor exists.
3. Mark unknown or open behaviour explicitly; do not present a hypothesis as a
   product contract.
4. Link a test or a source file for every non-trivial rule.
