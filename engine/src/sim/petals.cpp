#include "engine/sim/petals.hpp"
#include "engine/catalog/petal_defaults.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/petal_orbit.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/effects.hpp"
#include "pickups.hpp"
#include <algorithm>
#include <cmath>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;

std::uint8_t active_slot_count(const World& world) {
  return world.profile().active_slots();
}

f32 orbit_angle_for(std::uint8_t slot, std::uint8_t instance, std::uint8_t active,
                    std::uint8_t count) {
  if (active == 0) active = 5;
  if (count == 0) count = 1;
  const double base = static_cast<double>(slot) * kTau / static_cast<double>(active);
  const double offset = static_cast<double>(instance) * kTau / static_cast<double>(count);
  return f32::from_double(base + offset);
}

// Kept as the documented pre-R06 spawn-angle formula for the legacy tests that
// compare the old slot/instance split; the live path uses petal_orbit_angle.
[[maybe_unused]] constexpr auto* kLegacyOrbitAngleFor = &orbit_angle_for;

} // namespace

std::uint8_t petal_orbit_index(const World& world, std::uint8_t slot,
                               std::uint8_t instance) {
  std::uint8_t orbit_index = 0;
  const auto& slots = world.loadout().slots();
  for (std::uint8_t index = 0; index < 8U; ++index) {
    const std::uint16_t type = slots[index].type_id;
    if (type == 0U || type > 38U) continue;
    const PetalDefault* definition = nullptr;
    for (const auto& petal : petal_defaults())
      if (petal.type_id == type) { definition = &petal; break; }
    if (definition == nullptr) continue;
    // definition+40 disables the orbit slot entirely.
    if (definition->flags[0] != 0U) continue;
    const std::uint8_t count = slots[index].count == 0U ? 1U : slots[index].count;
    if (definition->flags[1] != 0U) {
      // flag41: instances share one orbital position.
      if (index == slot) return orbit_index;
      if (count != 0U) ++orbit_index;
      continue;
    }
    for (std::uint8_t candidate = 0; candidate < 3U; ++candidate) {
      if (index == slot && candidate == instance) return orbit_index;
      // Existing entities take a position; otherwise the configured instance
      // count reserves one (petal-lifecycle assignPetalOrbitIndices).
      if (world.loadout().handle(index, candidate).valid() || candidate < count) ++orbit_index;
    }
  }
  return orbit_index;
}

void assign_petal_orbit_indices(World& world) {
  auto& loadout = world.loadout();
  const auto& slots = loadout.slots();
  std::uint8_t orbit_index = 0;
  const auto petal_state = [&world](EntityHandle handle) -> PetalOrbitState* {
    if (!handle.valid()) return nullptr;
    for (auto& state : world.petals())
      if (state.handle == handle) return &state;
    return nullptr;
  };
  for (std::uint8_t slot = 0; slot < 8U; ++slot) {
    const std::uint16_t type = slots[slot].type_id;
    if (type == 0U || type > 38U) {
      // Still write the boundary counter for empty slots.
    } else {
      const PetalDefault* definition = nullptr;
      for (const auto& petal : petal_defaults())
        if (petal.type_id == type) { definition = &petal; break; }
      if (definition != nullptr && definition->flags[0] == 0U) {
        if (definition->flags[1] != 0U) {
          bool position_used = false;
          for (std::uint8_t instance = 0; instance < 3U; ++instance) {
            const EntityHandle handle = loadout.handle(slot, instance);
            PetalOrbitState* state = petal_state(handle);
            if (state != nullptr) state->orbit_index = orbit_index;
            if (instance < 2U) {
              // An existing slot entity without a petal component does not
              // reserve an orbit position; only a missing entity does.
              if (state != nullptr) position_used = true;
              else if (!handle.valid() && definition->instances_per_slot > instance)
                position_used = true;
            } else if (state != nullptr) {
              ++orbit_index;
            } else if (handle.valid()) {
              // A live slot entity without a petal component consumes only the
              // position already claimed by its earlier instances.
              if (position_used) ++orbit_index;
            } else {
              position_used = position_used || definition->instances_per_slot > 2U;
              if (position_used) ++orbit_index;
            }
          }
        } else {
          for (std::uint8_t instance = 0; instance < 3U; ++instance) {
            const EntityHandle handle = loadout.handle(slot, instance);
            PetalOrbitState* state = petal_state(handle);
            if (state != nullptr) {
              state->orbit_index = orbit_index;
              ++orbit_index;
            } else if (!handle.valid() && definition->instances_per_slot > instance) {
              ++orbit_index;
            }
          }
        }
      }
    }
    const std::uint8_t level = world.profile().level();
    const std::uint8_t unlocked = level < 15U ? 5U : level < 30U ? 6U : level < 45U ? 7U : 8U;
    if (static_cast<std::uint8_t>(slot + 1U) == unlocked)
      loadout.set_orbit_positions(orbit_index);
  }
}

