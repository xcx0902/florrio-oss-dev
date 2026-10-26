#pragma once
#include "engine/model/world.hpp"
#include <cstdint>

namespace engine {

/** Countdown for a timed effect; deterministic with fixed ticks. */
class EffectTimer {
 public:
  explicit constexpr EffectTimer(std::uint32_t milliseconds = 0) : remaining_(milliseconds) {}
  [[nodiscard]] constexpr bool active() const { return remaining_ > 0; }
  [[nodiscard]] constexpr std::uint32_t remaining() const { return remaining_; }
  constexpr void advance(std::uint32_t milliseconds) {
    remaining_ = milliseconds >= remaining_ ? 0 : remaining_ - milliseconds;
  }

 private:
  std::uint32_t remaining_;
};

/** Add or refresh a timed effect. Poison intensity is damage per second, slow
 * intensity is a 0..1 speed multiplier, and heal-block ignores intensity. */
bool apply_effect(World& world, EntityHandle target, EffectType type, f32 intensity,
                  double duration_ms, EntityHandle source = EntityHandle{});

/** Create a shared payload (original effect object) for an area or callback. */
[[nodiscard]] std::shared_ptr<EffectPayload> make_effect_payload(
    EffectType type, f32 intensity, double duration_ms, EntityHandle source);

/** Create/replace an area effect owned by `owner`. The payload is transferred
 * into the area and appended to every current target's effect vector. Passing
 * a null payload clears the area and unlinks all targets. */
std::shared_ptr<EffectPayload> add_area_effect(World& world, EntityHandle owner, f32 scale,
                                               EffectType type, f32 intensity,
                                               double duration_ms,
                                               EntityHandle source = EntityHandle{});

/** Attach/detach one shared payload to/from an entity's eight effect slots. */
bool attach_effect_payload(Entity& entity, const std::shared_ptr<EffectPayload>& payload);
bool detach_effect_payload(Entity& entity, const std::shared_ptr<EffectPayload>& payload);

/** Advance all effect timers, apply the strongest poison once per entity and
 * publish the three effect flags used by snapshots and rendering. Returns the
 * number of entities that took poison damage. */
std::size_t update_effects(World& world, double delta_milliseconds);

[[nodiscard]] bool has_effect(const Entity& entity, EffectType type);
[[nodiscard]] bool blocks_healing(const Entity& entity);
/** Combined slow multiplier (1.0 when unaffected). */
[[nodiscard]] f32 slow_multiplier(const Entity& entity);
[[nodiscard]] std::uint8_t effect_flags(const Entity& entity);
void clear_effects(Entity& entity);

} // namespace engine
