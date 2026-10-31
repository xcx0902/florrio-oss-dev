#include "engine/core/perf.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/model/catalog.hpp"
#include <bit>
#include <cmath>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;
// f32(2*pi / 2^31) used by the original random-angle draws.
constexpr float kRandomAngleScale = 2.925836239953128e-09F;

/** Original 165 spawnAreaBlocked: players (world flag 32) inside radius+45 of
 * the candidate point reject the spawn. The original walks the quadtree with a
 * rectangle; a linear scan of the same bodies is equivalent for this predicate. */
bool spawn_area_blocked(const World& world, double x, double y) {
  return world.entities().with_ordered_slots([&](auto&& slots) {
  for (const auto& entity : slots) { PERF_ADD(visits, 1);
    if (!entity.active) continue;
    if ((entity.world_flags & 32U) == 0U) continue;
    const double dx = static_cast<double>(entity.position.x.value) - x;
    const double dy = static_cast<double>(entity.position.y.value) - y;
    const double minimum = static_cast<double>(entity.collision_radius.value) + 45.0;
    if (dx * dx + dy * dy < minimum * minimum) return true;
  }
  return false;
  });
}

void set_owner(World& world, EntityHandle child, EntityHandle parent) {
  Entity* entity = world.entities().get(child);
  if (entity == nullptr) return;
  entity->owner = parent.raw;
  entity->entity_flags |= 64U;
  entity->ai.owner = parent;
  attach_child(world, parent, child);
}

/** Original 4848/4852: 33 health-ratio thresholds and the species offset added
 * to 7. The entries were probed from the original data section byte-for-byte;
 * the species sequence is 7,8,7,8,8,8,9,9,9,9,8,9,9,9,9,8,9,9,10,9,... . */
constexpr std::array<std::uint32_t, 33> kAntHoleThresholdBits{{
  0x3f7851ecU, 0x3f733333U, 0x3f6e147bU, 0x3f666666U, 0x3f5eb852U,
  0x3f547ae1U, 0x3f4ccccdU, 0x3f451eb8U, 0x3f3ae148U, 0x3f2b851fU,
  0x3f2147aeU, 0x3f19999aU, 0x3f11eb85U, 0x3f07ae14U, 0x3ef0a3d7U,
  0x3ee147aeU, 0x3ed1eb85U, 0x3ec28f5cU, 0x3eb851ecU, 0x3ea3d70aU,
  0x3e99999aU, 0x3e8a3d71U, 0x3e75c28fU, 0x3e4ccccdU, 0x3e851eb8U,
  0x3e23d70aU, 0x3dcccccdU, 0x3d8f5c29U, 0x3d23d70aU, 0x3ca3d70aU,
  0x00000000U, 0x00000000U, 0x00000000U,
}};
constexpr std::array<std::uint8_t, 33> kAntHoleSpeciesOffsets{{
  0U, 1U, 0U, 1U, 1U, 1U, 2U, 2U, 2U, 2U, 1U, 2U, 2U, 2U, 2U, 1U, 2U,
  2U, 3U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U, 2U,
}};

