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
// f32(2*pi / 2^31): scale that turns a full-range u32 draw into radians.
constexpr float kRandomAngleScale = 2.925836239953128e-09F;
// Initial wire mask for bodies constructed without a fixed catalog spawn row.
// Preserve the serialized bits, including bits with no simulation consumer.
constexpr std::uint8_t kMobSpawnWorldFlags = 0x4BU;
constexpr std::uint8_t kMobSpawnEntityFlags = static_cast<std::uint8_t>(EntityFlag::kBlocksSpawn) |
                                              static_cast<std::uint8_t>(EntityFlag::kOwned);

/** Spawn-area rejection: a player body inside radius+45 of the candidate point
 * rejects the spawn. A linear scan of the same bodies is equivalent to the
 * broad-phase rectangle query for this predicate. */
bool spawn_area_blocked(const World& world, double x, double y) {
  return world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active) {
        continue;
      }
      if (!has_flag(entity.world_flags, WorldFlag::kPlayerBody)) {
        continue;
      }
      const double dx = static_cast<double>(entity.position.x.value) - x;
      const double dy = static_cast<double>(entity.position.y.value) - y;
      const double minimum = static_cast<double>(entity.collision_radius.value) + 45.0;
      if (dx * dx + dy * dy < minimum * minimum) {
        return true;
      }
    }
    return false;
  });
}

void set_owner(World& world, EntityHandle child, EntityHandle parent) {
  Entity* entity = world.entities().get(child);
  if (entity == nullptr) {
    return;
  }
  entity->owner = parent.raw;
  set_flag(entity->entity_flags, EntityFlag::kOwned, true);
  entity->ai.owner = parent;
  attach_child(world, parent, child);
}

/** 33 health-ratio thresholds and the species spawned at each threshold. The
 * sequence is Baby Ant, Worker Ant, Baby Ant, then Worker/Soldier/Queen Ant;
 * species are named by catalog id, never by a numeric offset. */
constexpr std::array<std::uint32_t, 33> kAntHoleThresholdBits{{
    0x3f7851ecU, 0x3f733333U, 0x3f6e147bU, 0x3f666666U, 0x3f5eb852U, 0x3f547ae1U, 0x3f4ccccdU,
    0x3f451eb8U, 0x3f3ae148U, 0x3f2b851fU, 0x3f2147aeU, 0x3f19999aU, 0x3f11eb85U, 0x3f07ae14U,
    0x3ef0a3d7U, 0x3ee147aeU, 0x3ed1eb85U, 0x3ec28f5cU, 0x3eb851ecU, 0x3ea3d70aU, 0x3e99999aU,
    0x3e8a3d71U, 0x3e75c28fU, 0x3e4ccccdU, 0x3e851eb8U, 0x3e23d70aU, 0x3dcccccdU, 0x3d8f5c29U,
    0x3d23d70aU, 0x3ca3d70aU, 0x00000000U, 0x00000000U, 0x00000000U,
}};
constexpr std::array<catalog::SpeciesId, 33> kAntHoleSpecies{{
    catalog::SpeciesId::kBabyAnt,    catalog::SpeciesId::kWorkerAnt,
    catalog::SpeciesId::kBabyAnt,    catalog::SpeciesId::kWorkerAnt,
    catalog::SpeciesId::kWorkerAnt,  catalog::SpeciesId::kWorkerAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kWorkerAnt,  catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kWorkerAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kQueenAnt,   catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt, catalog::SpeciesId::kSoldierAnt,
    catalog::SpeciesId::kSoldierAnt,
}};