double petal_orbit_angle(const World& world, std::uint8_t orbit_index) {
  const std::uint8_t active = active_slot_count(world);
  // Original loadout+292 stores the number of occupied orbit positions at
  // the active-slot boundary. Use it when available; derive it from the same
  // configured-instance rules for callers before the first assignment.
  std::uint8_t orbit_positions = world.loadout().orbit_positions();
  if (orbit_positions == 0U) {
    const auto& loadout_slots = world.loadout().slots();
    for (std::uint8_t slot = 0; slot < active && slot < loadout_slots.size(); ++slot) {
      const std::uint16_t type = loadout_slots[slot].type_id;
      if (type == 0U || type > 38U) continue;
      const PetalDefault* definition = nullptr;
      for (const auto& petal : petal_defaults())
        if (petal.type_id == type) { definition = &petal; break; }
      if (definition == nullptr || definition->flags[0] != 0U) continue;
      if (definition->flags[1] != 0U) ++orbit_positions;
      else orbit_positions = static_cast<std::uint8_t>(orbit_positions + definition->instances_per_slot);
    }
  }
  const double slots = orbit_positions > 1U ? static_cast<double>(orbit_positions) : 1.0;
  const double angle = static_cast<double>(orbit_index) * kTau / slots
    + static_cast<double>(world.loadout().orbit_phase().value);
  // Original updatePetalOrbits wraps the angle with fmod(angle, 2*pi) before
  // calling sin/cos.
  return std::fmod(angle, kTau);
}

Vec2 orbit_position(Vec2 center, f32 radius, f32 angle) {
  const double radians = static_cast<double>(angle.value);
  const f32 x = f32::from_double(std::cos(radians) * static_cast<double>(radius.value));
  const f32 y = f32::from_double(std::sin(radians) * static_cast<double>(radius.value));
  return center + Vec2(x, y);
}

f32 petal_radius(std::uint16_t type_id) {
  for (const auto& petal : petal_defaults())
    if (petal.type_id == type_id) return f32(petal.radius);
  return f32(0.0F);
}

void update_petal_orbit(World& world, const PetalOrbitState& state, double step_milliseconds) {
  Entity* entity = world.entities().get(state.handle);
  if (entity == nullptr) return;
  // The orbit angle is kept full-width (original updatePetalOrbits computes it
  // from the f32 loadout phase and feeds it straight to sin/cos).
  const double radians = state.orbit_angle;
  double target_x = static_cast<double>(state.center.x.value)
    + std::cos(radians) * static_cast<double>(state.orbit_radius.value);
  double target_y = static_cast<double>(state.center.y.value)
    + std::sin(radians) * static_cast<double>(state.orbit_radius.value);
  if (state.extra_radius.value > 0.0F && state.instance_count > 0U) {
    const double extra_angle = radians * 1.1
      + static_cast<double>(state.instance) * kTau / static_cast<double>(state.instance_count);
    target_x += std::cos(extra_angle) * static_cast<double>(state.extra_radius.value);
    target_y += std::sin(extra_angle) * static_cast<double>(state.extra_radius.value);
  }
  const double dx = target_x - static_cast<double>(entity->position.x.value);
  const double dy = target_y - static_cast<double>(entity->position.y.value);
  const double distance_squared = dx * dx + dy * dy;
  double distance = std::sqrt(distance_squared);
  double unit_x = 1.0;
  double unit_y = 0.0;
  if (distance >= 2.220446049250313e-16) {
    unit_x = dx / distance;
    unit_y = dy / distance;
  }
  // Original updatePetalOrbits rounds only the final product to f32:
  // f32((dx*dx + dy*dy) * 0.0011111111111111111).
  const f32 raw_factor = f32::from_double(distance_squared * 0.0011111111111111111);
  double factor = raw_factor.value;
  if (factor < 0.009999999776482582) factor = 0.009999999776482582;
  else if (factor > 2.0) factor = 2.0;
  const double acceleration = step_milliseconds * 0.007 * factor;
  entity->velocity.x += acceleration * unit_x;
  entity->velocity.y += acceleration * unit_y;
}