void release_ant_hole_ants_impl(World& world) {
  // Original tick keeps the companion object at species+136 and visits the
  // world's dense component vector by index. The vector is append-only during
  // entity creation; the loop below never creates another ant hole.
  for (AntHoleRelease& release : world.ant_hole_releases()) {
    Entity* hole = world.entities().get(release.entity);
    if (hole == nullptr || !hole->active || hole->type_id != 11U) continue;
    while (release.release_index <= 32U) {
      const std::uint32_t index = release.release_index;
      const float ratio = hole->health.value / hole->max_health.value;
      const float threshold = std::bit_cast<float>(kAntHoleThresholdBits[index]);
      // Original: if (ratio > threshold) stop; otherwise spawn this entry.
      if (ratio > threshold) break;
      const std::uint16_t type = static_cast<std::uint16_t>(kAntHoleSpeciesOffsets[index] + 7U);
      const EntityHandle child = spawn_entity_from_defaults(
        world, EntityKind::kMob, type, hole->position);
      if (!child.valid()) break;
      // Original 654 draws one angle after spawnEntity and adds the 0.25-unit
      // scatter to the transform velocity (+40/+48), leaving the child at the
      // hole's position for its first frame.
      const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
      const f32 angle = f32(sample.value * kRandomAngleScale);
      set_owner(world, child, hole->handle);
      if (Entity* child_entity = world.entities().get(child)) {
        child_entity->velocity.x += static_cast<double>(
          f32(std::cos(static_cast<double>(angle.value)) * 0.25).value);
        child_entity->velocity.y += static_cast<double>(
          f32(std::sin(static_cast<double>(angle.value)) * 0.25).value);
      }
      ++release.release_index;
    }
  }
}

/** Original 144 draws one server-RNG value for every component pair of the
 * entity definition before dispatching the species initializer. The draws are
 * observable in the spawn sequence and must happen in this exact position.
 *
 * The attached loot list follows the **drop table order** (ascending chance in
 * `drop-chances.json`), not the definition's `petalTypeIds` order: a 40-seed
 * probe of function 144 matches table order 40/40 for Ladybug, Rock, Bee,
 * Hornet and Queen Ant, while definition order diverges on species whose two
 * orders differ (Ladybug 29/40, Rock 30/40, Bee 13/40, Hornet 23/40). Every
 * component consumes a draw regardless of whether it attaches loot. */
void consume_component_draws(World& world, Entity& entity) {
  const auto* definition = Catalog::instance().entity(entity.type_id);
  if (definition == nullptr) return;
  const auto* table = Catalog::instance().drop_table(entity.type_id);
  for (std::uint8_t index = 0; index < definition->componentDrawCount; ++index) {
    const f32 fraction = world.random().next_fraction();
    if (table == nullptr || table->drops == nullptr || index >= table->dropCount)
      continue;
    const auto& drop = table->drops[index];
    if (fraction.value < drop.chance
        && entity.loot_count < entity.loot_petals.size()) {
      entity.loot_petals[entity.loot_count++] = drop.petalTypeId;
    }
  }
}

void spawn_centipede_segments(World& world, EntityHandle head, bool evil, bool rare) {
  Entity* head_entity = world.entities().get(head);
  if (head_entity == nullptr) return;
  const std::uint16_t segment_type = evil ? 18U : 16U;
  const std::uint32_t count = rare ? 49U : 9U;
  // Original 205 keeps the step as a double constant (2*pi/20, 2*pi/100) and
  // accumulates it into the f32 angle: `angle = f32(angle + step)`. Rounding
  // the step itself to f32 first is observable from the sixth segment on
  // (1-4 f32 ULP in the spawn position), so the step must stay double.
  const double step = rare ? kTau / 100.0 : kTau / 20.0;
  // Original 205: f32(f32((random-1)>>>0) * f32(2*pi / 2^31)).
  const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
  f32 angle = f32(sample.value * kRandomAngleScale);
  EntityHandle previous = head;
  for (std::uint32_t index = 0; index < count; ++index) {
    Entity* previous_entity = world.entities().get(previous);
    if (previous_entity == nullptr) return;
    const double x = static_cast<double>(previous_entity->position.x.value)
      + std::cos(static_cast<double>(angle.value)) * 70.0;
    const double y = static_cast<double>(previous_entity->position.y.value)
      + std::sin(static_cast<double>(angle.value)) * 70.0;
    const double half_width = static_cast<double>(world.width().value) * 0.5;
    const double half_height = static_cast<double>(world.height().value) * 0.5;
    const f32 left = f32::from_double(35.0 - half_width);
    const f32 bottom = f32::from_double(35.0 - half_height);
    const f32 right = f32::from_double(half_width - 35.0);
    const f32 top = f32::from_double(half_height - 35.0);
    if (x < static_cast<double>(left.value) || y < static_cast<double>(bottom.value)
        || x > static_cast<double>(right.value) || y > static_cast<double>(top.value)) return;
    if (spawn_area_blocked(world, x, y)) return;
    const EntityHandle segment = spawn_entity_from_defaults(
      world, EntityKind::kMob, segment_type,
      Vec2(f32::from_double(x), f32::from_double(y)));
    if (!segment.valid()) return;
    set_owner(world, segment, previous);
    if (Entity* segment_entity = world.entities().get(segment)) {
      segment_entity->ai.predecessor = previous;
      segment_entity->spawn_band = 255U;
      attach_child(world, previous, segment);
    }
    previous = segment;
    angle = f32::from_double(static_cast<double>(angle.value) + step);
  }
}

} // namespace

