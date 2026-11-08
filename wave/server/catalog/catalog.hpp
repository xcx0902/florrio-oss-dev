#pragma once

#include "sim/rules.hpp"

#include <optional>
#include <array>
#include <algorithm>
#include <span>
#include <stdexcept>
#include <string_view>

namespace wave::catalog {

enum class Effect {
  contact,
  rose,
  leaf,
  projectile,
  poison_projectile,
  web,
  summon,
  faster,
  honey,
  cactus,
  iris,
  wing,
  bubble,
  pollen,
  dandelion,
  antennae,
  heavy,
  yin_yang,
  salt,
  rice,
  corn,
  sand,
  pincer,
  yucca,
  magnet,
  yggdrasil,
  starfish,
  pearl,
  lightning,
  jelly,
  claw,
  shell,
  cutter,
  dahlia,
  uranium,
  sponge,
  soil,
  fangs,
  third_eye,
  stick
};

struct PetalMechanics {
  double attack_distance = 26;
  double defend_distance = 8;
  double shield = 0;
  double reflection = 0;
  double damage_ratio = 0;
  double damage_limit = 0;
  double heal_ratio = 0;
  double knockback = 0;
  double chain_damage = 0;
  unsigned bounces = 0;
  double vision_multiplier = 1;
  double pickup_multiplier = 1;
  double body_damage = 0;
  double sponge_seconds = 0;
  double speed_multiplier = 1;
  double size_multiplier = 1;
  bool hidden = false;
};

enum class MobAI {
  stationary,
  passive,
  neutral,
  chase,
  ranged,
  spawner,
  sandstorm,
  starfish,
  jellyfish,
  digger,
  leech,
  segment
};

struct ClientValues {
  // Registry-derived constructor f32, confirmed by original Damage/Health tooltips.
  bool observed = false;
  double offset12 = 0;
  double offset16 = 0;
};

struct PetalDefinition {
  sim::Petal kind;
  sim::Rarity rarity;
  unsigned client_id;
  std::string_view name;
  sim::BodyRules body;
  double reload_seconds;
  Effect effect;
  unsigned particles;
  double activation_seconds;
  double heal;
  double passive_heal_per_second;
  double friendly_mob_heal;
  double rotation_bonus;
  double projectile_speed;
  double range;
  double duration_seconds;
  double slow_multiplier;
  double health_bonus;
  double area_radius;
  ClientValues client;
  std::string_view evidenceKey;
  sim::Mob summon_mob = sim::Mob::beetle;
  sim::Rarity summon_rarity = sim::Rarity::common;
  PetalMechanics mechanics;
};

struct MobDefinition {
  sim::Mob kind;
  sim::Rarity rarity;
  unsigned client_id;
  unsigned segment_client_id;
  sim::BodyRules body;
  bool summon;
  std::string_view evidenceKey;
  std::uint64_t xp;
  MobAI ai = MobAI::chase;
  unsigned segments = 0;
  unsigned parent_client_id = 0;
  bool review_required = false;
  double missile_health = 0;
  double missile_damage = 0;
  double lightning_damage = 0;
  unsigned lightning_bounces = 0;
  double lifesteal = 0;
};

struct Catalog {
  std::string_view version;
  std::string_view sha256;
  std::string_view client_build_hash;
  std::string_view client_wasm_sha256;
  std::span<const PetalDefinition> petals;
  std::span<const MobDefinition> mobs;

