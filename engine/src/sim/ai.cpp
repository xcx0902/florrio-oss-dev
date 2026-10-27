#include "engine/sim/ai.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spatial.hpp"
#include <algorithm>
#include <cmath>
#include <vector>

namespace engine {

namespace ai_debug {
std::uint32_t last_timer_handle = 0;
std::uint32_t timer_fires = 0;
} // namespace ai_debug

namespace {

constexpr double kTau = 6.283185307179586476925286766559;
constexpr double kHalfPi = 1.5707963267948966192313216916398;
// Exact shipped f32 0x1.9999ap-34. Its low bits differ from f32(0.2 / 2^31),
// enough to alter some ants' turn speeds and subsequent simulation state.
constexpr double kAntRandomTurnScale = (0x19999a / 1048576.0) * 0x1p-34;
// f32(2 * pi / 2^31), the original random-angle scale.
constexpr float kRandomAngleScale = 2.925836239953128e-09F;

bool is_actor(const Entity& entity) {
  return entity.kind == EntityKind::kPlayer || entity.kind == EntityKind::kMob;
}

f32 distance_squared(const Vec2& first, const Vec2& second) {
  const f32 dx = first.x - second.x;
  const f32 dy = first.y - second.y;
  return dx * dx + dy * dy;
}

double distance_squared_d(const Vec2& first, const Vec2& second) {
  const double dx = static_cast<double>(first.x.value) - static_cast<double>(second.x.value);
  const double dy = static_cast<double>(first.y.value) - static_cast<double>(second.y.value);
  return dx * dx + dy * dy;
}

double wrap_pi(double value) {
  double wrapped = std::fmod(value, kTau);
  if (wrapped < -3.141592653589793) wrapped += kTau;
  if (wrapped > 3.141592653589793) wrapped -= kTau;
  return wrapped;
}

f32 random_fraction(ServerRng& rng) {
  return f32(static_cast<float>(rng.next() - 1U)) * f32(0x1p-31f);
}

/** Common behavior defaults from original 115 / writeDefaultAi. */
void apply_default_ai(Entity& entity, AiFamily family) {
  AiState& ai = entity.ai;
  ai.enabled = true;
  ai.family = family;
  ai.aggressive = false;
  ai.can_alert = false;
  ai.chase = false;
  // Runtime probes of the shipped AI records show AI+64 set and AI+60 zero for
  // the generic/default behavior; only Square and Centipede write a non-zero
  // turn rate.
  ai.angle_locked = true;
  ai.wave_enabled = false;
  ai.sine_enabled = false;
  ai.turn_rate = f32(0.0F);
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(0.2F);
  ai.wave_frequency = f32(0.0F);
  ai.wave_power = f32(1.0F);
  ai.sine_frequency = f32(0.0F);
  ai.sine_amplitude = f32(0.0F);
  ai.timer_interval_ms = 0.0;
  ai.territory = f32(0.0F);
  ai.lead_divisor = f32(1.0F);
  ai.chase_speed = f32(2.4F);
  ai.radius = f32(1000.0F);
  ai.range_multiplier = f32(1.5F);
  ai.attack_range = f32(0.0F);
  ai.attack_speed = f32(0.0F);
  ai.guard_radius = f32(500.0F);
  ai.leash = f32(1000.0F);
  ai.attack_callback = 0;
  ai.attack_cooldown_gain = f32(1000.0F);
  ai.attack_cooldown_ms = f32(0.0F);
  ai.current_angle = f32(0.0F);
  ai.guard_active = false;
  ai.guard_point = Vec2{};
  ai.home = entity.position;
}

void arm_timer(AiState& ai, double now_ms) {
  // Original 114 reads the binary32 settings interval for the first deadline
  // as well as every subsequent re-arm.
  ai.timer_interval_ms = static_cast<double>(f32::from_double(ai.timer_interval_ms).value);
  ai.timer_active = ai.timer_interval_ms > 0.0;
  ai.timer_deadline_ms = ai.timer_active ? now_ms + ai.timer_interval_ms : 0.0;
}

/** Original 114 configureBehavior RNG sequence: one orientation draw, the
 * libc++ uniform_int_distribution(0,1) call (exactly one 31-bit draw for this
 * range), and a second orientation draw only when the settings byte at +4 is
 * clear. The drawn bit and angle are stored for behavior parity. */
void configure_behavior_draws(ServerRng& rng, AiState& ai, bool same_angle) {
  const auto orientation = [&rng]() {
    const f32 sample(static_cast<float>(rng.next() - 1U));
    return f32(sample.value * kRandomAngleScale);
  };
  const f32 first = orientation();
  ai.behavior_choice = static_cast<std::uint8_t>((rng.next() - 1U) & 1U);
  ai.current_angle = same_angle ? first : orientation();
}

} // namespace

EntityHandle controlling_root(const World& world, EntityHandle handle) {
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    const Entity* entity = world.entities().get(handle);
    if (entity == nullptr) return handle;
    if (entity->owner != std::numeric_limits<std::uint32_t>::max()) {
      const EntityHandle owner{entity->owner};
      if (world.entities().get(owner) != nullptr) {
        handle = owner;
        continue;
      }
    }
    return handle;
  }
  return handle;
}

