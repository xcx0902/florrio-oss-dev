#include "engine/core/perf.hpp"
#include "engine/sim/player.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/passives.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <cmath>

namespace engine {

void PlayerProfile::clear() {
  level_ = 0;
  experience_ = f32(0.0F);
  inventory_.fill(0);
  inventory_count_ = 0;
  lost_items_.fill(0);
  lost_count_ = 0;
  backpack_.fill(0);
  backpack_count_ = 0;
}

void PlayerProfile::add_experience(f32 amount) {
  experience_ += amount;
  while (level_ < 99) {
    const f32 threshold = experience_threshold(level_);
    if (experience_ < threshold) break;
    experience_ -= threshold;
    ++level_;
  }
}

f32 player_level_max_health(std::uint8_t level) {
  // Original 145: f32((level-1) * f64(1/44)), min(1), f32(*50), f32(+100).
  const f32 fraction = f32::from_double((static_cast<int>(level) - 1) * (1.0 / 44.0));
  const f32 growth(std::clamp(fraction.value, 0.0F, 1.0F));
  return f32(f32(growth.value * 50.0F).value + 100.0F);
}

void award_player_experience(World& world, f32 amount) {
  const f32 reward(amount.value * (world.compact() ? 3.0F : 1.0F));
  const std::uint8_t previous_level = world.profile().level();
  world.profile().add_experience(reward);
  world.loadout().set_score(world.loadout().score() + reward);
  Entity* player = world.entities().get(world.player());
  if (player == nullptr || player->health.value <= 0.0F) return;
  for (unsigned level = previous_level + 1U; level <= world.profile().level(); ++level) {
    const f32 maximum = player_level_max_health(static_cast<std::uint8_t>(level))
      + equipped_max_health_bonus(world, static_cast<std::uint8_t>(level));
    // 145 uses f32(maximum * currentHealth) / previousMaximum, once per
    // level; collapsing several gains into a single ratio loses rounding.
    player->health = player->max_health.value <= 0.0F ? maximum
      : f32(f32(maximum.value * player->health.value).value / player->max_health.value);
    player->max_health = maximum;
  }
  world.loadout().set_active_slots(world.profile().active_slots());
}

EntityHandle spawn_player(World& world, std::string_view name, Vec2 position,
                          const PlayerConfig& config) {
  if (world.player().valid() && world.entities().get(world.player()) != nullptr) return EntityHandle{};
  // Recovered player record: world flags 0x6b (bit 32 marks a player for spawn
  // clearance and the 390 knockback) and entity flags 0x40 (attachment owner).
  const EntityHandle handle = spawn_entity(world, EntityKind::kPlayer, 0, position,
                                           config.radius, 0x6BU, 0x40U);
  if (!handle.valid()) return EntityHandle{};
  Entity* entity = world.entities().get(handle);
  entity->collision_radius = config.radius;
  entity->health = config.health;
  entity->max_health = config.max_health;
  entity->contact_damage = config.contact_damage;
  world.set_player(handle);
  world.set_player_name(std::string(name));
  world.set_player_speed(config.movement_speed);
  return handle;
}

PlayerProfile make_default_profile() {
  PlayerProfile profile;
  // Original fresh loadout starts at level 1 (server loadout +148).
  profile.set_level(1);
  profile.set_experience(f32(0.0F));
  const std::uint8_t active = profile.active_slots();
  for (std::uint8_t slot = 0; slot < active; ++slot) profile.set_inventory(slot, 1);
  profile.set_inventory_count(active);
  return profile;
}

PlayerProfile make_respawn_profile(const World& world) {
  PlayerProfile profile;
  profile.set_level(std::max<std::uint8_t>(1U,
    static_cast<std::uint8_t>((world.last_death_level() * 3U) / 4U)));
  std::uint8_t count = world.last_death_kept_count();
  for (std::uint8_t index = 0; index < count; ++index)
    profile.set_inventory(index, world.last_death_kept()[index]);
  while (count < profile.active_slots()) profile.set_inventory(count++, 1U);
  profile.set_inventory_count(count);
  return profile;
}

void apply_player_controls(World& world, double delta_milliseconds) {
  Entity* player = world.entities().get(world.player());
  if (player == nullptr || player->health.value <= 0.0F) return;
  if (!(delta_milliseconds > 0.0)) return;
  const PlayerInput& input = world.input();
  const double strength = static_cast<double>(input.strength.value);
  // Original608 seeds its multiplier with 1.0, then multiplies the vtable+20
  // value of every active effect on the player before scaling dt and 0.001.
  // Web/honey therefore reduce the control impulse itself, not acceleration.
  const f32 effect_scale = slow_multiplier(*player);
  const f32 behavior_scale = f32(effect_scale.value * 2.5F);
  const double base = static_cast<double>(f32::from_double(
    delta_milliseconds * static_cast<double>(behavior_scale.value) * 0.001).value);
  const f32 impulse = strength < 200.0
    ? f32::from_double(base * static_cast<double>(
        f32::from_double(strength * 0.004999999888241291).value))
    : f32::from_double(base);
  const double radians = static_cast<double>(input.normalized_angle.value);
  const f32 cosine = f32::from_double(std::cos(radians));
  const f32 sine = f32::from_double(std::sin(radians));
  player->velocity.x += static_cast<double>(f32(cosine.value * impulse.value).value);
  player->velocity.y += static_cast<double>(f32(sine.value * impulse.value).value);
}

void regenerate_players(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) return;
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (auto& entity : slots) { PERF_ADD(visits, 1);
      if (!entity.active || entity.kind != EntityKind::kPlayer) continue;
      if (entity.health.value <= 0.0F) continue;
      const f32 maximum = player_level_max_health(world.profile().level())
        + equipped_max_health_bonus(world, world.profile().level());
      // Original tick calls 145 even with an unchanged maximum: the f32
      // multiply/divide can change health by one ULP before regeneration.
      entity.health = entity.max_health.value > 0.0F
        ? (maximum * entity.health) / entity.max_health : maximum;
      entity.max_health = maximum;
      // Original 216 receives an f32 healing amount, then adds it in f32.
      if (blocks_healing(entity)) continue;
      const f32 amount = f32::from_double(delta_milliseconds
        * static_cast<double>(maximum.value) * 4.166666666666667e-06
        + equipped_leaf_healing(world, delta_milliseconds));
      const f32 next = entity.health + amount;
      entity.health = next < maximum ? next : maximum;
    }
  });
}