void release_ant_hole_ants_impl(World& world) {
  // The release cursor lives beside the ant hole and advances over the fixed
  // threshold table. Entity creation only appends, and the loop below never
  // creates another ant hole.
  for (AntHoleRelease& release : world.ant_hole_releases()) {
    Entity* hole = world.entities().get(release.entity);
    if (hole == nullptr || !hole->active ||
        catalog::species_id(hole->type_id) != catalog::SpeciesId::kAntHole) {
      continue;
    }
    while (release.release_index <= 32U) {
      const std::uint32_t index = release.release_index;
      const float ratio = hole->health.value / hole->max_health.value;
      const float threshold = std::bit_cast<float>(kAntHoleThresholdBits[index]);
      // Spawn while the health ratio has reached the next threshold.
      if (ratio > threshold) {
        break;
      }
      const std::uint16_t type = catalog::species_type_id(kAntHoleSpecies[index]);
      const EntityHandle child =
          spawn_entity_from_defaults(world, EntityKind::kMob, type, hole->position);
      if (!child.valid()) {
        break;
      }
      // One angle draw per released ant; the 0.25-unit scatter is added to the
      // child's velocity while its position stays at the hole for the first
      // frame.
      const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
      const f32 angle = f32(sample.value * kRandomAngleScale);
      set_owner(world, child, hole->handle);
      if (Entity* child_entity = world.entities().get(child)) {
        child_entity->velocity.x +=
            static_cast<double>(f32(std::cos(static_cast<double>(angle.value)) * 0.25).value);
        child_entity->velocity.y +=
            static_cast<double>(f32(std::sin(static_cast<double>(angle.value)) * 0.25).value);
      }
      ++release.release_index;
    }
  }
}

/** One server-RNG draw for every spawn-loot candidate of the entity definition,
 * before the species initializer runs. The draws are observable in the spawn
 * sequence and must happen in this exact position.
 *
 * The attached loot list follows the **drop table order** (ascending chance in
 * `drop-chances.json`), not the definition's `petalTypeIds` order. Every
 * component consumes a draw regardless of whether it attaches loot. */
void draw_drop_candidates(World& world, Entity& entity) {
  const auto* definition = Catalog::instance().entity(entity.type_id);
  if (definition == nullptr) {
    return;
  }
  const auto* table = Catalog::instance().drop_table(entity.type_id);
  for (std::uint8_t index = 0; index < definition->dropDrawCount; ++index) {
    const f32 fraction = world.random().next_fraction();
    if (table == nullptr || table->drops == nullptr || index >= table->dropCount) {
      continue;
    }
    const auto& drop = table->drops[index];
    if (fraction.value < drop.chance && entity.loot_count < entity.loot_petals.size()) {
      entity.loot_petals[entity.loot_count++] = drop.petalTypeId;
    }
  }
}

void draw_drop_candidates(World& world, EntityHandle handle) {
  if (Entity* entity = world.entities().get(handle)) {
    draw_drop_candidates(world, *entity);
  }
}

