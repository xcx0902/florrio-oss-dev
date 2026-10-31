#pragma once
#include "engine/core/f32.hpp"
#include "engine/core/vec2.hpp"
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

  [[nodiscard]] static constexpr EntityHandle from_parts(std::uint32_t index, std::uint32_t generation) {
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

/** Recovered server effect families. The tick publishes three flags: damage
 * (poison), healing suppression and movement slow. */
enum class EffectType : std::uint8_t {
  kPoison = 1,
  kHealBlock = 2,
  kSlow = 3,
};

inline constexpr std::size_t kMaxEffects = 8;
inline constexpr std::size_t kCollisionLayerCount = 30;

/** One timed effect instance. `intensity` is damage per second for poison and a
 * 0..1 speed multiplier for slow; remaining time is milliseconds. The optional
 * payload is the shared area-effect object: every target in an area holds the
 * same pointer, matching the original unique-owner transfer in function 271. */
struct Effect {
  EffectType type = EffectType::kPoison;
  EntityHandle source{};
  double remaining_ms = 0.0;
  f32 intensity = f32(0.0F);
  bool active = false;
  std::shared_ptr<EffectPayload> payload;
};

/** Recovered AI family profiles. Family-specific parameters are written by
 * original 205/208/210/415; the names here are domain names, not offsets. */
enum class AiFamily : std::uint8_t {
  kNone = 0,
  kLadybug = 1,
  kAnt = 2,
  kCentipede = 3,
  kBeetle = 4,
};

/** Server AI record. A 92-byte behavior struct lives at AI+60 and keeps the
 * target as an intrusive handle. The field names below are domain names for
 * the protocol offsets; see docs/semantics/ai.md for the offset table. */
/** Behavior-modifier multipliers applied by the AI update. Defaults are 1 so
 * shipped mobs are unchanged; the original vtable exposes speed/turn/attack
 * modifiers for buffs/debuffs and scripted variants. */
struct AiModifiers {
  f32 speed = f32(1.0F);
  f32 turn = f32(1.0F);
  f32 attack = f32(1.0F);
};

struct AiState {
  std::uint8_t activity_flags = 0; // Original AI+8 / snapshot36, latched in AI.
  bool enabled = false;
  bool aggressive = false;      // AI+108: seek targets
  bool can_alert = false;       // AI+109: accept attacker aggro
  bool chase = false;           // AI+110: lead-prediction movement
  bool angle_locked = true;     // AI+64: face the computed direction directly
  bool wave_enabled = false;    // AI+76: idle wave speed/turn modulation
  bool sine_enabled = false;    // AI+88: idle sine angle wobble
  bool guard_active = false;    // AI+184: moving to the guard point
  bool clock_valid = true;      // AI+16: server clock is available
  bool timer_active = false;    // AI+32: random-angle timer armed
  f32 turn_rate = f32(0.0F);        // AI+60
  f32 drift_rate = f32(0.2F);       // AI+68
  f32 idle_speed = f32(1.0F);       // AI+72
  f32 wave_frequency = f32(0.0F);   // AI+80
  f32 wave_power = f32(2.0F);       // AI+84
  f32 wave_amplitude = f32(1.0F);   // AI+76
  f32 sine_frequency = f32(0.0F);   // AI+92
  f32 sine_amplitude = f32(0.0F);   // AI+96
  double timer_interval_ms = 0.0;   // AI+100
  f32 territory = f32(0.0F);        // AI+104: arena threshold fraction
  f32 lead_divisor = f32(1.0F);     // AI+112
  f32 chase_speed = f32(2.4F);      // AI+116
  f32 radius = f32(0.0F);           // AI+120: acquisition radius
  f32 range_multiplier = f32(1.5F); // AI+124
  f32 attack_range = f32(0.0F);     // AI+128: strafe/attack distance
  f32 attack_speed = f32(0.0F);     // AI+132: speed inside attack range
  f32 guard_radius = f32(500.0F);   // AI+136
  f32 leash = f32(1000.0F);         // AI+140
  std::uint32_t attack_callback = 0; // AI+144: original indirect callback id
  f32 attack_cooldown_gain = f32(1000.0F); // AI+148
  f32 attack_cooldown_ms = f32(0.0F);      // AI+56
  f32 current_angle = f32(0.0F);    // AI+52: generic-AI drift angle
  std::uint8_t behavior_choice = 0; // AI+48: configureBehavior(0,1) draw
  double timer_deadline_ms = 0.0;   // AI+40
  double clock_ms = 0.0;            // AI+24
  EntityHandle owner{};             // AI+164
  /** Linked-segment predecessor (original entity+212 links). Only segments
   * with a live predecessor AI adopt its target; a plain owner does not gate
   * the AI update. */
  EntityHandle predecessor{};
  EntityHandle target{};
  Vec2 guard_point;                 // AI+176/+180
  Vec2 home;
  bool returning = false;
  double retarget_ms = 0.0;
  AiFamily family = AiFamily::kNone;
  AiModifiers modifiers;
  std::uint8_t variant = 0;        // ladybug variant / ant caste / centipede head
  bool worker = false;
  bool soldier = false;
  bool evil = false;
  bool head = false;
  bool rare = false;
};

/** Cached collision rectangle including attached children (original 167). */
struct EntityBounds {
  f32 min_x = f32(0.0F);
  f32 min_y = f32(0.0F);
  f32 max_x = f32(0.0F);
  f32 max_y = f32(0.0F);
  bool valid = false;
  std::uint64_t epoch = 0;
};

/** Domain entity. This is deliberately not a view over the original 496-byte
 * record; protocol offsets live only in the generated protocol views. */
struct Entity {
  EntityHandle handle;
  EntityKind kind = EntityKind::kNone;
  std::uint16_t type_id = 0;
  // Original avatar bytes: field 2 is packed aim, field 31 carries action
  // bits in its low two bits. Keep these separate from semantic species.
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
  Vec2d velocity;          // original transform +40/+48 (f64, px per ms)
  Vec2d acceleration;      // original transform +56/+64 (f64 per-tick impulse)
  f32 angle;
  f32 angular_velocity = f32(0.0F); // original transform +72 (radians per ms)
  f32 radius;              // draw radius from the catalog record
  f32 collision_radius;    // physics +8
  /** Product of the entity's behavior modifier callbacks (original entity+192).
   * The native vtable is not reconstructed; this retains the multiplicative
   * effect on AI speed. */
  f32 behavior_speed_multiplier = f32(1.0F);
  /** Physics +50: Web tag / one-shot collision marker. */
  bool physics_flag50 = false;
  /** Physics +48: mass-weighted contact path. Cleared for Rock/Boulder/Cactus
   * and Ant Hole, which use the full-overlap push in original 390. */
  bool physics_flag48 = true;
  /** Physics +40 mass (every shipped body keeps 1.0). */
  f32 mass = f32(1.0F);
  /** Entity+184 score component. The original allocates a 16-byte record with
   * epoch/score fields for Web tags and death scoring. */
  bool has_score_component = false;
  std::uint32_t score_epoch = 0;
  f32 score_value = f32(0.0F);
  /** Entity+140 Web tag component and entity+208 effect-area component. */
  bool has_tag_component = false;
  bool has_effect_area = false;
  /** Packet-cache epochs written by the component setters (entity+344/+348). */
  std::uint32_t packet_epoch_a = 0;
  std::uint32_t packet_epoch_b = 0;
  f32 health = f32(1.0F);
  f32 max_health = f32(1.0F);
  f32 contact_damage;      // physics +44
  double lifetime_remaining_ms = 0.0;  // pickup +32 countdown
  std::uint32_t owner = std::numeric_limits<std::uint32_t>::max();
  std::uint32_t flags = 0;
  std::uint8_t world_flags = 0;   // original entity +95
  std::uint8_t entity_flags = 0;  // original entity +93
  std::uint8_t component_flags92 = 0;

  std::uint8_t loadout_slot = 0xFF;
  std::uint8_t loadout_instance = 0;
  std::uint8_t spawn_band = 0xFF;
  /** Loot entries attached at spawn by the component draws (original loot+8/+9). */
  std::array<std::uint16_t, 8> loot_petals{};
  std::uint8_t loot_count = 0;
  EntityHandle last_attacker{};
  std::string killer_name;
  AiState ai;
  std::array<Effect, kMaxEffects> effects{};
  std::uint8_t effect_count = 0;
  std::uint8_t effect_flags = 0;
  /** Original effects+40/+48: last poison feedback, independent of damage. */
  double poison_hit_time_ms = -std::numeric_limits<double>::infinity();
  std::array<std::uint8_t, 4> layer_flags{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_thresholds{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_sides{};
  std::array<std::uint32_t, kCollisionLayerCount> layer_sides_alt{};
  std::uint32_t layer_probe = 0;
  bool layer_ignore_ranges = false;
  std::uint8_t layer_side_selector = 0;
  std::uint32_t hit_epoch = 0;
  std::uint32_t last_hit_epoch = 0;
  std::uint32_t hit_count = 0;
  /** Projectile petal callback state; independent of the equipped slot. */
  bool petal_launched = false;
  /** Original render+8 flags written by Peas split (0, 1 or 3). */
  std::uint8_t petal_render_flags = 0;
  double behavior_cooldown_ms = 0.0;
  /** Creation epoch used by the archived peer's one-tick arrival marker. */
  std::uint64_t spawn_tick = 0;
  bool active = false;
  bool death_processed = false;
  bool death_flag = false;
  double death_time_ms = 0.0;
  /** Intrusive attached-child list used by collision bounds and the death
   * recursion. The original links entities through +84; domain code uses the
   * handle list directly. */
  std::vector<EntityHandle> children;
  EntityBounds bounds_cache;
  bool bounds_dirty = true;
  /** Pickup intrusive list links (world +36/+44 in the original). */
  EntityHandle pickup_prev{};
  EntityHandle pickup_next{};
  bool pickup_listed = false;
  /** Original pickup+9 bit 0 and +32 absolute expiry after a slot transfer. */
  bool pickup_collected = false;
  double pickup_transfer_deadline_ms = 0.0;
  /** Effect-vector epoch used by the shared area payload. */
  std::uint32_t effect_epoch = 0;
};

} // namespace engine
