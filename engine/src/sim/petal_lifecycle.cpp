#include "engine/sim/petals.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/petal_orbit.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/pets.hpp"
#include "pickups.hpp"
#include <algorithm>
#include <cmath>

namespace engine {
namespace {
PlayerState* orbit_owner(World& world, EntityHandle handle) {
  PlayerState* owner = nullptr;
  world.players().for_each([&](PlayerState& candidate) {
    for (const auto& orbit : candidate.petals())
      if (orbit.handle == handle) { owner = &candidate; break; }
  });
  return owner;
}
} // namespace

PetalSlot make_petal_slot(std::uint16_t type_id) {
  PetalSlot slot;
  slot.type_id = type_id;
  const auto* petal = Catalog::instance().petal(type_id);
  if (petal != nullptr) {
    slot.count = petal->instancesPerSlot;
    slot.recharge_remaining_ms = 0.0;
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

EntityHandle spawn_petal(World& world, PlayerState& state, std::uint16_t type_id, Vec2 center,
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
  // Original 726 writes physics+40 mass 4 for Heaviest (other petals use 1).
  if (type_id == 26U) entity->mass = f32(4.0F);
  entity->loadout_slot = slot;
  entity->loadout_instance = instance;
  PetalOrbitState orbit;
  orbit.handle = handle;
  orbit.type_id = type_id;
  orbit.center = center;
  orbit.orbit_radius = orbit_radius;
  orbit.angle = angle;
  orbit.orbit_angle = static_cast<double>(angle.value);
  orbit.orbit_index = orbit_index;
  orbit.slot = slot;
  orbit.instance = instance;
  orbit.profile = static_cast<std::uint8_t>(orbit_profile_from_name(combat->orbitProfile));
  orbit.orbit_function = combat->orbitFunctionIndex;
  orbit.behavior_started_at_ms = world.time_ms();
  orbit.instance_count = instance_count == 0 ? 1 : instance_count;
  if (type_id == 22U) entity->behavior_cooldown_ms = 1000.0;
  else if (type_id == 23U) entity->behavior_cooldown_ms = 2500.0;
  const auto* petal = Catalog::instance().petal(type_id);
  if (petal != nullptr && petal->sharedOrbit)
    orbit.extra_radius = f32(petal->extraOrbitRadius);
  state.petals().push_back(orbit);
  return handle;
}

std::size_t spawn_loadout_petals(World& world, PlayerState& state) {
  assign_petal_orbit_indices(world, state);
  const Entity* player = world.entities().get(state.player());
  if (player == nullptr || player->health.value <= 0.0F) return 0;
  std::size_t spawned = 0;
  const std::uint8_t active = static_cast<std::uint8_t>(state.profile().active_slots());
  auto& slots = state.loadout().slots();
  for (std::uint8_t slot = 0; slot < active && slot < slots.size(); ++slot) {
    PetalSlot& value = slots[slot];
    // Original petal flag +40 disables the orbit entity completely. Antennae
    // is worn on the flower instead: it contributes only its appearance bit
    // and the widened camera. Spawning a petal here would make it orbit.
    bool hidden = false;
    const auto* definition = Catalog::instance().petal(value.type_id);
    hidden = definition != nullptr && definition->orbitHidden;
    if (hidden) {
      value.instances.fill(EntityHandle{});
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance)
        state.loadout().clear_handle(slot, instance);
      continue;
    }
    if (!value.ready()) continue;
    for (std::uint8_t instance = 0; instance < value.count && instance < 3; ++instance) {
      if (state.loadout().pending(slot, instance)) continue;
      if (world.entities().get(value.instances[instance]) != nullptr) continue;
      const std::uint8_t orbit_index = petal_orbit_index(state, slot, instance);
      const f32 angle = f32::from_double(petal_orbit_angle(state, orbit_index));
      const EntityHandle handle = spawn_petal(world, state, value.type_id,
        world.entities().get(state.player()) != nullptr
          ? world.entities().get(state.player())->position
          : Vec2{},
        f32(65.0F), angle, slot, instance, value.count, orbit_index);
      if (!handle.valid()) continue;
      if (Entity* entity = world.entities().get(handle); entity != nullptr) {
        entity->owner = state.player().raw;
        attach_child(world, state.player(), handle);
      }
      value.instances[instance] = handle;
      state.loadout().set_handle(slot, instance, handle);
      state.loadout().set_pending(slot, instance, false);
      state.loadout().set_pending_timer(slot, instance, 0U);
      ++spawned;
    }
  }
  assign_petal_orbit_indices(world, state);
  return spawned;
}

std::size_t refresh_loadout_petals(World& world, PlayerState& state, double step_milliseconds) {
  refresh_egg_pet_slots(world, state);
  state.loadout().advance(step_milliseconds);
  const auto spawned = spawn_loadout_petals(world, state);
  state.loadout().refresh_recharge_progress(world, state);
  // Antennae sets appearance flag 4 (the native head decoration). Preserve
  // the attack/defend bits maintained by apply_input.
  if (Entity* player = world.entities().get(state.player()); player != nullptr) {
    bool antennae = false;
    const auto& slots = state.loadout().slots();
    for (std::size_t slot = 0; slot < state.profile().active_slots() && slot < slots.size(); ++slot)
      antennae = antennae || slots[slot].type_id == 25U;
    player->player_expression = static_cast<std::uint8_t>(
      antennae ? (player->player_expression | 4U) : (player->player_expression & ~4U));
  }
  return spawned;
}

bool detach_petal_from_slot(World& world, EntityHandle handle) {
  auto* owner = orbit_owner(world, handle);
  if (owner == nullptr) return false;
  auto& state = *owner;
  auto& petals = state.petals();
  const auto it = std::find_if(petals.begin(), petals.end(),
    [handle](const PetalOrbitState& state) { return state.handle == handle; });
  if (it == petals.end()) return false;
  const std::uint8_t slot_index = it->slot;
  const std::uint8_t instance = it->instance;
  petals.erase(it);
  auto& slots = state.loadout().slots();
  if (slot_index < slots.size()) {
    PetalSlot& slot = slots[slot_index];
    if (instance < slot.instances.size()) slot.instances[instance] = EntityHandle{};
    state.loadout().clear_handle(slot_index, instance);
    // No recharge: the original immediately respawns another instance.
  }
  return true;
}

bool on_petal_destroyed(World& world, EntityHandle handle) {
  // Original 43 invokes petal virtual slot6 even after a launched Web has
  // detached its equipped handle. Dispatch before looking up the orbit.
  const Entity* entity = world.entities().get(handle);
  if (entity != nullptr && entity->health.value <= 0.0F) on_petal_death(world, handle);
  auto* owner = orbit_owner(world, handle);
  if (owner == nullptr) return false;
  auto& state = *owner;
  auto& petals = state.petals();
  const auto it = std::find_if(petals.begin(), petals.end(),
    [handle](const PetalOrbitState& state) { return state.handle == handle; });
  if (it == petals.end()) return false;
  const std::uint8_t slot_index = it->slot;
  const std::uint8_t instance = it->instance;
  const std::uint16_t type_id = it->type_id;
  petals.erase(it);
  auto& slots = state.loadout().slots();
  if (slot_index < slots.size()) {
    PetalSlot& slot = slots[slot_index];
    if (instance < slot.instances.size()) slot.instances[instance] = EntityHandle{};
    state.loadout().clear_handle(slot_index, instance);
    const auto* combat = Catalog::instance().petal_combat(type_id);
    if (combat != nullptr) slot.recharge_remaining_ms = combat->rechargeMilliseconds;
  }
  return true;
}

void remove_slot_petals(World& world, PlayerState& state, std::uint8_t slot) {
  auto& petals = state.petals();
  std::vector<EntityHandle> removed;
  for (const auto& orbit : petals)
    if (orbit.slot == slot) removed.push_back(orbit.handle);
  for (auto handle : removed) (void)world.destroy(handle);
  if (slot < state.loadout().slots().size()) {
    state.loadout().slots()[slot].instances.fill(EntityHandle{});
    for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance)
      state.loadout().clear_handle(slot, instance);
  }
}

void swap_slot_petals(World& world, PlayerState& state, std::uint8_t first, std::uint8_t second) {
  for (auto& orbit : state.petals()) {
    std::uint8_t target = orbit.slot;
    if (orbit.slot == first) target = second;
    else if (orbit.slot == second) target = first;
    orbit.slot = target;
    if (Entity* entity = world.entities().get(orbit.handle)) entity->loadout_slot = target;
  }
}


}