void spawn_centipede_segments(World& world, EntityHandle head, bool evil, bool rare) {
  Entity* head_entity = world.entities().get(head);
  if (head_entity == nullptr) {
    return;
  }
  const std::uint16_t segment_type = catalog::species_type_id(
      evil ? catalog::SpeciesId::kEvilCentipedeSegment : catalog::SpeciesId::kCentipedeSegment);
  const std::uint32_t count = rare ? 49U : 9U;
  // The step stays double (2*pi/20, 2*pi/100) and is accumulated into the f32
  // angle: `angle = f32(angle + step)`. Rounding the step to f32 first is
  // observable from the sixth segment on (1-4 f32 ULP in the spawn position).
  const double step = rare ? kTau / 100.0 : kTau / 20.0;
  // One angle draw: f32(f32((random-1)>>>0) * f32(2*pi / 2^31)).
  const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
  f32 angle = f32(sample.value * kRandomAngleScale);
  EntityHandle previous = head;
  for (std::uint32_t index = 0; index < count; ++index) {
    Entity* previous_entity = world.entities().get(previous);
    if (previous_entity == nullptr) {
      return;
    }
    const double x = static_cast<double>(previous_entity->position.x.value) +
                     std::cos(static_cast<double>(angle.value)) * 70.0;
    const double y = static_cast<double>(previous_entity->position.y.value) +
                     std::sin(static_cast<double>(angle.value)) * 70.0;
    const double half_width = static_cast<double>(world.width().value) * 0.5;
    const double half_height = static_cast<double>(world.height().value) * 0.5;
    const f32 left = f32::from_double(35.0 - half_width);
    const f32 bottom = f32::from_double(35.0 - half_height);
    const f32 right = f32::from_double(half_width - 35.0);
    const f32 top = f32::from_double(half_height - 35.0);
    if (x < static_cast<double>(left.value) || y < static_cast<double>(bottom.value) ||
        x > static_cast<double>(right.value) || y > static_cast<double>(top.value)) {
      return;
    }
    if (spawn_area_blocked(world, x, y)) {
      return;
    }
    const EntityHandle segment = spawn_entity_from_defaults(
        world, EntityKind::kMob, segment_type, Vec2(f32::from_double(x), f32::from_double(y)));
    if (!segment.valid()) {
      return;
    }
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

}  // namespace

void release_ant_hole_ants(World& world) {
  release_ant_hole_ants_impl(world);
}

SpawnTable SpawnTable::from_catalog() {
  SpawnTable table;
  for (const auto& rule : Catalog::instance().spawn_rules()) {
    const f32 weight(rule.weight);
    for (std::uint8_t index = 0; index < rule.regionCount; ++index) {
      const std::uint8_t band = rule.regionIds[index];
      if (band > 7U) {
        continue;
      }
      table.bands_[band].entries.push_back({weight, rule.entityTypeId});
      table.bands_[band].total = table.bands_[band].total + weight;
    }
  }
  return table;
}

SpawnPosition SpawnTable::sample_position(std::uint8_t index, ServerRng& rng, f32 width,
                                          f32 height) const {
  // Bands are vertical x strips spanning the full height: `index & 7` selects an
  // x window from kBandBounds while y stays uniform, and one paired draw
  // supplies both fractions.
  static constexpr std::array<std::pair<float, float>, 8> kBandBounds{{
      {0.0F, 0.15F},
      {0.15F, 0.3F},
      {0.3F, 0.45F},
      {0.45F, 0.6F},
      {0.6F, 0.75F},
      {0.75F, 0.9F},
      {0.9F, 0.95F},
      {0.95F, 1.0F},
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
  if (band.entries.empty() || band.total.value <= 0.0F) {
    return nullptr;
  }
  const f32 normalized = rng.next_fraction();
  f32 remaining = band.total * normalized;
  for (const auto& entry : band.entries) {
    if (remaining < entry.weight) {
      return &entry;
    }
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
  const f32 health(
      static_cast<float>((massive ? 2.0 : 1.0) * static_cast<double>(radius.value) * 0.4));
  return {radius, health};
}

namespace {

EntityHandle spawn_rock_impl(World& world, Vec2 position, bool massive, ServerRng& rng,
                             bool drop_draws) {
  const std::uint16_t type_id =
      catalog::species_type_id(massive ? catalog::SpeciesId::kBoulder : catalog::SpeciesId::kRock);
  const EntityHandle handle =
      spawn_entity(world, EntityKind::kMob, type_id, position, f32(massive ? 60.0F : 20.0F),
                   kMobSpawnWorldFlags, kMobSpawnEntityFlags);
  if (!handle.valid()) {
    return handle;
  }
  if (drop_draws) {
    draw_drop_candidates(world, handle);
  }
  const RockBody body = configure_rock(rng, massive);
  Entity* entity = world.entities().get(handle);
  entity->radius = body.radius;
  entity->collision_radius = body.radius;
  entity->contact_damage = f32(10.0F);
  entity->health = body.health;
  entity->max_health = body.health;
  entity->uses_mass_weighted_response = false;
  return handle;
}

}  // namespace

EntityHandle spawn_rock(World& world, Vec2 position, bool massive, ServerRng& rng) {
  return spawn_rock_impl(world, position, massive, rng, false);
}

EntityHandle spawn_rock_with_drop_draws(World& world, Vec2 position, bool massive, ServerRng& rng) {
  return spawn_rock_impl(world, position, massive, rng, true);
}

CactusBody configure_cactus(ServerRng& rng) {
  const std::uint32_t random = rng.next();
  const f32 random_minus_one(static_cast<float>(random - 1U));
  const f32 scaled(
      static_cast<float>((20.0 / 2147483648.0) * static_cast<double>(random_minus_one.value)));
  const f32 radius(static_cast<float>(scaled.value + 40.0F));
  return {radius, f32::from_double(static_cast<double>(radius.value) * 0.7)};
}

namespace {

EntityHandle spawn_cactus_impl(World& world, Vec2 position, ServerRng& rng, bool drop_draws) {
  const EntityHandle handle =
      spawn_entity(world, EntityKind::kMob, catalog::species_type_id(catalog::SpeciesId::kCactus),
                   position, f32(40.0F), kMobSpawnWorldFlags, kMobSpawnEntityFlags);
  if (!handle.valid()) {
    return handle;
  }
  if (drop_draws) {
    if (Entity* spawned = world.entities().get(handle)) {
      draw_drop_candidates(world, *spawned);
    }
  }
  const CactusBody body = configure_cactus(rng);
  Entity* entity = world.entities().get(handle);
  entity->radius = body.radius;
  entity->collision_radius = body.radius;
  entity->contact_damage = f32(30.0F);
  entity->health = body.health;
  entity->max_health = body.health;
  entity->uses_mass_weighted_response = false;
  return handle;
}

}  // namespace

EntityHandle spawn_cactus(World& world, Vec2 position, ServerRng& rng) {
  return spawn_cactus_impl(world, position, rng, false);
}

EntityHandle spawn_cactus_with_drop_draws(World& world, Vec2 position, ServerRng& rng) {
  return spawn_cactus_impl(world, position, rng, true);
}

namespace {

/** Allocate the body and draw its spawn-loot candidates. */
EntityHandle spawn_body_with_loot(World& world, EntityKind kind, std::uint16_t type_id,
                                  Vec2 position, f32 radius, std::uint8_t world_flags,
                                  std::uint8_t entity_flags) {
  const EntityHandle handle =
      spawn_entity(world, kind, type_id, position, radius, world_flags, entity_flags);
  if (handle.valid()) {
    draw_drop_candidates(world, handle);
  }
  return handle;
}

}  // namespace

EntityHandle spawn_entity_from_defaults(World& world, EntityKind kind, std::uint16_t type_id,
                                        Vec2 position) {
  const auto* defaults = Catalog::instance().spawn_defaults(type_id);
  if (defaults == nullptr) {
    // Queen Ant and the two Centipede segment records are present in the entity
    // definition table but absent from the spawn-default table. Their family
    // initializers still define the complete body.
    const catalog::SpeciesId species = catalog::species_id(type_id);
    if (species == catalog::SpeciesId::kQueenAnt) {
      const EntityHandle handle = spawn_body_with_loot(world, kind, type_id, position, f32(40.0F),
                                                       kMobSpawnWorldFlags, kMobSpawnEntityFlags);
      if (Entity* entity = world.entities().get(handle)) {
        configure_ant(*entity, 3, world.random());
        entity->ai.clock_ms = world.time_ms();
        world.register_ai(handle);
      }
      return handle;
    }
    if (species == catalog::SpeciesId::kCentipedeSegment ||
        species == catalog::SpeciesId::kEvilCentipedeSegment) {
      const EntityHandle handle = spawn_body_with_loot(world, kind, type_id, position, f32(35.0F),
                                                       kMobSpawnWorldFlags, kMobSpawnEntityFlags);
      if (Entity* entity = world.entities().get(handle)) {
        configure_centipede(*entity, species == catalog::SpeciesId::kEvilCentipedeSegment, false,
                            world.random());
        entity->ai.clock_ms = world.time_ms();
        world.register_ai(handle);
      }
      return handle;
    }
    return EntityHandle{};
  }
  if (defaults->dynamicRadius) {
    // Dynamic-radius species have no fixed spawn row. The diagnostic spawn path
    // must still create them through their real initializers.
    switch (catalog::species_id(type_id)) {
      case catalog::SpeciesId::kRock:
        return spawn_rock(world, position, false, world.random());
      case catalog::SpeciesId::kBoulder:
        return spawn_rock(world, position, true, world.random());
      case catalog::SpeciesId::kCactus:
        return spawn_cactus(world, position, world.random());
      default:
        return EntityHandle{};
    }
  }
  const EntityHandle handle =
      spawn_body_with_loot(world, kind, type_id, position, f32(defaults->radius),
                           defaults->worldFlags, defaults->entityFlags);
  if (!handle.valid()) {
    return handle;
  }
  Entity* entity = world.entities().get(handle);
  entity->contact_damage = f32(defaults->contactDamage);
  entity->health = f32(defaults->health);
  entity->max_health = f32(defaults->maxHealth);
  // Family and species initializers. Species without a dedicated initializer
  // keep the catalog defaults and the generic AI profile.
  switch (catalog::species_id(type_id)) {
    case catalog::SpeciesId::kLadybug:
      configure_ladybug(*entity, 0, world.random());
      break;
    case catalog::SpeciesId::kMassiveLadybug:
      configure_ladybug(*entity, -1, world.random());
      break;
    case catalog::SpeciesId::kLadybugDark:
      configure_ladybug(*entity, 1, world.random());
      break;
    case catalog::SpeciesId::kLadybugShiny:
      configure_ladybug(*entity, 2, world.random());
      break;
    case catalog::SpeciesId::kBee:
      configure_bee(*entity, world.random());
      break;
    case catalog::SpeciesId::kBabyAnt:
      configure_ant(*entity, 0, world.random());
      break;
    case catalog::SpeciesId::kWorkerAnt:
      configure_ant(*entity, 1, world.random());
      break;
    case catalog::SpeciesId::kSoldierAnt:
      configure_ant(*entity, 2, world.random());
      break;
    case catalog::SpeciesId::kQueenAnt:
      configure_ant(*entity, 3, world.random());
      break;
    case catalog::SpeciesId::kBeetle:
      configure_beetle(*entity, false, world.random());
      break;
    case catalog::SpeciesId::kMassiveBeetle:
      configure_beetle(*entity, true, world.random());
      break;
    case catalog::SpeciesId::kHornet:
      configure_hornet(*entity, world.random());
      break;
    case catalog::SpeciesId::kCentipedeHead:
      configure_centipede(*entity, false, true, world.random());
      break;
    case catalog::SpeciesId::kCentipedeSegment:
      configure_centipede(*entity, false, false, world.random());
      break;
    case catalog::SpeciesId::kEvilCentipedeHead:
      configure_centipede(*entity, true, true, world.random());
      break;
    case catalog::SpeciesId::kEvilCentipedeSegment:
      configure_centipede(*entity, true, false, world.random());
      break;
    case catalog::SpeciesId::kSquare:
      configure_square(*entity, world.random());
      break;
    case catalog::SpeciesId::kSpider:
      configure_spider(*entity, world.random());
      break;
    case catalog::SpeciesId::kAntHole:
      break;  // Ant Hole stays stationary.
    case catalog::SpeciesId::kRock:
    case catalog::SpeciesId::kBoulder:
    case catalog::SpeciesId::kCactus:
      break;  // dynamic-radius species use their own path.
    default:
      configure_mob_ai(*entity, f32(600.0F), f32(0.0025F), true, true);
      break;
  }
  entity->ai.clock_ms = world.time_ms();
  if (entity->ai.timer_active) {
    entity->ai.timer_deadline_ms = world.time_ms() + entity->ai.timer_interval_ms;
  }
  if (entity->ai.enabled) {
    world.register_ai(handle);
  }
  if (catalog::species_id(type_id) == catalog::SpeciesId::kAntHole) {
    // Register the hole before it spawns its six starting children.
    world.register_ant_hole(handle);
    // Child caste order: three baby ants, two workers, one soldier. Each child
    // starts at the hole position, draws one RNG value for a 0.25-unit velocity
    // scatter and is linked to the hole.
    static constexpr std::array<catalog::SpeciesId, 6> kCastes{{
        catalog::SpeciesId::kBabyAnt,
        catalog::SpeciesId::kBabyAnt,
        catalog::SpeciesId::kBabyAnt,
        catalog::SpeciesId::kWorkerAnt,
        catalog::SpeciesId::kWorkerAnt,
        catalog::SpeciesId::kSoldierAnt,
    }};
    for (const catalog::SpeciesId caste : kCastes) {
      const EntityHandle child = spawn_entity_from_defaults(
          world, EntityKind::kMob, catalog::species_type_id(caste), position);
      if (!child.valid()) {
        break;
      }
      const f32 sample = f32(static_cast<float>(world.random().next() - 1U));
      set_owner(world, child, handle);
      const f32 angle = f32(sample.value * kRandomAngleScale);
      if (Entity* child_entity = world.entities().get(child)) {
        // The scatter is added to velocity; the child's position remains the
        // hole centre for its first frame.
        child_entity->velocity.x +=
            static_cast<double>(f32(std::cos(static_cast<double>(angle.value)) * 0.25).value);
        child_entity->velocity.y +=
            static_cast<double>(f32(std::sin(static_cast<double>(angle.value)) * 0.25).value);
      }
    }
  }
  if (catalog::species_id(type_id) == catalog::SpeciesId::kCentipedeHead ||
      catalog::species_id(type_id) == catalog::SpeciesId::kEvilCentipedeHead) {
    Entity* head_entity = world.entities().get(handle);
    spawn_centipede_segments(world, handle,
                             catalog::species_id(type_id) == catalog::SpeciesId::kEvilCentipedeHead,
                             head_entity != nullptr && head_entity->ai.rare);
  }
  return handle;
}

EntityHandle spawn_band_entity(World& world, const SpawnBandEntry& entry,
                               const SpawnPosition& position) {
  const Vec2 point(position.x, position.y);
  switch (catalog::species_id(entry.entity_type)) {
    case catalog::SpeciesId::kRock:
      return spawn_rock_with_drop_draws(world, point, false, world.random());
    case catalog::SpeciesId::kBoulder:
      return spawn_rock_with_drop_draws(world, point, true, world.random());
    case catalog::SpeciesId::kCactus:
      return spawn_cactus_with_drop_draws(world, point, world.random());
    default:
      return spawn_entity_from_defaults(world, EntityKind::kMob, entry.entity_type, point);
  }
}

EntityHandle spawn_entity(World& world, EntityKind kind, std::uint16_t type_id, Vec2 position,
                          f32 radius, std::uint8_t world_flags, std::uint8_t entity_flags) {
  const auto handle = world.entities().allocate();
  if (!handle) {
    return EntityHandle{};
  }
  Entity* entity = world.entities().get(*handle);
  entity->kind = kind;
  entity->spawn_tick = world.tick();
  entity->type_id = type_id;
  entity->set_position(position);
  entity->radius = radius;
  entity->collision_radius = radius;
  // A drop has no health component; state dumps represent absent health as
  // 0/0.
  entity->health = f32(kind == EntityKind::kDrop ? 0.0F : 1.0F);
  entity->max_health = entity->health;
  entity->world_flags = world_flags;
  entity->entity_flags = entity_flags;
  // Ant holes do not take mass-weighted contact response; every other body
  // keeps the default mass 1.0.
  if (catalog::species_id(type_id) == catalog::SpeciesId::kAntHole) {
    entity->uses_mass_weighted_response = false;
  }
  entity->active = true;
  entity->bounds_dirty = true;
  return *handle;
}

namespace {
// Population factories create new bodies only; no existing body's geometry is
// modified. Synchronize ALL births (including children) after each attempt.
struct SpawnQueryContext {
  World& world;
  SpatialQuery query;
  std::array<bool, kEntitySlotCount> present{};
  explicit SpawnQueryContext(World& w) : world(w), query(SpatialQuery::from_world(w)) {
    w.entities().with_ordered_slots([&](auto&& slots) {
      for (const auto& e : slots) {
        if (e.active) {
          present[e.handle.index()] = true;
        }
      }
    });
  }
  void synchronize_births() {
    world.entities().with_ordered_slots([&](auto&& slots) {
      for (const auto& e : slots) {
        PERF_ADD(visits, 1);
        if (!e.active || present[e.handle.index()]) {
          continue;
        }
        present[e.handle.index()] = true;
        query.add({e.position, e.radius, e.world_flags, e.entity_flags, e.handle});
      }
    });
  }
};
}

std::vector<EntityHandle> populate_world(World& world, const SpawnTable& table,
                                         const std::array<std::uint8_t, 8>& counts) {
  SpawnQueryContext context(world);
  std::vector<EntityHandle> spawned;
  for (std::uint8_t band = 0; band < 8; ++band) {
    for (std::uint8_t index = 0; index < counts[band]; ++index) {
      const auto& query = context.query;
      const EntityHandle handle = table.spawn_from_band(
          world, band, [&query](const SpawnPosition& position) { return query.occupied(position); },
          [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
            return spawn_band_entity(world, entry, position);
          });
      context.synchronize_births();
      if (handle.valid()) {
        if (Entity* entity = world.entities().get(handle)) {
          entity->spawn_band = band;
        }
        spawned.push_back(handle);
      }
    }
  }
  return spawned;
}

std::array<std::uint32_t, 8> population_targets(f32 width, f32 height) {
  static constexpr std::array<double, 8> kScales{{
      0x1421f601797cc3ULL * 1.0587911840678754e-22,  // 2^-73 * 0x1421f601797cc3
      0x1421f601797cc3ULL * 1.0587911840678754e-22,
      0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
      0x1421f644955b46ULL * 1.0587911840678754e-22,
      0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
      0x1421f5be5d9e41ULL * 1.0587911840678754e-22,
      0x1ad7f3061c79b3ULL * 2.6469779601696886e-23,  // 2^-75
      0x1ad7f3061c79b3ULL * 2.6469779601696886e-23,
  }};
  const double area = static_cast<double>(width.value) * static_cast<double>(height.value);
  std::array<std::uint32_t, 8> targets{};
  for (std::size_t index = 0; index < targets.size(); ++index) {
    const double value = std::trunc(area * kScales[index]);
    targets[index] = value > 0.0 && value < 4294967296.0 ? static_cast<std::uint32_t>(value) : 0U;
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
    const EntityHandle handle = table.spawn_from_band(
        world, band, [&query](const SpawnPosition& position) { return query.occupied(position); },
        [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
          return spawn_band_entity(world, entry, position);
        });
    context.synchronize_births();
    if (!handle.valid()) {
      break;
    }
    if (Entity* entity = world.entities().get(handle)) {
      entity->spawn_band = band;
    }
    ++count;
    spawned.push_back(handle);
  }
  return spawned;
}

}  // namespace

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
    for (const auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active || entity.kind != EntityKind::kMob) {
        continue;
      }
      if (entity.spawn_band < 8U) {
        ++counts[entity.spawn_band];
      }
    }
  });
  std::vector<EntityHandle> spawned;
  std::optional<SpawnQueryContext> context;
  for (std::uint8_t band = 0; band < 8; ++band) {
    if (counts[band] >= targets[band]) {
      continue;
    }
    if (!context) {
      context.emplace(world);
    }
    auto band_spawned =
        spawn_population_band(world, table, band, targets[band], counts[band], *context);
    spawned.insert(spawned.end(), band_spawned.begin(), band_spawned.end());
  }
  return spawned;
}

}  // namespace engine