EntityHandle spawn_player_default(World& world, std::string_view name, PlayerProfile profile,
                                 bool allow_rare_starter) {
  const f32 width = world.width();
  const f32 half = f32(width.value * 0.5F);
  const f32 negative_half = f32(width.value * -0.5F);
  const f32 span = half - negative_half;
  const std::uint8_t prior_level = profile.level();
  f32 minimum;
  f32 maximum;
  if (prior_level <= 12) {
    minimum = negative_half;
    maximum = f32(span.value * 0.3F + negative_half.value);
  } else if (prior_level <= 27) {
    minimum = f32(span.value * 0.3F + negative_half.value);
    maximum = f32(span.value * 0.6F + negative_half.value);
  } else if (prior_level <= 42) {
    minimum = f32(span.value * 0.6F + negative_half.value);
    maximum = f32(span.value * 0.9F + negative_half.value);
  } else {
    minimum = f32(span.value * 0.9F + negative_half.value);
    maximum = half;
  }
  const f32 range = maximum - minimum;
  Vec2 position;
  for (std::uint32_t attempt = 0; attempt < 1000U; ++attempt) {
    const auto [uniform, vertical] = world.random().next_fraction_pair();
    const f32 biased = f32(std::min(uniform.value * uniform.value * 0.8F, 1.0F));
    position.x = f32(range.value * biased.value + minimum.value);
    position.y = f32(world.height().value * (vertical.value - 0.5F));
    const f32 clearance(world.compact() ? 100.0F : 800.0F);
    if (!SpatialQuery::from_world(world).occupied({position.x, position.y}, clearance)) break;
  }
  const bool rare = allow_rare_starter && world.random().next_fraction() < f32(0.00005F);
  if (rare) {
    // Original spawn restores survivors first, then fills the active row. The
    // rare starter can replace the first filler, never a surviving petal.
    for (std::uint8_t slot = 0; slot < profile.active_slots(); ++slot) {
      if (profile.inventory(slot) != 1U) continue;
      if (!legendary_exists(world, EntityHandle{}, 35U)) profile.set_inventory(slot, 35U);
      break;
    }
  }
  const EntityHandle handle = spawn_player(world, name, position, PlayerConfig{});
  if (!handle.valid()) return handle;
  world.profile() = profile;
  world.loadout().restore_from_profile(profile);
  // Original spawn repeatedly awards exactly the XP missing to reach the
  // remembered level. It recreates cumulative points, with zero partial XP.
  f32 score(0.0F);
  for (std::uint8_t level = 1; level < profile.level(); ++level)
    score += experience_threshold(level);
  world.loadout().set_score(score);
  world.loadout().set_active_slots(profile.active_slots());
  world.set_last_death_kept({});
  if (Entity* player = world.entities().get(handle)) {
    player->max_health = player_level_max_health(profile.level());
    player->health = player->max_health;
  }
  return handle;
}

} // namespace engine
