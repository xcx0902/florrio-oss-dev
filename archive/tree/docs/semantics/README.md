# Semantics

Feature specifications for the C++/TS reconstruction. Each document follows the
template in `goal.md` §12:

1. inputs, state, formulas, edge cases, randomness and timing;
2. evidence: function ids, WAT ranges, decompiler views, probe results;
3. schema fields and confidence;
4. tests and parity scenarios.

Current documents:

- [catalog.md](catalog.md) — petals, entity definitions and spawn rules.
- [world.md](world.md) — World/EntitySlot/PetalDefinition layout and known globals.
- [spawn.md](spawn.md) — 8 spawn bands, weights, server RNG and weighted choice.
- [input.md](input.md) — packet XOR/varint framing and fixed-size command layouts.
- [collision.md](collision.md) — spawn rect, physics AABB/radius, quadtree order, cached bounds and flag rules.
- [snapshot.md](snapshot.md) — domain live mask entry, full field framing, events 9/11/14, dense component-pointer presence and health/kind projection.
- [player.md](player.md) — defaults, spawn bands, profile/level and loadout.
- [petals.md](petals.md) — combat stats, orbit profiles, recharge and pickup.
- [damage.md](damage.md) — contact damage and the death domain.
- [loot.md](loot.md) — derived drop chances, retention and pickup lifetimes.
- [ai.md](ai.md) — target eligibility, local alert propagation, family profiles, pickup recipient, quadtree order, cached bounds and AI movement.
- [effects.md](effects.md) — poison, heal suppression, slow, special petal callbacks, shared payloads, area effects and deferred Peas launch.
- [attribution.md](attribution.md) — hit epoch/refcount, known gate, killer identity, death score/level, child recursion, pickup list and legendary dedup.
- [loadout.md](loadout.md) — active-slot restore, exact handle/pending/timer/epoch layout, slot type changes, equipped-petal creation and backpack pickup overflow.
- [tick.md](tick.md) — domain tick order, evidence and open phases.

Planned:

- `broadcast.md` (event 9/11/14 packet-cache invalidation and chat queue).