void update_petal_orbits(World& world, double step_milliseconds) {
  assign_petal_orbit_indices(world);
  const std::uint8_t buttons = static_cast<std::uint8_t>(world.input().buttons & 0xFFU);
  const Entity* player = world.entities().get(world.player());
  // Rose consumption erases its own orbit record. Advance before processing,
  // then revisit the shifted element after a consumption so simultaneous
  // Rose instances all receive their callback in this tick.
  for (std::size_t index = 0; index < world.petals().size();) {
    auto& state = world.petals()[index++];
    if (world.entities().get(state.handle) == nullptr) continue;
    if (player != nullptr) state.center = player->position;
    const auto profile = static_cast<OrbitProfile>(state.profile);
    // Original Peas orbit callbacks (676/681/431): after the petal has been
    // equipped for 500 ms, holding attack consumes it into four children. The
    // generic orbit radius stays at 65; only defend pulls it to 40.
    if ((state.type_id == 11U || state.type_id == 12U || state.type_id == 34U)
        && (buttons & 1U) != 0U && state.behavior_state == 0U
        && world.time_ms() - state.behavior_started_at_ms > 500.0) {
      const EntityHandle petal_handle = state.handle;
      Entity* petal = world.entities().get(petal_handle);
      const EntityHandle owner = petal != nullptr
        ? EntityHandle{petal->owner} : EntityHandle{};
      state.behavior_state = 1U;
      (void)consume_peas_attack(world, petal_handle, owner);
      --index;
      continue;
    }
    if (is_rose_orbit_function(state.orbit_function)) {
      state.orbit_radius = rose_orbit_radius(buttons);
    } else if (profile == OrbitProfile::kWing) {
      state.phase = f32::from_double(static_cast<double>(state.phase.value)
        + step_milliseconds * 0.005);
      state.orbit_radius = wing_orbit_radius(buttons, state.phase);
    } else {
      state.orbit_radius = orbit_radius(profile, buttons);
    }
    // Original recomputes the ring angle from the shared loadout phase every
    // tick: petalOrbitIndex * 2*pi / unlockedSlots + loadout+284.
    state.orbit_angle = petal_orbit_angle(world, state.orbit_index);
    state.angle = f32::from_double(state.orbit_angle);
    if (is_rose_orbit_function(state.orbit_function)) {
      Entity* petal = world.entities().get(state.handle);
      Entity* owner = petal != nullptr ? world.entities().get(EntityHandle{petal->owner}) : nullptr;
      if (owner != nullptr && owner->health.value > 0.0F && state.behavior_state == 0U) {
        // Original RoseR1 arms its 1000 ms timer even while the owner is at
        // full health. Once armed, damage is healed almost immediately; the
        // ten-step state below then advances once per simulation tick.
        if (world.time_ms() - state.behavior_started_at_ms > 1000.0
            && owner->health.value < owner->max_health.value && !blocks_healing(*owner))
          state.behavior_state = 1U;
      }
      if (owner != nullptr && state.behavior_state != 0U) {
        // Original 665/682/723 marks the orbit callback handled and moves the
        // petal toward the owner's current world position instead of applying
        // the ordinary orbital spring. The callback receives f32 elapsed time.
        const double elapsed = static_cast<double>(f32::from_double(step_milliseconds).value);
        const double weight = std::clamp(1.0 - std::pow(0.8, elapsed * 0.06), 0.0, 1.0);
        const double x = static_cast<double>(petal->position.x.value);
        const double y = static_cast<double>(petal->position.y.value);
        petal->set_position_x(f32::from_double(
          (static_cast<double>(owner->position.x.value) - x) * weight + x));
        petal->set_position_y(f32::from_double(
          (static_cast<double>(owner->position.y.value) - y) * weight + y));
        invalidate_bounds(world, state.handle);
        ++state.behavior_state;
        if (state.behavior_state != 10U) continue;
        const f32 amount(state.orbit_function == 665U ? 10.0F
          : state.orbit_function == 682U ? 22.0F : 3.5F);
        (void)heal_entity(world, EntityHandle{petal->owner}, amount);
        // The original passes health+8 to damage, consuming the entire Rose.
        // This clears the equipped handle and starts its catalog recharge.
        (void)damage_entity(world, state.handle, petal->health, EntityHandle{});
        --index;
        continue;
      }
    }
    update_petal_orbit(world, state, step_milliseconds);
  }
}

PetalSlot make_petal_slot(std::uint16_t type_id) {
  PetalSlot slot;
  slot.type_id = type_id;
  for (const auto& petal : petal_defaults()) {
    if (petal.type_id != type_id) continue;
    slot.count = petal.instances_per_slot;
    slot.recharge_remaining_ms = 0.0;
    break;
  }
  return slot;
}

