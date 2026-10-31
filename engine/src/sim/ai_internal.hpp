#pragma once
#include "engine/sim/ai.hpp"
#include <cmath>
namespace engine::ai_detail {


constexpr double kTau = 6.283185307179586476925286766559;
constexpr double kHalfPi = 1.5707963267948966192313216916398;
// Exact shipped f32 0x1.9999ap-34. Its low bits differ from f32(0.2 / 2^31),
// enough to alter some ants' turn speeds and subsequent simulation state.
constexpr double kAntRandomTurnScale = (0x19999a / 1048576.0) * 0x1p-34;
// f32(2 * pi / 2^31), the original random-angle scale.
constexpr float kRandomAngleScale = 2.925836239953128e-09F;

inline bool is_actor(const Entity& entity) {
  return entity.kind == EntityKind::kPlayer || entity.kind == EntityKind::kMob;
}

inline f32 distance_squared(const Vec2& first, const Vec2& second) {
  const f32 dx = first.x - second.x;
  const f32 dy = first.y - second.y;
  return dx * dx + dy * dy;
}

inline double distance_squared_d(const Vec2& first, const Vec2& second) {
  const double dx = static_cast<double>(first.x.value) - static_cast<double>(second.x.value);
  const double dy = static_cast<double>(first.y.value) - static_cast<double>(second.y.value);
  return dx * dx + dy * dy;
}

inline double wrap_pi(double value) {
  double wrapped = std::fmod(value, kTau);
  if (wrapped < -3.141592653589793) wrapped += kTau;
  if (wrapped > 3.141592653589793) wrapped -= kTau;
  return wrapped;
}

inline f32 random_fraction(ServerRng& rng) {
  return f32(static_cast<float>(rng.next() - 1U)) * f32(0x1p-31f);
}

/** Common behavior defaults from original 115 / writeDefaultAi. */
inline void apply_default_ai(Entity& entity, AiFamily family) {
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

inline void arm_timer(AiState& ai, double now_ms) {
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
inline void configure_behavior_draws(ServerRng& rng, AiState& ai, bool same_angle) {
  const auto orientation = [&rng]() {
    const f32 sample(static_cast<float>(rng.next() - 1U));
    return f32(sample.value * kRandomAngleScale);
  };
  const f32 first = orientation();
  ai.behavior_choice = static_cast<std::uint8_t>((rng.next() - 1U) & 1U);
  ai.current_angle = same_angle ? first : orientation();
}


}