  [[nodiscard]] const PetalDefinition* petal(sim::Petal kind, sim::Rarity rarity) const {
    for (const auto& entry : petals) {
      if (entry.kind == kind && entry.rarity == rarity) {
        return &entry;
      }
    }
    return nullptr;
  }
  // Registry membership establishes client identity, not an implemented effect.
  [[nodiscard]] bool can_equip(sim::Petal kind, sim::Rarity rarity = sim::Rarity::common) const {
    return static_cast<unsigned>(rarity) < 6 &&
           (kind == sim::Petal::none || petal(kind, rarity) != nullptr);
  }
  [[nodiscard]] const MobDefinition* mob(sim::Mob kind, sim::Rarity rarity) const {
    for (const auto& entry : mobs) {
      if (entry.kind == kind && entry.rarity == rarity) {
        return &entry;
      }
    }
    return nullptr;
  }
};

struct PetalRegistryEntry {
  unsigned client_id;
  sim::Petal kind;
  std::string_view name;
};

[[nodiscard]] std::span<const PetalRegistryEntry> petal_registry();

[[nodiscard]] const Catalog& dated();

[[nodiscard]] inline bool can_equip(sim::Petal kind, sim::Rarity rarity = sim::Rarity::common) {
  return dated().can_equip(kind, rarity);
}

struct CraftTable {
  std::array<unsigned, 5> client_percent;
  std::array<std::uint32_t, 5> server_success_per_million;
  unsigned inputs;
  unsigned maximum_rarity;
  std::string_view evidenceKey;
  std::array<unsigned, 2> failure_loss_range;
  std::array<unsigned, 4> failure_loss_weights;
};

struct DropDefinition {
  sim::Mob mob;
  sim::Petal petal;
  sim::Rarity rarity;
  double probability;
  sim::Rarity mob_rarity = sim::Rarity::common;
};

struct LevelTable {
  std::uint32_t maximum_level;
  unsigned initial_main_slots;
  unsigned maximum_main_slots;
  std::array<std::uint32_t, 3> slot_unlock_levels;
};

[[nodiscard]] const CraftTable& craft_table();
[[nodiscard]] const LevelTable& level_table();
// Index L-1 is level L's cumulative XP; index maximum_level is the sentinel
// for progress encoding at the client byte's level cap.
[[nodiscard]] std::span<const std::uint64_t> xp_thresholds();
[[nodiscard]] std::span<const DropDefinition> drop_table();
[[nodiscard]] inline std::uint32_t level_for_xp(std::uint64_t xp) {
  const auto thresholds = xp_thresholds();
  return std::min(
      level_table().maximum_level,
      static_cast<std::uint32_t>(std::upper_bound(thresholds.begin(), thresholds.end(), xp) -
                                 thresholds.begin()));
}
[[nodiscard]] inline unsigned unlocked_main_slots(std::uint32_t level) {
  const auto& table = level_table();
  return std::min(
      table.maximum_main_slots,
      table.initial_main_slots +
          static_cast<unsigned>(std::upper_bound(table.slot_unlock_levels.begin(),
                                                 table.slot_unlock_levels.end(), level) -
                                table.slot_unlock_levels.begin()));
}

[[nodiscard]] inline std::optional<unsigned>
client_petal(sim::Petal kind, sim::Rarity rarity = sim::Rarity::common) {
  if (static_cast<unsigned>(rarity) >= 6) {
    return std::nullopt;
  }
  for (const auto& entry : petal_registry()) {
    if (entry.kind == kind) {
      return entry.client_id;
    }
  }
  return std::nullopt;
}

[[nodiscard]] inline std::optional<sim::Petal> petal_from_client(unsigned client_id) {
  for (const auto& entry : petal_registry()) {
    if (entry.client_id == client_id) {
      return entry.kind;
    }
  }
  return std::nullopt;
}

[[nodiscard]] inline std::optional<unsigned> client_mob(sim::Mob kind, sim::Rarity rarity,
                                                        sim::Group group = sim::Group::main_mob) {
  const auto* entry = dated().mob(kind, rarity);
  if (!entry) {
    return std::nullopt;
  }
  if (group == sim::Group::ant_hole && kind != sim::Mob::fire_ant_burrow) {
    return 9;
  }
  if (group == sim::Group::segment && entry->segment_client_id) {
    return entry->segment_client_id;
  }
  return entry->client_id;
}

[[nodiscard]] inline unsigned client_rarity(sim::Rarity rarity) {
  const auto result = static_cast<unsigned>(rarity);
  if (result >= 6) {
    throw std::invalid_argument("rarity outside the October 2022 client catalog");
  }
  return result;
}

}  // namespace wave::catalog

#include "catalog/generated.hpp"