EntityHandle spawn_drop(World& world, std::uint16_t type_id, Vec2 position) {
  const f32 radius = petal_radius(type_id);
  if (radius.value <= 0.0F) return EntityHandle{};
  const EntityHandle handle = spawn_entity(world, EntityKind::kDrop, type_id, position, radius);
  if (handle.valid()) {
    Entity* drop = world.entities().get(handle);
    drop->collision_radius = f32(35.0F);
    drop->lifetime_remaining_ms = loot_lifetime_ms(type_id);
    drop->pickup_transfer_deadline_ms = world.time_ms() + drop->lifetime_remaining_ms;
    // A drop has no AI/attack behavior. Its generic behavior timer holds the
    // original pickup+48 spawn grace, and its target handle holds pickup+56.
    drop->behavior_cooldown_ms = world.time_ms() + 500.0;
    world.register_pickup(handle);
  }
  return handle;
}

EntityHandle spawn_petal(World& world, std::uint16_t type_id, Vec2 center,
                         f32 orbit_radius, f32 angle, std::uint8_t slot,
                         std::uint8_t instance, std::uint8_t instance_count,
                         std::uint8_t orbit_index) {
  const auto* combat = Catalog::instance().petal_combat(type_id);
  if (combat == nullptr || combat->drawRadius <= 0.0F) return EntityHandle{};
  // Original 397 copies the owner's world position into the petal transform;
  // the orbit spring then accelerates it outward to the profile radius.
  const EntityHandle handle = spawn_entity(world, EntityKind::kPetal, type_id,
                                           center, f32(combat->drawRadius));
  if (!handle.valid()) return handle;
  Entity* entity = world.entities().get(handle);
  entity->collision_radius = f32(combat->collisionRadius);
  entity->contact_damage = f32(combat->damage);
  entity->health = f32(combat->health);
  entity->max_health = f32(combat->health);
  entity->loadout_slot = slot;
  entity->loadout_instance = instance;
  PetalOrbitState state;
  state.handle = handle;
  state.type_id = type_id;
  state.center = center;
  state.orbit_radius = orbit_radius;
  state.angle = angle;
  state.orbit_angle = static_cast<double>(angle.value);
  state.orbit_index = orbit_index;
  state.slot = slot;
  state.instance = instance;
  state.profile = static_cast<std::uint8_t>(orbit_profile_from_name(combat->orbitProfile));
  state.orbit_function = combat->orbitFunctionIndex;
  state.behavior_started_at_ms = world.time_ms();
  state.instance_count = instance_count == 0 ? 1 : instance_count;
  if (type_id == 22U) entity->behavior_cooldown_ms = 1000.0;
  else if (type_id == 23U) entity->behavior_cooldown_ms = 2500.0;
  for (const auto& petal : petal_defaults()) {
    if (petal.type_id != type_id) continue;
    if (petal.flags[1] != 0U) state.extra_radius = f32(petal.flags[2]);
    break;
  }
  world.petals().push_back(state);
  return handle;
}

std::size_t spawn_loadout_petals(World& world) {
  assign_petal_orbit_indices(world);
  const Entity* player = world.entities().get(world.player());
  if (player != nullptr && player->health.value <= 0.0F) return 0;
  std::size_t spawned = 0;
  const std::uint8_t active = active_slot_count(world);
  auto& slots = world.loadout().slots();
  for (std::uint8_t slot = 0; slot < active && slot < slots.size(); ++slot) {
    PetalSlot& value = slots[slot];
    if (!value.ready()) continue;
    for (std::uint8_t instance = 0; instance < value.count && instance < 3; ++instance) {
      if (world.loadout().pending(slot, instance)) continue;
      if (world.entities().get(value.instances[instance]) != nullptr) continue;
      const std::uint8_t orbit_index = petal_orbit_index(world, slot, instance);
      const f32 angle = f32::from_double(petal_orbit_angle(world, orbit_index));
      const EntityHandle handle = spawn_petal(world, value.type_id,
        world.entities().get(world.player()) != nullptr
          ? world.entities().get(world.player())->position
          : Vec2{},
        f32(65.0F), angle, slot, instance, value.count, orbit_index);
      if (!handle.valid()) continue;
      if (Entity* entity = world.entities().get(handle); entity != nullptr) {
        entity->owner = world.player().raw;
        attach_child(world, world.player(), handle);
      }
      value.instances[instance] = handle;
      world.loadout().set_handle(slot, instance, handle);
      world.loadout().set_pending(slot, instance, false);
      world.loadout().set_pending_timer(slot, instance, 0U);
      ++spawned;
    }
  }
  assign_petal_orbit_indices(world);
  return spawned;
}