void release_ant_hole_ants(World& world) { release_ant_hole_ants_impl(world); }

SpawnTable SpawnTable::from_catalog() {
  SpawnTable table;
  for (const auto& rule : Catalog::instance().spawn_rules()) {
    const f32 weight(rule.weight);
    for (std::uint8_t index = 0; index < rule.regionCount; ++index) {
      const std::uint8_t band = rule.regionIds[index];
      if (band > 7U) continue;
      table.bands_[band].entries.push_back({weight, rule.entityTypeId});
      table.bands_[band].total = table.bands_[band].total + weight;
    }
  }
  return table;
}

SpawnPosition SpawnTable::sample_position(std::uint8_t index, ServerRng& rng,
                                          f32 width, f32 height) const {
  // Original 113: bands are vertical x strips spanning the full height. Band 0
  // uses the 0..0.15 fallback; band b uses the (b-1) table pair.
  static constexpr std::array<std::pair<float, float>, 8> kBandBounds{{
    {0.0F, 0.15F}, {0.15F, 0.3F}, {0.3F, 0.45F}, {0.45F, 0.6F},
    {0.6F, 0.75F}, {0.75F, 0.9F}, {0.9F, 0.95F}, {0.95F, 1.0F},
  }};
  const auto bounds = kBandBounds[index & 7U];
  const auto [fraction_x, fraction_y] = rng.next_fraction_pair();
  const f32 lower(bounds.first);
  const f32 upper(bounds.second);
  const f32 normalized = lower + (upper - lower) * fraction_x;
  const f32 x = width * (normalized + f32(-0.5F));
  const f32 y = height * (fraction_y + f32(-0.5F));
  return {x, y};
}

const SpawnBandEntry* SpawnTable::choose(std::uint8_t index, ServerRng& rng) const {
  const SpawnBand& band = bands_[index & 7U];
  if (band.entries.empty() || band.total.value <= 0.0F) return nullptr;
  const f32 normalized = rng.next_fraction();
  f32 remaining = band.total * normalized;
  for (const auto& entry : band.entries) {
    if (remaining < entry.weight) return &entry;
    remaining = remaining - entry.weight;
  }
  return nullptr;
}

RockBody configure_rock(ServerRng& rng, bool massive) {
  const std::uint32_t random = rng.next();
  const f32 random_minus_one(static_cast<float>(random - 1U));
  const double factor = (massive ? 40.0 : 20.0) / 2147483648.0;
  const f32 scaled(static_cast<float>(factor * static_cast<double>(random_minus_one.value)));
  const f32 base(massive ? 60.0F : 20.0F);
  const f32 radius(static_cast<float>(scaled.value + base.value));
  const f32 health(static_cast<float>((massive ? 2.0 : 1.0) * static_cast<double>(radius.value) * 0.4));
  return {radius, health};
}

