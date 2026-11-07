#pragma once
#include "engine/catalog/ids.hpp"
#include "engine/core/f32.hpp"
#include "engine/core/vec2.hpp"
#include "engine/model/attack_behavior.hpp"
#include "engine/model/player_id.hpp"
#include "engine/model/state_flags.hpp"
#include <array>
#include <bitset>
#include <cstdint>
#include <limits>
#include <memory>
#include <string>
#include <vector>

namespace engine {

struct EffectPayload;

inline constexpr std::uint32_t kEntityIndexBits = 14;
inline constexpr std::uint32_t kEntityIndexMask = (1U << kEntityIndexBits) - 1U;
inline constexpr std::uint32_t kEntityGenerationShift = kEntityIndexBits;
inline constexpr std::uint32_t kEntitySlotCount = 16384;

/** 32-bit entity handle: low 14 bits index, high 18 bits generation.
 * The wire representation is rotated left by 14 bits. */
struct EntityHandle {
  std::uint32_t raw = 0;

  [[nodiscard]] static constexpr EntityHandle from_parts(std::uint32_t index,
                                                         std::uint32_t generation) {
    return EntityHandle{(index & kEntityIndexMask) | (generation << kEntityGenerationShift)};
  }
  [[nodiscard]] static constexpr EntityHandle from_wire(std::uint32_t wire) {
    return EntityHandle{rotl(wire, kEntityIndexBits)};
  }
  [[nodiscard]] constexpr std::uint32_t to_wire() const { return rotr(raw, kEntityIndexBits); }
  [[nodiscard]] constexpr std::uint32_t index() const { return raw & kEntityIndexMask; }
  [[nodiscard]] constexpr std::uint32_t generation() const { return raw >> kEntityGenerationShift; }
  [[nodiscard]] constexpr bool valid() const { return raw != 0; }
  [[nodiscard]] constexpr bool operator==(const EntityHandle&) const = default;