std::size_t refresh_loadout_petals(World& world, double step_milliseconds) {
  world.loadout().advance(step_milliseconds);
  const auto spawned = spawn_loadout_petals(world);
  world.loadout().refresh_recharge_progress(world);
  return spawned;
}

bool on_petal_destroyed(World& world, EntityHandle handle) {
  auto& petals = world.petals();
  const auto it = std::find_if(petals.begin(), petals.end(),
    [handle](const PetalOrbitState& state) { return state.handle == handle; });
  if (it == petals.end()) return false;
  const std::uint8_t slot_index = it->slot;
  const std::uint8_t instance = it->instance;
  const std::uint16_t type_id = it->type_id;
  petals.erase(it);
  auto& slots = world.loadout().slots();
  if (slot_index < slots.size()) {
    PetalSlot& slot = slots[slot_index];
    if (instance < slot.instances.size()) slot.instances[instance] = EntityHandle{};
    world.loadout().clear_handle(slot_index, instance);
    const auto* combat = Catalog::instance().petal_combat(type_id);
    if (combat != nullptr) slot.recharge_remaining_ms = combat->rechargeMilliseconds;
  }
  return true;
}

void remove_slot_petals(World& world, std::uint8_t slot) {
  auto& petals = world.petals();
  for (auto it = petals.begin(); it != petals.end();) {
    if (it->slot != slot) { ++it; continue; }
    (void)world.destroy(it->handle);
    it = petals.erase(it);
  }
  if (slot < world.loadout().slots().size()) {
    world.loadout().slots()[slot].instances.fill(EntityHandle{});
    for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance)
      world.loadout().clear_handle(slot, instance);
  }
}

void swap_slot_petals(World& world, std::uint8_t first, std::uint8_t second) {
  for (auto& state : world.petals()) {
    std::uint8_t target = state.slot;
    if (state.slot == first) target = second;
    else if (state.slot == second) target = first;
    state.slot = target;
    if (Entity* entity = world.entities().get(state.handle)) entity->loadout_slot = target;
  }
}

std::size_t advance_pickups(World& world, double delta_milliseconds) {
  // Original simulation-tick 845..1270 keeps all arithmetic in f64 until
  // setLocalX/Y demotes the final position to f32. Follow runs even after the
  // recipient dies, until its intrusive handle is actually released.
  const double factor = std::clamp(1.0 - std::pow(0.8, delta_milliseconds * 0.06), 0.0, 1.0);
  std::size_t collected = 0;
  for (const EntityHandle handle : world.pickups()) {
    Entity* pointer = world.entities().get(handle);
    if (pointer == nullptr) continue;
    Entity& drop = *pointer;
    if (drop.pickup_transfer_deadline_ms <= world.time_ms() + 2000.0)
      drop.pickup_collected = true;
    if (!drop.pickup_collected && world.time_ms() >= drop.behavior_cooldown_ms) {
      const EntityHandle recipient = find_pickup_recipient(world, handle);
      if (recipient.valid()) {
        const std::uint8_t capacity = std::min<std::uint8_t>(world.profile().inventory_size(),
                                                            PlayerLoadout::kSlots);
        for (std::uint8_t slot = 0; slot < capacity; ++slot) {
          if (world.loadout().slots()[slot].count != 0U) continue;
          if (!world.loadout().equip(slot, drop.type_id)) break;
          world.profile().set_inventory(slot, drop.type_id);
          if (slot >= world.profile().inventory_count())
            world.profile().set_inventory_count(static_cast<std::uint8_t>(slot + 1U));
          world.loadout().record_pickup_transfer(handle, slot);
          drop.ai.target = recipient;
          drop.pickup_collected = true;
          drop.pickup_transfer_deadline_ms = world.time_ms() + 2000.0;
          ++collected;
          break;
        }
      }
    }
    const Entity* recipient = world.entities().get(drop.ai.target);
    if (recipient == nullptr) continue;
    const auto follow = [factor](f32 position, f32 target) {
      const double source = static_cast<double>(position.value);
      const double destination = static_cast<double>(target.value);
      return f32::from_double(std::abs(source - destination) < 1e-7
        ? destination : factor * (destination - source) + source);
    };
    drop.set_position_x(follow(drop.position.x, recipient->position.x));
    drop.set_position_y(follow(drop.position.y, recipient->position.y));
    invalidate_bounds(world, handle);
  }
  return collected;
}

std::size_t collect_drops(World& world) { return advance_pickups(world, 0.0); }

} // namespace engine