namespace {

EntityHandle spawn_rock_impl(World& world, Vec2 position, bool massive, ServerRng& rng,
                             bool component_draws) {
  const std::uint16_t type_id = static_cast<std::uint16_t>(massive ? 2 : 1);
  const EntityHandle handle = spawn_entity(world, EntityKind::kMob, type_id,
    position, f32(massive ? 60.0F : 20.0F), 75, 96);
  if (!handle.valid()) return handle;
  if (component_draws) { if (Entity* spawned = world.entities().get(handle)) consume_component_draws(world, *spawned); }
  const RockBody body = configure_rock(rng, massive);
  Entity* entity = world.entities().get(handle);
  entity->radius = body.radius;
  entity->collision_radius = body.radius;
  entity->contact_damage = f32(10.0F);
  entity->health = body.health;
  entity->max_health = body.health;
  entity->component_flags92 = 4;
  entity->physics_flag48 = false;  // original configureRock clears +48
  return handle;
}

} // namespace

EntityHandle spawn_rock(World& world, Vec2 position, bool massive, ServerRng& rng) {
  return spawn_rock_impl(world, position, massive, rng, false);
}

EntityHandle spawn_rock_with_component_draws(World& world, Vec2 position, bool massive, ServerRng& rng) {
  return spawn_rock_impl(world, position, massive, rng, true);
}

CactusBody configure_cactus(ServerRng& rng) {
  const std::uint32_t random = rng.next();
  const f32 random_minus_one(static_cast<float>(random - 1U));
  const f32 scaled(static_cast<float>((20.0 / 2147483648.0) * static_cast<double>(random_minus_one.value)));
  const f32 radius(static_cast<float>(scaled.value + 40.0F));
  return {radius, f32::from_double(static_cast<double>(radius.value) * 0.7)};
}

namespace {

EntityHandle spawn_cactus_impl(World& world, Vec2 position, ServerRng& rng, bool component_draws) {
  const EntityHandle handle = spawn_entity(world, EntityKind::kMob, 3, position, f32(40.0F), 75, 96);
  if (!handle.valid()) return handle;
  if (component_draws) { if (Entity* spawned = world.entities().get(handle)) consume_component_draws(world, *spawned); }
  const CactusBody body = configure_cactus(rng);
  Entity* entity = world.entities().get(handle);
  entity->radius = body.radius;
  entity->collision_radius = body.radius;
  entity->contact_damage = f32(30.0F);
  entity->health = body.health;
  entity->max_health = body.health;
  entity->component_flags92 = 0;
  entity->physics_flag48 = false;  // original initializeCactus clears +48
  return handle;
}

} // namespace

EntityHandle spawn_cactus(World& world, Vec2 position, ServerRng& rng) {
  return spawn_cactus_impl(world, position, rng, false);
}

EntityHandle spawn_cactus_with_component_draws(World& world, Vec2 position, ServerRng& rng) {
  return spawn_cactus_impl(world, position, rng, true);
}