 private:
  [[nodiscard]] static constexpr std::uint32_t rotl(std::uint32_t value, unsigned count) {
    return (value << count) | (value >> (32U - count));
  }
  [[nodiscard]] static constexpr std::uint32_t rotr(std::uint32_t value, unsigned count) {
    return (value >> count) | (value << (32U - count));
  }
};

enum class EntityKind : std::uint8_t {
  kNone = 0,
  kPlayer = 1,
  kMob = 2,
  kPetal = 3,
  kDrop = 4,
  kProjectile = 5,
};

/** Effect families. The tick publishes three flags: damage (poison),
 * healing suppression and movement slow. */
enum class EffectType : std::uint8_t {
  kPoison = 1,
  kHealBlock = 2,
  kSlow = 3,
};

/** Value snapshot of a server-created attack. Handles retain their generation;
 * player identity and name survive the source body/entity and its slot reuse. */
struct DamageSource {
  EntityHandle entity{};
  EntityHandle body{};
  PlayerId player{};
  LifeEpoch life = 0;
  EntityKind kind = EntityKind::kNone;
  catalog::SpeciesId species_id = catalog::SpeciesId::kNone;
  catalog::PetalId petal_id = catalog::PetalId::kNone;
  std::string name;
};

inline constexpr std::size_t kMaxEffects = 8;
inline constexpr std::size_t kCollisionLayerCount = 30;

/** One timed effect instance. `intensity` is damage per second for poison and a
 * 0..1 speed multiplier for slow; remaining time is milliseconds. The optional
 * payload is the shared area-effect object: every target in an area holds the
 * same pointer, following the unique-owner transfer rule. */
struct Effect {
  EffectType type = EffectType::kPoison;
  EntityHandle source{};
  double remaining_ms = 0.0;
  f32 intensity = f32(0.0F);
  bool active = false;
  std::shared_ptr<EffectPayload> payload;
  DamageSource attribution;
};

/** AI family profiles. Each family's parameters are written by its own
 * `configure_*` initializer; the enumerator names are domain names. */
enum class AiFamily : std::uint8_t {
  kNone = 0,
  kLadybug = 1,
  kAnt = 2,
  kCentipede = 3,
  kBeetle = 4,
};

/** Behavior-modifier multipliers applied by the AI update. Defaults are 1, so
 * a profile without modifiers keeps its authored speed, turn and attack
 * numbers; buffs and debuffs scale those values. */
struct AiModifiers {
  f32 speed = f32(1.0F);
  f32 turn = f32(1.0F);
  f32 attack = f32(1.0F);
};

/** Per-mob AI record: numbers are domain units (ms, radians, px) and the
 * target/owner links are entity handles. */
struct AiState {
  std::uint8_t activity_flags = 0;  // Activity bits latched by the AI and published as field 36.
  bool enabled = false;
  bool aggressive = false;   // Seeks targets instead of following the idle path.
  bool can_alert = false;    // Accepts an attacker as target when damaged.
  bool chase = false;        // Closes in with lead prediction.
  bool angle_locked = true;  // Faces the computed direction directly; otherwise turns at turn_rate.
  bool wave_enabled = false;       // Modulates idle speed and turn as a wave.
  bool sine_enabled = false;       // Adds an idle sine wobble to the angle.
  bool guard_active = false;       // Moving back to the guard point.
  bool timer_active = false;       // Random-angle timer armed.
  f32 turn_rate = f32(0.0F);       // Maximum turn per ms (radians).
  f32 drift_rate = f32(0.2F);      // Idle drift rate.
  f32 idle_speed = f32(1.0F);      // Speed along the idle path.
  f32 wave_frequency = f32(0.0F);  // Wave cycles per ms.
  f32 wave_power = f32(2.0F);      // Wave curvature.
  f32 wave_amplitude = f32(1.0F);  // Wave amplitude.
  f32 sine_frequency = f32(0.0F);  // Sine wobble cycles per ms.
  f32 sine_amplitude = f32(0.0F);  // Sine wobble amplitude (radians).
  double timer_interval_ms = 0.0;  // Random-angle timer interval (ms).
  f32 territory = f32(0.0F);       // Arena threshold fraction.
  f32 lead_divisor = f32(1.0F);    // Divisor applied to the target's velocity for lead prediction.
  f32 chase_speed = f32(2.4F);     // Speed while chasing.
  f32 radius = f32(0.0F);          // Target acquisition radius.
  f32 range_multiplier = f32(1.5F);  // Multiplier on the catalog attack range.
  f32 attack_range = f32(0.0F);      // Strafe/attack distance from the target.
  f32 attack_speed = f32(0.0F);      // Speed while inside attack range.
  f32 guard_radius = f32(500.0F);    // Radius around the guard point.
  f32 leash = f32(1000.0F);          // Distance from home that triggers a return.
  AttackBehavior attack = AttackBehavior::kNone;
  f32 attack_cooldown_gain = f32(1000.0F);  // Cooldown added per attack (ms).
  f32 attack_cooldown_ms = f32(0.0F);       // Remaining attack cooldown (ms).
  f32 current_angle = f32(0.0F);            // Current drift angle (radians).
  std::uint8_t behavior_choice = 0;  // Configure-time draw between the two behavior variants.
  double timer_deadline_ms = 0.0;    // Deadline of the random-angle timer.
  double clock_ms = 0.0;             // AI clock advanced by the tick.
  EntityHandle owner{};              // Owner of a summoned body, if any.
  /** Linked-segment predecessor. Only a segment whose predecessor AI is alive
   * adopts its target; a plain owner does not gate the AI update. */
  EntityHandle predecessor{};
  EntityHandle target{};
  Vec2 guard_point;  // Guard point (x, y).
  Vec2 home;
  bool returning = false;
  AiFamily family = AiFamily::kNone;
  AiModifiers modifiers;
  std::uint8_t variant = 0;  // ladybug variant / ant caste / centipede head
  bool worker = false;
  bool soldier = false;
  bool evil = false;
  bool head = false;
  bool rare = false;
};

/** Cached collision rectangle including attached children. */
struct EntityBounds {
  f32 min_x = f32(0.0F);
  f32 min_y = f32(0.0F);
  f32 max_x = f32(0.0F);
  f32 max_y = f32(0.0F);
  bool valid = false;
  std::uint64_t epoch = 0;
};

/** Domain entity. Protocol offsets exist only in the generated protocol
 * views; this struct is the simulation's own representation. */
struct Entity {
  EntityHandle handle;
  EntityKind kind = EntityKind::kNone;
  catalog::SpeciesId species_id = catalog::SpeciesId::kNone;
  catalog::PetalId petal_id = catalog::PetalId::kNone;
  // The look byte packs the aim direction; the expression byte carries action
  // bits in its low two bits. Both stay separate from the semantic species id.
  std::uint8_t player_look = 0;
  std::uint8_t player_expression = 0;
  Vec2 position;
  // Track each changed axis write, including movement followed by a clamp
  // back to its previous tick value. Numeric f32 equality keeps +/-0 equal.
  std::uint64_t position_x_revision = 0;
  std::uint64_t position_y_revision = 0;
  void set_position_x(f32 value) {
    if (position.x != value) {
      position.x = value;
      ++position_x_revision;
    }
  }
  void set_position_y(f32 value) {
    if (position.y != value) {
      position.y = value;
      ++position_y_revision;
    }
  }
  void set_position(Vec2 value) {
    set_position_x(value.x);
    set_position_y(value.y);
  }
  Vec2d velocity;      // Position change per ms (f64).
  Vec2d acceleration;  // Per-tick impulse applied to velocity (f64).
  f32 angle;
  f32 angular_velocity = f32(0.0F);  // Radians per ms.
  f32 radius;                        // draw radius from the catalog record
  f32 collision_radius;              // Radius used by the contact solver.
  /** Product of the entity's behavior modifiers. Keeps the multiplicative
   * effect on AI speed without reconstructing a vtable. */
  f32 behavior_speed_multiplier = f32(1.0F);
  /** Web tag projectiles skip the ordinary contact response. */
  bool skips_contact_response = false;
  /** Contact solver uses both bodies' mass-weighted response. Cleared for
   * Rock/Boulder/Cactus and Ant Hole, which use the full-overlap push. */
  bool uses_mass_weighted_response = true;
  /** Mass used by the mass-weighted contact response (every body keeps 1.0). */
  f32 mass = f32(1.0F);
  /** Score component used by Web tags and death scoring. */
  bool has_score_component = false;
  std::uint32_t score_epoch = 0;
  f32 score_value = f32(0.0F);
  /** Presence of the Web tag component and the effect-area component. */
  bool has_tag_component = false;
  bool has_effect_area = false;
  /** Packet-cache epochs written by the component setters. */
  std::uint32_t packet_epoch_a = 0;
  std::uint32_t packet_epoch_b = 0;
  f32 health = f32(1.0F);
  f32 max_health = f32(1.0F);
  f32 contact_damage;                  // Damage dealt to bodies touching this one.
  double lifetime_remaining_ms = 0.0;  // Pickup expiry countdown (ms).
  std::uint32_t owner = std::numeric_limits<std::uint32_t>::max();
  /** Creation-time control identity for attacks whose physical parent can
   * disappear. Ordinary live ownership chains still resolve through the
   * parent link. */
  EntityHandle control_root{};
  bool world_controlled = false;
  /** Raw flag bytes are published in the snapshot. The domain interprets only
   * the named bits in state_flags.hpp; remaining bits stay wire/catalog state. */
  std::uint8_t world_flags = 0;
  std::uint8_t entity_flags = 0;