bool same_controlling_root(const World& world, EntityHandle first, EntityHandle second) {
  const EntityHandle a = controlling_root(world, first);
  const EntityHandle b = controlling_root(world, second);
  const Entity* root_a = world.entities().get(a);
  const Entity* root_b = world.entities().get(b);
  if (root_a == nullptr || root_b == nullptr) return false;
  if (a == b) return true;
  // The domain has no manager entity. Uncontrolled mob roots all represent
  // that one original controller; pets instead end at their owning player.
  return root_a->kind == EntityKind::kMob && root_b->kind == EntityKind::kMob;
}

bool target_eligible(const World& world, const Entity& seeker, const Entity& target) {
  if (target.health.value <= 0.0F) return false;
  if (!is_actor(target)) return false;
  const bool has_owner = seeker.owner != std::numeric_limits<std::uint32_t>::max();
  const f32 arena_scale = has_owner ? f32(-0.5F)
                                    : f32(seeker.ai.territory.value - 0.5F);
  const f32 arena_threshold = world.width() * arena_scale;
  if (target.position.x.value < arena_threshold.value) return false;
  const f32 range = seeker.ai.radius * seeker.ai.range_multiplier;
  if (distance_squared(seeker.position, target.position).value > range.value * range.value)
    return false;
  if (has_owner) {
    const Entity* owner = world.entities().get(EntityHandle{seeker.owner});
    if (owner != nullptr) {
      const f32 leash = seeker.ai.leash;
      if (distance_squared(owner->position, target.position).value > leash.value * leash.value)
        return false;
    }
  }
  return !same_controlling_root(world, seeker.handle, target.handle);
}

std::size_t alert_nearby(World& world, EntityHandle attacker, f32 radius) {
  const Entity* source = world.entities().get(attacker);
  if (source == nullptr) return 0;
  std::size_t changed = 0;
  const f32 radius_squared = radius * radius;
  // Original 196 walks the quadtree with the recovered 0,2,1,3 quadrant order.
  SpatialQuery query = SpatialQuery::from_world(world);
  std::vector<EntityHandle> candidates;
  query.query_circle(source->position, radius, candidates);
  for (const EntityHandle handle : candidates) {
    Entity* entity = world.entities().get(handle);
    if (entity == nullptr || !entity->active || entity->kind != EntityKind::kMob) continue;
    if (!entity->ai.enabled || !entity->ai.can_alert) continue;
    if (entity->ai.target.valid()) continue;
    if (distance_squared(entity->position, source->position).value > radius_squared.value)
      continue;
    if (!target_eligible(world, *entity, *source)) continue;
    entity->ai.target = attacker;
    entity->ai.returning = false;
    ++changed;
  }
  return changed;
}

EntityHandle find_target(const World& world, EntityHandle seeker_handle) {
  const SpatialQuery query = SpatialQuery::from_world(world);
  return find_target(world, query, seeker_handle);
}

EntityHandle find_target(const World& world, const SpatialQuery& query,
                         EntityHandle seeker_handle) {
  const Entity* seeker = world.entities().get(seeker_handle);
  if (seeker == nullptr || !seeker->ai.enabled) return EntityHandle{};
  const f32 search_radius = seeker->ai.radius;
  const f32 radius = search_radius;
  // Aabb is min/max (not origin+size): the query square is centre +/- radius.
  const Aabb area{seeker->position.x - search_radius, seeker->position.y - search_radius,
                  seeker->position.x + search_radius, seeker->position.y + search_radius};
  std::vector<EntityHandle> candidates;
  query.query_box(area, candidates);
  EntityHandle best{};
  double best_distance = 0.0;
  bool best_is_player = false;
  bool best_is_aggressive = false;
  for (const EntityHandle handle : candidates) {
    const Entity* entity = world.entities().get(handle);
    if (entity == nullptr || !entity->active || entity->handle == seeker_handle) continue;
    if (!is_actor(*entity)) continue;
    // Original 197 tests entity+224, not the ordinary +236 owner handle.
    // An Egg pet has +224 == 0 and remains an eligible actor.
    const double distance = distance_squared_d(seeker->position, entity->position);
    if (distance >= static_cast<double>(radius.value) * static_cast<double>(radius.value)) continue;
    const bool candidate_is_player = entity->kind == EntityKind::kPlayer;
    const bool candidate_is_aggressive = entity->kind == EntityKind::kMob && entity->ai.aggressive;
    if (best.valid()) {
      bool prefer = false;
      if (best_is_player && !candidate_is_player) continue;
      if (!best_is_player && candidate_is_player) prefer = true;
      else if (candidate_is_aggressive != best_is_aggressive) prefer = candidate_is_aggressive;
      if (!prefer && !(distance < best_distance)) continue;
    }
    if (!target_eligible(world, *seeker, *entity)) continue;
    best = entity->handle;
    best_distance = distance;
    best_is_player = candidate_is_player;
    best_is_aggressive = candidate_is_aggressive;
  }
  return best;
}

