# Petals

## Catalog combat statistics

`tools/derive-petal-combat.mjs` reads the 39 catalog records and resolves each
record's slot-2 initializer. The slot-2 body writes:

- collision radius to physics +8;
- contact damage to physics +44;
- maximum health to health +12.

The resulting table is `schema/catalogs/petal-combat.json` and the generated
`engine/include/engine/catalog/petal_combat.hpp`. Examples:

| Petal | Collision radius | Damage | Health | Orbit |
| --- | ---: | ---: | ---: | --- |
| Basic (1) | 10 | 10 | 10 | basic 130/40 |
| Fast (2) | 7 | 8 | 5 | fast 145/40 |
| Heavy (3) | 12 | 20 | 20 | heavy 120/50 |
| Rock (4) | 14 | 10 | 90 | rock 110/55 |
| Stinger (7) | 7 | 35 | 8 | basic 130/40 |
| Heaviest (26) | 16 | 10 | 200 | heaviest 100/65 |
| Corn (38) | 10 | 1 | 2000 | basic 130/40 |

The catalog `radius` (14 or 11/12) remains the draw radius. `Entity` carries
both `radius` and `collision_radius` so rendering and collision can differ.

## Orbit and attack

`orbit_profile` comes from the catalog slot-3 body: Basic, Fast, Heavy, Rock,
Iris (140/40) and Heaviest (100/65). Wing uses its wave track
`65 + 10*sin`, `140 + 50*sin`, `40 + 5*sin`. Input bit 0 (attack) wins over bit
1 (defend).

Rose (types 6/15/24) also carries its slot-3 function index 665/682/723. While
equipped and the owner is damaged but alive, a one-second timer increments a
ten-step state; at step 10 the petal heals 10/22/3.5 health and takes one damage.
This matches the recovered `roseOrbit` body. It does not yet model the original
flower-ancestor and healing-veto lists.

`spawn_petal` sets the orbit profile, orbit function, owner, slot and instance on the entity. Original 397 places the new petal at the owner's world position, not at the orbit target; the orbit spring then pulls it outward. Multi-instance petals use `instance * 2π / instancesPerSlot` around the slot's base angle; catalog `flag41`/`field44` petals (Rose 24) add a second ring at `angle * 1.1 + instance * 2π / count` with radius `field44` (11).
`update_petal_orbits` recomputes the radius from the current input buttons each
tick and accelerates the petal toward the target using the recovered
`0.001111...` distance factor, 0.01..2 clamp, `dt * 0.007` acceleration.

## Recharge and cleanup

`PlayerLoadout` keeps one handle per instance (up to three). A destroyed petal
clears its handle and starts the catalog recharge timer; `refresh_loadout_petals`
respawns it when the timer expires. The loadout now uses the exact
`loadout + 296 + slot*36 + instance*12` handle array, `+584` pending bytes and
`+608` timers; the domain arrays preserve the same handle/pending/timer
semantics without the original allocator's byte-level intrusive-list nodes.

## Pickup

`collect_drops` uses the pickup radius 35 and the player collision radius 25.
A collected petal is equipped into the first free carried slot and mirrored to
the profile inventory. When every carried slot is occupied, the petal is pushed
into the 16-entry backpack FIFO; a full backpack leaves the drop in the world.
Original pickup flags/components and the full intrusive pickup list remain
separate.

## Special callbacks

Poison, healing suppression, slow, Peas split, Egg hatch and Web slow are
documented in [effects.md](effects.md). The domain callbacks run from
`resolve_contacts`; a 500 ms `behavior_cooldown_ms` gate replaces the original
`behavior+4` hit flag.
