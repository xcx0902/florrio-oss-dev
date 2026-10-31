#include "engine/sim/ai.hpp"
#include "ai_internal.hpp"
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

using namespace ai_detail;

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
  // Original423 recursively checks the same aggression gates on every
  // descendant. Passive centipede segments must not acquire attacker aggro.
  std::vector<EntityHandle> descendants(damaged->children.begin(), damaged->children.end());
  for (std::size_t index = 0; index < descendants.size(); ++index) {
    const EntityHandle child = descendants[index];
    Entity* child_entity = world.entities().get(child);
    if (child_entity == nullptr) continue;
    descendants.insert(descendants.end(), child_entity->children.begin(), child_entity->children.end());
    if (!child_entity->ai.enabled
        || !(child_entity->ai.aggressive || child_entity->ai.can_alert)) continue;
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
    if (ai.predecessor.valid()) {
      const Entity* predecessor = world.entities().get(ai.predecessor);
      if (predecessor != nullptr && predecessor->ai.enabled)
        ai.target = predecessor->ai.target;
      continue;
    }

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