EntityHandle find_pickup_recipient(const World& world, EntityHandle source_handle) {
  const Entity* source = world.entities().get(source_handle);
  if (source == nullptr) return EntityHandle{};
  const Entity* player = world.entities().get(world.player());
  if (player == nullptr || player->health.value <= 0.0F) return EntityHandle{};
  const std::uint8_t capacity = world.profile().inventory_size();
  bool open = false;
  for (std::uint8_t slot = 0; slot < capacity; ++slot)
    if (world.loadout().slots()[slot].count == 0) { open = true; break; }
  if (!open) return EntityHandle{};
  // Original198 uses cached world coordinates and squared distance in f64.
  if (distance_squared_d(source->position, player->position) >= 4900.0) return EntityHandle{};
  return player->handle;
}

void configure_mob_ai(Entity& entity, f32 radius, f32 speed, bool aggressive,
                      bool can_alert) {
  apply_default_ai(entity, AiFamily::kNone);
  entity.ai.aggressive = aggressive;
  entity.ai.can_alert = can_alert;
  entity.ai.radius = radius;
  entity.ai.wave_frequency = speed;
  entity.ai.timer_interval_ms = speed.value > 0.0F
    ? static_cast<double>(kTau) / static_cast<double>(speed.value) : 0.0;
  entity.ai.wave_enabled = true;
  entity.ai.wave_power = f32(2.0F);
  arm_timer(entity.ai, 0.0);
}