EntityHandle spawn_entity_from_defaults(World& world, EntityKind kind, std::uint16_t type_id, Vec2 position) {
  const auto* defaults = Catalog::instance().spawn_defaults(type_id);
  if (defaults == nullptr) {
    // Queen Ant and the two Centipede segment records are present in the 23-row
    // entity definition table but absent from the 19-row spawn-default probe.
    // Their family initializers still define the complete body.
    if (type_id == 10U) {
      const EntityHandle handle = spawn_entity(world, kind, type_id, position, f32(40.0F), 75U, 96U);
      if (handle.valid()) {
        if (Entity* spawned = world.entities().get(handle)) consume_component_draws(world, *spawned);
        configure_ant(*world.entities().get(handle), 3, world.random());
        world.entities().get(handle)->ai.clock_ms = world.time_ms();
        world.register_ai(handle);
      }
      return handle;
    }
    if (type_id == 16U || type_id == 18U) {
      const EntityHandle handle = spawn_entity(world, kind, type_id, position, f32(35.0F), 75U, 96U);
      if (handle.valid()) {
        if (Entity* spawned = world.entities().get(handle)) consume_component_draws(world, *spawned);
        configure_centipede(*world.entities().get(handle), type_id == 18U, false, world.random());
        world.entities().get(handle)->ai.clock_ms = world.time_ms();
        world.register_ai(handle);
      }
      return handle;
    }
    return EntityHandle{};
  }
  if (defaults->dynamicRadius) {
    // Dynamic-radius species have no fixed spawn row. The cheat/debug spawn
    // path must still create them through their real initializers.
    switch (type_id) {
      case 1U: return spawn_rock(world, position, false, world.random());
      case 2U: return spawn_rock(world, position, true, world.random());
      case 3U: return spawn_cactus(world, position, world.random());
      default: return EntityHandle{};
    }
  }
  const EntityHandle handle = spawn_entity(world, kind, type_id, position, f32(defaults->radius),
    defaults->flags95, defaults->flags93);
  if (!handle.valid()) return handle;
  if (Entity* spawned = world.entities().get(handle)) consume_component_draws(world, *spawned);
  Entity* entity = world.entities().get(handle);
  entity->contact_damage = f32(defaults->contactDamage);
  entity->health = f32(defaults->health);
  entity->max_health = f32(defaults->maxHealth);
  entity->component_flags92 = defaults->flags92;
  // Recovered family and species initializers (original 205/208/210/415/115).
  // Species without a recovered initializer keep the probed catalog defaults
  // and the generic AI profile.
  switch (type_id) {
    case 4U: configure_ladybug(*entity, 0, world.random()); break;
    case 5U: configure_ladybug(*entity, -1, world.random()); break;
    case 20U: configure_ladybug(*entity, 1, world.random()); break;
    case 21U: configure_ladybug(*entity, 2, world.random()); break;
    case 6U: configure_bee(*entity, world.random()); break;
    case 7U: configure_ant(*entity, 0, world.random()); break;
    case 8U: configure_ant(*entity, 1, world.random()); break;
    case 9U: configure_ant(*entity, 2, world.random()); break;
    case 10U: configure_ant(*entity, 3, world.random()); break;
    case 12U: configure_beetle(*entity, false, world.random()); break;
    case 13U: configure_beetle(*entity, true, world.random()); break;
    case 14U: configure_hornet(*entity, world.random()); break;
    case 15U: configure_centipede(*entity, false, true, world.random()); break;
    case 16U: configure_centipede(*entity, false, false, world.random()); break;
    case 17U: configure_centipede(*entity, true, true, world.random()); break;
    case 18U: configure_centipede(*entity, true, false, world.random()); break;
    case 19U: configure_square(*entity, world.random()); break;
    case 22U: configure_spider(*entity, world.random()); break;
    case 11U: break;  // Ant Hole stays stationary.
    case 1U: case 2U: case 3U: break;  // dynamic-radius species use their own path.
    default:
      configure_mob_ai(*entity, f32(600.0F), f32(0.0025F), true, true);
      break;
  }
  entity->ai.clock_ms = world.time_ms();
  if (entity->ai.timer_active)
    entity->ai.timer_deadline_ms = world.time_ms() + entity->ai.timer_interval_ms;
  if (entity->ai.enabled) world.register_ai(handle);
  if (type_id == 11U) {
    // The original species component is linked into the world's dense release
    // vector before initializeAntHole spawns its six starting children.
    world.register_ant_hole(handle);
    // initializeAntHole calls the child spawner in this exact caste order:
    // three baby ants, two workers, one soldier. Original 143 spawns each child
    // at the hole world position, draws one RNG value for a 0.25-unit velocity
    // scatter and links the child to the hole.
    static constexpr std::array<std::uint16_t, 6> kCastes{{7U, 7U, 7U, 8U, 8U, 9U}};
    for (const std::uint16_t caste : kCastes) {
      const EntityHandle child = spawn_entity_from_defaults(world, EntityKind::kMob, caste, position);
      if (!child.valid()) break;
      const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
      set_owner(world, child, handle);
      const f32 angle = f32(sample.value * kRandomAngleScale);
      if (Entity* child_entity = world.entities().get(child)) {
        // Original 143 adds the 0.25-unit scatter to the transform velocity
        // (+40/+48); the child's position remains the hole centre.
        child_entity->velocity.x += static_cast<double>(
          f32(std::cos(static_cast<double>(angle.value)) * 0.25).value);
        child_entity->velocity.y += static_cast<double>(
          f32(std::sin(static_cast<double>(angle.value)) * 0.25).value);
      }
    }
  }
  if (type_id == 15U || type_id == 17U) {
    Entity* head_entity = world.entities().get(handle);
    spawn_centipede_segments(world, handle, type_id == 17U,
                             head_entity != nullptr && head_entity->ai.rare);
  }
  return handle;
}