  std::uint8_t loadout_slot = 0xFF;
  std::uint8_t loadout_instance = 0;
  std::uint8_t spawn_band = 0xFF;
  /** Loot table entries attached at spawn. */
  std::array<catalog::PetalId, 8> loot_petals{};
  std::uint8_t loot_count = 0;
  EntityHandle last_attacker{};
  DamageSource attribution;
  DamageSource last_damage_source;
  std::string killer_name;
  AiState ai;
  std::array<Effect, kMaxEffects> effects{};
  std::uint8_t effect_count = 0;
  std::uint8_t effect_flags = 0;
  /** Last poison feedback time; independent of the damage tick. */
  double poison_hit_time_ms = -std::numeric_limits<double>::infinity();
  std::array<std::uint8_t, 4> layer_flags{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_thresholds{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_sides{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_sides_alt{};
  std::uint32_t layer_probe = 0;
  bool layer_ignore_ranges = false;
  std::uint8_t layer_side_selector = 0;
  std::uint32_t hit_epoch = 0;
  /** Projectile petal callback state; independent of the equipped slot. */
  bool petal_launched = false;
  /** Named PetalVariantFlag bits written by the Peas split. */
  std::uint8_t petal_variant_flags = 0;
  double behavior_cooldown_ms = 0.0;
  /** Creation epoch used by the archived peer's one-tick arrival marker. */
  std::uint64_t spawn_tick = 0;
  bool active = false;
  bool death_processed = false;
  bool death_flag = false;
  double death_time_ms = 0.0;
  /** Attached-child list used by collision bounds and the death recursion. */
  std::vector<EntityHandle> children;
  EntityBounds bounds_cache;
  bool bounds_dirty = true;
  /** Intrusive pickup-list links. */
  EntityHandle pickup_prev{};
  EntityHandle pickup_next{};
  bool pickup_listed = false;
  /** Set once the pickup is collected; the deadline expires a transferred pickup. */
  bool pickup_collected = false;
  PlayerId pickup_recipient{};
  double pickup_transfer_deadline_ms = 0.0;
};

}  // namespace engine