void configure_ladybug(Entity& entity, int variant, ServerRng& rng) {
  entity.contact_damage = f32(10.0F);
  const bool massive = variant == -1;
  const bool marked = variant == 1 || variant == 2;
  apply_default_ai(entity, AiFamily::kLadybug);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = massive ? f32(0.2F) : f32(1.0F);
  ai.wave_enabled = true;
  ai.wave_frequency = massive ? f32(0.001F) : f32(0.002F);
  ai.wave_power = f32(2.0F);
  ai.timer_interval_ms = static_cast<double>(kTau) / static_cast<double>(ai.wave_frequency.value);
  ai.can_alert = marked;
  ai.radius = f32(1000.0F);
  ai.range_multiplier = f32(1.5F);
  ai.chase_speed = f32(2.4F);
  ai.variant = static_cast<std::uint8_t>(massive ? 255 : variant);
  ai.worker = marked;
  entity.max_health = massive ? f32(1000.0F) : marked ? f32(35.0F) : f32(25.0F);
  entity.health = entity.max_health;
  const f32 body_radius = massive ? f32(120.0F) : f32(30.0F);
  entity.radius = body_radius;
  entity.collision_radius = body_radius;
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_ant(Entity& entity, std::uint8_t caste, ServerRng& rng) {
  entity.contact_damage = f32(10.0F);
  const std::uint32_t sample = rng.next();
  const f32 random = f32(static_cast<float>(static_cast<std::uint32_t>(sample - 1U)));
  const f32 scaled = f32::from_double(static_cast<double>(random.value) * kAntRandomTurnScale);
  const f32 variation = f32(scaled.value + f32(0.9F).value);
  const f32 speed = f32::from_double(static_cast<double>(variation.value) * 0.002);
  apply_default_ai(entity, AiFamily::kAnt);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(1.0F);
  ai.wave_enabled = true;
  ai.wave_frequency = speed;
  ai.wave_power = f32(2.0F);
  ai.timer_interval_ms = static_cast<double>(kTau) / static_cast<double>(speed.value);
  ai.variant = caste;
  static constexpr std::array<float, 4> kHealth{{10.0F, 25.0F, 40.0F, 200.0F}};
  static constexpr std::array<float, 4> kRadius{{14.0F, 20.0F, 20.0F, 40.0F}};
  const std::uint8_t index = caste < 4U ? caste : 3U;
  entity.max_health = f32(kHealth[index]);
  entity.health = entity.max_health;
  entity.radius = f32(kRadius[index]);
  entity.collision_radius = entity.radius;
  ai.worker = caste == 1U;
  ai.soldier = caste >= 2U;
  ai.can_alert = caste == 1U;
  if (caste >= 2U) {
    ai.territory = f32(0.3F);
    ai.aggressive = true;
    ai.radius = f32(caste == 2U ? 300.0F : 400.0F);
  }
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_centipede(Entity& entity, bool evil, bool head, ServerRng& rng) {
  entity.contact_damage = f32(10.0F);
  apply_default_ai(entity, AiFamily::kCentipede);
  AiState& ai = entity.ai;
  ai.turn_rate = f32(0.006F);
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = evil ? f32(0.16F) : f32(0.2F);
  ai.wave_enabled = false;
  ai.wave_frequency = f32(0.0F);
  ai.wave_power = f32(1.0F);
  ai.sine_enabled = true;
  ai.sine_frequency = f32(0.0001F);
  ai.sine_amplitude = evil ? f32(0.16F) : f32(0.6F);
  ai.timer_interval_ms = 0.0;
  ai.territory = evil ? f32(0.3F) : f32(0.0F);
  ai.aggressive = evil;
  ai.radius = evil ? f32(600.0F) : f32(1000.0F);
  ai.range_multiplier = f32(1.5F);
  ai.attack_range = f32(0.0F);
  ai.chase_speed = f32(2.4F);
  ai.evil = evil;
  ai.head = head;
  entity.max_health = f32(50.0F);
  entity.health = entity.max_health;
  entity.radius = f32(35.0F);
  entity.collision_radius = entity.radius;
  if (head) {
    const f32 sample = f32(static_cast<float>(static_cast<std::uint32_t>(rng.next() - 1U)));
    ai.rare = f32::from_double(static_cast<double>(sample.value) / 2147483648.0).value < 0.01F;
  }
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_beetle(Entity& entity, bool massive, ServerRng& rng) {
  entity.contact_damage = massive ? f32(20.0F) : f32(30.0F);
  apply_default_ai(entity, AiFamily::kBeetle);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = massive ? f32(1.1F) : f32(1.0F);
  ai.wave_enabled = true;
  ai.wave_frequency = f32(0.002F);
  ai.wave_power = f32(2.0F);
  ai.timer_interval_ms = 3141.5927734375;  // shipped f32 0x4544F3FB
  ai.territory = f32(0.3F);
  ai.aggressive = true;
  ai.radius = f32(600.0F);
  ai.range_multiplier = f32(1.5F);
  ai.attack_range = f32(0.0F);
  ai.chase_speed = f32(2.4F);
  ai.attack_speed = f32(0.0F);
  ai.variant = massive ? 1U : 0U;
  entity.max_health = massive ? f32(300.0F) : f32(40.0F);
  entity.health = entity.max_health;
  entity.radius = massive ? f32(80.0F) : f32(40.0F);
  entity.collision_radius = entity.radius;
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_spider(Entity& entity, ServerRng& rng) {
  apply_default_ai(entity, AiFamily::kNone);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(1.0F);
  ai.wave_enabled = true;
  ai.wave_frequency = f32(0.002F);
  ai.wave_power = f32(2.0F);
  ai.timer_interval_ms = 3141.5927734375;
  ai.territory = f32(0.45F);
  ai.aggressive = true;
  ai.radius = f32(600.0F);
  ai.range_multiplier = f32(1.5F);
  ai.chase_speed = f32(2.88F);
  entity.max_health = f32(20.0F);
  entity.health = entity.max_health;
  entity.radius = f32(25.0F);
  entity.collision_radius = entity.radius;
  entity.contact_damage = f32(25.0F);
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_bee(Entity& entity, ServerRng& rng) {
  apply_default_ai(entity, AiFamily::kNone);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(1.0F);
  ai.wave_enabled = true;
  ai.wave_frequency = f32::from_bits(993803864U);
  ai.wave_power = f32(0.5F);
  ai.wave_amplitude = f32(1.0F);
  ai.sine_enabled = true;
  ai.sine_frequency = f32(0.002F);
  ai.sine_amplitude = f32(0.5F);
  const std::uint32_t sample = rng.next();
  const f32 base = f32::from_double(
    static_cast<double>(static_cast<float>(sample - 1U)) * (5000.0 / 2147483648.0));
  const f32 delay = f32::from_double(static_cast<double>(base.value) + 5000.0);
  ai.timer_interval_ms = static_cast<double>(delay.value);
  ai.radius = f32(1000.0F);
  ai.range_multiplier = f32(1.5F);
  ai.chase_speed = f32(2.4F);
  entity.max_health = f32(15.0F);
  entity.health = entity.max_health;
  entity.radius = f32(25.0F);
  entity.collision_radius = entity.radius;
  entity.contact_damage = f32(50.0F);
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_hornet(Entity& entity, ServerRng& rng) {
  apply_default_ai(entity, AiFamily::kNone);
  AiState& ai = entity.ai;
  ai.angle_locked = true;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(0.7F);
  ai.wave_enabled = true;
  ai.wave_frequency = f32::from_bits(993803864U);
  ai.wave_power = f32(0.5F);
  ai.sine_enabled = true;
  ai.sine_frequency = f32(0.002F);
  ai.sine_amplitude = f32(0.5F);
  const std::uint32_t delay_sample = rng.next();
  const std::uint32_t aggression_sample = rng.next();
  const std::uint32_t turn_sample = rng.next();
  // Original 14's initializer calls function_102 on a {0,1} distribution for
  // the attack-speed sign before configureBehavior, so the orientation is the
  // fifth draw rather than the fourth.
  const std::uint32_t sign_sample = rng.next();
  const f32 base = f32::from_double(
    static_cast<double>(static_cast<float>(delay_sample - 1U)) * (5000.0 / 2147483648.0));
  const f32 delay = f32::from_double(static_cast<double>(base.value) + 5000.0);
  ai.timer_interval_ms = static_cast<double>(delay.value);
  ai.territory = f32(0.6F);
  ai.aggressive = true;
  ai.chase = f32::from_double(static_cast<double>(aggression_sample - 1U) / 2147483648.0).value < 0.2F;
  ai.lead_divisor = f32::from_double(
    static_cast<double>(f32::from_double(static_cast<double>(static_cast<float>(turn_sample - 1U))
      * (static_cast<double>(0.19999998807907104F) / 2147483648.0)).value) + 0.5);
  ai.radius = f32(600.0F);
  ai.range_multiplier = f32(1.5F);
  ai.attack_range = f32(500.0F);
  ai.attack_speed = ((sign_sample - 1U) & 1U) == 1U ? f32(0.4F) : f32(-0.4F);
  ai.chase_speed = f32(2.4F);
  ai.attack_callback = 74U;
  ai.attack_cooldown_gain = f32(2000.0F);
  entity.max_health = f32(40.0F);
  entity.health = entity.max_health;
  entity.radius = f32(25.0F);
  entity.collision_radius = entity.radius;
  entity.contact_damage = f32(50.0F);
  configure_behavior_draws(rng, ai, true);
  arm_timer(ai, 0.0);
}

void configure_square(Entity& entity, ServerRng& rng) {
  apply_default_ai(entity, AiFamily::kNone);
  AiState& ai = entity.ai;
  ai.turn_rate = f32(0.12321317940950394F);
  ai.angle_locked = false;
  ai.drift_rate = f32(0.2F);
  ai.idle_speed = f32(0.2F);
  ai.wave_enabled = false;
  ai.wave_frequency = f32(0.0F);
  ai.wave_power = f32(1.0F);
  ai.timer_interval_ms = 0.0;
  ai.radius = f32(1000.0F);
  ai.range_multiplier = f32(1.5F);
  ai.chase_speed = f32(2.4F);
  entity.max_health = f32(15.0F);
  entity.health = entity.max_health;
  entity.radius = f32(30.0F);
  entity.collision_radius = entity.radius;
  entity.contact_damage = f32(10.0F);
  configure_behavior_draws(rng, ai, false);
  arm_timer(ai, 0.0);
}

std::size_t alert_to_attacker(World& world, EntityHandle target, EntityHandle attacker) {
  if (!attacker.valid()) return 0;
  // Original 426 first requires the attacker to resolve to a player root.
  EntityHandle controller = attacker;
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    Entity* entity = world.entities().get(controller);
    if (entity == nullptr) return 0;
    if (entity->kind == EntityKind::kPlayer) break;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) return 0;
    controller = EntityHandle{entity->owner};
  }
  if (world.entities().get(controller) == nullptr) return 0;
  // Then the attacker must itself be an actor (player or mob).
  EntityHandle actor = attacker;
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    Entity* entity = world.entities().get(actor);
    if (entity == nullptr) return 0;
    if (is_actor(*entity)) break;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) return 0;
    actor = EntityHandle{entity->owner};
  }
  Entity* damaged = world.entities().get(target);
  if (damaged == nullptr) return 0;
  std::size_t changed = 0;
  if (damaged->ai.enabled && !damaged->ai.target.valid()
      && (damaged->ai.aggressive || damaged->ai.can_alert)
      && target_eligible(world, *damaged, *world.entities().get(actor))) {
    damaged->ai.target = actor;
    damaged->ai.returning = false;
    ++changed;
  }
  // The original then invokes the entity's damage callbacks. In the domain
  // model attached children with AI are the observable callback targets.
  for (const EntityHandle child : damaged->children) {
    Entity* child_entity = world.entities().get(child);
    if (child_entity == nullptr || !child_entity->ai.enabled) continue;
    if (!child_entity->ai.target.valid()
        && target_eligible(world, *child_entity, *world.entities().get(actor))) {
      child_entity->ai.target = actor;
      ++changed;
    }
  }
  return changed;
}

void update_ai(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) return;
  const double now_ms = world.time_ms();
  std::vector<EntityHandle> pending_attacks;
  for (const EntityHandle handle : world.ai_entities()) {
    Entity* entity = world.entities().get(handle);
    if (entity == nullptr || !entity->active || entity->kind != EntityKind::kMob) continue;
    if (!entity->ai.enabled || entity->health.value <= 0.0F) continue;
    AiState& ai = entity->ai;

    // Original 654: a linked segment with a predecessor is removed from the
    // per-entity steering list and attached to the predecessor's AI record, so
    // it never runs its own target/guard/velocity update. Its position and
    // facing come from the 401 chain constraint instead. This applies even
    // when the predecessor has no live AI record (the original then skips the
    // segment for this tick as well).
    if (ai.predecessor.valid()) continue;

    ai.attack_cooldown_ms = f32(std::max(
      static_cast<double>(ai.attack_cooldown_ms.value) - delta_milliseconds, 0.0));

    if (ai.target.valid()) {
      Entity* target = world.entities().get(ai.target);
      if (target == nullptr || !target_eligible(world, *entity, *target)) ai.target = EntityHandle{};
    }
    if (!ai.target.valid() && ai.aggressive) {
      const EntityHandle found = find_target(world, handle);
      if (found.valid()) {
        ai.target = found;
        const f32 cooldown = std::min(ai.attack_cooldown_gain, f32(500.0F));
        if (ai.attack_cooldown_ms < cooldown) ai.attack_cooldown_ms = cooldown;
      }
    }


    f32 move_speed(0.0F);
    f32 move_angle(0.0F);
    if (ai.target.valid()) {
      ai.activity_flags |= 1U;
      Entity* target = world.entities().get(ai.target);
      Vec2 lead{};
      if (ai.chase && ai.lead_divisor.value > 0.0F) {
        const double source_x = static_cast<double>(entity->position.x.value);
        const double source_y = static_cast<double>(entity->position.y.value);
        const double target_x = static_cast<double>(target->position.x.value);
        const double target_y = static_cast<double>(target->position.y.value);
        const double vx = target->velocity.x + target->acceleration.x;
        const double vy = target->velocity.y + target->acceleration.y;
        double distance = std::sqrt((source_x - target_x) * (source_x - target_x)
                                  + (source_y - target_y) * (source_y - target_y))
                        / static_cast<double>(ai.lead_divisor.value);
        for (int iteration = 0; iteration < 3; ++iteration) {
          const double predicted_x = target_x + distance * vx;
          const double predicted_y = target_y + distance * vy;
          distance = std::sqrt((source_x - predicted_x) * (source_x - predicted_x)
                             + (source_y - predicted_y) * (source_y - predicted_y))
                   / static_cast<double>(ai.lead_divisor.value);
        }
        lead.x = f32::from_double(distance * vx);
        lead.y = f32::from_double(distance * vy);
      }
      const Vec2 aim(f32::from_double(static_cast<double>(target->position.x.value)
                                      + static_cast<double>(lead.x.value)),
                     f32::from_double(static_cast<double>(target->position.y.value)
                                      + static_cast<double>(lead.y.value)));
      const double dx = static_cast<double>(aim.x.value) - static_cast<double>(entity->position.x.value);
      const double dy = static_cast<double>(aim.y.value) - static_cast<double>(entity->position.y.value);
      const f32 aim_angle = f32::from_double(std::atan2(dy, dx));
      entity->angle = aim_angle;
      const double distance_squared_aim = dx * dx + dy * dy;
      const double attack_range = static_cast<double>(ai.attack_range.value);
      if (distance_squared_aim < attack_range * attack_range) {
        move_angle = f32::from_double(static_cast<double>(aim_angle.value) + kHalfPi);
        move_speed = ai.attack_speed;
      } else {
        move_angle = aim_angle;
        move_speed = ai.chase_speed;
      }
    } else {
      // Idle/guard branch. Only owned entities receive a guard point.
      ai.activity_flags &= static_cast<std::uint8_t>(~1U);
      if (entity->owner != std::numeric_limits<std::uint32_t>::max()) {
        Entity* owner = world.entities().get(EntityHandle{entity->owner});
        if (owner != nullptr) {
          bool need_wander = false;
          if (ai.guard_active) {
            const double gx = static_cast<double>(ai.guard_point.x.value)
                            - static_cast<double>(owner->position.x.value);
            const double gy = static_cast<double>(ai.guard_point.y.value)
                            - static_cast<double>(owner->position.y.value);
            const double radius = static_cast<double>(ai.guard_radius.value);
            need_wander = gx * gx + gy * gy > radius * radius;
          } else {
            const double dx = static_cast<double>(entity->position.x.value)
                            - static_cast<double>(owner->position.x.value);
            const double dy = static_cast<double>(entity->position.y.value)
                            - static_cast<double>(owner->position.y.value);
            const double radius = static_cast<double>(ai.guard_radius.value);
            need_wander = dx * dx + dy * dy > radius * radius;
          }
          if (need_wander) {
            const f32 first = random_fraction(world.random());
            const f32 second(static_cast<float>(world.random().next() - 1U));
            const f32 amount = f32(first.value
              * static_cast<float>(static_cast<double>(ai.guard_radius.value) * 0.9));
            const f32 angle = f32(second.value * kRandomAngleScale);
            ai.guard_point.x = f32::from_double(static_cast<double>(owner->position.x.value)
              + static_cast<double>(f32(amount.value * std::cos(angle.value)).value));
            ai.guard_point.y = f32::from_double(static_cast<double>(owner->position.y.value)
              + static_cast<double>(f32(amount.value * std::sin(angle.value)).value));
            ai.guard_active = true;
          }
        }
      }
      if (ai.guard_active) {
        const f32 left = f32(world.width().value * -0.5F);
        const f32 right = f32(world.width().value * 0.5F);
        const f32 bottom = f32(world.height().value * -0.5F);
        const f32 top = f32(world.height().value * 0.5F);
        const f32 radius = entity->collision_radius;
        const f32 min_x = f32(left.value + radius.value);
        const f32 max_x = f32(right.value - radius.value);
        const f32 min_y = f32(bottom.value + radius.value);
        const f32 max_y = f32(top.value - radius.value);
        ai.guard_point.x = f32(std::clamp(ai.guard_point.x.value, min_x.value, max_x.value));
        ai.guard_point.y = f32(std::clamp(ai.guard_point.y.value, min_y.value, max_y.value));
        const double distance = distance_squared_d(entity->position, ai.guard_point);
        if (distance < 2500.0) {
          // Original 654 clears AI+184 on arrival, before idle wave/turn.
          ai.guard_active = false;
          move_speed = ai.idle_speed;
        } else {
          move_speed = ai.chase_speed;
          move_angle = f32::from_double(std::atan2(
            static_cast<double>(ai.guard_point.y.value) - static_cast<double>(entity->position.y.value),
            static_cast<double>(ai.guard_point.x.value) - static_cast<double>(entity->position.x.value)));
        }
      } else {
        move_speed = ai.idle_speed;
      }
      // Original 654 selects the turn sign from the AI+48 behavior draw:
      // select(turn_rate, -turn_rate, choice) yields +turn_rate when the draw
      // is non-zero and the negated rate otherwise.
      f32 turn = ai.behavior_choice != 0U ? ai.turn_rate : f32(-ai.turn_rate.value);
      // Original 654 applies the wave envelope only outside the guard state
      // (Done42 is skipped when AI+184 is set). It scales both the speed and
      // the steering angle; the shipped mobs use this as their idle pulse.
      if (ai.wave_enabled && !ai.guard_active) {
        const double elapsed = now_ms - ai.clock_ms;
        const double cosine = std::cos(elapsed * static_cast<double>(ai.wave_frequency.value));
        const double wave = std::pow(0.5 - cosine * 0.5,
                                     static_cast<double>(ai.wave_power.value))
                          * static_cast<double>(ai.wave_amplitude.value);
        move_speed = f32(move_speed.value * static_cast<float>(wave));
        turn = f32(turn.value * static_cast<float>(wave));
      }
      turn = f32(turn.value * ai.modifiers.turn.value);
      if (ai.guard_active) {
        move_angle = f32::from_double(std::atan2(
          static_cast<double>(ai.guard_point.y.value) - static_cast<double>(entity->position.y.value),
          static_cast<double>(ai.guard_point.x.value) - static_cast<double>(entity->position.x.value)));
      } else {
        move_angle = turn;
      }
      // The original timer runs only in the idle/guard branch and after
      // guard-point RNG. A retained target bypasses it until wandering resumes.
      // Original AI+32/+40/+100 random-angle timer. The redraw is a full-turn
      // angle: f32(f32(rng-1) * 2*pi/2^31), not a [0,1) fraction (the idle
      // integration wraps it into [-pi,pi] later in the same tick). The original
      // loops until the deadline is in the future, adding the binary32 interval
      // (AI+100) each time, so a large clock jump consumes multiple draws.
      if (ai.timer_active && ai.timer_interval_ms > 0.0) {
        const double interval = static_cast<double>(
          f32(static_cast<float>(ai.timer_interval_ms)).value);
        while (now_ms >= ai.timer_deadline_ms) {
          ai_debug::last_timer_handle = entity->handle.raw;
          ++ai_debug::timer_fires;
          ai.timer_deadline_ms += interval;
          ai.current_angle = f32(static_cast<float>(world.random().next() - 1U)
                                 * kRandomAngleScale);
        }
      }

      // AI+52 integrates the (wave-scaled) steering angle every tick; the
      // shipped default behavior relies on this integration (angle_locked
      // entities face AI+52 rather than the raw steering value).
      // Original 654 rounds (steering * dt) to f32 before scaling by 0.001 and
      // adding the f64 sum; the grouping is observable at f32 ULP level.
      const f32 raw_step = f32(move_angle.value * static_cast<float>(delta_milliseconds));
      // AI+52 is written as f32 *before* the remainder bridge. In particular,
      // a freshly drawn angle above pi must round the sum at that magnitude,
      // rather than round its much smaller wrapped result (original 654).
      const f32 unwrapped = f32::from_double(
        static_cast<double>(ai.current_angle.value)
        + static_cast<double>(raw_step.value) * 0.001);
      ai.current_angle = f32::from_double(wrap_pi(static_cast<double>(unwrapped.value)));
      // Original 654 reflects the idle steering angle near the arena edges so
      // wanderers turn back inside instead of grinding along a wall. The four
      // tests are ordered left/bottom/right/top and each rewrites AI+52.
      {
        constexpr double kHalfPi = 1.5707963267948966;
        constexpr double kPi = 3.141592653589793;
        const double radius = static_cast<double>(entity->collision_radius.value);
        const double half_width = static_cast<double>(world.width().value) * 0.5;
        const double half_height = static_cast<double>(world.height().value) * 0.5;
        const double x = static_cast<double>(entity->position.x.value);
        const double y = static_cast<double>(entity->position.y.value);
        double angle = static_cast<double>(ai.current_angle.value);
        if (x < -half_width + radius + 10.0 && (angle > kHalfPi || angle < -kHalfPi))
          angle = kPi - angle;
        if (y < -half_height + radius + 10.0 && angle < 0.0)
          angle = -angle;
        if (x > half_width - radius - 10.0 && angle > -kHalfPi && angle < kHalfPi)
          angle = kPi - angle;
        if (y > half_height - radius - 10.0 && angle > 0.0)
          angle = -angle;
        ai.current_angle = f32::from_double(wrap_pi(angle));
      }
      f32 facing = ai.current_angle;
      if (ai.sine_enabled) {
        const double elapsed = now_ms - ai.clock_ms;
        const double wobble = std::sin(elapsed * static_cast<double>(ai.sine_frequency.value))
                            * static_cast<double>(ai.sine_amplitude.value);
        facing = f32::from_double(static_cast<double>(facing.value) + wobble);
      }
      // Guard steering is recomputed after the sine wobble and overrides it.
      if (ai.guard_active) {
        facing = f32::from_double(std::atan2(
          static_cast<double>(ai.guard_point.y.value) - static_cast<double>(entity->position.y.value),
          static_cast<double>(ai.guard_point.x.value) - static_cast<double>(entity->position.x.value)));
      }
      if (ai.angle_locked) {
        entity->angle = f32::from_double(wrap_pi(static_cast<double>(facing.value)));
      } else {
        entity->angle = f32::from_double(wrap_pi(
          static_cast<double>(entity->angle.value)
          + static_cast<double>(ai.drift_rate.value) * delta_milliseconds * 0.001));
      }
      move_angle = facing;
    }

    if (move_speed.value != 0.0F) {
      const f32 multiplier = entity->behavior_speed_multiplier * slow_multiplier(*entity);
      // Original 654 promotes the f32 speed*dt product before multiplying by
      // the f64 literal 0.001, then demotes. A binary32 0.001F adds an ULP to
      // e.g. the Centipede's 0.2*50 impulse on every tick.
      const f32 delta = f32::from_double(
        static_cast<double>(f32(move_speed.value * static_cast<float>(delta_milliseconds)).value) * 0.001);
      const f32 scaled = f32(f32(delta.value * multiplier.value).value
        * ai.modifiers.speed.value);
      // Original 654 stores velocity as f64 and adds f64(f32(cosf * speed)).
      entity->velocity.x += static_cast<double>(
        f32(std::cos(move_angle.value) * scaled.value).value);
      entity->velocity.y += static_cast<double>(
        f32(std::sin(move_angle.value) * scaled.value).value);
    }

    // Original 654 invokes the callback in the live-target branch, after
    // either the in-range strafe or the out-of-range chase velocity update.
    // attack_range selects steering; it does not gate firing (oracle fixture
    // covers both 300 and 800 units with a retained target).
    if (ai.target.valid() && ai.attack_callback != 0U
        && ai.attack_cooldown_ms.value <= 0.0F) {
      pending_attacks.push_back(handle);
      ai.attack_cooldown_ms = f32(ai.attack_cooldown_ms.value
        + f32(ai.attack_cooldown_gain.value * ai.modifiers.attack.value).value);
    }
  }
  // Spawning is deferred until the steering list has been walked: the original
  // callback mutates the entity pool, but the domain keeps the AI iteration
  // vector stable by collecting due callbacks first.
  for (const EntityHandle handle : pending_attacks) {
    (void)dispatch_attack_callback(world, handle);
  }
}

} // namespace engine