EntityHandle spawn_entity(World& world, EntityKind kind, std::uint16_t type_id, Vec2 position, f32 radius,
                         std::uint8_t world_flags, std::uint8_t entity_flags) {
  const auto handle = world.entities().allocate();
  if (!handle) return EntityHandle{};
  Entity* entity = world.entities().get(*handle);
  entity->kind = kind;
  entity->spawn_tick = world.tick();
  entity->type_id = type_id;
  entity->set_position(position);
  entity->radius = radius;
  entity->collision_radius = radius;
  // Original spawnLoot creates transform/physics/pickup/visual components but
  // no health component. State dumps represent absent health as 0/0.
  entity->health = f32(kind == EntityKind::kDrop ? 0.0F : 1.0F);
  entity->max_health = entity->health;
  entity->world_flags = world_flags;
  entity->entity_flags = entity_flags;
  // initializeAntHole clears physics +48/+51; every other ensurePhysics body
  // keeps +48 = 1, +51 = 1 and mass 1.0.
  if (type_id == 11U) entity->physics_flag48 = false;
  entity->active = true;
  entity->bounds_dirty = true;
  world.mark_known(*handle);
  return *handle;
}

namespace {
// Population factories create new bodies only; no existing body's geometry is
// modified. Synchronize ALL births (including children) after each attempt.
struct SpawnQueryContext {
  World& world;
  SpatialQuery query;
  std::array<bool,kEntitySlotCount> present{};
  explicit SpawnQueryContext(World& w) : world(w), query(SpatialQuery::from_world(w)) {
    w.entities().with_ordered_slots([&](auto&& slots) {
      for (const auto& e : slots) if(e.active) present[e.handle.index()] = true;
    });
  }
  void synchronize_births() {
    world.entities().with_ordered_slots([&](auto&& slots) {
      for (const auto& e : slots) {
        PERF_ADD(visits, 1);
        if (!e.active || present[e.handle.index()]) continue;
        present[e.handle.index()] = true;
        query.add({e.position,e.radius,e.world_flags,e.entity_flags,e.handle});
      }
    });
  }
};
}

std::vector<EntityHandle> populate_world(
    World& world, const SpawnTable& table, const std::array<std::uint8_t, 8>& counts) {
  SpawnQueryContext context(world);
  std::vector<EntityHandle> spawned;
  for (std::uint8_t band = 0; band < 8; ++band) {
    for (std::uint8_t index = 0; index < counts[band]; ++index) {
      const auto& query = context.query;
      const EntityHandle handle = table.spawn_from_band(world, band,
        [&query](const SpawnPosition& position) { return query.occupied(position); },
        [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
          if (entry.entity_type == 1 || entry.entity_type == 2)
            return spawn_rock_with_component_draws(world, Vec2(position.x, position.y),
                                        entry.entity_type == 2, world.random());
          if (entry.entity_type == 3)
            return spawn_cactus_with_component_draws(world, Vec2(position.x, position.y), world.random());
          return spawn_entity_from_defaults(world, EntityKind::kMob, entry.entity_type,
                                            Vec2(position.x, position.y));
        });
      context.synchronize_births();
      if (handle.valid()) {
        if (Entity* entity = world.entities().get(handle)) entity->spawn_band = band;
        spawned.push_back(handle);
      }
    }
  }
  return spawned;
}

