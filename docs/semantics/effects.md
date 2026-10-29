# Timed effects and special petal callbacks

Status: the poison / healing-suppression / slow families, the Peas split/egg
hatch/Web slow callbacks, the shared effect payload, the area-target spatial
pass and the deferred Peas launch are implemented as domain effects. Behavior
families are represented by typed `EffectPayload` objects rather than
executable vtables.

## Effect record

`Effect` carries `{type, source, remaining_ms, intensity, active, payload}`; an
entity has eight slots. `payload` is a reference-counted `EffectPayload`; area
effects install the same payload pointer in every tracked target, with
unique-owner transfer. `World::destroy` walks the dead entity's
eight slots and decrements every live payload before releasing the slot, so a
shared area effect is not kept alive by a corpse waiting for slot reuse;
`test_effect_payload_released_on_destroy` asserts the refcount drop. The tick
publishes three effect flags:

| Bit | Meaning | Source family |
| --- | --- | --- |
| 1 | damage over time | poison |
| 2 | healing suppression | Dandelion |
| 4 | movement slow | Honey / Web |

`update_effects` applies only the strongest poison once per entity:

```
amount = intensity * min(dt, remaining_before) * 0.001
```

`slow_multiplier` starts at `1.0` and multiplies every active slow effect's
intensity; it does not take the minimum. Behaviors that produce velocity (player
controls and the AI behavior path) apply that multiplier. `integrate_movement`
does **not** scale acceleration or velocity by it. `heal_entity(world, target,
amount)` refuses to heal while a heal-block effect is active.

## Petal callbacks

| Petal type | Callback | Effect |
| ---: | --- | --- |
| 8 Iris | slot 4 | poison `20000/3` ms |
| 12 Peas R3 | slot 4 | poison `8000/9` ms |
| 20 Dandelion | slot 4 | heal block 10000 ms |
| 21 Cactus R3 | slot 4 | poison `20000/3` ms |
| 21 Cactus R3 | slot 5 (incoming) | poison `4444.444444444444` ms |
| 29/30 Web | slot 6 | slow 0.25 while the web area is attached |
| 31 Honey | slot 4 | slow 0.5 for 4000 ms |
| 34 Peas R4 | slot 4 | poison `16000/9` ms |

Poison intensity is the petal's contact damage, so the duration is the
distinguishing parameter. The `500 ms` `behavior_cooldown_ms` gate prevents
multiple hits from the same behavior in one window.

Special behaviors:

- Peas 11/12/34: on the first eligible hit, spawn four temporary children at
  `sqrt(72)` units around the parent, consume the parent, give children a
  1000 ms lifetime, and queue a deferred radial launch one millisecond later.
  The launch advances the phase by `2π/count` per child and adds `1.4` to the
  child position plus `0.6` to its velocity along the current angle.
- Egg 22/23: hatch after 1000 / 2500 ms into a Soldier Ant (9) / Beetle (12);
  the petal is consumed.
- Web 29/30: apply the slow payload, spawn the tag entity at the hit position,
  and leave the parent on its cooldown. The tag is `kProjectile` with type
  29/30, collision radius 50, health/max-health 5, `physics_flag50`, a score
  component (`has_score_component`, epoch = tick+1, value 0), the tag component
  (`has_tag_component`, `entity_flags |= 8`), an effect area
  (`has_effect_area`, `world_flags |= 128`), packet epochs `tick+1`, and a
  12000 ms lifetime. It owns a shared slow payload with radius 50, intensity
  0.25 and infinite duration, so contact with the tag applies the same slow as
  the Web area. The area link removes the effect when the target leaves; the
  effect itself has no timer expiry.

## Area effects

`World::replace_area_effect(owner, scale, payload)` stores the float32 scale,
replaces the payload pointer in every current target's effect vector, transfers
ownership, and unlinks all targets when the payload is cleared.
`World::update_area_effects()` performs the area-target pass:

1. expired payloads are cleared and their target links removed;
2. dead targets are pruned and detached;
3. a square query `owner ± scale` collects candidates through the quadtree;
4. candidates and the previous target list are sorted by handle, diffed, and
   the payload is attached/detached exactly once per changed target;
5. the target handle list is rebuilt.

`add_area_effect` creates a payload with type/intensity/duration/source and
installs it. `update_effects` advances each shared payload once per tick (not
once per target) and mirrors the remaining lifetime into every target slot.

## Deferred callbacks

`World::schedule_deferred_launch(due_ms, phase, children)` stores a deferred
launch entry. `World::run_deferred_launches(now)`
executes due entries, applies the radial impulse, and removes them. The tick
runs it in the timed-entity/AI phase, before active damage effects.

## Open

- dispatch for future effect families beyond the typed payload kinds;
- exact poison intensity for effect sources that do not use contact damage;
- arbitrary deferred-callback payloads beyond the Peas closure.
