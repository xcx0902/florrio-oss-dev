#include "engine/sim/ai.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spatial.hpp"
#include <algorithm>
#include <cmath>
#include <vector>

#include "ai_internal.hpp"
namespace engine {
using namespace ai_detail;
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


}