std::array<std::uint32_t, 8> population_targets(f32 width, f32 height) {
  static constexpr std::array<double, 8> kScales{{
    0x1421f601797cc3ULL * 1.0587911840678754e-22, // 2^-73 * 0x1421f601797cc3
    0x1421f601797cc3ULL * 1.0587911840678754e-22,
    0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
    0x1421f644955b46ULL * 1.0587911840678754e-22,
    0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
    0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
    0x1ad7f3061c79b3ULL * 2.6469779601696886e-23, // 2^-75
    0x1ad7f3061c79b3ULL * 2.6469779601696886e-23,
  }};
  const double area = static_cast<double>(width.value) * static_cast<double>(height.value);
  std::array<std::uint32_t, 8> targets{};
  for (std::size_t index = 0; index < targets.size(); ++index) {
    const double value = std::trunc(area * kScales[index]);
    targets[index] = value > 0.0 && value < 4294967296.0
      ? static_cast<std::uint32_t>(value) : 0U;
  }
  return targets;
}

namespace {

std::vector<EntityHandle> spawn_population_band(World& world, const SpawnTable& table,
                                                std::uint8_t band, std::uint32_t target,
                                                std::uint32_t already, SpawnQueryContext& context) {
  std::vector<EntityHandle> spawned;
  std::uint32_t count = already;
  while (count < target) {
    const auto& query = context.query;
    const EntityHandle handle = table.spawn_from_band(world, band,
      [&query](const SpawnPosition& position) { return query.occupied(position); },
      [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
        if (entry.entity_type == 1 || entry.entity_type == 2)
          return spawn_rock_with_component_draws(world, Vec2(position.x, position.y),
                                      entry.entity_type == 2, world.random());
        if (entry.entity_type == 3)
          return spawn_cactus_with_component_draws(world, Vec2(position.x, position.y), world.random());
        return spawn_entity_from_defaults(world, EntityKind::kMob, entry.entity_type,
                                          Vec2(position.x, position.y));
      });
    context.synchronize_births();
    if (!handle.valid()) break;
    if (Entity* entity = world.entities().get(handle)) entity->spawn_band = band;
    ++count;
    spawned.push_back(handle);
  }
  return spawned;
}

} // namespace

std::vector<EntityHandle> populate_world(World& world, const SpawnTable& table) {
  SpawnQueryContext context(world);
  const auto targets = population_targets(world.width(), world.height());
  std::vector<EntityHandle> spawned;
  for (std::uint8_t band = 0; band < 8; ++band) {
    auto band_spawned = spawn_population_band(world, table, band, targets[band], 0U, context);
    spawned.insert(spawned.end(), band_spawned.begin(), band_spawned.end());
  }
  return spawned;
}

std::vector<EntityHandle> replenish_population(World& world, const SpawnTable& table) {
  const auto targets = population_targets(world.width(), world.height());
  std::array<std::uint32_t, 8> counts{};
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) { PERF_ADD(visits, 1);
      if (!entity.active || entity.kind != EntityKind::kMob) continue;
      if (entity.spawn_band < 8U) ++counts[entity.spawn_band];
    }
  });
  std::vector<EntityHandle> spawned;
  std::optional<SpawnQueryContext> context;
  for (std::uint8_t band = 0; band < 8; ++band) {
    if (counts[band] >= targets[band]) continue;
    if (!context) context.emplace(world);
    auto band_spawned = spawn_population_band(world, table, band, targets[band], counts[band], *context);
    spawned.insert(spawned.end(), band_spawned.begin(), band_spawned.end());
  }
  return spawned;
}

} // namespace engine
